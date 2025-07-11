import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions, 
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, 
  IconButton, Typography, Grid, FormControl, InputLabel, Select, MenuItem, 
  Chip, Alert, CircularProgress, Card, CardContent, Tooltip, Tabs, Tab, 
  Checkbox, Breadcrumbs,  FormHelperText, InputAdornment, Snackbar, 
  Pagination, Divider, Paper, Stack
} from '@mui/material';
import {
   CalendarToday as CalendarIcon, 
  LocationOn as LocationIcon, Person as PersonIcon, Phone as PhoneIcon, 
  DirectionsCar as CarIcon,  
  Home as HomeIcon, ExpandMore as ExpandMoreIcon, Description as DescriptionIcon, 
   Image as ImageIcon, Warning as WarningIcon, 
  Block as BlockIcon, Visibility as VisibilityIcon, Edit as EditIcon, 
  Delete as DeleteIcon, PhotoCamera as PhotoCameraIcon, Close as CloseIcon,
  Download as DownloadIcon
} from '@mui/icons-material';
import { FaTrash, FaPlus, FaExclamationTriangle, FaShieldAlt, FaClock, FaSave } from 'react-icons/fa';
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
const parseDateComponents = (dateString) => {
  if (!dateString) return null;
  
  let year, month, day;
  
  if (dateString.includes('T')) {
    // ISO string - lấy phần date
    const datePart = dateString.split('T')[0];
    [year, month, day] = datePart.split('-').map(num => parseInt(num));
  } else if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
    // YYYY-MM-DD format
    [year, month, day] = dateString.split('-').map(num => parseInt(num));
  } else if (dateString.includes('/')) {
    // dd/MM/yyyy format
    const parts = dateString.split('/');
    day = parseInt(parts[0]);
    month = parseInt(parts[1]);
    year = parseInt(parts[2]);
  } else {
    return null;
  }
  
  return { year, month, day };
};
const formatDateForDisplay = (dateString) => {
  if (!dateString) return '';
  
  console.log('[FRONTEND] formatDateForDisplay input:', dateString);
  
  // Nếu đã là dd/MM/yyyy thì return luôn
  if (dateString.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    console.log('[FRONTEND] Already dd/MM/yyyy:', dateString);
    return dateString;
  }
  
  const components = parseDateComponents(dateString);
  if (!components) {
    console.error('[FRONTEND] Cannot parse date:', dateString);
    return '';
  }
  
  const { year, month, day } = components;
  const result = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
  console.log('[FRONTEND] formatDateForDisplay result:', result);
  return result;
};

const formatDateForInput = (dateString) => {
  if (!dateString) return '';
  
  console.log('[FRONTEND] formatDateForInput input:', dateString);
  
  // Nếu đã là YYYY-MM-DD thì return luôn
  if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
    console.log('[FRONTEND] Already YYYY-MM-DD:', dateString);
    return dateString;
  }
  
  const components = parseDateComponents(dateString);
  if (!components) {
    console.error('[FRONTEND] Cannot parse date for input:', dateString);
    return '';
  }
  
  const { year, month, day } = components;
  const result = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  console.log('[FRONTEND] formatDateForInput result:', result);
  return result;
};

const validateDateFormat = (dateString) => {
  if (!dateString) return true;
  
  const regex = /^\d{2}\/\d{2}\/\d{4}$/;
  if (!regex.test(dateString)) return false;
  
  const parts = dateString.split('/');
  const day = parseInt(parts[0]);
  const month = parseInt(parts[1]);
  const year = parseInt(parts[2]);
  
  // Validate ranges
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  
  // Create date object to validate the actual date
  const date = new Date(year, month - 1, day);
  return date.getDate() === day && 
         date.getMonth() === month - 1 && 
         date.getFullYear() === year;
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
      '&:hover, &:focus': { backgroundColor: 'grey.200' },
      '&:active': { boxShadow: 1, backgroundColor: 'grey.300' },
      cursor: 'pointer'
    }}
    {...props}
  />
);

// Image Preview Dialog Component
const ImagePreviewDialog = ({ open, onClose, src, title = "Xem ảnh" }) => (
  <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
    <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Typography variant="h6">{title}</Typography>
      <Box>
        <IconButton 
          onClick={() => window.open(src, '_blank')} 
          title="Tải về"
          sx={{ mr: 1 }}
        >
          <DownloadIcon />
        </IconButton>
        <IconButton onClick={onClose} title="Đóng">
          <CloseIcon />
        </IconButton>
      </Box>
    </DialogTitle>
    <DialogContent sx={{ p: 2, textAlign: 'center' }}>
      {src ? (
        <img 
          src={src} 
          alt={title}
          style={{ 
            maxWidth: '100%', 
            maxHeight: '70vh', 
            objectFit: 'contain',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          }} 
        />
      ) : (
        <Typography color="text.secondary">Không có ảnh</Typography>
      )}
    </DialogContent>
  </Dialog>
);

const PlateImageCell = ({ item, onImageClick }) => {
  // Generate unique cache buster based on item's updated timestamp
  const getCacheBuster = () => {
    // Use updated_at timestamp if available, otherwise use current time
    const timestamp = item.updated_at ? new Date(item.updated_at).getTime() : Date.now();
    return `t=${timestamp}&r=${Math.random()}`;
  };

  const getImageUrl = (imagePath) => {
    if (!imagePath) return null;
    const baseUrl = `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${imagePath}`;
    // Add cache buster to prevent caching issues
    return `${baseUrl}?${getCacheBuster()}`;
  };

   return (
    <TableCell sx={{ width: 120 }}>
      {item.detected_plate_image ? (
        <Box
          component="img"
          src={getImageUrl(item.detected_plate_image)}
          alt="Ảnh biển số đã phát hiện"
          sx={{
            width: 80,
            height: 50,
            objectFit: 'cover',
            borderRadius: 1,
            border: '2px solid #d32f2f',
            cursor: 'pointer',
            transition: 'transform 0.2s ease',
            '&:hover': {
              transform: 'scale(1.1)',
              boxShadow: '0 4px 12px rgba(211, 47, 47, 0.3)'
            }
          }}
          onClick={() => {
            window.open(getImageUrl(item.detected_plate_image), '_blank');
          }}
          title="Ảnh biển số đã phát hiện (click để xem lớn)"
          // Add key prop to force re-render when image changes
          key={`detected-${item.id}-${getCacheBuster()}`}
        />
      ) : item.plate_image_path ? (
        <Box
          component="img"
          src={getImageUrl(item.plate_image_path)}
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
            window.open(getImageUrl(item.plate_image_path), '_blank');
          }}
          title="Ảnh gốc (click để xem lớn)"
          // Add key prop to force re-render when image changes
          key={`original-${item.id}-${getCacheBuster()}`}
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
  );
};
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
    location_id: '', plate_number: '', vehicle_id: '', violation_type: 'unauthorized', 
    reason: '', severity: 'medium', owner_name: '', owner_phone: '', 
    valid_from: '', valid_to: '', description: ''
  });

  // Error handling
  const [formErrors, setFormErrors] = useState({});
  const [deleteDialog, setDeleteDialog] = useState({ open: false, itemId: null, plateName: '' });
  
  // Snackbar
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const showSnackbar = (message, severity = 'info') => setSnackbar({ open: true, message, severity });

  // Image states
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [ocrResult, setOcrResult] = useState('');
  const [detectedPlateImage, setDetectedPlateImage] = useState(null);
  const [detailImage, setDetailImage] = useState(null);
  const [detailDetectedPlateImage, setDetailDetectedPlateImage] = useState(null);

  // Image preview dialog
  const [imagePreviewDialog, setImagePreviewDialog] = useState({ open: false, src: '', title: '' });

  // Get token from localStorage
  const getToken = () => localStorage.getItem('token') || 'mock-token';

  // Auto close alerts
  useEffect(() => {
    if (snackbar.open) {
      const timer = setTimeout(() => setSnackbar({ ...snackbar, open: false }), 5000);
      return () => clearTimeout(timer);
    }
  }, [snackbar]);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      await loadBlacklist();
      await loadLocations();
      await loadStatistics();
    };
    loadData();
  }, [currentPage, itemsPerPage, filters]);

const validateForm = () => {
  const errors = {};
  
  if (!formData.location_id) {
    errors.location_id = 'Vui lòng chọn khu vực';
  }
  
  if (!formData.plate_number && !ocrResult) {
    errors.plate_number = 'Vui lòng upload ảnh biển số để nhận diện tự động hoặc nhập biển số';
  }
  
  // SỬA: Validate reason với độ dài tối thiểu
  if (!formData.reason || formData.reason.trim() === '') {
    errors.reason = 'Vui lòng nhập lý do cấm';
  } else if (formData.reason.trim().length < 10) {
    errors.reason = 'Lý do cấm phải có ít nhất 10 ký tự';
  } else if (formData.reason.trim().length > 500) {
    errors.reason = 'Lý do cấm không được vượt quá 500 ký tự';
  }
  
  if (!formData.violation_type) {
    errors.violation_type = 'Vui lòng chọn loại vi phạm';
  }
  
  if (!formData.severity) {
    errors.severity = 'Vui lòng chọn mức độ';
  }
  
  // SỬA: Validate vehicle_id nếu có
  if (formData.vehicle_id && formData.vehicle_id !== '') {
    const vehicleIdNum = parseInt(formData.vehicle_id);
    if (isNaN(vehicleIdNum) || vehicleIdNum <= 0) {
      errors.vehicle_id = 'ID phương tiện phải là số nguyên dương';
    }
  }
  
  if (!selectedItem && !imageFile && !ocrResult) {
    errors.image = 'Vui lòng upload ảnh biển số xe';
  }
  
  if (formData.owner_phone && formData.owner_phone.trim() !== '') {
    const phoneRegex = /^(\+84|84|0)(3|5|7|8|9)[0-9]{8}$/;
    if (!phoneRegex.test(formData.owner_phone.replace(/\s+/g, ''))) {
      errors.owner_phone = 'Định dạng số điện thoại không hợp lệ';
    }
  }
  
  if (formData.valid_from && formData.valid_to) {
    // So sánh ngày thủ công, không dùng new Date để tránh lệch timezone
    const parseDMY = (str) => {
      if (str.includes('/')) {
        const [d, m, y] = str.split('/').map(Number);
        return { y, m, d };
      } else if (str.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [y, m, d] = str.split('-').map(Number);
        return { y, m, d };
      }
      return null;
    };
    const from = parseDMY(formData.valid_from);
    const to = parseDMY(formData.valid_to);
    if (from && to) {
      // So sánh từng thành phần
      if (
        from.y > to.y ||
        (from.y === to.y && from.m > to.m) ||
        (from.y === to.y && from.m === to.m && from.d > to.d)
      ) {
        errors.valid_to = 'Ngày kết thúc phải sau ngày bắt đầu';
      }
    }
  }
  
  setFormErrors(errors);
  return Object.keys(errors).length === 0;
};

const loadBlacklist = async (forceRefresh = false) => {
  setLoading(true);
  try {
    const token = getToken();
    console.log('Loading blacklist with token:', token ? 'Token exists' : 'No token');
    
    const params = new URLSearchParams();
    params.append('page', currentPage.toString());
    params.append('limit', itemsPerPage.toString());
    
    // Force refresh with cache busting
    if (forceRefresh) {
      params.append('_t', Date.now().toString());
      params.append('cache_bust', Math.random().toString());
    }
    
    // Add filters to params
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined) {
        params.append(key, value);
      }
    });

    // Use fetch instead of fetchDataFromAPI to have more control
    const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/blacklist?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        // Add cache control headers
        'Cache-Control': forceRefresh ? 'no-cache, no-store, must-revalidate' : 'default',
        'Pragma': forceRefresh ? 'no-cache' : 'default',
        'Expires': forceRefresh ? '0' : 'default'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.success) {
      console.log('Blacklist loaded:', data.data); // Debug log
      setBlacklist(data.data || []);
      if (data.pagination) {
        setTotalPages(data.pagination.total_pages || 1);
        setTotalItems(data.pagination.total || 0);
      }
    } else {
      showSnackbar(data.message || 'Lỗi khi tải danh sách blacklist', 'error');
    }
  } catch (error) {
    console.error('Error loading blacklist:', error);
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
      const response = await fetchDataFromAPI('/api/location?limit=1000&is_active=1', token);
      
      if (response.success) {
        setLocations(response.data.locations || []);
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
      const response = await fetchDataFromAPI('/api/blacklist/statistics', token);
      
      if (response.success) {
        setStatistics(response.data?.general_statistics || {});
      }
    } catch (error) {
      console.error('Error loading statistics:', error);
    }
  };

  const handleImageChange = async (e) => {
  const file = e.target.files[0];
  console.log('=== IMAGE CHANGE DEBUG ===');
  console.log('Selected file:', file);
  
  if (file) {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      showSnackbar('Vui lòng chọn file ảnh', 'error');
      return;
    }
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      showSnackbar('Kích thước file không được vượt quá 10MB', 'error');
      return;
    }
    
    console.log('Setting imageFile to:', file);
    setImageFile(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (ev) => {
      console.log('Setting imagePreview');
      setImagePreview(ev.target.result);
    };
    reader.readAsDataURL(file);

    // OCR processing...
    try {
      const token = getToken();
      const formDataToSend = new FormData();
      formDataToSend.append('image', file);
      const data = await uploadImage('/api/blacklist/ocr-preview', formDataToSend, token);
      
      if (data.success && data.ocr_text) {
        setFormData(prev => ({ ...prev, plate_number: data.ocr_text }));
        setOcrResult(data.ocr_text);
        showSnackbar(`Nhận diện thành công biển số: ${data.ocr_text}`, 'success');
        
        if (data.detected_plate_image) {
          setDetectedPlateImage(data.detected_plate_image);
        } else {
          setDetectedPlateImage(null);
        }
      } else {
        setOcrResult('');
        setDetectedPlateImage(null);
        showSnackbar('Nhận diện ký tự thất bại: ' + (data.message || 'Không xác định'), 'error');
      }
    } catch (err) {
      console.error('OCR Error:', err);
      setOcrResult('');
      setDetectedPlateImage(null);
      showSnackbar('Lỗi nhận diện ký tự: ' + (err.message || 'Không xác định'), 'error');
    }
  } else {
    console.log('No file selected, clearing image states');
    setImageFile(null);
    setImagePreview(null);
    setOcrResult('');
    setDetectedPlateImage(null);
  }
  console.log('========================');
};

  const handleImagePreviewClick = (src, title) => {
    setImagePreviewDialog({ open: true, src, title });
  };

  // Helper function to format dates consistently
const formatDate = formatDateForDisplay;

const handleSubmit = async (e) => {
  e.preventDefault();
  
  console.log('=== SUBMIT DEBUG ===');
  console.log('Original formData:', formData);
  console.log('selectedItem:', selectedItem);
  console.log('imageFile:', imageFile);
  console.log('imageFile details:', {
    name: imageFile?.name,
    size: imageFile?.size,
    type: imageFile?.type,
    lastModified: imageFile?.lastModified
  });
  console.log('ocrResult:', ocrResult);
  console.log('==================');

  if (!validateForm()) {
    showSnackbar('Vui lòng kiểm tra lại thông tin nhập vào', 'error');
    return;
  }

  setLoading(true);
  
  try {
    const token = getToken();
    let response;
    
    const processedFormData = {
  ...formData,
  // SỬA: Xử lý date conversion với debug logging
  valid_from: formData.valid_from ? 
    (() => {
      console.log('[DEBUG] Processing valid_from:', formData.valid_from);
      if (formData.valid_from.includes('/')) {
        // Convert dd/MM/yyyy to yyyy-MM-dd
        const [d, m, y] = formData.valid_from.split('/');
        const result = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        console.log('[DEBUG] valid_from converted:', formData.valid_from, '->', result);
        return result;
      } else {
        console.log('[DEBUG] valid_from already formatted:', formData.valid_from);
        return formData.valid_from;
      }
    })() : null,
  valid_to: formData.valid_to ? 
    (() => {
      console.log('[DEBUG] Processing valid_to:', formData.valid_to);
      if (formData.valid_to.includes('/')) {
        // Convert dd/MM/yyyy to yyyy-MM-dd
        const [d, m, y] = formData.valid_to.split('/');
        const result = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        console.log('[DEBUG] valid_to converted:', formData.valid_to, '->', result);
        return result;
      } else {
        console.log('[DEBUG] valid_to already formatted:', formData.valid_to);
        return formData.valid_to;
      }
    })() : null,
  
  plate_number: formData.plate_number || ocrResult || '',
  violation_type: formData.violation_type || 'unauthorized',
  severity: formData.severity || 'medium',
  reason: formData.reason || '',
  
  vehicle_id: formData.vehicle_id && formData.vehicle_id !== '' ? 
    parseInt(formData.vehicle_id) : null,
  
  owner_name: formData.owner_name || null,
  owner_phone: formData.owner_phone || null,
  description: formData.description || null
};

console.log('[DEBUG] Final processed dates for API:');
console.log('- valid_from:', processedFormData.valid_from);
console.log('- valid_to:', processedFormData.valid_to);

    // Remove null vehicle_id
    if (processedFormData.vehicle_id === null) {
      delete processedFormData.vehicle_id;
    }

    console.log('Processed form data:', processedFormData);

    if (selectedItem) {
      // Update existing item
      if (imageFile) {
        console.log('=== UPDATE WITH IMAGE ===');
        console.log('Creating FormData for update with image');
        
        // Create FormData for file upload
        const formDataToSend = new FormData();
        
        // Add all form fields
        Object.keys(processedFormData).forEach(key => {
          if (processedFormData[key] !== null && processedFormData[key] !== undefined) {
            formDataToSend.append(key, processedFormData[key]);
          }
        });
        
        // Add image file with correct field name
        formDataToSend.append('plate_image', imageFile, imageFile.name);
        formDataToSend.append('replace_images', 'true');
        
        // Debug FormData contents
        console.log('FormData entries:');
        for (let [key, value] of formDataToSend.entries()) {
          console.log(`${key}:`, value);
        }
        
        // Send FormData request
        response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/blacklist/${selectedItem.id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            // Don't set Content-Type for FormData - let browser set it with boundary
          },
          body: formDataToSend
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Update failed');
        }

        response = await response.json();
        console.log('=========================');
        
      } else {
        // Update without image - use JSON
        console.log('=== UPDATE WITHOUT IMAGE ===');
        console.log('Sending JSON data:', processedFormData);
        
        response = await editData(`/api/blacklist/${selectedItem.id}`, processedFormData, token);
        console.log('============================');
      }
      
      if (response.success) {
        showSnackbar(`Cập nhật blacklist ${processedFormData.plate_number} thành công!`, 'success');
        
        console.log('=== UPDATE SUCCESS RESPONSE ===');
        console.log('Full response:', response);
        console.log('Response data:', response.data);
        console.log('New detected_plate_image:', response.data?.detected_plate_image);
        console.log('New plate_image_path:', response.data?.plate_image_path);
        console.log('===============================');
        
        // Close modal and refresh data
        setOpenModal(false);
        await loadBlacklist(true); // Force refresh with cache bust
        
        // Reset form
        resetForm();
        setImageFile(null);
        setImagePreview(null);
        setOcrResult('');
        setDetectedPlateImage(null);
      }
    } else {
      // Create new item logic (existing code)
      // ... existing create logic
    }
    
  } catch (error) {
    console.error('Error submitting form:', error);
    
    let errorMessage = 'Có lỗi xảy ra';
    
    if (error.response && error.response.data) {
      const errorData = error.response.data;
      errorMessage = errorData.message || 'Dữ liệu không hợp lệ';
      
      if (errorData.errors) {
        if (Array.isArray(errorData.errors)) {
          const errorTexts = errorData.errors.map(err => {
            if (typeof err === 'string') return err;
            if (typeof err === 'object' && err.message) return err.message;
            if (typeof err === 'object' && err.msg) return err.msg;
            if (typeof err === 'object' && err.field && err.message) return `${err.field}: ${err.message}`;
            return JSON.stringify(err);
          });
          errorMessage = `${errorMessage}\n• ${errorTexts.join('\n• ')}`;
        }
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    showSnackbar(errorMessage, 'error');
  } finally {
    setLoading(false);
  }
};
const handleDateChange = (field, value) => {
  console.log(`[DEBUG] handleDateChange - Field: ${field}, Value: ${value}`);
  
  if (value) {
    // Convert yyyy-MM-dd to dd/MM/yyyy for display
    const [y, m, d] = value.split('-');
    const formattedValue = `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    
    console.log(`[DEBUG] Formatted value: ${formattedValue}`);
    
    setFormData(prev => ({ ...prev, [field]: formattedValue }));
    setFormErrors(prev => ({ ...prev, [field]: undefined }));
  } else {
    setFormData(prev => ({ ...prev, [field]: '' }));
  }
};

const handleDateIconClick = (field) => {
  console.log(`[DEBUG] handleDateIconClick - Field: ${field}`);
  
  const currentValue = formData[field];
  let dateValue = '';
  
  if (currentValue) {
    if (currentValue.includes('/')) {
      // Convert dd/MM/yyyy to yyyy-MM-dd
      const [d, m, y] = currentValue.split('/');
      dateValue = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    } else if (currentValue.includes('-')) {
      dateValue = currentValue;
    }
  }
  
  console.log(`[DEBUG] Date value for picker: ${dateValue}`);
  
  // Set value cho hidden input
  if (field === 'valid_from' && validFromDateRef.current) {
    validFromDateRef.current.value = dateValue;
    validFromDateRef.current.showPicker();
  } else if (field === 'valid_to' && validToDateRef.current) {
    validToDateRef.current.value = dateValue;
    validToDateRef.current.showPicker();
  }
};
  const handleDelete = async (id) => {
    try {
      const token = getToken();
      const response = await deleteData(`api/blacklist/${id}`, token);
      if (response.success) {
        showSnackbar(response.message || 'Xóa blacklist thành công!', 'success');
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
        const response = await postData('api/blacklist/bulk/delete', { ids: selectedItems }, token);
        if (response.success) {
          showSnackbar(response.message || `Xóa thành công ${selectedItems.length} mục!`, 'success');
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

// SỬA: Thay thế hàm handleEdit hiện tại
const handleEdit = (item) => {
  console.log('=== EDIT DEBUG ===');
  console.log('Original item:', item);
  console.log('item.valid_from raw:', item.valid_from, typeof item.valid_from);
  console.log('item.valid_to raw:', item.valid_to, typeof item.valid_to);
  
  setSelectedItem(item);
  
  // SỬA: Debug việc format ngày tháng
  let formattedValidFrom = '';
  let formattedValidTo = '';
  
  if (item.valid_from) {
    formattedValidFrom = formatDateForDisplay(item.valid_from);
    console.log('valid_from conversion:', item.valid_from, '->', formattedValidFrom);
  }
  
  if (item.valid_to) {
    formattedValidTo = formatDateForDisplay(item.valid_to);
    console.log('valid_to conversion:', item.valid_to, '->', formattedValidTo);
  }
  
  setFormData({
    location_id: item.location_id || '',
    plate_number: item.plate_number || '',
    vehicle_id: item.vehicle_id || '',
    violation_type: item.violation_type || 'unauthorized',
    reason: item.reason || '',
    severity: item.severity || 'medium',
    owner_name: item.owner_name || '',
    owner_phone: item.owner_phone || '',
    valid_from: formattedValidFrom,
    valid_to: formattedValidTo,
    description: item.description || ''
  });
  
  console.log('Final form data dates:');
  console.log('- valid_from:', formattedValidFrom);
  console.log('- valid_to:', formattedValidTo);
  console.log('=================');
  
  setImageFile(null);
  if (item.plate_image_path) {
    setImagePreview(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${item.plate_image_path}`);
  } else {
    setImagePreview(null);
  }
  setOcrResult(item.plate_number || '');
  setDetectedPlateImage(item.detected_plate_image || null);
  setFormErrors({});
  setOpenModal(true);
};

  const handleView = async (id) => {
    try {
      const token = getToken();
      const response = await fetchDataFromAPI(`api/blacklist/${id}`, token);
      
      if (response.success) {
        const item = response.data;
        setSelectedItem(item);
        setDetailImage(item.plate_image_path || null);
        setDetailDetectedPlateImage(item.detected_plate_image || null);
        setOpenDetailModal(true);
      } else {
        showSnackbar(response.message || 'Không tìm thấy blacklist', 'error');
      }
    } catch (error) {
      showSnackbar(handleErrorResponse(error), 'error');
    }
  };

  const resetForm = () => {
    setFormData({
      location_id: '', plate_number: '', vehicle_id: '', violation_type: 'unauthorized', 
      reason: '', severity: 'medium', owner_name: '', owner_phone: '', 
      valid_from: '', valid_to: '', description: ''
    });
    setSelectedItem(null);
    setFormErrors({});
  };

  const handleRefresh = () => {
    setFilters({ location_id: '', plate_number: '', violation_type: '', severity: '', is_active: '', valid_status: '' });
    setCurrentPage(1);
    setSelectedItems([]);
    loadBlacklist(true);
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

  // Status and chip components
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
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
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

          {/* Enhanced Table with Image Column */}
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
                      <TableCell sx={{ width: 120 }}>Ảnh biển số</TableCell>
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
                        <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
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
                        <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
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
                          
                          {/* Image Column */}
                          <PlateImageCell 
                            item={item} 
                            onImageClick={handleImagePreviewClick}
                          />
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
      Từ: {formatDateForDisplay(item.valid_from)}
    </Typography>
  )}
  {item.valid_to && (
    <Typography variant="caption" display="block">
      Đến: {formatDateForDisplay(item.valid_to)}
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
                              <Tooltip title="Xem chi tiết">
                              <IconButton
                                size="small"
                                color="info"
                                onClick={() => handleView(item.id)}
                                sx={{
                                  color: '#1976d2',
                                  backgroundColor: 'rgba(25, 118, 210, 0.1)',
                                  '&:hover': { backgroundColor: 'rgba(25, 118, 210, 0.2)' },
                                  transition: 'background-color 0.2s ease'
                                }}
                              >
                                <VisibilityIcon />
                              </IconButton>
                              </Tooltip>
                              <Tooltip title="Chỉnh sửa">
                              <IconButton
                                size="small"
                                color="warning"
                                onClick={() => handleEdit(item)}
                                sx={{
                                  color: '#ff9800',
                                  backgroundColor: 'rgba(255, 152, 0, 0.1)',
                                  '&:hover': { backgroundColor: 'rgba(255, 152, 0, 0.2)' },
                                  transition: 'background-color 0.2s ease'
                                }}
                              >
                                <EditIcon />
                              </IconButton>
                              </Tooltip>
                              <Tooltip title="Xóa">
                              <IconButton
                                size="small"
                                color="error"
                                  onClick={() => setDeleteDialog({ 
                                    open: true, 
                                    itemId: item.id, 
                                    plateName: item.plate_number 
                                  })}
                                sx={{
                                  color: '#f44336',
                                  backgroundColor: 'rgba(244, 67, 54, 0.1)',
                                  '&:hover': { backgroundColor: 'rgba(244, 67, 54, 0.2)' },
                                  transition: 'background-color 0.2s ease'
                                }}
                              >
                                <DeleteIcon />
                              </IconButton>
                              </Tooltip>
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

      {/* Statistics Tab */}
      {activeTab === 1 && (
        <Box sx={{ px: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={3}>
              <Card sx={{ textAlign: 'center', borderRadius: 3, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }}>
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
              <Card sx={{ textAlign: 'center', borderRadius: 3, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }}>
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
              <Card sx={{ textAlign: 'center', borderRadius: 3, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }}>
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
              <Card sx={{ textAlign: 'center', borderRadius: 3, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }}>
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
        </Box>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ 
          borderBottom: '1px solid #e0e0e0', 
          display: 'flex', 
          alignItems: 'center', 
          gap: 2 
        }}>
          <BlockIcon color="error" />
          {selectedItem ? 'Chỉnh sửa Blacklist' : 'Thêm Blacklist mới'}
        </DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent sx={{ p: 3 }}>
            <Grid container spacing={3}>
              {/* Image Upload Section */}
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom sx={{ mb: 2, fontWeight: 600 }}>
                  <PhotoCameraIcon sx={{ mr: 1 }} />
                  Ảnh biển số xe
                </Typography>
                
                <Button
                  variant="outlined"
                  component="label"
                  startIcon={<ImageIcon />}
                  fullWidth
                  sx={{ 
                    borderRadius: 2, 
                    mb: 2, 
                    py: 1.5,
                    borderStyle: 'dashed',
                    borderWidth: 2,
                    '&:hover': { borderStyle: 'dashed' }
                  }}
                >
                  {imageFile ? 'Đổi ảnh biển số' : 'Upload ảnh biển số'}
                  <input type="file" accept="image/*" hidden onChange={handleImageChange} />
                </Button>
                
                {formErrors.image && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {formErrors.image}
                  </Alert>
                )}
                
                {/* Image Previews */}
                <Stack spacing={2}>
                  {/* Ảnh gốc preview */}
                  {imagePreview && (
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
                        Ảnh gốc:
                      </Typography>
                      <Paper elevation={2} sx={{ p: 1, borderRadius: 2 }}>
                        <img 
                          src={imagePreview} 
                          alt="preview" 
                          style={{ 
                            width: '100%', 
                            maxHeight: 200, 
                            objectFit: 'contain',
                            borderRadius: 8 
                          }} 
                        />
                      </Paper>
                    </Box>
                  )}
                  
                  {/* Ảnh biển số đã detect preview */}
                  {(detectedPlateImage || (selectedItem && selectedItem.detected_plate_image)) && (
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block', color: 'success.main' }}>
                        Biển số đã nhận diện:
                      </Typography>
                      <Paper elevation={2} sx={{ p: 1, borderRadius: 2, border: '2px solid #4caf50' }}>
                        <img 
                          src={
                            detectedPlateImage
                              ? `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${detectedPlateImage}`
                              : selectedItem && selectedItem.detected_plate_image
                                ? `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${selectedItem.detected_plate_image}`
                                : ''
                          }
                          alt="detected" 
                          style={{ 
                            width: '100%', 
                            maxHeight: 100, 
                            objectFit: 'contain',
                            borderRadius: 6 
                          }} 
                        />
                      </Paper>
                    </Box>
                  )}
                  
                  {/* OCR Result */}
                  {ocrResult && (
                    <Alert severity="success" sx={{ fontWeight: 600 }}>
                      <Typography variant="body2">
                        Biển số nhận diện: <strong style={{ fontSize: '1.1em' }}>{ocrResult}</strong>
                      </Typography>
                    </Alert>
                  )}
                </Stack>
              </Grid>

              {/* Form Fields */}
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom sx={{ mb: 2, fontWeight: 600 }}>
                  <DescriptionIcon sx={{ mr: 1 }} />
                  Thông tin chi tiết
                </Typography>
                
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <FormControl fullWidth required error={!!formErrors.location_id}>
                  <InputLabel>Khu vực</InputLabel>
                  <Select
                    value={formData.location_id}
                    label="Khu vực"
                    onChange={(e) => setFormData({...formData, location_id: e.target.value})}
                        sx={{ borderRadius: 2 }}
                  >
                        {locationsLoading ? (
                          <MenuItem value="" disabled>Đang tải...</MenuItem>
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
              </Grid>
                  
                  <Grid item xs={12}>
                <TextField
                  fullWidth
                  required
                  label="Biển số xe"
                  value={formData.plate_number}
                      disabled
                      error={!!formErrors.plate_number}
                      helperText={ocrResult ? "Đã nhận diện từ OCR" : "Trường này sẽ tự động điền từ ảnh biển số (OCR)"}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2 }
                      }}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <CarIcon />
                          </InputAdornment>
                        )
                      }}
                    />
                    {formErrors.plate_number && (
                      <FormHelperText error>{formErrors.plate_number}</FormHelperText>
                    )}
              </Grid>
                  
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth required error={!!formErrors.violation_type}>
                  <InputLabel>Loại vi phạm</InputLabel>
                  <Select
                    value={formData.violation_type}
                    label="Loại vi phạm"
                    onChange={(e) => setFormData({...formData, violation_type: e.target.value})}
                        sx={{ borderRadius: 2 }}
                      >
                        <MenuItem value="unauthorized">
                          <WarningIcon sx={{ mr: 1, fontSize: 16 }} />
                          Không được phép
                        </MenuItem>
                        <MenuItem value="security_threat">
                          <FaShieldAlt style={{ marginRight: 8, fontSize: 14 }} />
                          Đe dọa an ninh
                        </MenuItem>
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
                  
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth required error={!!formErrors.severity}>
                  <InputLabel>Mức độ</InputLabel>
                  <Select
                    value={formData.severity}
                    label="Mức độ"
                    onChange={(e) => setFormData({...formData, severity: e.target.value})}
                        sx={{ borderRadius: 2 }}
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
                  
                  <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Tên chủ xe"
                  placeholder="Nhập tên chủ xe"
                  value={formData.owner_name}
                  onChange={(e) => setFormData({...formData, owner_name: e.target.value})}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <PersonIcon />
                          </InputAdornment>
                        )
                      }}
                />
              </Grid>
                  
                  <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Số điện thoại"
                  placeholder="Nhập số điện thoại"
                  value={formData.owner_phone}
                  onChange={(e) => setFormData({...formData, owner_phone: e.target.value})}
                      error={!!formErrors.owner_phone}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <PhoneIcon />
                          </InputAdornment>
                        )
                      }}
                    />
                    {formErrors.owner_phone && (
                      <FormHelperText error>{formErrors.owner_phone}</FormHelperText>
                    )}
              </Grid>
                  

<Grid item xs={12} sm={6}>
  <Box position="relative">
    <TextField
      fullWidth
      label="Có hiệu lực từ"
      placeholder="dd/MM/yyyy"
      value={formData.valid_from ? formatDateForDisplay(formData.valid_from) : ''}
      onChange={(e) => {
        const value = e.target.value;
        if (value === '' || validateDateFormat(value)) {
          setFormErrors(prev => ({ ...prev, valid_from: undefined }));
          // SỬA: Không format lại, giữ nguyên giá trị user nhập
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
              <CalendarIcon />
            </IconButton>
          </InputAdornment>
        ),
      }}
      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
    />
    
    {/* Date Input ẩn - SỬA: Không bind value trực tiếp */}
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
</Grid>
<Grid item xs={12} sm={6}>
  <Box position="relative">
    <TextField
      fullWidth
      label="Có hiệu lực đến"
      placeholder="dd/MM/yyyy"
      value={formData.valid_to ? formatDateForDisplay(formData.valid_to) : ''}
      onChange={(e) => {
        const value = e.target.value;
        if (value === '' || validateDateFormat(value)) {
          setFormErrors(prev => ({ ...prev, valid_to: undefined }));
          // SỬA: Không format lại, giữ nguyên giá trị user nhập
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
              <CalendarIcon />
            </IconButton>
          </InputAdornment>
        ),
      }}
      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
    />
    
    {/* Date Input ẩn - SỬA: Không bind value trực tiếp */}
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
</Grid>
                </Grid>
              </Grid>
              
              {/* Full width fields */}
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
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
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
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ 
            p: 3, 
            borderTop: '1px solid #e0e0e0',
            gap: 2 
          }}>
            <Button 
              onClick={() => setOpenModal(false)}
              sx={{ 
                borderRadius: 2, 
                px: 3, 
                py: 1.5,
                textTransform: 'none',
                fontWeight: 600 
              }}
            >
              Hủy
            </Button>
            <Button 
              type="submit" 
              variant="contained" 
              color="error" 
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} /> : <FaSave />}
              sx={{ 
                borderRadius: 2, 
                px: 3, 
                py: 1.5,
                textTransform: 'none',
                fontWeight: 600,
                boxShadow: '0 2px 8px rgba(211, 47, 47, 0.3)',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(211, 47, 47, 0.4)'
                }
              }}
            >
              {selectedItem ? 'Cập nhật' : 'Tạo mới'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Detail Modal */}
      <Dialog open={openDetailModal} onClose={() => setOpenDetailModal(false)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ 
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          alignItems: 'center',
          gap: 2
        }}>
          <VisibilityIcon color="primary" />
          Chi tiết Blacklist - {selectedItem?.plate_number}
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          {selectedItem && (
            <Grid container spacing={3}>
              {/* Images Section */}
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
                  <PhotoCameraIcon sx={{ mr: 1 }} />
                  Hình ảnh
                </Typography>
                
                <Stack spacing={2}>
                  {detailImage && (
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                        Ảnh gốc:
                      </Typography>
                      <Paper 
                        elevation={3} 
                        sx={{ 
                          p: 1, 
                          borderRadius: 2,
                          cursor: 'pointer',
                          '&:hover': { elevation: 6 }
                        }}
                        onClick={() => handleImagePreviewClick(detailImage, 'Ảnh gốc - ' + selectedItem.plate_number)}
                      >
                        <img 
                          src={`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${detailImage}`} 
                          alt="original" 
                          style={{ 
                            width: '100%', 
                            maxHeight: 200, 
                            objectFit: 'contain',
                            borderRadius: 8 
                          }} 
                        />
                      </Paper>
                    </Box>
                  )}
                  
                  {detailDetectedPlateImage && (
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: 'success.main' }}>
                        Biển số đã nhận diện:
                      </Typography>
                      <Paper 
                        elevation={3} 
                        sx={{ 
                          p: 1, 
                          borderRadius: 2,
                          border: '2px solid #4caf50',
                          cursor: 'pointer',
                          '&:hover': { elevation: 6 }
                        }}
                        onClick={() => handleImagePreviewClick(detailDetectedPlateImage, 'Biển số nhận diện - ' + selectedItem.plate_number)}
                      >
                        <img 
                          src={`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${detailDetectedPlateImage}`} 
                          alt="detected" 
                          style={{ 
                            width: '100%', 
                            maxHeight: 120, 
                            objectFit: 'contain',
                            borderRadius: 6 
                          }} 
                        />
                      </Paper>
                    </Box>
                  )}
                  
                  {!detailImage && !detailDetectedPlateImage && (
                    <Alert severity="info">
                      Không có hình ảnh cho blacklist này
                    </Alert>
                  )}
                </Stack>
              </Grid>

              {/* Information Section */}
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
                  <DescriptionIcon sx={{ mr: 1 }} />
                  Thông tin chi tiết
                </Typography>
                
                <Stack spacing={2}>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">Biển số:</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>{selectedItem.plate_number}</Typography>
                  </Box>
                  
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">Khu vực:</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
                      <LocationIcon sx={{ fontSize: 16, mr: 0.5 }} />
                      <Typography>{selectedItem.location_name}</Typography>
                    </Box>
                  </Box>
                  
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">Loại vi phạm:</Typography>
                    <Box sx={{ mt: 0.5 }}>
                      {getViolationTypeChip(selectedItem.violation_type)}
                    </Box>
                  </Box>
                  
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">Mức độ:</Typography>
                    <Box sx={{ mt: 0.5 }}>
                      {getSeverityChip(selectedItem.severity)}
                    </Box>
                  </Box>
                  
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">Trạng thái:</Typography>
                    <Box sx={{ mt: 0.5 }}>
                      {getStatusChip(selectedItem.current_status)}
                    </Box>
                  </Box>
                </Stack>
              </Grid>
              
              {/* Owner Information */}
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
                  <PersonIcon sx={{ mr: 1 }} />
                  Thông tin chủ xe
                </Typography>
                
                <Stack spacing={1.5}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <PersonIcon sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
                <Typography><strong>Tên:</strong> {selectedItem.owner_name || 'N/A'}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <PhoneIcon sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
                <Typography><strong>SĐT:</strong> {selectedItem.owner_phone || 'N/A'}</Typography>
                  </Box>
                </Stack>
              </Grid>
              
              <Grid item xs={12} md={6}>
  <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
    <CalendarIcon sx={{ mr: 1 }} />
    Thời gian hiệu lực
  </Typography>
  
  <Stack spacing={1.5}>
    <Box sx={{ display: 'flex', alignItems: 'center' }}>
      <CalendarIcon sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
      <Typography>
        <strong>Từ:</strong> {selectedItem.valid_from ? formatDateForDisplay(selectedItem.valid_from) : 'Vĩnh viễn'}
      </Typography>
    </Box>
    <Box sx={{ display: 'flex', alignItems: 'center' }}>
      <CalendarIcon sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
      <Typography>
        <strong>Đến:</strong> {selectedItem.valid_to ? formatDateForDisplay(selectedItem.valid_to) : 'Vĩnh viễn'}
      </Typography>
    </Box>
  </Stack>
</Grid>
              
              {/* Reason and Description */}
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  required
                  label="Lý do cấm"
                  multiline
                  rows={3}
                  placeholder="Nhập lý do cấm (tối thiểu 10 ký tự)..."
                  value={formData.reason}
                  onChange={(e) => setFormData({...formData, reason: e.target.value})}
                  error={!!formErrors.reason}
                  helperText={formErrors.reason || `${formData.reason.length}/500 ký tự`}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions sx={{ 
          p: 3, 
          borderTop: '1px solid #e0e0e0' 
        }}>
          <Button 
            onClick={() => setOpenDetailModal(false)}
            sx={{ 
              borderRadius: 2, 
              px: 3, 
              py: 1.5,
              textTransform: 'none',
              fontWeight: 600 
            }}
          >
            Đóng
          </Button>
          <Button 
            variant="contained" 
            color="warning"
            startIcon={<EditIcon />}
            onClick={() => {
              setOpenDetailModal(false);
              handleEdit(selectedItem);
            }}
            sx={{ 
              borderRadius: 2, 
              px: 3, 
              py: 1.5,
              textTransform: 'none',
              fontWeight: 600 
            }}
          >
            Chỉnh sửa
          </Button>
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

      {/* Image Preview Dialog */}
      <ImagePreviewDialog
        open={imagePreviewDialog.open}
        onClose={() => setImagePreviewDialog({ open: false, src: '', title: '' })}
        src={imagePreviewDialog.src}
        title={imagePreviewDialog.title}
      />
    </Box>
  );
};

export default BlackList; 