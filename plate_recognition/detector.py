# detector.py
import cv2
import numpy as np
from ultralytics import YOLO
import logging

# Thiết lập logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load YOLOv8 model for general object detection
logger.info("Loading YOLOv8 model...")
try:
    yolo_model = YOLO('yolov8n.pt')  # Mô hình cơ bản, nhận diện các đối tượng trong COCO
    logger.info("YOLOv8 model loaded successfully.")
except Exception as e:
    logger.error(f"Failed to load YOLOv8 model: {str(e)}")
    raise

def detect_and_ocr(image_np):
    logger.info("Starting object detection...")
    # Phát hiện tất cả đối tượng bằng YOLOv8
    try:
        results = yolo_model(image_np)
        boxes = results[0].boxes.xyxy.cpu().numpy() if results[0].boxes is not None else []
        classes = results[0].boxes.cls.cpu().numpy() if results[0].boxes is not None else []
        class_names = yolo_model.names  # Danh sách tên các class trong COCO
        logger.info(f"Detected {len(boxes)} objects.")
    except Exception as e:
        logger.error(f"Error during object detection: {str(e)}")
        return []

    result_list = []
    
    # Duyệt qua tất cả các đối tượng được phát hiện
    for box, cls in zip(boxes, classes):
        x1, y1, x2, y2 = map(int, box)
        class_name = class_names[int(cls)]  # Lấy tên class (ví dụ: person, car, truck,...)
        logger.info(f"Detected object: {class_name} at bbox [{x1}, {y1}, {x2}, {y2}]")
        
        result_list.append({
            "object_bbox": [int(x1), int(y1), int(x2), int(y2)],
            "object_class": class_name
        })
    
    return result_list