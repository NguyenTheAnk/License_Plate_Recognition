# Hướng dẫn Debug - Vấn đề ảnh detected không lưu được

## Vấn đề
Khi upload ảnh biển số, ảnh detected không được lưu vào database và không hiển thị được trên giao diện.

## Các bước debug

### 1. Chạy script fix database
```bash
cd server
node fix_database.js
```

Script này sẽ:
- Kiểm tra cột `detected_plate_image` có tồn tại trong database không
- Tạo cột nếu thiếu
- Tạo các thư mục upload cần thiết
- Kiểm tra file model YOLOv5

### 2. Chạy script test lưu ảnh
```bash
cd server
python test_save_image.py
```

Script này sẽ:
- Tạo thư mục `detected_plates`
- Tạo ảnh test và lưu vào thư mục
- Kiểm tra file có được lưu thành công không

### 3. Chạy script debug whitelist
```bash
cd server
node debug_whitelist.js
```

Script này sẽ:
- Kiểm tra cấu trúc database
- Xem dữ liệu whitelist hiện tại
- Test Python detection script
- Kiểm tra các thư mục và file

### 4. Kiểm tra logs khi upload ảnh
Khi upload ảnh mới, kiểm tra console logs của server để xem:
- Debug logs từ `createWhiteList.js`
- Debug logs từ `detect_plate.py`
- Có lỗi gì xảy ra không

### 5. Kiểm tra thư mục uploads
Đảm bảo các thư mục sau tồn tại:
```
server/public/uploads/
server/public/uploads/whitelist/
server/public/uploads/whitelist/detected_plates/
```

### 6. Kiểm tra file model
Đảm bảo file model YOLOv5 tồn tại:
```
server/models/LP_detector_nano_61.pt
```

## Các vấn đề có thể gặp

### 1. Cột database thiếu
Nếu cột `detected_plate_image` không tồn tại, chạy:
```sql
ALTER TABLE vehicle_whitelist 
ADD COLUMN detected_plate_image VARCHAR(500) COMMENT 'Đường dẫn ảnh biển số đã phát hiện';
```

### 2. Thư mục không tồn tại
Tạo thủ công các thư mục:
```bash
mkdir -p server/public/uploads/whitelist/detected_plates
```

### 3. Python script lỗi
Kiểm tra:
- Python có được cài đặt không
- Các thư viện cần thiết (opencv-python, paddleocr, torch)
- File model YOLOv5 có tồn tại không

### 4. Quyền truy cập file
Đảm bảo server có quyền:
- Đọc file ảnh upload
- Ghi file ảnh detected
- Tạo thư mục

## Cách test

1. Upload một ảnh biển số mới
2. Kiểm tra console logs
3. Kiểm tra database có lưu `detected_plate_image` không
4. Kiểm tra file ảnh có được tạo trong thư mục `detected_plates` không
5. Kiểm tra giao diện có hiển thị ảnh detected không

## Logs cần kiểm tra

### Server logs
- `[DEBUG] Processing uploaded image:`
- `[DEBUG] Python script output:`
- `[DEBUG] Detected plate image saved at:`
- `[DEBUG] Database insert values:`

### Python script logs
- `[DEBUG] Creating directory:`
- `[DEBUG] Detected plate image saved to:`
- `[DEBUG] Returning relative path:`

## Liên hệ
Nếu vẫn gặp vấn đề, hãy chạy các script debug và gửi kết quả để được hỗ trợ thêm. 