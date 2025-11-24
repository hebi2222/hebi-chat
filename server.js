const express = require("express");
const app = express();
const Pusher = require("pusher-js/node");

app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

// Không cần backend emit — client emit trực tiếp lên Soketi qua Pusher.

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
