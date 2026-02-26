import { useEffect, useState } from "react";
import axios from "axios";
import VideoFeed from "./components/VideoFeed";

function App() {
  const [backendMessage, setBackendMessage] = useState("");

  useEffect(() => {
    axios.get("http://127.0.0.1:5002/")
      .then((res) => setBackendMessage(res.data.message))
      .catch((err) => console.error(err));
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <h1 className="text-4xl font-bold text-blue-600 mb-4">BlinkAI Setup</h1>
      <VideoFeed />
      <p className="text-lg text-gray-700">
        Backend Message: {backendMessage || "Connecting..."}
      </p>
    </div>
  );
}

export default App;
