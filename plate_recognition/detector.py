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
from collections import defaultdict, Counter
import requests
import re
import random
import hashlib
from threading import local
import mysql.connector
from mysql.connector import Error

# Image enhancement functions for better OCR quality (from test2.py)
ENHANCEMENT_AVAILABLE = True
ENABLE_REALTIME_ENHANCEMENT = False  # Tắt enhancement để tăng tốc

# Database configuration for Whitelist/Blacklist checking
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': 'root',
    'database': 'license_plate_recognition',
    'port': 3306,
    'charset': 'utf8mb4',
    'autocommit': True
}

def check_plate_against_lists(plate_number):
    """
    Check if plate number exists in BlackList or WhiteList database tables.
    
    Args:
        plate_number (str): The plate number to check
        
    Returns:
        tuple: (is_whitelist_match, is_blacklist_match)
    """
    is_whitelist_match = False
    is_blacklist_match = False
    
    try:
        # Connect to database
        connection = mysql.connector.connect(**DB_CONFIG)
        cursor = connection.cursor()
        
        # Check whitelist
        whitelist_query = """
            SELECT id FROM vehicle_whitelist 
            WHERE plate_number = %s 
            AND is_active = 1 
            AND approval_status = 'approved'
            AND (valid_from IS NULL OR valid_from <= CURDATE())
            AND (valid_to IS NULL OR valid_to >= CURDATE())
            LIMIT 1
        """
        cursor.execute(whitelist_query, (plate_number,))
        whitelist_result = cursor.fetchall()
        is_whitelist_match = len(whitelist_result) > 0
        
        # Check blacklist
        blacklist_query = """
            SELECT id FROM vehicle_blacklist 
            WHERE plate_number = %s 
            AND is_active = 1 
            AND (valid_from IS NULL OR valid_from <= CURDATE())
            AND (valid_to IS NULL OR valid_to >= CURDATE())
            LIMIT 1
        """
        cursor.execute(blacklist_query, (plate_number,))
        blacklist_result = cursor.fetchall()
        is_blacklist_match = len(blacklist_result) > 0
        
        logger.info(f"🔍 BlackList/WhiteList check for '{plate_number}': WL={is_whitelist_match}, BL={is_blacklist_match}")
        
    except Error as e:
        logger.error(f"❌ Database error checking lists: {e}")
    except Exception as e:
        logger.error(f"❌ Error checking BlackList/WhiteList: {e}")
    finally:
        if 'connection' in locals() and connection.is_connected():
            cursor.close()
            connection.close()
    
    return is_whitelist_match, is_blacklist_match

def get_notification_message(plate_number, is_whitelist_match, is_blacklist_match):
    """
    Generate notification message based on whitelist/blacklist match results.
    
    Args:
        plate_number (str): The detected plate number
        is_whitelist_match (bool): Whether plate is in whitelist
        is_blacklist_match (bool): Whether plate is in blacklist
        
    Returns:
        str: Notification message
    """
    if is_blacklist_match:
        return f"🚨 CẢNH BÁO: Phát hiện phương tiện có biển số {plate_number} trong danh sách đen!"
    elif is_whitelist_match:
        return f"✅ XÁC NHẬN: Phát hiện phương tiện có biển số {plate_number} trong danh sách trắng"
    else:
        return f"ℹ️ THÔNG BÁO: Phát hiện phương tiện có biển số {plate_number}"

def crop_and_enhance_plate(frame, bbox, enhancement_level="minimal"):
    """
    Crop vùng biển số với chất lượng ảnh gốc cao nhất.
    
    Args:
        frame: Frame gốc
        bbox: Bounding box [x1, y1, x2, y2] 
        enhancement_level: "minimal", "light", "medium", "high"
    
    Returns:
        High-quality crop image chỉ chứa biển số
    """
    try:
        if frame is None or bbox is None or len(bbox) < 4:
            return None
            
        x1, y1, x2, y2 = bbox[:4]
        
        # Mở rộng bbox một chút để lấy thêm context
        margin = 5
        x1 = max(0, x1 - margin)
        y1 = max(0, y1 - margin)
        x2 = min(frame.shape[1], x2 + margin)
        y2 = min(frame.shape[0], y2 + margin)
        
        # Crop vùng biển số với context
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
        
        # Apply minimal enhancement để giữ chất lượng gốc và tăng tốc
        if enhancement_level == "minimal":
            # Chỉ resize nếu quá nhỏ, giữ nguyên chất lượng
            if h < 40 or w < 120:
                scale = max(40/h, 120/w, 1.5)
                new_w, new_h = int(w * scale), int(h * scale)
                crop = cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
            # Thêm padding nhẹ
            pad = 3
            crop = cv2.copyMakeBorder(crop, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=[255, 255, 255])
        elif enhancement_level == "light":
            # Light enhancement - chỉ cải thiện contrast nhẹ
            if h < 40 or w < 120:
                scale = max(40/h, 120/w, 1.5)
                new_w, new_h = int(w * scale), int(h * scale)
                crop = cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
            # Chỉ cải thiện contrast nhẹ
            lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8,8))
            l = clahe.apply(l)
            lab = cv2.merge([l, a, b])
            crop = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
            # Padding
            pad = 3
            crop = cv2.copyMakeBorder(crop, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=[255, 255, 255])
        elif enhancement_level == "medium":
            # Medium enhancement - cải thiện vừa phải
            if h < 50 or w < 150:
                scale = max(50/h, 150/w, 2.0)
                new_w, new_h = int(w * scale), int(h * scale)
                crop = cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
            # Cải thiện contrast và sharpness
            lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
            l = clahe.apply(l)
            lab = cv2.merge([l, a, b])
            crop = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
            # Unsharp mask nhẹ
            blur = cv2.GaussianBlur(crop, (0, 0), 1.0)
            crop = cv2.addWeighted(crop, 1.2, blur, -0.2, 0)
            # Padding
            pad = 4
            crop = cv2.copyMakeBorder(crop, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=[255, 255, 255])
        elif enhancement_level == "high":
            # High enhancement - chỉ dùng khi cần thiết
            if h < 60 or w < 200:
                scale = max(60/h, 200/w, 2.5)
                new_w, new_h = int(w * scale), int(h * scale)
                crop = cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
            # Advanced enhancement nhưng giữ chi tiết
            try:
                crop = cv2.fastNlMeansDenoisingColored(crop, None, 2, 2, 7, 21)
            except:
                pass
            # CLAHE
            lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8,8))
            l = clahe.apply(l)
            lab = cv2.merge([l, a, b])
            crop = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
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
CROPS_FOLDER = 'static/crops'
os.makedirs(CROPS_FOLDER, exist_ok=True)

# Thread-local storage for per-thread tracking
thread_local = local()

# Thread locks for shared resources
tracked_objects_lock = threading.RLock()
frame_count_lock = threading.RLock()
duplicate_counter_lock = threading.RLock()
last_cleanup_time_lock = threading.RLock()
track_consistency_lock = threading.RLock()
ocr_attempts_per_track_lock = threading.RLock()
plate_history_lock = threading.RLock()
track_saved_plates_lock = threading.RLock()
session_saved_plate_lock = threading.RLock()
persistent_displays_lock = threading.RLock()
roi_tracked_objects_lock = threading.RLock()
roi_object_counter_lock = threading.RLock()
roi_saved_plates_lock = threading.RLock()
global_saved_tracks_lock = threading.RLock()
global_bg_subtractor_lock = threading.RLock()
last_roi_frame_lock = threading.RLock()

# Thread-safe helper functions
def get_thread_local_data():
    """Get thread-local data, initialize if not exists"""
    if not hasattr(thread_local, 'data'):
        thread_local.data = {
            'tracked_objects': {},
            'frame_count': 0,
            'duplicate_counter': 0,
            'last_cleanup_time': 0,
            'track_consistency': {},
            'ocr_attempts_per_track': {},
            'plate_history': {},
            'track_saved_plates': {},
            'session_saved_plate': None,
            'session_save_time': 0,
            'persistent_displays': {},
            'roi_tracked_objects': {},
            'roi_object_counter': 0,
            'roi_saved_plates': {},
            'global_saved_tracks': {},
            'global_bg_subtractor': None,
            'last_roi_frame': None,
            'camera_id': None,
            'source_type': 'camera',
            'video_filename': None,
            'camera_location': None,
            'camera_name': None,
            # FPS tracking variables
            'fps_counter': 0,
            'last_fps_time': time.time(),
            'current_fps': 0,
            'last_detection_time': 0,
            'last_alpr_call_time': 0,
            'last_redis_update': 0,
            'track_info': {},
            'track_id_mapping': {},
            'sent_plates': {}
        }
    return thread_local.data

def safe_get_global(key, default=None):
    """Thread-safe get from global variables"""
    lock_map = {
        'tracked_objects': tracked_objects_lock,
        'frame_count': frame_count_lock,
        'duplicate_counter': duplicate_counter_lock,
        'last_cleanup_time': last_cleanup_time_lock,
        'track_consistency': track_consistency_lock,
        'ocr_attempts_per_track': ocr_attempts_per_track_lock,
        'plate_history': plate_history_lock,
        'track_saved_plates': track_saved_plates_lock,
        'session_saved_plate': session_saved_plate_lock,
        'session_save_time': session_saved_plate_lock,
        'persistent_displays': persistent_displays_lock,
        'roi_tracked_objects': roi_tracked_objects_lock,
        'roi_object_counter': roi_object_counter_lock,
        'roi_saved_plates': roi_saved_plates_lock,
        'global_saved_tracks': global_saved_tracks_lock,
        'global_bg_subtractor': global_bg_subtractor_lock,
        'last_roi_frame': last_roi_frame_lock
    }
    
    if key in lock_map:
        with lock_map[key]:
            return globals()[key] if key in globals() else default
    return default

def safe_set_global(key, value):
    """Thread-safe set global variables"""
    lock_map = {
        'tracked_objects': tracked_objects_lock,
        'frame_count': frame_count_lock,
        'duplicate_counter': duplicate_counter_lock,
        'last_cleanup_time': last_cleanup_time_lock,
        'track_consistency': track_consistency_lock,
        'ocr_attempts_per_track': ocr_attempts_per_track_lock,
        'plate_history': plate_history_lock,
        'track_saved_plates': track_saved_plates_lock,
        'session_saved_plate': session_saved_plate_lock,
        'session_save_time': session_saved_plate_lock,
        'persistent_displays': persistent_displays_lock,
        'roi_tracked_objects': roi_tracked_objects_lock,
        'roi_object_counter': roi_object_counter_lock,
        'roi_saved_plates': roi_saved_plates_lock,
        'global_saved_tracks': global_saved_tracks_lock,
        'global_bg_subtractor': global_bg_subtractor_lock,
        'last_roi_frame': last_roi_frame_lock
    }
    
    if key in lock_map:
        with lock_map[key]:
            globals()[key] = value

def safe_update_global(key, update_func):
    """Thread-safe update global variables using a function"""
    lock_map = {
        'tracked_objects': tracked_objects_lock,
        'frame_count': frame_count_lock,
        'duplicate_counter': duplicate_counter_lock,
        'last_cleanup_time': last_cleanup_time_lock,
        'track_consistency': track_consistency_lock,
        'ocr_attempts_per_track': ocr_attempts_per_track_lock,
        'plate_history': plate_history_lock,
        'track_saved_plates': track_saved_plates_lock,
        'session_saved_plate': session_saved_plate_lock,
        'session_save_time': session_saved_plate_lock,
        'persistent_displays': persistent_displays_lock,
        'roi_tracked_objects': roi_tracked_objects_lock,
        'roi_object_counter': roi_object_counter_lock,
        'roi_saved_plates': roi_saved_plates_lock,
        'global_saved_tracks': global_saved_tracks_lock,
        'global_bg_subtractor': global_bg_subtractor_lock,
        'last_roi_frame': last_roi_frame_lock
    }
    
    if key in lock_map:
        with lock_map[key]:
            current_value = globals()[key] if key in globals() else {}
            globals()[key] = update_func(current_value)

# Thread Manager for Multi-Stream Processing
class ThreadManager:
    def __init__(self, max_workers=8):
        self.max_workers = max_workers
        self.active_threads = {}
        self.thread_pool = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="detector")
        self.thread_locks = {}
        self.cleanup_interval = 30  # seconds
        self.last_cleanup = time.time()
        
    def get_thread_id(self):
        """Get current thread ID"""
        return threading.get_ident()
    
    def get_thread_lock(self, thread_id):
        """Get or create lock for specific thread"""
        if thread_id not in self.thread_locks:
            self.thread_locks[thread_id] = threading.RLock()
        return self.thread_locks[thread_id]
    
    def register_thread(self, thread_id, camera_id, source_type="camera", video_filename=None, camera_location=None, camera_name=None):
        """Register a new thread with camera info"""
        with self.get_thread_lock(thread_id):
            self.active_threads[thread_id] = {
                'camera_id': camera_id,
                'source_type': source_type,
                'video_filename': video_filename,
                'camera_location': camera_location,
                'camera_name': camera_name,
                'start_time': time.time(),
                'frame_count': 0,
                'last_activity': time.time()
            }
            logger.info(f"Registered thread {thread_id} for camera {camera_id}")
    
    def unregister_thread(self, thread_id):
        """Unregister a thread"""
        with self.get_thread_lock(thread_id):
            if thread_id in self.active_threads:
                del self.active_threads[thread_id]
                if thread_id in self.thread_locks:
                    del self.thread_locks[thread_id]
                logger.info(f"Unregistered thread {thread_id}")
    
    def update_thread_activity(self, thread_id):
        """Update thread activity timestamp"""
        if thread_id in self.active_threads:
            self.active_threads[thread_id]['last_activity'] = time.time()
            self.active_threads[thread_id]['frame_count'] += 1
    
    def get_thread_info(self, thread_id):
        """Get thread information"""
        return self.active_threads.get(thread_id, {})
    
    def cleanup_inactive_threads(self):
        """Clean up inactive threads"""
        current_time = time.time()
        if current_time - self.last_cleanup < self.cleanup_interval:
            return
        
        inactive_threads = []
        for thread_id, info in self.active_threads.items():
            if current_time - info['last_activity'] > 60:  # 1 minute timeout
                inactive_threads.append(thread_id)
        
        for thread_id in inactive_threads:
            self.unregister_thread(thread_id)
            logger.info(f"Cleaned up inactive thread {thread_id}")
        
        self.last_cleanup = current_time
    
    def get_active_thread_count(self):
        """Get number of active threads"""
        return len(self.active_threads)
    
    def get_thread_stats(self):
        """Get thread statistics"""
        stats = {
            'active_threads': len(self.active_threads),
            'max_workers': self.max_workers,
            'threads': {}
        }
        
        for thread_id, info in self.active_threads.items():
            stats['threads'][thread_id] = {
                'camera_id': info['camera_id'],
                'source_type': info['source_type'],
                'frame_count': info['frame_count'],
                'uptime': time.time() - info['start_time'],
                'last_activity': info['last_activity']
            }
        
        return stats

# Global thread manager instance
thread_manager = ThreadManager(max_workers=8)

def detect_and_ocr_thread_safe(frame, camera_id=None, source_type="camera", video_filename=None, camera_location=None, camera_name=None):
    """Thread-safe wrapper for detect_and_ocr_stable"""
    try:
        # Clean up inactive threads periodically
        thread_manager.cleanup_inactive_threads()
        
        # Get thread-specific data container to prevent cross-stream contamination
        thread_container = get_thread_data_container()
        
        # Process frame with thread-safe detection
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
        future = thread_manager.thread_pool.submit(
            detect_and_ocr_thread_safe,
            frame, camera_id, source_type, video_filename, camera_location, camera_name
        )
        return future
    except Exception as e:
        logger.error(f"Error submitting frame to thread pool: {str(e)}")
        return None

def get_thread_manager_stats():
    """Get thread manager statistics"""
    return thread_manager.get_thread_stats()

# THREAD-SAFE: Per-thread data structures to prevent cross-stream contamination
# Each thread will have its own isolated data
thread_data_containers = {}  # {thread_id: {data...}}

def get_thread_data_container():
    """Get thread-specific data container to prevent cross-stream contamination"""
    thread_id = threading.get_ident()
    if thread_id not in thread_data_containers:
        # Thread-specific configuration for multi-stream optimization
        if GPU_INFO['cuda_available']:
            # GPU optimized for 20 FPS per stream
            detection_cooldown = 0.05
            motion_cooldown = 0.03
            max_skip_frames = 0
        else:
            # CPU optimized for 20 FPS per stream
            detection_cooldown = 0.05  # Giảm cooldown
            motion_cooldown = 0.03     # Giảm cooldown
            max_skip_frames = 0        # Không skip frames
            
        thread_data_containers[thread_id] = {
            'tracked_objects': {},
            'frame_count': 0,
            'duplicate_counter': 0,
            'last_cleanup_time': 0,
            'track_consistency': {},
            'ocr_attempts_per_track': {},
            'plate_history': {},
            'track_saved_plates': {},
            'session_saved_plate': None,
            'session_save_time': 0,
            'persistent_displays': {},
            'display_timeout': 0.0,
            'roi_tracked_objects': {},
            'roi_object_counter': 0,
            'roi_saved_plates': {},
            'global_saved_tracks': {},
            # Thread-specific performance settings
            'detection_cooldown': detection_cooldown,
            'motion_cooldown': motion_cooldown,
            'max_skip_frames': max_skip_frames,
            'skip_frame_count': 0,
            'last_detection_time': 0,
            'last_motion_time': 0,
            # Thread-specific background subtractor
            'bg_subtractor': None
        }
    return thread_data_containers[thread_id]

def get_thread_safe_data(key):
    """Get thread-safe data by key to prevent cross-stream contamination"""
    thread_container = get_thread_data_container()
    return thread_container.get(key, {})

def set_thread_safe_data(key, value):
    """Set thread-safe data by key to prevent cross-stream contamination"""
    thread_container = get_thread_data_container()
    thread_container[key] = value

def update_thread_safe_data(key, update_func):
    """Update thread-safe data by key to prevent cross-stream contamination"""
    thread_container = get_thread_data_container()
    if key not in thread_container:
        thread_container[key] = {}
    thread_container[key] = update_func(thread_container[key])

# Legacy global variables for backward compatibility (will be deprecated)
tracked_objects = {}
frame_count = 0
duplicate_counter = 0
last_cleanup_time = 0
track_consistency = {}
ocr_attempts_per_track = {}
plate_history = {}
track_saved_plates = {}
session_saved_plate = None
session_save_time = 0
persistent_displays = {}
display_timeout = 0.0
roi_tracked_objects = {}
roi_object_counter = 0
roi_saved_plates = {}
global_saved_tracks = {}

# Global background subtractor for motion detection
global_bg_subtractor = None
last_roi_frame = None

# Frame skipping variables - THREAD-SPECIFIC FOR MULTI-STREAM OPTIMIZATION
# Note: These are now thread-local variables to prevent contention between streams
if GPU_INFO['cuda_available']:
    print("🎮 Using GPU-optimized settings for multi-stream 20 FPS")
else:
    print("💻 Using CPU-optimized settings for multi-stream 20 FPS")

# Anti-duplicate settings - GIẢM THRESHOLD ĐỂ LƯU DỮ LIỆU NHANH HƠN
consistency_threshold = 2  # Giảm xuống 2 để lưu nhanh hơn
max_ocr_attempts = 12      # Tăng số lần thử OCR để cải thiện accuracy
consistency_window = 10    # Giảm cửa sổ consistency

# Configuration - OPTIMIZED FOR VEHICLE AND LICENSE PLATE DETECTION
# ROI mở rộng để phát hiện sớm hơn
# ROI mở rộng để phát hiện sớm hơn - GIỮ NGUYÊN KÍCH THƯỚC
ROI_PERCENT_XMIN = 0.0    # Bắt đầu từ 0% chiều rộng (toàn bộ chiều rộng)
ROI_PERCENT_YMIN = 0.15   # Bắt đầu từ 15% chiều cao (mở rộng lên trên)
ROI_PERCENT_XMAX = 1.0    # Kết thúc ở 100% chiều rộng (toàn bộ chiều rộng)
ROI_PERCENT_YMAX = 0.85   # Kết thúc ở 85% chiều cao (mở rộng xuống dưới)

# Dynamic configuration optimized for 20 FPS - ULTRA LOW THRESHOLDS FOR IMMEDIATE DISPLAY
if GPU_INFO['cuda_available']:
    # GPU-optimized settings for IMMEDIATE display
    MIN_CONFIDENCE = 0.3      # ULTRA LOW threshold for immediate display
    MIN_OCR_CONFIDENCE = 0.4  # ULTRA LOW threshold for immediate display
    MIN_PLATE_LENGTH = 4      # Reduced minimum length
    MAX_PLATE_LENGTH = 15
    print("🎮 Using GPU-optimized settings for IMMEDIATE DISPLAY MODE")
else:
    # CPU-optimized settings for IMMEDIATE display
    MIN_CONFIDENCE = 0.35     # ULTRA LOW threshold for immediate display
    MIN_OCR_CONFIDENCE = 0.45 # ULTRA LOW threshold for immediate display
    MIN_PLATE_LENGTH = 4      # Reduced minimum length
    MAX_PLATE_LENGTH = 15
    print("💻 Using CPU-optimized settings for IMMEDIATE DISPLAY MODE")

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
# Note: detection_cooldown and last_detection_time are now thread-local

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
    
    # Khởi tạo ByteTracker với tham số tối ưu cho ROI tracking ổn định
    try:
        byte_tracker = BYTETracker(
            track_thresh=0.5,    # Tăng threshold để track ổn định hơn
            track_buffer=500,     # Giảm buffer để track nhanh hơn trong ROI
            match_thresh=0.8,    # Tăng threshold để match chính xác hơn
            frame_rate=20        # Giảm frame rate để ổn định hơn
        )
        logger.info("ByteTracker initialized successfully - STABLE ROI TRACKING MODE")
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

# Khởi tạo ByteTrack với tham số tối ưu cho ROI tracking ổn định - STABLE MODE
tracker = BYTETracker(
    track_thresh=0.5,  # Tăng threshold để track ổn định hơn
    track_buffer=500,   # Giảm buffer để track nhanh hơn trong ROI
    match_thresh=0.8,  # Tăng threshold để match chính xác hơn
    frame_rate=20      # Giảm frame rate để ổn định hơn
)

# Lưu lịch sử biển số và ánh xạ track_id - THEO LOGIC TEST.PY
track_info = {}
track_id_mapping = {}  # Ánh xạ từ track_id mới sang track_id cũ
plate_to_track_id = defaultdict(list)  # Ánh xạ từ biển số sang track_id
plate_history = {}  # Lưu lịch sử biển số cho mỗi track_id: {track_id: [(plate, conf), ...]}

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
def send_plate_to_server(track_id, plate_data, frame_path=None, camera_id=None, source_type="camera", video_filename=None, camera_location=None, camera_name=None):
    try:
        current_time = time.time()
        plate_text = plate_data['plate']
        
        # KIỂM TRA MỚI: Mỗi track chỉ lưu 1 biển số duy nhất - THREAD SAFE
        track_saved_plates_data = safe_get_global('track_saved_plates', {})
        if track_id in track_saved_plates_data:
            if track_saved_plates_data[track_id] == plate_text:
                logger.info(f"⏭️ Track {track_id} đã lưu biển số '{plate_text}' rồi, bỏ qua")
                return
            else:
                logger.info(f"🔄 Track {track_id} thay đổi biển số từ '{track_saved_plates_data[track_id]}' sang '{plate_text}'")
        
        # Kiểm tra nếu biển số đã được gửi trong vòng 5 phút (toàn hệ thống) - THREAD SAFE
        sent_plates_data = safe_get_global('sent_plates', {})
        if plate_text in sent_plates_data:
            last_sent_time = sent_plates_data[plate_text]
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
        
        # Check BlackList and WhiteList matches - IMPLEMENTED
        is_whitelist_match = False
        is_blacklist_match = False
        
        # Process plate text to ensure correct format
        processed_plate = process_plate_text(plate_data['plate'])
        
        try:
            # Query database for BlackList and WhiteList matches
            is_whitelist_match, is_blacklist_match = check_plate_against_lists(processed_plate)
            logger.info(f"🔍 BlackList/WhiteList check for '{processed_plate}': WL={is_whitelist_match}, BL={is_blacklist_match}")
        except Exception as e:
            logger.error(f"❌ Error checking BlackList/WhiteList: {e}")
            # Keep default values if check fails
            is_whitelist_match = False
            is_blacklist_match = False
        
        # Tạo hash ngắn từ unique_string
        unique_hash = hashlib.md5(unique_string.encode()).hexdigest()[:8]
        
        if not processed_plate:
            logger.warning(f"⚠️ Plate text '{plate_data['plate']}' failed format validation, skipping...")
            return False
        
        # FIXED: Create actual crop image from bbox
        crop_image_path = ""
        if 'bbox' in plate_data and len(plate_data['bbox']) >= 4:
            try:
                # Get the current frame from thread data
                thread_container = get_thread_data_container()
                current_frame = thread_container.get('last_roi_frame')
                
                if current_frame is not None:
                    # Validate bbox coordinates
                    bbox = plate_data['bbox']
                    x1, y1, x2, y2 = bbox[:4]
                    
                    # Ensure bbox is within frame bounds
                    frame_height, frame_width = current_frame.shape[:2]
                    x1 = max(0, min(x1, frame_width - 1))
                    y1 = max(0, min(y1, frame_height - 1))
                    x2 = max(x1 + 1, min(x2, frame_width))
                    y2 = max(y1 + 1, min(y2, frame_height))
                    
                    # Check if bbox is valid
                    if x2 > x1 and y2 > y1 and (x2 - x1) > 10 and (y2 - y1) > 10:
                        # Create crop image with validated bbox
                        crop = crop_and_enhance_plate(current_frame, [x1, y1, x2, y2], enhancement_level="minimal")
                        
                        if crop is not None and crop.size > 0:
                            # Save crop image
                            clean_plate_text = re.sub(r'[\\/*?:"<>|]', "_", processed_plate)
                            crop_filename = f"plate_{camera_id}_{track_id}_{clean_plate_text}_{int(current_time)}.jpg"
                            crop_path = os.path.join(CROPS_FOLDER, crop_filename)
                            
                            success = cv2.imwrite(crop_path, crop)
                            if success:
                                crop_image_path = f"static/crops/{crop_filename}"
                                logger.info(f"✅ Crop image saved: {crop_image_path} (bbox: {x1},{y1}-{x2},{y2})")
                            else:
                                logger.warning(f"⚠️ Failed to save crop image: {crop_path}")
                        else:
                            logger.warning(f"⚠️ Invalid crop image for plate '{processed_plate}' (bbox: {x1},{y1}-{x2},{y2})")
                    else:
                        logger.warning(f"⚠️ Invalid bbox for plate '{processed_plate}': {bbox} -> ({x1},{y1}-{x2},{y2})")
                else:
                    logger.warning(f"⚠️ No current frame available for cropping")
            except Exception as e:
                logger.error(f"❌ Error creating crop image: {e}")
            
        data = {
            "detection_uuid": f"cam_{camera_id}_{unique_hash}",
            "plate_number": processed_plate,
            "raw_plate_text": plate_data['plate'],
            "camera_id": camera_id or 1,
            "location_id": 1,
            "detected_at": current_time,  # Send as Unix timestamp in seconds
            "confidence_score": overall_confidence,
            "ocr_confidence": ocr_confidence,
            "detection_confidence": detection_confidence,
            "bbox": plate_data['bbox'],
            "frame_path": frame_path or "",
            "crop_image_path": crop_image_path,  # FIXED: Use actual crop image path
            "detected_vehicle_type": "other",
            "source_type": source_type,
            "video_filename": video_filename,
            "camera_location": camera_location,
            "camera_name": camera_name or (f"Camera_{camera_id}" if camera_id else "Camera_1"),
            "is_whitelist_match": is_whitelist_match,
            "is_blacklist_match": is_blacklist_match,
            "alert_triggered": is_blacklist_match,  # Trigger alert for blacklist matches
            "notification_message": get_notification_message(processed_plate, is_whitelist_match, is_blacklist_match)
        }
        
        # Gửi trực tiếp tới Node.js API (như test files)
        url = "http://localhost:5000/api/plate-recognitions/detected-plates"
        
        logger.info(f"🔄 Sending plate data to Node.js API: {processed_plate}")
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
                logger.info(f"✅ Biển số {processed_plate} đã lưu vào database thành công!")
                # Cập nhật thời gian gửi cuối cùng - THREAD SAFE
                safe_update_global('sent_plates', lambda x: {**x, processed_plate: current_time})
                # Cập nhật track đã lưu biển số này - THREAD SAFE
                safe_update_global('track_saved_plates', lambda x: {**x, track_id: processed_plate})
                return True
            else:
                logger.error(f"❌ Lỗi lưu biển số vào database: {response.status_code}")
                return False
        except requests.exceptions.Timeout:
            logger.error(f"⏰ Timeout khi gửi biển số {processed_plate} tới Node.js API")
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

def calculate_plate_similarity(plate1, plate2):
    """Tính độ tương đồng giữa hai biển số sử dụng Levenshtein distance"""
    if not plate1 or not plate2:
        return 0.0
    
    # Normalize plates
    p1 = plate1.upper().strip()
    p2 = plate2.upper().strip()
    
    if p1 == p2:
        return 1.0
    
    # Calculate Levenshtein distance
    distance = levenshtein_distance(p1, p2)
    max_len = max(len(p1), len(p2))
    
    if max_len == 0:
        return 0.0
    
    # Convert distance to similarity (0-1 scale)
    similarity = 1.0 - (distance / max_len)
    return max(0.0, similarity)

def find_similar_plates(target_plate, plate_dict, similarity_threshold=0.6):
    """Tìm các biển số tương tự trong dictionary"""
    similar_plates = []
    target_plate_clean = target_plate.upper().strip()
    
    for plate_text, plate_data in plate_dict.items():
        if plate_text == target_plate_clean:
            continue
            
        similarity = calculate_plate_similarity(target_plate_clean, plate_text)
        if similarity >= similarity_threshold:
            similar_plates.append({
                'plate': plate_text,
                'similarity': similarity,
                'data': plate_data
            })
    
    # Sort by similarity (highest first)
    similar_plates.sort(key=lambda x: x['similarity'], reverse=True)
    return similar_plates

def check_duplicate_by_key(plate_text, plate_history):
    """Kiểm tra trùng lặp trực tiếp qua key plate:{text}"""
    clean_text = plate_text.upper().strip()
    return clean_text in plate_history

def update_plate_if_better(plate_text, confidence, plate_history, track_id=None):
    """Cập nhật thông tin biển số nếu có độ tin cậy cao hơn"""
    clean_text = plate_text.upper().strip()
    
    if clean_text in plate_history:
        existing = plate_history[clean_text]
        existing_conf = existing.get('confidence', 0.0)
        
        # Update if significantly better (10% improvement threshold) - more sensitive
        if confidence > existing_conf * 1.10:
            # Optimized: Remove logging for better FPS
            plate_history[clean_text].update({
                'confidence': confidence,
                'timestamp': time.time(),
                'updated_count': existing.get('updated_count', 0) + 1,
                'track_id': track_id,
                'last_updated': time.time()
            })
            return True, "updated"
        else:
            return False, "not_better"
    else:
        # New plate
        plate_history[clean_text] = {
            'confidence': confidence,
            'timestamp': time.time(),
            'updated_count': 1,
            'saved_once': True,
            'track_id': track_id,
            'last_updated': time.time()
        }
        return True, "new"

def group_similar_plates_at_end(plate_history, similarity_threshold=0.6):
    """Nhóm các biển số tương tự ở cuối quá trình xử lý - OPTIMIZED"""
    try:
        current_time = time.time()
        grouped_plates = {}
        processed_plates = set()
        
        # Tạo danh sách tất cả biển số với thông tin
        all_plates = list(plate_history.items())
        
        for plate_text, plate_data in all_plates:
            if plate_text in processed_plates:
                continue
                
            # Tìm tất cả biển số tương tự
            similar_plates = find_similar_plates(plate_text, plate_history, similarity_threshold)
            
            if similar_plates:
                # Tạo nhóm với biển số có độ tin cậy cao nhất
                group_plates = [{'plate': plate_text, 'data': plate_data}] + similar_plates
                
                # Sắp xếp theo độ tin cậy (cao nhất trước)
                group_plates.sort(key=lambda x: x['data'].get('confidence', 0.0), reverse=True)
                
                # Lấy biển số tốt nhất làm đại diện
                best_plate = group_plates[0]
                best_text = best_plate['plate']
                best_data = best_plate['data']
                
                # Cập nhật thông tin nhóm
                grouped_plates[best_text] = {
                    'confidence': best_data.get('confidence', 0.0),
                    'timestamp': best_data.get('timestamp', current_time),
                    'updated_count': best_data.get('updated_count', 1),
                    'saved_once': True,
                    'track_id': best_data.get('track_id'),
                    'last_updated': current_time,
                    'grouped_plates': [p['plate'] for p in group_plates],
                    'similarity_scores': [p.get('similarity', 1.0) for p in group_plates]
                }
                
                # Đánh dấu tất cả biển số trong nhóm đã xử lý
                for p in group_plates:
                    processed_plates.add(p['plate'])
                
                # Optimized: Remove logging for better FPS
            else:
                # Biển số không có tương tự, giữ nguyên
                grouped_plates[plate_text] = plate_data
                processed_plates.add(plate_text)
        
        return grouped_plates
        
    except Exception as e:
        logger.error(f"Error grouping similar plates: {e}")
        return plate_history

def update_tracking_display_with_confidence(track_id, plate_text, confidence, bbox, frame):
    """Cập nhật hiển thị tracking với thông tin độ tin cậy mới - THREAD SAFE"""
    # Get thread-safe data
    persistent_displays = get_thread_safe_data('persistent_displays')
    
    try:
        current_time = time.time()
        
        # Kiểm tra xem có cần cập nhật không
        if track_id in persistent_displays:
            existing = persistent_displays[track_id]
            existing_conf = existing.get('confidence', 0.0)
            
            # Chỉ cập nhật nếu độ tin cậy cao hơn đáng kể
            if confidence > existing_conf * 1.1:  # 10% improvement threshold
                logger.info(f"🔄 UPDATING tracking display for track {track_id}: '{plate_text}' (conf: {existing_conf:.3f} -> {confidence:.3f})")
                
                # Cập nhật persistent display
                persistent_displays[track_id].update({
                    'plate': plate_text,
                    'bbox': bbox,
                    'confidence': confidence,
                    'last_seen': current_time,
                    'updated_count': existing.get('updated_count', 0) + 1
                })
                
                # REMOVED: Không vẽ text nhận diện trong update_tracking_display_with_confidence
                # Chỉ cập nhật data, text sẽ được vẽ trong detect_and_ocr_stable
                
                return True
        else:
            # Tạo mới persistent display
            persistent_displays[track_id] = {
                'plate': plate_text,
                'bbox': bbox,
                'confidence': confidence,
                'last_seen': current_time,
                'updated_count': 1
            }
            return True
            
    except Exception as e:
        logger.error(f"Error updating tracking display: {e}")
        return False

def get_enhanced_plate_history():
    """Lấy thông tin chi tiết về lịch sử biển số với thông tin similarity - THREAD SAFE"""
    try:
        # Use thread-safe access to plate_history
        plate_history_data = safe_get_global('plate_history', {})
        
        result = {
            'total_plates': len(plate_history_data),
            'plates': {},
            'similarity_groups': []
        }
        
        # Thêm thông tin chi tiết cho mỗi biển số
        for plate_text, plate_data in plate_history_data.items():
            result['plates'][plate_text] = {
                'confidence': plate_data.get('confidence', 0.0),
                'timestamp': plate_data.get('timestamp', 0),
                'updated_count': plate_data.get('updated_count', 1),
                'track_id': plate_data.get('track_id'),
                'last_updated': plate_data.get('last_updated', 0),
                'replaced_plate': plate_data.get('replaced_plate'),
                'grouped_plates': plate_data.get('grouped_plates', [plate_text]),
                'similarity_scores': plate_data.get('similarity_scores', [1.0])
            }
        
        # Tìm các nhóm tương tự
        processed_plates = set()
        for plate_text in plate_history_data.keys():
            if plate_text in processed_plates:
                continue
                
            similar_plates = find_similar_plates(plate_text, plate_history_data, similarity_threshold=0.6)
            if similar_plates:
                group = [plate_text] + [p['plate'] for p in similar_plates]
                result['similarity_groups'].append({
                    'group': group,
                    'best_plate': plate_text,
                    'similarities': [1.0] + [p['similarity'] for p in similar_plates]
                })
                processed_plates.update(group)
            else:
                result['similarity_groups'].append({
                    'group': [plate_text],
                    'best_plate': plate_text,
                    'similarities': [1.0]
                })
                processed_plates.add(plate_text)
        
        return result
        
    except Exception as e:
        logger.error(f"Error getting enhanced plate history: {e}")
        return {'error': str(e)}

def should_skip_frame(frame, roi):
    """Kiểm tra xem có nên skip frame này không - THREAD-SAFE"""
    # Get thread-specific data
    thread_container = get_thread_data_container()
    
    current_time = time.time()
    skip_frame_count = thread_container.get('skip_frame_count', 0)
    last_detection_time = thread_container.get('last_detection_time', 0)
    detection_cooldown = thread_container.get('detection_cooldown', 0.05)
    last_motion_time = thread_container.get('last_motion_time', 0)
    motion_cooldown = thread_container.get('motion_cooldown', 0.03)
    max_skip_frames = thread_container.get('max_skip_frames', 0)
    
    # Nếu có detection gần đây, không skip
    if current_time - last_detection_time < detection_cooldown:
        thread_container['skip_frame_count'] = 0
        return False
    
    # Kiểm tra chuyển động trong ROI trước khi quyết định skip
    has_motion = has_motion_in_roi(frame, roi)
    
    if has_motion:
        # Có chuyển động, reset skip counter và xử lý frame
        thread_container['skip_frame_count'] = 0
        thread_container['last_motion_time'] = current_time
        logger.debug(f"🔄 Motion detected in ROI - processing frame")
        return False
    
    # Nếu vừa có chuyển động gần đây, vẫn xử lý frame để phát hiện phương tiện mới
    if current_time - last_motion_time < motion_cooldown:
        thread_container['skip_frame_count'] = 0
        logger.debug(f"🔄 Recent motion - processing frame to detect new vehicles")
        return False
    
    # Không có chuyển động, có thể skip
    # Nhưng vẫn phải xử lý định kỳ để phát hiện phương tiện mới
    if skip_frame_count >= max_skip_frames:
        # Đã skip quá nhiều frame, phải xử lý để phát hiện phương tiện mới
        thread_container['skip_frame_count'] = 0
        logger.debug(f"🔄 Max skip reached - processing frame to detect new vehicles")
        return False
    
    # Skip frame
    thread_container['skip_frame_count'] = skip_frame_count + 1
    logger.debug(f"⏭️ Skipping frame - no motion in ROI (skip: {thread_container['skip_frame_count']}/{max_skip_frames})")
    return True

def has_motion_in_roi(frame, roi):
    """Kiểm tra xem có chuyển động trong ROI không - THREAD-SAFE"""
    try:
        roi_xmin, roi_ymin, roi_xmax, roi_ymax = roi
        roi_frame = frame[roi_ymin:roi_ymax, roi_xmin:roi_xmax]
        
        if roi_frame.size == 0:
            return True  # Nếu ROI rỗng, xử lý frame để an toàn
        
        # Chuyển sang grayscale
        gray = cv2.cvtColor(roi_frame, cv2.COLOR_BGR2GRAY)
        
        # Sử dụng thread-local background subtractor để tránh contention
        thread_container = get_thread_data_container()
        if 'bg_subtractor' not in thread_container or thread_container['bg_subtractor'] is None:
            thread_container['bg_subtractor'] = cv2.createBackgroundSubtractorMOG2(
                history=300, varThreshold=16, detectShadows=True
            )
        
        # Áp dụng background subtraction
        fg_mask = thread_container['bg_subtractor'].apply(gray)
        
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
    
    # Common OCR errors for Vietnamese plates - CẢI THIỆN NHẬN DIỆN SỐ
    replacements = {
        # Số và chữ cái thường bị nhầm - FIXED: Thêm lỗi 8 thành 0
        'O': '0', 'I': '1', 'S': '5', 'G': '6', 'B': '8', 'Z': '2',
        'L': '1', 'T': '7', 'J': '1', 'Q': '0', 'U': '0', 'V': 'U',
        'W': 'VV', 'X': 'XX', 'Y': 'Y', 'K': 'K', 'M': 'M', 'N': 'N',
        'P': 'P', 'R': 'R', 'A': 'A', 'C': 'C', 'D': 'D', 'E': 'E',
        'F': 'F', 'H': 'H',
        
        # FIXED: Xử lý lỗi số thường gặp - chỉ áp dụng trong context cụ thể
        # Không thay thế trực tiếp vì có thể gây lỗi
        
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
    
    # FIXED: Xử lý lỗi OCR thông minh dựa trên context
    text = fix_common_ocr_errors_smart(text)
    
    return text.strip()

def fix_common_ocr_errors_smart(text):
    """Xử lý lỗi OCR thông minh dựa trên context của biển số Việt Nam"""
    if not text or len(text) < 4:
        return text
    
    # FIXED: Xử lý lỗi OCR phổ biến trong biển số Việt Nam
    # Pattern: XXY-ZZZ.WW
    
    # Xử lý lỗi 0 thành 8 trong vị trí thứ 2 (ví dụ: 80A -> 88A)
    if re.match(r'^8[0-9][A-Z]', text):
        # Nếu có 8 ở đầu và số thứ 2 là 0-9, có thể là lỗi OCR
        # Chỉ sửa nếu có pattern hợp lệ và confidence cao
        if re.match(r'^80[A-Z]', text):
            # Trong trường hợp cụ thể này, có thể là lỗi 8 thành 0
            # Nhưng cần kiểm tra kỹ hơn
            pass
    
    # Xử lý lỗi 0 thành 8 trong vị trí thứ 2 (ví dụ: 80A -> 88A)
    if re.match(r'^[0-9]0[A-Z]', text):
        # Nếu có 0 ở vị trí thứ 2, có thể là lỗi OCR
        # Chỉ sửa nếu có pattern hợp lệ
        if re.match(r'^80[A-Z]', text):
            # Trong trường hợp cụ thể này, có thể là lỗi 8 thành 0
            # Nhưng cần kiểm tra kỹ hơn
            pass
    
    return text

def is_valid_vietnam_plate_format(text):
    """Kiểm tra format biển số Việt Nam có hợp lệ không"""
    if not text or not isinstance(text, str):
        return False
    
    # Loại bỏ khoảng trắng
    text = re.sub(r'\s+', '', text.upper())
    
    # FORMAT CHÍNH XÁC DỰA TRÊN HÌNH ẢNH: XXY-ZZZ.WW
    vietnam_plate_patterns = [
        r'^\d{2}[A-Z]-\d{3}\.\d{2}$',          # 30A-390.59, 68A-410.30
        r'^\d{2}[A-Z]-\d{3}\.\d{2}$',          # 24A-410.10 (xe máy)
    ]
    
    return any(re.match(pattern, text) for pattern in vietnam_plate_patterns)

def add_vietnam_plate_formatting(text):
    """Thêm dấu - và . vào biển số Việt Nam nếu thiếu - DỰA TRÊN FORMAT THỰC TẾ"""
    if not text or not isinstance(text, str):
        return text
    
    # Loại bỏ khoảng trắng
    text = re.sub(r'\s+', '', text.upper())
    
    # Nếu đã có dấu - và ., trả về nguyên văn
    if '-' in text and '.' in text:
        return text
    
    # FORMAT CHÍNH XÁC DỰA TRÊN HÌNH ẢNH: XXY-ZZZ.WW
    # Ví dụ: 30F-256.58, 51G-499.98
    
    # Pattern 1: 30F25658 -> 30F-256.58
    # Tìm pattern: 2 số + 1 chữ + 5 số (tổng 8 ký tự)
    pattern1 = r'^(\d{2})([A-Z])(\d{5})$'
    match1 = re.match(pattern1, text)
    if match1:
        prefix, letter, suffix = match1.groups()
        # Tách 3 số đầu và 2 số cuối
        main_part = suffix[:3]
        dot_part = suffix[3:]
        return f"{prefix}{letter}-{main_part}.{dot_part}"
    
    # Pattern 2: 30F125658 -> 30F1-256.58
    # Tìm pattern: 2 số + 1 chữ + 1 số + 5 số (tổng 9 ký tự)
    pattern2 = r'^(\d{2})([A-Z])(\d)(\d{5})$'
    match2 = re.match(pattern2, text)
    if match2:
        prefix, letter, digit, suffix = match2.groups()
        # Tách 3 số đầu và 2 số cuối
        main_part = suffix[:3]
        dot_part = suffix[3:]
        return f"{prefix}{letter}{digit}-{main_part}.{dot_part}"
    
    # Pattern 3: 30F256 -> 30F-256.00
    # Tìm pattern: 2 số + 1 chữ + 3 số (tổng 6 ký tự)
    pattern3 = r'^(\d{2})([A-Z])(\d{3})$'
    match3 = re.match(pattern3, text)
    if match3:
        prefix, letter, suffix = match3.groups()
        return f"{prefix}{letter}-{suffix}.00"
    
    # Pattern 4: 30F1256 -> 30F1-256.00
    # Tìm pattern: 2 số + 1 chữ + 1 số + 3 số (tổng 7 ký tự)
    pattern4 = r'^(\d{2})([A-Z])(\d)(\d{3})$'
    match4 = re.match(pattern4, text)
    if match4:
        prefix, letter, digit, suffix = match4.groups()
        return f"{prefix}{letter}{digit}-{suffix}.00"
    
    # Pattern 5: 30F25658 -> 30F-256.58 (alternative for 8 chars)
    # Tìm pattern: 2 số + 1 chữ + 5 số (tổng 8 ký tự) - fallback
    pattern5 = r'^(\d{2})([A-Z])(\d{5})$'
    match5 = re.match(pattern5, text)
    if match5:
        prefix, letter, suffix = match5.groups()
        # Tách 3 số đầu và 2 số cuối
        main_part = suffix[:3]
        dot_part = suffix[3:]
        return f"{prefix}{letter}-{main_part}.{dot_part}"
    
    # Nếu không match pattern nào, trả về nguyên văn
    return text

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
    
    # Detection confidence check - BALANCED - Sử dụng MIN_CONFIDENCE
    if confidence < MIN_CONFIDENCE:  # Sử dụng MIN_CONFIDENCE thay vì hardcode 0.6
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

def should_save_plate(plate_text, confidence, track_id=None, ocr_confidence=None, bbox=None):
    """OPTIMIZED save logic - simplified for 20 FPS performance - THREAD SAFE"""
    # Get thread-safe data
    plate_history = get_thread_safe_data('plate_history')
    track_consistency = get_thread_safe_data('track_consistency')
    ocr_attempts_per_track = get_thread_safe_data('ocr_attempts_per_track')
    
    if not plate_text or not isinstance(plate_text, str):
        return False
    
    clean_text = plate_text.upper().strip()
    
    # SIMPLIFIED validation - chỉ kiểm tra cơ bản để tăng tốc độ
    if len(clean_text) < MIN_PLATE_LENGTH or len(clean_text) > MAX_PLATE_LENGTH:
        logger.debug(f"❌ Invalid length '{clean_text}': {len(clean_text)}")
        return False
    
    if confidence < MIN_CONFIDENCE:
        logger.debug(f"❌ Low confidence '{clean_text}': {confidence:.3f} < {MIN_CONFIDENCE}")
        return False
    
    # Basic format check - simplified
    if not re.match(r'^\d{2}[A-Z]', clean_text):
        logger.debug(f"❌ Invalid format '{clean_text}'")
        return False
    
    # SIMPLIFIED duplicate check - chỉ kiểm tra trực tiếp để tăng tốc độ
    current_time = time.time()
    
    # Kiểm tra trùng lặp đơn giản - chỉ trong 30 giây gần đây
    if clean_text in plate_history:
        existing_data = plate_history[clean_text]
        if current_time - existing_data.get('timestamp', 0) < 30.0:  # 30 giây cooldown
            if confidence <= existing_data.get('confidence', 0):
                logger.debug(f"⏭️ Duplicate plate '{clean_text}' with lower/equal confidence")
                return False
            else:
                logger.info(f"🔄 Updating plate '{clean_text}' with higher confidence: {confidence:.3f}")
    
    # SIMPLIFIED bbox check - chỉ kiểm tra cơ bản
    if bbox and len(bbox) >= 4:
        x1, y1, x2, y2 = bbox[:4]
        bbox_area = (x2 - x1) * (y2 - y1)
        bbox_center = ((x1 + x2) / 2, (y1 + y2) / 2)  # FIXED: Define bbox_center
        
        # Chỉ kiểm tra với các biển số đã lưu gần đây (trong 5 giây) - giảm overhead
        for key, plate_data in plate_history.items():
            if current_time - plate_data.get('timestamp', 0) < 10.0:  # Chỉ kiểm tra trong 10 giây
                saved_bbox = plate_data.get('bbox')
                if saved_bbox and len(saved_bbox) >= 4:
                    saved_x1, saved_y1, saved_x2, saved_y2 = saved_bbox[:4]
                    saved_center = ((saved_x1 + saved_x2) / 2, (saved_y1 + saved_y2) / 2)
                    saved_area = (saved_x2 - saved_x1) * (saved_y2 - saved_y1)
                    
                    # Tính khoảng cách giữa 2 bbox
                    distance = ((bbox_center[0] - saved_center[0]) ** 2 + (bbox_center[1] - saved_center[1]) ** 2) ** 0.5
                    
                    # Tính tỷ lệ diện tích
                    area_ratio = min(bbox_area, saved_area) / max(bbox_area, saved_area)
                    
                    # Nếu bbox quá gần nhau và diện tích tương tự
                    if distance < 50 and area_ratio > 0.7:  # Trong vòng 50 pixels và diện tích tương tự
                        logger.debug(f"⏭️ Bbox too close to existing plate: '{plate_data['plate']}' (distance: {distance:.1f}, area_ratio: {area_ratio:.3f})")
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
    
    # 1. KIỂM TRA TRÙNG LẶP TRỰC TIẾP QUA KEY plate:{text}
    is_duplicate = check_duplicate_by_key(clean_text, plate_history)
    
    if is_duplicate:
        # 2. SỬ DỤNG LEVENSHTEIN ĐỂ ĐÁNH GIÁ ĐỘ TƯƠNG ĐỒNG VÀ CẬP NHẬT NẾU TỐT HƠN
        updated, reason = update_plate_if_better(clean_text, confidence, plate_history, track_id)
        if updated and reason == "updated":
            # Optimized: Remove logging for better FPS
            return True
        else:
            duplicate_counter += 1
            # Optimized: Remove logging for better FPS
            return False
    
    # 3. TÌM CÁC BIỂN SỐ TƯƠNG TỰ SỬ DỤNG LEVENSHTEIN - OPTIMIZED
    similar_plates = find_similar_plates(clean_text, plate_history, similarity_threshold=0.6)  # 60% similarity threshold
    
    if similar_plates:
        # Tìm biển số tương tự có độ tin cậy cao nhất
        best_similar = max(similar_plates, key=lambda x: x['data'].get('confidence', 0.0))
        best_confidence = best_similar['data'].get('confidence', 0.0)
        best_plate = best_similar['plate']
        similarity = best_similar['similarity']
        
        # Optimized: Remove logging for better FPS
        
        # Nếu biển số mới có độ tin cậy cao hơn đáng kể, cập nhật
        if confidence > best_confidence * 1.05:  # 5% improvement threshold - more sensitive
            # Optimized: Remove logging for better FPS
            
            # Xóa biển số cũ và thêm biển số mới
            del plate_history[best_plate]
            plate_history[clean_text] = {
                'confidence': confidence,
                'timestamp': time.time(),
                'updated_count': 1,
                'saved_once': True,
                'track_id': track_id,
                'last_updated': time.time(),
                'replaced_plate': best_plate
            }
            return True
        else:
            duplicate_counter += 1
            logger.debug(f"⏭️ Similar plate exists with higher/equal confidence: '{best_plate}' ({best_confidence:.3f})")
            return False
    
    # New plate - always save if valid
    plate_history[clean_text] = {
        'confidence': confidence,
        'timestamp': time.time(),
        'updated_count': 1,
        'saved_once': True,
        'track_id': track_id,
        'last_updated': time.time()
    }
    
    # Save back to thread-safe storage
    set_thread_safe_data('plate_history', plate_history)
    set_thread_safe_data('track_consistency', track_consistency)
    set_thread_safe_data('ocr_attempts_per_track', ocr_attempts_per_track)
    
    logger.info(f"✅ NEW PLATE SAVED: '{clean_text}' (conf: {confidence:.3f})")
    return True

def update_persistent_displays(track_id, plate_text, bbox, confidence):
    """Cập nhật persistent display cho track - THREAD SAFE"""
    try:
        current_time = time.time()
        
        # Get thread-safe persistent displays
        persistent_displays = get_thread_safe_data('persistent_displays')
        
        persistent_displays[track_id] = {
            'plate': plate_text,
            'bbox': bbox,
            'confidence': confidence,
            'last_seen': current_time
        }
        
        # Save back to thread-safe storage
        set_thread_safe_data('persistent_displays', persistent_displays)
        
        logger.debug(f"📱 Updated persistent display for track {track_id}: '{plate_text}' (timeout=0)")
    except Exception as e:
        logger.error(f"Error updating persistent display: {e}")

def find_or_create_roi_object_with_track_id(plate_text, bbox, confidence, roi, track_id):
    """Tìm hoặc tạo object trong ROI với ByteTracker track_id - THREAD SAFE"""
    # Get thread-safe data
    roi_tracked_objects = get_thread_safe_data('roi_tracked_objects')
    roi_object_counter = get_thread_safe_data('roi_object_counter')
    roi_saved_plates = get_thread_safe_data('roi_saved_plates')
    
    try:
        current_time = time.time()
        x1, y1, x2, y2 = bbox[:4]
        roi_x1, roi_y1, roi_x2, roi_y2 = roi
        
        # Kiểm tra xem bbox có trong ROI không
        bbox_in_roi = not (x2 < roi_x1 or x1 > roi_x2 or y2 < roi_y1 or y1 > roi_y2)
        if not bbox_in_roi:
            return None
        
        # Tìm object hiện có dựa trên track_id trước
        for obj_id, obj_data in roi_tracked_objects.items():
            if obj_data.get('track_id') == track_id:
                # Tìm thấy object với cùng track_id, cập nhật nó
                current_conf = obj_data.get('confidence', 0)
                if confidence > current_conf or not obj_data.get('plate'):
                    roi_tracked_objects[obj_id].update({
                        'plate': plate_text,
                        'bbox': bbox,
                        'confidence': confidence,
                        'last_seen': current_time
                    })
                    logger.info(f"🔄 UPDATED ROI object {obj_id} (Track {track_id}): '{plate_text}' (conf: {confidence:.3f})")
                return obj_id
        
        # Nếu không tìm thấy object với track_id này, tạo mới
        # CHỈ tạo object mới khi track_id thực sự mới (không phải fallback)
        if track_id and track_id > 0:  # Chỉ tạo khi có ByteTracker track_id hợp lệ
            roi_object_counter += 1
            new_object_id = roi_object_counter  # ID cố định: 1, 2, 3, ...
            
            roi_tracked_objects[new_object_id] = {
                'plate': plate_text,
                'bbox': bbox,
                'confidence': confidence,
                'last_seen': current_time,
                'track_id': track_id  # Lưu ByteTracker track_id
        }
        
            logger.info(f"🆕 NEW ROI object {new_object_id} (Track {track_id}): '{plate_text}' (conf: {confidence:.3f})")
        else:
            # Không tạo object cho fallback tracks
            logger.debug(f"⏭️ Skipping fallback track creation for track_id: {track_id}")
        
        # Save back to thread-safe storage
        set_thread_safe_data('roi_tracked_objects', roi_tracked_objects)
        set_thread_safe_data('roi_object_counter', roi_object_counter)
        set_thread_safe_data('roi_saved_plates', roi_saved_plates)
        
        return new_object_id
        
    except Exception as e:
        logger.error(f"Error in find_or_create_roi_object_with_track_id: {e}")
        return None

def find_or_create_roi_object(plate_text, bbox, confidence, roi):
    """Tìm hoặc tạo object trong ROI - THREAD SAFE"""
    # Get thread-safe data
    roi_tracked_objects = get_thread_safe_data('roi_tracked_objects')
    roi_object_counter = get_thread_safe_data('roi_object_counter')
    roi_saved_plates = get_thread_safe_data('roi_saved_plates')
    
    try:
        current_time = time.time()
        x1, y1, x2, y2 = bbox[:4]
        roi_x1, roi_y1, roi_x2, roi_y2 = roi
        
        # Kiểm tra xem bbox có trong ROI không
        bbox_in_roi = not (x2 < roi_x1 or x1 > roi_x2 or y2 < roi_y1 or y1 > roi_y2)
        if not bbox_in_roi:
            return None
        
        # Tìm object hiện có dựa trên vị trí gần nhất
        best_object_id = None
        best_distance = float('inf')
        
        for obj_id, obj_data in roi_tracked_objects.items():
            obj_bbox = obj_data.get('bbox', [])
            if len(obj_bbox) >= 4:
                obj_x1, obj_y1, obj_x2, obj_y2 = obj_bbox[:4]
                
                # Tính khoảng cách giữa 2 bbox
                center1 = ((x1 + x2) / 2, (y1 + y2) / 2)
                center2 = ((obj_x1 + obj_x2) / 2, (obj_y1 + obj_y2) / 2)
                distance = ((center1[0] - center2[0]) ** 2 + (center1[1] - center2[1]) ** 2) ** 0.5
                
                # Nếu khoảng cách gần (< 150 pixels) - tăng threshold để match tốt hơn
                if distance < 150:
                    if distance < best_distance:
                        best_object_id = obj_id
                        best_distance = distance
        
        # Nếu tìm thấy object gần, cập nhật nó
        if best_object_id is not None:
            # Chỉ cập nhật nếu confidence cao hơn hoặc chưa có biển số
            current_conf = roi_tracked_objects[best_object_id].get('confidence', 0)
            if confidence > current_conf or not roi_tracked_objects[best_object_id].get('plate'):
                roi_tracked_objects[best_object_id].update({
                    'plate': plate_text,
                    'bbox': bbox,
                    'confidence': confidence,
                    'last_seen': current_time
                })
                logger.info(f"🔄 UPDATED ROI object {best_object_id}: '{plate_text}' (conf: {confidence:.3f})")
            return best_object_id
        
        # Nếu không tìm thấy object phù hợp, tạo mới với ID cố định
        # CHỈ tạo object mới khi thực sự cần thiết (không phải fallback)
        if len(roi_tracked_objects) < 3:  # Giới hạn số lượng objects để tránh multiple tracking
            roi_object_counter += 1
            new_object_id = roi_object_counter  # ID cố định: 1, 2, 3, ...
            
            roi_tracked_objects[new_object_id] = {
                'plate': plate_text,
                'bbox': bbox,
                'confidence': confidence,
                'last_seen': current_time,
                'track_id': new_object_id
        }
        
            logger.info(f"🆕 NEW ROI object {new_object_id}: '{plate_text}' (conf: {confidence:.3f})")
        else:
            # Không tạo object mới nếu đã có quá nhiều objects
            logger.debug(f"⏭️ Skipping new object creation - too many objects: {len(roi_tracked_objects)}")
        
        # Save back to thread-safe storage
        set_thread_safe_data('roi_tracked_objects', roi_tracked_objects)
        set_thread_safe_data('roi_object_counter', roi_object_counter)
        set_thread_safe_data('roi_saved_plates', roi_saved_plates)
        
        return new_object_id
        
    except Exception as e:
        logger.error(f"Error in find_or_create_roi_object: {e}")
        return None

def cleanup_roi_objects(roi):
    """Xóa các object cũ khỏi ROI - THREAD SAFE"""
    # Get thread-safe data
    roi_tracked_objects = get_thread_safe_data('roi_tracked_objects')
    roi_saved_plates = get_thread_safe_data('roi_saved_plates')
    
    try:
        current_time = time.time()
        objects_to_remove = []
        
        for obj_id, obj_data in roi_tracked_objects.items():
            bbox = obj_data.get('bbox', [])
            track_id = obj_data.get('track_id')
            
            if len(bbox) >= 4:
                x1, y1, x2, y2 = bbox[:4]
                roi_x1, roi_y1, roi_x2, roi_y2 = roi
                
                # Kiểm tra xem bbox có còn trong ROI không
                bbox_in_roi = not (x2 < roi_x1 or x1 > roi_x2 or y2 < roi_y1 or y1 > roi_y2)
                
                if not bbox_in_roi:
                    objects_to_remove.append(obj_id)
                    logger.info(f"🗑️ ROI object {obj_id} (Track {track_id}) outside ROI - removing")
                    continue
            
            # Xóa object cũ (hơn 5 giây không cập nhật)
            if current_time - obj_data.get('last_seen', 0) > 5.0:
                objects_to_remove.append(obj_id)
                logger.debug(f"🗑️ ROI object {obj_id} (Track {track_id}) timeout - removing")
        
        # Xóa các object đã đánh dấu
        for obj_id in objects_to_remove:
            if obj_id in roi_tracked_objects:
                track_id = roi_tracked_objects[obj_id].get('track_id')
                del roi_tracked_objects[obj_id]
                logger.debug(f"🗑️ Removed ROI object {obj_id} (Track {track_id})")
            
            # Cũng xóa khỏi roi_saved_plates dựa trên track_id
            if track_id in roi_saved_plates:
                del roi_saved_plates[track_id]
                logger.debug(f"🗑️ Removed saved plate for Track {track_id}")
        
        # Save back to thread-safe storage
        set_thread_safe_data('roi_tracked_objects', roi_tracked_objects)
        set_thread_safe_data('roi_saved_plates', roi_saved_plates)
                
    except Exception as e:
        logger.error(f"Error cleaning up ROI objects: {e}")

def draw_roi_objects(frame, roi=None):
    """Vẽ tất cả ROI objects lên frame - THREAD SAFE"""
    # Get thread-safe data
    roi_tracked_objects = get_thread_safe_data('roi_tracked_objects')
    
    try:
        current_time = time.time()
        
        for obj_id, obj_data in roi_tracked_objects.items():
            # Kiểm tra timeout
            if current_time - obj_data.get('last_seen', 0) > 0.1:  # 100ms tolerance
                continue
                
            plate_text = obj_data.get('plate', '')
            confidence = obj_data.get('confidence', 0)
            bbox = obj_data.get('bbox', [])
            
            if not plate_text or not bbox or len(bbox) < 4:
                continue
            
            x1, y1, x2, y2 = bbox[:4]
            
            # Kiểm tra bbox có trong ROI không
            if roi is not None:
                roi_x1, roi_y1, roi_x2, roi_y2 = roi
                bbox_in_roi = not (x2 < roi_x1 or x1 > roi_x2 or y2 < roi_y1 or y1 > roi_y2)
                if not bbox_in_roi:
                    continue
            
            # Đảm bảo bbox nằm trong frame
            frame_height, frame_width = frame.shape[:2]
            x1 = max(0, min(x1, frame_width - 1))
            y1 = max(0, min(y1, frame_height - 1))
            x2 = max(x1 + 1, min(x2, frame_width))
            y2 = max(y1 + 1, min(y2, frame_height))
            
            # Vẽ bounding box - màu xanh lá
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
            
            # REMOVED: Không vẽ text nhận diện trong draw_roi_objects
            # Chỉ vẽ bounding box, text sẽ được vẽ trong detect_and_ocr_stable
            
    except Exception as e:
        logger.error(f"Error drawing ROI objects: {e}")

# REMOVED: predict_bbox_position - Too complex for immediate display

def cleanup_persistent_displays(roi=None):
    """Xóa các display cũ khỏi persistent_displays và kiểm tra ROI - IMMEDIATE CLEANUP"""
    try:
        current_time = time.time()
        old_tracks = []
        
        # Get thread-safe persistent displays
        persistent_displays = get_thread_safe_data('persistent_displays')
        
        for track_id, display_data in persistent_displays.items():
            # IMMEDIATE: Kiểm tra vị trí bbox có còn trong ROI không TRƯỚC
            if roi is not None:
                bbox = display_data.get('bbox', [])
                if len(bbox) >= 4:
                    x1, y1, x2, y2 = bbox[:4]
                    roi_x1, roi_y1, roi_x2, roi_y2 = roi
                    
                    # Kiểm tra xem bbox có giao với ROI không - STRICT CHECK
                    bbox_in_roi = not (x2 < roi_x1 or x1 > roi_x2 or y2 < roi_y1 or y1 > roi_y2)
                    
                    if not bbox_in_roi:
                        old_tracks.append(track_id)
                        logger.info(f"🗑️ IMMEDIATE REMOVAL: Track {track_id} outside ROI")
                        continue
            
            # IMMEDIATE: Với timeout=0, xóa ngay lập tức khi không còn trong ROI
            if display_timeout == 0.0:
                # Chỉ giữ lại nếu vừa được cập nhật (trong cùng frame)
                if current_time - display_data['last_seen'] > 0.1:  # 100ms tolerance
                    old_tracks.append(track_id)
                    logger.debug(f"🗑️ IMMEDIATE REMOVAL: Track {track_id} - timeout=0")
                    continue
            else:
                # Kiểm tra timeout bình thường
                if current_time - display_data['last_seen'] > display_timeout:
                    old_tracks.append(track_id)
                    logger.debug(f"🗑️ Removed display for track {track_id} - timeout")
                    continue
        
        for track_id in old_tracks:
            if track_id in persistent_displays:
                del persistent_displays[track_id]
                logger.debug(f"🗑️ Removed persistent display for track {track_id}")
        
        # Save back to thread-safe storage
        set_thread_safe_data('persistent_displays', persistent_displays)
            
    except Exception as e:
        logger.error(f"Error cleaning up persistent displays: {e}")

def draw_persistent_displays(frame, roi=None):
    """Vẽ tất cả persistent displays lên frame - SIMPLIFIED"""
    try:
        current_time = time.time()
        tracks_to_remove = []  # Danh sách track cần xóa
        
        # Get thread-safe persistent displays
        persistent_displays = get_thread_safe_data('persistent_displays')
        
        for track_id, display_data in persistent_displays.items():
            # IMMEDIATE: Kiểm tra timeout với logic mới
            if display_timeout == 0.0:
                # Với timeout=0, chỉ hiển thị nếu vừa được cập nhật
                if current_time - display_data['last_seen'] > 0.1:  # 100ms tolerance
                    tracks_to_remove.append(track_id)
                    continue
            else:
                # Kiểm tra timeout bình thường
                if current_time - display_data['last_seen'] > display_timeout:
                    tracks_to_remove.append(track_id)
                    continue
                
            plate_text = display_data['plate']
            confidence = display_data['confidence']
            bbox = display_data.get('bbox', [])
            
            if not plate_text or not bbox or len(bbox) < 4:
                tracks_to_remove.append(track_id)
                continue
            
            x1, y1, x2, y2 = bbox[:4]
            
            # STRICT: Kiểm tra bbox có trong ROI không - IMMEDIATE CHECK
            if roi is not None:
                roi_x1, roi_y1, roi_x2, roi_y2 = roi
                # Kiểm tra xem bbox có giao với ROI không - STRICT CHECK
                bbox_in_roi = not (x2 < roi_x1 or x1 > roi_x2 or y2 < roi_y1 or y1 > roi_y2)
                if not bbox_in_roi:
                    # IMMEDIATE: Đánh dấu để xóa ngay lập tức
                    tracks_to_remove.append(track_id)
                    logger.info(f"🗑️ IMMEDIATE REMOVAL in draw: Track {track_id} outside ROI")
                    continue
            
            # Đảm bảo bbox nằm trong frame
            frame_height, frame_width = frame.shape[:2]
            x1 = max(0, min(x1, frame_width - 1))
            y1 = max(0, min(y1, frame_height - 1))
            x2 = max(x1 + 1, min(x2, frame_width))
            y2 = max(y1 + 1, min(y2, frame_height))
            
            # Vẽ bounding box - màu xanh lá đơn giản
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
            
            # REMOVED: Không vẽ text nhận diện trong draw_persistent_displays
            # Chỉ vẽ bounding box, text sẽ được vẽ trong detect_and_ocr_stable
            
            # REMOVED: Vẽ confidence - chỉ hiển thị text nhận diện
        
        # Xóa các track đã đánh dấu
        for track_id in tracks_to_remove:
            if track_id in persistent_displays:
                del persistent_displays[track_id]
                logger.debug(f"🗑️ Removed track {track_id} from persistent displays")
        
        # Save back to thread-safe storage
        set_thread_safe_data('persistent_displays', persistent_displays)
            
    except Exception as e:
        logger.error(f"Error drawing persistent displays: {e}")

def get_persistent_displays():
    """Get current persistent displays"""
    try:
        current_time = time.time()
        active_displays = {}
        
        # Get thread-safe persistent displays
        persistent_displays = get_thread_safe_data('persistent_displays')
        
        for track_id, display_data in persistent_displays.items():
            if display_timeout == 0.0:
                # Với timeout=0, chỉ hiển thị nếu vừa được cập nhật
                if current_time - display_data['last_seen'] <= 0.1:  # 100ms tolerance
                    active_displays[track_id] = display_data
            else:
                # Kiểm tra timeout bình thường
                if current_time - display_data['last_seen'] <= display_timeout:
                    active_displays[track_id] = display_data
        
        return {
            "success": True,
            "displays": active_displays,
            "total_count": len(active_displays),
            "timeout": display_timeout
        }
    except Exception as e:
        logger.error(f"Error getting persistent displays: {e}")
        return {"success": False, "message": f"Error getting persistent displays: {e}"}

def clear_persistent_displays():
    """Clear all persistent displays"""
    try:
        # Get thread-safe persistent displays
        persistent_displays = get_thread_safe_data('persistent_displays')
        old_count = len(persistent_displays)
        persistent_displays.clear()
        
        # Save back to thread-safe storage
        set_thread_safe_data('persistent_displays', persistent_displays)
        
        logger.info(f"✅ Cleared {old_count} persistent displays")
        return {"success": True, "message": f"Cleared {old_count} persistent displays"}
    except Exception as e:
        logger.error(f"Error clearing persistent displays: {e}")
        return {"success": False, "message": f"Error clearing persistent displays: {e}"}

def reset_anti_duplicate_system():
    """Reset the anti-duplicate system - THREAD SAFE"""
    try:
        # Use thread-safe operations
        safe_set_global('plate_history', {})
        safe_set_global('track_consistency', {})
        safe_set_global('ocr_attempts_per_track', {})
        safe_set_global('track_saved_plates', {})
        safe_set_global('persistent_displays', {})
        safe_set_global('roi_tracked_objects', {})  # Reset ROI objects
        safe_set_global('roi_saved_plates', {})  # Reset saved plates
        safe_set_global('global_saved_tracks', {})  # Reset global tracking
        safe_set_global('roi_object_counter', 0)  # Reset counter
        safe_set_global('session_saved_plate', None)
        safe_set_global('session_save_time', 0)
        logger.info("✅ Anti-duplicate system and ROI tracking reset successfully")
        return {"success": True, "message": "Anti-duplicate system and ROI tracking reset successfully"}
    except Exception as e:
        logger.error(f"Error resetting anti-duplicate system: {e}")
        return {"success": False, "message": f"Error resetting anti-duplicate system: {e}"}

def cleanup_tracked_objects():
    """Enhanced cleanup with consistency tracking - THREAD SAFE"""
    
    try:
        current_time = time.time()
        
        # Don't cleanup too frequently (every 5 seconds max) - THREAD SAFE
        last_cleanup_time_data = safe_get_global('last_cleanup_time', 0)
        if current_time - last_cleanup_time_data < 5:
            return
        
        safe_set_global('last_cleanup_time', current_time)
        
        tracked_objects_data = safe_get_global('tracked_objects', {})
        if not tracked_objects_data:
            return
        
        logger.info(f"🧹 ENHANCED cleanup of {len(tracked_objects_data)} tracked objects...")
        
        # Clean up old consistency data - THREAD SAFE
        track_consistency_data = safe_get_global('track_consistency', {})
        ocr_attempts_data = safe_get_global('ocr_attempts_per_track', {})
        track_saved_plates_data = safe_get_global('track_saved_plates', {})
        plate_history_data = safe_get_global('plate_history', {})
        
        old_tracks = set(track_consistency_data.keys()) - set(tracked_objects_data.keys())
        for old_track in old_tracks:
            if old_track in track_consistency_data:
                del track_consistency_data[old_track]
            if old_track in ocr_attempts_data:
                del ocr_attempts_data[old_track]
            if old_track in track_saved_plates_data:
                del track_saved_plates_data[old_track]
            if old_track in plate_history_data:
                del plate_history_data[old_track]
        
        # Update global data
        safe_set_global('track_consistency', track_consistency_data)
        safe_set_global('ocr_attempts_per_track', ocr_attempts_data)
        safe_set_global('track_saved_plates', track_saved_plates_data)
        safe_set_global('plate_history', plate_history_data)
        
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
        removed_track_ids = set()
        
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
                
                # Mark removed track IDs for cleanup
                for track_id, _ in group:
                    if track_id != best_track_id:
                        removed_track_ids.add(track_id)
        
        # Add back vehicles without plates
        valid_objects.update(vehicles_without_plates)
        
        # Clean up plate_history for removed tracks
        for track_id in removed_track_ids:
            if track_id in plate_history:
                del plate_history[track_id]
        
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

def detect_and_ocr_stable(frame, camera_id=None, source_type="camera", video_filename=None, camera_location=None, camera_name=None):
    """Main detection function with enhanced plate detection and CENTERED ROI - OPTIMIZED FOR 20 FPS - THREAD SAFE"""
    # Ensure camera_id is unique for each thread
    if camera_id is None:
        camera_id = threading.get_ident() % 1000 + 1  # Generate unique camera_id based on thread ID
    
    thread_id = thread_manager.get_thread_id()
    
    # Register thread if not already registered
    if thread_id not in thread_manager.active_threads:
        thread_manager.register_thread(thread_id, camera_id, source_type, video_filename, camera_location, camera_name)
    
    # Update thread activity
    thread_manager.update_thread_activity(thread_id)
    
    # Get thread-specific data container to prevent cross-stream contamination
    thread_container = get_thread_data_container()
    
    # Use thread-safe data instead of thread-local
    thread_container['frame_count'] = thread_container.get('frame_count', 0) + 1
    frame_count = thread_container['frame_count']
    
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
    
    # Tính FPS với smoothing để giảm fluctuation - THREAD SAFE - OPTIMIZED FOR 20 FPS
    current_time = time.time()
    
    # Initialize FPS tracking variables if not exists
    if 'fps_counter' not in thread_container:
        thread_container['fps_counter'] = 0
    if 'last_fps_time' not in thread_container:
        thread_container['last_fps_time'] = current_time
    if 'current_fps' not in thread_container:
        thread_container['current_fps'] = 0
    
    thread_container['fps_counter'] += 1
    
    # Calculate FPS every 1 second
    time_diff = current_time - thread_container['last_fps_time']
    if time_diff >= 1.0:
        raw_fps = thread_container['fps_counter'] / time_diff
        
        # Smooth FPS calculation để giảm fluctuation
        if thread_container['current_fps'] == 0:
            thread_container['current_fps'] = raw_fps
        else:
            thread_container['current_fps'] = 0.8 * thread_container['current_fps'] + 0.2 * raw_fps  # More stable smoothing
        
        # Reset counters
        thread_container['fps_counter'] = 0
        thread_container['last_fps_time'] = current_time
        
        # Log FPS for debugging
        logger.info(f"📊 Current FPS: {thread_container['current_fps']:.1f} (raw: {raw_fps:.1f})")
    
    curr_time = time.time()
    original_height, original_width = frame.shape[:2]
    display_frame = frame.copy()
    
    # Calculate ROI coordinates - CENTERED HALF FRAME
    roi_xmin, roi_ymin, roi_xmax, roi_ymax = calculate_roi_coordinates(original_width, original_height)
    
    # FRAME SKIPPING LOGIC - Chỉ xử lý khi cần thiết
    roi = (roi_xmin, roi_ymin, roi_xmax, roi_ymax)
    
    # Vẽ ROI trước khi kiểm tra skip
    cv2.rectangle(display_frame, (roi_xmin, roi_ymin), (roi_xmax, roi_ymax), (0, 255, 255), 2)  # Vàng, nét dày hơn
    # Điều chỉnh vị trí ROI text để tránh che khuất - di chuyển xuống dưới
    cv2.putText(display_frame, "ROI", (roi_xmin + 5, roi_ymin + 45), cv2.FONT_HERSHEY_SIMPLEX, 2.0, (0, 255, 255), 4)
    
    # OPTIMIZED: Consistent frame skipping for stable FPS
    should_skip = False
    
    # OPTIMIZED: Simple frame skipping for multi-stream 20 FPS
    if ENABLE_FPS_THROTTLING and thread_container.get('current_fps', 0) > 0:
        # Only skip frames if FPS is very high (30+ FPS)
        if thread_container.get('current_fps', 0) > 30:  # Skip only at very high FPS
            should_skip = True
        else:
            should_skip = False  # Process every frame for 20 FPS target
    
    # Optimized: Remove logging for better FPS
    
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
    
    # Extract ROI frame - optimized single extraction
    roi_frame = frame[roi_ymin:roi_ymax, roi_xmin:roi_xmax]
    
    # FIXED: Save ROI frame to thread data for cropping
    thread_container['last_roi_frame'] = frame.copy()  # Save original frame for cropping
    
    # Ensure ROI frame has valid size - optimized check
    if roi_frame.shape[0] < 50 or roi_frame.shape[1] < 50:
        # Use centered half frame as fallback
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
                
            # Optimized: Remove logging for better FPS
            
            # Ensure frame has minimum size
            if roi_frame_rgb.shape[0] >= 50 and roi_frame_rgb.shape[1] >= 50:
                # OPTIMIZED: Check cache first
                frame_hash = hashlib.md5(roi_frame_rgb.tobytes()).hexdigest()[:16]
                cached_result = _get_cached_result(frame_hash)
                
                if cached_result and 'alpr_results' in cached_result:
                    alpr_results = cached_result['alpr_results']
                    # Optimized: Remove logging for better FPS
                else:
                    # OPTIMIZED: Throttle FastALPR calls to prevent video pause
                    current_time = time.time()
                    
                    # OPTIMIZED: FastALPR with cooldown for 20 FPS - THREAD SAFE
                    if current_time - thread_container.get('last_alpr_call_time', 0) >= 0.02:  # 20ms cooldown (50 FPS max)
                        try:
                            # OPTIMIZED: Gọi FastALPR trực tiếp (không enhancement) - 5 FPS
                            alpr_results = alpr.predict(roi_frame_rgb)
                            
                            # Convert to list if needed
                            if hasattr(alpr_results, '__iter__') and not isinstance(alpr_results, str):
                                alpr_results = list(alpr_results)
                            else:
                                alpr_results = []
                            
                            # Optimized: Remove logging for better FPS
                            if len(alpr_results) > 0:
                                thread_container['last_alpr_call_time'] = current_time
                            
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
                
                # Cập nhật thời gian detection nếu có kết quả - THREAD SAFE
                if len(alpr_results) > 0:
                    thread_container['last_detection_time'] = curr_time
                    # skip_frame_count = 0  # Reset skip counter khi có detection
                    # Optimized: Remove logging for better FPS
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

    # SỬ DỤNG BYTETRACKER ĐỂ TRACK ỔN ĐỊNH TRONG ROI
    # Update ByteTracker với detections
    tracks = []
    try:
        if len(detections_np) > 0:
            # FIXED: ByteTracker cần detections với format [x1, y1, x2, y2, conf, class_id]
            # Thêm class_id = 0 cho tất cả detections
            detections_with_class = np.column_stack([detections_np, np.zeros(len(detections_np))])
            
            # FIXED: Convert to tensor format for ByteTracker
            try:
                import torch
                if torch.cuda.is_available():
                    detections_tensor = torch.from_numpy(detections_with_class).cuda()
                else:
                    detections_tensor = torch.from_numpy(detections_with_class)
                
                tracks = byte_tracker.update(
                    output_results=detections_tensor,
                img_info=(original_height, original_width),
                img_size=(original_height, original_width)
            )
            except ImportError:
                # Fallback to numpy if torch not available
                    tracks = byte_tracker.update(
                    output_results=detections_with_class,
                    img_info=(original_height, original_width),
                    img_size=(original_height, original_width)
                )
            
            # Lọc tracks chỉ trong ROI và giới hạn số lượng
            roi_tracks = []
            active_track_ids = set()
            
            for track in tracks:
                # Xử lý STrack objects từ ByteTracker
                if hasattr(track, 'tlwh') and hasattr(track, 'track_id'):
                    # STrack object
                    x1, y1, w, h = track.tlwh
                    x2, y2 = x1 + w, y1 + h
                    track_id = int(track.track_id)
                elif len(track) >= 5:
                    # Array format [x1, y1, x2, y2, track_id]
                    x1, y1, x2, y2, track_id = track[:5]
                    track_id = int(track_id)
                else:
                    logger.warning(f"Unknown track format: {type(track)} - {track}")
                    continue
                
                # Kiểm tra xem track có trong ROI không
                if is_bbox_in_roi([x1, y1, x2, y2], roi):
                    # Giới hạn số lượng tracks để tránh tạo quá nhiều
                    if len(active_track_ids) < 5:  # Tối đa 5 tracks trong ROI
                        roi_tracks.append([x1, y1, x2, y2, track_id])
                        active_track_ids.add(track_id)
                        logger.debug(f"✅ Track {track_id} trong ROI: ({x1:.0f},{y1:.0f})-({x2:.0f},{y2:.0f})")
                    else:
                        logger.debug(f"❌ Track {track_id} bị giới hạn - quá nhiều tracks")
                else:
                    logger.debug(f"❌ Track {track_id} ngoài ROI: ({x1:.0f},{y1:.0f})-({x2:.0f},{y2:.0f})")
            
            tracks = roi_tracks
            # Optimized: Remove logging for better FPS
        else:
            tracks = []
    except Exception as e:
        logger.error(f"ByteTracker update failed: {e}")
        tracks = []
        
        # DISABLED FALLBACK: Không tạo fallback tracks để tránh multiple tracking
        # Chỉ sử dụng ByteTracker tracks để đảm bảo consistency
        tracks = []

    # OPTIMIZED TRACKING SYSTEM - Chỉ 1 track duy nhất cho mỗi đối tượng trong ROI
    roi = (roi_xmin, roi_ymin, roi_xmax, roi_ymax)
    cleanup_roi_objects(roi)  # Cleanup ROI objects trước
    cleanup_persistent_displays(roi)  # Cleanup persistent displays

    # Display FPS and detections only - THREAD SAFE - FIXED POSITION
    fps_text = f"FPS: {thread_container.get('current_fps', 0):.1f}"
    # FIXED: Di chuyển FPS sang trái để tránh bị che khuất ở góc phải
    cv2.putText(display_frame, fps_text, (original_width - 350, 60),
                cv2.FONT_HERSHEY_SIMPLEX, 2.0, (0, 255, 0), 3)
    
    detections_text = f"Detections: {len(detections)}"
    # FIXED: Di chuyển Detections lên trên cùng bên trái - tăng khoảng cách
    cv2.putText(display_frame, detections_text, (10, 60),
                cv2.FONT_HERSHEY_SIMPLEX, 2.0, (255, 255, 0), 3)

    # FIXED: Sử dụng ByteTracker tracks thay vì tạo object mới
    boxes = []
    labels = []
    ocr_results = []
    
    # Optimized: Remove logging for better FPS
    
    # FIXED: Sử dụng ByteTracker tracks để mapping với detections
    processed_plates = set()  # Tránh xử lý trùng lặp
    active_roi_objects = {}  # Lưu trữ các object đang active trong ROI
    
    # FIXED: Map detections với ByteTracker tracks dựa trên vị trí
    detection_track_mapping = {}
    for i, detection in enumerate(plate_detections):
        detection_bbox = detection['bbox']
        detection_center = ((detection_bbox[0] + detection_bbox[2]) / 2, 
                           (detection_bbox[1] + detection_bbox[3]) / 2)
        
        # Tìm track gần nhất
        closest_track_id = None
        closest_distance = float('inf')
        
        for track in tracks:
            if len(track) >= 5:
                track_x1, track_y1, track_x2, track_y2, track_id = track[:5]
                track_center = ((track_x1 + track_x2) / 2, (track_y1 + track_y2) / 2)
                
                # Tính khoảng cách giữa centers
                distance = ((detection_center[0] - track_center[0]) ** 2 + 
                           (detection_center[1] - track_center[1]) ** 2) ** 0.5
                
                if distance < closest_distance and distance < 100:  # Trong vòng 100px
                    closest_distance = distance
                    closest_track_id = int(track_id)
        
        if closest_track_id is not None:
            detection_track_mapping[i] = closest_track_id
            logger.debug(f"🔗 Detection {i} mapped to track {closest_track_id} (distance: {closest_distance:.1f})")
        else:
            logger.debug(f"❌ Detection {i} không có track tương ứng")
    
    # FIXED: Xử lý detections với ByteTracker track_id
    for i, detection in enumerate(plate_detections):
        plate_text = detection['plate_text']
        confidence = detection['confidence']
        bbox = detection['bbox']
        
        # Optimized: Remove logging for better FPS
        
        if plate_text and len(plate_text.strip()) >= 4 and confidence > 0.2:
            # Xử lý text và thêm dấu - và . nếu cần
            processed_text = plate_text.strip().upper()
            processed_text = re.sub(r'[^A-Z0-9\-\.]', '', processed_text)
            
            # THÊM DẤU - VÀ . VÀO BIỂN SỐ NẾU THIẾU
            original_text = processed_text
            processed_text = add_vietnam_plate_formatting(processed_text)
            # Optimized: Remove logging for better FPS
            
            if len(processed_text) >= 4:
                x1, y1, x2, y2 = bbox[:4]
                
                # Kiểm tra xem có trong ROI không
                bbox_in_roi = is_bbox_in_roi(bbox, roi)
                logger.debug(f"🔍 Detection {i}: bbox_in_roi={bbox_in_roi}, roi={roi}")
                
                if bbox_in_roi:
                    # FIXED: Sử dụng track_id từ ByteTracker thay vì tạo mới
                    track_id = detection_track_mapping.get(i)
                    
                    if track_id is not None:
                        # Kiểm tra xem track_id này đã tồn tại chưa
                        if track_id in active_roi_objects:
                            # Cập nhật object hiện có nếu confidence cao hơn
                            existing_plate = active_roi_objects[track_id].get('plate', '')
                            existing_conf = active_roi_objects[track_id].get('confidence', 0)
                            
                            # Tính similarity giữa 2 biển số
                            similarity = calculate_plate_similarity(processed_text, existing_plate)
                            
                            # FIXED: CHỈ CẬP NHẬT NẾU CONFIDENCE CAO HƠN ĐÁNG KỂ (ít nhất 5%) VÀ FORMAT ĐÚNG
                            if similarity >= 0.6 and confidence > existing_conf + 0.05:
                                # FIXED: Kiểm tra format biển số Việt Nam trước khi cập nhật
                                if is_valid_vietnam_plate_format(processed_text):
                                    active_roi_objects[track_id].update({
                                        'plate': processed_text,
                                        'bbox': [x1, y1, x2, y2],
                                        'confidence': confidence,
                                        'last_seen': time.time()
                                    })
                                    logger.info(f"🔄 UPDATED Track {track_id}: '{existing_plate}' -> '{processed_text}' (conf: {existing_conf:.3f} -> {confidence:.3f}, similarity: {similarity:.3f})")
                                else:
                                    logger.debug(f"⏭️ Track {track_id} invalid format, keeping existing: '{processed_text}' vs '{existing_plate}'")
                            elif similarity >= 0.6:
                                logger.debug(f"⏭️ Track {track_id} similar plate with insufficient confidence improvement: '{processed_text}' ({confidence:.3f}) vs '{existing_plate}' ({existing_conf:.3f}) - need +0.05")
                            else:
                                logger.debug(f"⏭️ Track {track_id} different plate, keeping existing: '{processed_text}' vs '{existing_plate}' (similarity: {similarity:.3f})")
                        else:
                            # FIXED: Tạo object mới với ByteTracker track_id - chỉ nếu format hợp lệ
                            if is_valid_vietnam_plate_format(processed_text):
                                active_roi_objects[track_id] = {
                                    'plate': processed_text,
                                    'bbox': [x1, y1, x2, y2],
                                    'confidence': confidence,
                                    'last_seen': time.time(),
                                    'track_id': track_id
                                }
                                
                                # Thêm vào response arrays
                                boxes.append([x1, y1, x2, y2])
                                labels.append(f"Plate: {processed_text}")
                                ocr_results.append([processed_text, confidence])
                                
                                logger.info(f"✅ NEW ByteTracker Track {track_id}: '{processed_text}' (conf: {confidence:.3f})")
                            else:
                                logger.debug(f"❌ Track {track_id} invalid format, skipping: '{processed_text}'")
                                continue
                            
                            # Vẽ bounding box và text ngay lập tức
                            cv2.rectangle(display_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                            
                            # FIXED: Vẽ text với background - format ID: 1,2,3... (sử dụng detection index)
                            display_text = f"ID: {i+1} {processed_text}"
                            # Text nằm ở phía trên, giữa bounding box
                            text_y = max(y1 - 15, 25)
                            text_size = cv2.getTextSize(display_text, cv2.FONT_HERSHEY_SIMPLEX, 1.2, 3)[0]
                            # Tính toán vị trí x để text nằm giữa bounding box
                            text_x = x1 + (x2 - x1 - text_size[0]) // 2
                            
                            # Background đen vừa với text
                            cv2.rectangle(display_frame, (text_x - 5, text_y - text_size[1] - 5), (text_x + text_size[0] + 5, text_y + 5), (0, 0, 0), -1)
                            
                            # Text đậm hơn (thickness = 3)
                            cv2.putText(display_frame, display_text, (text_x, text_y),
                                       cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 255, 0), 3)
                    else:
                        # FIXED: Sử dụng logic grouping để tránh tạo nhiều biển số cho cùng 1 đối tượng
                        # Tìm biển số tương tự trong roi_tracked_objects (persistent tracking)
                        similar_object_id = None
                        best_similarity = 0
                        
                        for obj_id, obj_data in roi_tracked_objects.items():
                            existing_plate = obj_data.get('plate', '')
                            if existing_plate:
                                # Tính similarity giữa 2 biển số
                                similarity = calculate_plate_similarity(processed_text, existing_plate)
                                if similarity > best_similarity and similarity >= 0.6:  # Threshold 60%
                                    best_similarity = similarity
                                    similar_object_id = obj_id
                        
                        if similar_object_id is not None:
                            # Gộp biển số tương tự ngay lập tức (60% similarity)
                            existing_conf = roi_tracked_objects[similar_object_id].get('confidence', 0)
                            
                            # Cập nhật nếu confidence cao hơn hoặc tương đương
                            if confidence >= existing_conf:
                                roi_tracked_objects[similar_object_id].update({
                                    'plate': processed_text,
                                    'bbox': [x1, y1, x2, y2],
                                    'confidence': confidence,
                                    'last_seen': time.time()
                                })
                                # Cập nhật active_roi_objects để hiển thị
                                active_roi_objects[similar_object_id] = roi_tracked_objects[similar_object_id]
                                logger.info(f"🔄 GROUPED Similar Object {similar_object_id}: '{roi_tracked_objects[similar_object_id].get('plate', '')}' -> '{processed_text}' (conf: {existing_conf:.3f} -> {confidence:.3f}, similarity: {best_similarity:.3f})")
                            else:
                                # Vẫn cập nhật last_seen để giữ object alive
                                roi_tracked_objects[similar_object_id]['last_seen'] = time.time()
                                active_roi_objects[similar_object_id] = roi_tracked_objects[similar_object_id]
                                logger.debug(f"⏭️ Similar Object {similar_object_id} kept existing: '{processed_text}' ({confidence:.3f}) vs existing ({existing_conf:.3f})")
                        else:
                            # Tạo object mới chỉ khi không có biển số tương tự
                            if is_valid_vietnam_plate_format(processed_text):
                                # FIXED: Sử dụng persistent ID để tránh tạo nhiều object cho cùng 1 biển số
                                # Tìm ID trống hoặc tạo ID mới
                                new_track_id = None
                                for test_id in range(10001, 20000):  # ID range: 10001-19999
                                    if test_id not in roi_tracked_objects:
                                        new_track_id = test_id
                                        break
                                
                                if new_track_id is None:
                                    # Nếu không tìm được ID trống, sử dụng timestamp
                                    new_track_id = int(time.time() * 1000) % 10000 + 10000
                                
                                # Tạo object mới với persistent ID
                                roi_tracked_objects[new_track_id] = {
                                    'plate': processed_text,
                                    'bbox': [x1, y1, x2, y2],
                                    'confidence': confidence,
                                    'last_seen': time.time(),
                                    'track_id': new_track_id,
                                    'display_id': len(roi_tracked_objects) + 1  # ID hiển thị: 1, 2, 3...
                                }
                                
                                # Cập nhật active_roi_objects để hiển thị
                                active_roi_objects[new_track_id] = roi_tracked_objects[new_track_id]
                                
                                # Thêm vào response arrays
                                boxes.append([x1, y1, x2, y2])
                                labels.append(f"Plate: {processed_text}")
                                ocr_results.append([processed_text, confidence])
                                
                                logger.info(f"✅ NEW Object {roi_tracked_objects[new_track_id]['display_id']}: '{processed_text}' (conf: {confidence:.3f})")
                            else:
                                logger.debug(f"❌ Invalid format, skipping: '{processed_text}'")
                                continue
                            
                            # Vẽ bounding box và text ngay lập tức
                            cv2.rectangle(display_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                            
                        # Vẽ text với background - sử dụng display_id từ roi_tracked_objects
                        if similar_object_id is not None:
                            display_id = roi_tracked_objects[similar_object_id].get('display_id', i + 1)
                        else:
                            # Tìm display_id từ active_roi_objects
                            display_id = i + 1
                            for obj_id, obj_data in active_roi_objects.items():
                                if obj_data.get('plate') == processed_text:
                                    display_id = obj_data.get('display_id', i + 1)
                                    break
                        
                        display_text = f"ID: {display_id} {processed_text}"
                        # Text nằm ở phía trên, giữa bounding box
                        text_y = max(y1 - 15, 25)
                        text_size = cv2.getTextSize(display_text, cv2.FONT_HERSHEY_SIMPLEX, 1.2, 3)[0]
                        # Tính toán vị trí x để text nằm giữa bounding box
                        text_x = x1 + (x2 - x1 - text_size[0]) // 2
                        
                        # Background đen vừa với text
                        cv2.rectangle(display_frame, (text_x - 5, text_y - text_size[1] - 5), (text_x + text_size[0] + 5, text_y + 5), (0, 0, 0), -1)
                        
                        # Text đậm hơn (thickness = 3)
                        cv2.putText(display_frame, display_text, (text_x, text_y),
                                   cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 255, 0), 3)
    
    # FIXED: Persistent tracking - không clear roi_tracked_objects mỗi frame
    # Chỉ cập nhật objects mới và xóa objects cũ
    current_time = time.time()
    
    # Cập nhật roi_tracked_objects với active_roi_objects
    for obj_id, obj_data in active_roi_objects.items():
        roi_tracked_objects[obj_id] = obj_data
    
    # Xóa objects cũ (không được cập nhật trong 3 giây)
    objects_to_remove = []
    for obj_id, obj_data in roi_tracked_objects.items():
        time_since_last_seen = current_time - obj_data.get('last_seen', 0)
        if time_since_last_seen > 3.0:  # Xóa sau 3 giây không hoạt động
            objects_to_remove.append(obj_id)
    
    for obj_id in objects_to_remove:
        del roi_tracked_objects[obj_id]
    
    # Cleanup đã được xử lý ở trên
    
    # REMOVED: ByteTracker processing để tránh hiển thị trùng lặp
    # Optimized: Remove logging for better FPS
    # REMOVED: ByteTracker loop để tránh hiển thị trùng lặp
    
    # REMOVED: Vẽ ROI objects để tránh hiển thị trùng lặp

    # OPTIMIZED DATABASE SAVING - Chỉ lưu 1 biển số duy nhất cho mỗi ROI object
    current_time = time.time()
    
    # Xóa các biển số cũ khỏi plate_history (hơn 60 giây)
    old_plates = []
    for saved_plate, save_time in plate_history.items():
        if current_time - save_time > 60.0:  # Xóa sau 60 giây
            old_plates.append(saved_plate)
    
    for old_plate in old_plates:
        del plate_history[old_plate]
        logger.debug(f"🗑️ Xóa biển số cũ khỏi history: '{old_plate}'")
    
    # Xóa các track cũ khỏi global_saved_tracks (hơn 120 giây)
    old_tracks = []
    for track_id, track_data in global_saved_tracks.items():
        if current_time - track_data.get('timestamp', 0) > 120.0:  # Xóa sau 120 giây
            old_tracks.append(track_id)
    
    for old_track in old_tracks:
        del global_saved_tracks[old_track]
        logger.debug(f"🗑️ Xóa track cũ khỏi global tracking: {old_track}")
    
    # FIXED: DATABASE SAVING với track_id ổn định từ ByteTracker
    logger.info(f"🔍 Processing {len(roi_tracked_objects)} ROI tracked objects for database saving")
    logger.info(f"🔍 ROI tracked objects details: {list(roi_tracked_objects.keys())}")
    
    # FIXED: Chỉ lưu object có ByteTracker track_id (không lưu temp tracks)
    best_objects = {}
    for obj_id, obj_data in roi_tracked_objects.items():
        track_id = obj_data.get('track_id')
        confidence = obj_data.get('confidence', 0)
        plate_text = obj_data.get('plate', '')
        
        # FIXED: Lưu tất cả objects có track_id hợp lệ (cả ByteTracker và temp tracks)
        if track_id:  # Lưu tất cả tracks có ID
            if track_id not in best_objects or confidence > best_objects[track_id]['confidence']:
                best_objects[track_id] = obj_data
                        # Optimized: Remove logging for better FPS
        else:
            logger.debug(f"⏭️ Skipping object without track_id")
    
    # FIXED: Lưu chỉ các object tốt nhất với track_id ổn định
    # Optimized: Remove logging for better FPS
    
    # FIXED: Thêm logic kiểm tra cooldown để tránh crop nhiều lần
    for track_id, obj_data in best_objects.items():
        plate_text = obj_data.get('plate', '')
        confidence = obj_data.get('confidence', 0)
        bbox = obj_data.get('bbox', [])
        last_seen = obj_data.get('last_seen', 0)
        
        # FIXED: Kiểm tra cooldown để tránh crop nhiều lần cho cùng 1 biển số
        plate_key = f"plate_{plate_text}"
        if plate_key in plate_history:
            time_since_last_save = current_time - plate_history[plate_key]
            if time_since_last_save < 30.0:  # Cooldown 30 giây cho cùng 1 biển số
                logger.debug(f"⏭️ Plate '{plate_text}' in cooldown ({30.0 - time_since_last_save:.1f}s remaining), skipping crop")
                continue
        
        # Xử lý object trong vòng 5 giây
        time_since_last_seen = current_time - last_seen
        
        if time_since_last_seen > 5.0:  # Tăng timeout lên 5 giây
            continue
            
        # FIXED: SỬ DỤNG CONFIDENCE THRESHOLD 0.7 VÀ VALIDATION BIỂN SỐ VIỆT NAM
        if plate_text and len(plate_text) >= 4 and confidence >= 0.7:  # Set confidence >= 0.7
            # SỬ DỤNG HÀM VALIDATION BIỂN SỐ VIỆT NAM CÓ SẴN
            if not is_valid_vietnam_plate_format(plate_text):
                continue
                
            # FIXED: CẬP NHẬT HIỂN THỊ TRACKING VỚI ĐỘ TIN CẬY MỚI
            update_tracking_display_with_confidence(track_id, plate_text, confidence, bbox, display_frame)
            
            # FIXED: KIỂM TRA NGHIÊM NGẶT với biển số (không phụ thuộc track_id)
            plate_key = f"plate_{plate_text}"
            
            # FIXED: Kiểm tra cooldown dựa trên biển số (240 giây) để tránh spam
            if plate_key in plate_history and current_time - plate_history[plate_key] < 300.0:
                continue
            logger.info(f"🔍 BEST ROI Object (Track {track_id}) will be saved to database")
            logger.info(f"🚀 DATABASE SAVING: Starting database save process for plate '{plate_text}'")
            
            # FIXED: Lưu crop image với track_id ổn định
            clean_plate_text = re.sub(r'[\\/*?:"<>|]', "_", plate_text)
            crop_filename = f"plate_track_{track_id}_{clean_plate_text}_{int(current_time)}.jpg"
            
            try:
                crop = crop_and_enhance_plate(frame, bbox, enhancement_level="minimal")
                
                if crop.size > 0:
                    crop_path = os.path.join(CROPS_FOLDER, crop_filename)
                    success_save = cv2.imwrite(crop_path, crop)
                    if success_save:
                        logger.info(f"✅ Track {track_id} crop image saved: {crop_path}")
                        
                        # FIXED: Send to database với track_id ổn định
                        frame_path = f"static/crops/{crop_filename}"
                        logger.info(f"🚀 Sending Track {track_id} to database: plate='{plate_text}', frame_path='{frame_path}'")
                        
                        if ENABLE_THREADING:
                            thread_pool.submit(
                                send_plate_to_server, str(track_id), {
                                    'plate': plate_text,
                                    'confidence': confidence,
                                    'bbox': bbox,
                                    'crop_image_path': frame_path
                                }, frame_path, camera_id, source_type, video_filename, camera_location, camera_name
                            )
                            logger.info(f"🚀 Track {track_id} plate '{plate_text}' queued for database")
                        else:
                            # Gửi sync
                            success = send_plate_to_server(str(track_id), {
                                'plate': plate_text,
                                'confidence': confidence,
                                'bbox': bbox,
                                'crop_image_path': frame_path
                            }, frame_path, camera_id, source_type, video_filename, camera_location, camera_name)
                            logger.info(f"🚀 Track {track_id} plate '{plate_text}' sent to database: {success}")
            except Exception as e:
                logger.error(f"Error saving Track {track_id} crop image: {e}")
            
            # FIXED: Ghi nhận đã gửi để tránh spam (240 giây cooldown cho biển số)
            plate_history[plate_key] = current_time
            roi_saved_plates[track_id] = plate_text  # Lưu biển số đã gửi cho track này
            global_saved_tracks[track_id] = {  # FIXED: GLOBAL TRACKING với confidence
                'plate': plate_text,
                'confidence': confidence,
                'timestamp': current_time
            }
            
            # FIXED: Xóa tất cả biển số cũ khỏi plate_history (giữ lại biển số hiện tại)
            keys_to_remove = []
            current_plate_key = f"plate_{plate_text}"
            for key in plate_history.keys():
                # Xóa các biển số cũ khác (không phải biển số hiện tại)
                if key.startswith("plate_") and key != current_plate_key:
                    # Kiểm tra thời gian - chỉ xóa biển số cũ hơn 5 phút
                    if current_time - plate_history[key] > 300:  # 5 phút
                        keys_to_remove.append(key)
            
            for key in keys_to_remove:
                del plate_history[key]
                logger.debug(f"🗑️ Xóa biển số cũ khỏi history: {key}")
            
            logger.info(f"✅ Đã lưu biển số '{plate_text}' cho Track {track_id} - plate cooldown 240 giây")

    # REMOVED: Fallback để tránh lưu trùng lặp

    # FIXED: HỢP NHẤT CÁC BIỂN SỐ TƯƠNG TỰ TRONG ROI OBJECTS - THREAD SAFE
    # Chỉ thực hiện grouping mỗi 10 giây để tránh overhead
    if current_time - thread_container.get('last_fps_time', current_time) >= 10.0:
        try:
            logger.info("🔗 Merging similar plates in ROI objects...")
            
            # FIXED: Tạo danh sách các biển số và confidence với track_id
            plate_groups = {}
            for obj_id, obj_data in roi_tracked_objects.items():
                plate_text = obj_data.get('plate', '')
                confidence = obj_data.get('confidence', 0)
                track_id = obj_data.get('track_id')
                
                if plate_text:
                    # Tìm biển số tương tự
                    found_group = False
                    for group_key, group_data in plate_groups.items():
                        similarity = calculate_plate_similarity(plate_text, group_key)
                        if similarity > 0.6:  # 60% similarity threshold
                            # Thêm vào group hiện có
                            group_data['plates'].append({
                                'plate': plate_text,
                                'confidence': confidence,
                                'obj_id': obj_id,
                                'track_id': track_id,
                                'bbox': obj_data.get('bbox', [])
                            })
                            found_group = True
                            break
                    
                    # Nếu không tìm thấy group tương tự, tạo mới
                    if not found_group:
                        plate_groups[plate_text] = {
                            'plates': [{
                                'plate': plate_text,
                                'confidence': confidence,
                                'obj_id': obj_id,
                                'track_id': track_id,
                                'bbox': obj_data.get('bbox', [])
                            }]
                        }
            
            # FIXED: Hợp nhất các group tương tự - chỉ giữ 1 biển số chính xác nhất
            merged_objects = {}
            for group_key, group_data in plate_groups.items():
                plates = group_data['plates']
                
                # FIXED: Tìm biển số có confidence cao nhất VÀ format hợp lệ
                valid_plates = [p for p in plates if is_valid_vietnam_plate_format(p['plate'])]
                
                if valid_plates:
                    # Ưu tiên biển số có format hợp lệ và confidence cao nhất
                    best_plate = max(valid_plates, key=lambda x: x['confidence'])
                    
                    # FIXED: Chỉ giữ biển số có confidence >= 0.85
                    if best_plate['confidence'] >= 0.7:
                        best_obj_id = best_plate['obj_id']
                        best_track_id = best_plate['track_id']
                        
                        # FIXED: Cập nhật object với biển số tốt nhất và track_id ổn định
                        merged_objects[best_obj_id] = roi_tracked_objects[best_obj_id]
                        merged_objects[best_obj_id].update({
                            'plate': best_plate['plate'],
                            'confidence': best_plate['confidence'],
                            'bbox': best_plate['bbox'],
                            'track_id': best_track_id  # FIXED: Giữ track_id ổn định
                        })
                    else:
                        logger.debug(f"⏭️ Group '{group_key}' không có biển số đủ chính xác (conf: {best_plate['confidence']:.3f} < 0.85)")
                        continue
                else:
                    # Nếu không có format hợp lệ, chọn confidence cao nhất
                    best_plate = max(plates, key=lambda x: x['confidence'])
                    
                    # FIXED: Chỉ giữ biển số có confidence >= 0.85
                    if best_plate['confidence'] >= 0.7:
                        best_obj_id = best_plate['obj_id']
                        best_track_id = best_plate['track_id']
                        
                        # FIXED: Cập nhật object với biển số tốt nhất và track_id ổn định
                        merged_objects[best_obj_id] = roi_tracked_objects[best_obj_id]
                        merged_objects[best_obj_id].update({
                            'plate': best_plate['plate'],
                            'confidence': best_plate['confidence'],
                            'bbox': best_plate['bbox'],
                            'track_id': best_track_id  # FIXED: Giữ track_id ổn định
                        })
                    else:
                        logger.debug(f"⏭️ Group '{group_key}' không có biển số đủ chính xác (conf: {best_plate['confidence']:.3f} < 0.7)")
                        continue
                
                # FIXED: Xóa các object khác trong group và cập nhật global tracking
                for plate_info in plates:
                    if plate_info['obj_id'] != best_obj_id:
                        old_track_id = plate_info['track_id']
                        logger.info(f"🗑️ Removed duplicate plate: '{plate_info['plate']}' (Track {old_track_id}, conf: {plate_info['confidence']:.3f}) -> keeping '{best_plate['plate']}' (Track {best_track_id}, conf: {best_plate['confidence']:.3f})")
                        
                        # FIXED: Cập nhật global tracking để track_id cũ trỏ đến track_id mới
                        if old_track_id in global_saved_tracks:
                            # Chuyển dữ liệu từ track_id cũ sang track_id mới
                            old_data = global_saved_tracks[old_track_id]
                            global_saved_tracks[best_track_id] = old_data
                            del global_saved_tracks[old_track_id]
                            logger.info(f"🔄 Updated global tracking: Track {old_track_id} -> Track {best_track_id}")
            
            # FIXED: Cập nhật roi_tracked_objects
            roi_tracked_objects.clear()
            roi_tracked_objects.update(merged_objects)
            
            logger.info(f"✅ Merged similar plates: {len(plate_groups)} groups -> {len(merged_objects)} unique objects")
            
        except Exception as e:
            logger.error(f"Error merging similar plates: {e}")

    # Optimized: Remove duplicate FPS calculation - already calculated above

    # FIXED: Draw ROI objects and persistent displays on the frame
    draw_roi_objects(display_frame, roi)
    draw_persistent_displays(display_frame, roi)

    # Return results - với error handling
    try:
        # Encode frame với error handling và tối ưu quality cho 20 FPS
        encode_result = cv2.imencode('.jpg', display_frame, [cv2.IMWRITE_JPEG_QUALITY, 60])
        if encode_result[0]:  # Nếu encode thành công
            frame_bytes = encode_result[1].tobytes()
        else:
            logger.error("Failed to encode frame")
            frame_bytes = b''
        
        return {
            'frame': frame_bytes,
            'boxes': boxes,
            'labels': labels,
            'ocr_results': ocr_results,
            'tracked_objects': roi_tracked_objects.copy(),  # Sử dụng ROI objects thay vì tracked_objects
            'ids': list(roi_tracked_objects.keys()),  # Sử dụng ROI object IDs
            'frame_width': original_width,
            'frame_height': original_height,
            'roi': [roi_xmin, roi_ymin, roi_xmax, roi_ymax],
            'fps': thread_container.get('current_fps', 0),
            'detection_count': len(boxes),
            'track_count': len(roi_tracked_objects),  # Số lượng ROI objects
            'skipped': should_skip
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
            'roi': [roi_xmin, roi_ymin, roi_xmax, roi_ymax],
            'fps': thread_container.get('current_fps', 0),
            'detection_count': 0,
            'track_count': 0,
            'skipped': True
        }
                        
                        
