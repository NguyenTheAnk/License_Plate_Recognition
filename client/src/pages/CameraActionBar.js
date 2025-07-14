import React from "react";
import "./CameraActionBar.css";
import { MdReplay, MdFullscreen, MdSettings, MdVideocam, MdMotionPhotosOn } from "react-icons/md";
import { FaTrash } from "react-icons/fa6";
import { RiVoiceRecognitionLine } from "react-icons/ri";

const CameraActionBar = ({ onRetry, isRetrying, onFullscreen, onConfigure, onRecord, onMotionDetect, cameraName, isRecording, motionDetected, onClose }) => {
  return (
    <div className="camera-action-bar">
      <button className="action-btn close-btn" onClick={onClose} title="Close">
        <FaTrash size={22}/>
      </button>
      <button 
        className="action-btn retry-btn" 
        onClick={onRetry} 
        title="Retry"
        disabled={isRetrying}
      >
        {isRetrying ? (
          <div className="spinner"></div> // Thêm spinner
        ) : (
          <MdReplay size={25} />
        )}
      </button>
      <button className="action-btn fullscreen-btn" onClick={onFullscreen} title="Fullscreen">
        <MdFullscreen size={25} />
      </button>
      <button className="action-btn config-btn" onClick={onConfigure} title="Configure">
        <MdSettings size={25} />
      </button>
      <button className={`action-btn record-btn ${isRecording ? "recording" : ""}`} onClick={onRecord} title="Record">
        <MdVideocam size={25} />
      </button>
      <button className="action-btn motion-btn" onClick={onMotionDetect} title="Motion Detect">
        <RiVoiceRecognitionLine size={25} />
      </button>
      <div className="camera-actionbar-name">{cameraName || "Camera"}</div>
      {motionDetected && <div style={{ color: "red", marginLeft: "10px" }}>Motion!</div>}
    </div>
  );
};

export default CameraActionBar;