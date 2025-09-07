from flask import Flask, request, jsonify, Response, send_from_directory
from flask_sock import Sock
from flask_cors import CORS
import cv2
import numpy as np
from detector import detect_and_ocr
import json
import logging
import time
from urllib.parse import urlparse
import requests
from tempfile import NamedTemporaryFile
import os
from queue import Queue
import subprocess
import uuid
import threading

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)
sock = Sock(app)
# frame_queue = Queue(maxsize=100)


# Trong hàm recognize_ws, thêm xử lý cho HLS stream nếu RTSP không khả dụng
@sock.route('/recognize-ws')
def recognize_ws(ws):
    logger.info("Kết nối WebSocket mới được thiết lập")
    cap = None

    try:
        while True:
            message = ws.receive()
            if message is None:
                logger.info("Kết nối WebSocket bị đóng bởi client")
                break

            if isinstance(message, bytes):
                # Xử lý frame (dự phòng, không cần thiết trong flow mới)
                continue
            else:
                try:
                    data = json.loads(message)
                    if data.get('type') == 'rtsp_url' and 'url' in data:
                        stream_url = data['url']
                        camera_id = data.get('cameraId')

                        # Đóng stream hiện tại nếu có
                        if cap is not None:
                            cap.release()
                            cap = None

                        # Mở stream RTSP mới
                        # cap = cv2.VideoCapture(stream_url)

                        cap = cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG)
                        cap.set(cv2.CAP_PROP_HW_ACCELERATION, 1)  # Bật hardware acceleration
                        
                        if not cap.isOpened():
                            logger.error(
                                f"Không thể mở RTSP stream: {stream_url}")
                            ws.send(json.dumps(
                                {"error": "Cannot open RTSP stream"}))
                            continue

                        logger.info(f"Bắt đầu xử lý RTSP stream: {stream_url}")


                        
                        
                        # Xử lý stream và gửi frames đã xử lý
                        while cap.isOpened():
                            ret, frame = cap.read()
                            if not ret:
                                logger.warning(
                                    "Không thể đọc frame từ RTSP stream")
                                break
                            
                            
                            # Xử lý frame với detect_and_ocr
                            processed_frame = detect_and_ocr(frame, camera_id=camera_id)

                            # Mã hóa và gửi frame
                            _, buffer = cv2.imencode('.jpg', processed_frame, [
                                cv2.IMWRITE_JPEG_QUALITY, 70])
                            frame_bytes = buffer.tobytes()
                            ws.send(frame_bytes)

                except json.JSONDecodeError:
                    logger.warning("Nhận được thông điệp không hợp lệ")
                    continue

    except Exception as e:
        logger.error(f"Lỗi trong xử lý WebSocket: {str(e)}")
    finally:
        if cap is not None:
            cap.release()
        logger.info("Kết nối WebSocket đã kết thúc")


@app.route('/recognize', methods=['POST'])
def recognize():
    logger.info("Nhận yêu cầu HTTP tới /recognize")
    request_start = time.time()
    if 'image' in request.files:
        file_read_start = time.time()
        file = request.files['image']
        bytes_data = file.read()
        logger.info(
            f"File read time: {time.time() - file_read_start:.3f} seconds")

        decode_start = time.time()
        np_img = np.frombuffer(bytes_data, np.uint8)
        img = cv2.imdecode(np_img, cv2.IMREAD_COLOR)
        logger.info(
            f"Image decode time: {time.time() - decode_start:.3f} seconds")
    elif 'rtsp_url' in request.json:
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
        logger.info(
            f"RTSP capture time: {time.time() - rtsp_start:.3f} seconds")
        if not ret:
            logger.error(f"Không thể đọc frame từ stream RTSP: {rtsp_url}")
            return jsonify({"error": "Không thể chụp ảnh từ stream RTSP"}), 400
    else:
        logger.error("Không cung cấp ảnh hoặc RTSP URL")
        return jsonify({"error": "Cần cung cấp ảnh hoặc RTSP URL"}), 400

    detect_start = time.time()
    processed_frame = detect_and_ocr(img)
    # Mã hóa thành bytes để trả về
    _, buffer = cv2.imencode('.jpg', processed_frame, [
                             cv2.IMWRITE_JPEG_QUALITY, 70])
    frame_bytes = buffer.tobytes()
    logger.info(
        f"Detect and OCR time: {time.time() - detect_start:.3f} seconds")

    logger.info(
        f"Total recognize endpoint time: {time.time() - request_start:.3f} seconds")
    return frame_bytes


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

                processed_frame = detect_and_ocr(
                    frame)  # Nhận frame numpy array
                # Mã hóa thành bytes
                _, buffer = cv2.imencode('.jpg', processed_frame, [
                                         cv2.IMWRITE_JPEG_QUALITY, 70])
                frame_bytes = buffer.tobytes()

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
            processed_frame = detect_and_ocr(frame, camera_id="1")

            # Mã hóa frame đã xử lý thành JPEG
            _, buffer = cv2.imencode('.jpg', processed_frame, [
                                     cv2.IMWRITE_JPEG_QUALITY, 70])
            frame_bytes = buffer.tobytes()

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
        ws.close()

# Thêm hàm cleanup_crops để xóa crop cũ (giữ chỉ 50 crop mới nhất)


def cleanup_crops():
    crops_dir = 'static/crops'
    if not os.path.exists(crops_dir):
        return
    files = sorted(os.listdir(crops_dir),
                   key=lambda f: os.path.getmtime(os.path.join(crops_dir, f)))
    if len(files) > 50:
        for file in files[:-50]:  # Xóa tất cả trừ 50 mới nhất
            os.remove(os.path.join(crops_dir, file))
        logger.info(f"Đã xóa {len(files) - 50} crop files cũ")

# Sửa endpoint process-local-video để trả về WebSocket URL


@app.route('/api/process-local-video', methods=['POST'])
def process_local_video():
    try:
        if 'video' not in request.files:
            return jsonify({"error": "Không có file video được tải lên"}), 400

        video_file = request.files['video']
        if video_file.filename == '':
            return jsonify({"error": "Không có file được chọn"}), 400

        # Lưu file video tạm thời
        import uuid
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

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            # Xử lý frame với detection/OCR
            try:
                processed_frame = detect_and_ocr(frame)

                # Mã hóa frame đã xử lý
                _, buffer = cv2.imencode('.jpg', processed_frame, [
                                         cv2.IMWRITE_JPEG_QUALITY, 70])
                frame_bytes = buffer.tobytes()

                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

                # Giới hạn tốc độ frame (~30 FPS)
                time.sleep(0.033)

            except Exception as e:
                logger.error(f"Lỗi xử lý frame: {str(e)}")
                continue

        cap.release()

    return Response(generate(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

# PROTOCOL LL-HLS with RTSP input

@app.route('/api/start-llhls-processing', methods=['POST'])
def start_llhls_processing():
    try:
        data = request.json
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
    try:
        # Open RTSP stream
        cap = cv2.VideoCapture(rtsp_url)
        if not cap.isOpened():
            logger.error(f"Cannot open RTSP stream: {rtsp_url}")
            return

        # Get video properties
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

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

        process = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE)

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            # Process frame with license plate recognition
            processed_frame = detect_and_ocr(frame)
            
            # Write processed frame to FFmpeg
            try:
                process.stdin.write(processed_frame.tobytes())
            except:
                break

        # Cleanup
        cap.release()
        process.stdin.close()
        process.wait()
        
    except Exception as e:
        logger.error(f"Error in LL-HLS processing: {str(e)}")

# Add route to serve LL-HLS files
@app.route('/llhls/<stream_id>/<path:filename>')
def serve_llhls(stream_id, filename):
    llhls_dir = os.path.join('llhls_output', stream_id)
    return send_from_directory(llhls_dir, filename)

if __name__ == "__main__":
    logger.info("Khởi động server trên http://0.0.0.0:5002...")
    app.run(host='0.0.0.0', port=5002)
