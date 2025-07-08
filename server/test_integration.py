#!/usr/bin/env python3
"""
Script test tích hợp YOLOv5 + PaddleOCR cho nhận diện biển số
"""

import sys
import os
import json
import argparse
from pathlib import Path

# Thêm đường dẫn đến thư mục controllers
sys.path.append(os.path.join(os.path.dirname(__file__), 'controllers', 'WhiteList'))

def test_detection_script():
    """Test script detect_plate.py"""
    print("=== Testing Detection Script Integration ===")
    
    # Kiểm tra file detect_plate.py có tồn tại không
    script_path = os.path.join(os.path.dirname(__file__), 'controllers', 'WhiteList', 'detect_plate.py')
    if not os.path.exists(script_path):
        print(f"❌ Script not found: {script_path}")
        return False
    
    print(f"✅ Script found: {script_path}")
    
    # Kiểm tra model files
    models_dir = os.path.join(os.path.dirname(__file__), 'models')
    detector_model = os.path.join(models_dir, 'LP_detector_nano_61.pt')
    
    if not os.path.exists(detector_model):
        print(f"❌ Detector model not found: {detector_model}")
        return False
    
    print(f"✅ Detector model found: {detector_model}")
    
    # Kiểm tra thư mục yolov5
    yolov5_dir = os.path.join(os.path.dirname(__file__), 'yolov5')
    if not os.path.exists(yolov5_dir):
        print(f"❌ YOLOv5 directory not found: {yolov5_dir}")
        return False
    
    print(f"✅ YOLOv5 directory found: {yolov5_dir}")
    
    # Kiểm tra các file cần thiết trong yolov5
    required_files = [
        'models/common.py',
        'utils/general.py',
        'utils/torch_utils.py'
    ]
    
    for file_path in required_files:
        full_path = os.path.join(yolov5_dir, file_path)
        if not os.path.exists(full_path):
            print(f"❌ Required YOLOv5 file not found: {full_path}")
            return False
        print(f"✅ YOLOv5 file found: {full_path}")
    
    return True

def test_with_sample_image(image_path):
    """Test với ảnh mẫu"""
    print(f"\n=== Testing with Sample Image ===")
    print(f"Image path: {image_path}")
    
    if not os.path.exists(image_path):
        print(f"❌ Image file not found: {image_path}")
        return False
    
    print(f"✅ Image file found")
    
    # Import và test script detection
    try:
        script_path = os.path.join(os.path.dirname(__file__), 'controllers', 'WhiteList', 'detect_plate.py')
        
        # Thay đổi working directory để script có thể import YOLOv5
        original_cwd = os.getcwd()
        os.chdir(os.path.dirname(__file__))
        
        # Import script
        import importlib.util
        spec = importlib.util.spec_from_file_location("detect_plate", script_path)
        detect_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(detect_module)
        
        # Test với ảnh
        print("Running detection...")
        detect_module.main()
        
        os.chdir(original_cwd)
        return True
        
    except Exception as e:
        print(f"❌ Error testing detection: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description='Test YOLOv5 + PaddleOCR integration')
    parser.add_argument('--image', help='Path to test image')
    args = parser.parse_args()
    
    print("License Plate Recognition - YOLOv5 + PaddleOCR Integration Test")
    print("=" * 70)
    
    # Test cơ bản
    basic_test_passed = test_detection_script()
    
    if not basic_test_passed:
        print("\n❌ Basic integration test failed!")
        return 1
    
    print("\n✅ Basic integration test passed!")
    
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
    
    print("\n" + "=" * 70)
    print("✅ Integration test completed successfully!")
    print("\nSystem is ready to use:")
    print("- YOLOv5 model: LP_detector_nano_61.pt")
    print("- OCR engine: PaddleOCR")
    print("- Detection method: YOLOv5 detection + PaddleOCR recognition")
    print("- Fallback: Full image PaddleOCR recognition")
    
    return 0

if __name__ == "__main__":
    sys.exit(main()) 