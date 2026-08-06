# FaceClass v1.3 — Smart Attendance

FaceClass คือเว็บแอประบบเช็คชื่อเข้าเรียนด้วยการจดจำใบหน้า สร้างขึ้นเพื่อลดงานเช็คชื่อของอาจารย์ ตรวจสอบเวลาเข้าเรียนได้ทันที และให้นักศึกษาติดตามประวัติของตนเองได้

## จุดประสงค์

- ยืนยันตัวตนนักศึกษาจากใบหน้าจริงแทนการเลือกชื่อหรือกรอกรหัส
- แยกสถานะ `มาเรียน`, `มาสาย` และ `ขาดเรียน` ตามเวลาของเซสชัน
- สรุปสถิติการเข้าเรียนรายวิชาและรายบุคคล
- แจ้งผลการเช็คชื่อภายในเว็บ
- รองรับกล้องโน้ตบุ๊กในปัจจุบัน และต่อยอดเป็น ESP32-CAM ได้

## ความสามารถ v1.3

- บัญชี 3 บทบาท: ผู้ดูแลระบบ อาจารย์ และนักศึกษา
- จัดการนักศึกษา รายวิชา และสมาชิกในรายวิชา
- เปิดคลาสพร้อมกำหนดจำนวนนาทีที่เริ่มถือว่า “มาสาย”
- เปิดภาพกล้องสดอัตโนมัติเมื่อเริ่มคลาส
- ตรวจจับใบหน้าด้วย YuNet และเทียบ SFace embedding จริง
- แสดงชื่อ similarity score และสถานะบนหน้ากล้อง
- ปิดคลาสแล้วบันทึกผู้ที่ยังไม่เช็คชื่อเป็น “ขาดเรียน” อัตโนมัติ
- รายงานรายบุคคล: มาเรียน มาสาย ขาดเรียน อัตราเข้าเรียน และเวลาที่พบล่าสุด
- รองรับหน้าจอคอมพิวเตอร์และโทรศัพท์

## เทคโนโลยี

- Frontend: Vinext / React / TypeScript
- Backend: FastAPI / SQLite
- Face recognition: OpenCV YuNet + SFace
- Authentication: JWT + Argon2 password hashing

## การติดตั้งสำหรับ Local

ต้องมี Node.js และ Python 3.11 หรือ 3.12

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

### 3. เตรียมโมเดลและ Face Embedding

วางรูปของแต่ละคนในโฟลเดอร์ส่วนตัว เช่น:

```text
camera_agent/training/u-student-nut/
camera_agent/training/u-student-je/
```

จากนั้นสร้าง embedding:

```powershell
python camera_agent\enroll.py --student-id u-student-nut --images camera_agent\training\u-student-nut
python camera_agent\enroll.py --student-id u-student-je --images camera_agent\training\u-student-je
```

ไฟล์ `camera_agent/faces.npz` จะถูกสร้างในเครื่องและจะไม่ถูกอัปโหลดขึ้น GitHub

### 4. เปิด Backend

```powershell
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

### 5. เปิด Frontend

เปิด PowerShell อีกหน้าต่าง:

```powershell
npm run dev
```

เข้าใช้งานที่ [http://localhost:3000](http://localhost:3000)

## บัญชีทดลอง Local

| บทบาท | อีเมล | รหัสผ่าน |
|---|---|---|
| อาจารย์ | `teacher@example.com` | `FaceClass123!` |
| นักศึกษา | `student@example.com` | `FaceClass123!` |
| ผู้ดูแล | `admin@example.com` | `FaceClass123!` |

## วิธีทดลองเช็คชื่อ

1. ล็อกอินด้วยบัญชีอาจารย์
2. เปิดเมนู `การเข้าเรียน`
3. กำหนดเวลาสาย แล้วกด `START CLASS`
4. อนุญาตสิทธิ์ใช้กล้องเมื่อเบราว์เซอร์ถาม
5. จัดใบหน้าให้อยู่กลางกรอบ ระบบจะแสดงชื่อและคะแนนเมื่อยืนยันสำเร็จ
6. กด `STOP & MARK ABSENT` เพื่อปิดคลาสและบันทึกผู้ที่ไม่มาเป็นขาดเรียน
7. เปิดเมนู `รายงาน` เพื่อตรวจผลรายบุคคล

## การทดสอบ

```powershell
python -m pytest backend\tests -q
npm run build
```

## ความเป็นส่วนตัวและการใช้งานจริง

รูปใบหน้า, embeddings, SQLite database และไฟล์ environment ถูกตัดออกจาก Git เพื่อป้องกันข้อมูลส่วนบุคคล ก่อนเปิดใช้งานผ่านอินเทอร์เน็ตควรเปลี่ยน demo password และ secret, ใช้ HTTPS, PostgreSQL, rate limiting, audit log, backup และจัดทำหนังสือยินยอมการเก็บข้อมูลชีวมิติ
