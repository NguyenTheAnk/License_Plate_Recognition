const { body, param, query, validationResult } = require('express-validator');

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Dữ liệu không hợp lệ',
            errors: errors.array().map(error => ({
                field: error.path || error.param,
                message: error.msg,
                value: error.value
            }))
        });
    }
    next();
};

// ========================================
// USER VALIDATORS
// ========================================

// Register validation
const registerValidator = [
    body('name')
        .notEmpty()
        .withMessage('Tên là bắt buộc')
        .isLength({ min: 2, max: 100 })
        .withMessage('Tên phải có từ 2 đến 100 ký tự')
        .matches(/^[a-zA-ZÀ-ỹ\s]+$/)
        .withMessage('Tên chỉ được chứa chữ cái và khoảng trắng'),

    body('username')
        .notEmpty()
        .withMessage('Tên đăng nhập là bắt buộc')
        .isLength({ min: 3, max: 50 })
        .withMessage('Tên đăng nhập phải có từ 3 đến 50 ký tự')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Tên đăng nhập chỉ được chứa chữ cái, số và dấu gạch dưới'),

    body('email')
        .notEmpty()
        .withMessage('Email là bắt buộc')
        .isEmail()
        .withMessage('Định dạng email không hợp lệ')
        .normalizeEmail(),

    body('phone')
        .optional()
        .isMobilePhone('vi-VN')
        .withMessage('Số điện thoại không hợp lệ'),

    body('password')
        .isLength({ min: 8 })
        .withMessage('Mật khẩu phải có ít nhất 8 ký tự')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Mật khẩu phải chứa ít nhất 1 chữ thường, 1 chữ hoa và 1 số'),

    handleValidationErrors
];

// Login validation
const loginValidator = [
    body('email')
        .notEmpty()
        .withMessage('Email là bắt buộc')
        .isEmail()
        .withMessage('Định dạng email không hợp lệ')
        .normalizeEmail(),

    body('password')
        .notEmpty()
        .withMessage('Mật khẩu là bắt buộc'),

    handleValidationErrors
];

// Create user validation
const createUserValidator = [
    body('name')
        .notEmpty()
        .withMessage('Tên là bắt buộc')
        .isLength({ min: 2, max: 100 })
        .withMessage('Tên phải có từ 2 đến 100 ký tự')
        .matches(/^[a-zA-ZÀ-ỹ\s]+$/)
        .withMessage('Tên chỉ được chứa chữ cái và khoảng trắng'),

    body('email')
        .notEmpty()
        .withMessage('Email là bắt buộc')
        .isEmail()
        .withMessage('Định dạng email không hợp lệ')
        .normalizeEmail(),

    body('phone')
        .optional()
        .isMobilePhone('vi-VN')
        .withMessage('Số điện thoại không hợp lệ'),

    body('password')
        .isLength({ min: 8 })
        .withMessage('Mật khẩu phải có ít nhất 8 ký tự')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Mật khẩu phải chứa ít nhất 1 chữ thường, 1 chữ hoa và 1 số'),

    body('status')
        .optional()
        .isIn(['active', 'inactive', 'suspended'])
        .withMessage('Trạng thái không hợp lệ'),

    body('roleIds')
        .optional()
        .isArray()
        .withMessage('Danh sách vai trò phải là mảng')
        .custom((value) => {
            if (value && value.some(id => !Number.isInteger(id) || id <= 0)) {
                throw new Error('ID vai trò phải là số nguyên dương');
            }
            return true;
        }),

    handleValidationErrors
];

// Update user validation
const updateUserValidator = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('ID người dùng phải là số nguyên dương'),

    body('name')
        .optional()
        .isLength({ min: 2, max: 100 })
        .withMessage('Tên phải có từ 2 đến 100 ký tự')
        .matches(/^[a-zA-ZÀ-ỹ\s]+$/)
        .withMessage('Tên chỉ được chứa chữ cái và khoảng trắng'),

    body('username')
        .optional()
        .isLength({ min: 3, max: 50 })
        .withMessage('Tên đăng nhập phải có từ 3 đến 50 ký tự')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Tên đăng nhập chỉ được chứa chữ cái, số và dấu gạch dưới'),

    body('email')
        .optional()
        .isEmail()
        .withMessage('Định dạng email không hợp lệ')
        .normalizeEmail(),

    body('phone')
        .optional()
        .isMobilePhone('vi-VN')
        .withMessage('Số điện thoại không hợp lệ'),

    body('status')
        .optional()
        .isIn(['active', 'inactive', 'suspended'])
        .withMessage('Trạng thái không hợp lệ'),

    body('roleIds')
        .optional()
        .isArray()
        .withMessage('Danh sách vai trò phải là mảng')
        .custom((value) => {
            if (value && value.some(id => !Number.isInteger(id) || id <= 0)) {
                throw new Error('ID vai trò phải là số nguyên dương');
            }
            return true;
        }),

    handleValidationErrors
];

// Delete user validation
const deleteUserValidator = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('ID người dùng phải là số nguyên dương'),

    handleValidationErrors
];

// Change password validation
const changePasswordValidator = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('ID người dùng phải là số nguyên dương'),

    body('currentPassword')
        .notEmpty()
        .withMessage('Mật khẩu hiện tại là bắt buộc'),

    body('newPassword')
        .isLength({ min: 8 })
        .withMessage('Mật khẩu mới phải có ít nhất 8 ký tự')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Mật khẩu mới phải chứa ít nhất 1 chữ thường, 1 chữ hoa và 1 số'),

    body('confirmPassword')
        .custom((value, { req }) => {
            if (value !== req.body.newPassword) {
                throw new Error('Xác nhận mật khẩu không khớp');
            }
            return true;
        }),

    handleValidationErrors
];

// Search validation
const searchValidator = [
    body('query')
        .optional()
        .isLength({ max: 100 })
        .withMessage('Từ khóa tìm kiếm không được quá 100 ký tự'),

    body('criteria')
        .optional()
        .isIn(['username', 'email', 'phone', 'name'])
        .withMessage('Tiêu chí tìm kiếm không hợp lệ'),

    body('value')
        .optional()
        .isLength({ max: 100 })
        .withMessage('Giá trị tìm kiếm không được quá 100 ký tự'),

    body('exact')
        .optional()
        .isBoolean()
        .withMessage('Exact phải là boolean'),

    handleValidationErrors
];

// Assign role validation
const assignRoleValidator = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('ID người dùng phải là số nguyên dương'),

    body('roleId')
        .isInt({ min: 1 })
        .withMessage('ID vai trò phải là số nguyên dương'),

    handleValidationErrors
];

// Remove role validation
const removeRoleValidator = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('ID người dùng phải là số nguyên dương'),

    body('roleId')
        .isInt({ min: 1 })
        .withMessage('ID vai trò phải là số nguyên dương'),

    handleValidationErrors
];

// Bulk assign role validation
const bulkAssignRoleValidator = [
    body('userIds')
        .isArray({ min: 1 })
        .withMessage('Danh sách ID người dùng phải là mảng không rỗng')
        .custom((value) => {
            if (value.some(id => !Number.isInteger(id) || id <= 0)) {
                throw new Error('Tất cả ID người dùng phải là số nguyên dương');
            }
            if (value.length > 100) {
                throw new Error('Không thể thao tác trên quá 100 người dùng cùng lúc');
            }
            return true;
        }),

    body('roleId')
        .isInt({ min: 1 })
        .withMessage('ID vai trò phải là số nguyên dương'),

    handleValidationErrors
];

// Bulk update status validation
const bulkUpdateStatusValidator = [
    body('userIds')
        .isArray({ min: 1 })
        .withMessage('Danh sách ID người dùng phải là mảng không rỗng')
        .custom((value) => {
            if (value.some(id => !Number.isInteger(id) || id <= 0)) {
                throw new Error('Tất cả ID người dùng phải là số nguyên dương');
            }
            if (value.length > 100) {
                throw new Error('Không thể thao tác trên quá 100 người dùng cùng lúc');
            }
            return true;
        }),

    body('status')
        .isIn(['active', 'inactive', 'suspended'])
        .withMessage('Trạng thái không hợp lệ'),

    handleValidationErrors
];

// Refresh token validation
const refreshTokenValidator = [
    body('refreshToken')
        .notEmpty()
        .withMessage('Refresh token là bắt buộc'),

    handleValidationErrors
];

// Reset password validation
const resetPasswordValidator = [
    body('token')
        .notEmpty()
        .withMessage('Token là bắt buộc'),

    body('newPassword')
        .isLength({ min: 8 })
        .withMessage('Mật khẩu mới phải có ít nhất 8 ký tự')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Mật khẩu mới phải chứa ít nhất 1 chữ thường, 1 chữ hoa và 1 số'),

    body('confirmPassword')
        .custom((value, { req }) => {
            if (value !== req.body.newPassword) {
                throw new Error('Xác nhận mật khẩu không khớp');
            }
            return true;
        }),

    handleValidationErrors
];

// Change email validation
const changeEmailValidator = [
    body('newEmail')
        .notEmpty()
        .withMessage('Email mới là bắt buộc')
        .isEmail()
        .withMessage('Định dạng email không hợp lệ')
        .normalizeEmail(),

    body('password')
        .notEmpty()
        .withMessage('Mật khẩu hiện tại là bắt buộc'),

    handleValidationErrors
];

// Forgot password validation
const forgotPasswordValidator = [
    body('email')
        .notEmpty()
        .withMessage('Email là bắt buộc')
        .isEmail()
        .withMessage('Định dạng email không hợp lệ')
        .normalizeEmail(),

    handleValidationErrors
];

// ========================================
// WHITELIST VALIDATORS
// ========================================

const createWhitelistValidator = [
    body('location_id')
        .isInt({ min: 1 })
        .withMessage('location_id phải là số nguyên dương'),
    
    body('plate_number')
        .notEmpty()
        .withMessage('Biển số là bắt buộc'),
    
    body('vehicle_id')
        .optional()
        .isInt({ min: 1 })
        .withMessage('vehicle_id phải là số nguyên dương'),
    
    body('owner_name')
        .optional()
        .trim()
        .isLength({ max: 200 })
        .withMessage('Tên chủ xe không được quá 200 ký tự'),
    
    body('owner_phone')
        .optional()
        .trim()
        .matches(/^[0-9+\-\s\(\)]+$/)
        .withMessage('Số điện thoại không hợp lệ')
        .isLength({ max: 20 })
        .withMessage('Số điện thoại không được quá 20 ký tự'),
    
    body('contact_email')
        .optional()
        .isEmail()
        .withMessage('Email không hợp lệ')
        .normalizeEmail(),
    
    body('valid_from')
        .optional()
        .isISO8601()
        .withMessage('valid_from phải có định dạng ngày hợp lệ (YYYY-MM-DD)'),
    
    body('valid_to')
        .optional()
        .isISO8601()
        .withMessage('valid_to phải có định dạng ngày hợp lệ (YYYY-MM-DD)')
        .custom((value, { req }) => {
            if (req.body.valid_from && value && new Date(req.body.valid_from) > new Date(value)) {
                throw new Error('Ngày kết thúc phải sau ngày bắt đầu');
            }
            return true;
        }),
    
    body('description')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Mô tả không được quá 1000 ký tự'),
    
    body('approval_status')
        .optional()
        .isIn(['pending', 'approved', 'rejected'])
        .withMessage('approval_status phải là: pending, approved, rejected'),

    handleValidationErrors
];

const updateWhitelistValidator = [
    // SỬA: Không yêu cầu bắt buộc cho update, chỉ validate khi có giá trị
    body('location_id')
        .optional()
        .isInt({ min: 1 }).withMessage('ID khu vực phải là số nguyên dương')
        .toInt(),
    
    body('plate_number')
        .optional()
        .isLength({ min: 1, max: 20 }).withMessage('Biển số xe phải có độ dài 1-20 ký tự')
        .matches(/^[A-Z0-9.\-]+$/i).withMessage('Biển số xe chỉ được chứa chữ cái, số, dấu chấm và dấu gạch ngang'),
    
    body('vehicle_id')
        .optional()
        .custom(value => {
            // Cho phép null, undefined, hoặc số nguyên dương
            if (value === null || value === undefined || value === '') return true;
            if (!Number.isInteger(Number(value)) || Number(value) < 1) {
                throw new Error('ID phương tiện phải là số nguyên dương');
            }
            return true;
        })
        .toInt(),
    
    body('owner_name')
        .optional()
        .isLength({ max: 255 }).withMessage('Tên chủ xe không được vượt quá 255 ký tự'),
    
    body('owner_phone')
        .optional()
        .custom(value => {
            // Chỉ validate khi có giá trị
            if (!value || value.trim() === '') return true;
            const phoneRegex = /^(\+84|84|0)(3|5|7|8|9)[0-9]{8}$/;
            if (!phoneRegex.test(value.replace(/\s+/g, ''))) {
                throw new Error('Định dạng số điện thoại không hợp lệ');
            }
            return true;
        }),
    
    body('contact_email')
        .optional()
        .custom(value => {
            // Chỉ validate khi có giá trị
            if (!value || value.trim() === '') return true;
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) {
                throw new Error('Định dạng email không hợp lệ');
            }
            return true;
        }),
    
    body('valid_from')
        .optional()
        .custom(value => {
            // Chỉ validate khi có giá trị
            if (!value || value.trim() === '') return true;
            const date = new Date(value);
            if (isNaN(date.getTime())) {
                throw new Error('Ngày bắt đầu không hợp lệ');
            }
            return true;
        }),
    
    body('valid_to')
        .optional()
        .custom(value => {
            // Chỉ validate khi có giá trị
            if (!value || value.trim() === '') return true;
            const date = new Date(value);
            if (isNaN(date.getTime())) {
                throw new Error('Ngày kết thúc không hợp lệ');
            }
            return true;
        }),
    
    body('description')
        .optional()
        .isLength({ max: 1000 }).withMessage('Mô tả không được vượt quá 1000 ký tự'),
    
    body('approval_status')
        .optional()
        .isIn(['pending', 'approved', 'rejected']).withMessage('Trạng thái phê duyệt không hợp lệ'),
    
    body('is_active')
        .optional()
        .isBoolean().withMessage('Trạng thái hoạt động phải là boolean')
        .toBoolean(),
    
    // OCR fields - optional
    body('ocr_raw_text').optional(),
    body('ocr_confidence')
        .optional()
        .isFloat({ min: 0, max: 1 }).withMessage('Độ tin cậy OCR phải trong khoảng 0-1'),
    body('verification_status')
        .optional()
        .isIn(['pending', 'ocr_matched', 'manually_verified', 'rejected']).withMessage('Trạng thái xác minh không hợp lệ'),
    body('verified_plate_number').optional(),
    
    // Image replacement option
    body('replace_images')
        .optional()
        .isIn(['true', 'false']).withMessage('Tùy chọn thay thế ảnh không hợp lệ'),
    
    // Custom validation for date range
    body('valid_to').custom((value, { req }) => {
        if (value && req.body.valid_from) {
            const fromDate = new Date(req.body.valid_from);
            const toDate = new Date(value);
            if (fromDate >= toDate) {
                throw new Error('Ngày kết thúc phải sau ngày bắt đầu');
            }
        }
        return true;
    }),
    
    // Validation result handler
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('Validation errors:', errors.array());
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
    }
];

// ========================================
// BLACKLIST VALIDATORS
// ========================================

const createBlacklistValidator = [
    body('location_id')
        .isInt({ min: 1 })
        .withMessage('location_id phải là số nguyên dương'),
    
    body('plate_number')
        .trim()
        .isLength({ min: 6, max: 20 })
        .withMessage('Biển số phải có độ dài từ 6-20 ký tự')
        .matches(/^[A-Z0-9\-\.]+$/)
        .withMessage('Biển số chỉ được chứa chữ hoa, số, dấu gạch ngang và dấu chấm'),
    
    body('vehicle_id')
        .optional()
        .isInt({ min: 1 })
        .withMessage('vehicle_id phải là số nguyên dương'),
    
    body('violation_type')
        .optional()
        .isIn(['unauthorized', 'security_threat', 'unpaid_fine', 'banned', 'suspicious', 'other'])
        .withMessage('violation_type phải là: unauthorized, security_threat, unpaid_fine, banned, suspicious, other'),
    
    body('reason')
        .trim()
        .isLength({ min: 10, max: 500 })
        .withMessage('Lý do phải có độ dài từ 10-500 ký tự'),
    
    body('severity')
        .optional()
        .isIn(['low', 'medium', 'high', 'critical'])
        .withMessage('severity phải là: low, medium, high, critical'),
    
    body('owner_name')
        .optional()
        .trim()
        .isLength({ max: 200 })
        .withMessage('Tên chủ xe không được quá 200 ký tự'),
    
    body('owner_phone')
        .optional()
        .trim()
        .matches(/^[0-9+\-\s\(\)]+$/)
        .withMessage('Số điện thoại không hợp lệ')
        .isLength({ max: 20 })
        .withMessage('Số điện thoại không được quá 20 ký tự'),
    
    body('valid_from')
        .optional()
        .isISO8601()
        .withMessage('valid_from phải có định dạng ngày hợp lệ (YYYY-MM-DD)'),
    
    body('valid_to')
        .optional()
        .isISO8601()
        .withMessage('valid_to phải có định dạng ngày hợp lệ (YYYY-MM-DD)')
        .custom((value, { req }) => {
            if (req.body.valid_from && value && new Date(req.body.valid_from) > new Date(value)) {
                throw new Error('Ngày kết thúc phải sau ngày bắt đầu');
            }
            return true;
        }),
    
    body('description')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Mô tả không được quá 1000 ký tự'),
    
    body('evidence_files')
        .optional()
        .custom((value) => {
            if (value && typeof value === 'string') {
                try {
                    const parsed = JSON.parse(value);
                    if (!Array.isArray(parsed)) {
                        throw new Error('evidence_files phải là mảng JSON');
                    }
                } catch (error) {
                    throw new Error('evidence_files phải có định dạng JSON hợp lệ');
                }
            } else if (value && !Array.isArray(value)) {
                throw new Error('evidence_files phải là mảng');
            }
            return true;
        }),

    handleValidationErrors
];

const updateBlacklistValidator = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('ID không hợp lệ'),
    
    body('location_id')
        .optional()
        .isInt({ min: 1 })
        .withMessage('location_id phải là số nguyên dương'),
    
    body('plate_number')
        .optional()
        .trim()
        .isLength({ min: 6, max: 20 })
        .withMessage('Biển số phải có độ dài từ 6-20 ký tự')
        .matches(/^[A-Z0-9\-\.]+$/)
        .withMessage('Biển số chỉ được chứa chữ hoa, số, dấu gạch ngang và dấu chấm'),
    
    body('vehicle_id')
        .optional()
        .isInt({ min: 1 })
        .withMessage('vehicle_id phải là số nguyên dương'),
    
    body('violation_type')
        .optional()
        .isIn(['unauthorized', 'security_threat', 'unpaid_fine', 'banned', 'suspicious', 'other'])
        .withMessage('violation_type phải là: unauthorized, security_threat, unpaid_fine, banned, suspicious, other'),
    
    body('reason')
        .optional()
        .trim()
        .isLength({ min: 10, max: 500 })
        .withMessage('Lý do phải có độ dài từ 10-500 ký tự'),
    
    body('severity')
        .optional()
        .isIn(['low', 'medium', 'high', 'critical'])
        .withMessage('severity phải là: low, medium, high, critical'),
    
    body('owner_name')
        .optional()
        .trim()
        .isLength({ max: 200 })
        .withMessage('Tên chủ xe không được quá 200 ký tự'),
    
    body('owner_phone')
        .optional()
        .trim()
        .matches(/^[0-9+\-\s\(\)]+$/)
        .withMessage('Số điện thoại không hợp lệ')
        .isLength({ max: 20 })
        .withMessage('Số điện thoại không được quá 20 ký tự'),
    
    body('valid_from')
        .optional()
        .isISO8601()
        .withMessage('valid_from phải có định dạng ngày hợp lệ (YYYY-MM-DD)'),
    
    body('valid_to')
        .optional()
        .isISO8601()
        .withMessage('valid_to phải có định dạng ngày hợp lệ (YYYY-MM-DD)'),
    
    body('description')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Mô tả không được quá 1000 ký tự'),
    
    body('evidence_files')
        .optional()
        .custom((value) => {
            if (value === null) return true; // Allow null to clear evidence files
            
            if (value && typeof value === 'string') {
                try {
                    const parsed = JSON.parse(value);
                    if (!Array.isArray(parsed)) {
                        throw new Error('evidence_files phải là mảng JSON');
                    }
                } catch (error) {
                    throw new Error('evidence_files phải có định dạng JSON hợp lệ');
                }
            } else if (value && !Array.isArray(value)) {
                throw new Error('evidence_files phải là mảng');
            }
            return true;
        }),
    
    body('is_active')
        .optional()
        .isBoolean()
        .withMessage('is_active phải là boolean'),

    handleValidationErrors
];

// ========================================
// BULK OPERATION VALIDATORS
// ========================================

const bulkWhitelistValidator = [
    body('entries')
        .isArray({ min: 1 })
        .withMessage('entries phải là mảng có ít nhất 1 phần tử'),
    
    body('entries.*.location_id')
        .isInt({ min: 1 })
        .withMessage('location_id phải là số nguyên dương'),
    
    body('entries.*.plate_number')
        .trim()
        .isLength({ min: 6, max: 20 })
        .withMessage('Biển số phải có độ dài từ 6-20 ký tự')
        .matches(/^[A-Z0-9\-\.]+$/)
        .withMessage('Biển số chỉ được chứa chữ hoa, số, dấu gạch ngang và dấu chấm'),
    
    body('entries.*.vehicle_id')
        .optional()
        .isInt({ min: 1 })
        .withMessage('vehicle_id phải là số nguyên dương'),
    
    body('entries.*.owner_name')
        .optional()
        .trim()
        .isLength({ max: 200 })
        .withMessage('Tên chủ xe không được quá 200 ký tự'),

    handleValidationErrors
];

const bulkBlacklistValidator = [
    body('entries')
        .isArray({ min: 1 })
        .withMessage('entries phải là mảng có ít nhất 1 phần tử'),
    
    body('entries.*.location_id')
        .isInt({ min: 1 })
        .withMessage('location_id phải là số nguyên dương'),
    
    body('entries.*.plate_number')
        .trim()
        .isLength({ min: 6, max: 20 })
        .withMessage('Biển số phải có độ dài từ 6-20 ký tự')
        .matches(/^[A-Z0-9\-\.]+$/)
        .withMessage('Biển số chỉ được chứa chữ hoa, số, dấu gạch ngang và dấu chấm'),
    
    body('entries.*.reason')
        .trim()
        .isLength({ min: 10, max: 500 })
        .withMessage('Lý do phải có độ dài từ 10-500 ký tự'),
    
    body('entries.*.violation_type')
        .optional()
        .isIn(['unauthorized', 'security_threat', 'unpaid_fine', 'banned', 'suspicious', 'other'])
        .withMessage('violation_type phải là: unauthorized, security_threat, unpaid_fine, banned, suspicious, other'),
    
    body('entries.*.severity')
        .optional()
        .isIn(['low', 'medium', 'high', 'critical'])
        .withMessage('severity phải là: low, medium, high, critical'),

    handleValidationErrors
];

// ========================================
// COMMON VALIDATORS
// ========================================

const bulkOperationValidator = [
    body('ids')
        .isArray({ min: 1 })
        .withMessage('ids phải là mảng có ít nhất 1 phần tử'),
    
    body('ids.*')
        .isInt({ min: 1 })
        .withMessage('Tất cả ID phải là số nguyên dương'),

    handleValidationErrors
];

const plateNumberValidator = [
    param('plate_number')
        .trim()
        .isLength({ min: 6, max: 20 })
        .withMessage('Biển số phải có độ dài từ 6-20 ký tự')
        .matches(/^[A-Z0-9\-\.]+$/)
        .withMessage('Biển số chỉ được chứa chữ hoa, số, dấu gạch ngang và dấu chấm'),

    handleValidationErrors
];

const locationIdValidator = [
    param('location_id')
        .isInt({ min: 1 })
        .withMessage('location_id phải là số nguyên dương'),

    handleValidationErrors
];

const paginationValidator = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('page phải là số nguyên dương'),
    
    query('limit')
        .optional()
        .isInt({ min: 1, max: 1000 })
        .withMessage('limit phải là số nguyên từ 1-1000'),
    
    query('sort_by')
        .optional()
        .isIn(['created_at', 'plate_number', 'location_name', 'approval_status', 'violation_type', 'severity', 'valid_from', 'valid_to', 'name', 'username', 'email', 'status', 'last_login', 'updated_at'])
        .withMessage('sort_by không hợp lệ'),
    
    query('sort_order')
        .optional()
        .isIn(['ASC', 'DESC', 'asc', 'desc'])
        .withMessage('sort_order phải là ASC hoặc DESC'),

    handleValidationErrors
];

// ========================================
// CUSTOM VALIDATION FUNCTIONS
// ========================================

const isVietnamesePhone = (value) => {
    const phoneRegex = /^(\+84|84|0)(3[2-9]|5[689]|7[06-9]|8[1-689]|9[0-46-9])[0-9]{7}$/;
    return phoneRegex.test(value);
};

const isStrongPassword = (value) => {
    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return strongPasswordRegex.test(value);
};

// ========================================
// EXPORTS
// ========================================

module.exports = {
    handleValidationErrors,
    
    // User validators
    registerValidator,
    loginValidator,
    createUserValidator,
    updateUserValidator,
    deleteUserValidator,
    changePasswordValidator,
    searchValidator,
    assignRoleValidator,
    removeRoleValidator,
    bulkAssignRoleValidator,
    bulkUpdateStatusValidator,
    refreshTokenValidator,
    resetPasswordValidator,
    changeEmailValidator,
    forgotPasswordValidator,
    
    // Whitelist validators
    createWhitelistValidator,
    updateWhitelistValidator,
    
    // Blacklist validators
    createBlacklistValidator,
    updateBlacklistValidator,
    
    // Bulk operation validators
    bulkWhitelistValidator,
    bulkBlacklistValidator,
    bulkOperationValidator,
    
    // Common validators
    plateNumberValidator,
    locationIdValidator,
    paginationValidator,
    
    // Custom validation functions
    isVietnamesePhone,
    isStrongPassword
};