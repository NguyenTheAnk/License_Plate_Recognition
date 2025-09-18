# Hướng dẫn tích hợp Camera với Route Monitoring

## Tổng quan
Tính năng này cho phép hiển thị camera icons chỉ ở những vị trí thực sự có camera đang hoạt động.

## Các thay đổi chính

### 1. Quản lý trạng thái camera
- Sử dụng `cameraStateRef` để lưu trữ danh sách camera đang hoạt động
- Hỗ trợ cập nhật động danh sách camera

### 2. Hàm `getActiveCameras()`
```javascript
const getActiveCameras = async () => {
  try {
    // Thay thế bằng API call thực tế:
    // const response = await fetch('/api/cameras/active');
    // const data = await response.json();
    // return data.cameras.map(camera => camera.location);
    
    return cameraStateRef.current.activeCameras;
  } catch (error) {
    console.error('Lỗi khi lấy danh sách camera:', error);
    return [];
  }
};
```

### 3. Hàm `createCameraIcons()`
- Tự động xóa camera cũ trước khi tạo mới
- Chỉ tạo camera icons cho những vị trí có camera thực sự
- Lưu trữ camera data để có thể quản lý sau này

### 4. Các nút điều khiển
- **Refresh Cameras**: Cập nhật danh sách camera từ API
- **Test (Tắt một số camera)**: Test tính năng bằng cách tắt một số camera

## Cách tích hợp với API thực tế

### Bước 1: Cập nhật hàm `getActiveCameras()`
```javascript
const getActiveCameras = async () => {
  try {
    const response = await fetch('/api/cameras/active');
    const data = await response.json();
    return data.cameras.map(camera => camera.location);
  } catch (error) {
    console.error('Lỗi khi lấy danh sách camera:', error);
    return [];
  }
};
```

### Bước 2: Cập nhật API endpoint
Tạo endpoint `/api/cameras/active` trả về:
```json
{
  "cameras": [
    { "location": "C", "status": "active" },
    { "location": "E", "status": "active" },
    { "location": "G", "status": "inactive" }
  ]
}
```

### Bước 3: Tự động cập nhật
Thêm polling để tự động cập nhật camera:
```javascript
// Cập nhật camera mỗi 30 giây
setInterval(() => {
  createCameraIcons();
}, 30000);
```

## Các hàm tiện ích

### `window.updateCameras()`
Cập nhật camera từ bên ngoài component:
```javascript
window.updateCameras();
```

### `window.toggleCamera(cityName)`
Bật/tắt camera tại vị trí cụ thể:
```javascript
window.toggleCamera('C'); // Toggle camera tại vị trí C
```

## Lưu ý
- Camera icons sẽ tự động được xóa và tạo lại mỗi khi cập nhật
- Chỉ những vị trí có trong `activeCameras` mới hiển thị camera icon
- Hỗ trợ xử lý lỗi khi API không khả dụng
