

-- Tạo cơ sở dữ liệu
CREATE DATABASE IF NOT EXISTS license_plate_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE license_plate_db;

-- =====================================================
-- PHẦN 1: QUẢN LÝ HỆ THỐNG VÀ PHÂN QUYỀN
-- =====================================================

-- Bảng quyền hạn
CREATE TABLE permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
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
) COMMENT = 'Bảng quản lý quyền hạn hệ thống';

-- Bảng vai trò
CREATE TABLE roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE COMMENT 'Tên vai trò',
    description TEXT COMMENT 'Mô tả vai trò',
    parent_role_id INT DEFAULT NULL COMMENT 'Vai trò cha (kế thừa quyền)',
    is_default_role BOOLEAN DEFAULT FALSE COMMENT 'Vai trò mặc định',
    level INT DEFAULT 0 COMMENT 'Cấp độ vai trò (0-100)',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (parent_role_id) REFERENCES roles(id) ON DELETE SET NULL,
    INDEX idx_name (name),
    INDEX idx_level (level),
    INDEX idx_active (is_active)
) COMMENT = 'Bảng vai trò người dùng';

-- Bảng phân quyền cho vai trò
CREATE TABLE role_permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role_id INT NOT NULL,
    permission_id INT NOT NULL,
    granted BOOLEAN DEFAULT TRUE COMMENT 'Cấp phép hay từ chối',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
    UNIQUE KEY unique_role_permission (role_id, permission_id),
    INDEX idx_role_id (role_id),
    INDEX idx_permission_id (permission_id)
) COMMENT = 'Bảng phân quyền cho vai trò';

-- Bảng người dùng
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL COMMENT 'Họ tên',
    username VARCHAR(50) NOT NULL UNIQUE COMMENT 'Tên đăng nhập',
    email VARCHAR(100) NOT NULL UNIQUE COMMENT 'Email',
    phone VARCHAR(20) COMMENT 'Số điện thoại',
    password VARCHAR(255) NOT NULL COMMENT 'Mật khẩu đã mã hóa',
    status ENUM('active', 'inactive', 'suspended') DEFAULT 'active' COMMENT 'Trạng thái tài khoản',
    last_login DATETIME COMMENT 'Lần đăng nhập cuối',
    last_password_change DATETIME COMMENT 'Lần đổi mật khẩu cuối',
    password_expiry DATETIME COMMENT 'Ngày hết hạn mật khẩu',
    failed_login_attempts INT DEFAULT 0 COMMENT 'Số lần đăng nhập thất bại',
    account_locked BOOLEAN DEFAULT FALSE COMMENT 'Tài khoản có bị khóa',
    lock_until DATETIME COMMENT 'Khóa tài khoản đến',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_username (username),
    INDEX idx_email (email),
    INDEX idx_status (status),
    INDEX idx_phone (phone)
) COMMENT = 'Bảng người dùng hệ thống';

-- Bảng phân vai trò cho người dùng
CREATE TABLE user_roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    role_id INT NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by INT COMMENT 'Người phân quyền',
    is_active BOOLEAN DEFAULT TRUE,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_user_role (user_id, role_id),
    INDEX idx_user_id (user_id),
    INDEX idx_role_id (role_id)
) COMMENT = 'Bảng phân vai trò cho người dùng';

-- Bảng nhật ký đăng nhập
CREATE TABLE login_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT COMMENT 'ID người dùng (null nếu đăng nhập thất bại)',
    email VARCHAR(100) NOT NULL COMMENT 'Email đăng nhập',
    ip_address VARCHAR(45) NOT NULL COMMENT 'Địa chỉ IP',
    user_agent TEXT COMMENT 'Thông tin trình duyệt',
    status ENUM('success', 'fail') NOT NULL COMMENT 'Trạng thái đăng nhập',
    failure_reason VARCHAR(255) COMMENT 'Lý do thất bại',
    message TEXT COMMENT 'Thông báo chi tiết',
    session_id VARCHAR(128) COMMENT 'ID phiên đăng nhập',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_email (email),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    INDEX idx_ip_address (ip_address)
) COMMENT = 'Bảng nhật ký đăng nhập';

-- =====================================================
-- PHẦN 2: QUẢN LÝ VỊ TRÍ VÀ THIẾT BỊ
-- =====================================================

-- Bảng vị trí/khu vực
CREATE TABLE locations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL COMMENT 'Tên vị trí',
    code VARCHAR(20) UNIQUE COMMENT 'Mã vị trí',
    address TEXT COMMENT 'Địa chỉ',
    latitude DECIMAL(10, 8) COMMENT 'Vĩ độ',
    longitude DECIMAL(11, 8) COMMENT 'Kinh độ',
    description TEXT COMMENT 'Mô tả',
    zone_type ENUM('entrance', 'exit', 'checkpoint', 'parking', 'restricted', 'entry_point', 'exit_point', 'monitoring_zone') DEFAULT 'checkpoint' COMMENT 'Loại khu vực',
    is_restricted BOOLEAN DEFAULT FALSE COMMENT 'Khu vực hạn chế',
    parent_location_id INT COMMENT 'Vị trí cha',
    
    -- Cấu hình vào/ra
    entry_exit_pair_id INT COMMENT 'ID cặp vào/ra (cùng ID = cùng khu vực)',
    is_main_entry BOOLEAN DEFAULT FALSE COMMENT 'Là lối vào chính',
    is_main_exit BOOLEAN DEFAULT FALSE COMMENT 'Là lối ra chính',
    max_stay_duration_hours INT DEFAULT 24 COMMENT 'Thời gian lưu trú tối đa (giờ)',
    alert_on_overstay BOOLEAN DEFAULT TRUE COMMENT 'Cảnh báo khi ở lại quá lâu',
    alert_on_no_exit BOOLEAN DEFAULT TRUE COMMENT 'Cảnh báo khi không có bản ghi ra',
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (parent_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    INDEX idx_name (name),
    INDEX idx_code (code),
    INDEX idx_zone_type (zone_type),
    INDEX idx_active (is_active),
    INDEX idx_entry_exit_pair (entry_exit_pair_id)
) COMMENT = 'Bảng vị trí/khu vực giám sát';

-- Bảng camera giám sát
CREATE TABLE cameras (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL COMMENT 'Tên camera',
    code VARCHAR(20) UNIQUE COMMENT 'Mã camera',
    url VARCHAR(500) COMMENT 'URL camera',
    location_id INT NOT NULL COMMENT 'Vị trí camera',
    direction ENUM('inbound', 'outbound', 'bidirectional', 'entry_only', 'exit_only') DEFAULT 'bidirectional' COMMENT 'Hướng giám sát',
    camera_type ENUM('fixed', 'ptz', 'mobile') DEFAULT 'fixed' COMMENT 'Loại camera',
    camera_role ENUM('entry', 'exit', 'internal', 'overview') COMMENT 'Vai trò camera',
    monitoring_location_id INT COMMENT 'Vị trí giám sát chính',
    resolution VARCHAR(20) COMMENT 'Độ phân giải',
    fps INT DEFAULT 30 COMMENT 'Khung hình/giây',
    status ENUM('online', 'offline', 'maintenance') DEFAULT 'offline' COMMENT 'Trạng thái camera',
    last_heartbeat DATETIME COMMENT 'Lần ping cuối',
    installation_date DATE COMMENT 'Ngày lắp đặt',
    maintenance_schedule VARCHAR(100) COMMENT 'Lịch bảo trì',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    FOREIGN KEY (monitoring_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    INDEX idx_name (name),
    INDEX idx_code (code),
    INDEX idx_location_id (location_id),
    INDEX idx_status (status),
    INDEX idx_active (is_active),
    INDEX idx_camera_role_monitoring (camera_role, monitoring_location_id)
) COMMENT = 'Bảng camera giám sát';

-- =====================================================
-- PHẦN 3: QUẢN LÝ PHƯƠNG TIỆN
-- =====================================================

-- Bảng thông tin phương tiện
CREATE TABLE vehicles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    plate_number VARCHAR(20) NOT NULL UNIQUE COMMENT 'Biển số xe',
    vehicle_type ENUM('motorcycle', 'car', 'truck', 'bus', 'other') COMMENT 'Loại xe',
    make VARCHAR(50) COMMENT 'Hãng xe',
    model VARCHAR(50) COMMENT 'Dòng xe',
    year_manufacture INT COMMENT 'Năm sản xuất',
    color VARCHAR(30) COMMENT 'Màu xe',
    engine_number VARCHAR(50) COMMENT 'Số máy',
    chassis_number VARCHAR(50) COMMENT 'Số khung',
    owner_name VARCHAR(100) COMMENT 'Tên chủ xe',
    owner_id VARCHAR(50) COMMENT 'CMND/CCCD chủ xe',
    owner_phone VARCHAR(20) COMMENT 'SĐT chủ xe',
    owner_address TEXT COMMENT 'Địa chỉ chủ xe',
    registration_date DATE COMMENT 'Ngày đăng ký',
    expiry_date DATE COMMENT 'Ngày hết hạn đăng ký',
    insurance_number VARCHAR(50) COMMENT 'Số bảo hiểm',
    notes TEXT COMMENT 'Ghi chú',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_plate_number (plate_number),
    INDEX idx_vehicle_type (vehicle_type),
    INDEX idx_owner_name (owner_name),
    INDEX idx_owner_id (owner_id),
    INDEX idx_active (is_active)
) COMMENT = 'Bảng thông tin phương tiện';

-- Bảng danh sách kiểm soát truy cập (Whitelist/Blacklist)
CREATE TABLE access_control_lists (
    id INT AUTO_INCREMENT PRIMARY KEY,
    plate_number VARCHAR(20) NOT NULL COMMENT 'Biển số xe',
    list_type ENUM('whitelist', 'blacklist') NOT NULL COMMENT 'Loại danh sách',
    reason TEXT COMMENT 'Lý do thêm vào danh sách',
    description TEXT COMMENT 'Mô tả chi tiết',
    location_id INT COMMENT 'Áp dụng cho vị trí cụ thể (NULL = tất cả)',
    effective_from DATETIME COMMENT 'Có hiệu lực từ',
    effective_until DATETIME COMMENT 'Có hiệu lực đến',
    added_by INT NOT NULL COMMENT 'Người thêm',
    priority INT DEFAULT 0 COMMENT 'Độ ưu tiên (cao hơn = ưu tiên hơn)',
    alert_on_detection BOOLEAN DEFAULT TRUE COMMENT 'Cảnh báo khi phát hiện',
    auto_action ENUM('none', 'block', 'notify', 'record') DEFAULT 'notify' COMMENT 'Hành động tự động',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_plate_number (plate_number),
    INDEX idx_list_type (list_type),
    INDEX idx_location_id (location_id),
    INDEX idx_effective_dates (effective_from, effective_until),
    INDEX idx_active (is_active),
    INDEX idx_priority (priority),
    INDEX idx_plate_type_active (plate_number, list_type, is_active)
) COMMENT = 'Bảng danh sách kiểm soát truy cập';

-- =====================================================
-- PHẦN 4: QUẢN LÝ PHÁT HIỆN VÀ NHẬN DIỆN
-- =====================================================

-- Bảng phát hiện biển số
CREATE TABLE license_plate_detections (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    plate_number VARCHAR(20) NOT NULL COMMENT 'Biển số phát hiện',
    camera_id INT NOT NULL COMMENT 'Camera phát hiện',
    location_id INT NOT NULL COMMENT 'Vị trí phát hiện',
    vehicle_id INT COMMENT 'ID phương tiện (nếu đã xác định)',
    detection_time DATETIME NOT NULL COMMENT 'Thời gian phát hiện',
    confidence FLOAT NOT NULL COMMENT 'Độ tin cậy (0-1)',
    image_path VARCHAR(500) COMMENT 'Đường dẫn ảnh gốc',
    cropped_image_path VARCHAR(500) COMMENT 'Đường dẫn ảnh biển số đã cắt',
    image_hash VARCHAR(64) COMMENT 'Hash của ảnh để kiểm tra tính toàn vẹn',
    direction ENUM('inbound', 'outbound', 'unknown') DEFAULT 'unknown' COMMENT 'Hướng di chuyển',
    speed FLOAT COMMENT 'Tốc độ (km/h)',
    vehicle_color VARCHAR(30) COMMENT 'Màu xe phát hiện',
    vehicle_type_detected VARCHAR(50) COMMENT 'Loại xe phát hiện được',
    processing_time_ms INT COMMENT 'Thời gian xử lý (ms)',
    ocr_raw_result TEXT COMMENT 'Kết quả OCR thô',
    ocr_confidence FLOAT COMMENT 'Độ tin cậy OCR',
    is_verified BOOLEAN DEFAULT FALSE COMMENT 'Đã xác minh thủ công',
    verified_by INT COMMENT 'Người xác minh',
    verified_at DATETIME COMMENT 'Thời gian xác minh',
    notes TEXT COMMENT 'Ghi chú',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE RESTRICT,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
    FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_plate_number (plate_number),
    INDEX idx_camera_id (camera_id),
    INDEX idx_location_id (location_id),
    INDEX idx_detection_time (detection_time),
    INDEX idx_confidence (confidence),
    INDEX idx_direction (direction),
    INDEX idx_verified (is_verified),
    INDEX idx_created_at (created_at),
    INDEX idx_plate_time (plate_number, detection_time),
    INDEX idx_plate_time_desc (plate_number, detection_time DESC),
    INDEX idx_location_time (location_id, detection_time DESC),
    INDEX idx_camera_time (camera_id, detection_time DESC)
) COMMENT = 'Bảng phát hiện biển số xe';

-- =====================================================
-- PHẦN 5: QUẢN LÝ CHUYẾN ĐI VÀ LỘ TRÌNH
-- =====================================================

-- Bảng chuyến đi của phương tiện
CREATE TABLE vehicle_journeys (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    plate_number VARCHAR(20) NOT NULL COMMENT 'Biển số xe',
    vehicle_id INT COMMENT 'ID phương tiện',
    journey_date DATE NOT NULL COMMENT 'Ngày chuyến đi',
    start_time DATETIME COMMENT 'Thời gian bắt đầu',
    end_time DATETIME COMMENT 'Thời gian kết thúc',
    start_location_id INT COMMENT 'Vị trí bắt đầu',
    end_location_id INT COMMENT 'Vị trí kết thúc',
    total_distance DECIMAL(10,2) COMMENT 'Tổng quãng đường (km)',
    total_duration INT COMMENT 'Tổng thời gian (phút)',
    avg_speed DECIMAL(6,2) COMMENT 'Tốc độ trung bình (km/h)',
    max_speed DECIMAL(6,2) COMMENT 'Tốc độ tối đa (km/h)',
    detection_count INT DEFAULT 0 COMMENT 'Số lần phát hiện',
    route_points JSON COMMENT 'Các điểm trên lộ trình (JSON)',
    status ENUM('active', 'completed', 'incomplete') DEFAULT 'active' COMMENT 'Trạng thái chuyến đi',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
    FOREIGN KEY (start_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (end_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    INDEX idx_plate_number (plate_number),
    INDEX idx_journey_date (journey_date),
    INDEX idx_start_time (start_time),
    INDEX idx_status (status),
    INDEX idx_vehicle_id (vehicle_id),
    INDEX idx_plate_date (plate_number, journey_date)
) COMMENT = 'Bảng chuyến đi của phương tiện';

-- Bảng điểm trên lộ trình
CREATE TABLE journey_points (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    journey_id BIGINT NOT NULL COMMENT 'ID chuyến đi',
    detection_id BIGINT NOT NULL COMMENT 'ID bản ghi phát hiện',
    sequence_number INT NOT NULL COMMENT 'Thứ tự trong chuyến đi',
    point_time DATETIME NOT NULL COMMENT 'Thời gian tại điểm này',
    location_id INT NOT NULL COMMENT 'Vị trí',
    camera_id INT NOT NULL COMMENT 'Camera',
    direction ENUM('inbound', 'outbound', 'unknown') DEFAULT 'unknown',
    speed DECIMAL(6,2) COMMENT 'Tốc độ tại điểm này',
    distance_from_previous DECIMAL(10,2) COMMENT 'Khoảng cách từ điểm trước (km)',
    time_from_previous INT COMMENT 'Thời gian từ điểm trước (phút)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (journey_id) REFERENCES vehicle_journeys(id) ON DELETE CASCADE,
    FOREIGN KEY (detection_id) REFERENCES license_plate_detections(id) ON DELETE CASCADE,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE RESTRICT,
    INDEX idx_journey_id (journey_id),
    INDEX idx_detection_id (detection_id),
    INDEX idx_sequence (sequence_number),
    INDEX idx_point_time (point_time),
    INDEX idx_location_id (location_id)
) COMMENT = 'Bảng điểm trên lộ trình di chuyển';

-- Bảng theo dõi việc vào/ra của phương tiện
CREATE TABLE vehicle_entry_exit_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    plate_number VARCHAR(20) NOT NULL COMMENT 'Biển số xe',
    monitoring_location_id INT NOT NULL COMMENT 'Vị trí giám sát',
    vehicle_id INT COMMENT 'ID phương tiện',
    
    -- Thông tin vào
    entry_detection_id BIGINT COMMENT 'ID bản ghi phát hiện khi vào',
    entry_time DATETIME COMMENT 'Thời gian vào',
    entry_camera_id INT COMMENT 'Camera phát hiện lúc vào',
    entry_location_id INT COMMENT 'Vị trí vào cụ thể',
    entry_confidence FLOAT COMMENT 'Độ tin cậy khi phát hiện vào',
    entry_image_path VARCHAR(500) COMMENT 'Ảnh khi vào',
    
    -- Thông tin ra
    exit_detection_id BIGINT COMMENT 'ID bản ghi phát hiện khi ra',
    exit_time DATETIME COMMENT 'Thời gian ra',
    exit_camera_id INT COMMENT 'Camera phát hiện lúc ra',
    exit_location_id INT COMMENT 'Vị trí ra cụ thể',
    exit_confidence FLOAT COMMENT 'Độ tin cậy khi phát hiện ra',
    exit_image_path VARCHAR(500) COMMENT 'Ảnh khi ra',
    
    -- Thông tin tính toán
    duration_minutes INT COMMENT 'Thời gian lưu trú (phút)',
    status ENUM('entered', 'exited', 'overstay', 'no_exit_record') DEFAULT 'entered' COMMENT 'Trạng thái',
    
    -- Cảnh báo và xử lý
    is_overstay BOOLEAN DEFAULT FALSE COMMENT 'Có ở lại quá lâu',
    overstay_alert_sent BOOLEAN DEFAULT FALSE COMMENT 'Đã gửi cảnh báo quá giờ',
    no_exit_alert_sent BOOLEAN DEFAULT FALSE COMMENT 'Đã gửi cảnh báo không có bản ghi ra',
    
    notes TEXT COMMENT 'Ghi chú',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (monitoring_location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
    FOREIGN KEY (entry_detection_id) REFERENCES license_plate_detections(id) ON DELETE SET NULL,
    FOREIGN KEY (exit_detection_id) REFERENCES license_plate_detections(id) ON DELETE SET NULL,
    FOREIGN KEY (entry_camera_id) REFERENCES cameras(id) ON DELETE SET NULL,
    FOREIGN KEY (exit_camera_id) REFERENCES cameras(id) ON DELETE SET NULL,
    FOREIGN KEY (entry_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (exit_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    
    INDEX idx_plate_number (plate_number),
    INDEX idx_monitoring_location (monitoring_location_id),
    INDEX idx_entry_time (entry_time),
    INDEX idx_exit_time (exit_time),
    INDEX idx_status (status),
    INDEX idx_overstay (is_overstay),
    INDEX idx_plate_location_entry (plate_number, monitoring_location_id, entry_time),
    INDEX idx_duration (duration_minutes)
) COMMENT = 'Bảng theo dõi việc vào/ra của phương tiện';

-- =====================================================
-- PHẦN 6: QUẢN LÝ CẢNH BÁO VÀ THÔNG BÁO
-- =====================================================

-- Bảng cảnh báo hệ thống
CREATE TABLE alerts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    alert_type ENUM('blacklist_detected', 'unauthorized_access', 'system_error', 'camera_offline', 'speed_violation', 'overstay', 'custom') NOT NULL COMMENT 'Loại cảnh báo',
    severity ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium' COMMENT 'Mức độ nghiêm trọng',
    title VARCHAR(200) NOT NULL COMMENT 'Tiêu đề cảnh báo',
    message TEXT NOT NULL COMMENT 'Nội dung cảnh báo',
    plate_number VARCHAR(20) COMMENT 'Biển số liên quan',
    detection_id BIGINT COMMENT 'ID phát hiện liên quan',
    camera_id INT COMMENT 'Camera liên quan',
    location_id INT COMMENT 'Vị trí liên quan',
    user_id INT COMMENT 'Người dùng liên quan',
    alert_data JSON COMMENT 'Dữ liệu chi tiết (JSON)',
    status ENUM('new', 'acknowledged', 'resolved', 'dismissed') DEFAULT 'new' COMMENT 'Trạng thái xử lý',
    acknowledged_by INT COMMENT 'Người xác nhận',
    acknowledged_at DATETIME COMMENT 'Thời gian xác nhận',
    resolved_by INT COMMENT 'Người giải quyết',
    resolved_at DATETIME COMMENT 'Thời gian giải quyết',
    resolution_notes TEXT COMMENT 'Ghi chú giải quyết',
    auto_dismiss_at DATETIME COMMENT 'Tự động bỏ qua vào lúc',
    notification_sent BOOLEAN DEFAULT FALSE COMMENT 'Đã gửi thông báo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (detection_id) REFERENCES license_plate_detections(id) ON DELETE CASCADE,
    FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE SET NULL,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (acknowledged_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_alert_type (alert_type),
    INDEX idx_severity (severity),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    INDEX idx_plate_number (plate_number),
    INDEX idx_camera_id (camera_id),
    INDEX idx_location_id (location_id),
    INDEX idx_severity_status (severity DESC, status, created_at DESC)
) COMMENT = 'Bảng cảnh báo hệ thống';

-- =====================================================
-- PHẦN 7: QUẢN LÝ NHẬT KÝ VÀ KIỂM TOÁN
-- =====================================================

-- Bảng nhật ký truy cập
CREATE TABLE access_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT COMMENT 'ID người dùng',
    username VARCHAR(50) COMMENT 'Tên đăng nhập',
    action_type ENUM('LOGIN', 'LOGOUT', 'VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'SEARCH', 'UPLOAD', 'DOWNLOAD') NOT NULL COMMENT 'Loại hành động',
    object_type VARCHAR(50) COMMENT 'Loại đối tượng',
    object_id VARCHAR(100) COMMENT 'ID đối tượng',
    old_values JSON COMMENT 'Giá trị cũ (cho UPDATE)',
    new_values JSON COMMENT 'Giá trị mới (cho UPDATE/CREATE)',
    status ENUM('SUCCESS', 'FAILURE') NOT NULL COMMENT 'Trạng thái thực hiện',
    ip_address VARCHAR(45) COMMENT 'Địa chỉ IP',
    user_agent TEXT COMMENT 'Thông tin trình duyệt',
    failure_reason TEXT COMMENT 'Lý do thất bại',
    request_data JSON COMMENT 'Dữ liệu yêu cầu',
    response_time_ms INT COMMENT 'Thời gian phản hồi (ms)',
    session_id VARCHAR(128) COMMENT 'ID phiên làm việc',
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
    INDEX idx_user_time (user_id, created_at DESC)
) COMMENT = 'Bảng nhật ký truy cập hệ thống';

-- Bảng nhật ký kiểm tra tính toàn vẹn dữ liệu
CREATE TABLE data_integrity_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    table_name VARCHAR(50) NOT NULL COMMENT 'Tên bảng kiểm tra',
    record_id BIGINT NOT NULL COMMENT 'ID bản ghi',
    check_type ENUM('hash', 'checksum', 'signature') DEFAULT 'hash' COMMENT 'Loại kiểm tra',
    original_hash VARCHAR(128) NOT NULL COMMENT 'Hash gốc',
    current_hash VARCHAR(128) NOT NULL COMMENT 'Hash hiện tại',
    status ENUM('valid', 'invalid', 'missing') NOT NULL COMMENT 'Trạng thái kiểm tra',
    check_time DATETIME NOT NULL COMMENT 'Thời gian kiểm tra',
    details TEXT COMMENT 'Chi tiết kiểm tra',
    checked_by INT COMMENT 'Người thực hiện kiểm tra',
    auto_check BOOLEAN DEFAULT TRUE COMMENT 'Kiểm tra tự động',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (checked_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_table_name (table_name),
    INDEX idx_record_id (record_id),
    INDEX idx_status (status),
    INDEX idx_check_time (check_time),
    INDEX idx_auto_check (auto_check)
) COMMENT = 'Bảng nhật ký kiểm tra tính toàn vẹn dữ liệu';

-- =====================================================
-- PHẦN 8: CẤU HÌNH HỆ THỐNG
-- =====================================================

-- Bảng cài đặt hệ thống
CREATE TABLE system_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE COMMENT 'Khóa cài đặt',
    setting_value TEXT COMMENT 'Giá trị cài đặt',
    setting_type ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string' COMMENT 'Loại dữ liệu',
    category VARCHAR(50) DEFAULT 'general' COMMENT 'Danh mục cài đặt',
    description TEXT COMMENT 'Mô tả cài đặt',
    is_encrypted BOOLEAN DEFAULT FALSE COMMENT 'Có mã hóa giá trị',
    is_system BOOLEAN DEFAULT FALSE COMMENT 'Cài đặt hệ thống (không cho phép xóa)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_setting_key (setting_key),
    INDEX idx_category (category),
    INDEX idx_is_system (is_system)
) COMMENT = 'Bảng cài đặt hệ thống';

-- Bảng quản lý watermark
CREATE TABLE watermarks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL COMMENT 'Tên watermark',
    image_path VARCHAR(500) COMMENT 'Đường dẫn ảnh watermark',
    text_content VARCHAR(200) COMMENT 'Nội dung text watermark',
    position ENUM('top-left', 'top-right', 'bottom-left', 'bottom-right', 'center') DEFAULT 'bottom-right' COMMENT 'Vị trí watermark',
    opacity DECIMAL(3,2) DEFAULT 0.50 COMMENT 'Độ trong suốt (0-1)',
    size_percent INT DEFAULT 10 COMMENT 'Kích thước theo phần trăm',
    font_family VARCHAR(50) DEFAULT 'Times New Roman' COMMENT 'Font chữ (cho text watermark)',
    font_size INT DEFAULT 12 COMMENT 'Kích thước font',
    color VARCHAR(7) DEFAULT '#FFFFFF' COMMENT 'Màu sắc (hex)',
    enabled BOOLEAN DEFAULT TRUE COMMENT 'Có áp dụng watermark',
    apply_to ENUM('all', 'detections', 'exports') DEFAULT 'all' COMMENT 'Áp dụng cho',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_name (name),
    INDEX idx_enabled (enabled)
) COMMENT = 'Bảng quản lý watermark';

-- =====================================================
-- PHẦN 9: VIEWS HỖ TRỢ TRUY VẤN
-- =====================================================

-- View thống kê phát hiện theo ngày
CREATE OR REPLACE VIEW daily_detection_stats AS
SELECT 
    DATE(detection_time) as detection_date,
    COUNT(*) as total_detections,
    COUNT(DISTINCT plate_number) as unique_plates,
    COUNT(DISTINCT camera_id) as active_cameras,
    AVG(confidence) as avg_confidence,
    COUNT(CASE WHEN is_verified = TRUE THEN 1 END) as verified_count,
    COUNT(CASE WHEN confidence >= 0.9 THEN 1 END) as high_confidence_count
FROM license_plate_detections 
GROUP BY DATE(detection_time)
ORDER BY detection_date DESC;

-- View lộ trình di chuyển chi tiết
CREATE OR REPLACE VIEW vehicle_movement_details AS
SELECT 
    jp.journey_id,
    vj.plate_number,
    vj.journey_date,
    jp.sequence_number,
    jp.point_time,
    l.name as location_name,
    l.zone_type,
    c.name as camera_name,
    jp.direction,
    jp.speed,
    jp.distance_from_previous,
    jp.time_from_previous,
    lpd.confidence,
    lpd.image_path
FROM journey_points jp
JOIN vehicle_journeys vj ON jp.journey_id = vj.id
JOIN locations l ON jp.location_id = l.id
JOIN cameras c ON jp.camera_id = c.id
JOIN license_plate_detections lpd ON jp.detection_id = lpd.id
ORDER BY jp.journey_id, jp.sequence_number;

-- View cảnh báo chưa xử lý
CREATE OR REPLACE VIEW pending_alerts AS
SELECT 
    a.*,
    l.name as location_name,
    c.name as camera_name,
    u.name as user_name
FROM alerts a
LEFT JOIN locations l ON a.location_id = l.id
LEFT JOIN cameras c ON a.camera_id = c.id
LEFT JOIN users u ON a.user_id = u.id
WHERE a.status IN ('new', 'acknowledged')
ORDER BY a.severity DESC, a.created_at DESC;

-- View thống kê whitelist/blacklist
CREATE OR REPLACE VIEW access_control_stats AS
SELECT 
    list_type,
    COUNT(*) as total_entries,
    COUNT(CASE WHEN is_active = TRUE THEN 1 END) as active_entries,
    COUNT(CASE WHEN effective_until IS NOT NULL AND effective_until > NOW() THEN 1 END) as temporary_entries,
    COUNT(CASE WHEN location_id IS NOT NULL THEN 1 END) as location_specific_entries
FROM access_control_lists
GROUP BY list_type;

-- View thống kê vào/ra theo ngày
CREATE OR REPLACE VIEW daily_entry_exit_stats AS
SELECT 
    DATE(entry_time) as log_date,
    veel.monitoring_location_id,
    l.name as location_name,
    l.zone_type,
    COUNT(*) as total_entries,
    COUNT(exit_time) as total_exits,
    COUNT(*) - COUNT(exit_time) as vehicles_inside,
    AVG(duration_minutes) as avg_duration_minutes,
    COUNT(CASE WHEN is_overstay = TRUE THEN 1 END) as overstay_count,
    COUNT(CASE WHEN status = 'no_exit_record' THEN 1 END) as no_exit_count
FROM vehicle_entry_exit_logs veel
JOIN locations l ON veel.monitoring_location_id = l.id
GROUP BY DATE(entry_time), veel.monitoring_location_id, l.name, l.zone_type
ORDER BY log_date DESC, veel.monitoring_location_id;

-- View hiển thị các phương tiện hiện đang trong khu vực
CREATE OR REPLACE VIEW vehicles_currently_inside AS
SELECT 
    veel.*,
    l.name as location_name,
    l.zone_type,
    l.max_stay_duration_hours,
    TIMESTAMPDIFF(MINUTE, entry_time, NOW()) as current_duration_minutes,
    CASE 
        WHEN TIMESTAMPDIFF(HOUR, entry_time, NOW()) > l.max_stay_duration_hours 
        THEN TRUE 
        ELSE FALSE 
    END as is_currently_overstay,
    v.vehicle_type,
    v.owner_name,
    entry_cam.name as entry_camera_name,
    entry_loc.name as entry_location_name
FROM vehicle_entry_exit_logs veel
JOIN locations l ON veel.monitoring_location_id = l.id
LEFT JOIN vehicles v ON veel.vehicle_id = v.id
LEFT JOIN cameras entry_cam ON veel.entry_camera_id = entry_cam.id
LEFT JOIN locations entry_loc ON veel.entry_location_id = entry_loc.id
WHERE veel.status = 'entered' 
AND veel.exit_time IS NULL
ORDER BY veel.entry_time DESC;

-- View cấu hình vào/ra của locations
CREATE OR REPLACE VIEW location_entry_exit_config AS
SELECT 
    l.id,
    l.name,
    l.zone_type,
    l.entry_exit_pair_id,
    l.is_main_entry,
    l.is_main_exit,
    l.max_stay_duration_hours,
    l.alert_on_overstay,
    l.alert_on_no_exit,
    COUNT(c.id) as camera_count,
    GROUP_CONCAT(c.name SEPARATOR ', ') as cameras,
    GROUP_CONCAT(c.camera_role SEPARATOR ', ') as camera_roles
FROM locations l
LEFT JOIN cameras c ON l.id = c.location_id OR l.id = c.monitoring_location_id
WHERE l.zone_type IN ('entry_point', 'exit_point', 'monitoring_zone', 'entrance', 'exit')
GROUP BY l.id, l.name, l.zone_type, l.entry_exit_pair_id, l.is_main_entry, l.is_main_exit, 
         l.max_stay_duration_hours, l.alert_on_overstay, l.alert_on_no_exit;

-- =====================================================
-- PHẦN 10: STORED PROCEDURES
-- =====================================================

DELIMITER //

-- Procedure tìm kiếm phát hiện theo biển số và khoảng thời gian
CREATE PROCEDURE SearchDetectionsByPlateAndTime(
    IN p_plate_number VARCHAR(20),
    IN p_start_time DATETIME,
    IN p_end_time DATETIME,
    IN p_location_id INT,
    IN p_limit INT
)
BEGIN
    SELECT 
        lpd.*,
        l.name as location_name,
        c.name as camera_name,
        v.vehicle_type,
        v.owner_name
    FROM license_plate_detections lpd
    JOIN locations l ON lpd.location_id = l.id
    JOIN cameras c ON lpd.camera_id = c.id
    LEFT JOIN vehicles v ON lpd.vehicle_id = v.id
    WHERE 
        (p_plate_number IS NULL OR lpd.plate_number LIKE CONCAT('%', p_plate_number, '%'))
        AND (p_start_time IS NULL OR lpd.detection_time >= p_start_time)
        AND (p_end_time IS NULL OR lpd.detection_time <= p_end_time)
        AND (p_location_id IS NULL OR lpd.location_id = p_location_id)
    ORDER BY lpd.detection_time DESC
    LIMIT p_limit;
END //

-- Procedure tạo chuyến đi từ các phát hiện
CREATE PROCEDURE CreateJourneyFromDetections(
    IN p_plate_number VARCHAR(20),
    IN p_journey_date DATE
)
BEGIN
    DECLARE v_journey_id BIGINT;
    DECLARE v_detection_count INT;
    DECLARE v_start_time DATETIME;
    DECLARE v_end_time DATETIME;
    DECLARE v_start_location_id INT;
    DECLARE v_end_location_id INT;
    
    -- Lấy thông tin chuyến đi
    SELECT 
        MIN(detection_time),
        MAX(detection_time),
        COUNT(*),
        MIN(location_id),
        MAX(location_id)
    INTO v_start_time, v_end_time, v_detection_count, v_start_location_id, v_end_location_id
    FROM license_plate_detections 
    WHERE plate_number = p_plate_number 
    AND DATE(detection_time) = p_journey_date;
    
    IF v_detection_count > 0 THEN
        -- Tạo chuyến đi mới
        INSERT INTO vehicle_journeys (
            plate_number, journey_date, start_time, end_time,
            start_location_id, end_location_id, detection_count, status
        ) VALUES (
            p_plate_number, p_journey_date, v_start_time, v_end_time,
            v_start_location_id, v_end_location_id, v_detection_count, 'completed'
        );
        
        SET v_journey_id = LAST_INSERT_ID();
        
        -- Tạo các điểm trên lộ trình
        INSERT INTO journey_points (
            journey_id, detection_id, sequence_number, point_time,
            location_id, camera_id, direction
        )
        SELECT 
            v_journey_id,
            id,
            ROW_NUMBER() OVER (ORDER BY detection_time),
            detection_time,
            location_id,
            camera_id,
            direction
        FROM license_plate_detections 
        WHERE plate_number = p_plate_number 
        AND DATE(detection_time) = p_journey_date
        ORDER BY detection_time;
        
        SELECT v_journey_id as journey_id;
    END IF;
END //

-- Procedure kiểm tra whitelist/blacklist
CREATE PROCEDURE CheckAccessControl(
    IN p_plate_number VARCHAR(20),
    IN p_location_id INT,
    OUT p_list_type VARCHAR(20),
    OUT p_is_allowed BOOLEAN,
    OUT p_reason TEXT
)
BEGIN
    DECLARE v_count INT DEFAULT 0;
    
    -- Kiểm tra blacklist trước
    SELECT COUNT(*), MAX(reason) 
    INTO v_count, p_reason
    FROM access_control_lists 
    WHERE plate_number = p_plate_number 
    AND list_type = 'blacklist'
    AND is_active = TRUE
    AND (location_id IS NULL OR location_id = p_location_id)
    AND (effective_from IS NULL OR effective_from <= NOW())
    AND (effective_until IS NULL OR effective_until >= NOW());
    
    IF v_count > 0 THEN
        SET p_list_type = 'blacklist';
        SET p_is_allowed = FALSE;
    ELSE
        -- Kiểm tra whitelist
        SELECT COUNT(*), MAX(reason) 
        INTO v_count, p_reason
        FROM access_control_lists 
        WHERE plate_number = p_plate_number 
        AND list_type = 'whitelist'
        AND is_active = TRUE
        AND (location_id IS NULL OR location_id = p_location_id)
        AND (effective_from IS NULL OR effective_from <= NOW())
        AND (effective_until IS NULL OR effective_until >= NOW());
        
        IF v_count > 0 THEN
            SET p_list_type = 'whitelist';
            SET p_is_allowed = TRUE;
        ELSE
            SET p_list_type = NULL;
            SET p_is_allowed = TRUE; -- Mặc định cho phép nếu không có trong danh sách
            SET p_reason = 'Không có trong danh sách kiểm soát';
        END IF;
    END IF;
END //

-- Procedure xử lý phát hiện mới
CREATE PROCEDURE ProcessNewDetection(
    IN p_detection_id BIGINT,
    IN p_plate_number VARCHAR(20),
    IN p_camera_id INT,
    IN p_location_id INT,
    IN p_detection_time DATETIME,
    IN p_confidence FLOAT,
    IN p_image_path VARCHAR(500)
)
BEGIN
    DECLARE v_camera_role VARCHAR(20);
    DECLARE v_monitoring_location_id INT;
    DECLARE v_location_zone_type VARCHAR(50);
    DECLARE v_entry_exit_pair_id INT;
    DECLARE v_entry_log_id BIGINT;
    DECLARE v_existing_entry_count INT;
    
    -- Lấy thông tin camera
    SELECT camera_role, COALESCE(monitoring_location_id, location_id) 
    INTO v_camera_role, v_monitoring_location_id
    FROM cameras 
    WHERE id = p_camera_id;
    
    -- Lấy thông tin location
    SELECT zone_type, entry_exit_pair_id 
    INTO v_location_zone_type, v_entry_exit_pair_id
    FROM locations 
    WHERE id = p_location_id;
    
    -- Xác định monitoring location
    IF v_monitoring_location_id IS NULL THEN
        SET v_monitoring_location_id = p_location_id;
    END IF;
    
    -- Xử lý theo vai trò camera hoặc loại location
    IF v_camera_role = 'entry' OR v_location_zone_type IN ('entry_point', 'entrance') THEN
        -- Xử lý phát hiện tại camera/vị trí vào
        SELECT COUNT(*), MAX(id)
        INTO v_existing_entry_count, v_entry_log_id
        FROM vehicle_entry_exit_logs 
        WHERE plate_number = p_plate_number 
        AND monitoring_location_id = v_monitoring_location_id 
        AND status = 'entered' 
        AND exit_time IS NULL;
        
        IF v_existing_entry_count = 0 THEN
            -- Tạo bản ghi vào mới
            INSERT INTO vehicle_entry_exit_logs (
                plate_number, monitoring_location_id, entry_detection_id, entry_time,
                entry_camera_id, entry_location_id, entry_confidence, 
                entry_image_path, status
            ) VALUES (
                p_plate_number, v_monitoring_location_id, p_detection_id, p_detection_time,
                p_camera_id, p_location_id, p_confidence, p_image_path, 'entered'
            );
        END IF;
        
    ELSEIF v_camera_role = 'exit' OR v_location_zone_type IN ('exit_point', 'exit') THEN
        -- Xử lý phát hiện tại camera/vị trí ra
        SELECT id INTO v_entry_log_id
        FROM vehicle_entry_exit_logs 
        WHERE plate_number = p_plate_number 
        AND monitoring_location_id = v_monitoring_location_id 
        AND status = 'entered' 
        AND exit_time IS NULL
        ORDER BY entry_time DESC 
        LIMIT 1;
        
        IF v_entry_log_id IS NOT NULL THEN
            -- Cập nhật thông tin ra
            UPDATE vehicle_entry_exit_logs 
            SET 
                exit_detection_id = p_detection_id,
                exit_time = p_detection_time,
                exit_camera_id = p_camera_id,
                exit_location_id = p_location_id,
                exit_confidence = p_confidence,
                exit_image_path = p_image_path,
                duration_minutes = TIMESTAMPDIFF(MINUTE, entry_time, p_detection_time),
                status = 'exited'
            WHERE id = v_entry_log_id;
        END IF;
    END IF;
END //

-- Procedure kiểm tra và cảnh báo xe ở lại quá lâu
CREATE PROCEDURE CheckOverstayVehicles()
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_log_id BIGINT;
    DECLARE v_plate_number VARCHAR(20);
    DECLARE v_location_name VARCHAR(100);
    DECLARE v_entry_time DATETIME;
    DECLARE v_duration_hours INT;
    
    DECLARE overstay_cursor CURSOR FOR
        SELECT 
            veel.id, veel.plate_number, l.name, veel.entry_time,
            TIMESTAMPDIFF(HOUR, veel.entry_time, NOW()) as duration_hours
        FROM vehicle_entry_exit_logs veel
        JOIN locations l ON veel.monitoring_location_id = l.id
        WHERE veel.status = 'entered' 
        AND veel.exit_time IS NULL
        AND TIMESTAMPDIFF(HOUR, veel.entry_time, NOW()) > l.max_stay_duration_hours
        AND veel.overstay_alert_sent = FALSE
        AND l.alert_on_overstay = TRUE;
        
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    OPEN overstay_cursor;
    
    read_loop: LOOP
        FETCH overstay_cursor INTO v_log_id, v_plate_number, v_location_name, v_entry_time, v_duration_hours;
        IF done THEN
            LEAVE read_loop;
        END IF;
        
        -- Cập nhật trạng thái overstay
        UPDATE vehicle_entry_exit_logs 
        SET is_overstay = TRUE, overstay_alert_sent = TRUE, status = 'overstay'
        WHERE id = v_log_id;
        
        -- Tạo cảnh báo
        INSERT INTO alerts (
            alert_type, severity, title, message, plate_number,
            alert_data
        ) VALUES (
            'overstay', 'medium',
            CONCAT('Xe ở lại quá lâu: ', v_plate_number),
            CONCAT('Xe biển số ', v_plate_number, ' đã ở trong khu vực ', v_location_name, 
                   ' trong ', v_duration_hours, ' giờ (vào lúc ', v_entry_time, ')'),
            v_plate_number,
            JSON_OBJECT(
                'log_id', v_log_id,
                'location_name', v_location_name,
                'entry_time', v_entry_time,
                'duration_hours', v_duration_hours
            )
        );
        
    END LOOP;
    
    CLOSE overstay_cursor;
END //

-- Function hỗ trợ lấy thông tin cặp vào/ra
CREATE FUNCTION GetPairedLocation(p_location_id INT, p_target_type VARCHAR(20)) 
RETURNS INT
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE v_pair_id INT;
    DECLARE v_result_id INT DEFAULT NULL;
    
    -- Lấy entry_exit_pair_id của location hiện tại
    SELECT entry_exit_pair_id INTO v_pair_id
    FROM locations 
    WHERE id = p_location_id;
    
    IF v_pair_id IS NOT NULL THEN
        -- Tìm location có cùng pair_id nhưng khác type
        SELECT id INTO v_result_id
        FROM locations 
        WHERE entry_exit_pair_id = v_pair_id 
        AND zone_type = p_target_type
        AND id != p_location_id
        LIMIT 1;
    END IF;
    
    RETURN v_result_id;
END //

DELIMITER ;

-- =====================================================
-- PHẦN 11: TRIGGERS TỰ ĐỘNG
-- =====================================================

DELIMITER //

-- Trigger tự động tạo cảnh báo khi phát hiện xe trong blacklist
CREATE TRIGGER tr_detection_blacklist_alert
AFTER INSERT ON license_plate_detections
FOR EACH ROW
BEGIN
    DECLARE v_blacklist_count INT DEFAULT 0;
    DECLARE v_reason TEXT;
    
    -- Kiểm tra xe có trong blacklist không
    SELECT COUNT(*), MAX(reason) 
    INTO v_blacklist_count, v_reason
    FROM access_control_lists 
    WHERE plate_number = NEW.plate_number 
    AND list_type = 'blacklist'
    AND is_active = TRUE
    AND (location_id IS NULL OR location_id = NEW.location_id)
    AND (effective_from IS NULL OR effective_from <= NEW.detection_time)
    AND (effective_until IS NULL OR effective_until >= NEW.detection_time);
    
    -- Tạo cảnh báo nếu xe trong blacklist
    IF v_blacklist_count > 0 THEN
        INSERT INTO alerts (
            alert_type, severity, title, message, 
            plate_number, detection_id, camera_id, location_id,
            alert_data
        ) VALUES (
            'blacklist_detected', 'high',
            CONCAT('Phát hiện xe blacklist: ', NEW.plate_number),
            CONCAT('Xe có biển số ', NEW.plate_number, ' trong danh sách blacklist đã được phát hiện. Lý do: ', COALESCE(v_reason, 'Không rõ')),
            NEW.plate_number, NEW.id, NEW.camera_id, NEW.location_id,
            JSON_OBJECT('confidence', NEW.confidence, 'reason', v_reason)
        );
    END IF;
END //

-- Trigger tự động xử lý khi có phát hiện mới
CREATE TRIGGER tr_auto_process_entry_exit
AFTER INSERT ON license_plate_detections
FOR EACH ROW
BEGIN
    CALL ProcessNewDetection(
        NEW.id, NEW.plate_number, NEW.camera_id, NEW.location_id,
        NEW.detection_time, NEW.confidence, NEW.image_path
    );
END //

-- Trigger cập nhật thời gian đăng nhập cuối
CREATE TRIGGER tr_update_last_login
AFTER INSERT ON login_logs
FOR EACH ROW
BEGIN
    IF NEW.status = 'success' AND NEW.user_id IS NOT NULL THEN
        UPDATE users 
        SET last_login = NEW.created_at,
            failed_login_attempts = 0,
            account_locked = FALSE
        WHERE id = NEW.user_id;
    ELSEIF NEW.status = 'fail' AND NEW.user_id IS NOT NULL THEN
        UPDATE users 
        SET failed_login_attempts = failed_login_attempts + 1
        WHERE id = NEW.user_id;
        
        -- Khóa tài khoản nếu đăng nhập sai quá nhiều lần
        UPDATE users 
        SET account_locked = TRUE,
            lock_until = DATE_ADD(NOW(), INTERVAL 30 MINUTE)
        WHERE id = NEW.user_id 
        AND failed_login_attempts >= 5;
    END IF;
END //

DELIMITER ;

-- =====================================================
-- PHẦN 12: DỮ LIỆU MẪU VÀ CẤU HÌNH BAN ĐẦU
-- =====================================================

-- Thêm quyền cơ bản
INSERT INTO permissions (module, action, code, description) VALUES
-- Quản lý người dùng
('users', 'view', 'users.view', 'Xem danh sách người dùng'),
('users', 'create', 'users.create', 'Tạo người dùng mới'),
('users', 'update', 'users.update', 'Cập nhật thông tin người dùng'),
('users', 'delete', 'users.delete', 'Xóa người dùng'),
('users', 'search', 'users.search', 'Tìm kiếm người dùng'),

-- Quản lý vai trò
('roles', 'view', 'roles.view', 'Xem danh sách vai trò'),
('roles', 'create', 'roles.create', 'Tạo vai trò mới'),
('roles', 'update', 'roles.update', 'Cập nhật vai trò'),
('roles', 'delete', 'roles.delete', 'Xóa vai trò'),

-- Quản lý quyền
('permissions', 'view', 'permissions.view', 'Xem danh sách quyền'),
('permissions', 'create', 'permissions.create', 'Tạo quyền mới'),
('permissions', 'update', 'permissions.update', 'Cập nhật quyền'),
('permissions', 'delete', 'permissions.delete', 'Xóa quyền'),

-- Quản lý phát hiện biển số
('detections', 'view', 'detections.view', 'Xem danh sách phát hiện'),
('detections', 'create', 'detections.create', 'Tạo bản ghi phát hiện'),
('detections', 'update', 'detections.update', 'Cập nhật thông tin phát hiện'),
('detections', 'delete', 'detections.delete', 'Xóa bản ghi phát hiện'),
('detections', 'search', 'detections.search', 'Tìm kiếm phát hiện'),
('detections', 'filter', 'detections.filter', 'Lọc dữ liệu phát hiện'),
('detections', 'review', 'detections.review', 'Xem xét và xác minh phát hiện'),
('detections', 'uploadImg', 'detections.uploadImg', 'Upload ảnh phát hiện'),
('detections', 'deleteImg', 'detections.deleteImg', 'Xóa ảnh phát hiện'),

-- Quản lý phương tiện
('vehicles', 'view', 'vehicles.view', 'Xem danh sách phương tiện'),
('vehicles', 'create', 'vehicles.create', 'Tạo thông tin phương tiện'),
('vehicles', 'update', 'vehicles.update', 'Cập nhật thông tin phương tiện'),
('vehicles', 'delete', 'vehicles.delete', 'Xóa thông tin phương tiện'),
('vehicles', 'search', 'vehicles.search', 'Tìm kiếm phương tiện'),

-- Quản lý whitelist/blacklist
('access_control', 'view', 'access_control.view', 'Xem danh sách kiểm soát truy cập'),
('access_control', 'create', 'access_control.create', 'Thêm vào whitelist/blacklist'),
('access_control', 'update', 'access_control.update', 'Cập nhật danh sách kiểm soát'),
('access_control', 'delete', 'access_control.delete', 'Xóa khỏi danh sách kiểm soát'),

-- Quản lý lộ trình
('journeys', 'view', 'journeys.view', 'Xem lộ trình di chuyển'),
('journeys', 'search', 'journeys.search', 'Tìm kiếm lộ trình'),
('journeys', 'filter', 'journeys.filter', 'Lọc dữ liệu lộ trình'),

-- Quản lý camera
('cameras', 'view', 'cameras.view', 'Xem danh sách camera'),
('cameras', 'create', 'cameras.create', 'Thêm camera mới'),
('cameras', 'update', 'cameras.update', 'Cập nhật thông tin camera'),
('cameras', 'delete', 'cameras.delete', 'Xóa camera'),

-- Quản lý vị trí
('locations', 'view', 'locations.view', 'Xem danh sách vị trí'),
('locations', 'create', 'locations.create', 'Thêm vị trí mới'),
('locations', 'update', 'locations.update', 'Cập nhật thông tin vị trí'),
('locations', 'delete', 'locations.delete', 'Xóa vị trí'),

-- Quản lý cảnh báo
('alerts', 'view', 'alerts.view', 'Xem danh sách cảnh báo'),
('alerts', 'create', 'alerts.create', 'Tạo cảnh báo'),
('alerts', 'update', 'alerts.update', 'Cập nhật cảnh báo'),
('alerts', 'delete', 'alerts.delete', 'Xóa cảnh báo'),

-- Báo cáo và thống kê
('reports', 'view', 'reports.view', 'Xem báo cáo'),
('reports', 'create', 'reports.create', 'Tạo báo cáo'),
('reports', 'export', 'reports.export', 'Xuất báo cáo'),

-- Cài đặt hệ thống
('settings', 'view', 'settings.view', 'Xem cài đặt hệ thống'),
('settings', 'update', 'settings.update', 'Cập nhật cài đặt hệ thống'),

-- Nhật ký hệ thống
('logs', 'view', 'logs.view', 'Xem nhật ký hệ thống'),
('logs', 'export', 'logs.export', 'Xuất nhật ký'),

-- Quản lý watermark
('watermarks', 'view', 'watermarks.view', 'Xem watermark'),
('watermarks', 'create', 'watermarks.create', 'Tạo watermark'),
('watermarks', 'update', 'watermarks.update', 'Cập nhật watermark'),
('watermarks', 'delete', 'watermarks.delete', 'Xóa watermark');

-- Thêm vai trò mặc định
INSERT INTO roles (name, description, is_default_role, level) VALUES
('SuperAdmin', 'Quản trị viên cấp cao nhất - có tất cả quyền', FALSE, 100),
('Admin', 'Quản trị viên hệ thống - quản lý toàn bộ', FALSE, 90),
('Manager', 'Quản lý - giám sát và quản lý hoạt động', FALSE, 70),
('Operator', 'Người vận hành - xử lý dữ liệu hàng ngày', FALSE, 50),
('Viewer', 'Người xem - chỉ được xem dữ liệu', TRUE, 10);

-- Phân quyền cho SuperAdmin (có tất cả quyền)
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT 1, id, TRUE FROM permissions;

-- Phân quyền cho Admin (trừ một số quyền nhạy cảm)
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT 2, id, TRUE FROM permissions 
WHERE code NOT IN ('users.delete', 'roles.delete', 'permissions.delete');

-- Phân quyền cho Manager
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT 3, id, TRUE FROM permissions 
WHERE code IN (
    'detections.view', 'detections.search', 'detections.filter', 'detections.review',
    'vehicles.view', 'vehicles.search', 'vehicles.create', 'vehicles.update',
    'access_control.view', 'access_control.create', 'access_control.update',
    'journeys.view', 'journeys.search', 'journeys.filter',
    'cameras.view', 'locations.view',
    'alerts.view', 'alerts.create', 'alerts.update',
    'reports.view', 'reports.create', 'reports.export',
    'logs.view'
);

-- Phân quyền cho Operator
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT 4, id, TRUE FROM permissions 
WHERE code IN (
    'detections.view', 'detections.search', 'detections.filter', 'detections.review', 'detections.uploadImg',
    'vehicles.view', 'vehicles.search',
    'access_control.view',
    'journeys.view', 'journeys.search',
    'cameras.view', 'locations.view',
    'alerts.view'
);

-- Phân quyền cho Viewer
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT 5, id, TRUE FROM permissions 
WHERE code IN (
    'detections.view', 'detections.search', 'detections.filter',
    'vehicles.view', 'vehicles.search',
    'journeys.view', 'journeys.search',
    'cameras.view', 'locations.view',
    'alerts.view'
);

-- Tạo tài khoản SuperAdmin mặc định
INSERT INTO users (name, username, email, password, status) VALUES
('Super Administrator', 'superadmin', 'admin@system.com', 
 '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- password: password
 'active');

-- Gán vai trò SuperAdmin cho user đầu tiên
INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES (1, 1, 1);

-- Cài đặt hệ thống mặc định
INSERT INTO system_settings (setting_key, setting_value, setting_type, category, description, is_system) VALUES
-- Cài đặt chung
('system.name', 'License Plate Recognition System', 'string', 'general', 'Tên hệ thống', TRUE),
('system.version', '1.0.0', 'string', 'general', 'Phiên bản hệ thống', TRUE),
('system.timezone', 'Asia/Ho_Chi_Minh', 'string', 'general', 'Múi giờ hệ thống', FALSE),
('system.language', 'vi', 'string', 'general', 'Ngôn ngữ mặc định', FALSE),
('system.maintenance_mode', 'false', 'boolean', 'general', 'Chế độ bảo trì', FALSE),

-- Cài đặt phát hiện
('detection.confidence_threshold', '0.8', 'number', 'detection', 'Ngưỡng tin cậy tối thiểu', FALSE),
('detection.auto_verify_threshold', '0.95', 'number', 'detection', 'Ngưỡng tự động xác minh', FALSE),
('detection.max_processing_time', '5000', 'number', 'detection', 'Thời gian xử lý tối đa (ms)', FALSE),
('detection.enable_duplicate_check', 'true', 'boolean', 'detection', 'Kiểm tra trùng lặp', FALSE),
('detection.duplicate_time_window', '60', 'number', 'detection', 'Cửa sổ thời gian kiểm tra trùng (giây)', FALSE),

-- Cài đặt lưu trữ
('storage.image_retention_days', '90', 'number', 'storage', 'Số ngày lưu trữ ảnh', FALSE),
('storage.log_retention_days', '365', 'number', 'storage', 'Số ngày lưu trữ log', FALSE),
('storage.max_image_size_mb', '10', 'number', 'storage', 'Kích thước ảnh tối đa (MB)', FALSE),
('storage.image_quality', '85', 'number', 'storage', 'Chất lượng ảnh (1-100)', FALSE),
('storage.enable_compression', 'true', 'boolean', 'storage', 'Nén ảnh tự động', FALSE),

-- Cài đặt thông báo
('notification.email_enabled', 'false', 'boolean', 'notification', 'Bật thông báo email', FALSE),
('notification.sms_enabled', 'false', 'boolean', 'notification', 'Bật thông báo SMS', FALSE),
('notification.alert_cooldown_minutes', '5', 'number', 'notification', 'Thời gian chờ giữa các cảnh báo (phút)', FALSE),
('notification.email_smtp_host', '', 'string', 'notification', 'SMTP Host', FALSE),
('notification.email_smtp_port', '587', 'number', 'notification', 'SMTP Port', FALSE),
('notification.email_username', '', 'string', 'notification', 'SMTP Username', FALSE),
('notification.email_password', '', 'string', 'notification', 'SMTP Password', TRUE),

-- Cài đặt bảo mật
('security.session_timeout_hours', '8', 'number', 'security', 'Thời gian hết hạn phiên (giờ)', FALSE),
('security.max_failed_attempts', '5', 'number', 'security', 'Số lần đăng nhập sai tối đa', FALSE),
('security.account_lockout_minutes', '30', 'number', 'security', 'Thời gian khóa tài khoản (phút)', FALSE),
('security.password_min_length', '8', 'number', 'security', 'Độ dài mật khẩu tối thiểu', FALSE),
('security.password_require_uppercase', 'true', 'boolean', 'security', 'Yêu cầu chữ hoa', FALSE),
('security.password_require_lowercase', 'true', 'boolean', 'security', 'Yêu cầu chữ thường', FALSE),
('security.password_require_numbers', 'true', 'boolean', 'security', 'Yêu cầu số', FALSE),
('security.password_require_symbols', 'false', 'boolean', 'security', 'Yêu cầu ký tự đặc biệt', FALSE),
('security.enable_2fa', 'false', 'boolean', 'security', 'Bật xác thực 2 bước', FALSE),

-- Cài đặt sao lưu
('backup.auto_backup_enabled', 'true', 'boolean', 'backup', 'Tự động sao lưu', FALSE),
('backup.backup_retention_days', '30', 'number', 'backup', 'Số ngày lưu trữ bản sao lưu', FALSE),
('backup.backup_schedule', '0 2 * * *', 'string', 'backup', 'Lịch sao lưu (cron format)', FALSE),
('backup.backup_compression', 'true', 'boolean', 'backup', 'Nén file sao lưu', FALSE),

-- Cài đặt API
('api.rate_limit_per_minute', '60', 'number', 'api', 'Giới hạn request/phút', FALSE),
('api.enable_cors', 'true', 'boolean', 'api', 'Bật CORS', FALSE),
('api.allowed_origins', '*', 'string', 'api', 'Domain được phép truy cập', FALSE),
('api.jwt_secret', 'your-secret-key', 'string', 'api', 'JWT Secret Key', TRUE),
('api.jwt_expiry_hours', '24', 'number', 'api', 'Thời hạn JWT (giờ)', FALSE);

-- Watermark mặc định
INSERT INTO watermarks (name, text_content, position, opacity, size_percent, enabled) VALUES
('Watermark hệ thống', CONCAT('LPR System - ', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i')), 'bottom-right', 0.3, 8, TRUE),
('Watermark bảo mật', 'CONFIDENTIAL', 'bottom-left', 0.5, 6, FALSE);

-- Dữ liệu vị trí mẫu
INSERT INTO locations (name, code, address, zone_type, description, entry_exit_pair_id, is_main_entry, is_main_exit, max_stay_duration_hours) VALUES
('Khu vực giám sát chính', 'MAIN_ZONE', 'Khu vực chính cần giám sát', 'monitoring_zone', 'Khu vực giám sát chính của hệ thống', NULL, FALSE, FALSE, 8),
('Cổng vào chính', 'MAIN_ENTRY', 'Cổng vào chính', 'entry_point', 'Cổng vào chính của khu vực', 1, TRUE, FALSE, NULL),
('Cổng ra chính', 'MAIN_EXIT', 'Cổng ra chính', 'exit_point', 'Cổng ra chính của khu vực', 1, FALSE, TRUE, NULL),
('Bãi đỗ xe A', 'PARKING_A', 'Bãi đỗ xe khu A', 'monitoring_zone', 'Bãi đỗ xe khu vực A', NULL, FALSE, FALSE, 24),
('Cổng vào bãi A', 'PARKING_A_IN', 'Cổng vào bãi A', 'entry_point', 'Cổng vào bãi đỗ xe A', 2, TRUE, FALSE, NULL),
('Cổng ra bãi A', 'PARKING_A_OUT', 'Cổng ra bãi A', 'exit_point', 'Cổng ra bãi đỗ xe A', 2, FALSE, TRUE, NULL),
('Checkpoint 1', 'CP_001', 'Điểm kiểm soát số 1', 'checkpoint', 'Điểm kiểm soát trên đường chính', NULL, FALSE, FALSE, 1),
('Khu vực hạn chế', 'RESTRICTED_01', 'Khu vực cấm', 'restricted', 'Khu vực hạn chế, không được vào', NULL, FALSE, FALSE, 0);

-- Dữ liệu camera mẫu
INSERT INTO cameras (name, code, url, location_id, direction, camera_role, monitoring_location_id, status) VALUES
('Camera vào chính', 'CAM_MAIN_IN', 'rtsp://192.168.1.100/main_entry', 2, 'entry_only', 'entry', 1, 'online'),
('Camera ra chính', 'CAM_MAIN_OUT', 'rtsp://192.168.1.101/main_exit', 3, 'exit_only', 'exit', 1, 'online'),
('Camera vào bãi A', 'CAM_PARK_A_IN', 'rtsp://192.168.1.102/parking_a_in', 5, 'entry_only', 'entry', 4, 'online'),
('Camera ra bãi A', 'CAM_PARK_A_OUT', 'rtsp://192.168.1.103/parking_a_out', 6, 'exit_only', 'exit', 4, 'online'),
('Camera checkpoint 1', 'CAM_CP_001', 'rtsp://192.168.1.104/checkpoint_1', 7, 'bidirectional', 'overview', NULL, 'online'),
('Camera khu hạn chế', 'CAM_REST_01', 'rtsp://192.168.1.105/restricted', 8, 'bidirectional', 'overview', NULL, 'offline');

-- Dữ liệu phương tiện mẫu
INSERT INTO vehicles (plate_number, vehicle_type, make, model, year_manufacture, color, owner_name, owner_phone, registration_date, expiry_date) VALUES
('29A-12345', 'car', 'Toyota', 'Camry', 2020, 'Trắng', 'Nguyễn Văn A', '0901234567', '2020-01-15', '2025-01-15'),
('30B-67890', 'car', 'Honda', 'Civic', 2019, 'Đen', 'Trần Thị B', '0912345678', '2019-05-20', '2024-05-20'),
('31C-11111', 'motorcycle', 'Honda', 'Wave', 2018, 'Đỏ', 'Lê Văn C', '0923456789', '2018-03-10', '2023-03-10'),
('32D-22222', 'truck', 'Hino', '300 Series', 2021, 'Xanh', 'Công ty TNHH ABC', '0934567890', '2021-07-12', '2026-07-12');

-- Dữ liệu access control mẫu
INSERT INTO access_control_lists (plate_number, list_type, reason, description, added_by, priority, alert_on_detection) VALUES
('29A-12345', 'whitelist', 'Xe của nhân viên', 'Xe công ty, được phép ra vào tự do', 1, 1, FALSE),
('30B-67890', 'whitelist', 'Xe khách VIP', 'Khách hàng quan trọng', 1, 2, FALSE),
('99Z-99999', 'blacklist', 'Xe đáng nghi', 'Xe có hành vi đáng nghi, cần theo dõi', 1, 5, TRUE),
('88Y-88888', 'blacklist', 'Xe cấm', 'Xe bị cấm hoàn toàn', 1, 10, TRUE);

-- =====================================================
-- PHẦN 13: INDICES BỔ SUNG ĐỂ TỐI ƯU HIỆU SUẤT
-- =====================================================

-- Tạo các composite index cho hiệu suất cao
CREATE INDEX idx_detection_confidence_time ON license_plate_detections(confidence DESC, detection_time DESC);
CREATE INDEX idx_acl_effective_dates ON access_control_lists(effective_from, effective_until);
CREATE INDEX idx_journey_plate_date ON vehicle_journeys(plate_number, journey_date DESC);
CREATE INDEX idx_journey_points_time ON journey_points(point_time DESC);
CREATE INDEX idx_alerts_plate_time ON alerts(plate_number, created_at DESC);
CREATE INDEX idx_login_logs_email_time ON login_logs(email, created_at DESC);

-- =====================================================
-- PHẦN 14: CÁC EVENTS TỰ ĐỘNG (SCHEDULED TASKS)
-- =====================================================

DELIMITER //

-- Event tự động kiểm tra xe ở lại quá lâu (chạy mỗi 10 phút)
CREATE EVENT IF NOT EXISTS evt_check_overstay_vehicles
ON SCHEDULE EVERY 10 MINUTE
STARTS CURRENT_TIMESTAMP
DO
BEGIN
    CALL CheckOverstayVehicles();
END //

-- Event tự động xóa log cũ (chạy hàng ngày lúc 2h sáng)
CREATE EVENT IF NOT EXISTS evt_cleanup_old_logs
ON SCHEDULE EVERY 1 DAY
STARTS (TIMESTAMP(CURRENT_DATE) + INTERVAL 2 HOUR)
DO
BEGIN
    DECLARE v_log_retention_days INT DEFAULT 365;
    DECLARE v_image_retention_days INT DEFAULT 90;
    
    -- Lấy cài đặt retention
    SELECT CAST(setting_value AS UNSIGNED) INTO v_log_retention_days
    FROM system_settings WHERE setting_key = 'storage.log_retention_days';
    
    SELECT CAST(setting_value AS UNSIGNED) INTO v_image_retention_days
    FROM system_settings WHERE setting_key = 'storage.image_retention_days';
    
    -- Xóa log cũ
    DELETE FROM login_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL v_log_retention_days DAY);
    DELETE FROM access_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL v_log_retention_days DAY);
    DELETE FROM data_integrity_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL v_log_retention_days DAY);
    
    -- Cập nhật đường dẫn ảnh cũ thành NULL (không xóa record, chỉ xóa ảnh)
    UPDATE license_plate_detections 
    SET image_path = NULL, cropped_image_path = NULL 
    WHERE created_at < DATE_SUB(NOW(), INTERVAL v_image_retention_days DAY);
    
    -- Xóa alerts đã giải quyết và cũ hơn 30 ngày
    DELETE FROM alerts 
    WHERE status IN ('resolved', 'dismissed') 
    AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY);
END //

-- Event tự động unlock tài khoản (chạy mỗi 5 phút)
CREATE EVENT IF NOT EXISTS evt_auto_unlock_accounts
ON SCHEDULE EVERY 5 MINUTE
STARTS CURRENT_TIMESTAMP
DO
BEGIN
    UPDATE users 
    SET account_locked = FALSE, lock_until = NULL, failed_login_attempts = 0
    WHERE account_locked = TRUE 
    AND lock_until IS NOT NULL 
    AND lock_until <= NOW();
END //

DELIMITER ;

-- Bật event scheduler
SET GLOBAL event_scheduler = ON;

-- =====================================================
-- PHẦN 15: FUNCTIONS HỖ TRỢ THỐNG KÊ
-- =====================================================

DELIMITER //

-- Function tính toán thống kê phát hiện theo khoảng thời gian
CREATE FUNCTION GetDetectionStats(p_start_date DATE, p_end_date DATE, p_location_id INT)
RETURNS JSON
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE v_total_detections INT DEFAULT 0;
    DECLARE v_unique_plates INT DEFAULT 0;
    DECLARE v_avg_confidence DECIMAL(5,3) DEFAULT 0;
    DECLARE v_verified_count INT DEFAULT 0;
    
    SELECT 
        COUNT(*),
        COUNT(DISTINCT plate_number),
        AVG(confidence),
        COUNT(CASE WHEN is_verified = TRUE THEN 1 END)
    INTO v_total_detections, v_unique_plates, v_avg_confidence, v_verified_count
    FROM license_plate_detections
    WHERE DATE(detection_time) BETWEEN p_start_date AND p_end_date
    AND (p_location_id IS NULL OR location_id = p_location_id);
    
    RETURN JSON_OBJECT(
        'total_detections', v_total_detections,
        'unique_plates', v_unique_plates,
        'avg_confidence', v_avg_confidence,
        'verified_count', v_verified_count,
        'verification_rate', CASE WHEN v_total_detections > 0 THEN v_verified_count / v_total_detections ELSE 0 END
    );
END //

-- Function kiểm tra quyền người dùng
CREATE FUNCTION CheckUserPermission(p_user_id INT, p_permission_code VARCHAR(100))
RETURNS BOOLEAN
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE v_has_permission BOOLEAN DEFAULT FALSE;
    
    SELECT COUNT(*) > 0 INTO v_has_permission
    FROM user_roles ur
    JOIN role_permissions rp ON ur.role_id = rp.role_id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = p_user_id
    AND ur.is_active = TRUE
    AND p.code = p_permission_code
    AND p.is_active = TRUE
    AND rp.granted = TRUE;
    
    RETURN v_has_permission;
END //

-- Function tính khoảng cách giữa 2 vị trí (km)
CREATE FUNCTION CalculateDistance(p_lat1 DECIMAL(10,8), p_lon1 DECIMAL(11,8), p_lat2 DECIMAL(10,8), p_lon2 DECIMAL(11,8))
RETURNS DECIMAL(10,3)
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE v_distance DECIMAL(10,3);
    DECLARE v_earth_radius DECIMAL(10,3) DEFAULT 6371.0; -- Bán kính Trái Đất (km)
    DECLARE v_lat1_rad DECIMAL(15,10);
    DECLARE v_lat2_rad DECIMAL(15,10);
    DECLARE v_delta_lat DECIMAL(15,10);
    DECLARE v_delta_lon DECIMAL(15,10);
    DECLARE v_a DECIMAL(15,10);
    DECLARE v_c DECIMAL(15,10);
    
    -- Chuyển đổi độ sang radian
    SET v_lat1_rad = RADIANS(p_lat1);
    SET v_lat2_rad = RADIANS(p_lat2);
    SET v_delta_lat = RADIANS(p_lat2 - p_lat1);
    SET v_delta_lon = RADIANS(p_lon2 - p_lon1);
    
    -- Công thức Haversine
    SET v_a = SIN(v_delta_lat/2) * SIN(v_delta_lat/2) + 
              COS(v_lat1_rad) * COS(v_lat2_rad) * 
              SIN(v_delta_lon/2) * SIN(v_delta_lon/2);
    SET v_c = 2 * ATAN2(SQRT(v_a), SQRT(1-v_a));
    SET v_distance = v_earth_radius * v_c;
    
    RETURN v_distance;
END //

DELIMITER ;