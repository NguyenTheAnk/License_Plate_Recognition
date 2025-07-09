"""
Module tích hợp YOLOv5 + PaddleOCR cho nhận diện biển số
Tích hợp logic từ test.py nhưng chỉ xử lý hình ảnh
"""

import cv2
import torch
import numpy as np
import os
import sys
from pathlib import Path
from paddleocr import PaddleOCR
import warnings

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

# Suppress logs
warnings.filterwarnings('ignore')
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['KMP_WARNINGS'] = '0'
os.environ['FLAGS_log_level'] = '3'

class PlateDetectionSystem:
    def __init__(self):
        """Khởi tạo hệ thống nhận diện biển số"""
        self.device = select_device('cpu')  # Sử dụng CPU để tránh lỗi CUDA
        self.detector_model = None
        self.ocr_engine = None
        self.initialized = False
        
        print(f"Plate Detection System - Using device: {self.device}")
        
    def initialize_models(self):
        """Khởi tạo các model"""
        try:
            # Tải model YOLOv5 cho detection
            detector_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../models/LP_detector_nano_61.pt'))
            if not os.path.exists(detector_path):
                raise Exception(f"Detector model not found: {detector_path}")
            
            print(f"Loading detector model: {detector_path}")
            self.detector_model = DetectMultiBackend(detector_path, device=self.device, dnn=False, data=None, fp16=False)
            
            # Khởi tạo PaddleOCR
            print("Initializing PaddleOCR...")
            self.ocr_engine = PaddleOCR(use_angle_cls=True, lang='vi')
            
            self.initialized = True
            print("Models initialized successfully")
            return True
            
        except Exception as e:
            print(f"Error initializing models: {e}")
            return False
    
    def detect_plates(self, image_path):
        """Phát hiện biển số trong ảnh"""
        if not self.initialized:
            if not self.initialize_models():
                return None, None, None
        
        try:
            # Load ảnh
            img0 = cv2.imread(image_path)
            if img0 is None:
                raise Exception('Failed to load image')
            
            # Preprocess ảnh
            img = cv2.cvtColor(img0, cv2.COLOR_BGR2RGB)
            img = cv2.resize(img, (640, 640))
            img = img.astype(np.float32) / 255.0
            img = np.transpose(img, (2, 0, 1))[::-1]
            img = np.ascontiguousarray(img)
            
            # Convert to tensor
            img_tensor = torch.from_numpy(img).to(self.device)
            img_tensor = img_tensor.float()
            img_tensor = img_tensor.unsqueeze(0)
            
            # Inference
            pred = self.detector_model(img_tensor, augment=False, visualize=False)
            pred = non_max_suppression(pred, 0.5, 0.45, None, False, max_det=10)  # Tăng max_det để phát hiện nhiều biển số
            
            detections = []
            
            # Process predictions
            for det in pred:
                if len(det):
                    det[:, :4] = scale_coords(img_tensor.shape[2:], det[:, :4], img0.shape).round()
                    
                    for *xyxy, conf, cls in det:
                        x1, y1, x2, y2 = map(int, xyxy)
                        confidence = float(conf)
                        
                        # Crop vùng biển số
                        plate_crop = img0[y1:y2, x1:x2]
                        
                        if plate_crop.size > 0:
                            detections.append({
                                'bbox': {'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2},
                                'confidence': confidence,
                                'crop': plate_crop
                            })
            
            return detections, img0, None
            
        except Exception as e:
            print(f"Error in detect_plates: {e}")
            return None, None, str(e)
    
    def recognize_plate_text(self, plate_crop):
        """Nhận diện ký tự trên biển số"""
        try:
            if plate_crop is None or plate_crop.size == 0:
                return ""
            
            # Save temp crop
            temp_crop_path = 'temp_plate_crop.jpg'
            cv2.imwrite(temp_crop_path, plate_crop)
            
            # OCR recognition
            result = self.ocr_engine.ocr(temp_crop_path, cls=True)
            
            # Clean up temp file
            if os.path.exists(temp_crop_path):
                os.remove(temp_crop_path)
            
            # Extract text
            texts = []
            if result and len(result) > 0:
                for line in result:
                    if line and len(line) > 0:
                        for word in line:
                            if word and len(word) > 1:
                                texts.append(word[1][0])
            
            return ' '.join(texts).strip()
            
        except Exception as e:
            print(f"Error in recognize_plate_text: {e}")
            return ""
    
    def process_image(self, image_path):
        """Xử lý ảnh hoàn chỉnh: detection + recognition"""
        try:
            print(f"Processing image: {image_path}")
            
            # Phát hiện biển số
            detections, original_img, error = self.detect_plates(image_path)
            
            if error:
                return {
                    'success': False,
                    'message': f'Detection error: {error}'
                }
            
            if not detections:
                # Fallback: nhận diện toàn ảnh
                print("No plates detected, trying full image OCR...")
                fallback_text = self.recognize_plate_text(original_img)
                
                return {
                    'success': True,
                    'text': fallback_text,
                    'bbox': None,
                    'method': 'full_image_paddleocr_recognition',
                    'message': 'No license plate detected, using full image recognition.',
                    'detections': []
                }
            
            # Xử lý từng biển số được phát hiện
            results = []
            best_result = None
            best_confidence = 0
            
            for i, detection in enumerate(detections):
                plate_crop = detection['crop']
                bbox = detection['bbox']
                confidence = detection['confidence']
                
                # Nhận diện ký tự
                text = self.recognize_plate_text(plate_crop)
                
                result = {
                    'index': i,
                    'text': text,
                    'bbox': bbox,
                    'confidence': confidence,
                    'method': 'yolov5_detection_paddleocr_recognition'
                }
                
                results.append(result)
                
                # Cập nhật kết quả tốt nhất
                if confidence > best_confidence and text.strip():
                    best_result = result
                    best_confidence = confidence
            
            # Trả về kết quả tốt nhất
            if best_result:
                return {
                    'success': True,
                    'text': best_result['text'],
                    'bbox': best_result['bbox'],
                    'confidence': best_result['confidence'],
                    'method': best_result['method'],
                    'detections': results
                }
            else:
                # Nếu không có kết quả tốt, thử nhận diện toàn ảnh
                print("No good recognition results, trying full image...")
                fallback_text = self.recognize_plate_text(original_img)
                
                return {
                    'success': True,
                    'text': fallback_text,
                    'bbox': None,
                    'method': 'full_image_paddleocr_recognition',
                    'message': 'No good plate recognition, using full image.',
                    'detections': results
                }
                
        except Exception as e:
            print(f"Error in process_image: {e}")
            return {
                'success': False,
                'message': f'Processing error: {e}'
            }

# Singleton instance
_plate_detection_system = None

def get_plate_detection_system():
    """Lấy instance singleton của PlateDetectionSystem"""
    global _plate_detection_system
    if _plate_detection_system is None:
        _plate_detection_system = PlateDetectionSystem()
    return _plate_detection_system

def detect_plate_from_image(image_path):
    """Function wrapper để tương thích với API cũ"""
    system = get_plate_detection_system()
    return system.process_image(image_path)

# Test function
if __name__ == "__main__":
    import argparse
    import traceback
    import json
    import sys
    import io
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', required=True, help='Path to input image')
    args = parser.parse_args()
    # Redirect stdout/stderr to capture all output
    log_path = os.path.abspath(os.path.join(os.path.dirname(__file__), 'debug_ocr.log'))
    log_buffer = io.StringIO()
    sys_stdout = sys.stdout
    sys_stderr = sys.stderr
    sys.stdout = log_buffer
    sys.stderr = log_buffer
    try:
        result = detect_plate_from_image(args.image)
        sys.stdout = sys_stdout
        sys.stderr = sys_stderr
        # Ghi log
        with open(log_path, 'a', encoding='utf-8') as f:
            f.write(log_buffer.getvalue())
            f.write('\n---\n')
        print(json.dumps(result, indent=2, ensure_ascii=False), flush=True)
    except Exception as e:
        sys.stdout = sys_stdout
        sys.stderr = sys_stderr
        tb = traceback.format_exc()
        with open(log_path, 'a', encoding='utf-8') as f:
            f.write(log_buffer.getvalue())
            f.write(tb)
            f.write('\n---\n')
        print(json.dumps({
            'success': False,
            'message': f'Python exception: {str(e)}',
            'traceback': tb,
            'log_path': log_path
        }), flush=True)
    sys.exit(0) 