"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
type User = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "teacher" | "student";
  student_code?: string;
};
type Course = { id: string; code: string; name: string; room: string };
type Student = {
  id: string;
  email?: string;
  name: string;
  student_code: string;
  program: string;
  photo_url?: string;
  attendance?: {
    recognized_at: number;
    confidence: number;
    status: "present" | "late" | "absent";
  } | null;
};
type Dashboard = {
  course: Course;
  session: { id: string; opened_at: number; late_after_at: number } | null;
  students: Student[];
};
type History = {
  code: string;
  name: string;
  recognized_at: number;
  confidence: number;
  source: string;
  status: "present" | "late" | "absent";
};
type Notification = {
  id: string;
  message: string;
  created_at: number;
  read_at: number | null;
};
type StudentReport = {
  id: string;
  name: string;
  student_code: string;
  program: string;
  photo_url?: string;
  present_count: number;
  late_count: number;
  absent_count: number;
  total_sessions: number;
  attendance_rate: number;
  last_seen: number | null;
  average_confidence: number;
};
type Section =
  | "overview"
  | "attendance"
  | "students"
  | "courses"
  | "reports"
  | "notifications";

async function request(path: string, token: string, init: RequestInit = {}) {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const d = r.status === 204 ? null : await r.json();
  if (!r.ok)
    throw new Error(
      typeof d?.detail === "string" ? d.detail : "REQUEST_FAILED",
    );
  return d;
}

export default function Home() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  if (!token || !user)
    return (
      <Login
        onLogin={(t, u) => {
          setToken(t);
          setUser(u);
        }}
        error={error}
        setError={setError}
      />
    );
  return (
    <App
      token={token}
      user={user}
      onLogout={() => {
        setToken("");
        setUser(null);
      }}
    />
  );
}

function Login({
  onLogin,
  error,
  setError,
}: {
  onLogin: (t: string, u: User) => void;
  error: string;
  setError: (v: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const d = await request("/auth/login", "", {
        method: "POST",
        body: JSON.stringify({
          email: f.get("email"),
          password: f.get("password"),
        }),
      });
      onLogin(d.access_token, d.user);
    } catch {
      setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="loginPage">
      <section className="loginBrand">
        <div className="wordmark">
          <i>FC</i>
          <span>
            FACECLASS<small>ATTENDANCE INTELLIGENCE</small>
          </span>
        </div>
        <div>
          <p className="kicker">IDENTITY-VERIFIED ATTENDANCE</p>
          <h1>
            Presence,
            <br />
            proven.
          </h1>
          <p>
            ระบบเช็คชื่อด้วยใบหน้าสำหรับห้องเรียน ตรวจสอบได้
            และเห็นผลแบบเรียลไทม์
          </p>
        </div>
        <div className="systemLine">
          <span /> SYSTEM READY <b>v1.1</b>
        </div>
      </section>
      <section className="loginPanel">
        <form onSubmit={submit}>
          <div className="formHead">
            <small>SECURE ACCESS / 01</small>
            <h2>เข้าสู่ระบบ</h2>
            <p>ใช้บัญชี FaceClass ของคุณ</p>
          </div>
          <label>
            อีเมล
            <input
              name="email"
              type="email"
              defaultValue="teacher@example.com"
              required
            />
          </label>
          <label>
            รหัสผ่าน
            <input
              name="password"
              type="password"
              defaultValue="FaceClass123!"
              required
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button className="accentButton" disabled={busy}>
            {busy ? "กำลังตรวจสอบ…" : "เข้าสู่ระบบ →"}
          </button>
          <div className="demo">
            <b>บัญชีทดลอง</b>
            <span>อาจารย์: teacher@example.com</span>
            <span>นักศึกษา: student@example.com</span>
            <span>รหัสผ่าน: FaceClass123!</span>
          </div>
        </form>
      </section>
    </main>
  );
}

function App({
  token,
  user,
  onLogout,
}: {
  token: string;
  user: User;
  onLogout: () => void;
}) {
  const [section, setSection] = useState<Section>(
    user.role === "student" ? "overview" : "overview",
  );
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [reports, setReports] = useState<StudentReport[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notice, setNotice] = useState("");
  const [cameraConfig, setCameraConfig] = useState<{
    id: string;
    camera_token: string;
  } | null>(null);
  const [modal, setModal] = useState<"course" | "student" | null>(null);
  const [query, setQuery] = useState("");
  const [lateMinutes, setLateMinutes] = useState(15);
  const loadCourses = useCallback(async () => {
    const rows = await request("/courses", token);
    setCourses(rows);
    setCourseId((v) => v || rows[0]?.id || "");
  }, [token]);
  const loadDash = useCallback(async () => {
    if (courseId && user.role !== "student")
      setDash(await request(`/courses/${courseId}/dashboard`, token));
  }, [courseId, token, user.role]);
  const loadStudents = useCallback(async () => {
    if (user.role !== "student")
      setAllStudents(
        await request(`/students?q=${encodeURIComponent(query)}`, token),
      );
  }, [query, token, user.role]);
  const loadReports = useCallback(async () => {
    if (courseId && user.role !== "student") {
      const d = await request(`/courses/${courseId}/reports/students`, token);
      setReports(d.students);
    }
  }, [courseId, token, user.role]);
  useEffect(() => {
    loadCourses().catch(() => onLogout());
  }, [loadCourses, onLogout]);
  useEffect(() => {
    if (user.role === "student") {
      request("/me/attendance", token).then(setHistory);
      request("/notifications", token).then(setNotifications);
    } else {
      loadDash();
      loadStudents();
      loadReports();
    }
  }, [user.role, token, courseId, loadDash, loadStudents, loadReports]);
  async function openSession() {
    try {
      const d = await request(`/courses/${courseId}/sessions`, token, {
        method: "POST",
        body: JSON.stringify({ late_after_minutes: lateMinutes }),
      });
      setCameraConfig(d);
      setNotice(
        "เปิดเซสชันแล้ว ระบบส่งคำสั่งให้ Camera Agent เปิดกล้องอัตโนมัติ",
      );
      await loadDash();
    } catch (e) {
      setNotice(labelError(e));
    }
  }
  async function closeSession() {
    if (!dash?.session) return;
    try {
      await request(`/sessions/${dash.session.id}/close`, token, {
        method: "PATCH",
        body: "{}",
      });
      setCameraConfig(null);
      setNotice("ปิดเซสชันและหยุดรับผลการจดจำแล้ว");
      await loadDash();
    } catch (e) {
      setNotice(labelError(e));
    }
  }
  async function unenroll(id: string) {
    if (!confirm("นำรายชื่อนี้ออกจากรายวิชาใช่หรือไม่?")) return;
    try {
      await request(`/courses/${courseId}/students/${id}`, token, {
        method: "DELETE",
      });
      await loadDash();
      setNotice("นำรายชื่อออกจากรายวิชาแล้ว");
    } catch (e) {
      setNotice(labelError(e));
    }
  }
  async function enroll(id: string) {
    if (!courseId) {
      setNotice("กรุณาเลือกรายวิชาก่อนเพิ่มนักศึกษา");
      return;
    }
    try {
      await request(`/courses/${courseId}/students/${id}`, token, {
        method: "POST",
        body: "{}",
      });
      await Promise.all([loadDash(), loadReports()]);
      setNotice("เพิ่มนักศึกษาเข้ารายวิชาเรียบร้อยแล้ว");
    } catch (e) {
      setNotice(labelError(e));
    }
  }
  const present = dash?.students.filter((s) => s.attendance).length || 0,
    total = dash?.students.length || 0,
    rate = total ? Math.round((present / total) * 100) : 0;
  const nav =
    user.role === "student"
      ? [
          { id: "overview", label: "ภาพรวม" },
          { id: "attendance", label: "ประวัติการเข้าเรียน" },
          { id: "notifications", label: "การแจ้งเตือน" },
        ]
      : [
          { id: "overview", label: "ภาพรวม" },
          { id: "attendance", label: "การเข้าเรียน" },
          { id: "students", label: "นักศึกษา" },
          { id: "courses", label: "รายวิชา" },
          { id: "reports", label: "รายงาน" },
        ];
  return (
    <div className="shell">
      <aside>
        <div className="wordmark">
          <i>FC</i>
          <span>
            FACECLASS<small>COMMAND CENTER</small>
          </span>
        </div>
        <nav>
          {nav.map((n, i) => (
            <button
              key={n.id}
              className={section === n.id ? "active" : ""}
              onClick={() => setSection(n.id as Section)}
            >
              <b>0{i + 1}</b>
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="userCard">
          <div>{user.name.slice(0, 2)}</div>
          <span>
            <b>{user.name}</b>
            <small>{user.role.toUpperCase()}</small>
          </span>
          <button onClick={onLogout}>↗</button>
        </div>
      </aside>
      <main className="mainArea">
        <header>
          <div>
            <p className="kicker">ACADEMIC OPERATIONS / LIVE</p>
            <h1>{nav.find((n) => n.id === section)?.label}</h1>
          </div>
          <button className="mobileHome" onClick={() => setSection("overview")}>
            ← หน้าหลัก
          </button>
          <div className="live">
            <i /> SYSTEM ONLINE{" "}
            <time>{new Date().toLocaleDateString("th-TH")}</time>
          </div>
        </header>
        {user.role === "student" ? (
          <StudentViews
            section={section}
            user={user}
            history={history}
            notifications={notifications}
          />
        ) : (
          <>
            <TeacherToolbar
              courses={courses}
              courseId={courseId}
              setCourseId={setCourseId}
              openCourse={() => setModal("course")}
              openStudent={() => setModal("student")}
            />
            {section === "overview" && (
              <Overview
                dash={dash}
                present={present}
                rate={rate}
                setSection={setSection}
              />
            )}{" "}
            {section === "attendance" && (
              <Attendance
                dash={dash}
                present={present}
                notice={notice}
                cameraConfig={cameraConfig}
                openSession={openSession}
                closeSession={closeSession}
                lateMinutes={lateMinutes}
                setLateMinutes={setLateMinutes}
                token={token}
                onRecognized={loadDash}
              />
            )}{" "}
            {section === "students" && (
              <Students
                students={allStudents}
                enrolled={dash?.students || []}
                query={query}
                setQuery={setQuery}
                enroll={enroll}
                unenroll={unenroll}
                course={dash?.course || null}
                notice={notice}
              />
            )}{" "}
            {section === "courses" && (
              <Courses
                courses={courses}
                active={courseId}
                select={setCourseId}
              />
            )}{" "}
            {section === "reports" && <Reports dash={dash} reports={reports} />}
          </>
        )}
      </main>
      <nav className="mobileNav">
        {nav.map((n) => (
          <button
            key={n.id}
            className={section === n.id ? "active" : ""}
            onClick={() => setSection(n.id as Section)}
          >
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
      {modal && (
        <Modal
          type={modal}
          token={token}
          courseId={courseId}
          close={() => setModal(null)}
          done={async () => {
            setModal(null);
            await loadCourses();
            await loadDash();
            await loadStudents();
          }}
        />
      )}
    </div>
  );
}

function TeacherToolbar({
  courses,
  courseId,
  setCourseId,
  openCourse,
  openStudent,
}: {
  courses: Course[];
  courseId: string;
  setCourseId: (v: string) => void;
  openCourse: () => void;
  openStudent: () => void;
}) {
  return (
    <section className="toolbar">
      <div>
        <label>ACTIVE COURSE</label>
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="toolbarActions">
        <button className="quiet" onClick={openCourse}>
          + สร้างรายวิชา
        </button>
        <button className="quiet" onClick={openStudent}>
          + เพิ่มนักศึกษา
        </button>
      </div>
    </section>
  );
}
function Overview({
  dash,
  present,
  rate,
  setSection,
}: {
  dash: Dashboard | null;
  present: number;
  rate: number;
  setSection: (s: Section) => void;
}) {
  return (
    <>
      <section className="metrics">
        <Metric
          index="01"
          label="ลงทะเบียน"
          value={dash?.students.length || 0}
          unit="คน"
        />
        <Metric index="02" label="ยืนยันแล้ว" value={present} unit="คน" />
        <Metric
          index="03"
          label="อัตราเข้าเรียน"
          value={`${rate}%`}
          unit="LIVE"
        />
        <Metric
          index="04"
          label="กล้อง"
          value={dash?.session ? "ACTIVE" : "OFFLINE"}
          unit={dash?.course.room || "—"}
          active={!!dash?.session}
        />
      </section>
      <section className="quickGrid">
        <button onClick={() => setSection("attendance")}>
          <small>01 / SESSION</small>
          <b>เปิดห้องเช็คชื่อ</b>
          <span>จัดการกล้องและผลการยืนยัน →</span>
        </button>
        <button onClick={() => setSection("students")}>
          <small>02 / FACE PROFILES</small>
          <b>ทะเบียนใบหน้า</b>
          <span>ตรวจข้อมูลนักศึกษาและภาพอ้างอิง →</span>
        </button>
        <button onClick={() => setSection("reports")}>
          <small>03 / ANALYTICS</small>
          <b>รายงานการเข้าเรียน</b>
          <span>ดูอัตราและรายบุคคล →</span>
        </button>
      </section>
    </>
  );
}
function Attendance({
  dash,
  present,
  notice,
  cameraConfig,
  openSession,
  closeSession,
  lateMinutes,
  setLateMinutes,
  token,
  onRecognized,
}: {
  dash: Dashboard | null;
  present: number;
  notice: string;
  cameraConfig: { id: string; camera_token: string } | null;
  openSession: () => void;
  closeSession: () => void;
  lateMinutes: number;
  setLateMinutes: (n: number) => void;
  token: string;
  onRecognized: () => Promise<void>;
}) {
  return (
    <>
      <section className={`sessionBar ${dash?.session ? "running" : ""}`}>
        <div className="scanIcon">
          <span />
        </div>
        <div>
          <small>DETECT → ALIGN → EMBED → MATCH</small>
          <h2>
            {dash?.session ? "กำลังตรวจจับและยืนยันตัวตน" : "เซสชันยังไม่เริ่ม"}
          </h2>
          <p>
            {notice ||
              "เปิดเซสชันเพื่อเปิดกล้องในหน้านี้และ Camera Agent อัตโนมัติ"}
          </p>
          {dash?.session && (
            <p className="lateRule">
              มาหลัง{" "}
              {new Date(dash.session.late_after_at * 1000).toLocaleTimeString(
                "th-TH",
              )}{" "}
              = มาสาย
            </p>
          )}
          {cameraConfig && (
            <code className="cameraCode">SESSION={cameraConfig.id}</code>
          )}
        </div>
        <div className="sessionButtons">
          {!dash?.session && (
            <label className="lateInput">
              สายหลัง (นาที)
              <input
                type="number"
                min="0"
                max="180"
                value={lateMinutes}
                onChange={(e) => setLateMinutes(Number(e.target.value))}
              />
            </label>
          )}
          <button
            className="accentButton"
            onClick={dash?.session ? closeSession : openSession}
          >
            {dash?.session ? "STOP & MARK ABSENT" : "START CLASS"}
          </button>
        </div>
      </section>
      <CameraScanner
        sessionId={dash?.session?.id || null}
        token={token}
        onRecognized={onRecognized}
      />
      <Roster students={dash?.students || []} present={present} />
    </>
  );
}

function CameraScanner({
  sessionId,
  token,
  onRecognized,
}: {
  sessionId: string | null;
  token: string;
  onRecognized: () => Promise<void>;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const busy = useRef(false);
  const [state, setState] = useState<"idle" | "starting" | "ready" | "error">(
    "idle",
  );
  const [msg, setMsg] = useState("กล้องจะเปิดอัตโนมัติเมื่อเริ่มคลาส");
  const [result, setResult] = useState<{
    name?: string;
    confidence?: number;
    matched?: boolean;
    face?: boolean;
  } | null>(null);
  function stop() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setState("idle");
    setResult(null);
    setMsg("กล้องปิดอยู่ — กด START CLASS เพื่อเริ่ม");
  }
  async function scan() {
    if (
      !sessionId ||
      busy.current ||
      !video.current ||
      !canvas.current ||
      video.current.readyState < 2
    )
      return;
    busy.current = true;
    try {
      const c = canvas.current,
        v = video.current;
      c.width = 640;
      c.height = Math.round((640 * v.videoHeight) / v.videoWidth) || 480;
      c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
      const d = await request(`/sessions/${sessionId}/scan-frame`, token, {
        method: "POST",
        body: JSON.stringify({ image_base64: c.toDataURL("image/jpeg", 0.75) }),
      });
      const first = d.faces?.[0];
      if (first?.matched) {
        setResult({
          name: first.name,
          confidence: first.confidence,
          matched: true,
          face: true,
        });
        setMsg(
          `${first.name} · ${first.status === "late" ? "มาสาย" : first.status === "already_checked" ? "เช็คชื่อแล้ว" : "มาเรียน"}`,
        );
        await onRecognized();
      } else if (d.face_detected) {
        setResult({
          name: "ไม่รู้จัก",
          confidence: first?.confidence,
          matched: false,
          face: true,
        });
        setMsg("ตรวจพบใบหน้า แต่ไม่ตรงกับข้อมูลที่ลงทะเบียน");
      } else {
        setResult({ face: false });
        setMsg("กล้องเปิดแล้ว — กรุณาจัดใบหน้าให้อยู่กลางกรอบ");
      }
    } catch (e) {
      if (e instanceof Error && e.message === "SESSION_CLOSED") stop();
      else setMsg("ส่งภาพตรวจสอบไม่สำเร็จ");
    } finally {
      busy.current = false;
    }
  }
  async function start() {
    if (!sessionId) return;
    setState("starting");
    setMsg("กำลังเปิดกล้อง — หากมีคำถามสิทธิ์ให้กดอนุญาต");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      if (video.current) {
        video.current.srcObject = stream.current;
        await video.current.play();
      }
      setState("ready");
      setMsg("กล้องเปิดแล้ว — กำลังค้นหาใบหน้า");
      timer.current = setInterval(scan, 1400);
    } catch {
      setState("error");
      setMsg("เปิดกล้องไม่ได้ กรุณาอนุญาตสิทธิ์ Camera แล้วกดลองใหม่");
    }
  }
  useEffect(() => {
    if (sessionId) start();
    else stop();
    return () => stop();
  }, [sessionId]);
  return (
    <section className="cameraPanel">
      <div
        className={`cameraViewport ${state} ${result?.matched ? "matched" : ""}`}
      >
        <video ref={video} playsInline muted />
        <canvas ref={canvas} hidden />
        <div className="faceGuide">
          <i />
          <span>
            {state === "ready"
              ? result?.matched
                ? `IDENTIFIED: ${result.name}`
                : "SCANNING FACE"
              : "CAMERA OFF"}
          </span>
        </div>
        <div className={`cameraBadge ${state}`}>
          ● {state === "ready" ? "CAMERA ON" : "CAMERA OFF"}
        </div>
      </div>
      <div className="cameraInfo">
        <small>LIVE FACE RECOGNITION / SFACE</small>
        <h2>
          {result?.matched
            ? `ยืนยันตัวตน: ${result.name}`
            : "ภาพกล้องตรวจสอบใบหน้า"}
        </h2>
        <p>{msg}</p>
        {result?.confidence !== undefined && (
          <div className="matchScore">
            <strong>{Math.round(result.confidence * 100)}%</strong>
            <span>SIMILARITY SCORE</span>
          </div>
        )}
        <div className="cameraFacts">
          <span>ภาพส่งเข้าประมวลผลภายในเครื่องเท่านั้น</span>
          <span>เทียบกับ embedding จริงของเจและนัท</span>
        </div>
        {sessionId && state === "error" && (
          <button className="accentButton" onClick={start}>
            ลองเปิดกล้องอีกครั้ง
          </button>
        )}
      </div>
    </section>
  );
}
function Roster({
  students,
  present,
}: {
  students: Student[];
  present: number;
}) {
  return (
    <section className="dataPanel">
      <div className="panelTitle">
        <div>
          <small>LIVE ATTENDANCE FEED</small>
          <h2>นักศึกษาในรายวิชา</h2>
        </div>
        <div className="count">
          {String(present).padStart(2, "0")}
          <span>/{String(students.length).padStart(2, "0")}</span>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>STUDENT</th>
            <th>FACE PROFILE</th>
            <th>STATUS</th>
            <th>DETECTED</th>
            <th>CONFIDENCE</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => {
            const status = s.attendance?.status;
            return (
              <tr
                key={s.id}
                className={status && status !== "absent" ? "verified" : ""}
              >
                <td>
                  <StudentIdentity s={s} />
                </td>
                <td>
                  <span className={`status ${s.photo_url ? "ok" : "pending"}`}>
                    {s.photo_url ? "● REGISTERED" : "○ NOT ENROLLED"}
                  </span>
                </td>
                <td>
                  <span
                    className={`status ${status === "late" ? "late" : status === "absent" ? "absent" : status ? "ok" : "pending"}`}
                  >
                    {status === "late"
                      ? "● LATE"
                      : status === "absent"
                        ? "● ABSENT"
                        : status
                          ? "● PRESENT"
                          : "○ WAITING"}
                  </span>
                </td>
                <td>
                  {s.attendance
                    ? new Date(
                        s.attendance.recognized_at * 1000,
                      ).toLocaleTimeString("th-TH")
                    : "—"}
                </td>
                <td>
                  {s.attendance?.confidence
                    ? `${Math.round(s.attendance.confidence * 100)}%`
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
function Students({
  students,
  enrolled,
  query,
  setQuery,
  enroll,
  unenroll,
  course,
  notice,
}: {
  students: Student[];
  enrolled: Student[];
  query: string;
  setQuery: (v: string) => void;
  enroll: (id: string) => void;
  unenroll: (id: string) => void;
  course: Course | null;
  notice: string;
}) {
  const enrolledIds = new Set(enrolled.map((s) => s.id));
  return (
    <>
      <div className="searchRow">
        <div>
          <input
            aria-label="ค้นหานักศึกษา"
            placeholder="ค้นหาชื่อหรือรหัสนักศึกษา…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <small>
            กำลังจัดรายชื่อเข้า{" "}
            {course
              ? `${course.code} — ${course.name}`
              : "ยังไม่ได้เลือกรายวิชา"}
          </small>
        </div>
        <span>
          {enrolled.length}/{students.length} คนในวิชา
        </span>
      </div>
      {notice && (
        <div className="studentActionNotice" role="status" aria-live="polite">
          {notice}
        </div>
      )}
      <section className="studentGrid">
        {students.map((s) => (
          <article className="studentCard" key={s.id}>
            {s.photo_url ? (
              <img src={s.photo_url} alt={`รูปของ ${s.name}`} />
            ) : (
              <div className="avatarFallback">{s.name.slice(0, 2)}</div>
            )}
            <div>
              <small>{s.student_code}</small>
              <h3>{s.name}</h3>
              <p>{s.program}</p>
              <span className={`status ${s.photo_url ? "ok" : "pending"}`}>
                {s.photo_url ? "● FACE REGISTERED" : "○ NO FACE PROFILE"}
              </span>
            </div>
            {enrolledIds.has(s.id) ? (
              <button className="danger" onClick={() => unenroll(s.id)}>
                นำออกจากวิชา
              </button>
            ) : (
              <button
                className="enrollButton"
                onClick={() => enroll(s.id)}
                disabled={!course}
              >
                + เพิ่มเข้าวิชา
              </button>
            )}
          </article>
        ))}
      </section>
    </>
  );
}
function StudentIdentity({ s }: { s: Student }) {
  return (
    <div className="identity">
      {s.photo_url ? (
        <img src={s.photo_url} alt="" />
      ) : (
        <span>{s.name.slice(0, 2)}</span>
      )}
      <div>
        <b>{s.name}</b>
        <small>{s.student_code}</small>
      </div>
    </div>
  );
}
function Courses({
  courses,
  active,
  select,
}: {
  courses: Course[];
  active: string;
  select: (v: string) => void;
}) {
  return (
    <section className="courseGrid">
      {courses.map((c) => (
        <button
          key={c.id}
          className={active === c.id ? "selected" : ""}
          onClick={() => select(c.id)}
        >
          <small>{c.code}</small>
          <h2>{c.name}</h2>
          <p>ห้อง {c.room || "ยังไม่ระบุ"}</p>
          <span>
            {active === c.id ? "รายวิชาที่กำลังใช้งาน" : "เลือกใช้งาน →"}
          </span>
        </button>
      ))}
    </section>
  );
}
function Reports({
  dash,
  reports,
}: {
  dash: Dashboard | null;
  reports: StudentReport[];
}) {
  const overall = reports.length
    ? Math.round(
        reports.reduce((n, s) => n + s.attendance_rate, 0) / reports.length,
      )
    : 0;
  return (
    <>
      <section className="reportHero">
        <div>
          <small>COURSE ATTENDANCE RATE</small>
          <strong>{overall}%</strong>
          <p>
            {dash?.course.code} · {dash?.course.name} · เปิดเช็คชื่อ{" "}
            {reports[0]?.total_sessions || 0} ครั้ง
          </p>
        </div>
        <div className="reportBar">
          <i style={{ width: `${overall}%` }} />
        </div>
      </section>
      <section className="dataPanel">
        <div className="panelTitle">
          <div>
            <small>INDIVIDUAL ATTENDANCE SUMMARY</small>
            <h2>สรุปการเข้าเรียนรายบุคคล</h2>
          </div>
          <div className="count">
            {reports.length}
            <span> คน</span>
          </div>
        </div>
        <table className="reportTable">
          <thead>
            <tr>
              <th>STUDENT</th>
              <th>เข้าเรียน</th>
              <th>มาสาย</th>
              <th>ขาดเรียน</th>
              <th>อัตราเข้าเรียน</th>
              <th>ความมั่นใจเฉลี่ย</th>
              <th>ตรวจพบล่าสุด</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((s) => (
              <tr
                key={s.id}
                className={s.attendance_rate >= 80 ? "verified" : ""}
              >
                <td>
                  <StudentIdentity s={s as Student} />
                </td>
                <td>
                  <b>
                    {s.present_count} / {s.total_sessions}
                  </b>
                </td>
                <td>
                  <span className={s.late_count ? "lateText" : ""}>
                    {s.late_count} ครั้ง
                  </span>
                </td>
                <td>
                  <span className={s.absent_count ? "absence" : ""}>
                    {s.absent_count} ครั้ง
                  </span>
                </td>
                <td>
                  <div className="studentRate">
                    <span>
                      <i style={{ width: `${s.attendance_rate}%` }} />
                    </span>
                    <b>{s.attendance_rate}%</b>
                  </div>
                </td>
                <td>
                  {s.average_confidence
                    ? `${Math.round(s.average_confidence * 100)}%`
                    : "—"}
                </td>
                <td>
                  {s.last_seen
                    ? new Date(s.last_seen * 1000).toLocaleString("th-TH")
                    : "ยังไม่เคยเช็คชื่อ"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!reports.length && (
          <div className="empty">ยังไม่มีนักศึกษาในรายวิชานี้</div>
        )}
      </section>
    </>
  );
}
function StudentViews({
  section,
  user,
  history,
  notifications,
}: {
  section: Section;
  user: User;
  history: History[];
  notifications: Notification[];
}) {
  const summaries = Array.from(
    history
      .reduce(
        (courses, item) => {
          const summary = courses.get(item.code) ?? {
            code: item.code,
            name: item.name,
            present: 0,
            late: 0,
            absent: 0,
            total: 0,
          };
          summary[item.status] += 1;
          summary.total += 1;
          courses.set(item.code, summary);
          return courses;
        },
        new Map<
          string,
          {
            code: string;
            name: string;
            present: number;
            late: number;
            absent: number;
            total: number;
          }
        >(),
      )
      .values(),
  ).sort((a, b) => a.code.localeCompare(b.code));
  if (section === "notifications")
    return (
      <section className="notificationList">
        {notifications.map((n) => (
          <article key={n.id}>
            <i />
            <div>
              <b>{n.message}</b>
              <small>
                {new Date(n.created_at * 1000).toLocaleString("th-TH")}
              </small>
            </div>
          </article>
        ))}
        {!notifications.length && (
          <div className="empty">ยังไม่มีการแจ้งเตือน</div>
        )}
      </section>
    );
  return (
    <>
      {section === "overview" && (
        <>
          <section className="studentHero">
            <div>
              <p className="kicker">STUDENT ID / {user.student_code}</p>
              <h2>{user.name}</h2>
              <p>ผลการเข้าเรียนรายวิชาของฉัน</p>
            </div>
            <div className="score">
              {history.filter((h) => h.status !== "absent").length}
              <span>ครั้ง</span>
            </div>
          </section>
          <section
            className="studentCourseSummary"
            aria-labelledby="course-summary-title"
          >
            <div className="panelTitle">
              <div>
                <small>COURSE SUMMARY</small>
                <h2 id="course-summary-title">สรุปการเข้าเรียนแยกรายวิชา</h2>
              </div>
              <div className="count">
                {summaries.length}
                <span> วิชา</span>
              </div>
            </div>
            <div className="courseSummaryGrid">
              {summaries.map((course) => {
                const attended = course.present + course.late;
                const rate = course.total
                  ? Math.round((attended / course.total) * 100)
                  : 0;
                return (
                  <article className="courseSummaryCard" key={course.code}>
                    <header>
                      <div>
                        <small>{course.code}</small>
                        <h3>{course.name}</h3>
                      </div>
                      <strong>{rate}%</strong>
                    </header>
                    <div
                      className="courseSummaryBar"
                      aria-label={`อัตราเข้าเรียน ${rate}%`}
                    >
                      <i style={{ width: `${rate}%` }} />
                    </div>
                    <dl>
                      <div>
                        <dt>มาเรียน</dt>
                        <dd>{course.present}</dd>
                      </div>
                      <div>
                        <dt>มาสาย</dt>
                        <dd className={course.late ? "lateText" : ""}>
                          {course.late}
                        </dd>
                      </div>
                      <div>
                        <dt>ขาดเรียน</dt>
                        <dd className={course.absent ? "absence" : ""}>
                          {course.absent}
                        </dd>
                      </div>
                      <div>
                        <dt>ทั้งหมด</dt>
                        <dd>{course.total}</dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
            {!summaries.length && (
              <div className="empty">
                ยังไม่มีข้อมูลการเข้าเรียนสำหรับสรุปรายวิชา
              </div>
            )}
          </section>
        </>
      )}
      {section === "attendance" && (
        <section className="dataPanel">
          <div className="panelTitle">
            <div>
              <small>ATTENDANCE LOG</small>
              <h2>ประวัติการเข้าเรียนของฉัน</h2>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>COURSE</th>
                <th>DATE</th>
                <th>TIME</th>
                <th>STATUS</th>
                <th>CONFIDENCE</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr className={h.status !== "absent" ? "verified" : ""} key={i}>
                  <td>
                    <b>{h.name}</b>
                    <small>{h.code}</small>
                  </td>
                  <td>
                    {new Date(h.recognized_at * 1000).toLocaleDateString(
                      "th-TH",
                    )}
                  </td>
                  <td>
                    {new Date(h.recognized_at * 1000).toLocaleTimeString(
                      "th-TH",
                    )}
                  </td>
                  <td>
                    <span className={`status ${h.status}`}>
                      {h.status === "present"
                        ? "● มาเรียน"
                        : h.status === "late"
                          ? "● มาสาย"
                          : "● ขาดเรียน"}
                    </span>
                  </td>
                  <td>
                    {h.confidence ? `${Math.round(h.confidence * 100)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!history.length && (
            <div className="empty">ยังไม่มีประวัติการเข้าเรียน</div>
          )}
        </section>
      )}
    </>
  );
}
function Metric({
  index,
  label,
  value,
  unit,
  active,
}: {
  index: string;
  label: string;
  value: string | number;
  unit: string;
  active?: boolean;
}) {
  return (
    <article className={`metric ${active ? "activeMetric" : ""}`}>
      <small>
        {index} / {label}
      </small>
      <strong>{value}</strong>
      <span>{unit}</span>
    </article>
  );
}
function Modal({
  type,
  token,
  courseId,
  close,
  done,
}: {
  type: "course" | "student";
  token: string;
  courseId: string;
  close: () => void;
  done: () => void;
}) {
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      if (type === "course")
        await request("/courses", token, {
          method: "POST",
          body: JSON.stringify({
            code: f.get("code"),
            name: f.get("name"),
            room: f.get("room"),
          }),
        });
      else {
        const c = await request("/users", token, {
          method: "POST",
          body: JSON.stringify({
            email: f.get("email"),
            name: f.get("name"),
            role: "student",
            password: f.get("password"),
            student_code: f.get("code"),
            program: f.get("program"),
          }),
        });
        await request(`/courses/${courseId}/students/${c.id}`, token, {
          method: "POST",
          body: "{}",
        });
      }
      done();
    } catch (e) {
      setError(labelError(e));
    }
  }
  return (
    <div className="modal">
      <form onSubmit={submit}>
        <button type="button" className="x" onClick={close}>
          ×
        </button>
        <small>{type === "course" ? "CREATE COURSE" : "ENROLL STUDENT"}</small>
        <h2>{type === "course" ? "สร้างรายวิชา" : "เพิ่มนักศึกษา"}</h2>
        {type === "course" ? (
          <>
            <label>
              รหัสวิชา
              <input name="code" required />
            </label>
            <label>
              ชื่อรายวิชา
              <input name="name" required />
            </label>
            <label>
              ห้องเรียน
              <input name="room" />
            </label>
          </>
        ) : (
          <>
            <label>
              รหัสนักศึกษา
              <input name="code" required />
            </label>
            <label>
              ชื่อ–นามสกุล
              <input name="name" required />
            </label>
            <label>
              อีเมล
              <input name="email" type="email" required />
            </label>
            <label>
              หลักสูตร
              <input name="program" required />
            </label>
            <label>
              รหัสผ่านเริ่มต้น
              <input
                name="password"
                type="password"
                minLength={10}
                defaultValue="FaceClass123!"
                required
              />
            </label>
          </>
        )}
        {error && <div className="error">{error}</div>}
        <button className="accentButton">บันทึกข้อมูล</button>
      </form>
    </div>
  );
}
function labelError(e: unknown) {
  const c = e instanceof Error ? e.message : "ERROR";
  return (
    (
      {
        SESSION_ALREADY_OPEN: "มีเซสชันเปิดอยู่แล้ว",
        ALL_STUDENTS_PRESENT: "นักศึกษาทุกคนเช็คชื่อแล้ว",
        DUPLICATE_USER: "อีเมลหรือรหัสนักศึกษาซ้ำ",
        DUPLICATE_COURSE: "รหัสวิชาซ้ำ",
        ALREADY_ENROLLED: "นักศึกษาคนนี้อยู่ในรายวิชาแล้ว",
        COURSE_NOT_FOUND: "ไม่พบรายวิชาที่เลือก",
        STUDENT_NOT_FOUND: "ไม่พบนักศึกษาที่เลือก",
        FORBIDDEN: "คุณไม่มีสิทธิ์ดำเนินการ",
      } as Record<string, string>
    )[c] || `เกิดข้อผิดพลาด: ${c}`
  );
}
