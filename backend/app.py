import base64
import hashlib
import os
import secrets
import sqlite3
import time
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path

import jwt
import cv2
import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from pwdlib import PasswordHash

DB = Path(os.getenv("FACECLASS_DB", Path(__file__).with_name("faceclass.db")))
SECRET = os.getenv("FACECLASS_SECRET", "development-secret-change-before-deploy")
PH = PasswordHash.recommended()

SCHEMA = [
    "CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','teacher','student')),password_hash TEXT NOT NULL,student_code TEXT UNIQUE,program TEXT,active INTEGER NOT NULL DEFAULT 1,photo_url TEXT)",
    "CREATE TABLE IF NOT EXISTS courses(id TEXT PRIMARY KEY,code TEXT UNIQUE NOT NULL,name TEXT NOT NULL,teacher_id TEXT NOT NULL REFERENCES users(id),room TEXT)",
    "CREATE TABLE IF NOT EXISTS enrollments(course_id TEXT REFERENCES courses(id),student_id TEXT REFERENCES users(id),PRIMARY KEY(course_id,student_id))",
    "CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,course_id TEXT REFERENCES courses(id),opened_by TEXT REFERENCES users(id),opened_at INTEGER NOT NULL,closed_at INTEGER,camera_token_hash TEXT NOT NULL,late_after_at INTEGER)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_session ON sessions(course_id) WHERE closed_at IS NULL",
    "CREATE TABLE IF NOT EXISTS attendance(id TEXT PRIMARY KEY,session_id TEXT REFERENCES sessions(id),student_id TEXT REFERENCES users(id),recognized_at INTEGER NOT NULL,confidence REAL NOT NULL,source TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'present' CHECK(status IN ('present','late','absent')),UNIQUE(session_id,student_id))",
    "CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),message TEXT NOT NULL,created_at INTEGER NOT NULL,read_at INTEGER)",
    "CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id,recognized_at)",
]


@contextmanager
def db():
    connection = sqlite3.connect(DB)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def seed(connection):
    if connection.execute("SELECT 1 FROM users LIMIT 1").fetchone():
        return
    password = PH.hash(os.getenv("FACECLASS_DEMO_PASSWORD", "FaceClass123!"))
    users = [
        ("u-admin", "admin@example.com", "ผู้ดูแลระบบ", "admin", password, None, None, 1),
        ("u-teacher", "teacher@example.com", "อาจารย์อนันต์", "teacher", password, None, None, 1),
        ("u-student-1", "student@example.com", "ณัฐชา วัฒนกุล", "student", password, "65010001", "วิทยาการคอมพิวเตอร์", 1),
        ("u-student-2", "student2@example.com", "ธนกฤต พงษ์ไพบูลย์", "student", password, "65010002", "วิทยาการคอมพิวเตอร์", 1),
        ("u-student-3", "student3@example.com", "พิมพ์ชนก ศรีสุข", "student", password, "65010003", "เทคโนโลยีสารสนเทศ", 1),
    ]
    connection.executemany("INSERT INTO users(id,email,name,role,password_hash,student_code,program,active) VALUES(?,?,?,?,?,?,?,?)", users)
    connection.execute("INSERT INTO courses VALUES(?,?,?,?,?)", ("course-ai", "CS401", "ปัญญาประดิษฐ์", "u-teacher", "Lab 4"))
    connection.executemany("INSERT INTO enrollments VALUES(?,?)", [("course-ai", row[0]) for row in users[2:]])


def migrate_and_add_face_profiles(connection):
    columns = {row[1] for row in connection.execute("PRAGMA table_info(users)").fetchall()}
    if "photo_url" not in columns:
        connection.execute("ALTER TABLE users ADD COLUMN photo_url TEXT")
    session_columns = {row[1] for row in connection.execute("PRAGMA table_info(sessions)").fetchall()}
    if "late_after_at" not in session_columns:
        connection.execute("ALTER TABLE sessions ADD COLUMN late_after_at INTEGER")
    attendance_columns = {row[1] for row in connection.execute("PRAGMA table_info(attendance)").fetchall()}
    if "status" not in attendance_columns:
        connection.execute("ALTER TABLE attendance ADD COLUMN status TEXT NOT NULL DEFAULT 'present'")
    password = PH.hash(os.getenv("FACECLASS_DEMO_PASSWORD", "FaceClass123!"))
    students = [
        ("u-student-je", "je@example.com", "เจ", "student", password, "65010004", "วิทยาการคอมพิวเตอร์", 1, "/students/je.jpg"),
        ("u-student-nut", "nut@example.com", "นัท", "student", password, "65010005", "วิทยาการคอมพิวเตอร์", 1, "/students/nut.jpg"),
    ]
    connection.executemany("INSERT OR IGNORE INTO users(id,email,name,role,password_hash,student_code,program,active,photo_url) VALUES(?,?,?,?,?,?,?,?,?)", students)
    if connection.execute("SELECT 1 FROM courses WHERE id='course-ai'").fetchone():
        connection.executemany("INSERT OR IGNORE INTO enrollments(course_id,student_id) VALUES('course-ai',?)", [(row[0],) for row in students])


@asynccontextmanager
async def lifespan(_app):
    with db() as connection:
        for statement in SCHEMA:
            connection.execute(statement)
        seed(connection)
        migrate_and_add_face_profiles(connection)
    yield


app = FastAPI(title="FaceClass API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("FACECLASS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def issue_token(user):
    return jwt.encode({"sub": user["id"], "role": user["role"], "exp": int(time.time()) + 3600}, SECRET, algorithm="HS256")


def current_user(authorization: str | None = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "UNAUTHENTICATED")
    try:
        payload = jwt.decode(authorization[7:], SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "INVALID_TOKEN")
    with db() as connection:
        user = connection.execute("SELECT id,email,name,role,student_code,program,photo_url FROM users WHERE id=? AND active=1", (payload["sub"],)).fetchone()
    if not user:
        raise HTTPException(401, "USER_DISABLED")
    return dict(user)


def allow(*roles):
    def dependency(user=Depends(current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, "FORBIDDEN")
        return user
    return dependency


class Login(BaseModel):
    email: EmailStr
    password: str


class UserIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=2, max_length=100)
    role: str
    password: str = Field(min_length=10)
    student_code: str | None = None
    program: str | None = None


class CourseIn(BaseModel):
    code: str = Field(min_length=2, max_length=20)
    name: str = Field(min_length=2, max_length=120)
    room: str = ""


class Recognition(BaseModel):
    session_id: str
    student_id: str
    confidence: float = Field(ge=0, le=1)


class SessionIn(BaseModel):
    late_after_minutes: int = Field(default=15, ge=0, le=180)


class FrameScan(BaseModel):
    image_base64: str


_face_detector = None
_face_recognizer = None
_face_ids = None
_face_vectors = None


def face_models():
    global _face_detector, _face_recognizer, _face_ids, _face_vectors
    if _face_detector is None:
        root = Path(__file__).parents[1] / "camera_agent"
        _face_detector = cv2.FaceDetectorYN.create(str(root / "models" / "yunet.onnx"), "", (320, 320), 0.55, 0.3, 5000)
        _face_recognizer = cv2.FaceRecognizerSF.create(str(root / "models" / "sface.onnx"), "")
        with np.load(root / "faces.npz", allow_pickle=False) as data:
            _face_ids = data["ids"].astype(str).copy()
            _face_vectors = data["vectors"].copy()
    return _face_detector, _face_recognizer, _face_ids, _face_vectors


@app.get("/health")
def health():
    return {"status": "ok", "database": "connected"}


@app.post("/auth/login")
def login(payload: Login):
    with db() as connection:
        user = connection.execute("SELECT * FROM users WHERE email=? AND active=1", (payload.email.lower(),)).fetchone()
    if not user or not PH.verify(payload.password, user["password_hash"]):
        raise HTTPException(401, "INVALID_CREDENTIALS")
    return {"access_token": issue_token(user), "user": {key: user[key] for key in ("id", "email", "name", "role", "student_code")}}


@app.get("/me")
def me(user=Depends(current_user)):
    return user


@app.get("/courses")
def list_courses(user=Depends(current_user)):
    with db() as connection:
        if user["role"] == "student":
            rows = connection.execute("SELECT c.* FROM courses c JOIN enrollments e ON e.course_id=c.id WHERE e.student_id=? ORDER BY c.code", (user["id"],)).fetchall()
        elif user["role"] == "teacher":
            rows = connection.execute("SELECT * FROM courses WHERE teacher_id=? ORDER BY code", (user["id"],)).fetchall()
        else:
            rows = connection.execute("SELECT * FROM courses ORDER BY code").fetchall()
    return [dict(row) for row in rows]


@app.post("/courses", status_code=201)
def create_course(payload: CourseIn, user=Depends(allow("admin", "teacher"))):
    course_id = secrets.token_hex(8)
    try:
        with db() as connection:
            connection.execute("INSERT INTO courses VALUES(?,?,?,?,?)", (course_id, payload.code.upper(), payload.name, user["id"], payload.room))
    except sqlite3.IntegrityError:
        raise HTTPException(409, "DUPLICATE_COURSE")
    return {"id": course_id}


@app.get("/courses/{course_id}/dashboard")
def dashboard(course_id: str, user=Depends(allow("admin", "teacher"))):
    with db() as connection:
        course = connection.execute("SELECT * FROM courses WHERE id=?", (course_id,)).fetchone()
        if not course:
            raise HTTPException(404, "COURSE_NOT_FOUND")
        students = connection.execute("SELECT u.id,u.name,u.student_code,u.program,u.photo_url FROM users u JOIN enrollments e ON e.student_id=u.id WHERE e.course_id=? ORDER BY u.student_code", (course_id,)).fetchall()
        open_session = connection.execute("SELECT id,opened_at,late_after_at FROM sessions WHERE course_id=? AND closed_at IS NULL", (course_id,)).fetchone()
        attendance = []
        if open_session:
            attendance = connection.execute("SELECT student_id,recognized_at,confidence,status FROM attendance WHERE session_id=?", (open_session["id"],)).fetchall()
    by_student = {row["student_id"]: dict(row) for row in attendance}
    return {"course": dict(course), "session": dict(open_session) if open_session else None, "students": [{**dict(row), "attendance": by_student.get(row["id"])} for row in students]}


@app.get("/courses/{course_id}/reports/students")
def student_reports(course_id: str, user=Depends(allow("admin", "teacher"))):
    with db() as connection:
        course = connection.execute("SELECT * FROM courses WHERE id=?", (course_id,)).fetchone()
        if not course:
            raise HTTPException(404, "COURSE_NOT_FOUND")
        if user["role"] == "teacher" and course["teacher_id"] != user["id"]:
            raise HTTPException(403, "FORBIDDEN")
        total_sessions = connection.execute("SELECT COUNT(*) FROM sessions WHERE course_id=?", (course_id,)).fetchone()[0]
        rows = connection.execute(
            """SELECT u.id,u.name,u.student_code,u.program,u.photo_url,
                      SUM(CASE WHEN a.status IN ('present','late') THEN 1 ELSE 0 END) AS present_count,
                      SUM(CASE WHEN a.status='late' THEN 1 ELSE 0 END) AS late_count,
                      SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END) AS recorded_absent_count,
                      MAX(CASE WHEN a.status IN ('present','late') THEN a.recognized_at END) AS last_seen,
                      AVG(CASE WHEN a.status IN ('present','late') THEN a.confidence END) AS average_confidence
               FROM users u
               JOIN enrollments e ON e.student_id=u.id
               LEFT JOIN sessions s ON s.course_id=e.course_id
               LEFT JOIN attendance a ON a.session_id=s.id AND a.student_id=u.id
               WHERE e.course_id=?
               GROUP BY u.id,u.name,u.student_code,u.program,u.photo_url
               ORDER BY u.student_code""",
            (course_id,),
        ).fetchall()
    reports = []
    for row in rows:
        item = dict(row)
        present_count = item["present_count"]
        item["total_sessions"] = total_sessions
        item["absent_count"] = max(total_sessions - present_count, 0)
        item["attendance_rate"] = round((present_count / total_sessions * 100) if total_sessions else 0)
        item["average_confidence"] = round(item["average_confidence"] or 0, 3)
        reports.append(item)
    return {"course": dict(course), "total_sessions": total_sessions, "students": reports}


@app.get("/students")
def list_students(q: str = Query("", max_length=100), user=Depends(allow("teacher", "admin"))):
    with db() as connection:
        rows = connection.execute("SELECT id,email,name,student_code,program,photo_url FROM users WHERE role='student' AND (name LIKE ? OR student_code LIKE ?) ORDER BY student_code", (f"%{q}%", f"%{q}%")).fetchall()
    return [dict(row) for row in rows]


@app.post("/users", status_code=201)
def create_user(payload: UserIn, user=Depends(allow("admin", "teacher"))):
    if payload.role not in {"admin", "teacher", "student"}:
        raise HTTPException(422, "INVALID_ROLE")
    if user["role"] == "teacher" and payload.role != "student":
        raise HTTPException(403, "FORBIDDEN")
    user_id = secrets.token_hex(8)
    try:
        with db() as connection:
            connection.execute("INSERT INTO users(id,email,name,role,password_hash,student_code,program,active,photo_url) VALUES(?,?,?,?,?,?,?,1,NULL)", (user_id, payload.email.lower(), payload.name, payload.role, PH.hash(payload.password), payload.student_code, payload.program))
    except sqlite3.IntegrityError:
        raise HTTPException(409, "DUPLICATE_USER")
    return {"id": user_id}


@app.post("/courses/{course_id}/students/{student_id}", status_code=204)
def enroll(course_id: str, student_id: str, user=Depends(allow("admin", "teacher"))):
    try:
        with db() as connection:
            course = connection.execute("SELECT teacher_id FROM courses WHERE id=?", (course_id,)).fetchone()
            if not course:
                raise HTTPException(404, "COURSE_NOT_FOUND")
            if user["role"] == "teacher" and course["teacher_id"] != user["id"]:
                raise HTTPException(403, "FORBIDDEN")
            student = connection.execute("SELECT role,active FROM users WHERE id=?", (student_id,)).fetchone()
            if not student or student["role"] != "student" or not student["active"]:
                raise HTTPException(404, "STUDENT_NOT_FOUND")
            connection.execute("INSERT INTO enrollments VALUES(?,?)", (course_id, student_id))
    except sqlite3.IntegrityError:
        raise HTTPException(409, "ALREADY_ENROLLED")


@app.delete("/courses/{course_id}/students/{student_id}", status_code=204)
def unenroll(course_id: str, student_id: str, user=Depends(allow("admin", "teacher"))):
    with db() as connection:
        course = connection.execute("SELECT teacher_id FROM courses WHERE id=?", (course_id,)).fetchone()
        if not course:
            raise HTTPException(404, "COURSE_NOT_FOUND")
        if user["role"] == "teacher" and course["teacher_id"] != user["id"]:
            raise HTTPException(403, "FORBIDDEN")
        result = connection.execute("DELETE FROM enrollments WHERE course_id=? AND student_id=?", (course_id, student_id))
        if not result.rowcount:
            raise HTTPException(404, "ENROLLMENT_NOT_FOUND")


def camera_token_for(session_id: str):
    return jwt.encode({"sid": session_id, "scope": "camera"}, SECRET, algorithm="HS256")


@app.post("/courses/{course_id}/sessions", status_code=201)
def open_session(course_id: str, payload: SessionIn, user=Depends(allow("admin", "teacher"))):
    session_id = secrets.token_hex(8)
    raw_token = camera_token_for(session_id)
    now = int(time.time())
    try:
        with db() as connection:
            connection.execute("INSERT INTO sessions(id,course_id,opened_by,opened_at,closed_at,camera_token_hash,late_after_at) VALUES(?,?,?,?,NULL,?,?)", (session_id, course_id, user["id"], now, hashlib.sha256(raw_token.encode()).hexdigest(), now + payload.late_after_minutes * 60))
    except sqlite3.IntegrityError:
        raise HTTPException(409, "SESSION_ALREADY_OPEN")
    return {"id": session_id, "camera_token": raw_token, "late_after_at": now + payload.late_after_minutes * 60}


@app.patch("/sessions/{session_id}/close")
def close_session(session_id: str, user=Depends(allow("admin", "teacher"))):
    with db() as connection:
        session = connection.execute("SELECT * FROM sessions WHERE id=? AND closed_at IS NULL", (session_id,)).fetchone()
        if not session:
            raise HTTPException(404, "OPEN_SESSION_NOT_FOUND")
        now = int(time.time())
        missing = connection.execute("SELECT student_id FROM enrollments WHERE course_id=? AND student_id NOT IN (SELECT student_id FROM attendance WHERE session_id=?)", (session["course_id"], session_id)).fetchall()
        connection.executemany("INSERT INTO attendance(id,session_id,student_id,recognized_at,confidence,source,status) VALUES(?,?,?,?,0,'system','absent')", [(secrets.token_hex(8), session_id, row["student_id"], now) for row in missing])
        result = connection.execute("UPDATE sessions SET closed_at=? WHERE id=? AND closed_at IS NULL", (int(time.time()), session_id))
        if not result.rowcount:
            raise HTTPException(404, "OPEN_SESSION_NOT_FOUND")
    return {"status": "closed"}


def record_recognition(payload: Recognition, camera_token: str):
    with db() as connection:
        session = connection.execute("SELECT * FROM sessions WHERE id=? AND closed_at IS NULL", (payload.session_id,)).fetchone()
        if not session:
            raise HTTPException(409, "SESSION_CLOSED")
        expected = hashlib.sha256(camera_token.encode()).hexdigest()
        if not secrets.compare_digest(session["camera_token_hash"], expected):
            raise HTTPException(403, "INVALID_CAMERA_TOKEN")
        if payload.confidence < 0.363:
            raise HTTPException(422, "LOW_CONFIDENCE")
        enrolled = connection.execute("SELECT 1 FROM enrollments WHERE course_id=? AND student_id=?", (session["course_id"], payload.student_id)).fetchone()
        if not enrolled:
            raise HTTPException(403, "NOT_ENROLLED")
        now = int(time.time())
        try:
            status = "late" if session["late_after_at"] and now > session["late_after_at"] else "present"
            connection.execute("INSERT INTO attendance(id,session_id,student_id,recognized_at,confidence,source,status) VALUES(?,?,?,?,?,'face',?)", (secrets.token_hex(8), payload.session_id, payload.student_id, now, payload.confidence, status))
            connection.execute("INSERT INTO notifications VALUES(?,?,?,?,NULL)", (secrets.token_hex(8), payload.student_id, "เช็คชื่อสำเร็จ ระบบบันทึกการเข้าเรียนแล้ว", now))
        except sqlite3.IntegrityError:
            raise HTTPException(409, "DUPLICATE_ATTENDANCE")
    return {"status": status, "recognized_at": now}


@app.post("/recognitions", status_code=201)
def recognize(payload: Recognition, x_camera_token: str | None = Header(None)):
    if not x_camera_token:
        raise HTTPException(401, "CAMERA_TOKEN_REQUIRED")
    return record_recognition(payload, x_camera_token)


@app.post("/sessions/{session_id}/scan-frame")
def scan_frame(session_id: str, payload: FrameScan, user=Depends(allow("admin", "teacher"))):
    with db() as connection:
        session = connection.execute("SELECT * FROM sessions WHERE id=? AND closed_at IS NULL", (session_id,)).fetchone()
    if not session:
        raise HTTPException(409, "SESSION_CLOSED")
    try:
        encoded = payload.image_base64.split(",", 1)[-1]
        frame = cv2.imdecode(np.frombuffer(base64.b64decode(encoded), np.uint8), cv2.IMREAD_COLOR)
    except Exception:
        frame = None
    if frame is None:
        raise HTTPException(422, "INVALID_FRAME")
    detector, recognizer, ids, vectors = face_models()
    height, width = frame.shape[:2]
    detector.setInputSize((width, height))
    _, faces = detector.detect(frame)
    if faces is None or not len(faces):
        return {"face_detected": False, "matched": False}
    results = []
    for face in faces:
        aligned = recognizer.alignCrop(frame, face)
        vector = recognizer.feature(aligned).flatten()
        vector = vector / max(np.linalg.norm(vector), 1e-9)
        scores = vectors @ vector
        index = int(np.argmax(scores))
        score = float(scores[index])
        student_id = str(ids[index])
        matched = score >= 0.363
        status = None
        if matched:
            try:
                saved = record_recognition(Recognition(session_id=session_id, student_id=student_id, confidence=min(max(score, 0), 1)), camera_token_for(session_id))
                status = saved["status"]
            except HTTPException as error:
                if error.detail != "DUPLICATE_ATTENDANCE":
                    raise
                status = "already_checked"
        x, y, w, h = [int(value) for value in face[:4]]
        results.append({"face_detected": True, "matched": matched, "student_id": student_id if matched else None, "confidence": round(score, 3), "status": status, "box": [x, y, w, h]})
    with db() as connection:
        names = {row["id"]: row["name"] for row in connection.execute("SELECT id,name FROM users WHERE id IN (%s)" % ",".join("?" * len(ids)), tuple(ids)).fetchall()}
    for result in results:
        result["name"] = names.get(result["student_id"]) if result["matched"] else "ไม่รู้จัก"
    return {"face_detected": True, "matched": any(row["matched"] for row in results), "faces": results}


@app.get("/camera/active-session")
def camera_active_session(course_id: str, x_device_key: str | None = Header(None)):
    expected = os.getenv("FACECLASS_CAMERA_DEVICE_KEY", "faceclass-camera-local")
    if not x_device_key or not secrets.compare_digest(x_device_key, expected):
        raise HTTPException(403, "INVALID_DEVICE_KEY")
    with db() as connection:
        session = connection.execute("SELECT id,course_id,opened_at,late_after_at FROM sessions WHERE course_id=? AND closed_at IS NULL", (course_id,)).fetchone()
    if not session:
        return {"active": False}
    return {"active": True, **dict(session), "camera_token": camera_token_for(session["id"])}


@app.get("/me/attendance")
def attendance_history(user=Depends(allow("student"))):
    with db() as connection:
        rows = connection.execute("SELECT c.code,c.name,a.recognized_at,a.confidence,a.source,a.status FROM attendance a JOIN sessions s ON s.id=a.session_id JOIN courses c ON c.id=s.course_id WHERE a.student_id=? ORDER BY a.recognized_at DESC", (user["id"],)).fetchall()
    return [dict(row) for row in rows]


@app.get("/notifications")
def notifications(user=Depends(current_user)):
    with db() as connection:
        rows = connection.execute("SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 20", (user["id"],)).fetchall()
    return [dict(row) for row in rows]
