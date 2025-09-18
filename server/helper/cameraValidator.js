const { body, param, query, validationResult } = require('express-validator');

// Helper function to handle validation results
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Dữ liệu không hợp lệ',
            errors: errors.array().map(error => ({
                field: error.param,
                message: error.msg,
                value: error.value
            }))
        });
    }
    next();
};

// Create camera validator
const createCameraValidator = [
    body('name')
        .notEmpty()
        .withMessage('Tên camera là bắt buộc')
        .isLength({ min: 1, max: 100 })
        .withMessage('Tên camera phải từ 1-100 ký tự')
        .trim(),
    
    body('code')
        .optional()
        .isLength({ max: 20 })
        .withMessage('Mã camera không được quá 20 ký tự')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('Mã camera chỉ được chứa chữ, số, _ và -')
        .trim(),
    
    body('protocol')
        .optional()
        .isIn(['rtsp', 'http', 'https'])
        .withMessage('Giao thức không hợp lệ'),
    
    body('host')
        .optional()
        .isLength({ max: 255 })
        .withMessage('Host không được quá 255 ký tự')
        .trim(),
    
    body('port')
        .optional()
        .isInt({ min: 1, max: 65535 })
        .withMessage('Port phải từ 1-65535'),
    
    body('path')
        .optional()
        .isLength({ max: 255 })
        .withMessage('Path không được quá 255 ký tự')
        .trim(),
    
    body('location_id')
        .notEmpty()
        .withMessage('Vị trí lắp đặt là bắt buộc')
        .isInt({ min: 1 })
        .withMessage('ID vị trí phải là số nguyên dương'),
    
    body('direction')
        .optional()
        .isIn(['inbound', 'outbound', 'bidirectional', 'entry_only', 'exit_only'])
        .withMessage('Hướng giám sát không hợp lệ'),
    
    body('camera_type')
        .optional()
        .isIn(['fixed', 'ptz', 'mobile'])
        .withMessage('Loại camera không hợp lệ'),
    
    body('camera_role')
        .optional()
        .isIn(['entry', 'exit', 'internal', 'overview'])
        .withMessage('Vai trò camera không hợp lệ'),
    
    body('width')
        .optional()
        .isInt({ min: 1, max: 7680 })
        .withMessage('Chiều rộng phải từ 1-7680'),
    
    body('height')
        .optional()
        .isInt({ min: 1, max: 4320 })
        .withMessage('Chiều cao phải từ 1-4320'),
    
    body('fps')
        .optional()
        .isInt({ min: 1, max: 120 })
        .withMessage('FPS phải từ 1-120'),
    
    body('installation_date')
        .optional()
        .isISO8601()
        .withMessage('Ngày lắp đặt phải có định dạng ISO8601 (YYYY-MM-DD)'),
    
    body('maintenance_schedule')
        .optional()
        .isLength({ max: 100 })
        .withMessage('Lịch bảo trì không được quá 100 ký tự')
        .trim(),
    
    body('details')
        .optional()
        .isLength({ max: 1000 })
        .withMessage('Chi tiết không được quá 1000 ký tự')
        .trim(),
    
    handleValidationErrors
];

// Update camera validator
const updateCameraValidator = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('ID camera phải là số nguyên dương'),
    
    body('name')
        .optional()
        .isLength({ min: 1, max: 100 })
        .withMessage('Tên camera phải từ 1-100 ký tự')
        .trim(),
    
    body('code')
        .optional()
        .isLength({ max: 20 })
        .withMessage('Mã camera không được quá 20 ký tự')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('Mã camera chỉ được chứa chữ, số, _ và -')
        .trim(),
    
    body('url')
        .optional()
        .isLength({ max: 500 })
        .withMessage('URL camera không được quá 500 ký tự')
        .trim(),
    
    body('location_id')
        .optional()
        .isInt({ min: 1 })
        .withMessage('ID vị trí phải là số nguyên dương'),
    
    body('direction')
        .optional()
        .isIn(['inbound', 'outbound', 'bidirectional', 'entry_only', 'exit_only'])
        .withMessage('Hướng giám sát không hợp lệ'),
    
    body('camera_type')
        .optional()
        .isIn(['fixed', 'ptz', 'mobile'])
        .withMessage('Loại camera không hợp lệ'),
    
    body('camera_role')
        .optional()
        .isIn(['entry', 'exit', 'internal', 'overview'])
        .withMessage('Vai trò camera không hợp lệ'),
    
    body('resolution')
        .optional()
        .matches(/^\d+x\d+$/)
        .withMessage('Độ phân giải phải có định dạng WIDTHxHEIGHT (ví dụ: 1920x1080)')
        .trim(),
    
    body('fps')
        .optional()
        .isInt({ min: 1, max: 120 })
        .withMessage('FPS phải từ 1-120'),
    
    body('status')
        .optional()
        .isIn(['online', 'offline', 'maintenance'])
        .withMessage('Trạng thái camera không hợp lệ'),
    
    body('installation_date')
        .optional()
        .isISO8601()
        .withMessage('Ngày lắp đặt phải có định dạng ISO8601 (YYYY-MM-DD)'),
    
    body('maintenance_schedule')
        .optional()
        .isLength({ max: 100 })
        .withMessage('Lịch bảo trì không được quá 100 ký tự')
        .trim(),
    
    handleValidationErrors
];

// Delete camera validator
const deleteCameraValidator = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('ID camera phải là số nguyên dương'),
    
    handleValidationErrors
];

// Status update validator
const updateStatusValidator = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('ID camera phải là số nguyên dương'),
    
    body('status')
        .notEmpty()
        .withMessage('Trạng thái là bắt buộc')
        .isIn(['online', 'offline', 'maintenance'])
        .withMessage('Trạng thái camera không hợp lệ'),
    
    handleValidationErrors
];

// Bulk operations validator
const bulkOperationValidator = [
    body('cameraIds')
        .isArray({ min: 1 })
        .withMessage('Danh sách ID camera phải là mảng và không rỗng'),
    
    body('cameraIds.*')
        .isInt({ min: 1 })
        .withMessage('Mỗi ID camera phải là số nguyên dương'),
    
    handleValidationErrors
];

// Bulk status update validator
const bulkStatusUpdateValidator = [
    body('cameraIds')
        .isArray({ min: 1 })
        .withMessage('Danh sách ID camera phải là mảng và không rỗng'),
    
    body('cameraIds.*')
        .isInt({ min: 1 })
        .withMessage('Mỗi ID camera phải là số nguyên dương'),
    
    body('status')
        .notEmpty()
        .withMessage('Trạng thái là bắt buộc')
        .isIn(['online', 'offline', 'maintenance'])
        .withMessage('Trạng thái camera không hợp lệ'),
    
    handleValidationErrors
];

// Search validator
const searchValidator = [
    query('keyword')
        .optional()
        .isLength({ max: 100 })
        .withMessage('Từ khóa tìm kiếm không được quá 100 ký tự')
        .trim(),
    
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Trang phải là số nguyên dương'),
    
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Giới hạn phải từ 1-100'),
    
    query('sort')
        .optional()
        .isIn(['id', 'name', 'code', 'status', 'created_at', 'updated_at', 'last_heartbeat'])
        .withMessage('Trường sắp xếp không hợp lệ'),
    
    query('order')
        .optional()
        .isIn(['ASC', 'DESC', 'asc', 'desc'])
        .withMessage('Thứ tự sắp xếp phải là ASC hoặc DESC'),
    
    handleValidationErrors
];

// Search criteria validator
const searchCriteriaValidator = [
    body('name')
        .optional()
        .isLength({ max: 100 })
        .withMessage('Tên camera không được quá 100 ký tự')
        .trim(),
    
    body('code')
        .optional()
        .isLength({ max: 20 })
        .withMessage('Mã camera không được quá 20 ký tự')
        .trim(),
    
    body('status')
        .optional()
        .isIn(['online', 'offline', 'maintenance'])
        .withMessage('Trạng thái camera không hợp lệ'),
    
    body('location_id')
        .optional()
        .isInt({ min: 1 })
        .withMessage('ID vị trí phải là số nguyên dương'),
    
    body('')
        .optional()
        .isInt({ min: 1 })
        .withMessage('ID vị trí giám sát phải là số nguyên dương'),
    
    body('camera_type')
        .optional()
        .isIn(['fixed', 'ptz', 'mobile'])
        .withMessage('Loại camera không hợp lệ'),
    
    body('camera_role')
        .optional()
        .isIn(['entry', 'exit', 'internal', 'overview'])
        .withMessage('Vai trò camera không hợp lệ'),
    
    body('direction')
        .optional()
        .isIn(['inbound', 'outbound', 'bidirectional', 'entry_only', 'exit_only'])
        .withMessage('Hướng giám sát không hợp lệ'),
    
    body('installation_date_from')
        .optional()
        .isISO8601()
        .withMessage('Ngày bắt đầu phải có định dạng ISO8601'),
    
    body('installation_date_to')
        .optional()
        .isISO8601()
        .withMessage('Ngày kết thúc phải có định dạng ISO8601'),
    
    body('last_heartbeat_from')
        .optional()
        .isISO8601()
        .withMessage('Thời gian heartbeat bắt đầu phải có định dạng ISO8601'),
    
    body('last_heartbeat_to')
        .optional()
        .isISO8601()
        .withMessage('Thời gian heartbeat kết thúc phải có định dạng ISO8601'),
    
    body('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Trang phải là số nguyên dương'),
    
    body('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Giới hạn phải từ 1-100'),
    
    body('sort')
        .optional()
        .isIn(['id', 'name', 'code', 'status', 'created_at', 'updated_at', 'last_heartbeat', 'installation_date'])
        .withMessage('Trường sắp xếp không hợp lệ'),
    
    body('order')
        .optional()
        .isIn(['ASC', 'DESC', 'asc', 'desc'])
        .withMessage('Thứ tự sắp xếp phải là ASC hoặc DESC'),
    
    handleValidationErrors
];

// Comparison report validator
const comparisonReportValidator = [
    body('camera_ids')
        .isArray({ min: 2, max: 10 })
        .withMessage('Cần từ 2-10 camera để so sánh'),
    
    body('camera_ids.*')
        .isInt({ min: 1 })
        .withMessage('Mỗi ID camera phải là số nguyên dương'),
    
    body('days')
        .optional()
        .isInt({ min: 1, max: 365 })
        .withMessage('Số ngày phải từ 1-365'),
    
    handleValidationErrors
];

// Location parameter validator
const locationParamValidator = [
    param('locationId')
        .isInt({ min: 1 })
        .withMessage('ID vị trí phải là số nguyên dương'),
    
    handleValidationErrors
];

// Status parameter validator
const statusParamValidator = [
    param('status')
        .isIn(['online', 'offline', 'maintenance'])
        .withMessage('Trạng thái camera không hợp lệ'),
    
    handleValidationErrors
];

// Type parameter validator
const typeParamValidator = [
    param('type')
        .isIn(['fixed', 'ptz', 'mobile'])
        .withMessage('Loại camera không hợp lệ'),
    
    handleValidationErrors
];

// Role parameter validator
const roleParamValidator = [
    param('role')
        .isIn(['entry', 'exit', 'internal', 'overview'])
        .withMessage('Vai trò camera không hợp lệ'),
    
    handleValidationErrors
];

// Offline cameras query validator
const offlineCamerasValidator = [
    query('minutes')
        .optional()
        .isInt({ min: 1, max: 1440 })
        .withMessage('Số phút phải từ 1-1440 (24 giờ)'),
    
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Trang phải là số nguyên dương'),
    
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Giới hạn phải từ 1-100'),
    
    handleValidationErrors
];

// Health report query validator
const healthReportValidator = [
    query('days')
        .optional()
        .isInt({ min: 1, max: 90 })
        .withMessage('Số ngày phải từ 1-90'),
    
    handleValidationErrors
];

// Performance report query validator
const performanceReportValidator = [
    query('days')
        .optional()
        .isInt({ min: 1, max: 365 })
        .withMessage('Số ngày phải từ 1-365'),
    
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Trang phải là số nguyên dương'),
    
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Giới hạn phải từ 1-100'),
    
    handleValidationErrors
];

module.exports = {
    createCameraValidator,
    updateCameraValidator,
    deleteCameraValidator,
    updateStatusValidator,
    bulkOperationValidator,
    bulkStatusUpdateValidator,
    searchValidator,
    searchCriteriaValidator,
    comparisonReportValidator,
    locationParamValidator,
    statusParamValidator,
    typeParamValidator,
    roleParamValidator,
    offlineCamerasValidator,
    healthReportValidator,
    performanceReportValidator
};