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

# Thay đổi working directory để YOLOv5 có thể import đúng
original_cwd = os.getcwd()
os.chdir(YOLOV5_PATH)

try:
    from models.common import DetectMultiBackend
    from utils.general import (non_max_suppression, scale_coords, cv2 as yolo_cv2)
    from utils.torch_utils import select_device
finally:
    os.chdir(original_cwd)

os.environ['FLAGS_log_level'] = '3'
os.environ['KMP_WARNINGS'] = '0'
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

def expand_bbox(bbox, img_shape, margin=25):
    x1 = max(bbox['x1'] - margin, 0)
    y1 = max(bbox['y1'] - margin, 0)
    x2 = min(bbox['x2'] + margin, img_shape[1])
    y2 = min(bbox['y2'] + margin, img_shape[0])
    return x1, y1, x2, y2

def preprocess_variants(plate_img):
    variants = []
    try:
        orig = cv2.resize(plate_img, (320, 100))
        variants.append((orig, 'original'))
    except:
        pass
    gray = cv2.cvtColor(plate_img, cv2.COLOR_BGR2GRAY)
    gray3 = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    variants.append((gray3, 'gray'))
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
    enhanced = clahe.apply(gray)
    enhanced3 = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)
    variants.append((enhanced3, 'clahe'))
    thresh = cv2.adaptiveThreshold(gray,255,cv2.ADAPTIVE_THRESH_GAUSSIAN_C,cv2.THRESH_BINARY,11,2)
    thresh3 = cv2.cvtColor(thresh, cv2.COLOR_GRAY2BGR)
    variants.append((thresh3, 'adaptive_thresh'))
    _, otsu = cv2.threshold(gray,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)
    otsu3 = cv2.cvtColor(otsu, cv2.COLOR_GRAY2BGR)
    variants.append((otsu3, 'otsu'))
    kernel = np.array([[0, -1, 0], [-1, 5,-1], [0, -1, 0]])
    sharp = cv2.filter2D(enhanced3, -1, kernel)
    variants.append((sharp, 'sharpen'))
    blur = cv2.medianBlur(enhanced3, 3)
    variants.append((blur, 'median_blur'))
    kernel_morph = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3,3))
    morph = cv2.morphologyEx(enhanced, cv2.MORPH_CLOSE, kernel_morph)
    morph3 = cv2.cvtColor(morph, cv2.COLOR_GRAY2BGR)
    variants.append((morph3, 'morphology'))
    gaussian = cv2.GaussianBlur(enhanced3, (3,3), 0)
    variants.append((gaussian, 'gaussian_blur'))
    bilateral = cv2.bilateralFilter(enhanced3, 9, 75, 75)
    variants.append((bilateral, 'bilateral'))
    return variants

def postprocess_text(text):
    allowed = re.compile(r'[^A-Z0-9\-\. ]')
    text = text.upper()
    text = allowed.sub('', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def recognize_plate_paddleocr_multi(plate_img, ocr):
    variants = preprocess_variants(plate_img)
    best_text = ''
    best_score = 0
    best_variant = ''
    for img, name in variants:
        temp_crop_path = f'temp_plate_crop_{name}.jpg'
        cv2.imwrite(temp_crop_path, img)
        try:
            result = ocr.ocr(temp_crop_path, cls=True)
        finally:
            if os.path.exists(temp_crop_path):
                os.remove(temp_crop_path)
        texts = []
        if result and len(result) > 0:
            for line in result:
                if line and len(line) > 0:
                    for word in line:
                        if word and len(word) > 1:
                            texts.append(word[1][0])
        joined = ' '.join(texts)
        processed = postprocess_text(joined)
        score = len(re.findall(r'[A-Z0-9\.]', processed))
        if score > best_score:
            best_score = score
            best_text = processed
            best_variant = name
    return best_text, best_variant, best_score

# --- Thêm các hàm nhận diện và format biển số ---
def clean_and_preserve_structure(text):
    if not text:
        return ""
    text = text.upper().strip()
    cleaned = re.sub(r'[^A-Z0-9\-\.]', '', text)
    unwanted_patterns = ['VN', 'VIET', 'NAM', 'VIETNAM']
    for pattern in unwanted_patterns:
        cleaned = cleaned.replace(pattern, '')
    return cleaned.strip()

def analyze_dash_position_precise(text):
    if not text:
        return {'vehicle_type': 'unknown', 'confidence': 0.0, 'analysis': {}}
    dash_position = text.find('-')
    total_length = len(text)
    clean_text = re.sub(r'[^A-Z0-9]', '', text)
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
    if dash_position == 3:
        return _classify_car_by_dash(text, analysis)
    elif dash_position == 4:
        return _classify_motorcycle_by_dash(text, analysis)
    elif dash_position > 4:
        return _classify_special_by_dash(text, analysis)
    else:
        return _classify_by_fallback_logic(text, analysis)

def _classify_car_by_dash(text, analysis):
    clean_length = analysis['clean_length']
    if clean_length == 7:
        return {'vehicle_type': 'car', 'confidence': 0.95, 'analysis': analysis, 'pattern': 'car_short_7chars'}
    elif clean_length == 8:
        return {'vehicle_type': 'car', 'confidence': 0.98, 'analysis': analysis, 'pattern': 'car_standard_8chars'}
    elif clean_length == 9:
        return {'vehicle_type': 'car', 'confidence': 0.95, 'analysis': analysis, 'pattern': 'car_long_9chars'}
    elif clean_length >= 10:
        return {'vehicle_type': 'taxi', 'confidence': 0.90, 'analysis': analysis, 'pattern': 'taxi_10plus_chars'}
    else:
        return {'vehicle_type': 'car', 'confidence': 0.70, 'analysis': analysis, 'pattern': 'car_variant'}

def _classify_motorcycle_by_dash(text, analysis):
    clean_length = analysis['clean_length']
    if clean_length == 8:
        return {'vehicle_type': 'motorcycle_old', 'confidence': 0.98, 'analysis': analysis, 'pattern': 'motorcycle_old_8chars'}
    elif clean_length == 9:
        return {'vehicle_type': 'motorcycle_new', 'confidence': 0.98, 'analysis': analysis, 'pattern': 'motorcycle_new_9chars'}
    else:
        return {'vehicle_type': 'motorcycle_old', 'confidence': 0.80, 'analysis': analysis, 'pattern': 'motorcycle_variant'}

def _classify_special_by_dash(text, analysis):
    clean_text = analysis['clean_text']
    if len(clean_text) >= 4:
        first_two = clean_text[:2]
        next_two = clean_text[2:4]
        if first_two.isdigit() and next_two.isalpha():
            return {'vehicle_type': 'diplomatic', 'confidence': 0.90, 'analysis': analysis, 'pattern': 'diplomatic_special'}
    return {'vehicle_type': 'unknown', 'confidence': 0.30, 'analysis': analysis, 'pattern': 'special_unknown'}

def _classify_by_fallback_logic(text, analysis):
    clean_text = analysis['clean_text']
    clean_length = len(clean_text)
    if clean_length < 6:
        return {'vehicle_type': 'unknown', 'confidence': 0.20, 'analysis': analysis, 'pattern': 'fallback_too_short'}
    if len(clean_text) >= 4:
        first_two = clean_text[:2]
        third_char = clean_text[2]
        fourth_char = clean_text[3]
        if first_two.isdigit() and third_char.isalpha():
            if clean_length == 7:
                return {'vehicle_type': 'car', 'confidence': 0.80, 'analysis': analysis, 'pattern': 'fallback_car_7chars'}
            elif clean_length == 8:
                if fourth_char.isdigit():
                    return {'vehicle_type': 'motorcycle_old', 'confidence': 0.85, 'analysis': analysis, 'pattern': 'fallback_motorcycle_8chars'}
                else:
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
    if not clean_text or len(clean_text) < 6:
        return clean_text
    length = len(clean_text)
    if vehicle_type == 'car':
        if length == 7:
            return f"{clean_text[:3]}-{clean_text[3:5]}.{clean_text[5:]}"
        elif length == 8:
            return f"{clean_text[:3]}-{clean_text[3:6]}.{clean_text[6:]}"
        elif length == 9:
            return f"{clean_text[:3]}-{clean_text[3:7]}.{clean_text[7:]}"
        else:
            return f"{clean_text[:3]}-{clean_text[3:]}"
    elif vehicle_type == 'motorcycle_old':
        if length == 8:
            return f"{clean_text[:4]}-{clean_text[4:]}"
        else:
            return clean_text
    elif vehicle_type == 'motorcycle_new':
        if length == 9:
            return f"{clean_text[:4]}-{clean_text[4:7]}.{clean_text[7:]}"
        else:
            return clean_text
    elif vehicle_type == 'taxi':
        return f"{clean_text[:3]}-{clean_text[3:]}"
    elif vehicle_type == 'diplomatic':
        if length == 8:
            return f"{clean_text[:4]}-{clean_text[4:6]}.{clean_text[6:]}"
        elif length == 9:
            return f"{clean_text[:4]}-{clean_text[4:7]}.{clean_text[7:]}"
        else:
            return clean_text
    else:
        return clean_text

def smart_character_correction(text):
    if not text or len(text) < 3:
        return text
    corrections = {
        '0': 'O', '1': 'I', '5': 'S', '2': 'Z', '6': 'G', '8': 'B',
        'O': '0', 'I': '1', 'S': '5', 'Z': '2', 'G': '6', 'B': '8',
        'D': '0', 'Q': '0'
    }
    result = list(text)
    for i, char in enumerate(result):
        if i < 2:
            if char.isalpha() and char in corrections:
                corrected = corrections[char]
                if corrected.isdigit():
                    result[i] = corrected
        elif i == 2:
            if char.isdigit() and char in corrections:
                corrected = corrections[char]
                if corrected.isalpha():
                    result[i] = corrected
    return ''.join(result)

# --- Sửa hàm recognize_plate_paddleocr để trả về text đã format, loại xe, confidence ---
def recognize_plate_paddleocr(plate_img):
    try:
        ocr = PaddleOCR(use_angle_cls=True, lang='vi')
        text, variant, score = recognize_plate_paddleocr_multi(plate_img, ocr)
        # Làm sạch và sửa lỗi ký tự
        cleaned = clean_and_preserve_structure(text)
        corrected = smart_character_correction(cleaned)
        analysis = analyze_dash_position_precise(corrected)
        vehicle_type = analysis['vehicle_type']
        confidence = analysis['confidence']
        clean_for_format = analysis['analysis']['clean_text'] if 'analysis' in analysis else corrected
        formatted = format_plate_by_type(clean_for_format, vehicle_type)
        return formatted, vehicle_type, confidence
    except Exception as e:
        return "", "unknown", 0.0

def detect_plate_yolov5(image_path, model):
    if model is None:
        return None, None, None
    try:
        img0 = cv2.imread(image_path)
        if img0 is None:
            raise Exception('Failed to load image')
        img = cv2.cvtColor(img0, cv2.COLOR_BGR2RGB)
        img = cv2.resize(img, (640, 640))
        img = img.astype(np.float32) / 255.0
        img = np.transpose(img, (2, 0, 1))[::-1]
        img = np.ascontiguousarray(img)
        img_tensor = torch.from_numpy(img).to(device)
        img_tensor = img_tensor.float()
        img_tensor = img_tensor.unsqueeze(0)
        pred = model(img_tensor, augment=False, visualize=False)
        pred = non_max_suppression(pred, 0.5, 0.45, None, False, max_det=1)
        for det in pred:
            if len(det):
                det[:, :4] = scale_coords(img_tensor.shape[2:], det[:, :4], img0.shape).round()
                x1, y1, x2, y2, conf, cls = det[0].cpu().numpy()
                bbox = {
                    'x1': int(x1), 'y1': int(y1), 'x2': int(x2), 'y2': int(y2), 'confidence': float(conf)
                }
                x1e, y1e, x2e, y2e = expand_bbox(bbox, img0.shape)
                plate_crop = img0[y1e:y2e, x1e:x2e]
                return plate_crop, bbox, img0
        return None, None, img0
    except Exception as e:
        return None, None, None

def save_detected_plate_image(plate_img, original_image_path):
    try:
        # Đúng chuẩn: lưu vào public/uploads/blacklist/detected_plates
        crop_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../public/uploads/blacklist/detected_plates/'))
        os.makedirs(crop_dir, exist_ok=True)
        if not os.path.exists(crop_dir):
            return None
        original_filename = os.path.basename(original_image_path)
        name_without_ext = os.path.splitext(original_filename)[0]
        crop_filename = f"detected_{name_without_ext}_{int(time.time())}.jpg"
        crop_path = os.path.join(crop_dir, crop_filename)
        if plate_img is not None and plate_img.size > 0:
            height, width = plate_img.shape[:2]
            if width < 100 or height < 30:
                new_width = max(200, width * 2)
                new_height = max(60, height * 2)
                plate_img = cv2.resize(plate_img, (new_width, new_height))
            success = cv2.imwrite(crop_path, plate_img)
            if success:
                # Trả về đường dẫn tương đối đúng chuẩn
                relative_path = f'/uploads/blacklist/detected_plates/{crop_filename}'
                return relative_path
            else:
                return None
        else:
            return None
    except Exception as e:
        return None

def load_yolo_model(weights_path):
    try:
        model = DetectMultiBackend(weights_path, device=device, dnn=False, data=None, fp16=False)
        return model
    except Exception as e:
        return None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', required=True, help='Path to input image')
    parser.add_argument('--yolo-weights', default=None, help='Path to YOLOv5 weights (.pt)')
    parser.add_argument('--save-crop', action='store_true', help='Save detected plate crop image')
    args = parser.parse_args()
    try:
        weights_path = args.yolo_weights or os.path.abspath(os.path.join(os.path.dirname(__file__), '../../models/LP_detector_nano_61.pt'))
        if not os.path.exists(weights_path):
            print(json.dumps({'success': False, 'message': f'Model file not found: {weights_path}'}))
            return
        model = load_yolo_model(weights_path)
        if model is None:
            print(json.dumps({'success': False, 'message': 'Failed to load YOLOv5 model'}))
            return
        plate_img, bbox, orig_img = detect_plate_yolov5(args.image, model)
        detected_plate_image = None
        if plate_img is not None and plate_img.size > 0:
            if args.save_crop:
                detected_plate_image = save_detected_plate_image(plate_img, args.image)
            text, vehicle_type, confidence = recognize_plate_paddleocr(plate_img)
            if text and text.strip():
                print(json.dumps({
                    'success': True,
                    'text': text,
                    'vehicle_type': vehicle_type,
                    'confidence': confidence,
                    'bbox': bbox,
                    'detected_plate_image': detected_plate_image if detected_plate_image else '',
                    'method': 'yolov5_detection_paddleocr_recognition'
                }))
                return
        fallback_text, fallback_vehicle_type, fallback_confidence = recognize_plate_paddleocr(orig_img if orig_img is not None else cv2.imread(args.image))
        if fallback_text and fallback_text.strip():
            print(json.dumps({
                'success': True,
                'text': fallback_text,
                'vehicle_type': fallback_vehicle_type,
                'confidence': fallback_confidence,
                'bbox': None,
                'detected_plate_image': detected_plate_image if detected_plate_image else '',
                'method': 'full_image_paddleocr_recognition',
                'message': 'No license plate detected, using full image recognition.'
            }))
        else:
            print(json.dumps({
                'success': False,
                'message': 'Could not recognize license plate characters from image.',
                'detected_plate_image': ''
            }))
    except Exception as e:
        print(json.dumps({'success': False, 'message': str(e)}))

torch.backends.cudnn.benchmark = True
device = select_device('cpu')

if __name__ == '__main__':
    main() 