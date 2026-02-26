import cv2
import mediapipe as mp
import time
from scipy.spatial import distance as dist

mp_face_mesh = mp.solutions.face_mesh

# Indices for left and right eyes from MediaPipe face mesh
LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]

class BlinkDetector:
    def __init__(self):
        self.face_mesh = mp_face_mesh.FaceMesh(max_num_faces=1, refine_landmarks=True)
        self.prev_blink_time = 0
        self.blink_start_time = 0
        self.blink_detected = False
        self.EAR_THRESHOLD = 0.21
        self.LONG_BLINK_DURATION = 0.4  # seconds

    def eye_aspect_ratio(self, landmarks, eye_points):
        # EAR formula: vertical / horizontal
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

                current_time = time.time()
                if ear < self.EAR_THRESHOLD:
                    if not self.blink_detected:
                        self.blink_start_time = current_time
                        self.blink_detected = True
                else:
                    if self.blink_detected:
                        blink_duration = current_time - self.blink_start_time
                        self.blink_detected = False
                        if blink_duration >= self.LONG_BLINK_DURATION:
                            return "DASH"
                        else:
                            return "DOT"
        return None
