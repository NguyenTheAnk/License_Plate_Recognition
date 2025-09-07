import React, { useState, useRef, useEffect } from "react";
import Hls from "hls.js";
import io from "socket.io-client";

const CameraViewerSocketIO = ({ camera, actionBar, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [frameData, setFrameData] = useState(null);
  const [recognitionResults, setRecognitionResults] = useState([]);
  const [fps, setFps] = useState(0);
  const [isUploadedVideo, setIsUploadedVideo] = useState(false);

  const videoRef = useRef(null);
  const imgRef = useRef(null);
  const hlsRef = useRef(null);
  const socketRef = useRef(null);
  const currentTimeRef = useRef(0);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(0);
  const sendFrameTimeoutRef = useRef(null);
  const videoRetryTimeoutRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    let hls = hlsRef.current;

    const initPlayer = () => {
      let retryCount = 0;
      const maxRetries = 3;

      const tryInitPlayer = () => {
        const startTime = performance.now();
        if (!camera.streamUrl || !video) return;

        const isHls = camera.streamUrl.includes(".m3u8");
        const isMp4 = camera.streamUrl.includes(".mp4");

        if (isHls && Hls.isSupported()) {
          hls = new Hls({
            maxBufferLength: 60,
            maxMaxBufferLength: 120,
            liveSyncDuration: 60,
            liveMaxLatencyDuration: 120,
            enableWorker: true,
            fragLoadingTimeOut: 20000,
            manifestLoadingTimeOut: 20000,
            levelLoadingTimeOut: 20000,
            nudgeOffset: 0.2,
            maxFragLookUpTolerance: 0.3,
            lowBufferWatchdogPeriod: 0.5,
          });

          if (!hls.url || hls.url !== camera.streamUrl) {
            hls.loadSource(camera.streamUrl);
          }
          hls.attachMedia(video);
          console.log(`HLS load/attach time: ${performance.now() - startTime}ms`);

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setLoading(false);
            retryCount = 0;
            if (videoRetryTimeoutRef.current) {
              clearTimeout(videoRetryTimeoutRef.current);
              videoRetryTimeoutRef.current = null;
            }
            if (currentTimeRef.current > 0 && !isNaN(currentTimeRef.current)) {
              video.currentTime = currentTimeRef.current;
            }
            const playStart = performance.now();
            video.play().then(() => {
              console.log("Video started playing successfully");
            }).catch((err) => {
              console.error("Lỗi phát video HLS:", err);
              console.log(`Video play attempt time: ${performance.now() - playStart}ms`);
              if (retryCount < maxRetries && isRecognizing) {
                videoRetryTimeoutRef.current = setTimeout(() => video.play(), 2000);
                retryCount++;
              }
            });
            console.log(`HLS manifest parsed time: ${performance.now() - startTime}ms`);
          });

          hls.on(Hls.Events.ERROR, (event, data) => {
            console.error("Lỗi HLS:", data);
            setLoading(false);
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  console.log("Lỗi mạng HLS, thử khôi phục...");
                  hls.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  console.log("Lỗi media HLS, khôi phục...");
                  hls.recoverMediaError();
                  break;
                default:
                  console.log("Lỗi HLS không khắc phục được, thử lại...");
                  hls.destroy();
                  if (retryCount < maxRetries && isRecognizing) {
                    retryCount++;
                    videoRetryTimeoutRef.current = setTimeout(tryInitPlayer, 3000);
                  } else {
                    alert("Không thể tải stream HLS sau nhiều lần thử.");
                  }
                  break;
              }
            } else if (data.details === "bufferStalledError") {
              console.log("Bộ đệm HLS bị kẹt, thử tải lại...");
              hls.startLoad();
            }
          });
        } else if (isMp4 || video.canPlayType("video/mp4")) {
          console.log("Loading MP4 video:", camera.streamUrl);
          if (video.src !== camera.streamUrl) {
            video.src = camera.streamUrl;
          }
          video.addEventListener("loadedmetadata", () => {
            console.log("Video metadata loaded:", { duration: video.duration, width: video.videoWidth, height: video.videoHeight });
            setLoading(false);
            if (videoRetryTimeoutRef.current) {
              clearTimeout(videoRetryTimeoutRef.current);
              videoRetryTimeoutRef.current = null;
            }
            if (currentTimeRef.current > 0 && !isNaN(currentTimeRef.current)) {
              video.currentTime = currentTimeRef.current;
            }
            const playStart = performance.now();
            video.play().then(() => {
              console.log("Video started playing successfully");
            }).catch((err) => {
              console.error("Lỗi phát video MP4:", err);
              console.log(`Video play attempt time: ${performance.now() - playStart}ms`);
              if (retryCount < maxRetries && isRecognizing) {
                retryCount++;
                videoRetryTimeoutRef.current = setTimeout(tryInitPlayer, 2000);
              } else {
                alert("Không thể tải video MP4 sau nhiều lần thử.");
              }
            });
            console.log(`MP4 metadata loaded time: ${performance.now() - startTime}ms`);
          });
        } else {
          alert(
            "Trình duyệt không hỗ trợ định dạng video cho camera " + camera.id
          );
        }
      };

      tryInitPlayer();
    };

    const handleTimeUpdate = () => {
      if (video && !isNaN(video.currentTime)) {
        currentTimeRef.current = video.currentTime;
      }
    };

    if (video) {
      video.addEventListener("timeupdate", handleTimeUpdate);
    }

    initPlayer();

    return () => {
      if (hls) hls.destroy();
      if (video) {
        video.removeEventListener("timeupdate", handleTimeUpdate);
        video.src = "";
        video.pause();
      }
      if (videoRetryTimeoutRef.current) {
        clearTimeout(videoRetryTimeoutRef.current);
        videoRetryTimeoutRef.current = null;
      }
      stopRecognition();
    };
  }, [camera.streamUrl]);

  useEffect(() => {
    setIsUploadedVideo(camera.id.startsWith("upload-"));
  }, [camera.id]);

  // Socket.IO connection
  useEffect(() => {
    if (isRecognizing) {
      console.log("Connecting to Socket.IO server...");
      socketRef.current = io("http://localhost:5000");

      socketRef.current.on("connect", () => {
        console.log("Connected to Socket.IO server");
      });

      socketRef.current.on("connected", (data) => {
        console.log("Server confirmed connection:", data);
        if (isRecognizing) sendFrames();
      });

      socketRef.current.on("result", (data) => {
        console.log("Received result from server:", data);
        if (data.frame) {
          setFrameData(data.frame);
        }
        if (data.metadata) {
          setRecognitionResults((prev) => {
            const newResult = {
              timestamp: new Date().toLocaleTimeString(),
              boxes: data.metadata.boxes || [],
              labels: data.metadata.labels || [],
              ocr_results: data.metadata.ocr_results || [],
            };
            return [...prev, newResult].slice(-5);
          });
        }
      });

      socketRef.current.on("error", (data) => {
        console.error("Server error:", data);
      });

      socketRef.current.on("disconnect", () => {
        console.log("Disconnected from Socket.IO server");
      });
    } else {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [isRecognizing]);

  const sendFrames = () => {
    const frameStartTime = performance.now();
    if (!isRecognizing || !socketRef.current || !socketRef.current.connected) {
      console.log("Socket.IO not ready, skipping frame");
      return;
    }

    const video = videoRef.current;
    if (!video || video.paused || video.ended) {
      console.log("Video not ready:", { video: !!video, paused: video?.paused, ended: video?.ended });
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 540;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const canvasDrawTime = performance.now();
    console.log(`Canvas draw time: ${canvasDrawTime - frameStartTime}ms`);

    canvas.toBlob((blob) => {
      if (blob && socketRef.current && socketRef.current.connected) {
        const blobStartTime = performance.now();
        const reader = new FileReader();
        reader.onload = () => {
          socketRef.current.emit("frame", { frame: reader.result });
          console.log(`Blob to base64 and send time: ${performance.now() - blobStartTime}ms, size: ${reader.result.length} chars`);
        };
        reader.readAsDataURL(blob);
      } else {
        console.log("Blob or Socket.IO not ready:", { blob: !!blob, socketConnected: socketRef.current?.connected });
      }
    }, "image/jpeg", 0.2);

    console.log(`Total frame send time: ${performance.now() - frameStartTime}ms`);
    if (isRecognizing) {
      sendFrameTimeoutRef.current = setTimeout(sendFrames, 33);
    }
  };

  const startRecognition = () => {
    if (isProcessing) return;
    setIsProcessing(true);
    console.log("Starting recognition for camera:", camera.id);
    if (!camera.id || !camera.streamUrl) {
      console.error("ID camera hoặc URL stream không hợp lệ");
      alert("Không thể bắt đầu nhận diện: Thiếu ID camera hoặc URL stream.");
      setIsProcessing(false);
      return;
    }
    setIsRecognizing(true);
    setIsProcessing(false);
  };

  const stopRecognition = () => {
    if (isProcessing) {
      console.log("Stop recognition ignored, processing in progress");
      return;
    }
    setIsProcessing(true);
    console.log("Stopping recognition, closing Socket.IO");
    setIsRecognizing(false);
    setFrameData(null);
    setRecognitionResults([]);

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    if (sendFrameTimeoutRef.current) {
      clearTimeout(sendFrameTimeoutRef.current);
      sendFrameTimeoutRef.current = null;
    }
    if (videoRetryTimeoutRef.current) {
      clearTimeout(videoRetryTimeoutRef.current);
      videoRetryTimeoutRef.current = null;
    }

    setIsProcessing(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg p-6 max-w-6xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Camera: {camera.name}</h2>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">FPS: {fps}</span>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex space-x-4 h-[calc(90vh-120px)]">
          <div className="flex-1 relative">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                  <p className="mt-2">Đang tải video...</p>
                </div>
              </div>
            )}
            
            <video
              ref={videoRef}
              className="w-full h-full object-contain bg-black"
              controls
              muted
              playsInline
            />
            
            {frameData && (
              <div className="mt-4">
                <h3 className="text-lg font-semibold mb-2">Kết quả nhận diện:</h3>
                <img
                  ref={imgRef}
                  src={frameData}
                  alt="Processed frame"
                  className="w-full max-h-64 object-contain border"
                />
              </div>
            )}
          </div>

          <div className="w-80 bg-gray-50 p-4 rounded-lg overflow-y-auto">
            <div className="mb-4">
              <button
                onClick={isRecognizing ? stopRecognition : startRecognition}
                disabled={isProcessing}
                className={`w-full py-2 px-4 rounded ${
                  isRecognizing
                    ? "bg-red-500 hover:bg-red-600 text-white"
                    : "bg-blue-500 hover:bg-blue-600 text-white"
                } disabled:opacity-50`}
              >
                {isProcessing
                  ? "Đang xử lý..."
                  : isRecognizing
                  ? "Dừng nhận diện"
                  : "Bắt đầu nhận diện"}
              </button>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold">Kết quả nhận diện:</h3>
              {recognitionResults.length === 0 ? (
                <p className="text-gray-500">Chưa có kết quả</p>
              ) : (
                recognitionResults.map((result, index) => (
                  <div key={index} className="bg-white p-3 rounded border">
                    <p className="text-sm text-gray-600">{result.timestamp}</p>
                    <p className="font-medium">
                      Biển số: {result.ocr_results.join(", ") || "Không nhận diện được"}
                    </p>
                    <p className="text-sm text-gray-500">
                      Số lượng: {result.boxes.length}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {actionBar && (
          <div className="mt-4 pt-4 border-t">
            {actionBar}
          </div>
        )}
      </div>
    </div>
  );
};

export default CameraViewerSocketIO;

