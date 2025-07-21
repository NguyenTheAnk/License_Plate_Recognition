# app.py
from flask import Flask, request, jsonify
from flask_sock import Sock
import cv2
import numpy as np
from detector import detect_and_ocr
import json
import logging

# Thiết lập logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
sock = Sock(app)

@sock.route('/recognize-ws')
def recognize_ws(ws):
    logger.info("Kết nối WebSocket mới được thiết lập")
    while True:
        try:
            message = ws.receive()
            if not message:
                logger.info("Kết nối WebSocket bị đóng bởi client")
                break

            logger.info(f"Thông điệp nhận được: {message}")
            try:
                data = json.loads(message)
                logger.info(f"Thông điệp đã phân tích: {data}")
                stream_id = data.get('streamId')
                stream_url = data.get('rtspUrl')  # Đổi tên biến cho rõ ràng
                if not stream_id or not stream_url:
                    ws.send(json.dumps({"error": "Thiếu streamId hoặc streamUrl"}))
                    continue

                # Kiểm tra URL và xử lý HLS hoặc RTSP
                if stream_url.startswith("http"):
                    # Xử lý HLS stream
                    cap = cv2.VideoCapture(stream_url)
                    if not cap.isOpened():
                        logger.error(f"Không thể mở stream HLS: {stream_url}")
                        ws.send(json.dumps({"error": f"Không thể mở stream HLS: {stream_url}"}))
                        continue
                elif stream_url.startswith("rtsp"):
                    # Xử lý RTSP stream
                    cap = cv2.VideoCapture(stream_url)
                    if not cap.isOpened():
                        logger.error(f"Không thể mở stream RTSP: {stream_url}")
                        ws.send(json.dumps({"error": f"Không thể mở stream RTSP: {stream_url}"}))
                        continue
                else:
                    logger.error(f"URL không hợp lệ: {stream_url}. Yêu cầu RTSP hoặc HLS URL.")
                    ws.send(json.dumps({"error": "URL không hợp lệ. Yêu cầu RTSP hoặc HLS URL."}))
                    continue

                while True:
                    ret, frame = cap.read()
                    if not ret:
                        logger.error(f"Không thể đọc frame từ stream: {stream_url}")
                        ws.send(json.dumps({"error": f"Không thể đọc frame từ stream: {stream_url}"}))
                        break

                    result = detect_and_ocr(frame)
                    logger.info(f"Kết quả nhận diện: {result}")
                    ws.send(json.dumps({"streamId": stream_id, "objects": result}))

                    import time
                    time.sleep(1)  # Nhận diện mỗi giây

                cap.release()
            except json.JSONDecodeError as e:
                logger.error(f"Thông điệp JSON không hợp lệ: {str(e)}")
                ws.send(json.dumps({"error": "Thông điệp JSON không hợp lệ"}))
                continue
            except Exception as e:
                logger.error(f"Lỗi WebSocket: {str(e)}")
                ws.send(json.dumps({"error": str(e)}))
                break
        except Exception as e:
            logger.error(f"Lỗi trong xử lý WebSocket: {str(e)}")
            break

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
        if rtsp_url.startswith("http"):
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