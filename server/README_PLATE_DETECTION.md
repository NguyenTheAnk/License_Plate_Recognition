# Plate Detection Module - Tích hợp YOLOv5 + PaddleOCR

## Tổng quan

Module `detect_plate.py` đã được tích hợp logic từ file `test.py` để xử lý nhận diện biển số xe trong việc thêm mới WhiteList. Module này sử dụng:

- **YOLOv5** (`LP_detector_nano_61.pt`) để phát hiện biển số
- **PaddleOCR** để nhận diện ký tự trên biển số
- Chỉ xử lý **hình ảnh** (không phải video)

## Tính năng chính

### 1. Phát hiện biển số
- Sử dụng mô hình YOLOv5 đã được train chuyên biệt cho biển số xe
- Trả về kết quả tốt nhất dựa trên confidence score

### 2. Nhận diện ký tự thông minh
- Sử dụng PaddleOCR với ngôn ngữ tiếng Việt
- Xử lý các trường hợp biển số bị nghiêng, mờ

### 3. Fallback mechanism
- Nếu không phát hiện được biển số → nhận diện toàn ảnh
- Nếu phát hiện được nhưng không nhận diện được ký tự → nhận diện toàn ảnh

### 4. Thông tin chi tiết
- Confidence score cho detection
- Bounding box coordinates
- Method sử dụng (detection + OCR hoặc full image OCR)

## Cấu trúc module

```
server/controllers/WhiteList/
├── detect_plate.py             # Module chính (YOLOv5 + PaddleOCR)
├── plate_detection.py          # Module cũ (backup)
└── createWhiteList.js          # Controller đã được cập nhật
```

## API Response Format

### Success Response (Detection + OCR)
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

### Fallback Response (Full Image OCR)
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

## Tích hợp với WhiteList

### 1. Tự động nhận diện khi upload ảnh
Khi thêm mới WhiteList với ảnh biển số, hệ thống sẽ:
- Tự động chạy detection và recognition
- Lưu kết quả OCR vào database
- Trả về thông tin chi tiết về quá trình nhận diện

### 2. OCR Preview
API `/ocr-preview` cũng đã được cập nhật để sử dụng module mới:
- Hiển thị kết quả nhận diện real-time
- Thông tin về method và confidence
- Hỗ trợ bounding box information

### 3. Response mở rộng
Controller trả về thông tin chi tiết hơn:
```json
{
  "success": true,
  "message": "Tạo whitelist thành công",
  "data": {
    "id": 123,
    "ocr_text": "51A-12345",
    "plate_image_path": "/uploads/whitelist/image.jpg",
    "ocr_details": {
      "method": "yolov5_detection_paddleocr_recognition",
      "confidence": 0.95,
      "bbox": {...},
      "message": "..."
    }
  }
}
```

## Testing

### 1. Test cơ bản
```bash
# Windows PowerShell
.\test_plate_detection.ps1

# Linux/Mac
python test_plate_detection.py
```

### 2. Test với ảnh
```bash
# Windows PowerShell
.\test_plate_detection.ps1 -ImagePath "path\to\your\image.jpg"

# Linux/Mac
python test_plate_detection.py --image "path/to/your/image.jpg"
```

### 3. Test trực tiếp module
```bash
python controllers/WhiteList/detect_plate.py --image "path/to/image.jpg"
```

## Performance

### Tối ưu hóa
- Sử dụng CPU inference để tránh lỗi CUDA
- Model YOLOv5 nano nhẹ, phù hợp cho real-time
- PaddleOCR có thể cache model để tăng tốc

### Thời gian xử lý
- Model initialization: ~2-3 giây (chỉ lần đầu)
- Detection: ~100-200ms
- Recognition: ~200-500ms
- Tổng thời gian: ~300-700ms per image

## Troubleshooting

### 1. Module không tìm thấy
**Lỗi**: `Module not found: detect_plate.py`
**Giải pháp**: Kiểm tra file có tồn tại trong `controllers/WhiteList/`

### 2. Model không tải được
**Lỗi**: `Model file not found: LP_detector_nano_61.pt`
**Giải pháp**: 
- Kiểm tra file `LP_detector_nano_61.pt` trong thư mục `models/`
- Kiểm tra thư mục `yolov5/` có đầy đủ source code

### 3. PaddleOCR error
**Lỗi**: `PaddleOCR initialization failed`
**Giải pháp**:
- Cài đặt lại PaddleOCR: `pip install paddleocr --upgrade`
- Kiểm tra kết nối internet để download model

### 4. YOLOv5 import error
**Lỗi**: `ModuleNotFoundError: No module named 'yolov5'`
**Giải pháp**:
- Kiểm tra thư mục `yolov5/` có tồn tại
- Kiểm tra các file `models/common.py`, `utils/general.py`, `utils/torch_utils.py`

## Migration từ script cũ

### Thay đổi trong controller
- Thay `plate_detection.py` bằng `detect_plate.py`
- Thêm xử lý thông tin chi tiết từ response
- Cải thiện error handling

### Backward compatibility
- Script `plate_detection.py` vẫn được giữ lại làm backup
- API response format tương thích ngược
- Có thể rollback nếu cần

## Monitoring và Logging

### Console logs
Module sẽ in ra các thông tin quan trọng:
```
Sử dụng thiết bị: cpu
Đang tải mô hình YOLOv5 từ: /path/to/LP_detector_nano_61.pt
Đang phát hiện biển số...
Đã phát hiện biển số, đang nhận diện ký tự...
```

### Error handling
- Tất cả lỗi được catch và trả về JSON response
- Log chi tiết cho debugging
- Fallback mechanism tự động

## Dependencies

### Python packages
Cài đặt các dependencies cần thiết:
```bash
pip install -r requirements.txt
```

### Model files
- `models/LP_detector_nano_61.pt` - YOLOv5 model cho plate detection
- `yolov5/` - YOLOv5 source code
- PaddleOCR models (tự động download)

## Future Improvements

### Planned features
- GPU acceleration support
- Batch processing
- Model quantization
- Real-time video processing
- Multi-language support 