import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import axios from "axios";

const MORSE_MAP = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.",
  G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..",
  M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.",
  S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-",
  Y: "-.--", Z: "--.."
};

const VideoFeed = () => {
  const [blink, setBlink] = useState(null);
  const [sequence, setSequence] = useState("");
  const [decodedText, setDecodedText] = useState("");
  const [chatHistory, setChatHistory] = useState([]); // newest first
  const [confidence, setConfidence] = useState(null); // optional if backend emits it
  const [aiLoading, setAiLoading] = useState(false);

  const videoRef = useRef(null);
  const socket = useRef(null);
  const chatContainer = useRef(null);

  useEffect(() => {
    // connect to backend socket
    socket.current = io("http://127.0.0.1:5002", { transports: ["websocket"] });

    socket.current.on("connect", () => {
      console.log("Connected to backend socket");
    });

    socket.current.on("blink_event", (data) => {
      // data: { type: "DOT" | "DASH", sequence: ".-", confidence?: 0.82 }
      setBlink(data.type);
      setSequence(data.sequence || "");
      if (data.confidence !== undefined && data.confidence !== null) {
        setConfidence(Math.round(data.confidence * 100)); // percent
      } else {
        setConfidence(null);
      }
    });

    socket.current.on("letter_event", (data) => {
      // data.letter will be string: "A" or "BACKSPACE" or "SPACE"
      if (data.letter === "BACKSPACE") {
        setDecodedText((prev) => prev.slice(0, -1));
      } else if (data.letter === "SPACE") {
        setDecodedText((prev) => prev + " ");
      } else {
        setDecodedText((prev) => prev + (data.letter || ""));
      }
    });

    // Optional: listen for ai_reply if backend emits (but backend now returns via axios)
    socket.current.on("ai_reply", (data) => {
      if (data && data.reply) {
        setChatHistory((prev) => [{ sender: "BlinkAI", text: data.reply }, ...prev]);
      }
    });

    return () => {
      socket.current && socket.current.disconnect();
    };
  }, []);

  // Start webcam
  useEffect(() => {
    const startVideo = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        console.error("Webcam access error:", err);
        alert("Unable to access webcam. Please allow camera permissions.");
      }
    };
    startVideo();
  }, []);

  // Send message to AI via backend route
  const handleSendToAI = async () => {
    if (!decodedText.trim()) return;
    setAiLoading(true);
    const userMsg = decodedText;
    // push to local chat immediately (newest first)
    setChatHistory((prev) => [{ sender: "You", text: userMsg }, ...prev]);
    setDecodedText("");

    try {
      const res = await axios.post("http://127.0.0.1:5002/ask_ai", { message: userMsg }, { timeout: 30000 });
      if (res.data && res.data.reply) {
        setChatHistory((prev) => [{ sender: "BlinkAI", text: res.data.reply }, ...prev]);
      } else {
        setChatHistory((prev) => [{ sender: "BlinkAI", text: "No reply from AI." }, ...prev]);
      }
    } catch (err) {
      console.error("AI request error:", err);
      setChatHistory((prev) => [{ sender: "BlinkAI", text: "Error contacting AI." }, ...prev]);
    } finally {
      setAiLoading(false);
    }
  };

  // Manual space/backspace buttons (helpful during calibration/testing)
  const handleSpace = () => setDecodedText((prev) => prev + " ");
  const handleBackspace = () => setDecodedText((prev) => prev.slice(0, -1));
  const handleClear = () => setDecodedText("");

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50 p-6 flex flex-col items-center">
      <header className="w-full max-w-6xl mb-6">
        <h1 className="text-4xl font-extrabold text-center text-blue-800">
          BlinkA<span className="blinking text-indigo-600">I</span>
        </h1>
      </header>

      <main className="w-full max-w-6xl flex gap-8">
        {/* Left: Video + controls */}
        <section className="flex-1 bg-white rounded-2xl shadow-lg p-5 flex flex-col items-center">
          <div className="w-full">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-[420px] object-cover rounded-lg border-4 border-blue-300"
            />
          </div>

          <div className="w-full mt-4 flex flex-col items-center">
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-700">
                Blink: <span className="text-blue-700">{blink || "None"}</span>
              </p>
              <p className="text-sm text-gray-500">Sequence: <span className="font-mono">{sequence || "..."}</span></p>
              <p className="text-xl font-bold text-green-700 mt-2">Message: {decodedText || <span className="text-gray-400">Building...</span>}</p>
              {confidence !== null && (
                <p className="text-sm text-gray-500 mt-1">Detection confidence: {confidence}%</p>
              )}
            </div>

            <div className="mt-4 flex gap-3">
              <button
                className="px-4 py-2 bg-blue-700 text-white rounded-lg font-semibold hover:bg-blue-800 disabled:opacity-50"
                onClick={handleSendToAI}
                disabled={aiLoading}
              >
                {aiLoading ? "Sending..." : "Send to AI"}
              </button>

              <button
                className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700"
                onClick={() => axios.post("http://127.0.0.1:5002/calibrate").then(() => alert("Calibration started — check backend console")).catch(() => alert("Calibration failed. See backend console."))}
              >
                Calibrate
              </button>

              <button className="px-3 py-2 bg-gray-200 rounded-lg" onClick={handleSpace}>Space</button>
              <button className="px-3 py-2 bg-gray-200 rounded-lg" onClick={handleBackspace}>Backspace</button>
              <button className="px-3 py-2 bg-red-100 text-red-700 rounded-lg" onClick={handleClear}>Clear</button>
            </div>
          </div>
        </section>

        {/* Right: Morse map + Chat */}
        <aside className="w-96 bg-white rounded-2xl shadow-lg p-5 flex flex-col">
          <h3 className="text-lg font-semibold text-gray-700 mb-3">Morse Reference</h3>

          <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
            {Object.entries(MORSE_MAP).map(([letter, code]) => (
              <div key={letter} className="bg-slate-50 p-2 rounded-md flex justify-between items-center border">
                <span className="font-bold">{letter}</span>
                <span className="font-mono text-sky-700">{code}</span>
              </div>
            ))}
            <div className="bg-slate-50 p-2 rounded-md flex justify-between items-center border mt-2">
              <span className="font-bold">SPACE</span>
              <span className="font-mono text-sky-700">........</span>
            </div>
            <div className="bg-slate-50 p-2 rounded-md flex justify-between items-center border mt-2">
              <span className="font-bold">BACKSPACE</span>
              <span className="font-mono text-sky-700">.......</span>
            </div>
          </div>

          <h3 className="text-lg font-semibold text-gray-700 mb-2">Chat</h3>
          <div ref={chatContainer} className="flex flex-col-reverse gap-2 overflow-y-auto chat-scroll h-[300px] p-2">
            {chatHistory.length === 0 && <p className="text-sm text-gray-400">No messages yet</p>}
            {chatHistory.map((msg, idx) => (
              <div key={idx} className={`p-2 rounded-md max-w-[90%] ${msg.sender === "You" ? "self-end bg-blue-50 text-blue-900" : "self-start bg-gray-100 text-gray-900"}`}>
                <strong className="block text-xs text-gray-500">{msg.sender}</strong>
                <div className="text-sm">{msg.text}</div>
              </div>
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
};

export default VideoFeed;
