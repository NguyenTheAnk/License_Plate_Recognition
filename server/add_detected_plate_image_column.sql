-- Script để thêm cột detected_plate_image vào bảng vehicle_whitelist
-- Chạy script này để hỗ trợ lưu ảnh biển số đã phát hiện từ OCR

USE lpdb;

-- Thêm cột detected_plate_image để lưu đường dẫn ảnh biển số đã phát hiện
ALTER TABLE vehicle_whitelist 
ADD COLUMN detected_plate_image VARCHAR(500) NULL 
COMMENT 'Đường dẫn ảnh biển số đã phát hiện từ OCR' 
AFTER plate_image_path;

-- Thêm index để tối ưu truy vấn
CREATE INDEX idx_detected_plate_image ON vehicle_whitelist(detected_plate_image);

-- Cập nhật comment cho bảng
ALTER TABLE vehicle_whitelist 
COMMENT = 'Bảng danh sách trắng phương tiện - hỗ trợ lưu ảnh biển số đã phát hiện';

-- Hiển thị cấu trúc bảng sau khi cập nhật
DESCRIBE vehicle_whitelist; 