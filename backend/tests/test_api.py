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
        student = login(client, "student@example.com")
        courses = client.get("/courses", headers=auth(teacher)).json()
        assert len(courses) == 1
        course_id = courses[0]["id"]

        opened = client.post(f"/courses/{course_id}/sessions", headers=auth(teacher), json={"late_after_minutes": 0})
        assert opened.status_code == 201
        session = opened.json()
        assert client.post(f"/courses/{course_id}/sessions", headers=auth(teacher), json={"late_after_minutes": 15}).status_code == 409

        low = client.post("/recognitions", headers={"X-Camera-Token": session["camera_token"]}, json={"session_id": session["id"], "student_id": "u-student-1", "confidence": 0.2})
        assert low.status_code == 422
        recognized = client.post("/recognitions", headers={"X-Camera-Token": session["camera_token"]}, json={"session_id": session["id"], "student_id": "u-student-1", "confidence": 0.96})
        assert recognized.status_code == 201
        assert recognized.json()["status"] in {"present", "late"}
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
