import React from "react";
import "./CameraActionBar.css";
import { MdReplay, MdFullscreen, MdSettings, MdPlayArrow } from "react-icons/md";
import { FaTrash } from "react-icons/fa6";
import { RiVoiceRecognitionLine } from "react-icons/ri";

const CameraActionBar = ({
  onRetry,
  isRetrying,
  onFullscreen,
  onConfigure,
  onClose,
  cameraName,
  onStartRecognize,
  onStopRecognize,
  isRecognizing,
  isProcessing,
  onForcePlay,  // Thêm prop mới
}) => {
  
  // Hàm xử lý force play
  const handleForcePlay = () => {
    console.log("▶️ Force play button clicked for camera:", cameraName);
    
    if (onForcePlay) {
      try {
        onForcePlay();
        console.log("✅ Force play executed successfully");
      } catch (error) {
        console.error("❌ Error in force play:", error);
        alert("Không thể phát video: " + error.message);
      }
    } else {
      console.log("⚠️ No force play handler provided, using fallback");
      // Fallback: tìm video element và trigger play
      const videoElements = document.querySelectorAll('video');
      let playedCount = 0;
      
      videoElements.forEach(video => {
        if (video.paused) {
          video.play()
            .then(() => {
              playedCount++;
              console.log("✅ Video played successfully");
            })
            .catch(err => {
              console.error("❌ Auto-play prevented:", err);
            });
        }
      });
      
      if (playedCount === 0) {
        console.log("⚠️ No paused videos found to play");
        alert("Không tìm thấy video nào để phát");
      }
    }
  };

  return (
    <div className="camera-action-bar">
      <button 
        className="action-btn close-btn" 
        onClick={() => {
          console.log("❌ Close button clicked for camera:", cameraName);
          onClose();
        }} 
        title="Đóng camera/video"
        style={{ backgroundColor: '#ff4444' }}
      >
        <FaTrash size={22} />
      </button>
      
      <button
        className="action-btn retry-btn"
        onClick={() => {
          console.log("🔄 Retry button clicked for camera:", cameraName);
          onRetry();
        }}
        title="Thử lại kết nối"
        disabled={isRetrying}
        style={{ 
          backgroundColor: isRetrying ? '#ccc' : '#ff9800',
          opacity: isRetrying ? 0.6 : 1
        }}
      >
        {isRetrying ? <div className="spinner"></div> : <MdReplay size={25} />}
      </button>
      
      {/* Thêm button force play */}
      <button
        className="action-btn play-btn"
        onClick={handleForcePlay}
        title="Bắt buộc phát video"
        disabled={isProcessing}
        style={{ 
          backgroundColor: isProcessing ? '#ccc' : '#4caf50',
          opacity: isProcessing ? 0.6 : 1
        }}
      >
        <MdPlayArrow size={25} />
      </button>
      
      <button
        className="action-btn fullscreen-btn"
        onClick={() => {
          console.log("🔍 Fullscreen button clicked for camera:", cameraName);
          onFullscreen();
        }}
        title="Toàn màn hình"
        style={{ backgroundColor: '#2196f3' }}
      >
        <MdFullscreen size={25} />
      </button>
      
      <button
        className="action-btn config-btn"
        onClick={() => {
          console.log("⚙️ Config button clicked for camera:", cameraName);
          onConfigure();
        }}
        title="Cấu hình camera"
        style={{ backgroundColor: '#9c27b0' }}
      >
        <MdSettings size={25} />
      </button>
      
      <button
        className={`action-btn recognize-btn ${
          isRecognizing ? "recognizing" : ""
        }`}
        onClick={() => {
          if (isProcessing) {
            console.log("⚠️ Recognition button clicked but processing in progress");
            return; // NGĂN NHẤN KHI ĐANG XỬ LÝ
          }
          console.log("🔍 Recognition button clicked, isRecognizing:", isRecognizing);
          try {
            isRecognizing ? onStopRecognize() : onStartRecognize();
            console.log("✅ Recognition action executed successfully");
          } catch (error) {
            console.error("❌ Error in recognition action:", error);
            alert("Lỗi khi thực hiện nhận diện: " + error.message);
          }
        }}
        title={isRecognizing ? "Dừng nhận diện" : "Bắt đầu nhận diện"}
        disabled={isProcessing} // VÔ HIỆU HÓA NÚT KHI ĐANG XỬ LÝ
        style={{ 
          backgroundColor: isRecognizing ? '#f44336' : '#4caf50',
          opacity: isProcessing ? 0.6 : 1
        }}
      >
        {isProcessing ? (
          <div className="spinner"></div>
        ) : (
          <RiVoiceRecognitionLine size={25} />
        )}
      </button>
      
      <div className="camera-actionbar-name" title={cameraName}>
        {cameraName || "Camera"}
      </div>
    </div>
  );
};

export default CameraActionBar;