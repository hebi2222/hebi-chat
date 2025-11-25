// ================== LẤY USER TỪ LOGIN ==================
const saved = localStorage.getItem("hebiUser");
if (!saved) window.location.href = "/";

const user = JSON.parse(saved);
const isAdmin = user.role === "admin";

document.body.classList.add(isAdmin ? "is-admin" : "is-user");
let currentRoom = "p1";

// gán user chip
document.querySelector("#userChip .name").textContent = user.username;
document.querySelector("#userChip .role").textContent = user.role || "user";

// ================== HỒ SƠ CÁ NHÂN ==================
const profileNameEl = document.getElementById("profileName");
const profileRoleEl = document.getElementById("profileRole");
const profileCodeEl = document.getElementById("profileCode");
const profileAvatarEl = document.getElementById("profileAvatar");

if (profileNameEl) profileNameEl.textContent = user.username;
if (profileRoleEl) profileRoleEl.textContent = user.role || "user";
if (profileCodeEl) profileCodeEl.textContent = user.code || "••••••";
if (profileAvatarEl) {
  const firstChar = (user.username || "H").charAt(0).toUpperCase();
  profileAvatarEl.textContent = firstChar;
}

// nếu không phải admin thì ẩn các khối .only-admin
if (!isAdmin) {
  document.querySelectorAll(".only-admin").forEach((el) => {
    el.style.display = "none";
  });
}

// ================== SOCKET.IO ==================
const socket = io();

socket.on("connect", () => {
  socket.emit("auth", {
    username: user.username,
    code: user.code,
  });
});

socket.on("auth-failed", (data) => {
  alert((data && data.message) || "Auth failed, vui lòng login lại.");
  localStorage.removeItem("hebiUser");
  window.location.href = "/";
});

socket.on("auth-ok", () => {
  console.log("Socket auth OK");
});

socket.on("chat-history", (history) => {
  const wrap = document.getElementById("messages");
  wrap.innerHTML = "";
  history.forEach(addMessage);
});

socket.on("chat-message", addMessage);

function addMessage(msg) {
  // chỉ render msg của room hiện tại (phòng khác server vẫn gửi cho đúng room nhưng check cho chắc)
  if (msg.room && msg.room !== currentRoom) return;

  const wrap = document.getElementById("messages");
  const div = document.createElement("div");
  div.className = "msg";
  div.innerHTML = `
    <div class="msg-head">
      <span class="msg-name">${msg.username}</span>
      <span class="msg-role ${msg.role === "admin" ? "msg-role-admin" : ""}">
        ${msg.role || "user"}
      </span>
      <span class="msg-time">${msg.time}</span>
    </div>
    <div class="msg-body">${msg.text}</div>
  `;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function sendMessage() {
  const input = document.getElementById("message");
  const text = input.value.trim();
  if (!text) return;

  socket.emit("chat-message", { text });
  input.value = "";
}

document.getElementById("message").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

// ================== PRESENCE (CỘT PHẢI) ==================

const onlineListEl = document.getElementById("onlineList");
const offlineListEl = document.getElementById("offlineList");
const offlineBlockEl = document.getElementById("offlineBlock");

if (!isAdmin && offlineBlockEl) {
  offlineBlockEl.style.display = "none";
}

socket.on("presence", ({ online, offline }) => {
  // online
  onlineListEl.innerHTML = "";
  online.forEach((u) => {
    const row = document.createElement("div");
    row.className = "presence-row";
    row.innerHTML = `
      <span class="presence-dot online"></span>
      <span class="presence-name">${u.username}</span>
      <span class="presence-role ${u.role === "admin" ? "presence-role-admin" : ""}">
        ${u.role}
      </span>
    `;
    onlineListEl.appendChild(row);
  });

  // offline (chỉ admin xài)
  if (isAdmin) {
    offlineListEl.innerHTML = "";
    offline.forEach((u) => {
      const row = document.createElement("div");
      row.className = "presence-row";
      row.innerHTML = `
        <span class="presence-dot offline"></span>
        <span class="presence-name">${u.username}</span>
        <span class="presence-role ${u.role === "admin" ? "presence-role-admin" : ""}">
          ${u.role}
        </span>
      `;
      offlineListEl.appendChild(row);
    });
  }
});

// ================== ADMIN DASHBOARD (member list + add user) ==================

const adminSidebar = document.getElementById("adminSidebar");
const memberListEl = document.getElementById("memberList");

if (isAdmin && memberListEl) {
  loadMembers();
}

async function loadMembers() {
  try {
    const res = await fetch("/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adminName: user.username,
        adminPass: "220924",
      }),
    });

    const data = await res.json();
    if (!data.success) {
      memberListEl.innerHTML = "<div class='member-empty'>Không load được danh sách.</div>";
      return;
    }

    memberListEl.innerHTML = "";
    data.users.forEach((u) => {
      const row = document.createElement("div");
      row.className = "member-row";
      row.innerHTML = `
        <div class="member-main">
          <div class="member-main-left">
            <span class="member-name">${u.username}</span>
            <span class="member-role ${u.role === "admin" ? "member-role-admin" : ""}">
              ${u.role}
            </span>
          </div>
          <button class="member-delete-btn" data-username="${u.username}">✕</button>
        </div>
        <div class="member-code">Mã: <code>${u.code}</code></div>
      `;
      memberListEl.appendChild(row);
    });

    memberListEl.querySelectorAll(".member-delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetUsername = btn.dataset.username;
        deleteUser(targetUsername);
      });
    });
  } catch (err) {
    console.error(err);
    memberListEl.innerHTML = "<div class='member-empty'>Lỗi server.</div>";
  }
}

async function deleteUser(targetUsername) {
  if (targetUsername === "hebi") {
    alert("Không xoá được tài khoản chủ (hebi).");
    return;
  }
  if (!confirm(`Xóa user "${targetUsername}" khỏi whitelist?`)) return;

  try {
    const res = await fetch("/admin/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adminName: user.username,
        adminPass: "220924",
        targetUsername,
      }),
    });

    const data = await res.json();
    if (!data.success) {
      alert("❌ " + (data.message || "Xoá user thất bại."));
      return;
    }

    loadMembers();
  } catch (err) {
    console.error(err);
    alert("❌ Lỗi server khi xoá user.");
  }
}

// toggle random/custom pass
const modeRadios = document.querySelectorAll('input[name="passMode"]');
const customCodeRow = document.getElementById("customCodeRow");

modeRadios.forEach((radio) => {
  radio.addEventListener("change", () => {
    if (radio.value === "custom" && radio.checked) {
      customCodeRow.style.display = "block";
    } else if (radio.value === "auto" && radio.checked) {
      customCodeRow.style.display = "none";
    }
  });
});

const createBtn = document.getElementById("adminCreateBtn");
const resultBox = document.getElementById("adminResult");

if (createBtn) {
  createBtn.addEventListener("click", async () => {
    const newUsername = document.getElementById("adminNewUsername").value.trim();
    const mode = document.querySelector('input[name="passMode"]:checked').value;
    const customCodeInput = document.getElementById("adminCustomCode");
    const customCode = customCodeInput ? customCodeInput.value.trim() : "";

    if (!newUsername) {
      resultBox.textContent = "❌ Nhập tên thành viên đã.";
      resultBox.className = "admin-result error";
      return;
    }

    if (mode === "custom" && !customCode) {
      resultBox.textContent = "❌ Đang chọn tự nhập mã mà chưa điền.";
      resultBox.className = "admin-result error";
      return;
    }

    try {
      const res = await fetch("/admin/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminName: user.username,
          adminPass: "220924",
          newUsername,
          mode,
          customCode,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        resultBox.textContent = "❌ " + (data.message || "Tạo user thất bại.");
        resultBox.className = "admin-result error";
        return;
      }

      resultBox.innerHTML = `
        ✅ Đã tạo user <b>${data.username}</b><br>
        Mã: <code>${data.code}</code> (${data.mode === "custom" ? "tự đặt" : "random"})
      `;
      resultBox.className = "admin-result ok";

      document.getElementById("adminNewUsername").value = "";
      if (customCodeInput) customCodeInput.value = "";

      loadMembers();
    } catch (err) {
      console.error(err);
      resultBox.textContent = "❌ Lỗi server khi tạo user.";
      resultBox.className = "admin-result error";
    }
  });
}

// ================== ROOM TABS ==================
const roomTabs = document.querySelectorAll(".room-tab");

roomTabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    const room = btn.dataset.room;
    if (!room || room === currentRoom) return;

    currentRoom = room;

    roomTabs.forEach((b) => b.classList.toggle("active", b === btn));

    const msgWrap = document.getElementById("messages");
    msgWrap.innerHTML = "";

    socket.emit("switch-room", { room });
  });
});

// Ẩn tab phòng Admin nếu không phải admin (phòng backend đã chặn thêm)
if (!isAdmin) {
  document.querySelectorAll(".room-tab-admin").forEach((el) => {
    el.style.display = "none";
  });
}

// ================== TOGGLER SIDEBAR (MODE 3 auto-hide) ==================

const openAdminBtn = document.getElementById("openAdminBtn");
const openPresenceBtn = document.getElementById("openPresenceBtn");
const presenceSidebar = document.getElementById("presenceSidebar");

if (!isAdmin && openAdminBtn) {
  // user thường vẫn xem được hồ sơ – nên vẫn cho mở sidebar trái
  // nếu muốn chỉ admin mở thì uncomment:
  // openAdminBtn.style.display = "none";
}

if (openAdminBtn) {
  openAdminBtn.addEventListener("click", () => {
    const body = document.body;
    const isOpen = body.classList.contains("show-admin");
    body.classList.toggle("show-admin", !isOpen);
    if (!isOpen) body.classList.remove("show-presence");
  });
}

if (openPresenceBtn) {
  openPresenceBtn.addEventListener("click", () => {
    const body = document.body;
    const isOpen = body.classList.contains("show-presence");
    body.classList.toggle("show-presence", !isOpen);
    if (!isOpen) body.classList.remove("show-admin");
  });
}

// click ngoài sidebar để đóng (màn nhỏ)
document.addEventListener("click", (e) => {
  const w = window.innerWidth || document.documentElement.clientWidth;
  if (w >= 1400) return; // màn to: luôn hiển thị 3 cột

  const adminEl = adminSidebar;
  const presenceEl = presenceSidebar;

  const clickedInsideAdmin = adminEl && adminEl.contains(e.target);
  const clickedInsidePresence = presenceEl && presenceEl.contains(e.target);
  const clickedToggle =
    (openAdminBtn && openAdminBtn.contains(e.target)) ||
    (openPresenceBtn && openPresenceBtn.contains(e.target));

  if (!clickedInsideAdmin && !clickedInsidePresence && !clickedToggle) {
    document.body.classList.remove("show-admin", "show-presence");
  }
});
