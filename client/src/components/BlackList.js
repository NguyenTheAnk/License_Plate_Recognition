import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions, 
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, 
  IconButton, Typography, Grid, FormControl, InputLabel, Select, MenuItem, 
  Chip, Alert, CircularProgress, Card, CardContent, Tooltip, Tabs, Tab, 
  Checkbox, Breadcrumbs,  FormHelperText, InputAdornment, Snackbar, 
  Paper, Stack, Avatar, InputBase
} from '@mui/material';
import {
   CalendarToday as CalendarIcon, 
  LocationOn as LocationIcon, Person as PersonIcon, Phone as PhoneIcon, 
  DirectionsCar as CarIcon,
  Home as HomeIcon, ExpandMore as ExpandMoreIcon, Description as DescriptionIcon, 
   Image as ImageIcon, Warning as WarningIcon, 
  Block as BlockIcon, Visibility as VisibilityIcon, Edit as EditIcon, 
  Delete as DeleteIcon, PhotoCamera as PhotoCameraIcon, Close as CloseIcon,
  Download as DownloadIcon, FirstPage, LastPage, ChevronLeft, ChevronRight, MoreHoriz,
  Cancel, AccessTime, Info, CheckCircle, WarningAmber as WarningAmberIcon
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
const validatePlateNumberSearch = (plateNumber) => {
  if (!plateNumber || plateNumber.trim() === '') {
    return { isValid: true, message: '' }; // Search cho phép empty
  }

  const cleaned = plateNumber.trim().toUpperCase();
  
  // Patterns linh hoạt cho Search - cho phép partial match
  const flexiblePatterns = [
    /^\d{1,2}$/,                         // Chỉ mã tỉnh: 30
    /^\d{1,2}[A-Z]?$/,                   // Mã tỉnh + chữ: 30A
    /^\d{1,2}[A-Z]\d?$/,                 // Partial xe máy: 30A1
    /^\d{1,2}[A-Z]-?\d*\.?\d*$/,         // Partial ô tô: 30A-123
    /^\d{1,2}[A-Z]\d-?\d*\.?\d*$/,       // Partial xe máy: 30A1-45
    /^.+$/                               // Bất kỳ text nào (cho fuzzy search)
  ];

  // Search luôn cho phép, chỉ cảnh báo nếu format lạ
  if (cleaned.length >= 6) {
    const hasValidStructure = /^\d{2}[A-Z]/.test(cleaned);
    if (!hasValidStructure) {
      return { 
        isValid: true, 
        message: 'Tìm kiếm có thể không chính xác với format này' 
      };
    }
  }

  return { isValid: true, message: '' };
};
const formatDateForDisplay = (dateString) => {
  if (!dateString) return '';
  
  
  // Nếu đã là dd/MM/yyyy thì return luôn
  if (dateString.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    return dateString;
  }
  
  let year, month, day;
  
  if (dateString.includes('T')) {
    // ISO string - lấy phần date
    const datePart = dateString.split('T')[0];
    [year, month, day] = datePart.split('-').map(num => parseInt(num));
  } else if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
    // YYYY-MM-DD format từ database
    [year, month, day] = dateString.split('-').map(num => parseInt(num));
  } else if (dateString.includes('/')) {
    // dd/MM/yyyy format - đã đúng format
    return dateString;
  } else {
    return '';
  }
  
  const result = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
  return result;
};

const formatDateForInput = (dateString) => {
  if (!dateString) return '';

  
  // Nếu đã là YYYY-MM-DD thì return luôn
  if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return dateString;
  }
  
  const components = parseDateComponents(dateString);
  if (!components) {
    return '';
  }
  
  const { year, month, day } = components;
  const result = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
    <DialogContent sx={{ p: 2, pt: 4, textAlign: 'center' }}>
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
  const getCacheBuster = () => {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substr(2, 9);
    const itemTimestamp = item.updated_at ? new Date(item.updated_at).getTime() : 0;
    const ocrTimestamp = item.ocr_processed_at ? new Date(item.ocr_processed_at).getTime() : 0;
    return `cb=${timestamp}&r=${randomStr}&ut=${itemTimestamp}&ot=${ocrTimestamp}&id=${item.id}`;
  };

  const getImageUrl = (imagePath) => {
    if (!imagePath) return null;
            const baseUrl = `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${imagePath}`;
    const cacheBuster = getCacheBuster();
    return `${baseUrl}?${cacheBuster}`;
  };

  return (
    <TableCell sx={{ width: 120 }}>
      {item.detected_plate_image ? (
        <Box>
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
            title={`Ảnh biển số đã phát hiện`}
            key={`detected-${item.id}-${item.detected_plate_image}-${item.updated_at || Date.now()}`}
            onLoad={() => {}}
            onError={(e) => {
              if (item.plate_image_path) {
                e.target.src = getImageUrl(item.plate_image_path);
                e.target.style.border = '1px solid #e0e0e0';
              }
            }}
          />
        </Box>
      ) : item.plate_image_path ? (
        <Box>
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
            title={`Ảnh gốc`}
            key={`original-${item.id}-${item.plate_image_path}-${item.updated_at || Date.now()}`}
            onLoad={() => {}}
            onError={(e) => {}}
          />
        </Box>
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
// ✅ THÊM: Validation nghiêm ngặt cho Add/Update
const validatePlateNumberStrict = (plateNumber) => {
  if (!plateNumber || plateNumber.trim() === '') {
    return { isValid: false, message: 'Vui lòng nhập biển số xe' };
  }

  const cleaned = plateNumber.trim().toUpperCase();
  
  // Patterns nghiêm ngặt cho Add/Update
  const strictPatterns = [
    /^\d{2}[A-Z]-\d{2,4}\.\d{2}$/,      // Ô tô: 30A-123.45, 30A-1234.56
    /^\d{2}[A-Z]\d-\d{3,4}(\.\d{2})?$/, // Xe máy: 30A1-4567, 30A1-456.78
    /^\d{2}[A-Z]{2}-\d{2,3}\.\d{2}$/,   // Ngoại giao: 30AB-123.45
    /^\d{2}[A-Z]-\d{5,}$/                // Taxi: 30A-12345+
  ];

  const isValidFormat = strictPatterns.some(pattern => pattern.test(cleaned));
  
  if (!isValidFormat) {
    return { 
      isValid: false, 
      message: 'Định dạng biển số không đúng. VD: 30A-123.45, 51B1-4567' 
    };
  }

  return { isValid: true, message: '' };
};

// ✅ THÊM: Auto format biển số
const autoFormatPlateNumber = (input) => {
  if (!input) return '';
  
  // Loại bỏ các ký tự không hợp lệ, chỉ giữ chữ, số, dấu gạch ngang và chấm
  let cleaned = input.toUpperCase().replace(/[^A-Z0-9\-\.]/g, '');
  
  // Xóa các từ không cần thiết
  cleaned = cleaned.replace(/^(VN|VIETNAM|VIET|NAM)/, '');
  
  // Logic format tự động dựa trên độ dài và pattern
  if (cleaned.length >= 6) {
    // Kiểm tra pattern cơ bản: 2 số + 1 chữ + ...
    if (/^\d{2}[A-Z]/.test(cleaned)) {
      const numbers = cleaned.substring(0, 2);  // Mã tỉnh
      const letter = cleaned.substring(2, 3);   // Chữ cái
      const rest = cleaned.substring(3);        // Phần còn lại
      
      // Loại bỏ dấu - và . hiện có để format lại
      const cleanRest = rest.replace(/[\-\.]/g, '');
      
      if (cleanRest.length >= 4) {
        const fourthChar = cleanRest.charAt(0);
        
        if (/\d/.test(fourthChar)) {
          // Xe máy: 30A1-XXXX
          if (cleanRest.length === 5) {
            // Xe máy cũ: 30A1-2345
            return `${numbers}${letter}${cleanRest.charAt(0)}-${cleanRest.substring(1)}`;
          } else if (cleanRest.length === 6) {
            // Xe máy mới: 30A1-123.45
            return `${numbers}${letter}${cleanRest.charAt(0)}-${cleanRest.substring(1, 4)}.${cleanRest.substring(4)}`;
          }
        } else {
          // Ô tô: 30A-XXXX
          if (cleanRest.length === 4) {
            // Ô tô ngắn: 30A-12.34
            return `${numbers}${letter}-${cleanRest.substring(0, 2)}.${cleanRest.substring(2)}`;
          } else if (cleanRest.length === 5) {
            // Ô tô thường: 30A-123.45
            return `${numbers}${letter}-${cleanRest.substring(0, 3)}.${cleanRest.substring(3)}`;
          } else if (cleanRest.length === 6) {
            // Ô tô dài: 30A-1234.56
            return `${numbers}${letter}-${cleanRest.substring(0, 4)}.${cleanRest.substring(4)}`;
          } else if (cleanRest.length >= 7) {
            // Taxi: 30A-12345+
            return `${numbers}${letter}-${cleanRest}`;
          }
        }
      }
    }
    
    // Kiểm tra pattern ngoại giao: 2 số + 2 chữ
    if (/^\d{2}[A-Z]{2}/.test(cleaned)) {
      const numbers = cleaned.substring(0, 2);
      const letters = cleaned.substring(2, 4);
      const rest = cleaned.substring(4).replace(/[\-\.]/g, '');
      
      if (rest.length === 4) {
        return `${numbers}${letters}-${rest.substring(0, 2)}.${rest.substring(2)}`;
      } else if (rest.length === 5) {
        return `${numbers}${letters}-${rest.substring(0, 3)}.${rest.substring(3)}`;
      }
    }
  }
  
  return cleaned;
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
  const validFromDateRef = useRef(null);
  const validToDateRef = useRef(null);
  const [hasCreateBlackList, setHasCreateBlackList] = useState(false);
  const [hasUpdateBlackList, setHasUpdateBlackList] = useState(false);
  const [hasViewBlackList, setHasViewBlackList] = useState(false);
  const [hasDeleteBlackList, setHasDeleteBlackList] = useState(false);
  useEffect(() => {
            const storedUser = localStorage.getItem('user');
            if (storedUser ) {
                try {
                    const user = JSON.parse(storedUser); // Parse dữ liệu user
                    const permissions = user.permissions || [];
                    setHasCreateBlackList(permissions.some(permission => permission.code === 'blacklist.create'));
                    setHasUpdateBlackList(permissions.some(permission => permission.code === 'blacklist.update'));
                    setHasViewBlackList(permissions.some(permission => permission.code === 'blacklist.view_detail'));
                    setHasDeleteBlackList(permissions.some(permission => permission.code === 'blacklist.delete'));
  
                } catch (error) {
                    console.error('Error parsing permissions:', error);
                }
            }
        }, []);
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Filters
  const [filters, setFilters] = useState({
    plate_number: '', violation_type: '', severity: '', is_active: '', valid_status: ''
  });

  // Form data
  const [formData, setFormData] = useState({
    plate_number: '', vehicle_id: '', violation_type: 'unauthorized', 
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
      await loadStatistics();
    };
    loadData();
  }, [currentPage, itemsPerPage, filters]);

const validateForm = () => {
  const errors = {};
  
  // ✅ SỬA: Validation nghiêm ngặt cho Add/Update - chỉ yêu cầu biển số, không bắt buộc ảnh
  if (!formData.plate_number || formData.plate_number.trim() === '') {
    errors.plate_number = 'Vui lòng nhập biển số xe';
  } else {
    // Validate format biển số khi user đã nhập
    const plateValidation = validatePlateNumberStrict(formData.plate_number);
    if (!plateValidation.isValid) {
      errors.plate_number = plateValidation.message;
    }
  }

  // Validate reason với độ dài tối thiểu
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
  
  // Validate vehicle_id nếu có
  if (formData.vehicle_id && formData.vehicle_id !== '') {
    const vehicleIdNum = parseInt(formData.vehicle_id);
    if (isNaN(vehicleIdNum) || vehicleIdNum <= 0) {
      errors.vehicle_id = 'ID phương tiện phải là số nguyên dương';
    }
  }
  
  // Validate date range
  if (formData.valid_from && formData.valid_to) {
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

// Trong file BlackList.js, sửa function loadBlacklist

const loadBlacklist = async (forceRefresh = false) => {
    setLoading(true);
    try {
      const token = getToken();
    console.log('Loading blacklist with token:', token ? 'Token exists' : 'No token');
    
    const params = new URLSearchParams();
    params.append('page', currentPage.toString());
    params.append('limit', itemsPerPage.toString());
    
    // SỬA: Enhanced force refresh with multiple cache busting techniques
    if (forceRefresh) {
      params.append('_t', Date.now().toString());
      params.append('cache_bust', Math.random().toString());
      params.append('refresh_images', 'true'); // Backend signal for image refresh
    }
    
    // Add filters to params
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined) {
        params.append(key, value);
      }
    });

    // SỬA: Enhanced headers for cache control
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    
    // Add aggressive cache control when force refreshing
    if (forceRefresh) {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0';
      headers['Pragma'] = 'no-cache';
      headers['Expires'] = '0';
      headers['If-Modified-Since'] = new Date(0).toUTCString();
    }

            const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/blacklist?${params.toString()}`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.success) {
      console.log('Blacklist loaded:', data.data);
      
      // SỬA: Force component re-render by updating state with new reference
      const processedData = data.data.map(item => ({
        ...item,
        // Add timestamp to force re-render of images
        _refreshTimestamp: Date.now(),
        // Ensure image paths are properly formatted
        detected_plate_image: item.detected_plate_image,
        plate_image_path: item.plate_image_path
      }));
      
      setBlacklist(processedData);
      
      if (data.pagination) {
        setTotalPages(data.pagination.total_pages || 1);
        setTotalItems(data.pagination.total || 0);
      }
      
      // SỬA: Force browser to clear image cache if forceRefresh
      if (forceRefresh) {
        // Clear browser cache for images (if possible)
        setTimeout(() => {
          const images = document.querySelectorAll('img[src*="/uploads/blacklist/"]');
          images.forEach(img => {
            const originalSrc = img.src;
            img.src = '';
            setTimeout(() => {
              img.src = originalSrc;
            }, 10);
          });
        }, 100);
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
        // ✅ SỬA: Chỉ cập nhật nếu chưa có biển số hoặc user chấp nhận
        if (!formData.plate_number || formData.plate_number.trim() === '') {
          setFormData(prev => ({ ...prev, plate_number: data.ocr_text }));
        }
        setOcrResult(data.ocr_text);
        
        const message = formData.plate_number && formData.plate_number !== data.ocr_text
          ? `Nhận diện được: ${data.ocr_text}. Biển số hiện tại: ${formData.plate_number}`
          : `Nhận diện thành công biển số: ${data.ocr_text}`;
          
        showSnackbar(message, 'success');
        
        if (data.detected_plate_image) {
          setDetectedPlateImage(data.detected_plate_image);
        } else {
          setDetectedPlateImage(null);
        }
      }
      else {
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
  
    const processedFormData = {
      // QUAN TRỌNG: Luôn gửi tất cả các field, không skip field nào
      plate_number: formData.plate_number || ocrResult || '',
      vehicle_id: formData.vehicle_id && formData.vehicle_id !== '' ? 
        parseInt(formData.vehicle_id) : null,
      violation_type: formData.violation_type || 'unauthorized',
      severity: formData.severity || 'medium',
      reason: formData.reason || '',
      description: formData.description || '',
      
      // Convert dates
      valid_from: formData.valid_from ? 
        (() => {
          if (formData.valid_from.includes('/')) {
            const [d, m, y] = formData.valid_from.split('/');
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
          }
          return formData.valid_from;
        })() : '',
        
      valid_to: formData.valid_to ? 
        (() => {
          if (formData.valid_to.includes('/')) {
            const [d, m, y] = formData.valid_to.split('/');
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
          }
          return formData.valid_to;
        })() : ''
    };

    // Remove null vehicle_id
    if (processedFormData.vehicle_id === null) {
      delete processedFormData.vehicle_id;
    }

    console.log('Processed form data:', processedFormData);

    if (selectedItem) {
      // ===== UPDATE EXISTING ITEM =====
      console.log('=== UPDATE EXISTING BLACKLIST ===');
      
      const formDataToSend = new FormData();
      
      // Helper function để append safely
      const appendOnce = (formData, key, value) => {
        if (value !== null && value !== undefined) {
          formData.append(key, String(value));
          console.log(`[APPEND] ${key}:`, value);
        }
      };
      
      // Append các field một cách có kiểm soát
      appendOnce(formDataToSend, 'plate_number', processedFormData.plate_number);
      appendOnce(formDataToSend, 'violation_type', processedFormData.violation_type);
      appendOnce(formDataToSend, 'reason', processedFormData.reason);
      appendOnce(formDataToSend, 'severity', processedFormData.severity);
      
      appendOnce(formDataToSend, 'description', processedFormData.description || '');
      appendOnce(formDataToSend, 'valid_from', processedFormData.valid_from || '');
      appendOnce(formDataToSend, 'valid_to', processedFormData.valid_to || '');
      
      // Vehicle ID nếu có
      if (processedFormData.vehicle_id) {
        appendOnce(formDataToSend, 'vehicle_id', processedFormData.vehicle_id);
      }
      
      // Add image file if exists
      if (imageFile) {
        formDataToSend.append('plate_image', imageFile, imageFile.name);
        formDataToSend.append('replace_images', 'true');
        console.log('[APPEND] plate_image file:', imageFile.name);
      }
      
      // Send update request
      response = await editData(`api/blacklist/${selectedItem.id}`, formDataToSend, token);

      if (response.success) {
        console.log('[DEBUG FRONTEND] Update response:', response.data);
        
        if (response.data && response.data.detected_plate_image) {
          console.log('[DEBUG FRONTEND] New detected image from response:', response.data.detected_plate_image);
          setDetectedPlateImage(response.data.detected_plate_image);
        }
        
        showSnackbar(`Cập nhật blacklist ${processedFormData.plate_number} thành công!`, 'success');
        
        setOpenModal(false);
        setImageFile(null);
        setImagePreview(null);
        setOcrResult('');
        resetForm();
        
        setTimeout(async () => {
          console.log('[DEBUG FRONTEND] Force refreshing blacklist...');
          await loadBlacklist(true);
        }, 200);
        
        setTimeout(() => {
          console.log('[DEBUG FRONTEND] Second refresh...');
          loadBlacklist(true);
        }, 1500);
      }
    } else {
      // ===== CREATE NEW ITEM =====
      console.log('=== CREATE NEW BLACKLIST ===');
      
      // ✅ SỬA: Không yêu cầu bắt buộc phải có ảnh nếu đã nhập biển số tay
      if (!processedFormData.plate_number || processedFormData.plate_number.trim() === '') {
        showSnackbar('Vui lòng nhập biển số xe hoặc upload ảnh để nhận diện tự động', 'error');
        return;
      }
      
      // Create FormData for new entry
      const formDataToSend = new FormData();
      
      // Add all form fields
      Object.keys(processedFormData).forEach(key => {
        if (processedFormData[key] !== null && processedFormData[key] !== undefined) {
          formDataToSend.append(key, processedFormData[key]);
        }
      });
      
      // ✅ SỬA: Chỉ append ảnh nếu có, không bắt buộc
      if (imageFile) {
        formDataToSend.append('image', imageFile, imageFile.name);
        console.log('[CREATE] Added image file:', imageFile.name);
      } else {
        console.log('[CREATE] No image file, creating with manual plate number only');
      }
      
      // Debug FormData contents
      console.log('Creating new blacklist with FormData:');
      for (let [key, value] of formDataToSend.entries()) {
        console.log(`${key}:`, value);
      }
      
      // Send create request
      response = await postData('api/blacklist/create', formDataToSend, token, true);
      
      if (response.success) {
        showSnackbar(`Tạo blacklist ${processedFormData.plate_number} thành công!`, 'success');
        setOpenModal(false);
        
        setImageFile(null);
        setImagePreview(null);
        setOcrResult('');
        setDetectedPlateImage(null);
        resetForm();
        
        setTimeout(async () => {
          await loadBlacklist(true);
        }, 100);
      }
    }
    
  } catch (error) {
    console.error('Error submitting form:', error);
    showSnackbar(handleErrorResponse(error), 'error');
  } finally {
    setLoading(false);
  }
};
const handleDateChange = (field, value) => {
  console.log(`[DEBUG] handleDateChange - Field: ${field}, Value: ${value}`);
  
  if (value) {
    // SỬA: Xử lý date không dùng Date object để tránh timezone
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
      // Convert dd/MM/yyyy to yyyy-MM-dd cho date picker
      const [d, m, y] = currentValue.split('/');
      dateValue = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    } else if (currentValue.includes('-')) {
      dateValue = currentValue;
    }
  }
  
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
    // Chuyển từ YYYY-MM-DD (database) sang dd/MM/yyyy (display)
    formattedValidFrom = formatDateForDisplay(item.valid_from);
    console.log('valid_from conversion:', item.valid_from, '->', formattedValidFrom);
  }
  
  if (item.valid_to) {
    // Chuyển từ YYYY-MM-DD (database) sang dd/MM/yyyy (display) 
    formattedValidTo = formatDateForDisplay(item.valid_to);
    console.log('valid_to conversion:', item.valid_to, '->', formattedValidTo);
  }
  
    setFormData({
      plate_number: item.plate_number || '',
      vehicle_id: item.vehicle_id || '',
      violation_type: item.violation_type || 'unauthorized',
      reason: item.reason || '',
      severity: item.severity || 'medium',
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
      plate_number: '', vehicle_id: '', violation_type: 'unauthorized', 
      reason: '', severity: 'medium',
      valid_from: '', valid_to: '', description: ''
    });
    setSelectedItem(null);
    setFormErrors({});
  };

  const handleRefresh = () => {
    setFilters({ plate_number: '', violation_type: '', severity: '', is_active: '', valid_status: '' });
    setCurrentPage(1);
    setSelectedItems([]);
    loadBlacklist(true);
  };

const handleFilterChange = (key, value) => {
  // ✅ THÊM: Validation cho plate_number search giống WhiteList
  if (key === 'plate_number') {
    const searchValidation = validatePlateNumberSearch(value);
    if (!searchValidation.isValid) {
      showSnackbar(searchValidation.message, 'warning');
    }
  }
  
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
      'active': { label: 'Đang chặn', sx: { bgcolor: '#ffebee', color: '#d32f2f', border: '1px solid #e57373' } },
      'inactive': { label: 'Không hoạt động', sx: { bgcolor: '#f5f5f5', color: '#666', border: '1px solid #e0e0e0' } },
      'future': { label: 'Chưa có hiệu lực', sx: { bgcolor: '#fffde7', color: '#f9a825', border: '1px solid #ffe082' } },
      'expired': { label: 'Hết hạn', sx: { bgcolor: '#ffebee', color: '#d32f2f', border: '1px solid #e57373' } },
    };
    const config = statusConfig[status] || { label: status, sx: { bgcolor: '#f5f5f5', color: '#666', border: '1px solid #e0e0e0' } };
    return <Chip label={config.label} size="small" sx={{ fontWeight: 700, fontSize: '0.8rem', px: 1.5, ...config.sx }} />;
  };

  const getViolationTypeChip = (type) => {
    const typeConfig = {
      'unauthorized': { label: 'Không được phép', sx: { bgcolor: '#fffde7', color: '#f9a825', border: '1px solid #ffe082' } },
      'security_threat': { label: 'Nguy cơ an ninh', sx: { bgcolor: '#ffebee', color: '#d32f2f', border: '1px solid #e57373' } },
      'unpaid_fine': { label: 'Chưa nộp phạt', sx: { bgcolor: '#e3f2fd', color: '#1976d2', border: '1px solid #64b5f6' } },
      'banned': { label: 'Bị cấm', sx: { bgcolor: '#f5f5f5', color: '#666', border: '1px solid #e0e0e0' } },
      'suspicious': { label: 'Đáng ngờ', sx: { bgcolor: '#fffde7', color: '#f9a825', border: '1px solid #ffe082' } },
      'other': { label: 'Khác', sx: { bgcolor: '#f5f5f5', color: '#666', border: '1px solid #e0e0e0' } }
    };
    const config = typeConfig[type] || { label: type, sx: { bgcolor: '#f5f5f5', color: '#666', border: '1px solid #e0e0e0' } };
    return <Chip label={config.label} size="small" sx={{ fontWeight: 700, fontSize: '0.8rem', px: 1.5, ...config.sx }} />;
  };

  const getSeverityChip = (severity) => {
    const severityConfig = {
      'low': { label: 'Thấp', sx: { bgcolor: '#e8f5e9', color: '#2e7d32', border: '1px solid #81c784' } },
      'medium': { label: 'Trung bình', sx: { bgcolor: '#fffde7', color: '#f9a825', border: '1px solid #ffe082' } },
      'high': { label: 'Cao', sx: { bgcolor: '#ffebee', color: '#d32f2f', border: '1px solid #e57373' } },
      'critical': { label: 'Nghiêm trọng', sx: { bgcolor: '#f5f5f5', color: '#666', border: '1px solid #e0e0e0' } }
    };
    const config = severityConfig[severity] || { label: severity, sx: { bgcolor: '#f5f5f5', color: '#666', border: '1px solid #e0e0e0' } };
    return <Chip label={config.label} size="small" sx={{ fontWeight: 700, fontSize: '0.8rem', px: 1.5, ...config.sx }} />;
  };

  // Thêm hàm helper phân trang giống WhiteList
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

  const handlePageChange = (event, page) => {
    setCurrentPage(page);
  };

  // 2. Reset form khi đóng modal thêm/sửa
  useEffect(() => {
    if (!openModal) {
      resetForm();
      setImageFile(null);
      setImagePreview(null);
      setOcrResult('');
      setDetectedPlateImage(null);
    }
  }, [openModal]);

  // Thêm vào đầu component BlackList:
  const [gotoPage, setGotoPage] = useState('');
  // ... existing code ...
  // Reset gotoPage khi currentPage thay đổi
  useEffect(() => { setGotoPage(''); }, [currentPage]);
  // ... existing code ...

  const handleItemsPerPageChange = (event) => {
    setItemsPerPage(parseInt(event.target.value));
    setCurrentPage(1);
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
                {hasCreateBlackList && (
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
                )}
                
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
      {/* ✅ SỬA: Thêm alignItems="center" và điều chỉnh spacing giống WhiteList */}
      <Grid container spacing={2} alignItems="center">
        <Grid item xs={12} sm={6} md={3}>
          {/* ✅ SỬA: Đây là TextField tìm kiếm, sử dụng filters.plate_number và validatePlateNumberSearch */}
          <TextField
            fullWidth
            label="Biển số xe"
            placeholder="Nhập biển số để tìm kiếm..."
            value={filters.plate_number} // ← SỬA: sử dụng filters.plate_number thay vì formData.plate_number
            onChange={(e) => handleFilterChange('plate_number', e.target.value)} // ← SỬA: sử dụng handleFilterChange
            size="small"
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                height: 40, // ← THÊM: Cố định chiều cao
                '&:hover fieldset': { borderColor: '#d32f2f' },
                '&.Mui-focused fieldset': { borderColor: '#d32f2f' }
              },
              '& .MuiInputLabel-root': {
                fontSize: '0.875rem' // ← THÊM: Cố định font size
              }
            }}
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={2}>
          <FormControl fullWidth size="small">
            <InputLabel sx={{ fontSize: '0.875rem' }}>Loại vi phạm</InputLabel>
            <Select
              value={filters.violation_type}
              label="Loại vi phạm"
              onChange={(e) => handleFilterChange('violation_type', e.target.value)}
              sx={{ 
                borderRadius: 2,
                height: 40, // ← THÊM: Cố định chiều cao
                '& .MuiSelect-select': {
                  padding: '8px 14px', // ← THÊM: Cố định padding
                  fontSize: '0.875rem'
                }
              }}
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
            <InputLabel sx={{ fontSize: '0.875rem' }}>Mức độ</InputLabel>
            <Select
              value={filters.severity}
              label="Mức độ"
              onChange={(e) => handleFilterChange('severity', e.target.value)}
              sx={{ 
                borderRadius: 2,
                height: 40, // ← THÊM: Cố định chiều cao
                '& .MuiSelect-select': {
                  padding: '8px 14px', // ← THÊM: Cố định padding
                  fontSize: '0.875rem'
                }
              }}
            >
              <MenuItem value="">Tất cả</MenuItem>
              <MenuItem value="low">Thấp</MenuItem>
              <MenuItem value="medium">Trung bình</MenuItem>
              <MenuItem value="high">Cao</MenuItem>
              <MenuItem value="critical">Nghiêm trọng</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6} md={2}>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<BiRefresh />}
            onClick={handleRefresh}
            disabled={loading}
            sx={{
              borderRadius: 2,
              height: 40, // ← THÊM: Cố định chiều cao
              textTransform: 'none',
              fontWeight: 600,
              borderColor: '#d32f2f',
              color: '#d32f2f',
              fontSize: '0.875rem', // ← THÊM: Cố định font size
              '&:hover': {
                borderColor: '#b71c1c',
                backgroundColor: 'rgba(211, 47, 47, 0.04)'
              }
            }}
          >
            Làm mới
          </Button>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          {selectedItems.length > 0 && (
            <Button
              fullWidth
              variant="outlined"
              color="error"
              startIcon={<BiSolidTrashAlt />}
              onClick={handleBulkDelete}
              sx={{
                borderRadius: 2,
                height: 40, // ← THÊM: Cố định chiều cao
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.875rem' // ← THÊM: Cố định font size
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
                      <TableCell sx={{ width: 60 }}>STT</TableCell>
                      <TableCell>Biển số</TableCell>
                      <TableCell sx={{ width: 120 }}>Ảnh biển số</TableCell>
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
                      blacklist.map((item, idx) => (
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
                          <TableCell>{idx + 1}</TableCell>
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
                                {hasViewBlackList && (
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
                                )}
                             
                              </Tooltip>
                              <Tooltip title="Chỉnh sửa">
                                {hasUpdateBlackList && (
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
                                )}
                              
                              </Tooltip>
                              <Tooltip title="Xóa">
                                {hasDeleteBlackList && (
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
                                )}
                              
                              </Tooltip>
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              {/* Enhanced Pagination - Đặt ở đây, ngay dưới bảng */}
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'stretch', md: 'center' }, justifyContent: 'space-between', gap: 2, p: 2, borderTop: '1px solid #e0e0e0', backgroundColor: '#fafafa' }}>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                  Hiển thị <strong>{((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalItems)}</strong> của <strong>{totalItems}</strong> bản ghi
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: 'center', gap: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" color="text.secondary">Hiển thị:</Typography>
                    <Select value={itemsPerPage} onChange={handleItemsPerPageChange} size="small" sx={{ minWidth: 80, '& .MuiSelect-select': { py: 0.5, fontSize: '0.875rem' } }}
                      renderValue={v => `${v}/ trang`}
                    >
                      {[5, 10, 20, 50, 100].map(size => (
                        <MenuItem key={size} value={size}>{size}/ trang</MenuItem>
                      ))}
                    </Select>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Button size="small" variant="outlined" onClick={() => setCurrentPage(1)} disabled={currentPage === 1} sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}><FirstPage fontSize="small" /></Button>
                    <Button size="small" variant="outlined" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}><ChevronLeft fontSize="small" /></Button>
                    {getPaginationItems(currentPage, totalPages).map((item, idx) => (
                      item === '...'
                        ? <Box key={`dots-${idx}`} sx={{ px: 1, color: '#999' }}>...</Box>
                        : <Button key={item} variant={item === currentPage ? 'contained' : 'outlined'} size="small" onClick={() => setCurrentPage(item)} sx={{ minWidth: 32, width: 32, height: 32, borderRadius: 1, fontSize: '0.875rem', fontWeight: item === currentPage ? 600 : 400, ...(item === currentPage ? { backgroundColor: '#1976d2', color: 'white', border: 'none', '&:hover': { backgroundColor: '#1565c0' } } : { borderColor: '#e0e0e0', color: '#666', '&:hover': { backgroundColor: '#f5f5f5', borderColor: '#1976d2' } }) }}>{item}</Button>
                    ))}
                    <Button size="small" variant="outlined" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages || totalPages === 0} sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}><ChevronRight fontSize="small" /></Button>
                    <Button size="small" variant="outlined" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages || totalPages === 0} sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}><LastPage fontSize="small" /></Button>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" color="text.secondary">Đến trang:</Typography>
                    <InputBase value={gotoPage} onChange={e => setGotoPage(e.target.value.replace(/[^0-9]/g, ''))} onKeyDown={e => { if (e.key === 'Enter') { const page = parseInt(gotoPage, 10); if (page && page >= 1 && page <= totalPages) { setCurrentPage(page); setGotoPage(''); } } }} placeholder="1" sx={{ width: 60, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, px: 1, fontSize: '0.875rem', '& input': { textAlign: 'center' } }} />
                    <Button size="small" variant="outlined" onClick={() => { const page = parseInt(gotoPage, 10); if (page && page >= 1 && page <= totalPages) { setCurrentPage(page); setGotoPage(''); } }} disabled={!gotoPage || parseInt(gotoPage, 10) < 1 || parseInt(gotoPage, 10) > totalPages} sx={{ minWidth: 'auto', px: 2, height: 32, textTransform: 'none', fontSize: '0.875rem' }}>Đi</Button>
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

      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="lg" fullWidth>
  <DialogTitle sx={{ 
    borderBottom: '1px solid #e0e0e0', 
    display: 'flex', 
    alignItems: 'center', 
    gap: 2,
    background: 'linear-gradient(135deg, #d32f2f 0%, #b71c1c 100%)',
    color: 'white'
  }}>
    <BlockIcon />
    {selectedItem ? 'Chỉnh sửa Blacklist' : 'Thêm Blacklist mới'}
  </DialogTitle>
  <form onSubmit={handleSubmit}>
    <DialogContent sx={{ p: 0 }}>
      <Grid container>
        {/* Left Panel - Image Upload */}
        <Grid item xs={12} md={5} sx={{ 
          borderRight: '1px solid #e0e0e0',
          background: '#f8f9fc'
        }}>
          <Box sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom sx={{ mb: 3, fontWeight: 600, color: '#d32f2f' }}>
              <PhotoCameraIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Ảnh biển số xe
            </Typography>
            
            {/* Upload Button */}
            <Button
  variant="outlined"
  component="label"
  startIcon={<ImageIcon />}
  fullWidth
  sx={{ 
    borderRadius: 2, 
    mb: 3, 
    py: 2,
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: '#d32f2f',
    color: '#d32f2f',
    '&:hover': { 
      borderStyle: 'dashed',
      backgroundColor: 'rgba(211, 47, 47, 0.04)'
    }
  }}
>
  {/* ✅ SỬA: Cập nhật text để rõ ràng rằng ảnh không bắt buộc */}
  {imageFile ? 'Đổi ảnh biển số' : (selectedItem ? 'Thay đổi ảnh (không bắt buộc)' : 'Upload ảnh biển số (không bắt buộc)')}
  <input type="file" accept="image/*" hidden onChange={handleImageChange} />
</Button>
            
            {/* Error Alert */}
            {formErrors.image && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {formErrors.image}
              </Alert>
            )}
            
            {/* Image Previews Section */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* SỬA: Ảnh gốc preview với logic đúng */}
              {(imagePreview || (selectedItem && selectedItem.plate_image_path)) && (
                <Card sx={{ 
                  border: '1px solid #e0e0e0',
                  borderRadius: 2,
                  overflow: 'hidden'
                }}>
                  <Box sx={{ 
                    backgroundColor: '#1976d2', 
                    color: 'white', 
                    px: 2, 
                    py: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1
                  }}>
                    <ImageIcon sx={{ fontSize: 16 }} />
                    <Typography variant="caption" fontWeight={600}>
                      Ảnh gốc
                    </Typography>
                  </Box>
                  <CardContent sx={{ p: 2 }}>
                    <Box
                      component="img"
                      src={
                        imagePreview || 
                        (selectedItem && selectedItem.plate_image_path 
                          ? `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${selectedItem.plate_image_path}?t=${Date.now()}`
                          : '')
                      }
                      alt="Ảnh gốc" 
                      sx={{ 
                        width: '100%', 
                        maxHeight: 200, 
                        objectFit: 'contain',
                        borderRadius: 1,
                        cursor: 'pointer',
                        transition: 'transform 0.2s ease',
                        '&:hover': {
                          transform: 'scale(1.02)'
                        }
                      }}
                      onClick={() => {
                        const src = imagePreview || 
                          (selectedItem && selectedItem.plate_image_path 
                            ? `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${selectedItem.plate_image_path}`
                            : '');
                        if (src) {
                          setImagePreviewDialog({ open: true, src, title: 'Ảnh gốc' });
                        }
                      }}
                    />
                  </CardContent>
                </Card>
              )}
              
              {/* Ảnh biển số đã detect */}
              {(detectedPlateImage || (selectedItem && selectedItem.detected_plate_image)) && (
                <Card sx={{ 
                  border: '2px solid #4caf50',
                  borderRadius: 2,
                  overflow: 'hidden'
                }}>
                  <Box sx={{ 
                    backgroundColor: '#4caf50', 
                    color: 'white', 
                    px: 2, 
                    py: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1
                  }}>
                    <CheckCircle sx={{ fontSize: 16 }} />
                    <Typography variant="caption" fontWeight={600}>
                      Biển số đã nhận diện
                    </Typography>
                  </Box>
                  <CardContent sx={{ p: 2 }}>
                    <Box
                      component="img"
                      src={
                        detectedPlateImage
                          ? `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${detectedPlateImage}?t=${Date.now()}`
                          : selectedItem && selectedItem.detected_plate_image
                            ? `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${selectedItem.detected_plate_image}?t=${Date.now()}`
                            : ''
                      }
                      alt="Biển số đã nhận diện" 
                      sx={{ 
                        width: '100%', 
                        maxHeight: 120, 
                        objectFit: 'contain',
                        borderRadius: 1,
                        cursor: 'pointer',
                        transition: 'transform 0.2s ease',
                        '&:hover': {
                          transform: 'scale(1.05)'
                        }
                      }}
                      onClick={() => {
                        const src = detectedPlateImage
                          ? `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${detectedPlateImage}`
                          : selectedItem && selectedItem.detected_plate_image
                            ? `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${selectedItem.detected_plate_image}`
                            : '';
                        if (src) {
                          setImagePreviewDialog({ open: true, src, title: 'Biển số đã nhận diện' });
                        }
                      }}
                    />
                  </CardContent>
                </Card>
              )}
              
              {/* OCR Result Alert */}
              {ocrResult && (
                <Alert 
                  severity="success" 
                  sx={{ 
                    fontWeight: 600,
                    '& .MuiAlert-message': {
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1
                    }
                  }}
                >
                  <CarIcon sx={{ fontSize: 20 }} />
                  <Box>
                    <Typography variant="body2" fontWeight={600}>
                      Biển số nhận diện:
                    </Typography>
                    <Typography variant="h6" sx={{ color: '#2e7d32', fontWeight: 700 }}>
                      {ocrResult}
                    </Typography>
                  </Box>
                </Alert>
              )}
            </Box>
          </Box>
        </Grid>

        {/* Right Panel - Form Fields */}
        <Grid item xs={12} md={7}>
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom sx={{ mb: 3, fontWeight: 600, color: '#d32f2f' }}>
              <DescriptionIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Thông tin chi tiết
            </Typography>
            
            <Grid container spacing={3}>
              {/* Biển số xe - Full width */}
             <Grid item xs={12}>
  {/* ✅ SỬA: Đây là TextField trong form thêm/sửa, sử dụng formData.plate_number và validatePlateNumberStrict */}
  <TextField
    fullWidth
    required
    label="Biển số xe"
    value={formData.plate_number} // ← ĐÚNG: sử dụng formData.plate_number
    onChange={(e) => {
      setFormData({...formData, plate_number: e.target.value});
      // Clear error khi user nhập lại
      if (formErrors.plate_number) {
        setFormErrors(prev => ({...prev, plate_number: ''}));
      }
    }}
    error={!!formErrors.plate_number}
    helperText={
      formErrors.plate_number || 
      (ocrResult ? "✓ Có gợi ý từ OCR - có thể chỉnh sửa" : "Bắt buộc. Định dạng: 30A-123.45, 51B1-4567, 30A1-456.78")
    }
    placeholder="VD: 30A-123.45, 51B1-4567"
    sx={{
      '& .MuiOutlinedInput-root': { 
        borderRadius: 2,
        backgroundColor: ocrResult ? '#e8f5e9' : 'white'
      },
      '& .MuiFormHelperText-root': {
        color: ocrResult ? '#2e7d32' : undefined,
        fontWeight: ocrResult ? 600 : undefined
      }
    }}
    InputProps={{
      startAdornment: (
        <InputAdornment position="start">
          <CarIcon color={ocrResult ? 'success' : 'action'} />
        </InputAdornment>
      )
    }}
  />
  {/* ✅ THÊM: Button áp dụng OCR result giống WhiteList */}
  {ocrResult && formData.plate_number !== ocrResult && (
    <Box sx={{ mt: 1 }}>
      <Button
        size="small"
        variant="outlined"
        color="success"
        onClick={() => {
          setFormData(prev => ({...prev, plate_number: ocrResult}));
          showSnackbar('Đã áp dụng kết quả OCR', 'success');
        }}
        sx={{ textTransform: 'none' }}
      >
        Áp dụng kết quả OCR: {ocrResult}
      </Button>
    </Box>
  )}
</Grid>
              
              {/* Loại vi phạm và Mức độ */}
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth required error={!!formErrors.violation_type}>
                  <InputLabel>Loại vi phạm</InputLabel>
                  <Select
                    value={formData.violation_type}
                    label="Loại vi phạm"
                    onChange={(e) => {
                      setFormData({...formData, violation_type: e.target.value});
                      setFormErrors(prev => ({...prev, violation_type: undefined}));
                    }}
                    sx={{ borderRadius: 2 }}
                  >
                    <MenuItem value="unauthorized">
                      <Box display="flex" alignItems="center" gap={1}>
                        <WarningIcon sx={{ fontSize: 16, color: '#ff9800' }} />
                        Không được phép
                      </Box>
                    </MenuItem>
                    <MenuItem value="security_threat">
                      <Box display="flex" alignItems="center" gap={1}>
                        <FaShieldAlt style={{ fontSize: 14, color: '#f44336' }} />
                        Đe dọa an ninh
                      </Box>
                    </MenuItem>
                    <MenuItem value="unpaid_fine">Chưa nộp phạt</MenuItem>
                    <MenuItem value="banned">Bị cấm</MenuItem>
                    <MenuItem value="suspicious">Đáng ngờ</MenuItem>
                    <MenuItem value="other">Khác</MenuItem>
                  </Select>
                  {formErrors.violation_type && (
                    <FormHelperText>{formErrors.violation_type}</FormHelperText>
                  )}
                </FormControl>
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth required error={!!formErrors.severity}>
                  <InputLabel>Mức độ</InputLabel>
                  <Select
                    value={formData.severity}
                    label="Mức độ"
                    onChange={(e) => {
                      setFormData({...formData, severity: e.target.value});
                      setFormErrors(prev => ({...prev, severity: undefined}));
                    }}
                    sx={{ borderRadius: 2 }}
                  >
                    <MenuItem value="low">
                      <Box display="flex" alignItems="center" gap={1}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#4caf50' }} />
                        Thấp
                      </Box>
                    </MenuItem>
                    <MenuItem value="medium">
                      <Box display="flex" alignItems="center" gap={1}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ff9800' }} />
                        Trung bình
                      </Box>
                    </MenuItem>
                    <MenuItem value="high">
                      <Box display="flex" alignItems="center" gap={1}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#f44336' }} />
                        Cao
                      </Box>
                    </MenuItem>
                    <MenuItem value="critical">
                      <Box display="flex" alignItems="center" gap={1}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#9c27b0' }} />
                        Nghiêm trọng
                      </Box>
                    </MenuItem>
                  </Select>
                  {formErrors.severity && (
                    <FormHelperText>{formErrors.severity}</FormHelperText>
                  )}
                </FormControl>
              </Grid>

              {/* Ngày hiệu lực */}
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
                        setFormData({ ...formData, valid_from: value });
                      } else {
                        setFormErrors(prev => ({ ...prev, valid_from: 'Định dạng ngày phải là dd/MM/yyyy' }));
                      }
                    }}
                    error={!!formErrors.valid_from}
                    helperText={formErrors.valid_from}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <CalendarIcon sx={{ color: '#1976d2' }} />
                        </InputAdornment>
                      ),
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
                        setFormData({ ...formData, valid_to: value });
                      } else {
                        setFormErrors(prev => ({ ...prev, valid_to: 'Định dạng ngày phải là dd/MM/yyyy' }));
                      }
                    }}
                    error={!!formErrors.valid_to}
                    helperText={formErrors.valid_to}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <CalendarIcon sx={{ color: '#1976d2' }} />
                        </InputAdornment>
                      ),
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
              
              {/* Lý do cấm */}
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  required
                  label="Lý do cấm"
                  multiline
                  rows={3}
                  placeholder="Nhập lý do cấm chi tiết (tối thiểu 10 ký tự)..."
                  value={formData.reason}
                  onChange={(e) => {
                    setFormData({...formData, reason: e.target.value});
                    setFormErrors(prev => ({...prev, reason: undefined}));
                  }}
                  error={!!formErrors.reason}
                  helperText={formErrors.reason || `${formData.reason.length}/500 ký tự`}
                  sx={{ 
                    '& .MuiOutlinedInput-root': { borderRadius: 2 },
                    '& .MuiFormHelperText-root': {
                      display: 'flex',
                      justifyContent: 'space-between'
                    }
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start" sx={{ alignSelf: 'flex-start', mt: 1 }}>
                        <WarningAmberIcon color={formErrors.reason ? 'error' : 'action'} />
                      </InputAdornment>
                    )
                  }}
                />
              </Grid>
              
              {/* Ghi chú chi tiết */}
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Ghi chú chi tiết"
                  multiline
                  rows={2}
                  placeholder="Nhập ghi chú bổ sung (không bắt buộc)..."
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start" sx={{ alignSelf: 'flex-start', mt: 1 }}>
                        <Info color="action" />
                      </InputAdornment>
                    )
                  }}
                />
              </Grid>
            </Grid>
          </Box>
        </Grid>
      </Grid>
    </DialogContent>
    <DialogActions sx={{ 
      p: 3, 
      borderTop: '1px solid #e0e0e0',
      background: '#f8f9fc',
      gap: 2 
    }}>
      <Button 
        onClick={() => setOpenModal(false)}
        variant="outlined"
        sx={{ 
          borderRadius: 2, 
          px: 4, 
          py: 1.5,
          textTransform: 'none',
          fontWeight: 600,
          borderColor: '#d32f2f',
          color: '#d32f2f',
          '&:hover': {
            backgroundColor: 'rgba(211, 47, 47, 0.04)',
            borderColor: '#b71c1c'
          }
        }}
      >
        <Cancel sx={{ mr: 1 }} />
        Hủy
      </Button>
      <Button 
        type="submit" 
        variant="contained" 
        disabled={loading}
        startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <FaSave />}
        sx={{ 
          borderRadius: 2, 
          px: 4, 
          py: 1.5,
          textTransform: 'none',
          fontWeight: 600,
          backgroundColor: '#d32f2f',
          boxShadow: '0 2px 8px rgba(211, 47, 47, 0.3)',
          '&:hover': {
            backgroundColor: '#b71c1c',
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
      <Dialog open={openDetailModal} onClose={() => setOpenDetailModal(false)} maxWidth="md" fullWidth
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
          background: 'linear-gradient(135deg, #d32f2f 0%, #b71c1c 100%)',
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
                  <BlockIcon sx={{ fontSize: '2rem' }} />
                </Avatar>
                <Box flex={1}>
                  <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
                    {selectedItem?.plate_number || 'N/A'}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9, mb: 1 }}>
                    Chi tiết thông tin blacklist
                  </Typography>
                  <Box display="flex" gap={1} flexWrap="wrap">
                    {selectedItem && getStatusChip(selectedItem.current_status)}
                    {selectedItem && getSeverityChip(selectedItem.severity)}
                    {selectedItem && getViolationTypeChip(selectedItem.violation_type)}
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
                <CloseIcon />
              </IconButton>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {selectedItem && (
            <Box>
              <Box sx={{ p: 3, background: '#f8f9fc' }}>
                <Grid container spacing={3}>
                  {/* Left Info */}
                  <Grid item xs={12} md={8}>
                    <Grid container spacing={3}>
              
              
                      <Grid item xs={12} md={12}>
                        <Card sx={{ height: '100%', borderRadius: 2, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)', border: '1px solid #e0e0e0' }}>
                          <CardContent sx={{ p: 2.5 }}>
                            <Box display="flex" alignItems="center" gap={1} mb={2}>
                              <CalendarIcon sx={{ color: '#d32f2f', fontSize: '1.2rem' }} />
                              <Typography variant="h6" sx={{ color: '#d32f2f', fontWeight: 600 }}>
                                Thời gian hiệu lực
                </Typography>
                            </Box>
                            <Box sx={{ pl: 0.5 }}>
                              <Box display="flex" alignItems="center" gap={1} mb={1}>
                                <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#d32f2f' }} />
                                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 60 }}>
                                  Từ:
                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  {selectedItem.valid_from ? formatDateForDisplay(selectedItem.valid_from) : 'Vĩnh viễn'}
                                </Typography>
                              </Box>
                              <Box display="flex" alignItems="center" gap={1} mb={1}>
                                <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#d32f2f' }} />
                                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 60 }}>
                                  Đến:
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  {selectedItem.valid_to ? formatDateForDisplay(selectedItem.valid_to) : 'Vĩnh viễn'}
                                </Typography>
                              </Box>
                            </Box>
                          </CardContent>
                        </Card>
                      </Grid>
                    </Grid>
                  </Grid>
                  {/* Right: Images & Reason */}
                  <Grid item xs={12} md={4}>
                    <Card sx={{ borderRadius: 2, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)', border: '1px solid #e0e0e0', mb: 3 }}>
                      <CardContent sx={{ p: 2.5 }}>
                        <Box display="flex" alignItems="center" gap={1} mb={2}>
                          <ImageIcon sx={{ color: '#d32f2f', fontSize: '1.2rem' }} />
                          <Typography variant="h6" sx={{ color: '#d32f2f', fontWeight: 600 }}>
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
                                border: '2px solid #d32f2f',
                                cursor: 'pointer',
                                transition: 'transform 0.2s ease',
                                '&:hover': { transform: 'scale(1.05)', boxShadow: '0 4px 12px rgba(211, 47, 47, 0.3)' }
                              }}
                              onClick={() => {
                                window.open(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${selectedItem.detected_plate_image}`, '_blank');
                              }}
                            />
                            <Typography variant="caption" sx={{ color: '#666', mt: 1, textAlign: 'center' }}>
                              Ảnh biển số đã phát hiện<br/>(Click để xem lớn)
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
                                '&:hover': { transform: 'scale(1.05)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }
                              }}
                              onClick={() => {
                                window.open(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${selectedItem.plate_image_path}`, '_blank');
                              }}
                            />
                            <Typography variant="caption" sx={{ color: '#666', mt: 1, textAlign: 'center' }}>
                              Ảnh biển số gốc<br/>(Click để xem lớn)
                            </Typography>
                          </Box>
                        ) : (
                          <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" sx={{ height: 150, backgroundColor: '#f5f5f5', borderRadius: 2, border: '1px solid #e0e0e0' }}>
                            <ImageIcon sx={{ fontSize: 40, color: '#ccc', mb: 1 }} />
                            <Typography variant="caption" color="text.secondary" textAlign="center">
                              Không có ảnh
                            </Typography>
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                    <Card sx={{ borderRadius: 2, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)', border: '1px solid #e0e0e0', mb: 3 }}>
                      <CardContent sx={{ p: 2.5 }}>
                        <Box display="flex" alignItems="center" gap={1} mb={2}>
                          <DescriptionIcon sx={{ color: '#d32f2f', fontSize: '1.2rem' }} />
                          <Typography variant="h6" sx={{ color: '#d32f2f', fontWeight: 600 }}>
                            Lý do cấm
                          </Typography>
                        </Box>
                        <Box sx={{ p: 2, borderRadius: 2, backgroundColor: '#f8f9fa', border: '1px solid #e9ecef' }}>
                          <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
                            {selectedItem.reason || 'Không có lý do'}
                          </Typography>
                        </Box>
                      </CardContent>
                    </Card>
                {selectedItem.description && (
                      <Card sx={{ borderRadius: 2, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)', border: '1px solid #e0e0e0' }}>
                        <CardContent sx={{ p: 2.5 }}>
                          <Box display="flex" alignItems="center" gap={1} mb={2}>
                            <DescriptionIcon sx={{ color: '#d32f2f', fontSize: '1.2rem' }} />
                            <Typography variant="h6" sx={{ color: '#d32f2f', fontWeight: 600 }}>
                              Ghi chú
                            </Typography>
                          </Box>
                          <Box sx={{ p: 2, borderRadius: 2, backgroundColor: '#f8f9fa', border: '1px solid #e9ecef' }}>
                            <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
                              {selectedItem.description}
                            </Typography>
                          </Box>
                        </CardContent>
                      </Card>
                )}
              </Grid>
            </Grid>
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
              borderColor: '#d32f2f',
              color: '#d32f2f',
              '&:hover': {
                backgroundColor: 'rgba(211, 47, 47, 0.04)',
                borderColor: '#b71c1c'
              }
            }}
          >
            <CloseIcon style={{ marginRight: 8 }} />
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
                backgroundColor: '#d32f2f',
                boxShadow: '0 2px 8px rgba(211, 47, 47, 0.3)',
                '&:hover': {
                  backgroundColor: '#b71c1c',
                  boxShadow: '0 4px 12px rgba(211, 47, 47, 0.4)'
                }
              }}
            >
              <EditIcon style={{ marginRight: 8 }} />
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
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#222' }}>
              Xác nhận xóa
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 3, pt: 4 }}>
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