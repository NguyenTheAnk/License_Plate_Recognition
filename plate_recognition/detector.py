# detector.py
import cv2
import numpy as np
from ultralytics import YOLO
from paddleocr import PaddleOCR

# Load YOLOv8 model (chọn model và weights phù hợp)
yolo_model = YOLO('yolov8n.pt')  # Thay bằng model đã train biển số
ocr_model = PaddleOCR(use_angle_cls=True, lang='en', use_gpu=False)

def detect_and_ocr(image_np):
    # B1: Phát hiện biển số bằng YOLOv8
    results = yolo_model(image_np)
    boxes = results[0].boxes.xyxy.cpu().numpy() if results[0].boxes is not None else []
    result_list = []

    for box in boxes:
        x1, y1, x2, y2 = map(int, box)
        plate_img = image_np[y1:y2, x1:x2]
        # B2: Nhận diện ký tự bằng PaddleOCR
        ocr_result = ocr_model.ocr(plate_img)
        text = ''
        if ocr_result and len(ocr_result[0]) > 0:
            text = ''.join([line[1][0] for line in ocr_result[0]])
        result_list.append({
            "bbox": [int(x1), int(y1), int(x2), int(y2)],
            "text": text
        })
    return result_list