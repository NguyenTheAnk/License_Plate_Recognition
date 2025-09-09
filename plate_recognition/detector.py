import cv2
import numpy as np
from fast_alpr import ALPR
import logging
import time
import os
import redis
from statistics import mean
from cjm_byte_track.core import BYTETracker
from collections import defaultdict
import requests
import re

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Định nghĩa vùng ROI
ROI_XMIN, ROI_YMIN, ROI_XMAX, ROI_YMAX = 150, 350, 1850, 1050
CROPS_FOLDER = 'static/crops'
os.makedirs(CROPS_FOLDER, exist_ok=True)

# Khởi tạo Redis
try:
    r = redis.Redis(host='localhost', port=6379,
                    decode_responses=True, socket_connect_timeout=1)
    r.ping()  # Test kết nối
    redis_available = True
    logger.info("Redis connection successful")
except redis.ConnectionError:
    redis_available = False
    logger.warning("Redis not available. Running without Redis support.")

# Khởi tạo FastALPR
try:
    alpr = ALPR(
        detector_model="yolo-v9-t-416-license-plate-end2end",
        ocr_model="cct-xs-v1-global-model",
    )
except Exception as e:
    logger.error(f"Failed to load FastALPR model: {str(e)}")
    raise

# Khởi tạo ByteTrack với tham số tối ưu
tracker = BYTETracker(
    track_thresh=0.25,
    track_buffer=300,
    match_thresh=0.8,
    frame_rate=30
)

# Lưu lịch sử biển số và ánh xạ track_id
plate_history = {}
track_info = {}
track_id_mapping = {}  # Ánh xạ từ track_id mới sang track_id cũ
plate_to_track_id = defaultdict(list)  # Ánh xạ từ biển số sang track_id

# Biến toàn cục để tính FPS
fps_counter = 0
last_fps_time = time.time()
current_fps = 0
last_redis_update = 0
sent_plates = {}
plate_cooldown = 300  # 5 phút (300 giây)
FRAMES_FOLDER = '../public/frames_crops'
os.makedirs(FRAMES_FOLDER, exist_ok=True)

# Gửi dữ liệu biển số tới server Node.js


def send_plate_to_server(track_id, plate_data, frame_path=None, camera_id=None):
    try:
        current_time = time.time()
        plate_text = plate_data['plate']

        # Kiểm tra nếu biển số đã được gửi trong vòng 5 phút
        if plate_text in sent_plates:
            last_sent_time = sent_plates[plate_text]
            if current_time - last_sent_time < plate_cooldown:
                logger.info(
                    f"Biển số {plate_text} đã được gửi gần đây, bỏ qua")
                return

        url = "http://localhost:5000/api/plates"
        data = {
            "track_id": track_id,
            "plate_number": plate_data['plate'],
            "confidence": plate_data['confidence'],
            "bbox": plate_data['bbox'],
            "timestamp": current_time,
            "frame_path": frame_path,
            "camera_id": camera_id
        }

        response = requests.post(url, json=data, timeout=2)
        if response.status_code == 200:
            logger.info(
                f"Biển số {plate_data['plate']} đã gửi tới server thành công")
            # Cập nhật thời gian gửi cuối cùng
            sent_plates[plate_text] = current_time
        else:
            logger.error(f"Lỗi gửi biển số tới server: {response.status_code}")
    except Exception as e:
        logger.error(f"Lỗi khi gửi biển số tới server: {str(e)}")


def levenshtein_distance(s1, s2):
    """Tính khoảng cách Levenshtein giữa hai chuỗi."""
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    return previous_row[-1]


def is_bbox_in_roi(bbox, roi):
    """Kiểm tra xem bounding box có giao với vùng ROI hay không."""
    bbox_x1, bbox_y1, bbox_x2, bbox_y2 = bbox
    roi_x1, roi_y1, roi_x2, roi_y2 = roi
    return not (bbox_x2 < roi_x1 or bbox_x1 > roi_x2 or
                bbox_y2 < roi_y1 or bbox_y1 > roi_y2)


def find_existing_track_id(plate_text, threshold=3):
    """Tìm track_id hiện có cho biển số tương tự"""
    # Tìm trong plate_to_track_id trước
    for existing_plate, track_ids in plate_to_track_id.items():
        if levenshtein_distance(plate_text, existing_plate) <= threshold:
            # Trả về track_id đầu tiên (cũ nhất)
            return track_ids[0]

    # Nếu không tìm thấy, tìm trong Redis
    if not redis_available:
        return None

    try:
        for key in r.keys("track:*"):
            track_data = r.hgetall(key)
            existing_plate = track_data.get('plate', '')
            if levenshtein_distance(plate_text, existing_plate) <= threshold:
                return key.split(":")[1]  # Trả về track_id
    except redis.RedisError as e:
        logger.error(f"Redis error in find_existing_track_id: {str(e)}")

    return None


def update_redis_plate(track_id, plate_text, confidence, bbox):
    """Cập nhật biển số vào Redis"""
    if not redis_available:
        return

    try:
        redis_key = f"track:{track_id}"
        plate_key = f"plate:{plate_text}"

        # Kiểm tra xem có nên cập nhật không (confidence cao hơn)
        existing_data = r.hgetall(redis_key)
        if existing_data and float(existing_data.get('confidence', 0)) >= confidence:
            return  # Không cập nhật nếu confidence không cao hơn

        # Cập nhật Redis
        r.hset(redis_key, mapping={
            'plate': plate_text,
            'confidence': confidence,
            'bbox': bbox,
            'timestamp': time.time(),
            'last_seen': time.time()
        })
        r.set(plate_key, track_id)
        r.expire(redis_key, 3600)  # Tự động xóa sau 1 giờ
        r.expire(plate_key, 3600)  # Tự động xóa sau 1 giờ
    except redis.RedisError as e:
        logger.error(f"Redis error: {str(e)}")


def detect_and_ocr(frame, camera_id=None):
    global plate_history, track_info, fps_counter, last_fps_time, current_fps, last_redis_update

    # Tính FPS
    current_time = time.time()
    fps_counter += 1
    if current_time - last_fps_time >= 1.0:
        current_fps = fps_counter / (current_time - last_fps_time)
        fps_counter = 0
        last_fps_time = current_time

    curr_time = time.time()
    original_height, original_width = frame.shape[:2]

    # CHỈ XỬ LÝ VÙNG ROI
    roi_frame = frame[ROI_YMIN:ROI_YMAX, ROI_XMIN:ROI_XMAX]

    # Gọi FastALPR chỉ trên vùng ROI
    try:
        roi_frame_rgb = cv2.cvtColor(roi_frame, cv2.COLOR_BGR2RGB)
        alpr_results = alpr.predict(roi_frame_rgb)
    except Exception as e:
        logger.error(f"FastALPR prediction failed: {str(e)}")
        return frame

    # Chuẩn bị danh sách detections
    detections = []
    for res in alpr_results:
        bbox = res.detection.bounding_box
        x1 = max(int(bbox.x1) + ROI_XMIN, 0)
        y1 = max(int(bbox.y1) + ROI_YMIN, 0)
        x2 = min(int(bbox.x2) + ROI_XMIN, original_width)
        y2 = min(int(bbox.y2) + ROI_YMIN, original_height)
        conf = res.detection.confidence or 0.7

        if is_bbox_in_roi((x1, y1, x2, y2), (ROI_XMIN, ROI_YMIN, ROI_XMAX, ROI_YMAX)):
            detections.append([x1, y1, x2, y2, conf])

    # Chuyển sang numpy array
    if detections:
        detections_np = np.array(detections, dtype=np.float32)
    else:
        detections_np = np.zeros((0, 5), dtype=np.float32)

    # Cập nhật tracker
    tracks = tracker.update(
        output_results=detections_np,
        img_info=(original_height, original_width),
        img_size=(original_height, original_width)
    )

    # Vẽ vùng ROI
    cv2.rectangle(frame, (ROI_XMIN, ROI_YMIN),
                  (ROI_XMAX, ROI_YMAX), (255, 0, 0), 2)
    cv2.putText(frame, "ROI", (ROI_XMIN, ROI_YMIN - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 0, 0), 2)

    # Hiển thị FPS
    fps_text = f"FPS: {current_fps:.2f}"
    cv2.putText(frame, fps_text, (original_width - 120, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)

    # Xử lý kết quả từ tracker
    current_track_ids = set()

    for track in tracks:
        tlwh = track.tlwh
        current_track_id = track.track_id
        x1, y1, w, h = map(int, tlwh)
        x2, y2 = x1 + w, y1 + h

        # Kiểm tra kích thước bbox và nằm trong ROI
        if (x2 - x1) < 50 or (y2 - y1) < 20 or not is_bbox_in_roi((x1, y1, x2, y2), (ROI_XMIN, ROI_YMIN, ROI_XMAX, ROI_YMAX)):
            continue

        # Sử dụng kết quả OCR từ lần nhận diện đầu tiên
        plate_text = ""
        conf_val = 0

        for res in alpr_results:
            bbox = res.detection.bounding_box
            res_x1 = int(bbox.x1) + ROI_XMIN
            res_y1 = int(bbox.y1) + ROI_YMIN

            if (abs(res_x1 - x1) < 20 and abs(res_y1 - y1) < 20 and
                    res.ocr and res.ocr.text):
                plate_text = res.ocr.text
                conf = res.ocr.confidence
                conf_val = mean(conf) if isinstance(conf, list) else conf
                break

        # Lọc biển số
        if conf_val < 0.68 or len(plate_text) < 5:
            continue

        # Tìm track_id hiện có cho biển số tương tự
        existing_track_id = find_existing_track_id(plate_text)

        # Xác định track_id sẽ sử dụng
        if existing_track_id and existing_track_id != current_track_id:
            # Ánh xạ track_id mới sang track_id cũ
            track_id_mapping[current_track_id] = existing_track_id
            final_track_id = existing_track_id
        else:
            final_track_id = current_track_id

        # Cập nhật ánh xạ biển số sang track_id
        if plate_text not in plate_to_track_id:
            plate_to_track_id[plate_text] = []
        if final_track_id not in plate_to_track_id[plate_text]:
            plate_to_track_id[plate_text].append(final_track_id)

        # Lưu vào lịch sử biển số
        if final_track_id not in plate_history:
            plate_history[final_track_id] = []

        if len(plate_history[final_track_id]) >= 5:
            plate_history[final_track_id].pop(0)

        plate_history[final_track_id].append((plate_text, conf_val))

        # Cập nhật Redis ngay lập tức
        if plate_history[final_track_id]:
            best_plate = max(plate_history[final_track_id], key=lambda x: x[1])
            best_plate_text = best_plate[0]
            best_confidence = best_plate[1]
            bbox_str = f"{x1},{y1},{x2},{y2}"
            update_redis_plate(
                final_track_id, best_plate[0], best_plate[1], bbox_str)

        # Cập nhật track_info
        track_info[final_track_id] = {
            'plate': best_plate_text,
            'confidence': best_confidence,
            'bbox': f"{x1},{y1},{x2},{y2}",
            'last_seen': curr_time
        }

        current_track_ids.add(final_track_id)

        # Vẽ hộp giới hạn và thông tin
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
        label = f"ID {final_track_id}: {best_plate_text}"
        
        (text_width, text_height), baseline = cv2.getTextSize(
            label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2
        )

        # 2. Vẽ hình chữ nhật làm nền
        cv2.rectangle(frame, (x1, y1 - text_height - baseline - 10), 
                      (x1 + text_width, y1 - 10), (104, 153, 186),-1)
        cv2.putText(frame, label, (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)

        # Lưu crop
        if final_track_id not in plate_history or len(plate_history[final_track_id]) == 1:
            crop_filename = f"crop_{final_track_id}_{int(curr_time)}.jpg"
            padding = 5
            x1_crop = max(x1-padding, 0)
            y1_crop = max(y1-padding, 0)
            x2_crop = min(x2+padding, original_width)
            y2_crop = min(y2+padding, original_height)
            crop = frame[y1_crop:y2_crop, x1_crop:x2_crop]
            if crop.size > 0:
                cv2.imwrite(os.path.join(CROPS_FOLDER, crop_filename), crop)

    # Dọn dẹp tracks cũ
    if len(plate_history) > 30:
        oldest_track = min(plate_history.keys(), key=lambda k: track_info.get(
            k, {}).get('last_seen', 0))
        del plate_history[oldest_track]
        if oldest_track in track_info:
            del track_info[oldest_track]

    # Cleanup inactive tracks
    if curr_time - last_redis_update > 10.0:
        tracks_to_remove = []
        for track_id in list(track_info.keys()):
            if curr_time - track_info[track_id]['last_seen'] > 10.0:

                # Lấy thông tin biển số
                plate_text = track_info[track_id]['plate']

                clean_plate_text = re.sub(r'[\\/*?:"<>|]', "_", plate_text)

                # Tạo tên file mới với định dạng: biển_số_xe_trackID_timestamp.jpg
                frame_filename = f"{clean_plate_text}_{int(curr_time)}.jpg"
                frame_path = f"/frame_crops/{frame_filename}"

                # Lưu frame gốc (không có vẽ bounding box hay chữ)
                absolute_frame_path = os.path.join(
                    FRAMES_FOLDER, frame_filename)

                # Sử dụng frame gốc thay vì frame_with_boxes
                success = cv2.imwrite(
                    absolute_frame_path, frame)  # Lưu frame gốc
                if success:
                    print(f"Original frame saved to {absolute_frame_path}")
                else:
                    print(
                        f"Failed to save original frame to {absolute_frame_path}")

                # Gửi dữ liệu biển số tới server Node.js
                send_plate_to_server(
                    track_id, track_info[track_id], frame_path, camera_id=camera_id)
                tracks_to_remove.append(track_id)

        for track_id in tracks_to_remove:
            del track_info[track_id]
            if track_id in plate_history:
                del plate_history[track_id]

    return frame
