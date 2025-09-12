/* eslint-disable no-use-before-define */
import React, { useRef, useEffect, useState, useCallback } from "react";
import Hls from "hls.js";
import "./hideVideoControls.css";
import { fetchDataFromAPI } from "../utils/auth";


const CameraViewer = ({ camera, actionBar, onClose, isRecognizing: externalIsRecognizing, recordingTimer }) => {
  console.log('CameraViewer props:', { camera, externalIsRecognizing });
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
  useEffect(() => {}, [recognitionResults]);

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
            
            // Show notification for new detection
            if (latestDetection.is_whitelist_match) {
              console.log('✅ WHITELIST MATCH:', latestDetection.plate_number);
              // You can add toast notification here
            } else if (latestDetection.is_blacklist_match) {
              console.log('🚨 BLACKLIST MATCH:', latestDetection.plate_number);
              // You can add alert notification here
            } else {
              console.log('🔍 NEW DETECTION:', latestDetection.plate_number);
            }
            
            // Trigger refresh of main detection list
            if (window.refreshDetectionResults) {
              console.log('🔄 Triggering main list refresh...');
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
        console.log("Force playing video...");
        await video.play();
        console.log("Video force play successful");
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
      console.log("Stop recognition ignored, processing in progress");
      return;
    }
    setIsProcessing(true);
    console.log("Stopping recognition, closing WebSocket");
    setIsRecognizing(false);
    setFrameData(null);
    setRecognitionResults([]);

    if (wsRef.current) {
      try {
        if (
          wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING
        ) {
          wsRef.current.close(1000, "Recognition stopped by user");
          console.log("WebSocket close requested");
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

  const startRecognition = useCallback(() => {
    if (isProcessing) {
      console.log("Stop recognition ignored, processing in progress");
      return;
    }
    setIsProcessing(true);
    console.log("Starting recognition for camera:", camera.id);
    
    // Kiểm tra video đã sẵn sàng chưa
    const video = videoRef.current;
    if (!video) {
      console.error("Video element not found");
      setIsProcessing(false);
      return;
    }

    // Kiểm tra video đã load chưa
    if (!videoReady) {
      console.log("Video not ready yet, waiting...");
      // Đợi video ready
      const checkVideoReady = () => {
        if (videoReady) {
          console.log("Video is now ready, starting recognition...");
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
      console.log("Video is paused/ended, attempting to play...");
      video.play().then(() => {
        console.log("Video started playing, starting recognition...");
        setIsRecognizing(true);
        setIsProcessing(false);
      }).catch((err) => {
        console.error("Failed to play video:", err);
        setIsProcessing(false);
      });
      return;
    }

    // Video đã sẵn sàng, bắt đầu recognition
    console.log("Video is ready, starting recognition...");
    setIsRecognizing(true);
    setIsProcessing(false);
  }, [isProcessing, camera.id, videoReady]);

  // Di chuyển sendFrames lên trước để tránh lỗi hoisting
  const sendFrames = useCallback(() => {
    const frameStartTime = performance.now();
    console.log(`🔄 sendFrames called - isRecognizing: ${isRecognizing}, wsState: ${wsRef.current?.readyState}`);
    
    if (
      !isRecognizing ||
      !wsRef.current ||
      wsRef.current.readyState !== WebSocket.OPEN
    ) {
      console.log("❌ WebSocket not ready for sending frames", {
        isRecognizing,
        wsConnected: wsRef.current?.readyState === WebSocket.OPEN
      });
      return;
    }

    // Thông tin nguồn đã được gửi khi kết nối WebSocket, không cần gửi lại mỗi frame

    const video = videoRef.current;
    if (!video || video.paused || video.ended) {
      console.log("❌ Video not ready for frame capture:", { 
        video: !!video, 
        paused: video?.paused, 
        ended: video?.ended,
        readyState: video?.readyState
      });
      
      // Thử force play video nếu bị paused
      if (video && (video.paused || video.ended)) {
        console.log("🔄 Attempting to force play video...");
        forcePlayVideo();
      }
      
      // Don't retry here - let the main timeout handle it
      return;
    }
    
    console.log("✅ Video ready for frame capture");

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 640; // Giảm kích thước để tăng hiệu suất
      canvas.height = 360;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const canvasDrawTime = performance.now();
      console.log(`Canvas draw time: ${canvasDrawTime - frameStartTime}ms`);

      canvas.toBlob((blob) => {
        if (blob && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const blobStartTime = performance.now();
          blob.arrayBuffer().then((buffer) => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              // Kiểm tra kích thước buffer trước khi gửi
              if (buffer.byteLength > 200000) { // Tăng giới hạn lên 200KB
                console.warn(`Frame too large: ${buffer.byteLength} bytes, skipping`);
                return;
              }
              
              // Gửi frame trực tiếp qua WebSocket
              wsRef.current.send(buffer);
              console.log(`📤 Frame sent via WebSocket: ${buffer.byteLength} bytes`);
              console.log(`Blob to buffer and send time: ${performance.now() - blobStartTime}ms`);
            }
          }).catch((error) => {
            console.error("Error converting blob to buffer:", error);
          });
        } else {
          console.log("Blob or WebSocket not ready for sending");
        }
      }, "image/jpeg", 0.8); // Tăng quality để giảm compression overhead

      console.log(`Total frame send time: ${performance.now() - frameStartTime}ms`);
    } catch (error) {
      console.error("Error in sendFrames:", error);
    }

    if (isRecognizing) {
      // Tối ưu FPS - đặt chính xác 20 FPS
      sendFrameTimeoutRef.current = setTimeout(sendFrames, 20); // 50 FPS (1000/20 = 50ms)a
    }
  }, [isRecognizing, forcePlayVideo]);

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
        console.log('✅ Fetched database results:', response.data.length);
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
        'localhost:5002',
        `${window.location.hostname}:5002`
      ];
      
      const wsHost = process.env.REACT_APP_DETECT_HOST || possibleHosts[0];
      const wsUrl = `ws://${wsHost}/recognize-ws`;
      
      console.log(`🔗 Attempting WebSocket connection to: ${wsUrl}`);
      console.log(`🔄 Retry attempt: ${wsRetryCount.current}/${maxWsRetries}`);
      
      // Kiểm tra server health trước khi kết nối WebSocket
      try {
        const healthUrl = `http://${wsHost}/health`;
        console.log(`🏥 Checking server health: ${healthUrl}`);
        
        const healthResponse = await fetch(healthUrl, { 
          method: 'GET',
          mode: 'cors',
          timeout: 5000
        });
        
        if (!healthResponse.ok) {
          throw new Error(`Server health check failed: ${healthResponse.status}`);
        }
        
        const healthData = await healthResponse.json();
        console.log("✅ Server health check passed:", healthData);
        
      } catch (healthError) {
        console.error("❌ Server health check failed:", healthError);
        console.log("🔄 Retrying health check in 2 seconds...");
        
        // Retry health check
        if (isRecognizing && wsRetryCount.current < maxWsRetries) {
          wsRetryTimeoutRef.current = setTimeout(tryConnectWebSocket, 2000);
          return;
        } else {
          console.error("🚫 Max health check retries reached");
          setIsRecognizing(false);
          return;
        }
      }
      
      try {
        wsRef.current = new WebSocket(wsUrl);
        
        console.log(`WebSocket connection attempt time: ${performance.now() - wsStartTime}ms`);

        wsRef.current.onopen = () => {
          console.log("✅ WebSocket connection established successfully!");
          wsRetryCount.current = 0;
          console.log(`⏱️ WebSocket open time: ${performance.now() - wsStartTime}ms`);
          
          // Gửi thông tin nguồn ngay sau khi kết nối
          const isVideoUpload = camera.id && camera.id.startsWith('upload-');
          const isVideoSource = camera.isVideoSource; // Kiểm tra nếu đây là video source cho camera
          
          const sourceInfo = {
            type: 'source_info',
            source_type: isVideoUpload ? 'video_upload' : (isVideoSource ? 'camera_with_video' : 'camera'),
            video_filename: isVideoUpload ? camera.name : (isVideoSource ? camera.videoName : null),
            camera_id: isVideoUpload ? null : camera.id,
            camera_name: isVideoUpload ? null : camera.name, // Luôn gửi tên camera, không phải tên video
            // Thêm thông tin video nếu có
            video_source: isVideoSource ? {
              filename: camera.videoName,
              url: camera.streamUrl
            } : null
          };
          
          try {
            wsRef.current.send(JSON.stringify(sourceInfo));
            console.log(`📤 Source info sent:`, sourceInfo);
          } catch (error) {
            console.error("Error sending source info:", error);
          }
          
          if (isRecognizing) {
            console.log("🎬 Starting to send frames...");
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
  console.log(`📥 WebSocket message received:`, event.data instanceof Blob ? 'Blob' : 'Text', event.data instanceof Blob ? `${event.data.size} bytes` : event.data);
  
  if (event.data instanceof Blob) {
    // CRITICAL FIX: Hiển thị processed frame từ server
    console.log(`📸 Received processed frame: ${event.data.size} bytes`);
    
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
        img.onload = function() {
          canvas.width = img.width;
          canvas.height = img.height;
          
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          
          console.log(`✅ Displayed processed frame on canvas: ${img.width}x${img.height}`);
          
          // Cleanup
          URL.revokeObjectURL(imageUrl);
        };
        
        img.onerror = function(e) {
          console.error('Error loading processed frame:', e);
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
        console.log("💓 Heartbeat received from server");
        return;
      }
      
      // Xử lý error message
      if (data.type === 'error') {
        console.error("❌ Server error:", data.message);
        return;
      }
      
      if (data.status === 'connected') {
        console.log("✅ Connected to WebSocket server");
        return;
      }
      
      // Xử lý detection result metadata
      if (data.type === 'detection_result') {
        console.log(`📊 Detection metadata: ${data.boxes?.length || 0} boxes, ${data.ocr_results?.length || 0} OCR results`);
        console.log(`📍 ROI: [${data.roi?.join(', ') || 'N/A'}]`);
        console.log(`🎬 Frame ${data.frame_count}, Detection: ${data.detection_this_frame ? 'YES' : 'NO'}`);
        
        // Log detection details
        if (data.boxes && data.boxes.length > 0) {
          console.log('📦 Detected boxes:', data.boxes);
        }
        if (data.ocr_results && data.ocr_results.length > 0) {
          console.log('🔤 OCR results:', data.ocr_results);
        }
        
      } else {
        console.log('📝 Other message:', data);
      }
      
    } catch (parseError) {
      console.error("Error parsing WebSocket message:", parseError);
    }
  }
  
  console.log(`Message processing time: ${performance.now() - messageStartTime}ms`);
};

        wsRef.current.onerror = (error) => {
          console.error("❌ WebSocket connection error:", error);
          console.error(`🔗 Failed to connect to: ${wsUrl}`);
          console.error(`🔄 This is retry ${wsRetryCount.current}/${maxWsRetries}`);
          
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
            console.log(`WebSocket closed, retrying in ${delay/1000} seconds... (${wsRetryCount.current}/${maxWsRetries})`);
            wsRetryTimeoutRef.current = setTimeout(tryConnectWebSocket, delay);
          } else if (event.code !== 1000) {
            console.error("WebSocket connection failed permanently");
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
        console.log("Cleaning up WebSocket due to recognition stop");
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
      console.log(`🔄 Syncing external state: ${externalIsRecognizing} -> ${isRecognizing}`);
      setIsRecognizing(externalIsRecognizing);
    }
  }, [externalIsRecognizing]); // Loại bỏ isRecognizing khỏi dependencies để tránh vòng lặp

  // Separate effect for handling external state changes
  useEffect(() => {
    if (externalIsRecognizing && !isRecognizing) {
      console.log("🚀 External recognition started, starting internal recognition");
      setIsRecognizing(true);
    } else if (!externalIsRecognizing && isRecognizing) {
      console.log("⏹️ External recognition stopped, stopping internal recognition");
      setIsRecognizing(false);
    }
  }, [externalIsRecognizing]); // Chỉ phụ thuộc vào externalIsRecognizing

  // Video initialization effect (unchanged)
  useEffect(() => {
    console.log('CameraViewer video init effect - camera:', camera);
    let hls;
    const video = videoRef.current;

    const initPlayer = () => {
      let retryCount = 0;
      const maxRetries = 3;

      const tryInitPlayer = () => {
        const startTime = performance.now();
        console.log('Trying to init player with:', { streamUrl: camera.streamUrl, video: !!video });
        if (!camera.streamUrl || !video) return;

        const isHls = camera.streamUrl.includes(".m3u8");
        const isMp4 = camera.streamUrl.includes(".mp4");
        const isRtsp = camera.streamUrl.includes("rtsp://");

        if (isRtsp) {
          // RTSP stream - sử dụng FFmpeg conversion endpoint
          console.log('RTSP stream detected, using FFmpeg conversion');
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
          console.log(`HLS load/attach time: ${performance.now() - startTime}ms`);

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
          console.log("Loading MP4 video:", camera.streamUrl);
          if (video.src !== camera.streamUrl) {
            video.src = camera.streamUrl;
          }
          video.addEventListener("loadedmetadata", () => {
            console.log("Video metadata loaded");
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
        console.log("Video paused, attempting to resume...");
        if (isRecognizing) {
          video.play().catch((err) => {
            console.error("Failed to resume video:", err);
          });
        }
      });
      
      video.addEventListener("ended", () => {
        console.log("Video ended, attempting to restart...");
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
        video.removeEventListener("pause", () => {});
        video.removeEventListener("ended", () => {});
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

  console.log('CameraViewer render - frameData:', frameData, 'loading:', loading, 'isRecognizing:', isRecognizing, 'videoReady:', videoReady);
  
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
        minHeight: "300px",
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
        
        /* Animation cho spinner loading */
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      {/* Không hiển thị loading overlay để giữ video sạch */}
      <div
        className="video-container"
        style={{
          position: "relative",
          width: "100%",
          height: "100%", // Full height, không trừ action bar
          minHeight: "300px", // Đảm bảo có chiều cao tối thiểu
        }}
      >
        <video
          id={`video-${camera.id}`}
          ref={videoRef}
          controls={false}
          autoPlay={!isRecognizing} // Chỉ autoPlay khi không đang nhận diện
          muted
          playsInline
          disablePictureInPicture
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "0", // Bỏ border radius để video full màn hình
            backgroundColor: "#000",
            objectFit: "contain", // Thay đổi từ "cover" thành "contain" để hiển thị full video
            // Luôn hiển thị video gốc
            display: "block",
            // Ẩn các controls và overlays
            WebkitUserSelect: "none",
            MozUserSelect: "none",
            msUserSelect: "none",
            userSelect: "none",
            pointerEvents: "none"
          }}
          onLoadStart={() => console.log('Video load started')}
          onLoadedData={() => console.log('Video loaded successfully')}
          onCanPlay={() => console.log('Video can play')}
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
        
        {/* Đã xóa Realtime Detections Overlay theo yêu cầu */}
        
        {/* Hiển thị loading khi đang chờ ROI */}
        {isRecognizing && !videoReady && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "rgba(0, 0, 0, 0.8)",
              color: "white",
              padding: "20px",
              borderRadius: "8px",
              fontSize: "14px",
              textAlign: "center",
              pointerEvents: "none",
              zIndex: 1000,
            }}
          >
            <div style={{ marginBottom: "10px" }}>
              <div style={{
                width: "40px",
                height: "40px",
                border: "4px solid #f3f3f3",
                borderTop: "4px solid #4caf50",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                margin: "0 auto"
              }}></div>
            </div>
            <div>Đang khởi tạo nhận diện...</div>
            <div style={{ fontSize: "12px", opacity: 0.8, marginTop: "5px" }}>
              Vui lòng đợi hệ thống thiết lập vùng ROI
            </div>
          </div>
        )}
        
        {/* Hiển thị trạng thái recognition */}
        {isRecognizing && videoReady && (
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
            🔍 Recognition ON
          </div>
        )}
        
        {/* Đã xóa overlay hiển thị tên video theo yêu cầu */}
      </div>

      <div style={{ width: "100%" }}>
        {actionBar({
          startRecognition,
          stopRecognition,
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