#!/usr/bin/env python3
"""
Clean detector with only essential functions for license plate detection + OCR
"""

import cv2
import numpy as np
from ultralytics import YOLO
import torch
import logging
import time
import os
import urllib.request
import ssl
from typing import Optional, List, Dict, Any
import re
from paddleocr import PaddleOCR

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global variables
yolo_model = None
ocr_reader = None
frame_count = 0
last_frame_time = None
smoothed_fps = 0.0

# Configuration
MIN_CONFIDENCE = 0.3
ROI_PERCENT_XMIN = 0.0
ROI_PERCENT_YMIN = 0.25
ROI_PERCENT_XMAX = 1.0
ROI_PERCENT_YMAX = 0.75

def safe_yolo_load(model_path):
    """Safely load YOLO model"""
    try:
        logger.info(f"Loading YOLO model: {model_path}")
        model = YOLO(model_path)
        logger.info(f"✅ YOLO model loaded successfully: {type(model)}")
        return model
    except Exception as e:
        logger.error(f"❌ Failed to load YOLO model: {e}")
        return None

def safe_ocr_initialization():
    """Safely initialize PaddleOCR"""
    global ocr_reader
    try:
        logger.info("🔧 Initializing PaddleOCR...")
        ocr_reader = PaddleOCR(
            use_angle_cls=False,
            lang='en',
            show_log=False,
            use_gpu=False,
            det_db_thresh=0.1,
            det_db_box_thresh=0.2
        )
        logger.info("✅ PaddleOCR initialized successfully")
        return True
    except Exception as e:
        logger.error(f"❌ PaddleOCR initialization failed: {e}")
        ocr_reader = None
        return False

def safe_image_processing(image):
    """Safely process image"""
    try:
        if image is None:
            return None
        
        if not isinstance(image, np.ndarray):
            return None
            
        if len(image.shape) != 3:
            return None
            
        if image.shape[2] != 3:
            return None
            
        return image
    except Exception as e:
        logger.error(f"Image processing failed: {e}")
        return None

def safe_frame_encoding(frame):
    """Safely encode frame to bytes"""
    try:
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
        return buffer.tobytes()
    except Exception as e:
        logger.error(f"Frame encoding failed: {e}")
        return None

def safe_extract_ocr_text(ocr_result):
    """Safely extract text from OCR result"""
    try:
        if not ocr_result or not ocr_result[0]:
            return "", 0.0
        
        best_text = ""
        best_conf = 0.0
        
        for line in ocr_result[0]:
            if len(line) >= 2:
                text = line[1][0] if isinstance(line[1], (list, tuple)) else str(line[1])
                conf = line[1][1] if isinstance(line[1], (list, tuple)) and len(line[1]) > 1 else 0.5
                
                if text and conf > best_conf:
                    best_text = text.strip()
                    best_conf = conf
        
        return best_text, best_conf
    except Exception as e:
        logger.error(f"OCR text extraction failed: {e}")
        return "", 0.0

def process_plate_text(text):
    """Process and clean text"""
    if not text:
        return ""
    
    # Remove special characters and clean text
    cleaned = re.sub(r'[^A-Za-z0-9]', '', text.upper())
    
    # Basic validation
    if len(cleaned) < 3:
        return ""
    
    return cleaned

def calculate_roi_coordinates(width, height):
    """Calculate ROI coordinates"""
    xmin = int(width * ROI_PERCENT_XMIN)
    ymin = int(height * ROI_PERCENT_YMIN)
    xmax = int(width * ROI_PERCENT_XMAX)
    ymax = int(height * ROI_PERCENT_YMAX)
    return xmin, ymin, xmax, ymax

def is_bbox_in_roi(bbox, width, height, min_overlap=0.1):
    """Check if bounding box is in ROI"""
    try:
        x1, y1, x2, y2 = bbox
        roi_xmin, roi_ymin, roi_xmax, roi_ymax = calculate_roi_coordinates(width, height)
        
        # Calculate overlap
        overlap_x = max(0, min(x2, roi_xmax) - max(x1, roi_xmin))
        overlap_y = max(0, min(y2, roi_ymax) - max(y1, roi_ymin))
        overlap_area = overlap_x * overlap_y
        
        bbox_area = (x2 - x1) * (y2 - y1)
        overlap_ratio = overlap_area / bbox_area if bbox_area > 0 else 0
        
        return overlap_ratio >= min_overlap
    except Exception as e:
        logger.error(f"ROI check failed: {e}")
        return True

def initialize_models_properly():
    """Initialize models properly - YOLOv8n.pt + PaddleOCR"""
    global yolo_model, ocr_reader
    
    try:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        
        # Load yolov8n.pt for object detection
        yolo_path = os.path.join(current_dir, 'yolov8n.pt')
        logger.info(f"Loading YOLOv8n model: {yolo_path}")
        
        if os.path.exists(yolo_path):
            yolo_model = safe_yolo_load(yolo_path)
        else:
            yolo_model = safe_yolo_load('yolov8n.pt')
        
        if yolo_model is None:
            logger.error("❌ Failed to load yolov8n.pt")
            return False
        
        # Initialize OCR
        if ocr_reader is None:
            safe_ocr_initialization()
        
        logger.info(f"🔍 Final model status:")
        logger.info(f"  - YOLOv8n model: {yolo_model is not None}")
        logger.info(f"  - OCR reader: {ocr_reader is not None}")
        
        return True
        
    except Exception as e:
        logger.error(f"Initialization error: {e}")
        return False

def detect_and_ocr_simplified(frame, video_processing=True):
    """Object detection using YOLOv8n.pt + PaddleOCR with ROI-based detection"""
    global yolo_model, ocr_reader, frame_count, last_frame_time, smoothed_fps
    
    frame_count += 1
    
    try:
        # STEP 1: Validate input
        if frame is None or frame.size == 0:
            logger.error("Invalid frame input")
            return None
        
        original_height, original_width = frame.shape[:2]
        display_frame = frame.copy()
        
        # STEP 2: Initialize models and OCR if needed
        if yolo_model is None:
            logger.warning("🔧 No YOLO model loaded, attempting initialization...")
            initialize_models_properly()
        
        if ocr_reader is None:
            safe_ocr_initialization()
        
        # STEP 3: FPS calculation
        try:
            now_ts = time.time()
            if last_frame_time is not None:
                dt = max(1e-3, now_ts - last_frame_time)
                inst_fps = 1.0 / dt
                smoothed_fps = (0.9 * smoothed_fps + 0.1 * inst_fps) if smoothed_fps > 0 else inst_fps
            last_frame_time = now_ts
        except:
            smoothed_fps = 0.0

        # STEP 4: Draw ROI and FPS
        try:
            # Draw ROI rectangle
            roi_xmin, roi_ymin, roi_xmax, roi_ymax = calculate_roi_coordinates(original_width, original_height)
            cv2.rectangle(display_frame, (roi_xmin, roi_ymin), (roi_xmax, roi_ymax), (0, 255, 255), 2)
            cv2.putText(display_frame, "ROI", (roi_xmin + 10, roi_ymin - 10), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
            
            # Draw FPS
            fps_text = f"FPS: {smoothed_fps:.1f}"
            text_size = cv2.getTextSize(fps_text, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)[0]
            text_x = original_width - text_size[0] - 10
            text_y = 30
            
            cv2.rectangle(display_frame, (text_x - 5, text_y - 20), (text_x + text_size[0] + 5, text_y + 5), (0, 0, 0), -1)
            cv2.putText(display_frame, fps_text, (text_x, text_y), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        except Exception as e:
            logger.error(f"Display setup failed: {e}")

        # STEP 5: Initialize response arrays
        boxes = []
        labels = []
        ocr_results = []
        
        # STEP 6: Run object detection using YOLOv8n.pt
        detections = []
        
        if yolo_model is not None:
            try:
                detection_start_time = time.time()
                logger.debug("Running YOLOv8n detection...")
                
                # Run YOLO detection
                results = yolo_model(frame, conf=MIN_CONFIDENCE, iou=0.5, verbose=False, imgsz=640)
                detection_time = time.time() - detection_start_time
                
                if detection_time > 5.0:  # 5 second timeout
                    logger.warning(f"Detection took too long: {detection_time:.2f}s, skipping")
                    detections = []
                else:
                    logger.debug(f"YOLO detection completed in {detection_time:.2f}s")
                    
                    # Process results
                    if results and len(results) > 0:
                        result = results[0]
                        if hasattr(result, 'boxes') and result.boxes is not None:
                            yolo_boxes = result.boxes
                            
                            if hasattr(yolo_boxes, 'xyxy') and hasattr(yolo_boxes, 'conf') and hasattr(yolo_boxes, 'cls'):
                                # Convert to numpy arrays
                                xyxy = yolo_boxes.xyxy.cpu().numpy() if hasattr(yolo_boxes.xyxy, 'cpu') else yolo_boxes.xyxy
                                conf = yolo_boxes.conf.cpu().numpy() if hasattr(yolo_boxes.conf, 'cpu') else yolo_boxes.conf
                                cls = yolo_boxes.cls.cpu().numpy() if hasattr(yolo_boxes.cls, 'cpu') else yolo_boxes.cls
                                
                                logger.debug(f"Found {len(xyxy)} raw detections")
                                
                                # Process each detection
                                for i in range(len(xyxy)):
                                    try:
                                        box = xyxy[i]
                                        confidence = float(conf[i])
                                        class_id = int(cls[i])
                                        
                                        # Extract coordinates
                                        x1, y1, x2, y2 = float(box[0]), float(box[1]), float(box[2]), float(box[3])
                                        
                                        # Filter for reasonable objects and check if in ROI
                                        width = x2 - x1
                                        height = y2 - y1
                                        
                                        is_valid_object = (
                                            confidence > MIN_CONFIDENCE and
                                            width > 30 and height > 15 and
                                            width < original_width * 0.8 and height < original_height * 0.8
                                        )
                                        
                                        # Check if object is in ROI
                                        if is_valid_object and is_bbox_in_roi([x1, y1, x2, y2], original_width, original_height):
                                            detections.append([x1, y1, x2, y2, confidence, class_id])
                                            logger.debug(f"Object in ROI: [{x1:.0f},{y1:.0f},{x2:.0f},{y2:.0f}] conf={confidence:.3f} class={class_id}")
                                            
                                    except Exception as box_error:
                                        logger.error(f"Error processing detection box: {box_error}")
                                        continue
                    
                    logger.debug(f"Found {len(detections)} objects in ROI")
                    
            except Exception as detection_error:
                logger.error(f"YOLO detection failed: {detection_error}")
                detections = []
        else:
            logger.error("YOLO model is None - cannot run detection")
        
        # STEP 7: Process detections with OCR
        for detection in detections:
            try:
                x1, y1, x2, y2 = detection[:4]
                confidence = detection[4] if len(detection) > 4 else 0.5
                class_id = detection[5] if len(detection) > 5 else 0
                
                # Draw detection box
                cv2.rectangle(display_frame, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 0), 2)
                
                # Process OCR for this detection
                plate_text = ""
                ocr_confidence = 0.0
                
                try:
                    # Crop the object area
                    object_crop = frame[int(y1):int(y2), int(x1):int(x2)]
                    
                    if object_crop.size > 0 and ocr_reader is not None:
                        # Run OCR
                        ocr_result = ocr_reader.ocr(object_crop, det=False, rec=True, cls=False)
                        
                        if ocr_result and ocr_result[0]:
                            # Extract text and confidence
                            plate_text, ocr_confidence = safe_extract_ocr_text(ocr_result)
                            
                            if plate_text:
                                # Process and validate plate text
                                processed_text = process_plate_text(plate_text)
                                if processed_text:
                                    plate_text = processed_text
                                    ocr_results.append([plate_text, ocr_confidence])
                                    
                                    logger.info(f"🚗 Text detected: '{plate_text}' (conf: {ocr_confidence:.3f})")
                        
                except Exception as ocr_error:
                    logger.error(f"OCR processing failed: {ocr_error}")
                
                # Draw results on frame
                if plate_text:
                    # Draw text above bounding box
                    label = f"{plate_text} ({ocr_confidence:.2f})"
                    label_size = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)[0]
                    
                    # Background rectangle for text
                    cv2.rectangle(display_frame, 
                                (int(x1), int(y1) - 35), 
                                (int(x1) + label_size[0] + 10, int(y1) - 5), 
                                (0, 0, 0), -1)
                    
                    # Draw text
                    cv2.putText(display_frame, label, (int(x1) + 5, int(y1) - 10), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
                else:
                    # Draw object label if no text recognized
                    cv2.putText(display_frame, f"Object {confidence:.2f}", (int(x1), int(y1) - 10), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                
                # Add detection to response
                boxes.append([int(x1), int(y1), int(x2), int(y2)])
                labels.append(f"Object {confidence:.2f}")
                    
            except Exception as detection_error:
                logger.error(f"Detection processing error: {detection_error}")
                continue
        
        # STEP 8: Encode final frame
        try:
            frame_bytes = safe_frame_encoding(display_frame)
            if frame_bytes is None:
                return None
        except Exception as encode_error:
            logger.error(f"Frame encoding failed: {encode_error}")
            return None
        
        # STEP 9: Return result
        result = {
            'frame': frame_bytes,
            'boxes': boxes,
            'labels': labels,
            'ocr_results': ocr_results,
            'fps': smoothed_fps,
            'frame_count': frame_count
        }
        
        return result
        
    except Exception as e:
        logger.error(f"detect_and_ocr_simplified failed: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return None

def check_pytorch_compatibility():
    """Check PyTorch compatibility"""
    try:
        import torch
        logger.info(f"✅ PyTorch version: {torch.__version__}")
        logger.info(f"✅ CUDA available: {torch.cuda.is_available()}")
        return True
    except Exception as e:
        logger.error(f"❌ PyTorch compatibility check failed: {e}")
        return False

def check_model_availability():
    """Check if required models are available"""
    try:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        yolo_path = os.path.join(current_dir, 'yolov8n.pt')
        
        if os.path.exists(yolo_path):
            logger.info(f"✅ YOLOv8n model found: {yolo_path}")
            return True
        else:
            logger.warning(f"⚠️ YOLOv8n model not found at: {yolo_path}")
            return False
    except Exception as e:
        logger.error(f"❌ Model availability check failed: {e}")
        return False

def initialize_ocr():
    """Initialize OCR reader"""
    global ocr_reader
    try:
        if ocr_reader is None:
            safe_ocr_initialization()
        return ocr_reader is not None
    except Exception as e:
        logger.error(f"❌ OCR initialization failed: {e}")
        return False

def get_tracked_objects():
    """Get tracked objects (for compatibility)"""
    return {}

def get_detection_stats():
    """Get detection statistics (for compatibility)"""
    return {
        'total_detections': 0,
        'active_tracks': 0,
        'fps': smoothed_fps
    }

# Export main functions
__all__ = [
    'detect_and_ocr_simplified',
    'initialize_models_properly',
    'safe_yolo_load',
    'safe_ocr_initialization',
    'safe_image_processing',
    'safe_frame_encoding',
    'safe_extract_ocr_text',
    'process_plate_text',
    'calculate_roi_coordinates',
    'is_bbox_in_roi',
    'check_pytorch_compatibility',
    'check_model_availability',
    'initialize_ocr',
    'get_tracked_objects',
    'get_detection_stats'
]
