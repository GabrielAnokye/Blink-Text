import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const VideoFeed = () => {
  const [blink, setBlink] = useState(null);
  const videoRef = useRef(null);
  const socket = useRef(null);

  useEffect(() => {
    // Connect to Flask backend
    socket.current = io("http://127.0.0.1:5002");

    socket.current.on("blink_event", (data) => {
      console.log("Blink detected:", data.type);
      setBlink(data.type);
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
      <p className="mt-4 text-lg font-semibold text-gray-700">
        Blink Detected: {blink || "Waiting..."}
      </p>
    </div>
  );
};

export default VideoFeed;
