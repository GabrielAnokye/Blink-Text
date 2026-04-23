import eventlet
eventlet.monkey_patch()

import base64
import numpy as np
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO
import cv2, time, os
from dotenv import load_dotenv
from blink_detection.blink_detector import BlinkDetector
import cohere

load_dotenv()
COHERE_API_KEY = os.getenv("COHERE_API_KEY")

co = cohere.Client(COHERE_API_KEY) if COHERE_API_KEY else None

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")
print(f"Async mode: {socketio.async_mode}")

detector = BlinkDetector()

# Morse dictionary including SPACE / BACKSPACE
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
DELAY_BETWEEN_LETTERS = 2.0  # seconds
conversation_history = []
pause_threshold = 4  # seconds of inactivity before auto-send

# Calibration State
is_calibrating = False
calibration_values = []

@app.route("/")
def home():
    return jsonify({"message": "BlinkAI backend is running and waiting for socket frames."})

def check_auto_send():
    global last_blink_time, current_message
    if time.time() - last_blink_time > pause_threshold and current_message:
        msg = current_message.strip()
        if msg:
            print(f"[AUTO-SEND] Triggered: {msg}")
            socketio.emit("send_message", {"text": msg})
            current_message = ""  # reset after send
            last_blink_time = time.time()

def morse_to_text(sequence):
    """Translate Morse sequence into text (letter, SPACE, BACKSPACE)."""
    return MORSE_CODE_DICT.get(sequence, "")

@socketio.on("video_frame")
def handle_video_frame(data):
    """Receives base64 video frames from the React frontend, processes blinks."""
    global current_sequence, last_blink_time, current_message, is_calibrating, calibration_values
    
    image_data = data.get("image")
    if not image_data:
        return

    # Decode base64 frame from frontend
    try:
        encoded_data = image_data.split(',')[1]
        nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    except Exception as e:
        print(f"Frame decode error: {e}")
        return

    # Run detection
    blink_type = detector.detect_blink(frame)
    eventlet.sleep(0)  # Yield to allow other events to process
    current_time = time.time()

    # Handle calibration recording
    if is_calibrating and getattr(detector, "current_ear", None):
        calibration_values.append(detector.current_ear)

    if blink_type:
        symbol = '.' if blink_type == "DOT" else '-'
        current_sequence += symbol
        last_blink_time = current_time
        socketio.emit("blink_event", {
            "type": blink_type,
            "sequence": current_sequence,
            "confidence": getattr(detector, "blink_confidence", None)
        })

    # Pause between blinks = end of one letter
    if current_sequence and (current_time - last_blink_time > DELAY_BETWEEN_LETTERS):
        letter = morse_to_text(current_sequence)
        if letter:
            socketio.emit("letter_event", {"letter": letter})

            # Build full text for backend tracking
            if letter == "BACKSPACE":
                current_message = current_message[:-1]
            elif letter == "SPACE":
                current_message += " "
            else:
                current_message += letter

            print(f"[Decoded] {letter} → Current message: {current_message}")

        current_sequence = ""

    # Check for auto-send timeout
    check_auto_send()

@app.route("/ask_ai", methods=["POST"])
def ask_ai():
    """Send user text to Cohere AI and maintain conversation context."""
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
                "Keep replies short, kind, and easy to read. Avoid markdown symbols like asterisks (*); "
                "instead, use plain text for emphasis when needed."
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
    """Capture EAR values over 3 seconds from the socket stream to compute threshold."""
    global is_calibrating, calibration_values
    is_calibrating = True
    calibration_values = []
    
    # Wait for frames to populate the array
    eventlet.sleep(3)
    is_calibrating = False

    if calibration_values:
        avg_open = sum(calibration_values) / len(calibration_values)
        detector.EAR_THRESHOLD = avg_open - 0.1
        print(f"✅ Calibration complete. EAR_THRESHOLD = {detector.EAR_THRESHOLD:.3f}")
        return jsonify({"threshold": detector.EAR_THRESHOLD}), 200
    else:
        print("❌ Calibration failed — no EAR values detected.")
        return jsonify({"error": "No EAR values captured. Ensure camera is sending frames."}), 400

if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "5002"))
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    socketio.run(app, host=host, port=port, debug=debug, use_reloader=False)