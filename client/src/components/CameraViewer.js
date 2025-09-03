import React, { useRef, useEffect, useState, useCallback } from "react";
import Hls from "hls.js";
import FlvJs from "flv.js";
import "./hideVideoControls.css";

const CameraViewer = ({ camera, actionBar, onClose, onStreamError = null }) => {
  const videoRef = useRef(null);
  const imgRef = useRef(null);
  const wsRetryTimeoutRef = useRef(null);
  const videoRetryTimeoutRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [recognitionResults, setRecognitionResults] = useState([]);
  const [frameData, setFrameData] = useState(null);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const wsRef = useRef(null);
  const wsRetryCount = useRef(0);
  const maxWsRetries = 3;
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploadedVideo, setIsUploadedVideo] = useState(false);
  const sendFrameTimeoutRef = useRef(null);
  const currentTimeRef = useRef(0); // Lưu vị trí hiện tại của video
  const isComponentMounted = useRef(true);
  const activeBlobUrls = useRef(new Set());
  const [processedVideoWs, setProcessedVideoWs] = useState(null);
  const [streamKey, setStreamKey] = useState(0);
  const [isProcessedVideo, setIsProcessedVideo] = useState(false);
  const recognitionWsRef = useRef(null);
  const isRecognizingRef = useRef(isRecognizing);
  const [activeStreamType, setActiveStreamType] = useState("normal");
  const [hlsStreamUrl, setHlsStreamUrl] = useState(null);
  const [hlsPlayer, setHlsPlayer] = useState(null);

  useEffect(() => {
    isRecognizingRef.current = isRecognizing;
  }, [isRecognizing]);

  // Hàm revoke Blob URL an toàn
  const safeRevokeBlobUrl = useCallback((url) => {
    if (url && activeBlobUrls.current.has(url)) {
      try {
        URL.revokeObjectURL(url);
        activeBlobUrls.current.delete(url);
      } catch (e) {
        console.warn("Lỗi khi revoke Blob URL:", e);
      }
    }
  }, []);

  // Hàm tạo Blob URL an toàn
  const safeCreateBlobUrl = useCallback((blob) => {
    try {
      const url = URL.createObjectURL(blob);
      activeBlobUrls.current.add(url);
      return url;
    } catch (e) {
      console.error("Lỗi khi tạo Blob URL:", e);
      return null;
    }
  }, []);

  // Thêm hàm để quản lý bộ nhớ tốt hơn
  const manageFrameData = (newFrameUrl) => {
    if (frameData) {
      URL.revokeObjectURL(frameData);
    }
    setFrameData(newFrameUrl);
  };

  // Cleanup khi component unmount
  useEffect(() => {
    isComponentMounted.current = true;

    return () => {
      isComponentMounted.current = false;

      // Đóng tất cả WebSocket connections
      if (wsRef.current) {
        wsRef.current.close(1000, "Component unmounted");
        wsRef.current = null;
      }

      // Xóa tất cả timeouts
      [wsRetryTimeoutRef, videoRetryTimeoutRef, sendFrameTimeoutRef].forEach(
        (ref) => {
          if (ref.current) {
            clearTimeout(ref.current);
            ref.current = null;
          }
        }
      );

      // Revoke tất cả Blob URLs
      activeBlobUrls.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {
          console.warn("Lỗi khi revoke Blob URL trong cleanup:", e);
        }
      });
      activeBlobUrls.current.clear();
    };
  }, []);

  useEffect(() => {
    isComponentMounted.current = true;
    return () => {
      isComponentMounted.current = false;
      // Dọn dẹp khi component unmount
      if (wsRef.current) {
        wsRef.current.close(1000, "Component unmounted");
        wsRef.current = null;
      }
      if (wsRetryTimeoutRef.current) {
        clearTimeout(wsRetryTimeoutRef.current);
      }
      if (videoRetryTimeoutRef.current) {
        clearTimeout(videoRetryTimeoutRef.current);
      }
      if (sendFrameTimeoutRef.current) {
        clearTimeout(sendFrameTimeoutRef.current);
      }
      // Revoke any existing blob URLs
      if (frameData) {
        URL.revokeObjectURL(frameData);
      }
    };
  }, []);

  useEffect(() => {
    // Kiểm tra nếu là video đã xử lý
    const isProcessed =
      camera.streamUrl &&
      (camera.streamUrl.includes("process-local-video") ||
        camera.streamUrl.includes("api/process-local-video"));
    setIsProcessedVideo(isProcessed);
  }, [camera.streamUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !camera.streamUrl) return;
    let hls;

    if (camera.isHls) {
      // Xử lý HLS stream với nhận diện biển số
      if (Hls.isSupported()) {
        const hls = new Hls({
          maxBufferLength: 60,
          maxMaxBufferLength: 120,
          liveSyncDuration: 60,
          liveMaxLatencyDuration: 120,
          enableWorker: true,
        });

        hls.loadSource(camera.streamUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(console.error);
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari native support
        video.src = camera.streamUrl;
        video.addEventListener("loadedmetadata", () => {
          setLoading(false);
          video.play().catch(console.error);
        });
      }
    } else if (isProcessedVideo) {
      // Xử lý video stream đã được xử lý
      setLoading(true);
      video.src = camera.streamUrl;

      video.onloadeddata = () => {
        if (isComponentMounted.current) {
          setLoading(false);
          video.play().catch(console.error);
        }
      };

      video.onerror = () => {
        if (isComponentMounted.current) {
          setLoading(false);
          onStreamError?.(camera.id, "processed_video");
        }
      };
    } else if (!isRecognizing && !isProcessedVideo) {
      const initPlayer = () => {
        let retryCount = 0;
        const maxRetries = 3;

        const tryInitPlayer = () => {
          const startTime = performance.now();
          if (!camera.streamUrl || !video || !isComponentMounted.current)
            return;

          const isHls = camera.streamUrl.includes(".m3u8");
          const isWs = camera.streamUrl.startsWith("ws://");
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

            // Chỉ load source nếu chưa được tải
            if (!hls.url || hls.url !== camera.streamUrl) {
              hls.loadSource(camera.streamUrl);
            }
            hls.attachMedia(video);
            console.log(
              `HLS load/attach time: ${performance.now() - startTime}ms`
            );

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              setLoading(false);
              retryCount = 0;
              if (videoRetryTimeoutRef.current) {
                clearTimeout(videoRetryTimeoutRef.current);
                videoRetryTimeoutRef.current = null;
              }
              // Khôi phục vị trí hiện tại nếu có
              if (
                currentTimeRef.current > 0 &&
                !isNaN(currentTimeRef.current)
              ) {
                video.currentTime = currentTimeRef.current;
              }
              const playStart = performance.now();
              video.play().catch((err) => {
                console.error("Lỗi phát video HLS:", err);
                console.log(
                  `Video play attempt time: ${performance.now() - playStart}ms`
                );
                if (retryCount < maxRetries && isRecognizing) {
                  videoRetryTimeoutRef.current = setTimeout(
                    () => video.play(),
                    2000
                  );
                  retryCount++;
                }
              });
              console.log(
                `HLS manifest parsed time: ${performance.now() - startTime}ms`
              );
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
                      videoRetryTimeoutRef.current = setTimeout(
                        tryInitPlayer,
                        3000
                      );
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
          } else if (isWs) {
            // Xử lý WebSocket stream
            const ws = new WebSocket(camera.streamUrl);
            ws.binaryType = "arraybuffer";

            ws.onopen = () => {
              if (!isComponentMounted.current) {
                ws.close();
                return;
              }
              console.log("WebSocket video stream connected");
              ws.send(
                JSON.stringify({ type: "start_stream", cameraId: camera.id })
              );
              setLoading(false);
            };

            ws.onmessage = (event) => {
              if (!isComponentMounted.current) {
                ws.close();
                return;
              }
              if (event.data instanceof ArrayBuffer) {
                const blob = new Blob([event.data], { type: "image/jpeg" });
                const url = safeCreateBlobUrl(blob);

                if (url && imgRef.current) {
                  if (frameData) {
                    safeRevokeBlobUrl(frameData);
                  }
                  imgRef.current.src = url;
                  setFrameData(url);
                }
              }
            };

            ws.onerror = (error) => {
              if (!isComponentMounted.current) return;
              console.error("WebSocket stream error:", error);
            };

            ws.onclose = () => {
              if (!isComponentMounted.current) return;
              console.log("WebSocket stream closed");
              setLoading(false);
            };
          } else if (isMp4 || video.canPlayType("video/mp4")) {
            video.src = camera.streamUrl;
            video.addEventListener("loadedmetadata", () => {
              if (!isComponentMounted.current) return;
              setLoading(false);
              if (videoRetryTimeoutRef.current) {
                clearTimeout(videoRetryTimeoutRef.current);
                videoRetryTimeoutRef.current = null;
              }
              // Khôi phục vị trí hiện tại nếu có
              if (
                currentTimeRef.current > 0 &&
                !isNaN(currentTimeRef.current)
              ) {
                video.currentTime = currentTimeRef.current;
              }
              const playStart = performance.now();
              video.play().catch((err) => {
                console.error("Lỗi phát video MP4:", err);
                console.log(
                  `Video play attempt time: ${performance.now() - playStart}ms`
                );
                if (
                  retryCount < maxRetries &&
                  isRecognizing &&
                  isComponentMounted.current
                ) {
                  retryCount++;
                  videoRetryTimeoutRef.current = setTimeout(
                    tryInitPlayer,
                    2000
                  );
                } else {
                  alert("Không thể tải video MP4 sau nhiều lần thử.");
                }
              });
              console.log(
                `MP4 metadata loaded time: ${performance.now() - startTime}ms`
              );
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
        if (videoRetryTimeoutRef.current) {
          clearTimeout(videoRetryTimeoutRef.current);
          videoRetryTimeoutRef.current = null;
        }
        if (video) {
          video.pause();
          video.src = "";
        }
      };
    }
    return () => {
      if (video) {
        video.src = "";
        video.pause();
      }
    };
  }, [
    camera.streamUrl,
    isProcessedVideo,
    streamKey,
    isRecognizing,
    camera.isHls,
  ]);

  useEffect(() => {
    if (!isProcessedVideo || !camera.streamUrl) return;

    let isMounted = true;
    setLoading(true);

    const ws = new WebSocket(camera.streamUrl);
    setProcessedVideoWs(ws);

    ws.onopen = () => {
      if (!isMounted) return;
      console.log("Kết nối WebSocket cho video đã xử lý đã được thiết lập");
      setLoading(false);
    };

    ws.onmessage = (event) => {
      if (!isMounted) return;

      if (event.data instanceof Blob) {
        const url = URL.createObjectURL(event.data);
        manageFrameData(url);
      }
    };

    ws.onerror = (error) => {
      if (!isMounted) return;
      console.error("Lỗi WebSocket video đã xử lý:", error);
      onStreamError?.(camera.id, "processed_video");
      setLoading(false);
    };

    ws.onclose = () => {
      if (!isMounted) return;
      console.log("Kết nối WebSocket video đã xử lý đã đóng");
      setLoading(false);
    };

    return () => {
      isMounted = false;
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
    };
  }, [camera.streamUrl, isProcessedVideo, onStreamError, streamKey]);

  useEffect(() => {
    const tryConnectWebSocket = () => {
      const wsStartTime = performance.now();
      if (!isRecognizingRef.current || !isComponentMounted.current) {
        console.log("Nhận diện đã dừng, không thử kết nối lại");
        return;
      }

      if (wsRetryCount.current >= maxWsRetries) {
        alert("Không thể kết nối WebSocket sau nhiều lần thử.");
        setIsRecognizing(false);
        return;
      }

      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        console.log("Closing existing WebSocket connection...");
        wsRef.current.close(1000, "New connection requested");
        wsRef.current = null;
      }

      wsRef.current = new WebSocket("ws://localhost:5002/recognize-ws");
      console.log(
        `WebSocket connection attempt time: ${
          performance.now() - wsStartTime
        }ms`
      );

      wsRef.current.onopen = () => {
        if (!isComponentMounted.current) {
          wsRef.current.close();
          return;
        }
        console.log("Kết nối WebSocket đã được thiết lập");
        wsRetryCount.current = 0;
        console.log(
          `WebSocket open time: ${performance.now() - wsStartTime}ms`
        );
        if (isRecognizing) sendRTSPUrl();
      };

      wsRef.current.onmessage = async (event) => {
        if (!isComponentMounted.current) {
          wsRef.current.close();
          return;
        }

        if (event.data instanceof Blob) {
          const url = URL.createObjectURL(event.data);
          imgRef.current.src = url;
          setFrameData(url);
          URL.revokeObjectURL(frameData);
        } else {
          try {
            const metadata = JSON.parse(event.data);
            if (metadata.error) {
              console.error("WebSocket error from server:", metadata.error);
              setIsRecognizing(false);
              return;
            }
            setRecognitionResults((prev) => {
              const newResult = {
                timestamp: new Date().toLocaleTimeString(),
                boxes: metadata.boxes || [],
                labels: metadata.labels || [],
              };
              return [...prev, newResult].slice(-5);
            });
          } catch (e) {
            console.error("Lỗi phân tích dữ liệu JSON:", e);
          }
        }
      };

      wsRef.current.onerror = (error) => {
        if (!isComponentMounted.current) return;
        console.error("Lỗi WebSocket:", error);
        wsRetryCount.current++;
        if (wsRetryTimeoutRef.current) {
          clearTimeout(wsRetryTimeoutRef.current);
        }
        if (
          isRecognizing &&
          wsRetryCount.current < maxWsRetries &&
          isComponentMounted.current
        ) {
          wsRetryTimeoutRef.current = setTimeout(tryConnectWebSocket, 2000);
        } else {
          setIsRecognizing(false);
        }
      };

      wsRef.current.onclose = (event) => {
        if (!isComponentMounted.current) return;
        console.log(
          "Kết nối WebSocket đã đóng, lý do:",
          event.reason,
          "mã:",
          event.code
        );
        if (
          isRecognizing &&
          event.code !== 1000 &&
          wsRetryCount.current < maxWsRetries &&
          isComponentMounted.current
        ) {
          wsRetryCount.current++;
          if (wsRetryTimeoutRef.current) {
            clearTimeout(wsRetryTimeoutRef.current);
          }
          wsRetryTimeoutRef.current = setTimeout(tryConnectWebSocket, 2000);
        } else if (event.code !== 1000) {
          setIsRecognizing(false);
        }
      };
    };

    if (isRecognizing) {
      tryConnectWebSocket();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close(1000, "Component unmounted");
        wsRef.current = null;
      }
      if (wsRetryTimeoutRef.current) {
        clearTimeout(wsRetryTimeoutRef.current);
        wsRetryTimeoutRef.current = null;
      }
      if (videoRetryTimeoutRef.current) {
        clearTimeout(videoRetryTimeoutRef.current);
        videoRetryTimeoutRef.current = null;
      }
    };
  }, [isRecognizing, camera.id, camera.streamUrl, isUploadedVideo]);

  useEffect(() => {
    setIsUploadedVideo(camera.id.startsWith("upload-"));
  }, [camera.id]);

  const sendRTSPUrl = () => {
    if (
      !isRecognizing ||
      !wsRef.current ||
      wsRef.current.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    // Kiểm tra RTSP URL hợp lệ
    if (camera.rtspUrl && camera.rtspUrl.startsWith("rtsp://")) {
      console.log("Sending RTSP URL to recognition server:", camera.rtspUrl);
      wsRef.current.send(
        JSON.stringify({
          type: "rtsp_url",
          url: camera.rtspUrl,
          cameraId: camera.id,
        })
      );
    } else {
      console.error("URL RTSP không hợp lệ:", camera.rtspUrl);

      // Hiển thị thông báo lỗi chi tiết
      let errorMessage = "URL RTSP không hợp lệ. ";

      if (!camera.rtspUrl) {
        errorMessage += "Không có RTSP URL được cung cấp. ";
      } else if (!camera.rtspUrl.startsWith("rtsp://")) {
        errorMessage += "URL không bắt đầu với 'rtsp://'. ";
      }

      errorMessage += "Vui lòng kiểm tra cấu hình camera trong database.";

      // Dừng nhận diện và thông báo lỗi
      stopRecognition();
      alert(errorMessage);
    }
  };

  const startRecognition = () => {
    if (isProcessing) return;
    setIsProcessing(true);
    if (!camera.rtspUrl || !camera.rtspUrl.startsWith("rtsp://")) {
      console.error("RTSP URL không hợp lệ:", camera.rtspUrl);
      setIsProcessing(false);
      return;
    }
    setActiveStreamType("recognition");
    setIsRecognizing(true);

    // Dừng stream từ server nếu đang chạy (ví dụ: dừng HLS hoặc WS từ server)
    if (videoRef.current) {
      videoRef.current.pause(); // Dừng video từ server
      videoRef.current.src = ""; // Xóa source để dừng stream
    }
    if (wsRef.current) {
      // Nếu đang có WS từ server, đóng nó
      wsRef.current.close(1000, "Switching to recognition stream");
      wsRef.current = null;
    }

    // Kết nối WebSocket đến plate_recognition
    const wsUrl = "ws://localhost:5002/recognize-ws"; // Thay bằng URL thực tế của plate_recognition
    recognitionWsRef.current = new WebSocket(wsUrl);
    recognitionWsRef.current.binaryType = "arraybuffer";

    recognitionWsRef.current.onopen = () => {
      console.log("Kết nối WebSocket recognition thành công");
      // Gửi RTSP URL đến plate_recognition
      recognitionWsRef.current.send(
        JSON.stringify({
          type: "rtsp_url",
          url: camera.rtspUrl, // Gửi RTSP URL
          cameraId: camera.id,
        })
      );
      setLoading(false);
    };

    recognitionWsRef.current.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        const blob = new Blob([event.data], { type: "image/jpeg" });
        const url = safeCreateBlobUrl(blob);
        if (url && imgRef.current) {
          safeRevokeBlobUrl(frameData); // Revoke URL cũ
          imgRef.current.src = url;
          setFrameData(url);
        }
      } else {
        // Xử lý metadata nếu cần (ví dụ: recognition results)
        try {
          const metadata = JSON.parse(event.data);
          if (metadata.error) {
            console.error("Recognition error:", metadata.error);
            setIsRecognizing(false);
          } else {
            setRecognitionResults((prev) => [...prev, metadata].slice(-5));
          }
        } catch (e) {
          console.error("Lỗi parse JSON:", e);
        }
      }
    };

    recognitionWsRef.current.onerror = (error) => {
      console.error("Lỗi WebSocket recognition:", error);
      setIsRecognizing(false);
    };

    recognitionWsRef.current.onclose = () => {
      console.log("WebSocket recognition đóng");
      setIsRecognizing(false);
    };

    setIsProcessing(false);
  };

  const stopRecognition = () => {
    if (isProcessing) {
      console.log("Bỏ qua lệnh dừng nhận diện, đang xử lý");
      return;
    }
    setIsProcessing(true);
    console.log("Đang dừng nhận diện, đóng WebSocket");
    setIsRecognizing(false);
    setFrameData(null);
    setRecognitionResults([]);

    // Clear ALL timeouts
    if (wsRetryTimeoutRef.current) {
      clearTimeout(wsRetryTimeoutRef.current);
      wsRetryTimeoutRef.current = null;
    }

    if (recognitionWsRef.current) {
      recognitionWsRef.current.close(1000, "Nhận diện đã dừng");
      recognitionWsRef.current = null;
    }

    if (wsRef.current) {
      try {
        wsRef.current.close(1000, "Nhận diện bị dừng bởi người dùng");
      } catch (error) {
        console.error("Lỗi khi đóng WebSocket:", error);
      }
      wsRef.current = null;
    }

    if (sendFrameTimeoutRef.current) {
      clearTimeout(sendFrameTimeoutRef.current);
      sendFrameTimeoutRef.current = null;
    }

    if (videoRetryTimeoutRef.current) {
      clearTimeout(videoRetryTimeoutRef.current);
      videoRetryTimeoutRef.current = null;
    }

    wsRetryCount.current = 0;

    // QUAN TRỌNG: Khởi động lại stream thông thường
    // Tăng streamKey để kích hoạt effect khởi tạo lại video player
    setStreamKey((prev) => prev + 1);

    // Reset trạng thái để đảm bảo video được hiển thị
    setTimeout(() => {
      if (isComponentMounted.current) {
        setIsProcessing(false);

        // Đảm bảo video element được hiển thị lại
        if (videoRef.current) {
          videoRef.current.style.display = "block";
          // Thử phát video lại
          videoRef.current.play().catch(console.error);
        }
        if (imgRef.current) {
          imgRef.current.style.display = "none";
        }
      }
    }, 100);
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
          {isProcessedVideo && <div>Video đã xử lý</div>}
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
          key={`video-${camera.id}-${streamKey}`}
          id={`video-${camera.id}`}
          ref={videoRef}
          controls={false}
          autoPlay
          muted={isProcessedVideo}
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "8px 8px 0 0",
            backgroundColor: "#000",
            objectFit: "cover",
            display: isRecognizing ? "none" : "block",
            // display: activeStreamType === "llhls" ? "block" : "none",
          }}
          onClick={() =>
            videoRef.current
              ?.play()
              .catch((err) => console.error("Lỗi phát thủ công:", err))
          }
        />
        <img
          ref={imgRef}
          src={frameData}
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "8px 8px 0 0",
            backgroundColor: "#000",
            objectFit: "cover",
            position: "absolute",
            top: 0,
            left: 0,
            display: isProcessedVideo ? "block" : frameData ? "block" : "none",
            // display: camera.isHls ? "block" : "none",
          }}
          alt="Processed video frame"
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
    </div>
  );
};

export default CameraViewer;
