import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import {
  Box,
  Button,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CardActions,
  IconButton,
  Chip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  InputBase,
} from '@mui/material';
import {
  PlayArrow,
  Stop,
  Close,
  FileUpload,
  Clear,
  CameraAlt,
  VideoLibrary,
  DirectionsCar,
  FirstPage,
  LastPage,
  ChevronLeft,
  ChevronRight,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import CameraViewer from '../../components/CameraViewer';
import { fetchDataFromAPI, postData, fetchDataFromFlaskAPI, checkTokenValidity } from '../../utils/auth';


const PlateRecognition = () => {
  // States for streams and videos
  const [cameras, setCameras] = useState([]);
  const [selectedStreams, setSelectedStreams] = useState([]);
  const [uploadedVideos, setUploadedVideos] = useState([]);
  const [cameraSizes, setCameraSizes] = useState({});
  const [retrying, setRetrying] = useState({});
  
  // States for plate recognition
  const [detectedPlates, setDetectedPlates] = useState([]);
  const [recognitionStatus, setRecognitionStatus] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [streamFrames, setStreamFrames] = useState({}); // Lưu frame_base64 cho từng stream
  
  // States for pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [gotoPage, setGotoPage] = useState('');
  const [loadingPlates, setLoadingPlates] = useState(false);
  
  // States for UI
  const [selectedFile, setSelectedFile] = useState(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // WebSocket connection
  const wsRef = useRef({});
  const sendTimersRef = useRef({});
  const processingStreams = useRef(new Set());
  const hlsRefs = useRef({});

  // Fetch cameras on component mount
  useEffect(() => {
    // Kiểm tra authentication trước khi fetch data
    const token = localStorage.getItem('token');
    if (!token) {
      toast.error('Vui lòng đăng nhập để sử dụng chức năng này');
      window.location.href = '/login';
      return;
    }
    
    if (!checkTokenValidity()) {
      toast.error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      window.location.href = '/login';
      return;
    }
    
    fetchCameras();
    
    // Define global functions for sidebar integration
    window.startCameraStream = handleCameraClick;
    window.startVideoStream = handleVideoClick;
    
    return () => {
      // Cleanup WebSocket connections
      if (wsRef.current && Object.keys(wsRef.current).length > 0) {
        // Close all WebSocket connections
        Object.values(wsRef.current).forEach(ws => {
          if (ws && typeof ws.close === 'function') {
            ws.close();
          }
        });
        wsRef.current = {};
      }
      // Clear global functions
      delete window.startCameraStream;
      delete window.startVideoStream;
    };
  }, []);

  // Initialize HLS for any .m3u8 streams
  useEffect(() => {
    selectedStreams.forEach((stream) => {
      try {
        if (!stream?.streamUrl || !stream.streamUrl.includes('.m3u8')) return;
        const videoEl = document.getElementById(`video-${stream.id}`);
        if (!videoEl) return;
        if (Hls.isSupported()) {
          // Avoid recreating if already attached to same URL
          if (hlsRefs.current[stream.id]) {
            const prev = hlsRefs.current[stream.id];
            if (prev.url === stream.streamUrl) return;
            try { prev.hls.destroy(); } catch (e) {}
            delete hlsRefs.current[stream.id];
          }
          const hls = new Hls({ maxBufferLength: 60, maxMaxBufferLength: 120 });
          hls.loadSource(stream.streamUrl);
          hls.attachMedia(videoEl);
          hls.on(Hls.Events.ERROR, (event, data) => {
            console.error('HLS error', data);
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  hls.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  hls.recoverMediaError();
                  break;
                default:
                  hls.destroy();
              }
            }
          });
          hlsRefs.current[stream.id] = { hls, url: stream.streamUrl };
        } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
          videoEl.src = stream.streamUrl;
        }
      } catch (e) {
        console.error('Failed to init HLS for', stream, e);
      }
    });

    // Cleanup on unmount
    return () => {
      Object.values(hlsRefs.current).forEach(({ hls }) => {
        try { hls.destroy(); } catch (e) {}
      });
      hlsRefs.current = {};
    };
  }, [selectedStreams]);

  // Fetch cameras from API
  const fetchCameras = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.warn('No token found, skipping camera fetch');
        toast.warning('Vui lòng đăng nhập để sử dụng chức năng này');
        return;
      }
      
      // Kiểm tra token validity trước khi gọi API
      if (!checkTokenValidity()) {
        toast.error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        window.location.href = '/login';
        return;
      }
      
      const response = await fetchDataFromAPI('/api/cameras/streams/all', token);
      if (response.success) {
        // Extract cameras from response
        const cameraList = response.data?.cameras || [];
        setCameras(cameraList);
        console.log('Fetched cameras:', cameraList);
        
        if (cameraList.length === 0) {
          toast.info('Không có camera nào khả dụng');
        }
      } else {
        toast.error('Không thể tải danh sách camera: ' + (response.message || 'Lỗi không xác định'));
      }
    } catch (error) {
      console.error('Error fetching cameras:', error);
      if (error.status === 401) {
        toast.error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        // Redirect to login page
        window.location.href = '/login';
      } else {
        toast.error('Không thể tải danh sách camera: ' + (error.message || 'Lỗi không xác định'));
      }
    }
  };

  // Handle camera selection from sidebar
  const handleCameraClick = async (camera) => {
    try {
      // Check if camera is already in selected streams
      const existingStream = selectedStreams.find(stream => 
        stream.id === camera.id && stream.type === 'camera'
      );
      
      if (existingStream) {
        toast.info('Camera đã được chọn');
        return;
      }

      // Start camera stream via API (correct endpoint)
      const token = localStorage.getItem('token');
      const startResp = await postData(`/api/cameras/${camera.id}/stream/start`, { type: 'hls' }, token);

      if (startResp.success) {
        // Get RTSP info (with credentials if any) for detection
        const infoResp = await fetchDataFromAPI(`/api/cameras/${camera.id}/stream`, token);
        const rtspUrl = infoResp?.data?.camera?.stream_url || camera.rtsp_url || '';

        // Normalize HLS URL from server
        let hlsUrl = startResp?.data?.stream?.streamUrl || `/streams/${camera.id}/stream.m3u8`;
        if (hlsUrl.includes('localhost')) {
          try {
            const urlObj = new URL(hlsUrl);
            urlObj.hostname = window.location.hostname;
            hlsUrl = urlObj.toString();
          } catch (e) {
            hlsUrl = hlsUrl.replace('localhost', window.location.hostname);
          }
        }

        const newStream = {
          id: camera.id,
          name: camera.name,
          type: 'camera',
          url: rtspUrl,
          streamUrl: hlsUrl,
          status: 'active',
          timestamp: new Date().toISOString()
        };

        setSelectedStreams(prev => [...prev, newStream]);
        setCameraSizes(prev => ({ ...prev, [camera.id]: { width: 640, height: 480 } }));
        
        toast.success(`Đã mở camera: ${camera.name}`);
        
        // Start plate recognition for this camera
        startPlateRecognitionForStream(newStream);
      } else {
        toast.error('Không thể mở camera');
      }
    } catch (error) {
      console.error('Error starting camera stream:', error);
      toast.error('Lỗi khi mở camera');
    }
  };

  // Handle video selection from sidebar
  const handleVideoClick = async (video) => {
    try {
      // Check if video is already in selected streams
      const existingStream = selectedStreams.find(stream => 
        stream.id === video.id && stream.type === 'video'
      );
      
      if (existingStream) {
        toast.info('Video đã được chọn');
        return;
      }

      const newStream = {
        id: video.id,
        name: video.filename,
        type: 'video',
        url: `/uploads/videos/${video.filename}`, // Sử dụng đường dẫn đầy đủ
        streamUrl: `/uploads/videos/${video.filename}`,
        status: 'active',
        timestamp: new Date().toISOString()
      };

      setSelectedStreams(prev => [...prev, newStream]);
      setCameraSizes(prev => ({ ...prev, [video.id]: { width: 640, height: 480 } }));
      
      toast.success(`Đã mở video: ${video.filename}`);
      
      // Start plate recognition for this video
      startPlateRecognitionForStream(newStream);
    } catch (error) {
      console.error('Error starting video stream:', error);
      toast.error('Lỗi khi mở video');
    }
  };

  // Handle file upload
  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      toast.error('Vui lòng chọn file video');
      return;
    }

    setSelectedFile(file);
    setShowUploadDialog(true);
  };

  // Upload video file
  const uploadVideo = async () => {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('video', selectedFile);

    try {
      setIsProcessing(true);
      setUploadProgress(0);

      console.log('Uploading video:', selectedFile.name);
      const response = await fetch('/api/upload-video', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        toast.success('Video đã được tải lên thành công');
        
        // Add to uploaded videos list
        setUploadedVideos(prev => [...prev, result]);
        
        // Close dialog and reset
        setShowUploadDialog(false);
        setSelectedFile(null);
        setUploadProgress(0);
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('Error uploading video:', error);
      toast.error('Lỗi khi tải video lên');
    } finally {
      setIsProcessing(false);
    }
  };

  // Pagination helper functions
  const loadDetectedPlates = async (page = 1, limit = 20) => {
    try {
      setLoadingPlates(true);
      const response = await fetchDataFromFlaskAPI(`/api/detected-plates?page=${page}&limit=${limit}`);
      
      if (response.success) {
        setDetectedPlates(response.data || []);
        if (response.pagination) {
          setTotalPages(response.pagination.total_pages || 1);
          setTotalItems(response.pagination.total || 0);
        }
      } else {
        console.error('Error loading detected plates:', response.message);
        toast.error('Lỗi khi tải danh sách biển số');
      }
    } catch (error) {
      console.error('Error loading detected plates:', error);
      toast.error('Lỗi khi tải danh sách biển số');
    } finally {
      setLoadingPlates(false);
    }
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    loadDetectedPlates(newPage, itemsPerPage);
  };

  const handleItemsPerPageChange = (event) => {
    const newLimit = event.target.value;
    setItemsPerPage(newLimit);
    setCurrentPage(1);
    loadDetectedPlates(1, newLimit);
  };

  const handleGotoPage = () => {
    const page = parseInt(gotoPage, 10);
    if (page && page >= 1 && page <= totalPages) {
      handlePageChange(page);
      setGotoPage('');
    }
  };

  const getPaginationItems = (current, total) => {
    const items = [];
    const maxVisible = 5;
    
    if (total <= maxVisible) {
      for (let i = 1; i <= total; i++) {
        items.push(i);
      }
    } else {
      if (current <= 3) {
        for (let i = 1; i <= 4; i++) {
          items.push(i);
        }
        items.push('...');
        items.push(total);
      } else if (current >= total - 2) {
        items.push(1);
        items.push('...');
        for (let i = total - 3; i <= total; i++) {
          items.push(i);
        }
      } else {
        items.push(1);
        items.push('...');
        for (let i = current - 1; i <= current + 1; i++) {
          items.push(i);
        }
        items.push('...');
        items.push(total);
      }
    }
    
    return items;
  };

  // Reset gotoPage when currentPage changes
  useEffect(() => {
    setGotoPage('');
  }, [currentPage]);

  // Load detected plates when component mounts or pagination changes
  useEffect(() => {
    loadDetectedPlates(currentPage, itemsPerPage);
  }, [currentPage, itemsPerPage]);

  // Start plate recognition for a stream
  const startPlateRecognitionForStream = (stream) => {
    if (processingStreams.current.has(stream.id)) {
      console.log(`Stream ${stream.id} is already processing`);
      return; // Already processing
    }

    console.log(`Starting plate recognition for stream:`, stream);
    processingStreams.current.add(stream.id);
    setRecognitionStatus(prev => ({ ...prev, [stream.id]: 'processing' }));

    // Sử dụng API thay vì WebSocket
    if (stream.type === 'uploaded_video' || stream.type === 'video') {
      // Xử lý video đã upload
      processVideoForRecognition(stream);
    } else if (stream.type === 'camera') {
      // Xử lý camera stream
      processCameraForRecognition(stream);
    }
  };

  // Xử lý video cho nhận diện
  const processVideoForRecognition = async (stream) => {
    try {
      console.log(`Processing video for recognition: ${stream.name}`);
      
      // Tạo form data với video URL
      const formData = new FormData();
      
      // Fetch video file từ URL
      const videoResponse = await fetch(stream.streamUrl);
      const videoBlob = await videoResponse.blob();
      formData.append('video', videoBlob, stream.name);
      
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No token found for video processing');
        setRecognitionStatus(prev => ({ ...prev, [stream.id]: 'error' }));
        toast.error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        return;
      }
      
      // Sử dụng postData function để có đúng base URL
      const result = await postData('/api/plate-recognition/detect-plates', formData, token, true);
      
      if (result.success) {
          console.log('Video processing completed:', result.data);
          
          // Xử lý kết quả nhận diện từ detector_enhanced
          const detectionData = result.data;
          
          if (detectionData.detections && Array.isArray(detectionData.detections)) {
            // Xử lý kết quả từ detector_enhanced
            detectionData.detections.forEach((detection, index) => {
              if (detection.ocr_results && detection.ocr_results.length > 0) {
                detection.ocr_results.forEach((ocrResult, ocrIndex) => {
                  const newPlate = {
                    id: `${stream.id}_${Date.now()}_${index}_${ocrIndex}`,
                    text: ocrResult || 'Unknown',
                    confidence: detection.boxes[ocrIndex] ? detection.boxes[ocrIndex][4] : 0,
                    streamId: stream.id,
                    streamName: stream.name,
                    streamType: stream.type,
                    timestamp: new Date().toISOString(),
                    bbox: detection.boxes[ocrIndex] || [],
                    vehicleType: 'unknown',
                    frameIndex: detection.frame || 0,
                    cropFilename: null
                  };
                  
                  setDetectedPlates(prev => [newPlate, ...prev]);
                });
              }
            });
            
            const totalDetections = detectionData.detections.reduce((total, detection) => 
              total + (detection.ocr_results ? detection.ocr_results.length : 0), 0);
            
            // Tạo overlay cho video upload
            if (detectionData.detections.length > 0) {
              // Tạo canvas để vẽ overlay
              const canvas = document.createElement('canvas');
              canvas.width = 960;
              canvas.height = 540;
              const ctx = canvas.getContext('2d');
              
              // Vẽ ROI (ghim phía dưới khung hình)
              {
                const roi = detectionData.detections[0].roi || [];
                let rx1 = typeof roi[0] === 'number' ? roi[0] : Math.floor(canvas.width * 0.05);
                let ry1 = typeof roi[1] === 'number' ? roi[1] : Math.floor(canvas.height * 0.55);
                let rx2 = typeof roi[2] === 'number' ? roi[2] : Math.floor(canvas.width * 0.95);
                let ry2 = typeof roi[3] === 'number' ? roi[3] : Math.floor(canvas.height * 0.98);
                // Ghim đáy ROI vào đáy khung và giữ nguyên chiều cao ROI
                const roiHeight = Math.max(1, ry2 - ry1);
                ry2 = canvas.height - 1;
                ry1 = Math.max(0, ry2 - roiHeight);
                // Vẽ
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 2;
                ctx.strokeRect(rx1, ry1, Math.max(1, rx2 - rx1), Math.max(1, ry2 - ry1));
              }
              
              // Vẽ bounding boxes từ server-aligned tracks với scale chính xác
              const frameW = detectionData.frame_width || canvas.width;
              const frameH = detectionData.frame_height || canvas.height;
              const sx = canvas.width / frameW;
              const sy = canvas.height / frameH;
              const tracks = detectionData.tracks || [];
              tracks.forEach((t) => {
                if (!t || !t.bbox || t.bbox.length < 4) return;
                const [x1, y1, x2, y2] = t.bbox;
                const rx1 = Math.round(x1 * sx), ry1 = Math.round(y1 * sy);
                const rx2 = Math.round(x2 * sx), ry2 = Math.round(y2 * sy);
                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 2;
                ctx.strokeRect(rx1, ry1, Math.max(1, rx2 - rx1), Math.max(1, ry2 - ry1));
                const vehicleName = ({2:'Car',3:'Motorbike',5:'Bus',7:'Truck'})[t.class_id] || 'Vehicle';
                const ocrText = t.plate_text || '...';
                const label = `${vehicleName}: T${t.track_id} | ${ocrText}`;
                ctx.font = '16px Arial';
                const tw = Math.ceil(ctx.measureText(label).width) + 10;
                ctx.fillStyle = '#000000';
                ctx.fillRect(rx1, ry1 - 25, tw, 22);
                ctx.fillStyle = '#ffffff';
                ctx.fillText(label, rx1 + 5, ry1 - 8);
                if (t.plate_bbox && t.plate_bbox.length >= 4) {
                  const [px1, py1, px2, py2] = t.plate_bbox;
                  const rpx1 = Math.round(px1 * sx), rpy1 = Math.round(py1 * sy);
                  const rpx2 = Math.round(px2 * sx), rpy2 = Math.round(py2 * sy);
                  ctx.strokeStyle = '#ffffff';
                  ctx.lineWidth = 2;
                  ctx.strokeRect(rpx1, rpy1, Math.max(1, rpx2 - rpx1), Math.max(1, rpy2 - rpy1));
                  if (t.plate_text) {
                    const plateLabel = `${t.plate_text} (${(t.confidence||0).toFixed(2)})`;
                    const pw = Math.ceil(ctx.measureText(plateLabel).width) + 10;
                    ctx.fillStyle = '#000000';
                    ctx.fillRect(rpx1, rpy1 - 22, pw, 20);
                    ctx.fillStyle = '#00ff00';
                    ctx.fillText(plateLabel, rpx1 + 5, rpy1 - 7);
                  }
                }
              });
              
              // Vẽ FPS
              ctx.fillStyle = '#ffff00';
              ctx.font = '20px Arial';
              ctx.fillText('FPS: 30.0', 10, 30);
              
              // Chuyển canvas thành data URL
              const overlayDataUrl = canvas.toDataURL('image/jpeg', 0.8);
              setStreamFrames(prev => ({ ...prev, [stream.id]: overlayDataUrl }));
            }
            
            setRecognitionStatus(prev => ({ ...prev, [stream.id]: 'completed' }));
            toast.success(`Đã phát hiện ${totalDetections} biển số xe`);
          } else if (detectionData.detected_plates && Array.isArray(detectionData.detected_plates)) {
            // Xử lý kết quả từ detector cũ
            detectionData.detected_plates.forEach((plate, index) => {
              const newPlate = {
                id: `${stream.id}_${Date.now()}_${index}`,
                text: plate.plate_number || plate.text || 'Unknown',
                confidence: plate.confidence || 0,
                streamId: stream.id,
                streamName: stream.name,
                streamType: stream.type,
                timestamp: new Date().toISOString(),
                bbox: plate.bbox || [],
                vehicleType: 'unknown',
                frameIndex: plate.first_seen || 0,
                cropFilename: plate.crop_filename || null
              };
              
              setDetectedPlates(prev => [newPlate, ...prev]);
            });
            
            setRecognitionStatus(prev => ({ ...prev, [stream.id]: 'completed' }));
            toast.success(`Đã phát hiện ${detectionData.detected_plates.length} biển số xe`);
          } else {
            setRecognitionStatus(prev => ({ ...prev, [stream.id]: 'completed' }));
            toast.success('Xử lý video hoàn tất');
          }
          
        } else {
          console.error('Video processing failed:', result.message);
          setRecognitionStatus(prev => ({ ...prev, [stream.id]: 'error' }));
          toast.error(`Lỗi xử lý video: ${result.message}`);
        }
    } catch (error) {
      console.error('Error processing video:', error);
      setRecognitionStatus(prev => ({ ...prev, [stream.id]: 'error' }));
      toast.error('Lỗi xử lý video');
    } finally {
      processingStreams.current.delete(stream.id);
    }
  };

  // Xử lý camera cho nhận diện
  const processCameraForRecognition = async (stream) => {
    try {
      console.log(`Processing camera for recognition via frame streaming: ${stream.name}`);

      const detectHost = process.env.REACT_APP_DETECT_HOST || (window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname);
      const wsUrl = `ws://${detectHost}:5000/recognize-ws`;
      const ws = new WebSocket(wsUrl);

      ws.binaryType = 'blob';

      ws.onopen = () => {
        console.log(`WebSocket connected for stream: ${stream.name}`);
        setRecognitionStatus(prev => ({ ...prev, [stream.id]: 'processing' }));

        // Yêu cầu backend khởi động stream camera theo thời gian thực (fresh)
        try {
          ws.send(JSON.stringify({ type: 'start_stream', cameraId: stream.id, fresh: true }));
        } catch (e) {}

        // Start sending frames from the <video> element for this stream
        const sendFrame = () => {
          const videoEl = document.getElementById(`video-${stream.id}`);
          if (!videoEl || videoEl.paused || videoEl.ended || ws.readyState !== WebSocket.OPEN) {
            sendTimersRef.current[stream.id] = setTimeout(sendFrame, 100);
            return;
          }
          try {
            const canvas = document.createElement('canvas');
            // Use source video resolution up to a practical cap for better OCR
            const srcW = videoEl.videoWidth || 960;
            const srcH = videoEl.videoHeight || 540;
            const maxW = 1280;
            const scale = Math.min(1, maxW / (srcW || 1));
            canvas.width = Math.max(640, Math.round(srcW * scale));
            canvas.height = Math.max(360, Math.round(srcH * scale));
            const ctx = canvas.getContext('2d');
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
              if (blob && ws.readyState === WebSocket.OPEN) {
                blob.arrayBuffer().then((buffer) => {
                  ws.send(buffer);
                }).catch(() => {});
              }
              sendTimersRef.current[stream.id] = setTimeout(sendFrame, 66);
            }, 'image/jpeg', 0.8);
          } catch (e) {
            sendTimersRef.current[stream.id] = setTimeout(sendFrame, 100);
          }
        };
        sendFrame();
      };

      ws.onmessage = async (event) => {
        // Server sends JSON metadata followed by binary JPEG frames
        if (event.data instanceof Blob) {
          const reader = new FileReader();
          reader.onload = () => {
            // reader.result is a data URL (e.g., data:image/jpeg;base64,...)
            const dataUrl = reader.result;
            setStreamFrames(prev => ({ ...prev, [stream.id]: dataUrl }));
          };
          reader.readAsDataURL(event.data);
        } else {
          try {
            const meta = JSON.parse(event.data);
            const ocrList = meta.ocr_results || [];
            if (ocrList.length > 0) {
              const newItems = ocrList.map((ocrResult, idx) => {
                const text = typeof ocrResult === 'string' ? ocrResult : ocrResult.text || 'Unknown';
                const confidence = typeof ocrResult === 'object' ? ocrResult.confidence || 0 : 0;
                const cropFilename = typeof ocrResult === 'object' ? ocrResult.crop_filename || '' : '';
                
                return {
                  id: `${stream.id}_${Date.now()}_${idx}`,
                  text: text,
                  confidence: confidence,
                  streamId: stream.id,
                  streamName: stream.name,
                  streamType: stream.type,
                  timestamp: new Date().toISOString(),
                  bbox: (meta.boxes && meta.boxes[idx]) || [],
                  vehicleType: 'unknown',
                  crop_filename: cropFilename
                };
              });
              setDetectedPlates(prev => [...newItems, ...prev]);
              setRecognitionStatus(prev => ({ ...prev, [stream.id]: 'detecting' }));
            }
          } catch (_) {
            // ignore non-JSON text
          }
        }
      };

      ws.onerror = (error) => {
        console.error(`WebSocket error for stream ${stream.name}:`, error);
        setRecognitionStatus(prev => ({ ...prev, [stream.id]: 'error' }));
        processingStreams.current.delete(stream.id);
        toast.error(`Lỗi kết nối nhận diện cho ${stream.name}`);
      };

      ws.onclose = (event) => {
        console.log(`WebSocket closed for stream: ${stream.name}, code: ${event.code}, reason: ${event.reason}`);
        processingStreams.current.delete(stream.id);
        setRecognitionStatus(prev => ({ ...prev, [stream.id]: 'stopped' }));
        if (sendTimersRef.current[stream.id]) {
          clearTimeout(sendTimersRef.current[stream.id]);
          delete sendTimersRef.current[stream.id];
        }
      };



      // Store WebSocket reference
      if (!wsRef.current) {
        wsRef.current = {};
      }
      wsRef.current[stream.id] = ws;

    } catch (error) {
      console.error('Error starting plate recognition:', error);
      setRecognitionStatus(prev => ({ ...prev, [stream.id]: 'error' }));
      processingStreams.current.delete(stream.id);
      toast.error(`Không thể bắt đầu nhận diện cho ${stream.name}`);
    }
  };

  // Stop plate recognition for a stream
  const stopPlateRecognition = (streamId) => {
    if (wsRef.current && wsRef.current[streamId] && typeof wsRef.current[streamId].close === 'function') {
      wsRef.current[streamId].close();
      delete wsRef.current[streamId];
    }
    if (sendTimersRef.current[streamId]) {
      clearTimeout(sendTimersRef.current[streamId]);
      delete sendTimersRef.current[streamId];
    }
    
    processingStreams.current.delete(streamId);
    setRecognitionStatus(prev => ({ ...prev, [streamId]: 'stopped' }));
  };

  // Close a stream
  const handleCloseStream = (streamId) => {
    // Stop plate recognition
    stopPlateRecognition(streamId);

    // Destroy HLS if exists
    if (hlsRefs.current[streamId]) {
      try { hlsRefs.current[streamId].hls.destroy(); } catch (e) {}
      delete hlsRefs.current[streamId];
    }
    
    // Remove from selected streams
    setSelectedStreams(prev => prev.filter(stream => stream.id !== streamId));
    
    // Remove from camera sizes
    setCameraSizes(prev => {
      const newSizes = { ...prev };
      delete newSizes[streamId];
      return newSizes;
    });
    
    toast.success('Đã đóng stream');
  };

  // Clear all streams
  const handleClearAll = () => {
    // Close all WebSocket connections
    if (wsRef.current && Object.keys(wsRef.current).length > 0) {
      Object.values(wsRef.current).forEach(ws => {
        if (ws && typeof ws.close === 'function') {
          ws.close();
        }
      });
      wsRef.current = {};
    }
    
    processingStreams.current.clear();
    setSelectedStreams([]);
    setCameraSizes({});
    setRecognitionStatus({});
    setDetectedPlates([]);
    
    toast.success('Đã xóa tất cả streams');
  };

  // Clear detected plates
  const handleClearPlates = async () => {
    try {
      const response = await fetch('http://localhost:5000/clear-detected-plates', {
        method: 'POST'
      });
      
      if (response.ok) {
        setDetectedPlates([]);
        setTotalItems(0);
        setTotalPages(1);
        setCurrentPage(1);
        toast.success('Đã xóa danh sách biển số xe');
      }
    } catch (error) {
      console.error('Error clearing plates:', error);
      toast.error('Lỗi khi xóa danh sách biển số xe');
    }
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'processing': return 'primary';
      case 'detecting': return 'success';
      case 'error': return 'error';
      case 'stopped': return 'default';
      default: return 'default';
    }
  };

  // Get status text
  const getStatusText = (status) => {
    switch (status) {
      case 'processing': return 'Đang xử lý';
      case 'detecting': return 'Đang nhận diện';
      case 'error': return 'Lỗi';
      case 'stopped': return 'Đã dừng';
      default: return 'Chưa bắt đầu';
    }
  };

  return (
    <Box sx={{ p: 3, height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Paper elevation={2} sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h4" component="h1" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DirectionsCar color="primary" />
            Nhận Diện Biển Số Xe
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              startIcon={<FileUpload />}
              onClick={() => document.getElementById('video-upload').click()}
            >
              Chọn Video
            </Button>
            <Button
              variant="outlined"
              startIcon={<Clear />}
              onClick={handleClearAll}
              color="error"
            >
              Xóa Tất Cả
            </Button>
          </Box>
        </Box>

        {/* Camera List */}
        {cameras.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              Danh Sách Camera ({cameras.length})
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {cameras.map((camera) => (
                <Chip
                  key={camera.id}
                  label={camera.name}
                  icon={<CameraAlt />}
                  onClick={() => handleCameraClick(camera)}
                  color="primary"
                  variant="outlined"
                  clickable
                />
              ))}
            </Box>
          </Box>
        )}
      </Paper>

      {/* Main Content - Two Layout */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        
        {/* Top Section - Camera/Video Streams */}
        <Paper elevation={2} sx={{ flex: 1, p: 2 }}>
          <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <VideoLibrary color="primary" />
            Camera & Video Streams ({selectedStreams.length})
          </Typography>

          {selectedStreams.length === 0 ? (
            <Box sx={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center', 
              height: '300px',
              gap: 2
            }}>
              <CameraAlt sx={{ fontSize: 64, color: 'text.secondary' }} />
              <Typography variant="h6" color="text.secondary">
                Chưa có camera hoặc video nào được mở
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Chọn camera từ danh sách hoặc tải lên video để bắt đầu nhận diện
              </Typography>
            </Box>
          ) : (
            <Grid container spacing={2}>
              {selectedStreams.map((stream) => (
                <Grid item xs={12} sm={6} md={4} key={stream.id}>
                  <Card elevation={3} sx={{ height: '100%' }}>
                    <CardContent sx={{ p: 1 }}>
                      <Box sx={{ position: 'relative' }}>
                        <Box sx={{ position: 'relative' }}>
                          {/* Hiển thị video gốc */}
                          <video
                            id={`video-${stream.id}`}
                            src={stream.streamUrl}
                            width={cameraSizes[stream.id]?.width || 640}
                            height={cameraSizes[stream.id]?.height || 480}
                            style={{ borderRadius: 8, objectFit: 'contain', background: '#222' }}
                            autoPlay
                            muted
                            controls
                            preload="metadata"
                            onError={(e) => {
                              console.error('Video error:', e);
                              console.error('Video src:', stream.streamUrl);
                              console.error('Stream info:', stream);
                              // Thử fallback URL
                              const fallbackUrl = stream.streamUrl.replace('/uploads/', '/api/uploads/');
                              console.log('Trying fallback URL:', fallbackUrl);
                              e.target.src = fallbackUrl;
                            }}
                            onLoadStart={() => console.log('Video loading started:', stream.streamUrl)}
                            onLoadedData={() => console.log('Video loaded successfully:', stream.streamUrl)}
                            onCanPlay={() => console.log('Video can play:', stream.streamUrl)}
                          />
                          
                          {/* Hiển thị overlay frame với kết quả nhận diện */}
                          {streamFrames[stream.id] && (
                            <Box
                              sx={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                pointerEvents: 'none',
                              }}
                            >
                              <img
                                src={streamFrames[stream.id]}
                                alt="Recognition overlay"
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'cover',
                                  borderRadius: '8px',
                                }}
                              />
                            </Box>
                          )}
                          
                          {/* Hiển thị action bar overlay */}
                          <Box
                            sx={{
                              position: 'absolute',
                              bottom: 0,
                              left: 0,
                              right: 0,
                              background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                              padding: 1,
                              pointerEvents: 'none',
                            }}
                          >
                            <Typography
                              variant="caption"
                              sx={{
                                color: 'white',
                                textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                              }}
                            >
                              {recognitionStatus[stream.id] ? 'Đang nhận diện...' : 'Sẵn sàng'}
                            </Typography>
                          </Box>
                        </Box>
                        
                        {/* Hiển thị status overlay */}
                        <Box
                          sx={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            background: 'rgba(0, 0, 0, 0.7)',
                            color: 'white',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            pointerEvents: 'none',
                          }}
                        >
                          {recognitionStatus[stream.id] ? '🔄 Đang xử lý' : '✅ Sẵn sàng'}
                        </Box>
                      </Box>
                                         </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Paper>

        {/* Bottom Section - Detected License Plates */}
        <Paper elevation={2} sx={{ height: '400px', p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <DirectionsCar color="success" />
              Biển Số Xe Được Phát Hiện ({totalItems})
            </Typography>
            
            <Button
              variant="outlined"
              size="small"
              startIcon={<Clear />}
              onClick={handleClearPlates}
              disabled={detectedPlates.length === 0}
            >
              Xóa Danh Sách
            </Button>
          </Box>

          {loadingPlates ? (
            <Box sx={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center', 
              height: '200px',
              gap: 1
            }}>
              <CircularProgress size={48} />
              <Typography variant="body1" color="text.secondary">
                Đang tải danh sách biển số...
              </Typography>
            </Box>
          ) : detectedPlates.length === 0 ? (
            <Box sx={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center', 
              height: '200px',
              gap: 1
            }}>
              <DirectionsCar sx={{ fontSize: 48, color: 'text.secondary' }} />
              <Typography variant="body1" color="text.secondary">
                Chưa có biển số xe nào được phát hiện
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Bắt đầu nhận diện để xem kết quả
              </Typography>
            </Box>
          ) : (
            <>
              <Box sx={{ height: '220px', overflow: 'auto', mb: 2 }}>
                <Grid container spacing={1}>
                  {detectedPlates.map((plate) => (
                    <Grid item xs={12} sm={6} md={4} key={plate.id}>
                      <Card variant="outlined" sx={{ p: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Box>
                            <Typography variant="h6" color="primary" fontWeight="bold">
                              {plate.plate_number || plate.text || 'N/A'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {plate.crop_filename ? 'Có ảnh' : 'Không có ảnh'} • {plate.verification_status || 'Chờ xác minh'}
                            </Typography>
                            {plate.crop_filename && (
                              <Box sx={{ mt: 1 }}>
                                <img
                                  src={`http://localhost:5000/static/crops/${plate.crop_filename}`}
                                  alt="Ảnh biển số"
                                  style={{
                                    width: '100%',
                                    maxWidth: 200,
                                    height: 'auto',
                                    borderRadius: 4,
                                    border: '1px solid #e0e0e0'
                                  }}
                                  onError={(e) => {
                                    console.error('Error loading crop image:', e);
                                    e.target.style.display = 'none';
                                  }}
                                />
                              </Box>
                            )}
                            <Typography variant="caption" color="text.secondary">
                              {plate.first_seen ? new Date(plate.first_seen * 1000).toLocaleString() : 'N/A'}
                            </Typography>
                          </Box>
                          
                          <Box sx={{ textAlign: 'right' }}>
                            <Chip
                              label={`${((plate.confidence || 0) * 100).toFixed(1)}%`}
                              color={plate.confidence > 0.8 ? "success" : plate.confidence > 0.5 ? "warning" : "error"}
                              size="small"
                            />
                            <Typography variant="caption" display="block" color="text.secondary">
                              {plate.has_crop ? 'Có ảnh' : 'Không có ảnh'}
                            </Typography>
                          </Box>
                        </Box>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </Box>

              {/* Pagination Controls */}
              <Box sx={{ 
                display: 'flex', 
                flexDirection: { xs: 'column', md: 'row' }, 
                alignItems: { xs: 'stretch', md: 'center' }, 
                justifyContent: 'space-between', 
                gap: 2, 
                p: 2, 
                borderTop: '1px solid #e0e0e0', 
                backgroundColor: '#fafafa',
                borderRadius: 1
              }}>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                  Hiển thị <strong>{((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalItems)}</strong> của <strong>{totalItems}</strong> kết quả
                </Typography>
                
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: 'center', gap: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" color="text.secondary">Hiển thị:</Typography>
                    <Select 
                      value={itemsPerPage} 
                      onChange={handleItemsPerPageChange} 
                      size="small" 
                      sx={{ minWidth: 80, '& .MuiSelect-select': { py: 0.5, fontSize: '0.875rem' } }}
                      renderValue={v => `${v}/ trang`}
                    >
                      {[10, 20, 50, 100].map(size => (
                        <MenuItem key={size} value={size}>{size}/ trang</MenuItem>
                      ))}
                    </Select>
                  </Box>
                  
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Button 
                      size="small" 
                      variant="outlined" 
                      onClick={() => handlePageChange(1)} 
                      disabled={currentPage === 1} 
                      sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}
                    >
                      <FirstPage fontSize="small" />
                    </Button>
                    <Button 
                      size="small" 
                      variant="outlined" 
                      onClick={() => handlePageChange(Math.max(1, currentPage - 1))} 
                      disabled={currentPage === 1} 
                      sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}
                    >
                      <ChevronLeft fontSize="small" />
                    </Button>
                    
                    {getPaginationItems(currentPage, totalPages).map((item, idx) => (
                      item === '...'
                        ? <Box key={`dots-${idx}`} sx={{ px: 1, color: '#999' }}>...</Box>
                        : <Button 
                            key={item} 
                            variant={item === currentPage ? 'contained' : 'outlined'} 
                            size="small" 
                            onClick={() => handlePageChange(item)} 
                            sx={{ 
                              minWidth: 32, 
                              width: 32, 
                              height: 32, 
                              borderRadius: 1, 
                              fontSize: '0.875rem', 
                              fontWeight: item === currentPage ? 600 : 400, 
                              ...(item === currentPage ? { 
                                backgroundColor: '#1976d2', 
                                color: 'white', 
                                border: 'none', 
                                '&:hover': { backgroundColor: '#1565c0' } 
                              } : { 
                                borderColor: '#e0e0e0', 
                                color: '#666', 
                                '&:hover': { backgroundColor: '#f5f5f5', borderColor: '#1976d2' } 
                              }) 
                            }}
                          >
                            {item}
                          </Button>
                    ))}
                    
                    <Button 
                      size="small" 
                      variant="outlined" 
                      onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))} 
                      disabled={currentPage === totalPages || totalPages === 0} 
                      sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}
                    >
                      <ChevronRight fontSize="small" />
                    </Button>
                    <Button 
                      size="small" 
                      variant="outlined" 
                      onClick={() => handlePageChange(totalPages)} 
                      disabled={currentPage === totalPages || totalPages === 0} 
                      sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}
                    >
                      <LastPage fontSize="small" />
                    </Button>
                  </Box>
                  
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" color="text.secondary">Đến trang:</Typography>
                    <InputBase 
                      value={gotoPage} 
                      onChange={e => setGotoPage(e.target.value.replace(/[^0-9]/g, ''))} 
                      onKeyDown={e => { 
                        if (e.key === 'Enter') { 
                          handleGotoPage(); 
                        } 
                      }} 
                      placeholder="1" 
                      sx={{ 
                        width: 60, 
                        height: 32, 
                        border: '1px solid #e0e0e0', 
                        borderRadius: 1, 
                        px: 1, 
                        fontSize: '0.875rem', 
                        '& input': { textAlign: 'center' } 
                      }} 
                    />
                    <Button 
                      size="small" 
                      variant="outlined" 
                      onClick={handleGotoPage} 
                      disabled={!gotoPage || parseInt(gotoPage, 10) < 1 || parseInt(gotoPage, 10) > totalPages} 
                      sx={{ minWidth: 'auto', px: 2, height: 32, textTransform: 'none', fontSize: '0.875rem' }}
                    >
                      Đi
                    </Button>
                  </Box>
                </Box>
              </Box>
            </>
          )}
        </Paper>
      </Box>

      {/* Hidden file input */}
      <input
        id="video-upload"
        type="file"
        accept="video/*"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onClose={() => setShowUploadDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Upload Video</DialogTitle>
        <DialogContent>
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body1" sx={{ mb: 2 }}>
              {selectedFile?.name}
            </Typography>
            {isProcessing && (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                <CircularProgress size={20} />
                <Typography variant="body2">Đang tải lên...</Typography>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowUploadDialog(false)} disabled={isProcessing}>
            Hủy
          </Button>
          <Button onClick={uploadVideo} variant="contained" disabled={isProcessing}>
            Tải Lên
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PlateRecognition;
