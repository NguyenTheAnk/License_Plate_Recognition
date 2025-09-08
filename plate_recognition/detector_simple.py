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
detection_interval = 0.5  # Only detect every 0.5 seconds

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
    """Simplified OCR with minimal preprocessing"""
    try:
        if ocr_reader is None or plate_crop is None:
            return None, 0.0
        
        height, width = plate_crop.shape[:2]
        if width < 20 or height < 8:
            return None, 0.0
        
        # Single enhancement method only
        if len(plate_crop.shape) == 3:
            gray = cv2.cvtColor(plate_crop, cv2.COLOR_BGR2GRAY)
        else:
            gray = plate_crop.copy()
        
        # Simple resize if too small
        if width < 100:
            scale = 100 / width
            new_width = int(width * scale)
            new_height = int(height * scale)
            gray = cv2.resize(gray, (new_width, new_height))
        
        # Single OCR attempt with timeout
        result = ocr_reader.ocr(gray, det=True, rec=True, cls=False)
        
        if result and result[0]:
            best_text = ""
            best_conf = 0.0
            
            for line in result[0]:
                if len(line) >= 2:
                    text = line[1][0].strip()
                    conf = line[1][1]
                    
                    # Basic cleaning
                    cleaned = re.sub(r'[^\w\-.]', '', text.upper())
                    
                    if len(cleaned) >= 3 and conf > best_conf:
                        best_text = cleaned
                        best_conf = conf
            
            return best_text, best_conf
        
        return None, 0.0
        
    except Exception as e:
        logger.debug(f"OCR failed: {e}")
        return None, 0.0

def is_valid_license_plate(text):
    """Simplified validation"""
    if not text or len(text) < 4:
        return False, 0.0
    
    # Basic validation - at least 4 characters
    if len(text) >= 4:
        return True, 0.7
    
    return False, 0.0

def detect_and_ocr_simple(frame):
    """Optimized detection function with better performance"""
    global frame_count, last_detection_time
    
    try:
        if frame is None or frame.size == 0:
            return {'frame': b'', 'boxes': [], 'labels': [], 'ocr_results': [], 'tracked_objects': {}}
        
        original_height, original_width = frame.shape[:2]
        display_frame = frame.copy()
        frame_count += 1
        
        current_time = time.time()
        
        # Calculate FPS
        if not hasattr(detect_and_ocr_simple, 'fps_times'):
            detect_and_ocr_simple.fps_times = []
        
        detect_and_ocr_simple.fps_times.append(current_time)
        # Keep only last 10 frames for FPS calculation
        if len(detect_and_ocr_simple.fps_times) > 10:
            detect_and_ocr_simple.fps_times.pop(0)
        
        if len(detect_and_ocr_simple.fps_times) > 1:
            fps = (len(detect_and_ocr_simple.fps_times) - 1) / (
                detect_and_ocr_simple.fps_times[-1] - detect_and_ocr_simple.fps_times[0]
            )
        else:
            fps = 0
        
        # Draw FPS
        fps_text = f"FPS: {fps:.1f}"
        cv2.putText(display_frame, fps_text, (original_width - 120, 30), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        
        # Draw ROI
        roi_xmin, roi_ymin, roi_xmax, roi_ymax = calculate_roi_coordinates(original_width, original_height)
        cv2.rectangle(display_frame, (roi_xmin, roi_ymin), (roi_xmax, roi_ymax), (0, 255, 255), 2)
        cv2.putText(display_frame, "DETECTION ZONE", (roi_xmin + 10, roi_ymin - 10), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
        
        # Initialize results
        boxes = []
        labels = []
        ocr_results = []
        tracked_objects = {}
        
        # THROTTLED DETECTION - Only run detection every 0.5 seconds
        should_detect = (current_time - last_detection_time) >= detection_interval
        
        if should_detect and yolo_model is not None:
            last_detection_time = current_time
            
            try:
                # Single YOLO run with higher confidence threshold
                results = yolo_model(frame, conf=0.5, verbose=False, half=False, imgsz=640)
                
                plate_count = 0
                max_plates = 2  # Process max 2 plates per detection cycle
                
                for result in results:
                    if result.boxes is not None and plate_count < max_plates:
                        for box in result.boxes:
                            if plate_count >= max_plates:
                                break
                            
                            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                            conf = box.conf[0].cpu().numpy()
                            x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
                            
                            # Basic size check
                            if (x2 - x1) < 40 or (y2 - y1) < 15:
                                continue
                            
                            # ROI check
                            if not is_bbox_in_roi([x1, y1, x2, y2], original_width, original_height):
                                continue
                            
                            plate_count += 1
                            
                            # Draw bounding box immediately (before OCR)
                            color = (0, 255, 0) if conf > 0.7 else (0, 255, 255)
                            cv2.rectangle(display_frame, (x1, y1), (x2, y2), color, 3)
                            
                            # Quick OCR attempt
                            plate_crop = frame[max(0, y1):min(original_height, y2), 
                                             max(0, x1):min(original_width, x2)]
                            
                            if plate_crop.size > 0:
                                plate_text, ocr_conf = simple_ocr(plate_crop)
                                
                                if plate_text and len(plate_text.strip()) >= 3:
                                    is_valid, _ = is_valid_license_plate(plate_text)
                                    
                                    # Display text
                                    display_text = f"{plate_text} ({conf:.2f})"
                                    text_y = max(30, y1 - 10)
                                    
                                    # Text background
                                    text_size = cv2.getTextSize(display_text, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)[0]
                                    cv2.rectangle(display_frame, 
                                                (x1, text_y - text_size[1] - 10),
                                                (x1 + text_size[0] + 10, text_y + 5),
                                                (0, 0, 0), -1)
                                    
                                    cv2.putText(display_frame, display_text, (x1 + 5, text_y),
                                               cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                                    
                                    # Add to results
                                    boxes.append([x1, y1, x2, y2])
                                    labels.append(plate_text)
                                    ocr_results.append([plate_text, float(ocr_conf)])
                                    
                                    # Only save high confidence detections
                                    if is_valid and conf > 0.7:
                                        track_id = f"plate_{frame_count}_{plate_count}"
                                        tracked_objects[track_id] = {
                                            'plate_number': plate_text,
                                            'confidence': float(conf),
                                            'ocr_confidence': float(ocr_conf),
                                            'bbox': [x1, y1, x2, y2],
                                            'crop_filename': '',  # Don't save crops for performance
                                            'first_seen': current_time,
                                            'last_seen': current_time,
                                            'is_valid': True,
                                            'validation_confidence': 0.8,
                                            'vehicle_type': 'license_plate'
                                        }
                                else:
                                    # Show "Processing..." for boxes without OCR result
                                    cv2.putText(display_frame, f"Processing... ({conf:.2f})", 
                                               (x1 + 5, max(30, y1 - 10)),
                                               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
                            
            except Exception as e:
                logger.error(f"Detection failed: {e}")
        
        # Status indicator
        status_text = "DETECTING" if should_detect else "STANDBY"
        status_color = (0, 255, 0) if should_detect else (0, 255, 255)
        cv2.putText(display_frame, status_text, (10, 30), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, status_color, 2)
        
        # Frame counter
        cv2.putText(display_frame, f"Frame: {frame_count}", (10, 60), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        
        # Encode frame with higher quality for better visual
        try:
            encode_params = [cv2.IMWRITE_JPEG_QUALITY, 85]
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