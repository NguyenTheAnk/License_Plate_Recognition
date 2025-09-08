#!/usr/bin/env python3
"""
Optimized License Plate Detection - Reduced processing for better FPS
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
last_detection_time = 0
detection_interval = 0.1  # Detect every 0.1 seconds for better FPS
last_ocr_time = 0
ocr_interval = 0.2  # OCR every 0.2 seconds

# ROI Configuration
ROI_PERCENT_XMIN = 0.0
ROI_PERCENT_YMIN = 0.25
ROI_PERCENT_XMAX = 1.0
ROI_PERCENT_YMAX = 0.75

def initialize_models():
    """Initialize YOLO and OCR models"""
    global yolo_model, ocr_reader
    
    try:
        yolo_model = YOLO('yolov9s.pt')
        logger.info("✅ YOLO model loaded")
        
        # Simplified OCR initialization
        ocr_reader = PaddleOCR(use_angle_cls=False, lang='en', show_log=False, use_gpu=False)
        logger.info("✅ OCR model loaded")
        
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
    return (x1 < roi_xmax and x2 > roi_xmin and y1 < roi_ymax and y2 > roi_ymin)

def simple_ocr(plate_crop):
    """Optimized OCR for high FPS with good accuracy"""
    try:
        if ocr_reader is None or plate_crop is None:
            return None, 0.0
        
        height, width = plate_crop.shape[:2]
        if width < 20 or height < 8:
            return None, 0.0
        
        # Convert to grayscale
        if len(plate_crop.shape) == 3:
            gray = cv2.cvtColor(plate_crop, cv2.COLOR_BGR2GRAY)
        else:
            gray = plate_crop.copy()
        
        # Optimized preprocessing - only essential steps
        # Resize if too small (faster interpolation)
        if width < 120:
            scale = 120 / width
            new_width = int(width * scale)
            new_height = int(height * scale)
            gray = cv2.resize(gray, (new_width, new_height), interpolation=cv2.INTER_LINEAR)
        
        # Single enhancement method for speed
        # Apply CLAHE for better contrast
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
        enhanced = clahe.apply(gray)
        
        # Single OCR attempt with optimized settings
        result = ocr_reader.ocr(enhanced, det=True, rec=True, cls=False)
        
        if result and result[0]:
            best_text = ""
            best_conf = 0.0
            
            for line in result[0]:
                if len(line) >= 2:
                    text = line[1][0].strip()
                    conf = line[1][1]
                    
                    # Fast cleaning for Vietnamese plates
                    cleaned = re.sub(r'[^\w\-.]', '', text.upper())
                    
                    # Quick validation
                    if (len(cleaned) >= 4 and conf > best_conf and 
                        cleaned.count('-') <= 2 and cleaned.count('.') <= 2):
                        best_text = cleaned
                        best_conf = conf
        
        return best_text if best_text else None, best_conf
        
    except Exception as e:
        logger.debug(f"OCR failed: {e}")
        return None, 0.0

def is_valid_license_plate(text):
    """Enhanced validation for Vietnamese license plates"""
    if not text or len(text) < 4:
        return False, 0.0
    
    # Enhanced validation for Vietnamese license plates
    # Common patterns: 30A-12345, 29A-123.45, 43A123456, etc.
    if len(text) >= 4:
        # Check for reasonable character distribution
        alpha_count = sum(1 for c in text if c.isalpha())
        digit_count = sum(1 for c in text if c.isdigit())
        
        # Should have at least some letters and numbers
        if alpha_count >= 1 and digit_count >= 2:
            return True, 0.8
    
    return False, 0.0

def save_plate_crop(plate_crop, plate_text, frame_count):
    """Save plate crop image to static/crops directory"""
    try:
        if plate_crop is None or plate_crop.size == 0:
            return ""
        
        # Create crops directory if it doesn't exist
        crops_dir = "static/crops"
        os.makedirs(crops_dir, exist_ok=True)
        
        # Generate filename with timestamp and plate number
        timestamp = int(time.time() * 1000)
        clean_plate = re.sub(r'[^\w\-.]', '', plate_text.upper()) if plate_text else "unknown"
        if not clean_plate:
            clean_plate = "unknown"
        
        # Create unique filename
        filename = f"plate_{timestamp}_{clean_plate}_{frame_count}.jpg"
        filepath = os.path.join(crops_dir, filename)
        
        # Save the image with high quality
        success = cv2.imwrite(filepath, plate_crop, [cv2.IMWRITE_JPEG_QUALITY, 95])
        if success:
            logger.info(f"✅ Saved plate crop: {filename}")
            return filename
        else:
            logger.error(f"Failed to save plate crop: {filename}")
            return ""
            
    except Exception as e:
        logger.error(f"Error saving plate crop: {e}")
        return ""

def detect_and_ocr_simple(frame):
    """Ultra-optimized detection function for high FPS"""
    global frame_count, last_detection_time, last_ocr_time
    
    try:
        if frame is None or frame.size == 0:
            return {'frame': b'', 'boxes': [], 'labels': [], 'ocr_results': [], 'tracked_objects': {}}
        
        original_height, original_width = frame.shape[:2]
        display_frame = frame.copy()
        frame_count += 1
        
        current_time = time.time()
        
        # Calculate FPS (optimized)
        if not hasattr(detect_and_ocr_simple, 'fps_times'):
            detect_and_ocr_simple.fps_times = []
        
        detect_and_ocr_simple.fps_times.append(current_time)
        # Keep only last 5 frames for faster FPS calculation
        if len(detect_and_ocr_simple.fps_times) > 5:
            detect_and_ocr_simple.fps_times.pop(0)
        
        if len(detect_and_ocr_simple.fps_times) > 1:
            fps = (len(detect_and_ocr_simple.fps_times) - 1) / (
                detect_and_ocr_simple.fps_times[-1] - detect_and_ocr_simple.fps_times[0]
            )
        else:
            fps = 0
        
        # Draw FPS (simplified)
        fps_text = f"FPS: {fps:.1f}"
        cv2.putText(display_frame, fps_text, (original_width - 100, 30), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        
        # Draw ROI (simplified)
        roi_xmin, roi_ymin, roi_xmax, roi_ymax = calculate_roi_coordinates(original_width, original_height)
        cv2.rectangle(display_frame, (roi_xmin, roi_ymin), (roi_xmax, roi_ymax), (0, 255, 255), 1)
        
        # Initialize results
        boxes = []
        labels = []
        ocr_results = []
        tracked_objects = {}
        
        # OPTIMIZED DETECTION - Run detection more frequently
        should_detect = (current_time - last_detection_time) >= detection_interval
        should_ocr = (current_time - last_ocr_time) >= ocr_interval
        
        if should_detect and yolo_model is not None:
            last_detection_time = current_time
            
            try:
                # Optimized YOLO run with smaller input size
                results = yolo_model(frame, conf=0.4, verbose=False, half=True, imgsz=416)
                
                plate_count = 0
                max_plates = 1  # Process only 1 plate per detection for speed
                
                for result in results:
                    if result.boxes is not None and plate_count < max_plates:
                        for box in result.boxes:
                            if plate_count >= max_plates:
                                break
                            
                            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                            conf = box.conf[0].cpu().numpy()
                            x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
                            
                            # Basic size check
                            if (x2 - x1) < 30 or (y2 - y1) < 10:
                                continue
                            
                            # ROI check
                            if not is_bbox_in_roi([x1, y1, x2, y2], original_width, original_height):
                                continue
                            
                            plate_count += 1
                            
                            # Draw bounding box immediately
                            color = (0, 255, 0) if conf > 0.6 else (0, 255, 255)
                            cv2.rectangle(display_frame, (x1, y1), (x2, y2), color, 2)
                            
                            # OCR only when needed
                            if should_ocr:
                                last_ocr_time = current_time
                                plate_crop = frame[max(0, y1):min(original_height, y2), 
                                                 max(0, x1):min(original_width, x2)]
                                
                                if plate_crop.size > 0:
                                    plate_text, ocr_conf = simple_ocr(plate_crop)
                                    
                                    if plate_text and len(plate_text.strip()) >= 3:
                                        is_valid, _ = is_valid_license_plate(plate_text)
                                        
                                        # Display text (simplified)
                                        display_text = f"{plate_text} ({conf:.2f})"
                                        cv2.putText(display_frame, display_text, (x1 + 5, max(30, y1 - 10)),
                                                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                                        
                                        # Add to results
                                        boxes.append([x1, y1, x2, y2])
                                        labels.append(plate_text)
                                        ocr_results.append([plate_text, float(ocr_conf)])
                                        
                                        # Save high confidence detections
                                        if is_valid and conf > 0.5:
                                            crop_filename = save_plate_crop(plate_crop, plate_text, frame_count)
                                            
                                            track_id = f"plate_{frame_count}_{plate_count}"
                                            tracked_objects[track_id] = {
                                                'plate_number': plate_text,
                                                'confidence': float(conf),
                                                'ocr_confidence': float(ocr_conf),
                                                'bbox': [x1, y1, x2, y2],
                                                'crop_filename': crop_filename,
                                                'first_seen': current_time,
                                                'last_seen': current_time,
                                                'is_valid': True,
                                                'validation_confidence': 0.8,
                                                'vehicle_type': 'license_plate'
                                            }
                                    else:
                                        # Show detection without OCR
                                        cv2.putText(display_frame, f"Detected ({conf:.2f})", 
                                                   (x1 + 5, max(30, y1 - 10)),
                                                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)
                            
            except Exception as e:
                logger.error(f"Detection failed: {e}")
        
        # Status indicator (simplified)
        status_text = "DETECTING" if should_detect else "STANDBY"
        status_color = (0, 255, 0) if should_detect else (0, 255, 255)
        cv2.putText(display_frame, status_text, (10, 30), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, status_color, 2)
        
        # Encode frame with optimized quality
        try:
            encode_params = [cv2.IMWRITE_JPEG_QUALITY, 75]  # Lower quality for speed
            _, buffer = cv2.imencode('.jpg', display_frame, encode_params)
            frame_bytes = buffer.tobytes()
        except Exception as e:
            logger.error(f"Frame encoding failed: {e}")
            frame_bytes = b''
        
        return {
            'frame': frame_bytes,
            'boxes': boxes,
            'labels': labels,
            'ocr_results': ocr_results,
            'tracked_objects': tracked_objects,
            'frame_width': original_width,
            'frame_height': original_height
        }
        
    except Exception as e:
        logger.error(f"detect_and_ocr_simple failed: {e}")
        # Return fallback frame
        try:
            _, buffer = cv2.imencode('.jpg', frame)
            return {'frame': buffer.tobytes(), 'boxes': [], 'labels': [], 'ocr_results': [], 'tracked_objects': {}}
        except:
            return {'frame': b'', 'boxes': [], 'labels': [], 'ocr_results': [], 'tracked_objects': {}}

# Auto-initialize
initialize_models()