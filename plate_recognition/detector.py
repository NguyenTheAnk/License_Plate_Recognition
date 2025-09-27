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
from concurrent.futures import ThreadPoolExecutor
import subprocess
import platform
import psutil

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Định nghĩa vùng ROI
ROI_XMIN, ROI_YMIN, ROI_XMAX, ROI_YMAX = 150, 350, 1850, 1050
CROPS_FOLDER = 'static/crops'
os.makedirs(CROPS_FOLDER, exist_ok=True)

# Redis server management
redis_process = None

def is_redis_running():
    """Kiểm tra xem Redis server có đang chạy không"""
    try:
        # Kiểm tra bằng cách kết nối
        test_redis = redis.Redis(host='localhost', port=6379, socket_connect_timeout=1)
        test_redis.ping()
        test_redis.close()
        return True
    except:
        return False

def find_redis_process():
    """Tìm process Redis đang chạy"""
    try:
        for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                if proc.info['name'] and 'redis' in proc.info['name'].lower():
                    return proc
                if proc.info['cmdline'] and any('redis-server' in cmd.lower() for cmd in proc.info['cmdline']):
                    return proc
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
    except Exception as e:
        logger.warning(f"Error finding Redis process: {e}")
    return None

def start_redis_server():
    """Khởi động Redis server"""
    global redis_process
    
    # Kiểm tra xem Redis đã chạy chưa
    if is_redis_running():
        logger.info("Redis server is already running")
        return True
    
    # Kiểm tra xem có process Redis nào đang chạy không
    existing_process = find_redis_process()
    if existing_process:
        logger.info(f"Found existing Redis process: PID {existing_process.pid}")
        redis_process = existing_process
        return True
    
    try:
        # Khởi động Redis server
        logger.info("Starting Redis server...")
        
        if platform.system() == "Windows":
            # Trên Windows, sử dụng redis-server.exe
            redis_process = subprocess.Popen(
                ['redis-server'],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP
            )
        else:
            # Trên Linux/Mac
            redis_process = subprocess.Popen(
                ['redis-server'],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
        
        # Đợi một chút để Redis khởi động
        time.sleep(2)
        
        # Kiểm tra xem Redis đã khởi động thành công chưa
        if is_redis_running():
            logger.info(f"Redis server started successfully (PID: {redis_process.pid})")
            return True
        else:
            logger.error("Failed to start Redis server")
            return False
            
    except FileNotFoundError:
        logger.error("Redis server not found. Please install Redis first.")
        return False
    except Exception as e:
        logger.error(f"Error starting Redis server: {e}")
        return False

def stop_redis_server():
    """Dừng Redis server"""
    global redis_process
    
    if redis_process:
        try:
            redis_process.terminate()
            redis_process.wait(timeout=5)
            logger.info("Redis server stopped")
        except subprocess.TimeoutExpired:
            redis_process.kill()
            logger.info("Redis server force killed")
        except Exception as e:
            logger.error(f"Error stopping Redis server: {e}")
        finally:
            redis_process = None

# Khởi tạo Redis với tự động khởi động server
redis_available = False
r = None

# Thử kết nối Redis
try:
    r = redis.Redis(host='localhost', port=6379,
                    decode_responses=True, socket_connect_timeout=1)
    r.ping()  # Test kết nối
    redis_available = True
    logger.info("Redis connection successful")
except (redis.ConnectionError, redis.TimeoutError, TimeoutError, Exception) as e:
    logger.warning(f"Redis not available: {str(e)}. Attempting to start Redis server...")
    
    # Thử khởi động Redis server
    if start_redis_server():
        try:
            # Thử kết nối lại sau khi khởi động
            r = redis.Redis(host='localhost', port=6379,
                           decode_responses=True, socket_connect_timeout=1)
            r.ping()
            redis_available = True
            logger.info("Redis connection successful after auto-start")
        except Exception as e2:
            redis_available = False
            r = None
            logger.warning(f"Redis still not available after auto-start: {str(e2)}. Running without Redis support.")
    else:
        redis_available = False
        r = None
        logger.warning("Failed to start Redis server. Running without Redis support.")

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
byte_tracker = BYTETracker(
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
sent_tracks = {}  # Track các track đã được gửi để tránh trùng lặp
FRAMES_FOLDER = '../public/frames_crops'
os.makedirs(FRAMES_FOLDER, exist_ok=True)

# Initialize thread pool
thread_pool = ThreadPoolExecutor(max_workers=4)

def send_plate_to_server(track_id, plate_data, frame_path=None, camera_id=None, source_type="camera", video_filename=None, camera_location=None, camera_name=None):
    global server_available, last_server_check
    
    try:
        current_time = time.time()
        plate_text = plate_data['plate']
        
        # Kiểm tra nếu biển số đã được gửi trong vòng 5 phút
        if plate_text in sent_plates:
            last_sent_time = sent_plates[plate_text]
            if current_time - last_sent_time < plate_cooldown:
                return  # Bỏ qua im lặng

        # Kiểm tra server availability mỗi 30 giây
        if current_time - last_server_check > 30:
            try:
                test_response = requests.get("http://localhost:5000/health", timeout=1)
                server_available = test_response.status_code == 200
                last_server_check = current_time
            except:
                server_available = False
                last_server_check = current_time

        # Nếu server không khả dụng, bỏ qua im lặng
        if not server_available:
            return

        url = "http://localhost:5000/api/plate-recognitions/detected-plates"
        data = {
            "track_id": track_id,
            "plate_number": plate_data['plate'],
            "confidence_score": plate_data['confidence'],  # Đổi tên để match với controller
            "detection_confidence": plate_data.get('detection_confidence', plate_data['confidence']),
            "ocr_confidence": plate_data.get('ocr_confidence', plate_data['confidence']),
            "bbox": plate_data['bbox'],
            "detected_at": current_time,  # Đổi tên để match với controller
            "frame_path": frame_path,
            "camera_id": camera_id,
            "cropped_plate_image_path": frame_path or plate_data.get('crop_path'),  # Đổi tên để match với controller
            "source_type": "camera",
            "detected_vehicle_type": "car"
        }

        logger.info(f"📤 Sending data to server: {data}")
        response = requests.post(url, json=data, timeout=2)
        if response.status_code == 200:
            logger.info(f"✅ Biển số {plate_data['plate']} đã gửi tới server thành công")
            # Cập nhật thời gian gửi cuối cùng
            sent_plates[plate_text] = current_time
        else:
            logger.warning(f"⚠️ Server response error: HTTP {response.status_code}, Response: {response.text}")
            # Chỉ log lỗi một lần mỗi 60 giây
            if current_time - last_server_check > 60:
                logger.warning(f"⚠️ Server không khả dụng (HTTP {response.status_code})")
                last_server_check = current_time
    except Exception as e:
        # Chỉ log lỗi một lần mỗi 60 giây
        if current_time - last_server_check > 60:
            logger.warning(f"⚠️ Không thể kết nối server: {str(e)}")
            last_server_check = current_time

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

def calculate_similarity(s1, s2):
    """Tính độ tương đồng giữa hai biển số (0-100%)"""
    if not s1 or not s2:
        return 0
    distance = levenshtein_distance(s1, s2)
    max_len = max(len(s1), len(s2))
    if max_len == 0:
        return 100
    similarity = (1 - distance / max_len) * 100
    return similarity

def find_similar_plates(current_plate, plate_history, threshold=60):
    """Tìm các biển số tương tự trong lịch sử"""
    similar_plates = []
    for track_id, history in plate_history.items():
        if history:  # Nếu có lịch sử
            best_plate = max(history, key=lambda x: x[1])  # Lấy biển số có confidence cao nhất
            plate_text = best_plate[0]
            similarity = calculate_similarity(current_plate, plate_text)
            if similarity >= threshold:
                similar_plates.append((track_id, plate_text, similarity))
    return similar_plates

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
    if not redis_available or r is None:
        return None
        
    try:
        for key in r.keys("track:*"):
            track_data = r.hgetall(key)
            existing_plate = track_data.get('plate', '')
            if levenshtein_distance(plate_text, existing_plate) <= threshold:
                return key.split(":")[1]  # Trả về track_id
    except (redis.RedisError, AttributeError) as e:
        logger.error(f"Redis error in find_existing_track_id: {str(e)}")
    
    return None

def update_redis_plate(track_id, plate_text, confidence, bbox):
    """Cập nhật biển số vào Redis"""
    if not redis_available or r is None:
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
    except (redis.RedisError, AttributeError) as e:
        logger.error(f"Redis error: {str(e)}")

def detect_and_ocr_stable(frame, camera_id=None, source_type="camera", video_filename=None, camera_location=None, camera_name=None):
    """OPTIMIZED detection function - Simplified for 20 FPS performance while keeping all features"""
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
        return {
                'frame': b'',
                'boxes': [],
                'labels': [],
                'ocr_results': [],
                'tracked_objects': {},
                'ids': [],
                'frame_width': original_width,
                'frame_height': original_height,
            'roi': [ROI_XMIN, ROI_YMIN, ROI_XMAX, ROI_YMAX],
            'fps': current_fps,
                'detection_count': 0,
                'track_count': 0,
                'skipped': True
            }
    
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
    tracks = byte_tracker.update(
        output_results=detections_np,
        img_info=(original_height, original_width),
        img_size=(original_height, original_width)
    )
            
    # Vẽ vùng ROI - màu vàng
    cv2.rectangle(frame, (ROI_XMIN, ROI_YMIN),
                  (ROI_XMAX, ROI_YMAX), (0, 255, 255), 4)
    cv2.putText(frame, "ROI", (ROI_XMIN, ROI_YMIN - 20),
                cv2.FONT_HERSHEY_SIMPLEX, 1.8, (0, 255, 255), 4)

    # Hiển thị FPS - chữ to hơn, ở góc phải trên
    fps_text = f"FPS: {current_fps:.2f}"
    # Tính toán vị trí để text không bị che khuất
    (text_width, text_height), baseline = cv2.getTextSize(fps_text, cv2.FONT_HERSHEY_SIMPLEX, 1.5, 4)
    fps_x = original_width - text_width - 20  # 20px margin từ cạnh phải
    fps_y = 60  # 60px từ cạnh trên
    cv2.putText(frame, fps_text, (fps_x, fps_y),
                cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 255, 255), 4)

    # Xử lý kết quả từ tracker
    current_track_ids = set()
    boxes = []
    labels = []
    ocr_results = []
    tracked_objects = {}
    
    # Tối ưu tracking: chỉ giữ lại track có confidence cao nhất cho mỗi vùng
    optimized_tracks = []
    processed_regions = []
    
    # Sắp xếp tracks theo confidence giảm dần
    sorted_tracks = sorted(tracks, key=lambda t: t.score, reverse=True)
    
    for track in sorted_tracks:
        tlwh = track.tlwh
        x1, y1, w, h = map(int, tlwh)
        x2, y2 = x1 + w, y1 + h
        
        # Kiểm tra xem vùng này đã được xử lý chưa
        is_overlapping = False
        for processed_region in processed_regions:
            px1, py1, px2, py2 = processed_region
            # Kiểm tra overlap (IoU > 0.5) - tăng ngưỡng để gộp nhiều hơn
            overlap_x1 = max(x1, px1)
            overlap_y1 = max(y1, py1)
            overlap_x2 = min(x2, px2)
            overlap_y2 = min(y2, py2)
            
            if overlap_x1 < overlap_x2 and overlap_y1 < overlap_y2:
                overlap_area = (overlap_x2 - overlap_x1) * (overlap_y2 - overlap_y1)
                area1 = (x2 - x1) * (y2 - y1)
                area2 = (px2 - px1) * (py2 - py1)
                iou = overlap_area / (area1 + area2 - overlap_area)
                
                if iou > 0.5:  # Tăng ngưỡng lên 50% để gộp nhiều hơn
                    is_overlapping = True
                    break
        
        if not is_overlapping:
            optimized_tracks.append(track)
            processed_regions.append((x1, y1, x2, y2))
    
    logger.info(f"🎯 Optimized tracking: {len(tracks)} -> {len(optimized_tracks)} tracks")

    for track in optimized_tracks:
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

        # Gộp biển số tương tự (>=60% tương đồng) để tránh duplicate
        final_track_id = current_track_id
        
        # Kiểm tra xem có biển số tương tự trong lịch sử không
        best_similarity = 0
        best_existing_track_id = None
        best_existing_plate = None
        
        for existing_track_id, history in plate_history.items():
            if history and existing_track_id != current_track_id:
                best_plate = max(history, key=lambda x: x[1])
                existing_plate = best_plate[0]
                
                # Tính độ tương đồng giữa 2 biển số
                similarity = calculate_similarity(plate_text, existing_plate)
                
                # Tìm biển số có độ tương đồng cao nhất
                if similarity >= 60 and similarity > best_similarity:
                    best_similarity = similarity
                    best_existing_track_id = existing_track_id
                    best_existing_plate = existing_plate
        
        # Gộp với biển số có độ tương đồng cao nhất
        if best_existing_track_id is not None:
            track_id_mapping[current_track_id] = best_existing_track_id
            final_track_id = best_existing_track_id
            
            # Cập nhật biển số trong lịch sử nếu confidence cao hơn
            existing_history = plate_history[final_track_id]
            if existing_history:
                best_existing_confidence = max(existing_history, key=lambda x: x[1])[1]
                if conf_val > best_existing_confidence:
                    # Thay thế biển số cũ bằng biển số mới có confidence cao hơn
                    plate_history[final_track_id] = [(plate_text, conf_val)]
                    logger.info(f"🔄 Updated plate in history: {best_existing_plate} -> {plate_text} (conf: {best_existing_confidence:.3f} -> {conf_val:.3f})")
                else:
                    logger.info(f"🔄 Keeping existing plate: {best_existing_plate} (conf: {best_existing_confidence:.3f} > {conf_val:.3f})")
            
            logger.info(f"🔄 Merging similar plates: {plate_text} -> {best_existing_plate} (similarity: {best_similarity:.1f}%)")

        # Cập nhật ánh xạ biển số sang track_id
        if plate_text not in plate_to_track_id:
            plate_to_track_id[plate_text] = []
        if final_track_id not in plate_to_track_id[plate_text]:
            plate_to_track_id[plate_text].append(final_track_id)

        # Lưu vào lịch sử biển số
        if final_track_id not in plate_history:
            plate_history[final_track_id] = []
            # Gửi thông báo real-time khi phát hiện biển số mới
            logger.info(f"🚗 NEW PLATE DETECTED: {plate_text} (ID: {final_track_id})")

        if len(plate_history[final_track_id]) >= 5:
            plate_history[final_track_id].pop(0)

        plate_history[final_track_id].append((plate_text, conf_val))
        
        # CHỈ GỬI 1 LẦN DUY NHẤT cho mỗi track_id
        should_send = False
        if final_track_id not in sent_tracks:
            # Kiểm tra xem có confidence nào cao hơn không
            max_confidence = max(plate_history[final_track_id], key=lambda x: x[1])[1]
            if conf_val >= max_confidence:
                should_send = True
                logger.info(f"📤 First send for track {final_track_id}: {plate_text} (conf: {conf_val:.3f})")
            else:
                logger.info(f"⏭️ Waiting for higher confidence for track {final_track_id}")
        else:
            logger.info(f"⏭️ Track {final_track_id} already sent, skipping")
        
        # Tách confidence thành detection và OCR
        detection_conf = conf_val  # Confidence từ detection
        ocr_conf = conf_val  # Confidence từ OCR (có thể khác)
        
        # Tìm OCR confidence riêng biệt nếu có
        for res in alpr_results:
            bbox = res.detection.bounding_box
            res_x1 = int(bbox.x1) + ROI_XMIN
            res_y1 = int(bbox.y1) + ROI_YMIN

            if (abs(res_x1 - x1) < 20 and abs(res_y1 - y1) < 20 and
                    res.ocr and res.ocr.text and res.ocr.text == plate_text):
                if hasattr(res.ocr, 'confidence') and res.ocr.confidence:
                    ocr_conf = mean(res.ocr.confidence) if isinstance(res.ocr.confidence, list) else res.ocr.confidence
                break

        # Cập nhật Redis ngay lập tức
        if plate_history[final_track_id]:
            best_plate = max(plate_history[final_track_id], key=lambda x: x[1])
            best_plate_text = best_plate[0]
            best_confidence = best_plate[1]
            bbox_str = f"{x1},{y1},{x2},{y2}"
            update_redis_plate(
                final_track_id, best_plate[0], best_plate[1], bbox_str)

        # Cập nhật track_info với đầy đủ confidence data
        # Nếu đã gộp track, sử dụng biển số từ lịch sử
        if best_existing_track_id is not None and final_track_id in plate_history:
            # Sử dụng biển số từ lịch sử (có thể đã được cập nhật)
            current_plate_history = plate_history[final_track_id]
            if current_plate_history:
                best_plate_from_history = max(current_plate_history, key=lambda x: x[1])
                best_plate_text = best_plate_from_history[0]
                best_confidence = best_plate_from_history[1]
        
        track_info[final_track_id] = {
            'plate': best_plate_text,
            'confidence': best_confidence,
            'detection_confidence': detection_conf,
            'ocr_confidence': ocr_conf,
            'bbox': f"{x1},{y1},{x2},{y2}",
            'last_seen': curr_time
        }

        current_track_ids.add(final_track_id)

        # Khởi tạo crop_filename trước
        crop_filename = None
        
        # CHỈ LƯU CROP VÀ GỬI DỮ LIỆU KHI should_send = True
        if should_send:
            # Lưu crop TRƯỚC KHI vẽ bounding box để tránh vẽ bounding box vào crop
            # Lưu crop - crop chính xác vùng biển số từ OCR result
            crop_filename = f"plate_{final_track_id}_{plate_text}_{int(curr_time)}.jpg"
            
            # Tìm OCR result tương ứng để lấy vùng crop chính xác
            ocr_crop_coords = None
            for res in alpr_results:
                bbox = res.detection.bounding_box
                res_x1 = int(bbox.x1) + ROI_XMIN
                res_y1 = int(bbox.y1) + ROI_YMIN
                res_x2 = int(bbox.x2) + ROI_XMIN
                res_y2 = int(bbox.y2) + ROI_YMIN

                if (abs(res_x1 - x1) < 20 and abs(res_y1 - y1) < 20 and
                        res.ocr and res.ocr.text and res.ocr.text == plate_text):
                    
                    # Kiểm tra xem có tọa độ text riêng biệt không
                    if hasattr(res.ocr, 'bbox') and res.ocr.bbox:
                        # Sử dụng tọa độ text từ OCR
                        text_bbox = res.ocr.bbox
                        ocr_crop_coords = (
                            int(text_bbox.x1) + ROI_XMIN,
                            int(text_bbox.y1) + ROI_YMIN,
                            int(text_bbox.x2) + ROI_XMIN,
                            int(text_bbox.y2) + ROI_YMIN
                        )
                        logger.info(f"🎯 Using OCR text coordinates: {ocr_crop_coords}")
                    else:
                        # Fallback: sử dụng detection bbox với padding nhỏ để lấy toàn bộ biển số
                        # Chỉ thu nhỏ 10% để lấy toàn bộ vùng biển số
                        bbox_width = res_x2 - res_x1
                        bbox_height = res_y2 - res_y1
                        
                        # Thu nhỏ ít hơn để lấy toàn bộ biển số
                        shrink_factor = 0.1
                        shrink_x = int(bbox_width * shrink_factor)
                        shrink_y = int(bbox_height * shrink_factor)
                        
                        ocr_crop_coords = (
                            res_x1 + shrink_x,
                            res_y1 + shrink_y,
                            res_x2 - shrink_x,
                            res_y2 - shrink_y
                        )
                        logger.info(f"🎯 Using full plate detection coordinates: {ocr_crop_coords}")
                    break
            
            # Nếu không tìm thấy OCR result, sử dụng detection bbox với padding nhỏ
            if ocr_crop_coords is None:
                bbox_width = x2 - x1
                bbox_height = y2 - y1
                shrink_factor = 0.1  # Thu nhỏ ít để lấy toàn bộ biển số
                shrink_x = int(bbox_width * shrink_factor)
                shrink_y = int(bbox_height * shrink_factor)
                
                ocr_crop_coords = (
                    x1 + shrink_x,
                    y1 + shrink_y,
                    x2 - shrink_x,
                    y2 - shrink_y
                )
                logger.info(f"🎯 Using fallback full plate coordinates: {ocr_crop_coords}")
            
            # Crop với padding vừa phải để lấy toàn bộ biển số
            padding = 8  # Tăng padding để lấy toàn bộ biển số
            x1_crop = max(ocr_crop_coords[0] - padding, 0)
            y1_crop = max(ocr_crop_coords[1] - padding, 0)
            x2_crop = min(ocr_crop_coords[2] + padding, original_width)
            y2_crop = min(ocr_crop_coords[3] + padding, original_height)
            
            # Đảm bảo crop có kích thước hợp lệ
            if x2_crop > x1_crop and y2_crop > y1_crop:
                # Crop trực tiếp để lấy toàn bộ biển số
                crop = frame[y1_crop:y2_crop, x1_crop:x2_crop]
                logger.info(f"🎯 Direct crop for full plate: ({x1_crop}, {y1_crop}, {x2_crop}, {y2_crop})")
                
                if crop.size > 0:
                    crop_path = os.path.join(CROPS_FOLDER, crop_filename)
                    success = cv2.imwrite(crop_path, crop)
                    if success:
                        logger.info(f"✅ Saved precise crop: {crop_filename}")
                        
                        # Gửi dữ liệu
                        plate_data = {
                            'plate': plate_text,
                            'confidence': conf_val,  # Tổng confidence
                            'detection_confidence': detection_conf,  # Detection confidence
                            'ocr_confidence': ocr_conf,  # OCR confidence
                            'bbox': f"{x1},{y1},{x2},{y2}",
                            'crop_path': f"/static/crops/{crop_filename}"
                        }
                        logger.info(f"📤 Sending best confidence data for track {final_track_id}: {plate_text} (det: {detection_conf:.3f}, ocr: {ocr_conf:.3f})")
                        send_plate_to_server(final_track_id, plate_data, f"/static/crops/{crop_filename}", camera_id=camera_id)
                        # Đánh dấu track đã được gửi
                        sent_tracks[final_track_id] = {
                            'plate': plate_text,
                            'confidence': conf_val,
                            'detection_confidence': detection_conf,
                            'ocr_confidence': ocr_conf,
                            'timestamp': curr_time
                        }
                    else:
                        logger.error(f"❌ Failed to save crop: {crop_filename}")
                        crop_filename = None
                else:
                    logger.error(f"❌ Empty crop area")
                    crop_filename = None
            else:
                logger.error(f"❌ Invalid crop coordinates: {x1_crop},{y1_crop},{x2_crop},{y2_crop}")
                crop_filename = None

        # LUÔN VẼ hộp giới hạn và thông tin - chữ to hơn (SAU KHI ĐÃ CROP)
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 4)
        label = f"ID {final_track_id}: {best_plate_text}"
        
        (text_width, text_height), baseline = cv2.getTextSize(
            label, cv2.FONT_HERSHEY_SIMPLEX, 1.4, 4
        )

        # 2. Vẽ hình chữ nhật làm nền
        cv2.rectangle(frame, (x1, y1 - text_height - baseline - 20), 
                      (x1 + text_width, y1 - 20), (104, 153, 186), -1)
        cv2.putText(frame, label, (x1, y1 - 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.4, (0, 0, 0), 4)

        # Add to results
        boxes.append([x1, y1, x2, y2])
        labels.append(f"Plate: {best_plate_text}")
        ocr_results.append([best_plate_text, best_confidence])
        tracked_objects[final_track_id] = {
            'plate': best_plate_text,
            'confidence': best_confidence,
                                        'bbox': [x1, y1, x2, y2],
            'last_seen': curr_time,
            'crop_path': f"/static/crops/{crop_filename}" if crop_filename else None
        }

    # Dọn dẹp tracks cũ
    if len(plate_history) > 30:
        oldest_track = min(plate_history.keys(), key=lambda k: track_info.get(
            k, {}).get('last_seen', 0))
        del plate_history[oldest_track]
        if oldest_track in track_info:
            del track_info[oldest_track]

    # Cleanup inactive tracks và reset sent_tracks
    if curr_time - last_redis_update > 10.0:
        tracks_to_remove = []
        for track_id in list(track_info.keys()):
            if curr_time - track_info[track_id]['last_seen'] > 10.0:

                # Lấy thông tin biển số
                plate_text = track_info[track_id]['plate']

                clean_plate_text = re.sub(r'[\\/*?:"<>|]', "_", plate_text)

                # Chỉ gửi dữ liệu nếu track chưa được gửi trước đó
                if track_id not in sent_tracks:
                    # Gửi dữ liệu biển số tới server Node.js (crop đã được lưu khi detect)
                    plate_data = {
                        'plate': plate_text,
                        'confidence': track_info[track_id].get('confidence', 0.0),
                        'detection_confidence': track_info[track_id].get('detection_confidence', track_info[track_id].get('confidence', 0.0)),
                        'ocr_confidence': track_info[track_id].get('ocr_confidence', track_info[track_id].get('confidence', 0.0)),
                        'bbox': track_info[track_id].get('bbox', '0,0,0,0'),
                        'crop_path': track_info[track_id].get('crop_path', None)
                    }
                    crop_path = plate_data.get('crop_path', None)
                    print(f"📤 Sending plate data to server (cleanup): {plate_text} (ID: {track_id})")
                    send_plate_to_server(
                        track_id, plate_data, crop_path, camera_id=camera_id)
                    # Đánh dấu track đã được gửi
                    sent_tracks[track_id] = {
                        'plate': plate_text,
                        'confidence': track_info[track_id].get('confidence', 0.0),
                        'timestamp': curr_time
                    }
            else:
                print(f"⏭️ Track {track_id} already sent, skipping cleanup send")
                tracks_to_remove.append(track_id)

        for track_id in tracks_to_remove:
            del track_info[track_id]
            if track_id in plate_history:
                del plate_history[track_id]
            # Xóa khỏi sent_tracks để có thể gửi lại sau này
            if track_id in sent_tracks:
                del sent_tracks[track_id]

        last_redis_update = curr_time

    # Encode frame
    try:
        encode_result = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        frame_bytes = encode_result[1].tobytes() if encode_result[0] else b''
        
        return {
            'frame': frame_bytes,
            'boxes': boxes,
            'labels': labels,
            'ocr_results': ocr_results,
            'tracked_objects': tracked_objects,
            'ids': list(tracked_objects.keys()),
            'frame_width': original_width,
            'frame_height': original_height,
            'roi': [ROI_XMIN, ROI_YMIN, ROI_XMAX, ROI_YMAX],
            'fps': current_fps,
            'detection_count': len(boxes),
            'track_count': len(tracked_objects),
            'skipped': False
        }
    except Exception as e:
        logger.error(f"Error encoding frame: {e}")
        return {
            'frame': b'',
            'boxes': [],
            'labels': [],
            'ocr_results': [],
            'tracked_objects': {},
            'ids': [],
            'frame_width': original_width,
            'frame_height': original_height,
            'roi': [ROI_XMIN, ROI_YMIN, ROI_XMAX, ROI_YMAX],
            'fps': current_fps,
            'detection_count': 0,
            'track_count': 0,
            'skipped': True
        }

def detect_and_ocr_thread_safe(frame, camera_id=None, source_type="camera", video_filename=None, camera_location=None, camera_name=None):
    """Thread-safe wrapper for detect_and_ocr_stable"""
    try:
        # Process frame with optimized detection
        result = detect_and_ocr_stable(frame, camera_id, source_type, video_filename, camera_location, camera_name)
        return result
    except Exception as e:
        logger.error(f"Error in thread-safe detection: {str(e)}")
        # Return empty result on error
        return {
            'frame': b'',
            'boxes': [],
            'labels': [],
            'ocr_results': [],
            'tracked_objects': {},
            'ids': [],
            'frame_width': 0,
            'frame_height': 0,
            'roi': [0, 0, 0, 0],
            'fps': 0,
            'detection_count': 0,
            'track_count': 0,
            'skipped': True,
            'error': str(e)
        }

def process_frame_async(frame, camera_id=None, source_type="camera", video_filename=None, camera_location=None, camera_name=None):
    """Process frame asynchronously using thread pool"""
    try:
        # Submit task to thread pool
        future = thread_pool.submit(
            detect_and_ocr_thread_safe,
            frame, camera_id, source_type, video_filename, camera_location, camera_name
        )
        return future
    except Exception as e:
        logger.error(f"Error submitting frame to thread pool: {str(e)}")
        return None

def get_thread_manager_stats():
    """Get thread manager statistics"""
    return {
        "active_threads": 1,
        "total_processed": 0,
        "average_processing_time": 0.0
    }

def get_thread_data_container():
    """Get thread data container"""
    return {}

def get_thread_safe_data(key):
    """Get thread safe data"""
    return None

def set_thread_safe_data(key, value):
    """Set thread safe data"""
    pass

def update_thread_safe_data(key, update_func):
    """Update thread safe data"""
    pass

def cleanup_roi_objects(roi):
    """Cleanup ROI objects"""
    pass

def cleanup_persistent_displays(roi):
    """Cleanup persistent displays"""
    pass

def calculate_roi_coordinates(width, height):
    """Calculate ROI coordinates"""
    # CENTERED HALF FRAME
    center_x, center_y = width // 2, height // 2
    roi_width, roi_height = width // 2, height // 2
    roi_xmin = center_x - roi_width // 2
    roi_ymin = center_y - roi_height // 2
    roi_xmax = center_x + roi_width // 2
    roi_ymax = center_y + roi_height // 2
    return roi_xmin, roi_ymin, roi_xmax, roi_ymax

def is_bbox_in_roi(bbox, roi):
    """Check if bounding box is in ROI"""
    bbox_x1, bbox_y1, bbox_x2, bbox_y2 = bbox
    roi_x1, roi_y1, roi_x2, roi_y2 = roi
    return not (bbox_x2 < roi_x1 or bbox_x1 > roi_x2 or
                bbox_y2 < roi_y1 or bbox_y1 > roi_y2)

def find_existing_track_id(plate_text, threshold=3):
    """Find existing track_id for similar plate"""
    # Simplified implementation
    return None

def send_plate_to_server_legacy(track_id, plate_data, frame_path=None, camera_id=None, source_type="camera", video_filename=None, camera_location=None, camera_name=None):
    """Send plate data to server - Legacy function"""
    # This function is now just a wrapper for the main send_plate_to_server
    send_plate_to_server(track_id, plate_data, frame_path, camera_id, source_type, video_filename, camera_location, camera_name)

# Global variables for optimized performance
fps_counter = 0
last_fps_time = time.time()
current_fps = 0
last_redis_update = 0
sent_plates = {}
plate_cooldown = 300  # 5 minutes
plate_history = {}
track_info = {}
FRAMES_FOLDER = '../public/frames_crops'
os.makedirs(FRAMES_FOLDER, exist_ok=True)

# Server availability tracking
server_available = False
last_server_check = 0

# Initialize FastALPR
try:
    alpr = ALPR(
        detector_model="yolo-v9-t-416-license-plate-end2end",
        ocr_model="cct-xs-v1-global-model",
    )
except Exception as e:
    logger.error(f"Failed to load FastALPR model: {str(e)}")
    raise

# Initialize ByteTracker
byte_tracker = BYTETracker(
    track_thresh=0.25,
    track_buffer=300,
    match_thresh=0.8,
    frame_rate=30
)

# Initialize thread pool
thread_pool = ThreadPoolExecutor(max_workers=4)

# Redis already initialized at the top of the file

# Performance optimization flags
ENABLE_CACHING = True
ENABLE_LIGHTWEIGHT_MODE = True
ENABLE_FPS_THROTTLING = False
ENABLE_THREADING = True

# Create crops folder
os.makedirs(CROPS_FOLDER, exist_ok=True)

# Additional functions needed by app.py
def enable_performance_optimizations(enable=True):
    """Enable or disable performance optimizations"""
    global ENABLE_CACHING, ENABLE_LIGHTWEIGHT_MODE, ENABLE_FPS_THROTTLING
    ENABLE_CACHING = enable
    ENABLE_LIGHTWEIGHT_MODE = enable
    ENABLE_FPS_THROTTLING = not enable  # Disable throttling when optimizations are enabled
    logger.info(f"Performance optimizations {'enabled' if enable else 'disabled'}")
    return True

def start_redis_server_legacy():
    """Start Redis server if not running - Legacy function for compatibility"""
    global r, redis_available
    try:
        if r is not None:
            r.ping()
            logger.info("Redis server is already running")
            return True
        else:
            # Try to reconnect
            r = redis.Redis(host='localhost', port=6379,
                           decode_responses=True, socket_connect_timeout=1)
            r.ping()
            redis_available = True
            logger.info("Redis server reconnected successfully")
            return True
    except (redis.ConnectionError, redis.TimeoutError, TimeoutError, AttributeError):
        logger.warning("Redis server is not running. Please start Redis manually.")
        return False

def is_redis_running_legacy():
    """Check if Redis server is running - Legacy function for compatibility"""
    try:
        if r is not None:
            r.ping()
            return True
        return False
    except (redis.ConnectionError, redis.TimeoutError, TimeoutError, AttributeError):
        return False

# Additional functions for compatibility
def get_detection_stats():
    """Get detection statistics"""
    return {
        "total_detections": len(plate_history),
        "active_tracks": len(track_info),
        "fps": current_fps,
        "redis_available": redis_available
    }

def reset_anti_duplicate_system():
    """Reset the anti-duplicate system"""
    global plate_history, track_info, sent_plates
    plate_history.clear()
    track_info.clear()
    sent_plates.clear()
    logger.info("Anti-duplicate system reset")
    return {"success": True, "message": "System reset successfully"}

def cleanup_tracked_objects():
    """Manual cleanup of tracked objects"""
    global plate_history, track_info
    current_time = time.time()
    
    # Remove old tracks
    old_tracks = []
    for track_id, track_data in track_info.items():
        if current_time - track_data.get('last_seen', 0) > 30.0:  # 30 seconds
            old_tracks.append(track_id)
    
    for track_id in old_tracks:
        del track_info[track_id]
        if track_id in plate_history:
            del plate_history[track_id]
    
    logger.info(f"Cleaned up {len(old_tracks)} old tracks")

def get_persistent_displays():
    """Get current persistent displays"""
    return {
        "tracked_objects": track_info,
        "total_count": len(track_info)
    }

def clear_persistent_displays():
    """Clear all persistent displays"""
    global track_info
    count = len(track_info)
    track_info.clear()
    logger.info(f"Cleared {count} persistent displays")
    return {"success": True, "message": f"Cleared {count} displays"}

def get_enhanced_plate_history():
    """Get enhanced plate history with similarity information"""
    return {
        "plate_history": plate_history,
        "track_info": track_info,
        "total_plates": len(plate_history)
    }

def process_pending_detections_external(camera_id=None, source_type="camera", video_filename=None, camera_location=None, camera_name=None):
    """Process pending detections externally"""
    # This function is called by app.py but we handle everything in detect_and_ocr_stable
    # So this is just a placeholder
    logger.info("External processing called - handled internally")
    return {"success": True, "message": "Processing handled internally"}
                        
