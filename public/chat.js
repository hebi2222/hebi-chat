const socket = io();

const msgBox = document.getElementById("messages");
const input = document.getElementById("message");
const userChip = document.getElementById("userChip");

// Lấy session từ localStorage
const username = localStorage.getItem("hebi_chat_username");
const code = localStorage.getItem("hebi_chat_code");
const role = localStorage.getItem("hebi_chat_role") || "user";

// Nếu chưa login -> đá về login
if (!username || !code) {
    window.location.href = "/";
}

// Hiển thị tên + role (không cho sửa)
userChip.querySelector(".name").innerText = username;
userChip.querySelector(".role").innerText = role === "admin" ? "admin" : "user";

// Helper escape HTML
function escapeHtml(str) {
    return (str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// Render 1 message
function addMessage(msg) {
    const div = document.createElement("div");
    div.className = "msg";
    div.innerHTML = `
    <div class="msg-header">
      <span class="msg-user">${escapeHtml(msg.username)}</span>
      ${msg.role === "admin"
            ? '<span class="msg-role">admin</span>'
            : ""
        }
      <span class="msg-time">${escapeHtml(msg.time || "")}</span>
    </div>
    <div class="msg-text">${escapeHtml(msg.text)}</div>
  `;
    msgBox.appendChild(div);
    msgBox.scrollTop = msgBox.scrollHeight;
}

// Socket events
socket.on("connect", () => {
    // Gửi auth ngay khi connect
    socket.emit("auth", { username, code });
});

socket.on("auth-ok", (data) => {
    console.log("Auth OK", data);
});

socket.on("auth-failed", (data) => {
    alert(data.message || "Auth failed, vui lòng login lại.");
    localStorage.removeItem("hebi_chat_username");
    localStorage.removeItem("hebi_chat_code");
    localStorage.removeItem("hebi_chat_role");
    window.location.href = "/";
});

socket.on("chat-history", (history) => {
    msgBox.innerHTML = "";
    (history || []).forEach(addMessage);
});

socket.on("chat-message", (msg) => {
    addMessage(msg);
});

// Gửi tin nhắn
function sendMessage() {
    const text = input.value.trim();
    if (!text) return;
    socket.emit("chat-message", { text });
    input.value = "";
    input.focus();
}

input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        sendMessage();
    }
});
