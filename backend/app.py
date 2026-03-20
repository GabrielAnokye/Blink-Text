import eventlet
eventlet.monkey_patch()

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO
import cv2, time, os, requests
from dotenv import load_dotenv
from blink_detection.blink_detector import BlinkDetector
import cohere

load_dotenv()
print("Loaded Cohere Key:", os.getenv("COHERE_API_KEY"))

AI_API_URL = os.getenv("MISTRAL_API_URL")
AI_API_KEY = os.getenv("MISTRAL_API_KEY")
co = cohere.Client(os.getenv("COHERE_API_KEY"))


app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")
print(f"Async mode: {socketio.async_mode}")

detector = BlinkDetector()
cap = cv2.VideoCapture(0)

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
last_blink_time = time.time()
pause_threshold = 4  # seconds of inactivity before auto-send

@app.route("/")
def home():
    return jsonify({"message": "BlinkAI backend is running"})


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


def detect_blinks():
    """Continuously detect blinks from camera feed."""
    global current_sequence, last_blink_time, current_message
    while True:
        success, frame = cap.read()
        eventlet.sleep(0.03)  # yield control to eventlet loop
        if not success:
            continue

        blink_type = detector.detect_blink(frame)
        current_time = time.time()

        if blink_type:
            symbol = '.' if blink_type == "DOT" else '-'
            current_sequence += symbol
            last_blink_time = current_time
            socketio.emit("blink_event", {
                "type": blink_type,
                "sequence": current_sequence,
                "confidence": getattr(detector, "blink_confidence", None)
            })

        # pause between blinks = end of one letter
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

        # auto-send after inactivity
        check_auto_send()


eventlet.spawn(detect_blinks)


@app.route("/ask_ai", methods=["POST"])
def ask_ai():
    """Send user text to Cohere AI and maintain conversation context."""
    data = request.get_json()
    user_message = data.get("message", "").strip()

    if not user_message:
        return jsonify({"reply": "No message provided"}), 400

    # Convert conversation history into Cohere's accepted format
    chat_history_formatted = []
    for entry in conversation_history:
        if entry["role"] == "user":
            role = "User"
        elif entry["role"] == "assistant":
            role = "Chatbot"
        else:
            role = "System"
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

        # Store conversation context
        conversation_history.append({"role": "user", "content": user_message})
        conversation_history.append({"role": "assistant", "content": ai_reply})

        # keep context short
        if len(conversation_history) > 10:
            conversation_history[:] = conversation_history[-10:]

        print("✅ Cohere response:", ai_reply)
        return jsonify({"reply": ai_reply})

    except Exception as e:
        print("❌ Cohere request failed:", e)
        return jsonify({"reply": f"Error contacting AI service: {e}"}), 500





@app.route("/calibrate", methods=["POST"])
def calibrate():
    """Capture EAR values over 3 seconds to compute threshold."""
    open_values = []
    start = time.time()
    while time.time() - start < 3:
        if getattr(detector, "current_ear", None):
            open_values.append(detector.current_ear)
        eventlet.sleep(0.05)

    if open_values:
        avg_open = sum(open_values) / len(open_values)
        detector.EAR_THRESHOLD = avg_open - 0.1
        print(f"✅ Calibration complete. EAR_THRESHOLD = {detector.EAR_THRESHOLD:.3f}")
        return jsonify({"threshold": detector.EAR_THRESHOLD}), 200
    else:
        print("❌ Calibration failed — no EAR values detected.")
        return jsonify({"error": "No EAR values captured"}), 400


if __name__ == "__main__":
    socketio.run(app, host="127.0.0.1", port=5002, debug=True, use_reloader=False)
