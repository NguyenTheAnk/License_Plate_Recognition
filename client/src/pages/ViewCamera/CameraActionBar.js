import React from "react";
import "./CameraActionBar.css";
import { MdReplay, MdFullscreen, MdSettings } from "react-icons/md";
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
}) => {
  return (
    <div className="camera-action-bar">
      <button className="action-btn close-btn" onClick={onClose} title="Close">
        <FaTrash size={22} />
      </button>
      <button
        className="action-btn retry-btn"
        onClick={() => {
          console.log("Retry button clicked for camera:", cameraName);
          onRetry();
        }}
        title="Retry"
        // disabled={isRetrying}
      >
        {isRetrying ? <div className="spinner"></div> : <MdReplay size={25} />}
      </button>
      <button
        className="action-btn fullscreen-btn"
        onClick={onFullscreen}
        title="Fullscreen"
      >
        <MdFullscreen size={25} />
      </button>
      <button
        className="action-btn config-btn"
        onClick={onConfigure}
        title="Configure"
      >
        <MdSettings size={25} />
      </button>
      <button
        className={`action-btn recognize-btn ${
          isRecognizing ? "recognizing" : ""
        }`}
        onClick={() => {
          if (isProcessing) return; // NGĂN NHẤN KHI ĐANG XỬ LÝ
          console.log("Nút nhận diện được nhấn, isRecognizing:", isRecognizing);
          isRecognizing ? onStopRecognize() : onStartRecognize();
        }}
        title={isRecognizing ? "Stop Recognition" : "Start Recognition"}
        disabled={isProcessing} // VÔ HIỆU HÓA NÚT KHI ĐANG XỬ LÝ
      >
        {isProcessing ? (
          <div className="spinner"></div>
        ) : (
          <RiVoiceRecognitionLine size={25} />
        )}
      </button>
      <div className="camera-actionbar-name">{cameraName || "Camera"}</div>
    </div>
  );
};

export default CameraActionBar;
