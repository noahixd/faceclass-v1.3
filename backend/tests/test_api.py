import os
import tempfile

db_file = tempfile.NamedTemporaryFile(delete=False)
db_file.close()
os.environ["FACECLASS_DB"] = db_file.name
os.environ["FACECLASS_SECRET"] = "test-secret-at-least-32-characters"

from fastapi.testclient import TestClient
from backend.app import app


def login(client, email):
    response = client.post("/auth/login", json={"email": email, "password": "FaceClass123!"})
    assert response.status_code == 200
    return response.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_complete_attendance_flow_and_errors():
    with TestClient(app) as client:
        assert client.get("/health").json()["status"] == "ok"
        assert client.post("/auth/login", json={"email": "teacher@example.com", "password": "wrong"}).status_code == 401
        assert client.get("/courses").status_code == 401

        teacher = login(client, "teacher@example.com")
        admin = login(client, "admin@example.com")
        student = login(client, "student@example.com")
        courses = client.get("/courses", headers=auth(teacher)).json()
        assert len(courses) == 1
        course_id = courses[0]["id"]
        assert client.post(
            "/courses",
            headers=auth(teacher),
            json={"code": "CS499", "name": "Teacher Created Course", "room": "Lab 9"},
        ).status_code == 201

        created = client.post(
            "/users",
            headers=auth(admin),
            json={
                "email": "enroll-test@example.com",
                "name": "Enrollment Test",
                "role": "student",
                "password": "FaceClass123!",
                "student_code": "65999999",
                "program": "Computer Science",
            },
        )
        assert created.status_code == 201
        new_student_id = created.json()["id"]
        assert client.post(
            "/users",
            headers=auth(teacher),
            json={
                "email": "teacher-cannot-create@example.com",
                "name": "Forbidden Student",
                "role": "student",
                "password": "FaceClass123!",
                "student_code": "65999998",
                "program": "Computer Science",
            },
        ).status_code == 403
        visible_students = client.get("/students", headers=auth(teacher)).json()
        assert new_student_id in {row["id"] for row in visible_students}
        enrollment = client.post(
            f"/courses/{course_id}/students/{new_student_id}",
            headers=auth(teacher),
            json={},
        )
        assert enrollment.status_code == 204
        dashboard = client.get(f"/courses/{course_id}/dashboard", headers=auth(teacher)).json()
        assert new_student_id in {row["id"] for row in dashboard["students"]}
        assert client.post(
            f"/courses/{course_id}/students/{new_student_id}",
            headers=auth(teacher),
            json={},
        ).status_code == 409
        assert client.post(
            f"/courses/missing-course/students/{new_student_id}",
            headers=auth(teacher),
            json={},
        ).status_code == 404
        assert client.post(
            f"/courses/{course_id}/students/missing-student",
            headers=auth(teacher),
            json={},
        ).status_code == 404

        opened = client.post(f"/courses/{course_id}/sessions", headers=auth(teacher), json={"late_after_minutes": 0})
        assert opened.status_code == 201
        session = opened.json()
        assert client.post(f"/courses/{course_id}/sessions", headers=auth(teacher), json={"late_after_minutes": 15}).status_code == 409

        low = client.post("/recognitions", headers={"X-Camera-Token": session["camera_token"]}, json={"session_id": session["id"], "student_id": "u-student-1", "confidence": 0.2})
        assert low.status_code == 422
        recognized = client.post("/recognitions", headers={"X-Camera-Token": session["camera_token"]}, json={"session_id": session["id"], "student_id": "u-student-1", "confidence": 0.96})
        assert recognized.status_code == 201
        assert recognized.json()["status"] in {"present", "late"}
        notifications = client.get("/notifications", headers=auth(student))
        assert notifications.status_code == 200
        assert notifications.json()[0]["message"] == "เช็คชื่อสำเร็จ วิชา CS401 — ปัญญาประดิษฐ์"
        assert client.post("/recognitions", headers={"X-Camera-Token": session["camera_token"]}, json={"session_id": session["id"], "student_id": "u-student-1", "confidence": 0.96}).status_code == 409

        history = client.get("/me/attendance", headers=auth(student))
        assert history.status_code == 200 and len(history.json()) == 1
        assert client.get("/students", headers=auth(student)).status_code == 403
        assert client.patch(f"/sessions/{session['id']}/close", headers=auth(teacher), json={}).status_code == 200
        assert client.post("/recognitions", headers={"X-Camera-Token": session["camera_token"]}, json={"session_id": session["id"], "student_id": "u-student-2", "confidence": 0.96}).status_code == 409
        report = client.get(f"/courses/{course_id}/reports/students", headers=auth(teacher))
        assert report.status_code == 200
        absent = next(row for row in report.json()["students"] if row["id"] == "u-student-2")
        assert absent["absent_count"] == 1
        assert client.get(f"/camera/active-session?course_id={course_id}", headers={"X-Device-Key": "wrong"}).status_code == 403
