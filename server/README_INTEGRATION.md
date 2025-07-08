# License Plate Recognition - YOLOv5 + PaddleOCR Integration

## Tổng quan

Hệ thống nhận diện biển số xe đã được tích hợp với:
- **YOLOv5** (`LP_detector_nano_61.pt`) để phát hiện biển số
- **PaddleOCR** để nhận diện ký tự trên biển số
- Chỉ xử lý **hình ảnh** (không phải video)

## Cấu trúc hệ thống

```
server/
├── controllers/WhiteList/
│   └── detect_plate.py          # Script detection chính
├── models/
│   ├── LP_detector_nano_61.pt   # Model YOLOv5 cho detection
│   └── LP_ocr_nano_62.pt        # Model YOLOv5 cho OCR (không sử dụng)
├── yolov5/                      # Thư mục YOLOv5 repository
│   ├── models/
│   ├── utils/
│   └── ...
├── test_integration.py          # Script test Python
├── test_integration.ps1         # Script test PowerShell
└── README_INTEGRATION.md        # File này
```

## Cách hoạt động

### 1. Phát hiện biển số (Detection)
- Sử dụng model YOLOv5 `LP_detector_nano_61.pt`
- Input: Hình ảnh gốc
- Output: Bounding box của biển số

### 2. Nhận diện ký tự (Recognition)
- Sử dụng PaddleOCR với ngôn ngữ tiếng Việt
- Input: Vùng ảnh đã crop từ bước 1
- Output: Text của biển số

### 3. Fallback mechanism
- Nếu không phát hiện được biển số hoặc nhận diện rỗng
- Chạy PaddleOCR trên toàn bộ hình ảnh
- Trả về kết quả nhận diện toàn ảnh

## Yêu cầu hệ thống

### Python Environment
- Python 3.8 - 3.11 (không hỗ trợ Python 3.12 trên Windows)
- PyTorch
- OpenCV (cv2)
- PaddleOCR
- NumPy

### Model Files
- `LP_detector_nano_61.pt` - Model YOLOv5 cho detection
- Thư mục `yolov5/` với đầy đủ source code

## Cài đặt

### 1. Tạo virtual environment (khuyến nghị)
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux/Mac
python3 -m venv venv
source venv/bin/activate
```

### 2. Cài đặt dependencies
```bash
pip install torch torchvision
pip install opencv-python
pip install paddlepaddle
pip install paddleocr
pip install numpy
```

### 3. Kiểm tra cài đặt
```bash
# Windows PowerShell
.\test_integration.ps1

# Linux/Mac
python test_integration.py
```

## Sử dụng

### 1. Test với ảnh
```bash
# Windows PowerShell
.\test_integration.ps1 -ImagePath "path\to\your\image.jpg"

# Linux/Mac
python test_integration.py --image "path/to/your/image.jpg"
```

### 2. Sử dụng trong code
```python
import sys
import os
sys.path.append('controllers/WhiteList')
from detect_plate import detect_plate_yolov5, recognize_plate_paddleocr

# Phát hiện biển số
plate_img, bbox, orig_img = detect_plate_yolov5("image.jpg", model)

# Nhận diện ký tự
text = recognize_plate_paddleocr(plate_img)
```

### 3. Sử dụng command line
```bash
python controllers/WhiteList/detect_plate.py --image "path/to/image.jpg"
```

## API Response Format

### Success Response
```json
{
  "success": true,
  "text": "51A-12345",
  "bbox": {
    "x1": 100,
    "y1": 200,
    "x2": 300,
    "y2": 250,
    "confidence": 0.95
  },
  "method": "yolov5_detection_paddleocr_recognition"
}
```

### Fallback Response
```json
{
  "success": true,
  "text": "51A-12345",
  "bbox": null,
  "method": "full_image_paddleocr_recognition",
  "message": "Không phát hiện được biển số, sử dụng nhận diện toàn ảnh."
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description"
}
```

## Troubleshooting

### 1. PyTorch DLL Error trên Windows
**Lỗi**: `ImportError: DLL load failed while importing torch`
**Giải pháp**: 
- Sử dụng Python 3.8-3.11 (không dùng Python 3.12)
- Cài đặt lại PyTorch: `pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu`

### 2. Model không tìm thấy
**Lỗi**: `Model file not found`
**Giải pháp**:
- Kiểm tra file `LP_detector_nano_61.pt` có trong thư mục `models/`
- Kiểm tra thư mục `yolov5/` có đầy đủ source code

### 3. YOLOv5 import error
**Lỗi**: `ModuleNotFoundError: No module named 'yolov5'`
**Giải pháp**:
- Kiểm tra thư mục `yolov5/` có tồn tại
- Kiểm tra các file `models/common.py`, `utils/general.py`, `utils/torch_utils.py`

### 4. PaddleOCR error
**Lỗi**: `PaddleOCR initialization failed`
**Giải pháp**:
- Cài đặt lại PaddleOCR: `pip install paddleocr --upgrade`
- Kiểm tra kết nối internet để download model

## Performance

### Tối ưu hóa
- Sử dụng CPU inference để tránh lỗi CUDA
- Model YOLOv5 nano nhẹ, phù hợp cho real-time
- PaddleOCR có thể cache model để tăng tốc

### Thời gian xử lý
- Detection: ~100-200ms
- Recognition: ~200-500ms
- Tổng thời gian: ~300-700ms per image

## Tích hợp với hệ thống hiện tại

Hệ thống đã được tích hợp sẵn với:
- Controller `createWhiteList.js`
- API endpoint `/ocr-preview`
- Upload và xử lý ảnh tự động

Không cần thay đổi code frontend, hệ thống sẽ tự động sử dụng YOLOv5 + PaddleOCR.

## Monitoring và Logging

Script detection có logging chi tiết:
- Thông tin về device sử dụng
- Quá trình load model
- Kết quả detection và recognition
- Error messages chi tiết

## Backup và Recovery

### Backup
- Backup thư mục `models/` chứa model files
- Backup thư mục `yolov5/` chứa source code
- Backup script `detect_plate.py`

### Recovery
- Restore các file từ backup
- Chạy test script để kiểm tra
- Restart server nếu cần

## Support

Nếu gặp vấn đề:
1. Chạy script test để kiểm tra
2. Kiểm tra logs trong console
3. Đảm bảo Python version và dependencies đúng
4. Kiểm tra model files có đầy đủ không 