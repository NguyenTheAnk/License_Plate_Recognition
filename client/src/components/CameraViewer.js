/* eslint-disable no-use-before-define */
import React, { useRef, useEffect, useState, useCallback } from "react";
import Hls from "hls.js";
import "./hideVideoControls.css";
import { fetchDataFromAPI } from "../utils/auth";


const CameraViewer = ({ camera, actionBar, onClose, isRecognizing: externalIsRecognizing, recordingTimer }) => {
  const videoRef = useRef(null);
  // const imgRef = useRef(null); // overlay removed
  const wsRetryTimeoutRef = useRef(null);
  const videoRetryTimeoutRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [recognitionResults, setRecognitionResults] = useState([]); // debug/info only
  const [frameData, setFrameData] = useState(null);
  const [isRecognizing, setIsRecognizing] = useState(externalIsRecognizing || false);
  const [databaseResults, setDatabaseResults] = useState([]);
  const [isLoadingDatabase, setIsLoadingDatabase] = useState(false);
  const [realtimeDetections, setRealtimeDetections] = useState([]);
  const [lastDetectionTime, setLastDetectionTime] = useState(null);
  const [videoReady, setVideoReady] = useState(false); // Thêm state để track video readiness
  const wsRef = useRef(null);
  const wsRetryCount = useRef(0);
  const maxWsRetries = 5; // Tăng số lần retry
  const [isProcessing, setIsProcessing] = useState(false);
  // const [isUploadedVideo, setIsUploadedVideo] = useState(false);
  const sendFrameTimeoutRef = useRef(null);
  const currentTimeRef = useRef(0);

  // Dùng để tránh cảnh báo biến không dùng
  useEffect(() => { }, [recognitionResults]);

  // Function to fetch realtime detections
  const fetchRealtimeDetections = useCallback(async () => {
    try {
      const response = await fetchDataFromAPI('/api/plate-recognitions/realtime?limit=5');
      if (response.success && response.data) {
        setRealtimeDetections(response.data);

        // Check for new detections
        if (response.data.length > 0) {
          const latestDetection = response.data[0];
          const detectionTime = new Date(latestDetection.detected_at).getTime();

          if (!lastDetectionTime || detectionTime > lastDetectionTime) {
            setLastDetectionTime(detectionTime);



            // Trigger refresh of main detection list
            if (window.refreshDetectionResults) {
              window.refreshDetectionResults();
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching realtime detections:', error);
    }
  }, [lastDetectionTime]);

  // Poll for realtime detections every 2 seconds when recognizing
  useEffect(() => {
    let interval;
    if (isRecognizing) {
      interval = setInterval(fetchRealtimeDetections, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecognizing, fetchRealtimeDetections]);

  const forcePlayVideo = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return false;

    try {
      if (video.paused || video.ended) {
        await video.play();
        return true;
      }
      return true;
    } catch (error) {
      console.error("Force play video failed:", error);
      return false;
    }
  }, []);

  const stopRecognition = useCallback(() => {
    if (isProcessing) {
      return;
    }
    setIsProcessing(true);
    setIsRecognizing(false);
    setFrameData(null);
    setRecognitionResults([]);

    // FIXED: Dừng video hoàn toàn khi stop recognition
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
      // Không xóa src để giữ video element
    }

    if (wsRef.current) {
      try {
        if (
          wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING
        ) {
          wsRef.current.close(1000, "Recognition stopped by user");
        }
        wsRef.current = null;
      } catch (error) {
        console.error("Error closing WebSocket:", error);
      }
    }

    // Clear all timeouts
    if (sendFrameTimeoutRef.current) {
      clearTimeout(sendFrameTimeoutRef.current);
      sendFrameTimeoutRef.current = null;
    }
    if (wsRetryTimeoutRef.current) {
      clearTimeout(wsRetryTimeoutRef.current);
      wsRetryTimeoutRef.current = null;
    }
    if (videoRetryTimeoutRef.current) {
      clearTimeout(videoRetryTimeoutRef.current);
      videoRetryTimeoutRef.current = null;
    }

    wsRetryCount.current = 0;
    setIsProcessing(false);
  }, [isProcessing]);

  // FIXED: Thêm hàm close video hoàn toàn
  const closeVideo = useCallback(() => {
    // Dừng recognition trước
    stopRecognition();

    // Đóng video hoàn toàn
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.src = "";
      video.load(); // Reset video element
    }

    // Reset states
    setVideoReady(false);
    setLoading(true);

    // Gọi onClose callback nếu có
    if (onClose) {
      onClose();
    }
  }, [stopRecognition, onClose]);

  const startRecognition = useCallback(() => {
    if (isProcessing) {
      return;
    }
    setIsProcessing(true);

    // Kiểm tra video đã sẵn sàng chưa
    const video = videoRef.current;
    if (!video) {
      setIsProcessing(false);
      return;
    }

    // Kiểm tra video đã load chưa
    if (!videoReady) {
      // Đợi video ready
      const checkVideoReady = () => {
        if (videoReady) {
          setIsRecognizing(true);
          setIsProcessing(false);
        } else {
          setTimeout(checkVideoReady, 100);
        }
      };
      checkVideoReady();
      return;
    }

    // Kiểm tra video đang phát chưa
    if (video.paused || video.ended) {
      video.play().then(() => {
        setIsRecognizing(true);
        setIsProcessing(false);
      }).catch((err) => {
        console.error("Failed to play video:", err);
        setIsProcessing(false);
      });
      return;
    }

    // Video đã sẵn sàng, bắt đầu recognition
    setIsRecognizing(true);
    setIsProcessing(false);
  }, [isProcessing, camera.id, videoReady]);

  // AUTO START RECOGNITION: Tự động bắt đầu nhận diện khi video ready
  const autoStartRecognition = useCallback(() => {
    if (!videoReady || isRecognizing || isProcessing) {
      return;
    }

    // FIXED: Bỏ console.log để giảm noise
    setIsRecognizing(true);
  }, [videoReady, isRecognizing, isProcessing, camera.name]);

  // Di chuyển sendFrames lên trước để tránh lỗi hoisting
  const sendFrames = useCallback(() => {
    const frameStartTime = performance.now();
    // Optimized: Remove logging for better FPS
    if (
      !isRecognizing ||
      !wsRef.current ||
      wsRef.current.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    // Kiểm tra xem có phải video file không
    const isVideoFile = camera.streamUrl && (camera.streamUrl.includes('.mp4') || camera.streamUrl.includes('.avi') || camera.streamUrl.includes('.mov'));

    // Nếu là video file, không cần gửi frames - Python sẽ xử lý trực tiếp từ URL
    if (isVideoFile) {
      // FIXED: Bỏ console.log để giảm noise
      return;
    }

    // Thông tin nguồn đã được gửi khi kết nối WebSocket, không cần gửi lại mỗi frame

    const video = videoRef.current;
    if (!video || video.paused || video.ended || !video.src) {
      // FIXED: Kiểm tra video có bị đóng hoàn toàn không
      if (!video || !video.src) {
        // Video đã bị đóng hoàn toàn, dừng recognition
        setIsRecognizing(false);
        return;
      }

      // Thử force play video nếu bị paused
      if (video && (video.paused || video.ended)) {
        forcePlayVideo();
      }

      // Don't retry here - let the main timeout handle it
      return;
    }

    try {
      const canvas = document.createElement("canvas");
      // Sử dụng kích thước video thực tế để tránh distortion
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Optimized: Remove performance logging for better FPS
      canvas.toBlob((blob) => {
        if (blob && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          blob.arrayBuffer().then((buffer) => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              // Kiểm tra kích thước buffer trước khi gửi
              if (buffer.byteLength > 200000) { // Tăng giới hạn lên 200KB
                return; // Skip without logging for performance
              }

              // Gửi frame trực tiếp qua WebSocket
              wsRef.current.send(buffer);
            }
          }).catch((error) => {
            console.error("Error converting blob to buffer:", error);
          });
        }
      }, "image/jpeg", 0.7); // Optimized quality for full detection

      // Fixed FPS for consistent 20 FPS - optimized for full detection
      const frameTime = 50; // Fixed 20 FPS (1000ms / 20 = 50ms)

      if (isRecognizing) {
        sendFrameTimeoutRef.current = setTimeout(sendFrames, frameTime);
      }
    } catch (error) {
      console.error("Error in sendFrames:", error);

      // Fallback to fixed 20 FPS on error
      if (isRecognizing) {
        sendFrameTimeoutRef.current = setTimeout(sendFrames, 50);
      }
    }
  }, [isRecognizing, forcePlayVideo, camera.streamUrl]);

  // Function để fetch kết quả từ database
  const fetchDatabaseResults = async () => {
    try {
      setIsLoadingDatabase(true);
      const token = localStorage.getItem('token');
      const response = await fetchDataFromAPI('/api/plate-recognitions', token, {
        params: {
          page: 1,
          limit: 100,
          sort_by: 'detected_at',
          sort_order: 'DESC'
        }
      });

      if (response && response.success && response.data) {
        setDatabaseResults(response.data);
      } else {
        console.error('❌ Failed to fetch database results:', response);
      }
    } catch (error) {
      console.error('❌ Error fetching database results:', error);
    } finally {
      setIsLoadingDatabase(false);
    }
  };

  // Fetch database results khi component mount và định kỳ
  useEffect(() => {
    fetchDatabaseResults();

    // Fetch database results mỗi 2 giây để cập nhật realtime
    const interval = setInterval(() => {
      fetchDatabaseResults();
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // WebSocket connection effect
  useEffect(() => {
    const tryConnectWebSocket = async () => {
      const wsStartTime = performance.now();
      if (!isRecognizing) {
        console.log("Nhận diện đã dừng, không thử kết nối lại");
        return;
      }

      // FIXED: Kiểm tra video có bị đóng không
      const video = videoRef.current;
      if (!video || !video.src) {
        console.log("Video đã bị đóng, dừng kết nối WebSocket");
        setIsRecognizing(false);
        return;
      }

      if (wsRetryCount.current >= maxWsRetries) {
        console.error("Không thể kết nối WebSocket sau nhiều lần thử.");
        alert("Không thể kết nối WebSocket sau nhiều lần thử.");
        setIsRecognizing(false);
        return;
      }

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log("Closing existing WebSocket connection...");
        wsRef.current.close();
        wsRef.current = null;
      }

      // Thử nhiều host khác nhau
      const possibleHosts = [
        '127.0.0.1:5002',
        `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}`,
        `${window.location.hostname}:5002`
      ];

      const wsHost = process.env.REACT_APP_DETECT_HOST || possibleHosts[0];
      const wsUrl = `ws://${wsHost}/recognize-ws`;

      try {
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {

          wsRetryCount.current = 0;

          // Gửi thông tin nguồn ngay sau khi kết nối
          // FIXED: Convert camera.id to string before using startsWith
          const cameraIdStr = String(camera.id || '');
          const isVideoUpload = cameraIdStr && cameraIdStr.startsWith('upload-');
          // Chỉ coi là video file nếu URL chứa /uploads/videos/ hoặc /temp_videos/
          const isVideoFile = camera.streamUrl && (
            camera.streamUrl.includes('/uploads/videos/') || 
            camera.streamUrl.includes('/temp_videos/') ||
            camera.streamUrl.includes('localhost:5001/uploads/videos/')
          );

          const sourceInfo = {
            type: 'source_info',
            source_type: isVideoUpload ? 'video_upload' : (isVideoFile ? 'video_file' : 'camera'),
            video_filename: isVideoUpload ? camera.name : (isVideoFile ? camera.name : null),
            video_url: isVideoFile ? camera.streamUrl : null,
            // FIXED: Luôn gửi camera_id và camera_name thực tế từ database
            camera_id: camera.id,  // Sử dụng camera ID thực tế từ database
            camera_name: camera.name,  // Sử dụng tên camera thực tế từ database
            camera_location: camera.location_name || camera.location || null  // Thêm thông tin location
          };
          
          // Debug logging
          console.log('📤 Sending source info to WebSocket:', sourceInfo);

          try {
            wsRef.current.send(JSON.stringify(sourceInfo));
            // FIXED: Bỏ console.log để giảm noise
          } catch (error) {
            console.error("Error sending source info:", error);
          }

          if (isRecognizing) {
            // FIXED: Bỏ console.log để giảm noise
            // Đợi một chút trước khi bắt đầu gửi frames
            setTimeout(() => {
              if (isRecognizing && wsRef.current?.readyState === WebSocket.OPEN) {
                sendFrames();
              }
            }, 100);
          }
        };

        wsRef.current.onmessage = (event) => {
          const messageStartTime = performance.now();

          if (event.data instanceof Blob) {
            // CRITICAL FIX: Hiển thị processed frame từ server

            try {
              // Tạo object URL từ blob
              const imageUrl = URL.createObjectURL(event.data);

              // Tìm video element
              const video = videoRef.current;
              if (video) {
                // Tạo canvas để display processed frame
                let canvas = document.getElementById(`canvas-${camera.id}`);
                if (!canvas) {
                  canvas = document.createElement('canvas');
                  canvas.id = `canvas-${camera.id}`;
                  canvas.style.position = 'absolute';
                  canvas.style.top = '0';
                  canvas.style.left = '0';
                  canvas.style.width = '100%';
                  canvas.style.height = '100%';
                  canvas.style.zIndex = '10';
                  canvas.style.pointerEvents = 'none';
                  video.parentElement.appendChild(canvas);
                }

                // Load và display processed image
                const img = new Image();
                img.onload = function () {
                  canvas.width = img.width;
                  canvas.height = img.height;

                  const ctx = canvas.getContext('2d');
                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                  ctx.drawImage(img, 0, 0);


                  // Cleanup
                  URL.revokeObjectURL(imageUrl);
                };

                img.onerror = function (e) {
                  URL.revokeObjectURL(imageUrl);
                };

                img.src = imageUrl;
              }

              // FPS counter removed - no longer needed

            } catch (error) {
              console.error('Error processing frame blob:', error);
            }

          } else {
            // Xử lý JSON message (metadata)
            try {
              const data = JSON.parse(event.data);

              // Xử lý heartbeat
              if (data.type === 'heartbeat') {
                return;
              }

              // Xử lý error message
              if (data.type === 'error') {
                return;
              }

              if (data.status === 'connected') {
                return;
              }

              // Xử lý detection result metadata
              if (data.type === 'detection_result') {




              }

            } catch (parseError) {
              console.error("Error parsing WebSocket message:", parseError);
            }
          }

        };

        wsRef.current.onerror = (error) => {


          // Không tăng retry count ngay lập tức, đợi onclose
          if (wsRetryTimeoutRef.current) {
            clearTimeout(wsRetryTimeoutRef.current);
          }
        };

        wsRef.current.onclose = (event) => {
          console.log(
            "Kết nối WebSocket đã đóng, lý do:",
            event.reason,
            "mã:",
            event.code,
            "isRecognizing:",
            isRecognizing
          );

          // FIXED: Kiểm tra video có bị đóng không
          const video = videoRef.current;
          if (!video || !video.src) {
            // Video đã bị đóng, dừng recognition
            setIsRecognizing(false);
            return;
          }

          // Chỉ retry nếu đang nhận diện và không phải đóng bình thường
          if (
            isRecognizing &&
            event.code !== 1000 && // 1000 means normal close
            wsRetryCount.current < maxWsRetries
          ) {
            wsRetryCount.current++;
            if (wsRetryTimeoutRef.current) {
              clearTimeout(wsRetryTimeoutRef.current);
            }

            // Tăng thời gian delay giữa các lần retry
            const delay = Math.min(2000 * Math.pow(2, wsRetryCount.current - 1), 10000);
            wsRetryTimeoutRef.current = setTimeout(tryConnectWebSocket, delay);
          } else if (event.code !== 1000) {
            setIsRecognizing(false);
          } else {
            console.log("WebSocket closed normally");
          }
        };

      } catch (error) {
        console.error("❌ Error creating WebSocket connection:", error);
        wsRetryCount.current++;
        if (isRecognizing && wsRetryCount.current < maxWsRetries) {
          wsRetryTimeoutRef.current = setTimeout(tryConnectWebSocket, 2000);
        }
      }
    };

    if (isRecognizing) {
      tryConnectWebSocket();
    }

    // Cleanup function chỉ chạy khi component unmount hoặc khi isRecognizing thay đổi từ true sang false
    return () => {
      // Chỉ đóng WebSocket khi component unmount hoặc khi dừng recognition
      if (!isRecognizing && wsRef.current) {
        wsRef.current.close(1000, "Recognition stopped");
        wsRef.current = null;
      }
      if (wsRetryTimeoutRef.current) {
        clearTimeout(wsRetryTimeoutRef.current);
        wsRetryTimeoutRef.current = null;
      }
    };
  }, [isRecognizing]); // Chỉ phụ thuộc vào isRecognizing, không phụ thuộc vào externalIsRecognizing

  // Sync external isRecognizing with internal state
  useEffect(() => {
    if (externalIsRecognizing !== undefined && externalIsRecognizing !== isRecognizing) {
      setIsRecognizing(externalIsRecognizing);
    }
  }, [externalIsRecognizing]); // Loại bỏ isRecognizing khỏi dependencies để tránh vòng lặp

  // Separate effect for handling external state changes
  useEffect(() => {
    if (externalIsRecognizing && !isRecognizing) {
      setIsRecognizing(true);
    } else if (!externalIsRecognizing && isRecognizing) {
      setIsRecognizing(false);
    }
  }, [externalIsRecognizing]); // Chỉ phụ thuộc vào externalIsRecognizing

  // AUTO START RECOGNITION: Tự động bắt đầu nhận diện khi video ready
  useEffect(() => {
    if (videoReady && !isRecognizing && !isProcessing) {
      // Đợi một chút để đảm bảo video đã ổn định
      const timer = setTimeout(() => {
        autoStartRecognition();
      }, 1000); // Đợi 1 giây sau khi video ready

      return () => clearTimeout(timer);
    }
  }, [videoReady, isRecognizing, isProcessing, autoStartRecognition]);

  // Video initialization effect (unchanged)
  useEffect(() => {
    let hls;
    const video = videoRef.current;

    const initPlayer = () => {
      let retryCount = 0;
      const maxRetries = 3;

      const tryInitPlayer = () => {
        const startTime = performance.now();
        if (!camera.streamUrl || !video) return;

        const isHls = camera.streamUrl.includes(".m3u8");
        const isMp4 = camera.streamUrl.includes(".mp4");
        const isRtsp = camera.streamUrl.includes("rtsp://");

        if (isRtsp) {
          // RTSP stream - sử dụng FFmpeg conversion endpoint
          const convertedUrl = `http://localhost:5000/api/rtsp-stream?url=${encodeURIComponent(camera.streamUrl)}`;
          video.src = convertedUrl;
          video.load();
          setLoading(false);
        } else if (isHls && Hls.isSupported()) {
          // Low-latency live settings
          hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            // keep live buffer very small
            maxBufferLength: 3,
            maxMaxBufferLength: 5,
            liveSyncDuration: 2,
            liveMaxLatencyDuration: 3,
            backBufferLength: 0,
            liveBackBufferLength: 0,
            // timeouts
            fragLoadingTimeOut: 10000,
            manifestLoadingTimeOut: 10000,
            levelLoadingTimeOut: 10000,
            nudgeOffset: 0.1,
            maxFragLookUpTolerance: 0.1,
            lowBufferWatchdogPeriod: 0.25,
          });

          if (!hls.url || hls.url !== camera.streamUrl) {
            hls.loadSource(camera.streamUrl);
          }
          hls.attachMedia(video);

          const jumpToLiveEdge = () => {
            try {
              if (hls.liveSyncPosition) {
                video.currentTime = hls.liveSyncPosition;
              } else if (video.seekable && video.seekable.length) {
                video.currentTime = video.seekable.end(video.seekable.length - 1);
              }
            } catch (e) { /* ignore */ }
          };

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setLoading(false);
            setVideoReady(true); // Đánh dấu video đã sẵn sàng
            retryCount = 0;
            if (videoRetryTimeoutRef.current) {
              clearTimeout(videoRetryTimeoutRef.current);
              videoRetryTimeoutRef.current = null;
            }
            // force live-edge
            hls.startLoad(-1);
            jumpToLiveEdge();
            // const playStart = performance.now();
            video.play().catch((err) => {
              console.error("Lỗi phát video HLS:", err);
              if (retryCount < maxRetries) {
                videoRetryTimeoutRef.current = setTimeout(() => video.play(), 2000);
                retryCount++;
              }
            });
          });

          // On each level load keep at live edge for live playlists
          hls.on(Hls.Events.LEVEL_LOADED, (event, data) => {
            if (data && data.details && data.details.live) {
              jumpToLiveEdge();
            }
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
                    videoRetryTimeoutRef.current = setTimeout(tryInitPlayer, 3000);
                  } else {
                    alert("Không thể tải stream HLS sau nhiều lần thử.");
                  }
                  break;
              }
            }
          });
        } else if (isMp4 || video.canPlayType("video/mp4")) {
          if (video.src !== camera.streamUrl) {
            video.src = camera.streamUrl;
          }
          video.addEventListener("loadedmetadata", () => {
            setLoading(false);
            setVideoReady(true); // Đánh dấu video đã sẵn sàng
            if (videoRetryTimeoutRef.current) {
              clearTimeout(videoRetryTimeoutRef.current);
              videoRetryTimeoutRef.current = null;
            }
            if (currentTimeRef.current > 0 && !isNaN(currentTimeRef.current)) {
              video.currentTime = currentTimeRef.current;
            }
            video.play().catch((err) => {
              console.error("Lỗi phát video MP4:", err);
              if (retryCount < maxRetries) {
                retryCount++;
                videoRetryTimeoutRef.current = setTimeout(tryInitPlayer, 2000);
              }
            });
          });
        } else {
          alert("Trình duyệt không hỗ trợ định dạng video cho camera " + camera.id);
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

      // Thêm event listener để theo dõi trạng thái video
      video.addEventListener("pause", () => {
        if (isRecognizing) {
          video.play().catch((err) => {
            console.error("Failed to resume video:", err);
          });
        }
      });

      video.addEventListener("ended", () => {
        if (isRecognizing) {
          video.currentTime = 0;
          video.play().catch((err) => {
            console.error("Failed to restart video:", err);
          });
        }
      });
    }

    initPlayer();

    return () => {
      if (hls) hls.destroy();
      if (video) {
        video.removeEventListener("timeupdate", handleTimeUpdate);
        video.removeEventListener("pause", () => { });
        video.removeEventListener("ended", () => { });
        video.src = "";
        video.pause();
      }
      if (videoRetryTimeoutRef.current) {
        clearTimeout(videoRetryTimeoutRef.current);
        videoRetryTimeoutRef.current = null;
      }
      // Reset video ready state
      setVideoReady(false);
      // KHÔNG gọi stopRecognition() trong cleanup để tránh vòng lặp vô hạn
      // stopRecognition();
    };
  }, [camera.streamUrl, camera.id]); // Loại bỏ isRecognizing khỏi dependencies

  // useEffect(() => {
  //   setIsUploadedVideo(camera.id.startsWith("upload-"));
  // }, [camera.id]);


  // Ẩn số 0 có thể xuất hiện
  useEffect(() => {
    const hideZeroElements = () => {
      // Tìm và ẩn mọi element chứa số 0 ở góc dưới trái
      const allElements = document.querySelectorAll('*');
      allElements.forEach(element => {
        if (element.textContent === '0' &&
          element.style.position === 'absolute' &&
          element.style.bottom === '0px' &&
          element.style.left === '0px') {
          element.style.display = 'none';
        }
      });
    };

    // Chạy ngay lập tức
    hideZeroElements();

    // Chạy lại sau mỗi 100ms để đảm bảo
    const interval = setInterval(hideZeroElements, 100);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        minHeight: "300px", // Chiều cao vừa phải
        maxHeight: "350px" // Giới hạn chiều cao tối đa
      }}
    >
      <style jsx>{`
        /* Ẩn mọi text overlay trên video - chỉ trong video container */
        .video-container video::-webkit-media-controls {
          display: none !important;
        }
        .video-container video::-webkit-media-controls-enclosure {
          display: none !important;
        }
        .video-container video::-webkit-media-controls-panel {
          display: none !important;
        }
        .video-container video::-webkit-media-controls-current-time-display {
          display: none !important;
        }
        .video-container video::-webkit-media-controls-time-remaining-display {
          display: none !important;
        }
        .video-container video::-moz-media-controls {
          display: none !important;
        }
        /* Ẩn bất kỳ text hoặc số nào ở góc dưới trái - chỉ trong video container */
        .video-container video + div[style*="position: absolute"][style*="bottom"][style*="left"] {
          display: none !important;
        }
        .video-container div[style*="position: absolute"][style*="bottom: 0"][style*="left: 0"] {
          display: none !important;
        }
        
        /* Ẩn số 0 cụ thể ở góc dưới trái - chỉ áp dụng cho video container */
        .video-container div:contains("0") {
          position: relative;
        }
        .video-container div:contains("0"):not([class*="action"]):not([class*="button"]):not([class*="btn"]):not([class*="camera"]) {
          display: none !important;
        }
        
        /* Ẩn mọi element có text "0" ở vị trí góc dưới trái - chỉ trong video container */
        .video-container *[style*="position: absolute"][style*="bottom"][style*="left"]:contains("0") {
          display: none !important;
        }
      `}</style>
      {/* Không hiển thị loading overlay để giữ video sạch */}
      <div
        className="video-container"
        style={{
          position: "relative",
          width: "100%",
          height: "calc(100% - 50px)",
          minHeight: "250px", // Chiều cao vừa phải cho video
          maxHeight: "300px", // Giới hạn chiều cao tối đa
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <video
          id={`video-${camera.id}`}
          ref={videoRef}
          controls={false}
          autoPlay
          muted
          playsInline
          disablePictureInPicture
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "8px 8px 0 0",
            backgroundColor: "#000",
            objectFit: "contain",
            // Luôn hiển thị video gốc
            display: "block",
            // Ẩn các controls và overlays
            WebkitUserSelect: "none",
            MozUserSelect: "none",
            msUserSelect: "none",
            userSelect: "none",
            pointerEvents: "none"
          }}
          onError={(e) => console.error('Video error:', e)}
          onClick={() =>
            videoRef.current
              ?.play()
              .catch((err) => console.error("Lỗi phát thủ công:", err))
          }
        />

        {/* ĐÃ LOẠI BỎ overlay kết quả nhận diện để giữ video sạch */}

        {/* Recording Timer Overlay */}
        {recordingTimer && recordingTimer > 0 && (
          <div
            style={{
              position: "absolute",
              top: "10px",
              right: "10px",
              background: "rgba(244, 67, 54, 0.9)",
              color: "white",
              padding: "8px 12px",
              borderRadius: "4px",
              fontSize: "14px",
              fontFamily: "monospace",
              fontWeight: "bold",
              pointerEvents: "none",
              zIndex: 1000,
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <div
              style={{
                width: "8px",
                height: "8px",
                backgroundColor: "white",
                borderRadius: "50%",
                animation: "pulse 1s infinite"
              }}
            />
            REC {Math.floor(recordingTimer / 60)}:{(recordingTimer % 60).toString().padStart(2, '0')}
          </div>
        )}

        {/* Realtime Detections Overlay */}
        {isRecognizing && realtimeDetections.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: "10px",
              right: "10px",
              background: "rgba(0, 0, 0, 0.8)",
              color: "white",
              padding: "10px",
              borderRadius: "8px",
              fontSize: "12px",
              maxWidth: "300px",
              maxHeight: "200px",
              overflowY: "auto",
              pointerEvents: "none",
            }}
          >
            <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
              🔍 Realtime Detections
            </div>
            {realtimeDetections.slice(0, 3).map((detection, index) => (
              <div
                key={detection.id}
                style={{
                  marginBottom: "6px",
                  padding: "4px 6px",
                  borderRadius: "4px",
                  backgroundColor: detection.is_whitelist_match ? "rgba(0, 255, 0, 0.2)" :
                    detection.is_blacklist_match ? "rgba(255, 0, 0, 0.2)" : "rgba(128, 128, 128, 0.2)",
                  border: detection.is_whitelist_match ? "1px solid #00ff00" :
                    detection.is_blacklist_match ? "1px solid #ff0000" : "1px solid #808080",
                }}
              >
                <div style={{ fontWeight: "bold", fontSize: "14px" }}>
                  {detection.plate_number}
                </div>
                <div style={{ fontSize: "10px", opacity: 0.8 }}>
                  {Math.round(detection.confidence_score * 100)}% • {
                    detection.is_whitelist_match ? '✅ Whitelist' :
                      detection.is_blacklist_match ? '🚨 Blacklist' : '❓ Unknown'
                  } • {new Date(detection.detected_at).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Hiển thị trạng thái recognition */}
        {isRecognizing && (
          <div
            style={{
              position: "absolute",
              top: "10px",
              right: "10px",
              background: "rgba(0, 255, 0, 0.8)",
              color: "white",
              padding: "5px 10px",
              borderRadius: "4px",
              fontSize: "12px",
              pointerEvents: "none",
            }}
          >
            {camera.streamUrl && (camera.streamUrl.includes('.mp4') || camera.streamUrl.includes('.avi') || camera.streamUrl.includes('.mov'))
              ? "🎬 Auto Video Recognition"
              : "🔍 Recognition ON"}
          </div>
        )}
      </div>

      <div style={{ width: "100%" }}>
        {actionBar({
          startRecognition,
          stopRecognition,
          closeVideo,  // FIXED: Thêm hàm close video
          isRecognizing,
          isProcessing,
          onForcePlay: forcePlayVideo,  // Thêm force play function
        })}
      </div>

      {/* Không hiển thị panel overlay để giữ video sạch */}
    </div>
  );
};

export default CameraViewer;
