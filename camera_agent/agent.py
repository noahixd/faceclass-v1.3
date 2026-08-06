"""FaceClass Camera Agent: waits for a class session, then starts webcam recognition."""
import argparse
import time
from pathlib import Path

import cv2
import numpy as np
import requests
from enroll import embedding, models


def normalized(vector): return vector / max(np.linalg.norm(vector), 1e-9)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    parser.add_argument("--course", required=True)
    parser.add_argument("--device-key", default="faceclass-camera-local")
    parser.add_argument("--faces", default="camera_agent/faces.npz")
    parser.add_argument("--camera", type=int, default=0)
    parser.add_argument("--models", default="camera_agent/models")
    args = parser.parse_args()

    with np.load(Path(args.faces), allow_pickle=False) as data:
        ids = data["ids"].copy()
        vectors = np.vstack([normalized(vector) for vector in data["vectors"]])
    detector, recognizer = models(Path(args.models))
    camera = None
    active_id = None
    sent = {}

    print("Camera Agent พร้อมรับคำสั่งเปิดคลาส")
    try:
        while True:
            try:
                state = requests.get(
                    f"{args.api}/camera/active-session",
                    params={"course_id": args.course},
                    headers={"X-Device-Key": args.device_key},
                    timeout=5,
                ).json()
            except requests.RequestException:
                time.sleep(3)
                continue

            if not state.get("active"):
                if camera is not None:
                    camera.release()
                    cv2.destroyAllWindows()
                    camera = None
                    active_id = None
                    print("ปิดกล้องตามเซสชัน")
                time.sleep(2)
                continue

            if camera is None:
                camera = cv2.VideoCapture(args.camera)
                if not camera.isOpened():
                    camera.release()
                    camera = None
                    print("เปิดกล้องไม่ได้ จะลองใหม่")
                    time.sleep(3)
                    continue
                active_id = state["id"]
                sent = {}
                print(f"เปิดกล้องอัตโนมัติสำหรับเซสชัน {active_id}")

            ok, frame = camera.read()
            if not ok:
                time.sleep(1)
                continue
            height, width = frame.shape[:2]
            detector.setInputSize((width, height))
            _, detected = detector.detect(frame)
            for face in ([] if detected is None else detected):
                aligned = recognizer.alignCrop(frame, face)
                vector = normalized(recognizer.feature(aligned).flatten())
                scores = vectors @ vector
                index = int(np.argmax(scores))
                score = float(scores[index])
                student = str(ids[index])
                if score >= 0.45 and time.time() - sent.get(student, 0) > 30:
                    response = requests.post(
                        f"{args.api}/recognitions",
                        headers={"X-Camera-Token": state["camera_token"]},
                        json={"session_id": active_id, "student_id": student, "confidence": min(score, 1)},
                        timeout=5,
                    )
                    if response.status_code in (201, 409):
                        sent[student] = time.time()
                x1, y1, width_box, height_box = map(int, face[:4])
                x2, y2 = x1 + width_box, y1 + height_box
                label = f"{student if score >= .45 else 'UNKNOWN'} {score:.2f}"
                cv2.rectangle(frame, (x1, y1), (x2, y2), (216, 255, 62), 2)
                cv2.putText(frame, label, (x1, max(20, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, .55, (216, 255, 62), 2)
            cv2.imshow("FaceClass Camera Agent - Q to quit", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    finally:
        if camera is not None:
            camera.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
