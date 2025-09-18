const ffmpeg = require("fluent-ffmpeg");
const WebSocket = require("ws");
const http = require("http");
const path = require("path");
const fs = require("fs");

class StreamingService {
  constructor() {
    this.activeStreams = new Map(); // Map cho từng camera
    this.wss = null;
    this.httpServers = new Map();
  }

  // Khởi tạo WebSocket server
  initWebSocketServer(server) {
    this.wss = new WebSocket.Server({ server });

    this.wss.on("connection", (ws) => {
      console.log("Client connected to stream");
      let currentCameraId = null;

      ws.on("message", async (message) => {
        try {
          const data = JSON.parse(message);

          if (data.type === "start_stream") {
            currentCameraId = data.cameraId;
            await this.startStream(data.cameraId, ws);
          } else if (data.type === "stop_stream") {
            this.stopStream(data.cameraId, ws);
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      });

      ws.on("close", () => {
        console.log("Client disconnected from stream");
        if (currentCameraId) {
          this.stopStream(currentCameraId, ws);
        }
      });
    });

    return this.wss;
  }

  // Phương thức chuyển đổi RTSP sang WebSocket (MJPEG)
  async startStream(cameraId, ws) {
    // Kiểm tra nếu stream đã tồn tại cho camera này
    let streamInfo = this.activeStreams.get(cameraId);

    if (streamInfo) {
      // Nếu stream đã tồn tại, thêm client mới vào danh sách
      console.log(`Stream ${cameraId} already active, adding new client`);
      streamInfo.clients.push(ws);
      this.activeStreams.set(cameraId, streamInfo);

      // Gửi thông báo cho client mới
      ws.send(
        JSON.stringify({
          type: "info",
          message: "Connected to existing stream",
        })
      );
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
      .outputOptions(["-f", "mjpeg", "-q:v", "2", "-r", "25"]) // Tăng chất lượng và FPS
      .on("start", (cmdLine) => {
        console.log(`Started streaming camera ${cameraId}`);
        console.log("FFmpeg command:", cmdLine);
      })
      .on("error", (err) => {
        console.error(`Stream error for camera ${cameraId}:`, err);
        // Gửi lỗi đến tất cả clients
        if (this.activeStreams.has(cameraId)) {
          const streamInfo = this.activeStreams.get(cameraId);
          streamInfo.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(
                JSON.stringify({ type: "error", message: err.message })
              );
            }
          });
          this.activeStreams.delete(cameraId);
        }
      })
      .on("end", () => {
        console.log(`Stream ended for camera ${cameraId}`);
        this.activeStreams.delete(cameraId);
      });

    const stream = ffmpegProcess.pipe();

    // Tạo stream info mới
    streamInfo = {
      process: ffmpegProcess,
      clients: [ws],
      camera: camera,
    };

    this.activeStreams.set(cameraId, streamInfo);

    // Gửi dữ liệu đến tất cả clients
    stream.on("data", (chunk) => {
      if (this.activeStreams.has(cameraId)) {
        const streamInfo = this.activeStreams.get(cameraId);
        streamInfo.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(chunk);
          }
        });
      }
    });
  }

  // Phương thức chuyển đổi RTSP sang HLS
  async startHLSStream(cameraId) {
    if (this.activeStreams.has(cameraId)) {
      const stream = this.activeStreams.get(cameraId);
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

    // Xóa các file cũ trong thư mục outputDir
    try {
      if (fs.existsSync(outputDir)) {
        fs.readdirSync(outputDir).forEach((file) => {
          if (
            file.endsWith(".m3u8") ||
            file.endsWith(".ts") ||
            file.endsWith(".m4s")
          ) {
            fs.unlinkSync(path.join(outputDir, file));
          }
        });
      } else {
        fs.mkdirSync(outputDir, { recursive: true });
      }
    } catch (e) {
      console.error("Không thể xóa hoặc tạo thư mục outputDir:", outputDir, e);
      return null;
    }

    const outputPath = path.join(outputDir, "stream.m3u8");
    const streamPath = `streams/${cameraId}/stream.m3u8`;

    return new Promise((resolve) => {
      const fps = camera.fps || 25;
      const segmentTime = 1; // Giảm thời gian segment xuống 1 giây

      const ffmpegProcess = ffmpeg(rtspUrl)
        .inputOptions([
          "-rtsp_transport",
          "tcp",
          "-re",
          "-fflags",
          "+nobuffer",
          "-flags",
          "low_delay",
          "-avioflags",
          "direct",
          "-vsync",
          "passthrough",
          "-c:v",
          "hevc",
        ])
        .outputOptions([
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-tune",
          "zerolatency",
          "-sc_threshold",
          "0",
          // "-c:a",
          // "aac",
          "-f",
          "hls",
          "-hls_time",
          segmentTime.toString(),
          "-hls_list_size",
          "4",
          "-hls_flags",
          "delete_segments+discont_start+split_by_time",
          "-hls_segment_type",
          "mpegts",
          "-hls_allow_cache",
          "0",
          "-g",
          Math.round(fps * segmentTime).toString(),
          "-force_key_frames",
          `expr:gte(t,n_forced*${segmentTime})`,
          "-hls_segment_filename",
          path.join(outputDir, "segment_%03d.ts"),
          "-muxdelay",
          "0", // Giảm muxing delay
          "-muxpreload",
          "0", // Giảm muxing preload
          "-an"
        ])
        .output(outputPath)
        .on("start", (cmdLine) => {
          console.log(`Started LL-HLS streaming camera ${cameraId}`);
          console.log("FFmpeg command:", cmdLine);

          this.activeStreams.set(cameraId, {
            process: ffmpegProcess,
            type: "hls",
            path: streamPath,
            clients: [],
          });

          resolve(streamPath);
        })
        .on("error", (err, stdout, stderr) => {
          console.error(`LL-HLS Stream error for camera ${cameraId}:`, err);
          if (stderr) console.error("ffmpeg stderr:", stderr);
          resolve(null);
        })
        .on("end", () => {
          console.log(`LL-HLS Stream ended for camera ${cameraId}`);
          this.activeStreams.delete(cameraId);
        })
        .run();
    });
  }

  stopStream(cameraId, ws) {
    const streamInfo = this.activeStreams.get(cameraId);
    if (streamInfo) {
      // Xóa client khỏi danh sách
      streamInfo.clients = streamInfo.clients.filter((client) => client !== ws);

      // Nếu không còn client nào, dừng stream
      if (streamInfo.clients.length === 0) {
        if (streamInfo.process) {
          streamInfo.process.kill();
        }

        // Xóa thư mục stream nếu là HLS
        if (streamInfo.type === "hls") {
          const outputDir = path.join(
            __dirname,
            "../../public/streams",
            `${cameraId}`
          );
          try {
            if (fs.existsSync(outputDir)) {
              fs.readdirSync(outputDir).forEach((file) => {
                fs.unlinkSync(path.join(outputDir, file));
              });
              fs.rmdirSync(outputDir);
            }
          } catch (e) {
            console.error("Không thể xóa thư mục stream:", outputDir, e);
          }
        }

        this.activeStreams.delete(cameraId);
        console.log(`Stopped stream for camera ${cameraId}`);
      }
    }
  }

  cleanupStreams() {
    this.activeStreams.forEach((streamInfo, cameraId) => {
      if (streamInfo.process) {
        streamInfo.process.kill();
      }
      this.activeStreams.delete(cameraId);
    });
  }

  async getCameraInfo(cameraId) {
    const db = require("../db");
    const connection = await db.promise();

    try {
      const [cameras] = await connection.execute(
        `SELECT id, name, code, protocol, host, path, port, 
         width, height, fps, status, username, password
         FROM cameras WHERE id = ? AND is_active = 1`,
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

  getActiveStreams() {
    return this.activeStreams;
  }
}

module.exports = new StreamingService();