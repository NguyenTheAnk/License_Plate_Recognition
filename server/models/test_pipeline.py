import sys
import json
import cv2
import numpy as np
import os
from pathlib import Path
import torch

def test_full_pipeline(image_path):
    """Test the complete license plate detection and OCR pipeline"""
    try:
        print(f"Testing pipeline with image: {image_path}")
        
        # Check if image exists
        if not Path(image_path).exists():
            return {"success": False, "error": "Image file not found"}
        
        # Load detector model
        detector_model_path = "LP_detector_nano_61.pt"
        if not Path(detector_model_path).exists():
            return {"success": False, "error": "Detector model not found"}
        
        detector_model = torch.load(detector_model_path, map_location=torch.device('cpu'))
        detector_model.eval()
        
        # Load OCR model
        ocr_model_path = "LP_ocr_nano_62.pt"
        if not Path(ocr_model_path).exists():
            return {"success": False, "error": "OCR model not found"}
        
        ocr_model = torch.load(ocr_model_path, map_location=torch.device('cpu'))
        ocr_model.eval()
        
        # Load and preprocess image
        image = cv2.imread(image_path)
        if image is None:
            return {"success": False, "error": "Failed to load image"}
        
        print(f"Image loaded: {image.shape}")
        
        # Step 1: Detect license plate
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        input_size = (640, 640)
        resized_image = cv2.resize(image_rgb, input_size)
        normalized_image = resized_image.astype(np.float32) / 255.0
        input_tensor = torch.from_numpy(normalized_image).permute(2, 0, 1).unsqueeze(0)
        
        with torch.no_grad():
            predictions = detector_model(input_tensor)
        
        if isinstance(predictions, (list, tuple)):
            predictions = predictions[0]
        
        predictions = predictions.cpu().numpy()
        print(f"Detector output shape: {predictions.shape}")
        
        # Process detections
        detections = []
        confidence_threshold = 0.5
        if len(predictions.shape) == 3:
            for detection in predictions[0]:
                if len(detection) >= 6:
                    x1, y1, x2, y2, confidence, class_id = detection[:6]
                    if confidence > confidence_threshold:
                        detections.append([x1, y1, x2, y2, confidence, class_id])
        
        print(f"Found {len(detections)} detections with confidence > {confidence_threshold}")
        
        if len(detections) == 0:
            return {"success": True, "detected": False, "message": "No license plate detected"}
        
        # Get best detection
        best_detection = max(detections, key=lambda x: x[4])
        x1, y1, x2, y2, confidence, class_id = best_detection
        
        # Scale coordinates
        orig_height, orig_width = image.shape[:2]
        x1 = int(x1 * orig_width / input_size[0])
        y1 = int(y1 * orig_height / input_size[1])
        x2 = int(x2 * orig_width / input_size[0])
        y2 = int(y2 * orig_height / input_size[1])
        
        # Ensure bounds
        x1 = max(0, min(x1, orig_width))
        y1 = max(0, min(y1, orig_height))
        x2 = max(0, min(x2, orig_width))
        y2 = max(0, min(y2, orig_height))
        
        print(f"Best detection: bbox=({x1},{y1},{x2},{y2}), confidence={confidence:.3f}")
        
        # Step 2: Crop plate region
        plate_region = image[y1:y2, x1:x2]
        print(f"Plate region shape: {plate_region.shape}")
        
        # Save cropped region for debugging
        cv2.imwrite("debug_plate_region.jpg", plate_region)
        print("Saved cropped plate region as debug_plate_region.jpg")
        
        # Step 3: OCR on plate region
        ocr_input_size = (320, 100)
        plate_resized = cv2.resize(plate_region, ocr_input_size)
        plate_gray = cv2.cvtColor(plate_resized, cv2.COLOR_BGR2GRAY)
        plate_normalized = plate_gray.astype(np.float32) / 255.0
        plate_tensor = torch.from_numpy(plate_normalized).unsqueeze(0).unsqueeze(0)
        
        print(f"OCR input tensor shape: {plate_tensor.shape}")
        
        with torch.no_grad():
            ocr_predictions = ocr_model(plate_tensor)
        
        print(f"OCR output shape: {ocr_predictions.shape}")
        
        # Process OCR output
        ocr_result = process_ocr_output(ocr_predictions)
        
        return {
            "success": True,
            "detected": True,
            "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
            "confidence": float(confidence),
            "class_id": int(class_id),
            "ocr_text": ocr_result,
            "plate_region_shape": plate_region.shape
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}

def process_ocr_output(ocr_predictions):
    """Process OCR model output to extract text"""
    try:
        predictions = ocr_predictions.cpu().numpy()
        
        print(f"OCR predictions shape: {predictions.shape}")
        print(f"OCR predictions sample: {predictions.flatten()[:10]}")
        
        # Handle different output formats
        if len(predictions.shape) == 3:  # [batch, sequence_length, num_classes]
            char_indices = np.argmax(predictions[0], axis=1)
            char_set = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-."
            result = ""
            for idx in char_indices:
                if idx < len(char_set) and idx > 0:
                    result += char_set[idx]
            return result.strip()
            
        elif len(predictions.shape) == 2:
            if predictions.shape[0] == 1:
                char_index = np.argmax(predictions[0])
                char_set = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-."
                if char_index < len(char_set) and char_index > 0:
                    return char_set[char_index]
            else:
                char_indices = np.argmax(predictions, axis=1)
                char_set = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-."
                result = ""
                for idx in char_indices:
                    if idx < len(char_set) and idx > 0:
                        result += char_set[idx]
                return result.strip()
                
        elif len(predictions.shape) == 1:
            char_index = np.argmax(predictions)
            char_set = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-."
            if char_index < len(char_set) and char_index > 0:
                return char_set[char_index]
        
        print(f"Unsupported OCR output shape: {predictions.shape}")
        return ""
            
    except Exception as e:
        print(f"OCR processing error: {e}")
        return ""

def main():
    if len(sys.argv) != 2:
        print("Usage: python test_pipeline.py <image_path>")
        sys.exit(1)
    
    image_path = sys.argv[1]
    
    print("Testing YOLOv5 License Plate Detection and OCR Pipeline")
    print("=" * 60)
    
    result = test_full_pipeline(image_path)
    
    print("\nResults:")
    print(json.dumps(result, indent=2))
    
    if result.get("success") and result.get("detected"):
        print(f"\n✅ Detection successful!")
        print(f"   Bounding box: {result['bbox']}")
        print(f"   Confidence: {result['confidence']:.3f}")
        print(f"   OCR Text: '{result['ocr_text']}'")
    elif result.get("success") and not result.get("detected"):
        print(f"\n⚠️  No license plate detected")
    else:
        print(f"\n❌ Error: {result.get('error', 'Unknown error')}")

if __name__ == "__main__":
    main() 