const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);

// Coolify sẽ set PORT=5000, local có thể dùng 3000
const PORT = process.env.PORT || 3000;

// ---- LƯU HISTORY VÀO FILE JSON ----
const DATA_DIR = path.join(__dirname, "data");
const HISTORY_FILE = path.join(DATA_DIR, "messages.json");

// roomsHistory: { [roomName]: [ {username, message, time, room} ] }
let roomsHistory = {};

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const raw = fs.readFileSync(HISTORY_FILE, "utf-8");
      roomsHistory = JSON.parse(raw);
      console.log("📚 Loaded chat history from file.");
    }
  } catch (err) {
    console.error("❌ Failed to load history:", err.message);
    roomsHistory = {};
  }
}

function saveHistory() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFile(
      HISTORY_FILE,
      JSON.stringify(roomsHistory, null, 2),
      (err) => {
        if (err) console.error("❌ Failed to save history:", err.message);
      }
    );
  } catch (err) {
    console.error("❌ Error while saving history:", err.message);
  }
}

loadHistory();

// ---- EXPRESS STATIC ----
app.use(express.static(path.join(__dirname, "public")));

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

io.on("connection", (socket) => {
  console.log("⚡ User connected:", socket.id);

  // default room
  let currentRoom = "general";

  function joinRoom(roomName) {
    const room = (roomName || "general").trim() || "general";

    // rời room cũ
    socket.leave(currentRoom);
    currentRoom = room;

    console.log(`📦 Socket ${socket.id} joined room: ${currentRoom}`);
    socket.join(currentRoom);

    // gửi lịch sử room hiện tại cho thằng mới vào
    const history = roomsHistory[currentRoom] || [];
    socket.emit("chat-history", history);
  }

  // join room mặc định khi vừa connect
  joinRoom(currentRoom);

  // client đổi room
  socket.on("change-room", (roomName) => {
    joinRoom(roomName);
  });

  // nhận message
  socket.on("chat-message", (data) => {
    const username = (data.username || "Ẩn danh").trim() || "Ẩn danh";
    const message = (data.message || "").trim();

    if (!message) return;

    const payload = {
      id: socket.id,
      username,
      message,
      room: currentRoom,
      time: new Date().toLocaleTimeString("vi-VN"),
    };

    // lưu vào history theo room
    if (!roomsHistory[currentRoom]) {
      roomsHistory[currentRoom] = [];
    }
    roomsHistory[currentRoom].push(payload);

    // giữ tối đa 100 tin / room
    if (roomsHistory[currentRoom].length > 100) {
      roomsHistory[currentRoom].shift();
    }

    saveHistory();

    // chỉ broadcast trong room hiện tại
    io.to(currentRoom).emit("chat-message", payload);
  });

  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Hebi Chat Server running on port ${PORT}`);
});
