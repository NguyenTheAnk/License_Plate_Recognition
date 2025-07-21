import React, { useState, useEffect, useRef  } from 'react';
import {
  Box,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Typography,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Tabs,
  Tab,
  Checkbox,
  Breadcrumbs,
  Avatar,
  FormHelperText,
  Snackbar,
  Stack,
  InputAdornment
} from '@mui/material';
import {
  Add as AddIcon,
  CheckCircle as CheckIcon,
  LocationOn as LocationIcon,
  Person as PersonIcon,
  Phone as PhoneIcon,
  DirectionsCar as CarIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
  Home as HomeIcon,
  ExpandMore as ExpandMoreIcon,
  Description as DescriptionIcon,
  Schedule as ScheduleIcon,
  Image as ImageIcon
} from '@mui/icons-material';
import { FaUpload, FaEye, FaEdit, FaTrash, FaPlus,  FaTimes, FaExclamationTriangle,  FaShieldAlt, FaClock, FaSave } from 'react-icons/fa';
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

// Hàm format ngày từ yyyy-MM-dd sang dd/MM/yyyy
const formatDateForDisplay = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('vi-VN');
};

// Hàm format ngày từ dd/MM/yyyy sang yyyy-MM-dd
const formatDateForInput = (dateString) => {
  if (!dateString) return '';
  if (dateString.includes('-') && dateString.length === 10) {
    return dateString;
  }
  if (dateString.includes('/')) {
    const parts = dateString.split('/');
    if (parts.length !== 3) return '';
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2];
    return `${year}-${month}-${day}`;
  }
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
};

// Hàm validate ngày dd/MM/yyyy
const validateDateFormat = (dateString) => {
  if (!dateString) return true;
  const regex = /^\d{2}\/\d{2}\/\d{4}$/;
  if (!regex.test(dateString)) return false;
  const parts = dateString.split('/');
  const day = parseInt(parts[0]);
  const month = parseInt(parts[1]);
  const year = parseInt(parts[2]);
  const date = new Date(year, month - 1, day);
  return date.getDate() === day && date.getMonth() === month - 1 && date.getFullYear() === year;
};

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
  const [showDateInput, setShowDateInput] = useState({
    valid_from: false,
    valid_to: false
  });
  const validFromDateRef = useRef(null);
  const validToDateRef = useRef(null);
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
  const [detectedPlateImage, setDetectedPlateImage] = useState(null);


  const [deleteDialog, setDeleteDialog] = useState({ open: false, itemId: null, plateName: '' });

  // Form validation
  const [formErrors, setFormErrors] = useState({});

  // Thêm state cho Snackbar
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  // Thay đổi các setError, setSuccess, setOcrResult thành setSnackbar
  const showSnackbar = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  // Get token from localStorage
  const getToken = () => {
    return localStorage.getItem('token');
  };



  // Load data
 useEffect(() => {
  const loadData = async () => {
    await loadWhitelist();
    await loadLocations();
    await loadStatistics();
  };
  loadData();
}, [currentPage, itemsPerPage, filters]);

const validateForm = () => {
  const errors = {};
  
  console.log('=== VALIDATE FORM DEBUG ===');
  console.log('formData:', formData);
  console.log('selectedItem:', selectedItem);
  console.log('==========================');
  
  if (!formData.location_id) {
    errors.location_id = 'Vui lòng chọn khu vực';
  }
  if (!formData.plate_number) {
    errors.plate_number = 'Vui lòng nhập biển số xe';
  }
  // SỬA: Chỉ validate email khi có giá trị
  if (formData.contact_email && formData.contact_email.trim() !== '') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.contact_email.trim())) {
      errors.contact_email = 'Định dạng email không hợp lệ';
    }
  }
  // SỬA: Chỉ validate phone khi có giá trị
  if (formData.owner_phone && formData.owner_phone.trim() !== '') {
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
  
  console.log('Validation errors:', errors);
  setFormErrors(errors);
  return Object.keys(errors).length === 0;
};

  // Sửa hàm loadWhitelist để có thể force refresh
const loadWhitelist = async (forceRefresh = false) => {
  setLoading(true);
  try {
      const token = getToken();
      console.log('Loading whitelist with token:', token ? 'Token exists' : 'No token');
      
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('limit', itemsPerPage.toString());
      
      // THÊM: Force refresh bằng cách thêm timestamp
      if (forceRefresh) {
          params.append('_t', Date.now().toString());
      }
      
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
          showSnackbar(response.message || 'Lỗi khi tải danh sách whitelist', 'error');
      }
  } catch (error) {
      console.error('Error loading whitelist:', error);
      const errorMessage = handleErrorResponse(error);
      showSnackbar(errorMessage, 'error');
      
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
      // SỬA: Gọi đúng endpoint lấy khu vực active
      const response = await fetchDataFromAPI('/api/location/active', token);
      if (response.success) {
        setLocations(response.data.locations || response.data || []);
      } else {
        console.error('Failed to load locations:', response.message);
        showSnackbar('Không thể tải danh sách khu vực: ' + response.message, 'error');
      }
    } catch (error) {
      console.error('Error loading locations:', error);
      const errorMessage = handleErrorResponse(error);
      showSnackbar('Không thể tải danh sách khu vực: ' + errorMessage, 'error');
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
        showSnackbar('Vui lòng chọn file ảnh', 'error'); // SỬA
        return;
      }
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        showSnackbar('Kích thước file không được vượt quá 10MB', 'error'); // SỬA
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
        
        if (data.success && data.ocr_text) {
          setFormData(prev => ({ ...prev, plate_number: data.ocr_text }));
          setOcrResult(data.ocr_text);
          showSnackbar(`Nhận diện thành công biển số: ${data.ocr_text}`, 'success'); // THÊM
          
          if (data.detected_plate_image) {
            setDetectedPlateImage(data.detected_plate_image);
          } else {
            setDetectedPlateImage(null);
          }
        } else if (data.message) {
          setOcrResult('');
          setDetectedPlateImage(null);
          showSnackbar('Nhận diện ký tự thất bại: ' + data.message, 'error'); // SỬA
        } else {
          setOcrResult('');
          setDetectedPlateImage(null);
          showSnackbar('Không nhận diện được ký tự biển số từ ảnh.', 'error'); // SỬA
        }
      } catch (err) {
        setOcrResult('');
        if (err.response && err.response.data && err.response.data.message) {
          showSnackbar('Lỗi nhận diện ký tự: ' + err.response.data.message, 'error'); // SỬA
        } else if (err.message) {
          showSnackbar('Lỗi nhận diện ký tự: ' + err.message, 'error'); // SỬA
        } else {
          showSnackbar('Lỗi không xác định khi nhận diện ký tự.', 'error'); // SỬA
        }
      }
    } else {
      setImageFile(null);
      setImagePreview(null);
      setOcrResult('');
      setDetectedPlateImage(null);
    }
  };
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
      
      // THÊM LOGIC XỬ LÝ NGÀY TRƯỚC KHI GỬI:
      const processedFormData = {
          ...formData,
          // Chuyển đổi ngày về định dạng YYYY-MM-DD
          valid_from: formData.valid_from ? 
              (formData.valid_from.includes('T') ? 
                  new Date(formData.valid_from).toISOString().split('T')[0] : 
                  formData.valid_from) : '',
          valid_to: formData.valid_to ? 
              (formData.valid_to.includes('T') ? 
                  new Date(formData.valid_to).toISOString().split('T')[0] : 
                  formData.valid_to) : ''
      };
      
      if (selectedItem) {
          // Update existing item
          
          // SỬA: Kiểm tra có ảnh mới hay không để quyết định dùng FormData hay JSON
          if (imageFile) {
              // Có ảnh mới - dùng FormData
              const formDataToSend = new FormData();
              
              // Append tất cả fields, kể cả empty string
              const whitelistFields = [
                  'location_id',
                  'plate_number',
                  'vehicle_id',
                  'owner_name',
                  'owner_phone',
                  'contact_email',
                  'valid_from',
                  'valid_to',
                  'description',
                  'approval_status'
              ];
              
              whitelistFields.forEach((key) => {
                  const value = processedFormData[key];
                  // SỬA: Chỉ bỏ qua null và undefined, cho phép empty string
                  if (value !== null && value !== undefined) {
                      formDataToSend.append(key, value.toString());
                  }
              });
              
              // Append ảnh mới
              formDataToSend.append('plate_image', imageFile);
              formDataToSend.append('replace_images', 'true');
              
              // Debug log
              console.log('FormData being sent (with image):');
              for (let [key, value] of formDataToSend.entries()) {
                  console.log(key, ':', value);
              }
              
              response = await editData(`/api/whitelist/${selectedItem.id}`, formDataToSend, token);
          } else {
              // THÊM: Không có ảnh mới - dùng JSON
              console.log('JSON being sent (no image):');
              console.log(processedFormData);
              
              response = await editData(`/api/whitelist/${selectedItem.id}`, processedFormData, token);
          }
          
          if (response.success) {
              showSnackbar(`Cập nhật biển số ${formData.plate_number} thành công!`, 'success');
          }
      } else {
          // Create new item
          if (imageFile) {
              const formDataToSend = new FormData();
              Object.entries(processedFormData).forEach(([key, value]) => {
                  if (value !== null && value !== undefined && value !== '') {
                      formDataToSend.append(key, value);
                  }
              });
              formDataToSend.append('image', imageFile);
              response = await uploadImage('/api/whitelist/create', formDataToSend, token);
          } else {
              response = await postData('/api/whitelist/create', processedFormData, token);
          }
          
          if (response.success) {
              showSnackbar(`Đã thêm biển số ${formData.plate_number} vào danh sách trắng thành công!`, 'success');
          }
      }
       
      if (response.success) {
          setOpenModal(false);
          resetForm();
          
          if (response.data?.ocr_text) {
            setOcrResult(response.data.ocr_text);
        }
        if (response.data?.detected_plate_image) {
            setDetectedPlateImage(response.data.detected_plate_image);
        }
        
        await loadWhitelist(true);
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
      const response = await deleteData(`api/whitelist/${id}`, token);

      if (response.success) {
          showSnackbar(response.message || 'Xóa whitelist thành công!', 'success'); // SỬA
          setSelectedItems(prev => prev.filter(itemId => itemId !== id));
          await loadWhitelist(true);
      } else {
          showSnackbar(response.message || 'Lỗi khi xóa whitelist!', 'error'); // SỬA
      }
  } catch (error) {
      console.error('Error deleting whitelist:', error);
      const errorMessage = handleErrorResponse(error);
      showSnackbar(errorMessage, 'error'); // SỬA
  } finally {
      setDeleteDialog({ open: false, itemId: null, plateName: '' });
  }
};

const handleBulkDelete = async () => {
  if (selectedItems.length === 0) {
      showSnackbar('Vui lòng chọn ít nhất một mục để xóa!', 'warning'); // SỬA
      return;
  }

  const confirmMessage = `BẠN CÓ CHẮC CHẮN MUỐN XÓA VĨNH VIỄN ${selectedItems.length} MỤC ĐÃ CHỌN?

⚠️ CẢNH BÁO: 
- Dữ liệu sẽ bị XÓA VĨNH VIỄN khỏi hệ thống
- Tất cả ảnh và file liên quan sẽ bị xóa
- HÀNH ĐỘNG NÀY KHÔNG THỂ HOÀN TÁC

Nhấn OK để tiếp tục xóa vĩnh viễn, Cancel để hủy.`;

  if (window.confirm(confirmMessage)) {
      try {
          const token = getToken();
          
          const response = await deleteData('api/whitelist/bulk-delete', {
              ids: selectedItems
          }, token);

          if (response && response.success) {
              showSnackbar(response.message || `Xóa vĩnh viễn thành công ${selectedItems.length} mục!`, 'success'); // SỬA
              setSelectedItems([]);
              await loadWhitelist(true);
          } else {
              showSnackbar(response?.message || 'Lỗi khi xóa nhiều mục!', 'error'); // SỬA
          }
      } catch (error) {
          console.error('Error bulk deleting:', error);
          
          let errorMessage = 'Lỗi khi xóa nhiều mục!';
          
          if (error.response) {
              errorMessage = error.response.data?.message || `Lỗi ${error.response.status}: ${error.response.statusText}`;
          } else if (error.message) {
              errorMessage = error.message;
          }
          
          showSnackbar(errorMessage, 'error'); // SỬA
      }
  }
};
useEffect(() => {
  const handleClickOutside = (event) => {
    // Kiểm tra nếu click bên ngoài date input overlay
    const target = event.target;
    const isDateInput = target.closest('[data-date-overlay]');
    const isCalendarIcon = target.closest('button[title="Chọn ngày"]');
    
    if (!isDateInput && !isCalendarIcon) {
      setShowDateInput({ valid_from: false, valid_to: false });
    }
  };

  if (showDateInput.valid_from || showDateInput.valid_to) {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }
}, [showDateInput]);
// Sửa hàm handleEdit
const handleEdit = (item) => {
  setSelectedItem(item);
  setFormData({
    location_id: item.location_id || '',
    plate_number: item.plate_number || '', // Đảm bảo luôn có giá trị
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
  setImageFile(null);
  setImagePreview(null);
  setOcrResult('');
  if (item.detected_plate_image) {
    setDetectedPlateImage(item.detected_plate_image);
  } else {
    setDetectedPlateImage(null);
  }
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
        showSnackbar(response.message || 'Lỗi khi tải chi tiết whitelist', 'error'); // SỬA
      }
    } catch (error) {
      console.error('Error viewing whitelist:', error);
      const errorMessage = handleErrorResponse(error);
      showSnackbar(errorMessage, 'error'); // SỬA
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
    setDetectedPlateImage(null); // Đảm bảo reset detected image
    setFormErrors({});
    setShowDateInput({ valid_from: false, valid_to: false });
  };
const handleDateIconClickBackup = (field) => {
  // Tạo date input tạm thời và trigger click
  const input = document.createElement('input');
  input.type = 'date';
  input.value = formData[field] || '';
  
  // Style để ẩn input
  input.style.position = 'absolute';
  input.style.top = '-9999px';
  input.style.left = '-9999px';
  input.style.opacity = '0';
  input.style.pointerEvents = 'none';
  
  // Thêm vào DOM
  document.body.appendChild(input);
  
  // Xử lý khi chọn ngày
  input.addEventListener('change', (e) => {
    handleDateChange(field, e.target.value);
    document.body.removeChild(input);
  });
  
  // Xử lý khi hủy (không chọn gì)
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (document.body.contains(input)) {
        document.body.removeChild(input);
      }
    }, 100);
  });
  
  // Focus và trigger date picker
  input.focus();
  input.click();
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

  const handleDateChange = (field, value) => {
  setFormData(prev => ({ ...prev, [field]: value }));
};

  const handleItemsPerPageChange = (event) => {
    setItemsPerPage(parseInt(event.target.value));
    setCurrentPage(1);
  };

  // Date picker handlers
  const handleDateIconClick = (field) => {
  if (field === 'valid_from' && validFromDateRef.current) {
    validFromDateRef.current.showPicker(); // Mở date picker trực tiếp
  } else if (field === 'valid_to' && validToDateRef.current) {
    validToDateRef.current.showPicker(); // Mở date picker trực tiếp
  }
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
      <Snackbar
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        sx={{
          position: 'fixed',
          top: 24,
          right: 24,
          zIndex: 9999,
          '& .MuiSnackbar-root': {
            position: 'fixed !important'
          }
        }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ 
            width: '100%',
            minWidth: 300,
            maxWidth: 500,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
            borderRadius: 2,
            '& .MuiAlert-message': {
              fontSize: '0.95rem',
              fontWeight: 500
            }
          }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>

      

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
                      value={filters.plate_number} // SỬA: Sử dụng filters thay vì formData
                      onChange={(e) => handleFilterChange('plate_number', e.target.value)} // SỬA: Sử dụng handleFilterChange
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
                      <TableCell>Ảnh biển số</TableCell>
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
                        <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
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
                        <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
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
                               
                              </Box>
                            </Box>
                          </TableCell>
<TableCell>
  {item.detected_plate_image ? (
    <Box
      component="img"
      src={`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${item.detected_plate_image}`}
      alt="Ảnh biển số đã phát hiện"
      sx={{
        width: 80,
        height: 50,
        objectFit: 'cover',
        borderRadius: 1,
        border: '2px solid #1976d2',
        cursor: 'pointer',
        transition: 'transform 0.2s ease',
        '&:hover': {
          transform: 'scale(1.1)',
          boxShadow: '0 4px 12px rgba(25, 118, 210, 0.3)'
        }
      }}
      onClick={() => {
        window.open(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${item.detected_plate_image}`, '_blank');
      }}
      title="Ảnh biển số đã phát hiện (click để xem lớn)"
    />
  ) : item.plate_image_path ? (
    <Box
      component="img"
      src={`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${item.plate_image_path}`}
      alt="Ảnh gốc"
      sx={{
        width: 80,
        height: 50,
        objectFit: 'cover',
        borderRadius: 1,
        border: '1px solid #e0e0e0',
        cursor: 'pointer',
        transition: 'transform 0.2s ease',
        '&:hover': {
          transform: 'scale(1.1)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        }
      }}
      onClick={() => {
        window.open(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${item.plate_image_path}`, '_blank');
      }}
      title="Ảnh gốc (click để xem lớn)"
    />
  ) : (
    <Box
      sx={{
        width: 80,
        height: 50,
        backgroundColor: '#f5f5f5',
        borderRadius: 1,
        border: '1px solid #e0e0e0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <ImageIcon sx={{ fontSize: 20, color: '#ccc' }} />
    </Box>
  )}
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
                                      <CheckIcon sx={{ fontSize: 48, color: '#4caf50', mb: 2 }} />
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
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="lg" fullWidth>
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
              {/* Left: Upload & Preview */}
              <Grid item xs={12} md={6}>
                <Card sx={{ p: 2, borderRadius: 2, boxShadow: 2, mb: 2 }}>
                  <Button
                    variant="outlined"
                    component="label"
                    fullWidth
                    startIcon={<FaUpload />}
                    sx={{ mb: 2, borderRadius: 2, py: 1.5, textTransform: 'none', fontWeight: 600 }}
                  >
                    {imageFile ? 'Đổi ảnh biển số' : 'Tải ảnh biển số xe'}
                    <input type="file" accept="image/*" hidden onChange={handleImageChange} />
                  </Button>
                  {imagePreview && (
                    <Box mt={1} display="flex" flexDirection="column" alignItems="center">
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: '#1976d2' }}>
                        Ảnh mới upload:
                      </Typography>
                      <img 
                        src={imagePreview} 
                        alt="preview" 
                        style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 8, border: '1px solid #eee' }} 
                      />
                      <Button size="small" color="error" onClick={() => { setImageFile(null); setImagePreview(null); setOcrResult(''); setDetectedPlateImage(null); }} sx={{ mt: 1 }}>
                        Xóa ảnh mới
                      </Button>
                    </Box>
                  )}
                  {ocrResult && imagePreview && (
                    <Box mt={2} p={2} sx={{ backgroundColor: '#f8f9fa', borderRadius: 2, border: '1px solid #e9ecef' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: '#1976d2' }}>
                        Kết quả nhận diện biển số:
                      </Typography>
                      <Typography variant="body2" sx={{ backgroundColor: '#e3f2fd', p: 1, borderRadius: 1, fontWeight: 600, color: '#1565c0' }}>
                        {ocrResult}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#666', mt: 1, display: 'block' }}>
                        * Hệ thống đã được cải thiện để nhận diện dấu chấm (.) trong biển số
                      </Typography>
                    </Box>
                  )}
                  {detectedPlateImage && imagePreview && (
                    <Box mt={2} p={2} sx={{ backgroundColor: '#f8f9fa', borderRadius: 2, border: '1px solid #e9ecef' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: '#1976d2' }}>
                        Ảnh biển số đã phát hiện (mới):
                      </Typography>
                      <Box
                        component="img"
                        src={`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${detectedPlateImage}`}
                        alt="Ảnh biển số phát hiện mới"
                        sx={{ maxWidth: '100%', maxHeight: 120, borderRadius: 2, border: '2px solid #1976d2', cursor: 'pointer', transition: 'transform 0.2s', '&:hover': { transform: 'scale(1.05)' } }}
                        onClick={() => { window.open(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${detectedPlateImage}`, '_blank'); }}
                      />
                    </Box>
                  )}
                </Card>
              </Grid>
              {/* Right: Form Fields */}
              <Grid item xs={12} md={6}>
                <Stack spacing={2}>
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
                      ) : (
                        locations.map(location => (
                          <MenuItem key={location.id} value={location.id}>
                            <LocationIcon sx={{ mr: 1, fontSize: 16 }} />
                            {location.name}
                          </MenuItem>
                        ))
                      )}
                    </Select>
                    {formErrors.location_id && (
                      <FormHelperText error>{formErrors.location_id}</FormHelperText>
                    )}
                  </FormControl>
                  <TextField
                    fullWidth
                    required
                    label="Biển số xe"
                    value={formData.plate_number}
                    disabled
                    error={!!formErrors.plate_number}
                    helperText={ocrResult ? "Đã nhận diện từ OCR" : "Trường này sẽ tự động điền từ ảnh biển số (OCR)"}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />
                  <TextField
                    fullWidth
                    label="Tên chủ xe"
                    placeholder="Nhập tên chủ xe"
                    value={formData.owner_name}
                    onChange={(e) => setFormData({...formData, owner_name: e.target.value})}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />
                  <TextField
                    fullWidth
                    label="Số điện thoại"
                    placeholder="Nhập số điện thoại"
                    value={formData.owner_phone}
                    onChange={(e) => setFormData({...formData, owner_phone: e.target.value})}
                    error={!!formErrors.owner_phone}
                    helperText={formErrors.owner_phone}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />
                  <TextField
                    fullWidth
                    label="Email liên hệ"
                    placeholder="Nhập email liên hệ"
                    value={formData.contact_email}
                    onChange={(e) => setFormData({...formData, contact_email: e.target.value})}
                    error={!!formErrors.contact_email}
                    helperText={formErrors.contact_email}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />
                  <Box display="flex" gap={2}>
                    <Box position="relative" flex={1}>
                      <TextField
                        fullWidth
                        label="Có hiệu lực từ"
                        placeholder="dd/MM/yyyy"
                        value={formData.valid_from ? formatDateForDisplay(formData.valid_from) : ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '' || validateDateFormat(value)) {
                            setFormErrors(prev => ({ ...prev, valid_from: undefined }));
                            setFormData({ ...formData, valid_from: value });
                          } else {
                            setFormErrors(prev => ({ ...prev, valid_from: 'Định dạng ngày phải là dd/MM/yyyy' }));
                          }
                        }}
                        error={!!formErrors.valid_from}
                        helperText={formErrors.valid_from}
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton
                                onClick={() => handleDateIconClick('valid_from')}
                                sx={{ 
                                  color: '#1976d2',
                                  '&:hover': { 
                                    backgroundColor: 'rgba(25, 118, 210, 0.1)',
                                    transform: 'scale(1.1)'
                                  },
                                  transition: 'all 0.2s ease'
                                }}
                                title="Chọn ngày"
                              >
                                <ScheduleIcon />
                              </IconButton>
                            </InputAdornment>
                          ),
                        }}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                      />
                      <input
                        ref={validFromDateRef}
                        type="date"
                        onChange={(e) => handleDateChange('valid_from', e.target.value)}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          opacity: 0,
                          pointerEvents: 'none',
                          zIndex: -1
                        }}
                      />
                    </Box>
                    <Box position="relative" flex={1}>
                      <TextField
                        fullWidth
                        label="Có hiệu lực đến"
                        placeholder="dd/MM/yyyy"
                        value={formData.valid_to ? formatDateForDisplay(formData.valid_to) : ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '' || validateDateFormat(value)) {
                            setFormErrors(prev => ({ ...prev, valid_to: undefined }));
                            setFormData({ ...formData, valid_to: value });
                          } else {
                            setFormErrors(prev => ({ ...prev, valid_to: 'Định dạng ngày phải là dd/MM/yyyy' }));
                          }
                        }}
                        error={!!formErrors.valid_to}
                        helperText={formErrors.valid_to}
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton
                                onClick={() => handleDateIconClick('valid_to')}
                                sx={{ 
                                  color: '#1976d2',
                                  '&:hover': { 
                                    backgroundColor: 'rgba(25, 118, 210, 0.1)',
                                    transform: 'scale(1.1)'
                                  },
                                  transition: 'all 0.2s ease'
                                }}
                                title="Chọn ngày"
                              >
                                <ScheduleIcon />
                              </IconButton>
                            </InputAdornment>
                          ),
                        }}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                      />
                      <input
                        ref={validToDateRef}
                        type="date"
                        onChange={(e) => handleDateChange('valid_to', e.target.value)}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          opacity: 0,
                          pointerEvents: 'none',
                          zIndex: -1
                        }}
                      />
                    </Box>
                  </Box>
                  <TextField
                    fullWidth
                    label="Ghi chú"
                    multiline
                    rows={3}
                    placeholder="Nhập ghi chú..."
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />
                </Stack>
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ p: 3, borderTop: '1px solid #e0e0e0', background: '#fafafa' }}>
            <Button onClick={() => setOpenModal(false)} sx={{ borderRadius: 2, px: 3, py: 1.5, textTransform: 'none', fontWeight: 600, backgroundColor: '#f5f5f5', color: '#222', '&:hover': { backgroundColor: '#ededed' } }}>
              <FaTimes style={{ marginRight: 8 }} />
              Hủy
            </Button>
            <Button type="submit" variant="contained" disabled={loading} sx={{ borderRadius: 2, px: 3, py: 1.5, textTransform: 'none', fontWeight: 600, backgroundColor: loading ? '#ccc' : '#1976d2', '&:hover': { backgroundColor: loading ? '#ccc' : '#1565c0' } }}>
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
    {/* Cột thông tin bên trái */}
    <Grid item xs={12} md={8}>
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
    </Grid>
    
    {/* Cột ảnh biển số bên phải - MỚI THÊM */}
    <Grid item xs={12} md={4}>
      <Card sx={{ 
        height: '100%',
        borderRadius: 2,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
        border: '1px solid #e0e0e0'
      }}>
        <CardContent sx={{ p: 2.5 }}>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <ImageIcon sx={{ color: '#1976d2', fontSize: '1.2rem' }} />
            <Typography variant="h6" sx={{ color: '#1976d2', fontWeight: 600 }}>
              Ảnh biển số
            </Typography>
          </Box>
          
          {selectedItem.detected_plate_image ? (
            <Box display="flex" flexDirection="column" alignItems="center">
              <Box
                component="img"
                src={`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${selectedItem.detected_plate_image}`}
                alt="Ảnh biển số đã phát hiện"
                sx={{
                  width: '100%',
                  maxWidth: 200,
                  height: 'auto',
                  maxHeight: 120,
                  objectFit: 'cover',
                  borderRadius: 2,
                  border: '2px solid #1976d2',
                  cursor: 'pointer',
                  transition: 'transform 0.2s ease',
                  '&:hover': {
                    transform: 'scale(1.05)',
                    boxShadow: '0 4px 12px rgba(25, 118, 210, 0.3)'
                  }
                }}
                onClick={() => {
                  window.open(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${selectedItem.detected_plate_image}`, '_blank');
                }}
              />
              <Typography variant="caption" sx={{ color: '#666', mt: 1, textAlign: 'center' }}>
                Ảnh biển số đã phát hiện
                <br />
                (Click để xem lớn)
              </Typography>
            </Box>
          ) : selectedItem.plate_image_path ? (
            <Box display="flex" flexDirection="column" alignItems="center">
              <Box
                component="img"
                src={`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${selectedItem.plate_image_path}`}
                alt="Ảnh biển số gốc"
                sx={{
                  width: '100%',
                  maxWidth: 200,
                  height: 'auto',
                  maxHeight: 120,
                  objectFit: 'cover',
                  borderRadius: 2,
                  border: '1px solid #e0e0e0',
                  cursor: 'pointer',
                  transition: 'transform 0.2s ease',
                  '&:hover': {
                    transform: 'scale(1.05)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                  }
                }}
                onClick={() => {
                  window.open(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${selectedItem.plate_image_path}`, '_blank');
                }}
              />
              <Typography variant="caption" sx={{ color: '#666', mt: 1, textAlign: 'center' }}>
                Ảnh biển số gốc
                <br />
                (Click để xem lớn)
              </Typography>
            </Box>
          ) : (
            <Box 
              display="flex" 
              flexDirection="column" 
              alignItems="center" 
              justifyContent="center" 
              sx={{ 
                height: 150,
                backgroundColor: '#f5f5f5',
                borderRadius: 2,
                border: '1px solid #e0e0e0'
              }}
            >
              <ImageIcon sx={{ fontSize: 40, color: '#ccc', mb: 1 }} />
              <Typography variant="caption" color="text.secondary" textAlign="center">
                Không có ảnh
              </Typography>
            </Box>
          )}
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
            <BiSolidTrashAlt style={{ marginRight: 12, fontSize: '1.5rem', color: '#f44336' }} />
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#f44336' }}>
              Xác nhận xóa vĩnh viễn
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Typography variant="body1" sx={{ mb: 2, color: '#222' }}>
            Bạn có chắc chắn muốn <strong>XÓA VĨNH VIỄN</strong> whitelist với biển số <strong>"{deleteDialog.plateName}"</strong>?
          </Typography>
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="body2">
              <strong>CẢNH BÁO:</strong><br/>
              • Whitelist này sẽ bị <strong>XÓA VĨNH VIỄN</strong> khỏi hệ thống<br/>
              • Tất cả ảnh và dữ liệu liên quan sẽ bị xóa<br/>
              • Phương tiện sẽ không được phép ra vào tự động<br/>
              • <strong>Hành động này KHÔNG THỂ HOÀN TÁC</strong>
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
              backgroundColor: '#d32f2f',
              color: 'white',
              '&:hover': { backgroundColor: '#b71c1c' }
            }}
          >
            <FaTrash style={{ marginRight: 8 }} />
            Xóa vĩnh viễn
          </Button>
        </DialogActions>
      </Dialog>

      
    </Box>
  );
};

export default WhiteList;