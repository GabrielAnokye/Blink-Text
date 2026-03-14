import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import axios from "axios";

const VideoFeed = () => {
  const [blink, setBlink] = useState(null);
  const [sequence, setSequence] = useState("");
  const [decodedText, setDecodedText] = useState("");
  // const [aiResponse, setAiResponse] = useState("");
  const videoRef = useRef(null);
  const socket = useRef(null);
  const [chatHistory, setChatHistory] = useState([]);

  useEffect(() => {
    socket.current = io("http://127.0.0.1:5002");

    socket.current.on("blink_event", (data) => {
      setBlink(data.type);
      setSequence(data.sequence);
    });

    socket.current.on("letter_event", (data) => {
      setDecodedText((prev) => prev + data.letter);
      setSequence("");
    });


    // socket.current.on("ai_reply", (data) => {
    //   setAiResponse(data.reply);
    // });

    return () => {
      socket.current.disconnect();
    };
  }, []);
  

  useEffect(() => {
    const startVideo = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoRef.current.srcObject = stream;
      } catch (err) {
        console.error("Webcam access error:", err);
      }
    };
    startVideo();
  }, []);

  const handleSendToAI = async () => {
  if (!decodedText.trim()) return;
  const userMsg = decodedText;
  setChatHistory([...chatHistory, { sender: "user", text: userMsg }]);
  try {
    const response = await axios.post("http://127.0.0.1:5002/ask_ai", {
      message: userMsg,
    });
    setChatHistory((prev) => [
      ...prev,
      { sender: "BlinkAI", text: response.data.reply },
    ]);
    setDecodedText("");
  } catch (error) {
    console.error("Error sending message:", error);
  }
};

  return (
    <div className="flex flex-col items-center p-8 bg-gray-100 min-h-screen">
      <h1 className="text-4xl font-extrabold mb-6 text-blue-700 text-center">
  BlinkAI — Hands-Free Communication
</h1>

<div className="p-4 text-lg font-semibold text-gray-700">
  <span className="text-green-700">Detected Blink:</span> {blink || "Waiting..."}
</div>

<button
  onClick={handleSendToAI}
  className="mt-4 px-6 py-3 bg-blue-700 text-white text-xl rounded-lg hover:bg-blue-800 transition-all duration-300"
>
  Send to AI
</button>
      <video
        ref={videoRef}
        autoPlay
        className="rounded-xl shadow-lg w-1/2 border-4 border-blue-500"
      />
      <div className="mt-4 text-center bg-white p-4 rounded-xl shadow-md w-3/4">
        <p className="text-lg text-gray-700 font-semibold">
          Blink: {blink || "Waiting..."}
        </p>
        <p className="text-gray-600">Current Sequence: {sequence || "None"}</p>
        <h2 className="text-lg font-bold text-green-700 mt-2">
          Message: {decodedText || "Building..."}
        </h2>

        <button
  onClick={() => axios.post("http://127.0.0.1:5002/calibrate")}
  className="mt-4 px-6 py-3 bg-green-600 text-white text-xl rounded-lg hover:bg-green-700"
>
  Calibrate Blink
</button>

        <button
          onClick={handleSendToAI}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Send to AI
        </button>
      </div>

      {chatHistory.length > 0 && (
  <div className="mt-6 bg-white p-4 rounded-xl shadow-md w-3/4 max-h-80 overflow-y-auto">
    {chatHistory.map((msg, idx) => (
      <div
        key={idx}
        className={`my-2 p-2 rounded-lg ${
          msg.sender === "user" ? "bg-blue-100 text-blue-800 self-end" : "bg-gray-100 text-gray-800 self-start"
        }`}
      >
        <strong>{msg.sender === "user" ? "You:" : "BlinkAI:"}</strong> {msg.text}
      </div>
    ))}
  </div>
)}
    </div>
  );
};

export default VideoFeed;
