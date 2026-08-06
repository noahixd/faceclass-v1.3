"""Create real SFace embeddings from an image folder or the webcam."""
import argparse
from pathlib import Path

import cv2
import numpy as np


def models(model_dir):
    detector = cv2.FaceDetectorYN.create(str(model_dir / "yunet.onnx"), "", (320, 320), 0.55, 0.3, 5000)
    recognizer = cv2.FaceRecognizerSF.create(str(model_dir / "sface.onnx"), "")
    return detector, recognizer


def embedding(frame, detector, recognizer):
    height, width = frame.shape[:2]
    if max(height, width) > 1280:
        scale = 1280 / max(height, width)
        frame = cv2.resize(frame, (int(width * scale), int(height * scale)))
    height, width = frame.shape[:2]
    detector.setInputSize((width, height))
    _, faces = detector.detect(frame)
    if faces is None or len(faces) != 1:
        return None
    aligned = recognizer.alignCrop(frame, faces[0])
    vector = recognizer.feature(aligned).flatten()
    return vector / max(np.linalg.norm(vector), 1e-9)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--student-id", required=True)
    parser.add_argument("--out", default="camera_agent/faces.npz")
    parser.add_argument("--camera", type=int, default=0)
    parser.add_argument("--images")
    parser.add_argument("--models", default="camera_agent/models")
    args = parser.parse_args()
    detector, recognizer = models(Path(args.models))
    samples = []
    if args.images:
        for image_path in sorted(Path(args.images).glob("*")):
            frame = cv2.imread(str(image_path))
            if frame is not None:
                vector = embedding(frame, detector, recognizer)
                if vector is not None:
                    samples.append(vector)
    else:
        camera = cv2.VideoCapture(args.camera)
        while len(samples) < 20:
            ok, frame = camera.read()
            if not ok:
                break
            vector = embedding(frame, detector, recognizer)
            if vector is not None:
                samples.append(vector)
            cv2.putText(frame, f"{len(samples)}/20", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, (216, 255, 62), 2)
            cv2.imshow("Face enrollment - Q to cancel", frame)
            if cv2.waitKey(120) & 0xFF == ord("q"):
                break
        camera.release()
        cv2.destroyAllWindows()
    if len(samples) < 3:
        raise SystemExit(f"ภาพใบหน้าที่ใช้ได้ไม่เพียงพอ ({len(samples)})")
    path = Path(args.out)
    ids, vectors = [], []
    if path.exists():
        data = np.load(path, allow_pickle=False)
        ids, vectors = list(data["ids"]), list(data["vectors"])
    average = np.mean(samples, axis=0)
    average = average / max(np.linalg.norm(average), 1e-9)
    if args.student_id in ids:
        vectors[ids.index(args.student_id)] = average
    else:
        ids.append(args.student_id)
        vectors.append(average)
    np.savez(path, ids=np.array(ids), vectors=np.array(vectors))
    print(f"บันทึก embedding จริงของ {args.student_id} จาก {len(samples)} ภาพสำเร็จ")


if __name__ == "__main__":
    main()
