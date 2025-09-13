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
  Snackbar,
  Stack,
  InputAdornment,
  InputBase,
    Tooltip
} from '@mui/material';
import {
  Add as AddIcon,
  LocationOn as LocationIcon,
  Person as PersonIcon,
  DirectionsCar as CarIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
  Home as HomeIcon,
  ExpandMore as ExpandMoreIcon,
  Description as DescriptionIcon,
  Schedule as ScheduleIcon,
  Image as ImageIcon,
  FirstPage,
  LastPage,
  ChevronLeft,
  ChevronRight,
    CheckCircle as CheckIcon,
  Error as ErrorIcon,
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


const validateVietnamesePlateNumber = (plateNumber) => {
  if (!plateNumber || typeof plateNumber !== 'string') {
    return { isValid: false, message: 'Biển số không được để trống' };
  }

  const cleanPlate = plateNumber.trim().toUpperCase();

  // Patterns cho các loại biển số Việt Nam
  const patterns = {
    // Ô tô
    car_short: /^\d{2}[A-Z]-\d{2}\.\d{2}$/,           // 29A-12.34
    car_standard: /^\d{2}[A-Z]-\d{3}\.\d{2}$/,        // 29A-123.45
    car_long: /^\d{2}[A-Z]-\d{4}\.\d{2}$/,            // 29A-1234.56
    
    // Xe máy cũ
    motorcycle_old: /^\d{2}[A-Z]\d-\d{4}$/,           // 29A1-2345
    
    // Xe máy mới
    motorcycle_new: /^\d{2}[A-Z]\d-\d{3}\.\d{2}$/,    // 29A1-123.45
    
    // Taxi
    taxi: /^\d{2}[A-Z]-\d{5,}$/,                      // 29A-12345+
    
    // Ngoại giao
    diplomatic: /^\d{2}[A-Z]{2}-\d{2,3}\.\d{2}$/,     // 29AB-12.34 hoặc 29AB-123.45
    
    // Quân đội (thêm pattern)
    military: /^[A-Z]{2}\d{4}$/,                      // QD1234
    
    // Cảnh sát (thêm pattern) 
    police: /^[A-Z]{2}\d{4}$/                         // CS1234
  };

  // Kiểm tra từng pattern
  for (const [type, pattern] of Object.entries(patterns)) {
    if (pattern.test(cleanPlate)) {
      // Kiểm tra mã tỉnh hợp lệ (01-99, trừ một số mã không dùng)
      if (type !== 'military' && type !== 'police') {
        const provinceCode = parseInt(cleanPlate.substring(0, 2));
        if (provinceCode < 10 || provinceCode > 99) {
          return { isValid: false, message: 'Mã tỉnh không hợp lệ (phải từ 10-99)' };
        }
      }

      return { 
        isValid: true, 
        message: `Biển số ${getVehicleTypeName(type)} hợp lệ`,
        vehicleType: type,
        formattedPlate: cleanPlate
      };
    }
  }

  // Nếu không khớp pattern nào, đưa ra gợi ý format
  return { 
    isValid: false, 
    message: `Format biển số không đúng. Các format hợp lệ:
    • Ô tô: 30A-123.45, 30A-12.34, 30A-1234.56
    • Xe máy cũ: 30A1-2345
    • Xe máy mới: 30A1-123.45
    • Taxi: 30A-12345
    • Ngoại giao: 30AB-123.45`
  };
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

// ✅ THÊM: Validation linh hoạt cho Search
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
const getVehicleTypeName = (type) => {
  const typeNames = {
    car_short: 'ô tô',
    car_standard: 'ô tô',
    car_long: 'ô tô',
    motorcycle_old: 'xe máy cũ',
    motorcycle_new: 'xe máy mới',
    taxi: 'taxi',
    diplomatic: 'ngoại giao',
    military: 'quân đội',
    police: 'cảnh sát'
  };
  return typeNames[type] || 'xe';
};

// Hàm format tự động biển số
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
  const [hasCreateWhiteList, setHasCreateWhiteList] = useState(false);
  const [hasUpdateWhiteList, setHasUpdateWhiteList] = useState(false);
  const [hasViewWhiteList, setHasViewWhiteList] = useState(false);
  const [hasDeleteWhiteList, setHasDeleteWhiteList] = useState(false);
  // Filters
  const [filters, setFilters] = useState({
    plate_number: '',
    approval_status: '',
    is_active: '',
    valid_status: ''
  });

  // Form data
  const [formData, setFormData] = useState({
    plate_number: '',
    vehicle_id: '',
    valid_from: '',
    valid_to: '',
    description: '',
    approval_status: 'approved'
  });
  useEffect(() => {
          const storedUser = localStorage.getItem('user');
          if (storedUser ) {
              try {
                  const user = JSON.parse(storedUser); // Parse dữ liệu user
                  const permissions = user.permissions || [];
                  setHasCreateWhiteList(permissions.some(permission => permission.code === 'whitelist.create'));
                  setHasUpdateWhiteList(permissions.some(permission => permission.code === 'whitelist.update'));
                  setHasViewWhiteList(permissions.some(permission => permission.code === 'whitelist.view_detail'));
                  setHasDeleteWhiteList(permissions.some(permission => permission.code === 'whitelist.delete'));

              } catch (error) {
                  console.error('Error parsing permissions:', error);
              }
          }
      }, []);
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

  // Thêm vào đầu component WhiteList:
  const [gotoPage, setGotoPage] = useState('');

  // Reset gotoPage khi currentPage thay đổi
  useEffect(() => { setGotoPage(''); }, [currentPage]);

  // Load data
 useEffect(() => {
  const loadData = async () => {
    await loadWhitelist();
    await loadStatistics();
  };
  loadData();
}, [currentPage, itemsPerPage, filters]);

const validateForm = () => {
  const errors = {};
  
  // ✅ SỬA: Sử dụng validation nghiêm ngặt cho Add/Update
  const plateValidation = validatePlateNumberStrict(formData.plate_number);
  if (!plateValidation.isValid) {
    errors.plate_number = plateValidation.message;
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
      showSnackbar('Vui lòng chọn file ảnh', 'error');
      return;
    }
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      showSnackbar('Kích thước file không được vượt quá 10MB', 'error');
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
        // ✅ SỬA: Chỉ gợi ý biển số từ OCR, không bắt buộc
        setFormData(prev => ({ 
          ...prev, 
          plate_number: data.ocr_text // Chỉ cập nhật nếu chưa có giá trị
        }));
        setOcrResult(data.ocr_text);
        showSnackbar(`Nhận diện thành công biển số: ${data.ocr_text}`, 'success');
        
        if (data.detected_plate_image) {
          setDetectedPlateImage(data.detected_plate_image);
        } else {
          setDetectedPlateImage(null);
        }
      } else if (data.message) {
        setOcrResult('');
        setDetectedPlateImage(null);
        showSnackbar('Nhận diện ký tự thất bại: ' + data.message, 'warning');
      }
    } catch (err) {
      setOcrResult('');
      showSnackbar('Lỗi nhận diện ký tự: ' + (err.response?.data?.message || err.message), 'error');
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
  console.log('=== DEBUG FormData ===');
    console.log('formData:', formData);
    console.log('imageFile:', imageFile);
    console.log('selectedItem:', selectedItem);
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
          if (imageFile) {
              const formDataToSend = new FormData();
              // CHỈ gửi các trường còn dùng
              const whitelistFields = [
                  'plate_number',
                  'vehicle_id',
                  'valid_from',
                  'valid_to',
                  'description',
                  'approval_status'
              ];
              whitelistFields.forEach((key) => {
                  const value = processedFormData[key];
                  if (value !== null && value !== undefined) {
                      formDataToSend.append(key, value.toString());
                  }
              });
              formDataToSend.append('plate_image', imageFile);
              formDataToSend.append('replace_images', 'true');
              response = await editData(`/api/whitelist/${selectedItem.id}`, formDataToSend, token);
          } else {
              response = await editData(`/api/whitelist/${selectedItem.id}`, processedFormData, token);
          }
      } else {
          // Create new item
          if (imageFile) {
    const formDataToSend = new FormData();
    const whitelistFields = [
        'plate_number',
        'vehicle_id',
        'description',
        'approval_status'
    ];
    // Append các trường text (trừ ngày)
    whitelistFields.forEach((key) => {
        let value = processedFormData[key];
        if (value !== null && value !== undefined && value !== '') {
            formDataToSend.append(key, value);
        }
    });
    // Xử lý ngày tháng
    if (processedFormData.valid_from) {
        formDataToSend.append('valid_from', formatDateForInput(processedFormData.valid_from));
    }
    if (processedFormData.valid_to) {
        formDataToSend.append('valid_to', formatDateForInput(processedFormData.valid_to));
    }
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
        console.log('API Response:', response); // ← THÊM DÒNG NÀY ĐỂ DEBUG
        console.log('detected_plate_image:', response.data?.detected_plate_image);
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
    plate_number: item.plate_number || '', // Đảm bảo luôn có giá trị
    vehicle_id: item.vehicle_id || '',
    valid_from: item.valid_from || '',
    valid_to: item.valid_to || '',
    description: item.description || '',
    approval_status: item.approval_status || 'approved'
  });
  setFormErrors({});
  setImageFile(null);
  setOcrResult(item.plate_number || '');
  // Hiển thị preview ảnh như BlackList
  if (item.detected_plate_image) {
            setImagePreview(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${item.detected_plate_image}`);
    setDetectedPlateImage(item.detected_plate_image);
  } else if (item.plate_image_path) {
          setImagePreview(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${item.plate_image_path}`);
    setDetectedPlateImage(null);
  } else {
    setImagePreview(null);
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
      plate_number: '',
      vehicle_id: '',
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
     if (key === 'plate_number') {
      const searchValidation = validatePlateNumberSearch(value);
      if (!searchValidation.isValid) {
        showSnackbar(searchValidation.message, 'warning');
      }
    }
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
      'valid': { label: 'Có hiệu lực', sx: { bgcolor: '#e8f5e9', color: '#2e7d32', border: '1px solid #81c784' } },
      'expired': { label: 'Hết hạn', sx: { bgcolor: '#ffebee', color: '#d32f2f', border: '1px solid #e57373' } },
      'future': { label: 'Chưa có hiệu lực', sx: { bgcolor: '#fffde7', color: '#f9a825', border: '1px solid #ffe082' } },
      'permanent': { label: 'Vĩnh viễn', sx: { bgcolor: '#e3f2fd', color: '#1976d2', border: '1px solid #64b5f6' } }
    };
    const config = statusConfig[status] || { label: status, sx: { bgcolor: '#f5f5f5', color: '#666', border: '1px solid #e0e0e0' } };
    return <Chip label={config.label} size="small" sx={{ fontWeight: 700, fontSize: '0.8rem', px: 1.5, ...config.sx }} />;
  };

  const getApprovalChip = (status) => {
    const statusConfig = {
      'approved': { label: 'Đã phê duyệt', sx: { bgcolor: '#e8f5e9', color: '#2e7d32', border: '1px solid #81c784' } },
      'pending': { label: 'Chờ phê duyệt', sx: { bgcolor: '#fffde7', color: '#f9a825', border: '1px solid #ffe082' } },
      'rejected': { label: 'Từ chối', sx: { bgcolor: '#ffebee', color: '#d32f2f', border: '1px solid #e57373' } }
    };
    const config = statusConfig[status] || { label: status, sx: { bgcolor: '#f5f5f5', color: '#666', border: '1px solid #e0e0e0' } };
    return <Chip label={config.label} size="small" sx={{ fontWeight: 700, fontSize: '0.8rem', px: 1.5, ...config.sx }} />;
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
                {hasCreateWhiteList && (
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
                )}

                
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
         <Box sx={{ px: 3, mb: 3 }}>
  <Card sx={{ 
    background: 'white',
    borderRadius: 3,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    border: '1px solid #e0e0e0'
  }}>
    <CardContent>
      {/* ✅ SỬA: Thêm alignItems="center" và điều chỉnh spacing */}
      <Grid container spacing={2} alignItems="center">
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
                height: 40, // ✅ THÊM: Cố định chiều cao
                '&:hover fieldset': { borderColor: '#1976d2' },
                '&.Mui-focused fieldset': { borderColor: '#1976d2' }
              },
              '& .MuiInputLabel-root': {
                fontSize: '0.875rem' // ✅ THÊM: Cố định font size
              }
            }}
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={2}>
          <FormControl fullWidth size="small">
            <InputLabel sx={{ fontSize: '0.875rem' }}>Phê duyệt</InputLabel>
            <Select
              value={filters.approval_status}
              label="Phê duyệt"
              onChange={(e) => handleFilterChange('approval_status', e.target.value)}
              sx={{ 
                borderRadius: 2,
                height: 40, // ✅ THÊM: Cố định chiều cao
                '& .MuiSelect-select': {
                  padding: '8px 14px', // ✅ THÊM: Cố định padding
                  fontSize: '0.875rem'
                }
              }}
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
            <InputLabel sx={{ fontSize: '0.875rem' }}>Hiệu lực</InputLabel>
            <Select
              value={filters.valid_status}
              label="Hiệu lực"
              onChange={(e) => handleFilterChange('valid_status', e.target.value)}
              sx={{ 
                borderRadius: 2,
                height: 40, // ✅ THÊM: Cố định chiều cao
                '& .MuiSelect-select': {
                  padding: '8px 14px', // ✅ THÊM: Cố định padding
                  fontSize: '0.875rem'
                }
              }}
            >
              <MenuItem value="">Tất cả</MenuItem>
              <MenuItem value="valid">Có hiệu lực</MenuItem>
              <MenuItem value="expired">Hết hạn</MenuItem>
              <MenuItem value="future">Chưa có hiệu lực</MenuItem>
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
              height: 40, // ✅ THÊM: Cố định chiều cao
              textTransform: 'none',
              fontWeight: 600,
              borderColor: '#1976d2',
              color: '#1976d2',
              fontSize: '0.875rem', // ✅ THÊM: Cố định font size
              '&:hover': {
                borderColor: '#1565c0',
                backgroundColor: 'rgba(25, 118, 210, 0.04)'
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
                height: 40, // ✅ THÊM: Cố định chiều cao
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.875rem' // ✅ THÊM: Cố định font size
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
    <TableCell sx={{ width: 60 }}>STT</TableCell>
    <TableCell>Biển số</TableCell>
    <TableCell>Ảnh biển số</TableCell>
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
                      whitelist.map((item, idx) => (
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
                          <TableCell>{idx + 1}</TableCell>
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
    // Fallback to original image
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
        cursor: 'pointer'
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
                              {hasViewWhiteList && (
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
                              )}
                              {hasUpdateWhiteList && (
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
                              )}
                              {hasDeleteWhiteList && (
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
                              )}
                              
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Enhanced Pagination */}
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'stretch', md: 'center' }, justifyContent: 'space-between', gap: 2, p: 2, borderTop: '1px solid #e0e0e0', backgroundColor: '#fafafa' }}>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                  Hiển thị <strong>{((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalItems)}</strong> của <strong>{totalItems}</strong> bản ghì
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

      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="lg" fullWidth>
  <DialogTitle sx={{ 
    borderBottom: '1px solid #e0e0e0', 
    display: 'flex', 
    alignItems: 'center', 
    gap: 2,
    background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)',
    color: 'white'
  }}>
    <CheckCircleOutlineIcon />
    {selectedItem ? 'Chỉnh sửa Whitelist' : 'Thêm Whitelist mới'}
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
            <Typography variant="h6" gutterBottom sx={{ mb: 3, fontWeight: 600, color: '#1976d2' }}>
              <ImageIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Ảnh biển số xe
            </Typography>
            
            {/* Upload Button */}
            <Button
              variant="outlined"
              component="label"
              startIcon={<FaUpload />}
              fullWidth
              sx={{ 
                borderRadius: 2, 
                mb: 3, 
                py: 2,
                borderStyle: 'dashed',
                borderWidth: 2,
                borderColor: '#1976d2',
                color: '#1976d2',
                '&:hover': { 
                  borderStyle: 'dashed',
                  backgroundColor: 'rgba(25, 118, 210, 0.04)'
                }
              }}
            >
             {imageFile ? 'Đổi ảnh biển số' : (selectedItem ? 'Thay đổi ảnh (không bắt buộc)' : 'Upload ảnh biển số (không bắt buộc)')}
            <input type="file" accept="image/*" hidden onChange={handleImageChange} />
            </Button>
            
            {/* Image Previews Section */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* Ảnh gốc preview */}
              {(imagePreview || (selectedItem && (selectedItem.plate_image_path || selectedItem.detected_plate_image))) && (
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
                      {imagePreview ? 'Ảnh mới upload' : 'Ảnh hiện tại'}
                    </Typography>
                  </Box>
                  <CardContent sx={{ p: 2 }}>
                    <Box
                      component="img"
                      src={
                        imagePreview || 
                        (selectedItem && selectedItem.detected_plate_image 
                          ? `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${selectedItem.detected_plate_image}?t=${Date.now()}`
                          : selectedItem && selectedItem.plate_image_path
                            ? `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${selectedItem.plate_image_path}?t=${Date.now()}`
                            : '')
                      }
                      alt="Ảnh biển số" 
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
                          (selectedItem && selectedItem.detected_plate_image 
                            ? `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${selectedItem.detected_plate_image}`
                            : selectedItem && selectedItem.plate_image_path
                              ? `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${selectedItem.plate_image_path}`
                              : '');
                        if (src) {
                          window.open(src, '_blank');
                        }
                      }}
                    />
                    {imagePreview && (
                      <Button 
                        size="small" 
                        color="error" 
                        onClick={() => { 
                          setImageFile(null); 
                          setImagePreview(null); 
                          setOcrResult(''); 
                          setDetectedPlateImage(null); 
                        }} 
                        sx={{ mt: 1, width: '100%' }}
                      >
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}
              
              {/* Ảnh biển số đã detect từ upload mới */}
              {detectedPlateImage && imagePreview && (
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
                    <CheckIcon sx={{ fontSize: 16 }} />
                    <Typography variant="caption" fontWeight={600}>
                      Biển số đã nhận diện
                    </Typography>
                  </Box>
                  <CardContent sx={{ p: 2 }}>
                    <Box
                      component="img"
                      src={`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${detectedPlateImage}?t=${Date.now()}`}
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
                        window.open(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${detectedPlateImage}`, '_blank');
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
            <Typography variant="h6" gutterBottom sx={{ mb: 3, fontWeight: 600, color: '#1976d2' }}>
              <DescriptionIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Thông tin chi tiết
            </Typography>
            
            <Grid container spacing={3}>
              {/* Biển số xe - Full width */}
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  required
                  label="Biển số xe"
                  value={formData.plate_number}
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
                    (ocrResult ? "✓ Có gợi ý từ OCR" : "Định dạng: 30A-123.45, 51B1-4567, 30A1-456.78")
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
              </Grid>
              
              {/* Trạng thái phê duyệt - Full width */}
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Trạng thái phê duyệt</InputLabel>
                  <Select
                    value={formData.approval_status}
                    label="Trạng thái phê duyệt"
                    onChange={(e) => setFormData({...formData, approval_status: e.target.value})}
                    sx={{ borderRadius: 2 }}
                  >
                    <MenuItem value="approved">
                      <Box display="flex" alignItems="center" gap={1}>
                        <CheckIcon sx={{ fontSize: 16, color: '#4caf50' }} />
                        Đã phê duyệt
                      </Box>
                    </MenuItem>
                    <MenuItem value="pending">
                      <Box display="flex" alignItems="center" gap={1}>
                        <ScheduleIcon sx={{ fontSize: 16, color: '#ff9800' }} />
                        Chờ phê duyệt
                      </Box>
                    </MenuItem>
                    <MenuItem value="rejected">
                      <Box display="flex" alignItems="center" gap={1}>
                        <ErrorIcon sx={{ fontSize: 16, color: '#f44336' }} />
                        Từ chối
                      </Box>
                    </MenuItem>
                  </Select>
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
                          <ScheduleIcon sx={{ color: '#1976d2' }} />
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
                          <ScheduleIcon sx={{ color: '#1976d2' }} />
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
              </Grid>
              
              {/* Ghi chú */}
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Ghi chú"
                  multiline
                  rows={3}
                  placeholder="Nhập ghi chú chi tiết (không bắt buộc)..."
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  sx={{ 
                    '& .MuiOutlinedInput-root': { borderRadius: 2 },
                    '& .MuiFormHelperText-root': {
                      display: 'flex',
                      justifyContent: 'space-between'
                    }
                  }}
                  helperText={`${formData.description.length}/500 ký tự`}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start" sx={{ alignSelf: 'flex-start', mt: 1 }}>
                        <DescriptionIcon color="action" />
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
          borderColor: '#1976d2',
          color: '#1976d2',
          '&:hover': {
            backgroundColor: 'rgba(25, 118, 210, 0.04)',
            borderColor: '#1565c0'
          }
        }}
      >
        <FaTimes style={{ marginRight: 8 }} />
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
          backgroundColor: '#1976d2',
          boxShadow: '0 2px 8px rgba(25, 118, 210, 0.3)',
          '&:hover': {
            backgroundColor: '#1565c0',
            boxShadow: '0 4px 12px rgba(25, 118, 210, 0.4)'
          }
        }}
      >
        {selectedItem ? 'Cập nhật' : 'Tạo mới'}
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
              
             <Box sx={{ px: 3, py: 2, backgroundColor: '#f8f9fc' }}>
        <Typography variant="h6" sx={{ color: '#1976d2', fontWeight: 600, mb: 2 }}>
          <ImageIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Ảnh biển số xe
        </Typography>
        
        <Grid container spacing={2}>
          {/* Ảnh biển số đã phát hiện (ưu tiên) */}
          {selectedItem.detected_plate_image && (
            <Grid item xs={12} sm={6}>
              <Card sx={{ 
                borderRadius: 2,
                overflow: 'hidden',
                border: '2px solid #4caf50',
                boxShadow: '0 4px 12px rgba(76, 175, 80, 0.2)'
              }}>
                <Box sx={{ 
                  backgroundColor: '#4caf50', 
                  color: 'white', 
                  p: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1
                }}>
                  <CheckIcon sx={{ fontSize: 18 }} />
                  <Typography variant="subtitle2" fontWeight={600}>
                    Biển số đã nhận diện
                  </Typography>
                </Box>
                <Box sx={{ p: 2 }}>
                  <Box
                    component="img"
                    src={`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${selectedItem.detected_plate_image}`}
                    alt="Ảnh biển số"
                    sx={{
                      width: '100%',
                      height: 120,
                      objectFit: 'contain',
                      borderRadius: 1,
                      cursor: 'pointer',
                      transition: 'transform 0.2s ease',
                      '&:hover': {
                        transform: 'scale(1.05)'
                      }
                    }}
                    onClick={() => {
                      window.open(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${selectedItem.detected_plate_image}`, '_blank');
                    }}
                    title="Click để xem ảnh lớn"
                  />
                </Box>
              </Card>
            </Grid>
          )}
          
          
          
          {/* Trường hợp không có ảnh */}
          {!selectedItem.detected_plate_image && !selectedItem.plate_image_path && (
            <Grid item xs={12}>
              <Card sx={{ 
                borderRadius: 2,
                overflow: 'hidden',
                border: '1px dashed #e0e0e0',
                backgroundColor: '#f9f9f9'
              }}>
                <Box sx={{ 
                  p: 4,
                  textAlign: 'center'
                }}>
                  <ImageIcon sx={{ fontSize: 48, color: '#ccc', mb: 2 }} />
                  <Typography variant="body2" color="text.secondary">
                    Không có ảnh biển số
                  </Typography>
                </Box>
              </Card>
            </Grid>
          )}
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
                  borderRadius:  2,
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
        <DialogContent sx={{ p: 3, pt: 4 }}>
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