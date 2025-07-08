#!/usr/bin/env python3
"""
Test script để kiểm tra import YOLOv5
"""

import sys
import os

def test_yolov5_import():
    """Test import YOLOv5 modules"""
    print("=== Testing YOLOv5 Import ===")
    
    # Thêm YOLOv5 vào sys.path
    YOLOV5_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), 'models/yolov5'))
    print(f"YOLOv5 path: {YOLOV5_PATH}")
    
    if not os.path.exists(YOLOV5_PATH):
        print(f"❌ YOLOv5 directory not found: {YOLOV5_PATH}")
        return False
    
    print(f"✅ YOLOv5 directory found")
    
    if YOLOV5_PATH not in sys.path:
        sys.path.insert(0, YOLOV5_PATH)
        print(f"✅ Added YOLOv5 to sys.path")
    
    # Thay đổi working directory để YOLOv5 có thể import đúng
    original_cwd = os.getcwd()
    os.chdir(YOLOV5_PATH)
    
    try:
        # Test import các module
        print("Testing import models.common...")
        from models.common import DetectMultiBackend
        print("✅ models.common imported successfully")
    except Exception as e:
        print(f"❌ Error importing models.common: {e}")
        os.chdir(original_cwd)
        return False
    
    try:
        print("Testing import utils.general...")
        from utils.general import non_max_suppression, scale_coords
        print("✅ utils.general imported successfully")
    except Exception as e:
        print(f"❌ Error importing utils.general: {e}")
        os.chdir(original_cwd)
        return False
    
    try:
        print("Testing import utils.torch_utils...")
        from utils.torch_utils import select_device
        print("✅ utils.torch_utils imported successfully")
    except Exception as e:
        print(f"❌ Error importing utils.torch_utils: {e}")
        os.chdir(original_cwd)
        return False
    
    # Khôi phục working directory
    os.chdir(original_cwd)
    
    print("✅ All YOLOv5 imports successful!")
    return True

def test_paddleocr_import():
    """Test import PaddleOCR"""
    print("\n=== Testing PaddleOCR Import ===")
    
    try:
        from paddleocr import PaddleOCR
        print("✅ PaddleOCR imported successfully")
        return True
    except Exception as e:
        print(f"❌ Error importing PaddleOCR: {e}")
        return False

def test_other_imports():
    """Test import các thư viện khác"""
    print("\n=== Testing Other Imports ===")
    
    imports = [
        ("cv2", "OpenCV"),
        ("numpy", "NumPy"),
        ("torch", "PyTorch"),
        ("pathlib", "PathLib")
    ]
    
    all_success = True
    for module_name, display_name in imports:
        try:
            __import__(module_name)
            print(f"✅ {display_name} imported successfully")
        except Exception as e:
            print(f"❌ Error importing {display_name}: {e}")
            all_success = False
    
    return all_success

def main():
    print("YOLOv5 Import Test")
    print("=" * 50)
    
    # Test YOLOv5 imports
    yolov5_success = test_yolov5_import()
    
    # Test PaddleOCR import
    paddleocr_success = test_paddleocr_import()
    
    # Test other imports
    other_success = test_other_imports()
    
    print("\n" + "=" * 50)
    if yolov5_success and paddleocr_success and other_success:
        print("✅ All imports successful!")
        print("System is ready for plate detection.")
        return 0
    else:
        print("❌ Some imports failed!")
        print("Please check the error messages above.")
        return 1

if __name__ == "__main__":
    sys.exit(main()) 