import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import axios from "axios";

const MORSE_MAP = {
  A: ".-",
  B: "-...",
  C: "-.-.",
  D: "-..",
  E: ".",
  F: "..-.",
  G: "--.",
  H: "....",
  I: "..",
  J: ".---",
  K: "-.-",
  L: ".-..",
  M: "--",
  N: "-.",
  O: "---",
  P: ".--.",
  Q: "--.-",
  R: ".-.",
  S: "...",
  T: "-",
  U: "..-",
  V: "...-",
  W: ".--",
  X: "-..-",
  Y: "-.--",
  Z: "--..",
};

const VideoFeed = () => {
  const [blink, setBlink] = useState(null);
  const [sequence, setSequence] = useState("");
  const [decodedText, setDecodedText] = useState("");
  const [chatHistory, setChatHistory] = useState([]); // newest first
  const [confidence, setConfidence] = useState(null); // optional if backend emits it
  const [aiLoading, setAiLoading] = useState(false);
  const [blinkCount, setBlinkCount] = useState(0);
  const [accuracy, setAccuracy] = useState(100);
  const [wpm, setWpm] = useState(0);
  const [startTime, setStartTime] = useState(null);

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

    socket.current.on("blink_event", (data) => {
      setBlink(data.type);
      setSequence(data.sequence || "");

      // increment blink count
      setBlinkCount((prev) => prev + 1);

      // start timer if first blink
      if (!startTime) setStartTime(Date.now());
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
        setChatHistory((prev) => [
          { sender: "BlinkAI", text: data.reply },
          ...prev,
        ]);
      }
    });

    return () => {
      socket.current && socket.current.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!startTime || decodedText.length === 0) return;

    const elapsedMinutes = (Date.now() - startTime) / 60000;
    const words = decodedText.trim().split(/\s+/).length;
    const wpmCalc = Math.max(0, (words / elapsedMinutes).toFixed(1));

    setWpm(wpmCalc);
  }, [decodedText]);

  // Start webcam
  useEffect(() => {
    const startVideo = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
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
      const res = await axios.post(
        "http://127.0.0.1:5002/ask_ai",
        { message: userMsg },
        { timeout: 30000 }
      );
      if (res.data && res.data.reply) {
        setChatHistory((prev) => [
          { sender: "BlinkAI", text: res.data.reply },
          ...prev,
        ]);
      } else {
        setChatHistory((prev) => [
          { sender: "BlinkAI", text: "No reply from AI." },
          ...prev,
        ]);
      }
    } catch (err) {
      console.error("AI request error:", err);
      setChatHistory((prev) => [
        { sender: "BlinkAI", text: "Error contacting AI." },
        ...prev,
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  // Manual space/backspace buttons (helpful during calibration/testing)
  const handleSpace = () => setDecodedText((prev) => prev + " ");
  const handleBackspace = () => setDecodedText((prev) => prev.slice(0, -1));
  const handleClear = () => setDecodedText("");

  return (
    <div className="min-h-screen bg-gradient-to-br w-full from-gray-900 via-slate-900 to-gray-800 text-gray-100 p-6 flex flex-col items-center">
      <header className="w-full max-w-6xl mb-6">
        <h1 className="text-4xl font-extrabold text-center text-indigo-400">
          Bl<span className="blinking text-blue-300">i</span>nkA
          <span className="blinking text-blue-300">I</span>
        </h1>
      </header>

      <main className="w-full max-w-6xl flex gap-8">
        {/* Left: Video + controls */}
        <section className="flex-1 bg-gray-800 rounded-2xl shadow-lg p-5 flex flex-col items-center border border-gray-700">
          <div className="w-full">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-[420px] object-cover rounded-lg border-2 border-blue-500 shadow-md"
            />
          </div>

          <div className="w-full mt-4 flex flex-col items-center">
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-300">
                Blink: <span className="text-blue-400">{blink || "None"}</span>
              </p>
              <p className="text-sm text-gray-400">
                Sequence: <span className="font-mono">{sequence || "..."}</span>
              </p>
              <p className="text-xl font-bold text-green-400 mt-2">
                Message:{" "}
                {decodedText || (
                  <span className="text-gray-500">Building...</span>
                )}
              </p>
              {confidence !== null && (
                <p className="text-sm text-gray-400 mt-1">
                  Detection confidence: {confidence}%
                </p>
              )}
            </div>

            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
                onClick={handleSendToAI}
                disabled={aiLoading}
              >
                {aiLoading ? "Sending..." : "Send to AI"}
              </button>

              <button
                className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition"
                onClick={() =>
                  axios
                    .post("http://127.0.0.1:5002/calibrate")
                    .then(() =>
                      alert("Calibration started — check backend console")
                    )
                    .catch(() =>
                      alert("Calibration failed. See backend console.")
                    )
                }
              >
                Calibrate
              </button>

              <button
                className="px-3 py-2 bg-gray-700 rounded-lg hover:bg-gray-600"
                onClick={handleSpace}
              >
                Space
              </button>
              <button
                className="px-3 py-2 bg-gray-700 rounded-lg hover:bg-gray-600"
                onClick={handleBackspace}
              >
                Backspace
              </button>
              <button
                className="px-3 py-2 bg-red-700 text-white rounded-lg hover:bg-red-800"
                onClick={handleClear}
              >
                Clear
              </button>
            </div>
          </div>
        </section>

        {/* Right: Morse map + Chat */}
        <aside className="w-96 bg-gray-800 rounded-2xl shadow-lg p-5 flex flex-col border border-gray-700">
          <h3 className="text-lg font-semibold text-gray-200 mb-3">
            Morse Reference
          </h3>

          <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
            {Object.entries(MORSE_MAP).map(([letter, code]) => (
              <div
                key={letter}
                className="bg-gray-700 p-2 rounded-md flex justify-between items-center border border-gray-600"
              >
                <span className="font-bold">{letter}</span>
                <span className="font-mono text-blue-300">{code}</span>
              </div>
            ))}
            <div className="bg-gray-700 p-2 rounded-md flex justify-between items-center border border-gray-600 mt-2">
              <span className="font-bold">SPACE</span>
              <span className="font-mono text-blue-300">........</span>
            </div>
            <div className="bg-gray-700 p-2 rounded-md flex justify-between items-center border border-gray-600 mt-2">
              <span className="font-bold">BACKSPACE</span>
              <span className="font-mono text-blue-300">.......</span>
            </div>
          </div>

          <h3 className="text-lg font-semibold text-gray-200 mb-2">Chat</h3>
          <div
            ref={chatContainer}
            className="flex flex-col-reverse gap-2 overflow-y-auto h-[300px] p-2 bg-gray-900 rounded-lg border border-gray-700"
          >
            {chatHistory.length === 0 && (
              <p className="text-sm text-gray-500">No messages yet</p>
            )}
            {chatHistory.map((msg, idx) => (
              <div
                key={idx}
                className={`p-2 rounded-md max-w-[90%] ${
                  msg.sender === "You"
                    ? "self-end bg-blue-700 text-gray-100"
                    : "self-start bg-gray-700 text-gray-100"
                }`}
              >
                <strong className="block text-xs text-gray-400">
                  {msg.sender}
                </strong>
                <div className="text-sm">{msg.text}</div>
              </div>
            ))}
          </div>
        </aside>
      </main>
      <div className="fixed bottom-6 right-6 bg-gray-900/80 backdrop-blur-md text-gray-100 px-5 py-3 rounded-2xl shadow-lg border border-gray-700 flex flex-col items-center w-[160px]">
        <div className="text-center">
          <p className="text-3xl font-extrabold text-blue-400">{blinkCount}</p>
          <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">
            Blinks
          </p>

          <p className="text-3xl font-extrabold text-green-400">{accuracy}</p>
          <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">
            Accuracy
          </p>

          <p className="text-3xl font-extrabold text-indigo-400">{wpm}</p>
          <p className="text-xs uppercase tracking-wide text-gray-400">WPM</p>
        </div>
      </div>
    </div>
  );
};

export default VideoFeed;
