const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const db = require("../db");

class VLCStreamService {
  constructor() {
    this.activeStreams = new Map();
  }

  // Xác định đường dẫn VLC trên Windows
  getVLCPath() {
    const possiblePaths = [
      "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe",
      "C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe",
      process.env.PROGRAMFILES + "\\VideoLAN\\VLC\\vlc.exe",
      process.env["PROGRAMFILES(X86)"] + "\\VideoLAN\\VLC\\vlc.exe",
    ];

    for (const vlcPath of possiblePaths) {
      if (fs.existsSync(vlcPath)) {
        return vlcPath;
      }
    }

    throw new Error("VLC not found. Please install VLC Media Player.");
  }

  async startVLCStream(cameraId, req) {
    // Kiểm tra nếu stream đã chạy
    if (this.activeStreams.has(cameraId)) {
      const existingStream = this.activeStreams.get(cameraId);
      return existingStream.streamUrl;
    }

    // Lấy thông tin camera từ database
    const cameraInfo = await this.getCameraInfo(cameraId);
    if (!cameraInfo) {
      throw new Error("Camera not found");
    }

    const rtspUrl = this.buildRTSPUrl(cameraInfo);
    const outputDir = path.join(__dirname, "../../public/streams", cameraId);

    // Tạo thư mục nếu chưa tồn tại
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, "stream.m3u8");

    // Xóa file cũ nếu tồn tại
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    const vlcPath = this.getVLCPath();
    // Tạo luồng HLS với VLC
    const vlcArgs = [
      "-I",
      "dummy",
      "--dummy-quiet",
      "--rtsp-udp", 
      "--network-caching=300", // Giảm cache mạng xuống 300ms
      "--sout-mux-caching=100", // Giảm cache mux xuống 100ms
      "--live-caching=300", // Giảm cache live xuống 300ms
      "--clock-jitter=0", // Giảm jitter
      "--clock-synchro=0", // Đồng bộ hóa clock
      rtspUrl,
      "--sout",

      "--sout-keep",
      "--no-sout-audio",
    ];

    console.log("Starting VLC with command:", vlcPath, vlcArgs.join(" "));

    const vlcProcess = spawn(`"${vlcPath}"`, vlcArgs, {
      shell: true,
      detached: true,
    });

    vlcProcess.stdout.on("data", (data) => {
      console.log(`VLC stdout: ${data}`);
    });

    vlcProcess.stderr.on("data", (data) => {
      console.error(`VLC stderr: ${data}`);
    });

    vlcProcess.on("close", (code) => {
      console.log(`VLC process exited with code ${code}`);
      this.activeStreams.delete(cameraId);
    });

    vlcProcess.on("error", (err) => {
      console.error("Failed to start VLC process:", err);
      throw err;
    });

    // Lưu thông tin stream
    const streamUrl = `${req.protocol}://${req.get(
      "host"
    )}/streams/${cameraId}/stream.m3u8`;
    this.activeStreams.set(cameraId, {
      process: vlcProcess,
      cameraInfo: cameraInfo,
      streamUrl: streamUrl,
    });

    // Chờ một chút để stream khởi tạo
    await new Promise((resolve) => setTimeout(resolve, 5000));

    return streamUrl;
  }

  stopVLCStream(cameraId) {
    if (this.activeStreams.has(cameraId)) {
      const streamInfo = this.activeStreams.get(cameraId);
      try {
        // Trên Windows, sử dụng taskkill để dừng process
        spawn("taskkill", ["/pid", streamInfo.process.pid, "/f", "/t"]);
      } catch (error) {
        console.error("Error stopping VLC process:", error);
      }
      this.activeStreams.delete(cameraId);
      console.log(`Stopped VLC stream for camera ${cameraId}`);
    }
  }

  async getCameraInfo(cameraId) {
    const connection = await db.promise();
    try {
      const [cameras] = await connection.execute(
        `SELECT id, name, protocol, host, port, path, username, password 
                 FROM cameras WHERE id = ? AND is_active = 1`,
        [cameraId]
      );

      return cameras.length > 0 ? cameras[0] : null;
    } catch (error) {
      console.error("Error getting camera info:", error);
      return null;
    }
  }

  buildRTSPUrl(camera) {
    if (camera.username && camera.password) {
      return `rtsp://${camera.username}:${camera.password}@${camera.host}:${camera.port}${camera.path}`;
    } else {
      return `rtsp://${camera.host}:${camera.port}${camera.path}`;
    }
  }

  // Phương thức thay thế sử dụng HTTP thay vì HLS (độ trễ thấp hơn)
  async startVLCHTTPStream(cameraId, req, lowLatency = true) {
    if (this.activeStreams.has(cameraId)) {
      return this.activeStreams.get(cameraId).streamUrl;
    }

    const cameraInfo = await this.getCameraInfo(cameraId);
    if (!cameraInfo) {
      throw new Error("Camera not found");
    }

    const rtspUrl = this.buildRTSPUrl(cameraInfo);
    const vlcPath = this.getVLCPath();

    // Sử dụng port ngẫu nhiên để tránh xung đột
    const httpPort = 8080 + Math.floor(Math.random() * 1000);
    const host = req.get("host").split(":")[0]; // Lấy host từ request
    const streamUrl = `http://${host}:${httpPort}/`;

    const vlcArgs = [
      "-I",
      "dummy",
      "--dummy-quiet",
      "--rtsp-udp",
      "--network-caching=100",
      rtspUrl,
      "--sout",
      `#transcode{vcodec=h264,vb=800,fps=25,width=640,height=480,acodec=none}:http{mux=ffmpeg{mux=flv},dst=:${httpPort}/}`,
      "--sout-keep",
      "--no-sout-audio",
    ];

    console.log("Starting VLC HTTP stream:", vlcPath, vlcArgs.join(" "));

    const vlcProcess = spawn(`"${vlcPath}"`, vlcArgs, {
      shell: true,
      detached: false,
    });

    // Xử lý lỗi và output
    vlcProcess.stdout.on("data", (data) => {
      console.log(`VLC stdout: ${data}`);
    });

    vlcProcess.stderr.on("data", (data) => {
      console.error(`VLC stderr: ${data}`);
    });

    vlcProcess.on("error", (err) => {
      console.error("Failed to start VLC process:", err);
      this.activeStreams.delete(cameraId);
    });

    vlcProcess.on("close", (code) => {
      console.log(`VLC process exited with code ${code}`);
      this.activeStreams.delete(cameraId);
    });

    this.activeStreams.set(cameraId, {
      process: vlcProcess,
      cameraInfo: cameraInfo,
      streamUrl: streamUrl,
    });

    // Chờ stream khởi động
    await new Promise((resolve) => setTimeout(resolve, 3000));
    return streamUrl;
  }

  getActiveStreams() {
    return Array.from(this.activeStreams.entries()).map(([cameraId, info]) => ({
      cameraId,
      streamUrl: info.streamUrl,
    }));
  }
}

module.exports = new VLCStreamService();