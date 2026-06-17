# Production Readiness Checklist

สถานะความพร้อมของ Creator Hub สำหรับใช้งานจริง/ขายลูกค้า · ✅ พร้อม · ⚙️ ต้องตั้งค่าตอน deploy · 🔜 แนะนำเพิ่มเมื่อโต

**สรุป:** โค้ดพร้อมระดับ **ใช้งานจริงสำหรับลูกค้ารายแรก ๆ / ทีมภายใน** เมื่อทำรายการ ⚙️ ครบ
ส่วน 🔜 คือของที่ค่อยเสริมเมื่อฐานลูกค้าโต

---

## 🔐 ความปลอดภัย (Security)

| สถานะ | รายการ | หมายเหตุ |
|:---:|--------|----------|
| ✅ | ล็อกอิน + สิทธิ์ admin/viewer บังคับถึงชั้น API | `deps.require_admin` ทุก endpoint ที่เขียน |
| ✅ | แฮชรหัสผ่าน (PBKDF2-HMAC-SHA256 + salt) | ไม่เก็บรหัสผ่านดิบ |
| ✅ | Validation อินพุตครบ (Pydantic + sanitizer URL/ไฟล์) | กัน injection/ค่าผิดรูป |
| ✅ | กัน SQL injection (SQLAlchemy parameterized) | ไม่มี raw SQL ต่อ input |
| ✅ | ตรวจไฟล์อัปโหลด (นามสกุล + content-type + magic bytes + ขนาด) | `routers/uploads.py` |
| ✅ | กันลบ/ลดสิทธิ์ admin คนสุดท้าย + กันลบตัวเอง | |
| ✅ | Fail-fast ถ้า SECRET_KEY/CORS ไม่ปลอดภัยใน production | `main.py` guard |
| ⚙️ | ตั้ง `SECRET_KEY` จริง (env) | บังคับโดย guard |
| ⚙️ | ตั้ง `CORS_ORIGINS` เป็นโดเมนจริง | บังคับโดย guard |
| ⚙️ | เปลี่ยนรหัสผ่าน admin/viewer เริ่มต้น | หน้า Settings |
| ⚙️ | ให้บริการผ่าน HTTPS (proxy/PaaS) | ดู DEPLOYMENT §3 |
| 🔜 | Rate limiting ที่ /auth/login (กัน brute-force) | ทำที่ proxy (nginx/Cloudflare) หรือเพิ่ม slowapi |
| 🔜 | Security headers (HSTS, X-Frame-Options) | ตั้งที่ reverse proxy |
| 🔜 | ย้าย token ไป httpOnly cookie + CSRF | ปัจจุบันเก็บใน localStorage (โอเคสำหรับ internal tool) |

---

## 💾 ข้อมูล (Data)

| สถานะ | รายการ | หมายเหตุ |
|:---:|--------|----------|
| ✅ | สร้างตารางอัตโนมัติ + migration เบา (เพิ่มคอลัมน์) | `create_all` + `migrate.py` |
| ✅ | Index บนฟิลด์ที่กรองบ่อย (name/handle/niche/platform/tier) | |
| ✅ | นับยอดด้วย `COUNT(*)` ไม่โหลดทุกแถว | แก้คอขวดแล้ว |
| ⚙️ | ใช้ **PostgreSQL** (ไม่ใช่ SQLite) | รองรับหลายคนเขียนพร้อมกัน |
| ⚙️ | ไฟล์อัปโหลดอยู่บน **ดิสก์ถาวร** | กันไฟล์หายตอน redeploy (DEPLOYMENT §4) |
| ⚙️ | เปิด **backup อัตโนมัติ** ของ DB | managed Postgres หรือ cron pg_dump |
| 🔜 | Object storage (S3/R2) สำหรับไฟล์เมื่อมีหลาย instance | |
| 🔜 | Optimistic locking กันแก้ทับกัน | ปัจจุบัน last-write-wins |

---

## ⚙️ การทำงาน/รองรับโหลด (Ops & Scale)

| สถานะ | รายการ | หมายเหตุ |
|:---:|--------|----------|
| ✅ | Healthcheck `/api/health` | ใช้กับ load balancer/monitor |
| ✅ | รันหลาย worker ได้ (`WEB_CONCURRENCY`) | Dockerfile/compose พร้อม |
| ✅ | Token แบบ stateless | สเกลหลาย instance ได้ ไม่ต้อง session store |
| ✅ | แยกชั้น router→crud→model | เปลี่ยน DB/ต่อยอดง่าย |
| 🔜 | Logging แบบ structured + error monitoring (Sentry) | ปัจจุบัน log พื้นฐาน |
| 🔜 | Caching (Redis) + อ่าน replica เมื่อโหลดสูง | |

---

## ✅ คุณภาพ (Quality)

| สถานะ | รายการ | หมายเหตุ |
|:---:|--------|----------|
| ✅ | ชุดทดสอบอัตโนมัติ 21 เทส ผ่านทั้งหมด | `pytest` |
| ✅ | QA sweep ครอบคลุม (auth, RBAC, validation, edge) | ดู QA_REPORT.md |
| ✅ | เอกสารครบ (architecture, API, auth, import, deploy) | โฟลเดอร์ `docs/` |

---

## 📋 ก่อนส่งมอบลูกค้า (Go-live)

1. ⚙️ ตั้ง env production ครบ (SECRET_KEY, CORS, DATABASE_URL)
2. ⚙️ เปลี่ยนรหัส admin/viewer + สร้างบัญชีให้ลูกค้า (viewer)
3. ⚙️ ผูกโดเมน + HTTPS
4. ⚙️ เปิด backup DB + ยืนยันไฟล์อัปโหลดถาวร
5. ✅ รัน checklist "หลัง deploy" ใน DEPLOYMENT.md
6. 🔜 (ธุรกิจ) เตรียมนโยบายข้อมูล/PDPA, ข้อตกลงระดับบริการ (SLA), ช่องทาง support
