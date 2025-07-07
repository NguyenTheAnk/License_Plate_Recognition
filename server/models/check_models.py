import sys
import json
import cv2
import numpy as np
import os
from pathlib import Path
import torch

def check_models():
    """Check if all models are working correctly"""
    print("=== Model Health Check ===")
    
    # Check detector model
    print("\n1. Checking Detector Model (LP_detector_nano_61.pt):")
    detector_path = "LP_detector_nano_61.pt"
    
    if not Path(detector_path).exists():
        print(f"   ❌ Model file not found: {detector_path}")
        return False
    
    print(f"   ✅ Model file found: {detector_path}")
    
    try:
        # Try to load the model
        detector_model = torch.load(detector_path, map_location=torch.device('cpu'))
        detector_model.eval()
        print(f"   ✅ Model loaded successfully")
        
        # Test with dummy input
        dummy_input = torch.randn(1, 3, 640, 640)
        with torch.no_grad():
            output = detector_model(dummy_input)
        
        print(f"   ✅ Model inference successful")
        print(f"   ✅ Output shape: {output.shape if hasattr(output, 'shape') else 'unknown'}")
        
    except Exception as e:
        print(f"   ❌ Model loading/inference failed: {e}")
        return False
    
    # Check OCR model
    print("\n2. Checking OCR Model (LP_ocr_nano_62.pt):")
    ocr_path = "LP_ocr_nano_62.pt"
    
    if not Path(ocr_path).exists():
        print(f"   ❌ Model file not found: {ocr_path}")
        return False
    
    print(f"   ✅ Model file found: {ocr_path}")
    
    try:
        # Try to load the model
        ocr_model = torch.load(ocr_path, map_location=torch.device('cpu'))
        ocr_model.eval()
        print(f"   ✅ Model loaded successfully")
        
        # Test with dummy input (assuming grayscale input)
        dummy_input = torch.randn(1, 1, 100, 320)  # Adjust size based on your model
        with torch.no_grad():
            output = ocr_model(dummy_input)
        
        print(f"   ✅ Model inference successful")
        print(f"   ✅ Output shape: {output.shape if hasattr(output, 'shape') else 'unknown'}")
        
    except Exception as e:
        print(f"   ❌ Model loading/inference failed: {e}")
        return False
    
    # Check dependencies
    print("\n3. Checking Dependencies:")
    try:
        import cv2
        print(f"   ✅ OpenCV version: {cv2.__version__}")
    except ImportError:
        print(f"   ❌ OpenCV not installed")
        return False
    
    try:
        import torch
        print(f"   ✅ PyTorch version: {torch.__version__}")
    except ImportError:
        print(f"   ❌ PyTorch not installed")
        return False
    
    try:
        import numpy
        print(f"   ✅ NumPy version: {numpy.__version__}")
    except ImportError:
        print(f"   ❌ NumPy not installed")
        return False
    
    print("\n✅ All models and dependencies are working correctly!")
    return True

def test_with_sample_image():
    """Test with a sample image if available"""
    print("\n=== Testing with Sample Image ===")
    
    # Look for any image file in the current directory or parent
    image_extensions = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff']
    sample_image = None
    
    # Check current directory
    for ext in image_extensions:
        for file in Path('.').glob(f'*{ext}'):
            sample_image = str(file)
            break
        if sample_image:
            break
    
    # Check parent directory
    if not sample_image:
        for ext in image_extensions:
            for file in Path('..').glob(f'*{ext}'):
                sample_image = str(file)
                break
            if sample_image:
                break
    
    if sample_image:
        print(f"Found sample image: {sample_image}")
        print("Testing detection pipeline...")
        
        try:
            # Import and run detection
            from detect_plate import detect_plate
            result = detect_plate(sample_image)
            print(f"Detection result: {result}")
        except Exception as e:
            print(f"Detection test failed: {e}")
    else:
        print("No sample image found for testing")

def main():
    print("License Plate Detection Model Health Check")
    print("=" * 50)
    
    # Check models
    models_ok = check_models()
    
    if models_ok:
        # Test with sample image if available
        test_with_sample_image()
        
        print("\n" + "=" * 50)
        print("✅ System is ready for license plate detection!")
        print("\nTo test with your own image:")
        print("python detect_plate.py <image_path>")
        print("python debug_detection.py <image_path>")
        print("python test_pipeline.py <image_path>")
    else:
        print("\n" + "=" * 50)
        print("❌ System has issues that need to be resolved!")
        print("\nPlease check:")
        print("1. Model files are in the correct location")
        print("2. All dependencies are installed")
        print("3. Model files are not corrupted")

if __name__ == "__main__":
    main() 