import sys
import json
import cv2
import numpy as np
import os
from pathlib import Path
import torch

def debug_detection_pipeline(image_path):
    """Debug the detection pipeline step by step"""
    try:
        print(f"=== DEBUG: License Plate Detection Pipeline ===")
        print(f"Image path: {image_path}")
        
        # Check if image exists
        if not Path(image_path).exists():
            print(f"❌ ERROR: Image file not found: {image_path}")
            return {"success": False, "error": "Image file not found"}
        
        # Check image file
        image = cv2.imread(image_path)
        if image is None:
            print(f"❌ ERROR: Failed to load image: {image_path}")
            return {"success": False, "error": "Failed to load image"}
        
        print(f"✅ Image loaded successfully: {image.shape}")
        
        # Check detector model
        detector_model_path = "LP_detector_nano_61.pt"
        if not Path(detector_model_path).exists():
            print(f"❌ ERROR: Detector model not found: {detector_model_path}")
            return {"success": False, "error": "Detector model not found"}
        
        print(f"✅ Detector model found: {detector_model_path}")
        
        # Load detector model
        try:
            detector_model = torch.load(detector_model_path, map_location=torch.device('cpu'))
            detector_model.eval()
            print(f"✅ Detector model loaded successfully")
        except Exception as e:
            print(f"❌ ERROR: Failed to load detector model: {e}")
            return {"success": False, "error": f"Failed to load detector model: {e}"}
        
        # Preprocess image
        try:
            image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            input_size = (640, 640)
            resized_image = cv2.resize(image_rgb, input_size)
            normalized_image = resized_image.astype(np.float32) / 255.0
            input_tensor = torch.from_numpy(normalized_image).permute(2, 0, 1).unsqueeze(0)
            print(f"✅ Image preprocessed: input tensor shape = {input_tensor.shape}")
        except Exception as e:
            print(f"❌ ERROR: Failed to preprocess image: {e}")
            return {"success": False, "error": f"Failed to preprocess image: {e}"}
        
        # Run detection
        try:
            with torch.no_grad():
                predictions = detector_model(input_tensor)
            
            if isinstance(predictions, (list, tuple)):
                predictions = predictions[0]
            
            predictions = predictions.cpu().numpy()
            print(f"✅ Detection completed: output shape = {predictions.shape}")
            print(f"   Raw predictions sample: {predictions.flatten()[:20]}")
        except Exception as e:
            print(f"❌ ERROR: Detection failed: {e}")
            return {"success": False, "error": f"Detection failed: {e}"}
        
        # Process detections
        try:
            detections = []
            confidence_threshold = 0.5
            print(f"   Processing detections with confidence threshold: {confidence_threshold}")
            
            if len(predictions.shape) == 3:
                print(f"   Predictions shape: {predictions.shape}")
                for i, detection in enumerate(predictions[0]):
                    if len(detection) >= 6:
                        x1, y1, x2, y2, confidence, class_id = detection[:6]
                        print(f"   Detection {i}: bbox=({x1:.2f},{y1:.2f},{x2:.2f},{y2:.2f}), conf={confidence:.3f}, class={class_id}")
                        if confidence > confidence_threshold:
                            detections.append([x1, y1, x2, y2, confidence, class_id])
                            print(f"   ✅ Detection {i} accepted (confidence > threshold)")
                        else:
                            print(f"   ❌ Detection {i} rejected (confidence <= threshold)")
            else:
                print(f"   Unexpected predictions shape: {predictions.shape}")
            
            print(f"✅ Found {len(detections)} valid detections")
        except Exception as e:
            print(f"❌ ERROR: Failed to process detections: {e}")
            return {"success": False, "error": f"Failed to process detections: {e}"}
        
        if len(detections) == 0:
            print(f"⚠️  No license plates detected with confidence > {confidence_threshold}")
            print(f"   Try lowering the confidence threshold or check the image quality")
            return {"success": True, "detected": False, "message": "No license plate detected"}
        
        # Get best detection
        best_detection = max(detections, key=lambda x: x[4])
        x1, y1, x2, y2, confidence, class_id = best_detection
        
        # Scale coordinates
        orig_height, orig_width = image.shape[:2]
        x1_scaled = int(x1 * orig_width / input_size[0])
        y1_scaled = int(y1 * orig_height / input_size[1])
        x2_scaled = int(x2 * orig_width / input_size[0])
        y2_scaled = int(y2 * orig_height / input_size[1])
        
        # Ensure bounds
        x1_scaled = max(0, min(x1_scaled, orig_width))
        y1_scaled = max(0, min(y1_scaled, orig_height))
        x2_scaled = max(0, min(x2_scaled, orig_width))
        y2_scaled = max(0, min(y2_scaled, orig_height))
        
        print(f"✅ Best detection:")
        print(f"   Original bbox: ({x1:.2f}, {y1:.2f}, {x2:.2f}, {y2:.2f})")
        print(f"   Scaled bbox: ({x1_scaled}, {y1_scaled}, {x2_scaled}, {y2_scaled})")
        print(f"   Confidence: {confidence:.3f}")
        print(f"   Class ID: {class_id}")
        
        # Crop plate region
        plate_region = image[y1_scaled:y2_scaled, x1_scaled:x2_scaled]
        print(f"✅ Plate region cropped: {plate_region.shape}")
        
        # Save debug images
        cv2.imwrite("debug_original.jpg", image)
        cv2.imwrite("debug_plate_region.jpg", plate_region)
        print(f"✅ Debug images saved: debug_original.jpg, debug_plate_region.jpg")
        
        # Check OCR model
        ocr_model_path = "LP_ocr_nano_62.pt"
        if not Path(ocr_model_path).exists():
            print(f"⚠️  OCR model not found: {ocr_model_path}")
            return {
                "success": True,
                "detected": True,
                "bbox": {"x1": x1_scaled, "y1": y1_scaled, "x2": x2_scaled, "y2": y2_scaled},
                "confidence": float(confidence),
                "class_id": int(class_id),
                "ocr_text": "",
                "message": "Detection successful but OCR model not found"
            }
        
        print(f"✅ OCR model found: {ocr_model_path}")
        
        # Load OCR model
        try:
            ocr_model = torch.load(ocr_model_path, map_location=torch.device('cpu'))
            ocr_model.eval()
            print(f"✅ OCR model loaded successfully")
        except Exception as e:
            print(f"❌ ERROR: Failed to load OCR model: {e}")
            return {
                "success": True,
                "detected": True,
                "bbox": {"x1": x1_scaled, "y1": y1_scaled, "x2": x2_scaled, "y2": y2_scaled},
                "confidence": float(confidence),
                "class_id": int(class_id),
                "ocr_text": "",
                "message": f"Detection successful but OCR model failed to load: {e}"
            }
        
        # OCR processing
        try:
            ocr_input_size = (320, 100)
            plate_resized = cv2.resize(plate_region, ocr_input_size)
            plate_gray = cv2.cvtColor(plate_resized, cv2.COLOR_BGR2GRAY)
            plate_normalized = plate_gray.astype(np.float32) / 255.0
            plate_tensor = torch.from_numpy(plate_normalized).unsqueeze(0).unsqueeze(0)
            
            print(f"✅ Plate region preprocessed for OCR: {plate_tensor.shape}")
            
            with torch.no_grad():
                ocr_predictions = ocr_model(plate_tensor)
            
            print(f"✅ OCR completed: output shape = {ocr_predictions.shape}")
            
            # Process OCR output
            ocr_result = process_ocr_output(ocr_predictions)
            print(f"✅ OCR result: '{ocr_result}'")
            
        except Exception as e:
            print(f"❌ ERROR: OCR processing failed: {e}")
            ocr_result = ""
        
        return {
            "success": True,
            "detected": True,
            "bbox": {"x1": x1_scaled, "y1": y1_scaled, "x2": x2_scaled, "y2": y2_scaled},
            "confidence": float(confidence),
            "class_id": int(class_id),
            "ocr_text": ocr_result
        }
        
    except Exception as e:
        print(f"❌ ERROR: Pipeline failed: {e}")
        return {"success": False, "error": str(e)}

def process_ocr_output(ocr_predictions):
    """Process OCR model output to extract text"""
    try:
        predictions = ocr_predictions.cpu().numpy()
        
        print(f"   OCR predictions shape: {predictions.shape}")
        print(f"   OCR predictions sample: {predictions.flatten()[:10]}")
        
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
        
        print(f"   Unsupported OCR output shape: {predictions.shape}")
        return ""
            
    except Exception as e:
        print(f"   OCR processing error: {e}")
        return ""

def main():
    if len(sys.argv) != 2:
        print("Usage: python debug_detection.py <image_path>")
        sys.exit(1)
    
    image_path = sys.argv[1]
    
    result = debug_detection_pipeline(image_path)
    
    print("\n" + "="*60)
    print("FINAL RESULT:")
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main() 