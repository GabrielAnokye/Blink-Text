import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const VideoFeed = () => {
  const [blink, setBlink] = useState(null);
  const [sequence, setSequence] = useState("");
  const [decodedText, setDecodedText] = useState("");
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

  return (
    <div className="flex flex-col items-center">
      <video
        ref={videoRef}
        autoPlay
        className="rounded-xl shadow-lg w-1/2 border-4 border-blue-500"
      />
      <div className="mt-4 text-center">
        <p className="text-lg font-semibold text-gray-700">
          Blink: {blink || "Waiting..."}
        </p>
        <p className="text-md text-gray-600">
          Current Sequence: {sequence || "None"}
        </p>
        <h2 className="mt-3 text-xl font-bold text-green-700">
          Decoded Text: {decodedText || ""}
        </h2>
      </div>
    </div>
  );
};

export default VideoFeed;
