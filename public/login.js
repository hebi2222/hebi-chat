function login() {
  const username = document.getElementById("username").value.trim();
  const code = document.getElementById("code").value.trim();

  if (!username || !code) {
    alert("Nhập đầy đủ tên + mã nha.");
    return;
  }

  fetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, code }),
  })
    .then(r => r.json())
    .then(data => {
      if (!data.success) {
        alert(data.msg || "Sai thông tin!");
        return;
      }

      localStorage.setItem("hebiUser", JSON.stringify({
        username: data.username,
        code,
        role: data.role,
      }));

      window.location.href = "/chat";
    })
    .catch(err => {
      console.error(err);
      alert("Lỗi server rồi Hebi ơi.");
    });
}
