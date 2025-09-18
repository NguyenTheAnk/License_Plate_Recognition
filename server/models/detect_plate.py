import sys
import json
import cv2
import numpy as np
import os
from pathlib import Path
import torch

def detect_plate(image_path):
    try:
        print(f"DEBUG: Starting detection for image: {image_path}")
        
        # Load YOLOv5 detector model for license plate detection
        detector_model_path = path.join(os.path.dirname(__file__), "LP_detector_nano_61.pt")
        
        # Check if detector model file exists
        if not Path(detector_model_path).exists():
            print(f"DEBUG: Detector model not found: {detector_model_path}")
            return json.dumps({
                "success": False,
                "error": f"Detector model file {detector_model_path} not found"
            })
        
        print(f"DEBUG: Detector model found: {detector_model_path}")
        
        # Load detector model using torch with weights_only=False for PyTorch 2.6+
        detector_model = torch.load(detector_model_path, map_location=torch.device('cpu'), weights_only=False)
        detector_model.eval()
        
        # Load image
        if not Path(image_path).exists():
            print(f"DEBUG: Image file not found: {image_path}")
            return json.dumps({
                "success": False,
                "error": f"Image file {image_path} not found"
            })
        
        image = cv2.imread(image_path)
        if image is None:
            print(f"DEBUG: Failed to load image: {image_path}")
            return json.dumps({
                "success": False,
                "error": "Failed to load image"
            })
        
        print(f"DEBUG: Image loaded successfully: {image.shape}")
        
        # Preprocess image for YOLOv5 detector
        # Convert BGR to RGB
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        # Resize image to model input size (assuming 640x640)
        input_size = (640, 640)
        resized_image = cv2.resize(image_rgb, input_size)
        
        # Normalize and convert to tensor
        normalized_image = resized_image.astype(np.float32) / 255.0
        input_tensor = torch.from_numpy(normalized_image).permute(2, 0, 1).unsqueeze(0)
        
        # Run detection with detector model
        with torch.no_grad():
            predictions = detector_model(input_tensor)
        
        print(f"DEBUG: Detection completed, raw predictions shape: {predictions.shape if hasattr(predictions, 'shape') else 'unknown'}")
        
        # Process predictions (YOLOv5 format)
        if isinstance(predictions, (list, tuple)):
            predictions = predictions[0]
        
        # Convert predictions to numpy
        predictions = predictions.cpu().numpy()
        
        print(f"DEBUG: Predictions shape after processing: {predictions.shape}")
        
        # Filter detections (assuming confidence threshold of 0.5)
        confidence_threshold = 0.5
        detections = []
        
        print(f"DEBUG: Processing detections with confidence threshold: {confidence_threshold}")
        
        # Process predictions based on YOLOv5 output format
        # YOLOv5 output: [batch, num_detections, 6] where 6 = [x1, y1, x2, y2, confidence, class_id]
        if len(predictions.shape) == 3:  # [batch, num_detections, 6] format
            for i, detection in enumerate(predictions[0]):
                if len(detection) >= 6:
                    x1, y1, x2, y2, confidence, class_id = detection[:6]
                    print(f"DEBUG: Detection {i}: bbox=({x1:.2f},{y1:.2f},{x2:.2f},{y2:.2f}), conf={confidence:.3f}, class={class_id}")
                    if confidence > confidence_threshold:
                        detections.append([x1, y1, x2, y2, confidence, class_id])
                        print(f"DEBUG: Detection {i} accepted")
                    else:
                        print(f"DEBUG: Detection {i} rejected (confidence <= threshold)")
        else:
            print(f"DEBUG: Unexpected predictions shape: {predictions.shape}")
        
        print(f"DEBUG: Found {len(detections)} valid detections")
        
        if len(detections) == 0:
            print(f"DEBUG: No license plates detected with confidence > {confidence_threshold}")
            return json.dumps({
                "success": True,
                "detected": False,
                "message": "No license plate detected"
            })
        
        # Get the detection with highest confidence
        best_detection = max(detections, key=lambda x: x[4])
        x1, y1, x2, y2, confidence, class_id = best_detection
        
        # Scale coordinates back to original image size
        orig_height, orig_width = image.shape[:2]
        x1 = int(x1 * orig_width / input_size[0])
        y1 = int(y1 * orig_height / input_size[1])
        x2 = int(x2 * orig_width / input_size[0])
        y2 = int(y2 * orig_height / input_size[1])
        
        # Ensure coordinates are within image bounds
        x1 = max(0, min(x1, orig_width))
        y1 = max(0, min(y1, orig_height))
        x2 = max(0, min(x2, orig_width))
        y2 = max(0, min(y2, orig_height))
        
        # Crop the detected plate region
        plate_region = image[y1:y2, x1:x2]
        
        # Now use OCR model to recognize characters
        ocr_model_path = path.join(os.path.dirname(__file__), "LP_ocr_nano_62.pt")
        
        # Check if OCR model file exists
        if not Path(ocr_model_path).exists():
            return json.dumps({
                "success": False,
                "error": f"OCR model file {ocr_model_path} not found"
            })
        
        # Load OCR model with weights_only=False for PyTorch 2.6+
        ocr_model = torch.load(ocr_model_path, map_location=torch.device('cpu'), weights_only=False)
        ocr_model.eval()
        
        # Preprocess plate region for OCR
        # Resize plate region to OCR model input size
        ocr_input_size = (320, 100)  # Adjust based on your OCR model requirements
        plate_resized = cv2.resize(plate_region, ocr_input_size)
        
        # Convert to grayscale for OCR
        plate_gray = cv2.cvtColor(plate_resized, cv2.COLOR_BGR2GRAY)
        
        # Normalize and convert to tensor
        plate_normalized = plate_gray.astype(np.float32) / 255.0
        plate_tensor = torch.from_numpy(plate_normalized).unsqueeze(0).unsqueeze(0)  # Add batch and channel dimensions
        
        # Run OCR inference
        with torch.no_grad():
            ocr_predictions = ocr_model(plate_tensor)
        
        # Process OCR predictions
        # This depends on how your OCR model outputs results
        # Assuming it outputs character probabilities or embeddings
        ocr_result = process_ocr_output(ocr_predictions)
        
        return json.dumps({
            "success": True,
            "detected": True,
            "bbox": {
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2
            },
            "confidence": float(confidence),
            "class_id": int(class_id),
            "ocr_text": ocr_result
        })
        
    except Exception as e:
        return json.dumps({
            "success": False,
            "error": str(e)
        })

def process_ocr_output(ocr_predictions):
    """
    Process OCR model output to extract text
    This function needs to be customized based on your OCR model's output format
    """
    try:
        # Convert predictions to numpy
        predictions = ocr_predictions.cpu().numpy()
        
        print(f"OCR predictions shape: {predictions.shape}")
        print(f"OCR predictions sample: {predictions.flatten()[:10]}")  # Debug info
        
        # Handle different output formats
        if len(predictions.shape) == 3:  # [batch, sequence_length, num_classes]
            # Get the most likely character for each position
            char_indices = np.argmax(predictions[0], axis=1)
            
            # Convert indices to characters (Vietnamese license plate character set)
            char_set = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-."
            result = ""
            for idx in char_indices:
                if idx < len(char_set) and idx > 0:  # Skip padding/background class
                    result += char_set[idx]
            
            return result.strip()
            
        elif len(predictions.shape) == 2:  # [batch, num_classes] or [sequence_length, num_classes]
            if predictions.shape[0] == 1:  # [1, num_classes] - single character prediction
                char_index = np.argmax(predictions[0])
                char_set = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-."
                if char_index < len(char_set) and char_index > 0:
                    return char_set[char_index]
            else:  # [sequence_length, num_classes] - sequence of characters
                char_indices = np.argmax(predictions, axis=1)
                char_set = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-."
                result = ""
                for idx in char_indices:
                    if idx < len(char_set) and idx > 0:
                        result += char_set[idx]
                return result.strip()
                
        elif len(predictions.shape) == 1:  # [num_classes] - single character
            char_index = np.argmax(predictions)
            char_set = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-."
            if char_index < len(char_set) and char_index > 0:
                return char_set[char_index]
        
        # If we can't process the output, return empty string
        print(f"Unsupported OCR output shape: {predictions.shape}")
        return ""
            
    except Exception as e:
        print(f"OCR processing error: {e}")
        return ""

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({
            "success": False,
            "error": "Usage: python detect_plate.py <image_path>"
        }))
        sys.exit(1)
    
    image_path = sys.argv[1]
    result = detect_plate(image_path)
    print(result) 