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
        # Create crops directory if it doesn't exist
        crops_dir = "static/crops"
        os.makedirs(crops_dir, exist_ok=True)
        
        # Generate filename with timestamp
        timestamp = int(time.time())
        safe_text = re.sub(r'[^\w\-_.]', '_', plate_text) if plate_text else "unknown"
        filename = f"plate_{frame_count}_{safe_text}_{timestamp}.jpg"
        filepath = os.path.join(crops_dir, filename)
        
        # Save image
        cv2.imwrite(filepath, plate_crop)
        logger.info(f"💾 Plate crop saved: {filepath}")
        
        return filepath
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
            logger.info(f"🔍 Resized plate crop to: {new_width}x{new_height}")
        
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
        
        # Try OCR on all versions
        best_text = ""
        best_conf = 0.0
        best_method = ""
        
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
                            if len(cleaned_text) >= 3 and conf > best_conf:
                                best_text = cleaned_text
                                best_conf = conf
                                best_method = method_name
                                logger.info(f"📤 OCR {method_name}: '{cleaned_text}' (conf: {conf:.3f})")
                
            except Exception as e:
                logger.debug(f"OCR method {method_name} failed: {e}")
                continue
        
        if best_text:
            logger.info(f"🏆 Best OCR result: '{best_text}' from {best_method} (conf: {best_conf:.3f})")
            # Save crop with good results
            if best_conf > 0.3:
                save_plate_crop(plate_crop, best_text, frame_count)
        
        return best_text, best_conf
        
    except Exception as e:
        logger.error(f"OCR processing failed: {e}")
        return None, 0.0

def is_valid_vietnamese_plate(text):
    """Check if text matches Vietnamese license plate patterns"""
    if not text:
        return False
    
    # Remove spaces and convert to uppercase
    text = text.replace(" ", "").upper()
    
    # Vietnamese plate patterns
    patterns = [
        r'^\d{2}[A-Z]-\d{3}\.\d{2}$',     # 30A-123.45
        r'^\d{2}[A-Z]-\d{4}\.\d{2}$',     # 30A-1234.56
        r'^\d{2}[A-Z]\d-\d{4}$',          # 30A1-2345
        r'^\d{2}[A-Z]{2}-\d{3}\.\d{2}$',  # 30AB-123.45
        r'^\d{2}[A-Z]\d{3,5}$',           # 30A123, 30A1234
        r'^\d{1,2}[A-Z]{1,2}\d{3,5}$',    # Flexible pattern
    ]
    
    for pattern in patterns:
        if re.match(pattern, text):
            return True
    
    return False

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
        
        # Run YOLO detection for license plates
        if yolo_model is not None:
            try:
                logger.info(f"🔍 Running YOLO detection on frame {frame_count}")
                
                # Run YOLO with low confidence to catch more plates
                # Since this model is trained specifically for license plates, we don't need class filtering
                results = yolo_model(frame, conf=0.1, verbose=False)  # Low confidence threshold
                
                total_detections = 0
                for result in results:
                    if result.boxes is not None:
                        total_detections += len(result.boxes)
                
                logger.info(f"🎯 YOLO found {total_detections} license plate detections")
                
                # If no detections, try with even lower confidence
                if total_detections == 0:
                    logger.info("⚠️ No detections found, trying ultra-low confidence...")
                    results = yolo_model(frame, conf=0.01, verbose=False)
                    total_detections = sum(len(result.boxes) if result.boxes is not None else 0 for result in results)
                    logger.info(f"🎯 Ultra-low confidence found {total_detections} detections")
                
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
                                
                                # Draw detection box
                                cv2.rectangle(display_frame, (x1, y1), (x2, y2), (255, 0, 0), 2)
                                
                                # Add detection label
                                detection_label = f"Plate Detection ({conf:.2f})"
                                cv2.putText(display_frame, detection_label, (x1, max(25, y1 - 30)),
                                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 0), 1)
                                
                                # Crop plate region
                                plate_crop = frame[y1:y2, x1:x2]
                                
                                if plate_crop.size > 0:
                                    logger.info(f"🔍 Running OCR on plate {processed_plates}, crop size: {plate_crop.shape}")
                                    
                                    # Run OCR
                                    plate_text, ocr_conf = run_ocr_on_plate(plate_crop, frame_count)
                                    
                                    if plate_text and len(plate_text.strip()) >= 3:
                                        # Clean text
                                        plate_text = plate_text.strip()
                                        
                                        # Validate format
                                        is_valid = is_valid_vietnamese_plate(plate_text)
                                        
                                        # Determine colors based on confidence and validity
                                        if ocr_conf > 0.8:
                                            if is_valid:
                                                box_color = (0, 255, 0)  # Green - high conf + valid
                                                status = "HIGH CONF + VALID"
                                            else:
                                                box_color = (0, 255, 255)  # Yellow - high conf but invalid format
                                                status = "HIGH CONF + INVALID FORMAT"
                                        elif ocr_conf > 0.5:
                                            if is_valid:
                                                box_color = (0, 255, 255)  # Yellow - medium conf + valid
                                                status = "MEDIUM CONF + VALID"
                                            else:
                                                box_color = (0, 165, 255)  # Orange - medium conf + invalid
                                                status = "MEDIUM CONF + INVALID FORMAT"
                                        else:
                                            box_color = (0, 100, 255)  # Orange/Red - low confidence
                                            status = "LOW CONF"
                                        
                                        # Draw plate bounding box
                                        cv2.rectangle(display_frame, (x1, y1), (x2, y2), box_color, 3)
                                        
                                        # Prepare text
                                        main_text = f"{plate_text}"
                                        sub_text = f"OCR: {ocr_conf:.2f} | {status}"
                                        
                                        # Calculate text positions
                                        main_text_size = cv2.getTextSize(main_text, cv2.FONT_HERSHEY_SIMPLEX, 0.8, 2)[0]
                                        sub_text_size = cv2.getTextSize(sub_text, cv2.FONT_HERSHEY_SIMPLEX, 0.4, 1)[0]
                                        
                                        text_x = x1
                                        main_text_y = max(35, y1 - 15)
                                        sub_text_y = main_text_y + main_text_size[1] + 5
                                        
                                        # Ensure text stays in frame
                                        if text_x + max(main_text_size[0], sub_text_size[0]) > original_width:
                                            text_x = original_width - max(main_text_size[0], sub_text_size[0]) - 10
                                        
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
                                        
                                        # Draw main text (plate number)
                                        cv2.putText(display_frame, main_text, (text_x, main_text_y),
                                                   cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
                                        
                                        # Draw background for sub text
                                        cv2.rectangle(display_frame, 
                                                    (text_x - 5, sub_text_y - sub_text_size[1] - 3),
                                                    (text_x + sub_text_size[0] + 5, sub_text_y + 3),
                                                    (0, 0, 0), -1)
                                        
                                        # Draw sub text
                                        cv2.putText(display_frame, sub_text, (text_x, sub_text_y),
                                                   cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1)
                                        
                                        # Add to results
                                        boxes.append([x1, y1, x2, y2])
                                        labels.append(plate_text)
                                        ocr_results.append([plate_text, float(ocr_conf)])
                                        
                                        logger.info(f"✅ License plate detected: '{plate_text}' "
                                                  f"(OCR conf: {ocr_conf:.3f}, valid format: {is_valid})")
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
            'ocr_results': ocr_results
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