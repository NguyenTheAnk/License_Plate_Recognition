#!/usr/bin/env python3
"""
Test script đơn giản để kiểm tra import YOLOv5
"""

import sys
import os

def main():
    print("Testing YOLOv5 import...")
    
    # Thêm YOLOv5 vào sys.path
    YOLOV5_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), 'models/yolov5'))
    print(f"YOLOv5 path: {YOLOV5_PATH}")
    
    if not os.path.exists(YOLOV5_PATH):
        print(f"❌ YOLOv5 directory not found: {YOLOV5_PATH}")
        return 1
    
    if YOLOV5_PATH not in sys.path:
        sys.path.insert(0, YOLOV5_PATH)
    
    # Thay đổi working directory
    original_cwd = os.getcwd()
    os.chdir(YOLOV5_PATH)
    
    try:
        print("Importing YOLOv5 modules...")
        from models.common import DetectMultiBackend
        from utils.general import non_max_suppression, scale_coords
        from utils.torch_utils import select_device
        print("✅ All imports successful!")
        return 0
    except Exception as e:
        print(f"❌ Import error: {e}")
        return 1
    finally:
        os.chdir(original_cwd)

if __name__ == "__main__":
    sys.exit(main()) 