import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import axios from "axios";

const API_BASE_URL = (
  process.env.REACT_APP_BACKEND_URL || "http://127.0.0.1:5002"
).replace(/\/+$/, "");

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
  const [chatHistory, setChatHistory] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [blinkCount, setBlinkCount] = useState(0);
  const [accuracy] = useState(100);
  const [wpm, setWpm] = useState(0);
  const [startTime, setStartTime] = useState(null);

  const videoRef = useRef(null);
  const socket = useRef(null);
  const chatContainer = useRef(null);
  const streamingInterval = useRef(null);
  const decodedTextRef = useRef("");
  const aiLoadingRef = useRef(false);
  const startTimeRef = useRef(null);

  useEffect(() => {
    decodedTextRef.current = decodedText;
  }, [decodedText]);

  useEffect(() => {
    aiLoadingRef.current = aiLoading;
  }, [aiLoading]);

  useEffect(() => {
    startTimeRef.current = startTime;
  }, [startTime]);

  const sendToAI = async (rawMessage) => {
    const messageToSend = (rawMessage || "").trim();
    if (!messageToSend || aiLoadingRef.current) return;

    setAiLoading(true);
    setChatHistory((prev) => [{ sender: "You", text: messageToSend }, ...prev]);
    setDecodedText("");

    try {
      const res = await axios.post(
        `${API_BASE_URL}/ask_ai`,
        { message: messageToSend },
        { timeout: 30000 },
      );
      const replyText =
        res.data && res.data.reply ? res.data.reply : "No reply from AI.";
      setChatHistory((prev) => [
        { sender: "BlinkAI", text: replyText },
        ...prev,
      ]);
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

  // Socket connection setup
  useEffect(() => {
    socket.current = io(API_BASE_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      timeout: 20000,
    });

    socket.current.on("connect", () => {
      console.log("✅ Connected to backend socket");
    });

    socket.current.on("connect_error", (err) => {
      console.error("❌ Socket connection error:", err?.message || err);
    });

    socket.current.on("blink_event", (data) => {
      setBlink(data.type);
      setSequence(data.sequence || "");
      setBlinkCount((prev) => prev + 1);
      if (!startTimeRef.current) setStartTime(Date.now());
    });

    socket.current.on("letter_event", (data) => {
      if (data.letter === "BACKSPACE") {
        setDecodedText((prev) => prev.slice(0, -1));
      } else if (data.letter === "SPACE") {
        setDecodedText((prev) => prev + " ");
      } else {
        setDecodedText((prev) => prev + (data.letter || ""));
      }
    });

    socket.current.on("send_message", (data) => {
      const autoMessage = (data && data.text) || decodedTextRef.current;
      if (autoMessage && !aiLoadingRef.current) {
        console.log("⚡ Auto-send triggered:", autoMessage);
        sendToAI(autoMessage);
      }
    });

    socket.current.on("ai_reply", (data) => {
      if (data && data.reply) {
        setChatHistory((prev) => [
          { sender: "BlinkAI", text: data.reply },
          ...prev,
        ]);
      }
    });

    return () => {
      socket.current.disconnect();
    };
  }, []);

  // Compute Words Per Minute
  useEffect(() => {
    if (!startTime || decodedText.length === 0) return;
    const elapsedMinutes = (Date.now() - startTime) / 60000;
    const words = decodedText.trim().split(/\s+/).length;
    const wpmCalc = Math.max(0, (words / elapsedMinutes).toFixed(1));
    setWpm(wpmCalc);
  }, [decodedText, startTime]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatContainer.current) {
      chatContainer.current.scrollTop = 0;
    }
  }, [chatHistory]);

  // Webcam initialization & Frame Streaming
  useEffect(() => {
    const startVideo = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        if (videoRef.current) videoRef.current.srcObject = stream;

        // Setup canvas for capturing frames
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        // Send frames to backend at ~10 FPS for better blink-duration resolution.
        streamingInterval.current = setInterval(() => {
          if (videoRef.current && socket.current && socket.current.connected) {
            canvas.width = videoRef.current.videoWidth || 640;
            canvas.height = videoRef.current.videoHeight || 480;

            if (canvas.width > 0 && canvas.height > 0) {
              context.drawImage(
                videoRef.current,
                0,
                0,
                canvas.width,
                canvas.height,
              );
              // Keep payload size moderate while improving temporal accuracy.
              const imageData = canvas.toDataURL("image/jpeg", 0.45);
              socket.current.emit("video_frame", { image: imageData });
            }
          }
        }, 100);
      } catch (err) {
        console.error("Webcam access error:", err);
        alert("Unable to access webcam. Please allow camera permissions.");
      }
    };
    startVideo();

    return () => {
      if (streamingInterval.current) clearInterval(streamingInterval.current);
    };
  }, []);

  // --- AI SEND HANDLER ---
  const handleSendToAI = async (messageOverride = null) => {
    const messageToSend = messageOverride || decodedTextRef.current;
    await sendToAI(messageToSend);
  };

  const handleSpace = () => setDecodedText((prev) => prev + " ");
  const handleBackspace = () => setDecodedText((prev) => prev.slice(0, -1));
  const handleClear = () => setDecodedText("");

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-gray-900 via-slate-900 to-gray-800 text-gray-100 p-6 flex flex-col items-center">
      <header className="w-full max-w-6xl mb-6">
        <h1 className="text-4xl font-extrabold text-center text-indigo-400">
          Bl<span className="blinking text-blue-300">i</span>nkA
          <span className="blinking text-blue-300">I</span>
        </h1>
      </header>

      <main className="w-full flex justify-between gap-6">
        {/* LEFT: Morse Reference */}
        <aside className="w-1/4 bg-gray-800 rounded-2xl shadow-lg p-5 border border-gray-700 overflow-y-auto">
          <h3 className="text-xl font-bold text-gray-200 mb-4 text-center">
            Morse Reference
          </h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
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
              <span className="font-mono text-blue-300">.(8x)</span>
            </div>
            <div className="bg-gray-700 p-2 rounded-md flex justify-between items-center border border-gray-600 mt-2">
              <span className="font-bold">BACKSPACE</span>
              <span className="font-mono text-blue-300">.(7x)</span>
            </div>
          </div>
        </aside>

        {/* CENTER: Camera Feed */}
        <section className="flex-1 relative bg-gray-800 rounded-2xl shadow-lg p-5 flex flex-col items-center border border-gray-700">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-[420px] object-cover rounded-lg border-2 border-blue-500 shadow-md transform -scale-x-100"
          />
          {aiLoading && (
            <div className="absolute inset-0 bg-gray-900/70 flex items-center justify-center rounded-lg">
              <p className="text-xl text-blue-300 animate-pulse font-semibold">
                Sending to AI...
              </p>
            </div>
          )}

          <div className="w-full mt-4 text-center">
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
          </div>

          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
              onClick={() => handleSendToAI()}
              disabled={aiLoading}
            >
              {aiLoading ? "Sending..." : "Send to AI"}
            </button>
            <button
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition"
              onClick={() =>
                axios
                  .post(`${API_BASE_URL}/calibrate`)
                  .then(() => alert("Calibration finished successfully (4 seconds)."))
                  .catch(() =>
                    alert("Calibration failed. See backend console."),
                  )
              }
            >
              Calibrate (4s)
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
        </section>

        {/* RIGHT: Chat */}
        <aside className="w-1/4 bg-gray-800 rounded-2xl shadow-lg p-5 flex flex-col border border-gray-700">
          <h3 className="text-xl font-bold text-gray-200 mb-3 text-center">
            Chat
          </h3>
          <div
            ref={chatContainer}
            className="flex flex-col-reverse gap-2 overflow-y-auto h-[400px] p-3 bg-gray-900 rounded-lg border border-gray-700"
          >
            {chatHistory.length === 0 && (
              <p className="text-sm text-gray-500 text-center">
                No messages yet
              </p>
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

      {/* Floating Stats */}
      <div className="fixed bottom-6 right-6 bg-gray-900/80 backdrop-blur-md text-gray-100 px-5 py-3 rounded-2xl shadow-lg border border-gray-700 flex flex-col items-center w-[160px]">
        <div className="text-center">
          <p className="text-3xl font-extrabold text-blue-400">{blinkCount}</p>
          <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">
            Blinks
          </p>
          <p className="text-3xl font-extrabold text-green-400">{accuracy}%</p>
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
