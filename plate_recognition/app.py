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
from detector import detect_and_ocr_stable, enable_performance_optimizations, start_redis_server, is_redis_running
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

    try:
        while True:
            message = ws.receive()
            if message is None:
                logger.info("Kết nối WebSocket bị đóng bởi client")
                break

            if isinstance(message, bytes):
                # Xử lý frame từ frontend
                try:
                    # Chuyển đổi bytes thành numpy array
                    nparr = np.frombuffer(message, np.uint8)
                    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                    
                    if frame is not None:
                        logger.info(f"Received frame from frontend: {frame.shape}")
                        # Xử lý frame với detect_and_ocr_stable
                        result = detect_and_ocr_stable(frame, camera_id=camera_id, source_type=source_type, video_filename=video_filename, camera_location=camera_location, camera_name=camera_name)
                        
                        if isinstance(result, dict):
                            processed_frame_bytes = result.get('frame', b'')
                            tracked_objects = result.get('tracked_objects', {})
                            
                            # SIMPLIFIED: Detector.py sẽ tự gửi dữ liệu tới database
                            # Không cần xử lý queue ở đây nữa
                            
                            # Send processed frame
                            if processed_frame_bytes:
                                ws.send(processed_frame_bytes)
                            else:
                                # Fallback: encode frame manually
                                _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                                ws.send(buffer.tobytes())
                                
                        else:
                            # Legacy support: result is direct frame
                            if isinstance(result, np.ndarray):
                                _, buffer = cv2.imencode('.jpg', result, [cv2.IMWRITE_JPEG_QUALITY, 70])
                                frame_bytes = buffer.tobytes()
                            else:
                                frame_bytes = result
                            ws.send(frame_bytes)
                        
                        logger.info(f"Processed frame sent back")
                        
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
                        # Lưu thông tin camera để sử dụng sau
                        # Extract numeric part from camera_id (e.g., "11-1757684051439" -> 11)
                        raw_camera_id = data.get('camera_id') or "default"
                        if isinstance(raw_camera_id, str) and '-' in raw_camera_id:
                            camera_id = int(raw_camera_id.split('-')[0])  # Convert to integer
                        else:
                            camera_id = int(raw_camera_id) if str(raw_camera_id).isdigit() else 1
                        camera_name = data.get('camera_name')
                        source_type = data.get('source_type') or "camera"
                        video_filename = data.get('video_filename')
                        camera_location = data.get('camera_location')
                        logger.info(f"Camera info: ID={camera_id}, Name={camera_name}, Type={source_type}, Video={video_filename}, Location={camera_location}")
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

                        # Xử lý stream và gửi frames đã xử lý
                        while cap.isOpened():
                            ret, frame = cap.read()
                            if not ret:
                                logger.warning("Không thể đọc frame từ RTSP stream")
                                break
                            
                            # Xử lý frame với detect_and_ocr_stable
                            result = detect_and_ocr_stable(frame, camera_id=camera_id, source_type=source_type, video_filename=video_filename, camera_location=camera_location, camera_name=camera_name)
                            
                            if isinstance(result, dict):
                                processed_frame_bytes = result.get('frame', b'')
                                tracked_objects = result.get('tracked_objects', {})
                                detection_count = result.get('detection_count', 0)
                                skipped = result.get('skipped', False)
                                
                                # Chỉ gửi frame khi có detection hoặc không bị skip
                                should_send_frame = detection_count > 0 or not skipped
                                
                                if should_send_frame:
                                    logger.info(f"📤 Sending frame for camera {camera_id} - Detections: {detection_count}, Skipped: {skipped}")
                                    
                                    # SIMPLIFIED: Detector.py sẽ tự gửi dữ liệu tới database
                                    
                                    # Send processed frame only when needed
                                    if processed_frame_bytes:
                                        ws.send(processed_frame_bytes)
                                    else:
                                        # Fallback
                                        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                                        ws.send(buffer.tobytes())
                                else:
                                    logger.debug(f"⏭️ Skipping frame send for camera {camera_id} - No detections")
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

                # Xử lý frame với detection/OCR
                try:
                    result = detect_and_ocr_stable(frame, camera_id=camera_id, source_type="camera", video_filename=video_id, camera_name=camera_name)

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

                    # Giới hạn tốc độ frame (~30 FPS)
                    time.sleep(0.033)

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
    result = detect_and_ocr_stable(img, source_type="http_request", camera_name="HTTP_Request")
    
    # Handle both dict and direct frame results
    if isinstance(result, dict):
        frame_bytes = result.get('frame', b'')
        tracked_objects = result.get('tracked_objects', {})
        detection_count = result.get('detection_count', 0)
        skipped = result.get('skipped', False)
        
        # SIMPLIFIED: Detector.py sẽ tự gửi dữ liệu tới database
        
        # Chỉ trả về frame khi có detection hoặc không bị skip
        if detection_count > 0 or not skipped:
            logger.info(f"📤 Returning frame - Detections: {detection_count}, Skipped: {skipped}")
            if not frame_bytes:
                # Fallback: encode manually
                _, buffer = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 70])
                frame_bytes = buffer.tobytes()
        else:
            logger.debug(f"⏭️ Skipping frame return - No detections")
            # Trả về frame trống hoặc thông báo không có detection
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

        # Lấy FPS của video gốc, nhưng giới hạn max 15fps để tránh overload
        fps = min(cap.get(cv2.CAP_PROP_FPS), 15)
        if fps <= 0:
            fps = 15
        frame_delay = 1.0 / fps

        frame_count = 0
        last_cleanup_time = time.time()

        while cap.isOpened():
            start_time = time.time()
            ret, frame = cap.read()
            if not ret:
                break

            # Xử lý frame với detection/OCR
            result = detect_and_ocr_stable(frame, camera_id=camera_id, source_type="camera", video_filename=video_id, camera_name=camera_name)

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
    
    # Khởi động Redis server
    logger.info("Checking Redis server...")
    if not is_redis_running():
        start_redis_server()
    else:
        logger.info("Redis server is already running")
    
    # Enable performance optimizations
    enable_performance_optimizations(True)
    # set_performance_mode('balanced')
    
    # Display GPU information
    logger.info("=" * 50)
    logger.info("🚀 LICENSE PLATE RECOGNITION SYSTEM")
    logger.info("=" * 50)
    logger.info(f"🎮 GPU Status: {GPU_INFO['optimization_level'].upper()}")
    if GPU_INFO['cuda_available']:
        logger.info(f"💾 GPU Memory: {GPU_INFO['gpu_memory'] / 1024**3:.1f} GB")
    logger.info(f"🔧 ONNX Providers: {', '.join(ONNX_PROVIDERS)}")
    logger.info("=" * 50)
    
    logger.info("Khởi động server trên http://0.0.0.0:5002...")
    app.run(host='0.0.0.0', port=5002, debug=False, threaded=True)
