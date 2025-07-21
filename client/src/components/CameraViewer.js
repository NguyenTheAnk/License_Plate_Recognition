import React, { useRef, useEffect, useState } from "react";
import Hls from "hls.js";
import "./hideVideoControls.css";

const CameraViewer = ({ camera, actionBar, onClose }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [recognitionResults, setRecognitionResults] = useState([]);
  const [detections, setDetections] = useState([]);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const wsRef = useRef(null);
  const wsRetryCount = useRef(0);
  const maxWsRetries = 3;

  useEffect(() => {
    let hls;
    const video = videoRef.current;

    const initPlayer = () => {
      let retryCount = 0;
      const maxRetries = 3;

      const tryInitPlayer = () => {
        if (!camera.streamUrl || !video) return;
        if (camera.streamUrl && videoRef.current) {
          if (Hls.isSupported()) {
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
                console.error("Lỗi phát video:", err);
                setTimeout(() => video.play(), 2000);
              });
            });

            hls.on(Hls.Events.ERROR, (event, data) => {
              console.error("Lỗi HLS:", data);
              setLoading(false);
              if (data.fatal) {
                switch (data.type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    console.log("Lỗi mạng, thử khôi phục...");
                    hls.startLoad();
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    console.log("Lỗi media, khôi phục...");
                    hls.recoverMediaError();
                    break;
                  default:
                    console.log("Lỗi không khắc phục được, thử lại...");
                    hls.destroy();
                    if (retryCount < maxRetries) {
                      retryCount++;
                      setTimeout(tryInitPlayer, 3000);
                    } else {
                      alert("Không thể tải stream sau nhiều lần thử.");
                    }
                    break;
                }
              } else if (data.details === 'bufferStalledError') {
                console.log("Bộ đệm bị kẹt, thử tải lại...");
                hls.startLoad();
              }
            });
          } else if (
            videoRef.current.canPlayType("application/vnd.apple.mpegurl")
          ) {
            videoRef.current.src = camera.streamUrl;
            videoRef.current.addEventListener("loadedmetadata", () => {
              videoRef.current.play().catch((err) => {
                console.error("Lỗi phát:", err);
                if (retryCount < maxRetries) {
                  retryCount++;
                  setTimeout(tryInitPlayer, 2000);
                } else {
                  alert("Không thể tải stream sau nhiều lần thử.");
                }
              });
            });
          } else {
            alert("Trình duyệt không hỗ trợ HLS cho camera " + camera.id);
          }
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
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [camera.streamUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

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
    }
  }, [detections]);

  const startRecognition = () => {
    if (!camera.id || !camera.streamUrl) {
      console.error("ID camera hoặc URL stream không hợp lệ");
      alert("Không thể bắt đầu nhận diện: Thiếu ID camera hoặc URL stream.");
      return;
    }

    const tryConnectWebSocket = () => {
      if (wsRetryCount.current >= maxWsRetries) {
        alert("Không thể kết nối WebSocket sau nhiều lần thử.");
        setIsRecognizing(false);
        return;
      }

      wsRef.current = new WebSocket('ws://localhost:5002/recognize-ws');

      wsRef.current.onopen = () => {
        console.log("Kết nối WebSocket đã được thiết lập");
        wsRetryCount.current = 0;
        setTimeout(() => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ streamId: camera.id, rtspUrl: camera.streamUrl }));
            console.log("Đã gửi thông điệp WebSocket:", { streamId: camera.id, rtspUrl: camera.streamUrl });
          }
        }, 100);
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.error) {
            console.error("Lỗi từ WebSocket:", data.error);
            alert("Lỗi nhận diện: " + data.error);
            setIsRecognizing(false);
            return;
          }
          if (data.objects) {
            setDetections(data.objects);
            setRecognitionResults((prev) => [
              ...prev,
              { timestamp: new Date().toLocaleTimeString(), objects: data.objects }
            ].slice(-5));
          }
        } catch (error) {
          console.error("Lỗi xử lý thông điệp WebSocket:", error);
          setIsRecognizing(false);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error("Lỗi WebSocket:", error);
        wsRetryCount.current++;
        setTimeout(tryConnectWebSocket, 2000);
      };

      wsRef.current.onclose = (event) => {
        console.log("Kết nối WebSocket đã đóng, lý do:", event.reason, "mã:", event.code);
        if (event.code === 1005 && wsRetryCount.current < maxWsRetries) {
          wsRetryCount.current++;
          setTimeout(tryConnectWebSocket, 2000);
        } else {
          alert("Kết nối WebSocket thất bại. Vui lòng kiểm tra server.");
          setIsRecognizing(false);
        }
      };
    };

    setIsRecognizing(true);
    tryConnectWebSocket();
  };

  const stopRecognition = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setIsRecognizing(false);
    setDetections([]);
    wsRetryCount.current = 0;
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
      <div style={{ position: "relative", width: "100%", height: "calc(100% - 50px)" }}>
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
      <div style={{ width: "100%" }}>{actionBar({ startRecognition, stopRecognition, isRecognizing })}</div>
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