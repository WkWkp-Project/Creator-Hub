# 📚 Creator Hub — Document Library

คลังเอกสารทั้งหมดของโปรเจกต์ รวมไว้ที่เดียว จัดเป็นหมวด แก้ไข/ต่อยอดง่าย
เริ่มอ่านจากหน้านี้แล้วเลือกหัวข้อที่ต้องการ

---

## 🗂 สารบัญ (Catalog)

| # | เอกสาร | เนื้อหา | เหมาะกับใคร |
|---|--------|---------|-------------|
| 1 | [ARCHITECTURE.md](ARCHITECTURE.md) | สถาปัตยกรรม ชั้นของระบบ โมเดลข้อมูล การ deploy | นักพัฒนา |
| 2 | [API.md](API.md) | อ้างอิง REST API ทุก endpoint + ตัวอย่าง request/response | นักพัฒนา / ผู้เชื่อมต่อระบบ |
| 3 | [AUTH_AND_ROLES.md](AUTH_AND_ROLES.md) | ระบบล็อกอิน สิทธิ์ admin/viewer การจัดการผู้ใช้ ความปลอดภัย | แอดมิน / นักพัฒนา |
| 4 | [IMPORT_GUIDE.md](IMPORT_GUIDE.md) | นำเข้า/ส่งออก Excel·CSV ระบบ auto-matching | ผู้ใช้งาน (แอดมิน) |
| 5 | [DEPLOYMENT.md](DEPLOYMENT.md) | นำขึ้นออนไลน์: แพลตฟอร์มที่แนะนำ + ขั้นตอน | ผู้ดูแลระบบ / DevOps |
| 6 | [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) | รายการตรวจความพร้อมก่อนขายลูกค้า | ผู้ดูแล / เจ้าของผลิตภัณฑ์ |
| 7 | [QA_REPORT.md](QA_REPORT.md) | ผลการทดสอบ ขอบเขต และวิธีรันชุดทดสอบ | QA / นักพัฒนา |
| 8 | [CHANGELOG.md](CHANGELOG.md) | ประวัติการเปลี่ยนแปลงรายเวอร์ชัน | ทุกคน |

> ภาพรวมโปรเจกต์ + Quick Start อยู่ที่ [`../README.md`](../README.md)

---

## 🧭 อ่านตามบทบาท (Quick paths)

- **เพิ่งเข้าโปรเจกต์** → `../README.md` → `ARCHITECTURE.md`
- **จะต่อ API / เขียน integration** → `API.md` → `AUTH_AND_ROLES.md`
- **เป็นแอดมินดูแลผู้ใช้** → `AUTH_AND_ROLES.md` → `IMPORT_GUIDE.md`
- **จะ deploy ขึ้นออนไลน์** → `PRODUCTION_CHECKLIST.md` → `DEPLOYMENT.md`
- **จะตรวจคุณภาพ / รันเทส** → `QA_REPORT.md`

---

## ✍️ วิธีดูแลเอกสาร (ให้แก้ไขง่าย)

เพื่อให้คลังเอกสารเป็นระเบียบและอัปเดตตามโค้ดได้ง่าย ยึดกติกาสั้น ๆ นี้:

1. **เอกสาร 1 ไฟล์ = 1 หัวข้อ** ตามสารบัญด้านบน อย่ารวมหลายเรื่องในไฟล์เดียว
2. **แก้โค้ดส่วนไหน อัปเดตเอกสารที่ผูกกับมัน** ตามตารางนี้:

   | ถ้าแก้ไฟล์โค้ด... | อัปเดตเอกสาร |
   |-------------------|-------------|
   | `routers/*.py` (endpoint) | `API.md` |
   | `models.py` / `schemas.py` | `ARCHITECTURE.md` (§โมเดลข้อมูล) + `API.md` |
   | `routers/auth.py`, `security.py`, `deps.py` | `AUTH_AND_ROLES.md` |
   | `services/column_matcher.py` | `IMPORT_GUIDE.md` |
   | `services/tiers.py` (เกณฑ์ tier) | `ARCHITECTURE.md` + `../README.md` (ตาราง tier) |
   | เพิ่ม/แก้เทส `tests/` | `QA_REPORT.md` |

3. **ทุกการปล่อยเวอร์ชัน** เพิ่มหัวข้อใน `CHANGELOG.md` และอัปเดต `app_version` ใน `backend/app/config.py` ให้ตรงกัน
4. ใช้หัวข้อ `##`/`###` ตามแบบเดิม เพื่อให้ลิงก์ภายใน (anchor) ใช้ได้ต่อเนื่อง
