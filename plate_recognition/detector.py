import cv2
import numpy as np
from fast_alpr import ALPR
import logging
import time
import os
import redis
from statistics import mean
from cjm_byte_track.core import BYTETracker 

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Định nghĩa vùng ROI
ROI_XMIN, ROI_YMIN, ROI_XMAX, ROI_YMAX = 50, 300, 1250, 950
CROPS_FOLDER = 'static/crops'
os.makedirs(CROPS_FOLDER, exist_ok=True)

# Khởi tạo Redis
r = redis.Redis(host='localhost', port=6379, decode_responses=True)

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
    track_thresh=0.25,  # Tăng ngưỡng để giảm false positives
    track_buffer=30,    # Giảm buffer để giảm bộ nhớ
    match_thresh=0.8,   # Giảm ngưỡng matching
    frame_rate=30
)

# Lưu lịch sử biển số
plate_history = {}
track_info = {}

# Biến toàn cục để tính FPS
fps_counter = 0
last_fps_time = time.time()
current_fps = 0
last_redis_update = 0

def is_bbox_in_roi(bbox, roi):
    """Kiểm tra xem bounding box có giao với vùng ROI hay không."""
    bbox_x1, bbox_y1, bbox_x2, bbox_y2 = bbox
    roi_x1, roi_y1, roi_x2, roi_y2 = roi
    return not (bbox_x2 < roi_x1 or bbox_x1 > roi_x2 or
                bbox_y2 < roi_y1 or bbox_y1 > roi_y2)

def update_redis_plate(track_id, plate_text, confidence):
    """Cập nhật biển số có confidence cao nhất vào Redis"""
    redis_key = f"plate_{track_id}"
    existing_data = r.hgetall(redis_key)
    
    if not existing_data or float(existing_data.get('confidence', 0)) < confidence:
        plate_data = {
            'plate': plate_text,
            'confidence': str(confidence),
            'timestamp': str(time.time())
        }
        r.hset(redis_key, mapping=plate_data)
        r.expire(redis_key, 3600)  # Tự động xóa sau 1 giờ

def detect_and_ocr(frame):
    global plate_history, track_info, fps_counter, last_fps_time, current_fps, last_redis_update
    
    # Tính FPS
    current_time = time.time()
    fps_counter += 1
    if current_time - last_fps_time >= 1.0:
        current_fps = fps_counter / (current_time - last_fps_time)
        fps_counter = 0
        last_fps_time = current_time
        logger.info(f"FPS: {current_fps:.2f}")
    
    curr_time = time.time()
    original_height, original_width = frame.shape[:2]
    
    # CHỈ XỬ LÝ VÙNG ROI - CẢI THIỆN HIỆU SUẤT
    roi_frame = frame[ROI_YMIN:ROI_YMAX, ROI_XMIN:ROI_XMAX]
    
    # Gọi FastALPR chỉ trên vùng ROI
    try:
        roi_frame_rgb = cv2.cvtColor(roi_frame, cv2.COLOR_BGR2RGB)
        alpr_results = alpr.predict(roi_frame_rgb)
    except Exception as e:
        logger.error(f"FastALPR prediction failed: {str(e)}")
        return frame

    # Chuẩn bị danh sách detections (chuyển tọa độ về frame gốc)
    detections = []
    for res in alpr_results:
        bbox = res.detection.bounding_box
        # Chuyển tọa độ từ ROI về frame gốc
        x1 = max(int(bbox.x1) + ROI_XMIN, 0)
        y1 = max(int(bbox.y1) + ROI_YMIN, 0)
        x2 = min(int(bbox.x2) + ROI_XMIN, original_width)
        y2 = min(int(bbox.y2) + ROI_YMIN, original_height)
        conf = res.detection.confidence or 0.7
        
        # Chỉ thêm detection nếu nằm trong ROI (kiểm tra lại)
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
    cv2.rectangle(frame, (ROI_XMIN, ROI_YMIN), (ROI_XMAX, ROI_YMAX), (255, 0, 0), 2)
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
        track_id = track.track_id
        x1, y1, w, h = map(int, tlwh)
        x2, y2 = x1 + w, y1 + h
        
        # Kiểm tra kích thước bbox và nằm trong ROI
        if (x2 - x1) < 50 or (y2 - y1) < 20 or not is_bbox_in_roi((x1, y1, x2, y2), (ROI_XMIN, ROI_YMIN, ROI_XMAX, ROI_YMAX)):
            continue

        # Sử dụng kết quả OCR từ lần nhận diện đầu tiên (trên ROI)
        # Tránh thực hiện OCR lại để tiết kiệm thời gian
        plate_text = ""
        conf_val = 0
        
        # Tìm kết quả OCR tương ứng với bounding box này
        for res in alpr_results:
            bbox = res.detection.bounding_box
            res_x1 = int(bbox.x1) + ROI_XMIN
            res_y1 = int(bbox.y1) + ROI_YMIN
            
            # Kiểm tra xem bounding box có trùng khớp không
            if (abs(res_x1 - x1) < 20 and abs(res_y1 - y1) < 20 and 
                res.ocr and res.ocr.text):
                plate_text = res.ocr.text
                conf = res.ocr.confidence
                conf_val = mean(conf) if isinstance(conf, list) else conf
                break
        
        # Lọc biển số
        if conf_val < 0.65 or len(plate_text) < 5:
            continue

        # Lưu vào lịch sử biển số
        if track_id not in plate_history:
            plate_history[track_id] = []
        
        # Giới hạn lịch sử
        if len(plate_history[track_id]) >= 5:  # Giảm từ 10 xuống 5
            plate_history[track_id].pop(0)
            
        plate_history[track_id].append((plate_text, conf_val))

        # Cập nhật Redis với biển số có confidence cao nhất (mỗi 2 giây)
        if curr_time - last_redis_update > 2.0:
            if plate_history[track_id]:
                best_plate = max(plate_history[track_id], key=lambda x: x[1])
                update_redis_plate(track_id, best_plate[0], best_plate[1])
            last_redis_update = curr_time

        # Cập nhật track_info
        track_info[track_id] = {
            'plate': plate_text,
            'confidence': conf_val,
            'bbox': f"{x1},{y1},{x2},{y2}",
            'last_seen': curr_time
        }
        
        current_track_ids.add(track_id)

        # Vẽ hộp giới hạn và thông tin
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
        label = f"ID {track_id}: {plate_text}"
        cv2.putText(frame, label, (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)

        # Chỉ lưu crop mỗi 5 giây để giảm I/O
        if track_id not in plate_history or len(plate_history[track_id]) == 1:
            crop_filename = f"crop_{track_id}_{int(curr_time)}.jpg"
            padding = 5  # Giảm padding
            x1_crop, y1_crop, x2_crop, y2_crop = max(x1-padding, 0), max(y1-padding, 0), min(x2+padding, original_width), min(y2+padding, original_height)
            crop = frame[y1_crop:y2_crop, x1_crop:x2_crop]
            if crop.size > 0:
                cv2.imwrite(os.path.join(CROPS_FOLDER, crop_filename), crop)

    # Dọn dẹp tracks cũ
    if len(plate_history) > 30:  # Giảm từ 50 xuống 30
        # Tìm track cũ nhất
        oldest_track = min(plate_history.keys(), key=lambda k: track_info.get(k, {}).get('last_seen', 0))
        del plate_history[oldest_track]
        if oldest_track in track_info:
            del track_info[oldest_track]
    
    # Cleanup inactive tracks (mỗi 10 giây)
    if curr_time - last_redis_update > 10.0:
        for track_id in list(track_info.keys()):
            if curr_time - track_info[track_id]['last_seen'] > 10.0:
                del track_info[track_id]
                if track_id in plate_history:
                    del plate_history[track_id]

    return frame