#!/usr/bin/env python3
"""
Script test cho module detect_plate.py
"""

import sys
import os
import json
import argparse
from pathlib import Path

def test_plate_detection_module():
    """Test module detect_plate.py"""
    print("=== Testing Plate Detection Module ===")
    
    # Kiểm tra file detect_plate.py có tồn tại không
    script_path = os.path.join(os.path.dirname(__file__), 'controllers', 'WhiteList', 'detect_plate.py')
    if not os.path.exists(script_path):
        print(f"❌ Module not found: {script_path}")
        return False
    
    print(f"✅ Module found: {script_path}")
    
    # Kiểm tra model files
    models_dir = os.path.join(os.path.dirname(__file__), 'models')
    detector_model = os.path.join(models_dir, 'LP_detector_nano_61.pt')
    
    if not os.path.exists(detector_model):
        print(f"❌ Detector model not found: {detector_model}")
        return False
    
    print(f"✅ Detector model found: {detector_model}")
    
    # Kiểm tra thư mục yolov5
    yolov5_dir = os.path.join(os.path.dirname(__file__), 'models', 'yolov5')
    if not os.path.exists(yolov5_dir):
        print(f"❌ YOLOv5 directory not found: {yolov5_dir}")
        return False
    
    print(f"✅ YOLOv5 directory found: {yolov5_dir}")
    
    return True

def test_with_sample_image(image_path):
    """Test với ảnh mẫu"""
    print(f"\n=== Testing with Sample Image ===")
    print(f"Image path: {image_path}")
    
    if not os.path.exists(image_path):
        print(f"❌ Image file not found: {image_path}")
        return False
    
    print(f"✅ Image file found")
    
    # Import và test module
    try:
        script_path = os.path.join(os.path.dirname(__file__), 'controllers', 'WhiteList', 'detect_plate.py')
        
        # Thay đổi working directory để module có thể import YOLOv5
        original_cwd = os.getcwd()
        os.chdir(os.path.dirname(__file__))
        
        # Import module
        import importlib.util
        spec = importlib.util.spec_from_file_location("detect_plate", script_path)
        plate_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(plate_module)
        
        # Test với ảnh
        print("Running plate detection...")
        result = plate_module.detect_plate_from_image(image_path)
        
        print("\n=== Detection Results ===")
        print(json.dumps(result, indent=2, ensure_ascii=False))
        
        if result.get('success'):
            print(f"\n✅ Detection successful!")
            print(f"   Text: {result.get('text', 'N/A')}")
            print(f"   Method: {result.get('method', 'N/A')}")
            if result.get('confidence'):
                print(f"   Confidence: {result['confidence']:.3f}")
            if result.get('bbox'):
                print(f"   Bounding box: {result['bbox']}")
            if result.get('detections'):
                print(f"   Total detections: {len(result['detections'])}")
        else:
            print(f"\n❌ Detection failed: {result.get('message', 'Unknown error')}")
        
        os.chdir(original_cwd)
        return result.get('success', False)
        
    except Exception as e:
        print(f"❌ Error testing detection: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    parser = argparse.ArgumentParser(description='Test Plate Detection Module')
    parser.add_argument('--image', help='Path to test image')
    args = parser.parse_args()
    
    print("License Plate Detection Module Test")
    print("=" * 50)
    
    # Test cơ bản
    basic_test_passed = test_plate_detection_module()
    
    if not basic_test_passed:
        print("\n❌ Basic module test failed!")
        return 1
    
    print("\n✅ Basic module test passed!")
    
    # Test với ảnh nếu được cung cấp
    if args.image:
        image_test_passed = test_with_sample_image(args.image)
        if image_test_passed:
            print("\n✅ Image test passed!")
        else:
            print("\n❌ Image test failed!")
            return 1
    else:
        print("\nℹ️  No image provided for testing. Use --image <path> to test with an image.")
    
    print("\n" + "=" * 50)
    print("✅ Module test completed successfully!")
    print("\nModule features:")
    print("- YOLOv5 detection with LP_detector_nano_61.pt")
    print("- PaddleOCR recognition with Vietnamese language")
    print("- Multiple plate detection support")
    print("- Fallback to full image OCR")
    print("- Confidence scoring")
    print("- Detailed detection information")
    
    return 0

if __name__ == "__main__":
    sys.exit(main()) 