# License Plate Recognition - Setup Guide

## Tổng quan

Hệ thống License Plate Recognition sử dụng:
- **YOLOv5** (`LP_detector_nano_61.pt`) để phát hiện biển số xe
- **PaddleOCR** để nhận diện ký tự trên biển số
- **Node.js** backend để xử lý API và database

## Cài đặt Dependencies

### 1. Python Dependencies

Chạy script cài đặt tự động:
```bash
cd server
python install_dependencies.py
```

Hoặc cài đặt thủ công:
```bash
pip install torch>=1.7.0 torchvision>=0.8.1
pip install numpy>=1.18.5 opencv-python>=4.1.1
pip install Pillow>=7.1.2 PyYAML>=5.3.1
pip install matplotlib>=3.2.2 tqdm>=4.41.0
pip install paddlepaddle>=2.4.0 paddleocr>=2.6.0
```

### 2. Node.js Dependencies

```bash
cd server
npm install
```

## Kiểm tra Setup

### 1. Test Encoding (Quan trọng cho Windows)
```bash
cd server
python test_encoding.py
```

### 2. Test Python Imports (Đơn giản)
```bash
cd server
python test_simple.py
```

### 3. Test Python Imports (Chi tiết)
```bash
cd server
python test_import.py
```

### 4. Test Plate Detection Module
```bash
cd server
python test_plate_detection.py
```

### 5. Test với ảnh mẫu
```bash
cd server
python test_plate_detection.py --image "path/to/your/image.jpg"
```

## Cấu trúc Files

```
server/
├── models/
│   ├── LP_detector_nano_61.pt    # YOLOv5 model cho plate detection
│   └── yolov5/                   # YOLOv5 source code
├── controllers/WhiteList/
│   ├── detect_plate.py           # Module chính (YOLOv5 + PaddleOCR)
│   ├── plate_detection.py        # Module backup
│   └── createWhiteList.js        # Controller đã được cập nhật
├── requirements.txt              # Python dependencies
├── test_encoding.py              # Test encoding (Windows)
├── test_simple.py                # Test import đơn giản
├── test_import.py                # Test imports chi tiết
├── test_plate_detection.py       # Test plate detection
└── install_dependencies.py       # Auto-install script
```

## Troubleshooting

### 1. UnicodeEncodeError: 'charmap' codec can't encode character
**Nguyên nhân**: Windows sử dụng encoding cp1252 thay vì utf-8
**Giải pháp**: 
- Đã được sửa bằng cách cấu hình stdout encoding
- Chạy `python test_encoding.py` để kiểm tra

### 2. ModuleNotFoundError: No module named 'utils.datasets'
**Nguyên nhân**: YOLOv5 không thể tìm thấy module utils khi import
**Giải pháp**: 
- Đã được sửa bằng cách thay đổi working directory
- Chạy `python test_simple.py` để kiểm tra

### 3. ModuleNotFoundError: No module named 'models'
**Nguyên nhân**: Đường dẫn YOLOv5 không đúng
**Giải pháp**: 
- Kiểm tra thư mục `server/models/yolov5/` có tồn tại
- Chạy `python test_simple.py` để kiểm tra

### 4. PaddleOCR installation error
**Nguyên nhân**: PaddleOCR cần nhiều dependencies
**Giải pháp**:
```bash
pip install paddlepaddle --upgrade
pip install paddleocr --upgrade
```

### 5. CUDA/GPU errors
**Nguyên nhân**: Model đang cố gắng sử dụng GPU
**Giải pháp**: 
- Model đã được cấu hình để sử dụng CPU
- Nếu vẫn lỗi, kiểm tra PyTorch installation

### 6. Model file not found
**Nguyên nhân**: File `LP_detector_nano_61.pt` không tồn tại
**Giải pháp**:
- Kiểm tra file có trong `server/models/`
- File size phải khoảng 3.6MB

## Sử dụng

### 1. Khởi động Server
```bash
cd server
npm start
```

### 2. Upload ảnh qua API
```bash
# Tạo whitelist với ảnh
POST /api/whitelist
Content-Type: multipart/form-data

# OCR preview
POST /api/whitelist/ocr-preview
Content-Type: multipart/form-data
```

### 3. Test trực tiếp Python script
```bash
cd server
python controllers/WhiteList/detect_plate.py --image "path/to/image.jpg"
```

## Performance

- **Model loading**: ~2-3 giây (chỉ lần đầu)
- **Detection**: ~100-200ms
- **Recognition**: ~200-500ms
- **Total**: ~300-700ms per image

## Monitoring

### Console Logs
```
Using device: cpu
Loading YOLOv5 model from: /path/to/LP_detector_nano_61.pt
Detecting license plate...
License plate detected, recognizing characters...
```

### API Response
```json
{
  "success": true,
  "text": "51A-12345",
  "bbox": {
    "x1": 100, "y1": 200, "x2": 300, "y2": 250,
    "confidence": 0.95
  },
  "method": "yolov5_detection_paddleocr_recognition"
}
```

## Technical Details

### Import Strategy
Để tránh lỗi import YOLOv5, hệ thống sử dụng:
1. Thêm YOLOv5 path vào `sys.path`
2. Thay đổi working directory tạm thời
3. Import các module cần thiết
4. Khôi phục working directory

### Encoding Strategy
Để tránh lỗi encoding trên Windows:
1. Cấu hình stdout và stderr với utf-8 encoding
2. Thay thế các ký tự tiếng Việt bằng tiếng Anh
3. Sử dụng JSON response cho API

### Error Handling
- Tất cả lỗi import được catch và xử lý
- Fallback mechanism cho OCR
- Detailed error messages cho debugging

## Support

Nếu gặp vấn đề:
1. Chạy `python test_encoding.py` để kiểm tra encoding (Windows)
2. Chạy `python test_simple.py` để kiểm tra imports cơ bản
3. Chạy `python test_import.py` để kiểm tra imports chi tiết
4. Chạy `python test_plate_detection.py` để test module
5. Kiểm tra console logs
6. Đảm bảo tất cả dependencies đã được cài đặt
7. Kiểm tra model files có đầy đủ không 