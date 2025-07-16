import React, { useState, useRef, useEffect } from "react";
import "./CameraActionBar.css";
import { 
  MdReplay, 
  MdFullscreen, 
  MdSettings, 
  MdVideocam, 
  MdMotionPhotosOn,
  MdPlayArrow,
  MdPause,
  MdStop,
  MdVolumeUp,
  MdVolumeOff,
  MdZoomIn,
  MdZoomOut,
  MdScreenshot,
  MdSave,
  MdCloud,
  MdCloudUpload,
  MdMenu,
  MdCamera,
  MdVideoLibrary,
  MdWarning,
  MdGpsFixed,
  MdWifi,
  MdFastForward,
  MdList,
  MdBuild,
  MdClose,
  MdKeyboardArrowUp,
  MdKeyboardArrowDown,
  MdKeyboardArrowLeft,
  MdKeyboardArrowRight,
  MdVisibility,
  MdSmartToy
} from "react-icons/md";
import { 
  FaTrash, 
  FaExpand, 
  FaCompress,
  FaMicrophone,
  FaMicrophoneSlash,
  FaWindowMaximize,
  FaWindowRestore,
  FaUpRightAndDownLeftFromCenter,
  FaDownLeftAndUpRightToCenter,
  FaUpDownLeftRight,
  FaWrench,
  FaCamera,
  FaPlug,
  FaArrowsRotate
} from "react-icons/fa6";

// Camera PTZ Control Component - Compact version
const CameraPTZControl = ({ 
  onPTZControl,
  disabled = false,
  style = {}
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const controlRef = useRef(null);
  const buttonRef = useRef(null);

  // Đóng control khi click bên ngoài
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        controlRef.current && 
        !controlRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleButtonClick = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  };

  const handlePTZCommand = (direction) => {
    if (onPTZControl) {
      onPTZControl(direction);
    }
    console.log('PTZ Control:', direction);
  };

  const controlButtonStyle = {
    width: '32px',
    height: '32px',
    backgroundColor: '#4a5568',
    border: 'none',
    borderRadius: '4px',
    color: 'white',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    margin: '1px'
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={buttonRef}
        style={{
          ...style,
          backgroundColor: isOpen ? '#673AB7' : '#673AB7',
          color: 'white',
          opacity: disabled ? 0.6 : 1,
        }}
        onClick={handleButtonClick}
        disabled={disabled}
        title="Điều khiển"
      >
        <MdGpsFixed size={12} />
      </button>

      {isOpen && (
        <div 
          ref={controlRef} 
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: '8px',
            backgroundColor: 'rgba(40, 40, 40, 0.98)',
            borderRadius: '8px',
            boxShadow: '0 -8px 24px rgba(0,0,0,0.4)',
            zIndex: 1000,
            padding: '12px',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.1)',
            minWidth: '180px'
          }}
        >
          {/* Tiêu đề */}
          <div style={{
            color: 'white',
            fontSize: '11px',
            fontWeight: '600',
            textAlign: 'center',
            marginBottom: '8px'
          }}>
            Camera Control
          </div>

          {/* Control Pad chính */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '3px',
            marginBottom: '10px'
          }}>
            {/* Hàng 1 */}
            <div></div>
            <button
              style={controlButtonStyle}
              onClick={() => handlePTZCommand('up')}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#5a6578'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#4a5568'}
              title="Move Up"
            >
              <MdKeyboardArrowUp size={20} />
            </button>
            <div></div>

            {/* Hàng 2 */}
            <button
              style={controlButtonStyle}
              onClick={() => handlePTZCommand('left')}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#5a6578'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#4a5568'}
              title="Move Left"
            >
              <MdKeyboardArrowLeft size={20} />
            </button>
            <button
              style={{
                ...controlButtonStyle,
                backgroundColor: '#2d3748',
                cursor: 'default'
              }}
              title="Center"
            >
              <div style={{
                width: '6px',
                height: '6px',
                backgroundColor: '#4299e1',
                borderRadius: '50%'
              }}></div>
            </button>
            <button
              style={controlButtonStyle}
              onClick={() => handlePTZCommand('right')}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#5a6578'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#4a5568'}
              title="Move Right"
            >
              <MdKeyboardArrowRight size={20} />
            </button>

            {/* Hàng 3 */}
            <div></div>
            <button
              style={controlButtonStyle}
              onClick={() => handlePTZCommand('down')}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#5a6578'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#4a5568'}
              title="Move Down"
            >
              <MdKeyboardArrowDown size={20} />
            </button>
            <div></div>
          </div>

          {/* Zoom Controls */}
          <div style={{
            display: 'flex',
            gap: '6px',
            justifyContent: 'center',
            marginBottom: '8px'
          }}>
            <button
              style={{
                ...controlButtonStyle,
                width: '40px',
                fontSize: '10px',
                fontWeight: '600'
              }}
              onClick={() => handlePTZCommand('zoom_in')}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#5a6578'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#4a5568'}
              title="Zoom In"
            >
              <MdZoomIn size={16} />
            </button>
            <button
              style={{
                ...controlButtonStyle,
                width: '40px',
                fontSize: '10px',
                fontWeight: '600'
              }}
              onClick={() => handlePTZCommand('zoom_out')}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#5a6578'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#4a5568'}
              title="Zoom Out"
            >
              <MdZoomOut size={16} />
            </button>
          </div>

          {/* Preset buttons */}
          <div style={{
            display: 'flex',
            gap: '3px',
            justifyContent: 'center'
          }}>
            <button
              style={{
                ...controlButtonStyle,
                width: '28px',
                height: '24px',
                fontSize: '9px',
                fontWeight: '600'
              }}
              onClick={() => handlePTZCommand('preset_1')}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#5a6578'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#4a5568'}
              title="Preset 1"
            >
              P1
            </button>
            <button
              style={{
                ...controlButtonStyle,
                width: '28px',
                height: '24px',
                fontSize: '9px',
                fontWeight: '600'
              }}
              onClick={() => handlePTZCommand('preset_2')}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#5a6578'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#4a5568'}
              title="Preset 2"
            >
              P2
            </button>
            <button
              style={{
                ...controlButtonStyle,
                width: '48px',
                height: '24px',
                fontSize: '9px',
                fontWeight: '600'
              }}
              onClick={() => handlePTZCommand('home')}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#5a6578'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#4a5568'}
              title="Home Position"
            >
              HOME
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const CameraOptionsButton = ({ 
  onOptionSelect,
  disabled = false,
  size = 'small',
  monitorStatus = 0,
  style = {}
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  // Các tùy chọn menu - tất cả luôn có thể chọn
  const getMenuOptions = () => {
    const baseOptions = [
      {
        id: 'liveview',
        label: 'Xem trực tiếp (liveview)',
        icon: <MdVideocam size={14} />
      },
      {
        id: 'pause',
        label: 'Nghỉ chờ',
        icon: <MdPause size={14} />
      },
      {
        id: 'disable',
        label: 'Vô hiệu',
        icon: <MdStop size={14} />
      },
      {
        id: 'record',
        label: 'Ghi hình',
        icon: <MdVideoLibrary size={14} />,
        active: monitorStatus === 3
      },
      {
        id: 'screenshot',
        label: 'Chụp ảnh màn hình',
        icon: <FaCamera size={14} />
      },
      {
        id: 'separator1',
        type: 'separator'
      },
      {
        id: 'alert_log',
        label: 'Hiển thị nhật ký',
        icon: <MdWarning size={14} />
      },
      {
        id: 'control',
        label: 'Điều khiển',
        icon: <MdGpsFixed size={14} />
      },
      {
        id: 'reconnect',
        label: 'Kết nối lại luồng',
        icon: <FaPlug size={14} style={{ transform: 'rotate(45deg)' }} />
      },
      {
        id: 'separator2',
        type: 'separator'
      },
      {
        id: 'timelapse',
        label: 'Tua nhanh (Timelapse)',
        icon: <MdFastForward size={14} />
      },
      {
        id: 'video_list',
        label: 'Danh sách video',
        icon: <MdList size={14} />
      },
      {
        id: 'camera_config',
        label: 'Cấu hình camera',
        icon: <FaWrench size={14} />
      },
      {
        id: 'fullscreen',
        label: 'Toàn màn hình',
        icon: <FaUpDownLeftRight size={14} />
      },
      {
        id: 'recognition',
        label: 'Bật nhận dạng',
        icon: <MdSmartToy size={14} />
      },
      {
        id: 'separator3',
        type: 'separator'
      },
      {
        id: 'close',
        label: 'Đóng',
        icon: <MdClose size={14} />
      }
    ];

    return baseOptions;
  };

  // Đóng menu khi click bên ngoài
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        menuRef.current && 
        !menuRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleButtonClick = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  };

  const handleOptionClick = (option) => {
    if (option.type === 'separator') return;
    setIsOpen(false);
    if (onOptionSelect) {
      onOptionSelect(option);
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={buttonRef}
        style={{
          ...style,
          backgroundColor: isOpen ? '#4CAF50' : '#4CAF50',
          color: 'white',
          opacity: disabled ? 0.6 : 1,
        }}
        onClick={handleButtonClick}
        disabled={disabled}
        title="Tùy chọn "
      >
        <MdMenu size={14} />
      </button>

      {isOpen && (
        <div 
          ref={menuRef} 
          style={{
            minWidth: '200px',
            position: 'absolute',
            bottom: '100%',
            left: '0',
            marginBottom: '4px',
            backgroundColor: 'rgba(40, 40, 40, 0.98)',
            borderRadius: '6px',
            boxShadow: '0 -8px 24px rgba(0,0,0,0.4)',
            zIndex: 1000,
            maxHeight: '180px',
            overflowY: 'auto',
            overflowX: 'hidden',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.1)',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255,255,255,0.3) transparent',
          }}
        >
          {getMenuOptions().map((option, index) => {
            if (option.type === 'separator') {
              return (
                <div
                  key={option.id}
                  style={{
                    height: '1px',
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    margin: '4px 0'
                  }}
                />
              );
            }

            const isActive = option.active || false;

            return (
              <div
                key={option.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: '500',
                  backgroundColor: isActive ? 'rgba(33, 150, 243, 0.3)' : 'transparent',
                }}
                onClick={() => handleOptionClick(option)}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = isActive ? 'rgba(33, 150, 243, 0.5)' : 'rgba(255,255,255,0.1)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = isActive ? 'rgba(33, 150, 243, 0.3)' : 'transparent';
                }}
              >
                <span style={{ 
                  display: 'flex', 
                  alignItems: 'center',
                  color: isActive ? '#2196F3' : '#ffffff',
                  opacity: 0.9,
                  minWidth: '14px'
                }}>
                  {option.icon}
                </span>
                <span style={{ 
                  flex: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {option.label}
                </span>
                {isActive && (
                  <span style={{
                    fontSize: '8px',
                    color: '#2196F3',
                    fontWeight: '600'
                  }}>
                    ●
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const CameraActionBar = ({ 
  onRetry, 
  isRetrying, 
  onFullscreen, 
  onConfigure, 
  onRecord, 
  onMotionDetect, 
  cameraName, 
  isRecording, 
  motionDetected, 
  onClose,
  // Monitor status props
  monitorStatus = 0,
  onStart,
  onStop,
  onRestart,
  onEnable,
  onDisable,
  onPause,
  // Media control props
  onScreenshot,
  onSave,
  onUpload,
  onZoomIn,
  onZoomOut,
  onToggleAudio,
  onToggleMicrophone,
  audioEnabled = true,
  microphoneEnabled = false,
  isFullscreen = false,
  // Thêm callback cho options
  onTimelapse,
  onVideoList,
  onAlertLog,
  onControl,
  onReconnect
}) => {
  
  // Style cho nút nhỏ gọn
  const compactButtonStyle = {
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '12px',
    transition: 'all 0.2s ease'
  };

  // Xử lý các option từ options button
  const handleOptionSelect = (option) => {
    switch(option.id) {
      case 'liveview':
        if (onStart) onStart();
        break;
      case 'pause':
        if (onPause) onPause();
        break;
      case 'disable':
        if (onStop) onStop();
        break;
      case 'record':
        if (onRecord) onRecord();
        break;
      case 'screenshot':
        if (onScreenshot) onScreenshot();
        break;
      case 'alert_log':
        if (onAlertLog) onAlertLog();
        break;
      case 'control':
        if (onControl) onControl();
        break;
      case 'reconnect':
        if (onReconnect) onReconnect();
        break;
      case 'timelapse':
        if (onTimelapse) onTimelapse();
        break;
      case 'video_list':
        if (onVideoList) onVideoList();
        break;
      case 'camera_config':
        if (onConfigure) onConfigure();
        break;
      case 'fullscreen':
        if (onFullscreen) onFullscreen();
        break;
      case 'recognition':
        console.log('Toggle recognition clicked');
        break;
      case 'close':
        if (onClose) onClose();
        break;
      default:
        console.log('Unhandled option:', option.id);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      height: '100%',
      padding: '0 4px'
    }}>
      {/* Left side - Action buttons */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '3px'
      }}>
        {/* 1. Options Button với dropdown menu */}
        <CameraOptionsButton
          monitorStatus={monitorStatus}
          onOptionSelect={handleOptionSelect}
          size="small"
          style={compactButtonStyle}
        />

        {/* 2. Fullscreen */}
        <button
          style={{
            ...compactButtonStyle,
            backgroundColor: '#2196F3',
            color: 'white'
          }}
          onClick={onFullscreen}
          title="Toàn màn hình"
        >
          <FaUpDownLeftRight size={12} />
        </button>

        {/* 3. Configure */}
        <button
          style={{
            ...compactButtonStyle,
            backgroundColor: '#FF9800',
            color: 'white'
          }}
          onClick={onConfigure}
          title="Cấu hình camera"
        >
          <FaWrench size={12} />
        </button>

        {/* 4. Screenshot */}
        <button
          style={{
            ...compactButtonStyle,
            backgroundColor: '#9C27B0',
            color: 'white'
          }}
          onClick={onScreenshot}
          title="Chụp ảnh màn hình"
        >
          <FaCamera size={12} />
        </button>

        {/* 5. Video List */}
        <button
          style={{
            ...compactButtonStyle,
            backgroundColor: '#607D8B',
            color: 'white'
          }}
          onClick={onVideoList}
          title="Danh sách video"
        >
          <MdVideoLibrary size={14} />
        </button>

        {/* 6. Reconnect */}
        <button
          style={{
            ...compactButtonStyle,
            backgroundColor: '#4CAF50',
            color: 'white'
          }}
          onClick={onReconnect}
          title="Kết nối lại luồng"
        >
          <FaArrowsRotate size={12} />
        </button>

        {/* 7. PTZ Control với popup điều khiển */}
        <CameraPTZControl
          onPTZControl={onControl}
          disabled={![2, 3, 6, 9].includes(monitorStatus)}
          style={compactButtonStyle}
        />

        {/* 8. Alert Log */}
        <button
          style={{
            ...compactButtonStyle,
            backgroundColor: '#FFC107',
            color: 'white'
          }}
          onClick={onAlertLog}
          title="Hiển thị nhật ký"
        >
          <MdWarning size={12} />
        </button>

        {/* 9. Recognition */}
        <button
          style={{
            ...compactButtonStyle,
            backgroundColor: '#00BCD4',
            color: 'white'
          }}
          onClick={() => console.log('Recognition toggled')}
          title="Bật nhận dạng"
        >
          <MdSmartToy size={12} />
        </button>

        {/* 10. Close */}
        <button
          style={{
            ...compactButtonStyle,
            backgroundColor: '#F44336',
            color: 'white'
          }}
          onClick={onClose}
          title="Đóng"
        >
          <MdClose size={12} />
        </button>
      </div>

      {/* Right side - Camera name */}
      <div style={{
        color: 'white',
        fontSize: '12px',
        fontWeight: '500',
        textOverflow: 'ellipsis',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        maxWidth: '150px'
      }}>
        {cameraName || "Camera"}
      </div>
    </div>
  );
};

export default CameraActionBar;