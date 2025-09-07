require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
const path = require("path");
const bodyParser = require("body-parser");
const http = require("http");
const WebSocket = require("ws");
const db = require("./db");
const fs = require('fs');
const streamingService = require("./services/streamingService");
const app = express();

const port = process.env.PORT || 4000;
app.use(express.static("public"));
// Middleware
app.use(cors());
app.options("*", cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));
app.use("/api/cameras", require("./routes/camera")); // Sửa thành /api/cameras
app.use("/api/videos", require("./routes/videoRoutes"));
app.use(
  "/streams",
  express.static(path.join(__dirname, "../public/streams"), {
    setHeaders: (res, path) => {
      if (path.endsWith(".m3u8")) {
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Access-Control-Allow-Origin", "*");
      } else if (path.endsWith(".ts") || path.endsWith(".m4s")) {
        res.setHeader("Content-Type", "video/MP2T");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Access-Control-Allow-Origin", "*");
      }
    },
  })
);

// WebSocket setup
const server = http.createServer(app);
const wss = streamingService.initWebSocketServer(server);
app.set("wss", wss);

// Thêm xử lý WebSocket cho các sự kiện khác (không phải streaming)
wss.on("connection", (ws) => {
  console.log("Client connected to main WebSocket");
  ws.on("message", (message) => {
    console.log("Received:", message.toString());
    try {
      const { event, data } = JSON.parse(message.toString());
      if (event === "newOrder" || event === "updateOrder") {
        const response = JSON.stringify({ event, data });
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(response);
          }
        });
      }
    } catch (err) {
      console.error("Error processing message:", err);
    }
  });
  ws.on("close", () => {
    console.log("Client disconnected from main WebSocket");
  });
});

// Đăng ký các routes chuẩn RESTful
const plateRoutes = require("./routes/plate");
const journeyRoutes = require("./routes/journey");
const accessControlRoutes = require("./routes/accessControl");
const rolesRoutes = require("./routes/roles");
const permissionsRoutes = require("./routes/permissions");
const authRoute = require("./routes/authRoute");
const userRoute = require("./routes/user");
const locationRoute = require("./routes/location");
const whiteList = require("./routes/whiteList");
const blackList = require("./routes/blackList");

app.use("/api/plates", plateRoutes);
app.use("/api/journeys", journeyRoutes);
app.use("/api/access-control", accessControlRoutes);
app.use("/api/roles", rolesRoutes);
app.use("/api/permissions", permissionsRoutes);
app.use("/api/auth", authRoute);
app.use("/api/user", userRoute);
app.use("/api/location", locationRoute);
app.use("/api/whitelist", whiteList);
app.use("/api/blacklist", blackList);
// Route phục vụ ảnh cắt từ khung hình
app.use("/frame_crops", express.static(path.join(__dirname, "../../public/frame_crops")));

// Đảm bảo thư mục tồn tại
const frameCropsDir = path.join(__dirname, "../../public/frame_crops");
if (!fs.existsSync(frameCropsDir)) {
  fs.mkdirSync(frameCropsDir, { recursive: true });
}

// Thêm endpoint mới để nhận dữ liệu biển số từ Python
app.post("/api/plates", async (req, res) => {
  const connection = await db.promise();
  try {
    const { track_id, plate_number, confidence, bbox, timestamp, frame_path, camera_id } =
      req.body;

    // Kiểm tra dữ liệu đầu vào
    if (!plate_number) {
      return res.status(400).json({ error: "Thiếu số biển số" });
    }

    // Kiểm tra xem biển số đã tồn tại chưa (trong vòng 5 phút)
    const [existingPlates] = await connection.execute(
      "SELECT id FROM license_plates WHERE plate_number = ? AND detected_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)",
      [plate_number]
    );

    // Nếu biển số đã tồn tại trong 5 phút gần đây, không lưu lại
    if (existingPlates.length > 0) {
      return res
        .status(200)
        .json({ message: "Biển số đã tồn tại, không lưu trùng" });
    }

    // Thực thi query để lưu biển số và đường dẫn frame
    await connection.execute(
      "INSERT INTO license_plates (track_id, plate_number, confidence, bbox, detected_at, frame_path, camera_id) VALUES (?, ?, ?, ?, FROM_UNIXTIME(?), ?, ?)",
      [track_id, plate_number, confidence, bbox, timestamp, frame_path, camera_id || null]
    );

    res.status(200).json({ message: "Lưu biển số thành công" });
  } catch (error) {
    console.error("Lỗi khi lưu biển số:", error);
    res.status(500).json({ error: "Lỗi server nội bộ" });
  }
});
// Global error handler (luôn trả về JSON)
app.use((err, req, res, next) => {
  console.error("Global error:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
    error: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
