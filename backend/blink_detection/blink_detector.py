import cv2, mediapipe as mp, time
from scipy.spatial import distance as dist

mp_face_mesh = mp.solutions.face_mesh
LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]

class BlinkDetector:
    def __init__(self):
        self.face_mesh = mp_face_mesh.FaceMesh(max_num_faces=1, refine_landmarks=True)
        self.blink_detected = False
        self.blink_start_time = 0
        self.EAR_THRESHOLD = 0.11
        self.LONG_BLINK_DURATION = 0.4
        self.current_ear = 0.0

    def eye_aspect_ratio(self, landmarks, eye_points):
        top = dist.euclidean(landmarks[eye_points[1]], landmarks[eye_points[5]]) + \
              dist.euclidean(landmarks[eye_points[2]], landmarks[eye_points[4]])
        bottom = dist.euclidean(landmarks[eye_points[0]], landmarks[eye_points[3]])
        return top / (2.0 * bottom)

    def detect_blink(self, frame):
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.face_mesh.process(rgb)
        h, w, _ = frame.shape

        if results.multi_face_landmarks:
            for face_landmarks in results.multi_face_landmarks:
                landmarks = [(int(p.x * w), int(p.y * h)) for p in face_landmarks.landmark]
                left_EAR = self.eye_aspect_ratio(landmarks, LEFT_EYE)
                right_EAR = self.eye_aspect_ratio(landmarks, RIGHT_EYE)
                ear = (left_EAR + right_EAR) / 2.0
                self.current_ear = ear  # continuously update

                now = time.time()
                if ear < self.EAR_THRESHOLD:
                    if not self.blink_detected:
                        self.blink_detected = True
                        self.blink_start_time = now
                elif self.blink_detected:
                    blink_duration = now - self.blink_start_time
                    self.blink_detected = False
                    return "DASH" if blink_duration >= self.LONG_BLINK_DURATION else "DOT"

        return None
