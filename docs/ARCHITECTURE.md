# สถาปัตยกรรมระบบ — Creator Hub

เอกสารนี้อธิบายโครงสร้างสถาปัตยกรรมของ **Creator Hub** ระบบฐานข้อมูลและบริหารจัดการอินฟลูเอนเซอร์ เพื่อให้ผู้พัฒนาเข้าใจการทำงานภายในและต่อยอดได้ง่าย

---

## 1. ภาพรวม (Overview)

Creator Hub เป็น **โมโนลิธแบบแยกชั้น (layered monolith)** ที่แบ่งหน้าที่ชัดเจนระหว่างส่วนหน้า (frontend) และส่วนหลัง (backend) โดย FastAPI ทำหน้าที่ทั้งให้บริการ REST API และเสิร์ฟไฟล์ static ของ frontend ในตัวเดียว ทำให้ deploy ง่าย เปิดพอร์ตเดียว (`:8000`) ก็ใช้งานได้ครบ

```
┌──────────────────────────────────────────────────────────┐
│                      Browser (SPA)                         │
│   index.html · app.js (hash router) · styles.css           │
└───────────────┬──────────────────────────────────────────┘
                │  fetch() → /api/*
                ▼
┌──────────────────────────────────────────────────────────┐
│                    FastAPI (main.py)                       │
│  ┌────────────┬───────────────┬──────────────┐            │
│  │ routers/   │ services/      │ static mount │            │
│  │ auth       │ column_matcher │ frontend/    │            │
│  │ influencers│ tiers          │ uploads/     │            │
│  │ campaigns  │                │              │            │
│  │ imports    │ deps.py (auth guards)         │            │
│  │ stats      │ security.py (hash + token)    │            │
│  │ uploads    │                │              │            │
│  └─────┬──────┴───────┬────────┴──────────────┘            │
│        │ crud.py      │ pandas / openpyxl / rapidfuzz      │
│        ▼              ▼                                     │
│   ┌─────────────────────────────┐                          │
│   │ SQLAlchemy ORM (models.py)  │  Influencer · User ·     │
│   │  + migrate.py (light ALTER) │  Campaign                │
│   └──────────────┬──────────────┘                          │
└──────────────────┼─────────────────────────────────────────┘
                   ▼
         ┌───────────────────┐
         │ SQLite (dev)      │
         │ PostgreSQL (prod) │
         └───────────────────┘
```

---

## 2. ชั้นของระบบ (Layers)

ระบบออกแบบตามหลัก **separation of concerns** แต่ละชั้นรับผิดชอบงานเดียวและขึ้นต่อกันทางเดียวเท่านั้น (จากบนลงล่าง)

| ชั้น | ไฟล์ | หน้าที่ |
|------|------|---------|
| **Routing** | `routers/*.py` | รับ HTTP request, ตรวจ query params, แปลงผลลัพธ์เป็น JSON ไม่มี business logic ที่ซับซ้อน |
| **Auth** | `deps.py`, `security.py` | dependency `get_current_user` / `require_admin`, hash รหัสผ่าน (PBKDF2) และ token แบบ HMAC |
| **Schema** | `schemas.py` | สัญญา (contract) ของข้อมูลเข้า/ออกด้วย Pydantic v2 — validation + serialization |
| **Service** | `services/column_matcher.py`, `services/tiers.py` | ตรรกะเฉพาะทาง: จับคู่คอลัมน์อัตโนมัติ/แปลงค่า และการจัด tier จากจำนวนผู้ติดตาม |
| **CRUD** | `crud.py` | ตัวกลางเข้าถึงฐานข้อมูล (query, filter, sort, upsert) แยกออกจาก router เพื่อทดสอบและใช้ซ้ำได้ |
| **Model** | `models.py` | นิยามตาราง ORM: `Influencer`, `User`, `Campaign` |
| **Migration** | `migrate.py` | เพิ่มคอลัมน์ใหม่ให้ DB เดิมแบบเบา ๆ (เช่น `tier`) โดยไม่ต้องใช้ Alembic |
| **Infra** | `database.py`, `config.py` | engine, session, dependency injection, การอ่าน env (รวม `SECRET_KEY`) |

หลักการ: **router ไม่แตะ ORM โดยตรง** แต่เรียกผ่าน `crud.py` เสมอ ทำให้เปลี่ยน data source ในอนาคตได้โดยไม่กระทบ API · endpoint ที่เขียนข้อมูลใส่ `Depends(require_admin)`, ที่อ่านใส่ `Depends(get_current_user)`

---

## 3. โมเดลข้อมูล (Data Model)

ระบบมี 3 ตาราง:

### 3.1 `Influencer` (ตารางหลัก)

- **อัตลักษณ์ (Identity):** `name`, `handle` (unique), `avatar_url`, `age`, `bio`, `location`, `active_since`, `niche`, `platform`, `verified`, `tier` (Nano/Micro/Mega), `social_links` (JSON ลิงก์โซเชียลแยกตามแพลตฟอร์ม แสดงเป็นไอคอนคลิกได้)
- **ตัวชี้วัด (Metrics):** `followers`, `engagement_rate`, `growth_30d`, `platforms` (JSON หลายแพลตฟอร์ม)
- **โครงสร้างค่าใช้จ่าย (Financials):** `base_rate` (ค่าตัว), `code_gen_fee` (ค่าเจนโค้ด), `management_fee` (ค่าเมเนจฟี) เป็นจำนวนเงินบาท และ `agency_fee_pct` (ค่าเอเจนฟี) เป็น **เปอร์เซ็นต์** — โดยมี computed property: `subtotal_fee` = ผลรวมสามค่าแรก, `agency_amount` = subtotal × เปอร์เซ็นต์, และ `total_fee` = subtotal + agency_amount (สกุลเงินเริ่มต้น `THB`)
- **ความเหมาะสม (Fit scores):** `brand_safety`, `audience_alignment`, `content_quality`, `reliability`, `fit_note`
- **เนื้อหาเสริม (JSON):** `scope_of_work` (รายการขอบเขตงาน), `past_campaigns` (ประวัติแคมเปญเก่า), `notes`

ค่าใช้จ่ายเก็บแยกฟิลด์เพื่อให้กรอง/เรียงตามยอดรวมได้ ส่วนยอดเงินของเอเจนฟีคำนวณสด ๆ จากเปอร์เซ็นต์ ไม่เก็บซ้ำในฐานข้อมูล นอกจากนี้ยังมี endpoint `GET /api/influencers/export` ที่ใช้ pandas สร้างไฟล์ Excel/CSV ด้วยหัวคอลัมน์ที่ import กลับได้ทันที (round-trip)

> **Tier** กำหนดอัตโนมัติจาก `followers` ผ่าน `services/tiers.py` (Nano `<10K` · Micro `10K–1M` · Mega `≥1M`) เมื่อไม่ได้ระบุมาเอง — ปรับเกณฑ์ที่ค่าคงที่ `NANO_MAX`, `MEGA_MIN` ที่เดียวมีผลทั้งระบบ

### 3.2 `User` (บัญชีผู้ใช้)
`username` (unique), `full_name`, `password_hash` (PBKDF2), `role` (`admin`/`viewer`), `created_at`

### 3.3 `Campaign` (แคมเปญ)
`name`, `brand`, `status` (planning/active/completed/cancelled), `objective`, `start_date`, `end_date`, `budget`, `currency`, `influencer_ids` (JSON list ของ id อินฟลูที่มอบหมาย), `notes`, `created_at`, `updated_at`

---

## 4. หัวใจของระบบ: เครื่องจับคู่คอลัมน์ (Column Matcher)

ไฟล์ `services/column_matcher.py` คือฟีเจอร์เด่นที่ตอบโจทย์ "Auto matching ตามหัวข้อ นำไปใส่ในบ็อกเอง อัตโนมัติ" ขั้นตอนการทำงานเมื่อผู้ใช้อัปโหลดไฟล์:

1. **อ่าน header** ของไฟล์ด้วย pandas (`read_csv` / `read_excel`)
2. **normalise ชื่อคอลัมน์** — ตัดช่องว่าง สัญลักษณ์ แปลงเป็นตัวพิมพ์เล็ก
3. **จับคู่หลายระดับ:**
   - *Exact* (คะแนน 100): ตรงกับ alias ในพจนานุกรมพอดี
   - *Substring* (คะแนน 92): alias เป็นส่วนหนึ่งของชื่อคอลัมน์ (เฉพาะ alias ยาว ≥ 4 ตัวอักษร เพื่อกันการจับผิด เช่น "er" ไปชนกับ "Internal Ref")
   - *Fuzzy* (rapidfuzz `token_sort_ratio`): เผื่อพิมพ์ผิดหรือเรียงคำต่างกัน
4. **จัดสถานะตามเกณฑ์คะแนน:**
   - ≥ 80 → `matched` (จับคู่อัตโนมัติ)
   - 63–79 → `review` (แนะนำให้ตรวจสอบ)
   - < 63 → `unmapped` (ต้องเลือกเอง)
5. **แปลงค่า (coerce):** `"1.2M"` → `1200000`, `"$5,000"` → `5000`, `"4.8%"` → `4.8`, `"Yes"` → `True`

พจนานุกรม `SYNONYMS` รองรับทั้งภาษาไทยและอังกฤษ เช่น `ค่าตัว`/`baserate`/`price` ล้วน map ไปที่ `base_rate`

---

## 5. กระแสการนำเข้าข้อมูล (Import Flow)

ระบบ import ทำงานแบบ **two-phase** เพื่อให้ผู้ใช้ได้ตรวจสอบก่อนบันทึกจริง

```
อัปโหลดไฟล์
   │  POST /api/imports/preview
   ▼
แคชไฟล์ไว้ใน temp dir (อ้างด้วย UUID)
   │  → คืน suggestions (คอลัมน์ + ฟิลด์ที่เดา + สถานะ)
   ▼
ผู้ใช้ปรับ mapping บนตาราง (pills: matched / review / unmapped)
   │  POST /api/imports/commit (ส่ง upload_id + mapping ที่ยืนยัน)
   ▼
อ่านไฟล์จากแคช → แปลงค่า → upsert ลง DB (จับคู่ด้วย handle ก่อน แล้วค่อย name)
   │  → ลบไฟล์แคชทิ้ง
   ▼
คืน ImportResult (created / updated / skipped)
```

การ upsert ช่วยให้นำเข้าซ้ำได้โดยไม่เกิดข้อมูลซ้ำซ้อน

---

## 6. ทางเลือกเทคโนโลยี (Why these choices)

- **FastAPI** — async, type hints, สร้าง OpenAPI docs อัตโนมัติที่ `/docs`
- **SQLAlchemy 2.0 + Pydantic v2** — มาตรฐานปัจจุบันของ Python web, type-safe
- **pandas + openpyxl** — อ่าน CSV/XLSX ได้แข็งแรง รองรับไฟล์จริงที่ไม่สะอาด
- **rapidfuzz** — fuzzy matching เร็วกว่า fuzzywuzzy มาก เขียนด้วย C++
- **Vanilla JS + Tailwind CDN** — ไม่มี build step, โหลด design tokens จาก mockup ได้ตรงเป๊ะ, น้ำหนักเบา
- **SQLite → PostgreSQL** — เริ่มง่ายในเครื่อง dev สลับเป็น Postgres ใน Docker ได้ด้วย env เดียว

---

## 7. การ deploy (Docker)

`docker-compose.yml` ประกอบด้วย 2 service:

- **`db`** — PostgreSQL 16 พร้อม healthcheck
- **`backend`** — FastAPI (รัน uvicorn) ที่ mount โฟลเดอร์ `frontend/` เพื่อเสิร์ฟ SPA และรอ `db` พร้อมก่อนเริ่ม

เปิดใช้งานด้วย `docker compose up` แล้วเข้า `http://localhost:8000` ได้ทันที ตาราง DB จะถูกสร้างอัตโนมัติตอน startup

---

## 8. การยืนยันตัวตนและสิทธิ์ (Auth)

ระบบล็อกอินใช้ **มาตรฐานไลบรารีในตัวของ Python เท่านั้น** ไม่เพิ่ม dependency:

- **รหัสผ่าน** — แฮชด้วย PBKDF2-HMAC-SHA256 + salt สุ่ม (`security.hash_password`)
- **Token** — JSON ที่เซ็นด้วย HMAC-SHA256 (รูปแบบคล้าย JWT) มีวันหมดอายุ เซ็นด้วย `SECRET_KEY`
- **การบังคับสิทธิ์** — dependency ใน `deps.py`: `get_current_user` (ต้องล็อกอิน) และ `require_admin` (เฉพาะแอดมิน) ติดไว้ที่ระดับ endpoint จึงกันถึงชั้น API จริง ไม่ใช่แค่ซ่อนปุ่มบนหน้าจอ

รายละเอียดบทบาท การจัดการผู้ใช้ และข้อควรระวังด้านความปลอดภัย อยู่ใน [AUTH_AND_ROLES.md](AUTH_AND_ROLES.md)
