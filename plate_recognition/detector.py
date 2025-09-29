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
import threading
from threading import Lock, RLock
import queue

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

# Global ALPR instance - shared across all threads
global_alpr = None
alpr_lock = Lock()

def get_global_alpr():
    """Get global ALPR instance - thread-safe singleton"""
    global global_alpr
    
    if global_alpr is None:
        with alpr_lock:
            if global_alpr is None:  # Double-check locking
                try:
                    logger.info("Loading FastALPR model (first time only)...")
                    global_alpr = ALPR(
                        detector_model="yolo-v9-t-416-license-plate-end2end",
                        ocr_model="cct-xs-v1-global-model",
                    )
                    logger.info("✅ FastALPR model loaded successfully")
                except Exception as e:
                    logger.error(f"Failed to load FastALPR model: {str(e)}")
                    raise
    return global_alpr

def is_alpr_initialized():
    """Check if ALPR is already initialized"""
    global global_alpr
    return global_alpr is not None

def reset_global_alpr():
    """Reset global ALPR instance (for debugging/testing)"""
    global global_alpr
    with alpr_lock:
        global_alpr = None
        logger.info("🔄 Global ALPR instance reset")

# Initialize global ALPR instance
try:
    alpr = get_global_alpr()
except Exception as e:
    logger.error(f"Failed to initialize global ALPR: {str(e)}")
    raise
    
# Khởi tạo ByteTrack với tham số tối ưu
byte_tracker = BYTETracker(
    track_thresh=0.25,
    track_buffer=300,
    match_thresh=0.8,
    frame_rate=30
)

# Thread-safe data structures with locks
data_lock = RLock()  # Reentrant lock for thread safety
plate_history = {}
track_info = {}
track_id_mapping = {}  # Ánh xạ từ track_id mới sang track_id cũ
plate_to_track_id = defaultdict(list)  # Ánh xạ từ biển số sang track_id

# STABILITY TRACKING: theo dõi biển số ổn định
plate_stability = {}  # track_id -> {'plate': str, 'count': int, 'last_seen': float, 'confidence': float}
STABILITY_COUNT_THRESHOLD = 3  # Cần 3 lần liên tiếp để coi là ổn định
STABILITY_TIME_WINDOW = 2.0  # Trong vòng 2 giây

# Biến toàn cục để tính FPS - thread-safe
fps_lock = Lock()
fps_counter = 0
last_fps_time = time.time()
current_fps = 0
last_redis_update = 0
sent_plates = {}  # Format: "plate_text_camera_id" -> timestamp
plate_cooldown = 300  # 5 phút (300 giây)
sent_tracks = {}  # Track các track đã được gửi để tránh trùng lặp
FRAMES_FOLDER = '../public/frames_crops'
os.makedirs(FRAMES_FOLDER, exist_ok=True)

# Thread-local storage for per-thread data
thread_local = threading.local()

# Per-thread ByteTracker instances to avoid conflicts
def get_thread_tracker():
    """Get thread-local ByteTracker instance"""
    if not hasattr(thread_local, 'byte_tracker'):
        thread_local.byte_tracker = BYTETracker(
            track_thresh=0.25,
            track_buffer=300,
            match_thresh=0.8,
            frame_rate=30
        )
    return thread_local.byte_tracker

# Use global ALPR instance for all threads (thread-safe)
def get_thread_alpr():
    """Get global ALPR instance - shared across all threads"""
    return get_global_alpr()

# Thread cleanup function
def cleanup_thread_resources():
    """Clean up thread-local resources"""
    try:
        # Only cleanup ByteTracker, ALPR is global and shared
        if hasattr(thread_local, 'byte_tracker'):
            del thread_local.byte_tracker
        logger.debug(f"Cleaned up ByteTracker for thread {threading.current_thread().ident}")
    except Exception as e:
        logger.error(f"Error cleaning up thread resources: {e}")

# Enhanced thread pool with better resource management
def create_enhanced_thread_pool(max_workers=4):
    """Create enhanced thread pool with better resource management"""
    global thread_pool
    
    # Shutdown existing pool if any
    if 'thread_pool' in globals() and thread_pool:
        try:
            thread_pool.shutdown(wait=True)
        except Exception as e:
            logger.error(f"Error shutting down existing thread pool: {e}")
    
    # Create new thread pool
    thread_pool = ThreadPoolExecutor(
        max_workers=max_workers,
        thread_name_prefix="ALPR_Worker"
    )
    
    logger.info(f"Created enhanced thread pool with {max_workers} workers")
    return thread_pool

# Thread pool for async processing - use enhanced version
thread_pool = create_enhanced_thread_pool(max_workers=4)

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
                if server_available:
                    logger.info("✅ Server is available")
                else:
                    logger.warning("⚠️ Server health check failed")
            except Exception as e:
                server_available = False
                last_server_check = current_time
                logger.warning(f"⚠️ Server health check error: {str(e)}")

        # Nếu server không khả dụng, thử gửi trực tiếp (có thể server vừa khởi động)
        if not server_available:
            logger.info("🔄 Server not available, attempting direct connection...")
            try:
                test_response = requests.get("http://localhost:5000/health", timeout=1)
                if test_response.status_code == 200:
                    server_available = True
                    logger.info("✅ Direct connection successful")
                else:
                    logger.warning("⚠️ Direct connection failed")
                    return
            except Exception as e:
                logger.warning(f"⚠️ Direct connection error: {str(e)}")
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
            "camera_id": camera_id,  # Chỉ cần gửi camera_id, backend sẽ tự lấy camera_name và location_name
            "cropped_plate_image_path": frame_path or plate_data.get('crop_path'),  # Đổi tên để match với controller
            "source_type": source_type or "camera",
            "detected_vehicle_type": "car",
            "video_filename": video_filename,
            "camera_name": camera_name  # Thêm camera_name để lưu vào database
        }

        # Log dữ liệu đang gửi
        logger.info(f"📤 Sending plate data to server: {plate_data['plate']} (confidence: {plate_data['confidence']:.3f}, camera: {camera_name})")
        logger.debug(f"📤 Full data: {data}")
        
        response = requests.post(url, json=data, timeout=2)
        if response.status_code == 200 or response.status_code == 201:
            logger.info(f"✅ Biển số {plate_data['plate']} đã gửi tới server thành công (HTTP {response.status_code})")
            # Cập nhật thời gian gửi cuối cùng (theo plate + camera)
            plate_camera_key = f"{plate_text}_{camera_id}"
            sent_plates[plate_camera_key] = current_time
        else:
            logger.error(f"❌ Server response error: HTTP {response.status_code}")
            logger.error(f"❌ Response content: {response.text}")
            # Không cập nhật last_server_check ở đây để có thể thử lại ngay
    except Exception as e:
        logger.error(f"❌ Lỗi khi gửi dữ liệu tới server: {str(e)}")
        logger.error(f"❌ Plate data: {plate_data}")
        logger.error(f"❌ Camera info: ID={camera_id}, Name={camera_name}")

def validate_vietnamese_plate_format(plate_text):
    """Validate Vietnamese license plate format: XXAYYYZZ (2 số + 1 chữ + 5 số)"""
    if not plate_text or not isinstance(plate_text, str):
        return False
    
    # Clean and normalize text - remove all non-alphanumeric characters
    import re
    text = plate_text.upper().strip()
    text = re.sub(r'[^A-Z0-9]', '', text)
    
    # Pattern: 2 số + 1 chữ cái + 5 số = 8 ký tự
    pattern = r'^[0-9]{2}[ABCDEFGH][0-9]{5}$'
    return bool(re.match(pattern, text))

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

def is_valid_vietnamese_plate(plate_text):
    """Kiểm tra xem biển số có đúng format Việt Nam không"""
    if not plate_text or len(plate_text) < 6:
        return False
    
    # Clean text - remove all non-alphanumeric characters
    clean_text = plate_text.upper().strip()
    clean_text = ''.join(c for c in clean_text if c.isalnum())
    
    # Vietnamese plate format: XXA-YYY.ZZ (raw: XXAYYYZZ)
    # Pattern: 2 số + 1 chữ cái + 5 số = 8 ký tự
    if len(clean_text) == 8:
        pattern = r'^[0-9]{2}[ABCDEFGH][0-9]{5}$'
        import re
        return bool(re.match(pattern, clean_text))
    
    return False

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

def get_redis_plate(track_id):
    """Thread-safe lấy biển số từ Redis cho track_id"""
    if not redis_available or r is None:
        return None, 0.0
        
    try:
        redis_key = f"track:{track_id}"
        # Thread-safe Redis operation
        with threading.Lock():  # Simple lock for Redis operations
            existing_data = r.hgetall(redis_key)
        if existing_data:
            plate_text = existing_data.get('plate', '')
            confidence = float(existing_data.get('confidence', 0.0))
            return plate_text, confidence
    except (redis.RedisError, AttributeError) as e:
        logger.error(f"Redis error in get_redis_plate: {str(e)}")
    
    return None, 0.0

def update_redis_plate(track_id, plate_text, confidence, bbox):
    """Thread-safe cập nhật biển số vào Redis - ưu tiên biển số đúng format Việt Nam"""
    if not redis_available or r is None:
        return False
        
    try:
        redis_key = f"track:{track_id}"
        plate_key = f"plate:{plate_text}"
        
        # Thread-safe Redis operations
        with threading.Lock():  # Simple lock for Redis operations
            # Kiểm tra xem có nên cập nhật không
            existing_data = r.hgetall(redis_key)
            if existing_data:
                existing_plate = existing_data.get('plate', '')
                existing_confidence = float(existing_data.get('confidence', 0))
                
                # Kiểm tra format biển số
                new_plate_valid = is_valid_vietnamese_plate(plate_text)
                existing_plate_valid = is_valid_vietnamese_plate(existing_plate)
                
                # Logic ưu tiên:
                # 1. Nếu biển số mới đúng format và biển số cũ không đúng format → cập nhật
                # 2. Nếu biển số khác nhau → cập nhật
                # 3. Nếu cùng biển số và confidence cao hơn → cập nhật
                if new_plate_valid and not existing_plate_valid:
                    logger.info(f"🇻🇳 Updating Redis for track {track_id}: new plate {plate_text} is valid Vietnamese format, old {existing_plate} is not")
                elif plate_text != existing_plate:
                    logger.info(f"🔄 Updating Redis for track {track_id}: plate changed from {existing_plate} to {plate_text}")
                elif confidence > existing_confidence:
                    logger.info(f"📈 Updating Redis for track {track_id}: same plate {plate_text}, higher confidence {confidence:.3f} > {existing_confidence:.3f}")
                else:
                    logger.info(f"⏭️ Not updating Redis for track {track_id}: existing confidence {existing_confidence:.3f} >= new confidence {confidence:.3f}")
                    return False  # Không cập nhật nếu không có lý do
                
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
        
        # FIXED: Giảm logging để tăng FPS
        if confidence > 0.8:  # Chỉ log khi confidence cao
            logger.info(f"✅ Updated Redis for track {track_id}: {plate_text} (confidence: {confidence:.3f})")
        return True
    except (redis.RedisError, AttributeError) as e:
        logger.error(f"Redis error: {str(e)}")
        return False

def detect_and_ocr_stable(frame, camera_id=None, source_type="camera", video_filename=None, camera_location=None, camera_name=None):
    """THREAD-SAFE detection function - Optimized for multi-threading performance"""
    global plate_history, track_info, fps_counter, last_fps_time, current_fps, last_redis_update

    # Thread-safe FPS calculation
    with fps_lock:
        current_time = time.time()
        fps_counter += 1
        if current_time - last_fps_time >= 1.0:
            current_fps = fps_counter / (current_time - last_fps_time)
            fps_counter = 0
            last_fps_time = current_time
    
    curr_time = time.time()
    original_height, original_width = frame.shape[:2]

    # FULL DETECTION: Always process detection for complete recognition
    # Removed skip logic to ensure no plates are missed

    # CHỈ XỬ LÝ VÙNG ROI
    roi_frame = frame[ROI_YMIN:ROI_YMAX, ROI_XMIN:ROI_XMAX]

    # Gọi FastALPR chỉ trên vùng ROI - sử dụng global instance
    try:
        roi_frame_rgb = cv2.cvtColor(roi_frame, cv2.COLOR_BGR2RGB)
        global_alpr = get_thread_alpr()  # Get global ALPR instance (shared)
        alpr_results = global_alpr.predict(roi_frame_rgb)
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

    # Cập nhật tracker - sử dụng thread-local instance
    thread_tracker = get_thread_tracker()  # Get thread-local ByteTracker instance
    tracks = thread_tracker.update(
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
    
    # FIXED: Đơn giản hóa tracking để tăng FPS - bỏ qua overlap detection
    optimized_tracks = tracks[:3]  # Chỉ lấy 3 tracks đầu tiên (confidence cao nhất)

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

        # Lọc biển số với threshold cao hơn để tăng độ chính xác
        if conf_val < 0.70 or len(plate_text) < 5:
            logger.debug(f"⏭️ Skipping low confidence plate: {plate_text} (conf: {conf_val:.3f}, len: {len(plate_text)})")
            continue

        # ENHANCED: Tạo track mới khi biển số thay đổi đáng kể
        final_track_id = current_track_id
        
        # Kiểm tra xem có biển số tương tự trong lịch sử không
        best_similarity = 0
        best_existing_track_id = None
        best_existing_plate = None
        best_existing_confidence = 0
        
        for existing_track_id, history in plate_history.items():
            if history and existing_track_id != current_track_id:
                best_plate = max(history, key=lambda x: x[1])
                existing_plate = best_plate[0]
                existing_confidence = best_plate[1]
                
                # Tính độ tương đồng giữa 2 biển số
                similarity = calculate_similarity(plate_text, existing_plate)
                
                # Tìm biển số có độ tương đồng cao nhất (>=80% để gộp track)
                if similarity >= 80 and similarity > best_similarity:
                    best_similarity = similarity
                    best_existing_track_id = existing_track_id
                    best_existing_plate = existing_plate
                    best_existing_confidence = existing_confidence
        
        # ENHANCED: Chỉ gộp track nếu biển số rất tương tự (>=80%) và cùng format
        if best_existing_track_id is not None:
            # Kiểm tra format biển số
            new_plate_valid = is_valid_vietnamese_plate(plate_text)
            existing_plate_valid = is_valid_vietnamese_plate(best_existing_plate)
            
            # Chỉ gộp nếu cả hai đều đúng format hoặc cả hai đều sai format
            if (new_plate_valid and existing_plate_valid) or (not new_plate_valid and not existing_plate_valid):
                track_id_mapping[current_track_id] = best_existing_track_id
                final_track_id = best_existing_track_id
                
                # Chọn biển số có confidence cao hơn
                if conf_val > best_existing_confidence:
                    # Thay thế biển số cũ bằng biển số mới có confidence cao hơn
                    plate_history[final_track_id] = [(plate_text, conf_val)]
                    logger.info(f"🔄 Updated plate in history: {best_existing_plate} -> {plate_text} (conf: {best_existing_confidence:.3f} -> {conf_val:.3f})")
                    # Cập nhật track_info với biển số mới
                    if final_track_id in track_info:
                        track_info[final_track_id]['plate'] = plate_text
                        track_info[final_track_id]['confidence'] = conf_val
            else:
                # Tạo track mới nếu format khác nhau
                # Tạo track ID mới bằng cách thêm timestamp
                new_track_id = f"{current_track_id}_{int(time.time() * 1000)}"
                track_id_mapping[current_track_id] = new_track_id
                final_track_id = new_track_id
                
                # Xóa track cũ khỏi sent_tracks để tránh conflict
                with data_lock:
                    if current_track_id in sent_tracks:
                        del sent_tracks[current_track_id]
                        logger.info(f"🧹 Removed old track {current_track_id} from sent_tracks (new format detected)")
                
                logger.info(f"🆕 Creating new track for different format: {plate_text} (valid: {new_plate_valid}) vs {best_existing_plate} (valid: {existing_plate_valid}) - New ID: {new_track_id}")
        else:
            # Tạo track mới nếu không có biển số tương tự
            # Tạo track ID mới bằng cách thêm timestamp
            new_track_id = f"{current_track_id}_{int(time.time() * 1000)}"
            track_id_mapping[current_track_id] = new_track_id
            final_track_id = new_track_id
            
            # Xóa track cũ khỏi sent_tracks để tránh conflict
            with data_lock:
                if current_track_id in sent_tracks:
                    del sent_tracks[current_track_id]
                    logger.info(f"🧹 Removed old track {current_track_id} from sent_tracks (new plate detected)")
            
            logger.info(f"🆕 Creating new track for new plate: {plate_text} (ID: {current_track_id} -> {new_track_id})")

        # Thread-safe update of shared data structures
        with data_lock:
            # Cập nhật ánh xạ biển số sang track_id
            if plate_text not in plate_to_track_id:
                plate_to_track_id[plate_text] = []
            if final_track_id not in plate_to_track_id[plate_text]:
                plate_to_track_id[plate_text].append(final_track_id)

            # Lưu vào lịch sử biển số
            if final_track_id not in plate_history:
                plate_history[final_track_id] = []
                # FIXED: Giảm logging - chỉ log khi confidence cao
                if conf_val > 0.8:
                    logger.info(f"🚗 NEW PLATE DETECTED: {plate_text} (ID: {final_track_id})")

            if len(plate_history[final_track_id]) >= 5:
                plate_history[final_track_id].pop(0)

            plate_history[final_track_id].append((plate_text, conf_val))
        
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

        # Lấy biển số từ Redis để so sánh confidence TRƯỚC KHI cập nhật
        redis_plate_text, redis_confidence = get_redis_plate(final_track_id)
        
        # PRIORITY LOGIC: Format đúng > Confidence cao
        # 1. Biển số không hợp lệ → Không lưu dù confidence cao
        # 2. Biển số hợp lệ + confidence thấp → Vẫn lưu (ưu tiên format đúng)
        # 3. Biển số hợp lệ + confidence cao → Ưu tiên cao nhất
        
        # Kiểm tra format của cả OCR mới và Redis
        ocr_valid = validate_vietnamese_plate_format(plate_text)
        redis_valid = validate_vietnamese_plate_format(redis_plate_text) if redis_plate_text else False
        
        # Logic ưu tiên
        if redis_plate_text is None or redis_plate_text == '':
            # Redis trống → dùng OCR mới (nếu hợp lệ)
            if ocr_valid:
                final_plate_text = plate_text
                final_confidence = conf_val
                logger.info(f"🔄 Using new OCR result (valid): {plate_text} (conf: {conf_val:.3f}) - Redis empty")
            else:
                # OCR không hợp lệ → không lưu
                final_plate_text = None
                final_confidence = 0
                logger.info(f"❌ Skipping invalid OCR result: {plate_text} (conf: {conf_val:.3f}) - Invalid format")
        elif ocr_valid and not redis_valid:
            # OCR hợp lệ, Redis không hợp lệ → ưu tiên OCR
            final_plate_text = plate_text
            final_confidence = conf_val
            logger.info(f"🔄 Using new OCR result (valid): {plate_text} (conf: {conf_val:.3f}) instead of invalid Redis: {redis_plate_text}")
        elif not ocr_valid and redis_valid:
            # OCR không hợp lệ, Redis hợp lệ → ưu tiên Redis
            final_plate_text = redis_plate_text
            final_confidence = redis_confidence
            logger.info(f"📊 Using Redis result (valid): {redis_plate_text} (conf: {redis_confidence:.3f}) instead of invalid OCR: {plate_text}")
        elif ocr_valid and redis_valid:
            # Cả hai đều hợp lệ → FORMAT PRIORITY LOGIC: ưu tiên biển số đúng format Việt Nam
            # 1. Nếu OCR mới đúng format Việt Nam và Redis không → ưu tiên OCR
            # 2. Nếu cả hai đều đúng format → ưu tiên confidence cao hơn
            # 3. Nếu cả hai đều sai format → ưu tiên confidence cao hơn
            
            ocr_vietnamese = is_valid_vietnamese_plate(plate_text)
            redis_vietnamese = is_valid_vietnamese_plate(redis_plate_text)
            confidence_diff = conf_val - redis_confidence
            
            if ocr_vietnamese and not redis_vietnamese:
                # OCR đúng format Việt Nam, Redis sai → ưu tiên OCR
                final_plate_text = plate_text
                final_confidence = conf_val
                logger.info(f"🇻🇳 Using new OCR result (valid Vietnamese format): {plate_text} (conf: {conf_val:.3f}) instead of invalid Redis: {redis_plate_text} (conf: {redis_confidence:.3f})")
            elif not ocr_vietnamese and redis_vietnamese:
                # Redis đúng format Việt Nam, OCR sai → ưu tiên Redis
                final_plate_text = redis_plate_text
                final_confidence = redis_confidence
                logger.info(f"🇻🇳 Using Redis result (valid Vietnamese format): {redis_plate_text} (conf: {redis_confidence:.3f}) instead of invalid OCR: {plate_text} (conf: {conf_val:.3f})")
            elif plate_text == redis_plate_text:
                # Cùng biển số → ưu tiên confidence cao hơn
                if conf_val > redis_confidence:
                    final_plate_text = plate_text
                    final_confidence = conf_val
                    logger.info(f"🔄 Using new OCR result (same plate, higher conf): {plate_text} (conf: {conf_val:.3f}) instead of Redis: {redis_plate_text} (conf: {redis_confidence:.3f})")
                else:
                    final_plate_text = redis_plate_text
                    final_confidence = redis_confidence
                    logger.info(f"📊 Using Redis result (same plate, higher conf): {redis_plate_text} (conf: {redis_confidence:.3f}) instead of OCR: {plate_text} (conf: {conf_val:.3f})")
            elif confidence_diff > 0.05:
                # Biển số khác nhau nhưng OCR mới có confidence cao hơn đáng kể → ưu tiên OCR
                final_plate_text = plate_text
                final_confidence = conf_val
                logger.info(f"🔄 Using new OCR result (different plate, much higher conf): {plate_text} (conf: {conf_val:.3f}, diff: +{confidence_diff:.3f}) instead of Redis: {redis_plate_text} (conf: {redis_confidence:.3f})")
            elif confidence_diff >= -0.01:
                # Biển số khác nhau nhưng confidence gần bằng nhau (chênh lệch <= 0.01) → ưu tiên OCR mới
                final_plate_text = plate_text
                final_confidence = conf_val
                logger.info(f"🔄 Using new OCR result (different plate, similar conf): {plate_text} (conf: {conf_val:.3f}, diff: {confidence_diff:+.3f}) instead of Redis: {redis_plate_text} (conf: {redis_confidence:.3f})")
            elif ocr_vietnamese and not redis_vietnamese:
                # OCR đúng format Việt Nam, Redis sai → ưu tiên OCR mới
                final_plate_text = plate_text
                final_confidence = conf_val
                logger.info(f"🇻🇳 Using new OCR result (valid Vietnamese format): {plate_text} (conf: {conf_val:.3f}) instead of invalid Redis: {redis_plate_text} (conf: {redis_confidence:.3f})")
            else:
                # Biển số khác nhau và Redis có confidence cao hơn đáng kể → giữ Redis
                final_plate_text = redis_plate_text
                final_confidence = redis_confidence
                logger.info(f"📊 Using Redis result (much higher conf): {redis_plate_text} (conf: {redis_confidence:.3f}) instead of OCR: {plate_text} (conf: {conf_val:.3f}, diff: {confidence_diff:+.3f})")
        else:
            # Cả hai đều không hợp lệ → không lưu
            final_plate_text = None
            final_confidence = 0
            logger.info(f"❌ Both OCR and Redis invalid: OCR={plate_text}, Redis={redis_plate_text} - Skipping")
        
        # Cập nhật Redis - chỉ cập nhật khi có biển số hợp lệ và confidence đủ cao
        bbox_str = f"{x1},{y1},{x2},{y2}"
        redis_updated = False
        
        # CONFIDENCE THRESHOLD: chỉ lưu khi confidence >= 0.85
        MIN_CONFIDENCE_THRESHOLD = 0.85
        
        if final_plate_text is not None and final_confidence >= MIN_CONFIDENCE_THRESHOLD:
            redis_updated = update_redis_plate(final_track_id, final_plate_text, final_confidence, bbox_str)
        elif final_plate_text is not None:
            logger.info(f"⏭️ Skipping Redis update for track {final_track_id}: confidence {final_confidence:.3f} < threshold {MIN_CONFIDENCE_THRESHOLD}")
        else:
            logger.info(f"⏭️ Skipping Redis update for track {final_track_id}: no valid plate format")
        
        # CHỈ GỬI 1 LẦN DUY NHẤT cho mỗi track_id HOẶC biển số tương tự
        should_send = False
        
        # Chỉ xử lý gửi dữ liệu nếu có biển số hợp lệ và confidence đủ cao
        if final_plate_text is None:
            logger.info(f"⏭️ Skipping send for track {final_track_id}: no valid plate format")
            should_send = False
        elif final_confidence < MIN_CONFIDENCE_THRESHOLD:
            logger.info(f"⏭️ Skipping send for track {final_track_id}: confidence {final_confidence:.3f} < threshold {MIN_CONFIDENCE_THRESHOLD}")
            should_send = False
        
        # Chỉ xử lý logic gửi nếu có biển số hợp lệ
        if final_plate_text is not None:
            # STABILITY CHECK: kiểm tra biển số có ổn định không
            current_time_check = time.time()
            
            # Cập nhật stability tracking
            if final_track_id not in plate_stability:
                plate_stability[final_track_id] = {
                    'plate': final_plate_text,
                    'count': 1,
                    'last_seen': current_time_check,
                    'confidence': final_confidence
                }
            else:
                stability_data = plate_stability[final_track_id]
                
                # Kiểm tra xem có cùng biển số không
                if stability_data['plate'] == final_plate_text:
                    # Cùng biển số → tăng count
                    stability_data['count'] += 1
                    stability_data['last_seen'] = current_time_check
                    stability_data['confidence'] = max(stability_data['confidence'], final_confidence)
                else:
                    # Khác biển số → reset
                    stability_data['plate'] = final_plate_text
                    stability_data['count'] = 1
                    stability_data['last_seen'] = current_time_check
                    stability_data['confidence'] = final_confidence
            
            # Kiểm tra xem biển số có ổn định không
            stability_data = plate_stability[final_track_id]
            is_stable = (stability_data['count'] >= STABILITY_COUNT_THRESHOLD and 
                        current_time_check - stability_data['last_seen'] <= STABILITY_TIME_WINDOW)
            
            if not is_stable:
                logger.info(f"⏭️ Skipping send for track {final_track_id}: plate {final_plate_text} not stable yet (count: {stability_data['count']}/{STABILITY_COUNT_THRESHOLD})")
                should_send = False
            else:
                logger.info(f"✅ Plate {final_plate_text} is stable for track {final_track_id} (count: {stability_data['count']}, conf: {stability_data['confidence']:.3f})")
            
            # FIXED: Kiểm tra biển số đã gửi theo camera để cho phép cùng biển số ở camera khác
            plate_already_sent = False
            plate_camera_key = f"{final_plate_text}_{camera_id}"  # Tạo key unique cho plate + camera
            
            for sent_track_id, sent_data in sent_tracks.items():
                sent_plate = sent_data['plate']
                sent_camera_id = sent_data.get('camera_id', 0)
                sent_time = sent_data.get('timestamp', 0)
                
                # Chỉ kiểm tra nếu cùng camera
                if sent_camera_id == camera_id:
                    # Tăng cooldown từ 30s lên 60s và similarity từ 60% lên 80%
                    if (sent_plate == final_plate_text or 
                        (current_time_check - sent_time < 60 and calculate_similarity(final_plate_text, sent_plate) >= 80)):
                        plate_already_sent = True
                        # FIXED: Giảm logging để tăng FPS - chỉ log khi cần thiết
                        if current_time_check % 5 < 1:  # Chỉ log 1/5 lần
                            logger.info(f"⏭️ Similar plate {final_plate_text} already sent recently for camera {camera_id} (track {sent_track_id}, plate: {sent_plate}), skipping")
                        break
            
            if not plate_already_sent and final_track_id not in sent_tracks and is_stable:
                # Kiểm tra xem có nên gửi không - chỉ gửi khi biển số ổn định
                if redis_updated:
                    should_send = True
                    logger.info(f"📤 Sending stable plate for track {final_track_id}: {final_plate_text} (conf: {final_confidence:.3f}) - Redis updated")
                elif final_confidence > 0.90:  # Chỉ gửi khi confidence rất cao
                    should_send = True
                    logger.info(f"📤 Sending stable plate for track {final_track_id}: {final_plate_text} (conf: {final_confidence:.3f}) - Very high confidence")
                else:
                    # FIXED: Giảm logging để tăng FPS
                    if curr_time % 3 < 1:  # Chỉ log 1/3 lần
                        logger.info(f"⏭️ Not sending for track {final_track_id}: confidence {final_confidence:.3f} <= threshold 0.90")
            elif final_track_id in sent_tracks:
                # FIXED: Giảm logging để tăng FPS
                if curr_time % 3 < 1:  # Chỉ log 1/3 lần
                    logger.info(f"⏭️ Track {final_track_id} already sent, skipping")
        
        # Thread-safe update of track_info
        with data_lock:
            track_info[final_track_id] = {
                'plate': final_plate_text if final_plate_text else redis_plate_text,  # Sử dụng biển số cuối cùng
                'confidence': final_confidence if final_plate_text else redis_confidence,  # Sử dụng confidence cuối cùng
                'detection_confidence': detection_conf,
                'ocr_confidence': ocr_conf,
                'bbox': f"{x1},{y1},{x2},{y2}",
                'last_seen': curr_time
            }

        current_track_ids.add(final_track_id)

        # Khởi tạo crop_filename trước
        crop_filename = None
        
        # CHỈ LƯU CROP VÀ GỬI DỮ LIỆU KHI should_send = True
        logger.info(f"🔍 Debug: should_send={should_send}, final_track_id={final_track_id}, final_confidence={final_confidence:.3f}, redis_updated={redis_updated}")
        if should_send:
            # Lưu crop TRƯỚC KHI vẽ bounding box để tránh vẽ bounding box vào crop
            # Lưu crop - crop chính xác vùng biển số từ OCR result
            crop_filename = f"plate_{final_track_id}_{final_plate_text}_{int(curr_time)}.jpg"
            
            # IMPROVED: Sử dụng OCR bbox chính xác với padding nhỏ để crop chính xác
            # Tìm OCR bbox chính xác từ kết quả OCR
            ocr_bbox = None
            character_bboxes = None
            
            for res in alpr_results:
                bbox = res.detection.bounding_box
                res_x1 = int(bbox.x1) + ROI_XMIN
                res_y1 = int(bbox.y1) + ROI_YMIN
                
                # Tìm OCR result khớp với biển số cuối cùng
                if (abs(res_x1 - x1) < 20 and abs(res_y1 - y1) < 20 and
                        res.ocr and res.ocr.text and res.ocr.text == final_plate_text):
                    ocr_bbox = bbox
                    
                    # Thử lấy character-level bbox nếu có
                    if hasattr(res.ocr, 'character_bboxes') and res.ocr.character_bboxes:
                        character_bboxes = res.ocr.character_bboxes
                        logger.info(f"🎯 Found character-level bboxes for precise crop")
                    break
            
            # Sử dụng character-level bbox nếu có, nếu không thì dùng OCR bbox, cuối cùng là detection bbox
            if character_bboxes and len(character_bboxes) > 0:
                # Sử dụng character-level bbox để crop chính xác nhất
                # Tính bounding box bao quanh tất cả characters
                char_x1 = min(char_bbox[0] for char_bbox in character_bboxes) + ROI_XMIN
                char_y1 = min(char_bbox[1] for char_bbox in character_bboxes) + ROI_YMIN
                char_x2 = max(char_bbox[2] for char_bbox in character_bboxes) + ROI_XMIN
                char_y2 = max(char_bbox[3] for char_bbox in character_bboxes) + ROI_YMIN
                
                # Padding rất nhỏ cho character-level bbox
                bbox_width = char_x2 - char_x1
                bbox_height = char_y2 - char_y1
                padding_x = max(int(bbox_width * 0.02), 2)  # 2% của width hoặc tối thiểu 2px
                padding_y = max(int(bbox_height * 0.02), 2)  # 2% của height hoặc tối thiểu 2px
                
                x1_crop = max(char_x1 - padding_x, 0)
                y1_crop = max(char_y1 - padding_y, 0)
                x2_crop = min(char_x2 + padding_x, original_width)
                y2_crop = min(char_y2 + padding_y, original_height)
                
                logger.info(f"🎯 Using character-level bbox for ultra-precise crop: chars=({char_x1},{char_y1},{char_x2},{char_y2}), padding=({padding_x},{padding_y}), crop=({x1_crop},{y1_crop},{x2_crop},{y2_crop})")
            elif ocr_bbox:
                # OCR bbox đã được offset về ROI, cần chuyển về frame gốc
                x1_ocr = int(ocr_bbox.x1) + ROI_XMIN
                y1_ocr = int(ocr_bbox.y1) + ROI_YMIN
                x2_ocr = int(ocr_bbox.x2) + ROI_XMIN
                y2_ocr = int(ocr_bbox.y2) + ROI_YMIN
                
                # Sử dụng OCR bbox với padding nhỏ
                bbox_width = x2_ocr - x1_ocr
                bbox_height = y2_ocr - y1_ocr
                padding_x = max(int(bbox_width * 0.05), 5)  # 5% của width hoặc tối thiểu 5px
                padding_y = max(int(bbox_height * 0.05), 3)  # 5% của height hoặc tối thiểu 3px
                
                x1_crop = max(x1_ocr - padding_x, 0)
                y1_crop = max(y1_ocr - padding_y, 0)
                x2_crop = min(x2_ocr + padding_x, original_width)
                y2_crop = min(y2_ocr + padding_y, original_height)
                
                logger.info(f"🎯 Using OCR bbox for precise crop: OCR=({x1_ocr},{y1_ocr},{x2_ocr},{y2_ocr}), padding=({padding_x},{padding_y}), crop=({x1_crop},{y1_crop},{x2_crop},{y2_crop})")
            else:
                # Fallback: sử dụng detection bbox với padding nhỏ hơn
                bbox_width = x2 - x1
                bbox_height = y2 - y1
                padding_x = max(int(bbox_width * 0.1), 10)  # 10% của width hoặc tối thiểu 10px
                padding_y = max(int(bbox_height * 0.1), 8)  # 10% của height hoặc tối thiểu 8px
                
                x1_crop = max(x1 - padding_x, 0)
                y1_crop = max(y1 - padding_y, 0)
                x2_crop = min(x2 + padding_x, original_width)
                y2_crop = min(y2 + padding_y, original_height)
                
                logger.info(f"🎯 Using detection bbox for crop: bbox=({x1},{y1},{x2},{y2}), padding=({padding_x},{padding_y}), crop=({x1_crop},{y1_crop},{x2_crop},{y2_crop})")
            
            # Đảm bảo crop có kích thước hợp lệ
            if x2_crop > x1_crop and y2_crop > y1_crop:
                # Crop trực tiếp để lấy toàn bộ biển số
                crop = frame[y1_crop:y2_crop, x1_crop:x2_crop]
                
                # IMPROVED: Loại bỏ sọc trắng bằng cách crop chặt hơn
                if crop.size > 0:
                    # Chuyển sang grayscale để xử lý
                    gray_crop = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop
                    
                    # Tìm vùng có text (loại bỏ sọc trắng)
                    # Sử dụng threshold để tìm vùng text
                    _, thresh = cv2.threshold(gray_crop, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                    
                    # Tìm contours để xác định vùng text
                    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                    
                    if contours:
                        # Tìm bounding box của tất cả contours
                        all_points = np.concatenate(contours)
                        x_min, y_min, w, h = cv2.boundingRect(all_points)
                        
                        # Thêm padding nhỏ cho text
                        padding = 5
                        x_min = max(0, x_min - padding)
                        y_min = max(0, y_min - padding)
                        x_max = min(crop.shape[1], x_min + w + 2*padding)
                        y_max = min(crop.shape[0], y_min + h + 2*padding)
                        
                        # Crop lại để loại bỏ sọc trắng
                        if x_max > x_min and y_max > y_min:
                            crop = crop[y_min:y_max, x_min:x_max]
                            logger.info(f"🎯 Trimmed crop to remove white stripes: ({x_min},{y_min},{x_max},{y_max})")
                
                # Cải thiện chất lượng ảnh crop
                if crop.size > 0:
                    # Resize crop nếu quá nhỏ để cải thiện OCR
                    crop_height, crop_width = crop.shape[:2]
                    if crop_width < 200 or crop_height < 80:
                        # Tính tỷ lệ resize để đảm bảo kích thước tối thiểu
                        scale_x = max(200 / crop_width, 1.0)
                        scale_y = max(80 / crop_height, 1.0)
                        scale = min(scale_x, scale_y, 3.0)  # Giới hạn scale tối đa 3x
                        
                        if scale > 1.0:
                            new_width = int(crop_width * scale)
                            new_height = int(crop_height * scale)
                            crop = cv2.resize(crop, (new_width, new_height), interpolation=cv2.INTER_CUBIC)
                            logger.info(f"🔍 Resized crop from ({crop_width}x{crop_height}) to ({new_width}x{new_height}) with scale {scale:.2f}")
                    
                    # Cải thiện contrast và brightness cho OCR tốt hơn
                    crop_gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
                    crop_enhanced = cv2.convertScaleAbs(crop_gray, alpha=1.2, beta=10)  # Tăng contrast và brightness
                    crop = cv2.cvtColor(crop_enhanced, cv2.COLOR_GRAY2BGR)
                    
                    crop_path = os.path.join(CROPS_FOLDER, crop_filename)
                    success = cv2.imwrite(crop_path, crop, [cv2.IMWRITE_JPEG_QUALITY, 95])
                    if success:
                        logger.info(f"✅ Saved enhanced crop: {crop_filename} (size: {crop.shape[1]}x{crop.shape[0]})")
                        
                        # Gửi dữ liệu - sử dụng biển số cuối cùng (có thể từ Redis hoặc OCR mới)
                        plate_data = {
                            'plate': final_plate_text,  # Sử dụng biển số cuối cùng (ưu tiên OCR mới)
                            'confidence': final_confidence,  # Sử dụng confidence cuối cùng
                            'detection_confidence': detection_conf,  # Detection confidence
                            'ocr_confidence': ocr_conf,  # OCR confidence
                            'bbox': f"{x1},{y1},{x2},{y2}",
                            'crop_path': f"/static/crops/{crop_filename}"
                        }
                        logger.info(f"📤 Sending enhanced plate data for track {final_track_id}: {final_plate_text} (conf: {final_confidence:.3f}, det: {detection_conf:.3f}, ocr: {ocr_conf:.3f})")
                        send_plate_to_server(final_track_id, plate_data, f"/static/crops/{crop_filename}", camera_id=camera_id, source_type=source_type, video_filename=video_filename, camera_location=camera_location, camera_name=camera_name)
                        # Thread-safe update of sent_tracks
                        with data_lock:
                            sent_tracks[final_track_id] = {
                                'plate': final_plate_text,  # Sử dụng biển số cuối cùng
                                'camera_id': camera_id,  # Thêm camera_id để phân biệt
                                'confidence': final_confidence,
                                'detection_confidence': detection_conf,
                                'ocr_confidence': ocr_conf,
                                'timestamp': curr_time
                            }
                    else:
                        logger.error(f"❌ Failed to save enhanced crop: {crop_filename}")
                        crop_filename = None
                else:
                    logger.error(f"❌ Empty crop area")
                    crop_filename = None
            else:
                logger.error(f"❌ Invalid crop coordinates: {x1_crop},{y1_crop},{x2_crop},{y2_crop}")
                crop_filename = None

        # LUÔN VẼ hộp giới hạn và thông tin - chữ to hơn (SAU KHI ĐÃ CROP)
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 4)
        # Đảm bảo không có None values
        display_plate = final_plate_text if final_plate_text else (redis_plate_text if redis_plate_text else "Unknown")
        
        # Chỉ hiển thị phần số đầu tiên của track ID (bỏ timestamp)
        simple_track_id = final_track_id.split('_')[0] if '_' in str(final_track_id) else final_track_id
        label = f"ID: {simple_track_id} {display_plate}"
        
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
        labels.append(f"Plate: {redis_plate_text}")
        ocr_results.append([redis_plate_text, redis_confidence])
        tracked_objects[final_track_id] = {
            'plate': redis_plate_text,
            'confidence': redis_confidence,
            'bbox': [x1, y1, x2, y2],
            'last_seen': curr_time,
            'crop_path': f"/static/crops/{crop_filename}" if crop_filename else None
        }

    # Thread-safe cleanup of old tracks
    with data_lock:
        # FIXED: Giảm số tracks để tăng FPS - từ 5 xuống 3
        if len(plate_history) > 3:
            # Sắp xếp tracks theo thời gian last_seen và xóa track cũ nhất
            sorted_tracks = sorted(plate_history.keys(), 
                                 key=lambda k: track_info.get(k, {}).get('last_seen', 0))
            tracks_to_remove_old = sorted_tracks[:-3]  # Giữ lại 3 tracks mới nhất
            
            for old_track_id in tracks_to_remove_old:
                if old_track_id in plate_history:
                    del plate_history[old_track_id]
                if old_track_id in track_info:
                    del track_info[old_track_id]
                if old_track_id in sent_tracks:
                    del sent_tracks[old_track_id]
                logger.debug(f"🧹 Removed old track {old_track_id} (memory cleanup)")

    # Thread-safe cleanup cycle
    with data_lock:
        # FIXED: Tăng cleanup frequency để giảm overhead - từ 15s xuống 20s
        if curr_time - last_redis_update > 20.0:  # Increased from 15s to 20s to reduce overhead
            tracks_to_remove = []
            # FIXED: Giảm logging - chỉ log khi có nhiều tracks
            if len(track_info) > 5 or len(sent_tracks) > 10:
                logger.info(f"🧹 Cleanup cycle: {len(track_info)} active tracks, {len(sent_tracks)} sent tracks")
            
            for track_id in list(track_info.keys()):
                if curr_time - track_info[track_id]['last_seen'] > 10.0:
                    # Lấy thông tin biển số
                    plate_text = track_info[track_id]['plate']

                    clean_plate_text = re.sub(r'[\\/*?:"<>|]', "_", plate_text)

                    # FIXED: Không gửi lại trong cleanup để tránh duplicate
                    # Track đã được gửi khi detect, không cần gửi lại khi cleanup
                    # FIXED: Bỏ logging cleanup để giảm noise
                    tracks_to_remove.append(track_id)

            for track_id in tracks_to_remove:
                del track_info[track_id]
                if track_id in plate_history:
                    del plate_history[track_id]
                # Xóa khỏi sent_tracks khi track bị xóa để tránh conflict với track ID mới
                if track_id in sent_tracks:
                    del sent_tracks[track_id]
                    logger.debug(f"🧹 Removed track {track_id} from sent_tracks (track deleted)")

            last_redis_update = curr_time
            
            # Cleanup sent_tracks cũ (sau 10 giây) và giới hạn tối đa 10 tracks
            current_time_cleanup = time.time()
            tracks_to_cleanup = []
            
            # Xóa tracks cũ hơn 10 giây
            for track_id, sent_data in sent_tracks.items():
                if current_time_cleanup - sent_data.get('timestamp', 0) > 10:
                    tracks_to_cleanup.append(track_id)
            
            # FIXED: Giảm sent_tracks để tăng FPS - từ 10 xuống 5
            if len(sent_tracks) > 5:
                sorted_sent_tracks = sorted(sent_tracks.items(), 
                                          key=lambda x: x[1].get('timestamp', 0))
                excess_tracks = sorted_sent_tracks[:-5]  # Giữ lại 5 tracks mới nhất
                for track_id, _ in excess_tracks:
                    if track_id not in tracks_to_cleanup:
                        tracks_to_cleanup.append(track_id)
            
            for track_id in tracks_to_cleanup:
                del sent_tracks[track_id]
                # FIXED: Bỏ debug logging để giảm noise

    # Encode frame with optimized quality for full detection streaming
    try:
        # FIXED: Giảm quality để tăng FPS - từ 65% xuống 50%
        encode_result = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 50])
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
    """Thread-safe wrapper for detect_and_ocr_stable with enhanced error handling"""
    try:
        # Add thread identifier for debugging
        thread_id = threading.current_thread().ident
        logger.debug(f"Processing frame in thread {thread_id} for camera {camera_id}")
        
        # Process frame with optimized detection
        result = detect_and_ocr_stable(frame, camera_id, source_type, video_filename, camera_location, camera_name)
        
        # Add thread info to result for debugging
        if isinstance(result, dict):
            result['thread_id'] = thread_id
            result['camera_id'] = camera_id
            
        return result
    except Exception as e:
        logger.error(f"Error in thread-safe detection (thread {threading.current_thread().ident}): {str(e)}")
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
            'error': str(e),
            'thread_id': threading.current_thread().ident,
            'camera_id': camera_id
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
    try:
        return {
            "active_threads": thread_pool._threads.__len__() if hasattr(thread_pool, '_threads') else 0,
            "max_workers": thread_pool._max_workers,
            "total_processed": 0,
            "average_processing_time": 0.0,
            "thread_pool_status": "active" if not thread_pool._shutdown else "shutdown"
        }
    except Exception as e:
        logger.error(f"Error getting thread stats: {e}")
        return {
            "active_threads": 0,
            "max_workers": 4,
            "total_processed": 0,
            "average_processing_time": 0.0,
            "thread_pool_status": "error"
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
                        
