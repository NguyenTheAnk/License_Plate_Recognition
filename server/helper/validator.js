const { body, param, validationResult } = require('express-validator');

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

// Bulk operations validation
const bulkOperationValidator = [
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

// Pagination validation
const paginationValidator = [
    body('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Trang phải là số nguyên dương'),

    body('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Giới hạn phải là số nguyên từ 1 đến 100'),

    body('sort')
        .optional()
        .isIn(['name', 'username', 'email', 'status', 'created_at', 'last_login', 'updated_at'])
        .withMessage('Trường sắp xếp không hợp lệ'),

    body('order')
        .optional()
        .isIn(['asc', 'desc'])
        .withMessage('Thứ tự sắp xếp phải là asc hoặc desc'),

    handleValidationErrors
];

// Custom validation for Vietnamese phone numbers
const isVietnamesePhone = (value) => {
    const phoneRegex = /^(\+84|84|0)(3[2-9]|5[689]|7[06-9]|8[1-689]|9[0-46-9])[0-9]{7}$/;
    return phoneRegex.test(value);
};

// Custom validation for strong password
const isStrongPassword = (value) => {
    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return strongPasswordRegex.test(value);
};

module.exports = {
    registerValidator,
    loginValidator,
    createUserValidator,
    updateUserValidator,
    deleteUserValidator,
    changePasswordValidator,
    searchValidator,
    assignRoleValidator,
    removeRoleValidator,
    bulkOperationValidator,
    bulkAssignRoleValidator,
    bulkUpdateStatusValidator,
    refreshTokenValidator,
    resetPasswordValidator,
    changeEmailValidator,
    forgotPasswordValidator,
    paginationValidator,
    handleValidationErrors,
    isVietnamesePhone,
    isStrongPassword
};