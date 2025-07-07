import sys
import json
import cv2
import numpy as np
import os
from pathlib import Path
import torch

def test_detector_model(image_path):
    """Test the detector model (LP_detector_nano_61.pt)"""
    try:
        # Load detector model
        detector_model_path = "LP_detector_nano_61.pt"
        if not Path(detector_model_path).exists():
            return f"Detector model {detector_model_path} not found"
        
        detector_model = torch.load(detector_model_path, map_location=torch.device('cpu'))
        detector_model.eval()
        
        # Load and preprocess image
        image = cv2.imread(image_path)
        if image is None:
            return "Failed to load image"
        
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        input_size = (640, 640)
        resized_image = cv2.resize(image_rgb, input_size)
        normalized_image = resized_image.astype(np.float32) / 255.0
        input_tensor = torch.from_numpy(normalized_image).permute(2, 0, 1).unsqueeze(0)
        
        # Run detection
        with torch.no_grad():
            predictions = detector_model(input_tensor)
        
        if isinstance(predictions, (list, tuple)):
            predictions = predictions[0]
        
        predictions = predictions.cpu().numpy()
        
        # Count detections
        detections = []
        confidence_threshold = 0.5
        if len(predictions.shape) == 3:
            for detection in predictions[0]:
                if len(detection) >= 6:
                    x1, y1, x2, y2, confidence, class_id = detection[:6]
                    if confidence > confidence_threshold:
                        detections.append([x1, y1, x2, y2, confidence, class_id])
        
        return f"Detector model loaded successfully. Found {len(detections)} detections with confidence > 0.5"
        
    except Exception as e:
        return f"Detector model error: {str(e)}"

def test_ocr_model(image_path):
    """Test the OCR model (LP_ocr_nano_62.pt)"""
    try:
        # Load OCR model
        ocr_model_path = "LP_ocr_nano_62.pt"
        if not Path(ocr_model_path).exists():
            return f"OCR model {ocr_model_path} not found"
        
        ocr_model = torch.load(ocr_model_path, map_location=torch.device('cpu'))
        ocr_model.eval()
        
        # Load image and create a dummy plate region
        image = cv2.imread(image_path)
        if image is None:
            return "Failed to load image"
        
        # Create a dummy plate region (you can modify this based on your needs)
        plate_region = image[100:200, 100:400]  # Example crop
        
        # Preprocess for OCR
        ocr_input_size = (320, 100)
        plate_resized = cv2.resize(plate_region, ocr_input_size)
        plate_gray = cv2.cvtColor(plate_resized, cv2.COLOR_BGR2GRAY)
        plate_normalized = plate_gray.astype(np.float32) / 255.0
        plate_tensor = torch.from_numpy(plate_normalized).unsqueeze(0).unsqueeze(0)
        
        # Run OCR inference
        with torch.no_grad():
            ocr_predictions = ocr_model(plate_tensor)
        
        return f"OCR model loaded successfully. Output shape: {ocr_predictions.shape}"
        
    except Exception as e:
        return f"OCR model error: {str(e)}"

def main():
    if len(sys.argv) != 2:
        print("Usage: python test_models.py <image_path>")
        sys.exit(1)
    
    image_path = sys.argv[1]
    
    print("Testing YOLOv5 models...")
    print(f"Image path: {image_path}")
    print()
    
    # Test detector model
    print("1. Testing detector model (LP_detector_nano_61.pt):")
    detector_result = test_detector_model(image_path)
    print(detector_result)
    print()
    
    # Test OCR model
    print("2. Testing OCR model (LP_ocr_nano_62.pt):")
    ocr_result = test_ocr_model(image_path)
    print(ocr_result)
    print()
    
    # Check model files
    print("3. Model file status:")
    detector_exists = Path("LP_detector_nano_61.pt").exists()
    ocr_exists = Path("LP_ocr_nano_62.pt").exists()
    print(f"   LP_detector_nano_61.pt: {'✓ Found' if detector_exists else '✗ Missing'}")
    print(f"   LP_ocr_nano_62.pt: {'✓ Found' if ocr_exists else '✗ Missing'}")

if __name__ == "__main__":
    main() 