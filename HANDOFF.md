# 👋 HANDOFF — อ่านไฟล์นี้ก่อน (Read me first)

สรุปทุกอย่างที่ต้องรู้เพื่อ **รัน · เข้าใจ · ทำต่อ** ได้ใน 5 นาที.
อัปเดตล่าสุด: 2026-06-20. ภาพรวมเดิม/ลึกกว่าอยู่ใน [`README.md`](README.md) + [`docs/`](docs/README.md) (บางส่วนของ README เก่ายังไม่อัปเดต — ยึดไฟล์นี้เป็นหลัก).

---

## 1. นี่คืออะไร
แดชบอร์ดจัดการ **อินฟลูเอนเซอร์ + แคมเปญ** ของ Wakuwaku: ไดเรกทอรีครีเอเตอร์, แผน KOL ต่อแคมเปญ (งบ/ผลงาน), จัดการผู้ใช้+สิทธิ์, นำเข้า Excel. เงินเป็นบาท (฿).

## 2. รันยังไง (Windows)
แอปนี้รันผ่าน **preview server** ที่ตั้งไว้แล้วใน [`.claude/launch.json`](.claude/launch.json) (ชื่อ `creator-hub`, พอร์ต **8020**). Backend เสิร์ฟ `frontend/` ให้เองที่ `/`.

- **เปิดเว็บ:** http://127.0.0.1:8020  · **API docs:** http://127.0.0.1:8020/docs
- **รันเอง (ถ้าไม่ใช้ preview):**
  ```powershell
  .\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --port 8020
  ```
- **เทสต์:**
  ```powershell
  cd backend ; ..\.venv\Scripts\python.exe -m pytest -q
  ```
- **ล็อกอินทดลอง:** `admin / admin123` (แอดมิน) · `viewer / viewer123` (ดูอย่างเดียว). Google login: อีเมลโดเมน wkwkp → แอดมินอัตโนมัติ.

> ⚠️ **3 กฎทองตอนแก้โค้ด**
> 1. **แก้ไฟล์ `frontend/assets/*` ต้องเพิ่มเลข `?v=N`** ของไฟล์นั้นใน [`frontend/index.html`](frontend/index.html) (กัน browser cache) มิฉะนั้นจะไม่เห็นผล.
> 2. **Backend ไม่มี `--reload`** → แก้ไฟล์ `.py` แล้วต้อง **stop + start** preview server ใหม่ถึงจะโหลด.
> 3. **ถ้าเพิ่ม/แก้ Tailwind class** ต้อง rebuild CSS: `cd frontend && npm install && npm run build` → สร้าง `assets/tailwind.css` (purged+minified, ไม่ใช้ CDN แล้ว). class ใหม่ที่ไม่ rebuild จะไม่มี style. config สี/token อยู่ที่ [`frontend/tailwind.config.js`](frontend/tailwind.config.js).

## 3. สถาปัตยกรรม (5 ข้อ)
- **Backend:** FastAPI + SQLAlchemy 2.0 + Pydantic v2. ทุก route ขึ้นต้น `/api`.
- **Frontend:** Vanilla JS SPA **ไม่มี build step**, hash-router. Tailwind ผ่าน CDN. เชื่อมโมดูลผ่าน 2 bridge: `window.CH` (core, [app.js](frontend/assets/app.js)) และ `window.CA` (campaign suite, [contentasset.js](frontend/assets/contentasset.js)).
- **Auth:** HMAC token + PBKDF2 (stdlib ล้วน). 
- **DB:** SQLite `creatorhub.db` (zero-config). คอลัมน์ JSON แบบยืดหยุ่น → เปลี่ยนรูปร่างข้อมูลได้โดยไม่ต้อง migrate.
- **Migrations:** เพิ่มคอลัมน์แบบ additive ใน [`backend/app/migrate.py`](backend/app/migrate.py) (รันตอน boot, ALTER TABLE + backfill). ไม่มี Alembic.

## 4. แนวคิดหลักที่ต้องรู้ (อ่านโค้ดอย่างเดียวจะงง)

| เรื่อง | สรุป |
|---|---|
| **Roles (3 ระดับ)** | User: `admin / manager / viewer`. แอดมินจัดการทุกอย่าง · manager จัดการเฉพาะแคมเปญที่ถูก assign · viewer ดูเฉพาะที่ได้รับสิทธิ์. |
| **User ⇄ Member sync** | "User" (บัญชีล็อกอิน) กับ "Member" (ไดเรกทอรีคน) = คนเดียวกัน ผูกกันด้วย **อีเมล**. map role: admin↔admin, manager↔manager, viewer↔customer (ดู [`directory_models.py`](backend/app/directory_models.py) `user_role_for`/`member_role_for`). จัดการที่เดียว: **Settings → "จัดการผู้ใช้และสมาชิก"** (หน้า Members แยกถูกยุบรวมแล้ว). `/api/members` ยังอยู่ ใช้เป็น dropdown Lead/เจ้าของแคมเปญ. |
| **Company → Brand → Campaign** | Brand มี `company` (เจ้าของแบรนด์). ตั้ง company ที่ Brand → cascade ลง `ContentAsset.client_name` ของทุกแคมเปญใต้แบรนด์อัตโนมัติ. ฟอร์มแคมเปญจะ lock ช่อง Company ถ้าเลือกแบรนด์ที่มี company. |
| **Per-campaign access** | `ContentAsset.assigned_user_ids` (รายชื่อ User id). แอดมินเท่านั้นที่ assign. แอดมินเห็นทุกแคมเปญ; manager/viewer เห็นเฉพาะที่อยู่ในลิสต์. บังคับใน [`routers/content_asset.py`](backend/app/routers/content_asset.py) (`_can_read`/`_can_edit` + `ADMIN_ONLY_FIELDS`). |
| **ผู้รับผิดชอบหลายคน** | `responsible_member_ids` (list) — เลือก Lead ได้หลายคน. ยังเก็บ `responsible_member_id` (คนแรก) ไว้ back-compat. |
| **ซ่อนงบจากลูกค้า** | `ContentAsset.budget_show` (dict) คุมว่ายอดไหน (rate/gen_code_price/boosting_cost/**total**) ให้ลูกค้าเห็น. แอดมิน/manager กดไอคอนตา 👁 ที่แถบสรุปงบใน Section B. |
| **Tier** | Nano/Micro/Mega auto จาก followers; หรือ **กรอกเอง** เป็นข้อความอิสระได้ (เว้นว่าง = auto). |

## 5. ไฟล์ที่ต้องรู้

**Backend** (`backend/app/`)
```
main.py            FastAPI + mount frontend/ ที่ "/" + /uploads
migrate.py         additive migrations (รันตอน boot)
models.py          Influencer · User(+org/position/note) · Campaign(legacy)
schemas.py         Pydantic + ROLES + normalize_tier_value
crud.py            influencer queries + tier auto-derive
content_asset_models.py   ContentAsset (แคมเปญตัวจริง) + schemas
directory_models.py       Member/Brand + role-mapping helpers
routers/ auth.py · directory.py · content_asset.py · influencers.py
         imports.py · uploads.py · stats.py · campaigns.py(legacy)
```

**Frontend** (`frontend/`)
```
index.html               app shell + <script ?v=> ทุกไฟล์ (อย่าลืม bump!)
assets/app.js            core: router, login, Directory, Settings(จัดการผู้ใช้), bridge CH
assets/contentasset.js   Campaign suite: list #/assets + detail #/asset/:id, modals, bridge CA
assets/ca-section-a.js    Section A: Approved Input Files
assets/ca-section-b.js    Section B: KOL Plan + งบ + budget_show eye toggles
assets/ca-section-c.js    Section C: Performance
assets/ca-section-d.js    Section D: ตารางรวมทุก KOL
assets/styles.css         supplementary styles (tier chips, kol-table, ฯลฯ)
```
> Section A–D ลงทะเบียนตัวเองผ่าน `CA.register({order,letter,title,render,reportHtml,...})` — เพิ่ม section ใหม่ = สร้างไฟล์แล้ว register + ใส่ `<script>` ใน index.html.

## 6. หน้าหลัก (routes)
`#/assets` = **Campaigns** (เมนูหลัก ชี้มาที่นี่) · `#/asset/:id` = รายละเอียดแคมเปญ · `#/directory` = ครีเอเตอร์ · `#/analytics` · `#/settings` (จัดการผู้ใช้+สิทธิ์, admin) · `#/support`. **หลัง login เด้งไป `#/assets`.**

## 7. Legacy / dead code (ยังไม่ลบ)
`frontend/assets/content.js` (ไม่ได้ถูกโหลด) และ `route("campaigns")`/`route("campaign")` ใน app.js = ของเก่าก่อนมี Content-Asset suite, ตอนนี้ไม่มีอะไรลิงก์ถึง. ปลอดภัยที่จะลบเพื่อความสะอาด.

---
**เริ่มงานต่อ:** รัน (ข้อ 2) → ล็อกอิน admin → ดู `#/assets` → แก้โค้ดตามไฟล์ในข้อ 5 → อย่าลืม 2 กฎทอง → `pytest -q` ก่อนส่ง.
