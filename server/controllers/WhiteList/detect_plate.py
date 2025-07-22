import argparse
import json
import sys
import os
import cv2
import numpy as np
import torch
from pathlib import Path
from paddleocr import PaddleOCR
import re
import time

# Cấu hình encoding cho stdout
if sys.platform.startswith('win'):
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.detach())
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.detach())

# Thêm YOLOv5 vào sys.path và thay đổi working directory
YOLOV5_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../models/yolov5'))
if YOLOV5_PATH not in sys.path:
    sys.path.insert(0, YOLOV5_PATH)

original_cwd = os.getcwd()
os.chdir(YOLOV5_PATH)
try:
    from models.common import DetectMultiBackend
    from utils.general import non_max_suppression, scale_coords
    from utils.torch_utils import select_device
finally:
    os.chdir(original_cwd)

os.environ['FLAGS_log_level'] = '3'
os.environ['KMP_WARNINGS'] = '0'
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

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
    
    Args:
        text: Text đã được clean nhưng giữ nguyên cấu trúc - và .
    
    Returns:
        dict: Thông tin phân tích chi tiết
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
        return _classify_car_by_dash(text, analysis)
    elif dash_position == 4:
        # Format: XXA1-YYYY -> XE MÁY
        return _classify_motorcycle_by_dash(text, analysis)
    elif dash_position > 4:
        # Có thể là biển đặc biệt (ngoại giao, etc.)
        return _classify_special_by_dash(text, analysis)
    else:
        # Không có dấu `-` hoặc vị trí không đúng -> Fallback
        return _classify_by_fallback_logic(text, analysis)

def _classify_car_by_dash(text, analysis):
    """
    Phân loại ô tô khi đã xác định dấu `-` ở vị trí 3
    """
    clean_length = analysis['clean_length']
    has_dot = analysis['has_dot']
    
    if clean_length == 7:
        # 30A1234 -> 30A-12.34 (ô tô ngắn)
        return {
            'vehicle_type': 'car',
            'confidence': 0.95,
            'analysis': analysis,
            'pattern': 'car_short_7chars'
        }
    elif clean_length == 8:
        # 30A12345 -> 30A-123.45 (ô tô thường)
        return {
            'vehicle_type': 'car',
            'confidence': 0.98,
            'analysis': analysis,
            'pattern': 'car_standard_8chars'
        }
    elif clean_length == 9:
        # 30A123456 -> 30A-1234.56 (ô tô 4 số giữa)
        return {
            'vehicle_type': 'car',
            'confidence': 0.95,
            'analysis': analysis,
            'pattern': 'car_long_9chars'
        }
    elif clean_length >= 10:
        # 30A1234567+ -> Taxi
        return {
            'vehicle_type': 'taxi',
            'confidence': 0.90,
            'analysis': analysis,
            'pattern': 'taxi_10plus_chars'
        }
    else:
        return {
            'vehicle_type': 'car',
            'confidence': 0.70,
            'analysis': analysis,
            'pattern': 'car_variant'
        }

def _classify_motorcycle_by_dash(text, analysis):
    """
    Phân loại xe máy khi đã xác định dấu `-` ở vị trí 4
    """
    clean_length = analysis['clean_length']
    has_dot = analysis['has_dot']
    
    if clean_length == 8:
        # 30A14567 -> 30A1-4567 (xe máy cũ)
        return {
            'vehicle_type': 'motorcycle_old',
            'confidence': 0.98,
            'analysis': analysis,
            'pattern': 'motorcycle_old_8chars'
        }
    elif clean_length == 9:
        # 30A145678 -> 30A1-456.78 (xe máy mới)
        return {
            'vehicle_type': 'motorcycle_new',
            'confidence': 0.98,
            'analysis': analysis,
            'pattern': 'motorcycle_new_9chars'
        }
    else:
        return {
            'vehicle_type': 'motorcycle_old',
            'confidence': 0.80,
            'analysis': analysis,
            'pattern': 'motorcycle_variant'
        }

def _classify_special_by_dash(text, analysis):
    """
    Phân loại biển đặc biệt khi dấu `-` ở vị trí > 4
    """
    clean_text = analysis['clean_text']
    clean_length = analysis['clean_length']
    
    # Kiểm tra pattern ngoại giao: 30AB-123.45
    if len(clean_text) >= 4:
        first_two = clean_text[:2]  # Mã tỉnh
        next_two = clean_text[2:4]  # Chữ cái
        
        if first_two.isdigit() and next_two.isalpha():
            return {
                'vehicle_type': 'diplomatic',
                'confidence': 0.90,
                'analysis': analysis,
                'pattern': 'diplomatic_special'
            }
    
    # Fallback cho các trường hợp khác
    return {
        'vehicle_type': 'unknown',
        'confidence': 0.30,
        'analysis': analysis,
        'pattern': 'special_unknown'
    }

def _classify_by_fallback_logic(text, analysis):
    """
    Logic fallback khi không có dấu `-` hoặc vị trí dấu `-` không chuẩn
    Dựa trên độ dài và ký tự thứ 4
    """
    clean_text = analysis['clean_text']
    clean_length = len(clean_text)
    
    if clean_length < 6:
        return {
            'vehicle_type': 'unknown',
            'confidence': 0.20,
            'analysis': analysis,
            'pattern': 'fallback_too_short'
        }
    
    # Kiểm tra pattern cơ bản: 2 số + 1 chữ + ...
    if len(clean_text) >= 4:
        first_two = clean_text[:2]
        third_char = clean_text[2]
        fourth_char = clean_text[3]
        
        if first_two.isdigit() and third_char.isalpha():
            # Pattern đúng: XXA... hoặc XXA1...
            
            if clean_length == 7:
                # 7 ký tự -> Ô tô ngắn
                return {
                    'vehicle_type': 'car',
                    'confidence': 0.80,
                    'analysis': analysis,
                    'pattern': 'fallback_car_7chars'
                }
            
            elif clean_length == 8:
                if fourth_char.isdigit():
                    # XXA1YYYY (8 chars, ký tự 4 là số) -> Xe máy cũ
                    return {
                        'vehicle_type': 'motorcycle_old',
                        'confidence': 0.85,
                        'analysis': analysis,
                        'pattern': 'fallback_motorcycle_8chars'
                    }
                else:
                    # XXAYYYY (8 chars, ký tự 4 không phải số) -> Ô tô
                    return {
                        'vehicle_type': 'car',
                        'confidence': 0.85,
                        'analysis': analysis,
                        'pattern': 'fallback_car_8chars'
                    }
            
            elif clean_length == 9:
                if fourth_char.isdigit():
                    # XXA1YYYYY (9 chars, ký tự 4 là số) -> Xe máy mới
                    return {
                        'vehicle_type': 'motorcycle_new',
                        'confidence': 0.85,
                        'analysis': analysis,
                        'pattern': 'fallback_motorcycle_9chars'
                    }
                else:
                    # XXAYYYYY (9 chars, ký tự 4 không phải số) -> Ô tô 4 số giữa
                    return {
                        'vehicle_type': 'car',
                        'confidence': 0.85,
                        'analysis': analysis,
                        'pattern': 'fallback_car_9chars'
                    }
            
            elif clean_length >= 10:
                # 10+ ký tự -> Taxi
                return {
                    'vehicle_type': 'taxi',
                    'confidence': 0.75,
                    'analysis': analysis,
                    'pattern': 'fallback_taxi'
                }
    
    # Không khớp pattern nào
    return {
        'vehicle_type': 'unknown',
        'confidence': 0.30,
        'analysis': analysis,
        'pattern': 'fallback_no_match'
    }

def format_plate_by_type(clean_text, vehicle_type):
    """
    Format biển số theo đúng chuẩn dựa trên loại xe
    """
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
    """
    Sửa lỗi nhận diện ký tự thông minh dựa trên vị trí
    """
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
        # Các vị trí khác giữ nguyên hoặc dựa vào context
    
    return ''.join(result)

def extract_plate_text_enhanced(ocr_results):
    """
    Trích xuất text biển số từ kết quả OCR với xử lý nâng cao
    Ưu tiên giữ nguyên cấu trúc dấu - và .
    """
    if not ocr_results or len(ocr_results) == 0:
        return ""
    
    all_texts = []
    
    # Trích xuất tất cả text từ OCR
    for line in ocr_results:
        if line and len(line) > 0:
            for detection in line:
                if detection and len(detection) >= 2:
                    text = detection[1][0] if len(detection[1]) > 0 else ""
                    confidence = detection[1][1] if len(detection[1]) > 1 else 0.0
                    
                    if text and confidence > 0.3:  # Chỉ lấy text có confidence > 0.3
                        all_texts.append(text)
    
    if not all_texts:
        return ""
    
    # Ghép tất cả text lại
    combined_text = ' '.join(all_texts)
    
    # Làm sạch nhưng giữ cấu trúc
    cleaned_text = clean_and_preserve_structure(combined_text)
    
    # Sửa lỗi ký tự
    corrected_text = smart_character_correction(cleaned_text)
    
    return corrected_text

def recognize_plate_text_comprehensive(plate_img):
    """
    Nhận diện text biển số toàn diện với nhiều preprocessing variant
    """
    try:
        # Khởi tạo PaddleOCR với cấu hình tối ưu
        ocr = PaddleOCR(
            use_angle_cls=True, 
            lang='vi', 
            show_log=False,
            use_gpu=False,
            enable_mkldnn=False,
            det_db_thresh=0.3,
            det_db_box_thresh=0.5,
            rec_batch_num=1
        )
        
        # Tạo các variant preprocessing
        variants = create_preprocessing_variants(plate_img)
        
        results = []
        
        for img_variant, variant_name in variants:
            try:
                # Lưu temporary file
                temp_path = f'temp_plate_{variant_name}_{int(time.time())}.jpg'
                cv2.imwrite(temp_path, img_variant)
                
                # OCR recognition
                ocr_result = ocr.ocr(temp_path, cls=True)
                
                # Trích xuất text
                extracted_text = extract_plate_text_enhanced(ocr_result)
                
                if extracted_text and len(extracted_text) >= 6:
                    # Phân tích cấu trúc
                    analysis_result = analyze_dash_position_precise(extracted_text)
                    vehicle_type = analysis_result['vehicle_type']
                    confidence = analysis_result['confidence']
                    
                    # Format theo chuẩn
                    clean_for_format = analysis_result['analysis']['clean_text']
                    formatted_text = format_plate_by_type(clean_for_format, vehicle_type)
                    
                    results.append({
                        'text': formatted_text,
                        'vehicle_type': vehicle_type,
                        'confidence': confidence,
                        'variant': variant_name,
                        'raw_extracted': extracted_text
                    })
                
                # Xóa file temp
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                    
            except Exception as e:
                print(f"Error processing variant {variant_name}: {e}")
                continue
        
        # Chọn kết quả tốt nhất
        if results:
            # Sắp xếp theo confidence
            results.sort(key=lambda x: x['confidence'], reverse=True)
            best = results[0]
            return best['text'], best['vehicle_type'], best['confidence']
        
        return "", "unknown", 0.0
        
    except Exception as e:
        print(f"Error in recognize_plate_text_comprehensive: {e}")
        return "", "unknown", 0.0

def create_preprocessing_variants(img):
    """
    Tạo các variant preprocessing tối ưu cho biển số Việt Nam
    """
    variants = []
    
    # Resize tối ưu cho biển số
    height, width = img.shape[:2]
    aspect_ratio = width / height
    
    if aspect_ratio > 4:  # Biển số rộng
        target_width, target_height = 400, 100
    else:  # Biển số vuông hơn
        target_width, target_height = 300, 120
    
    # 1. Original resized
    resized = cv2.resize(img, (target_width, target_height))
    variants.append((resized, 'original'))
    
    # 2. Grayscale + CLAHE
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    enhanced_resized = cv2.resize(enhanced, (target_width, target_height))
    enhanced_bgr = cv2.cvtColor(enhanced_resized, cv2.COLOR_GRAY2BGR)
    variants.append((enhanced_bgr, 'clahe'))
    
    # 3. Adaptive threshold
    adaptive = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
    adaptive_resized = cv2.resize(adaptive, (target_width, target_height))
    adaptive_bgr = cv2.cvtColor(adaptive_resized, cv2.COLOR_GRAY2BGR)
    variants.append((adaptive_bgr, 'adaptive'))
    
    # 4. Otsu threshold
    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    otsu_resized = cv2.resize(otsu, (target_width, target_height))
    otsu_bgr = cv2.cvtColor(otsu_resized, cv2.COLOR_GRAY2BGR)
    variants.append((otsu_bgr, 'otsu'))
    
    # 5. Sharpening
    kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
    sharpened = cv2.filter2D(enhanced_bgr, -1, kernel)
    variants.append((sharpened, 'sharp'))
    
    # 6. Morphological operations
    kernel_morph = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
    morph = cv2.morphologyEx(enhanced, cv2.MORPH_CLOSE, kernel_morph)
    morph_resized = cv2.resize(morph, (target_width, target_height))
    morph_bgr = cv2.cvtColor(morph_resized, cv2.COLOR_GRAY2BGR)
    variants.append((morph_bgr, 'morph'))
    
    return variants

def validate_plate_format(text, vehicle_type):
    """
    Kiểm tra format biển số theo chuẩn Việt Nam
    """
    if not text or len(text) < 6:
        return False, "Text quá ngắn", 0.0
    
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
            if re.match(pattern, text):
                return True, f"Đúng format {vehicle_type}", 0.95
    
    return False, f"Không đúng format {vehicle_type}", 0.3

def detect_plate_yolov5(image_path, model):
    """
    Phát hiện biển số trong ảnh sử dụng YOLOv5
    """
    if model is None:
        return None, None, None
    
    try:
        img0 = cv2.imread(image_path)
        if img0 is None:
            raise Exception('Failed to load image')
        
        # Chuẩn bị ảnh cho model
        img = cv2.cvtColor(img0, cv2.COLOR_BGR2RGB)
        img = cv2.resize(img, (640, 640))
        img = img.astype(np.float32) / 255.0
        img = np.transpose(img, (2, 0, 1))
        img = np.ascontiguousarray(img)
        
        img_tensor = torch.from_numpy(img).to(device)
        img_tensor = img_tensor.float()
        img_tensor = img_tensor.unsqueeze(0)
        
        # Chạy detection
        with torch.no_grad():
            pred = model(img_tensor)
        
        # Xử lý kết quả với NMS
        pred = non_max_suppression(pred, 0.4, 0.5, None, False, max_det=1)
        
        for det in pred:
            if len(det):
                det[:, :4] = scale_coords(img_tensor.shape[2:], det[:, :4], img0.shape).round()
                x1, y1, x2, y2, conf, cls = det[0].cpu().numpy()
                
                bbox = {
                    'x1': int(x1), 'y1': int(y1), 'x2': int(x2), 'y2': int(y2), 'confidence': float(conf)
                }
                
                # Mở rộng bbox với margin
                margin = 15
                x1e = max(x1 - margin, 0)
                y1e = max(y1 - margin, 0)
                x2e = min(x2 + margin, img0.shape[1])
                y2e = min(y2 + margin, img0.shape[0])
                
                plate_crop = img0[int(y1e):int(y2e), int(x1e):int(x2e)]
                
                return plate_crop, bbox, img0
        
        return None, None, img0
        
    except Exception as e:
        print(f"Error in detect_plate_yolov5: {e}")
        return None, None, None

def save_detected_plate_image(plate_img, original_image_path):
    """
    Lưu ảnh biển số đã detect được
    """
    try:
        crop_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../public/uploads/whitelist/detected_plates/'))
        os.makedirs(crop_dir, exist_ok=True)
        
        if not os.path.exists(crop_dir):
            return None
        
        original_filename = os.path.basename(original_image_path)
        name_without_ext = os.path.splitext(original_filename)[0]
        crop_filename = f"detected_{name_without_ext}_{int(time.time())}.jpg"
        crop_path = os.path.join(crop_dir, crop_filename)
        
        if plate_img is not None and plate_img.size > 0:
            height, width = plate_img.shape[:2]
            
            # Resize nếu ảnh quá nhỏ
            if width < 100 or height < 30:
                new_width = max(200, width * 2)
                new_height = max(60, height * 2)
                plate_img = cv2.resize(plate_img, (new_width, new_height))
            
            success = cv2.imwrite(crop_path, plate_img)
            if success:
                relative_path = f'/uploads/whitelist/detected_plates/{crop_filename}'
                return relative_path
        
        return None
        
    except Exception as e:
        print(f"Error saving detected plate image: {e}")
        return None

def load_yolo_model(weights_path):
    """
    Load YOLOv5 model từ file weights
    """
    try:
        model = DetectMultiBackend(weights_path, device=device, dnn=False, data=None, fp16=False)
        return model
    except Exception as e:
        print(f"Error loading YOLOv5 model: {e}")
        return None

def test_plate_classification_logic():
    """
    Test logic phân loại biển số với các trường hợp thực tế
    """
    test_cases = [
        # Test với dấu `-` có sẵn (nhận diện chính xác)
        ("30A-123.45", "30A-123.45", "car"),           # Ô tô chuẩn
        ("51D-12.34", "51D-12.34", "car"),             # Ô tô ngắn
        ("30A1-4567", "30A1-4567", "motorcycle_old"),  # Xe máy cũ
        ("43B2-567.89", "43B2-567.89", "motorcycle_new"), # Xe máy mới
        ("29AB-123.45", "29AB-123.45", "diplomatic"),  # Ngoại giao
        ("30A-123456", "30A-123456", "taxi"),          # Taxi
        
        # Test từ text thô (không có dấu `-`) - Fallback logic
        ("30A12345", "30A-123.45", "car"),             # 8 char ô tô
        ("30A14567", "30A1-4567", "motorcycle_old"),   # 8 char xe máy cũ
        ("30A145678", "30A1-456.78", "motorcycle_new"), # 9 char xe máy mới
        ("30A123456", "30A-1234.56", "car"),           # 9 char ô tô
        ("29A1234", "29A-12.34", "car"),               # 7 char ô tô ngắn
        ("30A1234567", "30A-1234567", "taxi"),         # 10+ char taxi
        
        # Test các trường hợp khó
        ("29AB123456", "29AB-123.45", "diplomatic"),   # Ngoại giao thô
        ("30A0123456", "30A-0123.45", "car"),          # Có số 0
        ("59C21234567", "59C2-1234567", "motorcycle_old"), # Xe máy dài
        
        # Test với noise từ OCR
        ("30A-123 45", "30A-123.45", "car"),           # Có space thay vì dấu chấm
        ("30A1.4567", "30A1-4567", "motorcycle_old"),  # Có dấu chấm thay vì gạch ngang
        ("VN30A12345", "30A-123.45", "car"),           # Có prefix VN
    ]
    
    print("\n" + "="*100)
    print("🧪 TEST LOGIC PHÂN LOẠI BIỂN SỐ VIỆT NAM (FIXED VERSION)")
    print("="*100)
    print("LOGIC CHÍNH:")
    print("  1. Phân tích vị trí dấu `-` trong text gốc")
    print("  2. Ô tô: dấu `-` ở vị trí 3 (30A-123.45)")
    print("  3. Xe máy: dấu `-` ở vị trí 4 (30A1-4567)")
    print("  4. Fallback: Phân tích độ dài + ký tự thứ 4 khi không có dấu `-`")
    print("="*100)
    
    correct_count = 0
    total_count = len(test_cases)
    
    for input_text, expected_formatted, expected_type in test_cases:
        # Làm sạch text giữ cấu trúc
        cleaned = clean_and_preserve_structure(input_text)
        
        # Phân tích vị trí dấu `-`
        analysis_result = analyze_dash_position_precise(cleaned)
        detected_type = analysis_result['vehicle_type']
        confidence = analysis_result['confidence']
        
        # Format theo chuẩn
        clean_for_format = analysis_result['analysis']['clean_text']
        formatted = format_plate_by_type(clean_for_format, detected_type)
        
        # Kiểm tra kết quả
        is_correct = (formatted == expected_formatted and detected_type == expected_type)
        status = "✅" if is_correct else "❌"
        
        if is_correct:
            correct_count += 1
        
        print(f"{status} Input: {input_text:15} -> {formatted:15} ({detected_type:15}) | Conf: {confidence:.2f}")
        
        if not is_correct:
            print(f"   💡 Expected: {expected_formatted:15} ({expected_type})")
            print(f"   🔍 Analysis: dash_pos={analysis_result['analysis']['dash_position']}, clean='{clean_for_format}'")
    
    print("="*100)
    print(f"📊 RESULT: {correct_count}/{total_count} passed ({correct_count/total_count*100:.1f}%)")
    print("="*100)
    
    return correct_count == total_count

def comprehensive_plate_recognition(image_path, model=None):
    """
    Pipeline nhận diện biển số toàn diện
    """
    try:
        detected_plate_image = None
        
        # Bước 1: Detect biển số bằng YOLOv5 (nếu có model)
        if model is not None:
            plate_crop, bbox, original_img = detect_plate_yolov5(image_path, model)
            
            if plate_crop is not None and plate_crop.size > 0:
                # Nhận diện text từ vùng crop
                text, vehicle_type, confidence = recognize_plate_text_comprehensive(plate_crop)
                
                if text and len(text) >= 6 and confidence > 0.5:
                    # Validate format
                    is_valid, validation_msg, validation_score = validate_plate_format(text, vehicle_type)
                    
                    # Lưu ảnh crop nếu cần
                    detected_plate_image = save_detected_plate_image(plate_crop, image_path)
                    
                    return {
                    'success': True,
                        'text': text,
                        'vehicle_type': vehicle_type,
                    'bbox': bbox,
                    'detected_plate_image': detected_plate_image,
                        'method': 'yolov5_detection_paddleocr_comprehensive',
                        'confidence': confidence * validation_score,
                        'detection_confidence': float(bbox['confidence']),
                        'ocr_confidence': confidence,
                        'is_valid_format': is_valid,
                        'validation_message': validation_msg
                    }
        
        # Bước 2: Fallback - Nhận diện trên toàn bộ ảnh
        original_img = cv2.imread(image_path)
        if original_img is None:
            raise Exception("Cannot load image")
        
        text, vehicle_type, confidence = recognize_plate_text_comprehensive(original_img)
        
        if text and len(text) >= 6:
            is_valid, validation_msg, validation_score = validate_plate_format(text, vehicle_type)
            
            return {
                'success': True,
                'text': text,
                'vehicle_type': vehicle_type,
                'bbox': None,
                'detected_plate_image': detected_plate_image,
                'method': 'full_image_paddleocr_comprehensive',
                'confidence': confidence * validation_score,
                'detection_confidence': 0.0,
                'ocr_confidence': confidence,
                'is_valid_format': is_valid,
                'validation_message': validation_msg,
                'message': 'Processed full image (no plate detection)'
            }
        
        # Bước 3: Không nhận diện được
        return {
            'success': False,
            'message': 'Could not recognize license plate from image',
            'method': 'comprehensive_recognition_failed',
            'detected_plate_image': detected_plate_image
        }
        
    except Exception as e:
        return {
            'success': False,
            'message': str(e),
            'error_type': type(e).__name__,
            'method': 'comprehensive_recognition_error'
        }

def main():
    """
    Hàm main xử lý command line arguments
    """
    parser = argparse.ArgumentParser(description='Vietnamese License Plate Detection and Recognition (Fixed)')
    parser.add_argument('--image', required=True, help='Path to input image')
    parser.add_argument('--yolo-weights', default=None, help='Path to YOLOv5 weights (.pt)')
    parser.add_argument('--save-crop', action='store_true', help='Save detected plate crop image')
    parser.add_argument('--test', action='store_true', help='Run test cases only')
    parser.add_argument('--debug', action='store_true', help='Enable debug mode with detailed output')
    args = parser.parse_args()
    
    # Nếu chỉ chạy test
    if args.test:
        success = test_plate_classification_logic()
        if success:
            print("\n🎉 Tất cả test cases PASSED! Logic phân loại biển số hoạt động chính xác.")
        else:
            print("\n⚠️ Một số test cases FAILED! Cần xem xét lại logic.")
        return
    
    try:
        # Load YOLO model nếu có
        model = None
        if args.yolo_weights:
            weights_path = args.yolo_weights
        else:
            weights_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../models/LP_detector_nano_61.pt'))
        
        if os.path.exists(weights_path):
            if args.debug:
                print(f"🔄 Loading YOLOv5 model from: {weights_path}")
            model = load_yolo_model(weights_path)
            if model is None:
                print("⚠️ Failed to load YOLOv5 model, using full image recognition only")
        else:
            if args.debug:
                print("⚠️ YOLOv5 model not found, using full image recognition only")
        
        # Nhận diện biển số
        if args.debug:
            print(f"🔍 Processing image: {args.image}")
        
        result = comprehensive_plate_recognition(args.image, model)
        
        # Output kết quả
        print(json.dumps(result, ensure_ascii=False))
            
    except Exception as e:
        error_result = {
            'success': False, 
            'message': str(e), 
            'error_type': type(e).__name__,
            'method': 'main_error'
        }
        print(json.dumps(error_result, ensure_ascii=False))

# Khởi tạo device và cấu hình
torch.backends.cudnn.benchmark = True
device = select_device('cpu')

if __name__ == '__main__':
    # Chạy test để verify logic khi có --test flag
    if len(sys.argv) > 1 and '--test' in sys.argv:
        test_plate_classification_logic()
    else:
    main()