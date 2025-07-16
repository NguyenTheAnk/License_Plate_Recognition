import React, { useRef, useEffect, useState } from 'react';
import Hls from 'hls.js';
import './CameraViewer.css';

const CameraViewer = ({ camera, actionBar, onClose, style }) => {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!camera?.streamUrl) {
      setError('No stream URL provided');
      setIsLoading(false);
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    // Set video element ID for external access
    video.id = `video-${camera.id}`;

    const initializeStream = () => {
      setIsLoading(true);
      setError(null);

      if (Hls.isSupported()) {
        // HLS.js implementation
        const hls = new Hls({
          enableWorker: false,
          lowLatencyMode: true,
          backBufferLength: 90,
          liveSyncDuration: 2, // seconds, nhảy sát thời gian thực
          liveMaxLatencyDuration: 3,
          maxLiveSyncPlaybackRate: 1.5
        });

        hlsRef.current = hls;

        hls.loadSource(camera.streamUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log('HLS manifest parsed, attempting to play');
          setIsLoading(false);
          // Nhảy đến cuối stream (live edge)
          if (video.duration && !isNaN(video.duration)) {
            video.currentTime = video.duration;
          }
          video.play()
            .then(() => {
              setIsPlaying(true);
              console.log('Video started playing');
            })
            .catch((error) => {
              console.error('Error playing video:', error);
              setError('Failed to start playback');
            });
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error('HLS error:', data);
          setIsLoading(false);
          
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                setError('Network error - stream may be unavailable');
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                setError('Media error - trying to recover');
                hls.recoverMediaError();
                break;
              default:
                setError('Fatal error occurred');
                hls.destroy();
                break;
            }
          }
        });

      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS support (Safari)
        video.src = camera.streamUrl;
        video.addEventListener('loadedmetadata', () => {
          setIsLoading(false);
          video.play()
            .then(() => setIsPlaying(true))
            .catch((error) => {
              console.error('Error playing video:', error);
              setError('Failed to start playback');
            });
        });
      } else {
        setError('HLS not supported in this browser');
        setIsLoading(false);
      }
    };

    initializeStream();

    // Cleanup function
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      setIsPlaying(false);
    };
  }, [camera?.streamUrl, camera?.id]);

  const handleVideoClick = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play()
        .then(() => setIsPlaying(true))
        .catch(console.error);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const containerStyle = {
    width: '100%',
    aspectRatio: '16/8', // Thu nhỏ chiều cao từ 16:10 xuống 16:8
    position: 'relative',
    backgroundColor: '#000',
    borderRadius: '4px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    ...style
  };

  const videoContainerStyle = {
    position: 'relative',
    width: '100%',
    flex: 1, // Chiếm phần còn lại sau action bar
    backgroundColor: '#d4a574', // Màu giống trong hình
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  };

  const videoStyle = {
    width: '100%',
    height: '100%',
    objectFit: 'contain', // Thay đổi từ 'cover' sang 'contain' để hiển thị toàn bộ video
    backgroundColor: '#d4a574',
    cursor: 'pointer'
  };

  const overlayStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    color: 'white',
    fontSize: '16px',
    zIndex: 2
  };

  const actionBarStyle = {
    position: 'relative',
    bottom: 'auto',
    left: 'auto',
    right: 'auto',
    backgroundColor: 'rgba(0,0,0,0.9)',
    padding: '6px 8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '4px',
    zIndex: 4,
    minHeight: '36px'
  };

  const playButtonStyle = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255,255,255,0.2)',
    border: '2px solid rgba(255,255,255,0.5)',
    color: 'white',
    fontSize: '24px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    transition: 'all 0.2s ease'
  };

  return (
    <div style={containerStyle}>
      {/* Video Container */}
      <div style={videoContainerStyle}>
        <video
          ref={videoRef}
          style={videoStyle}
          onClick={handleVideoClick}
          muted={true}
          playsInline
          autoPlay
        />

        {/* Loading Overlay */}
        {isLoading && (
          <div style={overlayStyle}>
            <div>
              <div style={{ 
                border: '3px solid rgba(255,255,255,0.3)',
                borderTop: '3px solid white',
                borderRadius: '50%',
                width: '30px',
                height: '30px',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 10px'
              }}></div>
              Đang tải stream...
            </div>
          </div>
        )}

        {/* Error Overlay */}
        {error && (
          <div style={overlayStyle}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', marginBottom: '10px' }}>⚠️</div>
              <div>{error}</div>
              <button
                style={{
                  marginTop: '10px',
                  padding: '8px 16px',
                  backgroundColor: '#ff4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
                onClick={() => window.location.reload()}
              >
                Thử lại
              </button>
            </div>
          </div>
        )}

        {/* Play Button (when paused) */}
        {!isPlaying && !isLoading && !error && (
          <div
            style={playButtonStyle}
            onClick={handleVideoClick}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = 'rgba(255,255,255,0.3)';
              e.target.style.transform = 'translate(-50%, -50%) scale(1.1)';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'rgba(255,255,255,0.2)';
              e.target.style.transform = 'translate(-50%, -50%) scale(1)';
            }}
          >
            ▶
          </div>
        )}
      </div>

      {/* Action Bar - đặt ở dưới cùng như layout cố định */}
      {actionBar && (
        <div style={actionBarStyle}>
          {actionBar}
        </div>
      )}

      {/* Add keyframes for loading spinner */}
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default CameraViewer;