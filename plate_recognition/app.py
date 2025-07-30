# app.py
from flask import Flask, request, jsonify
from flask_sock import Sock
import cv2
import numpy as np
from detector import detect_and_ocr
import json
import logging
from urllib.parse import urlparse
import requests
from tempfile import NamedTemporaryFile
import os  # Thêm import os

# Thiết lập logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
sock = Sock(app)


@sock.route('/recognize-ws')
def recognize_ws(ws):
    logger.info("Kết nối WebSocket mới được thiết lập")
    cap = None
    temp_path = None  # Biến lưu đường dẫn file tạm
    
    try:
        while True:
            message = ws.receive()
            if message is None:
                logger.info("Kết nối WebSocket bị đóng bởi client")
                break

            logger.info(f"Thông điệp nhận được: {message}")
            try:
                data = json.loads(message)
                logger.info(f"Thông điệp đã phân tích: {data}")
                stream_id = data.get('streamId')
                stream_url = data.get('rtspUrl')
                video_url = data.get('videoUrl')  # Thêm trường videoUrl

                # XỬ LÝ VIDEO UPLOAD (ƯU TIÊN VIDEO_URL)
                if video_url:
                    parsed = urlparse(video_url)
                    # Xử lý URL http/https
                    if parsed.scheme in ('http', 'https'):
                        # Tải video từ URL
                        response = requests.get(video_url, stream=True)
                        if response.status_code != 200:
                            logger.error(f"Không thể tải video từ URL: {video_url}")
                            ws.send(json.dumps(
                                {"error": f"Không thể tải video từ URL: {video_url}"}))
                            continue

                        # Tạo file tạm
                        with NamedTemporaryFile(delete=False, suffix='.mp4') as temp_file:
                            for chunk in response.iter_content(chunk_size=8192):
                                temp_file.write(chunk)
                            temp_path = temp_file.name

                        cap = cv2.VideoCapture(temp_path)
                    # Xử lý đường dẫn cục bộ
                    else:
                        # Chuyển đổi đường dẫn tương đối thành tuyệt đối
                        base_dir = os.path.abspath(os.path.dirname(__file__))
                        video_abs_path = os.path.join(base_dir, video_url.lstrip('/'))
                        cap = cv2.VideoCapture(video_abs_path)
                    
                    if not cap.isOpened():
                        logger.error(f"Không thể mở video: {video_url}")
                        ws.send(json.dumps(
                            {"error": f"Không thể mở video: {video_url}"}))
                        continue
                
                # XỬ LÝ RTSP/HLS STREAM
                elif stream_url and (stream_url.startswith("http") or stream_url.startswith("rtsp")):
                    cap = cv2.VideoCapture(stream_url)
                    if not cap.isOpened():
                        logger.error(f"Không thể mở stream: {stream_url}")
                        ws.send(json.dumps(
                            {"error": f"Không thể mở stream: {stream_url}"}))
                        continue
                
                # KHÔNG CÓ NGUỒN HỢP LỆ
                else:
                    logger.error(
                        f"URL không hợp lệ: {stream_url or video_url}. Yêu cầu RTSP, HLS hoặc video URL.")
                    ws.send(json.dumps(
                        {"error": "URL không hợp lệ. Yêu cầu RTSP, HLS hoặc video URL."}))
                    continue

                # XỬ LÝ KHUNG HÌNH
                while True:
                    ret, frame = cap.read()
                    if not ret:
                        logger.error(
                            f"Không thể đọc frame từ nguồn: {stream_url or video_url}")
                        ws.send(json.dumps(
                            {"error": f"Không thể đọc frame từ nguồn: {stream_url or video_url}"}))
                        break

                    result = detect_and_ocr(frame)
                    logger.info(f"Kết quả nhận diện: {result}")
                    try:
                        if ws.connected:
                            ws.send(json.dumps(
                                {"streamId": stream_id, "objects": result}))
                        else:
                            logger.info(
                                "Kết nối WebSocket đã đóng trước khi gửi dữ liệu")
                            break
                    except Exception as e:
                        logger.info(
                            f"Kết nối WebSocket đã đóng khi gửi dữ liệu: {str(e)}")
                        break

                    import time
                    time.sleep(1)  # Nhận diện mỗi giây

            except json.JSONDecodeError as e:
                logger.error(f"Thông điệp JSON không hợp lệ: {str(e)}")
                ws.send(json.dumps({"error": "Thông điệp JSON không hợp lệ"}))
                continue
            except Exception as e:
                if "Connection closed" in str(e) and "1000" in str(e):
                    logger.info(
                        f"Kết nối WebSocket đóng bình thường: {str(e)}")
                    break
                logger.error(f"Lỗi trong xử lý WebSocket: {str(e)}")
                break
            finally:
                # Dọn dẹp file tạm nếu có
                if temp_path and os.path.exists(temp_path):
                    os.unlink(temp_path)
                    temp_path = None
    except Exception as e:
        if "Connection closed" in str(e) and "1000" in str(e):
            logger.info(f"Kết nối WebSocket đóng bình thường: {str(e)}")
        else:
            logger.error(f"Lỗi trong xử lý WebSocket: {str(e)}")
    finally:
        if cap:
            cap.release()
            logger.info("Đã giải phóng cv2.VideoCapture")
        # Dọn dẹp file tạm lần cuối nếu còn
        if temp_path and os.path.exists(temp_path):
            os.unlink(temp_path)
        logger.info("Kết nối WebSocket đã kết thúc")


@app.route('/recognize', methods=['POST'])
def recognize():
    logger.info("Nhận yêu cầu HTTP tới /recognize")
    if 'image' in request.files:
        file = request.files['image']
        bytes_data = file.read()
        np_img = np.frombuffer(bytes_data, np.uint8)
        img = cv2.imdecode(np_img, cv2.IMREAD_COLOR)
    elif 'rtsp_url' in request.json:
        rtsp_url = request.json['rtsp_url']
        if not rtsp_url.startswith("rtsp"):
            logger.error(f"URL không hợp lệ: {rtsp_url}. Yêu cầu RTSP URL.")
            return jsonify({"error": "URL không hợp lệ. Yêu cầu RTSP URL."}), 400
        cap = cv2.VideoCapture(rtsp_url)
        if not cap.isOpened():
            logger.error(f"Không thể mở stream RTSP: {rtsp_url}")
            return jsonify({"error": "Không thể mở stream RTSP"}), 400
        ret, img = cap.read()
        cap.release()
        if not ret:
            logger.error(f"Không thể đọc frame từ stream RTSP: {rtsp_url}")
            return jsonify({"error": "Không thể chụp ảnh từ stream RTSP"}), 400
    else:
        logger.error("Không cung cấp ảnh hoặc RTSP URL")
        return jsonify({"error": "Cần cung cấp ảnh hoặc RTSP URL"}), 400

    result = detect_and_ocr(img)
    logger.info(f"Kết quả nhận diện HTTP: {result}")
    return jsonify({"objects": result})


if __name__ == "__main__":
    logger.info("Khởi động server trên http://0.0.0.0:5002...")
    app.run(host='0.0.0.0', port=5002)