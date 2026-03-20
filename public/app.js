const socket = io();

const nameInput = document.getElementById("nameInput");
const colorInput = document.getElementById("colorInput");
const avatarInput = document.getElementById("avatarInput");
const avatarPreview = document.getElementById("avatarPreview");
const clearAvatarBtn = document.getElementById("clearAvatarBtn");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const shareBtn = document.getElementById("shareBtn");
const stopBtn = document.getElementById("stopBtn");
const statusBox = document.getElementById("status");
const userCount = document.getElementById("userCount");

const STORAGE_NAME = "saved_display_name";
const STORAGE_COLOR = "saved_marker_color";
const STORAGE_AVATAR = "saved_marker_avatar";

const markers = new Map();

let watchId = null;

// khởi tạo map
const map = L.map("map").setView([16.0471, 108.2068], 5);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

// load dữ liệu đã lưu
const savedName = localStorage.getItem(STORAGE_NAME);
const savedColor = localStorage.getItem(STORAGE_COLOR);
const savedAvatar = localStorage.getItem(STORAGE_AVATAR);

if (savedName) nameInput.value = savedName;
if (savedColor) colorInput.value = savedColor;
updateAvatarPreview(savedAvatar || null);

function setStatus(text) {
  statusBox.textContent = text;
}

function getDisplayName() {
  return nameInput.value.trim() || "Anonymous";
}

function getMarkerColor() {
  return colorInput.value || "#2f80ed";
}

function getAvatarData() {
  return localStorage.getItem(STORAGE_AVATAR);
}

function saveProfile() {
  const name = getDisplayName();
  const color = getMarkerColor();

  localStorage.setItem(STORAGE_NAME, name);
  localStorage.setItem(STORAGE_COLOR, color);

  setStatus(`Đã lưu thông tin: ${name}`);
}

function updateAvatarPreview(dataUrl) {
  avatarPreview.classList.remove("default-preview");
  avatarPreview.style.backgroundImage = "";

  if (dataUrl) {
    avatarPreview.style.backgroundImage = `url("${dataUrl}")`;
    avatarPreview.style.backgroundColor = "transparent";
  } else {
    avatarPreview.classList.add("default-preview");
    avatarPreview.style.backgroundColor = getMarkerColor();
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildMarkerHtml(user) {
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(user.color || "") ? user.color : "#2f80ed";

  if (user.avatar) {
    return `<div class="marker-circle" style="background-image:url('${user.avatar}')"></div>`;
  }

  return `<div class="marker-circle" style="background:${safeColor}"></div>`;
}

function createUserIcon(user) {
  return L.divIcon({
    className: "custom-marker",
    html: buildMarkerHtml(user),
    iconSize: [46, 46],
    iconAnchor: [23, 23],
    popupAnchor: [0, -20]
  });
}

function renderUsers(users) {
  const incomingIds = new Set();

  users.forEach((user) => {
    incomingIds.add(user.id);

    const popupHtml = `
      <div>
        <strong>${escapeHtml(user.name)}</strong><br/>
        Lat: ${Number(user.lat).toFixed(5)}<br/>
        Lng: ${Number(user.lng).toFixed(5)}
      </div>
    `;

    if (markers.has(user.id)) {
      const marker = markers.get(user.id);
      marker.setLatLng([user.lat, user.lng]);
      marker.setIcon(createUserIcon(user));
      marker.bindPopup(popupHtml);
    } else {
      const marker = L.marker([user.lat, user.lng], {
        icon: createUserIcon(user)
      }).addTo(map);

      marker.bindPopup(popupHtml);
      markers.set(user.id, marker);
    }
  });

  for (const [id, marker] of markers.entries()) {
    if (!incomingIds.has(id)) {
      map.removeLayer(marker);
      markers.delete(id);
    }
  }

  userCount.textContent = String(users.length);

  if (users.length > 0) {
    const bounds = L.latLngBounds(users.map((u) => [u.lat, u.lng]));
    map.fitBounds(bounds, { padding: [40, 40] });
  }
}

function emitCurrentLocation(position) {
  const name = getDisplayName();
  const color = getMarkerColor();
  const avatar = getAvatarData();

  localStorage.setItem(STORAGE_NAME, name);
  localStorage.setItem(STORAGE_COLOR, color);

  const lat = position.coords.latitude;
  const lng = position.coords.longitude;

  socket.emit("share-location", {
    name,
    lat,
    lng,
    color,
    avatar
  });

  setStatus(`Đang chia sẻ vị trí realtime với tên: ${name}`);
}

function startSharing() {
  if (!navigator.geolocation) {
    setStatus("Trình duyệt không hỗ trợ geolocation.");
    return;
  }

  saveProfile();
  setStatus("Đang bật theo dõi vị trí realtime...");

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      emitCurrentLocation(position);
      map.setView([position.coords.latitude, position.coords.longitude], 15);
    },
    (error) => {
      switch (error.code) {
        case error.PERMISSION_DENIED:
          setStatus("Bạn đã từ chối quyền truy cập vị trí.");
          break;
        case error.POSITION_UNAVAILABLE:
          setStatus("Không thể xác định vị trí hiện tại.");
          break;
        case error.TIMEOUT:
          setStatus("Lấy vị trí bị quá thời gian.");
          break;
        default:
          setStatus("Có lỗi khi theo dõi vị trí.");
      }
    },
    {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 10000
    }
  );
}

function stopSharing() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  socket.emit("remove-me");
  setStatus("Đã dừng chia sẻ vị trí.");
}

avatarInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    setStatus("File được chọn không phải ảnh.");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result || "");
    localStorage.setItem(STORAGE_AVATAR, dataUrl);
    updateAvatarPreview(dataUrl);
    setStatus("Đã lưu ảnh marker.");
  };
  reader.readAsDataURL(file);
});

clearAvatarBtn.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_AVATAR);
  avatarInput.value = "";
  updateAvatarPreview(null);
  setStatus("Đã xóa ảnh marker.");
});

colorInput.addEventListener("input", () => {
  if (!getAvatarData()) {
    updateAvatarPreview(null);
  }
});

saveProfileBtn.addEventListener("click", saveProfile);
shareBtn.addEventListener("click", startSharing);
stopBtn.addEventListener("click", stopSharing);

socket.on("users-update", (users) => {
  renderUsers(users);
});

window.addEventListener("beforeunload", () => {
  socket.emit("remove-me");
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
  }
});
