import React, { useState, useRef, useEffect } from "react";
import CameraConfigurationPage from "./CameraConfigurationPage";
import CameraActionBar from "./CameraActionBar";
import CameraViewer from "../components/CameraViewer";
import MonitorStatusPanel from "./MonitorStatusPanel";
import "./SamplePage.css";
import ReactDOM from "react-dom";
import { fetchDataFromAPI, postData } from '../utils/auth';

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
  const [showStatusPanel, setShowStatusPanel] = useState(false);
  
  // Thêm các state mới cho điều khiển camera
  const [streamStates, setStreamStates] = useState({});
  const [monitorStates, setMonitorStates] = useState({}); // Thêm state cho monitor status

  useEffect(() => {
    camerasRef.current = cameras;
  }, [cameras]);

  useEffect(() => {
    fetchCameras();
    window.startCameraStream = handleCameraClick;

    return () => {
      delete window.startCameraStream;
    };
  }, []);

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

  const initializeStreamState = (streamId, cameraId) => {
    setStreamStates(prev => ({
      ...prev,
      [streamId]: {
        isPlaying: true,
        isPaused: false,
        isRecording: false,
        audioEnabled: true,
        microphoneEnabled: false,
        isFullscreen: false,
        motionDetected: false
      }
    }));
    
    // Khởi tạo monitor status (mặc định là Watching khi start stream)
    setMonitorStates(prev => ({
      ...prev,
      [cameraId]: 2 // 2 = Watching
    }));
  };

  const updateStreamState = (streamId, updates) => {
    setStreamStates(prev => ({
      ...prev,
      [streamId]: {
        ...prev[streamId],
        ...updates
      }
    }));
  };

  const handleCameraClick = async (cameraId) => {
    console.log("Đang chọn camera:", cameraId);
    console.log("Danh sách cameras (ref):", camerasRef.current);

    if (showConfig || isLoadingStream.current) return;

    const camera = camerasRef.current.find((c) => c.id === Number(cameraId));

    if (!camera) {
      console.error(
        "Camera not found:",
        cameraId,
        "Available cameras:",
        camerasRef.current
      );
      await fetchCameras();
      const refreshedCamera = camerasRef.current.find(
        (c) => c.id === Number(cameraId)
      );
      if (!refreshedCamera) {
        alert(`Không tìm thấy camera ${cameraId}`);
        return;
      }
    }

    const streamId = `${cameraId}-${Date.now()}`;

    isLoadingStream.current = true;
    try {
      const token = localStorage.getItem("token");
      const result = await postData(`/api/cameras/${cameraId}/stream/start`, { type: "hls" }, token);
      if (!result.success) {
        alert(result.message || "Không thể phát camera");
        return;
      }
      const streamUrl = result.data.stream.streamUrl.replace(
        "localhost",
        window.location.hostname
      );
      setRtspStreams((prev) => ({
        ...prev,
        [streamId]: {
          cameraId: cameraId,
          url: streamUrl,
        },
      }));
      setSelectedStreams((prev) => [...prev, streamId]);
      initializeStreamState(streamId, cameraId);
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
    const streamInfo = rtspStreams[streamId];
    if (!streamInfo) return;

    const cameraId = streamInfo.cameraId;
    setRetrying((prev) => ({ ...prev, [streamId]: true }));

    try {
      const token = localStorage.getItem("token");
      const result = await postData(`/api/cameras/${cameraId}/stream/start`, { type: "hls" }, token);
      if (!result.success) {
        alert(result.message || "Không thể phát lại camera");
        return;
      }
      const streamUrl = result.data.stream.streamUrl.replace(
        "localhost",
        window.location.hostname
      );
      setRtspStreams((prev) => ({
        ...prev,
        [streamId]: {
          ...prev[streamId],
          url: streamUrl,
        },
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
    setStreamStates((prev) => {
      const newStates = { ...prev };
      delete newStates[streamId];
      return newStates;
    });
    
    // Cũng xóa monitor state nếu không còn stream nào của camera này
    const streamInfo = rtspStreams[streamId];
    if (streamInfo) {
      const cameraId = streamInfo.cameraId;
      const remainingStreams = Object.values(rtspStreams).filter(s => s.cameraId === cameraId);
      if (remainingStreams.length <= 1) { // <= 1 vì stream hiện tại sắp bị xóa
        setMonitorStates((prev) => {
          const newStates = { ...prev };
          delete newStates[cameraId];
          return newStates;
        });
      }
    }
  };

  const handleConfigClick = (streamId) => {
    const streamInfo = rtspStreams[streamId];
    if (!streamInfo) return;

    const cameraId = streamInfo.cameraId;
    const camera = cameraPositions.find((c) => c.id === cameraId);

    if (camera) {
      setSelectedCameraId(cameraId);
      setShowConfig(true);
    }
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

  // Các hàm xử lý cho monitor controls
  const handleMonitorStart = async (cameraId) => {
    setMonitorStates(prev => ({ ...prev, [cameraId]: 1 })); // Starting
    try {
      // Gọi API start monitor
      const token = localStorage.getItem("token");
      await postData(`/api/cameras/${cameraId}/monitor/start`, {}, token);
      setMonitorStates(prev => ({ ...prev, [cameraId]: 2 })); // Watching
    } catch (error) {
      console.error('Error starting monitor:', error);
      setMonitorStates(prev => ({ ...prev, [cameraId]: 7 })); // Died
    }
  };

  const handleMonitorStop = async (cameraId) => {
    setMonitorStates(prev => ({ ...prev, [cameraId]: 8 })); // Stopping
    try {
      const token = localStorage.getItem("token");
      await postData(`/api/cameras/${cameraId}/monitor/stop`, {}, token);
      setMonitorStates(prev => ({ ...prev, [cameraId]: 5 })); // Stopped
    } catch (error) {
      console.error('Error stopping monitor:', error);
      setMonitorStates(prev => ({ ...prev, [cameraId]: 7 })); // Died
    }
  };

  const handleMonitorRestart = async (cameraId) => {
    setMonitorStates(prev => ({ ...prev, [cameraId]: 4 })); // Restarting
    try {
      const token = localStorage.getItem("token");
      await postData(`/api/cameras/${cameraId}/monitor/restart`, {}, token);
      setMonitorStates(prev => ({ ...prev, [cameraId]: 2 })); // Watching
    } catch (error) {
      console.error('Error restarting monitor:', error);
      setMonitorStates(prev => ({ ...prev, [cameraId]: 7 })); // Died
    }
  };

  const handleMonitorPause = async (cameraId) => {
    setMonitorStates(prev => ({ ...prev, [cameraId]: 6 })); // Idle
  };

  const handleMonitorEnable = async (cameraId) => {
    setMonitorStates(prev => ({ ...prev, [cameraId]: 1 })); // Starting
    setTimeout(() => {
      setMonitorStates(prev => ({ ...prev, [cameraId]: 2 })); // Watching
    }, 1000);
  };

  const handleMonitorDisable = async (cameraId) => {
    setMonitorStates(prev => ({ ...prev, [cameraId]: 0 })); // Disabled
  };

  // Hàm xử lý action từ status panel
  const handleStatusAction = (cameraId, action) => {
    switch(action) {
      case 'start':
        handleMonitorStart(cameraId);
        break;
      case 'stop':
        handleMonitorStop(cameraId);
        break;
      case 'restart':
        handleMonitorRestart(cameraId);
        break;
      case 'enable':
        handleMonitorEnable(cameraId);
        break;
      case 'record':
        handleRecord(cameraId);
        break;
      default:
        console.log('Unknown action:', action);
    }
  };

  const handleScreenshot = (streamId) => {
    const video = document.getElementById(`video-${streamId}`);
    if (video) {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      
      const link = document.createElement('a');
      link.download = `camera-${streamId}-${Date.now()}.png`;
      link.href = canvas.toDataURL();
      link.click();
      
      // Hiển thị thông báo
      alert('Ảnh đã được chụp và tải xuống!');
    }
  };

  const handleSave = (streamId) => {
    // Implement save functionality
    console.log('Saving stream:', streamId);
    alert('Đã lưu video!');
  };

  const handleUpload = (streamId) => {
    // Implement upload functionality
    console.log('Uploading stream:', streamId);
    alert('Đang tải lên cloud...');
  };

  const handleZoomIn = (streamId) => {
    const video = document.getElementById(`video-${streamId}`);
    if (video) {
      const currentScale = video.style.transform.match(/scale\(([^)]+)\)/);
      const scale = currentScale ? parseFloat(currentScale[1]) : 1;
      const newScale = Math.min(scale + 0.1, 3);
      video.style.transform = `scale(${newScale})`;
    }
  };

  const handleZoomOut = (streamId) => {
    const video = document.getElementById(`video-${streamId}`);
    if (video) {
      const currentScale = video.style.transform.match(/scale\(([^)]+)\)/);
      const scale = currentScale ? parseFloat(currentScale[1]) : 1;
      const newScale = Math.max(scale - 0.1, 0.5);
      video.style.transform = `scale(${newScale})`;
    }
  };

  const handleToggleAudio = (streamId) => {
    const video = document.getElementById(`video-${streamId}`);
    if (video) {
      video.muted = !video.muted;
      updateStreamState(streamId, { audioEnabled: !video.muted });
    }
  };

  const handleToggleMicrophone = (streamId) => {
    const currentState = streamStates[streamId]?.microphoneEnabled || false;
    updateStreamState(streamId, { microphoneEnabled: !currentState });
    console.log('Microphone toggled:', !currentState);
  };

  const handleRecord = (cameraId) => {
    const currentStatus = monitorStates[cameraId] || 2;
    if (currentStatus === 2) {
      // Chuyển từ Watching sang Recording
      setMonitorStates(prev => ({ ...prev, [cameraId]: 3 }));
      console.log('Started recording camera:', cameraId);
    } else if (currentStatus === 3) {
      // Chuyển từ Recording về Watching
      setMonitorStates(prev => ({ ...prev, [cameraId]: 2 }));
      console.log('Stopped recording camera:', cameraId);
    }
  };

  const handleMotionDetect = (streamId) => {
    const currentState = streamStates[streamId]?.motionDetected || false;
    updateStreamState(streamId, { motionDetected: !currentState });
    console.log('Motion detection toggled:', !currentState);
  };

  // Thêm CSS cho responsive grid với rectangular containers
  const getGridStyle = () => ({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
    gap: "15px",
    padding: "15px",
    minHeight: "400px",
    maxWidth: "100%",
    boxSizing: "border-box",
    justifyItems: "center"
  });

  // Style cho camera container chữ nhật với chiều cao thu nhỏ
  const getCameraContainerStyle = () => ({
    width: "100%",
    maxWidth: "500px", // Kích thước phù hợp
    aspectRatio: "16/8", // Thu nhỏ chiều cao từ 16:10 xuống 16:8
    position: "relative",
    display: "flex",
    flexDirection: "column",
    border: "1px solid #ccc",
    borderRadius: "4px",
    overflow: "hidden",
    backgroundColor: "#000",
    boxSizing: "border-box",
    margin: "0 auto",
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)"
  });

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
          <button onClick={fetchCameras} disabled={loading}>
            {loading ? "Đang tải..." : "Làm mới"}
          </button>
          <button onClick={() => setShowStatusPanel(!showStatusPanel)}>
            {showStatusPanel ? "Ẩn Status Panel" : "Hiện Status Panel"}
          </button>
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
      
      {/* Monitor Status Panel */}
      {showStatusPanel && (
        <MonitorStatusPanel 
          cameras={cameras}
          monitorStates={monitorStates}
          onStatusChange={handleStatusAction}
        />
      )}
      
      <div style={getGridStyle()}>
        {selectedStreams.length > 0 ? (
          selectedStreams.map((streamId) => {
            const streamInfo = rtspStreams[streamId];
            if (!streamInfo) return null;

            const cameraId = streamInfo.cameraId;
            const camera = cameras.find((c) => c.id === cameraId) || {
              id: cameraId,
              name: `Camera ${cameraId}`,
            };

            const currentState = streamStates[streamId] || {};
            const monitorStatus = monitorStates[cameraId] || 0;

            return (
              <div
                key={streamId}
                className="camera-feed-container"
                style={getCameraContainerStyle()}
              >
                <CameraViewer
                  camera={{
                    id: streamId,
                    name: `${camera.name} (Stream ${streamId.split("-")[1]})`,
                    streamUrl: streamInfo.url,
                  }}
                  actionBar={
                    <CameraActionBar
                      cameraName={camera.name}
                      cameraId={cameraId}
                      
                      // Monitor status và controls
                      monitorStatus={monitorStatus}
                      onStart={() => handleMonitorStart(cameraId)}
                      onStop={() => handleMonitorStop(cameraId)}
                      onRestart={() => handleMonitorRestart(cameraId)}
                      onPause={() => handleMonitorPause(cameraId)}
                      onEnable={() => handleMonitorEnable(cameraId)}
                      onDisable={() => handleMonitorDisable(cameraId)}
                      
                      // Các chức năng khác
                      isRetrying={retrying[streamId]}
                      onRetry={() => handleRetry(streamId)}
                      onFullscreen={() => {
                        const video = document.getElementById(`video-${streamId}`);
                        if (video && video.requestFullscreen) {
                          video.requestFullscreen();
                          updateStreamState(streamId, { isFullscreen: true });
                        } else {
                          console.error("Fullscreen not supported or element not found");
                        }
                      }}
                      onConfigure={() => handleConfigClick(streamId)}
                      onClose={() => handleCloseCameraFeed(streamId)}
                      
                      // Các props cho các chức năng media
                      onScreenshot={() => handleScreenshot(streamId)}
                      onSave={() => handleSave(streamId)}
                      onUpload={() => handleUpload(streamId)}
                      onZoomIn={() => handleZoomIn(streamId)}
                      onZoomOut={() => handleZoomOut(streamId)}
                      onToggleAudio={() => handleToggleAudio(streamId)}
                      onToggleMicrophone={() => handleToggleMicrophone(streamId)}
                      onRecord={() => handleRecord(cameraId)}
                      onMotionDetect={() => handleMotionDetect(streamId)}
                      
                      // Callback cho options
                      onTimelapse={() => console.log('Timelapse for camera:', cameraId)}
                      onVideoList={() => console.log('Video list for camera:', cameraId)}
                      onAlertLog={() => console.log('Alert log for camera:', cameraId)}
                      onControl={(command) => console.log('PTZ Control:', command, 'for camera:', cameraId)}
                      onReconnect={() => handleRetry(streamId)}
                      
                      // Trạng thái hiện tại
                      audioEnabled={currentState.audioEnabled}
                      microphoneEnabled={currentState.microphoneEnabled}
                      isFullscreen={currentState.isFullscreen}
                      motionDetected={currentState.motionDetected}
                    />
                  }
                  onClose={() => handleCloseCameraFeed(streamId)}
                  style={{ 
                    width: "100%", 
                    height: "100%",
                    borderRadius: "0" // Remove border radius since container handles it
                  }}
                />
              </div>
            );
          })
        ) : (
          <div style={{
            gridColumn: "1 / -1",
            textAlign: "center",
            padding: "40px",
            color: "#666",
            fontSize: "16px"
          }}>
            Không có camera nào được chọn. Vui lòng chọn camera từ sidebar.
          </div>
        )}
      </div>
      
      {/* Configuration Modal */}
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