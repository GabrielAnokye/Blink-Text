import base64
import numpy as np
import time
import os
import cv2
from threading import Lock
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO
from dotenv import load_dotenv
import cohere

load_dotenv()
COHERE_API_KEY = os.getenv("COHERE_API_KEY")

co = cohere.Client(COHERE_API_KEY) if COHERE_API_KEY else None

app = Flask(__name__)
CORS(app)

# Explicitly force threading, ignoring any leftover async libraries
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")
print(f"Async mode: {socketio.async_mode}")

# ---------------------------------------------------------
# CRITICAL FIX: Lazy Initialization for MediaPipe
# ---------------------------------------------------------
detector = None
detector_lock = Lock()

def get_detector():
    """Only initializes MediaPipe AFTER Gunicorn forks the worker process."""
    global detector
    if detector is None:
        with detector_lock:
            if detector is None:
                from blink_detection.blink_detector import BlinkDetector
                detector = BlinkDetector()
                print("✅ MediaPipe initialized safely inside worker thread.")
    return detector

MORSE_CODE_DICT = {
    '.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E',
    '..-.': 'F', '--.': 'G', '....': 'H', '..': 'I', '.---': 'J',
    '-.-': 'K', '.-..': 'L', '--': 'M', '-.': 'N', '---': 'O',
    '.--.': 'P', '--.-': 'Q', '.-.': 'R', '...': 'S', '-': 'T',
    '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X', '-.--': 'Y',
    '--..': 'Z',
    '.......': 'BACKSPACE',
    '........': 'SPACE'
}

current_sequence = ""
current_message = ""
last_blink_time = time.time()
DELAY_BETWEEN_LETTERS = 2.0  
conversation_history = []
pause_threshold = 4  

is_calibrating = False
calibration_values = []

@app.route("/")
def home():
    return jsonify({"message": "BlinkAI backend is running with native threads."})

def check_auto_send():
    global last_blink_time, current_message
    if time.time() - last_blink_time > pause_threshold and current_message:
        msg = current_message.strip()
        if msg:
            print(f"[AUTO-SEND] Triggered: {msg}")
            socketio.emit("send_message", {"text": msg})
            current_message = ""  
            last_blink_time = time.time()

def morse_to_text(sequence):
    return MORSE_CODE_DICT.get(sequence, "")

@socketio.on("video_frame")
def handle_video_frame(data):
    global current_sequence, last_blink_time, current_message, is_calibrating, calibration_values
    
    image_data = data.get("image")
    if not image_data:
        return

    try:
        encoded_data = image_data.split(',')[1]
        nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    except Exception as e:
        print(f"Frame decode error: {e}")
        return

    # Safely get the initialized detector
    safe_detector = get_detector()
    blink_type = safe_detector.detect_blink(frame)
    current_time = time.time()

    current_ear = getattr(safe_detector, "current_ear", None)
    if is_calibrating and current_ear is not None and current_ear > 0:
        calibration_values.append(float(current_ear))

    if blink_type:
        symbol = '.' if blink_type == "DOT" else '-'
        current_sequence += symbol
        last_blink_time = current_time
        socketio.emit("blink_event", {
            "type": blink_type,
            "sequence": current_sequence,
            "confidence": getattr(safe_detector, "blink_confidence", None)
        })

    if current_sequence and (current_time - last_blink_time > DELAY_BETWEEN_LETTERS):
        letter = morse_to_text(current_sequence)
        if letter:
            socketio.emit("letter_event", {"letter": letter})

            if letter == "BACKSPACE":
                current_message = current_message[:-1]
            elif letter == "SPACE":
                current_message += " "
            else:
                current_message += letter

            print(f"[Decoded] {letter} → Current message: {current_message}")

        current_sequence = ""

    check_auto_send()

@app.route("/ask_ai", methods=["POST"])
def ask_ai():
    data = request.get_json()
    user_message = data.get("message", "").strip()

    if not user_message:
        return jsonify({"reply": "No message provided"}), 400

    if co is None:
        return jsonify({"reply": "COHERE_API_KEY is not configured on the backend."}), 503

    chat_history_formatted = []
    for entry in conversation_history:
        role = "User" if entry["role"] == "user" else "Chatbot"
        chat_history_formatted.append({"role": role, "message": entry["content"]})

    try:
        print("🔹 Sending to Cohere (with history)...")
        response = co.chat(
            model="command-a-03-2025",
            message=user_message,
            chat_history=chat_history_formatted,
            temperature=0.6,
            preamble = (
                "You are BlinkAI, an assistive AI designed to communicate with users who type by blinking. "
                "Each blink is translated into Morse code, which then becomes text. "
                "Because blinking is slow and tiring, users may sometimes send incomplete or misspelled words. "
                "Your job is to interpret their intent as best as possible, infer missing words, and respond naturally. "
                "Keep replies short, kind, and easy to read."
            ),
        )

        ai_reply = response.text.strip()

        conversation_history.append({"role": "user", "content": user_message})
        conversation_history.append({"role": "assistant", "content": ai_reply})

        if len(conversation_history) > 10:
            conversation_history[:] = conversation_history[-10:]

        return jsonify({"reply": ai_reply})

    except Exception as e:
        print("❌ Cohere request failed:", e)
        return jsonify({"reply": f"Error contacting AI service: {e}"}), 500

@app.route("/calibrate", methods=["POST"])
def calibrate():
    global is_calibrating, calibration_values
    safe_detector = get_detector()
    is_calibrating = True
    calibration_values = []

    # Collect EAR values from incoming video frames for up to 4 seconds.
    start_time = time.time()
    while time.time() - start_time < 4:
        if len(calibration_values) >= 15:
            break
        time.sleep(0.1)

    is_calibrating = False

    if calibration_values:
        avg_open = sum(calibration_values) / len(calibration_values)
        safe_detector.EAR_THRESHOLD = max(0.05, avg_open - 0.08)
        print(f"✅ Calibration complete. EAR_THRESHOLD = {safe_detector.EAR_THRESHOLD:.3f}")
        return jsonify({"threshold": safe_detector.EAR_THRESHOLD}), 200
    else:
        current_ear = getattr(safe_detector, "current_ear", None)
        if current_ear is not None and current_ear > 0:
            safe_detector.EAR_THRESHOLD = max(0.05, float(current_ear) - 0.08)
            print(f"✅ Calibration fallback used. EAR_THRESHOLD = {safe_detector.EAR_THRESHOLD:.3f}")
            return jsonify({"threshold": safe_detector.EAR_THRESHOLD, "fallback": True}), 200

        print("❌ Calibration failed — no EAR values detected.")
        return jsonify({"error": "No EAR values captured. Keep face centered and camera active."}), 400

if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "5002"))
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    socketio.run(app, host=host, port=port, debug=debug, use_reloader=False)