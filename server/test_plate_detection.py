#!/usr/bin/env python3
"""
Script test để kiểm tra việc phát hiện và lưu ảnh biển số
"""

import os
import sys
import json
import subprocess
from pathlib import Path

def test_plate_detection():
    # Đường dẫn đến script detect_plate.py
    script_path = os.path.join(os.path.dirname(__file__), 'controllers', 'WhiteList', 'detect_plate.py')
    
    # Tạo một ảnh test đơn giản (nếu không có ảnh nào)
    test_image_path = os.path.join(os.path.dirname(__file__), 'public', 'uploads', 'test_image.jpg')
    
    # Kiểm tra xem có ảnh test nào không
    if not os.path.exists(test_image_path):
        print("Không tìm thấy ảnh test. Hãy tạo một ảnh test trước.")
        return False
    
    print(f"Testing plate detection with image: {test_image_path}")
    print(f"Script path: {script_path}")
    
    try:
        # Chạy script detect_plate.py
        cmd = [
            sys.executable,  # Sử dụng Python interpreter hiện tại
            script_path,
            '--image', test_image_path,
            '--save-crop'
        ]
        
        print(f"Running command: {' '.join(cmd)}")
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=os.path.dirname(__file__)
        )
        
        print(f"Return code: {result.returncode}")
        print(f"STDOUT:\n{result.stdout}")
        print(f"STDERR:\n{result.stderr}")
        
        if result.returncode == 0:
            # Parse kết quả JSON
            lines = result.stdout.strip().split('\n')
            if lines:
                try:
                    last_line = lines[-1]
                    ocr_result = json.loads(last_line)
                    print(f"Parsed result: {json.dumps(ocr_result, indent=2)}")
                    
                    if ocr_result.get('detected_plate_image'):
                        detected_path = ocr_result['detected_plate_image']
                        full_path = os.path.join(os.path.dirname(__file__), 'public', detected_path.lstrip('/'))
                        print(f"Detected plate image should be at: {full_path}")
                        print(f"File exists: {os.path.exists(full_path)}")
                        return True
                    else:
                        print("No detected_plate_image in result")
                        return False
                except json.JSONDecodeError as e:
                    print(f"Failed to parse JSON: {e}")
                    return False
        else:
            print("Script failed to run")
            return False
            
    except Exception as e:
        print(f"Error running test: {e}")
        return False

def check_directories():
    """Kiểm tra các thư mục cần thiết"""
    base_dir = os.path.dirname(__file__)
    
    directories = [
        os.path.join(base_dir, 'public', 'uploads'),
        os.path.join(base_dir, 'public', 'uploads', 'whitelist'),
        os.path.join(base_dir, 'public', 'uploads', 'whitelist', 'detected_plates')
    ]
    
    print("Checking directories:")
    for dir_path in directories:
        exists = os.path.exists(dir_path)
        print(f"  {dir_path}: {'EXISTS' if exists else 'MISSING'}")
        if not exists:
            try:
                os.makedirs(dir_path, exist_ok=True)
                print(f"    Created directory: {dir_path}")
            except Exception as e:
                print(f"    Failed to create directory: {e}")

def check_model_file():
    """Kiểm tra file model YOLOv5"""
    base_dir = os.path.dirname(__file__)
    model_path = os.path.join(base_dir, 'models', 'LP_detector_nano_61.pt')
    
    print(f"Checking model file: {model_path}")
    exists = os.path.exists(model_path)
    print(f"  Model exists: {exists}")
    
    if exists:
        size = os.path.getsize(model_path)
        print(f"  Model size: {size:,} bytes ({size/1024/1024:.1f} MB)")
    
    return exists

if __name__ == '__main__':
    print("=== Plate Detection Test ===")
    
    # Kiểm tra thư mục
    check_directories()
    print()
    
    # Kiểm tra model
    check_model_file()
    print()
    
    # Test detection
    success = test_plate_detection()
    
    if success:
        print("\n✅ Test PASSED - Plate detection working correctly")
    else:
        print("\n❌ Test FAILED - Plate detection not working") 