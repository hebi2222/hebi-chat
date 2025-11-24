// server.js

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);

// Socket.IO config: chống rớt khi đi Cloudflare
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  pingInterval: 25000, // 25s gửi heartbeat
  pingTimeout: 60000,  // 60s mới timeout → đỡ disconnect
  transports: ["websocket", "polling"],
});

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";

const whitelistPath = path.join(__dirname, "data", "whitelist.json");

// ================= WHITELIST CACHE 6 TIẾNG =================

let whitelistCache = null; // { data, loadedAt }

function ensureWhitelistFile() {
  if (!fs.existsSync(whitelistPath)) {
    const initial = {
      users: {
        hebi: {
          code: "220924", // admin mặc định
          role: "admin",
        },
      },
    };
    fs.mkdirSync(path.dirname(whitelistPath), { recursive: true });
    fs.writeFileSync(whitelistPath, JSON.stringify(initial, null, 2));
  }
}

function loadWhitelistRaw() {
  ensureWhitelistFile();
  return JSON.parse(fs.readFileSync(whitelistPath, "utf8"));
}

// Load whitelist nhưng có cache 6h
function getWhitelistCached() {
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  const now = Date.now();

  if (!whitelistCache || now - whitelistCache.loadedAt > SIX_HOURS) {
    const data = loadWhitelistRaw();
    whitelistCache = {
      data,
      loadedAt: now,
    };
    console.log("[WHITELIST] Reload từ file (hết cache hoặc lần đầu).");
  }

  return whitelistCache.data;
}

// Save + update cache luôn
function saveWhitelist(newData) {
  fs.writeFileSync(whitelistPath, JSON.stringify(newData, null, 2));
  whitelistCache = {
    data: newData,
    loadedAt: Date.now(),
  };
  console.log("[WHITELIST] Đã lưu file & update cache.");
}

// ================= MIDDLEWARE & ROUTES =================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// 👉 Trang root: cho Hebi tự thiết kế landing (chọn Admin/User)
// Tạm thời trỏ về login luôn, sau này Hebi làm file home.html thì đổi route này
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/chat", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// ================= API LOGIN =================

app.post("/login", (req, res) => {
  const { username, code } = req.body;

  if (!username || !code) {
    return res.json({ success: false, message: "Thiếu tên hoặc mã!" });
  }

  const db = getWhitelistCached();
  const user = db.users[username];

  if (!user) {
    return res.json({ success: false, message: "Tên này chưa được whitelist!" });
  }

  if (user.code !== code) {
    return res.json({ success: false, message: "Sai mã whitelist!" });
  }

  return res.json({
    success: true,
    username,
    role: user.role || "user",
  });
});

// ================= API ADMIN: TẠO USER MỚI =================

app.post("/admin/add-user", (req, res) => {
  const { adminName, adminPass, newUsername } = req.body;

  // Admin cố định: hebi / 220924
  if (adminName !== "hebi" || adminPass !== "220924") {
    return res.json({ success: false, message: "Sai admin name hoặc password!" });
  }

  if (!newUsername || !newUsername.trim()) {
    return res.json({ success: false, message: "Tên user không hợp lệ!" });
  }

  const db = getWhitelistCached();

  if (db.users[newUsername]) {
    return res.json({ success: false, message: "User này đã tồn tại!" });
  }

  // random mã 6 số
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  db.users[newUsername] = {
    code,
    role: "user",
  };

  saveWhitelist(db);

  return res.json({
    success: true,
    username: newUsername,
    code,
  });
});

// ================= SOCKET.IO CHAT =================

// Memory history đơn giản (chung 1 phòng)
const messages = []; // sau này muốn thì lưu file tiếp

io.on("connection", (socket) => {
  console.log("Client connected", socket.id);

  socket.data.user = null;

  // Client sẽ emit "auth" 1 lần sau khi connect
  socket.on("auth", ({ username, code }) => {
    const db = getWhitelistCached();
    const user = db.users[username];

    if (!user || user.code !== code) {
      socket.emit("auth-failed", { message: "Auth failed, vui lòng login lại." });
      return;
    }

    socket.data.user = {
      username,
      role: user.role || "user",
    };

    socket.emit("auth-ok", {
      username,
      role: socket.data.user.role,
    });

    // Gửi history cho user vừa join
    socket.emit("chat-history", messages);
  });

  // Nhận tin nhắn chat
  socket.on("chat-message", ({ text }) => {
    if (!socket.data.user) return; // chưa auth thì bỏ

    const trimmed = (text || "").trim();
    if (!trimmed) return;

    const msg = {
      username: socket.data.user.username,
      role: socket.data.user.role,
      time: new Date().toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      text: trimmed,
    };

    messages.push(msg);
    if (messages.length > 200) messages.shift(); // giữ lịch sử 200 msg

    io.emit("chat-message", msg);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected", socket.id);
  });
});

// ================= START SERVER =================

server.listen(PORT, HOST, () => {
  console.log(`Hebi Chat server running at http://${HOST}:${PORT}`);
});
