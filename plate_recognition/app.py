from flask import Flask, request, jsonify, send_from_directory, Response
from flask_sock import Sock
from flask_cors import CORS
import json
import logging
import time
import traceback
import cv2
import numpy as np
import sys
import os
import mysql.connector
from datetime import datetime
import uuid
import re

ROI_PERCENT_XMIN = 0.05  
ROI_PERCENT_YMIN = 0.10  
ROI_PERCENT_XMAX = 0.95  
ROI_PERCENT_YMAX = 0.95  

current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

# Import the simplified detection function
try:
    from detector_fixed import detect_and_ocr_simplified as detect_and_ocr_simplified
    logger = logging.getLogger(__name__)
    logger.info("✅ Successfully imported detect_and_ocr_simplified")
except ImportError as e:
    logger = logging.getLogger(__name__)
    logger.error(f"❌ Failed to import detect_and_ocr_simplified: {e}")
    detect_and_ocr_simplified = None

def validate_vietnamese_plate_format(plate_text):
    """Kiểm tra format biển số Việt Nam"""
    if not plate_text or not isinstance(plate_text, str):
        return False
    
    clean_text = re.sub(r'[^A-Z0-9\-\.]', '', plate_text.upper().strip())
    
    if len(clean_text) < 7 or len(clean_text) > 12:
        return False
    
    patterns = [
        r'^\d{2}[A-Z]-\d{3}\.\d{2}$',
        r'^\d{2}[A-Z]-\d{4}\.\d{2}$',  
        r'^\d{2}[A-Z]{2}-\d{2}\.\d{2}$',
        r'^\d{2}[A-Z]{2}-\d{3}\.\d{2}$',
        r'^\d{2}[A-Z]-\d{4,5}$',
        r'^\d{2}[A-Z]\d-\d{3}\.\d{2}$',
        r'^\d{2}[A-Z]\d-\d{4}$',
    ]
    
    return any(re.match(pattern, clean_text) for pattern in patterns)
def calculate_roi_coordinates(width, height):
    roi_xmin = int(width * ROI_PERCENT_XMIN)
    roi_ymin = int(height * ROI_PERCENT_YMIN)
    roi_xmax = int(width * ROI_PERCENT_XMAX)
    roi_ymax = int(height * ROI_PERCENT_YMAX)
    return roi_xmin, roi_ymin, roi_xmax, roi_ymax

# Import detector (simple)
try:
    from detector_fixed import detect_and_ocr_simplified as detect_and_ocr
    print("Simple Detector imported successfully")
except ImportError as e:
    print(f"Error importing simple detector: {e}")
    # Fallback to fixed detector
    try:
        from detector_fixed import detect_and_ocr_simplified as detect_and_ocr
        print("Fallback to Fixed Detector")
    except ImportError as e2:
        print(f"Error importing fallback detector: {e2}")
        sys.exit(1)

# Cáº¥u hÃ¬nh logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, origins=["*"])
sock = Sock(app)

# Add error handlers for better error handling
@app.errorhandler(Exception)
def handle_exception(e):
    logger.error(f"Unhandled exception: {e}")
    import traceback
    logger.error(f"Exception traceback: {traceback.format_exc()}")
    return jsonify({
        'success': False,
        'message': f'Internal server error: {str(e)}'
    }), 500

@app.errorhandler(404)
def not_found(e):
    return jsonify({
        'success': False,
        'message': 'Endpoint not found'
    }), 404

@app.errorhandler(500)
def internal_error(e):
    logger.error(f"Internal server error: {e}")
    return jsonify({
        'success': False,
        'message': 'Internal server error'
    }), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    try:
        return jsonify({
            'success': True,
            'message': 'Server is running',
            'timestamp': datetime.now().isoformat(),
            'status': 'healthy'
        })
    except Exception as e:
        logger.error(f"Health check error: {e}")
        return jsonify({
            'success': False,
            'message': f'Health check failed: {str(e)}',
            'timestamp': datetime.now().isoformat(),
            'status': 'unhealthy'
        }), 500

@app.route('/status', methods=['GET'])
def server_status():
    """Server status endpoint"""
    try:
        # Check if models are available
        try:
            from detector_fixed import yolo_model, ocr_reader
        except ImportError:
            from detector import yolo_model, ocr_reader
        
        status = {
            'success': True,
            'server': 'running',
            'timestamp': datetime.now().isoformat(),
            'models': {
                'yolo_model': yolo_model is not None,
                'plate_model': yolo_model is not None,  # Using yolo_model for both
                'ocr_reader': ocr_reader is not None
            }
        }
        
        return jsonify(status)
    except Exception as e:
        logger.error(f"Status check error: {e}")
        return jsonify({
            'success': False,
            'message': f'Status check failed: {str(e)}',
            'timestamp': datetime.now().isoformat()
        }), 500

# Khởi tạo models
def initialize_models_safely():
    """Initialize models safely with error handling"""
    try:
        logger.info("🔄 Initializing models safely...")
        
        # Import detector functions
        try:
            from detector_fixed import check_pytorch_compatibility, check_model_availability, initialize_models_properly, initialize_ocr
            logger.info("✅ Using fixed detector initialization")
            check_pytorch_compatibility()
            check_model_availability()
            initialize_models_properly()  # Initialize models first
            initialize_ocr()
        except ImportError as e:
            logger.warning(f"⚠️ Fixed detector failed: {e}, falling back to simple detector")
            try:
                from detector_simple import initialize_models as init_models
                logger.info("✅ Using simple detector initialization")
                init_models()
            except ImportError as e2:
                logger.warning(f"⚠️ Simple detector also failed: {e2}, trying full detector")
                try:
                    from detector import load_models
                    logger.info("✅ Using full detector initialization")
                    load_models()
                except ImportError as e3:
                    logger.error(f"❌ All detectors failed: {e3}")
                    return False
        
        # Check PyTorch compatibility
        check_pytorch_compatibility()
        
        # Check model availability
        check_model_availability()
        
        # Initialize models
        initialize_models_properly()
        
        # Initialize OCR
        initialize_ocr()
        
        logger.info("✅ Models initialization completed successfully")
        return True
        
    except Exception as e:
        logger.error(f"❌ Models initialization failed: {e}")
        import traceback
        logger.error(f"Models initialization traceback: {traceback.format_exc()}")
        return False

try:
    logger.info("🔄 Setting up model initialization...")
    # Initialize models in background to avoid blocking server startup
    import threading
    
    def init_models_background():
        try:
            initialize_models_safely()
        except Exception as e:
            logger.error(f"Background model initialization failed: {e}")
    
    # Start model initialization in background thread
    model_init_thread = threading.Thread(target=init_models_background, daemon=True)
    model_init_thread.start()
    
    logger.info("✅ Models initialization setup completed")
except Exception as e:
    logger.error(f"❌ Failed to setup model initialization: {e}")
    logger.warning("⚠️ System will continue but detection may not work properly")

# Database configuration
DB_CONFIG = {
    'host': '127.0.0.1',
    'user': 'root',
    'password': '22022001',
    'database': 'lpdb',
    'charset': 'utf8mb4'
}

def get_db_connection():
    try:
        connection = mysql.connector.connect(**DB_CONFIG)
        return connection
    except mysql.connector.Error as e:
        logger.error(f"Database connection error: {e}")
        return None
def save_detection_to_db(detection_data):
    try:
        connection = get_db_connection()
        if not connection:
            logger.error("Database connection failed")
            return False
        
        cursor = connection.cursor()        
        query = """
        INSERT INTO license_plate_detections (
            detection_uuid,
            plate_number,
            raw_plate_text,
            camera_id,
            location_id,
            detected_at,
            direction,
            confidence_score,
            ocr_confidence,
            detection_confidence,
            cropped_plate_image_path,
            detected_vehicle_type,
            bbox_x1,
            bbox_y1,
            bbox_x2,
            bbox_y2,
            processing_time_ms,
            ai_model_version,
            raw_detection_data,
            is_verified,
            is_whitelist_match,
            is_blacklist_match,
            alert_triggered,
            vehicle_id
        ) VALUES (
            %(uuid)s, %(plate_number)s, %(raw_plate_text)s, %(camera_id)s, 
            %(location_id)s, %(detected_at)s, %(direction)s, %(confidence_score)s,
            %(ocr_confidence)s, %(detection_confidence)s, %(cropped_plate_image_path)s,
            %(detected_vehicle_type)s, %(bbox_x1)s, %(bbox_y1)s, %(bbox_x2)s, %(bbox_y2)s,
            %(processing_time_ms)s, %(ai_model_version)s, %(raw_detection_data)s,
            %(is_verified)s, %(is_whitelist_match)s, %(is_blacklist_match)s, %(alert_triggered)s,
            %(vehicle_id)s
        )
        """
        
        # Generate UUID
        detection_uuid = str(uuid.uuid4())
        
        # Validate and sanitize detection_data
        try:
            validated_data = {
                'uuid': detection_uuid,
                'plate_number': str(detection_data.get('plate_number', ''))[:50],  # Limit length
                'raw_plate_text': str(detection_data.get('raw_plate_text', detection_data.get('plate_number', '')))[:255],
                'camera_id': int(detection_data.get('camera_id', 1)),
                'location_id': int(detection_data.get('location_id', 1)),
                'detected_at': datetime.fromtimestamp(float(detection_data.get('detected_at', time.time()))),
                'direction': str(detection_data.get('direction', 'unknown'))[:50],
                'confidence_score': max(0.0, min(1.0, float(detection_data.get('confidence_score', 0.8)))),
                'ocr_confidence': max(0.0, min(1.0, float(detection_data.get('ocr_confidence', 0.0)))),
                'detection_confidence': max(0.0, min(1.0, float(detection_data.get('detection_confidence', 0.8)))),
                'cropped_plate_image_path': str(detection_data.get('cropped_plate_image_path', ''))[:255],
                'detected_vehicle_type': str(detection_data.get('detected_vehicle_type', 'car'))[:50],
                'bbox_x1': int(detection_data.get('bbox_x1', 0)),
                'bbox_y1': int(detection_data.get('bbox_y1', 0)),
                'bbox_x2': int(detection_data.get('bbox_x2', 0)),
                'bbox_y2': int(detection_data.get('bbox_y2', 0)),
                'processing_time_ms': int(detection_data.get('processing_time_ms', 0)),
                'ai_model_version': str(detection_data.get('ai_model_version', 'yolov11-deepsort-v1.0'))[:100],
                'raw_detection_data': str(detection_data.get('raw_detection_data', '{}'))[:1000],  # Limit JSON size
                'is_verified': bool(detection_data.get('is_verified', False)),
                'is_whitelist_match': bool(detection_data.get('is_whitelist_match', False)),
                'is_blacklist_match': bool(detection_data.get('is_blacklist_match', False)),
                'alert_triggered': bool(detection_data.get('alert_triggered', False)),
                'vehicle_id': None  # KhÃ´ng lÆ°u track_id vÃ o vehicle_id vÃ¬ cÃ³ foreign key constraint
            }
        except (ValueError, TypeError) as validation_error:
            logger.error(f"âŒ Data validation error: {validation_error}")
            return False
        
        # Log để debug
        logger.info(f"Saving with vehicle_id: {validated_data['vehicle_id']}")
        logger.debug(f"Full detection data: {validated_data}")
        
        cursor.execute(query, validated_data)
        connection.commit()
        
        detection_id = cursor.lastrowid
        cursor.close()
        connection.close()
        
        logger.info(f"Detection saved to database with ID: {detection_id}")
        return detection_id
        
    except mysql.connector.Error as db_error:
        logger.error(f"Database error saving detection: {db_error}")
        if 'connection' in locals():
            try:
                connection.close()
            except:
                pass
        return False
    except Exception as e:
        logger.error(f"General error saving detection to database: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        if 'connection' in locals():
            try:
                connection.close()
            except:
                pass
        return False  
def check_whitelist_blacklist(plate_number):
    """Kiá»ƒm tra biá»ƒn sá»‘ cÃ³ trong whitelist/blacklist khÃ´ng"""
    try:
        connection = get_db_connection()
        if not connection:
            return {'is_whitelist': False, 'is_blacklist': False}
        
        cursor = connection.cursor(dictionary=True)
        
        # Kiá»ƒm tra whitelist
        whitelist_query = """
        SELECT id FROM vehicle_whitelist 
        WHERE plate_number = %s AND is_active = 1 
        AND (valid_from IS NULL OR valid_from <= NOW()) 
        AND (valid_to IS NULL OR valid_to >= NOW())
        """
        cursor.execute(whitelist_query, (plate_number,))
        is_whitelist = cursor.fetchone() is not None
        
        # Kiá»ƒm tra blacklist
        blacklist_query = """
        SELECT id FROM vehicle_blacklist 
        WHERE plate_number = %s AND is_active = 1 
        AND (valid_from IS NULL OR valid_from <= NOW()) 
        AND (valid_to IS NULL OR valid_to >= NOW())
        """
        cursor.execute(blacklist_query, (plate_number,))
        is_blacklist = cursor.fetchone() is not None
        
        cursor.close()
        connection.close()
        
        return {
            'is_whitelist': is_whitelist,
            'is_blacklist': is_blacklist
        }
        
    except Exception as e:
        logger.error(f"Error checking whitelist/blacklist: {e}")
        return {'is_whitelist': False, 'is_blacklist': False}    
    

# ThÃªm thÆ° má»¥c hiá»‡n táº¡i vÃ o path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

# Ensure fixed detector is available (already imported above)

# Cáº¥u hÃ¬nh logging Ä‘á»ƒ giáº£m spam
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('app.log', mode='a')
    ]
)
logger = logging.getLogger(__name__)

# Giáº£m log level cho má»™t sá»‘ module Ä‘á»ƒ trÃ¡nh spam
logging.getLogger('detector').setLevel(logging.WARNING)
logging.getLogger('ultralytics').setLevel(logging.WARNING)
logging.getLogger('paddleocr').setLevel(logging.WARNING)

app = Flask(__name__)

# CORS configuration - cho phÃ©p táº¥t cáº£ origins
CORS(app, 
     origins=["*"], 
     allow_headers=["*"],
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     supports_credentials=False)

sock = Sock(app)

# Khá»Ÿi táº¡o models khi server khá»Ÿi Ä‘á»™ng
logger.info("Enhanced detection models will be initialized automatically when needed...")
logger.info("Enhanced detection models (YOLOv11 + PaddleOCR) setup completed!")

# WebSocket endpoint cho real-time detection
# Thay tháº¿ pháº§n WebSocket handling trong app.py vá»›i error handling tá»‘t hÆ¡n

# WebSocket endpoint cho real-time detection - COMPLETE FIX
@sock.route('/recognize-ws')
@sock.route('/recognize-ws')
def recognize_ws(ws):
    logger.info("WebSocket connection established for real-time detection")
    
    welcome_msg = {
        'status': 'connected',
        'message': 'WebSocket connection established successfully'
    }
    ws.send(json.dumps(welcome_msg))
    
    last_heartbeat = time.time()
    heartbeat_interval = 30
    frame_count = 0
    
    try:
        while True:
            try:
                current_time = time.time()
                
                # Heartbeat
                if current_time - last_heartbeat > heartbeat_interval:
                    try:
                        heartbeat_msg = {
                            'type': 'heartbeat',
                            'timestamp': current_time,
                            'status': 'alive',
                            'frame_count': frame_count
                        }
                        ws.send(json.dumps(heartbeat_msg))
                        last_heartbeat = current_time
                    except Exception as heartbeat_err:
                        logger.error(f"Heartbeat failed: {heartbeat_err}")
                        break
                
                # Receive message with timeout
                try:
                    message = ws.receive(timeout=1.0)
                except Exception as receive_err:
                    if "Connection closed" in str(receive_err) or "1000" in str(receive_err):
                        logger.info("WebSocket connection closed by client")
                        break
                    elif "timeout" in str(receive_err).lower():
                        continue
                    else:
                        logger.warning(f"WebSocket receive error: {receive_err}")
                        continue
                
                if message is None:
                    continue
                
                # Process frame
                if isinstance(message, bytes):
                    try:
                        frame_count += 1
                        logger.debug(f"Processing frame {frame_count}: {len(message)} bytes")
                        
                        # Decode frame
                        nparr = np.frombuffer(message, np.uint8)
                        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                        
                        if frame is None:
                            logger.warning(f"Frame {frame_count}: invalid frame data")
                            continue
                        
                        original_height, original_width = frame.shape[:2]
                        logger.debug(f"Frame {frame_count}: decoded {original_width}x{original_height}")
                        
                        # Process with detection - WITH COMPREHENSIVE ERROR HANDLING
                        result = None
                        try:
                            # Set processing timeout
                            processing_start = time.time()
                            FRAME_TIMEOUT = 3.0  # 3 second timeout per frame
                            
                            if detect_and_ocr_simplified is not None:
                                result = detect_and_ocr_simplified(frame, video_processing=True)
                            else:
                                logger.error("detect_and_ocr_simplified is not available")
                                result = create_fallback_frame_result(frame)
                            processing_time = time.time() - processing_start
                            
                            if processing_time > FRAME_TIMEOUT:
                                logger.warning(f"Frame {frame_count}: processing exceeded timeout: {processing_time:.2f}s")
                            
                            if not result or not isinstance(result, dict):
                                logger.warning(f"Frame {frame_count}: invalid detection result")
                                result = create_fallback_frame_result(frame)
                            elif 'frame' not in result:
                                logger.warning(f"Frame {frame_count}: detection result missing 'frame' key")
                                result = create_fallback_frame_result(frame)
                            else:
                                logger.debug(f"Frame {frame_count}: detection successful")
                                
                        except Exception as detection_error:
                            logger.error(f"Frame {frame_count}: detection error: {detection_error}")
                            result = create_fallback_frame_result(frame)
                        
                        # Validate result
                        if not result:
                            logger.error(f"Frame {frame_count}: could not create valid result")
                            continue
                        
                        # SAFE database processing
                        try:
                            # No more tracking - just process detections directly
                            boxes = result.get('boxes', [])
                            ocr_results = result.get('ocr_results', [])
                            if boxes:
                                logger.info(f"Frame {frame_count}: processing {len(boxes)} detections")
                            else:
                                logger.debug(f"Frame {frame_count}: no tracked objects for database")
                        except Exception as db_error:
                            logger.error(f"Frame {frame_count}: database processing error: {db_error}")
                            # Don't let database errors break the stream
                        
                        # SAFE frame sending
                        try:
                            frame_data = result.get('frame')
                            if frame_data is not None:
                                if isinstance(frame_data, bytes):
                                    frame_bytes = frame_data
                                elif isinstance(frame_data, np.ndarray):
                                    _, buffer = cv2.imencode('.jpg', frame_data, [cv2.IMWRITE_JPEG_QUALITY, 75])
                                    frame_bytes = buffer.tobytes()
                                else:
                                    logger.warning(f"Frame {frame_count}: unexpected frame data type")
                                    continue
                                
                                ws.send(frame_bytes)
                                logger.debug(f"Frame {frame_count}: sent {len(frame_bytes)} bytes")
                                
                            else:
                                logger.warning(f"Frame {frame_count}: no frame data to send")
                                
                        except Exception as send_error:
                            logger.error(f"Frame {frame_count}: failed to send frame: {send_error}")
                            # Check if connection is closed and break if so
                            if "Connection closed" in str(send_error) or "1001" in str(send_error):
                                logger.info("WebSocket connection closed by client")
                                break
                            # Continue processing, don't break the connection for other errors
                            continue
                        
                        # Send metadata safely
                        try:
                            send_frame_metadata(ws, result, original_width, original_height, frame_count)
                        except Exception as metadata_error:
                            logger.error(f"Frame {frame_count}: metadata send error: {metadata_error}")
                            # Continue, metadata is not critical
                            
                    except Exception as frame_error:
                        logger.error(f"Frame {frame_count}: processing error: {frame_error}")
                        # Send error frame to keep stream alive
                        try:
                            send_error_frame(ws, str(frame_error))
                        except:
                            pass
                        continue
                else:
                    logger.debug(f"Received text message: {message}")
                    
            except Exception as loop_error:
                logger.error(f"WebSocket loop error: {loop_error}")
                # Try to keep connection alive
                try:
                    time.sleep(0.1)
                    continue
                except:
                    break
                    
    except Exception as critical_error:
        logger.error(f"Critical WebSocket error: {critical_error}")
        import traceback
        logger.error(f"WebSocket traceback: {traceback.format_exc()}")
    finally:
        logger.info("WebSocket connection closed")

def create_fallback_frame_result(original_frame):
    """Create fallback result when detection fails"""
    try:
        fallback_frame = original_frame.copy()
        h, w = fallback_frame.shape[:2]
        
        # Draw error message
        cv2.rectangle(fallback_frame, (0, 0), (w, 60), (0, 0, 0), -1)
        cv2.putText(fallback_frame, "DETECTION ERROR - FALLBACK MODE", (10, 30), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
        cv2.putText(fallback_frame, "Video stream continues...", (10, 50), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        
        # Draw ROI
        roi_xmin, roi_ymin, roi_xmax, roi_ymax = calculate_roi_coordinates(w, h)
        cv2.rectangle(fallback_frame, (roi_xmin, roi_ymin), (roi_xmax, roi_ymax), (0, 255, 255), 2)
        
        _, buffer = cv2.imencode('.jpg', fallback_frame)
        
        return {
            'frame': buffer.tobytes(),
            'boxes': [],
            'labels': [],
            'ocr_results': [],
            'boxes': [],
            'ocr_results': [],
            'ids': [],
            'frame_width': w,
            'frame_height': h,
            'error_mode': True
        }
    except Exception as e:
        logger.error(f"Fallback frame creation failed: {e}")
        return {
            'frame': b'',
            'boxes': [],
            'labels': [],
            'ocr_results': [],
            'boxes': [],
            'ocr_results': [],
            'ids': []
        }

# Removed process_tracked_objects_safely - no longer needed

# Removed save_detection_safely - no longer needed

def send_error_frame(ws, error_message):
    """Send error frame to keep stream alive"""
    try:
        error_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.putText(error_frame, "PROCESSING ERROR", (50, 200), 
                   cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        cv2.putText(error_frame, error_message[:50], (50, 250), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
        _, buffer = cv2.imencode('.jpg', error_frame)
        ws.send(buffer.tobytes())
    except Exception as send_err:
        logger.debug(f"Could not send error frame: {send_err}")

def send_frame_metadata(ws, result, width, height, frame_count):
    """Safely send frame metadata"""
    try:
        boxes = result.get('boxes', [])
        ocr_results = result.get('ocr_results', [])
        
        # Validate data
        safe_boxes = []
        for box in boxes:
            if isinstance(box, (list, tuple)) and len(box) >= 4:
                try:
                    safe_box = [int(float(x)) for x in box[:4]]
                    safe_boxes.append(safe_box)
                except (ValueError, TypeError):
                    continue
        
        safe_ocr_results = []
        for ocr_result in ocr_results:
            if isinstance(ocr_result, (list, tuple)) and len(ocr_result) >= 2:
                try:
                    safe_ocr = [str(ocr_result[0]), float(ocr_result[1])]
                    safe_ocr_results.append(safe_ocr)
                except (ValueError, TypeError, IndexError):
                    continue
        
        roi_xmin, roi_ymin, roi_xmax, roi_ymax = calculate_roi_coordinates(width, height)
        
        metadata = {
            'type': 'detection_result',
            'boxes': safe_boxes,
            'ocr_results': safe_ocr_results,
            'roi': [roi_xmin, roi_ymin, roi_xmax, roi_ymax],
            'frame_count': frame_count,
            'timestamp': time.time(),
            'frame_width': width,
            'frame_height': height
        }
        
        ws.send(json.dumps(metadata))
        
    except Exception as e:
        logger.debug(f"Could not send metadata: {e}")
# Enhanced save_detection_to_db function with better error handling
def save_detection_to_db(detection_data):
    """LÆ°u káº¿t quáº£ detection vÃ o database vá»›i schema thá»±c táº¿ vÃ  tracking ID"""
    try:
        connection = get_db_connection()
        if not connection:
            logger.error("âŒ Database connection failed")
            return False
        
        cursor = connection.cursor()
        
        # Query phÃ¹ há»£p vá»›i schema thá»±c táº¿ vÃ  thÃªm tracking_id
        query = """
        INSERT INTO license_plate_detections (
            detection_uuid,
            plate_number,
            raw_plate_text,
            camera_id,
            location_id,
            detected_at,
            direction,
            confidence_score,
            ocr_confidence,
            detection_confidence,
            cropped_plate_image_path,
            detected_vehicle_type,
            bbox_x1,
            bbox_y1,
            bbox_x2,
            bbox_y2,
            processing_time_ms,
            ai_model_version,
            raw_detection_data,
            is_verified,
            is_whitelist_match,
            is_blacklist_match,
            alert_triggered,
            vehicle_id
        ) VALUES (
            %(uuid)s, %(plate_number)s, %(raw_plate_text)s, %(camera_id)s, 
            %(location_id)s, %(detected_at)s, %(direction)s, %(confidence_score)s,
            %(ocr_confidence)s, %(detection_confidence)s, %(cropped_plate_image_path)s,
            %(detected_vehicle_type)s, %(bbox_x1)s, %(bbox_y1)s, %(bbox_x2)s, %(bbox_y2)s,
            %(processing_time_ms)s, %(ai_model_version)s, %(raw_detection_data)s,
            %(is_verified)s, %(is_whitelist_match)s, %(is_blacklist_match)s, %(alert_triggered)s,
            %(vehicle_id)s
        )
        """
        
        # Generate UUID
        detection_uuid = str(uuid.uuid4())
        
        # Validate and sanitize detection_data
        try:
            validated_data = {
                'uuid': detection_uuid,
                'plate_number': str(detection_data.get('plate_number', ''))[:50],  # Limit length
                'raw_plate_text': str(detection_data.get('raw_plate_text', detection_data.get('plate_number', '')))[:255],
                'camera_id': int(detection_data.get('camera_id', 1)),
                'location_id': int(detection_data.get('location_id', 1)),
                'detected_at': datetime.fromtimestamp(float(detection_data.get('detected_at', time.time()))),
                'direction': str(detection_data.get('direction', 'unknown'))[:50],
                'confidence_score': max(0.0, min(1.0, float(detection_data.get('confidence_score', 0.8)))),
                'ocr_confidence': max(0.0, min(1.0, float(detection_data.get('ocr_confidence', 0.0)))),
                'detection_confidence': max(0.0, min(1.0, float(detection_data.get('detection_confidence', 0.8)))),
                'cropped_plate_image_path': str(detection_data.get('cropped_plate_image_path', ''))[:255],
                'detected_vehicle_type': str(detection_data.get('detected_vehicle_type', 'car'))[:50],
                'bbox_x1': int(detection_data.get('bbox_x1', 0)),
                'bbox_y1': int(detection_data.get('bbox_y1', 0)),
                'bbox_x2': int(detection_data.get('bbox_x2', 0)),
                'bbox_y2': int(detection_data.get('bbox_y2', 0)),
                'processing_time_ms': int(detection_data.get('processing_time_ms', 0)),
                'ai_model_version': str(detection_data.get('ai_model_version', 'yolov11-deepsort-v1.0'))[:100],
                'raw_detection_data': str(detection_data.get('raw_detection_data', '{}'))[:1000],  # Limit JSON size
                'is_verified': bool(detection_data.get('is_verified', False)),
                'is_whitelist_match': bool(detection_data.get('is_whitelist_match', False)),
                'is_blacklist_match': bool(detection_data.get('is_blacklist_match', False)),
                'alert_triggered': bool(detection_data.get('alert_triggered', False)),
                'vehicle_id': None  # KhÃ´ng lÆ°u track_id vÃ o vehicle_id vÃ¬ cÃ³ foreign key constraint
            }
        except (ValueError, TypeError) as validation_error:
            logger.error(f"âŒ Data validation error: {validation_error}")
            if 'connection' in locals():
                try:
                    connection.close()
                except:
                    pass
            return False
        
        # Log để debug
        logger.info(f"Saving with vehicle_id: {validated_data['vehicle_id']}")
        logger.debug(f"Full detection data: {validated_data}")
        
        cursor.execute(query, validated_data)
        connection.commit()
        
        detection_id = cursor.lastrowid
        cursor.close()
        connection.close()
        
        logger.info(f"Detection saved to database with ID: {detection_id}")
        return detection_id
        
    except mysql.connector.Error as db_error:
        logger.error(f"Database error saving detection: {db_error}")
        if 'connection' in locals():
            try:
                connection.close()
            except:
                pass
        return False
    except Exception as e:
        logger.error(f"General error saving detection to database: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        if 'connection' in locals():
            try:
                connection.close()
            except:
                pass
        return False
# Health check endpoint
@app.route('/health')
def health():
    return jsonify({
        'status': 'healthy',
        'timestamp': time.time(),
        'message': 'License plate detection server is running',
        'models_loaded': True
    })

@app.route('/')
def home():
    return jsonify({"message": "License Plate Recognition WebSocket Server", "status": "running"})

@app.route('/ws-test')
def ws_test():
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>WebSocket Test</title>
    </head>
    <body>
        <h1>WebSocket Test</h1>
        <div id="status">Connecting...</div>
        <div id="messages"></div>
        <script>
            const ws = new WebSocket('ws://127.0.0.1:5002/recognize-ws');
            
            ws.onopen = function() {
                document.getElementById('status').textContent = 'Connected!';
            };
            
            ws.onmessage = function(event) {
                const messages = document.getElementById('messages');
                messages.innerHTML += '<p>' + event.data + '</p>';
            };
            
            ws.onerror = function(error) {
                document.getElementById('status').textContent = 'Error: ' + error;
            };
            
            ws.onclose = function() {
                document.getElementById('status').textContent = 'Disconnected';
            };
        </script>
    </body>
    </html>
    """

# API endpoint Ä‘á»ƒ start camera stream
@app.route('/api/cameras/<camera_id>/stream/start', methods=['POST'])
def start_camera_stream(camera_id):
    try:
        logger.info(f"Starting stream for camera: {camera_id}")
        
        # á»ž Ä‘Ã¢y báº¡n cÃ³ thá»ƒ thÃªm logic Ä‘á»ƒ start stream cho camera cá»¥ thá»ƒ
        # VÃ­ dá»¥: khá»Ÿi táº¡o HLS stream, RTSP stream, etc.
        
        # Mock response - trong thá»±c táº¿ sáº½ cáº§n implement logic start stream
        response = {
            "success": True,
            "message": f"Stream started for camera {camera_id}",
            "camera_id": camera_id,
            "stream_url": f"/streams/{camera_id}/stream.m3u8"
        }
        
        logger.info(f"Stream started successfully for camera {camera_id}")
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Error starting stream for camera {camera_id}: {e}")
        return jsonify({
            "success": False,
            "message": f"Failed to start stream: {str(e)}"
        }), 500

# API endpoint Ä‘á»ƒ stop camera stream
@app.route('/api/cameras/<camera_id>/stream/stop', methods=['POST'])
def stop_camera_stream(camera_id):
    try:
        logger.info(f"Stopping stream for camera: {camera_id}")
        
        # Mock response - trong thá»±c táº¿ sáº½ cáº§n implement logic stop stream
        response = {
            "success": True,
            "message": f"Stream stopped for camera {camera_id}",
            "camera_id": camera_id
        }
        
        logger.info(f"Stream stopped successfully for camera {camera_id}")
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Error stopping stream for camera {camera_id}: {e}")
        return jsonify({
            "success": False,
            "message": f"Failed to stop stream: {str(e)}"
        }), 500



# API endpoint Ä‘á»ƒ láº¥y danh sÃ¡ch cameras
@app.route('/api/cameras', methods=['GET'])
def get_cameras():
    try:
        # Mock data cho cameras - trong thá»±c táº¿ sáº½ láº¥y tá»« database
        cameras = [
            {
                'id': 1,
                'name': 'Camera 1 - Cá»•ng chÃ­nh',
                'location': 'Cá»•ng chÃ­nh',
                'status': 'active',
                'ip_address': '192.168.1.100',
                'rtsp_url': 'rtsp://192.168.1.100:554/stream1'
            },
            {
                'id': 2,
                'name': 'Camera 2 - BÃ£i xe',
                'location': 'BÃ£i xe',
                'status': 'active',
                'ip_address': '192.168.1.101',
                'rtsp_url': 'rtsp://192.168.1.101:554/stream1'
            },
            {
                'id': 3,
                'name': 'Camera 3 - HÃ nh lang',
                'location': 'HÃ nh lang',
                'status': 'inactive',
                'ip_address': '192.168.1.102',
                'rtsp_url': 'rtsp://192.168.1.102:554/stream1'
            }
        ]
        
        return jsonify({
            'success': True,
            'message': 'Láº¥y danh sÃ¡ch cameras thÃ nh cÃ´ng',
            'data': cameras
        })
        
    except Exception as e:
        logger.error(f"Error getting cameras: {e}")
        return jsonify({
            'success': False,
            'message': f'Lá»—i khi láº¥y danh sÃ¡ch cameras: {str(e)}'
        }), 500

# API endpoint Ä‘á»ƒ láº¥y danh sÃ¡ch locations
@app.route('/api/location', methods=['GET'])
def get_locations():
    try:
        # Mock data cho locations - trong thá»±c táº¿ sáº½ láº¥y tá»« database
        locations = [
            {
                'id': 1,
                'name': 'Cá»•ng chÃ­nh',
                'address': '123 ÄÆ°á»ng ABC, Quáº­n 1, TP.HCM',
                'description': 'Cá»•ng chÃ­nh vÃ o tÃ²a nhÃ ',
                'status': 'active'
            },
            {
                'id': 2,
                'name': 'BÃ£i xe',
                'address': '123 ÄÆ°á»ng ABC, Quáº­n 1, TP.HCM',
                'description': 'BÃ£i xe ngáº§m',
                'status': 'active'
            },
            {
                'id': 3,
                'name': 'HÃ nh lang',
                'address': '123 ÄÆ°á»ng ABC, Quáº­n 1, TP.HCM',
                'description': 'HÃ nh lang táº§ng trá»‡t',
                'status': 'active'
            }
        ]
        
        return jsonify({
            'success': True,
            'message': 'Láº¥y danh sÃ¡ch locations thÃ nh cÃ´ng',
            'data': locations
        })
        
    except Exception as e:
        logger.error(f"Error getting locations: {e}")
        return jsonify({
            'success': False,
            'message': f'Lá»—i khi láº¥y danh sÃ¡ch locations: {str(e)}'
        }), 500

# API endpoint Ä‘á»ƒ láº¥y danh sÃ¡ch cÃ¡c biá»ƒn sá»‘ Ä‘Ã£ phÃ¡t hiá»‡n vá»›i phÃ¢n trang
@app.route('/api/detected-plates', methods=['GET'])
def get_detected_plates():
    try:
        # Láº¥y tham sá»‘ phÃ¢n trang tá»« query string
        page = request.args.get('page', 1, type=int)
        limit = request.args.get('limit', 50, type=int)
        plate_number = request.args.get('plate_number', '')
        sort_by = request.args.get('sort_by', 'first_seen')
        sort_order = request.args.get('sort_order', 'DESC')
        
        # Validate vÃ  parse tham sá»‘ phÃ¢n trang
        page = max(1, page)
        limit = min(100, max(1, limit))  # Giá»›i háº¡n tá»‘i Ä‘a 100 items per page
        offset = (page - 1) * limit
        
        # No more tracking - return empty list
        plates_list = []
        
        # Lá»c theo plate_number náº¿u cÃ³
        if plate_number:
            plates_list = [plate for plate in plates_list 
                         if plate.get('plate_number', '').lower().find(plate_number.lower()) != -1]
        
        # Sáº¯p xáº¿p
        reverse_sort = sort_order.upper() == 'DESC'
        if sort_by == 'first_seen':
            plates_list.sort(key=lambda x: x.get('first_seen', 0), reverse=reverse_sort)
        elif sort_by == 'plate_number':
            plates_list.sort(key=lambda x: x.get('plate_number', ''), reverse=reverse_sort)
        elif sort_by == 'last_seen':
            plates_list.sort(key=lambda x: x.get('last_seen', 0), reverse=reverse_sort)
        else:
            plates_list.sort(key=lambda x: x.get('first_seen', 0), reverse=True)
        
        # TÃ­nh toÃ¡n phÃ¢n trang
        total = len(plates_list)
        total_pages = (total + limit - 1) // limit
        
        # Cáº¯t danh sÃ¡ch theo trang
        start_idx = offset
        end_idx = min(start_idx + limit, total)
        paginated_plates = plates_list[start_idx:end_idx]
        
        # Chuyá»ƒn Ä‘á»•i dá»¯ liá»‡u Ä‘á»ƒ JSON serializable
        def convert_plate_data(plate):
            return {
                'id': plate.get('id', ''),
                'plate_number': plate.get('plate_number', ''),
                'confidence': plate.get('confidence', 0.0),
                'first_seen': plate.get('first_seen', 0),
                'last_seen': plate.get('last_seen', 0),
                'crop_filename': plate.get('crop_filename', ''),
                'frame_count': plate.get('frame_count', 0),
                'bbox': plate.get('bbox', []),
                'ocr_raw_text': plate.get('ocr_raw_text', ''),
                'ocr_processed_at': plate.get('ocr_processed_at', 0),
                'verification_status': plate.get('verification_status', 'pending'),
                'verified_plate_number': plate.get('verified_plate_number', ''),
                'has_crop': bool(plate.get('crop_filename')),
                'active': plate.get('active', True)
            }
        
        plates_data = [convert_plate_data(plate) for plate in paginated_plates]
        
        # Tráº£ vá» response vá»›i phÃ¢n trang
        response = {
            'success': True,
            'message': 'Láº¥y danh sÃ¡ch biá»ƒn sá»‘ Ä‘Ã£ phÃ¡t hiá»‡n thÃ nh cÃ´ng',
            'data': plates_data,
            'pagination': {
                'current_page': page,
                'per_page': limit,
                'total': total,
                'total_pages': total_pages,
                'has_next': page < total_pages,
                'has_prev': page > 1
            },
            'filters_applied': {
                'plate_number': plate_number if plate_number else None,
                'sort_by': sort_by,
                'sort_order': sort_order
            }
        }
        
        logger.info(f"API get_detected_plates: returned {len(plates_data)} plates from page {page}/{total_pages}")
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Error getting detected plates: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'message': f'Lá»—i khi láº¥y danh sÃ¡ch biá»ƒn sá»‘: {str(e)}'
        }), 500

# API endpoint Ä‘á»ƒ láº¥y thá»‘ng kÃª cÃ¡c biá»ƒn sá»‘ Ä‘Ã£ phÃ¡t hiá»‡n
@app.route('/api/detection-results/statistics', methods=['GET'])
def get_detection_statistics():
    try:
        connection = get_db_connection()
        if not connection:
            return jsonify({
                'success': False,
                'message': 'Database connection failed'
            }), 500
        
        cursor = connection.cursor(dictionary=True)
        
        # Thá»‘ng kÃª tá»•ng quan
        stats_query = """
        SELECT 
            COUNT(*) as total_detections,
            COUNT(CASE WHEN is_verified = 1 THEN 1 END) as verified_count,
            COUNT(CASE WHEN is_whitelist_match = 1 THEN 1 END) as whitelist_count,
            COUNT(CASE WHEN is_blacklist_match = 1 THEN 1 END) as blacklist_count,
            COUNT(CASE WHEN alert_triggered = 1 THEN 1 END) as alert_count,
            AVG(confidence_score) as avg_confidence,
            COUNT(CASE WHEN detected_at >= CURDATE() THEN 1 END) as today_count,
            COUNT(CASE WHEN detected_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as week_count
        FROM license_plate_detections
        """
        
        cursor.execute(stats_query)
        stats = cursor.fetchone()
        
        # Thá»‘ng kÃª theo camera
        camera_stats_query = """
        SELECT 
            c.name as camera_name,
            lpd.camera_id,
            COUNT(*) as detection_count,
            COUNT(CASE WHEN lpd.detected_at >= CURDATE() THEN 1 END) as today_count
        FROM license_plate_detections lpd
        LEFT JOIN cameras c ON lpd.camera_id = c.id
        GROUP BY lpd.camera_id, c.name
        ORDER BY detection_count DESC
        LIMIT 10
        """
        
        cursor.execute(camera_stats_query)
        camera_stats = cursor.fetchall()
        
        cursor.close()
        connection.close()
        
        return jsonify({
            'success': True,
            'data': {
                'overview': stats,
                'by_camera': camera_stats
            }
        })
        
    except Exception as e:
        logger.error(f"Error getting statistics: {e}")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500
# API endpoint Ä‘á»ƒ tÃ¬m kiáº¿m biá»ƒn sá»‘ Ä‘Ã£ phÃ¡t hiá»‡n
@app.route('/api/detected-plates/search', methods=['GET'])
def search_detected_plates():
    try:
        query = request.args.get('q', '')
        if not query:
            return jsonify({
                'success': False,
                'message': 'Tham sá»‘ tÃ¬m kiáº¿m khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng'
            }), 400
        
        from detector_fixed import tracked_objects
        plates_list = []
        for obj_id, obj in tracked_objects.items():
            if 'plate_number' in obj and obj['plate_number'] != 'Äang nháº­n diá»‡n...':
                plates_list.append({
                    'id': obj_id,
                    'plate_number': obj['plate_number'],
                    'confidence': obj.get('confidence', 0),
                    'bbox': obj.get('bbox', []),
                    'first_seen': obj.get('first_seen', time.time()),
                    'last_seen': obj.get('last_seen', time.time()),
                    'crop_filename': obj.get('crop_filename', ''),
                    'frame_count': 0,
                    'ocr_raw_text': obj.get('plate_number', ''),
                    'ocr_processed_at': obj.get('last_seen', time.time()),
                    'verification_status': 'pending',
                    'verified_plate_number': '',
                    'has_crop': bool(obj.get('crop_filename')),
                    'active': True
                })
        
        # TÃ¬m kiáº¿m theo plate_number hoáº·c ocr_raw_text
        search_results = []
        query_lower = query.lower()
        
        for plate in plates_list:
            plate_number = plate.get('plate_number', '').lower()
            ocr_text = plate.get('ocr_raw_text', '').lower()
            
            if (query_lower in plate_number or 
                query_lower in ocr_text or
                any(query_lower in str(value).lower() for value in plate.values())):
                
                search_results.append({
                    'id': plate.get('id', ''),
                    'plate_number': plate.get('plate_number', ''),
                    'confidence': plate.get('confidence', 0.0),
                    'first_seen': plate.get('first_seen', 0),
                    'crop_filename': plate.get('crop_filename', ''),
                    'verification_status': plate.get('verification_status', 'pending'),
                    'has_crop': bool(plate.get('crop_filename'))
                })
        
        response = {
            'success': True,
            'message': f'TÃ¬m kiáº¿m thÃ nh cÃ´ng vá»›i tá»« khÃ³a: {query}',
            'data': search_results,
            'total_results': len(search_results),
            'query': query
        }
        
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Error searching detected plates: {e}")
        return jsonify({
            'success': False,
            'message': f'Lá»—i khi tÃ¬m kiáº¿m: {str(e)}'
        }), 500

# API endpoint Ä‘á»ƒ xÃ³a biá»ƒn sá»‘ Ä‘Ã£ phÃ¡t hiá»‡n
@app.route('/api/detected-plates/delete/<plate_id>', methods=['DELETE'])
def delete_detected_plate(plate_id):
    try:
        from detector_fixed import tracked_objects
        try:
            plates_list = list(tracked_objects.keys())
        except:
            try:
                from detector import tracked_objects
                plates_list = list(tracked_objects.keys())
            except:
                plates_list = []
        
        if plate_id in tracked_objects:
            # XÃ³a biá»ƒn sá»‘ khá»i tracked_objects
            plate_data = tracked_objects[plate_id]
            del tracked_objects[plate_id]
            
            # XÃ³a file áº£nh náº¿u cÃ³
            crop_filename = plate_data.get('crop_filename')
            if crop_filename:
                try:
                    crop_path = os.path.join(current_dir, 'static', 'crops', crop_filename)
                    if os.path.exists(crop_path):
                        os.remove(crop_path)
                except Exception as e:
                    logger.warning(f"Could not delete crop file {crop_filename}: {e}")
            
            logger.info(f"Deleted detected plate: {plate_id}")
            return jsonify({
                'success': True,
                'message': f'ÄÃ£ xÃ³a biá»ƒn sá»‘ {plate_id} thÃ nh cÃ´ng'
            })
        else:
            return jsonify({
                'success': False,
                'message': f'KhÃ´ng tÃ¬m tháº¥y biá»ƒn sá»‘ {plate_id}'
            }), 404
            
    except Exception as e:
        logger.error(f"Error deleting detected plate {plate_id}: {e}")
        return jsonify({
            'success': False,
            'message': f'Lá»—i khi xÃ³a biá»ƒn sá»‘: {str(e)}'
        }), 500

# Clear detected plates/state for UI convenience
@app.route('/clear-detected-plates', methods=['POST'])
def clear_detected_plates():
    try:
        from detector_enhanced import tracked_objects
        tracked_objects.clear()
        return jsonify({"status": "cleared"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# API endpoints Ä‘á»ƒ láº¥y káº¿t quáº£ nháº­n diá»‡n tá»« database
@app.route('/api/detections', methods=['GET'])
def get_detections():
    """Láº¥y danh sÃ¡ch káº¿t quáº£ nháº­n diá»‡n tá»« database"""
    try:
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = connection.cursor(dictionary=True)
        
        # Láº¥y danh sÃ¡ch detections má»›i nháº¥t
        query = """
        SELECT 
            id, plate_number, raw_plate_text, camera_id, location_id, 
            detected_at, direction, confidence_score, ocr_confidence, 
            detection_confidence, cropped_plate_image_path, 
            detected_vehicle_type, bbox_x1, bbox_y1, bbox_x2, bbox_y2,
            processing_time_ms, ai_model_version, is_verified,
            is_whitelist_match, is_blacklist_match, alert_triggered
        FROM license_plate_detections 
        ORDER BY detected_at DESC 
        LIMIT 100
        """
        
        cursor.execute(query)
        detections = cursor.fetchall()
        
        # Convert datetime objects to string
        for detection in detections:
            if detection['detected_at']:
                detection['detected_at'] = detection['detected_at'].isoformat()
        
        cursor.close()
        connection.close()
        
        return jsonify({
            'status': 'success',
            'count': len(detections),
            'detections': detections
        })
        
    except Exception as e:
        logger.error(f"Error fetching detections: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/detections/<int:detection_id>', methods=['GET'])
def get_detection(detection_id):
    """Láº¥y chi tiáº¿t má»™t detection cá»¥ thá»ƒ"""
    try:
        connection = get_db_connection()
        if not connection:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = connection.cursor(dictionary=True)
        
        query = """
        SELECT * FROM license_plate_detections 
        WHERE id = %s
        """
        
        cursor.execute(query, (detection_id,))
        detection = cursor.fetchone()
        
        if not detection:
            return jsonify({'error': 'Detection not found'}), 404
        
        # Convert datetime objects to string
        if detection['detected_at']:
            detection['detected_at'] = detection['detected_at'].isoformat()
        
        cursor.close()
        connection.close()
        
        return jsonify({
            'status': 'success',
            'detection': detection
        })
        
    except Exception as e:
        logger.error(f"Error fetching detection {detection_id}: {e}")
        return jsonify({'error': str(e)}), 500

# Route Ä‘á»ƒ serve áº£nh crops
@app.route('/static/crops/<filename>')
def serve_crop_image(filename):
    """Serve áº£nh crops tá»« thÆ° má»¥c static/crops"""
    try:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        crops_folder = os.path.join(current_dir, 'static', 'crops')
        return send_from_directory(crops_folder, filename)
    except Exception as e:
        logger.error(f"Error serving crop image {filename}: {e}")
        return jsonify({'error': 'Image not found'}), 404

# Route Ä‘á»ƒ serve áº£nh crops (alternative path)
@app.route('/crops/<filename>')
def serve_crop_image_alt(filename):
    """Serve áº£nh crops tá»« thÆ° má»¥c static/crops (alternative path)"""
    try:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        crops_folder = os.path.join(current_dir, 'static', 'crops')
        return send_from_directory(crops_folder, filename)
    except Exception as e:
        logger.error(f"Error serving crop image {filename}: {e}")
        return jsonify({'error': 'Image not found'}), 404

# Biáº¿n global Ä‘á»ƒ lÆ°u tráº¡ng thÃ¡i video upload
current_video_path = None
video_processing = False

# Route Ä‘á»ƒ xá»­ lÃ½ video upload vÃ  báº¯t Ä‘áº§u detection
@app.route('/upload_video', methods=['POST'])
def upload_video():
    """Upload video vÃ  báº¯t Ä‘áº§u xá»­ lÃ½ detection"""
    global current_video_path, video_processing
    
    try:
        logger.info("Received video upload request")
        
        if 'video' not in request.files:
            return jsonify({
                "success": False,
                "message": "No video file provided"
            }), 400
        
        video_file = request.files['video']
        
        if video_file.filename == '':
            return jsonify({
                "success": False,
                "message": "No video file selected"
            }), 400
        
        # LÆ°u file video
        upload_dir = os.path.join(current_dir, 'static', 'uploads')
        os.makedirs(upload_dir, exist_ok=True)
        
        filename = f"upload_{int(time.time())}_{video_file.filename}"
        filepath = os.path.join(upload_dir, filename)
        video_file.save(filepath)
        
        # Cáº­p nháº­t biáº¿n global
        current_video_path = filepath
        video_processing = True
        
        logger.info(f"Video uploaded successfully: {filepath}")
        
        return jsonify({
            "success": True,
            "message": "Video uploaded and processing started",
            "filename": filename,
            "timestamp": int(time.time())
        })
        
    except Exception as e:
        logger.error(f"Error uploading video: {e}")
        return jsonify({
            "success": False,
            "message": f"Failed to upload video: {str(e)}"
        }), 500

# Route Ä‘á»ƒ hiá»ƒn thá»‹ video feed vá»›i detection
@app.route('/video_feed')
def video_feed():
    """Hiá»ƒn thá»‹ video vá»›i detection overlay"""
    global current_video_path, video_processing
    
    # Láº¥y tham sá»‘ frame vÃ  timestamp tá»« query string
    frame_param = request.args.get('frame', '0')
    timestamp_param = request.args.get('timestamp', '0')
    try:
        target_frame = int(frame_param)
        target_timestamp = int(timestamp_param)
    except ValueError:
        target_frame = 0
        target_timestamp = 0
    
    try:
        if not current_video_path or not os.path.exists(current_video_path):
            # Tráº£ vá» áº£nh placeholder náº¿u khÃ´ng cÃ³ video
            placeholder_path = os.path.join(current_dir, 'static', 'placeholder.jpg')
            if os.path.exists(placeholder_path):
                return send_from_directory(os.path.dirname(placeholder_path), 'placeholder.jpg')
            else:
                # Táº¡o áº£nh placeholder Ä‘Æ¡n giáº£n
                import numpy as np
                img = np.ones((480, 640, 3), dtype=np.uint8) * 128
                img = cv2.putText(img, "No Video", (250, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
                _, buffer = cv2.imencode('.jpg', img)
                from flask import Response
                return Response(buffer.tobytes(), mimetype='image/jpeg')
        
        # Äá»c video vÃ  xá»­ lÃ½ frame
        cap = cv2.VideoCapture(current_video_path)
        if not cap.isOpened():
            logger.error(f"Cannot open video file: {current_video_path}")
            return jsonify({'error': 'Cannot open video file'}), 500
        
        # Láº¥y frame theo tham sá»‘ hoáº·c frame tiáº¿p theo
        if target_frame > 0:
            cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
        
        ret, frame = cap.read()
        if not ret:
            # Náº¿u Ä‘á»c háº¿t video, quay láº¡i Ä‘áº§u
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = cap.read()
            if not ret:
                logger.error("Cannot read frame from video")
                cap.release()
                return jsonify({'error': 'Cannot read frame'}), 500
        
        # Láº¥y thÃ´ng tin video
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        current_frame = int(cap.get(cv2.CAP_PROP_POS_FRAMES))
        fps = cap.get(cv2.CAP_PROP_FPS)
        
        # TÃ­nh thá»i gian hiá»‡n táº¡i cá»§a video
        current_time = current_frame / fps if fps > 0 else 0
        total_time = total_frames / fps if fps > 0 else 0
        
        # Xá»­ lÃ½ frame vá»›i detection
        if video_processing:
            logger.info(f"Processing detection for frame {current_frame}")
            try:
                if detect_and_ocr_simplified is not None:
                    result = detect_and_ocr_simplified(frame)
                else:
                    logger.error("detect_and_ocr_simplified is not available")
                    result = None
                if result and result.get('frame'):
                    logger.info(f"Detection successful for frame {current_frame}")
                    cap.release()
                    from flask import Response
                    return Response(result['frame'], mimetype='image/jpeg')
                else:
                    logger.warning(f"Detection result is empty for frame {current_frame}")
                    # Náº¿u detection tráº£ vá» empty, váº½ ROI máº·c Ä‘á»‹nh
                    display_frame = frame.copy()
                    # Váº½ ROI máº·c Ä‘á»‹nh
                    height, width = frame.shape[:2]
                    roi_x1, roi_y1 = int(width * 0.1), int(height * 0.2)
                    roi_x2, roi_y2 = int(width * 0.9), int(height * 0.8)
                    cv2.rectangle(display_frame, (roi_x1, roi_y1), (roi_x2, roi_y2), (0, 255, 255), 2)
                    cv2.putText(display_frame, "ROI", (roi_x1 + 10, roi_y1 - 10), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
                    cv2.putText(display_frame, "Detection Active", (50, 50), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
                    logger.info(f"Using empty detection fallback ROI for frame {current_frame}")
                    _, buffer = cv2.imencode('.jpg', display_frame)
                    cap.release()
                    from flask import Response
                    return Response(buffer.tobytes(), mimetype='image/jpeg')
            except Exception as e:
                logger.warning(f"Detection failed for frame {current_frame}: {e}")
                # Fallback: váº½ ROI máº·c Ä‘á»‹nh
                display_frame = frame.copy()
                height, width = frame.shape[:2]
                roi_x1, roi_y1 = int(width * 0.1), int(height * 0.2)
                roi_x2, roi_y2 = int(width * 0.9), int(height * 0.8)
                cv2.rectangle(display_frame, (roi_x1, roi_y1), (roi_x2, roi_y2), (0, 255, 255), 2)
                cv2.putText(display_frame, "ROI", (roi_x1 + 10, roi_y1 - 10), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
                cv2.putText(display_frame, "Detection Active", (50, 50), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
                logger.info(f"Using fallback ROI for frame {current_frame}")
                _, buffer = cv2.imencode('.jpg', display_frame)
                cap.release()
                from flask import Response
                return Response(buffer.tobytes(), mimetype='image/jpeg')
        
        # Náº¿u khÃ´ng cÃ³ detection, váº½ thÃ´ng tin cÆ¡ báº£n lÃªn frame
        if not video_processing:
            # Váº½ text "Video Ready - Click 'Nháº­n diá»‡n' to start"
            cv2.putText(frame, "Video Ready - Click 'Nhan dien' to start", (50, 50), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
            cv2.putText(frame, f"Video: {os.path.basename(current_video_path)}", (50, 100), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            cv2.putText(frame, f"Frame: {current_frame}/{total_frames} | FPS: {fps:.1f}", (50, 150), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            cv2.putText(frame, f"Time: {current_time:.1f}s/{total_time:.1f}s", (50, 200), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        
        # Tráº£ vá» frame gá»‘c náº¿u khÃ´ng cÃ³ detection
        _, buffer = cv2.imencode('.jpg', frame)
        cap.release()
        
        from flask import Response
        return Response(buffer.tobytes(), mimetype='image/jpeg')
        
    except Exception as e:
        logger.error(f"Error in video_feed: {e}")
        return jsonify({'error': str(e)}), 500

# Route Ä‘á»ƒ báº¯t Ä‘áº§u/dá»«ng xá»­ lÃ½ video
@app.route('/process_video', methods=['POST'])
def process_video():
    """Báº¯t Ä‘áº§u hoáº·c dá»«ng xá»­ lÃ½ video"""
    global video_processing
    
    try:
        data = request.get_json()
        action = data.get('action', 'start')
        
        if action == 'start':
            video_processing = True
            message = "Video processing started"
        elif action == 'stop':
            video_processing = False
            message = "Video processing stopped"
        else:
            return jsonify({
                "success": False,
                "message": "Invalid action"
            }), 400
        
        logger.info(f"Video processing {action}ed")
        
        return jsonify({
            "success": True,
            "message": message,
            "processing": video_processing
        })
        
    except Exception as e:
        logger.error(f"Error processing video: {e}")
        return jsonify({
            "success": False,
            "message": f"Failed to process video: {str(e)}"
        }), 500

# Route Ä‘á»ƒ láº¥y tráº¡ng thÃ¡i xá»­ lÃ½ video
@app.route('/video_status', methods=['GET'])
def video_status():
    """Láº¥y tráº¡ng thÃ¡i xá»­ lÃ½ video"""
    global current_video_path, video_processing
    
    return jsonify({
        "success": True,
        "has_video": bool(current_video_path and os.path.exists(current_video_path)),
        "video_path": current_video_path,
        "processing": video_processing
    })

# Route Ä‘á»ƒ tÆ°Æ¡ng thÃ­ch vá»›i code cÅ©
@app.route('/process_plates', methods=['POST'])
def process_plates():
    """API Ä‘á»ƒ xá»­ lÃ½ biá»ƒn sá»‘ - tÆ°Æ¡ng thÃ­ch vá»›i code cÅ©"""
    global video_processing
    
    try:
        # Báº¯t Ä‘áº§u xá»­ lÃ½ video
        video_processing = True
        
        logger.info("Plate processing started")
        
        return jsonify({
            "success": True,
            "message": "Plate processing started"
        })
        
    except Exception as e:
        logger.error(f"Error processing plates: {e}")
        return jsonify({
            "success": False,
            "message": f"Failed to process plates: {str(e)}"
        }), 500

# Route Ä‘á»ƒ stream video theo thá»i gian thá»±c
@app.route('/video_stream')
def video_stream():
    """Stream video theo thá»i gian thá»±c vá»›i detection"""
    global current_video_path, video_processing
    
    def generate_frames():
        if not current_video_path or not os.path.exists(current_video_path):
            return
        
        cap = cv2.VideoCapture(current_video_path)
        if not cap.isOpened():
            return
        
        frame_count = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                # Không quay lại đầu video - dừng stream
                logger.info("Video ended - stopping stream")
                break
            
            frame_count += 1
            
            # Xử lý detection khi video_processing = True
            detection_result = None
            if video_processing:
                try:
                    from detector_fixed import detect_and_ocr_simplified as detect_and_ocr
                    # Pass video_processing flag to detector
                    detection_result = detect_and_ocr(frame, video_processing=True)
                    if detection_result:
                        logger.info(f"Detection successful for frame {frame_count}")
                        
                        # Lưu kết quả detection vào database nếu có biển số xe
                        try:
                            tracked_objects = detection_result.get('tracked_objects', {})
                            ocr_results = detection_result.get('ocr_results', [])
                            
                            if tracked_objects:
                                logger.info(f"Found {len(tracked_objects)} tracked objects")
                                for track_id, obj in tracked_objects.items():
                                    plate_number = obj.get('plate_number')
                                    confidence = obj.get('confidence', 0.0)
                                    bbox = obj.get('bbox', [0, 0, 0, 0])
                                    crop_filename = obj.get('crop_filename', '')
                                    
                                    logger.info(f"Track {track_id}: plate='{plate_number}', conf={confidence:.3f}, bbox={bbox}")
                                    
                                    if plate_number and plate_number != 'Đang nhận diện...' and len(bbox) >= 4:
                                        # Kiểm tra xem biển số này đã được lưu chưa
                                        if not hasattr(video_stream, 'saved_plates'):
                                            video_stream.saved_plates = set()
                                        
                                        if plate_number not in video_stream.saved_plates:
                                            # Lưu vào database
                                            db_detection = {
                                                'plate_number': str(plate_number)[:50],
                                                'raw_plate_text': str(plate_number)[:255],
                                                'camera_id': 1,
                                                'location_id': 1,
                                                'detected_at': float(time.time()),
                                                'direction': 'unknown',
                                                'confidence_score': max(0.0, min(1.0, float(confidence))),
                                                'ocr_confidence': max(0.0, min(1.0, float(confidence))),
                                                'detection_confidence': max(0.0, min(1.0, float(confidence))),
                                                'cropped_plate_image_path': str(crop_filename)[:255],
                                                'detected_vehicle_type': 'car',
                                                'bbox_x1': bbox[0],
                                                'bbox_y1': bbox[1],
                                                'bbox_x2': bbox[2],
                                                'bbox_y2': bbox[3],
                                                'processing_time_ms': 0,
                                                'ai_model_version': 'yolov8n-deepsort-v1.0',
                                                'raw_detection_data': json.dumps({
                                                    'track_id': track_id,
                                                    'first_seen': obj.get('first_seen', time.time()),
                                                    'last_seen': obj.get('last_seen', time.time()),
                                                    'plate_number': plate_number,
                                                    'confidence': confidence
                                                })[:1000],
                                                'is_verified': False,
                                                'is_whitelist_match': False,
                                                'is_blacklist_match': False,
                                                'alert_triggered': False,
                                                'vehicle_id': None
                                            }
                                            
                                            try:
                                                result_id = save_detection_to_db(db_detection)
                                                if result_id:
                                                    video_stream.saved_plates.add(plate_number)
                                                    logger.info(f"✅ Video stream: Saved plate '{plate_number}' to database (DB ID: {result_id})")
                                                else:
                                                    logger.warning(f"❌ Video stream: Failed to save plate '{plate_number}' to database")
                                            except Exception as db_error:
                                                logger.error(f"❌ Video stream: Database error saving plate '{plate_number}': {db_error}")
                            else:
                                logger.debug(f"No tracked objects in detection result")
                                
                        except Exception as save_error:
                            logger.warning(f"Error saving detection to database in video stream: {save_error}")
                    else:
                        logger.warning(f"Detection returned None for frame {frame_count}")
                except Exception as e:
                    logger.warning(f"Detection failed: {e}")
                    import traceback
                    logger.error(f"Detection traceback: {traceback.format_exc()}")
            
            # Nếu có detection active, vẽ ROI và kết quả
            if video_processing:
                if detection_result and detection_result.get('frame'):
                    # Sử dụng frame đã được xử lý bởi detector
                    frame = detection_result['frame']
                    logger.info(f"Using detection result for frame {frame_count}")
                else:
                    # Vẽ ROI mặc định nếu không có detection
                    display_frame = frame.copy()
                    height, width = frame.shape[:2]
                    roi_x1, roi_y1 = int(width * 0.1), int(height * 0.2)
                    roi_x2, roi_y2 = int(width * 0.9), int(height * 0.8)
                    cv2.rectangle(display_frame, (roi_x1, roi_y1), (roi_x2, roi_y2), (0, 255, 255), 2)
                    cv2.putText(display_frame, "ROI", (roi_x1 + 10, roi_y1 - 10), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
                    cv2.putText(display_frame, "Detection Active", (50, 50), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
                    
                    # Vẽ thông tin video
                    cv2.putText(display_frame, f"FPS: {10.0:.1f}", (width - 150, 30), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                    cv2.putText(display_frame, f"Frame: {frame_count}", (width - 150, 60), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                    
                    frame = display_frame
                    logger.info(f"Using default ROI for frame {frame_count}")
            else:
                # Nếu không có detection, vẽ thông tin cơ bản
                display_frame = frame.copy()
                height, width = frame.shape[:2]
                cv2.putText(display_frame, "Video Ready - Click 'Nhan dien' to start", (50, 50), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
                cv2.putText(display_frame, f"Video: {os.path.basename(current_video_path)}", (50, 100), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                cv2.putText(display_frame, f"FPS: {10.0:.1f}", (width - 150, 30), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                frame = display_frame
            
            # Encode frame
            try:
                _, buffer = cv2.imencode('.jpg', frame)
                frame_bytes = buffer.tobytes()
                
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
            except Exception as e:
                logger.error(f"Frame encoding failed: {e}")
                # Fallback: encode frame gốc
                _, buffer = cv2.imencode('.jpg', frame)
                frame_bytes = buffer.tobytes()
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
            
            # Delay để giảm tốc độ
            import time
            time.sleep(0.1)  # 10 FPS
        
        cap.release()
    
    return Response(generate_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

# Test route để kiểm tra detection system
@app.route('/test_detection')
def test_detection():
    """Test detection system với test frame"""
    try:
        # Tạo test frame
        test_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        
        # Vẽ một số hình dạng để test
        cv2.rectangle(test_frame, (100, 100), (300, 200), (0, 255, 0), 2)  # Xe
        cv2.rectangle(test_frame, (120, 120), (280, 180), (255, 0, 0), 2)  # Biển số
        cv2.putText(test_frame, "TEST PLATE", (130, 160), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        cv2.putText(test_frame, "Testing Detection System", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
        
        # Test detection
        logger.info("Testing detection system with test frame...")
        result = detect_and_ocr(test_frame)
        
        if result:
            logger.info("✅ Detection test successful!")
            logger.info(f"Result keys: {list(result.keys())}")
            logger.info(f"Boxes: {len(result.get('boxes', []))}")
            logger.info(f"Labels: {len(result.get('labels', []))}")
            logger.info(f"Tracked objects: {len(result.get('tracked_objects', {}))}")
            
            # Encode test frame
            _, buffer = cv2.imencode('.jpg', test_frame)
            test_frame_bytes = buffer.tobytes()
            
            return jsonify({
                'success': True,
                'message': 'Detection test successful',
                'result_summary': {
                    'boxes_count': len(result.get('boxes', [])),
                    'labels_count': len(result.get('labels', [])),
                    'tracked_objects_count': len(result.get('tracked_objects', {})),
                    'ocr_results_count': len(result.get('ocr_results', []))
                },
                'frame_size': len(test_frame_bytes)
            })
        else:
            logger.error("❌ Detection test failed!")
            return jsonify({
                'success': False,
                'message': 'Detection test failed - no result returned'
            }), 500
            
    except Exception as e:
        logger.error(f"Test detection error: {e}")
        import traceback
        logger.error(f"Test detection traceback: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'message': f'Test detection error: {str(e)}'
        }), 500

# Test route để kiểm tra tracked_objects
@app.route('/test_tracked_objects')
def test_tracked_objects():
    """Test tracked_objects system"""
    try:
        from detector_fixed import get_tracked_objects, get_detection_stats
        
        # Lấy thông tin tracked objects
        tracked_objects = get_tracked_objects()
        detection_stats = get_detection_stats()
        
        logger.info(f"Tracked objects test: {len(tracked_objects)} objects")
        logger.info(f"Detection stats: {detection_stats}")
        
        return jsonify({
            'success': True,
            'tracked_objects_count': len(tracked_objects),
            'tracked_objects': tracked_objects,
            'detection_stats': detection_stats
        })
        
    except Exception as e:
        logger.error(f"Test tracked_objects error: {e}")
        import traceback
        logger.error(f"Test tracked_objects traceback: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'message': f'Test tracked_objects error: {str(e)}'
        }), 500

# Test route để tạo test video stream
@app.route('/test_video_stream')
def test_video_stream():
    """Test video stream với detection system"""
    try:
        from flask import Response
        import time
        
        def generate_test_frames():
            """Generate test frames với detection"""
            frame_count = 0
            while True:
                # Tạo test frame
                test_frame = np.zeros((480, 640, 3), dtype=np.uint8)
                
                # Vẽ background
                test_frame[:] = (50, 50, 50)  # Dark gray background
                
                # Vẽ một số hình dạng để test detection
                if frame_count % 30 < 15:  # Animate every 30 frames
                    # Vẽ xe
                    cv2.rectangle(test_frame, (100, 150), (400, 300), (0, 255, 0), 2)
                    cv2.putText(test_frame, "CAR", (200, 200), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                    
                    # Vẽ biển số
                    cv2.rectangle(test_frame, (150, 200), (350, 250), (255, 0, 0), 2)
                    cv2.putText(test_frame, "30A-123.45", (160, 235), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                    
                    # Vẽ xe thứ 2
                    cv2.rectangle(test_frame, (450, 200), (600, 350), (0, 255, 255), 2)
                    cv2.putText(test_frame, "BIKE", (470, 250), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
                    
                    # Vẽ biển số xe thứ 2
                    cv2.rectangle(test_frame, (470, 220), (580, 270), (255, 255, 0), 2)
                    cv2.putText(test_frame, "51B-678.90", (475, 255), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2)
                
                # Vẽ thông tin frame
                cv2.putText(test_frame, f"Test Frame: {frame_count}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                cv2.putText(test_frame, "Detection Test Video", (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
                cv2.putText(test_frame, "Testing License Plate Recognition", (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
                
                # Vẽ ROI
                roi_x1, roi_y1 = int(640 * 0.05), int(480 * 0.3)
                roi_x2, roi_y2 = int(640 * 0.95), int(480 * 0.8)
                cv2.rectangle(test_frame, (roi_x1, roi_y1), (roi_x2, roi_y2), (0, 255, 255), 2)
                cv2.putText(test_frame, "ROI", (roi_x1 + 10, roi_y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
                
                # Chạy detection trên test frame
                try:
                    logger.info(f"Running detection on test frame {frame_count}")
                    result = detect_and_ocr(test_frame, video_processing=True)
                    
                    if result and isinstance(result, dict):
                        # Vẽ kết quả detection
                        boxes = result.get('boxes', [])
                        labels = result.get('labels', [])
                        tracked_objects = result.get('tracked_objects', {})
                        
                        logger.info(f"Frame {frame_count}: {len(boxes)} boxes, {len(labels)} labels, {len(tracked_objects)} tracked objects")
                        
                        # Vẽ thông tin detection
                        info_y = 120
                        cv2.putText(test_frame, f"Detection Results:", (10, info_y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                        cv2.putText(test_frame, f"Boxes: {len(boxes)}", (10, info_y + 25), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
                        cv2.putText(test_frame, f"Labels: {len(labels)}", (10, info_y + 50), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
                        cv2.putText(test_frame, f"Tracked: {len(tracked_objects)}", (10, info_y + 75), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
                        
                        # Vẽ các labels được detect
                        for i, label in enumerate(labels[:5]):  # Chỉ hiển thị 5 labels đầu
                            cv2.putText(test_frame, f"Label {i+1}: {label}", (10, info_y + 100 + i*25), 
                                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 2)
                    else:
                        logger.warning(f"Frame {frame_count}: Detection returned invalid result")
                        cv2.putText(test_frame, "Detection Failed", (10, info_y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
                        
                except Exception as e:
                    logger.error(f"Detection error on frame {frame_count}: {e}")
                    cv2.putText(test_frame, f"Detection Error: {str(e)[:30]}", (10, info_y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
                
                # Encode frame
                try:
                    _, buffer = cv2.imencode('.jpg', test_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                    frame_bytes = buffer.tobytes()
                    
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
                except Exception as e:
                    logger.error(f"Frame encoding failed: {e}")
                    continue
                
                frame_count += 1
                time.sleep(0.1)  # 10 FPS
        
        return Response(generate_test_frames(),
                        mimetype='multipart/x-mixed-replace; boundary=frame')
                        
    except Exception as e:
        logger.error(f"Test video stream error: {e}")
        import traceback
        logger.error(f"Test video stream traceback: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'message': f'Test video stream error: {str(e)}'
        }), 500

def start_server_safely():
    """Start server with multiple fallback options"""
    logger.info("🚀 Starting server with safe startup...")
    
    # Clear all problematic environment variables
    import os
    problematic_vars = ['WERKZEUG_SERVER_FD', 'WERKZEUG_RUN_MAIN', 'FLASK_ENV']
    for var in problematic_vars:
        if var in os.environ:
            del os.environ[var]
    
    # Method 1: Simple Flask development server
    try:
        logger.info("🔄 Method 1: Simple Flask development server...")
        app.run(debug=False, host='127.0.0.1', port=5002)
        return True
    except Exception as e:
        logger.error(f"Method 1 failed: {e}")
    
    # Method 2: Different port
    try:
        logger.info("🔄 Method 2: Different port (5003)...")
        app.run(debug=False, host='127.0.0.1', port=5003)
        return True
    except Exception as e:
        logger.error(f"Method 2 failed: {e}")
    
    # Method 3: Localhost with threading
    try:
        logger.info("🔄 Method 3: Localhost with threading...")
        app.run(debug=False, host='localhost', port=5002, threaded=True)
        return True
    except Exception as e:
        logger.error(f"Method 3 failed: {e}")
    
    # Method 4: Minimal configuration
    try:
        logger.info("🔄 Method 4: Minimal configuration...")
        app.run(debug=False, host='0.0.0.0', port=5002)
        return True
    except Exception as e:
        logger.error(f"Method 4 failed: {e}")
    
    logger.error("❌ All server startup methods failed")
    return False

if __name__ == '__main__':
    logger.info("Khởi động WebSocket server trên http://127.0.0.1:5002 ...")
    
    # Set environment variables to avoid threading issues
    import os
    os.environ['WERKZEUG_RUN_MAIN'] = 'true'
    os.environ['FLASK_ENV'] = 'production'
    # Clear problematic environment variables
    if 'WERKZEUG_SERVER_FD' in os.environ:
        del os.environ['WERKZEUG_SERVER_FD']
    
    try:
        if not start_server_safely():
            logger.error("❌ Server startup failed completely")
            sys.exit(1)
    except KeyboardInterrupt:
        logger.info("🛑 Server stopped by user")
    except Exception as e:
        logger.error(f"❌ Critical server error: {e}")
        import traceback
        logger.error(f"Critical error traceback: {traceback.format_exc()}")
        sys.exit(1)
