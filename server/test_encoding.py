#!/usr/bin/env python3
"""
Test script để kiểm tra encoding
"""

import sys
import os

def test_encoding():
    """Test encoding configuration"""
    print("Testing encoding configuration...")
    
    # Cấu hình encoding cho stdout
    if sys.platform.startswith('win'):
        import codecs
        sys.stdout = codecs.getwriter('utf-8')(sys.stdout.detach())
        sys.stderr = codecs.getwriter('utf-8')(sys.stderr.detach())
        print("Encoding configured for Windows")
    
    # Test các ký tự tiếng Việt
    test_strings = [
        "Test English",
        "Test Vietnamese: Sử dụng thiết bị",
        "Test special chars: á à ả ã ạ",
        "Test numbers: 12345",
        "Test symbols: @#$%^&*()"
    ]
    
    for test_str in test_strings:
        try:
            print(f"Testing: {test_str}")
        except Exception as e:
            print(f"Encoding error: {e}")
            return False
    
    print("All encoding tests passed!")
    return True

def test_yolov5_import():
    """Test import YOLOv5 với encoding"""
    print("\nTesting YOLOv5 import with encoding...")
    
    # Thêm YOLOv5 vào sys.path
    YOLOV5_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), 'models/yolov5'))
    
    if not os.path.exists(YOLOV5_PATH):
        print(f"YOLOv5 directory not found: {YOLOV5_PATH}")
        return False
    
    if YOLOV5_PATH not in sys.path:
        sys.path.insert(0, YOLOV5_PATH)
    
    # Thay đổi working directory
    original_cwd = os.getcwd()
    os.chdir(YOLOV5_PATH)
    
    try:
        from models.common import DetectMultiBackend
        from utils.general import non_max_suppression, scale_coords
        from utils.torch_utils import select_device
        
        device = select_device('cpu')
        print(f"Using device: {device}")
        print("YOLOv5 imports successful!")
        return True
    except Exception as e:
        print(f"YOLOv5 import error: {e}")
        return False
    finally:
        os.chdir(original_cwd)

def main():
    print("Encoding Test")
    print("=" * 50)
    
    # Test encoding
    encoding_success = test_encoding()
    
    # Test YOLOv5 import
    yolov5_success = test_yolov5_import()
    
    print("\n" + "=" * 50)
    if encoding_success and yolov5_success:
        print("All tests passed!")
        print("System is ready for plate detection.")
        return 0
    else:
        print("Some tests failed!")
        return 1

if __name__ == "__main__":
    sys.exit(main()) 