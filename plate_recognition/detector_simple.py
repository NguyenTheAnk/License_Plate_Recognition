#!/usr/bin/env python3
"""
Simplified License Plate Detection and Recognition
Tối ưu hóa cho hiệu suất cao và code đơn giản
"""

import cv2
import numpy as np
import time
import logging
from ultralytics import YOLO
from paddleocr import PaddleOCR
import re

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

# Vehicle classes for YOLO
VEHICLE_CLASSES = [2, 3, 5, 7]  # car, motorcycle, bus, truck

def initialize_models():
    """Initialize YOLO and OCR models"""
    global yolo_model, ocr_reader
    
    try:
        # Load YOLO model
        yolo_model = YOLO('yolov9s.pt')
        logger.info("✅ YOLO model loaded successfully")
        
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

def is_vehicle_in_roi(bbox, width, height):
    """Check if vehicle bounding box is in ROI"""
    x1, y1, x2, y2 = bbox
    roi_xmin, roi_ymin, roi_xmax, roi_ymax = calculate_roi_coordinates(width, height)
    
    # Check if any part of vehicle is in ROI
    return (x1 < roi_xmax and x2 > roi_xmin and y1 < roi_ymax and y2 > roi_ymin)

def detect_license_plate_simple(vehicle_crop):
    """Simple license plate detection using edge detection"""
    try:
        if vehicle_crop is None or vehicle_crop.size == 0:
            return None
        
        height, width = vehicle_crop.shape[:2]
        
        # Convert to grayscale
        if len(vehicle_crop.shape) == 3:
            gray = cv2.cvtColor(vehicle_crop, cv2.COLOR_BGR2GRAY)
        else:
            gray = vehicle_crop
        
        # Edge detection
        edges = cv2.Canny(gray, 50, 150)
        
        # Find contours
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Find best plate candidate
        best_plate = None
        best_score = 0
        
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            
            # Basic filters
            if w < 60 or h < 20 or w > width * 0.8 or h > height * 0.4:
                continue
            
            aspect_ratio = w / h
            if aspect_ratio < 2.0 or aspect_ratio > 5.0:
                continue
            
            # Score based on position and size
            position_score = 1.0 - (y / height)  # Prefer lower positions
            size_score = min((w * h) / (width * height * 0.05), 1.0)
            aspect_score = 1.0 - abs(aspect_ratio - 3.0) / 3.0
            
            total_score = position_score * 0.5 + size_score * 0.3 + aspect_score * 0.2
            
            if total_score > best_score:
                best_score = total_score
                best_plate = (x, y, x + w, y + h)
        
        return best_plate if best_score > 0.4 else None
        
    except Exception as e:
        logger.error(f"Plate detection failed: {e}")
        return None

def run_ocr_on_plate(plate_crop):
    """Run OCR on plate crop"""
    try:
        if ocr_reader is None or plate_crop is None:
            return None, 0.0
        
        # Run OCR
        result = ocr_reader.ocr(plate_crop, det=True, rec=True, cls=False)
        
        if result and result[0]:
            # Get the best result
            best_text = ""
            best_conf = 0.0
            
            for line in result[0]:
                if len(line) >= 2:
                    text = line[1][0]
                    conf = line[1][1]
                    
                    if conf > best_conf:
                        best_text = text
                        best_conf = conf
            
            return best_text.strip(), best_conf
        else:
            return None, 0.0
            
    except Exception as e:
        logger.error(f"OCR failed: {e}")
        return None, 0.0

def is_valid_vietnamese_plate(text):
    """Check if text is a valid Vietnamese license plate"""
    if not text:
        return False
    
    # Remove spaces and convert to uppercase
    text = text.replace(" ", "").upper()
    
    # Vietnamese plate patterns
    patterns = [
        r'^[0-9]{2}[A-Z]{1,2}[0-9]{4,5}$',  # Standard format
        r'^[0-9]{2}[A-Z]{2}[0-9]{4,5}$',    # 2 letters
        r'^[0-9]{2}[A-Z]{1}[0-9]{4,5}$',    # 1 letter
    ]
    
    for pattern in patterns:
        if re.match(pattern, text):
            return True
    
    return False

def detect_and_ocr_simple(frame):
    """Simplified detection and OCR function"""
    global frame_count
    
    try:
        if frame is None or frame.size == 0:
            return {'frame': b'', 'boxes': [], 'labels': [], 'ocr_results': []}
        
        original_height, original_width = frame.shape[:2]
        display_frame = frame.copy()
        frame_count += 1
        
        # Draw ROI zone
        roi_xmin, roi_ymin, roi_xmax, roi_ymax = calculate_roi_coordinates(original_width, original_height)
        cv2.rectangle(display_frame, (roi_xmin, roi_ymin), (roi_xmax, roi_ymax), (0, 255, 255), 3)
        cv2.putText(display_frame, "DETECTION ZONE", (roi_xmin + 10, roi_ymin - 10), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        
        # Initialize results
        boxes = []
        labels = []
        ocr_results = []
        
        # Run detection only if models are loaded
        if yolo_model is not None:
            try:
                # Run YOLO detection
                results = yolo_model(frame, conf=0.4, verbose=False, classes=VEHICLE_CLASSES)
                
                for result in results:
                    if result.boxes is not None:
                        for box in result.boxes:
                            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                            conf = box.conf[0].cpu().numpy()
                            class_id = int(box.cls[0].cpu().numpy())
                            x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
                            
                            # Check if vehicle is in ROI
                            if is_vehicle_in_roi([x1, y1, x2, y2], original_width, original_height):
                                # Draw vehicle bounding box
                                cv2.rectangle(display_frame, (x1, y1), (x2, y2), (0, 255, 255), 2)
                                
                                # Add vehicle label
                                vehicle_text = f"Vehicle ({conf:.2f})"
                                cv2.putText(display_frame, vehicle_text, (x1, max(25, y1 - 10)),
                                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                                
                                # Crop vehicle region
                                vehicle_crop = frame[y1:y2, x1:x2]
                                
                                if vehicle_crop.size > 0:
                                    # Detect license plate
                                    plate_bbox = detect_license_plate_simple(vehicle_crop)
                                    
                                    if plate_bbox:
                                        px1, py1, px2, py2 = plate_bbox
                                        frame_px1 = x1 + px1
                                        frame_py1 = y1 + py1
                                        frame_px2 = x1 + px2
                                        frame_py2 = y1 + py2
                                        
                                        # Crop plate region
                                        plate_crop = frame[frame_py1:frame_py2, frame_px1:frame_px2]
                                        
                                        if plate_crop.size > 0:
                                            plate_height, plate_width = plate_crop.shape[:2]
                                            if plate_width > 50 and plate_height > 15:
                                                # Run OCR
                                                plate_text, ocr_conf = run_ocr_on_plate(plate_crop)
                                                
                                                if plate_text and is_valid_vietnamese_plate(plate_text):
                                                    # Determine color based on confidence
                                                    if ocr_conf > 0.8:
                                                        box_color = (0, 255, 0)  # Green
                                                        status = "HIGH_CONF"
                                                    elif ocr_conf > 0.6:
                                                        box_color = (255, 255, 0)  # Yellow
                                                        status = "MED_CONF"
                                                    else:
                                                        box_color = (0, 165, 255)  # Orange
                                                        status = "LOW_CONF"
                                                    
                                                    # Draw plate bounding box
                                                    cv2.rectangle(display_frame, (frame_px1, frame_py1), (frame_px2, frame_py2), box_color, 3)
                                                    
                                                    # Draw plate text with background
                                                    text = f"{plate_text} ({ocr_conf:.2f})"
                                                    text_size = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)[0]
                                                    text_x = frame_px1
                                                    text_y = max(30, frame_py1 - 10)
                                                    
                                                    # Draw background
                                                    cv2.rectangle(display_frame, 
                                                                (text_x - 5, text_y - text_size[1] - 5),
                                                                (text_x + text_size[0] + 5, text_y + 5),
                                                                (0, 0, 0), -1)
                                                    
                                                    # Draw text
                                                    cv2.putText(display_frame, text, (text_x, text_y),
                                                               cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                                                    
                                                    # Add to results
                                                    boxes.append([frame_px1, frame_py1, frame_px2, frame_py2])
                                                    labels.append(plate_text)
                                                    ocr_results.append([plate_text, float(ocr_conf)])
                                                    
                                                    logger.info(f"✅ Plate detected: {plate_text} (conf: {ocr_conf:.2f})")
                                                else:
                                                    # No valid plate detected
                                                    no_plate_text = "No Valid Plate"
                                                    cv2.putText(display_frame, no_plate_text, (frame_px1, max(30, frame_py1 - 10)),
                                                               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (128, 128, 128), 2)
                                        
            except Exception as e:
                logger.error(f"Detection failed: {e}")
        
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
            'ocr_results': ocr_results
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
