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
    # Khôi phục working directory
    os.chdir(original_cwd)

# Suppress PaddleOCR and other logs
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
    # 1. Ảnh gốc resize
    try:
        orig = cv2.resize(plate_img, (320, 100))
        variants.append((orig, 'original'))
    except:
        pass
    # 2. Grayscale
    gray = cv2.cvtColor(plate_img, cv2.COLOR_BGR2GRAY)
    gray3 = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    variants.append((gray3, 'gray'))
    # 3. CLAHE (tăng contrast)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
    enhanced = clahe.apply(gray)
    enhanced3 = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)
    variants.append((enhanced3, 'clahe'))
    # 4. Adaptive threshold
    thresh = cv2.adaptiveThreshold(gray,255,cv2.ADAPTIVE_THRESH_GAUSSIAN_C,cv2.THRESH_BINARY,11,2)
    thresh3 = cv2.cvtColor(thresh, cv2.COLOR_GRAY2BGR)
    variants.append((thresh3, 'adaptive_thresh'))
    # 5. Otsu threshold
    _, otsu = cv2.threshold(gray,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)
    otsu3 = cv2.cvtColor(otsu, cv2.COLOR_GRAY2BGR)
    variants.append((otsu3, 'otsu'))
    # 6. Sharpen
    kernel = np.array([[0, -1, 0], [-1, 5,-1], [0, -1, 0]])
    sharp = cv2.filter2D(enhanced3, -1, kernel)
    variants.append((sharp, 'sharpen'))
    # 7. Median blur (loại bỏ noise)
    blur = cv2.medianBlur(enhanced3, 3)
    variants.append((blur, 'median_blur'))
    # 8. Morphological operations để làm rõ dấu chấm
    kernel_morph = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3,3))
    morph = cv2.morphologyEx(enhanced, cv2.MORPH_CLOSE, kernel_morph)
    morph3 = cv2.cvtColor(morph, cv2.COLOR_GRAY2BGR)
    variants.append((morph3, 'morphology'))
    # 9. Gaussian blur nhẹ để làm mịn
    gaussian = cv2.GaussianBlur(enhanced3, (3,3), 0)
    variants.append((gaussian, 'gaussian_blur'))
    # 10. Bilateral filter để giữ edge
    bilateral = cv2.bilateralFilter(enhanced3, 9, 75, 75)
    variants.append((bilateral, 'bilateral'))
    return variants

def postprocess_text(text):
    # Chỉ giữ lại ký tự hợp lệ cho biển số VN: A-Z, 0-9, dấu gạch ngang, dấu chấm, khoảng trắng
    allowed = re.compile(r'[^A-Z0-9\-\. ]')
    text = text.upper()
    text = allowed.sub('', text)
    # Loại bỏ khoảng trắng dư thừa
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def recognize_plate_paddleocr_multi(plate_img, ocr):
    variants = preprocess_variants(plate_img)
    best_text = ''
    best_score = 0
    best_variant = ''
    print(f"[OCR] Processing {len(variants)} variants...")
    
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
        # Đánh giá: số ký tự hợp lệ (A-Z, 0-9, dấu chấm)
        score = len(re.findall(r'[A-Z0-9\.]', processed))
        
        print(f"[OCR] Variant '{name}': raw='{joined}', processed='{processed}', score={score}")
        
        if score > best_score:
            best_score = score
            best_text = processed
            best_variant = name
    
    print(f"[OCR] Best variant: '{best_variant}' with score {best_score}, text: '{best_text}'")
    return best_text, best_variant, best_score

def recognize_plate_paddleocr(plate_img):
    """Nhận diện ký tự biển số sử dụng PaddleOCR với nhiều pipeline"""
    try:
        ocr = PaddleOCR(use_angle_cls=True, lang='vi')
        text, variant, score = recognize_plate_paddleocr_multi(plate_img, ocr)
        print(f"[OCR] Best variant: {variant}, score: {score}, text: {text}")
        return text
    except Exception as e:
        print(f"Error in recognize_plate_paddleocr: {e}")
        return ""

def detect_plate_yolov5(image_path, model):
    """Phát hiện biển số sử dụng YOLOv5"""
    if model is None:
        return None, None, None
    try:
        # Load image
        img0 = cv2.imread(image_path)
        if img0 is None:
            raise Exception('Failed to load image')
        # Preprocess image
        img = cv2.cvtColor(img0, cv2.COLOR_BGR2RGB)
        img = cv2.resize(img, (640, 640))
        img = img.astype(np.float32) / 255.0
        img = np.transpose(img, (2, 0, 1))[::-1]
        img = np.ascontiguousarray(img)
        # Convert to tensor
        img_tensor = torch.from_numpy(img).to(device)
        img_tensor = img_tensor.float()
        img_tensor = img_tensor.unsqueeze(0)
        # Inference
        pred = model(img_tensor, augment=False, visualize=False)
        pred = non_max_suppression(pred, 0.5, 0.45, None, False, max_det=1)
        # Process predictions
        for det in pred:
            if len(det):
                det[:, :4] = scale_coords(img_tensor.shape[2:], det[:, :4], img0.shape).round()
                # Lấy bbox đầu tiên
                x1, y1, x2, y2, conf, cls = det[0].cpu().numpy()
                bbox = {
                    'x1': int(x1), 'y1': int(y1), 'x2': int(x2), 'y2': int(y2), 'confidence': float(conf)
                }
                # Mở rộng bbox và crop
                x1e, y1e, x2e, y2e = expand_bbox(bbox, img0.shape)
                plate_crop = img0[y1e:y2e, x1e:x2e]
                return plate_crop, bbox, img0
        return None, None, img0
    except Exception as e:
        print(f"Error in detect_plate_yolov5: {e}")
        return None, None, None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', required=True, help='Path to input image')
    parser.add_argument('--yolo-weights', default=None, help='Path to YOLOv5 weights (.pt)')
    parser.add_argument('--save-crop', action='store_true', help='Save detected plate crop image')
    args = parser.parse_args()
    try:
        # Đường dẫn mặc định đến model
        weights_path = args.yolo_weights or os.path.abspath(os.path.join(os.path.dirname(__file__), '../../models/LP_detector_nano_61.pt'))
        # Kiểm tra file model có tồn tại không
        if not os.path.exists(weights_path):
            print(json.dumps({'success': False, 'message': f'Model file not found: {weights_path}'}))
            return
        # Tải mô hình YOLOv5
        print(f"Loading YOLOv5 model from: {weights_path}")
        model = load_yolo_model(weights_path)
        if model is None:
            print(json.dumps({'success': False, 'message': 'Failed to load YOLOv5 model'}))
            return
        # Phát hiện biển số
        print("Detecting license plate...")
        plate_img, bbox, orig_img = detect_plate_yolov5(args.image, model)
        detected_plate_image = None
        
        if plate_img is not None and plate_img.size > 0:
            print("License plate detected, recognizing characters...")
            text = recognize_plate_paddleocr(plate_img)
            if text and text.strip():
                # Lưu ảnh biển số đã phát hiện nếu được yêu cầu
                if args.save_crop:
                    detected_plate_image = save_detected_plate_image(plate_img, args.image)
                
                print(json.dumps({
                    'success': True, 
                    'text': text, 
                    'bbox': bbox,
                    'detected_plate_image': detected_plate_image,
                    'method': 'yolov5_detection_paddleocr_recognition'
                }))
                return
            else:
                print("Character recognition empty, trying full image...")
        # Fallback: nhận diện toàn ảnh nếu không phát hiện được hoặc nhận diện rỗng
        print("Trying full image recognition...")
        fallback_text = recognize_plate_paddleocr(orig_img)
        if fallback_text and fallback_text.strip():
            print(json.dumps({
                'success': True,
                'text': fallback_text,
                'bbox': None,
                'detected_plate_image': None,
                'method': 'full_image_paddleocr_recognition',
                'message': 'No license plate detected, using full image recognition.'
            }))
        else:
            print(json.dumps({
                'success': False,
                'message': 'Could not recognize license plate characters from image.'
            }))
    except Exception as e:
        print(json.dumps({'success': False, 'message': str(e)}))

def save_detected_plate_image(plate_img, original_image_path):
    """Lưu ảnh biển số đã phát hiện"""
    try:
        # Tạo thư mục lưu ảnh biển số đã phát hiện
        crop_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../public/uploads/whitelist/detected_plates/'))
        os.makedirs(crop_dir, exist_ok=True)
        
        # Tạo tên file dựa trên ảnh gốc
        original_filename = os.path.basename(original_image_path)
        name_without_ext = os.path.splitext(original_filename)[0]
        crop_filename = f"detected_{name_without_ext}_{int(time.time())}.jpg"
        crop_path = os.path.join(crop_dir, crop_filename)
        
        # Lưu ảnh biển số đã phát hiện
        cv2.imwrite(crop_path, plate_img)
        
        # Trả về đường dẫn tương đối
        return f'/uploads/whitelist/detected_plates/{crop_filename}'
    except Exception as e:
        print(f"Error saving detected plate image: {e}")
        return None

def load_yolo_model(weights_path):
    try:
        model = DetectMultiBackend(weights_path, device=device, dnn=False, data=None, fp16=False)
        return model
    except Exception as e:
        print(f"Error loading YOLOv5 model: {e}")
        return None

torch.backends.cudnn.benchmark = True
device = select_device('cpu')
print(f"Using device: {device}")

if __name__ == '__main__':
    main() 