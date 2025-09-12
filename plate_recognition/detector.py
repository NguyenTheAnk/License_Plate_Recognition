import cv2
import numpy as np
from fast_alpr import ALPR
import logging
import time
import os
import threading
import queue
import subprocess
import psutil
from concurrent.futures import ThreadPoolExecutor
try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
from statistics import mean
from cjm_byte_track.core import BYTETracker 
from collections import defaultdict
import requests
import re
import random
import hashlib

# Image enhancement functions for better OCR quality (from test2.py)
ENHANCEMENT_AVAILABLE = True
ENABLE_REALTIME_ENHANCEMENT = False  # Tắt enhancement để tăng tốc

def crop_and_enhance_plate(frame, bbox, enhancement_level="light"):
    """
    Crop chỉ vùng biển số thực tế và enhance chất lượng ảnh.
    
    Args:
        frame: Frame gốc
        bbox: Bounding box [x1, y1, x2, y2] 
        enhancement_level: "none", "light", "medium", "high"
    
    Returns:
        Enhanced crop image chỉ chứa biển số
    """
    try:
        if frame is None or bbox is None or len(bbox) < 4:
            return None
            
        x1, y1, x2, y2 = bbox[:4]
        
        # Crop chỉ vùng biển số, KHÔNG có padding
        crop = frame[y1:y2, x1:x2]
        
        if crop.size == 0:
            return None
            
        # Ensure BGR uint8
        if len(crop.shape) == 2:
            crop = cv2.cvtColor(crop, cv2.COLOR_GRAY2BGR)
        elif len(crop.shape) == 3 and crop.shape[2] == 4:
            crop = cv2.cvtColor(crop, cv2.COLOR_RGBA2BGR)
        if crop.dtype != np.uint8:
            crop = np.clip(crop, 0, 255).astype(np.uint8)

        h, w = crop.shape[:2]
        
        # Apply enhancement based on level
        if enhancement_level == "none":
            return crop
        elif enhancement_level == "light":
            # Minimal enhancement - chỉ resize nếu quá nhỏ
            if h < 30 or w < 80:
                scale = max(30/h, 80/w, 1.2)
                new_w, new_h = int(w * scale), int(h * scale)
                crop = cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
            # Minimal padding
            pad = 2
            crop = cv2.copyMakeBorder(crop, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=[255, 255, 255])
        elif enhancement_level == "medium":
            # Medium enhancement
            if h < 40 or w < 120:
                scale = max(40/h, 120/w, 1.5)
                new_w, new_h = int(w * scale), int(h * scale)
                crop = cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
            # Contrast enhancement
            gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            enhanced = cv2.equalizeHist(gray)
            crop = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)
            # Padding
            pad = 3
            crop = cv2.copyMakeBorder(crop, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=[255, 255, 255])
        elif enhancement_level == "high":
            # High enhancement - chỉ dùng khi cần thiết
            if h < 50 or w < 150:
                scale = max(50/h, 150/w, 2.0)
                new_w, new_h = int(w * scale), int(h * scale)
                crop = cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
            # Advanced enhancement
            try:
                crop = cv2.fastNlMeansDenoisingColored(crop, None, 3, 3, 7, 21)
            except:
                pass
            # CLAHE
            gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
            enhanced = clahe.apply(gray)
            crop = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)
            # Padding
            pad = 5
            crop = cv2.copyMakeBorder(crop, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=[255, 255, 255])
        
        return crop
    except Exception as e:
        logger.error(f"crop_and_enhance_plate error: {e}")
        return None

def enhance_plate_crop_highres(plate_img: np.ndarray) -> np.ndarray:
    """Aggressively enhance and upscale plate crop to high-res, OCR-friendly image.
    Pipeline: denoise -> CLAHE -> unsharp -> mild deblur -> upscale to min width 600 -> white padding.
    Returns BGR uint8 image.
    """
    try:
        if plate_img is None or plate_img.size == 0:
            return plate_img
        img = plate_img.copy()
        if len(img.shape) == 2:
            img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        elif len(img.shape) == 3 and img.shape[2] == 4:
            img = cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)
        if img.dtype != np.uint8:
            img = np.clip(img, 0, 255).astype(np.uint8)

        # Denoise while preserving edges
        try:
            img = cv2.fastNlMeansDenoisingColored(img, None, 5, 5, 7, 21)
        except Exception:
            pass

        # CLAHE on L channel
        try:
            lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
            l = clahe.apply(l)
            lab = cv2.merge([l, a, b])
            img = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
        except Exception:
            pass

        # Unsharp mask
        try:
            blur = cv2.GaussianBlur(img, (0, 0), 1.0)
            img = cv2.addWeighted(img, 1.6, blur, -0.6, 0)
        except Exception:
            pass

        # Mild deblur via bilateral
        try:
            img = cv2.bilateralFilter(img, 5, 75, 75)
        except Exception:
            pass

        # Upscale to minimum width (stronger)
        h, w = img.shape[:2]
        target_w = max(800, int(w * 3))
        scale = target_w / max(1, w)
        target_h = int(h * scale)
        if target_w > w:
            img = cv2.resize(img, (target_w, target_h), interpolation=cv2.INTER_CUBIC)

        # White padding
        pad = max(12, int(min(img.shape[0], img.shape[1]) * 0.04))
        img = cv2.copyMakeBorder(img, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=[255, 255, 255])

        return img
    except Exception as e:
        logger.debug(f"enhance_plate_crop_highres error: {e}")
        return plate_img

def _order_points_clockwise(pts):
    try:
        rect = np.zeros((4, 2), dtype="float32")
        s = pts.sum(axis=1)
        rect[0] = pts[np.argmin(s)]  # top-left
        rect[2] = pts[np.argmax(s)]  # bottom-right
        diff = np.diff(pts, axis=1)
        rect[1] = pts[np.argmin(diff)]  # top-right
        rect[3] = pts[np.argmax(diff)]  # bottom-left
        return rect
    except Exception:
        return pts.astype("float32")

def rectify_plate_geometry(img: np.ndarray) -> np.ndarray:
    """Deskew and rectify plate by detecting a 4-point contour and warping."""
    try:
        if img is None or img.size == 0:
            return img
        src = img.copy()
        gray = cv2.cvtColor(src, cv2.COLOR_BGR2GRAY) if len(src.shape) == 3 else src
        gray = cv2.bilateralFilter(gray, 5, 75, 75)
        edges = cv2.Canny(gray, 50, 150)
        edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8), iterations=1)
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        h, w = gray.shape[:2]
        best = None
        best_area = 0
        for cnt in contours:
            peri = cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
            if len(approx) == 4:
                area = cv2.contourArea(approx)
                if area > best_area and area > 0.1 * h * w:
                    best = approx.reshape(-1, 2)
                    best_area = area
        if best is None:
            return src
        rect = _order_points_clockwise(best)
        (tl, tr, br, bl) = rect
        widthA = np.linalg.norm(br - bl)
        widthB = np.linalg.norm(tr - tl)
        maxWidth = int(max(widthA, widthB))
        heightA = np.linalg.norm(tr - br)
        heightB = np.linalg.norm(tl - bl)
        maxHeight = int(max(heightA, heightB))
        if maxWidth < 20 or maxHeight < 10:
            return src
        dst = np.array([
            [0, 0],
            [maxWidth - 1, 0],
            [maxWidth - 1, maxHeight - 1],
            [0, maxHeight - 1]
        ], dtype="float32")
        M = cv2.getPerspectiveTransform(rect.astype("float32"), dst)
        warped = cv2.warpPerspective(src, M, (maxWidth, maxHeight))
        return warped
    except Exception:
        return img

def tighten_text_bbox(crop_img: np.ndarray) -> np.ndarray:
    """Thu nhỏ crop bám sát vùng ký tự bằng MSER hai cực (đen trên trắng và ngược lại)."""
    try:
        if crop_img is None or crop_img.size == 0:
            return crop_img
        img = crop_img.copy()
        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        else:
            gray = img
        h, w = gray.shape[:2]
        mser = cv2.MSER_create(_delta=5, _min_area=30, _max_area=max(200, h*w//2))
        regions = []
        try:
            regions, _ = mser.detectRegions(gray)
        except Exception:
            pass
        if not regions:
            return crop_img
        # Combine all regions
        mask = np.zeros(gray.shape, dtype=np.uint8)
        for region in regions:
            for point in region:
                if 0 <= point[1] < h and 0 <= point[0] < w:
                    mask[point[1], point[0]] = 255
        # Find bounding box
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return crop_img
        x, y, w_bbox, h_bbox = cv2.boundingRect(contours[0])
        # Add small padding
        pad = 5
        x = max(0, x - pad)
        y = max(0, y - pad)
        w_bbox = min(w - x, w_bbox + 2 * pad)
        h_bbox = min(h - y, h_bbox + 2 * pad)
        return img[y:y+h_bbox, x:x+w_bbox]
    except Exception:
        return crop_img

def evaluate_crop_quality(img: np.ndarray) -> dict:
    """Đánh giá chất lượng crop: độ nét, tỷ lệ vùng trắng bệt, entropy."""
    try:
        if img is None or img.size == 0:
            return {'sharpness': 0.0, 'sat_white': 1.0, 'entropy': 0.0}
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape)==3 else img
        # Sharpness via Laplacian variance
        sharp = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        # Saturated white ratio
        sat = float(np.mean(gray > 245))
        # Entropy approximation
        hist = cv2.calcHist([gray],[0],None,[256],[0,256]).ravel()
        p = hist / max(1.0, hist.sum())
        p = p[p>0]
        ent = float(-(p*np.log2(p)).sum())
        return {'sharpness': sharp, 'sat_white': sat, 'entropy': ent}
    except Exception:
        return {'sharpness': 0.0, 'sat_white': 1.0, 'entropy': 0.0}

def generate_ocr_variants(plate_img: np.ndarray) -> list:
    """Create enhanced OCR variants for better recognition"""
    variants = []
    try:
        if plate_img is None or plate_img.size == 0:
            return variants
            
        img = plate_img.copy()
        if len(img.shape) == 2:
            img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

        height, width = img.shape[:2]
        
        # Minimum size requirements for OCR
        target_width = max(400, width * 4)  # At least 4x upscale
        target_height = max(120, height * 4)
            
        logger.info(f"Generating OCR variants: {width}x{height} -> {target_width}x{target_height}")
        
        # 1. High-quality upscaled version with enhancement
        try:
            # Upscale first
            upscaled = cv2.resize(img, (target_width, target_height), interpolation=cv2.INTER_CUBIC)
            
            # Convert to LAB for better contrast enhancement
            lab = cv2.cvtColor(upscaled, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            
            # Apply CLAHE to L channel
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
            l = clahe.apply(l)
            
            # Merge back
            enhanced = cv2.merge([l, a, b])
            enhanced = cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)
            
            # Add white padding
            pad_size = 20
            padded = cv2.copyMakeBorder(enhanced, pad_size, pad_size, pad_size, pad_size, 
                                      cv2.BORDER_CONSTANT, value=[255, 255, 255])
            variants.append(padded)
            
        except Exception as e:
            logger.debug(f"Enhanced variant failed: {e}")
            # Fallback to simple upscale
            simple_upscale = cv2.resize(img, (target_width, target_height), interpolation=cv2.INTER_CUBIC)
            variants.append(simple_upscale)
        
        # 2. Binary threshold variants
        try:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            upscaled_gray = cv2.resize(gray, (target_width, target_height), interpolation=cv2.INTER_CUBIC)
            
            # Otsu threshold
            _, th_otsu = cv2.threshold(upscaled_gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            th_otsu_bgr = cv2.cvtColor(th_otsu, cv2.COLOR_GRAY2BGR)
            variants.append(th_otsu_bgr)
            
            # Inverted Otsu
            th_otsu_inv = cv2.cvtColor(255 - th_otsu, cv2.COLOR_GRAY2BGR)
            variants.append(th_otsu_inv)
            
        except Exception as e:
            logger.debug(f"Binary variants failed: {e}")
        
        return variants
    except Exception as e:
        logger.debug(f"generate_ocr_variants error: {e}")
        return variants

def select_best_plate_variant(plate_img: np.ndarray) -> np.ndarray:
    """Generate multiple enhanced variants and pick the highest-quality crop.
    Uses sharpness high, low saturated-white ratio, and entropy to rank.
    """
    try:
        if plate_img is None or plate_img.size == 0:
            return plate_img
        variants = []
        # Base
        base = enhance_plate_crop_highres(plate_img)
        variants.append(base)
        # Extra variants
        try:
            tight = tighten_text_bbox(base)
            variants.append(enhance_plate_crop_highres(tight))
        except Exception:
            pass
        # Rectified variant
        try:
            rect = rectify_plate_geometry(plate_img)
            variants.append(enhance_plate_crop_highres(rect))
        except Exception:
            pass
        try:
            for v in generate_ocr_variants(plate_img)[:3]:
                variants.append(enhance_plate_crop_highres(v))
        except Exception:
            pass
        # Score
        best_img = base
        best_score = -1e9
        for v in variants:
            try:
                q = evaluate_crop_quality(v)
                # Score: prioritize sharpness, penalize saturated white, reward entropy
                score = q['sharpness'] - 150.0 * q['sat_white'] + 3.0 * q['entropy']
                if score > best_score:
                    best_score = score
                    best_img = v
            except Exception:
                continue
        return best_img
    except Exception:
        return plate_img

def save_debug_crop(original_crop, enhanced_crop, filename_prefix):
    """Save debug crops to compare original vs enhanced quality"""
    try:
        debug_dir = 'debug_crops'
        os.makedirs(debug_dir, exist_ok=True)
        
        # Save original crop
        original_path = os.path.join(debug_dir, f"{filename_prefix}_original.jpg")
        cv2.imwrite(original_path, original_crop)
        
        # Save enhanced crop
        enhanced_path = os.path.join(debug_dir, f"{filename_prefix}_enhanced.jpg")
        cv2.imwrite(enhanced_path, enhanced_crop)
        
        logger.info(f"🔍 Debug crops saved: {original_path}, {enhanced_path}")
    except Exception as e:
        logger.warning(f"Failed to save debug crops: {e}")



def enable_realtime_enhancement(enable=True):
    """Enable or disable real-time enhancement for performance tuning"""
    global ENABLE_REALTIME_ENHANCEMENT
    ENABLE_REALTIME_ENHANCEMENT = enable
    status = "enabled" if enable else "disabled"
    logger.info(f"🔧 Real-time enhancement {status}")
    return ENABLE_REALTIME_ENHANCEMENT

def enable_performance_optimizations(enable=True):
    """Enable or disable performance optimizations"""
    global ENABLE_THREADING, ENABLE_CACHING, ENABLE_LIGHTWEIGHT_MODE
    ENABLE_THREADING = enable
    ENABLE_CACHING = enable
    ENABLE_LIGHTWEIGHT_MODE = enable
    logger.info(f"🚀 Performance optimizations {'enabled' if enable else 'disabled'}")
    return enable

def _cache_detection_result(frame_hash, result):
    """Cache detection result for performance"""
    if not ENABLE_CACHING:
        return
    
    try:
        with cache_lock:
            # Clean old cache entries
            if len(detection_cache) >= cache_size:
                # Remove oldest entries
                sorted_items = sorted(detection_cache.items(), key=lambda x: x[1][1])
                for key, _ in sorted_items[:cache_size // 2]:
                    del detection_cache[key]
            
            # Add new result
            detection_cache[frame_hash] = (result, time.time())
    except Exception as e:
        logger.error(f"Cache error: {e}")

def _get_cached_result(frame_hash):
    """Get cached detection result"""
    if not ENABLE_CACHING:
        return None
    
    try:
        with cache_lock:
            if frame_hash in detection_cache:
                cached_result = detection_cache[frame_hash]
                # Update cache timestamp
                detection_cache[frame_hash] = (cached_result[0], time.time())
                return cached_result[0]
    except Exception as e:
        logger.error(f"Cache retrieval error: {e}")
    
    return None


def is_redis_running():
    """Kiểm tra xem Redis có đang chạy không"""
    try:
        test_redis = redis.Redis(host='localhost', port=6379, decode_responses=True, socket_connect_timeout=0.5)
        test_redis.ping()
        return True
    except:
        return False

def start_redis_server():
    """Khởi động Redis server nếu chưa chạy"""
    try:
        # Kiểm tra xem Redis đã chạy chưa
        if is_redis_running():
            logger.info("Redis server is already running")
            return True
        
        # Khởi động Redis server
        logger.info("Starting Redis server...")
        redis_process = subprocess.Popen(
            ['redis-server'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0
        )
        
        # Đợi một chút để Redis khởi động
        time.sleep(1)
        
        # Kiểm tra xem Redis có chạy thành công không với retry
        for attempt in range(3):
            try:
                test_redis = redis.Redis(host='localhost', port=6379, decode_responses=True, socket_connect_timeout=1)
                test_redis.ping()
                logger.info("Redis server started successfully")
                return True
            except:
                if attempt < 2:  # Chưa phải lần thử cuối
                    time.sleep(0.5)  # Đợi thêm 0.5s
                else:
                    logger.warning("Redis server may not have started properly")
                    return False
            
    except Exception as e:
        logger.error(f"Failed to start Redis server: {e}")
        return False

# Cấu hình môi trường cho FastALPR GPU
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['ORT_LOGGING_LEVEL'] = '3'  # ERROR level only
os.environ['OMP_NUM_THREADS'] = '4'
os.environ['CUDA_VISIBLE_DEVICES'] = '0'  # Use first GPU
os.environ['TF_FORCE_GPU_ALLOW_GROWTH'] = 'true'  # Allow GPU memory growth

# Tắt cảnh báo GPU/CUDA
import warnings
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", message=".*TensorRT.*")
warnings.filterwarnings("ignore", message=".*CUDA.*")

# Import onnxruntime với cấu hình GPU tối ưu
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

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ĐỊNH NGHĨA VÙNG ROI - NỬA KHUNG HÌNH Ở GIỮA
# Sử dụng tỷ lệ phần trăm: nửa chiều rộng và nửa chiều cao, centered
DEFAULT_ROI_XMIN, DEFAULT_ROI_YMIN, DEFAULT_ROI_XMAX, DEFAULT_ROI_YMAX = 0.25, 0.25, 0.75, 0.75
# Save crops to shared directory accessible by Node.js server
CROPS_FOLDER = 'static/crops'
os.makedirs(CROPS_FOLDER, exist_ok=True)

# Global variables for tracking and database saving
tracked_objects = {}
frame_count = 0
duplicate_counter = 0
last_cleanup_time = 0
track_consistency = {}
ocr_attempts_per_track = {}
plate_history = {}

# Global background subtractor for motion detection
global_bg_subtractor = None
last_roi_frame = None

# Frame skipping variables - OPTIMIZED FOR 20 FPS
if GPU_INFO['cuda_available']:
    # GPU optimized for 20 FPS
    skip_frame_count = 0
    max_skip_frames = 1  # Process almost every frame for 20 FPS
    last_detection_time = 0
    detection_cooldown = 0.1  # Very fast detection on GPU
    last_motion_time = 0
    motion_cooldown = 0.05  # Very fast motion detection on GPU
    print("🎮 Using GPU-optimized settings for 20 FPS")
else:
    # CPU optimized for 20 FPS
    skip_frame_count = 0
    max_skip_frames = 2  # Process more frames for 20 FPS
    last_detection_time = 0
    detection_cooldown = 0.2  # Faster detection on CPU
    last_motion_time = 0
    motion_cooldown = 0.1  # Faster motion detection on CPU
    print("💻 Using CPU-optimized settings for 20 FPS")

# Anti-duplicate settings - GIẢM THRESHOLD ĐỂ LƯU DỮ LIỆU NHANH HƠN
consistency_threshold = 2  # Giảm xuống 2 để lưu nhanh hơn
max_ocr_attempts = 8       # Tăng số lần thử OCR
consistency_window = 10    # Giảm cửa sổ consistency

# Configuration - OPTIMIZED FOR VEHICLE AND LICENSE PLATE DETECTION
# ROI mở rộng để phát hiện sớm hơn
# ROI mở rộng để phát hiện sớm hơn - GIỮ NGUYÊN KÍCH THƯỚC
ROI_PERCENT_XMIN = 0.0    # Bắt đầu từ 0% chiều rộng (toàn bộ chiều rộng)
ROI_PERCENT_YMIN = 0.15   # Bắt đầu từ 15% chiều cao (mở rộng lên trên)
ROI_PERCENT_XMAX = 1.0    # Kết thúc ở 100% chiều rộng (toàn bộ chiều rộng)
ROI_PERCENT_YMAX = 0.85   # Kết thúc ở 85% chiều cao (mở rộng xuống dưới)

# Dynamic configuration optimized for 20 FPS - LOWERED THRESHOLDS FOR FASTER DISPLAY
if GPU_INFO['cuda_available']:
    # GPU-optimized settings for 20 FPS - LOWERED for faster display
    MIN_CONFIDENCE = 0.5      # Much lower threshold for immediate display
    MIN_OCR_CONFIDENCE = 0.6  # Much lower threshold for immediate display
    MIN_PLATE_LENGTH = 5      # Reduced minimum length
    MAX_PLATE_LENGTH = 12
    print("🎮 Using GPU-optimized settings for 20 FPS - FAST DISPLAY MODE")
else:
    # CPU-optimized settings for 20 FPS - LOWERED for faster display
    MIN_CONFIDENCE = 0.55     # Much lower threshold for immediate display
    MIN_OCR_CONFIDENCE = 0.65 # Much lower threshold for immediate display
    MIN_PLATE_LENGTH = 5      # Reduced minimum length
    MAX_PLATE_LENGTH = 12
    print("💻 Using CPU-optimized settings for 20 FPS - FAST DISPLAY MODE")

# Vehicle classes to track (COCO: car=2, motorbike=3, bus=5, truck=7)
VEHICLE_CLASSES = [2, 3, 5, 7]

# PERFORMANCE OPTIMIZATION - THREADING AND CACHING
# Thread pool for async processing
# OPTIMIZED: More workers for better performance
thread_pool = ThreadPoolExecutor(max_workers=16, thread_name_prefix="detector")

# Queues for async processing
detection_queue = queue.Queue(maxsize=10)
ocr_queue = queue.Queue(maxsize=20)
result_queue = queue.Queue(maxsize=30)

# Detection cache for performance
# OPTIMIZED: Larger cache for better performance
detection_cache = {}
cache_size = 2000  # Tăng cache size từ 100 lên 500
cache_lock = threading.Lock()

# Performance settings - OPTIMIZED FOR STABLE FPS
ENABLE_THREADING = True
ENABLE_CACHING = True   # Bật caching để tăng hiệu suất
ENABLE_LIGHTWEIGHT_MODE = True
ENABLE_FPS_THROTTLING = True  # Bật FPS throttling để ổn định
TARGET_FPS = 20  # Mục tiêu FPS ổn định

# Database throttling - OPTIMIZED FOR STABLE FPS
last_db_send_time = 0
db_send_interval = 0.05  # Giảm interval để responsive hơn
last_detection_time = 0
detection_cooldown = 0.05  # Giảm cooldown để responsive hơn
last_alpr_call_time = 0  # Cooldown cho FastALPR calls

# Khởi tạo Redis với auto-start
redis_available = False
if REDIS_AVAILABLE:
    # Kiểm tra Redis với timeout ngắn hơn
    if is_redis_running():
        try:
            r = redis.Redis(host='localhost', port=6379, decode_responses=True, socket_connect_timeout=1)
            r.ping()
            redis_available = True
            logger.info("Redis connection successful")
        except:
            redis_available = False
            logger.warning("Redis connection failed")
    else:
        logger.info("Redis not running, attempting to start Redis server...")
        # Thử khởi động Redis server
        if start_redis_server():
            try:
                r = redis.Redis(host='localhost', port=6379, decode_responses=True, socket_connect_timeout=2)
                r.ping()
                redis_available = True
                logger.info("Redis connection successful after auto-start")
            except:
                redis_available = False
                logger.warning("Failed to connect to Redis even after auto-start")
        else:
            redis_available = False
            logger.warning("Failed to start Redis server. Running without Redis support.")
else:
    logger.warning("Redis module not available. Running without Redis support.")

# Khởi tạo FastALPR với GPU support tối ưu
alpr = None
try:
    # Cấu hình GPU tối ưu
    os.environ['CUDA_VISIBLE_DEVICES'] = '0'  # Sử dụng GPU đầu tiên
    os.environ['TF_FORCE_GPU_ALLOW_GROWTH'] = 'true'  # Cho phép GPU memory growth
    
    # Khởi tạo ALPR với GPU support và tối ưu hóa
    alpr = ALPR(
        detector_model="yolo-v9-t-416-license-plate-end2end",
        ocr_model="cct-xs-v1-global-model"
    )
    
    logger.info("FastALPR initialized successfully")
    
    # Khởi tạo ByteTracker với tham số tối ưu cho hiển thị nhanh
    try:
        byte_tracker = BYTETracker(
            track_thresh=0.1,   # Rất thấp để track ngay lập tức
            track_buffer=15,    # Giảm buffer để track nhanh hơn
            match_thresh=0.5,   # Rất thấp để match dễ hơn
            frame_rate=30
        )
        logger.info("ByteTracker initialized successfully - FAST TRACKING MODE")
    except Exception as e:
        logger.error(f"Failed to initialize ByteTracker: {e}")
        raise
    
    logger.info(f"🚀 Performance optimizations enabled")
    logger.info(f"⚖️ Performance mode set to BALANCED")
    logger.info(f"🎮 GPU optimization level: {GPU_INFO['optimization_level']}")
    if GPU_INFO['cuda_available']:
        logger.info(f"💾 GPU Memory: {GPU_INFO['gpu_memory'] / 1024**3:.1f} GB")
    
    # Test với một frame đơn giản để đảm bảo ALPR hoạt động
    test_frame = np.zeros((100, 100, 3), dtype=np.uint8)
    test_results = alpr.predict(test_frame)
    logger.info(f"FastALPR test successful, detected {len(test_results)} objects")
except Exception as e:
    logger.error(f"Failed to load FastALPR model: {str(e)}")
    logger.warning("Running without FastALPR - detection will be disabled")
    alpr = None

# Khởi tạo ByteTrack với tham số tối ưu cho phát hiện sớm (luôn khởi tạo) - FAST MODE
tracker = BYTETracker(
    track_thresh=0.05, # Rất thấp để track ngay lập tức
    track_buffer=10,   # Giảm buffer để track nhanh hơn
    match_thresh=0.4,  # Rất thấp để match dễ hơn
    frame_rate=30
)

# Lưu lịch sử biển số và ánh xạ track_id
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
FRAMES_FOLDER = 'static/crops'
os.makedirs(FRAMES_FOLDER, exist_ok=True)

# REMOVED: Vietnamese plate validation function - using original logic

# Gửi dữ liệu biển số tới server Node.js - ORIGINAL VERSION
def send_plate_to_server(track_id, plate_data, frame_path=None, camera_id=None, source_type="camera", video_filename=None, camera_location=None):
    try:
        current_time = time.time()
        plate_text = plate_data['plate']
        
        # Kiểm tra nếu biển số đã được gửi trong vòng 5 phút
        if plate_text in sent_plates:
            last_sent_time = sent_plates[plate_text]
            if current_time - last_sent_time < plate_cooldown:
                logger.info(f"⏭️ Biển số {plate_text} đã được gửi gần đây, bỏ qua")
                return
        
        # Chuẩn bị data theo format của test files (đã hoạt động)
        # Tạo UUID duy nhất ngắn gọn (tối đa 36 ký tự)
        unique_string = f"{camera_id}_{track_id}_{int(current_time * 1000)}_{random.randint(1000, 9999)}"
        # Calculate different confidence scores
        base_confidence = plate_data['confidence']
        
        # OCR confidence: based on text quality and validation
        ocr_confidence = base_confidence
        if plate_text and len(plate_text) >= 6:  # Minimum length for valid plate
            ocr_confidence = min(0.99, base_confidence + 0.1)  # Slightly higher for good text
        
        # Detection confidence: based on bbox quality and size
        detection_confidence = base_confidence
        if 'bbox' in plate_data and len(plate_data['bbox']) >= 4:
            bbox = plate_data['bbox']
            bbox_area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
            if bbox_area > 1000:  # Large enough bbox
                detection_confidence = min(0.99, base_confidence + 0.05)
            elif bbox_area < 500:  # Small bbox
                detection_confidence = max(0.1, base_confidence - 0.1)
        
        # Overall confidence: average of both
        overall_confidence = (ocr_confidence + detection_confidence) / 2
        
        # Check BlackList and WhiteList matches - DISABLED for now
        # In production, this should query the actual database
        is_whitelist_match = False
        is_blacklist_match = False
        
        # TODO: Implement proper database query for BlackList/WhiteList
        # For now, we'll set both to False to avoid false positives
        # This should be replaced with actual database queries:
        # - Query whitelist table for exact plate number match
        # - Query blacklist table for exact plate number match
        # - Set is_whitelist_match and is_blacklist_match accordingly
        
        # Tạo hash ngắn từ unique_string
        unique_hash = hashlib.md5(unique_string.encode()).hexdigest()[:8]
        data = {
            "detection_uuid": f"cam_{camera_id}_{unique_hash}",
            "plate_number": plate_data['plate'],
            "raw_plate_text": plate_data['plate'],
            "camera_id": camera_id or 1,
            "location_id": 1,
            "detected_at": current_time,  # Send as Unix timestamp in seconds
            "confidence_score": overall_confidence,
            "ocr_confidence": ocr_confidence,
            "detection_confidence": detection_confidence,
            "bbox": plate_data['bbox'],
            "frame_path": frame_path or "",
            "crop_image_path": frame_path or "",  # Add crop image path
            "detected_vehicle_type": "other",
            "source_type": source_type,
            "video_filename": video_filename,
            "camera_location": camera_location,
            "camera_name": f"Camera_{camera_id}" if camera_id else "Camera_1",
            "is_whitelist_match": is_whitelist_match,
            "is_blacklist_match": is_blacklist_match,
            "alert_triggered": is_blacklist_match  # Trigger alert for blacklist matches
        }
        
        # Gửi trực tiếp tới Node.js API (như test files)
        url = "http://localhost:5000/api/plate-recognitions/detected-plates"
        
        logger.info(f"🔄 Sending plate data to Node.js API: {plate_text}")
        logger.info(f"🌐 URL: {url}")
        
        # Kiểm tra Node.js server có chạy không
        try:
            test_response = requests.get("http://localhost:5000/health", timeout=2)
            if test_response.status_code != 200:
                logger.warning("⚠️ Node.js server may not be running properly")
        except:
            logger.error("❌ Node.js server is not running! Please start the Node.js server first.")
            logger.error("💡 Run: cd server && npm start")
            return False
        
        try:
            response = requests.post(url, json=data, timeout=5, headers={'Content-Type': 'application/json'})
            
            logger.info(f"📡 Node.js API response: {response.status_code}")
            if response.status_code not in [200, 201]:
                logger.error(f"📄 Response error: {response.text}")
            
            if response.status_code in [200, 201]:
                logger.info(f"✅ Biển số {plate_text} đã lưu vào database thành công!")
                # Cập nhật thời gian gửi cuối cùng
                sent_plates[plate_text] = current_time
                return True
            else:
                logger.error(f"❌ Lỗi lưu biển số vào database: {response.status_code}")
                return False
        except requests.exceptions.Timeout:
            logger.error(f"⏰ Timeout khi gửi biển số {plate_text} tới Node.js API")
            return False
        except requests.exceptions.RequestException as e:
            logger.error(f"🌐 Lỗi kết nối tới Node.js API: {e}")
            return False
            
    except requests.exceptions.ConnectionError as e:
        logger.error(f"❌ Không thể kết nối tới Node.js server: {e}")
        return False
    except requests.exceptions.Timeout as e:
        logger.error(f"❌ Timeout khi gửi tới Node.js server: {e}")
        return False
    except Exception as e:
        logger.error(f"❌ Lỗi khi gửi biển số tới server: {str(e)}")
        return False

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

def should_skip_frame(frame, roi):
    """Kiểm tra xem có nên skip frame này không - Dựa trên chuyển động trong ROI"""
    global skip_frame_count, last_detection_time, detection_cooldown, last_motion_time, motion_cooldown
    
    current_time = time.time()
    
    # Nếu có detection gần đây, không skip
    if current_time - last_detection_time < detection_cooldown:
        skip_frame_count = 0
        return False
    
    # Kiểm tra chuyển động trong ROI trước khi quyết định skip
    has_motion = has_motion_in_roi(frame, roi)
    
    if has_motion:
        # Có chuyển động, reset skip counter và xử lý frame
        skip_frame_count = 0
        last_motion_time = current_time
        logger.debug(f"🔄 Motion detected in ROI - processing frame")
        return False
    
    # Nếu vừa có chuyển động gần đây, vẫn xử lý frame để phát hiện phương tiện mới
    if current_time - last_motion_time < motion_cooldown:
        skip_frame_count = 0
        logger.debug(f"🔄 Recent motion - processing frame to detect new vehicles")
        return False
    
    # Không có chuyển động, có thể skip
    # Nhưng vẫn phải xử lý định kỳ để phát hiện phương tiện mới
    if skip_frame_count >= max_skip_frames:
        # Đã skip quá nhiều frame, phải xử lý để phát hiện phương tiện mới
        skip_frame_count = 0
        logger.debug(f"🔄 Max skip reached - processing frame to detect new vehicles")
        return False
    
    # Skip frame
    skip_frame_count += 1
    logger.debug(f"⏭️ Skipping frame - no motion in ROI (skip: {skip_frame_count}/{max_skip_frames})")
    return True

def has_motion_in_roi(frame, roi):
    """Kiểm tra xem có chuyển động trong ROI không - Cải thiện độ nhạy"""
    global global_bg_subtractor
    
    try:
        roi_xmin, roi_ymin, roi_xmax, roi_ymax = roi
        roi_frame = frame[roi_ymin:roi_ymax, roi_xmin:roi_xmax]
        
        if roi_frame.size == 0:
            return True  # Nếu ROI rỗng, xử lý frame để an toàn
        
        # Chuyển sang grayscale
        gray = cv2.cvtColor(roi_frame, cv2.COLOR_BGR2GRAY)
        
        # Sử dụng background subtraction toàn cục để phát hiện chuyển động
        if global_bg_subtractor is None:
            global_bg_subtractor = cv2.createBackgroundSubtractorMOG2(
                history=300, varThreshold=16, detectShadows=True
            )
        
        # Áp dụng background subtraction
        fg_mask = global_bg_subtractor.apply(gray)
        
        # Tính toán gradient để phát hiện chuyển động
        grad_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
        grad_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        
        # Tính magnitude của gradient
        magnitude = np.sqrt(grad_x**2 + grad_y**2)
        
        # Kiểm tra cả background subtraction và gradient
        fg_pixels = np.sum(fg_mask > 0)
        gradient_mean = np.mean(magnitude)
        
        # Điều kiện phát hiện chuyển động (tối ưu cho 20 FPS)
        motion_threshold_gradient = 10  # Giảm xuống 10 để nhạy hơn
        motion_threshold_fg = roi_frame.shape[0] * roi_frame.shape[1] * 0.002  # 0.2% pixels
        
        has_motion = (gradient_mean > motion_threshold_gradient) or (fg_pixels > motion_threshold_fg)
        
        if has_motion:
            logger.debug(f"Motion detected: gradient={gradient_mean:.2f}, fg_pixels={fg_pixels}")
        
        return has_motion
    except Exception as e:
        logger.debug(f"Error checking motion: {e}")
        return True  # Nếu lỗi, xử lý frame để an toàn

def is_bbox_in_roi(bbox, roi):
    """Kiểm tra xem bounding box có giao với vùng ROI hay không."""
    bbox_x1, bbox_y1, bbox_x2, bbox_y2 = bbox
    roi_x1, roi_y1, roi_x2, roi_y2 = roi
    return not (bbox_x2 < roi_x1 or bbox_x1 > roi_x2 or
                bbox_y2 < roi_y1 or bbox_y1 > roi_y2)

def calculate_roi_coordinates(width, height):
    """Tính toán ROI coordinates dựa trên kích thước frame - TOÀN CHIỀU RỘNG KHUNG HÌNH"""
    try:
        # ROI toàn chiều rộng khung hình, chiều cao giữa - GIỮ NGUYÊN
        roi_xmin = max(0, int(width * ROI_PERCENT_XMIN))
        roi_ymin = max(0, int(height * ROI_PERCENT_YMIN))
        roi_xmax = min(width-1, int(width * ROI_PERCENT_XMAX))
        roi_ymax = min(height-1, int(height * ROI_PERCENT_YMAX))
        
        # Đảm bảo ROI hợp lệ và có kích thước tối thiểu
        min_width = width  # Toàn bộ chiều rộng
        min_height = min(height // 2, 150)  # Tối thiểu 1/2 height hoặc 150px
        
        # Đảm bảo chiều rộng toàn khung hình
        roi_xmin = 0
        roi_xmax = width - 1
        
        if roi_ymax - roi_ymin < min_height:
            center_y = height // 2
            roi_ymin = max(0, center_y - min_height // 2)
            roi_ymax = min(height - 1, center_y + min_height // 2)
            
        logger.debug(f"ROI calculated: ({roi_xmin},{roi_ymin})-({roi_xmax},{roi_ymax}) from frame {width}x{height}")
        return roi_xmin, roi_ymin, roi_xmax, roi_ymax
        
    except Exception as e:
        logger.error(f"Error calculating ROI: {e}")
        # Fallback ROI - toàn chiều rộng, chiều cao giữa
        roi_height = height // 2
        center_y = height // 2
        return (0, center_y - roi_height // 2, width - 1, center_y + roi_height // 2)

def is_in_roi(centroid, width, height):
    x, y = centroid
    roi_xmin, roi_ymin, roi_xmax, roi_ymax = calculate_roi_coordinates(width, height)
    return roi_xmin <= x <= roi_xmax and roi_ymin <= y <= roi_ymax

def fix_vietnamese_ocr_errors(text):
    """Fix common OCR errors for Vietnamese license plates - CẢI THIỆN NHẬN DIỆN DẤU CHẤM"""
    if not text:
        return text
    
    # Common OCR errors for Vietnamese plates - THÊM XỬ LÝ DẤU CHẤM
    replacements = {
        # Số và chữ cái thường bị nhầm
        'O': '0', 'I': '1', 'S': '5', 'G': '6', 'B': '8', 'Z': '2',
        'L': '1', 'T': '7', 'J': '1', 'Q': '0', 'U': '0', 'V': 'U',
        'W': 'VV', 'X': 'XX', 'Y': 'Y', 'K': 'K', 'M': 'M', 'N': 'N',
        'P': 'P', 'R': 'R', 'A': 'A', 'C': 'C', 'D': 'D', 'E': 'E',
        'F': 'F', 'H': 'H',
        
        # Xử lý dấu chấm và ký tự đặc biệt
        ',': '.', ';': '.', ':': '.', '`': '.', "'": '.', '"': '.',
        '°': '.', '•': '.', '·': '.', '∙': '.', '⋅': '.',
        
        # Xử lý dấu gạch ngang
        '_': '-', '—': '-', '–': '-', '−': '-', '‑': '-',
        
        # Loại bỏ khoảng trắng thừa
        '  ': ' ', '   ': ' ',
    }
    
    # Áp dụng replacements
    for old, new in replacements.items():
        text = text.replace(old, new)
    
    # Chuẩn hóa dấu chấm - đảm bảo có đúng định dạng
    # Xử lý trường hợp thiếu dấu chấm hoặc sai vị trí
    text = re.sub(r'(\d{2,4})\s*[.,;:]\s*(\d{2})$', r'\1.\2', text)
    
    # Xử lý trường hợp có nhiều dấu chấm
    text = re.sub(r'\.{2,}', '.', text)
    
    # Loại bỏ dấu chấm ở đầu hoặc cuối nếu không đúng định dạng
    text = re.sub(r'^\.+|\.+$', '', text)
    
    return text.strip()

def process_plate_text(text):
    """Process Vietnamese plate text with ENHANCED dot recognition and STRICT validation"""
    if not text or not isinstance(text, str):
        return None
    
    try:
        # Basic cleaning
        original = text
        text = re.sub(r'[^A-Z0-9\-\.\s]', '', text.upper().strip())
        
        if len(text) < MIN_PLATE_LENGTH:
            return None
        
        # Fix common OCR errors - ENHANCED DOT PROCESSING
        text = fix_vietnamese_ocr_errors(text)
        
        # ENHANCED Vietnamese plate patterns - CHẤP NHẬN FORMAT CHÍNH XÁC VÀ CÓ DẤU CHẤM
        patterns = [
            # XE MÁY: 7 ký tự (không có dấu chấm)
            r'^\d{2}[A-Z]\d-\d{3}$',                # 30A1-234 (xe máy 7 ký tự)
            
            # XE Ô TÔ: 8 ký tự (có dấu chấm)
            r'^\d{2}[A-Z]-\d{3}\.\d{2}$',          # 88A-410.11 (xe ô tô 8 ký tự)
            
            # XE MÁY: 9 ký tự (có dấu chấm)
            r'^\d{2}[A-Z]\d-\d{3}\.\d{2}$',        # 30A1-123.45 (xe máy 9 ký tự)
            
            # XE Ô TÔ: 10 ký tự (có dấu chấm)
            r'^\d{2}[A-Z]-\d{5}\.\d{2}$',          # 30A-12345.67 (xe ô tô 10 ký tự)
            
            # XE MÁY: 11 ký tự (có dấu chấm)
            r'^\d{2}[A-Z]\d-\d{5}\.\d{2}$',        # 30A1-12345.67 (xe máy 11 ký tự)
            
            # Các format khác
            r'^\d{2}[A-Z]-\d{2,4}\.\d{2}$',        # 30A-123.45 (xe máy format cũ)
            r'^\d{2}[A-Z]{2}-\d{2,4}\.\d{2}$',     # 30AB-123.45 (xe máy)
        ]
        
        for pattern in patterns:
            if re.match(pattern, text):
                logger.info(f"✅ ENHANCED Pattern match: '{original}' -> '{text}'")
                return text
        
        # Nếu không match pattern chính xác, thử format lại
        # Loại bỏ khoảng trắng và kiểm tra lại
        clean_text = re.sub(r'\s+', '', text)
        
        # Thử thêm dấu gạch ngang và dấu chấm dựa trên độ dài chính xác
        if re.match(r'^\d{2}[A-Z]\d{2,6}$', clean_text):
            text_len = len(clean_text)
            
            # XE MÁY: 7 ký tự → 30A1-234
            if text_len == 7:
                prefix = clean_text[:4]  # 30A1
                suffix = clean_text[4:]  # 234
                formatted = f"{prefix}-{suffix}"  # 30A1-234
                
                # Kiểm tra với patterns
                for valid_pattern in patterns:
                    if re.match(valid_pattern, formatted):
                        logger.info(f"✅ XE MÁY (7 ký tự): '{original}' -> '{formatted}'")
                        return formatted
            
            # XE Ô TÔ: 8 ký tự → 88A-410.11
            elif text_len == 8:
                prefix = clean_text[:3]  # 88A
                suffix = clean_text[3:]  # 41011
                
                # Tách 2 số cuối làm phần sau dấu chấm
                if len(suffix) == 5:  # Đảm bảo có đúng 5 số sau prefix
                    main_part = suffix[:-2]  # 410
                    dot_part = suffix[-2:]   # 11
                    formatted = f"{prefix}-{main_part}.{dot_part}"  # 88A-410.11
                    
                    # Kiểm tra với patterns
                    for valid_pattern in patterns:
                        if re.match(valid_pattern, formatted):
                            logger.info(f"✅ XE Ô TÔ (8 ký tự): '{original}' -> '{formatted}'")
                            return formatted
            
            # XE MÁY: 9 ký tự → 30A1-123.45
            elif text_len == 9:
                prefix = clean_text[:4]  # 30A1
                suffix = clean_text[4:]  # 12345
                
                # Tách 2 số cuối làm phần sau dấu chấm
                if len(suffix) == 5:  # Đảm bảo có đúng 5 số sau prefix
                    main_part = suffix[:-2]  # 123
                    dot_part = suffix[-2:]   # 45
                    formatted = f"{prefix}-{main_part}.{dot_part}"  # 30A1-123.45
                    
                    # Kiểm tra với patterns
                    for valid_pattern in patterns:
                        if re.match(valid_pattern, formatted):
                            logger.info(f"✅ XE MÁY (9 ký tự): '{original}' -> '{formatted}'")
                            return formatted
            
            # XE Ô TÔ: 10 ký tự → 30A-123.45
            elif text_len == 10:
                prefix = clean_text[:3]  # 30A
                suffix = clean_text[3:]  # 12345
                
                # Tách 2 số cuối làm phần sau dấu chấm
                if len(suffix) == 7:  # Đảm bảo có đúng 7 số sau prefix
                    main_part = suffix[:-2]  # 123
                    dot_part = suffix[-2:]   # 45
                    formatted = f"{prefix}-{main_part}.{dot_part}"  # 30A-123.45
                    
                    # Kiểm tra với patterns
                    for valid_pattern in patterns:
                        if re.match(valid_pattern, formatted):
                            logger.info(f"✅ XE Ô TÔ (10 ký tự): '{original}' -> '{formatted}'")
                            return formatted
            
            # XE MÁY: 11 ký tự → 30A1-123.45
            elif text_len == 11:
                prefix = clean_text[:4]  # 30A1
                suffix = clean_text[4:]  # 12345
                
                # Tách 2 số cuối làm phần sau dấu chấm
                if len(suffix) == 7:  # Đảm bảo có đúng 7 số sau prefix
                    main_part = suffix[:-2]  # 123
                    dot_part = suffix[-2:]   # 45
                    formatted = f"{prefix}-{main_part}.{dot_part}"  # 30A1-123.45
                    
                    # Kiểm tra với patterns
                    for valid_pattern in patterns:
                        if re.match(valid_pattern, formatted):
                            logger.info(f"✅ XE MÁY (11 ký tự): '{original}' -> '{formatted}'")
                            return formatted
            
            # Các trường hợp khác: chỉ thêm dấu gạch ngang
            else:
                if len(clean_text) >= 6:
                    formatted = re.sub(r'^(\d{2}[A-Z])(\d{2,6})$', r'\1-\2', clean_text)
                    if re.match(r'^\d{2}[A-Z]-\d{2,6}$', formatted):
                        logger.info(f"✅ Auto-formatted with dash only: '{original}' -> '{formatted}'")
                        return formatted
        
        # ENHANCED: Thử thêm dấu chấm nếu thiếu (cho xe máy/xe tải) - CHỈ KHI ĐÚNG ĐỘ DÀI
        # Kiểm tra nếu có pattern xe máy/xe tải nhưng thiếu dấu chấm
        dot_patterns = [
            (r'^(\d{2}[A-Z]-\d{2,4})(\d{2})$', r'\1.\2'),      # 30A-12345 -> 30A-123.45
            (r'^(\d{2}[A-Z]\d-\d{2,4})(\d{2})$', r'\1.\2'),    # 30A1-12345 -> 30A1-123.45
            (r'^(\d{2}[A-Z]{2}-\d{2,4})(\d{2})$', r'\1.\2'),   # 30AB-12345 -> 30AB-123.45
        ]
        
        for pattern, replacement in dot_patterns:
            if re.match(pattern, clean_text):
                # CHỈ format khi kết quả có đúng 10 ký tự (không tính dấu gạch ngang và chấm)
                formatted = re.sub(pattern, replacement, clean_text)
                # Kiểm tra xem kết quả có hợp lệ không
                for valid_pattern in patterns:
                    if re.match(valid_pattern, formatted):
                        logger.info(f"✅ Auto-formatted with dot: '{original}' -> '{formatted}'")
                        return formatted
        
        # ENHANCED: Thử sửa dấu chấm sai vị trí hoặc thêm dấu chấm cho format đúng
        # Tìm các số và thử đặt dấu chấm ở vị trí đúng
        if '-' in clean_text:
            parts = clean_text.split('-')
            if len(parts) == 2:
                prefix = parts[0]  # 30A hoặc 30A1
                suffix = parts[1]  # 12345
                
                # Kiểm tra prefix có đúng format không và format dựa trên độ dài
                if re.match(r'^\d{2}[A-Z]\d?$', prefix):
                    total_len = len(prefix) + len(suffix)
                    
                    # XE MÁY: 7 ký tự → 30A1-234
                    if total_len == 7:
                        formatted = f"{prefix}-{suffix}"
                    
                    # XE Ô TÔ: 8 ký tự → 88A-410.11
                    elif total_len == 8:
                        # Nếu suffix có ≥3 chữ số, thử tách 2 số cuối làm phần sau dấu chấm
                        if re.match(r'^\d{3,}$', suffix) and len(suffix) >= 3:
                            main_part = suffix[:-2]
                            dot_part = suffix[-2:]
                            formatted = f"{prefix}-{main_part}.{dot_part}"
                    
                    # XE MÁY: 9 ký tự → 30A1-123.45
                    elif total_len == 9:
                        # Nếu suffix có ≥3 chữ số, thử tách 2 số cuối làm phần sau dấu chấm
                        if re.match(r'^\d{3,}$', suffix) and len(suffix) >= 3:
                            main_part = suffix[:-2]
                            dot_part = suffix[-2:]
                            formatted = f"{prefix}-{main_part}.{dot_part}"
                    
                    # XE Ô TÔ: 10 ký tự → 30A-123.45
                    elif total_len == 10:
                        # Nếu suffix có ≥4 chữ số, thử tách 2 số cuối làm phần sau dấu chấm
                        if re.match(r'^\d{4,}$', suffix) and len(suffix) >= 4:
                            main_part = suffix[:-2]
                            dot_part = suffix[-2:]
                            formatted = f"{prefix}-{main_part}.{dot_part}"
                    
                    # XE MÁY: 11 ký tự → 30A1-123.45
                    elif total_len == 11:
                        # Nếu suffix có ≥4 chữ số, thử tách 2 số cuối làm phần sau dấu chấm
                        if re.match(r'^\d{4,}$', suffix) and len(suffix) >= 4:
                            main_part = suffix[:-2]
                            dot_part = suffix[-2:]
                            formatted = f"{prefix}-{main_part}.{dot_part}"
                    
                    # Kiểm tra với patterns cho tất cả các trường hợp
                    if 'formatted' in locals():
                        for valid_pattern in patterns:
                            if re.match(valid_pattern, formatted):
                                logger.info(f"✅ Fixed format: '{original}' -> '{formatted}'")
                                return formatted
                    
                    # Nếu suffix có 3 chữ số, thử thêm dấu chấm ở cuối
                    elif re.match(r'^\d{3}$', suffix):
                        formatted = f"{prefix}-{suffix}.00"
                        
                        # Kiểm tra với patterns
                        for valid_pattern in patterns:
                            if re.match(valid_pattern, formatted):
                                logger.info(f"✅ Added dot for 3-digit suffix: '{original}' -> '{formatted}'")
                                return formatted
        
        # FINAL FALLBACK: Thử format lại từ đầu với dấu chấm
        # Nếu vẫn chưa có dấu chấm, thử thêm vào cuối
        if '-' in clean_text and '.' not in clean_text:
            parts = clean_text.split('-')
            if len(parts) == 2:
                prefix = parts[0]
                suffix = parts[1]
                
                # Nếu suffix là số và có ít nhất 3 chữ số
                if re.match(r'^\d{3,}$', suffix):
                    # Tách 2 số cuối làm phần sau dấu chấm
                    if len(suffix) >= 4:
                        main_part = suffix[:-2]
                        dot_part = suffix[-2:]
                        formatted = f"{prefix}-{main_part}.{dot_part}"
                        
                        # Kiểm tra với patterns
                        for valid_pattern in patterns:
                            if re.match(valid_pattern, formatted):
                                logger.info(f"✅ FINAL FALLBACK with dot: '{original}' -> '{formatted}'")
                                return formatted
                    # Nếu chỉ có 3 chữ số, thêm .00
                    elif len(suffix) == 3:
                        formatted = f"{prefix}-{suffix}.00"
                        
                        # Kiểm tra với patterns
                        for valid_pattern in patterns:
                            if re.match(valid_pattern, formatted):
                                logger.info(f"✅ FINAL FALLBACK 3-digit: '{original}' -> '{formatted}'")
                                return formatted
        
        logger.debug(f"❌ No valid pattern match for: '{original}' -> '{text}'")
        return None
        
    except Exception as e:
        logger.error(f"❌ Error processing plate text: {e}")
        return None

def validate_ocr_result_strictly(plate_text, confidence, track_id, ocr_confidence=None):
    """STRICT validation for OCR results - YÊU CẦU CAO HƠN"""
    if not plate_text or not isinstance(plate_text, str):
        return False, "No text"
    
    clean_text = plate_text.upper().strip()
    logger.info(f"🔍 STRICT Validating: '{clean_text}' (det_conf: {confidence:.3f}, ocr_conf: {ocr_confidence:.3f if ocr_confidence else 'N/A'})")
    
    # Length check - STRICT
    if len(clean_text) < MIN_PLATE_LENGTH:
        return False, f"Too short: {len(clean_text)} < {MIN_PLATE_LENGTH}"
    
    if len(clean_text) > MAX_PLATE_LENGTH:
        return False, f"Too long: {len(clean_text)} > {MAX_PLATE_LENGTH}"
    
    # Detection confidence check - STRICT
    if confidence < MIN_CONFIDENCE:
        return False, f"Detection confidence too low: {confidence:.3f} < {MIN_CONFIDENCE}"
    
    # OCR confidence check - STRICT (nếu có)
    if ocr_confidence is not None and ocr_confidence < MIN_OCR_CONFIDENCE:
        return False, f"OCR confidence too low: {ocr_confidence:.3f} < {MIN_OCR_CONFIDENCE}"
    
    # Must contain both letters and numbers
    has_letters = any(c.isalpha() for c in clean_text)
    has_numbers = any(c.isdigit() for c in clean_text)
    
    if not has_letters:
        return False, "Must contain letters"
    
    if not has_numbers:
        return False, "Must contain numbers"
    
    # Must have proper Vietnamese plate structure
    if not re.match(r'^\d{2}[A-Z]', clean_text):
        return False, "Must start with 2 digits followed by letter"
    
    # ENHANCED: Kiểm tra format có dấu chấm hợp lệ
    if '.' in clean_text:
        # Nếu có dấu chấm, phải đúng format xe máy/xe tải
        dot_patterns = [
            r'^\d{2}[A-Z]-\d{2,4}\.\d{2}$',
            r'^\d{2}[A-Z]\d-\d{2,4}\.\d{2}$',
            r'^\d{2}[A-Z]{2}-\d{2,4}\.\d{2}$',
        ]
        
        has_valid_dot_format = any(re.match(pattern, clean_text) for pattern in dot_patterns)
        if not has_valid_dot_format:
            return False, "Invalid dot format for motorcycle/truck plate"
    
    logger.info(f"✅ STRICT VALIDATION PASSED: '{clean_text}' (conf: {confidence:.3f})")
    return True, "Strict validation passed"

def should_save_plate(plate_text, confidence, track_id=None, ocr_confidence=None):
    """Enhanced save logic with STRICT consistency tracking"""
    global duplicate_counter, plate_history, track_consistency, ocr_attempts_per_track
    
    if not plate_text or not isinstance(plate_text, str):
        return False
    
    clean_text = plate_text.upper().strip()
    
    # STRICT validation - chỉ chấp nhận format chính xác
    is_valid, reason = validate_ocr_result_strictly(plate_text, confidence, 0, ocr_confidence)
    
    if not is_valid:
        logger.info(f"❌ Not saving '{clean_text}': {reason}")
        return False
    
    # THÊM KIỂM TRA FORMAT CHÍNH XÁC
    processed_text = process_plate_text(plate_text)
    if not processed_text:
        logger.info(f"❌ Not saving '{clean_text}': Invalid format")
        return False
    
    # Consistency tracking
    if track_id is not None:
        if track_id not in track_consistency:
            track_consistency[track_id] = {
                'results': [],
                'best_result': None,
                'best_confidence': 0.0,
                'consistent_count': 0,
                'last_result': None
            }
        
        consistency_data = track_consistency[track_id]
        
        # Add current result to history
        consistency_data['results'].append({
            'text': clean_text,
            'confidence': confidence,
            'timestamp': time.time()
        })
        
        # Keep only recent results
        if len(consistency_data['results']) > consistency_window:
            consistency_data['results'] = consistency_data['results'][-consistency_window:]
        
        # Check for consistency
        if len(consistency_data['results']) >= consistency_threshold:
            # Count how many times the same text appears
            text_counts = {}
            for result in consistency_data['results']:
                text = result['text']
                text_counts[text] = text_counts.get(text, 0) + 1
            
            # Find most common text
            most_common_text = max(text_counts.items(), key=lambda x: x[1])
            most_common_count = most_common_text[1]
            
            if most_common_count >= consistency_threshold:
                # We have consistency!
                consistent_text = most_common_text[0]
                consistent_confidence = max([r['confidence'] for r in consistency_data['results'] if r['text'] == consistent_text])
                
                consistency_data['consistent_count'] = most_common_count
                consistency_data['last_result'] = consistent_text
                
                # Update best result if this is better
                if consistent_confidence > consistency_data['best_confidence']:
                    consistency_data['best_result'] = consistent_text
                    consistency_data['best_confidence'] = consistent_confidence
                    logger.info(f"🎯 CONSISTENT RESULT for track {track_id}: '{consistent_text}' (conf: {consistent_confidence:.3f}, count: {most_common_count})")
                    return True
                else:
                    logger.info(f"🔄 Consistent but not better: '{consistent_text}'")
                    return True
            else:
                logger.debug(f"📊 No consistency yet for track {track_id}: {text_counts}")
                return False
        else:
            logger.debug(f"📈 Building consistency for track {track_id}: {len(consistency_data['results'])}/{consistency_threshold}")
            return False
    
    # Fallback duplicate check
    if clean_text in plate_history:
        existing = plate_history[clean_text]
        existing_conf = existing.get('confidence', 0.0)
        
        # Update if significantly better
        if confidence > existing_conf * 1.2:  # Only 20% better needed
            logger.info(f"🔄 UPDATE: '{clean_text}': {existing_conf:.3f} -> {confidence:.3f}")
            plate_history[clean_text].update({
                'confidence': confidence,
                'timestamp': time.time(),
                'updated_count': existing.get('updated_count', 0) + 1
            })
            return True
        else:
            duplicate_counter += 1
            return False
    else:
        # New plate - always save if valid
        plate_history[clean_text] = {
            'confidence': confidence,
            'timestamp': time.time(),
            'updated_count': 1,
            'saved_once': True
        }
        logger.info(f"✅ NEW PLATE SAVED: '{clean_text}' (conf: {confidence:.3f})")
        return True

def cleanup_tracked_objects():
    """Enhanced cleanup with consistency tracking"""
    global tracked_objects, plate_history, last_cleanup_time, track_consistency, ocr_attempts_per_track
    
    try:
        current_time = time.time()
        
        # Don't cleanup too frequently (every 5 seconds max)
        if current_time - last_cleanup_time < 5:
            return
        
        last_cleanup_time = current_time
        
        if not tracked_objects:
            return
        
        logger.info(f"🧹 ENHANCED cleanup of {len(tracked_objects)} tracked objects...")
        
        # Clean up old consistency data
        old_tracks = set(track_consistency.keys()) - set(tracked_objects.keys())
        for old_track in old_tracks:
            del track_consistency[old_track]
            if old_track in ocr_attempts_per_track:
                del ocr_attempts_per_track[old_track]
        
        if old_tracks:
            logger.info(f"🧹 Cleaned up {len(old_tracks)} old consistency records")
        
        # Group objects by plate number
        plate_groups = {}
        vehicles_without_plates = {}
        
        for track_id, obj in tracked_objects.items():
            plate_num = obj.get('plate_number', '')
            confidence = obj.get('confidence', 0)
            is_consistent = obj.get('is_consistent', False)
            
            # Keep vehicles without plates
            if not plate_num or plate_num == 'Đang nhận diện...':
                vehicles_without_plates[track_id] = obj
                continue
            
            # Keep plates with reasonable confidence
            if plate_num and confidence > 0.5:  # Lower threshold
                if plate_num not in plate_groups:
                    plate_groups[plate_num] = []
                plate_groups[plate_num].append((track_id, obj))
            else:
                # Remove low confidence plates
                logger.info(f"🧹 Removing low confidence plate: '{plate_num}' (conf: {confidence:.3f})")
        
        # Keep only the BEST object for each plate number
        valid_objects = {}
        duplicates_removed = 0
        
        for plate_num, group in plate_groups.items():
            if len(group) == 1:
                # Only one result, keep it
                track_id, obj = group[0]
                valid_objects[track_id] = obj
            else:
                # Multiple results - find the best one (highest confidence, most recent)
                best_track_id, best_obj = max(group, key=lambda x: (
                    x[1].get('confidence', 0),
                    x[1].get('last_seen', 0)
                ))
                valid_objects[best_track_id] = best_obj
                duplicates_removed += len(group) - 1
                logger.info(f"🎯 Kept BEST result for '{plate_num}': {best_track_id}")
        
        # Add back vehicles without plates
        valid_objects.update(vehicles_without_plates)
        
        old_count = len(tracked_objects)
        tracked_objects = valid_objects
        new_count = len(tracked_objects)
        
        logger.info(f"🧹 STRICT cleanup completed:")
        logger.info(f"   Total objects: {old_count} -> {new_count}")
        logger.info(f"   Duplicates removed: {duplicates_removed}")
        logger.info(f"   Valid Vietnamese plates: {len(plate_groups)}")
        logger.info(f"   Vehicles without plates: {len(vehicles_without_plates)}")
        
    except Exception as e:
        logger.error(f"Error in enhanced cleanup: {e}")

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

def detect_and_ocr_stable(frame, camera_id=None, source_type="camera", video_filename=None, camera_location=None):
    """Main detection function with enhanced plate detection and CENTERED ROI - OPTIMIZED FOR 20 FPS"""
    global plate_history, track_info, fps_counter, last_fps_time, current_fps, last_redis_update
    global frame_count, tracked_objects, skip_frame_count, last_detection_time, last_alpr_call_time
    
    frame_count += 1
    
    # Early return for invalid frames
    if frame is None or frame.size == 0:
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
            'skipped': True
        }
    
    # Tính FPS với smoothing để giảm fluctuation
    current_time = time.time()
    fps_counter += 1
    if current_time - last_fps_time >= 1.0:  # Cập nhật FPS mỗi 1 giây để ổn định hơn
        raw_fps = fps_counter / (current_time - last_fps_time)
        # Smooth FPS calculation để giảm fluctuation
        if current_fps == 0:
            current_fps = raw_fps
        else:
            current_fps = 0.8 * current_fps + 0.2 * raw_fps  # Less aggressive smoothing
        fps_counter = 0
        last_fps_time = current_time
        logger.info(f"📊 Current FPS: {current_fps:.1f} (raw: {raw_fps:.1f})")
    
    curr_time = time.time()
    original_height, original_width = frame.shape[:2]
    display_frame = frame.copy()
    
    # Calculate ROI coordinates - CENTERED HALF FRAME
    roi_xmin, roi_ymin, roi_xmax, roi_ymax = calculate_roi_coordinates(original_width, original_height)
    
    # FRAME SKIPPING LOGIC - Chỉ xử lý khi cần thiết
    roi = (roi_xmin, roi_ymin, roi_xmax, roi_ymax)
    
    # Vẽ ROI trước khi kiểm tra skip
    cv2.rectangle(display_frame, (roi_xmin, roi_ymin), (roi_xmax, roi_ymax), (0, 255, 255), 1)  # Vàng, nét mỏng
    
    # OPTIMIZED: Consistent frame skipping for stable FPS
    should_skip = False
    
    # Kiểm tra motion trong ROI trước
    has_motion = has_motion_in_roi(frame, roi)
    
    # SIMPLIFIED: Minimal frame skipping for stable 20 FPS
    if ENABLE_FPS_THROTTLING:
        # Simple throttling - only skip when no motion and no objects
        if not has_motion and len(tracked_objects) == 0:
            if frame_count % 4 == 0:  # Skip every 4th frame only
                should_skip = True
        else:
            # Never skip when there's motion or objects
            should_skip = False
    else:
        # No throttling
        should_skip = False
    
    if should_skip:
        # Skip frame này nhưng vẫn vẽ ROI và text
        logger.debug(f"⏭️ Skipping frame {frame_count} - smart skipping based on tracked objects")
        
        # Vẽ thông tin cần thiết trên frame
        fps_text = f"FPS: {current_fps:.1f}"
        cv2.putText(display_frame, fps_text, (original_width - 150, 35),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
        
        detections_text = f"Detections: 0"
        cv2.putText(display_frame, detections_text, (10, 35),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 0), 2)
        
        return {
            'frame': cv2.imencode('.jpg', display_frame, [cv2.IMWRITE_JPEG_QUALITY, 30])[1].tobytes(),  # Tăng quality cho skip frames
            'boxes': [],
            'labels': [],
            'ocr_results': [],
            'tracked_objects': tracked_objects.copy(),
            'ids': [],
            'frame_width': original_width,
            'frame_height': original_height,
            'roi': [roi_xmin, roi_ymin, roi_xmax, roi_ymax],
            'fps': current_fps,
            'detection_count': 0,
            'track_count': 0,
            'skipped': True
        }
    else:
        logger.debug(f"🔄 Processing frame {frame_count} - selected for processing")
    
    # Ensure ROI is valid
    if roi_xmax <= roi_xmin or roi_ymax <= roi_ymin:
        # Fallback to centered half frame
        center_x, center_y = original_width // 2, original_height // 2
        roi_width, roi_height = original_width // 2, original_height // 2
        roi_xmin = center_x - roi_width // 2
        roi_ymin = center_y - roi_height // 2
        roi_xmax = center_x + roi_width // 2
        roi_ymax = center_y + roi_height // 2
        logger.warning("ROI không hợp lệ, sử dụng nửa khung hình ở giữa")
    
    # Extract ROI frame
    roi_frame = frame[roi_ymin:roi_ymax, roi_xmin:roi_xmax]
    
    # Ensure ROI frame has valid size
    if roi_frame.shape[0] < 50 or roi_frame.shape[1] < 50:
        logger.warning(f"ROI frame too small: {roi_frame.shape}, using centered half frame")
        center_x, center_y = original_width // 2, original_height // 2
        roi_width, roi_height = max(original_width // 2, 100), max(original_height // 2, 100)
        roi_xmin = max(0, center_x - roi_width // 2)
        roi_ymin = max(0, center_y - roi_height // 2)
        roi_xmax = min(original_width, center_x + roi_width // 2)
        roi_ymax = min(original_height, center_y + roi_height // 2)
        roi_frame = frame[roi_ymin:roi_ymax, roi_xmin:roi_xmax]
    
    # OPTIMIZED: Call FastALPR on ROI only with caching and throttling
    alpr_results = []
    if alpr is not None:
        try:
            # Convert BGR to RGB for FastALPR
            if len(roi_frame.shape) == 3 and roi_frame.shape[2] == 3:
                roi_frame_rgb = cv2.cvtColor(roi_frame, cv2.COLOR_BGR2RGB)
            else:
                roi_frame_rgb = roi_frame
                
            logger.debug(f"ROI frame shape: {roi_frame_rgb.shape}")
            
            # Ensure frame has minimum size
            if roi_frame_rgb.shape[0] >= 50 and roi_frame_rgb.shape[1] >= 50:
                # OPTIMIZED: Check cache first
                frame_hash = hashlib.md5(roi_frame_rgb.tobytes()).hexdigest()[:16]
                cached_result = _get_cached_result(frame_hash)
                
                if cached_result and 'alpr_results' in cached_result:
                    alpr_results = cached_result['alpr_results']
                    logger.debug(f"🚀 Using cached detection result")
                else:
                    # OPTIMIZED: Throttle FastALPR calls to prevent video pause
                    current_time = time.time()
                    
                    # OPTIMIZED: FastALPR with minimal cooldown for 20 FPS
                    if current_time - last_alpr_call_time >= 0.01:  # 10ms cooldown (50 FPS max)
                        try:
                            # OPTIMIZED: Gọi FastALPR trực tiếp (không enhancement)
                            alpr_results = alpr.predict(roi_frame_rgb)
                            
                            # Convert to list if needed
                            if hasattr(alpr_results, '__iter__') and not isinstance(alpr_results, str):
                                alpr_results = list(alpr_results)
                            else:
                                alpr_results = []
                            
                            logger.debug(f"FastALPR detected {len(alpr_results)} objects")
                            last_alpr_call_time = current_time
                            
                            # Cache result
                            if ENABLE_CACHING:
                                result = {
                                    'alpr_results': alpr_results,
                                    'roi_coords': (roi_xmin, roi_ymin, roi_xmax, roi_ymax)
                                }
                                _cache_detection_result(frame_hash, result)
                        except Exception as e:
                            logger.error(f"FastALPR prediction error: {e}")
                            alpr_results = []
                    else:
                        # Sử dụng kết quả cũ nếu chưa đến lúc gọi FastALPR
                        logger.debug(f"⏱️ FastALPR throttled - using previous results")
                        alpr_results = []
                
                # Cập nhật thời gian detection nếu có kết quả
                if len(alpr_results) > 0:
                    last_detection_time = curr_time
                    skip_frame_count = 0  # Reset skip counter khi có detection
            else:
                logger.warning(f"ROI frame too small for detection: {roi_frame_rgb.shape}")
                
        except Exception as e:
            logger.error(f"FastALPR prediction failed: {str(e)}")
            alpr_results = []
    else:
        logger.warning("FastALPR not available - skipping detection")

    # Prepare detections list with coordinates converted back to original frame
    detections = []
    plate_detections = []  # Store plate-specific detections for bounding box display
    
    for res in alpr_results:
        bbox = res.detection.bounding_box
        # Convert coordinates from ROI back to original frame
        x1 = max(int(bbox.x1) + roi_xmin, 0)
        y1 = max(int(bbox.y1) + roi_ymin, 0)
        x2 = min(int(bbox.x2) + roi_xmin, original_width)
        y2 = min(int(bbox.y2) + roi_ymin, original_height)
        conf = res.detection.confidence or 0.7
        
        logger.debug(f"Detection bbox (converted to original): ({x1},{y1})-({x2},{y2}), conf: {conf}")
        
        # Add detection
        detections.append([x1, y1, x2, y2, conf])
        
        # Extract OCR text for this detection - ENHANCED DOT PROCESSING
        plate_text = ""
        ocr_conf = 0
        
        if res.ocr and res.ocr.text:
            raw_text = res.ocr.text
            conf_list = res.ocr.confidence
            ocr_conf = mean(conf_list) if isinstance(conf_list, list) else conf_list
            
            # OPTIMIZED: Pre-process OCR text for better dot recognition
            if ENABLE_LIGHTWEIGHT_MODE:
                # Lightweight text processing
                plate_text = raw_text.strip().upper()
                plate_text = re.sub(r'[^A-Z0-9\-\.]', '', plate_text)
            else:
                # Full text processing
                enhanced_text = fix_vietnamese_ocr_errors(raw_text)
                plate_text = enhanced_text
        
        # Store plate detection info for bounding box display
        plate_detections.append({
            'bbox': [x1, y1, x2, y2],
            'plate_text': plate_text,
            'confidence': ocr_conf,
            'detection_conf': conf,
            'raw_text': res.ocr.text if res.ocr else ""
        })
        
        logger.debug(f"Added detection: bbox=({x1},{y1})-({x2},{y2}), plate='{plate_text}', ocr_conf={ocr_conf:.3f}")

    # Convert to numpy array for tracker
    if detections:
        detections_np = np.array(detections, dtype=np.float32)
        logger.info(f"🔍 Detections for tracker: {len(detections)} detections")
    else:
        detections_np = np.zeros((0, 5), dtype=np.float32)
        logger.info(f"🔍 No detections for tracker")

    # Update tracker
    tracks = tracker.update(
        output_results=detections_np,
        img_info=(original_height, original_width),
        img_size=(original_height, original_width)
    )
    
    logger.info(f"🔍 Tracker update completed: {len(tracks)} tracks")

    # SIMPLIFIED: Gửi dữ liệu trực tiếp khi có detection (không cần tracker)
    for detection in plate_detections:
        plate_text = detection['plate_text']
        confidence = detection['confidence']
        
        # Kiểm tra cả detection confidence và OCR confidence
        detection_conf = detection.get('detection_conf', confidence)
        ocr_conf = detection.get('ocr_conf', confidence)
        
        if plate_text and confidence > MIN_CONFIDENCE and ocr_conf > MIN_OCR_CONFIDENCE:
            # Process plate text
            processed_text = process_plate_text(plate_text)
            if processed_text:
                logger.info(f"🎯 DIRECT PLATE DETECTION: '{processed_text}' (conf: {confidence:.3f})")
                
                # Tạo frame path với timestamp cố định
                curr_time = int(time.time())
                clean_plate_text = re.sub(r'[\\/*?:"<>|]', "_", processed_text)
                frame_filename = f"plate_direct_{clean_plate_text}_{curr_time}.jpg"
                frame_path = f"static/crops/{frame_filename}"
                
                # Lưu crop image - CHỈ CROP BIỂN SỐ, KHÔNG CÓ PADDING
                try:
                    bbox = detection['bbox']
                    crop = crop_and_enhance_plate(frame, bbox, enhancement_level="light")
                    
                    if crop is not None and crop.size > 0:
                        crop_path = os.path.join(FRAMES_FOLDER, frame_filename)
                        success_save = cv2.imwrite(crop_path, crop)
                        if success_save:
                            logger.info(f"✅ Direct crop image saved: {crop_path}")
                        else:
                            logger.warning(f"❌ Failed to save direct crop image: {crop_path}")
                    else:
                        logger.warning("Direct crop area is empty")
                except Exception as e:
                    logger.error(f"Error saving direct crop image: {e}")
                
                # OPTIMIZED: Gửi trực tiếp tới database với threading
                # OPTIMIZED: Throttled async database sending to prevent video pause
                current_time = time.time()
                
                # Chỉ gửi database nếu đã qua cooldown period
                if current_time - last_detection_time >= detection_cooldown:
                    if ENABLE_THREADING:
                        # Gửi async để không block frame processing
                        thread_pool.submit(
                            send_plate_to_server, "direct", {
                                'plate': processed_text,
                                'confidence': confidence,
                                'bbox': detection['bbox']
                            }, frame_path, camera_id, source_type, video_filename, camera_location
                        )
                        logger.debug(f"🚀 Direct plate '{processed_text}' queued for database (async)")
                        last_detection_time = current_time
                    else:
                        # Gửi sync như cũ
                        success = send_plate_to_server("direct", {
                            'plate': processed_text,
                            'confidence': confidence,
                            'bbox': detection['bbox']
                        }, frame_path, camera_id, source_type, video_filename, camera_location)
                        logger.debug(f"🚀 Direct plate '{processed_text}' sent to database: {success}")
                        last_detection_time = current_time
                else:
                    logger.debug(f"⏱️ Detection throttled - next in {detection_cooldown - (current_time - last_detection_time):.1f}s")

    # ROI đã được vẽ ở trên

    # Display FPS and detections only
    fps_text = f"FPS: {current_fps:.1f}"
    cv2.putText(display_frame, fps_text, (original_width - 150, 35),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
    
    detections_text = f"Detections: {len(detections)}"
    cv2.putText(display_frame, detections_text, (10, 35),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 0), 2)

    # Draw all plate detections with bounding boxes - SIMPLIFIED DISPLAY
    boxes = []
    labels = []
    ocr_results = []
    
    # REMOVED: Duplicate display logic - using ByteTracker display only
    
    # Hiển thị detections mới (nếu có)
    for detection in plate_detections:
        x1, y1, x2, y2 = detection['bbox']
        plate_text = detection['plate_text']
        confidence = detection['confidence']
        detection_conf = detection['detection_conf']
        raw_text = detection.get('raw_text', '')
        
        # Draw detection bounding box (WHITE for raw detections)
        cv2.rectangle(display_frame, (x1, y1), (x2, y2), (255, 255, 255), 3)
        
        # Process plate text - ENHANCED
        processed_text = process_plate_text(plate_text) if plate_text else None
        
        # Kiểm tra cả detection confidence và OCR confidence
        detection_conf = detection.get('detection_conf', confidence)
        ocr_conf = detection.get('ocr_conf', confidence)
        
        if processed_text and confidence > MIN_CONFIDENCE and ocr_conf > MIN_OCR_CONFIDENCE:
            # Don't draw here - will be drawn in tracking section
            
            
            # Draw smaller plate bounding box (WHITE for processed plates)
            plate_padding = 5
            plate_x1 = max(x1 + plate_padding, 0)
            plate_y1 = max(y1 + plate_padding, 0)
            plate_x2 = min(x2 - plate_padding, original_width)
            plate_y2 = min(y2 - plate_padding, original_height)
            
            # Don't draw here - will be drawn in tracking section
            
            # Add to response arrays
            boxes.append([x1, y1, x2, y2])
            labels.append(f"Plate: {processed_text}")
            ocr_results.append([processed_text, confidence])
            
            logger.info(f"✅ Processed plate: '{processed_text}' at ({x1},{y1})-({x2},{y2})")
        else:
            # OPTIMIZED: Don't display invalid detections to reduce visual clutter
            # Only show valid plate detections
            logger.debug(f"⏭️ Skipping invalid detection: '{raw_text}' (conf: {confidence:.3f})")

    # Gọi FastALPR trên toàn bộ frame nếu chưa có kết quả
    if not alpr_results:
        try:
            roi_frame_rgb = cv2.cvtColor(roi_frame, cv2.COLOR_BGR2RGB)
            alpr_results = alpr.predict(roi_frame_rgb)
            logger.info(f"🔍 FastALPR detected {len(alpr_results)} objects in ROI")
        except Exception as e:
            logger.error(f"FastALPR prediction failed: {e}")
            alpr_results = []

    # OPTIMIZED: Use ByteTracker for better object tracking
    # Prepare detections for ByteTracker
    detections = []
    for res in alpr_results:
        bbox = res.detection.bounding_box
        x1 = max(int(bbox.x1) + roi_xmin, 0)
        y1 = max(int(bbox.y1) + roi_ymin, 0)
        x2 = min(int(bbox.x2) + roi_xmin, original_width)
        y2 = min(int(bbox.y2) + roi_ymin, original_height)
        conf = res.detection.confidence or 0.7
        
        if is_bbox_in_roi((x1, y1, x2, y2), (roi_xmin, roi_ymin, roi_xmax, roi_ymax)):
            # ByteTracker expects [x1, y1, x2, y2, conf] format
            detections.append([x1, y1, x2, y2, conf])

    # Convert to numpy array for ByteTracker
    if detections:
        detections_np = np.array(detections, dtype=np.float32)
        logger.info(f"🔍 Prepared {len(detections)} detections for ByteTracker")
    else:
        detections_np = np.zeros((0, 5), dtype=np.float32)
        logger.info(f"🔍 No detections for ByteTracker")

    # Update ByteTracker - use same format as test1.py
    try:
        if len(detections_np) > 0:
            logger.info(f"🔍 ByteTracker input shape: {detections_np.shape}")
            logger.info(f"🔍 ByteTracker input sample: {detections_np[0] if len(detections_np) > 0 else 'None'}")
            
            # Use same format as test1.py: [x1, y1, x2, y2, conf]
            tracks = byte_tracker.update(
                output_results=detections_np,
                img_info=(original_height, original_width),
                img_size=(original_height, original_width)
            )
            logger.info(f"🔍 ByteTracker output: {len(tracks)} tracks")
            
            # If ByteTracker returns 0 tracks but we have detections, try with lower threshold
            if len(tracks) == 0 and len(detections_np) > 0:
                logger.warning("⚠️ ByteTracker returned 0 tracks, trying with lower confidence threshold")
                # Create new tracker with lower threshold
                temp_tracker = BYTETracker(
                    track_thresh=0.1,  # Very low threshold
                    track_buffer=30,
                    match_thresh=0.5,
                    frame_rate=30
                )
                tracks = temp_tracker.update(
                    output_results=detections_np,
                    img_info=(original_height, original_width),
                    img_size=(original_height, original_width)
                )
                logger.info(f"🔍 ByteTracker retry output: {len(tracks)} tracks")
        else:
            tracks = []
    except Exception as e:
        logger.error(f"ByteTracker update failed: {e}")
        logger.error(f"ByteTracker input was: {detections_np}")
        tracks = []
    
    # Debug ByteTracker
    if len(detections) > 0:
        logger.info(f"🔍 ByteTracker input: {len(detections)} detections, output: {len(tracks)} tracks")
        if len(tracks) == 0:
            logger.warning(f"⚠️ ByteTracker received {len(detections)} detections but returned 0 tracks")

    # Process tracker results for vehicles
    current_track_ids = set()
    
    logger.info(f"🔍 ByteTracker results: {len(tracks)} tracks found")
    
    # REMOVED: Immediate tracking logic - using ByteTracker only
    
    # If no tracks but we have detections, find BEST detection only
    if len(tracks) == 0 and len(detections) > 0:
        logger.info(f"🔍 No tracks from ByteTracker, finding BEST detection only")
        
        # Find the BEST detection with highest confidence
        best_detection = None
        best_plate_text = ""
        best_conf_val = 0
        best_ocr_conf = 0
        
        for i, detection in enumerate(detections):
            x1, y1, x2, y2, conf = detection
            
            # Find best OCR result for this detection
            plate_text = ""
            conf_val = 0
            ocr_conf = 0
            
            for res in alpr_results:
                bbox = res.detection.bounding_box
                res_x1 = int(bbox.x1) + roi_xmin
                res_y1 = int(bbox.y1) + roi_ymin
                
                if (abs(res_x1 - x1) < 30 and abs(res_y1 - y1) < 30 and 
                    res.ocr and res.ocr.text):
                    plate_text = res.ocr.text
                    ocr_conf = res.ocr.confidence
                    conf_val = mean(ocr_conf) if isinstance(ocr_conf, list) else ocr_conf
                    break
            
            # Check if this is the best detection so far - LOWERED THRESHOLD
            if (plate_text and conf_val > 0.4 and len(plate_text) >= 4 and 
                conf_val > best_conf_val):
                best_detection = detection
                best_plate_text = plate_text
                best_conf_val = conf_val
                best_ocr_conf = conf_val
        
        # Process only the BEST detection
        if best_detection and best_plate_text:
            x1, y1, x2, y2, conf = best_detection
            track_id = "1"  # Single ID for best detection
            
            processed_text = process_plate_text(best_plate_text)
            if processed_text:
                # Check if this plate was already sent recently
                plate_key = f"direct_{processed_text}"
                if plate_key in plate_history and time.time() - plate_history[plate_key] < 5.0:
                    logger.info(f"⏭️ Direct plate '{processed_text}' đã được gửi gần đây, bỏ qua")
                else:
                    logger.info(f"🎯 BEST DIRECT DETECTION: '{processed_text}' (conf: {best_conf_val:.3f})")
                    plate_history[plate_key] = time.time()  # Record when sent
                
                    # Find the actual plate bounding box from OCR results
                    plate_x1, plate_y1, plate_x2, plate_y2 = x1, y1, x2, y2
                    for res in alpr_results:
                        bbox = res.detection.bounding_box
                        res_x1 = int(bbox.x1) + roi_xmin
                        res_y1 = int(bbox.y1) + roi_ymin
                        res_x2 = int(bbox.x2) + roi_xmin
                        res_y2 = int(bbox.y2) + roi_ymin
                        
                        if (abs(res_x1 - x1) < 30 and abs(res_y1 - y1) < 30 and 
                            res.ocr and res.ocr.text and res.ocr.text == best_plate_text):
                            plate_x1, plate_y1, plate_x2, plate_y2 = res_x1, res_y1, res_x2, res_y2
                            break
                    
                    # Save crop directly - CHỈ CROP BIỂN SỐ, KHÔNG CÓ PADDING
                    clean_plate_text = re.sub(r'[\\/*?:"<>|]', "_", processed_text)
                    crop_filename = f"plate_direct_{clean_plate_text}_{int(curr_time)}.jpg"
                
                    # Crop chỉ vùng biển số thực tế
                    bbox = [plate_x1, plate_y1, plate_x2, plate_y2]
                    crop = crop_and_enhance_plate(frame, bbox, enhancement_level="medium")
                    
                    if crop.size > 0:
                        crop_path = os.path.join(CROPS_FOLDER, crop_filename)
                        success_save = cv2.imwrite(crop_path, crop)
                        if success_save:
                            logger.info(f"✅ Direct crop image saved: {crop_path}")
                            
                            # Send to database directly với cùng timestamp
                            frame_path = f"static/crops/{frame_filename}"
                            logger.info(f"🔗 Sending frame_path to database: {frame_path}")
                            if ENABLE_THREADING:
                                thread_pool.submit(
                                    send_plate_to_server, track_id, {
                                        'plate': processed_text,
                                        'confidence': best_conf_val,
                                        'bbox': [plate_x1, plate_y1, plate_x2, plate_y2],
                                        'crop_image_path': frame_path
                                    }, frame_path, camera_id, source_type, video_filename, camera_location
                                )
                                logger.info(f"🚀 Direct plate '{processed_text}' queued for database")
                
                # Display on frame - ONLY ONE TEXT
                display_text = f"ID: {track_id} {processed_text}"
                text_y = max(plate_y1 - 20, 20)
                cv2.putText(display_frame, display_text, (plate_x1, text_y),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                # Draw only the plate bounding box
                cv2.rectangle(display_frame, (plate_x1, plate_y1), (plate_x2, plate_y2), (0, 255, 0), 2)
    
    for track in tracks:
        tlwh = track.tlwh
        current_track_id = track.track_id
        x1, y1, w, h = map(int, tlwh)
        x2, y2 = x1 + w, y1 + h
        
        # Check bbox size and ROI
        if (x2 - x1) < 30 or (y2 - y1) < 15 or not is_bbox_in_roi((x1, y1, x2, y2), (roi_xmin, roi_ymin, roi_xmax, roi_ymax)):
            continue

        # Tìm kết quả OCR tốt nhất cho track này
        best_plate_text = ""
        best_conf_val = 0
        best_ocr_conf = 0
        
        for res in alpr_results:
            bbox = res.detection.bounding_box
            res_x1 = int(bbox.x1) + roi_xmin
            res_y1 = int(bbox.y1) + roi_ymin
            
            if (abs(res_x1 - x1) < 30 and abs(res_y1 - y1) < 30 and 
                res.ocr and res.ocr.text):
                plate_text = res.ocr.text
                conf = res.ocr.confidence
                conf_val = mean(conf) if isinstance(conf, list) else conf
                
                # Chọn kết quả có confidence cao nhất
                if conf_val > best_conf_val:
                    best_plate_text = plate_text
                    best_conf_val = conf_val
                    best_ocr_conf = conf_val
        
        # Lọc biển số - đơn giản hóa
        if best_conf_val < 0.5 or len(best_plate_text) < 4:
            best_plate_text = "Đang nhận diện..."
            best_conf_val = 0.0

        # Find existing track_id for similar plates
        existing_track_id = find_existing_track_id(best_plate_text) if best_plate_text != "Đang nhận diện..." else None
        
        # Determine final track_id to use
        if existing_track_id and existing_track_id != current_track_id:
            track_id_mapping[current_track_id] = existing_track_id
            final_track_id = existing_track_id
        else:
            final_track_id = current_track_id
        
        # Update plate to track_id mapping
        if best_plate_text != "Đang nhận diện...":
            if best_plate_text not in plate_to_track_id:
                plate_to_track_id[best_plate_text] = []
            if final_track_id not in plate_to_track_id[best_plate_text]:
                plate_to_track_id[best_plate_text].append(final_track_id)
        
        # Update plate history - chỉ lưu kết quả tốt nhất
        if final_track_id not in plate_history:
            plate_history[final_track_id] = []
        
        # Chỉ cập nhật nếu kết quả mới tốt hơn
        if best_plate_text != "Đang nhận diện...":
            if not plate_history[final_track_id] or best_conf_val > plate_history[final_track_id][-1][1]:
                # Chỉ giữ 1 kết quả tốt nhất cho mỗi đối tượng
                plate_history[final_track_id] = [(best_plate_text, best_conf_val)]

        # Update Redis immediately
        if best_plate_text != "Đang nhận diện...":
            bbox_str = f"{x1},{y1},{x2},{y2}"
            update_redis_plate(final_track_id, best_plate_text, best_conf_val, bbox_str)

        # Update track_info
        track_info[final_track_id] = {
            'plate': best_plate_text,
            'confidence': best_conf_val,
            'bbox': f"{x1},{y1},{x2},{y2}",
            'last_seen': curr_time
        }
        
        # Update tracked_objects for database saving
        if final_track_id not in tracked_objects:
            logger.info(f"🆕 Creating NEW tracked object for track_id: {final_track_id}")
            # Process plate text for new object
            processed_text = process_plate_text(best_plate_text) if best_plate_text != "Đang nhận diện..." else best_plate_text
            
            tracked_objects[final_track_id] = {
                'track_id': final_track_id,
                'bbox': [x1, y1, x2, y2],
                'plate_number': processed_text,
                'raw_text': plate_text,
                'confidence': conf_val,
                'first_seen': curr_time,
                'last_seen': curr_time,
                'crop_filename': '',
                'disappeared': 0,
                'validation_passed': plate_text != "Đang nhận diện..." and conf_val > MIN_CONFIDENCE and ocr_conf > MIN_OCR_CONFIDENCE,
                'is_consistent': True if processed_text else False,
                'ocr_attempts': 1,
                'saved_to_db': False,
                'sent_to_db': False
            }
            
            # Gửi dữ liệu ngay lập tức cho object mới nếu có kết quả hợp lệ
            if processed_text and conf_val > MIN_CONFIDENCE and ocr_conf > MIN_OCR_CONFIDENCE:
                logger.info(f"🎯 NEW PLATE DETECTED: '{processed_text}' (conf: {conf_val:.3f})")
                
                # Tạo frame path
                clean_plate_text = re.sub(r'[\\/*?:"<>|]', "_", processed_text)
                frame_filename = f"plate_{final_track_id}_{clean_plate_text}_{int(curr_time)}.jpg"
                frame_path = f"static/crops/{frame_filename}"
                
                logger.info(f"📁 Frame path: {frame_path}")
                logger.info(f"📹 Camera ID: {camera_id}")
                
                # OPTIMIZED: Always async database sending to prevent video pause
                if ENABLE_THREADING:
                    thread_pool.submit(
                        send_plate_to_server, final_track_id, {
                            'plate': processed_text,
                            'confidence': conf_val,
                            'bbox': [x1, y1, x2, y2]
                        }, frame_path, camera_id, source_type, video_filename, camera_location
                    )
                    logger.debug(f"🚀 NEW plate '{processed_text}' queued for database (async)")
                else:
                    # Fallback: sync sending
                    send_plate_to_server(final_track_id, {
                        'plate': processed_text,
                        'confidence': conf_val,
                        'bbox': [x1, y1, x2, y2]
                    }, frame_path, camera_id, source_type, video_filename, camera_location)
                
                # Đánh dấu chưa gửi để app.py xử lý
                tracked_objects[final_track_id]['sent_to_db'] = False
                logger.info(f"🎯 NEW plate '{processed_text}' detected - waiting for app.py to save")
            else:
                logger.info(f"⏭️ Skipping plate '{processed_text}' - conf: {conf_val:.3f}, min: {MIN_CONFIDENCE}")
        else:
            # Update existing object
            logger.info(f"🔄 Updating EXISTING tracked object for track_id: {final_track_id}")
            obj = tracked_objects[final_track_id]
            obj['bbox'] = [x1, y1, x2, y2]
            obj['last_seen'] = curr_time
            obj['disappeared'] = 0
            
            # Update plate number if we have a new valid result
            if plate_text != "Đang nhận diện..." and conf_val > MIN_CONFIDENCE and ocr_conf > MIN_OCR_CONFIDENCE:
                # Process plate text first
                processed_text = process_plate_text(plate_text)
                if processed_text:
                    obj['plate_number'] = processed_text
                    obj['raw_text'] = plate_text
                    obj['confidence'] = conf_val
                    obj['validation_passed'] = True
                    obj['is_consistent'] = True
                    logger.info(f"Updated track {final_track_id} with ENHANCED plate: '{processed_text}' (conf: {conf_val:.3f})")
                    
                    # Gửi dữ liệu mỗi khi có detection mới (bỏ qua điều kiện sent_to_db)
                    logger.info(f"🎯 UPDATED PLATE DETECTED: '{processed_text}' (conf: {conf_val:.3f})")
                    
                    # Tạo frame path với timestamp cố định
                    clean_plate_text = re.sub(r'[\\/*?:"<>|]', "_", processed_text)
                    frame_filename = f"plate_{final_track_id}_{clean_plate_text}_{curr_time}.jpg"
                    frame_path = f"static/crops/{frame_filename}"  # Sửa đường dẫn
                    
                    # Tạo crop image trước khi gửi database - CHỈ CROP BIỂN SỐ
                    bbox = [x1, y1, x2, y2]
                    crop = crop_and_enhance_plate(frame, bbox, enhancement_level="light")
                    
                    if crop is not None and crop.size > 0:
                        crop_path = os.path.join(CROPS_FOLDER, frame_filename)
                        success_save = cv2.imwrite(crop_path, crop)
                        if success_save:
                            logger.info(f"✅ Crop image saved for database: {crop_path}")
                        else:
                            logger.warning(f"❌ Failed to save crop image: {crop_path}")
                            frame_path = ""  # Clear path if save failed
                    
                    logger.info(f"📁 Frame path: {frame_path}")
                    logger.info(f"📹 Camera ID: {camera_id}")
                    
                    # OPTIMIZED: Always async database sending to prevent video pause
                    if ENABLE_THREADING:
                        thread_pool.submit(
                            send_plate_to_server, final_track_id, {
                                'plate': processed_text,
                                'confidence': conf_val,
                                'bbox': [x1, y1, x2, y2]
                            }, frame_path, camera_id, source_type, video_filename, camera_location
                        )
                        logger.debug(f"🚀 NEW plate '{processed_text}' queued for database (async)")
                    else:
                        # Fallback: sync sending
                        send_plate_to_server(final_track_id, {
                            'plate': processed_text,
                            'confidence': conf_val,
                            'bbox': [x1, y1, x2, y2]
                        }, frame_path, camera_id, source_type, video_filename, camera_location)
                    
                    # Đánh dấu đã gửi
                    obj['sent_to_db'] = True
                    logger.info(f"🎯 UPDATED plate '{processed_text}' sent to database")
        
        current_track_ids.add(final_track_id)

        # OPTIMIZED: Show tracking ID and plate text ABOVE the bounding box
        if best_plate_text and best_plate_text != "Đang nhận diện...":
            # Draw tracking ID and plate text ABOVE the bounding box (GREEN for valid plates)
            display_text = f"ID: {final_track_id} {best_plate_text}"
            text_y = max(y1 - 20, 20)  # Ensure text is above the bounding box
            cv2.putText(display_frame, display_text, (x1, text_y),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            
            # Draw plate bounding box (GREEN for valid plates)
            cv2.rectangle(display_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
            
            # Add to display lists
            boxes.append([x1, y1, x2, y2])
            labels.append(best_plate_text)
            ocr_results.append(best_plate_text)
        else:
            # Show only tracking ID for objects without valid plates
            display_text = f"ID: {final_track_id}"
            text_y = max(y1 - 20, 20)  # Ensure text is above the bounding box
            cv2.putText(display_frame, display_text, (x1, text_y),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
            
            # Draw vehicle bounding box (YELLOW for tracked objects)
            cv2.rectangle(display_frame, (x1, y1), (x2, y2), (0, 255, 255), 2)

        # Save crop ONLY if this is the BEST result for this track - CROP ONLY THE PLATE
        should_save = (best_plate_text and best_plate_text != "Đang nhận diện..." and 
                      best_conf_val > MIN_CONFIDENCE and best_ocr_conf > MIN_OCR_CONFIDENCE)
        
        # Only save if this is better than previous result for this track
        if should_save and final_track_id in tracked_objects:
            prev_conf = tracked_objects[final_track_id].get('confidence', 0)
            if best_conf_val <= prev_conf:
                should_save = False  # Don't save if not better
        
        if should_save:
            # Tạo tên file với format: plate_{track_id}_{plate_text}_{timestamp}.jpg
            clean_plate_text = re.sub(r'[\\/*?:"<>|]', "_", best_plate_text) if best_plate_text else f"unknown_{final_track_id}"
            crop_filename = f"plate_{final_track_id}_{clean_plate_text}_{int(curr_time)}.jpg"
            
            # Crop CHỈ vùng biển số thực tế - KHÔNG CÓ PADDING
            bbox = [x1, y1, x2, y2]
            crop = crop_and_enhance_plate(frame, bbox, enhancement_level="medium")
            if crop is not None and crop.size > 0:
                crop_path = os.path.join(CROPS_FOLDER, crop_filename)
                success_save = cv2.imwrite(crop_path, crop)
                if success_save:
                    logger.info(f"✅ Plate crop saved: {crop_path}")
                    
                    # Update crop filename in tracked object
                    if final_track_id in tracked_objects:
                        tracked_objects[final_track_id]['crop_filename'] = crop_filename
                        tracked_objects[final_track_id]['crop_path'] = crop_path
                        tracked_objects[final_track_id]['sent_to_db'] = False  # Mark for database sending
                else:
                    logger.warning(f"❌ Failed to save plate crop: {crop_path}")

    # OPTIMIZED: Less frequent cleanup to improve FPS stability
    if len(plate_history) > 100:  # Tăng từ 50 lên 100
        oldest_track = min(plate_history.keys(), key=lambda k: track_info.get(k, {}).get('last_seen', 0))
        del plate_history[oldest_track]
        if oldest_track in track_info:
            del track_info[oldest_track]
    
    # OPTIMIZED: Less frequent cleanup to improve FPS stability
    if curr_time - last_redis_update > 30.0:  # Tăng từ 20.0 lên 30.0 giây
        tracks_to_remove = []
        for track_id in list(track_info.keys()):
            if curr_time - track_info[track_id]['last_seen'] > 30.0:  # Tăng từ 20.0 lên 30.0 giây
                
                # Get plate information
                plate_text = track_info[track_id]['plate']
                
                if plate_text and plate_text != "Đang nhận diện...":
                    clean_plate_text = re.sub(r'[\\/*?:"<>|]', "_", plate_text)
                    
                    # Create frame filename: plate_trackID_plate_number_timestamp.jpg với timestamp cố định
                    frame_filename = f"plate_{track_id}_{clean_plate_text}_{curr_time}.jpg"
                    frame_path = f"static/crops/{frame_filename}"
                    
                    # Save crop image
                    absolute_frame_path = os.path.join(FRAMES_FOLDER, frame_filename)
                    
                    # Get bbox coordinates for cropping
                    bbox = track_info[track_id]['bbox']
                    if isinstance(bbox, str):
                        bbox = [int(x) for x in bbox.split(',')]
                    
                    if len(bbox) >= 4:
                        crop = crop_and_enhance_plate(frame, bbox, enhancement_level="light")
                        
                        if crop is not None and crop.size > 0:
                            success = cv2.imwrite(absolute_frame_path, crop)
                            if success:
                                logger.info(f"Crop image saved to {absolute_frame_path}")
                            else:
                                logger.warning(f"Failed to save crop image to {absolute_frame_path}")
                        else:
                            logger.warning("Crop area is empty, saving original frame")
                            success = cv2.imwrite(absolute_frame_path, frame)
                    else:
                        logger.warning("Invalid bbox, saving original frame")
                        success = cv2.imwrite(absolute_frame_path, frame)
                    
                    # OPTIMIZED: Async database sending to prevent video pause
                    plate_data = {
                        'plate': track_info[track_id]['plate'],
                        'confidence': track_info[track_id]['confidence'],
                        'bbox': [int(x) for x in track_info[track_id]['bbox'].split(',')]
                    }
                    if ENABLE_THREADING:
                        thread_pool.submit(
                            send_plate_to_server, track_id, plate_data, frame_path, 
                            camera_id=camera_id, source_type=source_type, 
                            video_filename=video_filename, camera_location=camera_location
                        )
                    else:
                        send_plate_to_server(track_id, plate_data, frame_path, 
                                           camera_id=camera_id, source_type=source_type, 
                                           video_filename=video_filename, camera_location=camera_location)
                    logger.info(f"🎯 INACTIVE track '{track_info[track_id]['plate']}' - waiting for app.py to save")
                
                tracks_to_remove.append(track_id)
        
        for track_id in tracks_to_remove:
            if track_id in track_info:
                del track_info[track_id]
            if track_id in plate_history:
                del plate_history[track_id]
        
        last_redis_update = curr_time

    # OPTIMIZED: Less frequent cleanup to improve FPS stability
    if frame_count % 50000000000000000000000 == 0:  # Giảm từ 20000000000000000000000 xuống 50000000000000000000000 frames
        cleanup_tracked_objects()

    # OPTIMIZED: Balanced JPEG quality for stable FPS
    result = {
        'frame': cv2.imencode('.jpg', display_frame, [cv2.IMWRITE_JPEG_QUALITY, 40])[1].tobytes(),  # Tăng lên 40 để ổn định
        'boxes': boxes,
        'labels': labels,
        'ocr_results': ocr_results,
        'tracked_objects': tracked_objects.copy(),
        'ids': list(current_track_ids),
        'frame_width': original_width,
        'frame_height': original_height,
        'roi': [roi_xmin, roi_ymin, roi_xmax, roi_ymax],
        'fps': current_fps,
        'detection_count': len(detections),
        'track_count': len(tracks)
    }
    
    logger.debug(f"Frame {frame_count} completed: {len(boxes)} boxes, {len(labels)} labels, {len(tracked_objects)} tracked objects")
    
    return result

def get_detection_stats():
    """Get detection statistics for monitoring"""
    try:
        current_time = time.time()
        consistent_plates = len([obj for obj in tracked_objects.values() if obj.get('is_consistent', False)])
        
        stats = {
            'total_tracks': len(tracked_objects),
            'plates_detected': len([obj for obj in tracked_objects.values() if obj.get('plate_number') and obj.get('plate_number') != 'Đang nhận diện...']),
            'consistent_plates': consistent_plates,
            'plates_saved': len([obj for obj in tracked_objects.values() if obj.get('saved_to_db')]),
            'current_fps': current_fps,
            'frame_count': frame_count,
            'plate_history_size': len(plate_history),
            'duplicates_prevented': duplicate_counter,
            'consistency_records': len(track_consistency),
            'ocr_attempts': len(ocr_attempts_per_track),
            'consistency_threshold': consistency_threshold,
            'max_ocr_attempts': max_ocr_attempts,
            'last_cleanup': last_cleanup_time,
            'alpr_available': alpr is not None,
            'redis_available': redis_available,
            'roi_info': {
                'type': 'centered_half_frame',
                'x_percent': f"{ROI_PERCENT_XMIN:.0%}-{ROI_PERCENT_XMAX:.0%}",
                'y_percent': f"{ROI_PERCENT_YMIN:.0%}-{ROI_PERCENT_YMAX:.0%}"
            },
            'gpu_info': GPU_INFO,
            'onnx_providers': ONNX_PROVIDERS,
            'optimization_level': GPU_INFO['optimization_level']
        }
        
        return stats
        
    except Exception as e:
        logger.error(f"Error getting detection stats: {e}")
        return {'error': str(e)}

def get_gpu_info():
    """Get GPU information and status"""
    return {
        "gpu_info": GPU_INFO,
        "onnx_providers": ONNX_PROVIDERS,
        "alpr_available": alpr is not None,
        "optimization_level": GPU_INFO['optimization_level'],
        "timestamp": time.time()
    }

def reset_anti_duplicate_system():
    """Reset the entire anti-duplicate system"""
    global tracked_objects, plate_history, duplicate_counter, last_cleanup_time, track_consistency, ocr_attempts_per_track
    
    logger.warning("🔄 RESETTING ANTI-DUPLICATE SYSTEM...")
    
    old_tracked_count = len(tracked_objects)
    old_history_count = len(plate_history)
    old_consistency_count = len(track_consistency)
    old_attempts_count = len(ocr_attempts_per_track)
    
    tracked_objects.clear()
    plate_history.clear()
    track_consistency.clear()
    ocr_attempts_per_track.clear()
    duplicate_counter = 0
    last_cleanup_time = 0
    
    logger.info(f"🔄 Anti-duplicate system reset:")
    logger.info(f"   Tracked objects: {old_tracked_count} -> 0")
    logger.info(f"   Plate history: {old_history_count} -> 0")
    logger.info(f"   Consistency records: {old_consistency_count} -> 0")
    logger.info(f"   OCR attempts: {old_attempts_count} -> 0")
    
    return {
        'success': True,
        'message': 'Anti-duplicate system reset successfully',
        'old_tracked_count': old_tracked_count,
        'old_history_count': old_history_count,
        'old_consistency_count': old_consistency_count,
        'old_attempts_count': old_attempts_count
    }

def get_tracked_objects_status():
    """Get detailed status of tracked_objects for debugging"""
    try:
        if not tracked_objects:
            return {
                'total': 0,
                'valid_plates': 0,
                'duplicates': 0,
                'invalid_plates': 0,
                'vehicles_only': 0,
                'details': {},
                'plate_history_size': len(plate_history),
                'duplicates_prevented': duplicate_counter,
                'consistency_records': len(track_consistency),
                'ocr_attempts': len(ocr_attempts_per_track)
            }
        
        # Analyze tracked_objects
        plate_counts = {}
        invalid_count = 0
        vehicles_only = 0
        consistent_plates = 0
        
        for track_id, obj in tracked_objects.items():
            plate_num = obj.get('plate_number', '')
            confidence = obj.get('confidence', 0)
            is_consistent = obj.get('is_consistent', False)
            
            if not plate_num or plate_num == 'Đang nhận diện...':
                vehicles_only += 1
                continue
            
            if is_consistent:
                consistent_plates += 1
            
            if plate_num not in plate_counts:
                plate_counts[plate_num] = []
            plate_counts[plate_num].append({
                'track_id': track_id,
                'confidence': confidence,
                'is_consistent': is_consistent,
                'first_seen': obj.get('first_seen', 0),
                'last_seen': obj.get('last_seen', 0),
                'ocr_attempts': obj.get('ocr_attempts', 0)
            })
        
        # Find duplicates
        duplicates = {plate: tracks for plate, tracks in plate_counts.items() if len(tracks) > 1}
        
        return {
            'total': len(tracked_objects),
            'valid_plates': len(plate_counts),
            'consistent_plates': consistent_plates,
            'duplicates': len(duplicates),
            'invalid_plates': invalid_count,
            'vehicles_only': vehicles_only,
            'duplicate_details': duplicates,
            'all_plates': plate_counts,
            'plate_history_size': len(plate_history),
            'duplicates_prevented': duplicate_counter,
            'consistency_records': len(track_consistency),
            'ocr_attempts': len(ocr_attempts_per_track),
            'last_cleanup': last_cleanup_time
        }
        
    except Exception as e:
        logger.error(f"Error getting tracked_objects status: {e}")
        return {'error': str(e)}

# Legacy function for backward compatibility
def detect_and_ocr(frame, camera_id=None):
    """Legacy function that returns only the processed frame for backward compatibility"""
    try:
        result = detect_and_ocr_stable(frame, camera_id)
        
        if isinstance(result, dict):
            # Return just the frame bytes for legacy compatibility
            frame_bytes = result.get('frame', b'')
            if frame_bytes:
                # Decode frame bytes back to numpy array
                nparr = np.frombuffer(frame_bytes, np.uint8)
                return cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            else:
                return frame
        else:
            return result
            
    except Exception as e:
        logger.error(f"Error in legacy detect_and_ocr: {e}")
        return frame

# Export main functions
__all__ = [
    'detect_and_ocr_stable',
    'detect_and_ocr',
    'calculate_roi_coordinates',
    'tracked_objects',
    'cleanup_tracked_objects',
    'get_detection_stats',
    'reset_anti_duplicate_system',
    'get_tracked_objects_status',
    'enable_performance_optimizations',
    'get_performance_stats',
    'clear_detection_cache'
]

# PERFORMANCE OPTIMIZATION FUNCTIONS

def get_performance_stats():
    """Get performance statistics"""
    try:
        return {
            'threading_enabled': ENABLE_THREADING,
            'caching_enabled': ENABLE_CACHING,
            'lightweight_mode': ENABLE_LIGHTWEIGHT_MODE,
            'cache_size': len(detection_cache),
            'max_cache_size': cache_size,
            'thread_pool_workers': thread_pool._max_workers,
            'detection_queue_size': detection_queue.qsize(),
            'ocr_queue_size': ocr_queue.qsize(),
            'result_queue_size': result_queue.qsize(),
            'current_fps': current_fps,
            'frame_count': frame_count
        }
    except Exception as e:
        logger.error(f"Error getting performance stats: {e}")
        return {'error': str(e)}

def clear_detection_cache():
    """Clear detection cache"""
    try:
        with cache_lock:
            detection_cache.clear()
        logger.info("🧹 Detection cache cleared")
        return True
    except Exception as e:
        logger.error(f"Error clearing cache: {e}")
        return False

def set_performance_mode(mode='balanced'):
    """Set performance mode: 'fast', 'balanced', 'quality'"""
    global ENABLE_THREADING, ENABLE_CACHING, ENABLE_LIGHTWEIGHT_MODE, ENABLE_REALTIME_ENHANCEMENT
    
    try:
        if mode == 'fast':
            ENABLE_THREADING = True
            ENABLE_CACHING = True
            ENABLE_LIGHTWEIGHT_MODE = True
            ENABLE_REALTIME_ENHANCEMENT = False
            logger.info("🚀 Performance mode set to FAST")
        elif mode == 'balanced':
            ENABLE_THREADING = True
            ENABLE_CACHING = True
            ENABLE_LIGHTWEIGHT_MODE = True  # Bật lightweight mode cho balanced
            ENABLE_REALTIME_ENHANCEMENT = False  # Tắt enhancement cho balanced
            logger.info("⚖️ Performance mode set to BALANCED")
        elif mode == 'quality':
            ENABLE_THREADING = False
            ENABLE_CACHING = False
            ENABLE_LIGHTWEIGHT_MODE = False
            ENABLE_REALTIME_ENHANCEMENT = True
            logger.info("🎯 Performance mode set to QUALITY")
        else:
            logger.error(f"Invalid performance mode: {mode}")
            return False
        
        return True
    except Exception as e:
        logger.error(f"Error setting performance mode: {e}")
        return False