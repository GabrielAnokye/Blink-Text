import eventlet
eventlet.monkey_patch()

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO
import cv2
import threading
import time
from blink_detection.blink_detector import BlinkDetector
import os
import requests
from dotenv import load_dotenv

load_dotenv()
AI_API_URL = os.getenv("MISTRAL_API_URL")
AI_API_KEY = os.getenv("MISTRAL_API_KEY")

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")
print(f"Async mode: {socketio.async_mode}")


detector = BlinkDetector()
cap = cv2.VideoCapture(0)

# Morse code mapping
MORSE_CODE_DICT = {
    '.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E',
    '..-.': 'F', '--.': 'G', '....': 'H', '..': 'I', '.---': 'J',
    '-.-': 'K', '.-..': 'L', '--': 'M', '-.': 'N', '---': 'O',
    '.--.': 'P', '--.-': 'Q', '.-.': 'R', '...': 'S', '-': 'T',
    '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X', '-.--': 'Y',
    '--..': 'Z',
    '-----': '0', '.----': '1', '..---': '2', '...--': '3',
    '....-': '4', '.....': '5', '-....': '6', '--...': '7',
    '---..': '8', '----.': '9'
}

current_sequence = ""
last_blink_time = time.time()
DELAY_BETWEEN_LETTERS = 2  # seconds

@app.route("/")
def home():
    return jsonify({"message": "BlinkAI backend running with Morse translation!"})

def morse_to_text(sequence):
    return MORSE_CODE_DICT.get(sequence, "")

def detect_blinks():
    global current_sequence, last_blink_time
    while True:
        success, frame = cap.read()
        eventlet.sleep(0)
        if not success:
            continue

        blink_type = detector.detect_blink(frame)
        current_time = time.time()

        # If a blink is detected
        if blink_type:
            symbol = '.' if blink_type == "DOT" else '-'
            current_sequence += symbol
            last_blink_time = current_time
            print(f"Blink detected: {symbol}")
            socketio.emit("blink_event", {"type": blink_type, "sequence": current_sequence})

        # Check for pause to finalize letter
        if current_sequence and (current_time - last_blink_time > DELAY_BETWEEN_LETTERS):
            letter = morse_to_text(current_sequence)
            if letter:
                print(f"Decoded letter: {letter}")
                socketio.emit("letter_event", {"letter": letter})
            current_sequence = ""

# thread = threading.Thread(target=detect_blinks)
# thread.daemon = True
# thread.start()
eventlet.spawn(detect_blinks)\

@app.route("/ask_ai", methods=["POST"])
def ask_ai():
    data = request.get_json()
    user_message = data.get("message", "")

    if not user_message:
        return jsonify({"response": "No message provided"}), 400

    headers = {
        "Authorization": f"Bearer {AI_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "mistral-tiny",  # or your available model
        "messages": [
            {"role": "system", "content": "You are BlinkAI, a helpful assistant for accessibility communication."},
            {"role": "user", "content": user_message}
        ]
    }

    try:
        response = requests.post(AI_API_URL, headers=headers, json=payload)
        result = response.json()
        ai_reply = result["choices"][0]["message"]["content"]
        socketio.emit("ai_reply", {"reply": ai_reply})
        return jsonify({"reply": ai_reply})
    except Exception as e:
        print("AI request failed:", e)
        return jsonify({"reply": "Error contacting AI service."}), 500

if __name__ == "__main__":
    socketio.run(app, host="127.0.0.1", port=5002, debug=True, use_reloader=False)

