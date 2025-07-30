import React, { useRef, useEffect, useState } from "react";
import Hls from "hls.js";
import "./hideVideoControls.css";

const CameraViewer = ({ camera, actionBar, onClose }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const wsRetryTimeoutRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [recognitionResults, setRecognitionResults] = useState([]);
  const [detections, setDetections] = useState([]);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const wsRef = useRef(null);
  const wsRetryCount = useRef(0);
  const maxWsRetries = 3;
  const [fps, setFps] = useState(0);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(0);
  const animationFrameRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const isRecognizingRef = useRef(false);
  const [isUploadedVideo, setIsUploadedVideo] = useState(false);

  useEffect(() => {
    let hls;
    const video = videoRef.current;

    const initPlayer = () => {
      let retryCount = 0;
      const maxRetries = 3;

      const tryInitPlayer = () => {
        if (!camera.streamUrl || !video) return;

        // Kiểm tra định dạng của streamUrl (HLS hay MP4)
        const isHls = camera.streamUrl.includes(".m3u8");
        const isMp4 = camera.streamUrl.includes(".mp4");

        if (isHls && Hls.isSupported()) {
          // Xử lý stream HLS
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

          hls.loadSource(camera.streamUrl);
          hls.attachMedia(video);

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setLoading(false);
            retryCount = 0;
            video.play().catch((err) => {
              console.error("Lỗi phát video HLS:", err);
              setTimeout(() => video.play(), 2000);
            });
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
                  if (retryCount < maxRetries) {
                    retryCount++;
                    setTimeout(tryInitPlayer, 3000);
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
          // Xử lý video MP4
          video.src = camera.streamUrl;
          video.addEventListener("loadedmetadata", () => {
            setLoading(false);
            video.play().catch((err) => {
              console.error("Lỗi phát video MP4:", err);
              if (retryCount < maxRetries) {
                retryCount++;
                setTimeout(tryInitPlayer, 2000);
              } else {
                alert("Không thể tải video MP4 sau nhiều lần thử.");
              }
            });
          });
        } else {
          alert(
            "Trình duyệt không hỗ trợ định dạng video cho camera " + camera.id
          );
        }
      };

      tryInitPlayer();
    };

    initPlayer();

    return () => {
      if (hls) hls.destroy();
      if (videoRef.current) {
        videoRef.current.src = "";
        videoRef.current.pause();
      }
      stopRecognition();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [camera.streamUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const drawCanvas = () => {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      const displayWidth = video.clientWidth;
      const displayHeight = video.clientHeight;

      if (videoWidth && videoHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;

        const scaleX = displayWidth / videoWidth;
        const scaleY = displayHeight / videoHeight;

        // Vẽ các detection
        detections.forEach((detection) => {
          const [x, y, w, h] = detection.object_bbox;
          const left = x * scaleX;
          const top = y * scaleY;
          const width = w * scaleX;
          const height = h * scaleY;

          ctx.strokeStyle = "red";
          ctx.lineWidth = 2;
          ctx.strokeRect(left, top, width, height);
          ctx.fillStyle = "red";
          ctx.font = "14px Arial";
          ctx.fillText(detection.object_class, left, top > 10 ? top - 5 : 10);
        });

        // Vẽ FPS ở góc phải trên
        ctx.fillStyle = "yellow";
        ctx.font = "16px Arial";
        ctx.textAlign = "right";
        ctx.fillText(`${fps.toFixed(1)} FPS`, canvas.width - 10, 20);

        // Tính FPS
        frameCountRef.current += 1;
        const currentTime = performance.now();
        const deltaTime = currentTime - lastTimeRef.current;

        if (deltaTime >= 1000) {
          setFps(frameCountRef.current / (deltaTime / 1000));
          frameCountRef.current = 0;
          lastTimeRef.current = currentTime;
        }
      }

      // Tiếp tục vòng lặp vẽ
      animationFrameRef.current = requestAnimationFrame(drawCanvas);
    };

    // Bắt đầu vòng lặp vẽ
    drawCanvas();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [detections, fps]);

  useEffect(() => {
    // Kiểm tra xem có phải video tải lên không
    setIsUploadedVideo(camera.id.startsWith("upload-"));
  }, [camera.id]);

  const setRecognizing = (value) => {
    setIsRecognizing(value);
    isRecognizingRef.current = value;
  };

  const startRecognition = () => {
    if (isProcessing) return;
    setIsProcessing(true);

    // Kiểm tra loại nguồn
    if (!camera.id || !camera.streamUrl) {
      console.error("ID camera hoặc URL stream không hợp lệ");
      alert("Không thể bắt đầu nhận diện: Thiếu ID camera hoặc URL stream.");
      setIsProcessing(false);
      return;
    }

    if (isRecognizing) {
      console.log("Nhận diện đang chạy, không bắt đầu lại");
      setIsProcessing(false);
      return;
    }

    setRecognizing(true);
    tryConnectWebSocket();
    setIsProcessing(false);
  };

  const tryConnectWebSocket = () => {
    if (!isRecognizingRef.current) {
      console.log("Nhận diện đã dừng, không thử kết nối lại");
      return;
    }

    if (wsRetryCount.current >= maxWsRetries) {
      alert("Không thể kết nối WebSocket sau nhiều lần thử.");
      setRecognizing(false);
      return;
    }

    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      console.log("Closing existing WebSocket connection...");
      wsRef.current.close(1000, "New connection requested");
      wsRef.current = null;
    }

    wsRef.current = new WebSocket("ws://localhost:5002/recognize-ws");

    wsRef.current.onopen = () => {
      console.log("Kết nối WebSocket đã được thiết lập");
      wsRetryCount.current = 0;
      setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          if (isUploadedVideo) {
            wsRef.current.send(
              JSON.stringify({
                streamId: camera.id,
                videoUrl: camera.streamUrl,
              })
            );
          } else {
            wsRef.current.send(
              JSON.stringify({
                streamId: camera.id,
                rtspUrl: camera.streamUrl,
              })
            );
          }
          console.log("Đã gửi thông điệp WebSocket:", {
            streamId: camera.id,
            rtspUrl: camera.streamUrl,
          });
        }
      }, 100);
    };

    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.error) {
          console.error("Lỗi từ WebSocket:", data.error);
          alert("Lỗi nhận diện: " + data.error);
          setRecognizing(false);
          return;
        }
        if (data.objects) {
          setDetections(data.objects);
          setRecognitionResults((prev) =>
            [
              ...prev,
              {
                timestamp: new Date().toLocaleTimeString(),
                objects: data.objects,
              },
            ].slice(-5)
          );
        }
      } catch (error) {
        console.error("Lỗi xử lý thông điệp WebSocket:", error);
        setRecognizing(false);
      }
    };

    wsRef.current.onerror = (error) => {
      console.error("Lỗi WebSocket:", error);
      wsRetryCount.current++;

      // Hủy timeout cũ nếu có
      if (wsRetryTimeoutRef.current) {
        clearTimeout(wsRetryTimeoutRef.current);
      }

      // Chỉ retry nếu vẫn đang trong chế độ nhận diện
      if (isRecognizing && wsRetryCount.current < maxWsRetries) {
        wsRetryTimeoutRef.current = setTimeout(tryConnectWebSocket, 2000);
      } else {
        setRecognizing(false);
      }
    };

    wsRef.current.onclose = (event) => {
      console.log(
        "Kết nối WebSocket đã đóng, lý do:",
        event.reason,
        "mã:",
        event.code
      );

      // Chỉ retry nếu vẫn đang trong chế độ nhận diện
      if (
        isRecognizing &&
        event.code !== 1000 &&
        wsRetryCount.current < maxWsRetries
      ) {
        wsRetryCount.current++;
        if (wsRetryTimeoutRef.current) {
          clearTimeout(wsRetryTimeoutRef.current);
        }
        wsRetryTimeoutRef.current = setTimeout(tryConnectWebSocket, 2000);
      } else if (event.code !== 1000) {
        setRecognizing(false);
      }
    };
  };

  const stopRecognition = () => {
    if (isProcessing) return;
    setIsProcessing(true);
    console.log("Đang dừng nhận diện...");

    setRecognizing(false);
    setDetections([]);
    setRecognitionResults([]);

    if (wsRef.current) {
      try {
        if (
          wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING
        ) {
          wsRef.current.close(1000, "Recognition stopped by user");
          console.log("WebSocket đã được yêu cầu đóng");
        } else {
          console.log("WebSocket đã ở trạng thái đóng hoặc đang đóng");
        }
      } catch (error) {
        console.error("Lỗi khi đóng WebSocket:", error);
      }
      wsRef.current = null;
    } else {
      console.log("Không có WebSocket để đóng");
    }

    if (wsRetryTimeoutRef.current) {
      clearTimeout(wsRetryTimeoutRef.current);
      wsRetryTimeoutRef.current = null;
    }

    // Đóng kết nối WebSocket nếu có
    if (wsRef.current) {
      try {
        if (
          [WebSocket.OPEN, WebSocket.CONNECTING].includes(
            wsRef.current.readyState
          )
        ) {
          wsRef.current.close(1000, "Recognition stopped by user");
        }
        wsRef.current = null;
      } catch (error) {
        console.error("Lỗi khi đóng WebSocket:", error);
      }
    }

    wsRetryCount.current = 0;
    setRecognizing(false);
    setDetections([]);
    setRecognitionResults([]);
    console.log("Nhận diện đã dừng, trạng thái đã được reset");
    setIsProcessing(false);
  };

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        minHeight: "300px",
      }}
    >
      {loading && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "white",
            zIndex: 10,
          }}
        >
          Đang tải video...
        </div>
      )}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "calc(100% - 50px)",
        }}
      >
        <video
          id={`video-${camera.id}`}
          ref={videoRef}
          controls={false}
          autoPlay
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "8px 8px 0 0",
            backgroundColor: "#000",
            objectFit: "cover",
          }}
          onClick={() =>
            videoRef.current
              ?.play()
              .catch((err) => console.error("Lỗi phát thủ công:", err))
          }
        />
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        />
      </div>
      <div style={{ width: "100%" }}>
        {actionBar({
          startRecognition,
          stopRecognition,
          isRecognizing,
          isProcessing,
        })}
      </div>
      {recognitionResults.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "10px",
            left: "10px",
            backgroundColor: "rgba(0,0,0,0.7)",
            color: "white",
            padding: "10px",
            borderRadius: "5px",
            maxWidth: "300px",
            maxHeight: "150px",
            overflowY: "auto",
          }}
        >
          <h4>Kết quả nhận diện:</h4>
          {recognitionResults.map((result, index) => (
            <div key={index}>
              <strong>{result.timestamp}</strong>:{" "}
              {result.objects.length > 0
                ? result.objects.map((obj, objIndex) => (
                    <div key={objIndex}>
                      {obj.object_class} (Vị trí: {obj.object_bbox.join(", ")})
                    </div>
                  ))
                : "Không tìm thấy đối tượng"}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CameraViewer;
