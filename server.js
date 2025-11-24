const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

// Coolify set PORT=80 trong env, còn local thì dùng 3000
const PORT = process.env.PORT || 3000;

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// serve static file
app.use(express.static(path.join(__dirname, "public")));

io.on("connection", (socket) => {
  console.log("⚡ User connected:", socket.id);

  socket.on("chat-message", (data) => {
    io.emit("chat-message", {
      id: socket.id,
      username: data.username || "Ẩn danh",
      message: data.message,
      time: new Date().toLocaleTimeString("vi-VN"),
    });
  });

  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Hebi Chat Server running on port ${PORT}`);
});
