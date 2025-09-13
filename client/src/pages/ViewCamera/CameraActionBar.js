import React, { useState } from "react";
import "./CameraActionBar.css";
import { MdFullscreen, MdVideocam, MdVideocamOff, MdPlayArrow, MdPause, MdVolumeOff, MdVolumeUp, MdCameraAlt, MdHighQuality } from "react-icons/md";
import { FaTrash } from "react-icons/fa6";
import { RiVoiceRecognitionLine } from "react-icons/ri";

const CameraActionBar = ({
  onFullscreen,
  onClose,
  cameraName,
  onStartRecognize,
  onStopRecognize,
  isRecognizing,
  isProcessing,
  onStartRecording,  // Thêm prop cho ghi hình
  onStopRecording,   // Thêm prop cho dừng ghi hình
  isRecording,       // Thêm prop trạng thái ghi hình
  onSnapshot,        // Chụp ảnh màn hình
  onToggleMute,      // Toggle âm thanh
  isMuted,           // Trạng thái âm thanh
  onPlayPause,       // Phát/tạm dừng video
  isPlaying,         // Trạng thái phát video
  onQualitySettings, // Cài đặt chất lượng
  currentQuality, // Chất lượng hiện tại
}) => {
  const [showQualityDropdown, setShowQualityDropdown] = useState(false);
  
  // Hàm xử lý snapshot
  const handleSnapshot = () => {
    console.log("📸 Snapshot button clicked for camera:", cameraName);
    
    if (onSnapshot) {
      try {
        onSnapshot();
        console.log("✅ Snapshot executed successfully");
      } catch (error) {
        console.error("❌ Error in snapshot:", error);
        alert("Lỗi khi chụp ảnh: " + error.message);
      }
    } else {
      console.log("⚠️ No snapshot handler provided");
      alert("Chức năng chụp ảnh chưa được cài đặt");
    }
  };

  // Hàm xử lý toggle mute
  const handleToggleMute = () => {
    console.log("🔇 Toggle mute button clicked for camera:", cameraName, "isMuted:", isMuted);
    
    if (onToggleMute) {
      try {
        onToggleMute();
        console.log("✅ Toggle mute executed successfully");
      } catch (error) {
        console.error("❌ Error in toggle mute:", error);
        alert("Lỗi khi thay đổi âm thanh: " + error.message);
      }
    } else {
      console.log("⚠️ No toggle mute handler provided");
      alert("Chức năng âm thanh chưa được cài đặt");
    }
  };

  // Hàm xử lý play/pause
  const handlePlayPause = () => {
    console.log("⏯️ Play/Pause button clicked for camera:", cameraName, "isPlaying:", isPlaying);
    
    if (onPlayPause) {
      try {
        onPlayPause();
        console.log("✅ Play/Pause executed successfully");
      } catch (error) {
        console.error("❌ Error in play/pause:", error);
        alert("Lỗi khi phát/tạm dừng video: " + error.message);
      }
    } else {
      console.log("⚠️ No play/pause handler provided");
      alert("Chức năng phát/tạm dừng chưa được cài đặt");
    }
  };

  // Hàm xử lý quality settings
  const handleQualityChange = (quality) => {
    console.log("⚙️ Quality changed to:", quality);
    
    if (onQualitySettings) {
      try {
        onQualitySettings(quality);
        setShowQualityDropdown(false);
        console.log("✅ Quality settings executed successfully");
      } catch (error) {
        console.error("❌ Error in quality settings:", error);
        alert("Lỗi khi thay đổi chất lượng: " + error.message);
      }
    } else {
      console.log("⚠️ No quality settings handler provided");
      alert("Chức năng cài đặt chất lượng chưa được cài đặt");
    }
  };

  const qualityOptions = [
    { value: 'low', label: 'Low (360p)', width: 640, height: 360 },
    { value: 'medium', label: 'Medium (720p)', width: 1280, height: 720 },
    { value: 'high', label: 'High (1080p)', width: 1920, height: 1080 }
  ];

  // Hàm xử lý ghi hình
  const handleRecording = () => {
    console.log("🎥 Recording button clicked for camera:", cameraName, "isRecording:", isRecording);
    
    try {
      if (isRecording) {
        if (onStopRecording) {
          onStopRecording();
          console.log("✅ Stop recording executed successfully");
        } else {
          console.log("⚠️ No stop recording handler provided");
          alert("Chức năng dừng ghi hình chưa được cài đặt");
        }
      } else {
        if (onStartRecording) {
          onStartRecording();
          console.log("✅ Start recording executed successfully");
        } else {
          console.log("⚠️ No start recording handler provided");
          alert("Chức năng bắt đầu ghi hình chưa được cài đặt");
        }
      }
    } catch (error) {
      console.error("❌ Error in recording action:", error);
      alert("Lỗi khi thực hiện ghi hình: " + error.message);
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
        <FaTrash size={18} />
      </button>
      
      {/* Button chụp ảnh */}
      <button
        className="action-btn snapshot-btn"
        onClick={handleSnapshot}
        title="Chụp ảnh màn hình"
        disabled={isProcessing}
        style={{ 
          backgroundColor: isProcessing ? '#ccc' : '#ff9800',
          opacity: isProcessing ? 0.6 : 1
        }}
      >
        <MdCameraAlt size={18} />
      </button>
      
      {/* Button play/pause */}
      <button
        className="action-btn play-pause-btn"
        onClick={handlePlayPause}
        title={isPlaying ? "Tạm dừng video" : "Phát video"}
        disabled={isProcessing}
        style={{ 
          backgroundColor: isProcessing ? '#ccc' : '#4caf50',
          opacity: isProcessing ? 0.6 : 1
        }}
      >
        {isPlaying ? <MdPause size={18} /> : <MdPlayArrow size={18} />}
      </button>
      
      {/* Button mute/unmute */}
      <button
        className="action-btn mute-btn"
        onClick={handleToggleMute}
        title={isMuted ? "Bật âm thanh" : "Tắt âm thanh"}
        disabled={isProcessing}
        style={{ 
          backgroundColor: isProcessing ? '#ccc' : '#9c27b0',
          opacity: isProcessing ? 0.6 : 1
        }}
      >
        {isMuted ? <MdVolumeOff size={18} /> : <MdVolumeUp size={18} />}
      </button>
      
      {/* Button ghi hình */}
      <button
        className={`action-btn recording-btn ${isRecording ? "recording" : ""}`}
        onClick={handleRecording}
        title={isRecording ? "Dừng ghi hình" : "Bắt đầu ghi hình"}
        disabled={isProcessing}
        style={{ 
          backgroundColor: isRecording ? '#f44336' : '#ff5722',
          opacity: isProcessing ? 0.6 : 1
        }}
      >
        {isRecording ? <MdVideocamOff size={18} /> : <MdVideocam size={18} />}
      </button>
      
      {/* Button cài đặt chất lượng - Icon only */}
      <div className="quality-dropdown-container">
        <button
          className="action-btn quality-btn-icon"
          onClick={() => setShowQualityDropdown(!showQualityDropdown)}
          title={`Chất lượng: ${qualityOptions.find(opt => opt.value === currentQuality)?.label || '720p'}`}
          disabled={isProcessing}
        >
          <MdHighQuality size={18} />
        </button>
        
        {showQualityDropdown && (
          <div className="quality-dropdown upward-dropdown">
            {qualityOptions.map((option) => (
              <div
                key={option.value}
                className={`quality-option ${currentQuality === option.value ? 'selected' : ''}`}
                onClick={() => handleQualityChange(option.value)}
              >
                <div className="quality-option-content">
                  <MdHighQuality size={14} />
                  <span>{option.label}</span>
                  {currentQuality === option.value && (
                    <div className="checkmark">✓</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <button
        className="action-btn fullscreen-btn"
        onClick={() => {
          console.log("🔍 Fullscreen button clicked for camera:", cameraName);
          onFullscreen();
        }}
        title="Toàn màn hình"
        style={{ backgroundColor: '#2196f3' }}
      >
        <MdFullscreen size={18} />
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
          <RiVoiceRecognitionLine size={18} />
        )}
      </button>
      
      <div className="camera-actionbar-name" title={cameraName}>
        {cameraName || "Camera"}
      </div>
    </div>
  );
};

export default CameraActionBar;