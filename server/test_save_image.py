#!/usr/bin/env python3
"""
Script test đơn giản để kiểm tra việc tạo thư mục và lưu file
"""

import os
import cv2
import numpy as np
import time

def test_save_image():
    print("=== Test Save Image ===")
    
    # Tạo thư mục
    base_dir = os.path.dirname(__file__)
    crop_dir = os.path.join(base_dir, 'public', 'uploads', 'whitelist', 'detected_plates')
    
    print(f"Creating directory: {crop_dir}")
    os.makedirs(crop_dir, exist_ok=True)
    
    if os.path.exists(crop_dir):
        print(f"✅ Directory created successfully: {crop_dir}")
    else:
        print(f"❌ Failed to create directory: {crop_dir}")
        return False
    
    # Tạo ảnh test đơn giản
    test_image = np.zeros((100, 300, 3), dtype=np.uint8)
    test_image[:] = (255, 255, 255)  # Màu trắng
    
    # Thêm text
    cv2.putText(test_image, 'TEST PLATE', (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
    
    # Tạo tên file
    crop_filename = f"test_detected_{int(time.time())}.jpg"
    crop_path = os.path.join(crop_dir, crop_filename)
    
    print(f"Saving test image to: {crop_path}")
    
    # Lưu ảnh
    success = cv2.imwrite(crop_path, test_image)
    
    if success:
        print(f"✅ Image saved successfully: {crop_path}")
        print(f"File exists: {os.path.exists(crop_path)}")
        
        # Kiểm tra kích thước file
        file_size = os.path.getsize(crop_path)
        print(f"File size: {file_size} bytes")
        
        return True
    else:
        print(f"❌ Failed to save image: {crop_path}")
        return False

if __name__ == '__main__':
    success = test_save_image()
    if success:
        print("\n✅ Test PASSED")
    else:
        print("\n❌ Test FAILED") 