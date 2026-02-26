import { useRef, useEffect } from "react";

const VideoFeed = () => {
  const videoRef = useRef(null);

  useEffect(() => {
    const startVideo = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoRef.current.srcObject = stream;
      } catch (err) {
        console.error("Error accessing webcam:", err);
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
      <p className="text-sm mt-2 text-gray-600">Webcam feed active</p>
    </div>
  );
};

export default VideoFeed;
