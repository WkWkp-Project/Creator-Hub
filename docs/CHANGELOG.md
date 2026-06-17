# Changelog

รูปแบบอิงตาม [Keep a Changelog](https://keepachangelog.com/) · เวอร์ชันตาม [SemVer](https://semver.org/)

---

## [1.1.0]

### Added
- **Content DB (โมดูลแยก ไม่แตะของเดิม)** — เอกสาร Brief ผูกกับ Campaign · **Section A** (1.Product Information · 2.KOL Brief · 3.หัวข้อเพิ่มเติม[รอกำหนด]) + **Section B** (deliverables/budget/timeline/audience/KPIs/references/approval) · เก็บแบบ JSON ยืดหยุ่น (เพิ่ม/แก้หัวข้อได้โดยไม่ต้อง migrate) · ไฟล์แยก `content_models.py`, `routers/content.py`, `frontend/assets/content.js` (เชื่อมผ่าน bridge `window.CH`) · เมนู sidebar "Content DB" · admin แก้ / viewer ดู
- **Login rate limit** (กัน brute-force) + อุด path traversal ที่ import (security pass)
- **โปรแกรมตัวอย่างแบบ .exe (offline)** — `desktop_app.py` + `build_exe.bat` build เป็นไฟล์เดียวด้วย PyInstaller (รวม frontend+API+SQLite+demo data) ดับเบิลคลิกเปิดเบราว์เซอร์เอง ไม่ต้องลง Python · เพิ่ม env override `UPLOADS_DIR`/`BACKUPS_DIR` ให้ชี้ที่เก็บข้อมูลที่เขียนได้
- **One-image deploy** — `Dockerfile` (root) + `.dockerignore` + `render.yaml` สำหรับขึ้น demo ออนไลน์ฟรี (Render/Railway/Fly)
- **Local Backup** — ปุ่มในหน้า Settings สร้าง snapshot (influencers + campaigns) บนเครื่อง + กู้คืนล่าสุด/เลือกเวอร์ชัน + ดาวน์โหลด (snapshot ก่อนกู้คืนอัตโนมัติ)
- **Production hardening** — fail-fast เมื่อ SECRET_KEY/CORS ไม่ปลอดภัยในโหมด production, CORS แบบ token-based, นับยอดด้วย `COUNT(*)`, รันหลาย worker, volume เก็บ uploads ถาวร
- เอกสาร deploy: `DEPLOYMENT.md`, `PRODUCTION_CHECKLIST.md`
- **ระบบล็อกอิน + สิทธิ์ (admin / viewer)** — JWT-like token, แฮชรหัสผ่านด้วยไลบรารีในตัว, จัดการผู้ใช้ในหน้า Settings, ตัวกันลบ/ลดสิทธิ์ admin คนสุดท้าย
- **Audience Tiers (Nano/Micro/Mega)** — กำหนดอัตโนมัติจาก followers, เลือกเองได้, ใช้กรองใน Directory และแสดงใน Analytics
- **ระบบแคมเปญเต็มรูปแบบ** — CRUD, สถานะ, งบประมาณ, มอบหมายอินฟลู, หน้า detail
- **หน้า Financials** — มูลค่าโรสเตอร์, โครงสร้างค่าใช้จ่าย, มูลค่าตาม tier, top earners, งบแคมเปญ
- **Analytics เปรียบเทียบเชิงหมวด** — ตารางหลายมิติ (reach, ER, growth, fit, ความคุ้มค่าต่อ ฿1k) พร้อมไฮไลต์ best-in-class
- **อัปโหลดรูปโปรไฟล์** และ **สื่อผลงาน Past Campaign** (ไฟล์รูป/วิดีโอ หรือแนบลิงก์)
- ปุ่ม 👁 ดูรหัสผ่าน + ช่องยืนยันรหัสผ่าน, แก้ไขผู้ใช้ในหน้า Settings
- หน้า **Settings** และ **Support**, เมนูโปรไฟล์มุมขวาบน (logout)
- เอกสารใหม่: `AUTH_AND_ROLES.md`, `QA_REPORT.md`, `CHANGELOG.md` และดัชนีคลังเอกสาร `docs/README.md`

### Changed
- ฟอนต์หลักเป็น **Prompt** (รองรับไทยเต็ม) + **Poppins** สำหรับตัวเลข/โลโก้
- Price filter เปลี่ยนจากดอลลาร์เป็น **บาท (฿)**
- Sidebar ทุกเมนูเปลี่ยนหน้าได้จริง (เดิมเป็น stub)
- เอกสาร `API.md`, `ARCHITECTURE.md`, `IMPORT_GUIDE.md` อัปเดตให้ครบฟีเจอร์ใหม่

### Fixed
- Sidebar คลิกไม่เปลี่ยนหน้า
- เส้นทางฐานข้อมูล SQLite อิง working directory (ย้ายไปอิงโฟลเดอร์ backend แบบ absolute)
- รองรับ Python 3.14 (ปลดล็อกเวอร์ชัน dependency ที่ไม่มี wheel)

---

## [1.0.0]

### Added
- Directory + Profile, ระบบ import auto-matching (ไทย/อังกฤษ), export Excel/CSV (round-trip)
- โครงสร้างค่าใช้จ่าย (ค่าตัว/เจนโค้ด/เมเนจ/เอเจน %), Analytics พื้นฐาน
- รองรับ Docker + PostgreSQL
