import React, { useState, useRef, useEffect } from "react";
import Hls from "hls.js";

const CameraViewerSocketIO = ({ camera, actionBar, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [frameData, setFrameData] = useState(null);
  const [recognitionResults, setRecognitionResults] = useState([]);
  const [fps, setFps] = useState(0);
  const [isUploadedVideo, setIsUploadedVideo] = useState(false);
  const [detectedPlates, setDetectedPlates] = useState([]);

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
            maxBufferLength: 30,  // Reduced for lower latency
            maxMaxBufferLength: 60,  // Reduced for lower latency
            liveSyncDuration: 30,  // Reduced for lower latency
            liveMaxLatencyDuration: 60,  // Reduced for lower latency
            enableWorker: true,
            fragLoadingTimeOut: 10000,  // Reduced timeout
            manifestLoadingTimeOut: 10000,  // Reduced timeout
            levelLoadingTimeOut: 10000,  // Reduced timeout
            nudgeOffset: 0.1,  // Reduced nudge
            maxFragLookUpTolerance: 0.2,  // Reduced tolerance
            lowBufferWatchdogPeriod: 0.3,  // More frequent checks
            backBufferLength: 10,  // Reduced back buffer
            maxBufferSize: 60 * 1000 * 1000,  // 60MB max buffer
            maxBufferHole: 0.1,  // Reduced buffer hole tolerance
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
          if (video.src !== camera.streamUrl) {
            video.src = camera.streamUrl;
          }
          video.addEventListener("loadedmetadata", () => {
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

  // WebSocket connection for real-time processing
  useEffect(() => {
    if (isRecognizing) {
      console.log("Connecting to WebSocket server...");
      socketRef.current = new WebSocket("ws://localhost:5002/recognize-ws");

      socketRef.current.onopen = () => {
        console.log("✅ Connected to WebSocket server");

        // Gửi thông tin nguồn trước khi bắt đầu gửi frame
        const sourceInfo = {
          type: 'source_info',
          camera_id: camera.id,
          camera_name: camera.name,
          source_type: 'camera',
          camera_location: camera.location || 'Unknown'
        };

        console.log("📤 Sending source info:", sourceInfo);
        socketRef.current.send(JSON.stringify(sourceInfo));

        if (isRecognizing) sendFrames();
      };

      socketRef.current.onerror = (error) => {
        console.error("❌ WebSocket error:", error);
      };

      socketRef.current.onclose = (event) => {
        console.log("🔌 WebSocket closed:", event.code, event.reason);
      };

      socketRef.current.onmessage = (event) => {
        console.log("Received data from server:", event.data);

        // Check if it's binary data (processed frame)
        if (event.data instanceof Blob) {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result;
            setFrameData(dataUrl);
            console.log("Processed frame received and displayed");

            // Extract plate information from frame if possible
            // This is a simple approach - in real implementation, you might want to send metadata separately
            const currentTime = new Date().toLocaleTimeString();
            setRecognitionResults(prev => [...prev, {
              timestamp: currentTime,
              message: "Frame processed with detection overlay",
              hasDetection: true
            }].slice(-10));
          };
          reader.readAsDataURL(event.data);
        } else if (event.data instanceof ArrayBuffer) {
          // Handle ArrayBuffer data
          const blob = new Blob([event.data], { type: 'image/jpeg' });
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result;
            setFrameData(dataUrl);
            console.log("Processed frame received and displayed");

            // Extract plate information from frame if possible
            const currentTime = new Date().toLocaleTimeString();
            setRecognitionResults(prev => [...prev, {
              timestamp: currentTime,
              message: "Frame processed with detection overlay",
              hasDetection: true
            }].slice(-10));
          };
          reader.readAsDataURL(blob);
        } else {
          // Handle text/JSON data
          try {
            const data = JSON.parse(event.data);
            console.log("Received JSON data:", data);

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
          } catch (e) {
            console.log("Non-JSON text data:", event.data);
          }
        }
      };

      socketRef.current.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      socketRef.current.onclose = () => {
        console.log("Disconnected from WebSocket server");
      };
    } else {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [isRecognizing]);

  const sendFrames = () => {
    const frameStartTime = performance.now();
    if (!isRecognizing || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      console.log("WebSocket not ready, skipping frame");
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
      if (blob && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        const blobStartTime = performance.now();
        // Send binary data directly to WebSocket
        socketRef.current.send(blob);
        console.log(`Blob sent via WebSocket: ${performance.now() - blobStartTime}ms, size: ${blob.size} bytes`);
      } else {
        console.log("Blob or WebSocket not ready:", { blob: !!blob, socketState: socketRef.current?.readyState });
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
    console.log("Stopping recognition, closing WebSocket");
    setIsRecognizing(false);
    setFrameData(null);
    setRecognitionResults([]);

    if (socketRef.current) {
      socketRef.current.close();
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
                <h3 className="text-lg font-semibold mb-2 text-green-600">Kết quả nhận diện (có bounding box):</h3>
                <img
                  ref={imgRef}
                  src={frameData}
                  alt="Processed frame with bounding boxes"
                  className="w-full max-h-64 object-contain border-2 border-green-500 rounded"
                />
              </div>
            )}
          </div>

          <div className="w-80 bg-gray-50 p-4 rounded-lg overflow-y-auto">
            <div className="mb-4">
              <button
                onClick={isRecognizing ? stopRecognition : startRecognition}
                disabled={isProcessing}
                className={`w-full py-2 px-4 rounded ${isRecognizing
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
                      {result.ocr_results ? (
                        `Biển số: ${result.ocr_results.join(", ") || "Không nhận diện được"}`
                      ) : (
                        result.message || "Frame được xử lý"
                      )}
                    </p>
                    <p className="text-sm text-gray-500">
                      {result.boxes ? `Số lượng: ${result.boxes.length}` : "Đang xử lý..."}
                    </p>
                    {result.hasDetection && (
                      <p className="text-xs text-green-600">✓ Có detection</p>
                    )}
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

