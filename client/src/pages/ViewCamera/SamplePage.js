import React, { useState, useRef, useEffect } from "react";
import CameraConfigurationPage from "./CameraConfigurationPage";
import CameraActionBar from "./CameraActionBar";
import "./SamplePage.css";
import ReactDOM from "react-dom";
import { fetchDataFromAPI, postData } from "../../utils/auth";
import CameraViewer from "../../components/CameraViewer";

const SamplePage = () => {
  const [cameraPositions, setCameraPositions] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [showConfig, setShowConfig] = useState(false);
  const [selectedCameraId, setSelectedCameraId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState({});
  const isLoadingStream = useRef(false);
  const [pendingCameraId, setPendingCameraId] = useState(null);
  const [rtspStreams, setRtspStreams] = useState({});
  const [selectedStreams, setSelectedStreams] = useState([]);
  const camerasRef = useRef([]);
  const resizeRefs = useRef({});
  const [cameraSizes, setCameraSizes] = useState({});
  const [uploadedVideos, setUploadedVideos] = useState({});
  const [videos, setVideos] = useState([]); // Thêm state videos

  useEffect(() => {
    camerasRef.current = cameras;
    // Định nghĩa window.startCameraStream và window.startVideoStream
    window.startCameraStream = handleCameraClick;
    window.startVideoStream = (videoId) => {
      const streamId = `video-${videoId}-${Date.now()}`;
      const video = videos.find((v) => v.id === videoId);
      if (video) {
        setRtspStreams((prev) => ({
          ...prev,
          [streamId]: {
            url: video.url,
          },
        }));
        setSelectedStreams((prev) => [...prev, streamId]);
        setCameraSizes((prev) => ({
          ...prev,
          [streamId]: { width: 800, height: 500 },
        }));
      }
    };

    return () => {
      delete window.startCameraStream;
      delete window.startVideoStream; // Xóa khi unmount
    };
  }, [videos]); // Thêm videos vào dependencies để đảm bảo cập nhật khi danh sách video thay đổi

  useEffect(() => {
    if (pendingCameraId && cameras.length > 0) {
      handleCameraClick(pendingCameraId);
      setPendingCameraId(null);
    }
  }, [cameras, pendingCameraId]);

  const fetchCameras = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const data = await fetchDataFromAPI("/api/cameras/streams/all", token);
      const cameraList = data.data?.cameras || [];
      camerasRef.current = cameraList;
      setCameras(cameraList);
      const positions = cameraList.map((camera) => ({
        id: camera.id,
        config: {
          name: camera.name,
          protocol: camera.protocol,
          host: camera.host,
          port: camera.port,
          path: camera.path,
        },
      }));
      setCameraPositions(positions);
    } catch (error) {
      console.error("Fetch error:", error.message);
    } finally {
      setLoading(false);
    }
  };

  const buildRtspUrl = (camera) => {
    if (camera.protocol === "rtsp") {
      if (camera.username && camera.password) {
        return `rtsp://${camera.username}:${camera.password}@${camera.host}:${camera.port}${camera.path}`;
      } else {
        return `rtsp://${camera.host}:${camera.port}${camera.path}`;
      }
    }
    return "";
  };

  // Thay đổi hoàn toàn handleCameraClick
  const handleCameraClick = async (cameraId) => {
    const id = typeof cameraId === "string" ? parseInt(cameraId) : cameraId;
    console.log("Đang chọn camera:", id);

    if (showConfig || isLoadingStream.current) return;

    const camera =
      camerasRef.current.find((c) => c.id === Number(cameraId)) ||
      camerasRef.current.find((c) => c.id === cameraId);

    if (!camera) {
      console.error("Camera not found:", cameraId);
      await fetchCameras();
      const refreshedCamera =
        camerasRef.current.find((c) => c.id === Number(cameraId)) ||
        camerasRef.current.find((c) => c.id === cameraId);
      if (!refreshedCamera) {
        alert(`Không tìm thấy camera ${cameraId}`);
        return;
      }
    }

    if (camera && !camera.rtsp_url) {
      // Thêm URL RTSP vào đối tượng camera nếu chưa có
      camera.rtsp_url = buildRtspUrl(camera);
      console.log("Generated RTSP URL:", camera.rtsp_url);
    }

    const streamId = `${cameraId}-${Date.now()}`;
    isLoadingStream.current = true;

    // Dừng stream hiện tại nếu có
    const existingStream = Object.keys(rtspStreams).find(
      (id) => rtspStreams[id].cameraId === cameraId
    );
    if (existingStream) {
      handleCloseCameraFeed(existingStream);
    }

    try {
      const token = localStorage.getItem("token");
      const type = "hls";
      const result = await postData(
        `/api/cameras/${cameraId}/stream/start`,
        { type: "hls" },
        token
      );

      if (!result.success) {
        alert(result.message || "Không thể phát camera");
        return;
      }

      let streamUrl;
      if (type === "websocket") {
        if (result.data.stream.wsUrl) {
          streamUrl = result.data.stream.wsUrl.replace(
            "localhost",
            window.location.hostname
          );
        } else {
          console.error("WebSocket URL is null");
          // Xử lý fallback hoặc thông báo lỗi
          return;
        }
      } else {
        if (result.data.stream.streamUrl) {
          streamUrl = result.data.stream.streamUrl.replace(
            "localhost",
            window.location.hostname
          );
        } else {
          console.error("Stream URL is null");
          // Xử lý fallback hoặc thông báo lỗi
          return;
        }
      }

      // Lấy RTSP URL từ response
      const rtspUrl = result.data.rtspUrl;
      console.log("Received RTSP URL:", rtspUrl);

      setRtspStreams((prev) => ({
        ...prev,
        [streamId]: {
          cameraId: cameraId,
          url: streamUrl,
          rtspUrl: result.data.rtspUrl,
        },
      }));

      setSelectedStreams((prev) => [...prev, streamId]);
      setCameraSizes((prev) => ({
        ...prev,
        [streamId]: { width: 800, height: 500 },
      }));
    } catch (error) {
      console.error("Error starting stream:", error);
      alert(
        "Không thể phát camera: " + (error.message || "Lỗi không xác định")
      );
    } finally {
      isLoadingStream.current = false;
    }
  };

  const handleRetry = async (streamId) => {
    console.log("Starting retry for streamId:", streamId);
    const streamInfo = rtspStreams[streamId];
    if (!streamInfo || !streamInfo.cameraId) {
      console.error("No RTSP stream info found for streamId:", streamId);
      return;
    }

    const cameraId = streamInfo.cameraId;

    setRetrying((prev) => ({ ...prev, [streamId]: true }));

    try {
      const token = localStorage.getItem("token");
      const result = await postData(
        `/api/cameras/${cameraId}/stream/start`,
        { type: "hls" },
        token
      );

      if (!result.success) {
        alert(result.message || "Không thể phát lại camera");
        return;
      }

      let streamUrl;
      if (result.data.stream.streamUrl) {
        streamUrl = result.data.stream.streamUrl.replace(
          "localhost",
          window.location.hostname
        );
      } else {
        console.error("Stream URL is null");
        return;
      }

      // Tạo stream ID mới để force re-render
      const newStreamId = `stream-${cameraId}-${Date.now()}`;

      // Đóng stream cũ
      handleCloseCameraFeed(streamId);

      // Thêm stream mới
      setRtspStreams((prev) => ({
        ...prev,
        [newStreamId]: {
          cameraId: cameraId,
          url: streamUrl,
          rtspUrl: result.data.rtspUrl,
        },
      }));

      setSelectedStreams((prev) => [...prev, newStreamId]);
      setCameraSizes((prev) => ({
        ...prev,
        [newStreamId]: { width: 800, height: 500 },
      }));
    } catch (error) {
      console.error("Error restarting stream:", error);
      alert(
        "Không thể phát lại camera: " + (error.message || "Lỗi không xác định")
      );
    } finally {
      setRetrying((prev) => ({ ...prev, [streamId]: false }));
    }
  };

  const handleCloseCameraFeed = (streamId) => {
    setSelectedStreams((prev) => prev.filter((id) => id !== streamId));
    setRtspStreams((prev) => {
      const newStreams = { ...prev };
      delete newStreams[streamId];
      return newStreams;
    });
    setCameraSizes((prev) => {
      const newSizes = { ...prev };
      delete newSizes[streamId];
      return newSizes;
    });
    setUploadedVideos((prev) => {
      const newVideos = { ...prev };
      delete newVideos[streamId];
      return newVideos;
    });
  };

  const handleConfigClick = (streamId) => {
    const streamInfo = rtspStreams[streamId] || uploadedVideos[streamId];
    if (!streamInfo) {
      console.error("No stream info found for streamId:", streamId);
      return;
    }

    const cameraId = streamInfo.cameraId || streamId.split("-")[1];
    if (!cameraId) {
      console.error("No cameraId found for streamId:", streamId);
      return;
    }

    setSelectedCameraId(cameraId);
    setShowConfig(true); // Đảm bảo mở modal ngay lập tức
    console.log("Configuring camera with ID:", cameraId);
  };

  const handleSaveConfig = (updatedConfig) => {
    setCameraPositions((prevPositions) =>
      prevPositions.map((cam) =>
        cam.id === selectedCameraId
          ? { ...cam, config: { ...cam.config, ...updatedConfig } }
          : cam
      )
    );
    setShowConfig(false);
  };

  const startResize = (streamId, e) => {
    const resizeRef = resizeRefs.current[streamId];
    if (!resizeRef) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth =
      parseInt(resizeRef.style.width, 10) ||
      cameraSizes[streamId]?.width ||
      800;
    const startHeight =
      parseInt(resizeRef.style.height, 10) ||
      cameraSizes[streamId]?.height ||
      500;

    const onMouseMove = (e) => {
      const newWidth = startWidth + (e.clientX - startX);
      const newHeight = startHeight + (e.clientY - startY);
      setCameraSizes((prev) => ({
        ...prev,
        [streamId]: {
          width: Math.max(400, Math.min(1200, newWidth)),
          height: Math.max(300, Math.min(900, newHeight)),
        },
      }));
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const handleUploadVideo = async (event) => {
    // ===================PROTOCOL WEBSOCKET===========================

    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("video", file);

    try {
      // 1. Gửi video lên server để xử lý
      const uploadResponse = await fetch(
        "http://localhost:5002/api/process-local-video",
        {
          method: "POST",
          body: formData,
        }
      );

      if (!uploadResponse.ok) {
        throw new Error("Lỗi khi tải video lên server");
      }

      const uploadData = await uploadResponse.json();

      // 2. Sử dụng WebSocket URL từ phản hồi
      const streamUrl = uploadData.wsUrl;

      const streamId = `processed-video-${Date.now()}`;

      setRtspStreams((prev) => ({
        ...prev,
        [streamId]: {
          url: streamUrl,
          isProcessed: true,
          fileName: file.name,
        },
      }));

      setSelectedStreams((prev) => [...prev, streamId]);
    } catch (error) {
      console.error("Lỗi xử lý video:", error);
      alert("Xử lý video thất bại: " + error.message);
    }

  };

  return (
    <div>
      <div
        id="controls"
        style={{
          marginBottom: "20px",
          padding: "10px",
          backgroundColor: "#f5f5f5",
          borderRadius: "8px",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <button onClick={() => setSelectedStreams([])}>Clear All</button>
          <input
            type="file"
            accept="video/*"
            onChange={handleUploadVideo}
            style={{ marginLeft: "10px" }}
          />
        </div>
        <div style={{ marginTop: "10px", fontSize: "12px", color: "#666" }}>
          <span style={{ marginRight: "15px" }}>
            <span
              style={{
                display: "inline-block",
                width: "12px",
                height: "12px",
                backgroundColor: "#FF9800",
                borderRadius: "50%",
                marginRight: "5px",
              }}
            ></span>
            RTSP
          </span>
          <span>
            <span
              style={{
                display: "inline-block",
                width: "12px",
                height: "12px",
                backgroundColor: "#4CAF50",
                borderRadius: "50%",
                marginRight: "5px",
              }}
            ></span>
            Đang xem
          </span>
        </div>
      </div>
      <div className="parent-grid">
        {selectedStreams.length > 0 ? (
          selectedStreams.map((streamId) => {
            const streamInfo =
              rtspStreams[streamId] || uploadedVideos[streamId];
            if (!streamInfo) return null;

            // Xác định loại nguồn
            const isUploadedVideo = streamId.startsWith("upload-");

            const cameraId = streamInfo.cameraId || streamId.split("-")[1];
            const camera = cameras.find((c) => c.id === cameraId) || {
              id: cameraId,
              name: uploadedVideos[streamId]
                ? uploadedVideos[streamId].name
                : `Camera ${cameraId}`,
            };
            const size = cameraSizes[streamId] || { width: 800, height: 500 };

            return (
              <div
                key={streamId}
                className="camera-feed-container"
                ref={(el) => (resizeRefs.current[streamId] = el)}
              >
                <div
                  className="camera-feed-box"
                  style={{
                    width: `${size.width}px`,
                    height: `${size.height}px`,
                    borderRadius: 8,
                    flexGrow: 1,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <CameraViewer
                    camera={{
                      id: streamId,
                      name: isUploadedVideo
                        ? uploadedVideos[streamId].name
                        : `${camera.name} (Stream ${streamId.split("-")[1]})`,
                      streamUrl: streamInfo.url,
                      rtspUrl: streamInfo.rtspUrl,
                      isUploadedVideo: isUploadedVideo,
                    }}
                    onStreamError={(cameraId, errorType) => {
                      console.log(
                        `Stream error for camera ${cameraId}, type: ${errorType}`
                      );
                    }}
                    actionBar={({
                      startRecognition,
                      stopRecognition,
                      isRecognizing,
                      isProcessing,
                    }) => (
                      <CameraActionBar
                        cameraName={camera.name}
                        cameraId={cameraId}
                        isRetrying={retrying[streamId]}
                        onRetry={() => handleRetry(streamId)}
                        onFullscreen={() => {
                          const video = document.getElementById(
                            `video-${streamId}`
                          );
                          if (video && video.requestFullscreen) {
                            video.requestFullscreen();
                          } else {
                            console.error(
                              "Fullscreen not supported or element not found"
                            );
                          }
                        }}
                        onConfigure={() => handleConfigClick(streamId)}
                        onClose={() => handleCloseCameraFeed(streamId)}
                        onStartRecognize={startRecognition}
                        onStopRecognize={stopRecognition}
                        isRecognizing={isRecognizing}
                        isProcessing={isProcessing}
                      />
                    )}
                    onClose={() => handleCloseCameraFeed(streamId)}
                    style={{ width: "100%", flexGrow: 1 }}
                  />
                  <div
                    style={{
                      width: "10px",
                      height: "10px",
                      background: "#607D8B",
                      position: "absolute",
                      bottom: 0,
                      right: 0,
                      cursor: "se-resize",
                    }}
                    onMouseDown={(e) => startResize(streamId, e)}
                  />
                </div>
              </div>
            );
          })
        ) : (
          <p>
            Không có camera hoặc video nào được chọn. Vui lòng chọn camera từ
            sidebar hoặc tải video lên.
          </p>
        )}
      </div>
      {showConfig &&
        selectedCameraId &&
        ReactDOM.createPortal(
          <div
            className="modal-overlay"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.7)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 1000,
            }}
            onClick={() => setShowConfig(false)}
          >
            <div
              className="modal-content"
              style={{
                backgroundColor: "white",
                padding: "20px",
                borderRadius: "8px",
                width: "80%",
                maxWidth: "800px",
                maxHeight: "80vh",
                overflowY: "auto",
                position: "relative",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <CameraConfigurationPage
                cameraId={selectedCameraId}
                onSave={handleSaveConfig}
                onClose={() => setShowConfig(false)}
              />
              <button
                style={{
                  position: "absolute",
                  top: "10px",
                  right: "10px",
                  background: "#ff4444",
                  color: "white",
                  border: "none",
                  borderRadius: "50%",
                  width: "30px",
                  height: "30px",
                  cursor: "pointer",
                  fontSize: "16px",
                }}
                onClick={() => setShowConfig(false)}
              >
                ×
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default SamplePage;
