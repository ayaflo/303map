const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

// user online đang lưu trong RAM
const users = new Map();

app.use(express.static(path.join(__dirname, "public")));

function sanitizeName(name) {
  if (!name || typeof name !== "string") return "Anonymous";
  return name.trim().replace(/\s+/g, " ").slice(0, 30) || "Anonymous";
}

function sanitizeColor(color) {
  if (typeof color !== "string") return "#2f80ed";
  const trimmed = color.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : "#2f80ed";
}

// function sanitizeAvatar(avatar) {
//   if (typeof avatar !== "string") return null;
//   // chỉ cho phép data url image để demo localStorage cho đơn giản
//   if (avatar.startsWith("data:image/")) {
//     // giới hạn cho đỡ phình payload
//     return avatar.slice(0, 300000);
//   }
//   return null;
// }
function sanitizeAvatar(avatar) {
  if (typeof avatar !== "string") return null;
  if (!avatar.startsWith("data:image/")) return null;

  if (avatar.length > 400000) return null;
  return avatar;
}


function isValidCoord(value) {
  return typeof value === "number" && Number.isFinite(value);
}

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.emit("users-update", Array.from(users.values()));

  socket.on("share-location", (payload) => {
    try {
      const name = sanitizeName(payload?.name);
      const lat = Number(payload?.lat);
      const lng = Number(payload?.lng);
      const color = sanitizeColor(payload?.color);
      const avatar = sanitizeAvatar(payload?.avatar);

      if (!isValidCoord(lat) || !isValidCoord(lng)) return;

      users.set(socket.id, {
        id: socket.id,
        name,
        lat,
        lng,
        color,
        avatar,
        updatedAt: Date.now()
      });

      io.emit("users-update", Array.from(users.values()));
    } catch (err) {
      console.error("share-location error:", err);
    }
  });

  socket.on("remove-me", () => {
    users.delete(socket.id);
    io.emit("users-update", Array.from(users.values()));
  });

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
    users.delete(socket.id);
    io.emit("users-update", Array.from(users.values()));
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
