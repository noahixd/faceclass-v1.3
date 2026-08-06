# รายงานทดสอบ FaceClass v1.0

วันที่: 6 สิงหาคม 2569

## ผลทดสอบอัตโนมัติ

- Backend API: ผ่าน
- Frontend production build: ผ่าน
- Login ผิดถูกปฏิเสธ: ผ่าน
- API ที่ไม่ล็อกอินถูกปฏิเสธ: ผ่าน
- อาจารย์เห็นเฉพาะรายวิชาที่รับผิดชอบ: ผ่าน
- ป้องกันเปิด session ซ้อน: ผ่าน
- ปฏิเสธ confidence ต่ำ: ผ่าน
- ป้องกัน check-in ซ้ำ: ผ่าน
- ปฏิเสธ recognition หลังปิด session: ผ่าน
- นักศึกษาเข้าถึงข้อมูลอาจารย์ไม่ได้: ผ่าน

## ผลทดสอบผ่านเบราว์เซอร์

1. Login อาจารย์สำเร็จ
2. Dashboard โหลด CS401 และนักศึกษา 3 คนจากฐานข้อมูลจริง
3. เปิด session สำเร็จและสถานะกล้องเปลี่ยน OFFLINE → ACTIVE
4. Simulate Face บันทึกณัฐชา วัฒนกุลด้วย confidence 96%
5. ตัวเลขยืนยันแล้วเปลี่ยน 0 → 1 และอัตราเข้าเรียน 0% → 33%
6. Logout และ Login นักศึกษาสำเร็จ
7. นักศึกษาเห็นประวัติ CS401 วันที่/เวลาเดียวกับที่อาจารย์บันทึก

## ยังต้องทดสอบบนฮาร์ดแวร์

- CUDA/onnxruntime-gpu กับ GPU NVIDIA ของเครื่องปลายทาง
- Webcam จริงและสิทธิ์เข้าถึงกล้อง
- Enrollment อย่างน้อย 20 ภาพต่อบุคคล
- Threshold จากชุดข้อมูลจริง, false accept และ false reject
- Liveness detection ป้องกันภาพถ่าย/วิดีโอหลอก

## ก่อนเปิดอินเทอร์เน็ตจริง

เปลี่ยน SQLite เป็น PostgreSQL, ใช้ HTTPS, เปลี่ยน secrets และบัญชี demo, เพิ่ม refresh-token cookie/rate limit/password reset, backup, audit log, privacy notice, consent และ retention policy สำหรับข้อมูลชีวมิติ
