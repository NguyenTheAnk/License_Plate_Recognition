import React, { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Alert,
  CircularProgress,
  Pagination,
  Tabs,
  Tab,
  Typography,
  Grid,
  IconButton,
  Tooltip,
  Divider,
  Checkbox,
  Breadcrumbs,
  Avatar,
  FormHelperText
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Event as EventIcon,
  LocationOn as LocationIcon,
  DirectionsCar as CarIcon,
  Person as PersonIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  Description as DescriptionIcon,
  Schedule as ScheduleIcon,
  Warning as WarningIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
  Home as HomeIcon,
  ExpandMore as ExpandMoreIcon,
  Refresh as RefreshIcon,
  Image as ImageIcon
} from '@mui/icons-material';
import {
  FaShieldAlt,
  FaClock,
  FaExclamationTriangle,
  FaPlus,
  FaSave,
  FaTimes,
  FaEdit,
  FaTrash,
  FaEye,
  FaUpload
} from 'react-icons/fa';
import { BiRefresh, BiSolidTrashAlt } from 'react-icons/bi';

// Import các hàm từ auth.js
import {
  fetchDataFromAPI,
  postData,
  editData,
  deleteData,
  uploadImage,
  handleErrorResponse,
  isUnauthorizedError
} from '../utils/auth';

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
      '&:hover, &:focus': {
        backgroundColor: 'grey.200',
      },
      '&:active': {
        boxShadow: 1,
        backgroundColor: 'grey.300',
      },
      cursor: 'pointer'
    }}
    {...props}
  />
);

const WhiteList = () => {
  // States
  const [whitelist, setWhitelist] = useState([]);
  const [loading, setLoading] = useState(false);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [openModal, setOpenModal] = useState(false);
  const [openDetailModal, setOpenDetailModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [locations, setLocations] = useState([]);
  const [statistics, setStatistics] = useState({});
  const [activeTab, setActiveTab] = useState(0);
  const [selectedItems, setSelectedItems] = useState([]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Filters
  const [filters, setFilters] = useState({
    location_id: '',
    plate_number: '',
    approval_status: '',
    is_active: '',
    valid_status: ''
  });

  // Form data
  const [formData, setFormData] = useState({
    location_id: '',
    plate_number: '',
    vehicle_id: '',
    owner_name: '',
    owner_phone: '',
    contact_email: '',
    valid_from: '',
    valid_to: '',
    description: '',
    approval_status: 'approved'
  });

  // Image handling
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [ocrResult, setOcrResult] = useState('');

  // Error handling
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteDialog, setDeleteDialog] = useState({ open: false, itemId: null, plateName: '' });

  // Form validation
  const [formErrors, setFormErrors] = useState({});

  // Get token from localStorage
  const getToken = () => {
    return localStorage.getItem('token');
  };

  // Auto close alerts
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  // Load data
  useEffect(() => {
    loadWhitelist();
    loadLocations();
    loadStatistics();
  }, [currentPage, itemsPerPage, filters]);

  // Validate form
  const validateForm = () => {
    const errors = {};
    
    if (!formData.location_id) {
      errors.location_id = 'Vui lòng chọn khu vực';
    }
    
    if (!formData.plate_number) {
      errors.plate_number = 'Vui lòng nhập biển số xe';
    } 
    else {
      // Validate Vietnamese license plate format
      const plateRegex = /^[0-9]{2}[A-Z]{1,2}-[0-9]{3,4}\.[0-9]{2}$|^[0-9]{2}[A-Z]{1,2}[0-9]{3,4}$/;
      if (!plateRegex.test(formData.plate_number)) {
        errors.plate_number = 'Định dạng biển số không hợp lệ';
      }
    }

    if (formData.contact_email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.contact_email)) {
        errors.contact_email = 'Định dạng email không hợp lệ';
      }
    }

    if (formData.owner_phone) {
      const phoneRegex = /^(\+84|84|0)(3|5|7|8|9)[0-9]{8}$/;
      if (!phoneRegex.test(formData.owner_phone.replace(/\s+/g, ''))) {
        errors.owner_phone = 'Định dạng số điện thoại không hợp lệ';
      }
    }

    if (formData.valid_from && formData.valid_to) {
      if (new Date(formData.valid_from) > new Date(formData.valid_to)) {
        errors.valid_to = 'Ngày kết thúc phải sau ngày bắt đầu';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const loadWhitelist = async () => {
    setLoading(true);
    try {
      const token = getToken();
      console.log('Loading whitelist with token:', token ? 'Token exists' : 'No token');
      
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('limit', itemsPerPage.toString());
      
      // Add filters to params
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== '' && value !== null && value !== undefined) {
          params.append(key, value);
        }
      });

      const response = await fetchDataFromAPI(`/api/whitelist?${params.toString()}`, token);

      if (response.success) {
        setWhitelist(response.data || []);
        if (response.pagination) {
          setTotalPages(response.pagination.total_pages || 1);
          setTotalItems(response.pagination.total || 0);
        }
      } else {
        setError(response.message || 'Lỗi khi tải danh sách whitelist');
      }
    } catch (error) {
      console.error('Error loading whitelist:', error);
      const errorMessage = handleErrorResponse(error);
      setError(errorMessage);
      
      if (isUnauthorizedError(error)) {
        const token = getToken();
        if (!token || token.trim() === '') {
          localStorage.removeItem('token');
          window.location.href = '/login';
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const loadLocations = async () => {
    setLocationsLoading(true);
    try {
      const token = getToken();
      // Gọi API /api/location với limit lớn để lấy đủ danh sách khu vực
      const response = await fetchDataFromAPI('/api/location?limit=1000&is_active=1', token);
      
      if (response.success) {
        setLocations(response.data.locations || []);
      } else {
        console.error('Failed to load locations:', response.message);
        setError('Không thể tải danh sách khu vực: ' + response.message);
      }
    } catch (error) {
      console.error('Error loading locations:', error);
      const errorMessage = handleErrorResponse(error);
      setError('Không thể tải danh sách khu vực: ' + errorMessage);
    } finally {
      setLocationsLoading(false);
    }
  };

  const loadStatistics = async () => {
    try {
      const token = getToken();
      const response = await fetchDataFromAPI('/api/whitelist/statistics', token);
      
      if (response.success) {
        setStatistics(response.data?.general_statistics || {});
      }
    } catch (error) {
      console.error('Error loading statistics:', error);
    }
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Vui lòng chọn file ảnh');
        return;
      }
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError('Kích thước file không được vượt quá 10MB');
        return;
      }
      setImageFile(file);
      // Create preview
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImagePreview(ev.target.result);
      };
      reader.readAsDataURL(file);

      // Gửi ảnh lên backend để nhận diện OCR ngay khi chọn ảnh
      try {
        const token = getToken();
        const formDataToSend = new FormData();
        formDataToSend.append('image', file);
        const data = await uploadImage('/api/whitelist/ocr-preview', formDataToSend, token);
        console.log('Kết quả nhận diện ký tự biển số:', data);
        if (data.success && data.ocr_text) {
          setFormData(prev => ({ ...prev, plate_number: data.ocr_text }));
          setOcrResult(data.ocr_text);
        } else if (data.message) {
          setOcrResult('');
          setError('Nhận diện ký tự thất bại: ' + data.message);
        } else {
          setOcrResult('');
          setError('Không nhận diện được ký tự biển số từ ảnh.');
        }
      } catch (err) {
        setOcrResult('');
        if (err.response && err.response.data && err.response.data.message) {
          setError('Lỗi nhận diện ký tự: ' + err.response.data.message);
        } else if (err.message) {
          setError('Lỗi nhận diện ký tự: ' + err.message);
        } else {
          setError('Lỗi không xác định khi nhận diện ký tự.');
        }
      }
    } else {
      setImageFile(null);
      setImagePreview(null);
      setOcrResult('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      setError('Vui lòng kiểm tra lại thông tin nhập vào');
      return;
    }
    setLoading(true);
    try {
      const token = getToken();
      let response;
      if (selectedItem) {
        // Update existing item
        if (imageFile) {
          const formDataToSend = new FormData();
          Object.entries(formData).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
              formDataToSend.append(key, value);
            }
          });
          formDataToSend.append('image', imageFile);
          response = await uploadImage(`/api/whitelist/${selectedItem.id}`, formDataToSend, token);
        } else {
          response = await editData(`/api/whitelist/${selectedItem.id}`, formData, token);
        }
        setSuccess('Cập nhật whitelist thành công');
      } else {
        // Create new item
        if (imageFile) {
          const formDataToSend = new FormData();
          Object.entries(formData).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
              formDataToSend.append(key, value);
            }
          });
          formDataToSend.append('image', imageFile);
          response = await uploadImage('/api/whitelist/create', formDataToSend, token);
        } else {
          response = await postData('/api/whitelist/create', formData, token);
        }
        setSuccess('Tạo whitelist thành công');
      }
      if (response.success) {
        setOpenModal(false);
        resetForm();
        if (response.data?.ocr_text) {
          setOcrResult(response.data.ocr_text);
        }
        loadWhitelist();
      } else {
        setError(response.message || 'Có lỗi xảy ra');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      const errorMessage = handleErrorResponse(error);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      const token = getToken();
      const response = await deleteData(`/api/whitelist/${id}`, token);
      
      if (response.success) {
        setSuccess('Xóa whitelist thành công');
        setSelectedItems(prev => prev.filter(itemId => itemId !== id));
        loadWhitelist();
      } else {
        setError(response.message || 'Lỗi khi xóa whitelist');
      }
    } catch (error) {
      console.error('Error deleting whitelist:', error);
      const errorMessage = handleErrorResponse(error);
      setError(errorMessage);
    } finally {
      setDeleteDialog({ open: false, itemId: null, plateName: '' });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedItems.length === 0) {
      setError('Vui lòng chọn ít nhất một mục để xóa!');
      return;
    }

    if (window.confirm(`Bạn có chắc chắn muốn xóa ${selectedItems.length} mục đã chọn?`)) {
      try {
        const token = getToken();
        const response = await postData('/api/whitelist/bulk/delete', { ids: selectedItems }, token);
        if (response.success) {
          setSuccess(`Xóa thành công ${selectedItems.length} mục!`);
          setSelectedItems([]);
          loadWhitelist();
        } else {
          setError(response.message || 'Lỗi khi xóa nhiều mục!');
        }
      } catch (error) {
        console.error('Error bulk deleting:', error);
        setError(handleErrorResponse(error));
      }
    }
  };

  const handleEdit = (item) => {
    setSelectedItem(item);
    setFormData({
      location_id: item.location_id || '',
      plate_number: item.plate_number || '',
      vehicle_id: item.vehicle_id || '',
      owner_name: item.owner_name || '',
      owner_phone: item.owner_phone || '',
      contact_email: item.contact_email || '',
      valid_from: item.valid_from || '',
      valid_to: item.valid_to || '',
      description: item.description || '',
      approval_status: item.approval_status || 'approved'
    });
    setFormErrors({});
    setOpenModal(true);
  };

  const handleView = async (id) => {
    try {
      const token = getToken();
      const response = await fetchDataFromAPI(`/api/whitelist/${id}`, token);
      
      if (response.success) {
        setSelectedItem(response.data);
        setOpenDetailModal(true);
      } else {
        setError(response.message || 'Lỗi khi tải chi tiết whitelist');
      }
    } catch (error) {
      console.error('Error viewing whitelist:', error);
      const errorMessage = handleErrorResponse(error);
      setError(errorMessage);
    }
  };

  const resetForm = () => {
    setFormData({
      location_id: '',
      plate_number: '',
      vehicle_id: '',
      owner_name: '',
      owner_phone: '',
      contact_email: '',
      valid_from: '',
      valid_to: '',
      description: '',
      approval_status: 'approved'
    });
    setSelectedItem(null);
    setImageFile(null);
    setImagePreview(null);
    setOcrResult('');
    setFormErrors({});
  };

  const handleRefresh = () => {
    setFilters({
      location_id: '',
      plate_number: '',
      approval_status: '',
      is_active: '',
      valid_status: ''
    });
    setCurrentPage(1);
    setSelectedItems([]);
    loadWhitelist();
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
    setCurrentPage(1); // Reset to first page when filter changes
  };

  const handleSelectItem = (itemId) => {
    setSelectedItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const handleSelectAll = () => {
    if (selectedItems.length === whitelist.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(whitelist.map(item => item.id));
    }
  };

  const getStatusChip = (status) => {
    const statusConfig = {
      'valid': { color: 'success', label: 'Có hiệu lực' },
      'expired': { color: 'error', label: 'Hết hạn' },
      'future': { color: 'warning', label: 'Chưa có hiệu lực' },
      'permanent': { color: 'info', label: 'Vĩnh viễn' }
    };
    const config = statusConfig[status] || { color: 'default', label: status };
    return <Chip label={config.label} color={config.color} size="small" sx={{ fontWeight: 600, fontSize: '0.75rem' }} />;
  };

  const getApprovalChip = (status) => {
    const statusConfig = {
      'approved': { color: 'success', label: 'Đã phê duyệt' },
      'pending': { color: 'warning', label: 'Chờ phê duyệt' },
      'rejected': { color: 'error', label: 'Từ chối' }
    };
    const config = statusConfig[status] || { color: 'default', label: status };
    return <Chip label={config.label} color={config.color} size="small" sx={{ fontWeight: 600, fontSize: '0.75rem' }} />;
  };

  const handlePageChange = (event, page) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (event) => {
    setItemsPerPage(parseInt(event.target.value));
    setCurrentPage(1);
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
                  color: '#1976d2',
                  mb: 1
                }}>
                  <CheckCircleOutlineIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                  Quản lý Danh sách Trắng
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  Quản lý các phương tiện được phép ra vào
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
                    label="Danh sách trắng"
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
                    backgroundColor: '#1976d2',
                    borderRadius: 2,
                    px: 3,
                    py: 1.5,
                    textTransform: 'none',
                    fontWeight: 600,
                    boxShadow: '0 2px 8px rgba(25, 118, 210, 0.3)',
                    '&:hover': {
                      backgroundColor: '#1565c0',
                      boxShadow: '0 4px 12px rgba(25, 118, 210, 0.4)',
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
      {error && (
        <Box sx={{ px: 3, mb: 2 }}>
          <Alert 
            severity="error" 
            onClose={() => setError('')}
            sx={{ 
              borderRadius: 3,
              boxShadow: '0 2px 8px rgba(244, 67, 54, 0.2)',
              '& .MuiAlert-icon': { fontSize: '1.5rem' },
              '& .MuiAlert-message': { fontWeight: 500 }
            }}
          >
            {error}
          </Alert>
        </Box>
      )}
      
      {success && (
        <Box sx={{ px: 3, mb: 2 }}>
          <Alert 
            severity="success" 
            onClose={() => setSuccess('')}
            sx={{ 
              borderRadius: 3,
              boxShadow: '0 2px 8px rgba(76, 175, 80, 0.2)',
              '& .MuiAlert-icon': { fontSize: '1.5rem' },
              '& .MuiAlert-message': { fontWeight: 500 }
            }}
          >
            {success}
          </Alert>
        </Box>
      )}

      {/* OCR Result Alert */}
      {ocrResult && (
        <Box sx={{ px: 3, mb: 2 }}>
          <Alert 
            severity="info" 
            onClose={() => setOcrResult('')}
            sx={{ 
              borderRadius: 3,
              boxShadow: '0 2px 8px rgba(33, 150, 243, 0.2)',
              '& .MuiAlert-icon': { fontSize: '1.5rem' },
              '& .MuiAlert-message': { fontWeight: 500 }
            }}
          >
            Kết quả nhận diện biển số từ ảnh: <strong>{ocrResult}</strong>
          </Alert>
        </Box>
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
                color: '#1976d2',
                backgroundColor: 'rgba(25, 118, 210, 0.04)'
              },
              '& .MuiTabs-indicator': {
                backgroundColor: '#1976d2',
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
                          '&:hover fieldset': { borderColor: '#1976d2' },
                          '&.Mui-focused fieldset': { borderColor: '#1976d2' }
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
                        disabled={locationsLoading}
                        sx={{ borderRadius: 2 }}
                      >
                        <MenuItem value="">Tất cả khu vực</MenuItem>
                        {locationsLoading ? (
                          <MenuItem disabled>
                            <Box display="flex" alignItems="center" gap={1}>
                              <CircularProgress size={14} />
                              <Typography variant="caption">Đang tải...</Typography>
                            </Box>
                          </MenuItem>
                        ) : locations.length === 0 ? (
                          <MenuItem disabled>
                            <Typography variant="caption" color="text.secondary">
                              Không có khu vực nào
                            </Typography>
                          </MenuItem>
                        ) : (
                          locations?.map(location => (
                            <MenuItem key={location.id} value={location.id}>
                              <Box display="flex" flexDirection="column">
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  {location.name}
                                </Typography>
                                {location.code && (
                                  <Typography variant="caption" color="text.secondary">
                                    {location.code}
                                  </Typography>
                                )}
                              </Box>
                            </MenuItem>
                          ))
                        )}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6} md={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Phê duyệt</InputLabel>
                      <Select
                        value={filters.approval_status}
                        label="Phê duyệt"
                        onChange={(e) => handleFilterChange('approval_status', e.target.value)}
                        sx={{ borderRadius: 2 }}
                      >
                        <MenuItem value="">Tất cả</MenuItem>
                        <MenuItem value="approved">Đã phê duyệt</MenuItem>
                        <MenuItem value="pending">Chờ phê duyệt</MenuItem>
                        <MenuItem value="rejected">Từ chối</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6} md={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Hiệu lực</InputLabel>
                      <Select
                        value={filters.valid_status}
                        label="Hiệu lực"
                        onChange={(e) => handleFilterChange('valid_status', e.target.value)}
                        sx={{ borderRadius: 2 }}
                      >
                        <MenuItem value="">Tất cả</MenuItem>
                        <MenuItem value="valid">Có hiệu lực</MenuItem>
                        <MenuItem value="expired">Hết hạn</MenuItem>
                        <MenuItem value="future">Chưa có hiệu lực</MenuItem>
                      </Select>
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
                        borderColor: '#1976d2',
                        color: '#1976d2'
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

          {/* Enhanced Table */}
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
                      background: '#1976d2',
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
                          checked={whitelist.length > 0 && selectedItems.length === whitelist.length}
                          indeterminate={selectedItems.length > 0 && selectedItems.length < whitelist.length}
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
                      <TableCell>Chủ xe</TableCell>
                      <TableCell>Thời gian hiệu lực</TableCell>
                      <TableCell>Trạng thái</TableCell>
                      <TableCell>Phê duyệt</TableCell>
                      <TableCell align="center" sx={{ width: 140 }}>Thao tác</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                          <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
                            <CircularProgress size={40} />
                            <Typography variant="body2" color="text.secondary">
                              Đang tải dữ liệu...
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ) : whitelist.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                          <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
                            <CarIcon sx={{ fontSize: 48, color: '#ccc' }} />
                            <Typography variant="h6" color="text.secondary">
                              Không có dữ liệu
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Không tìm thấy whitelist nào phù hợp với bộ lọc
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ) : (
                      whitelist.map((item) => (
                        <TableRow 
                          key={item.id} 
                          hover
                          sx={{ 
                            '&:hover': {
                              backgroundColor: 'rgba(25, 118, 210, 0.04)',
                              transition: 'background-color 0.2s ease'
                            },
                            '&:nth-of-type(even)': {
                              backgroundColor: 'rgba(0, 0, 0, 0.02)'
                            }
                          }}
                        >
                          <TableCell padding="checkbox">
                            <Checkbox
                              checked={selectedItems.includes(item.id)}
                              onChange={() => handleSelectItem(item.id)}
                              sx={{ '&.Mui-checked': { color: '#1976d2' } }}
                            />
                          </TableCell>
                          <TableCell>
                            <Box display="flex" alignItems="center" gap={2}>
                              <Avatar sx={{ 
                                bgcolor: '#1976d2',
                                width: 40,
                                height: 40,
                                fontSize: '0.9rem',
                                fontWeight: 600
                              }}>
                                <CarIcon />
                              </Avatar>
                              <Box>
                                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                  {item.plate_number}
                                </Typography>
                                {item.has_images && (
                                  <Tooltip title="Có ảnh biển số">
                                    <ImageIcon sx={{ fontSize: 16, color: '#1976d2' }} />
                                  </Tooltip>
                                )}
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              <LocationIcon sx={{ fontSize: 16, mr: 0.5, color: '#1976d2' }} />
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                {item.location_name}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            {item.owner_name && (
                              <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                                <PersonIcon sx={{ fontSize: 16, mr: 0.5, color: '#1976d2' }} />
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  {item.owner_name}
                                </Typography>
                              </Box>
                            )}
                            {item.owner_phone && (
                              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <PhoneIcon sx={{ fontSize: 14, mr: 0.5, color: '#666' }} />
                                <Typography variant="caption" color="text.secondary">
                                  {item.owner_phone}
                                </Typography>
                              </Box>
                            )}
                          </TableCell>
                          <TableCell>
                            {item.valid_from && (
                              <Typography variant="caption" display="block" sx={{ fontWeight: 500 }}>
                                Từ: {new Date(item.valid_from).toLocaleDateString('vi-VN')}
                              </Typography>
                            )}
                            {item.valid_to && (
                              <Typography variant="caption" display="block" sx={{ fontWeight: 500 }}>
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
                          <TableCell>
                            {getApprovalChip(item.approval_status)}
                          </TableCell>
                          <TableCell align="center">
                            <Box display="flex" justifyContent="center" gap={1}>
                              <IconButton
                                size="small"
                                onClick={() => handleView(item.id)}
                                title="Xem chi tiết"
                                sx={{
                                  color: '#1976d2',
                                  backgroundColor: 'rgba(25, 118, 210, 0.1)',
                                  '&:hover': { backgroundColor: 'rgba(25, 118, 210, 0.2)' },
                                  transition: 'background-color 0.2s ease'
                                }}
                              >
                                <FaEye size={14} />
                              </IconButton>
                              <IconButton
                                size="small"
                                onClick={() => handleEdit(item)}
                                title="Chỉnh sửa"
                                sx={{
                                  color: '#ff9800',
                                  backgroundColor: 'rgba(255, 152, 0, 0.1)',
                                  '&:hover': { backgroundColor: 'rgba(255, 152, 0, 0.2)' },
                                  transition: 'background-color 0.2s ease'
                                }}
                              >
                                <FaEdit size={14} />
                              </IconButton>
                              <IconButton
                                size="small"
                                onClick={() => setDeleteDialog({ 
                                  open: true, 
                                  itemId: item.id, 
                                  plateName: item.plate_number 
                                })}
                                title="Xóa"
                                sx={{
                                  color: '#f44336',
                                  backgroundColor: 'rgba(244, 67, 54, 0.1)',
                                  '&:hover': { backgroundColor: 'rgba(244, 67, 54, 0.2)' },
                                  transition: 'background-color 0.2s ease'
                                }}
                              >
                                <FaTrash size={14} />
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
                      onChange={handleItemsPerPageChange}
                      sx={{ minWidth: 60, mx: 0.5 }}
                      size="small"
                      displayEmpty
                      inputProps={{ 'aria-label': 'Số hàng mỗi trang' }}
                    >
                      {[5, 10, 20, 50, 100].map(size => (
                        <MenuItem key={size} value={size}>{size}</MenuItem>
                      ))}
                    </Select>
                    <Typography variant="body2" sx={{ fontWeight: 500, ml: 1 }}>
                      hàng
                    </Typography>
                  </FormControl>
                  
                  {/* Always show pagination controls */}
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
                    {getPaginationItems(currentPage, totalPages).map((item, idx) =>
                      item === '...'
                        ? <Box key={idx} sx={{ px: 1, color: '#888', fontWeight: 600 }}>...</Box>
                        : <Button
                            key={item}
                            variant={item === currentPage ? 'contained' : 'outlined'}
                            color={item === currentPage ? 'primary' : 'inherit'}
                            size="small"
                            sx={{ 
                              minWidth: 36, 
                              fontWeight: 600, 
                              borderRadius: 2, 
                              mx: 0.25,
                              ...(item === currentPage && { boxShadow: '0 2px 8px rgba(25, 118, 210, 0.15)' })
                            }}
                            onClick={() => setCurrentPage(item)}
                          >
                            {item}
                          </Button>
                    )}
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={currentPage === totalPages || totalPages === 0}
                      onClick={() => setCurrentPage(prev => prev + 1)}
                      sx={{ minWidth: 36, fontWeight: 600, borderRadius: 2, mx: 0.25 }}
                    >
                      {'>'}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={currentPage === totalPages || totalPages === 0}
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

      {/* Enhanced Statistics Tab */}
      {activeTab === 1 && (
        <Box sx={{ px: 3 }}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={3}>
              <Card sx={{ 
                background: 'white',
                borderRadius: 3,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                border: '1px solid #e0e0e0',
                textAlign: 'center',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)'
                }
              }}>
                <CardContent sx={{ p: 3 }}>
                  <CheckCircleIcon sx={{ fontSize: 48, color: '#4caf50', mb: 2 }} />
                  <Typography variant="h3" sx={{ fontWeight: 700, color: '#4caf50', mb: 1 }}>
                    {statistics.total_entries || 0}
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>
                    Tổng số bản ghi
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={3}>
              <Card sx={{ 
                background: 'white',
                borderRadius: 3,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                border: '1px solid #e0e0e0',
                textAlign: 'center',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)'
                }
              }}>
                <CardContent sx={{ p: 3 }}>
                  <FaShieldAlt size={48} color="#4caf50" style={{ marginBottom: 16 }} />
                  <Typography variant="h3" sx={{ fontWeight: 700, color: '#4caf50', mb: 1 }}>
                    {statistics.active_entries || 0}
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>
                    Đang hoạt động
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={3}>
              <Card sx={{ 
                background: 'white',
                borderRadius: 3,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                border: '1px solid #e0e0e0',
                textAlign: 'center',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)'
                }
              }}>
                <CardContent sx={{ p: 3 }}>
                  <FaClock size={48} color="#ff9800" style={{ marginBottom: 16 }} />
                  <Typography variant="h3" sx={{ fontWeight: 700, color: '#ff9800', mb: 1 }}>
                    {statistics.pending_approval || 0}
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>
                    Chờ phê duyệt
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={3}>
              <Card sx={{ 
                background: 'white',
                borderRadius: 3,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                border: '1px solid #e0e0e0',
                textAlign: 'center',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)'
                }
              }}>
                <CardContent sx={{ p: 3 }}>
                  <FaExclamationTriangle size={48} color="#f44336" style={{ marginBottom: 16 }} />
                  <Typography variant="h3" sx={{ fontWeight: 700, color: '#f44336', mb: 1 }}>
                    {statistics.expired_entries || 0}
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>
                    Hết hạn
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* Enhanced Create/Edit Modal */}
      <Dialog 
        open={openModal} 
        onClose={() => setOpenModal(false)} 
        maxWidth="md" 
        fullWidth
        PaperProps={{
          sx: { 
            borderRadius: 3,
            background: 'white',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
            border: '1px solid #e0e0e0'
          }
        }}
      >
        <DialogTitle sx={{ 
          background: '#1976d2',
          color: 'white',
          borderRadius: '12px 12px 0 0',
          borderBottom: '1px solid #e0e0e0'
        }}>
          <Box display="flex" alignItems="center">
            <AddIcon sx={{ mr: 1.5, fontSize: '1.5rem' }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {selectedItem ? 'Chỉnh sửa Whitelist' : 'Thêm Whitelist mới'}
            </Typography>
          </Box>
        </DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent sx={{ p: 3 }}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth required error={!!formErrors.location_id}>
                  <InputLabel>Khu vực</InputLabel>
                  <Select
                    value={formData.location_id}
                    label="Khu vực"
                    onChange={(e) => setFormData({...formData, location_id: e.target.value})}
                    disabled={locationsLoading}
                    sx={{ borderRadius: 2 }}
                  >
                    {locationsLoading ? (
                      <MenuItem disabled>
                        <Box display="flex" alignItems="center" gap={1}>
                          <CircularProgress size={16} />
                          <Typography variant="body2">Đang tải khu vực...</Typography>
                        </Box>
                      </MenuItem>
                    ) : locations.length === 0 ? (
                      <MenuItem disabled>
                        <Typography variant="body2" color="text.secondary">
                          Không có khu vực nào
                        </Typography>
                      </MenuItem>
                    ) : (
                      locations.map(location => (
                        <MenuItem key={location.id} value={location.id}>
                          <Box display="flex" flexDirection="column">
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {location.name}
                            </Typography>
                            {location.code && (
                              <Typography variant="caption" color="text.secondary">
                                {location.code}
                              </Typography>
                            )}
                          </Box>
                        </MenuItem>
                      ))
                    )}
                  </Select>
                  {formErrors.location_id && (
                    <FormHelperText>{formErrors.location_id}</FormHelperText>
                  )}
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  required
                  label="Biển số xe"
                  placeholder="Nhập biển số xe"
                  value={formData.plate_number}
                  onChange={(e) => setFormData({...formData, plate_number: e.target.value})}
                  error={!!formErrors.plate_number}
                  helperText={formErrors.plate_number}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      '&:hover fieldset': { borderColor: '#1976d2' },
                      '&.Mui-focused fieldset': { borderColor: '#1976d2' }
                    }
                  }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Tên chủ xe"
                  placeholder="Nhập tên chủ xe"
                  value={formData.owner_name}
                  onChange={(e) => setFormData({...formData, owner_name: e.target.value})}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      '&:hover fieldset': { borderColor: '#1976d2' },
                      '&.Mui-focused fieldset': { borderColor: '#1976d2' }
                    }
                  }}
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
                  helperText={formErrors.owner_phone}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      '&:hover fieldset': { borderColor: '#1976d2' },
                      '&.Mui-focused fieldset': { borderColor: '#1976d2' }
                    }
                  }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Email liên hệ"
                  type="email"
                  placeholder="Nhập email"
                  value={formData.contact_email}
                  onChange={(e) => setFormData({...formData, contact_email: e.target.value})}
                  error={!!formErrors.contact_email}
                  helperText={formErrors.contact_email}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      '&:hover fieldset': { borderColor: '#1976d2' },
                      '&.Mui-focused fieldset': { borderColor: '#1976d2' }
                    }
                  }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Trạng thái phê duyệt</InputLabel>
                  <Select
                    value={formData.approval_status}
                    label="Trạng thái phê duyệt"
                    onChange={(e) => setFormData({...formData, approval_status: e.target.value})}
                    sx={{ borderRadius: 2 }}
                  >
                    <MenuItem value="approved">Đã phê duyệt</MenuItem>
                    <MenuItem value="pending">Chờ phê duyệt</MenuItem>
                    <MenuItem value="rejected">Từ chối</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Có hiệu lực từ"
                  type="date"
                  InputLabelProps={{ shrink: true }}
                  value={formData.valid_from}
                  onChange={(e) => setFormData({...formData, valid_from: e.target.value})}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      '&:hover fieldset': { borderColor: '#1976d2' },
                      '&.Mui-focused fieldset': { borderColor: '#1976d2' }
                    }
                  }}
                />
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
                  helperText={formErrors.valid_to}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      '&:hover fieldset': { borderColor: '#1976d2' },
                      '&.Mui-focused fieldset': { borderColor: '#1976d2' }
                    }
                  }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Ghi chú"
                  multiline
                  rows={3}
                  placeholder="Nhập ghi chú..."
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      '&:hover fieldset': { borderColor: '#1976d2' },
                      '&.Mui-focused fieldset': { borderColor: '#1976d2' }
                    }
                  }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Button
                  variant="outlined"
                  component="label"
                  fullWidth
                  startIcon={<FaUpload />}
                  sx={{ 
                    mb: 2,
                    borderRadius: 2,
                    py: 1.5,
                    textTransform: 'none',
                    fontWeight: 600
                  }}
                >
                  Tải ảnh biển số xe
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={handleImageChange}
                  />
                </Button>
                {imagePreview && (
                  <Box mt={1} display="flex" flexDirection="column" alignItems="center">
                    <img 
                      src={imagePreview} 
                      alt="preview" 
                      style={{ 
                        maxWidth: '100%', 
                        maxHeight: 200, 
                        borderRadius: 8, 
                        border: '1px solid #eee' 
                      }} 
                    />
                    <Button
                      size="small"
                      color="error"
                      onClick={() => {
                        setImageFile(null);
                        setImagePreview(null);
                      }}
                      sx={{ mt: 1 }}
                    >
                      Xóa ảnh
                    </Button>
                  </Box>
                )}
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ 
            p: 3, 
            borderTop: '1px solid #e0e0e0',
            background: '#fafafa'
          }}>
            <Button 
              onClick={() => setOpenModal(false)}
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
              <FaTimes style={{ marginRight: 8 }} />
              Hủy
            </Button>
            <Button 
              type="submit" 
              variant="contained" 
              disabled={loading}
              sx={{
                borderRadius: 2,
                px: 3,
                py: 1.5,
                textTransform: 'none',
                fontWeight: 600,
                backgroundColor: loading ? '#ccc' : '#1976d2',
                '&:hover': { backgroundColor: loading ? '#ccc' : '#1565c0' }
              }}
            >
              <FaSave style={{ marginRight: 8 }} />
              {loading ? 'Đang xử lý...' : (selectedItem ? 'Cập nhật' : 'Tạo mới')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Enhanced Detail Modal - Redesigned */}
      <Dialog 
        open={openDetailModal} 
        onClose={() => setOpenDetailModal(false)} 
        maxWidth="md" 
        fullWidth
        PaperProps={{
          sx: { 
            borderRadius: 3,
            background: 'white',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
            border: '1px solid #e0e0e0',
            overflow: 'hidden'
          }
        }}
      >
        <DialogTitle sx={{ 
          background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)',
          color: 'white',
          p: 0,
          position: 'relative'
        }}>
          <Box sx={{ p: 3 }}>
            <Box display="flex" alignItems="flex-start" justifyContent="space-between">
              <Box display="flex" alignItems="center" gap={2} flex={1}>
                <Avatar sx={{ 
                  bgcolor: 'rgba(255, 255, 255, 0.2)',
                  width: 56, 
                  height: 56, 
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  border: '2px solid rgba(255, 255, 255, 0.3)'
                }}>
                  <CarIcon sx={{ fontSize: '2rem' }} />
                </Avatar>
                <Box flex={1}>
                  <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
                    {selectedItem?.plate_number || 'N/A'}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9, mb: 1 }}>
                    Chi tiết thông tin whitelist
                  </Typography>
                  {/* Status badges moved here */}
                  <Box display="flex" gap={1} flexWrap="wrap">
                    {selectedItem && getStatusChip(selectedItem.current_status)}
                    {selectedItem && getApprovalChip(selectedItem.approval_status)}
                  </Box>
                </Box>
              </Box>
              <IconButton
                onClick={() => setOpenDetailModal(false)}
                sx={{ 
                  color: 'white',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.2)' },
                  ml: 2
                }}
              >
                <FaTimes />
              </IconButton>
            </Box>
          </Box>
        </DialogTitle>
        
        <DialogContent sx={{ p: 0 }}>
          {selectedItem && (
            <Box>
              {/* Main Info Section */}
              <Box sx={{ p: 3, background: '#f8f9fc' }}>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={6}>
                    <Card sx={{ 
                      height: '100%',
                      borderRadius: 2,
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                      border: '1px solid #e0e0e0'
                    }}>
                      <CardContent sx={{ p: 2.5 }}>
                        <Box display="flex" alignItems="center" gap={1} mb={2}>
                          <LocationIcon sx={{ color: '#1976d2', fontSize: '1.2rem' }} />
                          <Typography variant="h6" sx={{ color: '#1976d2', fontWeight: 600 }}>
                            Thông tin khu vực
                          </Typography>
                        </Box>
                        <Box sx={{ pl: 0.5 }}>
                          <Box display="flex" alignItems="center" gap={1} mb={1}>
                            <Box sx={{ 
                              width: 6, 
                              height: 6, 
                              borderRadius: '50%', 
                              backgroundColor: '#1976d2' 
                            }} />
                            <Typography variant="body2" color="text.secondary" sx={{ minWidth: 60 }}>
                              Tên:
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {selectedItem.location_name || 'Chưa cập nhật'}
                            </Typography>
                          </Box>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Box sx={{ 
                              width: 6, 
                              height: 6, 
                              borderRadius: '50%', 
                              backgroundColor: '#1976d2' 
                            }} />
                            <Typography variant="body2" color="text.secondary" sx={{ minWidth: 60 }}>
                              Mã:
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {selectedItem.location_code || 'Chưa cập nhật'}
                            </Typography>
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                  
                  <Grid item xs={12} md={6}>
                    <Card sx={{ 
                      height: '100%',
                      borderRadius: 2,
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                      border: '1px solid #e0e0e0'
                    }}>
                      <CardContent sx={{ p: 2.5 }}>
                        <Box display="flex" alignItems="center" gap={1} mb={2}>
                          <PersonIcon sx={{ color: '#1976d2', fontSize: '1.2rem' }} />
                          <Typography variant="h6" sx={{ color: '#1976d2', fontWeight: 600 }}>
                            Thông tin chủ xe
                          </Typography>
                        </Box>
                        <Box sx={{ pl: 0.5 }}>
                          <Box display="flex" alignItems="center" gap={1} mb={1}>
                            <Box sx={{ 
                              width: 6, 
                              height: 6, 
                              borderRadius: '50%', 
                              backgroundColor: '#1976d2' 
                            }} />
                            <Typography variant="body2" color="text.secondary" sx={{ minWidth: 60 }}>
                              Tên:
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {selectedItem.owner_name || 'Chưa cập nhật'}
                            </Typography>
                          </Box>
                          <Box display="flex" alignItems="center" gap={1} mb={1}>
                            <Box sx={{ 
                              width: 6, 
                              height: 6, 
                              borderRadius: '50%', 
                              backgroundColor: '#1976d2' 
                            }} />
                            <Typography variant="body2" color="text.secondary" sx={{ minWidth: 60 }}>
                              SĐT:
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {selectedItem.owner_phone || 'Chưa cập nhật'}
                            </Typography>
                          </Box>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Box sx={{ 
                              width: 6, 
                              height: 6, 
                              borderRadius: '50%', 
                              backgroundColor: '#1976d2' 
                            }} />
                            <Typography variant="body2" color="text.secondary" sx={{ minWidth: 60 }}>
                              Email:
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {selectedItem.contact_email || 'Chưa cập nhật'}
                            </Typography>
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              </Box>

              {/* Time Validity Section */}
              <Box sx={{ px: 3, py: 2 }}>
                <Card sx={{ 
                  borderRadius: 2,
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                  border: '1px solid #e0e0e0'
                }}>
                  <CardContent sx={{ p: 2.5 }}>
                    <Box display="flex" alignItems="center" gap={1} mb={2}>
                      <ScheduleIcon sx={{ color: '#1976d2', fontSize: '1.2rem' }} />
                      <Typography variant="h6" sx={{ color: '#1976d2', fontWeight: 600 }}>
                        Thời gian hiệu lực
                      </Typography>
                    </Box>
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6}>
                        <Box sx={{ 
                          p: 2, 
                          borderRadius: 2, 
                          backgroundColor: '#f0f7ff',
                          border: '1px solid #bbdefb'
                        }}>
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                            Bắt đầu
                          </Typography>
                          <Typography variant="body1" sx={{ fontWeight: 600, color: '#1976d2' }}>
                            {selectedItem.valid_from ? 
                              new Date(selectedItem.valid_from).toLocaleDateString('vi-VN') : 
                              'Không giới hạn'
                            }
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Box sx={{ 
                          p: 2, 
                          borderRadius: 2, 
                          backgroundColor: '#f0f7ff',
                          border: '1px solid #bbdefb'
                        }}>
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                            Kết thúc
                          </Typography>
                          <Typography variant="body1" sx={{ fontWeight: 600, color: '#1976d2' }}>
                            {selectedItem.valid_to ? 
                              new Date(selectedItem.valid_to).toLocaleDateString('vi-VN') : 
                              'Không giới hạn'
                            }
                          </Typography>
                        </Box>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              </Box>

              {/* Image Section */}
              {selectedItem.has_images && (
                <Box sx={{ px: 3, py: 2 }}>
                  <Card sx={{ 
                    borderRadius: 2,
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                    border: '1px solid #e0e0e0'
                  }}>
                    <CardContent sx={{ p: 2.5 }}>
                      <Box display="flex" alignItems="center" gap={1} mb={2}>
                        <ImageIcon sx={{ color: '#1976d2', fontSize: '1.2rem' }} />
                        <Typography variant="h6" sx={{ color: '#1976d2', fontWeight: 600 }}>
                          Hình ảnh biển số
                        </Typography>
                      </Box>
                      <Box sx={{ 
                        display: 'flex', 
                        justifyContent: 'center',
                        p: 2,
                        backgroundColor: '#fafafa',
                        borderRadius: 2,
                        border: '1px dashed #ddd'
                      }}>
                        {selectedItem.plate_image_path ? (
                          <img 
                            src={selectedItem.plate_image_path} 
                            alt="Biển số xe" 
                            style={{ 
                              maxWidth: '100%', 
                              maxHeight: 200, 
                              borderRadius: 8,
                              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                            }} 
                          />
                        ) : (
                          <Box sx={{ 
                            display: 'flex', 
                            flexDirection: 'column', 
                            alignItems: 'center',
                            color: 'text.secondary',
                            py: 3
                          }}>
                            <ImageIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
                            <Typography variant="body2">
                              Không có hình ảnh
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </CardContent>
                  </Card>
                </Box>
              )}

              {/* Description Section */}
              {selectedItem.description && (
                <Box sx={{ px: 3, py: 2 }}>
                  <Card sx={{ 
                    borderRadius: 2,
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                    border: '1px solid #e0e0e0'
                  }}>
                    <CardContent sx={{ p: 2.5 }}>
                      <Box display="flex" alignItems="center" gap={1} mb={2}>
                        <DescriptionIcon sx={{ color: '#1976d2', fontSize: '1.2rem' }} />
                        <Typography variant="h6" sx={{ color: '#1976d2', fontWeight: 600 }}>
                          Ghi chú
                        </Typography>
                      </Box>
                      <Box sx={{ 
                        p: 2, 
                        borderRadius: 2, 
                        backgroundColor: '#f8f9fa',
                        border: '1px solid #e9ecef'
                      }}>
                        <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
                          {selectedItem.description}
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                </Box>
              )}

              {/* Metadata Section */}
              <Box sx={{ px: 3, pb: 2 }}>
                <Card sx={{ 
                  borderRadius: 2,
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                  border: '1px solid #e0e0e0'
                }}>
                  <CardContent sx={{ p: 2.5 }}>
                    <Typography variant="h6" sx={{ color: '#1976d2', fontWeight: 600, mb: 2 }}>
                      Thông tin hệ thống
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <Typography variant="caption" color="text.secondary">
                          Ngày tạo
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {selectedItem.created_at ? 
                            new Date(selectedItem.created_at).toLocaleString('vi-VN') : 
                            'Không rõ'
                          }
                        </Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="caption" color="text.secondary">
                          Cập nhật lần cuối
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {selectedItem.updated_at ? 
                            new Date(selectedItem.updated_at).toLocaleString('vi-VN') : 
                            'Không rõ'
                          }
                        </Typography>
                      </Grid>
                      {selectedItem.created_by_name && (
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary">
                            Tạo bởi
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {selectedItem.created_by_name}
                          </Typography>
                        </Grid>
                      )}
                      {selectedItem.approved_by_name && (
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary">
                            Phê duyệt bởi
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {selectedItem.approved_by_name}
                          </Typography>
                        </Grid>
                      )}
                    </Grid>
                  </CardContent>
                </Card>
              </Box>
            </Box>
          )}
        </DialogContent>
        
        <DialogActions sx={{ 
          p: 3, 
          borderTop: '1px solid #e0e0e0',
          background: '#fafafa',
          gap: 2
        }}>
          <Button 
            onClick={() => setOpenDetailModal(false)}
            variant="outlined"
            sx={{
              borderRadius: 2,
              px: 4,
              py: 1.5,
              textTransform: 'none',
              fontWeight: 600,
              borderColor: '#1976d2',
              color: '#1976d2',
              '&:hover': { 
                backgroundColor: 'rgba(25, 118, 210, 0.04)',
                borderColor: '#1565c0'
              }
            }}
          >
            <FaTimes style={{ marginRight: 8 }} />
            Đóng
          </Button>
          
          {selectedItem && (
            <Button 
              onClick={() => {
                setOpenDetailModal(false);
                handleEdit(selectedItem);
              }}
              variant="contained"
              sx={{
                borderRadius: 2,
                px: 4,
                py: 1.5,
                textTransform: 'none',
                fontWeight: 600,
                backgroundColor: '#1976d2',
                boxShadow: '0 2px 8px rgba(25, 118, 210, 0.3)',
                '&:hover': { 
                  backgroundColor: '#1565c0',
                  boxShadow: '0 4px 12px rgba(25, 118, 210, 0.4)'
                }
              }}
            >
              <FaEdit style={{ marginRight: 8 }} />
              Chỉnh sửa
            </Button>
          )}
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
            Bạn có chắc chắn muốn xóa whitelist với biển số <strong>"{deleteDialog.plateName}"</strong>?
          </Typography>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2">
              • Whitelist này sẽ bị xóa vĩnh viễn<br/>
              • Phương tiện sẽ không được phép ra vào tự động<br/>
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

export default WhiteList;