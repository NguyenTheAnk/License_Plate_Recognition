const ffmpeg = require("fluent-ffmpeg");
const WebSocket = require("ws");
const http = require("http");
const path = require("path"); // BỔ SUNG DÒNG NÀY
const fs = require("fs"); // BỔ SUNG DÒNG NÀY

class StreamingService {
  constructor() {
    this.activeStreams = new Map();
    this.wss = null;
  }

  // Khởi tạo WebSocket server
  initWebSocketServer(server) {
    this.wss = new WebSocket.Server({ server });

    this.wss.on("connection", (ws) => {
      console.log("Client connected to stream");

      ws.on("message", async (message) => {
        const data = JSON.parse(message);

        if (data.type === "start_stream") {
          await this.startStream(data.cameraId, ws);
        } else if (data.type === "stop_stream") {
          this.stopStream(data.cameraId);
        }
      });

      ws.on("close", () => {
        console.log("Client disconnected from stream");
        this.cleanupStreams();
      });
    });

    return this.wss; // Trả về WebSocket server instance
  }

  // Phương thức 1: Chuyển đổi RTSP sang WebSocket (MJPEG)
  async startStream(cameraId, ws) {
    if (this.activeStreams.has(cameraId)) {
      console.log(`Stream ${cameraId} already active`);
      return;
    }

    // Lấy thông tin camera từ database
    const camera = await this.getCameraInfo(cameraId);
    if (!camera) {
      ws.send(JSON.stringify({ type: "error", message: "Camera not found" }));
      return;
    }

    const rtspUrl = this.buildRtspUrl(camera);

    const ffmpegProcess = ffmpeg(rtspUrl)
      .inputOptions(["-rtsp_transport", "tcp", "-re"])
      .outputOptions(["-f", "mjpeg", "-q:v", "3", "-r", "15"])
      .on("start", () => {
        console.log(`Started streaming camera ${cameraId}`);
      })
      .on("error", (err) => {
        console.error(`Stream error for camera ${cameraId}:`, err);
        ws.send(JSON.stringify({ type: "error", message: err.message }));
      })
      .on("end", () => {
        console.log(`Stream ended for camera ${cameraId}`);
        this.activeStreams.delete(cameraId);
      });

    const stream = ffmpegProcess.pipe();

    stream.on("data", (chunk) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(chunk);
      }
    });

    this.activeStreams.set(cameraId, {
      process: ffmpegProcess,
      stream: stream,
      ws: ws,
    });
  }

  // Phương thức 2: Chuyển đổi RTSP sang HLS
  async startHLSStream(cameraId) {
    // Kiểm tra xem stream đã tồn tại chưa
    if (this.activeStreams.has(cameraId)) {
      const stream = this.activeStreams.get(cameraId);
      stream.clients++;
      return stream.path;
    }

    const camera = await this.getCameraInfo(cameraId);
    if (!camera) return null;

    const rtspUrl = this.buildRtspUrl(camera);
    const outputDir = path.join(
      __dirname,
      "../../public/streams",
      `${cameraId}`
    );

    try {
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
    } catch (e) {
      console.error("Cannot create outputDir:", outputDir, e);
      return null;
    }

    const outputPath = path.join(outputDir, "stream.m3u8");
    const streamPath = `streams/${cameraId}/stream.m3u8`;
    return new Promise((resolve) => {
      const ffmpegProcess = ffmpeg(rtspUrl)
        .inputOptions(["-rtsp_transport", "tcp", "-re"])
        .outputOptions([
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-tune",
          "zerolatency",
          "-c:a",
          "aac",
          "-f",
          "hls",
          "-hls_time",
          "1",
          "-hls_list_size",
          "6",
          "-hls_segment_filename",
          path.join(outputDir, "stream%03d.ts"),
          "-hls_flags",
          "delete_segments+discont_start",
          "-hls_allow_cache",
          "0",
        ])
        .output(outputPath)
        .on("start", (cmdLine) => {
          console.log(`Started HLS streaming camera ${cameraId}`);
          console.log("ffmpeg cmd:", cmdLine);

          this.activeStreams.set(cameraId, {
            process: ffmpegProcess,
            type: "hls",
            path: streamPath, // Sử dụng biến đã định nghĩa
            clients: 1,
          });

          resolve(streamPath); // Sử dụng biến đã định nghĩa
        })
        .on("error", (err, stdout, stderr) => {
          console.error(`HLS Stream error for camera ${cameraId}:`, err);
          if (stderr) console.error("ffmpeg stderr:", stderr);
          resolve(null);
        })
        .on("end", () => {
          console.log(`HLS Stream ended for camera ${cameraId}`);
          this.activeStreams.delete(cameraId);
        })
        .run();
    });
  }

  stopStream(cameraId) {
    const streamInfo = this.activeStreams.get(cameraId);
    if (streamInfo) {
      streamInfo.clients--;
      if (streamInfo.clients <= 0) {
        if (streamInfo.process) {
          streamInfo.process.kill();
        }
        this.activeStreams.delete(cameraId);
      }
    }
  }

  cleanupStreams() {
    this.activeStreams.forEach((streamInfo, cameraId) => {
      this.stopStream(cameraId);
    });
  }

  async getCameraInfo(cameraId) {
    const db = require("../db");
    const connection = await db.promise();

    try {
      const [cameras] = await connection.execute(
        `
        SELECT 
          id, name, code, protocol, host, path, port, 
          width, height, fps, status,
          username, password
        FROM cameras 
        WHERE id = ? AND is_active = 1
      `,
        [cameraId]
      );

      if (cameras.length === 0) {
        return null;
      }

      return cameras[0];
    } catch (error) {
      console.error("Error getting camera info:", error);
      return null;
    }
  }

  buildRtspUrl(camera) {
    if (camera.protocol === "rtsp") {
      if (camera.username && camera.password) {
        return `rtsp://${camera.username}:${camera.password}@${camera.host}:${camera.port}${camera.path}`;
      }
      return `rtsp://${camera.host}:${camera.port}${camera.path}`;
    }
    return `${camera.protocol}://${camera.host}:${camera.port}${camera.path}`;
  }
}

module.exports = new StreamingService();