import React, { useState, useRef, useEffect } from 'react';
import { 
  MdMoreVert, 
  MdVideocam, 
  MdCamera,
  MdPause,
  MdVideoLibrary,
  MdSettings,
  MdFullscreen,
  MdClose,
  MdWarning,
  MdGpsFixed,
  MdWifi,
  MdFastForward,
  MdList,
  MdBuild
} from 'react-icons/md';

const CameraOptionsButton = ({ 
  onOptionSelect,
  disabled = false,
  size = 'medium' // 'small', 'medium', 'large'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  // Các tùy chọn menu từ hình ảnh
  const menuOptions = [
    // Menu chính (Image 1)
    {
      id: 'disable',
      label: 'Vô hiệu',
      icon: <MdPause size={16} />,
      group: 'main'
    },
    {
      id: 'liveview',
      label: 'Xem trực tiếp (liveview)',
      icon: <MdVideocam size={16} />,
      group: 'main'
    },
    {
      id: 'pause',
      label: 'Nghỉ chờ',
      icon: <MdPause size={16} />,
      group: 'main'
    },
    {
      id: 'record',
      label: 'Ghi hình',
      icon: <MdVideoLibrary size={16} />,
      group: 'main'
    },
    {
      id: 'screenshot',
      label: 'Chụp ảnh màn hình',
      icon: <MdCamera size={16} />,
      group: 'main'
    },
    
    // Menu phụ (Image 2)
    {
      id: 'record_advanced',
      label: 'Ghi hình',
      icon: <MdVideoLibrary size={16} />,
      group: 'advanced'
    },
    {
      id: 'screenshot_advanced',
      label: 'Chụp ảnh màn hình',
      icon: <MdCamera size={16} />,
      group: 'advanced'
    },
    {
      id: 'alert',
      label: 'Hiển thị nhật ký',
      icon: <MdWarning size={16} />,
      group: 'advanced'
    },
    {
      id: 'control',
      label: 'Điều khiển',
      icon: <MdGpsFixed size={16} />,
      group: 'advanced'
    },
    {
      id: 'reconnect',
      label: 'Kết nối lại luồng',
      icon: <MdWifi size={16} />,
      group: 'advanced'
    },

    // Menu thứ ba (Image 3)
    {
      id: 'timelapse',
      label: 'Tua nhanh (Timelapse)',
      icon: <MdFastForward size={16} />,
      group: 'media'
    },
    {
      id: 'video_list',
      label: 'Danh sách video',
      icon: <MdList size={16} />,
      group: 'media'
    },
    {
      id: 'camera_config',
      label: 'Cấu hình camera',
      icon: <MdBuild size={16} />,
      group: 'media'
    },
    {
      id: 'fullscreen',
      label: 'Toàn màn hình',
      icon: <MdFullscreen size={16} />,
      group: 'media'
    },
    {
      id: 'close',
      label: 'Đóng',
      icon: <MdClose size={16} />,
      group: 'media'
    }
  ];

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
    setIsOpen(false);
    if (onOptionSelect) {
      onOptionSelect(option);
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return {
          button: { width: '28px', height: '28px', fontSize: '12px' },
          icon: 14,
          menu: { minWidth: '180px' }
        };
      case 'large':
        return {
          button: { width: '44px', height: '44px', fontSize: '18px' },
          icon: 20,
          menu: { minWidth: '220px' }
        };
      default:
        return {
          button: { width: '36px', height: '36px', fontSize: '16px' },
          icon: 16,
          menu: { minWidth: '200px' }
        };
    }
  };

  const sizeStyles = getSizeStyles();

  const buttonStyle = {
    ...sizeStyles.button,
    backgroundColor: isOpen ? '#2196F3' : '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    opacity: disabled ? 0.6 : 1,
    position: 'relative',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    transform: isOpen ? 'scale(0.95)' : 'scale(1)',
  };

  const menuStyle = {
    ...sizeStyles.menu,
    position: 'absolute',
    top: '100%',
    left: '0',
    marginTop: '4px',
    backgroundColor: 'rgba(60, 60, 60, 0.95)',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    zIndex: 1000,
    overflow: 'hidden',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.1)',
  };

  const optionStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 16px',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
    color: 'white',
    fontSize: '14px',
    fontWeight: '500',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  };

  // Nhóm các tùy chọn theo group để hiển thị
  const displayOptions = menuOptions.filter(option => option.group === 'main');

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={buttonRef}
        style={buttonStyle}
        onClick={handleButtonClick}
        disabled={disabled}
        title="Tùy chọn camera"
        onMouseEnter={(e) => {
          if (!disabled) {
            e.target.style.backgroundColor = isOpen ? '#1976D2' : '#45a049';
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled) {
            e.target.style.backgroundColor = isOpen ? '#2196F3' : '#4CAF50';
          }
        }}
      >
        <MdMoreVert size={sizeStyles.icon} />
      </button>

      {isOpen && (
        <div ref={menuRef} style={menuStyle}>
          {displayOptions.map((option, index) => (
            <div
              key={option.id}
              style={{
                ...optionStyle,
                borderBottom: index === displayOptions.length - 1 ? 'none' : optionStyle.borderBottom
              }}
              onClick={() => handleOptionClick(option)}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = 'rgba(255,255,255,0.1)';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'transparent';
              }}
            >
              <span style={{ 
                display: 'flex', 
                alignItems: 'center',
                color: '#ffffff',
                opacity: 0.9
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Demo component để test
const CameraOptionsDemo = () => {
  const [selectedOption, setSelectedOption] = useState(null);
  const [lastAction, setLastAction] = useState('');

  const handleOptionSelect = (option) => {
    setSelectedOption(option);
    setLastAction(`Đã chọn: ${option.label}`);
    
    // Xử lý các action tương ứng
    switch(option.id) {
      case 'liveview':
        console.log('Bắt đầu xem trực tiếp');
        break;
      case 'record':
        console.log('Bắt đầu ghi hình');
        break;
      case 'screenshot':
        console.log('Chụp ảnh màn hình');
        break;
      case 'disable':
        console.log('Vô hiệu hóa camera');
        break;
      case 'pause':
        console.log('Tạm dừng camera');
        break;
      default:
        console.log('Action:', option.id);
    }
  };

  return (
    <div style={{ 
      padding: '40px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      minHeight: '100vh',
      fontFamily: 'Arial, sans-serif'
    }}>
      <div style={{
        maxWidth: '800px',
        margin: '0 auto',
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '30px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ 
          marginBottom: '30px', 
          color: '#333',
          textAlign: 'center',
          fontSize: '24px',
          fontWeight: '600'
        }}>
          Camera Options Button Demo
        </h2>
        
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '30px',
          alignItems: 'center'
        }}>
          {/* Demo các kích thước */}
          <div style={{
            display: 'flex',
            gap: '20px',
            alignItems: 'center',
            flexWrap: 'wrap',
            justifyContent: 'center'
          }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#666' }}>Small</p>
              <CameraOptionsButton 
                size="small"
                onOptionSelect={handleOptionSelect}
              />
            </div>
            
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#666' }}>Medium</p>
              <CameraOptionsButton 
                size="medium"
                onOptionSelect={handleOptionSelect}
              />
            </div>
            
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#666' }}>Large</p>
              <CameraOptionsButton 
                size="large"
                onOptionSelect={handleOptionSelect}
              />
            </div>
            
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#666' }}>Disabled</p>
              <CameraOptionsButton 
                size="medium"
                disabled={true}
                onOptionSelect={handleOptionSelect}
              />
            </div>
          </div>

          {/* Action feedback */}
          {lastAction && (
            <div style={{
              padding: '15px 25px',
              backgroundColor: '#f0f9ff',
              border: '2px solid #0ea5e9',
              borderRadius: '8px',
              color: '#0c4a6e',
              fontWeight: '500',
              textAlign: 'center',
              minWidth: '300px'
            }}>
              {lastAction}
            </div>
          )}

          {/* Mô phỏng camera player */}
          <div style={{
            width: '400px',
            height: '300px',
            backgroundColor: '#d4a574',
            borderRadius: '8px',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '18px',
            fontWeight: '500',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
          }}>
            Camera Stream View
            
            {/* Action bar giả lập */}
            <div style={{
              position: 'absolute',
              bottom: '0',
              left: '0',
              right: '0',
              height: '50px',
              backgroundColor: 'rgba(0,0,0,0.8)',
              display: 'flex',
              alignItems: 'center',
              padding: '0 15px',
              gap: '10px',
              borderRadius: '0 0 8px 8px'
            }}>
              {/* Options button trong context */}
              <CameraOptionsButton 
                size="medium"
                onOptionSelect={handleOptionSelect}
              />
              
              {/* Các nút khác để mô phỏng */}
              <div style={{
                display: 'flex',
                gap: '8px',
                marginLeft: '10px'
              }}>
                {['▶️', '⏸️', '⏹️', '🔊', '⚙️'].map((icon, i) => (
                  <button
                    key={i}
                    style={{
                      width: '36px',
                      height: '36px',
                      backgroundColor: '#666',
                      border: 'none',
                      borderRadius: '6px',
                      color: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {icon}
                  </button>
                ))}
              </div>
              
              <div style={{ 
                marginLeft: 'auto', 
                color: 'white', 
                fontSize: '14px',
                fontWeight: '500'
              }}>
                H2 304 local 1 (64)
              </div>
            </div>
          </div>

          {/* Hướng dẫn */}
          <div style={{
            backgroundColor: '#f8fafc',
            padding: '20px',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            maxWidth: '600px'
          }}>
            <h4 style={{ margin: '0 0 15px 0', color: '#374151' }}>
              Các tùy chọn có sẵn:
            </h4>
            <ul style={{ margin: 0, paddingLeft: '20px', color: '#6b7280' }}>
              <li>Vô hiệu - Tắt camera</li>
              <li>Xem trực tiếp (liveview) - Bật stream trực tiếp</li>
              <li>Nghỉ chờ - Tạm dừng hoạt động</li>
              <li>Ghi hình - Bắt đầu ghi video</li>
              <li>Chụp ảnh màn hình - Chụp snapshot</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CameraOptionsDemo;