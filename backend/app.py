from flask import Flask, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

@app.route("/")
def home():
    return jsonify({"message": "BlinkAI backend is running!"})

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5002, debug=True)
