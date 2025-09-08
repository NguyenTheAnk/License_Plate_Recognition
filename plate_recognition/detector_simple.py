#!/usr/bin/env python3
"""
License Plate Detection using YOLOv9s trained for license plates + PaddleOCR
YOLOv9s.pt được train để detect license plates trực tiếp
"""

import cv2
import numpy as np
import time
import logging
from ultralytics import YOLO
from paddleocr import PaddleOCR
import re
import os
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global variables
yolo_model = None
ocr_reader = None
frame_count = 0

# ROI Configuration - Full width, center height
ROI_PERCENT_XMIN = 0.0   # 0% from left (full width)
ROI_PERCENT_YMIN = 0.25  # 25% from top  
ROI_PERCENT_XMAX = 1.0   # 100% from left (full width)
ROI_PERCENT_YMAX = 0.75  # 75% from top (height = 50%)

def initialize_models():
    """Initialize YOLO and OCR models"""
    global yolo_model, ocr_reader
    
    try:
        # Load YOLO model (trained for license plates)
        yolo_model = YOLO('yolov9s.pt')
        logger.info("✅ YOLO license plate model loaded successfully")
        
        # Log model info
        if hasattr(yolo_model.model, 'names'):
            logger.info(f"📋 Model classes: {yolo_model.model.names}")
        
        # Load OCR model
        ocr_reader = PaddleOCR(use_angle_cls=False, lang='en', show_log=False, use_gpu=False)
        logger.info("✅ OCR model loaded successfully")
        
        return True
    except Exception as e:
        logger.error(f"❌ Model initialization failed: {e}")
        return False

def calculate_roi_coordinates(width, height):
    """Calculate ROI coordinates"""
    roi_xmin = max(0, int(width * ROI_PERCENT_XMIN))
    roi_ymin = max(0, int(height * ROI_PERCENT_YMIN))
    roi_xmax = min(width-1, int(width * ROI_PERCENT_XMAX))
    roi_ymax = min(height-1, int(height * ROI_PERCENT_YMAX))
    return roi_xmin, roi_ymin, roi_xmax, roi_ymax

def is_bbox_in_roi(bbox, width, height):
    """Check if bounding box is in ROI"""
    x1, y1, x2, y2 = bbox
    roi_xmin, roi_ymin, roi_xmax, roi_ymax = calculate_roi_coordinates(width, height)
    
    # Check if any part of bbox is in ROI
    return (x1 < roi_xmax and x2 > roi_xmin and y1 < roi_ymax and y2 > roi_ymin)

def save_plate_crop(plate_crop, plate_text, frame_count):
    """Save plate crop image to static/crops directory"""
    try:
        # Get current directory and create crops directory
        current_dir = os.path.dirname(os.path.abspath(__file__))
        crops_dir = os.path.join(current_dir, "static", "crops")
        os.makedirs(crops_dir, exist_ok=True)
        
        # Generate filename with timestamp
        timestamp = int(time.time())
        safe_text = re.sub(r'[^\w\-_.]', '_', plate_text) if plate_text else "unknown"
        filename = f"plate_{frame_count}_{safe_text}_{timestamp}.jpg"
        filepath = os.path.join(crops_dir, filename)
        
        # Save image
        cv2.imwrite(filepath, plate_crop)
        logger.info(f"💾 Plate crop saved: {filepath}")
        
        # Return relative path for database storage
        relative_path = f"/static/crops/{filename}"
        return relative_path
    except Exception as e:
        logger.error(f"Failed to save plate crop: {e}")
        return None

def run_ocr_on_plate(plate_crop, frame_count=0):
    """Run OCR on plate crop with multiple preprocessing methods and 2-line plate support"""
    try:
        if ocr_reader is None or plate_crop is None:
            return None, 0.0
        
        height, width = plate_crop.shape[:2]
        if width < 10 or height < 5:
            return None, 0.0
        
        # Resize if too small for better OCR
        if width < 150 or height < 40:
            scale_factor = max(150/width, 40/height, 2.0)
            new_width = int(width * scale_factor)
            new_height = int(height * scale_factor)
            plate_crop = cv2.resize(plate_crop, (new_width, new_height), interpolation=cv2.INTER_CUBIC)
            logger.info(f"🔍 Resized plate crop to: {new_width}x{new_height}")
        
        # Check if this might be a 2-line plate (height > width * 0.4)
        is_potential_2line = height > width * 0.4
        
        # Prepare multiple preprocessed versions
        preprocessed_versions = []
        
        # 1. Original
        preprocessed_versions.append(("original", plate_crop))
        
        # 2. Grayscale
        if len(plate_crop.shape) == 3:
            gray = cv2.cvtColor(plate_crop, cv2.COLOR_BGR2GRAY)
        else:
            gray = plate_crop.copy()
        
        # 3. Enhanced grayscale
        enhanced = cv2.bilateralFilter(gray, 9, 75, 75)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
        enhanced = clahe.apply(enhanced)
        preprocessed_versions.append(("enhanced", enhanced))
        
        # 4. OTSU threshold
        _, thresh_otsu = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        preprocessed_versions.append(("otsu", thresh_otsu))
        
        # 5. Adaptive threshold
        adaptive = cv2.adaptiveThreshold(enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
        preprocessed_versions.append(("adaptive", adaptive))
        
        # 6. Multiple manual thresholds
        for thresh_val in [160, 180, 200, 220]:
            _, manual_thresh = cv2.threshold(enhanced, thresh_val, 255, cv2.THRESH_BINARY)
            preprocessed_versions.append((f"thresh_{thresh_val}", manual_thresh))
        
        # 7. Inverted versions (for white text on dark background)
        inv_otsu = cv2.bitwise_not(thresh_otsu)
        preprocessed_versions.append(("inv_otsu", inv_otsu))
        
        inv_adaptive = cv2.bitwise_not(adaptive)
        preprocessed_versions.append(("inv_adaptive", inv_adaptive))
        
        # 8. For 2-line plates, try splitting the image
        if is_potential_2line:
            # Split into top and bottom halves
            top_half = enhanced[:height//2, :]
            bottom_half = enhanced[height//2:, :]
            preprocessed_versions.append(("top_half", top_half))
            preprocessed_versions.append(("bottom_half", bottom_half))
            
            # Also try with more aggressive preprocessing for 2-line plates
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
            morph = cv2.morphologyEx(enhanced, cv2.MORPH_CLOSE, kernel)
            preprocessed_versions.append(("morph_2line", morph))
        
        # Try OCR on all versions
        best_text = ""
        best_conf = 0.0
        best_method = ""
        all_texts = []
        
        for method_name, version in preprocessed_versions:
            try:
                result = ocr_reader.ocr(version, det=True, rec=True, cls=False)
                
                if result and result[0]:
                    method_texts = []
                    for line in result[0]:
                        if len(line) >= 2:
                            text = line[1][0].strip()
                            conf = line[1][1]
                            
                            # Clean text - remove special characters but keep letters, numbers, dashes
                            cleaned_text = re.sub(r'[^\w\-.]', '', text)
                            
                            # Only consider if we have meaningful text
                            if len(cleaned_text) >= 3 and conf > 0.3:
                                method_texts.append((cleaned_text, conf))
                                all_texts.append((cleaned_text, conf, method_name))
                                logger.info(f"📤 OCR {method_name}: '{cleaned_text}' (conf: {conf:.3f})")
                    
                    # For 2-line plates, combine top and bottom results
                    if method_name in ["top_half", "bottom_half"] and method_texts:
                        # Store for later combination
                        continue
                    
                    # For single-line processing, take the best result
                    if method_texts:
                        best_method_text = max(method_texts, key=lambda x: x[1])
                        if best_method_text[1] > best_conf:
                            best_text = best_method_text[0]
                            best_conf = best_method_text[1]
                            best_method = method_name
                
            except Exception as e:
                logger.debug(f"OCR method {method_name} failed: {e}")
                continue
        
        # Special handling for 2-line plates - combine top and bottom results
        if is_potential_2line and all_texts:
            top_texts = [(text, conf) for text, conf, method in all_texts if method == "top_half"]
            bottom_texts = [(text, conf) for text, conf, method in all_texts if method == "bottom_half"]
            
            if top_texts and bottom_texts:
                # Get best from each half
                best_top = max(top_texts, key=lambda x: x[1])
                best_bottom = max(bottom_texts, key=lambda x: x[1])
                
                # Combine them
                combined_text = best_top[0] + best_bottom[0]
                combined_conf = (best_top[1] + best_bottom[1]) / 2
                
                if combined_conf > best_conf:
                    best_text = combined_text
                    best_conf = combined_conf
                    best_method = "2line_combined"
                    logger.info(f"🔗 Combined 2-line result: '{best_text}' (conf: {best_conf:.3f})")
        
        # Apply smart character correction
        if best_text:
            corrected_text = smart_character_correction(best_text)
            if corrected_text != best_text:
                logger.info(f"🔧 Character correction: '{best_text}' -> '{corrected_text}'")
                best_text = corrected_text
        
        # Clean and format the final result
        if best_text:
            # Clean text but preserve structure
            cleaned_text = clean_and_preserve_structure(best_text)
            
            # Analyze structure and format
            analysis_result = analyze_dash_position_precise(cleaned_text)
            vehicle_type = analysis_result['vehicle_type']
            confidence = analysis_result['confidence']
            
            # Format according to Vietnamese standards
            clean_for_format = analysis_result['analysis']['clean_text']
            formatted_text = format_plate_by_type(clean_for_format, vehicle_type)
            
            # Use formatted text if it's better
            if len(formatted_text) >= len(cleaned_text) and formatted_text != cleaned_text:
                best_text = formatted_text
                logger.info(f"📝 Formatted result: '{formatted_text}' ({vehicle_type})")
            
            logger.info(f"🏆 Final OCR result: '{best_text}' from {best_method} (conf: {best_conf:.3f})")
            
            # Save crop with good results
            if best_conf > 0.3:
                save_plate_crop(plate_crop, best_text, frame_count)
        
        return best_text, best_conf
        
    except Exception as e:
        logger.error(f"OCR processing failed: {e}")
        return None, 0.0

def clean_and_preserve_structure(text):
    """
    Làm sạch text nhưng vẫn giữ lại cấu trúc dấu - và .
    """
    if not text:
        return ""
    
    # Chuyển thành uppercase
    text = text.upper().strip()
    
    # Loại bỏ các ký tự không mong muốn nhưng giữ lại - và .
    # Chỉ giữ lại: chữ cái, số, dấu gạch ngang (-), dấu chấm (.)
    cleaned = re.sub(r'[^A-Z0-9\-\.]', '', text)
    
    # Loại bỏ các từ không cần thiết
    unwanted_patterns = ['VN', 'VIET', 'NAM', 'VIETNAM']
    for pattern in unwanted_patterns:
        cleaned = cleaned.replace(pattern, '')
    
    return cleaned.strip()

def analyze_dash_position_precise(text):
    """
    Phân tích chính xác vị trí dấu `-` trong biển số
    
    LOGIC CHUẨN VIỆT NAM:
    - Ô tô: 30A-123.45 (dấu `-` ở vị trí 3, sau mã tỉnh + 1 chữ cái)
    - Xe máy: 30A1-4567 (dấu `-` ở vị trí 4, sau mã tỉnh + 1 chữ cái + 1 số)
    """
    if not text:
        return {'vehicle_type': 'unknown', 'confidence': 0.0, 'analysis': {}}
    
    # Tìm vị trí dấu `-`
    dash_position = text.find('-')
    
    # Phân tích cấu trúc
    total_length = len(text)
    clean_text = re.sub(r'[^A-Z0-9]', '', text)  # Text không có dấu
    clean_length = len(clean_text)
    
    analysis = {
        'original_text': text,
        'clean_text': clean_text,
        'total_length': total_length,
        'clean_length': clean_length,
        'dash_position': dash_position,
        'has_dash': dash_position != -1,
        'has_dot': '.' in text
    }
    
    # LOGIC CHÍNH: Phân tích dựa trên vị trí dấu `-`
    if dash_position == 3:
        # Format: XXA-YYYY -> Ô TÔ
        # Kiểm tra xem có đủ ký tự không
        if analysis['clean_length'] < 6:
            return {'vehicle_type': 'unknown', 'confidence': 0.15, 'analysis': analysis, 'pattern': 'incomplete_car_format'}
        return _classify_car_by_dash(text, analysis)
    elif dash_position == 4:
        # Format: XXA1-YYYY -> XE MÁY hoặc XXAB-YYYY -> NGOẠI GIAO
        # Kiểm tra xem có phải ngoại giao không (2 chữ cái sau mã tỉnh)
        if len(analysis['clean_text']) >= 4:
            first_two = analysis['clean_text'][:2]
            next_two = analysis['clean_text'][2:4]
            if first_two.isdigit() and next_two.isalpha():
                return _classify_special_by_dash(text, analysis)
        return _classify_motorcycle_by_dash(text, analysis)
    elif dash_position > 4:
        # Có thể là biển đặc biệt (ngoại giao, etc.)
        return _classify_special_by_dash(text, analysis)
    elif dash_position == 2:
        # Format: XX-YYYY -> Có thể là ô tô với mã tỉnh ngắn
        if analysis['clean_length'] < 6:
            return {'vehicle_type': 'unknown', 'confidence': 0.15, 'analysis': analysis, 'pattern': 'incomplete_car_format'}
        return _classify_car_by_dash(text, analysis)
    else:
        # Không có dấu `-` hoặc vị trí không đúng -> Fallback
        return _classify_by_fallback_logic(text, analysis)

def _classify_car_by_dash(text, analysis):
    """Phân loại ô tô khi đã xác định dấu `-` ở vị trí 3"""
    clean_length = analysis['clean_length']
    
    if clean_length == 7:
        return {'vehicle_type': 'car', 'confidence': 0.95, 'analysis': analysis, 'pattern': 'car_short_7chars'}
    elif clean_length == 8:
        return {'vehicle_type': 'car', 'confidence': 0.98, 'analysis': analysis, 'pattern': 'car_standard_8chars'}
    elif clean_length == 9:
        if analysis['has_dot']:
            return {'vehicle_type': 'car', 'confidence': 0.95, 'analysis': analysis, 'pattern': 'car_long_9chars'}
        else:
            # 9 ký tự không có dấu chấm -> có thể là taxi
            return {'vehicle_type': 'taxi', 'confidence': 0.85, 'analysis': analysis, 'pattern': 'taxi_9chars'}
    elif clean_length >= 10:
        return {'vehicle_type': 'taxi', 'confidence': 0.90, 'analysis': analysis, 'pattern': 'taxi_10plus_chars'}
    else:
        return {'vehicle_type': 'car', 'confidence': 0.70, 'analysis': analysis, 'pattern': 'car_variant'}

def _classify_motorcycle_by_dash(text, analysis):
    """Phân loại xe máy khi đã xác định dấu `-` ở vị trí 4"""
    clean_length = analysis['clean_length']
    
    if clean_length == 8:
        return {'vehicle_type': 'motorcycle_old', 'confidence': 0.98, 'analysis': analysis, 'pattern': 'motorcycle_old_8chars'}
    elif clean_length == 9:
        return {'vehicle_type': 'motorcycle_new', 'confidence': 0.98, 'analysis': analysis, 'pattern': 'motorcycle_new_9chars'}
    else:
        return {'vehicle_type': 'motorcycle_old', 'confidence': 0.80, 'analysis': analysis, 'pattern': 'motorcycle_variant'}

def _classify_special_by_dash(text, analysis):
    """Phân loại biển đặc biệt khi dấu `-` ở vị trí > 4"""
    clean_text = analysis['clean_text']
    clean_length = analysis['clean_length']
    
    # Kiểm tra pattern ngoại giao: 29AB-123.45
    if len(clean_text) >= 4:
        first_two = clean_text[:2]  # Mã tỉnh
        next_two = clean_text[2:4]  # Chữ cái
        
        if first_two.isdigit() and next_two.isalpha():
            return {'vehicle_type': 'diplomatic', 'confidence': 0.90, 'analysis': analysis, 'pattern': 'diplomatic_special'}
    
    return {'vehicle_type': 'unknown', 'confidence': 0.30, 'analysis': analysis, 'pattern': 'special_unknown'}

def _classify_by_fallback_logic(text, analysis):
    """Logic fallback khi không có dấu `-` hoặc vị trí dấu `-` không chuẩn"""
    clean_text = analysis['clean_text']
    clean_length = len(clean_text)
    
    if clean_length < 6:
        return {'vehicle_type': 'unknown', 'confidence': 0.20, 'analysis': analysis, 'pattern': 'fallback_too_short'}
    
    # Kiểm tra trường hợp có dấu `-` nhưng không đủ ký tự
    if analysis['has_dash'] and clean_length < 6:
        return {'vehicle_type': 'unknown', 'confidence': 0.15, 'analysis': analysis, 'pattern': 'fallback_incomplete_with_dash'}
    
    # Kiểm tra pattern cơ bản: 2 số + 1 chữ + ...
    if len(clean_text) >= 4:
        first_two = clean_text[:2]
        third_char = clean_text[2]
        fourth_char = clean_text[3] if len(clean_text) > 3 else ''
        
        if first_two.isdigit() and third_char.isalpha():
            # Kiểm tra pattern ngoại giao: 2 số + 2 chữ
            if len(clean_text) >= 4 and clean_text[3].isalpha():
                return {'vehicle_type': 'diplomatic', 'confidence': 0.90, 'analysis': analysis, 'pattern': 'fallback_diplomatic'}
            
            if clean_length == 7:
                return {'vehicle_type': 'car', 'confidence': 0.80, 'analysis': analysis, 'pattern': 'fallback_car_7chars'}
            elif clean_length == 8:
                # 8 ký tự: cần kiểm tra kỹ hơn
                # Xe máy cũ: 30A1-4567 (ký tự thứ 4 là số, sau đó là 4 số)
                # Ô tô: 30A-123.45 (ký tự thứ 4 là số, nhưng có thể là ô tô nếu có dấu chấm)
                if fourth_char.isdigit():
                    # Kiểm tra xem có phải xe máy cũ không (30A1-4567)
                    # Xe máy cũ: 30A1-4567 (ký tự thứ 4 là số, sau đó là 4 số)
                    # Ô tô: 30A-123.45 (ký tự thứ 4 là số, nhưng có thể có dấu chấm)
                    if len(clean_text) == 8 and clean_text[4:].isdigit() and len(clean_text[4:]) == 4:
                        # Kiểm tra pattern xe máy cũ: 30A1-4567
                        # Nếu có dấu chấm trong text gốc -> ô tô
                        if '.' in text:
                            return {'vehicle_type': 'car', 'confidence': 0.85, 'analysis': analysis, 'pattern': 'fallback_car_8chars_with_dot'}
                        else:
                            # 8 ký tự với pattern 30A1-4567 -> xe máy cũ (dù có dấu gạch ngang hay không)
                            # Chỉ phân biệt dựa trên pattern, không dựa vào dấu gạch ngang
                            return {'vehicle_type': 'motorcycle_old', 'confidence': 0.85, 'analysis': analysis, 'pattern': 'fallback_motorcycle_8chars'}
                    else:
                        # Các trường hợp khác với 8 ký tự -> ô tô
                        return {'vehicle_type': 'car', 'confidence': 0.85, 'analysis': analysis, 'pattern': 'fallback_car_8chars'}
                else:
                    # 8 ký tự với ký tự thứ 4 không phải số -> ô tô
                    return {'vehicle_type': 'car', 'confidence': 0.85, 'analysis': analysis, 'pattern': 'fallback_car_8chars'}
            elif clean_length == 9:
                if fourth_char.isdigit():
                    return {'vehicle_type': 'motorcycle_new', 'confidence': 0.85, 'analysis': analysis, 'pattern': 'fallback_motorcycle_9chars'}
                else:
                    return {'vehicle_type': 'car', 'confidence': 0.85, 'analysis': analysis, 'pattern': 'fallback_car_9chars'}
            elif clean_length >= 10:
                return {'vehicle_type': 'taxi', 'confidence': 0.75, 'analysis': analysis, 'pattern': 'fallback_taxi'}
    
    return {'vehicle_type': 'unknown', 'confidence': 0.30, 'analysis': analysis, 'pattern': 'fallback_no_match'}

def format_plate_by_type(clean_text, vehicle_type):
    """Format biển số theo đúng chuẩn dựa trên loại xe"""
    if not clean_text or len(clean_text) < 6:
        return clean_text
    
    length = len(clean_text)
    
    if vehicle_type == 'car':
        # Format ô tô: 30A-123.45
        if length == 7:
            return f"{clean_text[:3]}-{clean_text[3:5]}.{clean_text[5:]}"
        elif length == 8:
            return f"{clean_text[:3]}-{clean_text[3:6]}.{clean_text[6:]}"
        elif length == 9:
            return f"{clean_text[:3]}-{clean_text[3:7]}.{clean_text[7:]}"
        else:
            return f"{clean_text[:3]}-{clean_text[3:]}"
    
    elif vehicle_type == 'motorcycle_old':
        # Format xe máy cũ: 30A1-4567
        if length == 8:
            return f"{clean_text[:4]}-{clean_text[4:]}"
        else:
            return clean_text
    
    elif vehicle_type == 'motorcycle_new':
        # Format xe máy mới: 30A1-456.78
        if length == 9:
            return f"{clean_text[:4]}-{clean_text[4:7]}.{clean_text[7:]}"
        else:
            return clean_text
    
    elif vehicle_type == 'taxi':
        # Format taxi: 30A-12345+
        return f"{clean_text[:3]}-{clean_text[3:]}"
    
    elif vehicle_type == 'diplomatic':
        # Format ngoại giao: 30AB-123.45
        if length == 8:
            return f"{clean_text[:4]}-{clean_text[4:6]}.{clean_text[6:]}"
        elif length == 9:
            return f"{clean_text[:4]}-{clean_text[4:7]}.{clean_text[7:]}"
        else:
            return clean_text
    
    else:
        return clean_text

def smart_character_correction(text):
    """Sửa lỗi nhận diện ký tự thông minh dựa trên vị trí"""
    if not text or len(text) < 3:
        return text
    
    corrections = {
        # Số -> Chữ (cho vị trí chữ cái)
        '0': 'O', '1': 'I', '5': 'S', '2': 'Z', '6': 'G', '8': 'B',
        # Chữ -> Số (cho vị trí số)
        'O': '0', 'I': '1', 'S': '5', 'Z': '2', 'G': '6', 'B': '8',
        'D': '0', 'Q': '0'
    }
    
    result = list(text)
    
    for i, char in enumerate(result):
        if i < 2:  # Vị trí 0,1: Mã tỉnh (phải là số)
            if char.isalpha() and char in corrections:
                corrected = corrections[char]
                if corrected.isdigit():
                    result[i] = corrected
        elif i == 2:  # Vị trí 2: Chữ cái đầu tiên (phải là chữ)
            if char.isdigit() and char in corrections:
                corrected = corrections[char]
                if corrected.isalpha():
                    result[i] = corrected
    
    return ''.join(result)

def is_valid_vietnamese_plate(text):
    """Check if text matches Vietnamese license plate patterns using comprehensive validation"""
    if not text:
        return False, "unknown", 0.0
    
    # Clean text but preserve structure
    cleaned_text = clean_and_preserve_structure(text)
    
    # Analyze structure
    analysis_result = analyze_dash_position_precise(cleaned_text)
    vehicle_type = analysis_result['vehicle_type']
    confidence = analysis_result['confidence']
    
    # Format according to Vietnamese standards
    clean_for_format = analysis_result['analysis']['clean_text']
    formatted_text = format_plate_by_type(clean_for_format, vehicle_type)
    
    # Validate format
    patterns = {
        'car': [
            r'^\d{2}[A-Z]-\d{2}\.\d{2}$',      # 29A-12.34
            r'^\d{2}[A-Z]-\d{3}\.\d{2}$',      # 29A-123.45
            r'^\d{2}[A-Z]-\d{4}\.\d{2}$',      # 29A-1234.56
        ],
        'motorcycle_old': [
            r'^\d{2}[A-Z]\d-\d{4}$',           # 29A1-2345
        ],
        'motorcycle_new': [
            r'^\d{2}[A-Z]\d-\d{3}\.\d{2}$',    # 29A1-123.45
        ],
        'taxi': [
            r'^\d{2}[A-Z]-\d{5,}$',             # 29A-12345+
        ],
        'diplomatic': [
            r'^\d{2}[A-Z]{2}-\d{2}\.\d{2}$',   # 29AB-12.34
            r'^\d{2}[A-Z]{2}-\d{3}\.\d{2}$',   # 29AB-123.45
        ]
    }
    
    if vehicle_type in patterns:
        for pattern in patterns[vehicle_type]:
            if re.match(pattern, formatted_text):
                return True, vehicle_type, confidence * 0.95
    
    return False, vehicle_type, confidence * 0.3

def detect_and_ocr_simple(frame):
    """Main detection function using YOLO for license plates + OCR"""
    global frame_count
    
    try:
        if frame is None or frame.size == 0:
            return {'frame': b'', 'boxes': [], 'labels': [], 'ocr_results': []}
        
        original_height, original_width = frame.shape[:2]
        display_frame = frame.copy()
        frame_count += 1
        
        logger.info(f"🔍 Processing frame {frame_count}: {original_width}x{original_height}")
        
        # Draw ROI zone
        roi_xmin, roi_ymin, roi_xmax, roi_ymax = calculate_roi_coordinates(original_width, original_height)
        cv2.rectangle(display_frame, (roi_xmin, roi_ymin), (roi_xmax, roi_ymax), (0, 255, 255), 3)
        cv2.putText(display_frame, "DETECTION ZONE", (roi_xmin + 10, roi_ymin - 10), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        
        # Initialize results
        boxes = []
        labels = []
        ocr_results = []
        tracked_objects = {}
        
        # Run YOLO detection for license plates
        if yolo_model is not None:
            try:
                logger.info(f"🔍 Running YOLO detection on frame {frame_count}")
                
                # Run YOLO with low confidence to catch more plates
                # Since this model is trained specifically for license plates, we don't need class filtering
                results = yolo_model(frame, conf=0.3, verbose=False)  # Higher confidence for license plates only
                
                total_detections = 0
                for result in results:
                    if result.boxes is not None:
                        total_detections += len(result.boxes)
                
                logger.info(f"🎯 YOLO found {total_detections} license plate detections")
                
                # If no detections, try with lower confidence
                if total_detections == 0:
                    logger.info("⚠️ No detections found, trying lower confidence...")
                    results = yolo_model(frame, conf=0.1, verbose=False)
                    total_detections = sum(len(result.boxes) if result.boxes is not None else 0 for result in results)
                    logger.info(f"🎯 Lower confidence found {total_detections} detections")
                
                plate_count = 0
                processed_plates = 0
                
                for result in results:
                    if result.boxes is not None:
                        for box in result.boxes:
                            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                            conf = box.conf[0].cpu().numpy()
                            x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
                            
                            plate_count += 1
                            
                            # Check if plate is in ROI
                            in_roi = is_bbox_in_roi([x1, y1, x2, y2], original_width, original_height)
                            
                            # Check minimum size
                            width_check = (x2 - x1) >= 30
                            height_check = (y2 - y1) >= 10
                            
                            logger.info(f"🎯 Plate {plate_count}: bbox=[{x1},{y1},{x2},{y2}], "
                                      f"conf={conf:.3f}, in_roi={in_roi}, "
                                      f"size_ok={width_check and height_check}")
                            
                            if in_roi and width_check and height_check:
                                processed_plates += 1
                                logger.info(f"✅ Processing plate {processed_plates}")
                                
                                # Don't draw detection box here - will be drawn after OCR processing
                                
                                # Crop plate region
                                plate_crop = frame[y1:y2, x1:x2]
                                
                                if plate_crop.size > 0:
                                    logger.info(f"🔍 Running OCR on plate {processed_plates}, crop size: {plate_crop.shape}")
                                    
                                    # Run OCR
                                    plate_text, ocr_conf = run_ocr_on_plate(plate_crop, frame_count)
                                    
                                    if plate_text and len(plate_text.strip()) >= 3:
                                        # Clean text
                                        plate_text = plate_text.strip()
                                        
                                        # Validate format using comprehensive validation
                                        is_valid, vehicle_type, validation_conf = is_valid_vietnamese_plate(plate_text)
                                        
                                        # Determine colors based on confidence and validity
                                        # Use actual YOLO confidence for color determination
                                        yolo_conf = conf  # Use actual YOLO confidence
                                        
                                        if is_valid and validation_conf > 0.5:
                                            if yolo_conf > 0.8 and ocr_conf > 0.8:
                                                box_color = (0, 255, 0)  # Green - high conf + valid
                                            elif yolo_conf > 0.6 and ocr_conf > 0.5:
                                                box_color = (0, 255, 255)  # Yellow - medium conf + valid
                                            else:
                                                box_color = (0, 165, 255)  # Orange - low confidence but valid
                                        else:
                                            box_color = (0, 0, 255)  # Red - invalid format
                                        
                                        # Draw plate bounding box (always show)
                                        cv2.rectangle(display_frame, (x1, y1), (x2, y2), box_color, 3)
                                        
                                        # Prepare text - ALWAYS show the plate number with confidence
                                        main_text = f"{plate_text} ({yolo_conf:.2f})"
                                        
                                        # Calculate text positions
                                        main_text_size = cv2.getTextSize(main_text, cv2.FONT_HERSHEY_SIMPLEX, 0.8, 2)[0]
                                        
                                        text_x = x1
                                        main_text_y = max(35, y1 - 15)
                                        
                                        # Ensure text stays in frame
                                        if text_x + main_text_size[0] > original_width:
                                            text_x = original_width - main_text_size[0] - 10
                                        
                                        # Draw background for main text
                                        cv2.rectangle(display_frame, 
                                                    (text_x - 8, main_text_y - main_text_size[1] - 8),
                                                    (text_x + main_text_size[0] + 8, main_text_y + 8),
                                                    (0, 0, 0), -1)
                                        
                                        # Draw border for main text
                                        cv2.rectangle(display_frame, 
                                                    (text_x - 8, main_text_y - main_text_size[1] - 8),
                                                    (text_x + main_text_size[0] + 8, main_text_y + 8),
                                                    box_color, 2)
                                        
                                        # Draw main text (plate number - always show)
                                        cv2.putText(display_frame, main_text, (text_x, main_text_y),
                                                   cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
                                        
                                        # Add to results (always add to display)
                                        boxes.append([x1, y1, x2, y2])
                                        labels.append(plate_text)
                                        ocr_results.append([plate_text, float(ocr_conf)])
                                        
                                        # Only save to database if valid Vietnamese plate format
                                        if is_valid and validation_conf > 0.5:
                                            # Save crop image
                                            crop_path = save_plate_crop(plate_crop, plate_text, frame_count)
                                            
                                            # Add to tracked objects for database storage
                                            track_id = f"plate_{frame_count}_{processed_plates}"
                                            tracked_objects[track_id] = {
                                                'plate_number': plate_text,
                                                'confidence': float(yolo_conf),  # Use YOLO confidence
                                                'ocr_confidence': float(ocr_conf),  # Separate OCR confidence
                                                'bbox': [x1, y1, x2, y2],
                                                'vehicle_type': vehicle_type,
                                                'crop_filename': crop_path,
                                                'first_seen': time.time(),
                                                'last_seen': time.time(),
                                                'is_valid': True,
                                                'validation_confidence': validation_conf
                                            }
                                            
                                            logger.info(f"✅ Valid Vietnamese plate detected: '{plate_text}' "
                                                      f"(OCR conf: {ocr_conf:.3f}, validation conf: {validation_conf:.3f}, type: {vehicle_type})")
                                        else:
                                            logger.info(f"❌ Invalid plate format: '{plate_text}' (validation conf: {validation_conf:.3f})")
                                    else:
                                        # Draw "Processing..." for plates without clear text
                                        cv2.rectangle(display_frame, (x1, y1), (x2, y2), (128, 128, 128), 2)
                                        cv2.putText(display_frame, "Processing OCR...", (x1, max(25, y1 - 10)),
                                                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (128, 128, 128), 1)
                                        logger.info(f"❌ No clear text found for plate {processed_plates}")
                                else:
                                    logger.warning(f"❌ Empty crop for plate {plate_count}")
                            else:
                                if not in_roi:
                                    logger.info(f"❌ Plate {plate_count} is outside ROI")
                                elif not (width_check and height_check):
                                    logger.info(f"❌ Plate {plate_count} too small: {x2-x1}x{y2-y1}")
                
                # Add summary text to frame
                summary_text = f"Frame: {frame_count} | YOLO: {total_detections} | Processed: {processed_plates} | OCR: {len(ocr_results)}"
                cv2.putText(display_frame, summary_text, (10, 30), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                
                logger.info(f"📊 Frame {frame_count} summary: YOLO found {total_detections}, "
                          f"processed {processed_plates}, OCR success {len(ocr_results)}")
                
            except Exception as e:
                logger.error(f"YOLO detection failed: {e}")
                import traceback
                logger.error(f"Detection traceback: {traceback.format_exc()}")
        else:
            logger.warning("⚠️ YOLO model not loaded")
            cv2.putText(display_frame, "YOLO MODEL NOT LOADED", (50, 100), 
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        
        # Encode frame
        try:
            _, buffer = cv2.imencode('.jpg', display_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            frame_bytes = buffer.tobytes()
        except Exception as e:
            logger.error(f"Frame encoding failed: {e}")
            frame_bytes = b''
        
        return {
            'frame': frame_bytes,
            'boxes': boxes,
            'labels': labels,
            'ocr_results': ocr_results,
            'tracked_objects': tracked_objects
        }
        
    except Exception as e:
        logger.error(f"detect_and_ocr_simple failed: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return {'frame': b'', 'boxes': [], 'labels': [], 'ocr_results': []}

# Initialize models on import
if __name__ == "__main__":
    initialize_models()
else:
    # Initialize models when imported
    initialize_models()