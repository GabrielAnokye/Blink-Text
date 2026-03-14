import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import axios from "axios";

const VideoFeed = () => {
  const [blink, setBlink] = useState(null);
  const [sequence, setSequence] = useState("");
  const [decodedText, setDecodedText] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const videoRef = useRef(null);
  const socket = useRef(null);

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

    socket.current.on("ai_reply", (data) => {
      setAiResponse(data.reply);
    });

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
    try {
      const response = await axios.post("http://127.0.0.1:5002/ask_ai", {
        message: decodedText,
      });
      setAiResponse(response.data.reply);
      setDecodedText(""); // clear message after sending
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  return (
    <div className="flex flex-col items-center p-8 bg-gray-100 min-h-screen">
      <h1 className="text-3xl font-bold mb-4 text-blue-600">BlinkAI Chat</h1>
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
          onClick={handleSendToAI}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Send to AI
        </button>
      </div>

      {aiResponse && (
        <div className="mt-6 bg-white p-4 rounded-xl shadow-md w-3/4">
          <h3 className="font-semibold text-gray-700">AI Response:</h3>
          <p className="text-gray-800 mt-2">{aiResponse}</p>
        </div>
      )}
    </div>
  );
};

export default VideoFeed;
