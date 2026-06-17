# API Reference — Creator Hub

Base URL: `http://localhost:8000/api` (local dev มักรันที่พอร์ต `8020`)
รูปแบบข้อมูล: JSON ทั้งหมด · เอกสารโต้ตอบ (Swagger UI) อยู่ที่ `/docs`

> **เวอร์ชัน 1.1** — ทุก endpoint (ยกเว้น `/api/health` และ `/api/auth/login`)
> ต้องแนบ **bearer token** ดูรายละเอียดสิทธิ์ที่ [AUTH_AND_ROLES.md](AUTH_AND_ROLES.md)

---

## 🔐 การยืนยันตัวตน (ใช้กับทุก request)

แนบ token ที่ได้จาก `/api/auth/login` ในส่วนหัว:

```
Authorization: Bearer <token>
```

สำหรับลิงก์ดาวน์โหลด (เปิดแท็บใหม่ ตั้ง header ไม่ได้) รองรับ query param `?token=<token>` แทน

| สิทธิ์ | ทำได้ |
|--------|-------|
| **viewer** | อ่านทุกอย่าง (GET) |
| **admin** | อ่าน + เขียน/ลบ ทุกอย่าง + จัดการผู้ใช้ |

---

## Auth

### `POST /api/auth/login`
เข้าสู่ระบบด้วย username/password → คืน token + ข้อมูลผู้ใช้
```json
// request
{ "username": "admin", "password": "admin123" }
// response 200
{ "token": "<jwt-like>", "user": { "id": 1, "username": "admin", "full_name": "Hub Administrator", "role": "admin" } }
```
`401` ถ้า username/password ผิด

### `GET /api/auth/me`
คืนข้อมูลผู้ใช้ปัจจุบันจาก token · `401` ถ้า token หาย/หมดอายุ/ปลอม

### `GET /api/auth/users` · admin
รายชื่อผู้ใช้ทั้งหมด

### `POST /api/auth/users` · admin
สร้างผู้ใช้ใหม่ → `201`
```json
{ "username": "client1", "password": "secret12", "full_name": "Client One", "role": "viewer" }
```
`400` ถ้า username ซ้ำ · `422` ถ้า password < 4 ตัว หรือ role ไม่ใช่ admin/viewer

### `PUT /api/auth/users/{id}` · admin
แก้ชื่อ/สิทธิ์ → คืนผู้ใช้ที่อัปเดต · `400` ถ้าพยายามลดสิทธิ์ admin คนสุดท้าย

### `PUT /api/auth/users/{id}/password` · admin
รีเซ็ตรหัสผ่านผู้ใช้ → `204` · body: `{ "new_password": "..." }`

### `PUT /api/auth/password` · ผู้ใช้ปัจจุบัน
เปลี่ยนรหัสผ่านตนเอง → `204` · body: `{ "current_password": "...", "new_password": "..." }`
`400` ถ้ารหัสผ่านปัจจุบันไม่ถูกต้อง

### `DELETE /api/auth/users/{id}` · admin
ลบผู้ใช้ → `204` · `400` ถ้าลบตัวเอง หรือลบ admin คนสุดท้าย

---

## Influencers

### `GET /api/influencers`
รายชื่ออินฟลูเอนเซอร์ พร้อมตัวกรอง/เรียงลำดับ

| พารามิเตอร์ | ชนิด | คำอธิบาย |
|-------------|------|----------|
| `search` | string | ค้นจากชื่อ / handle / niche |
| `platform` | string | กรองตามแพลตฟอร์ม |
| `niche` | string | กรองตามหมวดหมู่ |
| `tier` | string | `Nano` / `Micro` / `Mega` |
| `min_price` / `max_price` | number | กรองตามค่าใช้จ่ายรวม (total fee, บาท) |
| `verified` | bool | เฉพาะที่ยืนยันตัวตน |
| `sort` | string | `name` · `followers` · `engagement` · `price` · `price_desc` · `newest` |
| `skip` / `limit` | int | แบ่งหน้า (limit ≤ 200) |

```json
// response
{ "total": 5, "items": [ { "id": 1, "name": "Priya Sharma", "tier": "Mega",
  "followers": 1200000, "engagement_rate": 6.4, "currency": "THB",
  "base_rate": 150000, "code_gen_fee": 15000, "management_fee": 22000,
  "agency_fee_pct": 15, "subtotal_fee": 187000, "agency_amount": 28050,
  "total_fee": 215050, "verified": true } ] }
```

### `GET /api/influencers/{id}`
รายละเอียดเต็ม (scope_of_work, past_campaigns พร้อมสื่อ, fit scores, social_links)

### `POST /api/influencers` · admin → `201`
สร้างใหม่ ตาม schema `InfluencerCreate`
```json
{ "name": "New Creator", "handle": "@new", "niche": "Lifestyle", "platform": "TikTok",
  "followers": 50000, "tier": "", "currency": "THB",
  "base_rate": 80000, "code_gen_fee": 10000, "management_fee": 15000, "agency_fee_pct": 15,
  "avatar_url": "/uploads/avatars/x.png",
  "social_links": { "instagram": "https://instagram.com/new" },
  "past_campaigns": [ { "brand": "Acme", "campaign": "Launch", "views": "200k", "ctr": "12%",
    "media_url": "https://.../clip.mp4", "media_type": "video", "work_url": "https://..." } ] }
```
- `tier` เว้นว่าง = ระบบกำหนดอัตโนมัติจาก `followers` (ดู [tiers](#tier-thresholds))
- `avatar_url` ต้องเป็น path `/uploads/avatars/...` หรือ URL `http(s)` มิฉะนั้น `422`
- `social_links` ต้องเป็น URL `http(s)` · `media_type` ต้องเป็น `image`/`video`

### `PUT /api/influencers/{id}` · admin
แก้เฉพาะฟิลด์ที่ส่งมา · ถ้า `followers` เปลี่ยนและไม่ได้ส่ง `tier` ระบบคำนวณ tier ใหม่อัตโนมัติ

### `DELETE /api/influencers/{id}` · admin → `204`

### `GET /api/influencers/export`
ดาวน์โหลดทั้งโรสเตอร์ · `?format=xlsx` (ค่าเริ่มต้น) หรือ `?format=csv`
ไฟล์ import กลับได้ทันที (round-trip) · รองรับ `?token=<token>` สำหรับเปิดลิงก์ตรง

<a name="tier-thresholds"></a>
**เกณฑ์ Tier:** Nano `< 10,000` · Micro `10,000–999,999` · Mega `≥ 1,000,000`

---

## Campaigns

### `GET /api/campaigns`
รายการแคมเปญ · query: `search`, `status` (`planning`/`active`/`completed`/`cancelled`), `skip`, `limit`

### `GET /api/campaigns/{id}`
รายละเอียดแคมเปญ (รวม `influencer_ids` ที่มอบหมาย)

### `POST /api/campaigns` · admin → `201`
```json
{ "name": "Summer Launch", "brand": "Beauty Co", "status": "planning",
  "objective": "...", "start_date": "2026-06-01", "end_date": "2026-07-15",
  "budget": 450000, "currency": "THB", "influencer_ids": [1, 2], "notes": "" }
```
`422` ถ้า `status` ไม่อยู่ในชุดที่กำหนด

### `PUT /api/campaigns/{id}` · admin · `DELETE /api/campaigns/{id}` · admin → `204`

---

## Imports (admin)

### `GET /api/imports/system-fields`
รายชื่อฟิลด์ระบบที่ import ได้ (สำหรับ dropdown) — รวม `tier` และคอลัมน์ลิงก์โซเชียล

### `POST /api/imports/preview` · admin
อัปโหลดไฟล์ (`multipart/form-data`, field `file`) → คืน `upload_id`, `row_count`,
`detected_columns`, และ `suggestions` (คอลัมน์ + ฟิลด์ที่เดา + `confidence` + `status`)
สถานะ: `matched` (≥80) · `review` (63–79) · `unmapped` (<63)

### `POST /api/imports/commit` · admin
```json
{ "upload_id": "...", "mappings": [ { "file_column": "Full Name", "system_field": "name" } ],
  "update_existing": true }
```
คืน `{ "created", "updated", "skipped", "errors" }` · upsert ด้วย handle ก่อนแล้ว name
รายละเอียดเต็มที่ [IMPORT_GUIDE.md](IMPORT_GUIDE.md)

---

## Uploads (admin)

### `POST /api/uploads/avatar`
อัปโหลดรูปโปรไฟล์ (`multipart/form-data`, field `file`) → `{ "url": "/uploads/avatars/<id>.png" }`
รับ JPG/PNG/WebP/GIF · ตรวจนามสกุล + content-type + magic bytes

### `POST /api/uploads/campaign-media`
อัปโหลดสื่อผลงาน → `{ "url": "/uploads/campaigns/<id>.ext", "media_type": "image|video" }`
รับรูป + วิดีโอ MP4/WebM/MOV · ไฟล์ถูกเสิร์ฟที่ `/uploads/...`

---

## Backup (admin) — ตาข่ายกันพลาดบนเครื่อง

snapshot ข้อมูล influencers + campaigns เป็นไฟล์ JSON บนดิสก์เซิร์ฟเวอร์ (`backend/backups/`)

### `GET /api/backup`
รายการ snapshot ทั้งหมด → `{ backups: [{filename, created_at, size_bytes, counts}], latest }`

### `POST /api/backup` → `201`
สร้าง snapshot ใหม่ → `{ filename, created_at, counts }`

### `POST /api/backup/restore`
กู้คืน — ค่าเริ่มต้นใช้ snapshot ล่าสุด หรือส่ง `{ "filename": "..." }` เพื่อเลือก
ก่อนเขียนทับ ระบบ snapshot สถานะปัจจุบันให้อัตโนมัติ (`*_pre-restore.json`) →
คืน `{ restored_from, created_at, counts }`

### `GET /api/backup/{filename}/download`
ดาวน์โหลดไฟล์ snapshot (รองรับ `?token=` สำหรับลิงก์ตรง)

> ⚠️ เก็บบนดิสก์ local เท่านั้น — เป็น stopgap กันพลาด ไม่ใช่ backup นอกเครื่อง (off-site)

---

## Stats

### `GET /api/stats`
ภาพรวม: `total_influencers`, `verified`, `avg_engagement_rate`, `total_reach`,
`niches[]`, `platforms[]`, `tiers[]`

### `GET /api/stats/niche-performance`
เปรียบเทียบ performance ต่อหมวด — แต่ละแถว: `niche`, `count`, `total_reach`,
`avg_engagement_rate`, `avg_growth_30d`, `avg_total_fee`, `avg_fit_score`, `reach_per_1k_thb`

### `GET /api/stats/financials`
สรุปการเงิน: `roster_value`, `avg_fee`, `fee_composition{}`, `by_tier[]`,
`top_earners[]`, `campaign_count`, `campaign_budget_total`, `campaign_budget_active`

---

## Meta

### `GET /api/health` (เปิด ไม่ต้อง auth)
```json
{ "status": "ok", "service": "Creator Hub API", "version": "1.1.0" }
```

---

## รหัสสถานะ (Status codes)

| รหัส | ความหมาย |
|------|----------|
| `200` | สำเร็จ |
| `201` | สร้างสำเร็จ |
| `204` | สำเร็จ ไม่มี body (เช่นการลบ) |
| `400` | คำขอไม่ถูกต้อง (ไฟล์เกินขนาด, username ซ้ำ, ลบ admin คนสุดท้าย ฯลฯ) |
| `401` | ยังไม่ล็อกอิน / token หมดอายุ |
| `403` | สิทธิ์ไม่พอ (viewer พยายามเขียน) |
| `404` | ไม่พบข้อมูล |
| `422` | validation ไม่ผ่าน (Pydantic) |
