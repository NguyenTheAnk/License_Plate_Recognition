-- ========================================
-- LICENSE PLATE DETECTION SYSTEM DATABASE
-- Complete Schema với tất cả ID đã chuẩn hóa
-- Version: 2.0
-- ========================================

CREATE DATABASE IF NOT EXISTS lpdb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lpdb;

-- ========================================
-- USER MANAGEMENT & PERMISSIONS
-- ========================================

CREATE TABLE IF NOT EXISTS permissions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    module VARCHAR(50) NOT NULL COMMENT 'Module/chức năng',
    action VARCHAR(50) NOT NULL COMMENT 'Hành động',
    code VARCHAR(100) NOT NULL UNIQUE COMMENT 'Mã quyền duy nhất',
    description TEXT COMMENT 'Mô tả quyền',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_module (module),
    INDEX idx_action (action),
    INDEX idx_code (code),
    INDEX idx_active (is_active)
) ENGINE=InnoDB COMMENT = 'Bảng quản lý quyền hạn hệ thống';

CREATE TABLE IF NOT EXISTS roles (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE COMMENT 'Tên vai trò',
    description TEXT COMMENT 'Mô tả vai trò',
    parent_role_id INT UNSIGNED DEFAULT NULL COMMENT 'Vai trò cha (kế thừa quyền)',
    is_default_role BOOLEAN DEFAULT FALSE COMMENT 'Vai trò mặc định',
    level TINYINT UNSIGNED DEFAULT 0 COMMENT 'Cấp độ vai trò (0-255)',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_name (name),
    INDEX idx_level (level),
    INDEX idx_active (is_active)
) ENGINE=InnoDB COMMENT = 'Bảng vai trò người dùng';

-- Thêm foreign key cho roles sau khi tạo bảng
ALTER TABLE roles ADD CONSTRAINT fk_roles_parent 
    FOREIGN KEY (parent_role_id) REFERENCES roles(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS role_permissions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    role_id INT UNSIGNED NOT NULL,
    permission_id INT UNSIGNED NOT NULL,
    granted BOOLEAN DEFAULT TRUE COMMENT 'Cấp phép hay từ chối',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
    UNIQUE KEY uk_role_permission (role_id, permission_id),
    INDEX idx_role_id (role_id),
    INDEX idx_permission_id (permission_id)
) ENGINE=InnoDB COMMENT = 'Bảng phân quyền cho vai trò';

CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL COMMENT 'Họ tên',
    email VARCHAR(100) NOT NULL UNIQUE COMMENT 'Email',
    phone VARCHAR(20) COMMENT 'Số điện thoại',
    password VARCHAR(255) NOT NULL COMMENT 'Mật khẩu đã mã hóa',
    status ENUM('active', 'inactive', 'suspended') DEFAULT 'active' COMMENT 'Trạng thái tài khoản',
    last_login_at DATETIME COMMENT 'Lần đăng nhập cuối',
    last_password_changed_at DATETIME COMMENT 'Lần đổi mật khẩu cuối',
    password_expires_at DATETIME COMMENT 'Ngày hết hạn mật khẩu',
    failed_login_attempts TINYINT UNSIGNED DEFAULT 0 COMMENT 'Số lần đăng nhập thất bại',
    is_account_locked BOOLEAN DEFAULT FALSE COMMENT 'Tài khoản có bị khóa',
    locked_until DATETIME COMMENT 'Khóa tài khoản đến',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_email (email),
    INDEX idx_status (status),
    INDEX idx_phone (phone),
    INDEX idx_locked (is_account_locked)
) ENGINE=InnoDB COMMENT = 'Bảng người dùng hệ thống';

CREATE TABLE IF NOT EXISTS user_roles (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    role_id INT UNSIGNED NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by INT UNSIGNED COMMENT 'Người phân quyền',
    is_active BOOLEAN DEFAULT TRUE,
    expires_at DATETIME COMMENT 'Thời gian hết hạn vai trò',
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY uk_user_role (user_id, role_id),
    INDEX idx_user_id (user_id),
    INDEX idx_role_id (role_id),
    INDEX idx_active (is_active)
) ENGINE=InnoDB COMMENT = 'Bảng phân vai trò cho người dùng';

-- ========================================
-- SYSTEM LOGS & AUDIT
-- ========================================

CREATE TABLE IF NOT EXISTS login_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED COMMENT 'ID người dùng (null nếu đăng nhập thất bại)',
    email VARCHAR(100) NOT NULL COMMENT 'Email đăng nhập',
    ip_address VARCHAR(45) NOT NULL COMMENT 'Địa chỉ IP',
    user_agent TEXT COMMENT 'Thông tin trình duyệt',
    status ENUM('success', 'failed') NOT NULL COMMENT 'Trạng thái đăng nhập',
    failure_reason VARCHAR(255) COMMENT 'Lý do thất bại',
    session_id VARCHAR(128) COMMENT 'ID phiên đăng nhập',
    login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời gian đăng nhập',
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_email (email),
    INDEX idx_status (status),
    INDEX idx_login_at (login_at),
    INDEX idx_ip_address (ip_address)
) ENGINE=InnoDB COMMENT = 'Bảng nhật ký đăng nhập';

-- ========================================
-- LOCATION & INFRASTRUCTURE
-- ========================================

CREATE TABLE IF NOT EXISTS locations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL COMMENT 'Tên vị trí',
    code VARCHAR(20) UNIQUE COMMENT 'Mã vị trí',
    address TEXT COMMENT 'Địa chỉ',
    latitude DECIMAL(10, 8) COMMENT 'Vĩ độ',
    longitude DECIMAL(11, 8) COMMENT 'Kinh độ',
    description TEXT COMMENT 'Mô tả',
    zone_type ENUM('entrance', 'exit', 'checkpoint', 'parking', 'restricted', 'monitoring_zone') DEFAULT 'checkpoint' COMMENT 'Loại khu vực',
    is_restricted BOOLEAN DEFAULT FALSE COMMENT 'Khu vực hạn chế',
    parent_location_id INT UNSIGNED COMMENT 'Vị trí cha',
    
    entry_exit_pair_id INT UNSIGNED COMMENT 'ID cặp vào/ra (cùng ID = cùng khu vực)',
    is_main_entry BOOLEAN DEFAULT FALSE COMMENT 'Là lối vào chính',
    is_main_exit BOOLEAN DEFAULT FALSE COMMENT 'Là lối ra chính',
    max_stay_duration_hours SMALLINT UNSIGNED DEFAULT 24 COMMENT 'Thời gian lưu trú tối đa (giờ)',
    is_alert_on_overstay BOOLEAN DEFAULT TRUE COMMENT 'Cảnh báo khi ở lại quá lâu',
    is_alert_on_no_exit BOOLEAN DEFAULT TRUE COMMENT 'Cảnh báo khi không có bản ghi ra',
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (parent_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    INDEX idx_name (name),
    INDEX idx_code (code),
    INDEX idx_zone_type (zone_type),
    INDEX idx_active (is_active),
    INDEX idx_entry_exit_pair (entry_exit_pair_id)
) ENGINE=InnoDB COMMENT = 'Bảng vị trí/khu vực giám sát';

CREATE TABLE IF NOT EXISTS cameras (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    camera_key VARCHAR(50) NOT NULL UNIQUE COMMENT 'Khóa camera duy nhất',
    camera_id VARCHAR(100) NOT NULL COMMENT 'ID camera từ hệ thống',
    name VARCHAR(200) NOT NULL COMMENT 'Tên camera',
    location_id INT UNSIGNED NOT NULL COMMENT 'Vị trí camera',
    description TEXT COMMENT 'Mô tả chi tiết',
    
    -- Cấu hình kỹ thuật
    type ENUM('h264', 'h265', 'mjpeg', 'rtsp') DEFAULT 'h264' COMMENT 'Loại camera',
    protocol ENUM('rtsp', 'http', 'https', 'onvif') DEFAULT 'rtsp' COMMENT 'Giao thức',
    host VARCHAR(255) NOT NULL DEFAULT '0.0.0.0' COMMENT 'Địa chỉ IP',
    port SMALLINT UNSIGNED DEFAULT 554 COMMENT 'Cổng kết nối',
    path VARCHAR(255) COMMENT 'Đường dẫn stream',
    username VARCHAR(100) COMMENT 'Tên đăng nhập camera',
    password VARCHAR(255) COMMENT 'Mật khẩu camera',
    
    -- Thông số video
    resolution_width SMALLINT UNSIGNED COMMENT 'Chiều rộng video',
    resolution_height SMALLINT UNSIGNED COMMENT 'Chiều cao video', 
    fps TINYINT UNSIGNED COMMENT 'Tốc độ khung hình',
    bitrate INT UNSIGNED COMMENT 'Bitrate (kbps)',
    
    -- Cấu hình lưu trữ và xử lý
    save_directory VARCHAR(255) COMMENT 'Thư mục lưu trữ',
    recording_enabled BOOLEAN DEFAULT TRUE COMMENT 'Bật/tắt ghi hình',
    detection_enabled BOOLEAN DEFAULT TRUE COMMENT 'Bật/tắt nhận diện',
    
    -- Metadata
    tags JSON COMMENT 'Nhãn phân loại (JSON array)',
    configuration JSON COMMENT 'Cấu hình chi tiết (JSON)',
    
    is_active BOOLEAN DEFAULT TRUE,
    last_online_at DATETIME COMMENT 'Lần online cuối',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    INDEX idx_name (name),
    INDEX idx_camera_key (camera_key),
    INDEX idx_location_id (location_id),
    INDEX idx_active (is_active),
    INDEX idx_detection_enabled (detection_enabled)
) ENGINE=InnoDB COMMENT = 'Bảng camera giám sát';

-- ========================================
-- VEHICLE MANAGEMENT
-- ========================================

CREATE TABLE IF NOT EXISTS vehicles (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    plate_number VARCHAR(20) NOT NULL UNIQUE COMMENT 'Biển số xe',
    plate_type ENUM('white', 'blue', 'yellow', 'red', 'military', 'diplomatic') COMMENT 'Loại biển số',
    vehicle_type ENUM('motorcycle', 'car', 'truck', 'bus', 'other') COMMENT 'Loại phương tiện',
    make VARCHAR(50) COMMENT 'Hãng xe',
    model VARCHAR(50) COMMENT 'Dòng xe',
    color VARCHAR(30) COMMENT 'Màu xe',
    year_manufactured YEAR COMMENT 'Năm sản xuất',
    
    -- Thông tin chủ sở hữu
    owner_name VARCHAR(100) COMMENT 'Tên chủ xe',
    owner_phone VARCHAR(20) COMMENT 'SĐT chủ xe',
    owner_email VARCHAR(100) COMMENT 'Email chủ xe',
    owner_address TEXT COMMENT 'Địa chỉ chủ xe',
    
    -- Thông tin đăng ký
    registration_date DATE COMMENT 'Ngày đăng ký',
    registration_expires_at DATE COMMENT 'Ngày hết hạn đăng ký',
    
    notes TEXT COMMENT 'Ghi chú',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_plate_number (plate_number),
    INDEX idx_plate_type (plate_type),
    INDEX idx_vehicle_type (vehicle_type),
    INDEX idx_owner_name (owner_name),
    INDEX idx_active (is_active)
) ENGINE=InnoDB COMMENT = 'Bảng thông tin phương tiện';

CREATE TABLE IF NOT EXISTS vehicle_whitelist (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    location_id INT UNSIGNED NOT NULL COMMENT 'Khu vực áp dụng',
    plate_number VARCHAR(20) NOT NULL COMMENT 'Biển số xe',
    vehicle_id INT UNSIGNED COMMENT 'ID phương tiện',
    
    -- Thông tin liên hệ
    owner_name VARCHAR(200) COMMENT 'Tên chủ phương tiện',
    owner_phone VARCHAR(20) COMMENT 'Số điện thoại chủ phương tiện',
    contact_email VARCHAR(100) COMMENT 'Email liên hệ',
    
    -- Thời gian hiệu lực
    valid_from DATE COMMENT 'Có hiệu lực từ ngày',
    valid_to DATE COMMENT 'Có hiệu lực đến ngày',
    
    -- Metadata
    description TEXT COMMENT 'Ghi chú',
    plate_image_path VARCHAR(500) COMMENT 'Đường dẫn ảnh gốc',
    detected_plate_image VARCHAR(500) COMMENT 'Đường dẫn ảnh biển số đã phát hiện',
    approval_status ENUM('pending', 'approved', 'rejected') DEFAULT 'approved' COMMENT 'Trạng thái phê duyệt',
    
    approved_by INT UNSIGNED COMMENT 'Người phê duyệt',
    approved_at DATETIME COMMENT 'Thời gian phê duyệt',
    
    is_active BOOLEAN DEFAULT TRUE,
    created_by INT UNSIGNED COMMENT 'Người tạo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY uk_whitelist_location_plate (location_id, plate_number),
    INDEX idx_location_id (location_id),
    INDEX idx_plate_number (plate_number),
    INDEX idx_is_active (is_active),
    INDEX idx_valid_period (valid_from, valid_to)
) ENGINE=InnoDB COMMENT = 'Bảng danh sách trắng';

CREATE TABLE IF NOT EXISTS vehicle_blacklist (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    location_id INT UNSIGNED NOT NULL COMMENT 'Khu vực áp dụng',
    plate_number VARCHAR(20) NOT NULL COMMENT 'Biển số xe',
    vehicle_id INT UNSIGNED COMMENT 'ID phương tiện',
    
    -- Thông tin vi phạm
    violation_type ENUM('unauthorized', 'security_threat', 'unpaid_fine', 'banned', 'suspicious', 'other') DEFAULT 'unauthorized' COMMENT 'Loại vi phạm',
    reason TEXT NOT NULL COMMENT 'Lý do cấm',
    severity ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium' COMMENT 'Mức độ nghiêm trọng',
    
    -- Thông tin liên hệ
    owner_name VARCHAR(200) COMMENT 'Tên chủ phương tiện',
    owner_phone VARCHAR(20) COMMENT 'Số điện thoại chủ phương tiện',
    
    -- Thời gian hiệu lực
    valid_from DATE COMMENT 'Có hiệu lực từ ngày',
    valid_to DATE COMMENT 'Có hiệu lực đến ngày',
    
    -- Metadata
    description TEXT COMMENT 'Ghi chú chi tiết',
    evidence_files JSON COMMENT 'Tài liệu bằng chứng (JSON array)',
    
    is_active BOOLEAN DEFAULT TRUE,
    created_by INT UNSIGNED COMMENT 'Người tạo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY uk_blacklist_location_plate (location_id, plate_number),
    INDEX idx_location_id (location_id),
    INDEX idx_plate_number (plate_number),
    INDEX idx_violation_type (violation_type),
    INDEX idx_severity (severity),
    INDEX idx_is_active (is_active),
    INDEX idx_valid_period (valid_from, valid_to)
) ENGINE=InnoDB COMMENT = 'Bảng danh sách đen';

-- ========================================
-- DETECTION & TRACKING
-- ========================================

CREATE TABLE IF NOT EXISTS license_plate_detections (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    detection_uuid VARCHAR(36) NOT NULL UNIQUE COMMENT 'UUID duy nhất cho detection',
    
    -- Thông tin phát hiện
    plate_number VARCHAR(20) NOT NULL COMMENT 'Biển số phát hiện',
    raw_plate_text VARCHAR(50) COMMENT 'Text thô từ OCR',
    camera_id INT UNSIGNED NOT NULL COMMENT 'Camera phát hiện',
    location_id INT UNSIGNED NOT NULL COMMENT 'Vị trí phát hiện',
    vehicle_id INT UNSIGNED COMMENT 'ID phương tiện (nếu đã xác định)',
    
    -- Thời gian và hướng
    detected_at DATETIME NOT NULL COMMENT 'Thời gian phát hiện',
    direction ENUM('inbound', 'outbound', 'unknown') DEFAULT 'unknown' COMMENT 'Hướng di chuyển',
    
    -- Độ tin cậy
    confidence_score DECIMAL(5,4) NOT NULL COMMENT 'Độ tin cậy tổng thể (0-1)',
    ocr_confidence DECIMAL(5,4) COMMENT 'Độ tin cậy OCR (0-1)',
    detection_confidence DECIMAL(5,4) COMMENT 'Độ tin cậy phát hiện vật thể (0-1)',
    
    -- Thông tin hình ảnh
    original_image_path VARCHAR(500) COMMENT 'Đường dẫn ảnh gốc',
    cropped_plate_image_path VARCHAR(500) COMMENT 'Đường dẫn ảnh biển số đã cắt',
    annotated_image_path VARCHAR(500) COMMENT 'Đường dẫn ảnh đã chú thích',
    
    -- Thông tin phương tiện phát hiện
    detected_vehicle_type ENUM('motorcycle', 'car', 'truck', 'bus', 'other') COMMENT 'Loại xe phát hiện',
    detected_vehicle_color VARCHAR(30) COMMENT 'Màu xe phát hiện',
    vehicle_speed DECIMAL(6,2) COMMENT 'Tốc độ (km/h)',
    
    -- Tọa độ bounding box
    bbox_x1 SMALLINT UNSIGNED COMMENT 'Tọa độ X1 của bounding box',
    bbox_y1 SMALLINT UNSIGNED COMMENT 'Tọa độ Y1 của bounding box',
    bbox_x2 SMALLINT UNSIGNED COMMENT 'Tọa độ X2 của bounding box',
    bbox_y2 SMALLINT UNSIGNED COMMENT 'Tọa độ Y2 của bounding box',
    
    -- Xác minh và xử lý
    is_verified BOOLEAN DEFAULT FALSE COMMENT 'Đã xác minh thủ công',
    verified_by INT UNSIGNED COMMENT 'Người xác minh',
    verified_at DATETIME COMMENT 'Thời gian xác minh',
    verification_notes TEXT COMMENT 'Ghi chú xác minh',
    
    -- Cảnh báo
    is_whitelist_match BOOLEAN DEFAULT FALSE COMMENT 'Khớp danh sách trắng',
    is_blacklist_match BOOLEAN DEFAULT FALSE COMMENT 'Khớp danh sách đen',
    alert_triggered BOOLEAN DEFAULT FALSE COMMENT 'Đã kích hoạt cảnh báo',
    
    -- Metadata
    processing_time_ms INT UNSIGNED COMMENT 'Thời gian xử lý (ms)',
    ai_model_version VARCHAR(50) COMMENT 'Phiên bản model AI',
    raw_detection_data JSON COMMENT 'Dữ liệu thô từ AI (JSON)',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE RESTRICT,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
    FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
    
    INDEX idx_plate_number (plate_number),
    INDEX idx_camera_id (camera_id),
    INDEX idx_location_id (location_id),
    INDEX idx_detected_at (detected_at),
    INDEX idx_confidence_score (confidence_score),
    INDEX idx_direction (direction),
    INDEX idx_verified (is_verified),
    INDEX idx_plate_time (plate_number, detected_at DESC),
    INDEX idx_location_time (location_id, detected_at DESC),
    INDEX idx_camera_time (camera_id, detected_at DESC),
    INDEX idx_whitelist_match (is_whitelist_match),
    INDEX idx_blacklist_match (is_blacklist_match),
    INDEX idx_alert_triggered (alert_triggered)
) ENGINE=InnoDB COMMENT = 'Bảng phát hiện biển số xe';

-- ========================================
-- JOURNEY TRACKING
-- ========================================

CREATE TABLE IF NOT EXISTS vehicle_journeys (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    journey_uuid VARCHAR(36) NOT NULL UNIQUE COMMENT 'UUID duy nhất cho journey',
    plate_number VARCHAR(20) NOT NULL COMMENT 'Biển số xe',
    vehicle_id INT UNSIGNED COMMENT 'ID phương tiện',
    
    -- Thời gian
    journey_date DATE NOT NULL COMMENT 'Ngày chuyến đi',
    started_at DATETIME COMMENT 'Thời gian bắt đầu',
    ended_at DATETIME COMMENT 'Thời gian kết thúc',
    
    -- Vị trí
    start_location_id INT UNSIGNED COMMENT 'Vị trí bắt đầu',
    end_location_id INT UNSIGNED COMMENT 'Vị trí kết thúc',
    
    -- Thống kê
    total_duration_minutes INT UNSIGNED COMMENT 'Tổng thời gian (phút)',
    total_distance_km DECIMAL(10,2) COMMENT 'Tổng quãng đường (km)',
    max_speed_kmh DECIMAL(6,2) COMMENT 'Tốc độ tối đa (km/h)',
    avg_speed_kmh DECIMAL(6,2) COMMENT 'Tốc độ trung bình (km/h)',
    detection_count SMALLINT UNSIGNED DEFAULT 0 COMMENT 'Số lần phát hiện',
    location_count SMALLINT UNSIGNED DEFAULT 0 COMMENT 'Số vị trí đi qua',
    
    -- Trạng thái
    status ENUM('active', 'completed', 'incomplete', 'anomaly') DEFAULT 'active' COMMENT 'Trạng thái chuyến đi',
    completion_confidence DECIMAL(3,2) COMMENT 'Độ tin cậy hoàn thành (0-1)',
    
    -- Metadata
    route_data JSON COMMENT 'Dữ liệu lộ trình chi tiết (JSON)',
    anomaly_flags JSON COMMENT 'Các cờ bất thường (JSON array)',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
    FOREIGN KEY (start_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (end_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    INDEX idx_plate_number (plate_number),
    INDEX idx_journey_date (journey_date),
    INDEX idx_started_at (started_at),
    INDEX idx_status (status),
    INDEX idx_vehicle_id (vehicle_id),
    INDEX idx_plate_date (plate_number, journey_date),
    INDEX idx_duration (total_duration_minutes)
) ENGINE=InnoDB COMMENT = 'Bảng chuyến đi của phương tiện';

CREATE TABLE IF NOT EXISTS journey_checkpoints (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    journey_id BIGINT UNSIGNED NOT NULL COMMENT 'ID chuyến đi',
    detection_id BIGINT UNSIGNED NOT NULL COMMENT 'ID bản ghi phát hiện',
    sequence_number SMALLINT UNSIGNED NOT NULL COMMENT 'Thứ tự trong chuyến đi',
    
    -- Thông tin checkpoint
    checkpoint_time DATETIME NOT NULL COMMENT 'Thời gian tại checkpoint',
    location_id INT UNSIGNED NOT NULL COMMENT 'Vị trí',
    camera_id INT UNSIGNED NOT NULL COMMENT 'Camera',
    direction ENUM('inbound', 'outbound', 'unknown') DEFAULT 'unknown',
    
    -- Thống kê di chuyển
    speed_kmh DECIMAL(6,2) COMMENT 'Tốc độ tại checkpoint',
    distance_from_previous_km DECIMAL(10,3) COMMENT 'Khoảng cách từ checkpoint trước (km)',
    time_from_previous_minutes INT UNSIGNED COMMENT 'Thời gian từ checkpoint trước (phút)',
    confidence_score DECIMAL(5,4) COMMENT 'Độ tin cậy phát hiện',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (journey_id) REFERENCES vehicle_journeys(id) ON DELETE CASCADE,
    FOREIGN KEY (detection_id) REFERENCES license_plate_detections(id) ON DELETE CASCADE,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE RESTRICT,
    
    UNIQUE KEY uk_journey_detection (journey_id, detection_id),
    INDEX idx_journey_id (journey_id),
    INDEX idx_detection_id (detection_id),
    INDEX idx_sequence (sequence_number),
    INDEX idx_checkpoint_time (checkpoint_time),
    INDEX idx_location_id (location_id),
    INDEX idx_journey_sequence (journey_id, sequence_number)
) ENGINE=InnoDB COMMENT = 'Bảng điểm kiểm soát trên lộ trình di chuyển';

-- ========================================
-- ENTRY/EXIT TRACKING
-- ========================================

CREATE TABLE IF NOT EXISTS vehicle_entry_exit_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    plate_number VARCHAR(20) NOT NULL COMMENT 'Biển số xe',
    location_id INT UNSIGNED NOT NULL COMMENT 'Vị trí giám sát',
    vehicle_id INT UNSIGNED COMMENT 'ID phương tiện',
    
    -- Thông tin vào
    entry_detection_id BIGINT UNSIGNED COMMENT 'ID bản ghi phát hiện khi vào',
    entry_time DATETIME COMMENT 'Thời gian vào',
    entry_camera_id INT UNSIGNED COMMENT 'Camera phát hiện lúc vào',
    entry_location_id INT UNSIGNED COMMENT 'Vị trí vào cụ thể',
    entry_confidence DECIMAL(5,4) COMMENT 'Độ tin cậy khi phát hiện vào',
    entry_image_path VARCHAR(500) COMMENT 'Ảnh khi vào',
    
    -- Thông tin ra
    exit_detection_id BIGINT UNSIGNED COMMENT 'ID bản ghi phát hiện khi ra',
    exit_time DATETIME COMMENT 'Thời gian ra',
    exit_camera_id INT UNSIGNED COMMENT 'Camera phát hiện lúc ra',
    exit_location_id INT UNSIGNED COMMENT 'Vị trí ra cụ thể',
    exit_confidence DECIMAL(5,4) COMMENT 'Độ tin cậy khi phát hiện ra',
    exit_image_path VARCHAR(500) COMMENT 'Ảnh khi ra',
    
    -- Thông tin tính toán
    duration_minutes INT UNSIGNED COMMENT 'Thời gian lưu trú (phút)',
    duration_hours DECIMAL(6,2) COMMENT 'Thời gian lưu trú (giờ)',
    status ENUM('entered', 'exited', 'overstay', 'no_exit_record', 'anomaly') DEFAULT 'entered' COMMENT 'Trạng thái',
    
    -- Cảnh báo và xử lý
    is_overstay BOOLEAN DEFAULT FALSE COMMENT 'Có ở lại quá lâu',
    is_authorized BOOLEAN DEFAULT NULL COMMENT 'Có được phép (null=chưa kiểm tra)',
    overstay_alert_sent BOOLEAN DEFAULT FALSE COMMENT 'Đã gửi cảnh báo quá giờ',
    no_exit_alert_sent BOOLEAN DEFAULT FALSE COMMENT 'Đã gửi cảnh báo không có bản ghi ra',
    
    -- Metadata
    pair_match_confidence DECIMAL(3,2) COMMENT 'Độ tin cậy ghép cặp vào/ra (0-1)',
    anomaly_score DECIMAL(3,2) COMMENT 'Điểm bất thường (0-1)',
    notes TEXT COMMENT 'Ghi chú',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
    FOREIGN KEY (entry_detection_id) REFERENCES license_plate_detections(id) ON DELETE SET NULL,
    FOREIGN KEY (exit_detection_id) REFERENCES license_plate_detections(id) ON DELETE SET NULL,
    FOREIGN KEY (entry_camera_id) REFERENCES cameras(id) ON DELETE SET NULL,
    FOREIGN KEY (exit_camera_id) REFERENCES cameras(id) ON DELETE SET NULL,
    FOREIGN KEY (entry_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (exit_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    
    INDEX idx_plate_number (plate_number),
    INDEX idx_location (location_id),
    INDEX idx_entry_time (entry_time),
    INDEX idx_exit_time (exit_time),
    INDEX idx_status (status),
    INDEX idx_overstay (is_overstay),
    INDEX idx_plate_location_entry (plate_number, location_id, entry_time DESC),
    INDEX idx_duration (duration_minutes),
    INDEX idx_status_time (status, entry_time DESC),
    INDEX idx_authorized (is_authorized)
) ENGINE=InnoDB COMMENT = 'Bảng theo dõi việc vào/ra của phương tiện';

-- ========================================
-- ALERTS & NOTIFICATIONS
-- ========================================

CREATE TABLE IF NOT EXISTS alerts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    alert_uuid VARCHAR(36) NOT NULL UNIQUE COMMENT 'UUID duy nhất cho alert',
    alert_type ENUM('blacklist_detected', 'unauthorized_access', 'system_error', 'camera_offline', 'speed_violation', 'overstay', 'no_exit_record', 'suspicious_activity', 'multiple_entry', 'custom') NOT NULL COMMENT 'Loại cảnh báo',
    severity ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium' COMMENT 'Mức độ nghiêm trọng',
    
    -- Nội dung cảnh báo
    title VARCHAR(200) NOT NULL COMMENT 'Tiêu đề cảnh báo',
    message TEXT NOT NULL COMMENT 'Nội dung cảnh báo',
    summary VARCHAR(500) COMMENT 'Tóm tắt ngắn gọn',
    
    -- Đối tượng liên quan
    plate_number VARCHAR(20) COMMENT 'Biển số liên quan',
    detection_id BIGINT UNSIGNED COMMENT 'ID phát hiện liên quan',
    camera_id INT UNSIGNED COMMENT 'Camera liên quan',
    location_id INT UNSIGNED COMMENT 'Vị trí liên quan',
    user_id INT UNSIGNED COMMENT 'Người dùng liên quan',
    vehicle_id INT UNSIGNED COMMENT 'Phương tiện liên quan',
    
    -- Dữ liệu chi tiết
    alert_data JSON COMMENT 'Dữ liệu chi tiết (JSON)',
    context_data JSON COMMENT 'Dữ liệu ngữ cảnh (JSON)',
    evidence_files JSON COMMENT 'Danh sách file bằng chứng (JSON array)',
    
    -- Xử lý cảnh báo
    status ENUM('new', 'acknowledged', 'investigating', 'resolved', 'dismissed', 'false_positive') DEFAULT 'new' COMMENT 'Trạng thái xử lý',
    priority_score TINYINT UNSIGNED DEFAULT 50 COMMENT 'Điểm ưu tiên (0-100)',
    
    acknowledged_by INT UNSIGNED COMMENT 'Người xác nhận',
    acknowledged_at DATETIME COMMENT 'Thời gian xác nhận',
    resolved_by INT UNSIGNED COMMENT 'Người giải quyết',
    resolved_at DATETIME COMMENT 'Thời gian giải quyết',
    resolution_notes TEXT COMMENT 'Ghi chú giải quyết',
    resolution_time_minutes INT UNSIGNED COMMENT 'Thời gian giải quyết (phút)',
    
    -- Tự động hóa
    auto_dismiss_at DATETIME COMMENT 'Tự động bỏ qua vào lúc',
    escalation_level TINYINT UNSIGNED DEFAULT 0 COMMENT 'Mức độ leo thang (0-5)',
    escalated_at DATETIME COMMENT 'Thời gian leo thang',
    
    -- Thông báo
    notification_sent BOOLEAN DEFAULT FALSE COMMENT 'Đã gửi thông báo',
    notification_channels JSON COMMENT 'Kênh thông báo đã gửi (JSON array)',
    notification_attempts TINYINT UNSIGNED DEFAULT 0 COMMENT 'Số lần thử gửi thông báo',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (detection_id) REFERENCES license_plate_detections(id) ON DELETE CASCADE,
    FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE SET NULL,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
    FOREIGN KEY (acknowledged_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
    
    INDEX idx_alert_type (alert_type),
    INDEX idx_severity (severity),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    INDEX idx_plate_number (plate_number),
    INDEX idx_camera_id (camera_id),
    INDEX idx_location_id (location_id),
    INDEX idx_priority_score (priority_score DESC),
    INDEX idx_severity_status_time (severity DESC, status, created_at DESC),
    INDEX idx_escalation (escalation_level, created_at)
) ENGINE=InnoDB COMMENT = 'Bảng cảnh báo hệ thống';

CREATE TABLE IF NOT EXISTS notification_settings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL COMMENT 'Người dùng',
    alert_type ENUM('blacklist_detected', 'unauthorized_access', 'system_error', 'camera_offline', 'speed_violation', 'overstay', 'no_exit_record', 'suspicious_activity', 'multiple_entry', 'custom', 'all') NOT NULL COMMENT 'Loại cảnh báo',
    
    -- Cài đặt kênh thông báo
    email_enabled BOOLEAN DEFAULT TRUE COMMENT 'Bật thông báo email',
    sms_enabled BOOLEAN DEFAULT FALSE COMMENT 'Bật thông báo SMS',
    push_enabled BOOLEAN DEFAULT TRUE COMMENT 'Bật thông báo đẩy',
    webhook_enabled BOOLEAN DEFAULT FALSE COMMENT 'Bật webhook',
    
    -- Cấu hình chi tiết
    min_severity ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium' COMMENT 'Mức độ tối thiểu để thông báo',
    webhook_url VARCHAR(500) COMMENT 'URL webhook',
    webhook_secret VARCHAR(255) COMMENT 'Secret key cho webhook',
    
    -- Lọc theo thời gian và địa điểm
    location_filter JSON COMMENT 'Lọc theo vị trí (JSON array of location_ids)',
    time_filter JSON COMMENT 'Lọc theo thời gian (JSON với start_time, end_time)',
    
    -- Tần suất thông báo
    max_alerts_per_hour TINYINT UNSIGNED DEFAULT 10 COMMENT 'Số cảnh báo tối đa mỗi giờ',
    cooldown_minutes TINYINT UNSIGNED DEFAULT 5 COMMENT 'Thời gian chờ giữa các thông báo (phút)',
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_user_alert_type (user_id, alert_type),
    INDEX idx_user_id (user_id),
    INDEX idx_alert_type (alert_type),
    INDEX idx_active (is_active)
) ENGINE=InnoDB COMMENT = 'Bảng cài đặt thông báo';

-- ========================================
-- SYSTEM AUDIT & LOGS
-- ========================================

CREATE TABLE IF NOT EXISTS access_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED COMMENT 'ID người dùng',
    username VARCHAR(50) COMMENT 'Tên đăng nhập',
    
    -- Thông tin hành động
    action_type ENUM('LOGIN', 'LOGOUT', 'VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'SEARCH', 'UPLOAD', 'DOWNLOAD', 'BACKUP', 'RESTORE') NOT NULL COMMENT 'Loại hành động',
    object_type VARCHAR(50) COMMENT 'Loại đối tượng',
    object_id VARCHAR(100) COMMENT 'ID đối tượng',
    object_name VARCHAR(200) COMMENT 'Tên đối tượng',
    
    -- Dữ liệu thay đổi
    old_values JSON COMMENT 'Giá trị cũ (cho UPDATE)',
    new_values JSON COMMENT 'Giá trị mới (cho UPDATE/CREATE)',
    affected_fields JSON COMMENT 'Danh sách trường bị ảnh hưởng (JSON array)',
    
    -- Kết quả và hiệu suất
    status ENUM('SUCCESS', 'FAILURE', 'PARTIAL') NOT NULL COMMENT 'Trạng thái thực hiện',
    response_time_ms SMALLINT UNSIGNED COMMENT 'Thời gian phản hồi (ms)',
    records_affected INT UNSIGNED COMMENT 'Số bản ghi bị ảnh hưởng',
    
    -- Thông tin kỹ thuật
    ip_address VARCHAR(45) COMMENT 'Địa chỉ IP',
    user_agent TEXT COMMENT 'Thông tin trình duyệt',
    request_method ENUM('GET', 'POST', 'PUT', 'DELETE', 'PATCH') COMMENT 'HTTP method',
    request_url VARCHAR(500) COMMENT 'URL yêu cầu',
    
    -- Chi tiết lỗi và debug
    failure_reason TEXT COMMENT 'Lý do thất bại',
    error_code VARCHAR(50) COMMENT 'Mã lỗi',
    request_data JSON COMMENT 'Dữ liệu yêu cầu (JSON)',
    
    -- Bảo mật
    session_id VARCHAR(128) COMMENT 'ID phiên làm việc',
    csrf_token VARCHAR(128) COMMENT 'CSRF token',
    log_hash VARCHAR(128) COMMENT 'Hash để đảm bảo tính toàn vẹn',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_username (username),
    INDEX idx_action_type (action_type),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    INDEX idx_object_type (object_type),
    INDEX idx_ip_address (ip_address),
    INDEX idx_user_time (user_id, created_at DESC),
    INDEX idx_object_action (object_type, action_type, created_at DESC)
) ENGINE=InnoDB COMMENT = 'Bảng nhật ký truy cập hệ thống';

CREATE TABLE IF NOT EXISTS data_integrity_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    table_name VARCHAR(50) NOT NULL COMMENT 'Tên bảng kiểm tra',
    record_id BIGINT UNSIGNED NOT NULL COMMENT 'ID bản ghi',
    
    -- Thông tin kiểm tra
    check_type ENUM('hash', 'checksum', 'signature', 'foreign_key', 'constraint') DEFAULT 'hash' COMMENT 'Loại kiểm tra',
    original_hash VARCHAR(128) NOT NULL COMMENT 'Hash/checksum gốc',
    current_hash VARCHAR(128) NOT NULL COMMENT 'Hash/checksum hiện tại',
    
    -- Kết quả
    status ENUM('valid', 'invalid', 'missing', 'corrupted') NOT NULL COMMENT 'Trạng thái kiểm tra',
    integrity_score DECIMAL(3,2) COMMENT 'Điểm toàn vẹn (0-1)',
    
    -- Chi tiết
    check_details JSON COMMENT 'Chi tiết kiểm tra (JSON)',
    discrepancies JSON COMMENT 'Danh sách sự khác biệt (JSON)',
    
    -- Metadata
    checked_at DATETIME NOT NULL COMMENT 'Thời gian kiểm tra',
    checked_by INT UNSIGNED COMMENT 'Người thực hiện kiểm tra',
    is_auto_check BOOLEAN DEFAULT TRUE COMMENT 'Kiểm tra tự động',
    check_duration_ms INT UNSIGNED COMMENT 'Thời gian kiểm tra (ms)',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (checked_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_table_name (table_name),
    INDEX idx_record_id (record_id),
    INDEX idx_status (status),
    INDEX idx_checked_at (checked_at),
    INDEX idx_auto_check (is_auto_check),
    INDEX idx_table_status (table_name, status, checked_at DESC)
) ENGINE=InnoDB COMMENT = 'Bảng nhật ký kiểm tra tính toàn vẹn dữ liệu';

-- ========================================
-- SYSTEM CONFIGURATION
-- ========================================

CREATE TABLE IF NOT EXISTS system_settings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE COMMENT 'Khóa cài đặt',
    setting_value TEXT COMMENT 'Giá trị cài đặt',
    setting_type ENUM('string', 'number', 'boolean', 'json', 'password', 'file_path') DEFAULT 'string' COMMENT 'Loại dữ liệu',
    
    -- Phân loại và mô tả
    category VARCHAR(50) DEFAULT 'general' COMMENT 'Danh mục cài đặt',
    subcategory VARCHAR(50) COMMENT 'Danh mục con',
    description TEXT COMMENT 'Mô tả cài đặt',
    display_name VARCHAR(100) COMMENT 'Tên hiển thị',
    
    -- Validation và constraints
    validation_rules JSON COMMENT 'Quy tắc validation (JSON)',
    default_value TEXT COMMENT 'Giá trị mặc định',
    allowed_values JSON COMMENT 'Danh sách giá trị cho phép (JSON array)',
    
    -- Bảo mật và quyền
    is_encrypted BOOLEAN DEFAULT FALSE COMMENT 'Có mã hóa giá trị',
    is_system BOOLEAN DEFAULT FALSE COMMENT 'Cài đặt hệ thống (không cho phép xóa)',
    is_readonly BOOLEAN DEFAULT FALSE COMMENT 'Chỉ đọc',
    required_permission VARCHAR(100) COMMENT 'Quyền cần thiết để chỉnh sửa',
    
    -- Metadata
    environment ENUM('development', 'staging', 'production', 'all') DEFAULT 'all' COMMENT 'Môi trường áp dụng',
    version VARCHAR(20) DEFAULT '1.0.0' COMMENT 'Phiên bản cài đặt',
    last_modified_by INT UNSIGNED COMMENT 'Người chỉnh sửa cuối',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (last_modified_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_setting_key (setting_key),
    INDEX idx_category (category),
    INDEX idx_subcategory (subcategory),
    INDEX idx_is_system (is_system),
    INDEX idx_environment (environment)
) ENGINE=InnoDB COMMENT = 'Bảng cài đặt hệ thống';

CREATE TABLE IF NOT EXISTS watermarks (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE COMMENT 'Tên watermark',
    watermark_type ENUM('text', 'image', 'combined') DEFAULT 'text' COMMENT 'Loại watermark',
    
    -- Cấu hình hình ảnh
    image_path VARCHAR(500) COMMENT 'Đường dẫn ảnh watermark',
    image_format ENUM('PNG', 'JPG', 'SVG') COMMENT 'Định dạng ảnh',
    
    -- Cấu hình text
    text_content VARCHAR(200) COMMENT 'Nội dung text watermark',
    font_family VARCHAR(50) DEFAULT 'Arial' COMMENT 'Font chữ',
    font_size TINYINT UNSIGNED DEFAULT 12 COMMENT 'Kích thước font',
    font_weight ENUM('normal', 'bold', 'lighter') DEFAULT 'normal' COMMENT 'Độ đậm font',
    text_color VARCHAR(7) DEFAULT '#FFFFFF' COMMENT 'Màu chữ (hex)',
    
    -- Vị trí và kích thước
    position ENUM('top-left', 'top-center', 'top-right', 'middle-left', 'middle-center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right', 'custom') DEFAULT 'bottom-right' COMMENT 'Vị trí watermark',
    custom_x_percent DECIMAL(5,2) COMMENT 'Vị trí X tùy chỉnh (phần trăm)',
    custom_y_percent DECIMAL(5,2) COMMENT 'Vị trí Y tùy chỉnh (phần trăm)',
    size_percent TINYINT UNSIGNED DEFAULT 10 COMMENT 'Kích thước theo phần trăm',
    
    -- Hiệu ứng
    opacity DECIMAL(3,2) DEFAULT 0.50 COMMENT 'Độ trong suốt (0-1)',
    rotation_degrees SMALLINT DEFAULT 0 COMMENT 'Góc xoay (độ)',
    background_color VARCHAR(7) COMMENT 'Màu nền (hex)',
    border_width TINYINT UNSIGNED DEFAULT 0 COMMENT 'Độ dày viền',
    border_color VARCHAR(7) COMMENT 'Màu viền (hex)',
    
    -- Áp dụng
    is_enabled BOOLEAN DEFAULT TRUE COMMENT 'Có áp dụng watermark',
    apply_to ENUM('all', 'detections', 'exports', 'reports', 'alerts') DEFAULT 'all' COMMENT 'Áp dụng cho',
    quality_threshold DECIMAL(3,2) DEFAULT 0.0 COMMENT 'Ngưỡng chất lượng để áp dụng (0-1)',
    
    -- Metadata
    preview_image_path VARCHAR(500) COMMENT 'Đường dẫn ảnh preview',
    usage_count INT UNSIGNED DEFAULT 0 COMMENT 'Số lần sử dụng',
    created_by INT UNSIGNED COMMENT 'Người tạo',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_name (name),
    INDEX idx_enabled (is_enabled),
    INDEX idx_type (watermark_type),
    INDEX idx_apply_to (apply_to)
) ENGINE=InnoDB COMMENT = 'Bảng quản lý watermark';

-- ========================================
-- STATISTICS & ANALYTICS
-- ========================================

CREATE TABLE IF NOT EXISTS daily_statistics (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    stat_date DATE NOT NULL COMMENT 'Ngày thống kê',
    location_id INT UNSIGNED COMMENT 'Vị trí (null = toàn hệ thống)',
    camera_id INT UNSIGNED COMMENT 'Camera (null = tất cả camera)',
    
    -- Thống kê phát hiện
    total_detections INT UNSIGNED DEFAULT 0 COMMENT 'Tổng số phát hiện',
    unique_vehicles INT UNSIGNED DEFAULT 0 COMMENT 'Số phương tiện duy nhất',
    verified_detections INT UNSIGNED DEFAULT 0 COMMENT 'Số phát hiện đã xác minh',
    
    -- Thống kê độ tin cậy
    avg_confidence DECIMAL(5,4) COMMENT 'Độ tin cậy trung bình',
    min_confidence DECIMAL(5,4) COMMENT 'Độ tin cậy thấp nhất',
    max_confidence DECIMAL(5,4) COMMENT 'Độ tin cậy cao nhất',
    
    -- Thống kê hướng di chuyển
    inbound_count INT UNSIGNED DEFAULT 0 COMMENT 'Số lượt vào',
    outbound_count INT UNSIGNED DEFAULT 0 COMMENT 'Số lượt ra',
    unknown_direction_count INT UNSIGNED DEFAULT 0 COMMENT 'Không xác định hướng',
    
    -- Thống kê cảnh báo
    total_alerts INT UNSIGNED DEFAULT 0 COMMENT 'Tổng số cảnh báo',
    blacklist_alerts INT UNSIGNED DEFAULT 0 COMMENT 'Cảnh báo danh sách đen',
    overstay_alerts INT UNSIGNED DEFAULT 0 COMMENT 'Cảnh báo quá giờ',
    system_alerts INT UNSIGNED DEFAULT 0 COMMENT 'Cảnh báo hệ thống',
    
    -- Thống kê hiệu suất
    avg_processing_time_ms DECIMAL(8,2) COMMENT 'Thời gian xử lý trung bình (ms)',
    camera_uptime_percent DECIMAL(5,2) COMMENT 'Tỷ lệ camera online (%)',
    system_uptime_percent DECIMAL(5,2) COMMENT 'Tỷ lệ hệ thống hoạt động (%)',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
    FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE CASCADE,
    UNIQUE KEY uk_daily_stat (stat_date, location_id, camera_id),
    INDEX idx_stat_date (stat_date),
    INDEX idx_location_id (location_id),
    INDEX idx_camera_id (camera_id)
) ENGINE=InnoDB COMMENT = 'Bảng thống kê hàng ngày';

-- ========================================
-- VIEWS FOR COMMON QUERIES
-- ========================================


-- View thống kê hiệu suất camera
CREATE VIEW v_camera_performance AS
SELECT 
    c.id AS camera_id,
    c.name AS camera_name,
    c.camera_key,
    c.location_id,
    l.name AS location_name,
    
    -- Trạng thái
    c.is_active,
    c.detection_enabled,
    c.last_online_at,
    
    -- Thống kê hôm nay
    COUNT(CASE WHEN DATE(lpd.detected_at) = CURDATE() THEN 1 END) AS today_detections,
    AVG(CASE WHEN DATE(lpd.detected_at) = CURDATE() THEN lpd.confidence_score END) AS today_avg_confidence,
    COUNT(CASE WHEN DATE(lpd.detected_at) = CURDATE() AND lpd.alert_triggered = TRUE THEN 1 END) AS today_alerts,
    
    -- Thống kê 7 ngày qua  
    COUNT(CASE WHEN lpd.detected_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) AS week_detections,
    AVG(CASE WHEN lpd.detected_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN lpd.confidence_score END) AS week_avg_confidence,
    AVG(CASE WHEN lpd.detected_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN lpd.processing_time_ms END) AS week_avg_processing_time,
    
    -- Tỷ lệ xác minh
    COUNT(CASE WHEN lpd.detected_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND lpd.is_verified = TRUE THEN 1 END) * 100.0 / 
    NULLIF(COUNT(CASE WHEN lpd.detected_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END), 0) AS verification_rate_percent,
    
    -- Detection cuối cùng
    MAX(lpd.detected_at) AS last_detection_at,
    TIMESTAMPDIFF(MINUTE, MAX(lpd.detected_at), NOW()) AS minutes_since_last_detection
    
FROM cameras c
JOIN locations l ON c.location_id = l.id
LEFT JOIN license_plate_detections lpd ON c.id = lpd.camera_id
GROUP BY c.id, c.name, c.camera_key, c.location_id, l.name, c.is_active, c.detection_enabled, c.last_online_at;

-- ========================================
-- STORED PROCEDURES FOR COMMON OPERATIONS
-- ========================================

DELIMITER //

-- Procedure tính toán thống kê hàng ngày
CREATE PROCEDURE sp_calculate_daily_statistics(IN target_date DATE)
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE loc_id INT UNSIGNED;
    DECLARE cam_id INT UNSIGNED;
    
    -- Cursor cho tất cả location
    DECLARE location_cursor CURSOR FOR 
        SELECT id FROM locations WHERE is_active = TRUE;
    
    -- Cursor cho tất cả camera
    DECLARE camera_cursor CURSOR FOR 
        SELECT id FROM cameras WHERE is_active = TRUE;
        
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    -- Xóa thống kê cũ cho ngày này
    DELETE FROM daily_statistics WHERE stat_date = target_date;
    
    -- Thống kê tổng thể (toàn hệ thống)
    INSERT INTO daily_statistics (
        stat_date, location_id, camera_id,
        total_detections, unique_vehicles, verified_detections,
        avg_confidence, min_confidence, max_confidence,
        inbound_count, outbound_count, unknown_direction_count,
        total_alerts, blacklist_alerts, overstay_alerts,
        avg_processing_time_ms
    )
    SELECT 
        target_date, NULL, NULL,
        COUNT(*),
        COUNT(DISTINCT plate_number),
        COUNT(CASE WHEN is_verified = TRUE THEN 1 END),
        AVG(confidence_score),
        MIN(confidence_score),
        MAX(confidence_score),
        COUNT(CASE WHEN direction = 'inbound' THEN 1 END),
        COUNT(CASE WHEN direction = 'outbound' THEN 1 END),
        COUNT(CASE WHEN direction = 'unknown' THEN 1 END),
        COUNT(CASE WHEN alert_triggered = TRUE THEN 1 END),
        COUNT(CASE WHEN is_blacklist_match = TRUE THEN 1 END),
        (SELECT COUNT(*) FROM alerts WHERE DATE(created_at) = target_date AND alert_type = 'overstay'),
        AVG(processing_time_ms)
    FROM license_plate_detections
    WHERE DATE(detected_at) = target_date;
    
    -- Thống kê theo location
    OPEN location_cursor;
    location_loop: LOOP
        FETCH location_cursor INTO loc_id;
        IF done THEN
            LEAVE location_loop;
        END IF;
        
        INSERT INTO daily_statistics (
            stat_date, location_id, camera_id,
            total_detections, unique_vehicles, verified_detections,
            avg_confidence, min_confidence, max_confidence,
            inbound_count, outbound_count, unknown_direction_count,
            total_alerts, blacklist_alerts,
            avg_processing_time_ms
        )
        SELECT 
            target_date, loc_id, NULL,
            COUNT(*),
            COUNT(DISTINCT plate_number),
            COUNT(CASE WHEN is_verified = TRUE THEN 1 END),
            AVG(confidence_score),
            MIN(confidence_score),
            MAX(confidence_score),
            COUNT(CASE WHEN direction = 'inbound' THEN 1 END),
            COUNT(CASE WHEN direction = 'outbound' THEN 1 END),
            COUNT(CASE WHEN direction = 'unknown' THEN 1 END),
            COUNT(CASE WHEN alert_triggered = TRUE THEN 1 END),
            COUNT(CASE WHEN is_blacklist_match = TRUE THEN 1 END),
            AVG(processing_time_ms)
        FROM license_plate_detections
        WHERE DATE(detected_at) = target_date AND location_id = loc_id
        HAVING COUNT(*) > 0;
        
    END LOOP;
    CLOSE location_cursor;
    
    -- Reset cursor
    SET done = FALSE;
    
    -- Thống kê theo camera
    OPEN camera_cursor;
    camera_loop: LOOP
        FETCH camera_cursor INTO cam_id;
        IF done THEN
            LEAVE camera_loop;
        END IF;
        
        INSERT INTO daily_statistics (
            stat_date, location_id, camera_id,
            total_detections, unique_vehicles, verified_detections,
            avg_confidence, min_confidence, max_confidence,
            inbound_count, outbound_count, unknown_direction_count,
            total_alerts, blacklist_alerts,
            avg_processing_time_ms
        )
        SELECT 
            target_date, location_id, cam_id,
            COUNT(*),
            COUNT(DISTINCT plate_number),
            COUNT(CASE WHEN is_verified = TRUE THEN 1 END),
            AVG(confidence_score),
            MIN(confidence_score),
            MAX(confidence_score),
            COUNT(CASE WHEN direction = 'inbound' THEN 1 END),
            COUNT(CASE WHEN direction = 'outbound' THEN 1 END),
            COUNT(CASE WHEN direction = 'unknown' THEN 1 END),
            COUNT(CASE WHEN alert_triggered = TRUE THEN 1 END),
            COUNT(CASE WHEN is_blacklist_match = TRUE THEN 1 END),
            AVG(processing_time_ms)
        FROM license_plate_detections
        WHERE DATE(detected_at) = target_date AND camera_id = cam_id
        HAVING COUNT(*) > 0;
        
    END LOOP;
    CLOSE camera_cursor;
    
END //

-- Procedure dọn dẹp dữ liệu cũ
CREATE PROCEDURE sp_cleanup_old_data()
BEGIN
    DECLARE image_retention_days INT DEFAULT 90;
    DECLARE log_retention_days INT DEFAULT 365;
    DECLARE cutoff_date_images DATE;
    DECLARE cutoff_date_logs DATE;
    
    -- Lấy cài đặt retention từ system_settings
    SELECT CAST(setting_value AS UNSIGNED) INTO image_retention_days 
    FROM system_settings 
    WHERE setting_key = 'storage.image_retention_days';
    
    SELECT CAST(setting_value AS UNSIGNED) INTO log_retention_days 
    FROM system_settings 
    WHERE setting_key = 'storage.log_retention_days';
    
    SET cutoff_date_images = DATE_SUB(CURDATE(), INTERVAL image_retention_days DAY);
    SET cutoff_date_logs = DATE_SUB(CURDATE(), INTERVAL log_retention_days DAY);
    
    -- Dọn dẹp ảnh cũ (chỉ xóa đường dẫn, file thực tế cần xóa bằng script khác)
    UPDATE license_plate_detections 
    SET original_image_path = NULL, 
        cropped_plate_image_path = NULL,
        annotated_image_path = NULL
    WHERE DATE(detected_at) < cutoff_date_images;
    
    -- Dọn dẹp log cũ
    DELETE FROM login_logs WHERE DATE(login_at) < cutoff_date_logs;
    DELETE FROM access_logs WHERE DATE(created_at) < cutoff_date_logs;
    
    -- Dọn dẹp alerts đã resolved cũ
    DELETE FROM alerts 
    WHERE status = 'resolved' 
    AND DATE(resolved_at) < DATE_SUB(CURDATE(), INTERVAL 30 DAY);
    
    -- Dọn dẹp thống kê cũ (giữ lại 2 năm)
    DELETE FROM daily_statistics 
    WHERE stat_date < DATE_SUB(CURDATE(), INTERVAL 2 YEAR);
    
END //

-- Function kiểm tra xe có trong whitelist không
CREATE FUNCTION fn_is_whitelisted(plate VARCHAR(20), loc_id INT UNSIGNED) 
RETURNS BOOLEAN
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE is_whitelisted BOOLEAN DEFAULT FALSE;
    
    SELECT COUNT(*) > 0 INTO is_whitelisted
    FROM vehicle_whitelist 
    WHERE plate_number = plate 
    AND location_id = loc_id
    AND is_active = TRUE
    AND (valid_from IS NULL OR valid_from <= CURDATE())
    AND (valid_to IS NULL OR valid_to >= CURDATE());
    
    RETURN is_whitelisted;
END //

-- Function kiểm tra xe có trong blacklist không
CREATE FUNCTION fn_is_blacklisted(plate VARCHAR(20), loc_id INT UNSIGNED) 
RETURNS BOOLEAN
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE is_blacklisted BOOLEAN DEFAULT FALSE;
    
    SELECT COUNT(*) > 0 INTO is_blacklisted
    FROM vehicle_blacklist 
    WHERE plate_number = plate 
    AND location_id = loc_id
    AND is_active = TRUE
    AND (valid_from IS NULL OR valid_from <= CURDATE())
    AND (valid_to IS NULL OR valid_to >= CURDATE());
    
    RETURN is_blacklisted;
END //

DELIMITER ;

-- ========================================
-- TRIGGERS FOR AUTOMATED TASKS
-- ========================================

DELIMITER //

-- Trigger tự động cập nhật trạng thái whitelist/blacklist khi thêm detection
CREATE TRIGGER tr_detection_check_lists
AFTER INSERT ON license_plate_detections
FOR EACH ROW
BEGIN
    DECLARE is_whitelisted BOOLEAN DEFAULT FALSE;
    DECLARE is_blacklisted BOOLEAN DEFAULT FALSE;
    
    -- Kiểm tra whitelist
    SET is_whitelisted = fn_is_whitelisted(NEW.plate_number, NEW.location_id);
    
    -- Kiểm tra blacklist  
    SET is_blacklisted = fn_is_blacklisted(NEW.plate_number, NEW.location_id);
    
    -- Cập nhật detection record
    UPDATE license_plate_detections 
    SET is_whitelist_match = is_whitelisted,
        is_blacklist_match = is_blacklisted,
        alert_triggered = is_blacklisted
    WHERE id = NEW.id;
    
    -- Tạo alert nếu phát hiện blacklist
    IF is_blacklisted THEN
        INSERT INTO alerts (
            alert_uuid, alert_type, severity, title, message,
            plate_number, detection_id, camera_id, location_id,
            status, priority_score
        ) VALUES (
            UUID(),
            'blacklist_detected',
            'high',
            CONCAT('Phát hiện xe trong danh sách đen: ', NEW.plate_number),
            CONCAT('Xe có biển số ', NEW.plate_number, ' trong danh sách đen đã được phát hiện tại ', 
                   (SELECT name FROM locations WHERE id = NEW.location_id)),
            NEW.plate_number,
            NEW.id,
            NEW.camera_id,
            NEW.location_id,
            'new',
            80
        );
    END IF;
END //

-- Trigger cập nhật thời gian last_online cho camera
CREATE TRIGGER tr_camera_last_online
AFTER INSERT ON license_plate_detections
FOR EACH ROW
BEGIN
    UPDATE cameras 
    SET last_online_at = NEW.detected_at
    WHERE id = NEW.camera_id;
END //

-- Trigger tự động tạo/cập nhật entry-exit log
CREATE TRIGGER tr_update_entry_exit_log
AFTER INSERT ON license_plate_detections
FOR EACH ROW
BEGIN
    DECLARE existing_log_id BIGINT UNSIGNED;
    DECLARE max_stay_hours SMALLINT UNSIGNED;
    
    -- Lấy thông tin max_stay_duration_hours của location
    SELECT max_stay_duration_hours INTO max_stay_hours
    FROM locations 
    WHERE id = NEW.location_id;
    
    -- Tìm log entry hiện tại (chưa exit)
    SELECT id INTO existing_log_id
    FROM vehicle_entry_exit_logs
    WHERE plate_number = NEW.plate_number
    AND location_id = NEW.location_id  
    AND status = 'entered'
    AND exit_time IS NULL
    ORDER BY entry_time DESC
    LIMIT 1;
    
    IF NEW.direction = 'inbound' THEN
        -- Nếu là vào và chưa có log hoặc đã có exit trước đó
        IF existing_log_id IS NULL THEN
            INSERT INTO vehicle_entry_exit_logs (
                plate_number, location_id, vehicle_id,
                entry_detection_id, entry_time, entry_camera_id, 
                entry_location_id, entry_confidence, status
            ) VALUES (
                NEW.plate_number, NEW.location_id, NEW.vehicle_id,
                NEW.id, NEW.detected_at, NEW.camera_id,
                NEW.location_id, NEW.confidence_score, 'entered'
            );
        END IF;
        
    ELSEIF NEW.direction = 'outbound' AND existing_log_id IS NOT NULL THEN
        -- Nếu là ra và có log entry tương ứng
        UPDATE vehicle_entry_exit_logs
        SET exit_detection_id = NEW.id,
            exit_time = NEW.detected_at,
            exit_camera_id = NEW.camera_id,
            exit_location_id = NEW.location_id,
            exit_confidence = NEW.confidence_score,
            duration_minutes = TIMESTAMPDIFF(MINUTE, entry_time, NEW.detected_at),
            duration_hours = ROUND(TIMESTAMPDIFF(MINUTE, entry_time, NEW.detected_at) / 60.0, 2),
            status = 'exited'
        WHERE id = existing_log_id;
    END IF;
    
END //

DELIMITER ;

-- ========================================
-- INITIAL DATA SETUP
-- ========================================

-- Tạo các quyền cơ bản
INSERT IGNORE INTO permissions (module, action, code, description) VALUES
('user', 'view', 'user.view', 'Xem danh sách người dùng'),
('user', 'create', 'user.create', 'Tạo người dùng mới'),
('user', 'update', 'user.update', 'Cập nhật thông tin người dùng'),
('user', 'delete', 'user.delete', 'Xóa người dùng'),
('role', 'view', 'role.view', 'Xem danh sách vai trò'),
('role', 'create', 'role.create', 'Tạo vai trò mới'),
('role', 'update', 'role.update', 'Cập nhật vai trò'),
('role', 'delete', 'role.delete', 'Xóa vai trò'),
('permission', 'view', 'permission.view', 'Xem danh sách quyền'),
('permission', 'assign', 'permission.assign', 'Phân quyền cho vai trò'),
('camera', 'view', 'camera.view', 'Xem danh sách camera'),
('camera', 'create', 'camera.create', 'Thêm camera mới'),
('camera', 'update', 'camera.update', 'Cập nhật cấu hình camera'),
('camera', 'delete', 'camera.delete', 'Xóa camera'),
('location', 'view', 'location.view', 'Xem danh sách vị trí'),
('location', 'create', 'location.create', 'Tạo vị trí mới'),
('location', 'update', 'location.update', 'Cập nhật thông tin vị trí'),
('location', 'delete', 'location.delete', 'Xóa vị trí'),
('vehicle', 'view', 'vehicle.view', 'Xem danh sách phương tiện'),
('vehicle', 'create', 'vehicle.create', 'Thêm phương tiện mới'),
('vehicle', 'update', 'vehicle.update', 'Cập nhật thông tin phương tiện'),
('vehicle', 'delete', 'vehicle.delete', 'Xóa phương tiện'),
('detection', 'view', 'detection.view', 'Xem lịch sử phát hiện'),
('detection', 'verify', 'detection.verify', 'Xác minh kết quả phát hiện'),
('detection', 'export', 'detection.export', 'Xuất dữ liệu phát hiện'),
('whitelist', 'view', 'whitelist.view', 'Xem danh sách trắng'),
('whitelist', 'create', 'whitelist.create', 'Thêm vào danh sách trắng'),
('whitelist', 'update', 'whitelist.update', 'Cập nhật danh sách trắng'),
('whitelist', 'delete', 'whitelist.delete', 'Xóa khỏi danh sách trắng'),
('blacklist', 'view', 'blacklist.view', 'Xem danh sách đen'),
('blacklist', 'create', 'blacklist.create', 'Thêm vào danh sách đen'),
('blacklist', 'update', 'blacklist.update', 'Cập nhật danh sách đen'),
('blacklist', 'delete', 'blacklist.delete', 'Xóa khỏi danh sách đen'),
('alert', 'view', 'alert.view', 'Xem danh sách cảnh báo'),
('alert', 'acknowledge', 'alert.acknowledge', 'Xác nhận cảnh báo'),
('alert', 'resolve', 'alert.resolve', 'Giải quyết cảnh báo'),
('report', 'view', 'report.view', 'Xem báo cáo'),
('report', 'export', 'report.export', 'Xuất báo cáo'),
('system', 'view', 'system.view', 'Xem cài đặt hệ thống'),
('system', 'update', 'system.update', 'Cập nhật cài đặt hệ thống'),
('audit', 'view', 'audit.view', 'Xem nhật ký hệ thống');

-- Tạo các vai trò cơ bản
INSERT IGNORE INTO roles (name, description, level, is_default_role) VALUES
('super_admin', 'Quản trị viên toàn quyền', 100, FALSE),
('admin', 'Quản trị viên hệ thống', 80, FALSE),
('operator', 'Giám sát hệ thống', 60, TRUE),
('viewer', 'Người xem', 20, FALSE);

-- Tạo một số cài đặt hệ thống cơ bản
INSERT IGNORE INTO system_settings (setting_key, setting_value, setting_type, category, description, is_system) VALUES
('system.name', 'License Plate Detection System', 'string', 'general', 'Tên hệ thống', TRUE),
('system.version', '2.0.0', 'string', 'general', 'Phiên bản hệ thống', TRUE),
('system.timezone', 'Asia/Ho_Chi_Minh', 'string', 'general', 'Múi giờ hệ thống', TRUE),
('detection.confidence_threshold', '0.7', 'number', 'detection', 'Ngưỡng độ tin cậy tối thiểu', FALSE),
('detection.max_processing_time_ms', '5000', 'number', 'detection', 'Thời gian xử lý tối đa (ms)', FALSE),
('alert.auto_dismiss_hours', '24', 'number', 'alert', 'Tự động bỏ qua cảnh báo sau (giờ)', FALSE),
('alert.max_alerts_per_minute', '10', 'number', 'alert', 'Số cảnh báo tối đa mỗi phút', FALSE),
('storage.image_retention_days', '90', 'number', 'storage', 'Thời gian lưu trữ ảnh (ngày)', FALSE),
('storage.log_retention_days', '365', 'number', 'storage', 'Thời gian lưu trữ log (ngày)', FALSE),
('notification.email_enabled', 'true', 'boolean', 'notification', 'Bật thông báo email', FALSE),
('notification.sms_enabled', 'false', 'boolean', 'notification', 'Bật thông báo SMS', FALSE),
('security.session_timeout_minutes', '30', 'number', 'security', 'Thời gian hết hạn phiên (phút)', FALSE),
('security.max_login_attempts', '5', 'number', 'security', 'Số lần đăng nhập thất bại tối đa', FALSE),
('security.password_expiry_days', '90', 'number', 'security', 'Thời gian hết hạn mật khẩu (ngày)', FALSE),
('camera.default_fps', '25', 'number', 'camera', 'FPS mặc định cho camera', FALSE),
('camera.connection_timeout_seconds', '10', 'number', 'camera', 'Timeout kết nối camera (giây)', FALSE),
('performance.max_concurrent_detections', '10', 'number', 'performance', 'Số detection đồng thời tối đa', FALSE),
('performance.cleanup_interval_hours', '6', 'number', 'performance', 'Khoảng thời gian dọn dẹp (giờ)', FALSE);


-- Khu vực chính của tòa nhà/khuôn viên
INSERT INTO locations (name, code, address, latitude, longitude, description, zone_type, is_restricted, entry_exit_pair_id, is_main_entry, is_main_exit, max_stay_duration_hours, is_alert_on_overstay, is_alert_on_no_exit, is_active) VALUES
('Cổng chính tòa nhà ABC', 'MAIN_GATE', 'Số 123 Đường Nguyễn Trãi, Quận 1, TP.HCM', 10.7756592, 106.7004394, 'Cổng chính ra vào tòa nhà văn phòng ABC', 'entrance', TRUE, 1, TRUE, FALSE, 8, TRUE, TRUE, TRUE),
('Lối ra chính tòa nhà ABC', 'MAIN_EXIT', 'Số 123 Đường Nguyễn Trãi, Quận 1, TP.HCM', 10.7756192, 106.7004894, 'Lối ra chính từ tòa nhà văn phòng ABC', 'exit', TRUE, 1, FALSE, TRUE, 8, TRUE, TRUE, TRUE),

-- Bãi đỗ xe các tầng
('Bãi đỗ xe tầng hầm B1', 'PARKING_B1', 'Tầng hầm B1, Tòa nhà ABC', 10.7756292, 106.7004594, 'Bãi đỗ xe tầng hầm B1 dành cho nhân viên', 'parking', FALSE, 2, FALSE, FALSE, 24, TRUE, TRUE, TRUE),
('Cổng vào bãi xe B1', 'PARKING_B1_IN', 'Lối vào tầng hầm B1', 10.7756392, 106.7004694, 'Cổng kiểm soát vào bãi xe tầng B1', 'entrance', FALSE, 2, TRUE, FALSE, 24, TRUE, TRUE, TRUE),
('Cổng ra bãi xe B1', 'PARKING_B1_OUT', 'Lối ra tầng hầm B1', 10.7756092, 106.7004794, 'Cổng kiểm soát ra khỏi bãi xe B1', 'exit', FALSE, 2, FALSE, TRUE, 24, TRUE, TRUE, TRUE),

('Bãi đỗ xe tầng hầm B2', 'PARKING_B2', 'Tầng hầm B2, Tòa nhà ABC', 10.7756192, 106.7004494, 'Bãi đỗ xe tầng hầm B2 dành cho khách VIP', 'parking', TRUE, 3, FALSE, FALSE, 12, TRUE, TRUE, TRUE),
('Cổng vào bãi xe B2', 'PARKING_B2_IN', 'Lối vào tầng hầm B2', 10.7756292, 106.7004594, 'Cổng kiểm soát vào bãi xe VIP B2', 'entrance', TRUE, 3, TRUE, FALSE, 12, TRUE, TRUE, TRUE),
('Cổng ra bãi xe B2', 'PARKING_B2_OUT', 'Lối ra tầng hầm B2', 10.7755992, 106.7004694, 'Cổng kiểm soát ra khỏi bãi xe VIP B2', 'exit', TRUE, 3, FALSE, TRUE, 12, TRUE, TRUE, TRUE),

-- ========================================
-- KHU VỰC CHECKPOINT VÀ KIỂM SOÁT
-- ========================================

-- Các điểm kiểm soát an ninh
('Checkpoint an ninh tầng 1', 'SECURITY_L1', 'Sảnh tầng 1, Tòa nhà ABC', 10.7756492, 106.7004394, 'Điểm kiểm soát an ninh tại sảnh tầng 1', 'checkpoint', TRUE, NULL, FALSE, FALSE, 2, TRUE, TRUE, TRUE),
('Checkpoint thang máy VIP', 'VIP_ELEVATOR', 'Khu vực thang máy VIP, Tầng 1', 10.7756592, 106.7004294, 'Kiểm soát truy cập thang máy VIP', 'checkpoint', TRUE, NULL, FALSE, FALSE, 1, TRUE, TRUE, TRUE),
('Checkpoint khu văn phòng A', 'OFFICE_A_CHECK', 'Lối vào khu văn phòng A, Tầng 5', 10.7756692, 106.7004194, 'Kiểm soát ra vào khu văn phòng A', 'checkpoint', TRUE, NULL, FALSE, FALSE, 8, TRUE, TRUE, TRUE),

-- ========================================
-- KHU VỰC HẠN CHẾ ĐẶC BIỆT
-- ========================================

-- Khu vực hạn chế cao
('Phòng máy chủ', 'SERVER_ROOM', 'Tầng 10, Tòa nhà ABC', 10.7756792, 106.7004094, 'Khu vực phòng máy chủ - hạn chế nghiêm ngặt', 'restricted', TRUE, NULL, FALSE, FALSE, 1, TRUE, TRUE, TRUE),
('Kho tài liệu mật', 'CONFIDENTIAL_STORAGE', 'Tầng 8, Tòa nhà ABC', 10.7756892, 106.7003994, 'Khu vực lưu trữ tài liệu mật', 'restricted', TRUE, NULL, FALSE, FALSE, 2, TRUE, TRUE, TRUE),
('Phòng họp cấp cao', 'EXECUTIVE_MEETING', 'Tầng 15, Tòa nhà ABC', 10.7756992, 106.7003894, 'Phòng họp dành cho ban lãnh đạo', 'restricted', TRUE, NULL, FALSE, FALSE, 4, TRUE, TRUE, TRUE),

-- ========================================
-- KHU VỰC GIÁM SÁT CHUNG
-- ========================================

-- Các khu vực giám sát thường xuyên
('Sảnh chính tầng trệt', 'MAIN_LOBBY', 'Tầng trệt, Tòa nhà ABC', 10.7756592, 106.7004394, 'Sảnh chính tiếp đón khách', 'monitoring_zone', FALSE, NULL, FALSE, FALSE, 24, FALSE, FALSE, TRUE),
('Hành lang tầng 2', 'CORRIDOR_L2', 'Hành lang chính tầng 2', 10.7756692, 106.7004294, 'Hành lang chính kết nối các phòng ban tầng 2', 'monitoring_zone', FALSE, NULL, FALSE, FALSE, 24, FALSE, FALSE, TRUE),
('Hành lang tầng 3', 'CORRIDOR_L3', 'Hành lang chính tầng 3', 10.7756792, 106.7004194, 'Hành lang chính kết nối các phòng ban tầng 3', 'monitoring_zone', FALSE, NULL, FALSE, FALSE, 24, FALSE, FALSE, TRUE),
('Khu ăn uống tầng 6', 'FOOD_COURT_L6', 'Khu ăn uống tầng 6', 10.7756892, 106.7004094, 'Khu vực ăn uống và nghỉ ngơi tầng 6', 'monitoring_zone', FALSE, NULL, FALSE, FALSE, 24, FALSE, FALSE, TRUE),

-- ========================================
-- CÁC LỐI RA VÀO PHỤ
-- ========================================

-- Lối thoát hiểm
('Lối thoát hiểm A - Tầng 1', 'EMERGENCY_A_L1', 'Cầu thang thoát hiểm A, Tầng 1', 10.7756992, 106.7004494, 'Lối thoát hiểm A dành cho tầng 1-5', 'exit', FALSE, 4, FALSE, TRUE, 1, TRUE, TRUE, TRUE),
('Lối thoát hiểm B - Tầng 1', 'EMERGENCY_B_L1', 'Cầu thang thoát hiểm B, Tầng 1', 10.7757092, 106.7004594, 'Lối thoát hiểm B dành cho tầng 6-10', 'exit', FALSE, 5, FALSE, TRUE, 1, TRUE, TRUE, TRUE),
('Lối thoát hiểm C - Tầng 1', 'EMERGENCY_C_L1', 'Cầu thang thoát hiểm C, Tầng 1', 10.7757192, 106.7004694, 'Lối thoát hiểm C dành cho tầng 11-15', 'exit', FALSE, 6, FALSE, TRUE, 1, TRUE, TRUE, TRUE),

-- Lối vào phụ cho nhân viên
('Lối vào nhân viên - Cổng phụ', 'STAFF_ENTRANCE', 'Lối vào phụ dành cho nhân viên', 10.7756492, 106.7004794, 'Cổng phụ dành riêng cho nhân viên vào làm', 'entrance', FALSE, 7, TRUE, FALSE, 12, TRUE, TRUE, TRUE),
('Lối ra nhân viên - Cổng phụ', 'STAFF_EXIT', 'Lối ra phụ dành cho nhân viên', 10.7756392, 106.7004894, 'Cổng phụ dành riêng cho nhân viên ra về', 'exit', FALSE, 7, FALSE, TRUE, 12, TRUE, TRUE, TRUE),

-- ========================================
-- KHU VỰC DỊCH VỤ VÀ TIỆN ÍCH
-- ========================================

-- Khu vực dịch vụ
('Khu vực gửi xe máy', 'MOTORBIKE_PARKING', 'Khu gửi xe máy ngoài trời', 10.7756292, 106.7005094, 'Bãi gửi xe máy dành cho nhân viên và khách', 'parking', FALSE, 8, FALSE, FALSE, 24, FALSE, TRUE, TRUE),
('Cổng vào bãi xe máy', 'MOTORBIKE_IN', 'Cổng vào bãi xe máy', 10.7756192, 106.7005194, 'Cổng kiểm soát vào bãi xe máy', 'entrance', FALSE, 8, TRUE, FALSE, 24, FALSE, TRUE, TRUE),
('Cổng ra bãi xe máy', 'MOTORBIKE_OUT', 'Cổng ra bãi xe máy', 10.7756092, 106.7005294, 'Cổng kiểm soát ra khỏi bãi xe máy', 'exit', FALSE, 8, FALSE, TRUE, 24, FALSE, TRUE, TRUE),

('Khu vực loading dock', 'LOADING_DOCK', 'Khu vực bốc dỡ hàng hóa', 10.7755992, 106.7004994, 'Khu vực dành cho xe tải bốc dỡ hàng', 'checkpoint', TRUE, NULL, FALSE, FALSE, 4, TRUE, TRUE, TRUE),
('Khu vực rửa xe', 'CAR_WASH', 'Khu dịch vụ rửa xe', 10.7755892, 106.7005094, 'Khu vực dịch vụ rửa xe cho nhân viên', 'monitoring_zone', FALSE, NULL, FALSE, FALSE, 2, FALSE, FALSE, TRUE),

-- ========================================
-- KHU VỰC ĐẶC BIỆT VÀ SỰ KIỆN
-- ========================================

-- Khu vực tổ chức sự kiện
('Hội trường lớn', 'MAIN_AUDITORIUM', 'Hội trường chính tầng 4', 10.7756792, 106.7003994, 'Hội trường lớn tổ chức sự kiện, hội nghị', 'monitoring_zone', TRUE, NULL, FALSE, FALSE, 8, TRUE, TRUE, TRUE),
('Phòng triển lãm', 'EXHIBITION_HALL', 'Phòng triển lãm tầng 2', 10.7756692, 106.7004094, 'Không gian triển lãm sản phẩm', 'monitoring_zone', FALSE, NULL, FALSE, FALSE, 12, TRUE, TRUE, TRUE),

-- Khu vực VIP đặc biệt
('Phòng chờ VIP', 'VIP_LOUNGE', 'Phòng chờ VIP tầng 12', 10.7756992, 106.7003794, 'Phòng chờ dành cho khách VIP', 'restricted', TRUE, NULL, FALSE, FALSE, 6, TRUE, TRUE, TRUE),
('Bãi đỗ xe VIP ngoài trời', 'VIP_OUTDOOR_PARKING', 'Bãi đỗ VIP khu vực ngoài trời', 10.7757092, 106.7003694, 'Bãi đỗ xe cao cấp dành cho khách VIP', 'parking', TRUE, 9, FALSE, FALSE, 8, TRUE, TRUE, TRUE),
('Cổng vào VIP ngoài trời', 'VIP_OUTDOOR_IN', 'Cổng vào bãi VIP ngoài trời', 10.7757192, 106.7003594, 'Cổng kiểm soát vào bãi VIP ngoài trời', 'entrance', TRUE, 9, TRUE, FALSE, 8, TRUE, TRUE, TRUE),
('Cổng ra VIP ngoài trời', 'VIP_OUTDOOR_OUT', 'Cổng ra bãi VIP ngoài trời', 10.7757292, 106.7003494, 'Cổng kiểm soát ra khỏi bãi VIP ngoài trời', 'exit', TRUE, 9, FALSE, TRUE, 8, TRUE, TRUE, TRUE),

-- ========================================
-- KHU VỰC BẢO TRÌ VÀ KỸ THUẬT
-- ========================================

-- Khu vực kỹ thuật
('Phòng điện chính', 'MAIN_ELECTRICAL', 'Phòng điện chính tầng hầm', 10.7755792, 106.7004594, 'Phòng điện và hệ thống kỹ thuật chính', 'restricted', TRUE, NULL, FALSE, FALSE, 1, TRUE, TRUE, TRUE),
('Phòng máy lạnh trung tâm', 'CENTRAL_AC', 'Phòng máy lạnh tầng mái', 10.7756992, 106.7003594, 'Hệ thống điều hòa trung tâm toà nhà', 'restricted', TRUE, NULL, FALSE, FALSE, 2, TRUE, TRUE, TRUE),
('Khu vực bảo trì', 'MAINTENANCE_AREA', 'Khu vực bảo trì tầng hầm', 10.7755692, 106.7004694, 'Khu vực công cụ và thiết bị bảo trì', 'restricted', TRUE, NULL, FALSE, FALSE, 4, TRUE, TRUE, TRUE),

-- ========================================
-- CÁC VỊ TRÍ NGOÀI TÒA NHÀ
-- ========================================

-- Khu vực xung quanh tòa nhà
('Lối vào từ đường Nguyễn Trãi', 'NGUYEN_TRAI_ENTRANCE', 'Lối vào chính từ đường Nguyễn Trãi', 10.7757392, 106.7003394, 'Điểm kiểm soát từ đường chính', 'entrance', FALSE, 10, TRUE, FALSE, 1, TRUE, TRUE, TRUE),
('Lối ra ra đường Nguyễn Trãi', 'NGUYEN_TRAI_EXIT', 'Lối ra chính ra đường Nguyễn Trãi', 10.7757492, 106.7003294, 'Điểm kiểm soát ra đường chính', 'exit', FALSE, 10, FALSE, TRUE, 1, TRUE, TRUE, TRUE),

('Checkpoint cổng bảo vệ', 'SECURITY_GATE', 'Trạm bảo vệ cổng chính', 10.7757592, 106.7003194, 'Trạm kiểm soát an ninh cổng chính', 'checkpoint', TRUE, NULL, FALSE, FALSE, 0.5, TRUE, TRUE, TRUE),

-- Các vị trí backup và dự phòng
('Khu vực tập kết khẩn cấp', 'EMERGENCY_ASSEMBLY', 'Điểm tập kết khẩn cấp', 10.7757692, 106.7003094, 'Khu vực tập kết trong trường hợp khẩn cấp', 'monitoring_zone', FALSE, NULL, FALSE, FALSE, 4, FALSE, FALSE, TRUE);

-- ========================================
-- CẬP NHẬT PARENT RELATIONSHIPS
-- ========================================

-- Cập nhật mối quan hệ cha-con cho các location
UPDATE locations SET parent_location_id = 1 WHERE code IN ('MAIN_EXIT', 'SECURITY_L1', 'MAIN_LOBBY');
UPDATE locations SET parent_location_id = 3 WHERE code IN ('PARKING_B1_IN', 'PARKING_B1_OUT');
UPDATE locations SET parent_location_id = 6 WHERE code IN ('PARKING_B2_IN', 'PARKING_B2_OUT');
UPDATE locations SET parent_location_id = 24 WHERE code IN ('MOTORBIKE_IN', 'MOTORBIKE_OUT');
UPDATE locations SET parent_location_id = 19 WHERE code IN ('STAFF_EXIT');
UPDATE locations SET parent_location_id = 31 WHERE code IN ('VIP_OUTDOOR_IN', 'VIP_OUTDOOR_OUT');


ALTER TABLE vehicle_whitelist 
ADD COLUMN plate_image_path VARCHAR(500) COMMENT 'Đường dẫn ảnh biển số gốc' AFTER contact_email,
ADD COLUMN plate_image_cropped_path VARCHAR(500) COMMENT 'Đường dẫn ảnh biển số đã cắt' AFTER plate_image_path,
ADD COLUMN plate_image_processed_path VARCHAR(500) COMMENT 'Đường dẫn ảnh đã xử lý OCR' AFTER plate_image_cropped_path,
ADD COLUMN ocr_raw_text VARCHAR(100) COMMENT 'Text thô từ OCR' AFTER plate_image_processed_path,
ADD COLUMN ocr_confidence DECIMAL(5,4) COMMENT 'Độ tin cậy OCR (0-1)' AFTER ocr_raw_text,
ADD COLUMN ocr_processed_at DATETIME COMMENT 'Thời gian xử lý OCR' AFTER ocr_confidence,
ADD COLUMN image_metadata JSON COMMENT 'Metadata ảnh (kích thước, format, etc.)' AFTER ocr_processed_at,
ADD COLUMN verification_status ENUM('pending', 'ocr_matched', 'manually_verified', 'rejected') DEFAULT 'pending' COMMENT 'Trạng thái xác minh OCR' AFTER image_metadata,
ADD COLUMN verified_plate_number VARCHAR(20) COMMENT 'Biển số sau khi xác minh (có thể khác OCR)' AFTER verification_status;

-- Thêm các trường ảnh và OCR cho bảng vehicle_blacklist  
ALTER TABLE vehicle_blacklist
ADD COLUMN plate_image_path VARCHAR(500) COMMENT 'Đường dẫn ảnh biển số gốc' AFTER owner_phone,
ADD COLUMN plate_image_cropped_path VARCHAR(500) COMMENT 'Đường dẫn ảnh biển số đã cắt' AFTER plate_image_path,
ADD COLUMN plate_image_processed_path VARCHAR(500) COMMENT 'Đường dẫn ảnh đã xử lý OCR' AFTER plate_image_cropped_path,
ADD COLUMN ocr_raw_text VARCHAR(100) COMMENT 'Text thô từ OCR' AFTER plate_image_processed_path,
ADD COLUMN ocr_confidence DECIMAL(5,4) COMMENT 'Độ tin cậy OCR (0-1)' AFTER ocr_raw_text,
ADD COLUMN ocr_processed_at DATETIME COMMENT 'Thời gian xử lý OCR' AFTER ocr_confidence,
ADD COLUMN image_metadata JSON COMMENT 'Metadata ảnh (kích thước, format, etc.)' AFTER ocr_processed_at,
ADD COLUMN verification_status ENUM('pending', 'ocr_matched', 'manually_verified', 'rejected') DEFAULT 'pending' COMMENT 'Trạng thái xác minh OCR' AFTER image_metadata,
ADD COLUMN verified_plate_number VARCHAR(20) COMMENT 'Biển số sau khi xác minh (có thể khác OCR)' AFTER verification_status;

-- Thêm indexes cho hiệu suất tìm kiếm
ALTER TABLE vehicle_whitelist 
ADD INDEX idx_ocr_raw_text (ocr_raw_text),
ADD INDEX idx_verification_status (verification_status),
ADD INDEX idx_verified_plate_number (verified_plate_number),
ADD INDEX idx_ocr_confidence (ocr_confidence);

ALTER TABLE vehicle_blacklist
ADD INDEX idx_ocr_raw_text (ocr_raw_text), 
ADD INDEX idx_verification_status (verification_status),
ADD INDEX idx_verified_plate_number (verified_plate_number),
ADD INDEX idx_ocr_confidence (ocr_confidence);
-- Script để thêm cột detected_plate_image vào bảng vehicle_whitelist
-- Chạy script này để hỗ trợ lưu ảnh biển số đã phát hiện từ OCR

-- Thêm cột detected_plate_image để lưu đường dẫn ảnh biển số đã phát hiện
ALTER TABLE vehicle_whitelist 
ADD COLUMN detected_plate_image VARCHAR(500) NULL 
COMMENT 'Đường dẫn ảnh biển số đã phát hiện từ OCR' 
AFTER plate_image_path;

ALTER TABLE vehicle_blacklist 
ADD COLUMN detected_plate_image VARCHAR(500) NULL 
COMMENT 'Đường dẫn ảnh biển số đã phát hiện từ OCR' 
AFTER plate_image_path;


