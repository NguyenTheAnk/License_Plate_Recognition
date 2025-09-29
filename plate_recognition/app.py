import os
# Cấu hình môi trường cho FastALPR GPU
os.environ['OMP_NUM_THREADS'] = '4'
os.environ['ORT_LOGGING_LEVEL'] = '3'  # Suppress ONNX Runtime warnings
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'  # Suppress TensorFlow warnings
os.environ['CUDA_VISIBLE_DEVICES'] = '0'  # Use first GPU
os.environ['TF_FORCE_GPU_ALLOW_GROWTH'] = 'true'  # Allow GPU memory growth

# Thiết lập ONNX Runtime providers trước khi import bất kỳ thư viện nào khác
import onnxruntime as ort
ort.set_default_logger_severity(3)

# Configure ONNX Runtime providers for optimal GPU usage
def get_onnx_providers():
    """Get optimal ONNX Runtime providers based on available hardware"""
    providers = []
    
    # Check for CUDA availability
    try:
        cuda_available = ort.get_device() == 'GPU'
        if cuda_available:
            providers.append('CUDAExecutionProvider')
            print("✅ CUDA provider available")
    except Exception as e:
        print(f"⚠️ CUDA check failed: {e}")
    
    # Check for TensorRT availability
    try:
        import tensorrt
        providers.append('TensorrtExecutionProvider')
        print("✅ TensorRT provider available")
    except ImportError:
        print("⚠️ TensorRT not available")
    except Exception as e:
        print(f"⚠️ TensorRT check failed: {e}")
    
    # Always add CPU as fallback
    providers.append('CPUExecutionProvider')
    print(f"🔧 ONNX Runtime providers: {providers}")
    return providers

# Set global providers
ONNX_PROVIDERS = get_onnx_providers()

# GPU Detection and Optimization
def detect_gpu_capabilities():
    """Detect GPU capabilities and return optimization settings"""
    gpu_info = {
        'cuda_available': False,
        'tensorrt_available': False,
        'gpu_memory': 0,
        'optimization_level': 'cpu'
    }
    
    try:
        # Check CUDA availability
        import torch
        if torch.cuda.is_available():
            gpu_info['cuda_available'] = True
            gpu_info['gpu_memory'] = torch.cuda.get_device_properties(0).total_memory
            gpu_info['optimization_level'] = 'gpu'
            print(f"🎮 GPU detected: {torch.cuda.get_device_name(0)}")
            print(f"💾 GPU Memory: {gpu_info['gpu_memory'] / 1024**3:.1f} GB")
        else:
            print("⚠️ CUDA not available, using CPU")
    except ImportError:
        print("⚠️ PyTorch not available for GPU detection")
    except Exception as e:
        print(f"⚠️ GPU detection failed: {e}")
    
    try:
        # Check TensorRT availability
        import tensorrt
        gpu_info['tensorrt_available'] = True
        print("🚀 TensorRT available for acceleration")
    except ImportError:
        print("ℹ️ TensorRT not available")
    except Exception as e:
        print(f"⚠️ TensorRT check failed: {e}")
    
    return gpu_info

# Detect GPU capabilities
GPU_INFO = detect_gpu_capabilities()

from flask import Flask, request, jsonify, Response, send_from_directory
from flask_sock import Sock
from flask_cors import CORS
import cv2
import numpy as np
from detector import detect_and_ocr_stable, detect_and_ocr_thread_safe, process_frame_async, get_thread_manager_stats, enable_performance_optimizations, start_redis_server, is_redis_running, stop_redis_server
import json
import logging
import time
from urllib.parse import urlparse
import requests
from tempfile import NamedTemporaryFile
from queue import Queue
import subprocess
import uuid
import threading

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)
sock = Sock(app)

# SIMPLIFIED: Loại bỏ background thread phức tạp
# Detector.py sẽ gửi trực tiếp tới Node.js API

# Trong hàm recognize_ws, thêm xử lý cho HLS stream nếu RTSP không khả dụng
@sock.route('/recognize-ws')
def recognize_ws(ws):
    logger.info("Kết nối WebSocket mới được thiết lập")
    cap = None
    camera_id = "default"  # Khởi tạo camera_id mặc định
    source_type = "camera"  # Khởi tạo source_type mặc định
    video_filename = None
    camera_location = None
    camera_name = None
    
    # FPS control variables
    target_fps = 20
    frame_delay = 1.0 / target_fps  # 50ms per frame
    last_frame_time = time.time()

    try:
        while True:
            message = ws.receive()
            if message is None:
                logger.info("Kết nối WebSocket bị đóng bởi client")
                break

            if isinstance(message, bytes):
                # Xử lý frame từ frontend với FPS control
                try:
                    current_time = time.time()
                    
                    # Skip frames if we're ahead of target FPS
                    if current_time - last_frame_time < frame_delay:
                        continue
                    
                    # Chuyển đổi bytes thành numpy array
                    nparr = np.frombuffer(message, np.uint8)
                    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                    
                    if frame is not None:
                        # Xử lý frame với thread-safe detection
                        result = detect_and_ocr_thread_safe(frame, camera_id=camera_id, source_type=source_type, video_filename=video_filename, camera_location=camera_location, camera_name=camera_name)
                        
                        if isinstance(result, dict):
                            processed_frame_bytes = result.get('frame', b'')
                            tracked_objects = result.get('tracked_objects', {})
                            fps = result.get('fps', 0)
                            
                            # SIMPLIFIED: Detector.py sẽ tự gửi dữ liệu tới database
                            # Không cần xử lý queue ở đây nữa
                            
                            # Send processed frame with error handling
                            try:
                                if processed_frame_bytes:
                                    ws.send(processed_frame_bytes)
                                else:
                                    # Fallback: encode frame manually with optimized quality
                                    _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 60])
                                    ws.send(buffer.tobytes())
                                
                                last_frame_time = current_time
                            except Exception as ws_error:
                                logger.error(f"WebSocket send error: {ws_error}")
                                break  # Exit the loop if WebSocket is closed
                                
                        else:
                            # Legacy support: result is direct frame
                            if isinstance(result, np.ndarray):
                                _, buffer = cv2.imencode('.jpg', result, [cv2.IMWRITE_JPEG_QUALITY, 70])
                                frame_bytes = buffer.tobytes()
                            else:
                                frame_bytes = result
                            ws.send(frame_bytes)
                        
                        
                    else:
                        logger.warning("Failed to decode frame from frontend")
                except Exception as e:
                    logger.error(f"Error processing frame from frontend: {str(e)}")
                continue
            else:
                try:
                    data = json.loads(message)
                    logger.info(f"Received message: {data}")
                    
                    # Xử lý thông tin nguồn từ frontend
                    if data.get('type') == 'source_info':
                        logger.info(f"Received source info: {data}")
                        
                        source_type = data.get('source_type') or "camera"
                        video_url = data.get('video_url')
                        
                        # Debug: Log camera_id received
                        raw_camera_id = data.get('camera_id')
                        logger.info(f"🔍 Raw camera_id received: {raw_camera_id} (type: {type(raw_camera_id)})")
                        
                        # Xử lý video file URL
                        if source_type == 'video_file' and video_url:
                            logger.info(f"🎬 Processing video file: {video_url}")
                            
                            # Extract camera information for video file
                            raw_camera_id = data.get('camera_id')
                            if raw_camera_id is None or raw_camera_id == "default":
                                # Nếu không có camera_id từ frontend, sử dụng camera mặc định
                                camera_id = 1
                                logger.info("⚠️ No camera_id from frontend, using default camera_id=1")
                            elif isinstance(raw_camera_id, str) and '-' in raw_camera_id:
                                camera_id = int(raw_camera_id.split('-')[0])  # Convert to integer
                            else:
                                camera_id = int(raw_camera_id) if str(raw_camera_id).isdigit() else 1
                            
                            # Tạo camera_name từ video filename nếu không có từ frontend
                            camera_name = data.get('camera_name')
                            if not camera_name:
                                video_filename = data.get('video_filename', 'Unknown')
                                camera_name = f"Camera Video: {video_filename}"
                                logger.info(f"⚠️ No camera_name from frontend, using: {camera_name}")
                            
                            video_filename = data.get('video_filename')
                            camera_location = data.get('camera_location') or "Video Upload Location"
                            logger.info(f"📹 Video file info: ID={camera_id}, Name={camera_name}, Video={video_filename}, Location={camera_location}")
                            
                            # Đóng stream hiện tại nếu có
                            if cap is not None:
                                cap.release()
                                cap = None
                            
                            # Mở video file với OpenCV
                            cap = cv2.VideoCapture(video_url)
                            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                            
                            if not cap.isOpened():
                                logger.error(f"Không thể mở video file: {video_url}")
                                ws.send(json.dumps({"error": "Cannot open video file"}))
                                continue
                            
                            logger.info(f"Bắt đầu xử lý video file: {video_url}")
                            
                            # Xử lý video file và gửi frames đã xử lý
                            target_fps = 20
                            frame_delay = 1.0 / target_fps
                            last_frame_time = time.time()
                            
                            while cap.isOpened():
                                current_time = time.time()
                                
                                # Skip frames if we're ahead of target FPS
                                if current_time - last_frame_time < frame_delay:
                                    continue
                                    
                                ret, frame = cap.read()
                                if not ret:
                                    logger.warning("Không thể đọc frame từ video file")
                                    break
                                
                                # Xử lý frame với thread-safe detection - luôn dùng source_type="camera"
                                result = detect_and_ocr_thread_safe(frame, camera_id=camera_id, source_type="camera", video_filename=video_filename, camera_location=camera_location, camera_name=camera_name)
                                
                                if isinstance(result, dict):
                                    processed_frame_bytes = result.get('frame', b'')
                                    tracked_objects = result.get('tracked_objects', {})
                                    detection_count = result.get('detection_count', 0)
                                    skipped = result.get('skipped', False)
                                    fps = result.get('fps', 0)
                                    
                                    # FIXED: Giảm logging để tăng FPS - chỉ log khi có nhiều detections
                                    if detection_count > 2:  # Chỉ log khi có nhiều hơn 2 detections
                                        logger.info(f"📤 Sending processed frame - FPS: {fps:.1f}, Detections: {detection_count}")
                                    
                                    # Send processed frame
                                    if processed_frame_bytes:
                                        ws.send(processed_frame_bytes)
                                    else:
                                        # Fallback
                                        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                                        ws.send(buffer.tobytes())
                                    
                                    last_frame_time = current_time
                                else:
                                    # Legacy support
                                    if isinstance(result, np.ndarray):
                                        _, buffer = cv2.imencode('.jpg', result, [cv2.IMWRITE_JPEG_QUALITY, 70])
                                        frame_bytes = buffer.tobytes()
                                    else:
                                        frame_bytes = result
                                    ws.send(frame_bytes)
                            
                            # Video file processing completed
                            logger.info(f"Video file processing completed: {video_url}")
                            continue
                        
                        # Xử lý camera stream và video upload
                        if source_type in ['camera', 'video_upload']:
                            # Lưu thông tin camera để sử dụng sau
                            # Extract numeric part from camera_id (e.g., "11-1757684051439" -> 11)
                            raw_camera_id = data.get('camera_id') or "default"
                            if isinstance(raw_camera_id, str) and '-' in raw_camera_id:
                                camera_id = int(raw_camera_id.split('-')[0])  # Convert to integer
                            else:
                                camera_id = int(raw_camera_id) if str(raw_camera_id).isdigit() else 1
                            camera_name = data.get('camera_name')
                            video_filename = data.get('video_filename')
                            camera_location = data.get('camera_location')
                            logger.info(f"📷 {source_type} info: ID={camera_id}, Name={camera_name}, Type={source_type}, Video={video_filename}, Location={camera_location}")
                        else:
                            logger.info(f"📷 Other source type: {source_type}, camera_id: {data.get('camera_id')}")
                        continue
                    
                    # Xử lý RTSP URL
                    elif data.get('type') == 'rtsp_url' and 'url' in data:
                        stream_url = data['url']
                        camera_id = data.get('cameraId')

                        # Đóng stream hiện tại nếu có
                        if cap is not None:
                            cap.release()
                            cap = None

                        # Mở stream RTSP mới với tối ưu hóa
                        cap = cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG)
                        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Giảm buffer để tránh lag
                        cap.set(cv2.CAP_PROP_HW_ACCELERATION, 1)  # Bật hardware acceleration
                        
                        if not cap.isOpened():
                            logger.error(f"Không thể mở RTSP stream: {stream_url}")
                            ws.send(json.dumps({"error": "Cannot open RTSP stream"}))
                            continue

                        logger.info(f"Bắt đầu xử lý RTSP stream: {stream_url}")

                        # Xử lý stream và gửi frames đã xử lý với 20 FPS
                        target_fps = 20
                        frame_delay = 1.0 / target_fps  # 50ms per frame
                        last_frame_time = time.time()
                        
                        while cap.isOpened():
                            current_time = time.time()
                            
                            # Skip frames if we're ahead of target FPS
                            if current_time - last_frame_time < frame_delay:
                                continue
                                
                            ret, frame = cap.read()
                            if not ret:
                                logger.warning("Không thể đọc frame từ RTSP stream")
                                break
                            
                            # Xử lý frame với thread-safe detection
                            result = detect_and_ocr_thread_safe(frame, camera_id=camera_id, source_type=source_type, video_filename=video_filename, camera_location=camera_location, camera_name=camera_name)
                            
                            if isinstance(result, dict):
                                processed_frame_bytes = result.get('frame', b'')
                                tracked_objects = result.get('tracked_objects', {})
                                detection_count = result.get('detection_count', 0)
                                skipped = result.get('skipped', False)
                                fps = result.get('fps', 0)
                                
                                # FIXED: Giảm logging - chỉ log khi có detections
                                if detection_count > 0:
                                    logger.info(f"📤 Sending frame for camera {camera_id} - FPS: {fps:.1f}, Detections: {detection_count}")
                                
                                # SIMPLIFIED: Detector.py sẽ tự gửi dữ liệu tới database
                                
                                # Send processed frame for consistent FPS
                                if processed_frame_bytes:
                                    ws.send(processed_frame_bytes)
                                else:
                                    # Fallback
                                    _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                                    ws.send(buffer.tobytes())
                                
                                last_frame_time = current_time
                            else:
                                # Legacy support
                                if isinstance(result, np.ndarray):
                                    _, buffer = cv2.imencode('.jpg', result, [cv2.IMWRITE_JPEG_QUALITY, 70])
                                    frame_bytes = buffer.tobytes()
                                else:
                                    frame_bytes = result
                                ws.send(frame_bytes)

                except json.JSONDecodeError:
                    logger.warning("Nhận được thông điệp không hợp lệ")
                    continue

    except Exception as e:
        logger.error(f"Lỗi trong xử lý video WebSocket: {str(e)}")
    finally:
        if cap is not None:
            cap.release()
        logger.info("Kết nối WebSocket đã kết thúc")


def cleanup_crops():
    """Thêm hàm cleanup_crops để xóa crop cũ (giữ chỉ 50 crop mới nhất)"""
    crops_dir = 'static/crops'
    if not os.path.exists(crops_dir):
        return
    
    try:
        files = sorted(os.listdir(crops_dir),
                       key=lambda f: os.path.getmtime(os.path.join(crops_dir, f)))
        if len(files) > 50:
            for file in files[:-50]:  # Xóa tất cả trừ 50 mới nhất
                try:
                    os.remove(os.path.join(crops_dir, file))
                except Exception as e:
                    logger.error(f"Lỗi khi xóa file {file}: {str(e)}")
            logger.info(f"Đã xóa {len(files) - 50} crop files cũ")
    except Exception as e:
        logger.error(f"Lỗi trong cleanup_crops: {str(e)}")


@app.route('/api/process-local-video', methods=['POST'])
def process_local_video():
    try:
        if 'video' not in request.files:
            return jsonify({"error": "Không có file video được tải lên"}), 400

        video_file = request.files['video']
        if video_file.filename == '':
            return jsonify({"error": "Không có file được chọn"}), 400

        # Lưu file video tạm thời
        temp_filename = f"{uuid.uuid4().hex}_{video_file.filename}"
        temp_video_path = os.path.join('temp_videos', temp_filename)
        os.makedirs('temp_videos', exist_ok=True)

        video_file.save(temp_video_path)
        logger.info(f"Đã lưu video tạm: {temp_video_path}")

        # Trả về WebSocket URL để client có thể kết nối
        ws_url = f"ws://localhost:5002/processed-video-ws/{temp_filename}"
        return jsonify({"wsUrl": ws_url})

    except Exception as e:
        logger.error(f"Lỗi xử lý video: {str(e)}")
        return jsonify({"error": f"Lỗi xử lý video: {str(e)}"}), 500


@app.route('/api/video-stream/<video_id>')
def video_stream(video_id):
    temp_video_path = os.path.join('temp_videos', video_id)
    if not os.path.exists(temp_video_path):
        return jsonify({"error": "Video không tồn tại"}), 404
    
    # Extract camera info from video_id (format: upload-{cameraId}-{timestamp})
    camera_id = None
    camera_name = f"Video_{video_id}"
    if video_id.startswith('upload-') and '-' in video_id:
        try:
            parts = video_id.split('-')
            if len(parts) >= 3:
                camera_id = int(parts[1])
                # Get actual camera name from database
                try:
                    import requests
                    response = requests.get(f"http://localhost:5000/api/cameras/{camera_id}", timeout=2)
                    if response.status_code == 200:
                        camera_data = response.json()
                        camera_name = camera_data.get('data', {}).get('name', f"Camera_{camera_id}")
                    else:
                        camera_name = f"Camera_{camera_id}"
                except:
                    camera_name = f"Camera_{camera_id}"
        except (ValueError, IndexError):
            pass

    def generate():
        cap = cv2.VideoCapture(temp_video_path)
        if not cap.isOpened():
            logger.error("Không thể mở video file")
            yield b''
            return

        try:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                # Xử lý frame với thread-safe detection/OCR
                try:
                    result = detect_and_ocr_thread_safe(frame, camera_id=camera_id, source_type="camera", video_filename=video_id, camera_name=camera_name)

                    # Handle both dict and direct frame results
                    if isinstance(result, dict):
                        frame_bytes = result.get('frame', b'')
                        if not frame_bytes:
                            # Fallback: encode manually
                            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                            frame_bytes = buffer.tobytes()
                    else:
                        # Legacy support
                        if isinstance(result, np.ndarray):
                            _, buffer = cv2.imencode('.jpg', result, [cv2.IMWRITE_JPEG_QUALITY, 70])
                            frame_bytes = buffer.tobytes()
                        else:
                            frame_bytes = result

                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

                    # Giới hạn tốc độ frame (~20 FPS)
                    time.sleep(0.05)

                except Exception as e:
                    logger.error(f"Lỗi xử lý frame: {str(e)}")
                    continue
        finally:
            cap.release()

    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')


# REMOVED: LL-HLS streaming endpoints - moved to Node.js backend


# REMOVED: Static crop serving - now handled by Node.js server
# @app.route('/static/crops/<filename>')
# def serve_crops(filename):
#     """Serve crop images"""
#     crops_dir = 'static/crops'
#     if not os.path.exists(crops_dir):
#         return jsonify({"error": "Crops directory not found"}), 404
#     return send_from_directory(crops_dir, filename)


@app.route('/api/stream-recognition/<camera_id>')
def stream_recognition(camera_id):
    """HTTP streaming endpoint for real-time recognition"""
    def generate_frames():
        # Initialize camera capture
        cap = None
        try:
            # Get camera info from database
            camera_name = f"Camera_{camera_id}"
            camera_location = None
            
            try:
                import requests
                response = requests.get(f"http://localhost:5000/api/cameras/{camera_id}", timeout=2)
                if response.status_code == 200:
                    camera_data = response.json()
                    camera_name = camera_data.get('data', {}).get('name', f"Camera_{camera_id}")
                    camera_location = camera_data.get('data', {}).get('location', None)
            except:
                pass
            
            # Get stream URL from database
            stream_url = None
            try:
                response = requests.get(f"http://localhost:5000/api/cameras/{camera_id}/stream", timeout=2)
                if response.status_code == 200:
                    stream_data = response.json()
                    stream_url = stream_data.get('data', {}).get('stream_url')
            except:
                pass
            
            if not stream_url:
                logger.error(f"No stream URL found for camera {camera_id}")
                yield b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + b'' + b'\r\n'
                return
            
            # Open camera stream
            cap = cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            cap.set(cv2.CAP_PROP_HW_ACCELERATION, 1)
            
            if not cap.isOpened():
                logger.error(f"Cannot open stream for camera {camera_id}: {stream_url}")
                yield b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + b'' + b'\r\n'
                return
            
            logger.info(f"Starting HTTP streaming for camera {camera_id}")
            
            # FULL DETECTION: Process every frame for complete recognition
            target_fps = 20  # Optimized FPS for full detection load
            frame_delay = 1.0 / target_fps
            last_frame_time = time.time()
            
            while cap.isOpened():
                current_time = time.time()
                
                # Skip frames if we're ahead of target FPS
                if current_time - last_frame_time < frame_delay:
                    continue
                
                ret, frame = cap.read()
                if not ret:
                    logger.warning(f"Cannot read frame from camera {camera_id}")
                    break
                
                # FULL DETECTION: Process every frame
                try:
                    result = detect_and_ocr_thread_safe(
                        frame, 
                        camera_id=int(camera_id), 
                        source_type="camera", 
                        camera_name=camera_name,
                        camera_location=camera_location
                    )
                    
                    if isinstance(result, dict):
                        frame_bytes = result.get('frame', b'')
                        if not frame_bytes:
                            # Fallback: encode original frame
                            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                            frame_bytes = buffer.tobytes()
                    else:
                        # Legacy support
                        if isinstance(result, np.ndarray):
                            _, buffer = cv2.imencode('.jpg', result, [cv2.IMWRITE_JPEG_QUALITY, 70])
                            frame_bytes = buffer.tobytes()
                        else:
                            frame_bytes = result
                    
                    # Yield processed frame
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
                    
                except Exception as e:
                    logger.error(f"Error processing frame for camera {camera_id}: {str(e)}")
                    # Send original frame on error
                    _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
                
                last_frame_time = current_time
                    
        except Exception as e:
            logger.error(f"Error in HTTP streaming for camera {camera_id}: {str(e)}")
        finally:
            if cap is not None:
                cap.release()
            logger.info(f"HTTP streaming ended for camera {camera_id}")
    
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/test-stream/<camera_id>')
def test_stream(camera_id):
    """Test HTTP streaming endpoint for debugging"""
    def generate_test_frames():
        # Create a simple test pattern
        import numpy as np
        frame_count = 0
        
        while True:
            # Create a test frame with frame counter
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            frame[:] = (50, 50, 50)  # Dark gray background
            
            # Add frame counter text
            cv2.putText(frame, f"Test Frame {frame_count}", (50, 50), 
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
            cv2.putText(frame, f"Camera ID: {camera_id}", (50, 100), 
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            cv2.putText(frame, f"Time: {time.strftime('%H:%M:%S')}", (50, 150), 
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
            
            # Encode frame
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            frame_bytes = buffer.tobytes()
            
            # Yield frame
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
            
            frame_count += 1
            time.sleep(0.1)  # 10 FPS
    
    return Response(generate_test_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/stream-fast/<camera_id>')
def stream_fast(camera_id):
    """Ultra-fast HTTP streaming without detection for comparison"""
    def generate_fast_frames():
        # Initialize camera capture
        cap = None
        try:
            # Get stream URL from database
            stream_url = None
            try:
                import requests
                response = requests.get(f"http://localhost:5000/api/cameras/{camera_id}/stream", timeout=2)
                if response.status_code == 200:
                    stream_data = response.json()
                    stream_url = stream_data.get('data', {}).get('stream_url')
            except:
                pass
            
            if not stream_url:
                logger.error(f"No stream URL found for camera {camera_id}")
                yield b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + b'' + b'\r\n'
                return
            
            # Open camera stream
            cap = cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            cap.set(cv2.CAP_PROP_HW_ACCELERATION, 1)
            
            if not cap.isOpened():
                logger.error(f"Cannot open stream for camera {camera_id}: {stream_url}")
                yield b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + b'' + b'\r\n'
                return
            
            logger.info(f"Starting ULTRA-FAST streaming for camera {camera_id}")
            
            # ULTRA-FAST: No detection, just encode and send
            target_fps = 30  # Maximum FPS
            frame_delay = 1.0 / target_fps
            last_frame_time = time.time()
            
            while cap.isOpened():
                current_time = time.time()
                
                # Skip frames if we're ahead of target FPS
                if current_time - last_frame_time < frame_delay:
                    continue
                
                ret, frame = cap.read()
                if not ret:
                    logger.warning(f"Cannot read frame from camera {camera_id}")
                    break
                
                # ULTRA-FAST: Just encode and send, no processing
                _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
                
                last_frame_time = current_time
                    
        except Exception as e:
            logger.error(f"Error in ultra-fast streaming for camera {camera_id}: {str(e)}")
        finally:
            if cap is not None:
                cap.release()
            logger.info(f"Ultra-fast streaming ended for camera {camera_id}")
    
    return Response(generate_fast_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/stream-full-detection/<camera_id>')
def stream_full_detection(camera_id):
    """Full detection streaming with maximum optimization for every frame"""
    def generate_full_detection_frames():
        # Initialize camera capture
        cap = None
        try:
            # Get camera info from database
            camera_name = f"Camera_{camera_id}"
            camera_location = None
            
            try:
                import requests
                response = requests.get(f"http://localhost:5000/api/cameras/{camera_id}", timeout=2)
                if response.status_code == 200:
                    camera_data = response.json()
                    camera_name = camera_data.get('data', {}).get('name', f"Camera_{camera_id}")
                    camera_location = camera_data.get('data', {}).get('location', None)
            except:
                pass
            
            # Get stream URL from database
            stream_url = None
            try:
                response = requests.get(f"http://localhost:5000/api/cameras/{camera_id}/stream", timeout=2)
                if response.status_code == 200:
                    stream_data = response.json()
                    stream_url = stream_data.get('data', {}).get('stream_url')
            except:
                pass
            
            if not stream_url:
                logger.error(f"No stream URL found for camera {camera_id}")
                yield b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + b'' + b'\r\n'
                return
            
            # Open camera stream with maximum optimization
            cap = cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimal buffer
            cap.set(cv2.CAP_PROP_HW_ACCELERATION, 1)  # Hardware acceleration
            cap.set(cv2.CAP_PROP_FPS, 20)  # Set target FPS
            
            if not cap.isOpened():
                logger.error(f"Cannot open stream for camera {camera_id}: {stream_url}")
                yield b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + b'' + b'\r\n'
                return
            
            logger.info(f"Starting FULL DETECTION streaming for camera {camera_id}")
            
            # FULL DETECTION: Process every frame with maximum optimization
            target_fps = 20  # Optimized FPS for full detection
            frame_delay = 1.0 / target_fps
            last_frame_time = time.time()
            frame_count = 0
            
            while cap.isOpened():
                current_time = time.time()
                
                # Skip frames if we're ahead of target FPS
                if current_time - last_frame_time < frame_delay:
                    continue
                
                ret, frame = cap.read()
                if not ret:
                    logger.warning(f"Cannot read frame from camera {camera_id}")
                    break
                
                frame_count += 1
                
                # FULL DETECTION: Process every frame
                try:
                    result = detect_and_ocr_thread_safe(
                        frame, 
                        camera_id=int(camera_id), 
                        source_type="camera", 
                        camera_name=camera_name,
                        camera_location=camera_location
                    )
                    
                    if isinstance(result, dict):
                        frame_bytes = result.get('frame', b'')
                        detection_count = result.get('detection_count', 0)
                        track_count = result.get('track_count', 0)
                        
                        if not frame_bytes:
                            # Fallback: encode original frame
                            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                            frame_bytes = buffer.tobytes()
                        
                        # FIXED: Giảm logging - chỉ log khi có detections và mỗi 60 frames
                        if frame_count % 60 == 0 and detection_count > 0:
                            logger.info(f"📊 Frame {frame_count}: {detection_count} detections, {track_count} tracks")
                        
                    else:
                        # Legacy support
                        if isinstance(result, np.ndarray):
                            _, buffer = cv2.imencode('.jpg', result, [cv2.IMWRITE_JPEG_QUALITY, 70])
                            frame_bytes = buffer.tobytes()
                        else:
                            frame_bytes = result
                    
                    # Yield processed frame
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
                    
                except Exception as e:
                    logger.error(f"Error processing frame for camera {camera_id}: {str(e)}")
                    # Send original frame on error
                    _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
                
                last_frame_time = current_time
                    
        except Exception as e:
            logger.error(f"Error in full detection streaming for camera {camera_id}: {str(e)}")
        finally:
            if cap is not None:
                cap.release()
            logger.info(f"Full detection streaming ended for camera {camera_id}")
    
    return Response(generate_full_detection_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "timestamp": time.time(),
        "service": "license-plate-recognition"
    })

@app.route('/gpu-status', methods=['GET'])
def gpu_status():
    """GPU status and capabilities endpoint"""
    return jsonify({
        "gpu_info": GPU_INFO,
        "onnx_providers": ONNX_PROVIDERS,
        "timestamp": time.time()
    })

# REMOVED: Test detection endpoints - not needed in production


# API endpoints for database management
@app.route('/api/detection-stats', methods=['GET'])
def get_detection_stats():
    """Get detection statistics"""
    try:
        from detector import get_detection_stats
        stats = get_detection_stats()
        return jsonify(stats)
    except Exception as e:
        logger.error(f"Error getting detection stats: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/tracked-objects', methods=['GET'])
def get_tracked_objects():
    """Get current tracked objects"""
    try:
        from detector import tracked_objects
        return jsonify({
            "tracked_objects": tracked_objects,
            "total_count": len(tracked_objects)
        })
    except Exception as e:
        logger.error(f"Error getting tracked objects: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/reset-system', methods=['POST'])
def reset_detection_system():
    """Reset the anti-duplicate system"""
    try:
        from detector import reset_anti_duplicate_system
        result = reset_anti_duplicate_system()
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error resetting system: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/cleanup', methods=['POST'])
def cleanup_system():
    """Manual cleanup of tracked objects"""
    try:
        from detector import cleanup_tracked_objects
        cleanup_tracked_objects()
        return jsonify({"success": True, "message": "Cleanup completed"})
    except Exception as e:
        logger.error(f"Error in cleanup: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/persistent-displays', methods=['GET'])
def get_persistent_displays_api():
    """Get current persistent displays"""
    try:
        from detector import get_persistent_displays
        result = get_persistent_displays()
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error getting persistent displays: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/persistent-displays/clear', methods=['POST'])
def clear_persistent_displays_api():
    """Clear all persistent displays"""
    try:
        from detector import clear_persistent_displays
        result = clear_persistent_displays()
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error clearing persistent displays: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/enhanced-plate-history', methods=['GET'])
def get_enhanced_plate_history_api():
    """Get enhanced plate history with similarity information"""
    try:
        from detector import get_enhanced_plate_history
        result = get_enhanced_plate_history()
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error getting enhanced plate history: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/thread-stats', methods=['GET'])
def get_thread_stats_api():
    """Get thread manager statistics"""
    try:
        stats = get_thread_manager_stats()
        return jsonify({
            "success": True,
            "thread_stats": stats,
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"Error getting thread stats: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/thread-cleanup', methods=['POST'])
def cleanup_threads_api():
    """Manually cleanup inactive threads"""
    try:
        from detector import thread_manager
        thread_manager.cleanup_inactive_threads()
        return jsonify({
            "success": True,
            "message": "Thread cleanup completed",
            "active_threads": thread_manager.get_active_thread_count()
        })
    except Exception as e:
        logger.error(f"Error cleaning up threads: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/redis/status', methods=['GET'])
def redis_status_api():
    """Get Redis server status"""
    try:
        from detector import is_redis_running, redis_available
        return jsonify({
            "success": True,
            "redis_available": redis_available,
            "redis_running": is_redis_running(),
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"Error getting Redis status: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/redis/start', methods=['POST'])
def redis_start_api():
    """Start Redis server"""
    try:
        from detector import start_redis_server
        success = start_redis_server()
        return jsonify({
            "success": success,
            "message": "Redis server started" if success else "Failed to start Redis server",
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"Error starting Redis: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/redis/stop', methods=['POST'])
def redis_stop_api():
    """Stop Redis server"""
    try:
        from detector import stop_redis_server
        stop_redis_server()
        return jsonify({
            "success": True,
            "message": "Redis server stopped",
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"Error stopping Redis: {str(e)}")
        return jsonify({"error": str(e)}), 500


# SIMPLIFIED: Removed queue-related endpoints
# Detector.py now sends directly to Node.js API


@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Endpoint not found"}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({"error": "Internal server error"}), 500


@app.route('/recognize', methods=['POST'])
def recognize():
    logger.info("Nhận yêu cầu HTTP tới /recognize")
    request_start = time.time()
    
    if 'image' in request.files:
        file_read_start = time.time()
        file = request.files['image']
        bytes_data = file.read()
        logger.info(f"File read time: {time.time() - file_read_start:.3f} seconds")

        decode_start = time.time()
        np_img = np.frombuffer(bytes_data, np.uint8)
        img = cv2.imdecode(np_img, cv2.IMREAD_COLOR)
        logger.info(f"Image decode time: {time.time() - decode_start:.3f} seconds")
        
    elif request.json and 'rtsp_url' in request.json:
        rtsp_url = request.json['rtsp_url']
        if not rtsp_url.startswith("rtsp"):
            logger.error(f"URL không hợp lệ: {rtsp_url}. Yêu cầu RTSP URL.")
            return jsonify({"error": "URL không hợp lệ. Yêu cầu RTSP URL."}), 400
            
        rtsp_start = time.time()
        cap = cv2.VideoCapture(rtsp_url)
        if not cap.isOpened():
            logger.error(f"Không thể mở stream RTSP: {rtsp_url}")
            return jsonify({"error": "Không thể mở stream RTSP"}), 400
            
        ret, img = cap.read()
        cap.release()
        logger.info(f"RTSP capture time: {time.time() - rtsp_start:.3f} seconds")
        
        if not ret:
            logger.error(f"Không thể đọc frame từ stream RTSP: {rtsp_url}")
            return jsonify({"error": "Không thể chụp ảnh từ stream RTSP"}), 400
    else:
        logger.error("Không cung cấp ảnh hoặc RTSP URL")
        return jsonify({"error": "Cần cung cấp ảnh hoặc RTSP URL"}), 400

    detect_start = time.time()
    result = detect_and_ocr_thread_safe(img, source_type="http_request", camera_name="HTTP_Request")
    
    # Handle both dict and direct frame results
    if isinstance(result, dict):
        frame_bytes = result.get('frame', b'')
        tracked_objects = result.get('tracked_objects', {})
        detection_count = result.get('detection_count', 0)
        skipped = result.get('skipped', False)
        
        # SIMPLIFIED: Detector.py sẽ tự gửi dữ liệu tới database
        
        # FIXED: Giảm logging - chỉ log khi có detections
        if detection_count > 0:
            logger.info(f"📤 Returning frame - Detections: {detection_count}")
        
        if not frame_bytes:
            # Fallback: encode manually
            _, buffer = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 70])
            frame_bytes = buffer.tobytes()
    else:
        # Legacy support: result is direct frame
        if isinstance(result, np.ndarray):
            _, buffer = cv2.imencode('.jpg', result, [cv2.IMWRITE_JPEG_QUALITY, 70])
            frame_bytes = buffer.tobytes()
        else:
            frame_bytes = result
    
    logger.info(f"Detect and OCR time: {time.time() - detect_start:.3f} seconds")
    logger.info(f"Total recognize endpoint time: {time.time() - request_start:.3f} seconds")
    
    return Response(frame_bytes, mimetype='image/jpeg')


# REMOVED: Video file processing - moved to Node.js backend


# REMOVED: Stream recognition endpoint - moved to Node.js backend


@sock.route('/processed-video-ws/<video_id>')
def processed_video_ws(ws, video_id):
    logger.info(f"Kết nối WebSocket cho video đã xử lý: {video_id}")

    temp_video_path = os.path.join('temp_videos', video_id)
    if not os.path.exists(temp_video_path):
        logger.error(f"Video không tồn tại: {video_id}")
        ws.close()
        return
    
    # Extract camera info from video_id (format: upload-{cameraId}-{timestamp})
    camera_id = None
    camera_name = f"Video_{video_id}"
    if video_id.startswith('upload-') and '-' in video_id:
        try:
            parts = video_id.split('-')
            if len(parts) >= 3:
                camera_id = int(parts[1])
                # Get actual camera name from database
                try:
                    import requests
                    response = requests.get(f"http://localhost:5000/api/cameras/{camera_id}", timeout=2)
                    if response.status_code == 200:
                        camera_data = response.json()
                        camera_name = camera_data.get('data', {}).get('name', f"Camera_{camera_id}")
                    else:
                        camera_name = f"Camera_{camera_id}"
                except:
                    camera_name = f"Camera_{camera_id}"
        except (ValueError, IndexError):
            pass

    cap = None
    try:
        cap = cv2.VideoCapture(temp_video_path)
        if not cap.isOpened():
            logger.error("Không thể mở video file")
            ws.close()
            return

        # Lấy FPS của video gốc, nhưng giới hạn max 20fps để đạt target FPS
        fps = min(cap.get(cv2.CAP_PROP_FPS), 20)
        if fps <= 0:
            fps = 20
        frame_delay = 1.0 / fps

        frame_count = 0
        last_cleanup_time = time.time()

        while cap.isOpened():
            start_time = time.time()
            ret, frame = cap.read()
            if not ret:
                break

            # Xử lý frame với thread-safe detection/OCR
            result = detect_and_ocr_thread_safe(frame, camera_id=camera_id, source_type="camera", video_filename=video_id, camera_name=camera_name)

            # Handle both dict and direct frame results
            if isinstance(result, dict):
                frame_bytes = result.get('frame', b'')
                tracked_objects = result.get('tracked_objects', {})
                
                # SIMPLIFIED: Detector.py sẽ tự gửi dữ liệu tới database
                
                if not frame_bytes:
                    # Fallback: encode manually
                    _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                    frame_bytes = buffer.tobytes()
            else:
                # Legacy support
                if isinstance(result, np.ndarray):
                    _, buffer = cv2.imencode('.jpg', result, [cv2.IMWRITE_JPEG_QUALITY, 70])
                    frame_bytes = buffer.tobytes()
                else:
                    frame_bytes = result

            # Gửi frame qua WebSocket
            ws.send(frame_bytes)

            # Tính toán thời gian xử lý và điều chỉnh delay
            processing_time = time.time() - start_time
            sleep_time = max(0, frame_delay - processing_time)
            time.sleep(sleep_time)

            # Cleanup định kỳ: Mỗi 100 frame hoặc 30 giây, dọn crop files cũ
            frame_count += 1
            current_time = time.time()
            if frame_count % 100 == 0 or (current_time - last_cleanup_time > 30):
                cleanup_crops()  # Hàm mới để xóa crop cũ
                last_cleanup_time = current_time

    except Exception as e:
        logger.error(f"Lỗi trong xử lý video WebSocket: {str(e)}")
    finally:
        if cap is not None:
            cap.release()
        logger.info(f"Kết thúc stream video: {video_id}")
        # Xóa file tạm ngay lập tức
        try:
            os.remove(temp_video_path)
            logger.info(f"Đã xóa file tạm: {temp_video_path}")
        except Exception as e:
            logger.error(f"Lỗi khi xóa file tạm: {str(e)}")
        # Đóng WS nếu còn mở
        try:
            ws.close()
        except:
            pass


# Performance API endpoints
# @app.route('/performance/stats', methods=['GET'])
# def get_performance_stats_api():
#     """Get performance statistics"""
#     try:
#         stats = get_performance_stats()
#         return jsonify(stats)
#     except Exception as e:
#         return jsonify({'error': str(e)}), 500

# @app.route('/performance/mode', methods=['POST'])
# def set_performance_mode_api():
#     """Set performance mode"""
#     try:
#         data = request.get_json()
#         mode = data.get('mode', 'balanced')
#         success = set_performance_mode(mode)
#         if success:
#             return jsonify({'message': f'Performance mode set to {mode}'})
#         else:
#             return jsonify({'error': 'Failed to set performance mode'}), 400
#     except Exception as e:
#         return jsonify({'error': str(e)}), 500

@app.route('/performance/optimize', methods=['POST'])
def enable_optimizations_api():
    """Enable or disable performance optimizations"""
    try:
        data = request.get_json()
        enable = data.get('enable', True)
        success = enable_performance_optimizations(enable)
        return jsonify({'message': f'Performance optimizations {"enabled" if enable else "disabled"}'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/process-external-detections', methods=['POST'])
def process_external_detections_api():
    """API endpoint to process pending detections externally"""
    try:
        data = request.get_json()
        camera_id = data.get('camera_id')
        source_type = data.get('source_type', 'camera')
        video_filename = data.get('video_filename')
        camera_location = data.get('camera_location')
        camera_name = data.get('camera_name')
        
        # Import external processing function
        from detector import process_pending_detections_external
        
        # Process pending detections
        process_pending_detections_external(
            camera_id=camera_id,
            source_type=source_type,
            video_filename=video_filename,
            camera_location=camera_location,
            camera_name=camera_name
        )
        
        return jsonify({
            'success': True,
            'message': 'External processing completed'
        })
        
    except Exception as e:
        logger.error(f"Error in external processing API: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# @app.route('/performance/clear-cache', methods=['POST'])
# def clear_cache_api():
#     """Clear detection cache"""
#     try:
#         success = clear_detection_cache()
#         if success:
#             return jsonify({'message': 'Cache cleared successfully'})
#         else:
#             return jsonify({'error': 'Failed to clear cache'}), 500
#     except Exception as e:
#         return jsonify({'error': str(e)}), 500

if __name__ == "__main__":
    # Tạo các thư mục cần thiết
    os.makedirs('static/crops', exist_ok=True)
    os.makedirs('temp_videos', exist_ok=True)
    os.makedirs('llhls_output', exist_ok=True)
    
    # Redis server sẽ được tự động khởi động trong detector.py
    logger.info("Redis server management integrated into detector module")
    
    # Enable performance optimizations
    enable_performance_optimizations(True)
    # set_performance_mode('balanced')
        
    logger.info("Khởi động server trên http://0.0.0.0:5002...")
    app.run(host='0.0.0.0', port=5002, debug=False, threaded=True)
