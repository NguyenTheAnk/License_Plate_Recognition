import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, Typography, Grid, FormControl, InputLabel, Select, MenuItem, Chip, Alert, CircularProgress, Card, CardContent, Tooltip, Tabs, Tab, Checkbox, Breadcrumbs, Avatar, FormHelperText, InputAdornment, Snackbar, Pagination, Divider
} from '@mui/material';
import {
  Add as AddIcon, CheckCircle as CheckIcon, CalendarToday as CalendarIcon, LocationOn as LocationIcon, Person as PersonIcon, Phone as PhoneIcon, DirectionsCar as CarIcon, CheckCircleOutline as CheckCircleOutlineIcon, Home as HomeIcon, ExpandMore as ExpandMoreIcon, Description as DescriptionIcon, Schedule as ScheduleIcon, Image as ImageIcon, Warning as WarningIcon, Block as BlockIcon, Visibility as VisibilityIcon, Edit as EditIcon, Delete as DeleteIcon
} from '@mui/icons-material';
import { FaUpload, FaEye, FaEdit, FaTrash, FaPlus, FaTimes, FaExclamationTriangle, FaShieldAlt, FaClock, FaSave } from 'react-icons/fa';
import { BiRefresh, BiSolidTrashAlt } from 'react-icons/bi';
import { fetchDataFromAPI, postData, editData, deleteData, handleErrorResponse, isUnauthorizedError } from '../utils/auth';

// Styled Breadcrumb component
const StyledBreadcrumb = ({ component, href, label, icon, onClick, ...props }) => (
  <Chip
    component={component || 'div'}
    href={href}
    label={label}
    icon={icon}
    onClick={onClick}
    sx={{
      backgroundColor: 'grey.100',
      height: 24,
      color: 'text.primary',
      fontWeight: 'fontWeightRegular',
      '&:hover, &:focus': { backgroundColor: 'grey.200' },
      '&:active': { boxShadow: 1, backgroundColor: 'grey.300' },
      cursor: 'pointer'
    }}
    {...props}
  />
);

const BlackList = () => {
  // States
  const [blacklist, setBlacklist] = useState([]);
  const [loading, setLoading] = useState(false);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [openModal, setOpenModal] = useState(false);
  const [openDetailModal, setOpenDetailModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [locations, setLocations] = useState([]);
  const [statistics, setStatistics] = useState({});
  const [activeTab, setActiveTab] = useState(0);
  const [selectedItems, setSelectedItems] = useState([]);
  const [showDateInput, setShowDateInput] = useState({ valid_from: false, valid_to: false });
  const validFromDateRef = useRef(null);
  const validToDateRef = useRef(null);
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  // Filters
  const [filters, setFilters] = useState({
    location_id: '', plate_number: '', violation_type: '', severity: '', is_active: '', valid_status: ''
  });
  // Form data
  const [formData, setFormData] = useState({
    location_id: '', plate_number: '', vehicle_id: '', violation_type: 'unauthorized', reason: '', severity: 'medium', owner_name: '', owner_phone: '', valid_from: '', valid_to: '', description: ''
  });
  // Error handling
  const [formErrors, setFormErrors] = useState({});
  const [deleteDialog, setDeleteDialog] = useState({ open: false, itemId: null, plateName: '' });
  // Snackbar
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const showSnackbar = (message, severity = 'info') => setSnackbar({ open: true, message, severity });

  // Thêm state cho upload ảnh và OCR
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [ocrResult, setOcrResult] = useState('');
  const [detectedPlateImage, setDetectedPlateImage] = useState(null);

  // Thêm state cho ảnh gốc và ảnh biển số đã detect khi xem chi tiết/chỉnh sửa
  const [detailImage, setDetailImage] = useState(null);
  const [detailDetectedPlateImage, setDetailDetectedPlateImage] = useState(null);

  // Get token from localStorage
  const getToken = () => localStorage.getItem('token');

  // Auto close alerts
  useEffect(() => {
    if (snackbar.open) {
      const timer = setTimeout(() => setSnackbar({ ...snackbar, open: false }), 5000);
      return () => clearTimeout(timer);
    }
  }, [snackbar]);

  // Load data
  useEffect(() => {
    loadBlacklist();
    loadLocations();
    loadStatistics();
  }, [currentPage, itemsPerPage, filters]);

  // Validate form
 // SỬA trong BlackList.js, hàm validateForm:
const validateForm = () => {
  const errors = {};
  if (!formData.location_id) errors.location_id = 'Vui lòng chọn khu vực';
  
  // SỬA: Kiểm tra plate_number từ OCR
  if (!formData.plate_number && !ocrResult) {
      errors.plate_number = 'Vui lòng upload ảnh biển số để nhận diện tự động';
  }
  
  if (!formData.reason) errors.reason = 'Vui lòng nhập lý do cấm';
  if (!formData.severity) errors.severity = 'Vui lòng chọn mức độ';
  
  // SỬA: Kiểm tra ảnh khi tạo mới
  if (!selectedItem && !imageFile) {
      errors.image = 'Vui lòng upload ảnh biển số xe';
  }
  
  // Validation khác...
  setFormErrors(errors);
  return Object.keys(errors).length === 0;
};

  // CRUD & Data
  const loadBlacklist = async (forceRefresh = false) => {
    setLoading(true);
    try {
      const token = getToken();
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('limit', itemsPerPage.toString());
      if (forceRefresh) params.append('_t', Date.now().toString());
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== '' && value !== null && value !== undefined) params.append(key, value);
      });
      const response = await fetchDataFromAPI(`/api/blacklist?${params.toString()}`, token);
      if (response.success) {
        setBlacklist(response.data || []);
        if (response.pagination) {
          setTotalPages(response.pagination.total_pages || 1);
          setTotalItems(response.pagination.total || 0);
        }
      } else {
        showSnackbar(response.message || 'Lỗi khi tải danh sách blacklist', 'error');
      }
    } catch (error) {
      showSnackbar(handleErrorResponse(error), 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadLocations = async () => {
    setLocationsLoading(true);
    try {
      const token = getToken();
      const response = await fetchDataFromAPI('/api/location?limit=1000&is_active=1', token);
      if (response.success) {
        setLocations(response.data.locations || []);
      } else {
        showSnackbar('Không thể tải danh sách khu vực: ' + response.message, 'error');
      }
    } catch (error) {
      showSnackbar('Không thể tải danh sách khu vực: ' + handleErrorResponse(error), 'error');
    } finally {
      setLocationsLoading(false);
    }
  };

  const loadStatistics = async () => {
    try {
      const token = getToken();
      const response = await fetchDataFromAPI('/api/blacklist/statistics', token);
      if (response.success) {
        setStatistics(response.data?.general_statistics || {});
      }
    } catch (error) {
      // ignore
    }
  };

  // Hàm xử lý upload ảnh và OCR
  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        showSnackbar('Vui lòng chọn file ảnh', 'error');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        showSnackbar('Kích thước file không được vượt quá 10MB', 'error');
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target.result);
      reader.readAsDataURL(file);
      try {
        const token = getToken();
        const formDataToSend = new FormData();
        formDataToSend.append('image', file);
        const data = await postData('/api/blacklist/ocr-preview', formDataToSend, token, true);
        if (data.success && data.ocr_text) {
          setFormData(prev => ({ ...prev, plate_number: data.ocr_text }));
          setOcrResult(data.ocr_text);
          showSnackbar(`Nhận diện thành công biển số: ${data.ocr_text}`, 'success');
          if (data.detected_plate_image) setDetectedPlateImage(data.detected_plate_image);
          else setDetectedPlateImage(null);
        } else {
          setOcrResult('');
          setDetectedPlateImage(null);
          showSnackbar('Nhận diện ký tự thất bại: ' + (data.message || ''), 'error');
        }
      } catch (err) {
        setOcrResult('');
        setDetectedPlateImage(null);
        showSnackbar('Lỗi nhận diện ký tự: ' + (err.message || ''), 'error');
      }
    } else {
      setImageFile(null);
      setImagePreview(null);
      setOcrResult('');
      setDetectedPlateImage(null);
    }
  };

// SỬA hàm handleSubmit trong BlackList.js:
const handleSubmit = async (e) => {
  e.preventDefault();
  if (!validateForm()) {
      showSnackbar('Vui lòng kiểm tra lại thông tin nhập vào', 'error');
      return;
  }
  setLoading(true);
  try {
      const token = getToken();
      let response;
      
      if (selectedItem) {
          // Update existing item
          if (imageFile) {
              // Có ảnh mới - dùng FormData
              const formDataToSend = new FormData();
              
              // Append tất cả fields
              Object.entries(formData).forEach(([key, value]) => {
                  if (value !== null && value !== undefined) {
                      formDataToSend.append(key, value.toString());
                  }
              });
              
              // SỬA: Sử dụng 'image' thay vì 'plate_image'
              formDataToSend.append('image', imageFile);
              formDataToSend.append('replace_images', 'true');
              
              response = await editData(`/api/blacklist/${selectedItem.id}`, formDataToSend, token);
          } else {
              // Không có ảnh mới - dùng JSON
              response = await editData(`/api/blacklist/${selectedItem.id}`, formData, token);
          }
          
          if (response.success) {
              showSnackbar(`Cập nhật blacklist ${formData.plate_number} thành công!`, 'success');
          }
      } else {
          // Create new item
          if (imageFile) {
              const formDataToSend = new FormData();
              Object.entries(formData).forEach(([key, value]) => {
                  if (value !== null && value !== undefined && value !== '') {
                      formDataToSend.append(key, value);
                  }
              });
              // SỬA: Sử dụng 'image' thay vì 'plate_image'
              formDataToSend.append('image', imageFile);
              response = await postData('/api/blacklist/create', formDataToSend, token, true); // SỬA: Thêm flag multipart
          } else {
              response = await postData('/api/blacklist/create', formData, token);
          }
          
          if (response.success) {
              showSnackbar(`Đã thêm blacklist ${formData.plate_number} thành công!`, 'success');
          }
      }
       
      if (response.success) {
          setOpenModal(false);
          resetForm();
          setImageFile(null);
          setImagePreview(null);
          setOcrResult('');
          setDetectedPlateImage(null);
          await loadBlacklist(true);
      } else {
          showSnackbar(response.message || 'Có lỗi xảy ra', 'error');
      }
  } catch (error) {
      console.error('Error submitting form:', error);
      const errorMessage = handleErrorResponse(error);
      showSnackbar(errorMessage, 'error');
  } finally {
      setLoading(false);
  }
};

  const handleDelete = async (id) => {
    try {
      const token = getToken();
      const response = await deleteData(`/api/blacklist/${id}`, token);
      if (response.success) {
        showSnackbar('Xóa blacklist thành công!', 'success');
        setSelectedItems(prev => prev.filter(itemId => itemId !== id));
        await loadBlacklist(true);
      } else {
        showSnackbar(response.message || 'Lỗi khi xóa blacklist!', 'error');
      }
    } catch (error) {
      showSnackbar(handleErrorResponse(error), 'error');
    } finally {
      setDeleteDialog({ open: false, itemId: null, plateName: '' });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedItems.length === 0) {
      showSnackbar('Vui lòng chọn ít nhất một mục để xóa!', 'warning');
      return;
    }
    if (window.confirm(`Bạn có chắc chắn muốn xóa ${selectedItems.length} mục đã chọn?`)) {
      try {
        const token = getToken();
        const response = await postData('/api/blacklist/bulk/delete', { ids: selectedItems }, token);
        if (response.success) {
          showSnackbar(`Xóa thành công ${selectedItems.length} mục!`, 'success');
          setSelectedItems([]);
          await loadBlacklist(true);
        } else {
          showSnackbar(response.message || 'Lỗi khi xóa nhiều mục!', 'error');
        }
      } catch (error) {
        showSnackbar(handleErrorResponse(error), 'error');
      }
    }
  };

  const handleEdit = (item) => {
    setSelectedItem(item);
    setFormData({
      location_id: item.location_id || '',
      plate_number: item.plate_number || '',
      vehicle_id: item.vehicle_id || '',
      violation_type: item.violation_type || 'unauthorized',
      reason: item.reason || '',
      severity: item.severity || 'medium',
      owner_name: item.owner_name || '',
      owner_phone: item.owner_phone || '',
      valid_from: item.valid_from || '',
      valid_to: item.valid_to || '',
      description: item.description || ''
    });
    setImageFile(null);
    setImagePreview(item.plate_image_path ? `${item.plate_image_path}` : null);
    setOcrResult(item.plate_number || '');
    setDetectedPlateImage(item.detected_plate_image || null);
    setFormErrors({});
    setOpenModal(true);
  };

  const handleView = async (id) => {
    try {
      const token = getToken();
      const response = await fetchDataFromAPI(`/api/blacklist/${id}`, token);
      if (response.success) {
        setSelectedItem(response.data);
        setDetailImage(response.data.plate_image_path || (response.data.evidence_files && JSON.parse(response.data.evidence_files)[0]?.path) || null);
        setDetailDetectedPlateImage(response.data.detected_plate_image || (response.data.evidence_files && JSON.parse(response.data.evidence_files)[0]?.detected_plate_image) || null);
        setOpenDetailModal(true);
      } else {
        showSnackbar(response.message || 'Lỗi khi tải chi tiết blacklist', 'error');
      }
    } catch (error) {
      showSnackbar(handleErrorResponse(error), 'error');
    }
  };

  const resetForm = () => {
    setFormData({
      location_id: '', plate_number: '', vehicle_id: '', violation_type: 'unauthorized', reason: '', severity: 'medium', owner_name: '', owner_phone: '', valid_from: '', valid_to: '', description: ''
    });
    setSelectedItem(null);
    setFormErrors({});
  };

  const handleRefresh = () => {
    setFilters({ location_id: '', plate_number: '', violation_type: '', severity: '', is_active: '', valid_status: '' });
    setCurrentPage(1);
    setSelectedItems([]);
    loadBlacklist();
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const handleSelectItem = (itemId) => {
    setSelectedItems(prev => prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]);
  };

  const handleSelectAll = () => {
    if (selectedItems.length === blacklist.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(blacklist.map(item => item.id));
    }
  };

  const getStatusChip = (status) => {
    const statusConfig = {
      'active': { color: 'error', label: 'Đang chặn' },
      'inactive': { color: 'default', label: 'Không hoạt động' },
      'expired': { color: 'warning', label: 'Hết hạn' }
    };
    const config = statusConfig[status] || { color: 'default', label: status };
    return <Chip label={config.label} color={config.color} size="small" sx={{ fontWeight: 600, fontSize: '0.75rem' }} />;
  };

  const getViolationTypeChip = (type) => {
    const typeConfig = {
      'unauthorized': { color: 'warning', label: 'Không được phép' },
      'security_threat': { color: 'error', label: 'Đe dọa an ninh' },
      'unpaid_fine': { color: 'info', label: 'Chưa nộp phạt' },
      'banned': { color: 'default', label: 'Bị cấm' },
      'suspicious': { color: 'warning', label: 'Đáng ngờ' },
      'other': { color: 'default', label: 'Khác' }
    };
    const config = typeConfig[type] || { color: 'default', label: type };
    return <Chip label={config.label} color={config.color} size="small" sx={{ fontWeight: 600, fontSize: '0.75rem' }} />;
  };

  const getSeverityChip = (severity) => {
    const severityConfig = {
      'low': { color: 'success', label: 'Thấp' },
      'medium': { color: 'warning', label: 'Trung bình' },
      'high': { color: 'error', label: 'Cao' },
      'critical': { color: 'default', label: 'Nghiêm trọng' }
    };
    const config = severityConfig[severity] || { color: 'default', label: severity };
    return <Chip label={config.label} color={config.color} size="small" sx={{ fontWeight: 600, fontSize: '0.75rem' }} />;
  };

  const handlePageChange = (event, page) => {
    setCurrentPage(page);
  };

  // Pagination helper
  function getPaginationItems(current, total) {
    const delta = 1;
    const range = [];
    const rangeWithDots = [];
    let l;

    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
        range.push(i);
      }
    }

    for (let i of range) {
      if (l) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1);
        } else if (i - l > 2) {
          rangeWithDots.push('...');
        }
      }
      rangeWithDots.push(i);
      l = i;
    }
    return rangeWithDots;
  }

  return (
    <Box sx={{ 
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      py: 3
    }}>
      {/* Modern Header */}
      <Box sx={{ px: 3, mb: 3 }}>
        <Card sx={{ 
          background: 'white',
          borderRadius: 3,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          border: '1px solid #e0e0e0'
        }}>
          <Box sx={{ p: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
              <Box>
                <Typography variant="h4" component="h1" sx={{ 
                  fontWeight: 700,
                  color: '#d32f2f',
                  mb: 1
                }}>
                  <BlockIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                  Quản lý Danh sách Đen
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>
                  Quản lý các phương tiện bị cấm ra vào
                </Typography>
              </Box>
              
              <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
                <Breadcrumbs sx={{ 
                  '& .MuiBreadcrumbs-ol': { 
                    flexWrap: 'nowrap',
                    overflow: 'hidden'
                  }
                }}>
                  <StyledBreadcrumb
                    label="Trang chủ"
                    icon={<HomeIcon fontSize="small" />}
                    onClick={() => window.location.href = '/'}
                  />
                  <StyledBreadcrumb
                    label="Danh sách đen"
                    icon={<ExpandMoreIcon fontSize="small" />}
                  />
                </Breadcrumbs>
                
                <Button
                  variant="contained"
                  startIcon={<FaPlus />}
                  onClick={() => {
                    resetForm();
                    setOpenModal(true);
                  }}
                  sx={{ 
                    backgroundColor: '#d32f2f',
                    borderRadius: 2,
                    px: 3,
                    py: 1.5,
                    textTransform: 'none',
                    fontWeight: 600,
                    boxShadow: '0 2px 8px rgba(211, 47, 47, 0.3)',
                    '&:hover': {
                      backgroundColor: '#b71c1c',
                      boxShadow: '0 4px 12px rgba(211, 47, 47, 0.4)',
                      transform: 'translateY(-1px)'
                    },
                    transition: 'all 0.2s ease'
                  }}
                >
                  Thêm mới
                </Button>
              </Box>
            </Box>
          </Box>
        </Card>
      </Box>

      {/* Enhanced Alerts */}
      {snackbar.open && (
        <Snackbar
          open={snackbar.open}
          autoHideDuration={5000}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
        >
          <Alert 
            onClose={() => setSnackbar({ ...snackbar, open: false })}
            severity={snackbar.severity} 
            sx={{ 
              borderRadius: 3,
              boxShadow: '0 2px 8px rgba(244, 67, 54, 0.2)',
              '& .MuiAlert-icon': { fontSize: '1.5rem' },
              '& .MuiAlert-message': { fontWeight: 500 }
            }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      )}

      {/* Enhanced Tabs */}
      <Box sx={{ px: 3, mb: 3 }}>
        <Card sx={{ 
          background: 'white',
          borderRadius: 3,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          border: '1px solid #e0e0e0',
          overflow: 'hidden'
        }}>
          <Tabs 
            value={activeTab} 
            onChange={(e, newValue) => setActiveTab(newValue)}
            sx={{
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '1rem',
                py: 2,
                px: 3
              },
              '& .Mui-selected': {
                color: '#d32f2f',
                backgroundColor: 'rgba(211, 47, 47, 0.04)'
              },
              '& .MuiTabs-indicator': {
                backgroundColor: '#d32f2f',
                height: 3
              }
            }}
          >
            <Tab label="Danh sách" />
            <Tab label="Thống kê" />
          </Tabs>
        </Card>
      </Box>

      {activeTab === 0 && (
        <>
          {/* Enhanced Filters */}
          <Box sx={{ px: 3, mb: 3 }}>
            <Card sx={{ 
              background: 'white',
              borderRadius: 3,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e0e0e0'
            }}>
              <CardContent>
                <Grid container spacing={3} alignItems="center">
                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      fullWidth
                      label="Biển số xe"
                      placeholder="Nhập biển số..."
                      value={filters.plate_number}
                      onChange={(e) => handleFilterChange('plate_number', e.target.value)}
                      size="small"
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          borderRadius: 2,
                          '&:hover fieldset': { borderColor: '#d32f2f' },
                          '&.Mui-focused fieldset': { borderColor: '#d32f2f' }
                        }
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Khu vực</InputLabel>
                      <Select
                        value={filters.location_id}
                        label="Khu vực"
                        onChange={(e) => handleFilterChange('location_id', e.target.value)}
                        sx={{ borderRadius: 2 }}
                      >
                        <MenuItem value="">Tất cả khu vực</MenuItem>
                        {locationsLoading ? (
                          <MenuItem value="" disabled>Đang tải...</MenuItem>
                        ) : (
                          locations.map(location => (
                            <MenuItem key={location.id} value={location.id}>
                              {location.name}
                            </MenuItem>
                          ))
                        )}
                      </Select>
                      {formErrors.location_id && (
                        <FormHelperText error>{formErrors.location_id}</FormHelperText>
                      )}
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6} md={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Loại vi phạm</InputLabel>
                      <Select
                        value={filters.violation_type}
                        label="Loại vi phạm"
                        onChange={(e) => handleFilterChange('violation_type', e.target.value)}
                        sx={{ borderRadius: 2 }}
                      >
                        <MenuItem value="">Tất cả</MenuItem>
                        <MenuItem value="unauthorized">Không được phép</MenuItem>
                        <MenuItem value="security_threat">Đe dọa an ninh</MenuItem>
                        <MenuItem value="unpaid_fine">Chưa nộp phạt</MenuItem>
                        <MenuItem value="banned">Bị cấm</MenuItem>
                        <MenuItem value="suspicious">Đáng ngờ</MenuItem>
                        <MenuItem value="other">Khác</MenuItem>
                      </Select>
                      {formErrors.violation_type && (
                        <FormHelperText error>{formErrors.violation_type}</FormHelperText>
                      )}
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6} md={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Mức độ</InputLabel>
                      <Select
                        value={filters.severity}
                        label="Mức độ"
                        onChange={(e) => handleFilterChange('severity', e.target.value)}
                        sx={{ borderRadius: 2 }}
                      >
                        <MenuItem value="">Tất cả</MenuItem>
                        <MenuItem value="low">Thấp</MenuItem>
                        <MenuItem value="medium">Trung bình</MenuItem>
                        <MenuItem value="high">Cao</MenuItem>
                        <MenuItem value="critical">Nghiêm trọng</MenuItem>
                      </Select>
                      {formErrors.severity && (
                        <FormHelperText error>{formErrors.severity}</FormHelperText>
                      )}
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6} md={1.5}>
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<BiRefresh />}
                      onClick={handleRefresh}
                      disabled={loading}
                      sx={{
                        borderRadius: 2,
                        py: 1.5,
                        textTransform: 'none',
                        fontWeight: 600,
                        borderColor: '#d32f2f',
                        color: '#d32f2f'
                      }}
                    >
                      Làm mới
                    </Button>
                  </Grid>
                  <Grid item xs={12} sm={6} md={1.5}>
                    {selectedItems.length > 0 && (
                      <Button
                        fullWidth
                        variant="outlined"
                        color="error"
                        startIcon={<BiSolidTrashAlt />}
                        onClick={handleBulkDelete}
                        sx={{
                          borderRadius: 2,
                          py: 1.5,
                          textTransform: 'none',
                          fontWeight: 600
                        }}
                      >
                        Xóa ({selectedItems.length})
                      </Button>
                    )}
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Box>

          {/* Enhanced Table (WhiteList style) */}
          <Box sx={{ px: 3 }}>
            <Card sx={{ 
              background: 'white',
              borderRadius: 3,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e0e0e0',
              overflow: 'hidden'
            }}>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow sx={{ 
                      background: '#d32f2f',
                      '& th': {
                        color: 'white',
                        fontWeight: 600,
                        fontSize: '0.875rem',
                        borderBottom: 'none',
                        py: 2
                      }
                    }}>
                      <TableCell padding="checkbox" sx={{ width: 60 }}>
                        <Checkbox
                          checked={blacklist.length > 0 && selectedItems.length === blacklist.length}
                          indeterminate={selectedItems.length > 0 && selectedItems.length < blacklist.length}
                          onChange={handleSelectAll}
                          sx={{
                            color: 'rgba(255, 255, 255, 0.7)',
                            '&.Mui-checked': { color: 'white' },
                            '&.MuiCheckbox-indeterminate': { color: 'white' }
                          }}
                        />
                      </TableCell>
                      <TableCell>Biển số</TableCell>
                      <TableCell>Khu vực</TableCell>
                      <TableCell>Loại vi phạm</TableCell>
                      <TableCell>Mức độ</TableCell>
                      <TableCell>Thời gian hiệu lực</TableCell>
                      <TableCell>Trạng thái</TableCell>
                      <TableCell align="center" sx={{ width: 140 }}>Thao tác</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                          <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
                            <CircularProgress />
                            <Typography variant="body2" color="text.secondary">
                              Đang tải dữ liệu...
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ) : blacklist.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                          <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
                            <CarIcon sx={{ fontSize: 48, color: '#ccc' }} />
                            <Typography variant="h6" color="text.secondary">
                              Không có dữ liệu
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Không tìm thấy blacklist nào phù hợp với bộ lọc
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ) : (
                      blacklist.map((item) => (
                        <TableRow key={item.id} hover sx={{
                          '&:hover': {
                            backgroundColor: 'rgba(211, 47, 47, 0.04)',
                            transition: 'background-color 0.2s ease'
                          },
                          '&:nth-of-type(even)': {
                            backgroundColor: 'rgba(0, 0, 0, 0.02)'
                          }
                        }}>
                          <TableCell padding="checkbox">
                            <Checkbox
                              checked={selectedItems.includes(item.id)}
                              onChange={() => handleSelectItem(item.id)}
                              sx={{ '&.Mui-checked': { color: '#d32f2f' } }}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="subtitle2" fontWeight="bold">
                              {item.plate_number}
                            </Typography>
                            {item.vehicle_type && (
                              <Typography variant="caption" color="text.secondary">
                                {item.make} {item.model} - {item.color}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              <LocationIcon sx={{ fontSize: 16, mr: 0.5 }} />
                              {item.location_name}
                            </Box>
                          </TableCell>
                          <TableCell>
                            {getViolationTypeChip(item.violation_type)}
                          </TableCell>
                          <TableCell>
                            {getSeverityChip(item.severity)}
                          </TableCell>
                          <TableCell>
                            {item.valid_from && (
                              <Typography variant="caption" display="block">
                                Từ: {new Date(item.valid_from).toLocaleDateString('vi-VN')}
                              </Typography>
                            )}
                            {item.valid_to && (
                              <Typography variant="caption" display="block">
                                Đến: {new Date(item.valid_to).toLocaleDateString('vi-VN')}
                              </Typography>
                            )}
                            {!item.valid_from && !item.valid_to && (
                              <Typography variant="caption" color="text.secondary">
                                Vĩnh viễn
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            {getStatusChip(item.current_status)}
                          </TableCell>
                          <TableCell align="center">
                            <Box display="flex" justifyContent="center" gap={1}>
                              <IconButton
                                size="small"
                                color="info"
                                onClick={() => handleView(item.id)}
                                title="Xem chi tiết"
                                sx={{
                                  color: '#1976d2',
                                  backgroundColor: 'rgba(25, 118, 210, 0.1)',
                                  '&:hover': { backgroundColor: 'rgba(25, 118, 210, 0.2)' },
                                  transition: 'background-color 0.2s ease'
                                }}
                              >
                                <VisibilityIcon />
                              </IconButton>
                              <IconButton
                                size="small"
                                color="warning"
                                onClick={() => handleEdit(item)}
                                title="Chỉnh sửa"
                                sx={{
                                  color: '#ff9800',
                                  backgroundColor: 'rgba(255, 152, 0, 0.1)',
                                  '&:hover': { backgroundColor: 'rgba(255, 152, 0, 0.2)' },
                                  transition: 'background-color 0.2s ease'
                                }}
                              >
                                <EditIcon />
                              </IconButton>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleDelete(item.id)}
                                title="Xóa"
                                sx={{
                                  color: '#f44336',
                                  backgroundColor: 'rgba(244, 67, 54, 0.1)',
                                  '&:hover': { backgroundColor: 'rgba(244, 67, 54, 0.2)' },
                                  transition: 'background-color 0.2s ease'
                                }}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Enhanced Pagination */}
              <Box sx={{ 
                borderTop: '1px solid rgba(0, 0, 0, 0.1)',
                background: 'rgba(0, 0, 0, 0.02)'
              }}>
                <Typography variant="body2" color="textSecondary" sx={{ fontWeight: 500, px: 3, pt: 2 }}>
                  Hiển thị {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalItems)} / {totalItems} bản ghi
                </Typography>
                <Box display="flex" justifyContent="space-between" alignItems="center" p={3}>
                  <FormControl size="small" sx={{ minWidth: 120, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500, mr: 1 }}>
                      Hiển thị
                    </Typography>
                    <Select
                      value={itemsPerPage}
                      onChange={e => {
                        const value = Number(e.target.value);
                        setItemsPerPage(value);
                        setCurrentPage(1);
                      }}
                      sx={{ minWidth: 60, mx: 0.5 }}
                      size="small"
                    >
                      {[5, 10, 20, 50, 100].map(size => (
                        <MenuItem key={size} value={size}>{size}</MenuItem>
                      ))}
                    </Select>
                    <Typography variant="body2" sx={{ fontWeight: 500, ml: 1 }}>
                      hàng
                    </Typography>
                  </FormControl>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(1)}
                      sx={{ minWidth: 36, fontWeight: 600, borderRadius: 2, mx: 0.25 }}
                    >
                      {'<<'}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(prev => prev - 1)}
                      sx={{ minWidth: 36, fontWeight: 600, borderRadius: 2, mx: 0.25 }}
                    >
                      {'<'}
                    </Button>
                    <Pagination
                      count={totalPages}
                      page={currentPage}
                      onChange={handlePageChange}
                      color="primary"
                      siblingCount={0}
                      boundaryCount={1}
                      showFirstButton={false}
                      showLastButton={false}
                    />
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(prev => prev + 1)}
                      sx={{ minWidth: 36, fontWeight: 600, borderRadius: 2, mx: 0.25 }}
                    >
                      {'>'}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(totalPages)}
                      sx={{ minWidth: 36, fontWeight: 600, borderRadius: 2, mx: 0.25 }}
                    >
                      {'>>'}
                    </Button>
                  </Box>
                </Box>
              </Box>
            </Card>
          </Box>
        </>
      )}

      {activeTab === 1 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={3}>
            <Card className="text-center">
              <CardContent>
                <BlockIcon color="error" sx={{ fontSize: 40, mb: 1 }} />
                <Typography variant="h4" color="error.main">
                  {statistics.total_entries || 0}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Tổng số bản ghi
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card className="text-center">
              <CardContent>
                <FaShieldAlt color="red" size={40} style={{ marginBottom: 8 }} />
                <Typography variant="h4" color="error.main">
                  {statistics.active_entries || 0}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Đang hoạt động
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card className="text-center">
              <CardContent>
                <FaExclamationTriangle color="orange" size={40} style={{ marginBottom: 8 }} />
                <Typography variant="h4" color="warning.main">
                  {statistics.high_severity || 0}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Mức độ cao
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card className="text-center">
              <CardContent>
                <FaClock color="gray" size={40} style={{ marginBottom: 8 }} />
                <Typography variant="h4" color="text.secondary">
                  {statistics.expired_entries || 0}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Hết hạn
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {selectedItem ? 'Chỉnh sửa Blacklist' : 'Thêm Blacklist mới'}
        </DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth required error={!!formErrors.location_id}>
                  <InputLabel>Khu vực</InputLabel>
                  <Select
                    value={formData.location_id}
                    label="Khu vực"
                    onChange={(e) => setFormData({...formData, location_id: e.target.value})}
                  >
                    {locationsLoading ? (
                      <MenuItem value="" disabled>Đang tải...</MenuItem>
                    ) : (
                      locations.map(location => (
                        <MenuItem key={location.id} value={location.id}>
                          {location.name}
                        </MenuItem>
                      ))
                    )}
                  </Select>
                  {formErrors.location_id && (
                    <FormHelperText error>{formErrors.location_id}</FormHelperText>
                  )}
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <Button
                  variant="outlined"
                  component="label"
                  startIcon={<ImageIcon />}
                  fullWidth
                  sx={{ borderRadius: 2, mb: 1 }}
                >
                  {imageFile ? 'Đổi ảnh biển số' : 'Upload ảnh biển số'}
                  <input type="file" accept="image/*" hidden onChange={handleImageChange} />
                </Button>
                {/* Preview ảnh gốc */}
                {(imagePreview || (selectedItem && selectedItem.plate_image_path)) && (
                  <Box mt={1} mb={1}>
                    <Typography variant="caption">Ảnh gốc:</Typography>
                    <img src={imagePreview || selectedItem.plate_image_path} alt="preview" style={{ maxWidth: '100%', maxHeight: 120, borderRadius: 8, border: '1px solid #eee' }} />
                  </Box>
                )}
                {/* Preview ảnh biển số đã detect */}
                {(detectedPlateImage || (selectedItem && selectedItem.detected_plate_image)) && (
                  <Box mt={1} mb={1}>
                    <Typography variant="caption">Ảnh biển số đã detect:</Typography>
                    <img src={detectedPlateImage || selectedItem.detected_plate_image} alt="detected" style={{ maxWidth: '100%', maxHeight: 80, borderRadius: 8, border: '1px solid #eee' }} />
                  </Box>
                )}
                {ocrResult && (
                  <Alert severity="success" sx={{ mt: 1, mb: 1 }}>Biển số nhận diện: <b>{ocrResult}</b></Alert>
                )}
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  required
                  label="Biển số xe"
                  value={formData.plate_number}
                  disabled
                  error={!!formErrors.plate_number}
                  helperText={ocrResult ? "Đã nhận diện từ OCR" : "Trường này sẽ tự động điền từ ảnh biển số (OCR)"}
                />
                {formErrors.plate_number && (
                  <FormHelperText error>{formErrors.plate_number}</FormHelperText>
                )}
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth required error={!!formErrors.violation_type}>
                  <InputLabel>Loại vi phạm</InputLabel>
                  <Select
                    value={formData.violation_type}
                    label="Loại vi phạm"
                    onChange={(e) => setFormData({...formData, violation_type: e.target.value})}
                  >
                    <MenuItem value="unauthorized">Không được phép</MenuItem>
                    <MenuItem value="security_threat">Đe dọa an ninh</MenuItem>
                    <MenuItem value="unpaid_fine">Chưa nộp phạt</MenuItem>
                    <MenuItem value="banned">Bị cấm</MenuItem>
                    <MenuItem value="suspicious">Đáng ngờ</MenuItem>
                    <MenuItem value="other">Khác</MenuItem>
                  </Select>
                  {formErrors.violation_type && (
                    <FormHelperText error>{formErrors.violation_type}</FormHelperText>
                  )}
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth required error={!!formErrors.severity}>
                  <InputLabel>Mức độ</InputLabel>
                  <Select
                    value={formData.severity}
                    label="Mức độ"
                    onChange={(e) => setFormData({...formData, severity: e.target.value})}
                  >
                    <MenuItem value="low">Thấp</MenuItem>
                    <MenuItem value="medium">Trung bình</MenuItem>
                    <MenuItem value="high">Cao</MenuItem>
                    <MenuItem value="critical">Nghiêm trọng</MenuItem>
                  </Select>
                  {formErrors.severity && (
                    <FormHelperText error>{formErrors.severity}</FormHelperText>
                  )}
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Tên chủ xe"
                  placeholder="Nhập tên chủ xe"
                  value={formData.owner_name}
                  onChange={(e) => setFormData({...formData, owner_name: e.target.value})}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Số điện thoại"
                  placeholder="Nhập số điện thoại"
                  value={formData.owner_phone}
                  onChange={(e) => setFormData({...formData, owner_phone: e.target.value})}
                  error={!!formErrors.owner_phone}
                />
                {formErrors.owner_phone && (
                  <FormHelperText error>{formErrors.owner_phone}</FormHelperText>
                )}
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Có hiệu lực từ"
                  type="date"
                  InputLabelProps={{ shrink: true }}
                  value={formData.valid_from}
                  onChange={(e) => setFormData({...formData, valid_from: e.target.value})}
                  error={!!formErrors.valid_from}
                  inputRef={validFromDateRef}
                />
                {formErrors.valid_from && (
                  <FormHelperText error>{formErrors.valid_from}</FormHelperText>
                )}
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Có hiệu lực đến"
                  type="date"
                  InputLabelProps={{ shrink: true }}
                  value={formData.valid_to}
                  onChange={(e) => setFormData({...formData, valid_to: e.target.value})}
                  error={!!formErrors.valid_to}
                  inputRef={validToDateRef}
                />
                {formErrors.valid_to && (
                  <FormHelperText error>{formErrors.valid_to}</FormHelperText>
                )}
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  required
                  label="Lý do cấm"
                  multiline
                  rows={3}
                  placeholder="Nhập lý do cấm..."
                  value={formData.reason}
                  onChange={(e) => setFormData({...formData, reason: e.target.value})}
                  error={!!formErrors.reason}
                />
                {formErrors.reason && (
                  <FormHelperText error>{formErrors.reason}</FormHelperText>
                )}
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Ghi chú chi tiết"
                  multiline
                  rows={3}
                  placeholder="Nhập ghi chú chi tiết..."
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenModal(false)}>Hủy</Button>
            <Button type="submit" variant="contained" color="error" disabled={loading}>
              {loading ? <CircularProgress size={20} /> : (selectedItem ? 'Cập nhật' : 'Tạo mới')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Detail Modal */}
      <Dialog open={openDetailModal} onClose={() => setOpenDetailModal(false)} maxWidth="md" fullWidth>
        <DialogTitle>Chi tiết Blacklist</DialogTitle>
        <DialogContent>
          {selectedItem && (
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>Thông tin cơ bản</Typography>
                <Typography><strong>Biển số:</strong> {selectedItem.plate_number}</Typography>
                <Typography><strong>Khu vực:</strong> {selectedItem.location_name}</Typography>
                <Typography><strong>Loại vi phạm:</strong> {getViolationTypeChip(selectedItem.violation_type)}</Typography>
                <Typography><strong>Mức độ:</strong> {getSeverityChip(selectedItem.severity)}</Typography>
                <Typography><strong>Trạng thái:</strong> {getStatusChip(selectedItem.current_status)}</Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>Thông tin chủ xe</Typography>
                <Typography><strong>Tên:</strong> {selectedItem.owner_name || 'N/A'}</Typography>
                <Typography><strong>SĐT:</strong> {selectedItem.owner_phone || 'N/A'}</Typography>
                <Typography><strong>Lý do cấm:</strong></Typography>
                <Typography color="error.main">{selectedItem.reason}</Typography>
              </Grid>
              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
                <Typography variant="h6" gutterBottom>Thời gian hiệu lực</Typography>
                <Typography>
                  <strong>Từ:</strong> {selectedItem.valid_from ? new Date(selectedItem.valid_from).toLocaleDateString('vi-VN') : 'Vĩnh viễn'}
                </Typography>
                <Typography>
                  <strong>Đến:</strong> {selectedItem.valid_to ? new Date(selectedItem.valid_to).toLocaleDateString('vi-VN') : 'Vĩnh viễn'}
                </Typography>
                {selectedItem.description && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="h6" gutterBottom>Ghi chú chi tiết</Typography>
                    <Typography>{selectedItem.description}</Typography>
                  </>
                )}
              </Grid>
              {detailImage && (
                <Box mt={2} mb={2}>
                  <Typography variant="caption">Ảnh gốc:</Typography>
                  <img src={detailImage} alt="original" style={{ maxWidth: '100%', maxHeight: 120, borderRadius: 8, border: '1px solid #eee' }} />
                </Box>
              )}
              {detailDetectedPlateImage && (
                <Box mt={1} mb={2}>
                  <Typography variant="caption">Ảnh biển số đã detect:</Typography>
                  <img src={detailDetectedPlateImage} alt="detected" style={{ maxWidth: '100%', maxHeight: 80, borderRadius: 8, border: '1px solid #eee' }} />
                </Box>
              )}
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDetailModal(false)}>Đóng</Button>
        </DialogActions>
      </Dialog>

      {/* Enhanced Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, itemId: null, plateName: '' })}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            background: 'white',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            border: '1px solid #e0e0e0'
          }
        }}
      >
        <DialogTitle sx={{
          background: 'white',
          color: 'black',
          borderRadius: '12px 12px 0 0',
          borderBottom: '1px solid #e0e0e0',
          fontWeight: 600,
          fontSize: 20
        }}>
          <Box display="flex" alignItems="center">
            <BiSolidTrashAlt style={{ marginRight: 12, fontSize: '1.5rem', color: '#888' }} />
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#222' }}>
              Xác nhận xóa
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Typography variant="body1" sx={{ mb: 2, color: '#222' }}>
            Bạn có chắc chắn muốn xóa blacklist với biển số <strong>"{deleteDialog.plateName}"</strong>?
          </Typography>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2">
              • Blacklist này sẽ bị xóa vĩnh viễn<br/>
              • Phương tiện sẽ được phép ra vào tự động<br/>
              • Hành động này không thể hoàn tác
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions sx={{
          p: 3,
          borderTop: '1px solid #e0e0e0',
          background: '#fafafa'
        }}>
          <Button
            onClick={() => setDeleteDialog({ open: false, itemId: null, plateName: '' })}
            sx={{
              borderRadius: 2,
              px: 3,
              py: 1.5,
              textTransform: 'none',
              fontWeight: 600,
              backgroundColor: '#f5f5f5',
              color: '#222',
              '&:hover': { backgroundColor: '#ededed' }
            }}
          >
            Hủy
          </Button>
          <Button
            variant="contained"
            onClick={() => handleDelete(deleteDialog.itemId)}
            sx={{
              borderRadius: 2,
              px: 3,
              py: 1.5,
              textTransform: 'none',
              fontWeight: 600,
              backgroundColor: '#e53935',
              color: 'white',
              '&:hover': { backgroundColor: '#b71c1c' }
            }}
          >
            <FaTrash style={{ marginRight: 8 }} />
            Xóa
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default BlackList; 