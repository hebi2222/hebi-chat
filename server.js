// server.js

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingInterval: 25000,
  pingTimeout: 60000,
});

const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0";

// ================== WHITELIST ==================

const whitelistPath = path.join(__dirname, "data", "whitelist.json");
let whitelistCache = null;

function ensureWhitelistFile() {
  if (!fs.existsSync(whitelistPath)) {
    fs.mkdirSync(path.dirname(whitelistPath), { recursive: true });
    fs.writeFileSync(
      whitelistPath,
      JSON.stringify(
        {
          users: {
            hebi: { code: "220924", role: "admin" },
          },
        },
        null,
        2
      )
    );
  }
}

function loadWhitelist() {
  ensureWhitelistFile();
  return JSON.parse(fs.readFileSync(whitelistPath, "utf8"));
}

function getWhitelistCached() {
  if (!whitelistCache) {
    whitelistCache = { data: loadWhitelist(), time: Date.now() };
  }
  return whitelistCache.data;
}

function saveWhitelist(newData) {
  fs.writeFileSync(whitelistPath, JSON.stringify(newData, null, 2));
  whitelistCache = { data: newData, time: Date.now() };
  broadcastPresence();
}

// ================== EXPRESS ROUTES ==================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public/login.html"))
);

app.get("/chat", (req, res) =>
  res.sendFile(path.join(__dirname, "public/chat.html"))
);

// LOGIN
app.post("/login", (req, res) => {
  const { username, code } = req.body;

  const db = getWhitelistCached();
  const user = db.users[username];

  if (!user) {
    return res.json({ success: false, message: "Tên không có trong whitelist!" });
  }
  if (user.code !== code) {
    return res.json({ success: false, message: "Sai mã whitelist!" });
  }

  return res.json({
    success: true,
    username,
    role: user.role || "user",
    code: user.code,
  });
});

// ADMIN: LẤY DANH SÁCH USER
app.post("/admin/users", (req, res) => {
  const { adminName, adminPass } = req.body;
  if (adminName !== "hebi" || adminPass !== "220924") {
    return res.json({ success: false, message: "Sai admin!" });
  }

  const db = getWhitelistCached();
  const users = Object.entries(db.users).map(([username, info]) => ({
    username,
    code: info.code,
    role: info.role || "user",
  }));

  return res.json({ success: true, users });
});

// ADMIN: THÊM USER
app.post("/admin/add", (req, res) => {
  const { adminName, adminPass, newUsername, mode, customCode } = req.body;

  if (adminName !== "hebi" || adminPass !== "220924") {
    return res.json({ success: false, message: "Sai admin!" });
  }

  if (!newUsername || !newUsername.trim()) {
    return res.json({ success: false, message: "Tên user không hợp lệ!" });
  }

  const db = getWhitelistCached();
  if (db.users[newUsername]) {
    return res.json({ success: false, message: "User đã tồn tại!" });
  }

  let code;
  if (mode === "custom") {
    if (!customCode || !/^\d{4,8}$/.test(customCode)) {
      return res.json({
        success: false,
        message: "Mã tự nhập phải là 4–8 chữ số.",
      });
    }
    code = customCode;
  } else {
    code = Math.floor(100000 + Math.random() * 900000).toString();
  }

  db.users[newUsername] = { code, role: "user" };
  saveWhitelist(db);

  return res.json({
    success: true,
    username: newUsername,
    code,
    mode: mode === "custom" ? "custom" : "auto",
  });
});

// ADMIN: XOÁ USER
app.post("/admin/delete", (req, res) => {
  const { adminName, adminPass, targetUsername } = req.body;

  if (adminName !== "hebi" || adminPass !== "220924") {
    return res.json({ success: false, message: "Sai admin!" });
  }

  const db = getWhitelistCached();

  if (!db.users[targetUsername]) {
    return res.json({ success: false, message: "User không tồn tại!" });
  }

  if (targetUsername === "hebi") {
    return res.json({
      success: false,
      message: "Không xoá được tài khoản chủ (hebi).",
    });
  }

  delete db.users[targetUsername];
  saveWhitelist(db);

  return res.json({ success: true });
});

// ================== SOCKET.IO – MULTI ROOM ==================

const ROOM_NAMES = ["p1", "p2", "p3", "dev", "admin"];
const roomMessages = {};
ROOM_NAMES.forEach((r) => {
  roomMessages[r] = [];
});

function getSafeRoom(name, user) {
  const base = ROOM_NAMES.includes(name) ? name : "p1";
  if (base === "admin" && (!user || user.role !== "admin")) {
    return "p1";
  }
  return base;
}

io.on("connection", (socket) => {
  socket.data.user = null;
  socket.data.room = "p1";

  socket.on("auth", ({ username, code }) => {
    const db = getWhitelistCached();
    const user = db.users[username];

    if (!user || user.code !== code) {
      socket.emit("auth-failed", { message: "Auth failed!" });
      return;
    }

    socket.data.user = { username, role: user.role || "user" };

    const room = getSafeRoom("p1", socket.data.user);
    socket.data.room = room;
    socket.join(room);

    socket.emit("auth-ok", socket.data.user);
    socket.emit("chat-history", roomMessages[room]);

    broadcastPresence();
  });

  socket.on("switch-room", ({ room }) => {
    if (!socket.data.user) return;

    const newRoom = getSafeRoom(room, socket.data.user);
    const oldRoom = socket.data.room || "p1";

    if (newRoom === oldRoom) return;

    socket.leave(oldRoom);
    socket.join(newRoom);
    socket.data.room = newRoom;

    socket.emit("chat-history", roomMessages[newRoom]);
  });

  socket.on("chat-message", ({ text }) => {
    if (!socket.data.user) return;

    const trimmed = (text || "").trim();
    if (!trimmed) return;

    const room = getSafeRoom(socket.data.room || "p1", socket.data.user);

    const msg = {
      username: socket.data.user.username,
      role: socket.data.user.role,
      room,
      time: new Date().toLocaleTimeString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
      text: trimmed,
    };

    roomMessages[room].push(msg);
    if (roomMessages[room].length > 200) roomMessages[room].shift();

    io.to(room).emit("chat-message", msg);
  });

  socket.on("disconnect", () => {
    broadcastPresence();
  });
});

// ================== PRESENCE (ONLINE / OFFLINE) ==================

function broadcastPresence() {
  const db = getWhitelistCached();
  const allUsers = db.users;

  const onlineSet = new Set();
  io.sockets.sockets.forEach((s) => {
    if (s.data && s.data.user && s.data.user.username) {
      onlineSet.add(s.data.user.username);
    }
  });

  const online = [];
  const offline = [];

  for (const [username, info] of Object.entries(allUsers)) {
    const entry = {
      username,
      role: info.role || "user",
    };
    if (onlineSet.has(username)) online.push(entry);
    else offline.push(entry);
  }

  io.emit("presence", { online, offline });
}

// ================== START ==================

server.listen(PORT, HOST, () => {
  console.log(`Hebi Chat running at http://localhost:5000`);
});
