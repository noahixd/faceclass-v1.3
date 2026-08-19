# FaceClass v1.3 — Smart Attendance

FaceClass คือเว็บแอปเช็คชื่อเข้าเรียนด้วยการจดจำใบหน้า ช่วยให้อาจารย์เปิดคลาส ตรวจสอบผู้มาเรียน และดูรายงานได้จากระบบเดียว นักศึกษาสามารถดูสรุปและประวัติการเข้าเรียนของตนเองได้ โดยไม่มี LINE หรือข้อมูลผู้ปกครอง

## จุดประสงค์ของระบบ

- ลดเวลาการเช็คชื่อและลดการลงชื่อแทนกัน
- แยกสถานะ `มาเรียน`, `มาสาย` และ `ขาดเรียน` ตามเวลาของเซสชัน
- แสดงสรุปการเข้าเรียนรายวิชาและรายบุคคล
- แจ้งผลการเช็คชื่อภายในเว็บ พร้อมชื่อรายวิชา
- ใช้กล้องโน้ตบุ๊กได้ และรองรับการต่อยอดเป็น ESP32-CAM

## บทบาทและสิทธิ์

- ผู้ดูแลระบบ: สร้างและจัดการบัญชีนักศึกษา
- อาจารย์: สร้างรายวิชา เพิ่ม/ถอนนักศึกษาที่มีอยู่เข้ารายวิชา เปิด/ปิดเซสชัน และดูรายงาน
- นักศึกษา: ดูสรุปรายวิชา ประวัติการเข้าเรียน และการแจ้งเตือนของตนเอง

## ความสามารถหลัก

- JWT authentication และ Argon2 password hashing
- ค้นหาและจัดการนักศึกษา/รายวิชาตามสิทธิ์
- กำหนดเวลาที่เริ่มนับเป็นมาสาย
- ปิดเซสชันแล้วบันทึกผู้ที่ยังไม่เช็คชื่อเป็นขาดเรียนอัตโนมัติ
- กล้องสดและ Camera Agent ซึ่งเริ่มทำงานเมื่อมีเซสชันเปิด
- OpenCV YuNet สำหรับตรวจจับใบหน้า และ SFace embedding สำหรับเปรียบเทียบตัวตน
- รายงานจำนวนมาเรียน มาสาย ขาดเรียน และอัตราการเข้าเรียน
- Responsive UI สำหรับคอมพิวเตอร์และโทรศัพท์

## เทคโนโลยี

- Frontend: React, TypeScript, Vinext
- Backend: FastAPI, SQLite
- Face recognition: OpenCV YuNet + SFace
- Authentication: JWT + Argon2

## ติดตั้งและรันบน Windows

ต้องมี Node.js 22.13 ขึ้นไป และ Python 3.11 หรือ 3.12

### 1. ติดตั้ง Backend

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
```

### 2. ติดตั้ง Frontend

```powershell
npm install
```

### 3. ตั้งค่าความปลอดภัย

ตั้งค่าใน PowerShell ก่อนเปิด Backend โดยเปลี่ยนค่าตัวอย่างเป็นค่าของคุณ:

```powershell
$env:FACECLASS_SECRET="สุ่มข้อความลับยาวอย่างน้อย-32-ตัวอักษร"
$env:FACECLASS_DEMO_PASSWORD="รหัสผ่านทดลองที่คาดเดายาก"
$env:FACECLASS_CAMERA_DEVICE_KEY="รหัสลับสำหรับกล้อง"
```

ค่าที่รองรับเพิ่มเติม:

- `FACECLASS_DB`: ตำแหน่งไฟล์ SQLite
- `FACECLASS_ORIGINS`: URL ของ Frontend คั่นด้วย comma
- `NEXT_PUBLIC_API_URL`: URL ของ Backend ที่ Frontend เรียกใช้

### 4. เปิด Backend

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

ถ้าพอร์ต 8000 ถูกใช้งานอยู่ ให้ปิด Backend ตัวเดิมก่อน หรือเลือกพอร์ตใหม่และตั้ง `NEXT_PUBLIC_API_URL` ให้ตรงกัน

### 5. เปิด Frontend

เปิด PowerShell อีกหน้าต่าง:

```powershell
npm.cmd run dev
```

เข้าใช้งานที่ [http://localhost:3000](http://localhost:3000)

## บัญชีตัวอย่างในฐานข้อมูลใหม่

รหัสผ่านมาจาก `FACECLASS_DEMO_PASSWORD` หรือค่าเริ่มต้น `FaceClass123!` สำหรับ local เท่านั้น

| บทบาท | อีเมล |
|---|---|
| ผู้ดูแลระบบ | `admin@example.com` |
| อาจารย์ | `teacher@example.com` |
| นักศึกษา | `student@example.com` |

ฐานข้อมูลที่เคยสร้างแล้วจะไม่ถูก seed ซ้ำ หากต้องการข้อมูลตัวอย่างชุดใหม่ให้หยุด Backend และลบ `backend/faceclass.db` ก่อนเปิดใหม่

## ลงทะเบียนใบหน้า

สร้างนักศึกษาในระบบก่อน แล้วใช้ ID ที่ Backend สร้างให้ เช่น `<student-id>` ชื่อโฟลเดอร์ไม่ควรใช้ชื่อจริง:

```text
camera_agent/training/<student-id>/
```

ใส่ภาพที่เห็นใบหน้าชัด หลายมุม และมีแสงต่างกันอย่างน้อย 5–10 ภาพ จากนั้นรัน:

```powershell
.\.venv\Scripts\python.exe camera_agent\enroll.py --student-id <student-id> --images camera_agent\training\<student-id>
```

หรือไม่ใส่ `--images` เพื่อเก็บตัวอย่างจากเว็บแคม ไฟล์ `camera_agent/faces.npz` จะเก็บ embedding ไว้เฉพาะในเครื่องและถูก `.gitignore` ป้องกันไม่ให้อัปโหลด

## เปิด Camera Agent

Camera Agent จะรอคำสั่งอยู่เบื้องหลัง และเปิดเว็บแคมเมื่ออาจารย์เปิดเซสชันของรายวิชา:

```powershell
.\.venv\Scripts\python.exe camera_agent\agent.py --course course-ai --device-key "รหัสเดียวกับ FACECLASS_CAMERA_DEVICE_KEY"
```

เมื่อปิดเซสชัน Camera Agent จะปล่อยกล้องอัตโนมัติ กด `Q` ที่หน้าต่างกล้องเพื่อหยุด Agent

## ทดสอบ

```powershell
python -m pip install -r backend\requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest backend\tests -q
npm.cmd test
npm.cmd run build
```

## ข้อมูลส่วนบุคคลและการนำขึ้นออนไลน์

Repository นี้ไม่มีรูปใบหน้า embedding หรือฐานข้อมูลจริง ไฟล์ดังกล่าวถูกกันด้วย `.gitignore` ได้แก่ `camera_agent/training/`, `camera_agent/faces.npz`, `public/students/` และ `backend/*.db`

ก่อนใช้งานผ่านอินเทอร์เน็ตควรใช้ HTTPS, เปลี่ยน secret/รหัสผ่านเริ่มต้น, จำกัด CORS, ใช้ฐานข้อมูลที่มีระบบสำรอง, เพิ่ม rate limiting และ audit log รวมทั้งขอความยินยอมในการเก็บข้อมูลชีวมิติตามนโยบายของสถาบันและกฎหมายที่เกี่ยวข้อง

## ข้อจำกัด

- การจดจำจากกล้องธรรมดาไม่มี liveness detection จึงอาจถูกหลอกด้วยภาพหรือวิดีโอ
- ความแม่นยำขึ้นกับแสง มุมใบหน้า ความละเอียดกล้อง และคุณภาพภาพลงทะเบียน
- SQLite เหมาะกับต้นแบบหรือการใช้งานขนาดเล็ก การใช้งานพร้อมกันจำนวนมากควรย้ายไป PostgreSQL
- ESP32-CAM ต้องทดสอบความเสถียรของ Wi-Fi, frame rate และการหน่วงในสถานที่จริงก่อนใช้งาน
