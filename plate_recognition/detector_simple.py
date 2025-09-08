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
    """Run OCR on plate crop with multiple preprocessing methods"""
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
        
        # Convert to grayscale
        if len(plate_crop.shape) == 3:
            gray = cv2.cvtColor(plate_crop, cv2.COLOR_BGR2GRAY)
        else:
            gray = plate_crop.copy()
        
        # Enhanced preprocessing
        enhanced = cv2.bilateralFilter(gray, 9, 75, 75)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
        enhanced = clahe.apply(enhanced)
        
        # Try multiple preprocessing methods
        preprocessed_versions = [
            ("original", plate_crop),
            ("enhanced", enhanced),
            ("otsu", cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]),
            ("adaptive", cv2.adaptiveThreshold(enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2))
        ]
        
        # Try OCR on all versions
        best_text = ""
        best_conf = 0.0
        
        for method_name, version in preprocessed_versions:
            try:
                result = ocr_reader.ocr(version, det=True, rec=True, cls=False)
                
                if result and result[0]:
                    for line in result[0]:
                        if len(line) >= 2:
                            text = line[1][0].strip()
                            conf = line[1][1]
                            
                            # Clean text - remove special characters but keep letters, numbers, dashes
                            cleaned_text = re.sub(r'[^\w\-.]', '', text)
                            
                            # Only consider if we have meaningful text
                            if len(cleaned_text) >= 3 and conf > 0.3:
                                if conf > best_conf:
                                    best_text = cleaned_text
                                    best_conf = conf
                
            except Exception as e:
                logger.debug(f"OCR method {method_name} failed: {e}")
                continue
        
        # Apply basic character correction
        if best_text:
            corrected_text = smart_character_correction(best_text)
            if corrected_text != best_text:
                best_text = corrected_text
            
            # Save crop with good results
            if best_conf > 0.3:
                save_plate_crop(plate_crop, best_text, frame_count)
        
        return best_text, best_conf
        
    except Exception as e:
        logger.error(f"OCR processing failed: {e}")
        return None, 0.0

def clean_text(text):
    """Clean text for license plate recognition"""
    if not text:
        return ""
    
    # Convert to uppercase and remove unwanted characters
    text = text.upper().strip()
    cleaned = re.sub(r'[^A-Z0-9\-\.]', '', text)
    
    # Remove unwanted patterns
    unwanted_patterns = ['VN', 'VIET', 'NAM', 'VIETNAM']
    for pattern in unwanted_patterns:
        cleaned = cleaned.replace(pattern, '')
    
    return cleaned.strip()

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

def is_valid_license_plate(text):
    """Simple validation for license plate text"""
    if not text or len(text) < 6:
        return False, 0.0
    
    # Clean text
    cleaned = clean_text(text)
    
    # Basic validation: should have at least 6 characters, start with 2 digits
    if len(cleaned) >= 6 and cleaned[:2].isdigit():
        return True, 0.8
    
    return False, 0.0

def detect_and_ocr_simple(frame):
    """Main detection function using YOLO for license plates + OCR"""
    global frame_count
    
    try:
        if frame is None or frame.size == 0:
            return {'frame': b'', 'boxes': [], 'labels': [], 'ocr_results': []}
        
        original_height, original_width = frame.shape[:2]
        display_frame = frame.copy()
        frame_count += 1
        
        # Calculate FPS (simple approximation)
        current_time = time.time()
        if not hasattr(detect_and_ocr_simple, 'last_time'):
            detect_and_ocr_simple.last_time = current_time
            fps = 0
        else:
            fps = 1.0 / (current_time - detect_and_ocr_simple.last_time)
            detect_and_ocr_simple.last_time = current_time
        
        # Draw FPS in top right corner
        fps_text = f"FPS: {fps:.1f}"
        cv2.putText(display_frame, fps_text, (original_width - 100, 30), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        
        # Draw ROI zone - yellow rectangle, half height, full width
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
                # Run YOLO with confidence threshold
                results = yolo_model(frame, conf=0.3, verbose=False)
                
                total_detections = 0
                for result in results:
                    if result.boxes is not None:
                        total_detections += len(result.boxes)
                
                # If no detections, try with lower confidence
                if total_detections == 0:
                    results = yolo_model(frame, conf=0.1, verbose=False)
                    total_detections = sum(len(result.boxes) if result.boxes is not None else 0 for result in results)
                
                processed_plates = 0
                
                for result in results:
                    if result.boxes is not None:
                        for box in result.boxes:
                            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                            conf = box.conf[0].cpu().numpy()
                            x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
                            
                            # Check if plate is in ROI
                            in_roi = is_bbox_in_roi([x1, y1, x2, y2], original_width, original_height)
                            
                            # Check minimum size
                            width_check = (x2 - x1) >= 30
                            height_check = (y2 - y1) >= 10
                            
                            if in_roi and width_check and height_check:
                                processed_plates += 1
                                
                                # Crop plate region
                                plate_crop = frame[y1:y2, x1:x2]
                                
                                if plate_crop.size > 0:
                                    # Run OCR
                                    plate_text, ocr_conf = run_ocr_on_plate(plate_crop, frame_count)
                                    
                                    if plate_text and len(plate_text.strip()) >= 3:
                                        # Clean text
                                        plate_text = plate_text.strip()
                                        
                                        # Simple validation
                                        is_valid, validation_conf = is_valid_license_plate(plate_text)
                                        
                                        # Determine colors based on confidence
                                        if is_valid:
                                            if conf > 0.8:
                                                box_color = (0, 255, 0)  # Green - high confidence
                                            elif conf > 0.6:
                                                box_color = (0, 255, 255)  # Yellow - medium confidence
                                            else:
                                                box_color = (0, 165, 255)  # Orange - low confidence
                                        else:
                                            box_color = (0, 0, 255)  # Red - invalid
                                        
                                        # Draw plate bounding box
                                        cv2.rectangle(display_frame, (x1, y1), (x2, y2), box_color, 3)
                                        
                                        # Prepare text - show plate number with confidence
                                        main_text = f"{plate_text} ({conf:.2f})"
                                        
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
                                        
                                        # Draw main text
                                        cv2.putText(display_frame, main_text, (text_x, main_text_y),
                                                   cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
                                        
                                        # Add to results
                                        boxes.append([x1, y1, x2, y2])
                                        labels.append(plate_text)
                                        ocr_results.append([plate_text, float(ocr_conf)])
                                        
                                        # Only save to database if valid
                                        if is_valid:
                                            # Save crop image
                                            crop_path = save_plate_crop(plate_crop, plate_text, frame_count)
                                            
                                            # Add to tracked objects for database storage
                                            track_id = f"plate_{frame_count}_{processed_plates}"
                                            tracked_objects[track_id] = {
                                                'plate_number': plate_text,
                                                'confidence': float(conf),
                                                'ocr_confidence': float(ocr_conf),
                                                'bbox': [x1, y1, x2, y2],
                                                'crop_filename': crop_path,
                                                'first_seen': time.time(),
                                                'last_seen': time.time(),
                                                'is_valid': True,
                                                'validation_confidence': validation_conf,
                                                'vehicle_type': 'license_plate'  # Simple vehicle type
                                            }
                
            except Exception as e:
                logger.error(f"YOLO detection failed: {e}")
        else:
            logger.warning("⚠️ YOLO model not loaded")
        
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
        return {'frame': b'', 'boxes': [], 'labels': [], 'ocr_results': []}

# Initialize models on import
if __name__ == "__main__":
    initialize_models()
else:
    # Initialize models when imported
    initialize_models()