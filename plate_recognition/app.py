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

# ROI Configuration
ROI_PERCENT_XMIN = 0.0
ROI_PERCENT_YMIN = 0.25
ROI_PERCENT_XMAX = 1.0
ROI_PERCENT_YMAX = 0.75

current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

# Import optimized detector
try:
    from detector_simple import detect_and_ocr_simple as detect_and_ocr, calculate_roi_coordinates, is_valid_license_plate
    print("✅ Optimized License Plate Detector imported successfully")
except ImportError as e:
    print(f"❌ Error importing detector: {e}")
    sys.exit(1)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Reduce log spam
logging.getLogger('ultralytics').setLevel(logging.WARNING)
logging.getLogger('paddleocr').setLevel(logging.WARNING)

app = Flask(__name__)
CORS(app, origins=["*"])
sock = Sock(app)

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
    """Simplified database save function"""
    try:
        connection = get_db_connection()
        if not connection:
            return False
        
        cursor = connection.cursor()
        
        query = """
        INSERT INTO license_plate_detections (
            detection_uuid, plate_number, raw_plate_text, camera_id, location_id,
            detected_at, confidence_score, ocr_confidence, detected_vehicle_type,
            bbox_x1, bbox_y1, bbox_x2, bbox_y2, ai_model_version,
            is_verified, is_whitelist_match, is_blacklist_match, alert_triggered
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
        )
        """
        
        # Simplified data validation
        detection_uuid = str(uuid.uuid4())
        plate_number = str(detection_data.get('plate_number', ''))[:50]
        confidence = max(0.0, min(1.0, float(detection_data.get('confidence', 0.0))))
        bbox = detection_data.get('bbox', [0, 0, 0, 0])
        
        values = (
            detection_uuid,
            plate_number,
            plate_number,  # raw_plate_text same as plate_number
            1,  # camera_id
            1,  # location_id
            datetime.now(),
            confidence,
            confidence,  # ocr_confidence same as confidence
            'other',  # detected_vehicle_type
            int(bbox[0]) if len(bbox) > 0 else 0,
            int(bbox[1]) if len(bbox) > 1 else 0,
            int(bbox[2]) if len(bbox) > 2 else 0,
            int(bbox[3]) if len(bbox) > 3 else 0,
            'yolov9s-optimized-v1.0',
            False,  # is_verified
            False,  # is_whitelist_match
            False,  # is_blacklist_match
            False   # alert_triggered
        )
        
        cursor.execute(query, values)
        connection.commit()
        
        detection_id = cursor.lastrowid
        cursor.close()
        connection.close()
        
        logger.info(f"Saved detection to database: {plate_number} (ID: {detection_id})")
        return detection_id
        
    except Exception as e:
        logger.error(f"Database save error: {e}")
        if 'connection' in locals():
            try:
                connection.close()
            except:
                pass
        return False

# Initialize models in background
def initialize_models_background():
    try:
        from detector_simple import initialize_models
        initialize_models()
        logger.info("✅ Models initialized successfully")
    except Exception as e:
        logger.error(f"❌ Model initialization failed: {e}")

import threading
model_init_thread = threading.Thread(target=initialize_models_background, daemon=True)
model_init_thread.start()

# WebSocket endpoint - SIMPLIFIED
@sock.route('/recognize-ws')
def recognize_ws(ws):
    logger.info("WebSocket connection established")
    
    ws.send(json.dumps({
        'status': 'connected',
        'message': 'WebSocket ready for license plate detection'
    }))
    
    frame_count = 0
    last_save_time = 0
    save_interval = 2.0  # Save to DB only every 2 seconds
    
    try:
        while True:
            try:
                # Receive frame with timeout
                message = ws.receive(timeout=1.0)
                if message is None or not isinstance(message, bytes):
                    continue
                
                frame_count += 1
                current_time = time.time()
                
                # Decode frame
                nparr = np.frombuffer(message, np.uint8)
                frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                
                if frame is None:
                    continue
                
                # Process with optimized detector
                result = detect_and_ocr(frame)
                
                if not result:
                    continue
                
                # Send processed frame
                frame_data = result.get('frame')
                if frame_data:
                    ws.send(frame_data)
                
                # Save to database (throttled)
                should_save = (current_time - last_save_time) >= save_interval
                if should_save:
                    tracked_objects = result.get('tracked_objects', {})
                    for track_id, obj in tracked_objects.items():
                        plate_number = obj.get('plate_number', '')
                        confidence = obj.get('confidence', 0.0)
                        
                        # Only save high confidence valid plates
                        if plate_number and confidence > 0.7 and len(plate_number) >= 4:
                            save_detection_to_db(obj)
                            last_save_time = current_time
                            break  # Save only one per interval
                
                # Send metadata
                try:
                    metadata = {
                        'type': 'detection_result',
                        'frame_count': frame_count,
                        'timestamp': current_time,
                        'detections': len(result.get('tracked_objects', {}))
                    }
                    ws.send(json.dumps(metadata))
                except:
                    pass  # Metadata is optional
                
            except Exception as receive_err:
                if "timeout" in str(receive_err).lower():
                    continue
                if "Connection closed" in str(receive_err):
                    break
                logger.warning(f"WebSocket error: {receive_err}")
                continue
                
    except Exception as e:
        logger.error(f"WebSocket critical error: {e}")
    finally:
        logger.info("WebSocket connection closed")

# Basic API endpoints
@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'success': True,
        'message': 'Server is running',
        'timestamp': datetime.now().isoformat()
    })

@app.route('/')
def home():
    return jsonify({
        "message": "Optimized License Plate Recognition Server", 
        "status": "running"
    })

@app.route('/api/detected-plates', methods=['GET'])
def get_detected_plates():
    """Get detected plates from database"""
    try:
        connection = get_db_connection()
        if not connection:
            return jsonify({'success': False, 'message': 'Database connection failed'}), 500
        
        cursor = connection.cursor(dictionary=True)
        
        # Get recent detections
        query = """
        SELECT id, plate_number, confidence_score, detected_at, 
               bbox_x1, bbox_y1, bbox_x2, bbox_y2
        FROM license_plate_detections 
        ORDER BY detected_at DESC 
        LIMIT 50
        """
        
        cursor.execute(query)
        detections = cursor.fetchall()
        
        # Convert datetime to string
        for detection in detections:
            if detection['detected_at']:
                detection['detected_at'] = detection['detected_at'].isoformat()
        
        cursor.close()
        connection.close()
        
        return jsonify({
            'success': True,
            'data': detections,
            'total': len(detections)
        })
        
    except Exception as e:
        logger.error(f"Error getting detected plates: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

# Statistics endpoint
@app.route('/api/detection-stats', methods=['GET'])
def get_detection_stats():
    """Get detection statistics with Vietnamese plate validation info"""
    try:
        connection = get_db_connection()
        if not connection:
            return jsonify({'success': False, 'message': 'Database connection failed'}), 500
        
        cursor = connection.cursor(dictionary=True)
        
        # Get statistics
        stats_query = """
        SELECT 
            COUNT(*) as total_detections,
            COUNT(CASE WHEN cropped_plate_image_path != '' THEN 1 END) as with_crop_images,
            AVG(confidence_score) as avg_confidence,
            COUNT(CASE WHEN detected_at >= CURDATE() THEN 1 END) as today_count,
            COUNT(CASE WHEN detected_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as week_count,
            MIN(detected_at) as first_detection,
            MAX(detected_at) as last_detection
        FROM license_plate_detections
        """
        
        cursor.execute(stats_query)
        stats = cursor.fetchone()
        
        # Convert datetime to string
        if stats['first_detection']:
            stats['first_detection'] = stats['first_detection'].isoformat()
        if stats['last_detection']:
            stats['last_detection'] = stats['last_detection'].isoformat()
        
        cursor.close()
        connection.close()
        
        return jsonify({
            'success': True,
            'data': stats,
            'message': 'Detection statistics retrieved successfully'
        })
        
    except Exception as e:
        logger.error(f"Error getting detection stats: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

# Test Vietnamese plate validation endpoint
@app.route('/api/validate-plate', methods=['POST'])
def validate_plate_endpoint():
    """Test endpoint for Vietnamese plate validation"""
    try:
        data = request.get_json()
        plate_text = data.get('plate_text', '')
        
        if not plate_text:
            return jsonify({'success': False, 'message': 'No plate text provided'}), 400
        
        is_valid, confidence = validate_vietnamese_plate(plate_text)
        
        return jsonify({
            'success': True,
            'plate_text': plate_text,
            'is_valid': is_valid,
            'validation_confidence': confidence,
            'message': f"Vietnamese plate validation: {'VALID' if is_valid else 'INVALID'}"
        })
        
    except Exception as e:
        logger.error(f"Error validating plate: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500
def clear_detected_plates():
    """Clear detected plates from memory"""
    try:
        # Clear memory cache if exists
        try:
            from detector_simple import tracked_objects
            if 'tracked_objects' in globals():
                tracked_objects.clear()
        except:
            pass
        
        return jsonify({"status": "cleared"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# Video processing endpoints - SIMPLIFIED
current_video_path = None
video_processing = False

@app.route('/upload_video', methods=['POST'])
def upload_video():
    global current_video_path, video_processing
    
    try:
        if 'video' not in request.files:
            return jsonify({"success": False, "message": "No video file"}), 400
        
        video_file = request.files['video']
        if video_file.filename == '':
            return jsonify({"success": False, "message": "No file selected"}), 400
        
        # Save video
        upload_dir = os.path.join(current_dir, 'static', 'uploads')
        os.makedirs(upload_dir, exist_ok=True)
        
        filename = f"upload_{int(time.time())}_{video_file.filename}"
        filepath = os.path.join(upload_dir, filename)
        video_file.save(filepath)
        
        current_video_path = filepath
        video_processing = False  # Start paused
        
        return jsonify({
            "success": True,
            "message": "Video uploaded successfully",
            "filename": filename
        })
        
    except Exception as e:
        logger.error(f"Video upload error: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/process_video', methods=['POST'])
def process_video():
    global video_processing
    
    try:
        data = request.get_json()
        action = data.get('action', 'start')
        
        if action == 'start':
            video_processing = True
            message = "Video processing started"
        else:
            video_processing = False
            message = "Video processing stopped"
        
        return jsonify({
            "success": True,
            "message": message,
            "processing": video_processing
        })
        
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/video_feed')
def video_feed():
    """Simple video feed with detection"""
    global current_video_path, video_processing
    
    try:
        if not current_video_path or not os.path.exists(current_video_path):
            # Return placeholder
            placeholder = np.ones((480, 640, 3), dtype=np.uint8) * 128
            cv2.putText(placeholder, "No Video Loaded", (200, 240), 
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
            _, buffer = cv2.imencode('.jpg', placeholder)
            return Response(buffer.tobytes(), mimetype='image/jpeg')
        
        # Read video frame
        cap = cv2.VideoCapture(current_video_path)
        if not cap.isOpened():
            return jsonify({'error': 'Cannot open video'}), 500
        
        ret, frame = cap.read()
        if not ret:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)  # Loop to start
            ret, frame = cap.read()
            if not ret:
                cap.release()
                return jsonify({'error': 'Cannot read frame'}), 500
        
        # Process frame if detection is active
        if video_processing:
            try:
                result = detect_and_ocr(frame)
                if result and result.get('frame'):
                    cap.release()
                    return Response(result['frame'], mimetype='image/jpeg')
            except Exception as e:
                logger.warning(f"Detection failed: {e}")
        
        # Return original frame with status
        display_frame = frame.copy()
        status_text = "DETECTING" if video_processing else "PAUSED"
        status_color = (0, 255, 0) if video_processing else (0, 255, 255)
        cv2.putText(display_frame, status_text, (10, 30), 
                   cv2.FONT_HERSHEY_SIMPLEX, 1, status_color, 2)
        
        _, buffer = cv2.imencode('.jpg', display_frame)
        cap.release()
        
        return Response(buffer.tobytes(), mimetype='image/jpeg')
        
    except Exception as e:
        logger.error(f"Video feed error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/video_status', methods=['GET'])
def video_status():
    global current_video_path, video_processing
    
    return jsonify({
        "success": True,
        "has_video": bool(current_video_path and os.path.exists(current_video_path)),
        "processing": video_processing
    })

# Error handlers
@app.errorhandler(404)
def not_found(e):
    return jsonify({'success': False, 'message': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(e):
    return jsonify({'success': False, 'message': 'Internal server error'}), 500

if __name__ == '__main__':
    logger.info("Starting optimized license plate recognition server...")
    
    try:
        app.run(
            debug=False,
            host='127.0.0.1',
            port=5002,
            threaded=True
        )
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
    except Exception as e:
        logger.error(f"Server error: {e}")
        sys.exit(1)