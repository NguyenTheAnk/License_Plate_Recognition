# Hướng dẫn sử dụng Quản lý Kiểm soát Truy cập

## Tổng quan

Hệ thống quản lý kiểm soát truy cập bao gồm 3 component chính:

1. **WhiteList** - Quản lý danh sách trắng (phương tiện được phép)
2. **BlackList** - Quản lý danh sách đen (phương tiện bị cấm)
3. **AccessControl** - Component tổng hợp quản lý cả hai danh sách

## Công nghệ sử dụng

- **@mui/material** - UI components
- **@mui/icons-material** - Icons
- **react-icons/fa** - Font Awesome icons
- **React Hooks** - State management
- **Axios** - HTTP requests (thông qua utils/auth.js)

## Cấu trúc API

### WhiteList API Endpoints

```
GET    /api/whitelist              - Lấy danh sách với phân trang và filter
GET    /api/whitelist/statistics   - Thống kê whitelist
GET    /api/whitelist/:id          - Chi tiết một entry
POST   /api/whitelist/create       - Tạo mới
PUT    /api/whitelist/:id          - Cập nhật
DELETE /api/whitelist/:id          - Xóa
```

### BlackList API Endpoints

```
GET    /api/blacklist              - Lấy danh sách với phân trang và filter
GET    /api/blacklist/statistics   - Thống kê blacklist
GET    /api/blacklist/:id          - Chi tiết một entry
POST   /api/blacklist/create       - Tạo mới
PUT    /api/blacklist/:id          - Cập nhật
DELETE /api/blacklist/:id          - Xóa
```

## Tính năng chính

### 1. WhiteList Component

#### Chức năng:
- **Xem danh sách** với phân trang
- **Tìm kiếm và lọc** theo nhiều tiêu chí
- **Thêm mới** whitelist entry
- **Chỉnh sửa** thông tin
- **Xóa** entry
- **Xem chi tiết** với thông tin đầy đủ
- **Thống kê** tổng quan

#### Bộ lọc:
- Biển số xe
- Khu vực
- Trạng thái phê duyệt (Đã phê duyệt/Chờ phê duyệt/Từ chối)
- Trạng thái hiệu lực (Có hiệu lực/Hết hạn/Chưa có hiệu lực)
- Hoạt động (Hoạt động/Không hoạt động)

#### Form fields:
- Khu vực (bắt buộc)
- Biển số xe (bắt buộc)
- Tên chủ xe
- Số điện thoại
- Email liên hệ
- Trạng thái phê duyệt
- Thời gian hiệu lực (từ/đến)
- Ghi chú

### 2. BlackList Component

#### Chức năng:
- **Xem danh sách** với phân trang
- **Tìm kiếm và lọc** theo nhiều tiêu chí
- **Thêm mới** blacklist entry
- **Chỉnh sửa** thông tin
- **Xóa** entry
- **Xem chi tiết** với thông tin đầy đủ
- **Thống kê** tổng quan

#### Bộ lọc:
- Biển số xe
- Khu vực
- Loại vi phạm (Không được phép/Đe dọa an ninh/Chưa nộp phạt/Bị cấm/Đáng ngờ/Khác)
- Mức độ (Thấp/Trung bình/Cao/Nghiêm trọng)
- Trạng thái hiệu lực (Đang hoạt động/Hết hạn/Chưa có hiệu lực)

#### Form fields:
- Khu vực (bắt buộc)
- Biển số xe (bắt buộc)
- Loại vi phạm (bắt buộc)
- Mức độ (bắt buộc)
- Tên chủ xe
- Số điện thoại
- Lý do cấm (bắt buộc)
- Thời gian hiệu lực (từ/đến)
- Ghi chú chi tiết

### 3. AccessControl Component

#### Chức năng:
- **Dashboard tổng hợp** với thống kê cả hai danh sách
- **Tab navigation** để chuyển đổi giữa WhiteList và BlackList
- **Thông tin hướng dẫn** sử dụng
- **Thống kê trực quan** với cards và badges

## Cách sử dụng

### 1. Truy cập vào component

```javascript
// Trong App.js đã có routes
<Route path="/whitelist" element={<WhiteList />} />
<Route path="/blacklist" element={<BlackList />} />
<Route path="/access-control" element={<AccessControl />} />
```

### 2. Navigation

Có thể truy cập qua:
- `/whitelist` - Chỉ quản lý WhiteList
- `/blacklist` - Chỉ quản lý BlackList  
- `/access-control` - Quản lý tổng hợp cả hai

### 3. Thêm mới entry

1. Click nút "Thêm mới"
2. Điền thông tin trong form
3. Click "Tạo mới" để lưu

### 4. Chỉnh sửa entry

1. Click icon "Chỉnh sửa" (Edit) trong bảng
2. Thay đổi thông tin trong form
3. Click "Cập nhật" để lưu

### 5. Xóa entry

1. Click icon "Xóa" (Delete) trong bảng
2. Xác nhận trong dialog
3. Entry sẽ bị xóa

### 6. Xem chi tiết

1. Click icon "Xem chi tiết" (Eye) trong bảng
2. Xem thông tin đầy đủ trong modal

## Cấu trúc dữ liệu

### WhiteList Entry
```javascript
{
  id: number,
  location_id: number,
  plate_number: string,
  vehicle_id: number,
  owner_name: string,
  owner_phone: string,
  contact_email: string,
  valid_from: string, // YYYY-MM-DD
  valid_to: string,   // YYYY-MM-DD
  description: string,
  approval_status: 'approved' | 'pending' | 'rejected',
  is_active: boolean,
  created_at: string,
  updated_at: string,
  // Joined data
  location_name: string,
  current_status: 'valid' | 'expired' | 'future' | 'permanent'
}
```

### BlackList Entry
```javascript
{
  id: number,
  location_id: number,
  plate_number: string,
  vehicle_id: number,
  violation_type: 'unauthorized' | 'security_threat' | 'unpaid_fine' | 'banned' | 'suspicious' | 'other',
  reason: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  owner_name: string,
  owner_phone: string,
  valid_from: string, // YYYY-MM-DD
  valid_to: string,   // YYYY-MM-DD
  description: string,
  is_active: boolean,
  created_at: string,
  updated_at: string,
  // Joined data
  location_name: string,
  current_status: 'active' | 'expired' | 'future' | 'permanent'
}
```

## Error Handling

Component sử dụng các hàm từ `utils/auth.js` để xử lý lỗi:

- `handleErrorResponse(error)` - Xử lý và trả về message lỗi
- `isUnauthorizedError(error)` - Kiểm tra lỗi authentication
- Tự động logout nếu token hết hạn

## Responsive Design

- Sử dụng Material-UI Grid system
- Responsive trên mobile, tablet và desktop
- Table có thể scroll ngang trên mobile

## Performance

- Pagination để giới hạn số lượng data load
- Debounced search để tránh gọi API quá nhiều
- Loading states cho tất cả async operations
- Optimized re-renders với React hooks

## Security

- Tất cả API calls đều có authentication token
- Validation trên cả client và server
- Permission-based access control
- Secure error handling (không expose sensitive data)

## Customization

### Thay đổi theme
```javascript
// Có thể customize theme trong theme provider
<ThemeProvider theme={customTheme}>
  <AccessControl />
</ThemeProvider>
```

### Thay đổi API endpoints
```javascript
// Trong utils/auth.js
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
```

### Thêm validation rules
```javascript
// Có thể thêm validation rules trong form
const validationSchema = yup.object({
  plate_number: yup.string().required('Biển số xe là bắt buộc'),
  location_id: yup.number().required('Khu vực là bắt buộc'),
  // ...
});
```

## Troubleshooting

### Lỗi thường gặp:

1. **API không kết nối được**
   - Kiểm tra server có đang chạy không
   - Kiểm tra API_BASE URL trong environment variables

2. **Token hết hạn**
   - Tự động redirect về login page
   - Cần đăng nhập lại

3. **Permission denied**
   - Kiểm tra user có quyền truy cập không
   - Liên hệ admin để cấp quyền

4. **Form validation errors**
   - Kiểm tra các field bắt buộc đã điền chưa
   - Kiểm tra format dữ liệu (email, phone, date)

## Contributing

Khi thêm tính năng mới:

1. Tạo branch mới
2. Implement feature
3. Test thoroughly
4. Update documentation
5. Create pull request

## Support

Nếu có vấn đề, vui lòng:
1. Kiểm tra console logs
2. Kiểm tra network tab trong DevTools
3. Liên hệ development team 