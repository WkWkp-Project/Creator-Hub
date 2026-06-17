# Deployment Guide — เอาขึ้นออนไลน์

คู่มือนำ Creator Hub ขึ้นใช้งานจริงบนอินเทอร์เน็ต พร้อมตัวเลือกแพลตฟอร์มที่แนะนำ

---

## 0. ก่อน deploy ทุกครั้ง (Pre-flight)

1. **สร้าง SECRET_KEY จริง**
   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   ```
2. ตั้ง environment variables (ดู `backend/.env.example`):
   - `ENVIRONMENT=production`  ← เปิดโหมดเข้มงวด (ถ้า SECRET_KEY/CORS ไม่ปลอดภัย แอปจะไม่ start)
   - `SECRET_KEY=<ที่สร้างจากข้อ 1>`
   - `DATABASE_URL=postgresql+psycopg2://...`  ← ใช้ Postgres ไม่ใช่ SQLite
   - `CORS_ORIGINS=https://app.yourdomain.com`  ← โดเมนจริง ไม่ใช่ `*`
3. **เปลี่ยนรหัสผ่าน** บัญชี `admin`/`viewer` เริ่มต้นทันทีหลัง deploy (หน้า Settings)
4. เตรียม **ที่เก็บไฟล์อัปโหลดถาวร** (volume หรือ object storage — ดู §4)

> 🔒 โหมด production มีตัวกันพลาด: ถ้า `SECRET_KEY` ยังเป็นค่า default หรือ `CORS_ORIGINS=*` แอปจะ **ปฏิเสธการ start** เพื่อกันคอนฟิกไม่ปลอดภัยหลุดขึ้น production

---

## ⚡ ทางลัด: ทำ "ตัวอย่างไว้ตรวจงาน" (Demo) ให้เร็วสุด

อยากได้ลิงก์ออนไลน์ให้คน/ลูกค้าเข้ามาตรวจงาน — ใช้ **image เดียวจบ** (frontend + API + SQLite + demo data)
ไฟล์ที่ใช้: `Dockerfile` (ที่ root) + `render.yaml` เตรียมไว้ให้แล้ว

**วิธี A — Render (แนะนำ, ฟรี, ได้ลิงก์ HTTPS):**
1. push โค้ดขึ้น GitHub
   ```bash
   git init && git add . && git commit -m "Creator Hub"
   git branch -M main
   git remote add origin https://github.com/<you>/creator-hub.git
   git push -u origin main
   ```
2. ไปที่ render.com → **New → Blueprint** → เลือก repo นี้ (มันอ่าน `render.yaml` เอง)
3. รอ build เสร็จ → ได้ลิงก์ `https://creator-hub-demo.onrender.com`
4. เข้าเว็บ → ล็อกอิน **admin / admin123** (มี demo data + บัญชี viewer/viewer123 ให้ลูกค้าดูแบบอ่านอย่างเดียว)

**วิธี B — Railway / Fly.io / Hugging Face Spaces:** ใช้ `Dockerfile` ตัวเดียวกันได้ (ทุกเจ้า build จาก Docker) — Railway: New Project → Deploy from repo · Fly: `fly launch` · HF: สร้าง Docker Space แล้ว push

> **ข้อจำกัดของ demo ฟรี:** เว็บ "หลับ" เมื่อไม่มีคนใช้ (เปิดครั้งแรกหน่วง ~30–60 วิ) และข้อมูล/ไฟล์อัปโหลด **รีเซ็ตเป็น demo data ทุกครั้งที่ restart** — ซึ่งดีสำหรับตรวจงาน (ได้สถานะสะอาดเสมอ) สื่อใน Past Campaign ตัวอย่างใช้ลิงก์ภายนอกจึงยังโชว์ได้แม้ไฟล์อัปโหลดจะรีเซ็ต
> ถ้าต้องการให้ข้อมูลอยู่ถาวร → ทำตามหัวข้อ deploy จริงด้านล่าง (ใช้ Postgres + ดิสก์ถาวร)

### ทางเลือก: แจกเป็นโปรแกรม .exe (ออฟไลน์ ไม่ต้องขึ้นเน็ต)

อยากส่งให้คนตรวจงานแบบ **ดับเบิลคลิกเปิดบนเครื่องตัวเอง** (ไม่ต้องลง Python/ไม่ต้องมีเน็ต):
```
ดับเบิลคลิก  build_exe.bat   →  ได้ไฟล์  backend/dist/CreatorHub.exe
```
ส่งไฟล์ `CreatorHub.exe` (~44MB) ให้คนรับ → ดับเบิลคลิก → เบราว์เซอร์เปิดเอง → ล็อกอิน admin/admin123
ข้อมูลเก็บในโฟลเดอร์ `CreatorHubData` ข้าง ๆ ไฟล์ (ลบ = รีเซ็ตเป็น demo) · รายละเอียดในไฟล์ `วิธีใช้งาน-HOW_TO_RUN.txt`

---

## 1. ตัวเลือกแพลตฟอร์ม (เรียงตามความเหมาะกับแอปนี้)

| # | แพลตฟอร์ม | เหมาะกับ | จุดเด่น | ราคาเริ่มต้นโดยประมาณ |
|---|-----------|----------|---------|------------------------|
| ⭐ 1 | **Render / Railway** | เริ่มขายเร็ว ดูแลน้อย | Docker + **Postgres จัดการให้** + ดิสก์ถาวร + **HTTPS อัตโนมัติ** | ~$7–15/เดือน |
| 2 | **VPS + Docker** (Hetzner, DigitalOcean, Linode) | คุมต้นทุน/คุมเครื่องเอง | ถูกสุดเมื่อโต, ได้ full control, ใช้ `docker-compose.yml` ที่มีอยู่ได้เลย | ~$5–12/เดือน |
| 3 | **Fly.io** | ผู้ใช้กระจายหลายภูมิภาค | Docker-native, volume, edge | ~$5+/เดือน |
| 4 | **AWS / GCP** (Cloud Run/ECS + RDS + S3) | องค์กร/สเกลใหญ่ | สเกลออโต้, ครบเครื่อง enterprise | แปรผัน |

**คำแนะนำ:**
- **เริ่มต้น/ขายลูกค้ารายแรก ๆ →** Render หรือ Railway (เร็ว เซ็ตน้อย ได้ HTTPS+DB+ดิสก์ครบ)
- **โตขึ้น/คุมต้นทุน →** VPS + Docker Compose + Caddy (ออก TLS อัตโนมัติ)

---

## 2. วิธีที่ 1 — Render / Railway (แนะนำ)

1. push โค้ดขึ้น GitHub
2. สร้าง **PostgreSQL** instance บนแพลตฟอร์ม → ได้ `DATABASE_URL` (แปลงให้ขึ้นต้น `postgresql+psycopg2://`)
3. สร้าง **Web Service** ชี้ไปที่ `backend/Dockerfile`
4. ใส่ env: `ENVIRONMENT=production`, `SECRET_KEY`, `DATABASE_URL`, `CORS_ORIGINS=https://<โดเมนของคุณ>`, `WEB_CONCURRENCY=2`
5. เพิ่ม **persistent disk** mount ที่ `/app/uploads` (สำหรับไฟล์อัปโหลด)
6. deploy → แพลตฟอร์มให้โดเมน HTTPS มาเลย · seed รันอัตโนมัติตอน start (admin/admin123 → รีบเปลี่ยน)

> Frontend ถูกเสิร์ฟจากตัว backend เอง (โดเมนเดียว) ไม่ต้อง deploy แยก

---

## 3. วิธีที่ 2 — VPS + Docker Compose

```bash
# บนเซิร์ฟเวอร์ (ติดตั้ง Docker ก่อน)
git clone <repo> && cd influencer-hub

# สร้างไฟล์ .env ข้าง docker-compose.yml
cat > .env <<EOF
ENVIRONMENT=production
SECRET_KEY=<token_urlsafe>
POSTGRES_PASSWORD=<รหัสแข็งแรง>
CORS_ORIGINS=https://app.yourdomain.com
WEB_CONCURRENCY=4
EOF

docker compose up -d --build
```
- `docker-compose.yml` มี Postgres + ดิสก์ถาวร (`db_data`, `uploads_data`) ให้แล้ว
- วาง **Caddy** หรือ **nginx** หน้า `:8000` เพื่อออก HTTPS + โดเมน
  - Caddy ตัวอย่าง `Caddyfile`:
    ```
    app.yourdomain.com {
        reverse_proxy localhost:8000
    }
    ```
  Caddy จะขอ/ต่ออายุใบรับรอง TLS ให้อัตโนมัติ

---

## 4. ไฟล์อัปโหลด (สำคัญ!)

ระบบเก็บรูป/วิดีโอไว้ที่ `backend/uploads/` บนดิสก์ **บนแพลตฟอร์มที่ filesystem หายตอน redeploy (เช่น PaaS แบบ ephemeral) ไฟล์จะหาย** ต้องเลือกอย่างใดอย่างหนึ่ง:
- **Persistent disk/volume** ผูกที่ `/app/uploads` (วิธี 1 และ 2 ทำแบบนี้) — ง่ายสุด
- **Object storage (S3/R2/GCS)** — เหมาะกับสเกลใหญ่/หลาย instance (ต้องต่อยอดโค้ด `routers/uploads.py` ให้ push ขึ้น bucket)

---

## 5. ฐานข้อมูล & สำรองข้อมูล

- ใช้ **Postgres** เสมอใน production (รองรับหลายคนเขียนพร้อมกัน — SQLite ไม่เหมาะ)
- ตั้ง **backup อัตโนมัติ** (managed Postgres มักมีให้ติ๊กเปิด) หรือ cron `pg_dump` รายวัน
- ตารางถูกสร้างอัตโนมัติตอน start (`create_all` + `migrate.py`) — ไม่ต้อง migrate มือสำหรับ schema ปัจจุบัน

---

## 6. หลัง deploy — ตรวจให้ผ่าน

- [ ] เปิด `https://<โดเมน>/api/health` → `{"status":"ok"}`
- [ ] ล็อกอิน admin ได้ และ **เปลี่ยนรหัสผ่าน** default แล้ว
- [ ] อัปโหลดรูป 1 ไฟล์ แล้ว redeploy/restart → ไฟล์ยังอยู่ (ทดสอบ persistence)
- [ ] เปิดจากเครื่องอื่น/มือถือผ่าน HTTPS ได้
- [ ] viewer login เห็นข้อมูลแต่ปุ่มแก้ไขถูกซ่อน

รายการตรวจความพร้อมเต็ม ๆ ดูที่ [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md)
