import os
# Cấu hình môi trường cho FastALPR GPU
os.environ['OMP_NUM_THREADS'] = '4'
os.environ['ORT_LOGGING_LEVEL'] = '3'  # Suppress ONNX Runtime warnings
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'  # Suppress TensorFlow warnings
# Cho phép GPU nhưng fallback về CPU nếu có lỗi

# Thiết lập ONNX Runtime providers trước khi import bất kỳ thư viện nào khác
import onnxruntime as ort
# Force CPU-only execution
ort.set_default_logger_severity(3)

from flask import Flask, request, jsonify, Response, send_from_directory
from flask_sock import Sock
from flask_cors import CORS
import cv2
import numpy as np
from detector import detect_and_ocr_stable
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
                        result = detect_and_ocr_stable(frame, camera_id=camera_id, source_type=source_type, video_filename=video_filename, camera_location=camera_location)
                        
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
                        camera_id = data.get('camera_id') or "default"
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
                            result = detect_and_ocr_stable(frame, camera_id=camera_id, source_type=source_type, video_filename=video_filename, camera_location=camera_location)
                            
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
                    result = detect_and_ocr_stable(frame, source_type="video_upload", video_filename=video_id)

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


@app.route('/api/start-llhls-processing', methods=['POST'])
def start_llhls_processing():
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
            
        rtsp_url = data.get('rtsp_url')
        
        if not rtsp_url:
            return jsonify({"error": "RTSP URL is required"}), 400

        # Generate unique stream ID
        stream_id = str(uuid.uuid4())
        output_dir = os.path.join('llhls_output', stream_id)
        os.makedirs(output_dir, exist_ok=True)

        # Start processing in background thread
        thread = threading.Thread(
            target=process_rtsp_to_llhls,
            args=(rtsp_url, output_dir, stream_id)
        )
        thread.daemon = True
        thread.start()

        return jsonify({
            "success": True,
            "stream_id": stream_id,
            "hls_url": f"/llhls/{stream_id}/playlist.m3u8"
        })

    except Exception as e:
        logger.error(f"LL-HLS processing error: {str(e)}")
        return jsonify({"error": f"LL-HLS processing error: {str(e)}"}), 500


def process_rtsp_to_llhls(rtsp_url, output_dir, stream_id):
    """Xử lý RTSP stream và tạo LL-HLS output"""
    try:
        # Open RTSP stream
        cap = cv2.VideoCapture(rtsp_url)
        if not cap.isOpened():
            logger.error(f"Cannot open RTSP stream: {rtsp_url}")
            return

        # Get video properties
        fps = int(cap.get(cv2.CAP_PROP_FPS)) or 30
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 720

        # FFmpeg command for LL-HLS
        ffmpeg_cmd = [
            'ffmpeg',
            '-y',
            '-f', 'rawvideo',
            '-vcodec', 'rawvideo',
            '-s', f'{width}x{height}',
            '-pix_fmt', 'bgr24',
            '-r', str(fps),
            '-i', '-',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-tune', 'zerolatency',
            '-crf', '23',
            '-f', 'hls',
            '-hls_time', '2',
            '-hls_list_size', '5',
            '-hls_flags', 'delete_segments+independent_segments',
            '-hls_segment_type', 'mpegts',
            '-hls_segment_filename', os.path.join(output_dir, 'segment_%03d.ts'),
            os.path.join(output_dir, 'playlist.m3u8')
        ]

        process = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, 
                                 stderr=subprocess.PIPE)

        try:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                # Process frame with license plate recognition
                result = detect_and_ocr_stable(frame, source_type="rtsp_stream")
                
                # Handle both dict and direct frame results
                if isinstance(result, dict):
                    # Extract frame bytes from result
                    frame_bytes = result.get('frame', b'')
                    if frame_bytes:
                        # Decode frame bytes back to numpy array
                        nparr = np.frombuffer(frame_bytes, np.uint8)
                        processed_frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                    else:
                        processed_frame = frame
                else:
                    # Legacy support
                    processed_frame = result if isinstance(result, np.ndarray) else frame
                
                # Write processed frame to FFmpeg
                try:
                    process.stdin.write(processed_frame.tobytes())
                except Exception as e:
                    logger.error(f"Error writing to FFmpeg: {str(e)}")
                    break

        except Exception as e:
            logger.error(f"Error in processing loop: {str(e)}")
        finally:
            # Cleanup
            cap.release()
            try:
                process.stdin.close()
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.terminate()
                process.wait()
        
    except Exception as e:
        logger.error(f"Error in LL-HLS processing: {str(e)}")


@app.route('/llhls/<stream_id>/<path:filename>')
def serve_llhls(stream_id, filename):
    """Serve LL-HLS files"""
    llhls_dir = os.path.join('llhls_output', stream_id)
    if not os.path.exists(llhls_dir):
        return jsonify({"error": "Stream not found"}), 404
    return send_from_directory(llhls_dir, filename)


@app.route('/static/crops/<filename>')
def serve_crops(filename):
    """Serve crop images"""
    crops_dir = 'static/crops'
    if not os.path.exists(crops_dir):
        return jsonify({"error": "Crops directory not found"}), 404
    return send_from_directory(crops_dir, filename)


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "timestamp": time.time(),
        "service": "license-plate-recognition"
    })

@app.route('/test-detection', methods=['GET'])
def test_detection():
    """Test detection với frame đen để kiểm tra ROI"""
    try:
        # Tạo frame test đen
        test_frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        
        # Thêm một số hình chữ nhật giả để test
        cv2.rectangle(test_frame, (100, 100), (200, 150), (255, 255, 255), -1)
        cv2.rectangle(test_frame, (300, 200), (400, 250), (255, 255, 255), -1)
        
        # Xử lý với detector
        result = detect_and_ocr_stable(test_frame, camera_id="test", source_type="test")
        
        # Handle both dict and direct frame results
        if isinstance(result, dict):
            frame_bytes = result.get('frame', b'')
            if not frame_bytes:
                # Fallback: encode manually
                _, buffer = cv2.imencode('.jpg', test_frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                frame_bytes = buffer.tobytes()
        else:
            # Legacy support
            if isinstance(result, np.ndarray):
                _, buffer = cv2.imencode('.jpg', result, [cv2.IMWRITE_JPEG_QUALITY, 70])
                frame_bytes = buffer.tobytes()
            else:
                frame_bytes = result
        
        return Response(frame_bytes, mimetype='image/jpeg')
    except Exception as e:
        logger.error(f"Test detection error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/test-real-detection', methods=['GET'])
def test_real_detection():
    """Test detection với ảnh thật để kiểm tra bounding box"""
    try:
        # Tạo frame test với màu xanh
        test_frame = np.full((360, 640, 3), (0, 255, 0), dtype=np.uint8)
        
        # Thêm text để test
        cv2.putText(test_frame, "TEST FRAME", (50, 180), cv2.FONT_HERSHEY_SIMPLEX, 2, (255, 255, 255), 3)
        cv2.putText(test_frame, "Should show ROI and debug info", (50, 220), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
        
        # Xử lý với detector
        result = detect_and_ocr_stable(test_frame, camera_id="test", source_type="test")
        
        # Handle both dict and direct frame results
        if isinstance(result, dict):
            frame_bytes = result.get('frame', b'')
            if not frame_bytes:
                # Fallback: encode manually
                _, buffer = cv2.imencode('.jpg', test_frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                frame_bytes = buffer.tobytes()
        else:
            # Legacy support
            if isinstance(result, np.ndarray):
                _, buffer = cv2.imencode('.jpg', result, [cv2.IMWRITE_JPEG_QUALITY, 70])
                frame_bytes = buffer.tobytes()
            else:
                frame_bytes = result
        
        return Response(frame_bytes, mimetype='image/jpeg')
    except Exception as e:
        logger.error(f"Test real detection error: {str(e)}")
        return jsonify({"error": str(e)}), 500


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
    result = detect_and_ocr_stable(img, source_type="http_request")
    
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


@app.route('/api/process-video', methods=['POST'])
def process_video():
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

        # Xử lý video với detector
        detected_plates = process_video_file(temp_video_path, temp_filename)

        # Xóa file tạm
        try:
            os.remove(temp_video_path)
        except Exception as e:
            logger.error(f"Lỗi khi xóa file tạm: {str(e)}")

        return jsonify({
            "success": True,
            "message": "Xử lý video hoàn tất",
            "data": {
                "video_id": temp_filename,
                "detected_plates": detected_plates,
                "total_detections": len(detected_plates)
            }
        })

    except Exception as e:
        logger.error(f"Lỗi xử lý video: {str(e)}")
        return jsonify({"error": f"Lỗi xử lý video: {str(e)}"}), 500


def process_video_file(video_path, video_id):
    """Xử lý file video và trả về danh sách biển số được phát hiện"""
    detected_plates = []
    
    try:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            logger.error("Không thể mở video file")
            return detected_plates

        frame_count = 0
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            # Xử lý frame với detection/OCR
            # Extract original filename from video_id (remove UUID prefix)
            original_filename = video_id.split('_', 1)[1] if '_' in video_id else video_id
            result = detect_and_ocr_stable(frame, camera_id=video_id, source_type="video_upload", video_filename=original_filename)
            
            if isinstance(result, dict):
                tracked_objects = result.get('tracked_objects', {})
                
                # SIMPLIFIED: Detector.py sẽ tự gửi dữ liệu tới database
            
            # Lưu frame đã xử lý (tùy chọn)
            if frame_count % 30 == 0:  # Lưu mỗi 30 frame
                frame_filename = f"frame_{video_id}_{frame_count}.jpg"
                frame_path = os.path.join('static/crops', frame_filename)
                os.makedirs('static/crops', exist_ok=True)
                if isinstance(result, dict):
                    processed_frame_bytes = result.get('frame', b'')
                    if processed_frame_bytes:
                        with open(frame_path, 'wb') as f:
                            f.write(processed_frame_bytes)
                elif isinstance(result, np.ndarray):
                    cv2.imwrite(frame_path, result)

            frame_count += 1

        cap.release()
        
    except Exception as e:
        logger.error(f"Lỗi xử lý video file: {str(e)}")
    
    return detected_plates


@app.route('/recognize-stream', methods=['POST', 'OPTIONS'])
def recognize_stream():
    if request.method == 'OPTIONS':
        # Xử lý preflight request
        response = Response()
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'POST')
        return response

    def generate():
        try:
            while True:
                # Đọc khung hình từ luồng request
                frame_data = request.stream.read()
                if not frame_data:
                    break

                # Xử lý khung hình
                np_frame = np.frombuffer(frame_data, np.uint8)
                frame = cv2.imdecode(np_frame, cv2.IMREAD_COLOR)

                if frame is None:
                    continue

                result = detect_and_ocr_stable(frame, source_type="stream")  # Nhận frame numpy array
                
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

                # Trả về kết quả dưới dạng multipart response
                yield (b'--frame\r\n' +
                       b'Content-Type: image/jpeg\r\n\r\n' +
                       frame_bytes +
                       b'\r\n')

        except Exception as e:
            logger.error(f"Lỗi trong xử lý stream: {str(e)}")

    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')


@sock.route('/processed-video-ws/<video_id>')
def processed_video_ws(ws, video_id):
    logger.info(f"Kết nối WebSocket cho video đã xử lý: {video_id}")

    temp_video_path = os.path.join('temp_videos', video_id)
    if not os.path.exists(temp_video_path):
        logger.error(f"Video không tồn tại: {video_id}")
        ws.close()
        return

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
            result = detect_and_ocr_stable(frame, camera_id="1", source_type="video_upload", video_filename=video_id)

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


if __name__ == "__main__":
    # Tạo các thư mục cần thiết
    os.makedirs('static/crops', exist_ok=True)
    os.makedirs('temp_videos', exist_ok=True)
    os.makedirs('llhls_output', exist_ok=True)
    
    logger.info("Khởi động server trên http://0.0.0.0:5002...")
    app.run(host='0.0.0.0', port=5002, debug=False, threaded=True)