import React, { useRef, useEffect, useState } from "react";
import Hls from "hls.js";
import "./hideVideoControls.css";

const CameraViewer = ({ camera, actionBar, onClose }) => {
  const videoRef = useRef(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let hls;
    const video = videoRef.current;

    const initPlayer = () => {
      if (!camera.streamUrl || !video) return;
      if (camera.streamUrl && videoRef.current) {
        if (Hls.isSupported()) {
          hls = new Hls({
            maxBufferLength: 30, // Giảm buffer để tránh tràn
            maxMaxBufferLength: 60,
            enableWorker: true,
            ragLoadingTimeOut: 10000, // Tăng thời gian chờ
            manifestLoadingTimeOut: 10000,
            levelLoadingTimeOut: 10000,
            nudgeOffset: 0.1, // Giảm giá trị nudge
            maxFragLookUpTolerance: 0.2,
            liveSyncDuration: 30,
          });

          hls.loadSource(camera.streamUrl);
          hls.attachMedia(video);

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setLoading(false);
            video.play().catch((err) => {
              console.error("Play error:", err);
              setTimeout(() => video.play(), 1000);
            });
          });

          hls.on(Hls.Events.ERROR, (event, data) => {
            setLoading(false);
            console.error("HLS Error:", data);
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  console.log("Network error, trying to recover");
                  hls.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  console.log("Media error, recovering");
                  hls.recoverMediaError();
                  break;
                default:
                  console.log("Unrecoverable error, destroying and recreating");
                  hls.destroy();
                  setTimeout(initPlayer, 2000); // Tự động thử lại sau 2 giây
                  break;
              }
            }
          });
        } else if (
          videoRef.current.canPlayType("application/vnd.apple.mpegurl")
        ) {
          videoRef.current.src = camera.streamUrl;
          videoRef.current.addEventListener("loadedmetadata", () => {
            videoRef.current.play().catch((err) => {
              alert(
                `Không thể phát stream cho camera ${camera.id}: ${err.message}`
              );
            });
          });
        } else {
          alert("Trình duyệt không hỗ trợ HLS cho camera " + camera.id);
        }
      }
    };
    initPlayer();

    return () => {
      if (hls) hls.destroy();
      if (videoRef.current) {
        videoRef.current.src = "";
        videoRef.current.pause();
      }
    };
  }, [camera.streamUrl]);

  useEffect(() => {
    if (onClose) {
      return () => {
        if (videoRef.current) {
          videoRef.current.src = "";
          videoRef.current.pause();
        }
      };
    }
  }, [onClose]);

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
      {loading && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "white",
            zIndex: 10,
          }}
        >
          Đang tải video...
        </div>
      )}
      <video
        id={`video-${camera.id}`}
        ref={videoRef}
        controls={false}
        autoPlay
        style={{
          width: "100%",
          height: "calc(100% - 50px)",
          borderRadius: "8px 8px 0 0",
          backgroundColor: "#000",
          objectFit: "cover",
        }}
        onClick={() =>
          videoRef.current
            ?.play()
            .catch((err) => console.error("Manual play error:", err))
        }
      />
      <div style={{ width: "100%" }}>{actionBar}</div>
    </div>
  );
};

export default CameraViewer;