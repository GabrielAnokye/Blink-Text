from flask import Flask, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO
import cv2
import threading
from blink_detection.blink_detector import BlinkDetector

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

detector = BlinkDetector()
cap = cv2.VideoCapture(0)  # Use default webcam

@app.route("/")
def home():
    return jsonify({"message": "BlinkAI backend running with detection!"})

def detect_blinks():
    while True:
        success, frame = cap.read()
        if not success:
            continue

        blink_type = detector.detect_blink(frame)
        if blink_type:
            socketio.emit('blink_event', {'type': blink_type})

thread = threading.Thread(target=detect_blinks)
thread.daemon = True
thread.start()

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5002, debug=True)
