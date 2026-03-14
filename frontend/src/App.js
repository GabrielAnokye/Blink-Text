import VideoFeed from "./components/VideoFeed";

function App() {

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      {/* <h1 className="text-4xl font-bold text-blue-600 mb-4">BlinkAI Setup</h1> */}
      <VideoFeed />
      {/* <p className="text-lg text-gray-700">
        Backend Message: {backendMessage || "Connecting..."}
      </p> */}.                   
    </div>
  );
}

export default App;
