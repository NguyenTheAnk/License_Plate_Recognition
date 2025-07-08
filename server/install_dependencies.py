#!/usr/bin/env python3
"""
Script cài đặt dependencies cho hệ thống License Plate Recognition
"""

import subprocess
import sys
import os

def install_package(package):
    """Cài đặt một package Python"""
    try:
        print(f"Installing {package}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", package])
        print(f"✅ {package} installed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to install {package}: {e}")
        return False

def main():
    print("License Plate Recognition - Dependencies Installation")
    print("=" * 60)
    
    # Danh sách các package cần thiết
    packages = [
        "torch>=1.7.0",
        "torchvision>=0.8.1", 
        "numpy>=1.18.5",
        "opencv-python>=4.1.1",
        "Pillow>=7.1.2",
        "PyYAML>=5.3.1",
        "matplotlib>=3.2.2",
        "tqdm>=4.41.0",
        "paddlepaddle>=2.4.0",
        "paddleocr>=2.6.0"
    ]
    
    print("Installing required packages...")
    print()
    
    success_count = 0
    total_count = len(packages)
    
    for package in packages:
        if install_package(package):
            success_count += 1
        print()
    
    print("=" * 60)
    print(f"Installation completed: {success_count}/{total_count} packages installed successfully")
    
    if success_count == total_count:
        print("✅ All dependencies installed successfully!")
        print("System is ready for license plate recognition.")
    else:
        print("⚠️ Some packages failed to install.")
        print("Please check the error messages above and try installing manually.")
    
    print("\nNext steps:")
    print("1. Run: python test_import.py")
    print("2. Run: python test_plate_detection.py")
    print("3. Start your Node.js server")

if __name__ == "__main__":
    main() 