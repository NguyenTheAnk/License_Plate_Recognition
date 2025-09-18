# Tính năng Tìm kiếm Hành trình Biển số Xe

## Mô tả
Tính năng này cho phép tìm kiếm và hiển thị hành trình của một biển số xe cụ thể trên bản đồ 3D, dựa trên dữ liệu từ bảng `license_plate_detections`.

## Cách sử dụng

### 1. Tìm kiếm biển số xe
- Nhập biển số xe vào ô tìm kiếm (VD: `30A3-9054`)
- Nhấn nút 🔍 hoặc Enter để tìm kiếm
- Hệ thống sẽ tự động vẽ đường đi trên map 3D

### 2. Xem thông tin chi tiết
- **Đường đi**: Đường màu sắc gradient nối các camera mà xe đã đi qua
- **Điểm đánh dấu**: Các điểm màu cam (🔶) tại vị trí camera
- **Click vào điểm cam**: Xem thông tin chi tiết về detections tại camera đó

### 3. Thông tin hiển thị
- Số lượng phát hiện
- Thời gian đầu tiên và cuối cùng
- Số camera đã đi qua
- Chi tiết từng detection (thời gian, độ tin cậy, loại xe)

### 4. Xóa đường đi
- Nhấn nút 🗑️ để xóa đường đi hiện tại
- Hoặc tìm kiếm biển số mới

## API Endpoints

### GET /api/plates/search-route
Tìm kiếm hành trình biển số xe

**Parameters:**
- `plate_number` (string): Biển số xe cần tìm

**Response:**
```json
{
  "success": true,
  "message": "Tìm thấy dữ liệu hành trình",
  "data": [
    {
      "id": 825,
      "plate_number": "30A3-9054",
      "camera_id": "12",
      "detected_at": "2025-08-20 22:59:13",
      "confidence_score": 0.8287,
      "camera_name": "Camera 1",
      "map_x": 39.5,
      "map_y": 72,
      "location_name": "Location 1"
    }
  ]
}
```

### GET /api/plates/route-stats
Lấy thống kê hành trình biển số xe

**Parameters:**
- `plate_number` (string): Biển số xe cần thống kê

## Cấu trúc dữ liệu

### Bảng license_plate_detections
Các trường quan trọng:
- `plate_number`: Biển số xe
- `camera_id`: ID camera phát hiện
- `detected_at`: Thời gian phát hiện
- `confidence_score`: Độ tin cậy
- `detected_vehicle_type`: Loại xe
- `raw_plate_text`: Text thô từ OCR

### Bảng cameras
Các trường quan trọng:
- `id`: ID camera
- `display_name`: Tên hiển thị
- `map_x`, `map_y`: Tọa độ trên map
- `location_name`: Tên vị trí

## Tính năng kỹ thuật

### 1. Vẽ đường đi 3D
- Sử dụng Three.js Line geometry
- Màu sắc gradient theo thứ tự thời gian
- Độ cao 1 unit trên mặt đất

### 2. Điểm đánh dấu
- Hình cầu màu cam
- Click để xem thông tin chi tiết
- Hiển thị thông tin detection tại camera

### 3. Tương tác
- Click vào camera: Xem video stream
- Click vào route marker: Xem chi tiết detections
- Bay đến vị trí đầu tiên sau khi tìm kiếm

## Lưu ý
- Cần có dữ liệu trong bảng `license_plate_detections`
- Camera phải có tọa độ `map_x`, `map_y` để hiển thị trên map
- Hệ thống tự động sắp xếp theo thời gian phát hiện
