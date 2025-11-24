const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";

const whitelistPath = path.join(__dirname, "data", "whitelist.json");

// Đảm bảo file whitelist tồn tại
function ensureWhitelistFile() {
  if (!fs.existsSync(whitelistPath)) {
    const initial = {
      users: {
        hebi: {
          code: "220924",
          role: "admin"
        }
      }
    };
    fs.mkdirSync(path.dirname(whitelistPath), { recursive: true });
    fs.writeFileSync(whitelistPath, JSON.stringify(initial, null, 2));
  }
}

// Load / Save whitelist
function loadWhitelist() {
  ensureWhitelistFile();
  return JSON.parse(fs.readFileSync(whitelistPath, "utf8"));
}

function saveWhitelist(data) {
  fs.writeFileSync(whitelistPath, JSON.stringify(data, null, 2));
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Routes: luôn đi qua login trước
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/chat", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// -------------------- API LOGIN --------------------
app.post("/login", (req, res) => {
  const { username, code } = req.body;

  if (!username || !code) {
    return res.json({ success: false, message: "Thiếu tên hoặc mã!" });
  }

  const db = loadWhitelist();
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
    role: user.role || "user"
  });
});

// -------------------- API ADMIN: TẠO USER --------------------
app.post("/admin/add-user", (req, res) => {
  const { adminName, adminPass, newUsername } = req.body;

  if (adminName !== "hebi" || adminPass !== "220924") {
    return res.json({ success: false, message: "Sai admin name hoặc password!" });
  }

  if (!newUsername || !newUsername.trim()) {
    return res.json({ success: false, message: "Tên user không hợp lệ!" });
  }

  const db = loadWhitelist();

  if (db.users[newUsername]) {
    return res.json({ success: false, message: "User này đã tồn tại!" });
  }

  // random mã 6 số
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  db.users[newUsername] = {
    code,
    role: "user"
  };

  saveWhitelist(db);

  return res.json({
    success: true,
    username: newUsername,
    code
  });
});

// -------------------- SOCKET IO CHAT --------------------

// Memory history đơn giản (chung 1 phòng)
const messages = []; // có thể lưu file sau nếu thích

io.on("connection", (socket) => {
  console.log("Client connected", socket.id);

  socket.data.user = null;

  // Bước 1: client gửi auth sau khi connect
  socket.on("auth", ({ username, code }) => {
    const db = loadWhitelist();
    const user = db.users[username];

    if (!user || user.code !== code) {
      socket.emit("auth-failed", { message: "Auth failed, vui lòng login lại." });
      return;
    }

    socket.data.user = {
      username,
      role: user.role || "user"
    };

    socket.emit("auth-ok", {
      username,
      role: socket.data.user.role
    });

    // gửi history khi join
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
        minute: "2-digit"
      }),
      text: trimmed
    };

    messages.push(msg);
    if (messages.length > 200) messages.shift(); // giữ lịch sử 200 msg

    io.emit("chat-message", msg);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected", socket.id);
  });
});

// Start
http.listen(PORT, HOST, () => {
  console.log(`Hebi Chat server running at http://${HOST}:${PORT}`);
});
