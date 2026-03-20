# 👁️ BlinkAI — Hands-Free Communication via Eye Blinks

BlinkAI is an **assistive AI system** designed to help users with **limited mobility** communicate **entirely through eye blinks**.  
It uses **computer vision** to detect blinks, converts them into **Morse code**, and translates the Morse into text — which is then processed by an **AI chatbot** for natural, conversational responses.

---

## 🚀 Features

- 🧠 **AI-Powered Conversation** — Uses Cohere’s `command-a-03-2025` model for intelligent, context-aware responses.  
- 👁️ **Blink Detection via OpenCV + Mediapipe** — Detects short and long blinks as Morse dots and dashes.  
- 🔠 **Morse Code Translation** — Converts blink sequences into letters, words, and full sentences.  
- 💬 **Real-Time Chat Interface** — Displays messages and AI replies in an accessible chat window.  
- 🤖 **Hands-Free Auto-Send** — Automatically sends a message when no blink is detected for a few seconds.  
- 🎨 **Modern UI Design** — Intuitive dark-mode interface built with React + Tailwind CSS.  
- ⚙️ **Calibration Tool** — Dynamically adjusts EAR (Eye Aspect Ratio) threshold for different users or lighting conditions.

---

## 🧩 System Architecture
```
+-------------------------+
| User Blinks |
+-----------+-------------+
|
v
+-------------------------+
| Blink Detector (Mediapipe + OpenCV)
| - Calculates Eye Aspect Ratio (EAR)
| - Detects DOT (short blink) / DASH (long blink)
+-----------+-------------+
|
v
+-------------------------+
| Morse Translator (Flask) |
| - Converts sequences to letters
| - Builds user message
| - Auto-sends after pause
+-----------+-------------+
|
v
+-------------------------+
| Cohere AI (Backend API) |
| - Interprets incomplete or slow input
| - Responds empathetically & concisely
+-----------+-------------+
|
v
+-------------------------+
| Frontend (React + Socket.IO)
| - Shows camera feed, Morse chart, and AI chat
| - Provides “Calibrate”, “Clear”, “Space”, and “Backspace” controls
+-------------------------+
```

---

## 🖥️ Tech Stack

**Frontend:**
- React + Vite  
- Tailwind CSS  
- Axios  
- Socket.IO Client  

**Backend:**
- Flask + Flask-SocketIO (Eventlet async)  
- OpenCV + Mediapipe (Blink Detection)  
- Cohere API (Natural Language Understanding)  
- dotenv (Environment Variables)

---

## ⚙️ Installation and Setup


📷 How It Works

Open the app — Camera activates and starts tracking your eyes.

Blink — Short blink = “.”, Long blink = “-”.

Morse translation — The system builds your message in real time.

Auto-send — When you stop blinking for ~4 seconds, the message is sent to AI.

AI reply — BlinkAI responds naturally and concisely.

🧭 Interface Overview
Section	            Description
Left	            Morse code reference with special commands (SPACE (8x), BACKSPACE (7x))
Center	            Live camera feed, blink status, and Morse translation output
Right	            Chat history with AI responses and user messages
Bottom-Right	Real-time blink stats — blink count, accuracy, WPM
🧪 Example Interaction
```
User Blinks:
. . . .        → "H"
.              → "E"
. - . .        → "L"
. - . .        → "L"
- - -          → "O"

[AUTO-SEND] "HELLO"
BlinkAI: Hello there! How are you today?

📊 Performance Metrics
Metric	                        Result
Average AI response time	1.7 seconds
Blink detection accuracy	~90%
Morse decoding delay	   2 seconds between letters
Words per minute (WPM)	   4.5 – 6.2
```
🧩 Future Work

Speech output (text-to-speech) for verbal communication

Gesture-based input alternatives

Multilingual Morse support

WebRTC for remote caregiver connection
