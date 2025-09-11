import React, { useState, useRef, useEffect, useCallback } from "react";
import CameraConfigurationPage from "./CameraConfigurationPage";
import CameraActionBar from "./CameraActionBar";
import "./SamplePage.css";
import ReactDOM from "react-dom";
import { fetchDataFromAPI, postData } from "../../utils/auth";
import CameraViewer from "../../components/CameraViewer";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  Grid,
  Paper,
  Select,
  MenuItem,
  InputBase,
  Alert,
  CircularProgress,
  Tooltip,
  TextField,
  FormControl,
  InputLabel,
  InputAdornment,
  Snackbar
} from '@mui/material';
import {
  Visibility as ViewIcon,
  CloudUpload as UploadIcon,
  Clear as ClearIcon,
  FirstPage,
  LastPage,
  ChevronLeft,
  ChevronRight,
  Camera as CameraIcon,
  VideoLibrary as VideoIcon,
  VideoLibrary,
  Search as SearchIcon,
  LocationOn as LocationIcon,
  FilterList,
  Refresh,
  Description
} from '@mui/icons-material';

const SamplePage = () => {
  const [cameraPositions, setCameraPositions] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [showConfig, setShowConfig] = useState(false);
  const [selectedCameraId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState({}); // Thêm state cho ghi hình
  const [muted, setMuted] = useState({}); // State cho âm thanh
  const [playing, setPlaying] = useState({}); // State cho phát video
  const [recordingTimers, setRecordingTimers] = useState({}); // State cho timer ghi hình
  const [currentQuality, setCurrentQuality] = useState({}); // State cho chất lượng hiện tại
  const isLoadingStream = useRef(false);
  const [pendingCameraId, setPendingCameraId] = useState(null);
  const [rtspStreams, setRtspStreams] = useState({});
  const [selectedStreams, setSelectedStreams] = useState([]);
  const camerasRef = useRef([]);
  const resizeRefs = useRef({});
  const [cameraSizes, setCameraSizes] = useState({});
  const [uploadedVideos, setUploadedVideos] = useState({});
  const [videos, setVideos] = useState([]);

  // States cho detection results
  const [detectionResults, setDetectionResults] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [lastNotificationTime, setLastNotificationTime] = useState(new Date());
  const [totalItems, setTotalItems] = useState(0);
  const [isPolling, setIsPolling] = useState(false);
  const lastNotificationTimeRef = useRef(new Date());
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [gotoPage, setGotoPage] = useState('');
  const [isLoadingDetections, setIsLoadingDetections] = useState(false);
  const [hasViewPlate, setHasViewPlate] = useState(false);
  const [hasVerifyPlate, setHasVerifyPlate] = useState(false);
  const [hasDeletePlate, setHasDeletePlate] = useState(false);
  const [hasSearchPlate, setHasSearchPlate] = useState(false);

    useEffect(() => {
            const storedUser = localStorage.getItem('user');
            if (storedUser ) {
                try {
                    const user = JSON.parse(storedUser); // Parse dữ liệu user
                    const permissions = user.permissions || [];
                    setHasViewPlate(permissions.some(permission => permission.code === 'recognition_plate.view_detail'));
                    setHasVerifyPlate(permissions.some(permission => permission.code === 'recognition_plate.verify'));
                    setHasDeletePlate(permissions.some(permission => permission.code === 'recognition_plate.delete'));
                    setHasSearchPlate(permissions.some(permission => permission.code === 'recognition_plate.search'));
  
                } catch (error) {
                    console.error('Error parsing permissions:', error);
                }
            }
        }, []);
  // States cho tìm kiếm nâng cao (dựa trên WhiteList)
  const [searchFilters, setSearchFilters] = useState({
    plate_number: '',
    camera_id: '',
    location_id: '',
    start_date: '',
    end_date: '',
    start_date_display: '',
    end_date_display: '',
    confidence_min: '',
    confidence_max: '',
    is_verified: '',
    is_whitelist_match: '',
    is_blacklist_match: '',
    source_type: '',
    detection_status: '',
    alert_triggered: '',
  });
  
  // States cho giao diện tìm kiếm
  const [locations, setLocations] = useState([]);
  const [searchCameras, setSearchCameras] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  
  
  // Options cho các dropdown
  const detectionStatusOptions = [
    { value: '', label: 'Tất cả trạng thái', color: 'default' },
    { value: 'detected', label: 'Đã phát hiện', color: 'success' },
    { value: 'verified', label: 'Đã xác minh', color: 'info' },
    { value: 'pending', label: 'Chờ xử lý', color: 'warning' },
    { value: 'error', label: 'Lỗi', color: 'error' }
  ];

  const verificationStatusOptions = [
    { value: '', label: 'Tất cả', color: 'default' },
    { value: 'verified', label: 'Đã xác minh', color: 'success' },
    { value: 'unverified', label: 'Chưa xác minh', color: 'warning' }
  ];

  const whitelistMatchOptions = [
    { value: '', label: 'Tất cả', color: 'default' },
    { value: 'match', label: 'Có trong Whitelist', color: 'success' },
    { value: 'no_match', label: 'Không có trong Whitelist', color: 'info' }
  ];

  const blacklistMatchOptions = [
    { value: '', label: 'Tất cả', color: 'default' },
    { value: 'match', label: 'Có trong Blacklist', color: 'error' },
    { value: 'no_match', label: 'Không có trong Blacklist', color: 'success' }
  ];


  const sourceTypeOptions = [
    { value: '', label: 'Tất cả nguồn', color: 'default' },
    { value: 'camera', label: 'Camera live', color: 'primary' },
    { value: 'video_upload', label: 'Video upload', color: 'info' }
  ];

  const alertOptions = [
    { value: '', label: 'Tất cả', color: 'default' },
    { value: 'true', label: 'Có cảnh báo', color: 'error' },
    { value: 'false', label: 'Không có cảnh báo', color: 'success' }
  ];
  
  // State cho modal xem chi tiết
  const [selectedResult, setSelectedResult] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  
  // State cho modal xác nhận
  const [confirmationModal, setConfirmationModal] = useState({
    open: false,
    type: '', // 'verify' hoặc 'delete'
    title: '',
    message: '',
    details: [],
    onConfirm: null,
    resultId: null,
    loading: false
  });

  // State cho AlertBox notification (giống User management)
  const [alertBox, setAlertBox] = useState({
    open: false,
    error: false,
    msg: ''
  });
  
  // State cho thông báo BlackList/WhiteList (thay đổi thành Snackbar)
  const [toastNotifications, setToastNotifications] = useState([]);
  const [notifiedPlates, setNotifiedPlates] = useState(new Set());
  
  // State cho loading và actions
  const [actionLoading, setActionLoading] = useState({
    verify: new Set(),
    delete: new Set(),
    view: new Set()
  });
  // Hàm hiển thị thông báo BlackList/WhiteList dạng toast
  const showToastNotification = (result) => {
    const notificationId = Date.now() + Math.random();
    
    if (result.is_blacklist_match) {
      const notification = {
        id: notificationId,
        type: 'blacklist',
        plateNumber: result.plate_number,
        message: `Phương tiện có biển số xe ${result.plate_number} đang nằm trong BlackList, không được phép vào khu vực này.`,
        severity: 'error',
        details: result
      };
      setToastNotifications(prev => {
        const newNotifications = [...prev, notification];
        // Giới hạn tối đa 5 thông báo cùng lúc
        if (newNotifications.length > 5) {
          return newNotifications.slice(-5);
        }
        return newNotifications;
      });
      
      // Tự động xóa sau 8 giây
      setTimeout(() => {
        setToastNotifications(prev => prev.filter(n => n.id !== notificationId));
      }, 8000);
    } else if (result.is_whitelist_match) {
      const notification = {
        id: notificationId,
        type: 'whitelist',
        plateNumber: result.plate_number,
        message: `Phương tiện có biển số xe ${result.plate_number} được phép vào khu vực này (có trong WhiteList).`,
        severity: 'success',
        details: result
      };
      setToastNotifications(prev => {
        const newNotifications = [...prev, notification];
        // Giới hạn tối đa 5 thông báo cùng lúc
        if (newNotifications.length > 5) {
          return newNotifications.slice(-5);
        }
        return newNotifications;
      });
      
      // Tự động xóa sau 6 giây
      setTimeout(() => {
        setToastNotifications(prev => prev.filter(n => n.id !== notificationId));
      }, 6000);
    }
  };

  const loadDetectionResults = useCallback(async () => {
    try {
      setIsLoadingDetections(true);
      
      // Validate filters before sending request
      if (!validateConfidenceRange(searchFilters.confidence_min, searchFilters.confidence_max)) {
        setSearchError('Giá trị độ tin cậy tối thiểu phải nhỏ hơn hoặc bằng giá trị tối đa');
        return;
      }
      
      if (!validateDateRange(searchFilters.start_date, searchFilters.end_date)) {
        setSearchError('Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc');
        return;
      }
      
      const token = localStorage.getItem("token");
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
        // Thêm filter độ tin cậy mặc định
        detection_confidence_min: '0.8',  // >= 80%
        ocr_confidence_min: '0.9'         // >= 90%
      });
      
      // Thêm các tham số tìm kiếm với xử lý đặc biệt cho ngày và confidence
      Object.keys(searchFilters).forEach(key => {
        if (searchFilters[key] && searchFilters[key] !== '') {
          let value = searchFilters[key];
          
          // Xử lý đặc biệt cho ngày
          if (key === 'start_date') {
            value = convertDateFormat(searchFilters[key]);
          } else if (key === 'end_date') {
            value = convertEndDateFormat(searchFilters[key]);
          }
          // Xử lý đặc biệt cho confidence (chuyển từ % sang decimal)
          else if (key === 'confidence_min' || key === 'confidence_max') {
            value = (parseFloat(searchFilters[key]) / 100).toString();
          }
          
          if (value) {
            params.append(key, value);
          }
        }
      });
      
      const response = await fetchDataFromAPI(`/api/plate-recognitions?${params.toString()}`, token);
      if (response.success) {
        const newResults = response.data || [];
        setDetectionResults(newResults);
        
        // Kiểm tra và hiển thị thông báo cho kết quả mới có BlackList/WhiteList
        newResults.forEach(result => {
          if (result.is_blacklist_match || result.is_whitelist_match) {
            // Chỉ hiển thị thông báo cho kết quả mới (sau lần load cuối)
            const resultTime = new Date(result.detected_at);
            const plateKey = `${result.plate_number}_${result.is_blacklist_match ? 'blacklist' : 'whitelist'}`;
            
            if (resultTime > lastNotificationTimeRef.current && !notifiedPlates.has(plateKey)) {
              setTimeout(() => {
                showToastNotification(result);
                setNotifiedPlates(prev => new Set([...prev, plateKey]));
              }, 1000); // Delay 1 giây để đảm bảo UI đã render
            }
          }
        });
        
        // Cập nhật thời gian cuối cùng để tránh hiển thị thông báo trùng lặp
        lastNotificationTimeRef.current = new Date();
        
        if (response.pagination) {
          setTotalPages(response.pagination.total_pages || 1);
          setTotalItems(response.pagination.total || 0);
        }
      }
      
      // Clear any previous errors
      setSearchError(null);
    } catch (error) {
      console.error("Error loading detection results:", error);
      setSearchError('Có lỗi xảy ra khi tải dữ liệu. Vui lòng thử lại.');
    } finally {
      setIsLoadingDetections(false);
    }
  }, [currentPage, itemsPerPage, searchFilters, notifiedPlates]);

  // Load locations và cameras cho dropdown
  const loadLocationsAndCameras = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      
      // Load locations
      const locationsResponse = await fetchDataFromAPI('/api/location', token, { 
        params: { page: 1, limit: 1000 } 
      });
      if (locationsResponse.success) {
        setLocations(locationsResponse.data?.locations || locationsResponse.data || []);
      }
      
      // Load cameras
      const camerasResponse = await fetchDataFromAPI('/api/cameras', token, { 
        params: { page: 1, limit: 1000 } 
      });
      if (camerasResponse.success) {
        setSearchCameras(camerasResponse.data?.cameras || camerasResponse.data || []);
      }
    } catch (error) {
      console.error("Error loading locations and cameras:", error);
    }
  }, []);

  // Hàm xử lý thay đổi filter
  const handleFilterChange = (field, value) => {
    setSearchFilters(prev => ({
      ...prev,
      [field]: value
    }));
    setCurrentPage(1); // Reset về trang đầu khi thay đổi filter
    setSearchError(null);
  };

  // Hàm reset tất cả filters
  const resetFilters = () => {
    setSearchFilters({
      plate_number: '',
      camera_id: '',
      location_id: '',
      start_date: '',
      end_date: '',
      start_date_display: '',
      end_date_display: '',
      confidence_min: '',
      confidence_max: '',
      is_verified: '',
      is_whitelist_match: '',
      is_blacklist_match: '',
      direction: '',
      vehicle_type: '',
      source_type: '',
      detection_status: '',
      alert_triggered: '',
    });
    setCurrentPage(1);
    setSearchError(null);
  };

  // Hàm apply search
  const applySearch = () => {
    setCurrentPage(1);
    setSearchError(null);
    loadDetectionResults();
  };

  // Hàm chuyển đổi từ yyyy-MM-ddTHH:mm sang dd/MM/yyyy HH:mm
  const convertToDisplayFormat = (dateString) => {
    if (!dateString) return '';
    
    const dateRegex = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
    const match = dateString.match(dateRegex);
    
    if (match) {
      const [, year, month, day, hour, minute] = match;
      return `${day}/${month}/${year} ${hour}:${minute}`;
    }
    
    return dateString;
  };

  // Hàm format ngày giờ cho hiển thị (dd/mm/yyyy HH:mm)
  const formatDateTimeForDisplay = (dateString) => {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'N/A';
      
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch (error) {
      console.error('Error formatting date for display:', error);
      return 'N/A';
    }
  };

  // Hàm chuyển đổi từ dd/MM/yyyy HH:mm sang yyyy-MM-ddTHH:mm
  const convertToDateTimeLocal = (dateString) => {
    if (!dateString) return '';
    
    const dateRegex = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/;
    const match = dateString.match(dateRegex);
    
    if (match) {
      const [, day, month, year, hour, minute] = match;
      return `${year}-${month}-${day}T${hour}:${minute}`;
    }
    
    return dateString;
  };


  // Hàm chuyển đổi datetime từ yyyy-MM-ddTHH:mm sang yyyy-MM-dd HH:mm:ss
  const convertDateFormat = (dateString) => {
    if (!dateString) return '';
    
    // Kiểm tra định dạng yyyy-MM-ddTHH:mm (từ datetime-local)
    const dateRegex = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
    const match = dateString.match(dateRegex);
    
    if (match) {
      const [, year, month, day, hour, minute] = match;
      // Chuyển đổi sang yyyy-MM-dd HH:mm:ss
      return `${year}-${month}-${day} ${hour}:${minute}:00`;
    }
    
    return dateString; // Trả về nguyên gốc nếu không đúng định dạng
  };

  // Hàm chuyển đổi datetime kết thúc từ yyyy-MM-ddTHH:mm sang yyyy-MM-dd HH:mm:ss
  const convertEndDateFormat = (dateString) => {
    if (!dateString) return '';
    
    const dateRegex = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
    const match = dateString.match(dateRegex);
    
    if (match) {
      const [, year, month, day, hour, minute] = match;
      return `${year}-${month}-${day} ${hour}:${minute}:00`;
    }
    
    return dateString;
  };

  // Hàm validate confidence range
  const validateConfidenceRange = (min, max) => {
    if (min && max) {
      const minVal = parseFloat(min);
      const maxVal = parseFloat(max);
      return minVal <= maxVal;
    }
    return true;
  };

  // Hàm validate date range
  const validateDateRange = (startDate, endDate) => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      return start <= end;
    }
    return true;
  };

  // Hàm để ẩn/hiện placeholder text
  const handleDateTimeFocus = (event) => {
    const placeholderText = event.target.parentElement.querySelector('.placeholder-text');
    if (placeholderText) {
      placeholderText.style.display = 'none';
    }
  };

  const handleDateTimeBlur = (event) => {
    const placeholderText = event.target.parentElement.querySelector('.placeholder-text');
    if (placeholderText) {
      if (!event.target.value) {
        placeholderText.style.display = 'block';
      } else {
        placeholderText.style.display = 'none';
      }
    }
  };

  const handleDateTimeChange = (field, value, event) => {
    // Chuyển đổi từ dd/mm/yyyy hh:mm sang yyyy-mm-ddThh:mm
    let convertedValue = value;
    if (value && value.match(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)) {
      const [datePart, timePart] = value.split(' ');
      const [day, month, year] = datePart.split('/');
      convertedValue = `${year}-${month}-${day}T${timePart}`;
    }
    
    // Cập nhật cả giá trị hiển thị và giá trị thực
    if (field === 'start_date') {
      handleFilterChange('start_date', convertedValue);
      handleFilterChange('start_date_display', value);
    } else if (field === 'end_date') {
      handleFilterChange('end_date', convertedValue);
      handleFilterChange('end_date_display', value);
    }
    
    // Ẩn placeholder nếu có giá trị
    const input = event.target;
    if (input) {
      const placeholderText = input.parentElement.querySelector('.placeholder-text');
      if (placeholderText) {
        placeholderText.style.display = value ? 'none' : 'block';
      }
    }
  };

  // Hàm xử lý click vào icon calendar
  const handleCalendarClick = (field) => {
    // Tìm input field tương ứng để lấy vị trí
    const inputs = document.querySelectorAll('input[placeholder="dd/mm/yyyy hh:mm"]');
    const inputField = field === 'start_date' ? inputs[0] : inputs[1];
    if (!inputField) {
      console.log('Input field not found for field:', field);
      return;
    }
    
    // Lấy vị trí của input field
    const rect = inputField.getBoundingClientRect();
    
    // Tạo một input datetime-local ẩn để mở date picker
    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'datetime-local';
    hiddenInput.style.position = 'fixed';
    hiddenInput.style.left = `${rect.left}px`;
    hiddenInput.style.top = `${rect.bottom + 5}px`;
    hiddenInput.style.width = `${rect.width}px`;
    hiddenInput.style.height = '40px';
    hiddenInput.style.zIndex = '9999';
    hiddenInput.style.opacity = '0.01';
    hiddenInput.style.pointerEvents = 'none';
    hiddenInput.style.border = 'none';
    hiddenInput.style.outline = 'none';
    
    // Set giá trị hiện tại nếu có
    const currentValue = field === 'start_date' ? searchFilters.start_date : searchFilters.end_date;
    if (currentValue) {
      hiddenInput.value = currentValue;
    }
    
    document.body.appendChild(hiddenInput);
    
    // Focus và mở date picker
    hiddenInput.focus();
    
    // Sử dụng setTimeout để đảm bảo input được render trước khi gọi showPicker
    setTimeout(() => {
      try {
        hiddenInput.showPicker();
      } catch (error) {
        console.log('showPicker not supported, using click method');
        hiddenInput.click();
      }
    }, 10);
    
    // Xử lý khi chọn ngày
    const handleChange = (e) => {
      const selectedValue = e.target.value;
      console.log('Date selected:', selectedValue, 'for field:', field);
      
      if (selectedValue) {
        // Chuyển đổi từ yyyy-mm-ddThh:mm sang dd/mm/yyyy hh:mm
        const [datePart, timePart] = selectedValue.split('T');
        const [year, month, day] = datePart.split('-');
        const displayValue = `${day}/${month}/${year} ${timePart}`;
        
        console.log('Updating field:', field, 'with value:', displayValue);
        
        // Cập nhật giá trị ngay lập tức
        if (field === 'start_date') {
          console.log('Setting start_date to:', selectedValue);
          console.log('Setting start_date_display to:', displayValue);
          handleFilterChange('start_date', selectedValue);
          handleFilterChange('start_date_display', displayValue);
        } else if (field === 'end_date') {
          console.log('Setting end_date to:', selectedValue);
          console.log('Setting end_date_display to:', displayValue);
          handleFilterChange('end_date', selectedValue);
          handleFilterChange('end_date_display', displayValue);
        }
        
        // Focus vào input field thực
        inputField.focus();
        
        // Delay cleanup để đảm bảo state được cập nhật
        setTimeout(() => {
          cleanup();
        }, 100);
      } else {
        // Nếu không có giá trị, cleanup ngay
        cleanup();
      }
    };
    
    // Xử lý khi blur (click ra ngoài)
    const handleBlur = () => {
      console.log('Calendar blurred, cleaning up');
      cleanup();
    };
    
    // Xử lý khi input bị hủy
    const handleCancel = () => {
      console.log('Calendar cancelled, cleaning up');
      cleanup();
    };
    
    // Cleanup function
    const cleanup = () => {
      try {
        hiddenInput.removeEventListener('change', handleChange);
        hiddenInput.removeEventListener('input', handleChange);
        hiddenInput.removeEventListener('blur', handleBlur);
        hiddenInput.removeEventListener('cancel', handleCancel);
        if (document.body.contains(hiddenInput)) {
          document.body.removeChild(hiddenInput);
        }
        console.log('Calendar cleaned up');
      } catch (error) {
        console.log('Error during cleanup:', error);
      }
    };
    
    // Thêm event listeners
    hiddenInput.addEventListener('change', handleChange);
    hiddenInput.addEventListener('input', handleChange);
    hiddenInput.addEventListener('blur', handleBlur);
    hiddenInput.addEventListener('cancel', handleCancel);
    
    // Auto cleanup sau 10 giây
    setTimeout(() => {
      cleanup();
    }, 10000);
  };


  // Khởi tạo trạng thái placeholder text
  useEffect(() => {
    const updatePlaceholderVisibility = () => {
      const startDateInput = document.querySelector('input[placeholder="dd/mm/yyyy hh:mm"]');
      const endDateInput = document.querySelectorAll('input[placeholder="dd/mm/yyyy hh:mm"]')[1];
      
      if (startDateInput) {
        const startPlaceholder = startDateInput.parentElement.querySelector('.placeholder-text');
        if (startPlaceholder) {
          startPlaceholder.style.display = !startDateInput.value ? 'block' : 'none';
        }
      }
      
      if (endDateInput) {
        const endPlaceholder = endDateInput.parentElement.querySelector('.placeholder-text');
        if (endPlaceholder) {
          endPlaceholder.style.display = !endDateInput.value ? 'block' : 'none';
        }
      }
    };

    // Chạy ngay lập tức
    updatePlaceholderVisibility();
    
    // Chạy lại sau khi component render xong
    const timeoutId = setTimeout(updatePlaceholderVisibility, 50);
    
    return () => clearTimeout(timeoutId);
  }, [searchFilters.start_date, searchFilters.end_date]);

  // Thêm useEffect để theo dõi thay đổi giá trị input
  useEffect(() => {
    const handleInputChange = () => {
      const startDateInput = document.querySelector('input[placeholder="dd/mm/yyyy hh:mm"]');
      const endDateInput = document.querySelectorAll('input[placeholder="dd/mm/yyyy hh:mm"]')[1];
      
      if (startDateInput) {
        const startPlaceholder = startDateInput.parentElement.querySelector('.placeholder-text');
        if (startPlaceholder) {
          startPlaceholder.style.display = !startDateInput.value ? 'block' : 'none';
        }
      }
      
      if (endDateInput) {
        const endPlaceholder = endDateInput.parentElement.querySelector('.placeholder-text');
        if (endPlaceholder) {
          endPlaceholder.style.display = !endDateInput.value ? 'block' : 'none';
        }
      }
    };

    // Thêm event listeners
    const startDateInput = document.querySelector('input[type="datetime-local"]');
    const endDateInput = document.querySelectorAll('input[type="datetime-local"]')[1];
    
    if (startDateInput) {
      startDateInput.addEventListener('input', handleInputChange);
      startDateInput.addEventListener('change', handleInputChange);
    }
    
    if (endDateInput) {
      endDateInput.addEventListener('input', handleInputChange);
      endDateInput.addEventListener('change', handleInputChange);
    }

    return () => {
      if (startDateInput) {
        startDateInput.removeEventListener('input', handleInputChange);
        startDateInput.removeEventListener('change', handleInputChange);
      }
      if (endDateInput) {
        endDateInput.removeEventListener('input', handleInputChange);
        endDateInput.removeEventListener('change', handleInputChange);
      }
    };
  }, []);

  useEffect(() => {
    camerasRef.current = cameras;
    window.startCameraStream = handleCameraClick;
    window.startVideoStream = (videoId) => {
      const streamId = `video-${videoId}-${Date.now()}`;
      const video = videos.find((v) => v.id === videoId);
      if (video) {
        setRtspStreams((prev) => ({
          ...prev,
          [streamId]: {
            url: video.url,
          },
        }));
        setSelectedStreams((prev) => [...prev, streamId]);
        setCameraSizes((prev) => ({
          ...prev,
          [streamId]: { width: 400, height: 250 },
        }));
      }
    };

    return () => {
      delete window.startCameraStream;
      delete window.startVideoStream;
    };
  }, [videos]);
const getRelativeTime = (dateString) => {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Vừa xong';
  if (diffMins < 60) return `${diffMins} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  if (diffDays < 7) return `${diffDays} ngày trước`;
  return `${Math.floor(diffDays / 7)} tuần trước`;
};

// Function để get vehicle type label
const getVehicleTypeLabel = (type) => {
  const typeLabels = {
    'motorcycle': '🏍️ Xe máy',
    'car': '🚗 Ô tô',
    'truck': '🚛 Xe tải',
    'bus': '🚌 Xe buýt',
    'other': '🚙 Khác'
  };
  return typeLabels[type] || type;
};
useEffect(() => {
    // Tạo global function để CameraViewer có thể gọi
    window.refreshDetectionResults = () => {
      console.log("🔄 Refreshing detection results...");
      loadDetectionResults();
    };

    // Cleanup
    return () => {
      delete window.refreshDetectionResults;
    };
  }, [loadDetectionResults]);

  // Load detection results khi component mount
  useEffect(() => {
    loadDetectionResults();
  }, [loadDetectionResults]); // Chỉ chạy một lần khi mount

  // Load lại khi có thay đổi pagination
  useEffect(() => {
    if (currentPage > 1 || itemsPerPage !== 10) {
      loadDetectionResults();
    }
  }, [currentPage, itemsPerPage, loadDetectionResults]);

  // Auto refresh function - chỉ refresh khi có sự kiện từ CameraViewer
  const handleAutoRefresh = useCallback(async () => {
    if (isPolling || isLoadingDetections) return;
    
    setIsPolling(true);
    try {
      console.log("🔄 Auto refresh triggered by new detection...");
      await loadDetectionResults();
    } catch (error) {
      console.error("Error in auto refresh:", error);
    } finally {
      setIsPolling(false);
    }
  }, [isPolling, isLoadingDetections, loadDetectionResults]);

  // Tạo global function để CameraViewer có thể gọi
  useEffect(() => {
    window.refreshDetectionResults = handleAutoRefresh;
    
    return () => {
      delete window.refreshDetectionResults;
    };
  }, [handleAutoRefresh]);

  // Cleanup thông báo cũ mỗi 30 giây
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      // Xóa thông báo cũ hơn 2 phút
      setToastNotifications(prev => 
        prev.filter(notification => {
          const notificationTime = new Date(notification.details?.detected_at || 0);
          const now = new Date();
          return (now - notificationTime) < 2 * 60 * 1000; // 2 phút
        })
      );
      
      // Reset danh sách biển số đã thông báo để tránh tích lũy
      setNotifiedPlates(new Set());
    }, 30000); // Cleanup mỗi 30 giây

    return () => clearInterval(cleanupInterval);
  }, []);

  // Load locations và cameras khi component mount
  useEffect(() => {
    loadLocationsAndCameras();
  }, [loadLocationsAndCameras]);
  // Reset gotoPage khi currentPage thay đổi
  useEffect(() => { setGotoPage(''); }, [currentPage]);

  useEffect(() => {
    if (pendingCameraId && cameras.length > 0) {
      handleCameraClick(pendingCameraId);
      setPendingCameraId(null);
    }
  }, [cameras, pendingCameraId]);



  const fetchCameras = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const data = await fetchDataFromAPI("/api/cameras/streams/all", token);
      const cameraList = data.data?.cameras || [];
      camerasRef.current = cameraList;
      setCameras(cameraList);
      const positions = cameraList.map((camera) => ({
        id: camera.id,
        config: {
          name: camera.name,
          protocol: camera.protocol,
          host: camera.host,
          port: camera.port,
          path: camera.path,
        },
      }));
      setCameraPositions(positions);
    } catch (error) {
      console.error("Fetch error:", error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadUploadedVideos = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetchDataFromAPI("/api/videos/list-videos", token);
      if (response.success) {
        const videos = response.data.reduce((acc, video) => {
          const streamId = `upload-${video.id}`;
          acc[streamId] = { url: video.url, name: video.name };
          return acc;
        }, {});
        setUploadedVideos(videos);
        setSelectedStreams(Object.keys(videos));
        Object.keys(videos).forEach((streamId) => {
          setCameraSizes((prev) => ({
            ...prev,
            [streamId]: { width: 400, height: 250 },
          }));
        });
        setVideos(response.data);
      }
    } catch (error) {
      console.error("Error loading uploaded videos:", error);
    }
  };

  const handleCameraClick = async (cameraId) => {
    if (showConfig || isLoadingStream.current) return;

    const camera = camerasRef.current.find((c) => c.id === Number(cameraId));

    if (!camera) {
      await fetchCameras();
      const refreshedCamera = camerasRef.current.find(
        (c) => c.id === Number(cameraId)
      );
      if (!refreshedCamera) {
        alert(`Không tìm thấy camera ${cameraId}`);
        return;
      }
    }

    const streamId = `${cameraId}-${Date.now()}`;

    isLoadingStream.current = true;
    try {
      const token = localStorage.getItem("token");
      const result = await postData(
        `/api/cameras/${cameraId}/stream/start`,
        { type: "hls" },
        token
      );
      if (!result.success) {
        alert(result.message || "Không thể phát camera");
        return;
      }
      const streamUrl = result.data.stream.streamUrl.replace(
        "localhost",
        window.location.hostname
      );
      setRtspStreams((prev) => ({
        ...prev,
        [streamId]: {
          cameraId: cameraId,
          url: streamUrl,
        },
      }));
      setSelectedStreams((prev) => [...prev, streamId]);
      setCameraSizes((prev) => ({
        ...prev,
        [streamId]: { width: 400, height: 250 },
      }));
    } catch (error) {
      console.error("Error starting stream:", error);
      alert("Không thể phát camera: " + (error.message || "Lỗi không xác định"));
    } finally {
      isLoadingStream.current = false;
    }
  };


  const handleCloseCameraFeed = (streamId) => {
    setSelectedStreams((prev) => prev.filter((id) => id !== streamId));
    setRtspStreams((prev) => {
      const newStreams = { ...prev };
      delete newStreams[streamId];
      return newStreams;
    });
    setCameraSizes((prev) => {
      const newSizes = { ...prev };
      delete newSizes[streamId];
      return newSizes;
    });
    setUploadedVideos((prev) => {
      const newVideos = { ...prev };
      delete newVideos[streamId];
      return newVideos;
    });
  };


  // Hàm xử lý bắt đầu ghi hình
  const handleStartRecording = (streamId) => {
    console.log("🎥 Starting recording for stream:", streamId);
    
    try {
      const videoElement = document.getElementById(`video-${streamId}`);
      if (!videoElement) {
        console.error("Video element not found for stream:", streamId);
        alert("Không tìm thấy video element để ghi hình");
        return;
      }

      // Kiểm tra video đã sẵn sàng chưa
      if (videoElement.readyState < 2) {
        alert("Video chưa sẵn sàng để ghi hình. Vui lòng đợi video load xong.");
        return;
      }

      // Tạo MediaStream từ video element
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = videoElement.videoWidth || 640;
      canvas.height = videoElement.videoHeight || 480;
      
      const stream = canvas.captureStream(30); // 30 FPS
      
      // Kiểm tra browser có hỗ trợ MediaRecorder không
      if (!window.MediaRecorder) {
        alert("Trình duyệt không hỗ trợ ghi hình. Vui lòng sử dụng Chrome, Firefox hoặc Edge mới nhất.");
        return;
      }

      // Thử các format khác nhau
      let mimeType = 'video/webm;codecs=vp9';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/mp4';
          }
        }
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType
      });

      const chunks = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const fileExtension = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        // Tạo link download
        const a = document.createElement('a');
        a.href = url;
        a.download = `camera_${streamId}_${new Date().toISOString().replace(/[:.]/g, '-')}.${fileExtension}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log("✅ Recording saved successfully");
      };

      // Bắt đầu ghi hình
      mediaRecorder.start(1000); // Ghi mỗi 1 giây
      
      // Bắt đầu timer ghi hình
      const startTime = Date.now();
      const timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setRecordingTimers(prev => ({
          ...prev,
          [streamId]: elapsed
        }));
      }, 1000);

      // Lưu MediaRecorder vào state để có thể dừng sau
      setRecording((prev) => ({ 
        ...prev, 
        [streamId]: { 
          isRecording: true, 
          mediaRecorder,
          canvas,
          ctx,
          videoElement,
          interval: setInterval(() => {
            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
          }, 1000/30), // 30 FPS
          timerInterval
        }
      }));

      console.log("✅ Recording started successfully");
      
    } catch (error) {
      console.error("❌ Error starting recording:", error);
      alert("Lỗi khi bắt đầu ghi hình: " + error.message);
    }
  };

  // Hàm xử lý dừng ghi hình
  const handleStopRecording = (streamId) => {
    console.log("🛑 Stopping recording for stream:", streamId);
    
    try {
      const recordingData = recording[streamId];
      if (!recordingData || !recordingData.mediaRecorder) {
        console.error("No active recording found for stream:", streamId);
        return;
      }

      // Dừng MediaRecorder
      if (recordingData.mediaRecorder.state === 'recording') {
        recordingData.mediaRecorder.stop();
      }

      // Clear interval
      if (recordingData.interval) {
        clearInterval(recordingData.interval);
      }

      // Clear timer interval
      if (recordingData.timerInterval) {
        clearInterval(recordingData.timerInterval);
      }

      // Cleanup
      if (recordingData.canvas) {
        recordingData.canvas.remove();
      }

      // Cập nhật state
      setRecording((prev) => {
        const newState = { ...prev };
        delete newState[streamId];
        return newState;
      });

      // Xóa timer
      setRecordingTimers((prev) => {
        const newState = { ...prev };
        delete newState[streamId];
        return newState;
      });

      console.log("✅ Recording stopped successfully");
      
    } catch (error) {
      console.error("❌ Error stopping recording:", error);
      alert("Lỗi khi dừng ghi hình: " + error.message);
    }
  };

  // Hàm xử lý chụp ảnh
  const handleSnapshot = (streamId) => {
    console.log("📸 Taking snapshot for stream:", streamId);
    
    try {
      const videoElement = document.getElementById(`video-${streamId}`);
      if (!videoElement) {
        console.error("Video element not found for stream:", streamId);
        alert("Không tìm thấy video element để chụp ảnh");
        return;
      }

      // Tạo canvas để chụp ảnh
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = videoElement.videoWidth || 640;
      canvas.height = videoElement.videoHeight || 480;
      
      // Vẽ frame hiện tại lên canvas
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      
      // Tạo blob và download
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `snapshot_${streamId}_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log("✅ Snapshot saved successfully");
      }, 'image/png');
      
    } catch (error) {
      console.error("❌ Error taking snapshot:", error);
      alert("Lỗi khi chụp ảnh: " + error.message);
    }
  };

  // Hàm xử lý toggle mute
  const handleToggleMute = (streamId) => {
    console.log("🔇 Toggling mute for stream:", streamId);
    
    try {
      const videoElement = document.getElementById(`video-${streamId}`);
      if (!videoElement) {
        console.error("Video element not found for stream:", streamId);
        return;
      }

      const newMutedState = !muted[streamId];
      videoElement.muted = newMutedState;
      
      setMuted((prev) => ({
        ...prev,
        [streamId]: newMutedState
      }));

      console.log("✅ Mute toggled successfully:", newMutedState);
      
    } catch (error) {
      console.error("❌ Error toggling mute:", error);
      alert("Lỗi khi thay đổi âm thanh: " + error.message);
    }
  };

  // Hàm xử lý play/pause
  const handlePlayPause = (streamId) => {
    console.log("⏯️ Toggling play/pause for stream:", streamId);
    
    try {
      const videoElement = document.getElementById(`video-${streamId}`);
      if (!videoElement) {
        console.error("Video element not found for stream:", streamId);
        return;
      }

      const newPlayingState = videoElement.paused;
      
      if (newPlayingState) {
        videoElement.play();
      } else {
        videoElement.pause();
      }
      
      setPlaying((prev) => ({
        ...prev,
        [streamId]: !newPlayingState
      }));

      console.log("✅ Play/pause toggled successfully:", !newPlayingState);
      
    } catch (error) {
      console.error("❌ Error toggling play/pause:", error);
      alert("Lỗi khi phát/tạm dừng video: " + error.message);
    }
  };

  // Hàm xử lý cài đặt chất lượng
  const handleQualitySettings = (streamId, quality) => {
    console.log("⚙️ Changing quality for stream:", streamId, "to:", quality);
    
    try {
      const qualities = {
        'low': { width: 640, height: 360, label: 'Low (360p)' },
        'medium': { width: 1280, height: 720, label: 'Medium (720p)' },
        'high': { width: 1920, height: 1080, label: 'High (1080p)' }
      };
      
      const selectedQuality = qualities[quality];
      if (!selectedQuality) {
        console.error("Invalid quality option:", quality);
        return;
      }

      // Cập nhật chất lượng hiện tại
      setCurrentQuality((prev) => ({
        ...prev,
        [streamId]: quality
      }));

      // Lưu thông tin chất lượng vào localStorage để giữ khi reload
      localStorage.setItem(`quality_${streamId}`, quality);

      console.log("✅ Quality settings applied:", selectedQuality);
      
      // TODO: Implement actual quality change logic here
      // Có thể cần gọi API để thay đổi stream quality
      // Hiện tại chỉ lưu preference, không thay đổi stream thực tế
      
    } catch (error) {
      console.error("❌ Error changing quality:", error);
      alert("Lỗi khi thay đổi chất lượng: " + error.message);
    }
  };

  const handleSaveConfig = (updatedConfig) => {
    setCameraPositions((prevPositions) =>
      prevPositions.map((cam) =>
        cam.id === selectedCameraId
          ? { ...cam, config: { ...cam.config, ...updatedConfig } }
          : cam
      )
    );
    setShowConfig(false);
  };

  const startResize = (streamId, e) => {
    const resizeRef = resizeRefs.current[streamId];
    if (!resizeRef) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = parseInt(resizeRef.style.width, 10) || cameraSizes[streamId]?.width || 400;
    const startHeight = parseInt(resizeRef.style.height, 10) || cameraSizes[streamId]?.height || 250;

    const onMouseMove = (e) => {
      const newWidth = startWidth + (e.clientX - startX);
      const newHeight = startHeight + (e.clientY - startY);
      setCameraSizes((prev) => ({
        ...prev,
        [streamId]: {
          width: Math.max(300, Math.min(800, newWidth)),
          height: Math.max(200, Math.min(600, newHeight)),
        },
      }));
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const handleUploadVideo = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("video", file);

    try {
      const token = localStorage.getItem("token");
      const response = await postData(
        "/api/videos/upload-video",
        formData,
        token,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );
      if (response.success) {
        const streamId = `upload-${response.data.id}`;
        const fullUrl = `${window.location.origin}${response.data.url}`;
        setUploadedVideos((prev) => ({
          ...prev,
          [streamId]: {
            url: fullUrl,
            name: file.name,
          },
        }));
        setSelectedStreams((prev) => [...prev, streamId]);
        setCameraSizes((prev) => ({
          ...prev,
          [streamId]: { width: 400, height: 250 },
        }));
      } else {
        alert(response.message || "Tải video thất bại");
      }
    } catch (error) {
      console.error("Error uploading video:", error);
      alert("Tải video thất bại: " + (error.message || "Lỗi không xác định"));
    }
  };

  const handleItemsPerPageChange = (event) => {
    setItemsPerPage(parseInt(event.target.value));
    setCurrentPage(1);
    setSearchError(null);
  };

  // Pagination helper function (giống WhiteList)
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

  const handleViewDetails = async (result) => {
    console.log("Viewing details for result:", result);
    
    // Thêm loading state
    setActionLoading(prev => ({
      ...prev,
      view: new Set([...prev.view, result.id])
    }));
    
    try {
      // Simulate loading delay for better UX
      await new Promise(resolve => setTimeout(resolve, 300));
      
      setSelectedResult(result);
      setShowDetailsModal(true);
    } finally {
      // Remove loading state
      setActionLoading(prev => {
        const newView = new Set(prev.view);
        newView.delete(result.id);
        return { ...prev, view: newView };
      });
    }
  };

  // Hàm mở modal xác nhận
  const openConfirmationModal = (type, resultId, result) => {
    if (type === 'verify') {
      setConfirmationModal({
        open: true,
        type: 'verify',
        title: '🔍 XÁC MINH BIỂN SỐ',
        message: 'Bạn có chắc chắn muốn xác minh biển số này không?',
        details: [
          `🚗 Biển số: ${result.plate_number || 'N/A'}`,
          result.source_type === 'video_upload' 
            ? `🎬 Video: ${result.video_filename || 'Video Upload'}`
            : `📹 Camera: ${result.camera_name || `Camera ${result.camera_id}` || 'N/A'}`,
          `🕐 Thời gian: ${result.detected_at ? formatDateTimeForDisplay(result.detected_at) : 'N/A'}`,
          `🎯 Độ tin cậy: ${result.ocr_confidence ? `${(parseFloat(result.ocr_confidence) * 100).toFixed(1)}%` : 'N/A'}`
        ],
        onConfirm: () => performVerify(resultId),
        resultId: resultId,
        loading: false,
        result: result // Thêm result để có thể truy cập hình ảnh
      });
    } else if (type === 'delete') {
      setConfirmationModal({
        open: true,
        type: 'delete',
        title: '🗑️ XÓA KẾT QUẢ NHẬN DIỆN',
        message: '⚠️ Bạn có chắc chắn muốn xóa kết quả nhận diện này không? Hành động này không thể hoàn tác!',
        details: [], // Bỏ chi tiết, chỉ hiển thị thông báo đơn giản
        onConfirm: () => performDelete(resultId),
        resultId: resultId,
        loading: false
      });
    }
  };

  // Hàm đóng modal xác nhận
  const closeConfirmationModal = () => {
    setConfirmationModal(prev => ({
      ...prev,
      open: false,
      loading: false
    }));
  };

  // Hàm hiển thị thông báo (giống User management)
  const showAlert = (msg, isError = false) => {
    setAlertBox({
      open: true,
      error: isError,
      msg: msg
    });
  };

  // Auto close alert after 5 seconds (giống User management)
  useEffect(() => {
    if (alertBox.open) {
      const timer = setTimeout(() => {
        setAlertBox(prev => ({ ...prev, open: false }));
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [alertBox.open]);

  // Hàm thực hiện xác minh
  const performVerify = async (resultId) => {
    setConfirmationModal(prev => ({ ...prev, loading: true }));
    
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/plate-detections/verify/${resultId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_verified: true })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Cập nhật trạng thái local ngay lập tức
        setDetectionResults(prev => 
          prev.map(result => 
            result.id === resultId 
              ? { ...result, is_verified: true, verification_status: 'verified' }
              : result
          )
        );
        
        // Đóng modal và hiển thị thông báo thành công
        closeConfirmationModal();
        showAlert("Xác minh thành công! Biển số đã được xác minh và cập nhật trong hệ thống.", false);
        loadDetectionResults(); // Refresh results to show updated status
      } else {
        showAlert("❌ Xác minh thất bại! " + (data.message || "Không thể xác minh biển số. Vui lòng thử lại."), true);
        closeConfirmationModal();
      }
    } catch (error) {
      console.error("Error verifying plate:", error);
      showAlert("❌ Lỗi xác minh! " + (error.message || "Đã xảy ra lỗi không xác định. Vui lòng thử lại."), true);
      closeConfirmationModal();
    }
  };

  const handleVerify = async (resultId) => {
    const result = detectionResults.find(r => r.id === resultId);
    if (result) {
      openConfirmationModal('verify', resultId, result);
    }
  };

  // Hàm thực hiện xóa
  const performDelete = async (resultId) => {
    setConfirmationModal(prev => ({ ...prev, loading: true }));
    
    try {
      const token = localStorage.getItem("token"); 
      const response = await fetch(`/api/plate-detections/delete/${resultId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Cập nhật danh sách local ngay lập tức
        setDetectionResults(prev => prev.filter(result => result.id !== resultId));
        setTotalItems(prev => prev - 1);
        
        // Đóng modal và hiển thị thông báo thành công
        closeConfirmationModal();
        showAlert("Xóa thành công! Kết quả nhận diện đã được xóa khỏi hệ thống.", false);
        loadDetectionResults(); // Refresh results to show updated status
      } else {
        showAlert("❌ Xóa thất bại! " + (data.message || "Không thể xóa kết quả. Vui lòng thử lại."), true);
        closeConfirmationModal();
      }
    } catch (error) {
      console.error("Error deleting plate:", error);
      showAlert("❌ Lỗi xóa! " + (error.message || "Đã xảy ra lỗi không xác định. Vui lòng thử lại."), true);
      closeConfirmationModal();
    }
  };

  const handleDelete = async (resultId) => {
    const result = detectionResults.find(r => r.id === resultId);
    if (result) {
      openConfirmationModal('delete', resultId, result);
    }
  };

  return (
    <Box sx={{ 
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      p: 2
    }}>
      {/* CSS để hiển thị datetime theo định dạng dd/MM/yyyy HH:mm */}
      <style>
  {`
    /* Ẩn số 0 có thể xuất hiện từ video player - chỉ trong video container */
    .video-container video::-webkit-media-controls-timeline {
      display: none !important;
    }
    .video-container video::-webkit-media-controls-current-time-display {
      display: none !important;
    }
    .video-container video::-webkit-media-controls-time-remaining-display {
      display: none !important;
    }
    .video-container video::-webkit-media-controls {
      display: none !important;
    }
    .video-container video::-webkit-media-controls-enclosure {
      display: none !important;
    }
    .video-container video::-webkit-media-controls-panel {
      display: none !important;
    }
    
    /* Custom styling cho datetime input */
    .custom-datetime-input {
      position: relative;
      width: 100%;
    }
    
    .custom-datetime-input input[type="text"] {
      padding-right: 40px;
      color: #666;
      font-weight: 400;
    }
    
    /* Calendar icon styling */
    .calendar-icon:hover {
      opacity: 1 !important;
    }
    
    /* Placeholder text tùy chỉnh */
    .custom-datetime-input .placeholder-text {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      pointer-events: none;
      font-size: 16px;
      color: #999;
      z-index: -1;
      background: transparent;
      padding: 0 4px;
    }
    
    /* Ẩn placeholder khi có giá trị */
    .custom-datetime-input input[type="text"]:not(:placeholder-shown) + .placeholder-text {
      display: none;
    }
    
    /* Animation cho badges */
    @keyframes pulse {
      0% { 
        opacity: 1; 
        transform: scale(1);
      }
      50% { 
        opacity: 0.8; 
        transform: scale(1.05);
      }
      100% { 
        opacity: 1; 
        transform: scale(1);
      }
    }
    
    /* Animation cho spin */
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `}
</style>
      {/* Header */}
      <Card sx={{ 
        background: 'white',
        borderRadius: 3,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        border: '1px solid #e0e0e0',
        mb: 3
      }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
            <Box>
              <Typography variant="h4" component="h1" sx={{ 
                fontWeight: 700,
                color: '#1976d2',
                mb: 1
              }}>
                <CameraIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                Nhận diện biển số xe
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Theo dõi camera trực tiếp và phát hiện biển số xe tự động
              </Typography>
            </Box>
            
            <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
              <Button
                variant="outlined"
                startIcon={<ClearIcon />}
                onClick={() => setSelectedStreams([])}
                sx={{ 
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600
                }}
              >
                Xóa tất cả
              </Button>
              <Button
                variant="contained"
                component="label"
                startIcon={<UploadIcon />}
                sx={{ 
                  backgroundColor: '#1976d2',
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600
                }}
              >
                Tải video
                <input type="file" accept="video/*" hidden onChange={handleUploadVideo} />
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Card sx={{ 
        background: 'white',
        borderRadius: 3,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        border: '1px solid #e0e0e0',
        mb: 3,
        minHeight: '400px'
      }}>
        <Box sx={{ 
          backgroundColor: '#1976d2', 
          color: 'white', 
          p: 2,
          borderRadius: '12px 12px 0 0'
        }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            <VideoIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Hiển thị Camera và Video ({selectedStreams.length})
          </Typography>
        </Box>
        
        <CardContent sx={{ p: 3 }}>
        {selectedStreams.length > 0 ? (
            <Grid container spacing={2}>
              {selectedStreams.map((streamId) => {
                const streamInfo = rtspStreams[streamId] || uploadedVideos[streamId];
            if (!streamInfo) return null;

            const isUploadedVideo = streamId.startsWith("upload-");
            const cameraId = streamInfo.cameraId || streamId.split("-")[1];
            const camera = cameras.find((c) => c.id === cameraId) || {
              id: cameraId,
              name: uploadedVideos[streamId]
                ? uploadedVideos[streamId].name
                : `Camera ${cameraId}`,
            };
                const size = cameraSizes[streamId] || { width: 400, height: 250 };

            return (
                  <Grid item xs={12} sm={6} md={4} key={streamId}>
                    <Card sx={{ 
                      borderRadius: 2,
                      overflow: 'hidden',
                      border: '1px solid #e0e0e0',
                      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)'
                      }
                    }}>
                      <Box
                ref={(el) => (resizeRefs.current[streamId] = el)}
                        sx={{ position: 'relative' }}
                >
                  <CameraViewer
                    camera={{
                      id: streamId,
                      name: isUploadedVideo
                        ? uploadedVideos[streamId].name
                        : `${camera.name} (Stream ${streamId.split("-")[1]})`,
                      streamUrl: streamInfo.url,
                      isUploadedVideo: isUploadedVideo,
                    }}
                    actionBar={({
                      startRecognition,
                      stopRecognition,
                      isRecognizing,
                      isProcessing,
                      onForcePlay,
                    }) => (
                      <CameraActionBar
                        cameraName={camera.name}
                        cameraId={cameraId}
                        onFullscreen={() => {
                          const video = document.getElementById(`video-${streamId}`);
                          if (video && video.requestFullscreen) {
                            video.requestFullscreen();
                          }
                        }}
                        onClose={() => handleCloseCameraFeed(streamId)}
                        onStartRecognize={startRecognition}
                        onStopRecognize={stopRecognition}
                        isRecognizing={isRecognizing}
                        isProcessing={isProcessing}
                        onStartRecording={() => handleStartRecording(streamId)}
                        onStopRecording={() => handleStopRecording(streamId)}
                        isRecording={recording[streamId]?.isRecording || false}
                        onSnapshot={() => handleSnapshot(streamId)}
                        onToggleMute={() => handleToggleMute(streamId)}
                        isMuted={muted[streamId] || false}
                        onPlayPause={() => handlePlayPause(streamId)}
                        isPlaying={playing[streamId] || false}
                        onQualitySettings={(quality) => handleQualitySettings(streamId, quality)}
                        currentQuality={currentQuality[streamId] || 'medium'}
                      />
                    )}
                    onClose={() => handleCloseCameraFeed(streamId)}
                    recordingTimer={recordingTimers[streamId] || 0}
                    style={{
                      width: `${size.width}px`,
                      height: `${size.height}px`,
                      maxWidth: '100%'
                    }}
                  />
                        
                        {/* Resize handle */}
                        <Box
                          sx={{
                            width: 10,
                            height: 10,
                            background: '#607D8B',
                            position: 'absolute',
                      bottom: 0,
                      right: 0,
                            cursor: 'se-resize',
                            '&:hover': {
                              background: '#455A64'
                            }
                    }}
                    onMouseDown={(e) => startResize(streamId, e)}
                  />
                      </Box>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          ) : (
            <Box sx={{ 
              textAlign: 'center', 
              py: 8,
              color: 'text.secondary'
            }}>
              <VideoIcon sx={{ fontSize: 64, color: '#ccc', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                Chưa có camera hoặc video nào được chọn
              </Typography>
              <Typography variant="body2">
                Vui lòng chọn camera từ sidebar hoặc tải video lên để bắt đầu giám sát
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      <Card sx={{ 
        background: 'white',
        borderRadius: 3,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        border: '1px solid #e0e0e0'
      }}>
        

        {/* ===== Giao diện tìm kiếm nâng cao (dựa trên WhiteList) ===== */}
        <Card sx={{ mt: 2, mb: 2, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
          <CardContent>
            {/* Header với icon, title và buttons */}
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <FilterList sx={{ fontSize: 28, color: '#1976d2', mr: 2 }} />
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#1976d2', flexGrow: 1 }}>
                Tìm kiếm kết quả nhận diện biển số
              </Typography>
              
              {/* Action buttons ở góc trên bên phải */}
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button
                  variant="outlined"
                  startIcon={<Refresh />}
                  onClick={resetFilters}
                  sx={{ 
                    borderColor: '#f44336',
                    color: '#f44336',
                    fontWeight: 600,
                    borderRadius: 2,
                    px: 3,
                    py: 1,
                    '&:hover': { 
                      borderColor: '#d32f2f', 
                      backgroundColor: '#ffebee',
                      transform: 'translateY(-1px)'
                    }
                  }}
                >
                  Reset tất cả
                </Button>
                {hasSearchPlate && (
                  <Button
                  variant="contained"
                  startIcon={<SearchIcon />}
                  onClick={applySearch}
                  disabled={searchLoading}
                  sx={{ 
                    backgroundColor: '#1976d2',
                    fontWeight: 600,
                    borderRadius: 2,
                    px: 4,
                    py: 1,
                    '&:hover': { 
                      backgroundColor: '#1565c0',
                      transform: 'translateY(-1px)'
                    },
                    '&:disabled': {
                      backgroundColor: '#e0e0e0',
                      color: '#9e9e9e'
                    }
                  }}
                >
                  {searchLoading ? 'Đang tìm kiếm...' : 'Tìm kiếm'}
                </Button>
                )}
                
              </Box>
            </Box>

            {/* Tất cả bộ lọc hiển thị luôn */}
            <Grid container spacing={2} alignItems="center">
                {/* Biển số xe */}
                <Grid item xs={12} md={3}>
                  <TextField
                    label="Biển số xe"
                    value={searchFilters.plate_number}
                    onChange={e => handleFilterChange('plate_number', e.target.value)}
                    fullWidth
                    size="medium"
                    InputProps={{
                      startAdornment: <InputAdornment position="start"><SearchIcon color="primary" sx={{ fontSize: 22 }} /></InputAdornment>,
                      sx: { 
                        borderRadius: 3, 
                        bgcolor: 'background.paper', 
                        boxShadow: '0 2px 8px rgba(25,118,210,0.06)',
                        '&:hover': { boxShadow: '0 4px 16px rgba(25,118,210,0.10)' },
                        '&.Mui-focused': { boxShadow: '0 4px 24px rgba(25,118,210,0.16)' }
                      }
                    }}
                    InputLabelProps={{ sx: { fontWeight: 700, fontSize: 16, letterSpacing: 0.5 } }}
                  />
                </Grid>

                {/* Khu vực */}
                <Grid item xs={12} md={3}>
                  <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' }}>
                    <InputLabel sx={{ fontWeight: 700, fontSize: 16, letterSpacing: 0.5 }}>Khu vực</InputLabel>
                    <Select
                      value={searchFilters.location_id}
                      label="Khu vực"
                      onChange={e => handleFilterChange('location_id', e.target.value)}
                      startAdornment={<LocationIcon color="info" sx={{ mr: 1, fontSize: 22 }} />}
                      sx={{ 
                        borderRadius: 3, 
                        bgcolor: 'background.paper', 
                        fontSize: 16, 
                        fontWeight: 600,
                        '&:hover': { boxShadow: '0 4px 16px rgba(25,118,210,0.10)' },
                        '&.Mui-focused': { boxShadow: '0 4px 24px rgba(25,118,210,0.16)' }
                      }}
                    >
                      <MenuItem value="">Tất cả khu vực</MenuItem>
                      {locations.map(loc => (
                        <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                {/* Camera */}
                <Grid item xs={12} md={3}>
                  <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' }}>
                    <InputLabel sx={{ fontWeight: 700, fontSize: 16, letterSpacing: 0.5 }}>Camera</InputLabel>
                    <Select
                      value={searchFilters.camera_id}
                      label="Camera"
                      onChange={e => handleFilterChange('camera_id', e.target.value)}
                      sx={{ 
                        borderRadius: 3, 
                        bgcolor: 'background.paper', 
                        fontSize: 16, 
                        fontWeight: 600,
                        '&:hover': { boxShadow: '0 4px 16px rgba(25,118,210,0.10)' },
                        '&.Mui-focused': { boxShadow: '0 4px 24px rgba(25,118,210,0.16)' }
                      }}
                    >
                      <MenuItem value="">Tất cả camera</MenuItem>
                      {searchCameras.map(camera => (
                        <MenuItem key={camera.id} value={camera.id}>
                          {camera.name || `Camera ${camera.id}`}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                {/* Thời gian */}
                <Grid item xs={12} md={3}>
                  <div className="custom-datetime-input">
                    <TextField
                      label="Từ ngày giờ"
                      type="text"
                      value={searchFilters.start_date_display || ''}
                      onChange={e => handleDateTimeChange('start_date', e.target.value, e)}
                      onFocus={handleDateTimeFocus}
                      onBlur={handleDateTimeBlur}
                      fullWidth
                      size="medium"
                      placeholder="dd/mm/yyyy hh:mm"
                      inputProps={{
                        pattern: "\\d{2}/\\d{2}/\\d{4} \\d{2}:\\d{2}",
                        title: "Định dạng: dd/mm/yyyy hh:mm"
                      }}
                      InputLabelProps={{ 
                        shrink: true,
                        sx: { fontWeight: 700, fontSize: 16, letterSpacing: 0.5 } 
                      }}
                      sx={{ 
                        '& .MuiOutlinedInput-root': { 
                          borderRadius: 3, 
                          bgcolor: 'background.paper',
                          boxShadow: '0 2px 8px rgba(25,118,210,0.06)',
                          '&:hover': { boxShadow: '0 4px 16px rgba(25,118,210,0.10)' },
                          '&.Mui-focused': { boxShadow: '0 4px 24px rgba(25,118,210,0.16)' }
                        },
                      }}
                    />
                    <div 
                      className="placeholder-text"
                      onClick={() => handleCalendarClick('start_date')}
                      style={{ cursor: 'pointer' }}
                    >
                      dd/mm/yyyy hh:mm
                    </div>
                    <div 
                      className="calendar-icon"
                      onClick={() => handleCalendarClick('start_date')}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        cursor: 'pointer',
                        opacity: 0.6,
                        fontSize: '16px',
                        zIndex: 10
                      }}
                    >
                      📅
                    </div>
                  </div>
                </Grid>
                
                <Grid item xs={12} md={3}>
                  <div className="custom-datetime-input">
                    <TextField
                      label="Đến ngày giờ"
                      type="text"
                      value={searchFilters.end_date_display || ''}
                      onChange={e => handleDateTimeChange('end_date', e.target.value, e)}
                      onFocus={handleDateTimeFocus}
                      onBlur={handleDateTimeBlur}
                      fullWidth
                      size="medium"
                      placeholder="dd/mm/yyyy hh:mm"
                      inputProps={{
                        pattern: "\\d{2}/\\d{2}/\\d{4} \\d{2}:\\d{2}",
                        title: "Định dạng: dd/mm/yyyy hh:mm"
                      }}
                      InputLabelProps={{ 
                        shrink: true,
                        sx: { fontWeight: 700, fontSize: 16, letterSpacing: 0.5 } 
                      }}
                      sx={{ 
                        '& .MuiOutlinedInput-root': { 
                          borderRadius: 3, 
                          bgcolor: 'background.paper',
                          boxShadow: '0 2px 8px rgba(17, 20, 22, 0.06)',
                          '&:hover': { boxShadow: '0 4px 16px rgba(10, 11, 12, 0.1)' },
                          '&.Mui-focused': { boxShadow: '0 4px 24px rgba(9, 11, 14, 0.16)' }
                        },
                      }}
                    />
                    <div 
                      className="placeholder-text"
                      onClick={() => handleCalendarClick('end_date')}
                      style={{ cursor: 'pointer' }}
                    >
                      dd/mm/yyyy hh:mm
                    </div>
                    <div 
                      className="calendar-icon"
                      onClick={() => handleCalendarClick('end_date')}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        cursor: 'pointer',
                        opacity: 0.6,
                        fontSize: '16px',
                        zIndex: 10
                      }}
                    >
                      📅
                    </div>
                  </div>
                </Grid>

                {/* Độ tin cậy */}
                <Grid item xs={12} md={3}>
                  <TextField
                    label="Độ tin cậy tối thiểu (%)"
                    type="number"
                    value={searchFilters.confidence_min}
                    onChange={e => handleFilterChange('confidence_min', e.target.value)}
                    fullWidth
                    size="medium"
                    inputProps={{ min: 0, max: 100 }}
                    sx={{ 
                      '& .MuiOutlinedInput-root': { 
                        borderRadius: 3, 
                        bgcolor: 'background.paper',
                        boxShadow: '0 2px 8px rgba(25,118,210,0.06)'
                      } 
                    }}
                  />
                </Grid>

                <Grid item xs={12} md={3}>
                  <TextField
                    label="Độ tin cậy tối đa (%)"
                    type="number"
                    value={searchFilters.confidence_max}
                    onChange={e => handleFilterChange('confidence_max', e.target.value)}
                    fullWidth
                    size="medium"
                    inputProps={{ min: 0, max: 100 }}
                    sx={{ 
                      '& .MuiOutlinedInput-root': { 
                        borderRadius: 3, 
                        bgcolor: 'background.paper',
                        boxShadow: '0 2px 8px rgba(25,118,210,0.06)'
                      } 
                    }}
                  />
                </Grid>

                {/* Trạng thái xác minh */}
                <Grid item xs={12} md={3}>
                  <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' }}>
                    <InputLabel sx={{ fontWeight: 700, fontSize: 15 }}>Trạng thái xác minh</InputLabel>
                    <Select
                      value={searchFilters.is_verified}
                      label="Trạng thái xác minh"
                      onChange={e => handleFilterChange('is_verified', e.target.value)}
                      sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 600 }}
                    >
                      {verificationStatusOptions.map(opt => (
                        <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                {/* Whitelist match */}
                <Grid item xs={12} md={3}>
                  <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' }}>
                    <InputLabel sx={{ fontWeight: 700, fontSize: 15 }}>Whitelist</InputLabel>
                    <Select
                      value={searchFilters.is_whitelist_match}
                      label="Whitelist"
                      onChange={e => handleFilterChange('is_whitelist_match', e.target.value)}
                      sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 600 }}
                    >
                      {whitelistMatchOptions.map(opt => (
                        <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                {/* Blacklist match */}
                <Grid item xs={12} md={3}>
                  <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' }}>
                    <InputLabel sx={{ fontWeight: 700, fontSize: 15 }}>Blacklist</InputLabel>
                    <Select
                      value={searchFilters.is_blacklist_match}
                      label="Blacklist"
                      onChange={e => handleFilterChange('is_blacklist_match', e.target.value)}
                      sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 600 }}
                    >
                      {blacklistMatchOptions.map(opt => (
                        <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>


                {/* Nguồn video */}
                <Grid item xs={12} md={3}>
                  <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' }}>
                    <InputLabel sx={{ fontWeight: 700, fontSize: 15 }}>Nguồn</InputLabel>
                    <Select
                      value={searchFilters.source_type}
                      label="Nguồn"
                      onChange={e => handleFilterChange('source_type', e.target.value)}
                      sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 600 }}
                    >
                      {sourceTypeOptions.map(opt => (
                        <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                {/* Cảnh báo */}
                <Grid item xs={12} md={3}>
                  <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper', boxShadow: '0 2px 8px rgba(25,118,210,0.06)' }}>
                    <InputLabel sx={{ fontWeight: 700, fontSize: 15 }}>Cảnh báo</InputLabel>
                    <Select
                      value={searchFilters.alert_triggered}
                      label="Cảnh báo"
                      onChange={e => handleFilterChange('alert_triggered', e.target.value)}
                      sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 600 }}
                    >
                      {alertOptions.map(opt => (
                        <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>




            </Grid>


            {/* Error display */}
            {searchError && (
              <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>
                {searchError}
              </Alert>
            )}

          </CardContent>
        </Card>

        {/* ===== Bảng kết quả nhận diện ===== */}
        <TableContainer component={Paper} sx={{ mt: 2, maxHeight: 600 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, backgroundColor: '#f5f5f5' }}>STT</TableCell>
                <TableCell sx={{ fontWeight: 600, backgroundColor: '#f5f5f5' }}>Biển số</TableCell>
                <TableCell sx={{ fontWeight: 600, backgroundColor: '#f5f5f5' }}>Ảnh biển số</TableCell>
                <TableCell sx={{ fontWeight: 600, backgroundColor: '#f5f5f5' }}>Nguồn</TableCell>
                <TableCell sx={{ fontWeight: 600, backgroundColor: '#f5f5f5' }}>Thời gian</TableCell>
                <TableCell sx={{ fontWeight: 600, backgroundColor: '#f5f5f5' }}>Độ tin cậy</TableCell>
                <TableCell sx={{ fontWeight: 600, backgroundColor: '#f5f5f5' }}>Danh sách</TableCell>
                <TableCell sx={{ fontWeight: 600, backgroundColor: '#f5f5f5' }}>Trạng thái</TableCell>
                <TableCell sx={{ fontWeight: 600, backgroundColor: '#f5f5f5' }}>Hành động</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoadingDetections ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                    <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
                      <CircularProgress size={40} />
                      <Typography>Đang tải dữ liệu...</Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : detectionResults.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                    <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
                      <CameraIcon sx={{ fontSize: 48, color: '#ccc' }} />
                      <Typography variant="h6" color="text.secondary">
                        Chưa có dữ liệu
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Bắt đầu nhận diện để xem kết quả ở đây
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : (
                detectionResults.map((result, index) => (
                  <TableRow key={result.id} hover>
                    {/* STT */}
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>
                        {(currentPage - 1) * itemsPerPage + index + 1}
                      </Typography>
                    </TableCell>
                    
                    {/* Biển số với badges */}
                    <TableCell>
                      <Box>
                        <Typography variant="body1" fontWeight={600} color="primary">
                          {result.plate_number || 'N/A'}
                        </Typography>
                        
                      </Box>
                    </TableCell>
                    
                    {/* Ảnh biển số */}
                    <TableCell>
                      {result.cropped_plate_image_path ? (
                        <Tooltip title={`Click để xem ảnh lớn\nĐường dẫn: ${result.cropped_plate_image_path}`}>
                          <Box sx={{ position: 'relative' }}>
                            <Box
                              component="img"
                              src={(() => {
                                let imagePath = result.cropped_plate_image_path;
                                // Loại bỏ duplicate /static/crops/ nếu có
                                if (imagePath.includes('/static/crops//static/crops/')) {
                                  imagePath = imagePath.replace('/static/crops//static/crops/', '/static/crops/');
                                }
                                // Xử lý đường dẫn ảnh
                                if (imagePath.startsWith('/static/crops/')) {
                                  return `http://localhost:5002${imagePath}`;
                                } else if (imagePath.startsWith('static/crops/')) {
                                  return `http://localhost:5002/${imagePath}`;
                                } else {
                                  return `http://localhost:5002/static/crops/${imagePath}`;
                                }
                              })()}
                              alt="Ảnh biển số"
                              sx={{
                                width: 120,
                                height: 50,
                                objectFit: 'contain',
                                backgroundColor: '#f8f9fa',
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
                                // Xử lý đường dẫn ảnh - simplified logic
                                let imagePath = result.cropped_plate_image_path;
                                
                                // Ensure path starts with /static/crops/
                                if (!imagePath.startsWith('/static/crops/')) {
                                  imagePath = `/static/crops/${imagePath}`;
                                }
                                
                                const cropImageUrl = `http://localhost:5002${imagePath}`;
                                console.log('Opening image URL:', cropImageUrl);
                                window.open(cropImageUrl, '_blank');
                              }}
                              onError={(e) => {
                                console.error('Error loading image:', result.cropped_plate_image_path);
                                
                                // Simplified error handling
                                let imagePath = result.cropped_plate_image_path;
                                if (!imagePath.startsWith('/static/crops/')) {
                                  imagePath = `/static/crops/${imagePath}`;
                                }
                                const fullUrl = `http://localhost:5002${imagePath}`;
                                console.error('Full URL:', fullUrl);
                                
                                e.target.style.display = 'none';
                                // Show fallback
                                const fallback = e.target.parentElement.querySelector('.image-fallback');
                                if (fallback) {
                                  fallback.style.display = 'flex';
                                }
                              }}
                              onLoad={() => {
                                console.log('Image loaded successfully:', result.cropped_plate_image_path);
                              }}
                            />
                            {/* Fallback khi ảnh lỗi */}
                            <Box 
                              className="image-fallback"
                              sx={{ 
                                width: 120, 
                                height: 80, 
                                backgroundColor: '#f5f5f5',
                                borderRadius: 1,
                                border: '1px solid #e0e0e0',
                                display: 'none',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexDirection: 'column'
                              }}
                            >
                              <CameraIcon sx={{ color: '#ccc', fontSize: 16 }} />
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                                Lỗi ảnh
                              </Typography>
                            </Box>
                          </Box>
                        </Tooltip>
                      ) : (
                        <Box sx={{ 
                          width: 120, 
                          height: 80, 
                          backgroundColor: '#f5f5f5',
                          borderRadius: 1,
                          border: '1px solid #e0e0e0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexDirection: 'column'
                        }}>
                          <CameraIcon sx={{ color: '#ccc', fontSize: 16 }} />
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                            Không có ảnh
                          </Typography>
                        </Box>
                      )}
                    </TableCell>
                    
                    {/* Nguồn */}
                    <TableCell>
                      <Box>
                        <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                        {result.source_type === 'camera' ? (
                          <Box sx={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 0.5,
                            padding: '4px 8px',
                            backgroundColor: '#e3f2fd',
                            borderRadius: '12px',
                            border: '1px solid #bbdefb'
                          }}>
                            <Box sx={{ 
                              width: 8, 
                              height: 8, 
                              borderRadius: '50%', 
                              backgroundColor: '#2196f3',
                              animation: 'pulse 2s infinite'
                            }} />
                            <Typography variant="caption" fontWeight={600} color="#1565c0">
                              Camera Live
                            </Typography>
                          </Box>
                        ) : result.source_type === 'video_upload' ? (
                          <Box sx={{ 
                            display: 'flex', 
                            flexDirection: 'column',
                            alignItems: 'flex-start', 
                            gap: 0.5,
                            padding: '4px 8px',
                            backgroundColor: '#f3e5f5',
                            borderRadius: '12px',
                            border: '1px solid #e1bee7'
                          }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <VideoLibrary sx={{ fontSize: 14, color: '#7b1fa2' }} />
                              <Typography variant="caption" fontWeight={600} color="#6a1b9a">
                                Video Upload
                              </Typography>
                            </Box>
                            {result.camera_name && result.camera_name.includes(':') && (
                              <Box sx={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                gap: 0.5, 
                                mt: 0.5
                              }}>
                                <Description sx={{ fontSize: 12, color: '#9c27b0' }} />
                                <Typography variant="caption" color="#8e24aa" sx={{ fontSize: '0.7rem' }}>
                                  {result.camera_name.split(': ')[1]}
                                </Typography>
                              </Box>
                            )}
                          </Box>
                        ) : (
                          <Box sx={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 0.5,
                            padding: '4px 8px',
                            backgroundColor: '#f5f5f5',
                            borderRadius: '12px',
                            border: '1px solid #e0e0e0'
                          }}>
                            <Typography variant="caption" fontWeight={600} color="#666">
                              {result.source_type || 'Unknown'}
                            </Typography>
                          </Box>
                        )}
                        </Box>
                        
                        {result.source_type === 'video_upload' && result.video_filename && (
                          <Box>
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ 
                              mb: 0.5, 
                              fontSize: '0.7rem',
                              fontWeight: 500,
                              color: '#666',
                              wordBreak: 'break-word'
                            }}>
                              {result.video_filename}
                            </Typography>
                          </Box>
                        )}
                        
                        {result.source_type === 'camera' && result.camera_name && (
                          <Box>
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ 
                              mb: 0.5, 
                              fontSize: '0.7rem',
                              fontWeight: 500,
                              color: '#666',
                              wordBreak: 'break-word'
                            }}>
                              {result.camera_name}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </TableCell>
                    
                    {/* Thời gian */}
                    <TableCell>
                      <Box>
                        <Typography variant="body2">
                          {result.detected_at ? 
                            formatDateTimeForDisplay(result.detected_at) : 
                            'N/A'
                        }
                        </Typography>
                        {result.detected_at && (
                          <Typography variant="caption" color="text.secondary">
                            {getRelativeTime(result.detected_at)}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    
                    {/* Độ tin cậy */}
                    <TableCell>
                      <Box>
                        {/* Chi tiết OCR và Detection confidence */}
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          {parseFloat(result.ocr_confidence) > 0 && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', minWidth: '35px' }}>
                                OCR:
                              </Typography>
                              <Chip 
                                label={`${(parseFloat(result.ocr_confidence) * 100).toFixed(0)}%`}
                                size="small"
                                sx={{ 
                                  height: 18,
                                  fontSize: '0.65rem',
                                  backgroundColor: parseFloat(result.ocr_confidence) > 0.8 ? '#e8f5e9' : 
                                                  parseFloat(result.ocr_confidence) > 0.6 ? '#fff3e0' : '#ffebee',
                                  color: parseFloat(result.ocr_confidence) > 0.8 ? '#2e7d32' : 
                                         parseFloat(result.ocr_confidence) > 0.6 ? '#f57c00' : '#d32f2f',
                                  border: '1px solid',
                                  borderColor: parseFloat(result.ocr_confidence) > 0.8 ? '#c8e6c9' : 
                                              parseFloat(result.ocr_confidence) > 0.6 ? '#ffcc02' : '#ffcdd2'
                                }}
                              />
                            </Box>
                          )}
                          
                          {parseFloat(result.detection_confidence) > 0 && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', minWidth: '35px' }}>
                                Det:
                              </Typography>
                              <Chip 
                                label={`${(parseFloat(result.detection_confidence) * 100).toFixed(0)}%`}
                                size="small"
                                sx={{ 
                                  height: 18,
                                  fontSize: '0.65rem',
                                  backgroundColor: parseFloat(result.detection_confidence) > 0.8 ? '#e3f2fd' : 
                                                  parseFloat(result.detection_confidence) > 0.6 ? '#fff8e1' : '#fce4ec',
                                  color: parseFloat(result.detection_confidence) > 0.8 ? '#1565c0' : 
                                         parseFloat(result.detection_confidence) > 0.6 ? '#f57f17' : '#c2185b',
                                  border: '1px solid',
                                  borderColor: parseFloat(result.detection_confidence) > 0.8 ? '#bbdefb' : 
                                              parseFloat(result.detection_confidence) > 0.6 ? '#ffecb3' : '#f8bbd9'
                                }}
                              />
                            </Box>
                          )}
                          
                          {/* Hiển thị thông báo nếu không có độ tin cậy nào */}
                          {parseFloat(result.confidence_score) === 0 && 
                           parseFloat(result.ocr_confidence) === 0 && 
                           parseFloat(result.detection_confidence) === 0 && (
                            <Typography variant="caption" color="error" sx={{ fontSize: '0.7rem', fontStyle: 'italic' }}>
                              Chưa có dữ liệu độ tin cậy
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </TableCell>
                    
                    {/* Danh sách */}
                    <TableCell>
                      <Box display="flex" flexDirection="column" gap={0.5} alignItems="center">
                        {Boolean(result.is_whitelist_match) && (
                          <Chip 
                            label="✓ Whitelist" 
                            size="small" 
                            sx={{ 
                              height: 24, 
                              fontSize: '0.7rem',
                              bgcolor: '#e8f5e9', 
                              color: '#2e7d32',
                              fontWeight: 600,
                              border: '1px solid #c8e6c9',
                              boxShadow: '0 2px 4px rgba(46, 125, 50, 0.2)'
                            }} 
                          />
                        )}
                        {Boolean(result.is_blacklist_match) && (
                          <Chip 
                            label="▲ Blacklist" 
                            size="small" 
                            sx={{ 
                              height: 24, 
                              fontSize: '0.7rem',
                              bgcolor: '#ffebee', 
                              color: '#d32f2f',
                              fontWeight: 600,
                              border: '1px solid #ffcdd2',
                              boxShadow: '0 2px 4px rgba(211, 47, 47, 0.2)',
                              animation: 'pulse 2s infinite'
                            }} 
                          />
                        )}
                        {Boolean(result.alert_triggered) && (
                          <Chip 
                            label="▲ Alert" 
                            size="small" 
                            sx={{ 
                              height: 24, 
                              fontSize: '0.7rem',
                              bgcolor: '#fff3e0', 
                              color: '#f57c00',
                              fontWeight: 600,
                              border: '1px solid #ffcc02',
                              boxShadow: '0 2px 4px rgba(245, 124, 0, 0.2)',
                              animation: 'pulse 1.5s infinite'
                            }} 
                          />
                        )}
                        {!Boolean(result.is_whitelist_match) && !Boolean(result.is_blacklist_match) && !Boolean(result.alert_triggered) && (
                          <Box 
                            sx={{ 
                              display: 'flex', 
                              flexDirection: 'column', 
                              alignItems: 'center',
                              gap: 0.5,
                              py: 1
                            }}
                          >
                            <Box
                              sx={{
                                width: 40,
                                height: 40,
                                borderRadius: '50%',
                                bgcolor: '#f5f5f5',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '2px solid #e0e0e0'
                              }}
                            >
                              <Typography 
                                variant="body2" 
                                sx={{ 
                                  fontSize: '1.2rem',
                                  color: '#9e9e9e',
                                  fontWeight: 600
                                }}
                              >
                                —
                              </Typography>
                            </Box>
                            <Typography 
                              variant="caption" 
                              sx={{ 
                                fontSize: '0.65rem', 
                                color: '#9e9e9e',
                                fontWeight: 500,
                                textAlign: 'center'
                              }}
                            >
                              Chưa phân loại
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </TableCell>
                    
                    {/* Trạng thái */}
                    <TableCell>
                      <Box display="flex" flexDirection="column" gap={0.5}>
                        <Chip 
                          label={result.is_verified ? 'Đã xác minh' : 'Chưa xác minh'}
                          size="small"
                          sx={{ 
                            fontWeight: 600,
                            backgroundColor: result.is_verified ? '#4caf50' : '#ff9800',
                            color: 'white'
                          }}
                        />
                        
                      </Box>
                    </TableCell>
                    
                    {/* Hành động */}
                    <TableCell>
                      <Box display="flex" gap={0.5} alignItems="center">
                        {/* Nút Xem chi tiết */}
                        <Tooltip title="Xem chi tiết">
                          <span>
                            {hasViewPlate && (
<IconButton 
                              size="small" 
                              color="primary"
                              onClick={() => handleViewDetails(result)}
                              disabled={actionLoading.view.has(result.id)}
                              sx={{
                                opacity: actionLoading.view.has(result.id) ? 0.6 : 1,
                                transition: 'all 0.2s ease'
                              }}
                            >
                              {actionLoading.view.has(result.id) ? (
                                <Box
                                  sx={{
                                    width: 16,
                                    height: 16,
                                    border: '2px solid #1976d2',
                                    borderTop: '2px solid transparent',
                                    borderRadius: '50%',
                                    animation: 'spin 1s linear infinite',
                                    '@keyframes spin': {
                                      '0%': { transform: 'rotate(0deg)' },
                                      '100%': { transform: 'rotate(360deg)' }
                                    }
                                  }}
                                />
                              ) : (
                                <ViewIcon fontSize="small" />
                              )}
                            </IconButton>
                            )}
                            
                          </span>
                        </Tooltip>
                        
                        {/* Nút Xác minh - chỉ hiển thị nếu chưa xác minh */}
                        {!result.is_verified && (
                          <Tooltip title="Xác minh biển số">
                            <span>
                              {hasVerifyPlate && (
<IconButton 
                                size="small" 
                                color="success"
                                onClick={() => handleVerify(result.id)}
                                disabled={actionLoading.verify.has(result.id)}
                                sx={{
                                  opacity: actionLoading.verify.has(result.id) ? 0.6 : 1,
                                  transition: 'all 0.2s ease',
                                  '&:hover': {
                                    backgroundColor: 'rgba(76, 175, 80, 0.1)',
                                    transform: 'scale(1.1)'
                                  }
                                }}
                              >
                                {actionLoading.verify.has(result.id) ? (
                                  <Box
                                    sx={{
                                      width: 16,
                                      height: 16,
                                      border: '2px solid #4caf50',
                                      borderTop: '2px solid transparent',
                                      borderRadius: '50%',
                                      animation: 'spin 1s linear infinite',
                                      '@keyframes spin': {
                                        '0%': { transform: 'rotate(0deg)' },
                                        '100%': { transform: 'rotate(360deg)' }
                                      }
                                    }}
                                  />
                                ) : (
                                  <UploadIcon fontSize="small" />
                                )}
                              </IconButton>
                              )}
                              
                            </span>
                          </Tooltip>
                        )}
                        
                        {/* Nút Xóa */}
                        <Tooltip title="Xóa kết quả">
                          <span>
                            {hasDeletePlate && (
<IconButton 
                              size="small" 
                              color="error"
                              onClick={() => handleDelete(result.id)}
                              disabled={actionLoading.delete.has(result.id)}
                              sx={{
                                opacity: actionLoading.delete.has(result.id) ? 0.6 : 1,
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                  backgroundColor: 'rgba(244, 67, 54, 0.1)',
                                  transform: 'scale(1.1)'
                                }
                              }}
                            >
                              {actionLoading.delete.has(result.id) ? (
                                <Box
                                  sx={{
                                    width: 16,
                                    height: 16,
                                    border: '2px solid #f44336',
                                    borderTop: '2px solid transparent',
                                    borderRadius: '50%',
                                    animation: 'spin 1s linear infinite',
                                    '@keyframes spin': {
                                      '0%': { transform: 'rotate(0deg)' },
                                      '100%': { transform: 'rotate(360deg)' }
                                    }
                                  }}
                                />
                              ) : (
                                <ClearIcon fontSize="small" />
                              )}
                            </IconButton>
                            )}
                            
                          </span>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Enhanced Pagination - Giống WhiteList */}
        <Box sx={{ 
          display: 'flex', 
          flexDirection: { xs: 'column', md: 'row' }, 
          alignItems: { xs: 'stretch', md: 'center' }, 
          justifyContent: 'space-between', 
          gap: 2, 
          p: 2, 
          borderTop: '1px solid #e0e0e0', 
          backgroundColor: '#fafafa' 
        }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
            Hiển thị <strong>{((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalItems)}</strong> của <strong>{totalItems}</strong> bản ghi
          </Typography>
          
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: 'center', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" color="text.secondary">Hiển thị:</Typography>
              <Select 
                value={itemsPerPage} 
                onChange={handleItemsPerPageChange} 
                size="small" 
                sx={{ minWidth: 80, '& .MuiSelect-select': { py: 0.5, fontSize: '0.875rem' } }}
                renderValue={v => `${v}/ trang`}
              >
                {[5, 10, 20, 50, 100].map(size => (
                  <MenuItem key={size} value={size}>{size}/ trang</MenuItem>
                ))}
              </Select>
            </Box>
            
            {/* Pagination controls - giống như WhiteList */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Button 
                size="small" 
                variant="outlined" 
                onClick={() => {
                  setCurrentPage(1);
                  setSearchError(null);
                }} 
                disabled={currentPage === 1} 
                sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}
              >
                <FirstPage fontSize="small" />
              </Button>
              
              <Button 
                size="small" 
                variant="outlined" 
                onClick={() => {
                  setCurrentPage(prev => Math.max(1, prev - 1));
                  setSearchError(null);
                }} 
                disabled={currentPage === 1} 
                sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}
              >
                <ChevronLeft fontSize="small" />
              </Button>
              
              {getPaginationItems(currentPage, totalPages).map((item, idx) => (
                item === '...'
                  ? <Box key={`dots-${idx}`} sx={{ px: 1, color: '#999' }}>...</Box>
                  : <Button 
                      key={item} 
                      variant={item === currentPage ? 'contained' : 'outlined'} 
                      size="small" 
                      onClick={() => {
                        setCurrentPage(item);
                        setSearchError(null);
                      }} 
                      sx={{ 
                        minWidth: 32, 
                        width: 32, 
                        height: 32, 
                        borderRadius: 1, 
                        fontSize: '0.875rem', 
                        fontWeight: item === currentPage ? 600 : 400, 
                        ...(item === currentPage ? { 
                          backgroundColor: '#4caf50', 
                          color: 'white', 
                          border: 'none', 
                          '&:hover': { backgroundColor: '#388e3c' } 
                        } : { 
                          borderColor: '#e0e0e0', 
                          color: '#666', 
                          '&:hover': { 
                            backgroundColor: '#f5f5f5', 
                            borderColor: '#4caf50' 
                          } 
                        }) 
                      }}
                    >
                      {item}
                    </Button>
              ))}
              
              <Button 
                size="small" 
                variant="outlined" 
                onClick={() => {
                  setCurrentPage(prev => Math.min(totalPages, prev + 1));
                  setSearchError(null);
                }} 
                disabled={currentPage === totalPages || totalPages === 0} 
                sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}
              >
                <ChevronRight fontSize="small" />
              </Button>
              
              <Button 
                size="small" 
                variant="outlined" 
                onClick={() => {
                  setCurrentPage(totalPages);
                  setSearchError(null);
                }} 
                disabled={currentPage === totalPages || totalPages === 0} 
                sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}
              >
                <LastPage fontSize="small" />
              </Button>
            </Box>
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" color="text.secondary">Đến trang:</Typography>
              <InputBase 
                value={gotoPage} 
                onChange={e => setGotoPage(e.target.value.replace(/[^0-9]/g, ''))} 
                onKeyDown={e => { 
                  if (e.key === 'Enter') { 
                    const page = parseInt(gotoPage, 10); 
                    if (page && page >= 1 && page <= totalPages) { 
                      setCurrentPage(page); 
                      setGotoPage(''); 
                      setSearchError(null);
                    } 
                  } 
                }} 
                placeholder="1" 
                sx={{ 
                  width: 60, 
                  height: 32, 
                  border: '1px solid #e0e0e0', 
                  borderRadius: 1, 
                  px: 1, 
                  fontSize: '0.875rem', 
                  '& input': { textAlign: 'center' } 
                }} 
              />
              <Button 
                size="small" 
                variant="outlined" 
                onClick={() => { 
                  const page = parseInt(gotoPage, 10); 
                  if (page && page >= 1 && page <= totalPages) { 
                    setCurrentPage(page); 
                    setGotoPage(''); 
                    setSearchError(null);
                  } 
                }} 
                disabled={!gotoPage || parseInt(gotoPage, 10) < 1 || parseInt(gotoPage, 10) > totalPages} 
                sx={{ 
                  minWidth: 'auto', 
                  px: 2, 
                  height: 32, 
                  textTransform: 'none', 
                  fontSize: '0.875rem' 
                }}
              >
                Đi
              </Button>
            </Box>
          </Box>
        </Box>
      </Card>

      {/* Configuration Modal */}
      {showConfig &&
        selectedCameraId &&
        ReactDOM.createPortal(
          <div
            className="modal-overlay"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.7)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 1000,
            }}
            onClick={() => setShowConfig(false)}
          >
            <div
              className="modal-content"
              style={{
                backgroundColor: "white",
                padding: "20px",
                borderRadius: "8px",
                width: "80%",
                maxWidth: "800px",
                maxHeight: "80vh",
                overflowY: "auto",
                position: "relative",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <CameraConfigurationPage
                cameraId={selectedCameraId}
                onSave={handleSaveConfig}
                onClose={() => setShowConfig(false)}
              />
              <button
                style={{
                  position: "absolute",
                  top: "10px",
                  right: "10px",
                  background: "#ff4444",
                  color: "white",
                  border: "none",
                  borderRadius: "50%",
                  width: "30px",
                  height: "30px",
                  cursor: "pointer",
                  fontSize: "16px",
                }}
                onClick={() => setShowConfig(false)}
              >
                ×
              </button>
            </div>
          </div>,
          document.body
        )}

        {/* Modal xem chi tiết - Thiết kế cải tiến */}
        {showDetailsModal && selectedResult && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: '20px',
            }}
            onClick={() => setShowDetailsModal(false)}
          >
            <div
              style={{
                backgroundColor: 'white',
                borderRadius: '16px',
                padding: '0',
                width: '90%',
                maxWidth: '900px',
                maxHeight: '90vh',
                overflow: 'hidden',
                position: 'relative',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
                display: 'flex',
                flexDirection: 'column',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header với gradient */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)',
                  padding: '20px 24px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  color: 'white',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px'
                  }}>
                    🚗
                  </div>
                  <div>
                    <h2 style={{ 
                      margin: 0, 
                      fontSize: '20px',
                      fontWeight: '600',
                      color: 'white'
                    }}>
                      Chi tiết nhận diện biển số
                    </h2>
                    <p style={{ 
                      margin: '4px 0 0 0', 
                      fontSize: '14px',
                      color: 'rgba(255, 255, 255, 0.8)'
                    }}>
                      Thông tin chi tiết về kết quả nhận diện
                    </p>
                  </div>
                </div>
                <button
                  style={{
                    background: 'rgba(255, 255, 255, 0.2)',
                    border: 'none',
                    fontSize: '24px',
                    cursor: 'pointer',
                    color: 'white',
                    padding: '8px',
                    borderRadius: '50%',
                    width: '40px',
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background 0.2s ease',
                  }}
                  onClick={() => setShowDetailsModal(false)}
                  onMouseOver={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.3)'}
                  onMouseOut={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.2)'}
                >
                  ×
                </button>
              </div>
              
              {/* Content với scroll */}
              <div style={{ 
                padding: '24px', 
                maxHeight: 'calc(90vh - 120px)', 
                overflow: 'auto',
                flex: 1
              }}>
                {/* Thông tin chính - Layout 2 cột */}
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr', 
                  gap: '20px', 
                  marginBottom: '24px' 
                }}>
                  {/* Biển số xe */}
                  <div style={{
                    background: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
                    padding: '20px',
                    borderRadius: '12px',
                    textAlign: 'center',
                    border: '2px solid #1976d2',
                    boxShadow: '0 4px 12px rgba(25, 118, 210, 0.15)'
                  }}>
                    <div style={{ fontSize: '14px', color: '#1565c0', marginBottom: '8px', fontWeight: '500' }}>
                      🚗 Biển số xe
                    </div>
                    <div style={{ 
                      fontSize: '24px', 
                      fontWeight: 'bold', 
                      color: '#1976d2',
                      textShadow: '0 1px 2px rgba(0,0,0,0.1)'
                    }}>
                      {selectedResult.plate_number || 'N/A'}
                    </div>
                    {selectedResult.ocr_raw_text && selectedResult.ocr_raw_text !== selectedResult.plate_number && (
                      <div style={{ 
                        fontSize: '12px', 
                        color: '#666', 
                        marginTop: '4px',
                        fontStyle: 'italic'
                      }}>
                        Raw: {selectedResult.ocr_raw_text}
                      </div>
                    )}
                  </div>
                  
                  {/* Độ tin cậy */}
                  <div style={{
                    background: 'linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%)',
                    padding: '20px',
                    borderRadius: '12px',
                    textAlign: 'center',
                    border: '2px solid #7b1fa2',
                    boxShadow: '0 4px 12px rgba(123, 31, 162, 0.15)'
                  }}>
                    <div style={{ fontSize: '14px', color: '#6a1b9a', marginBottom: '12px', fontWeight: '500' }}>
                      🎯 Độ tin cậy
                    </div>
                    
                    {/* Confidence Score chính */}
                    {parseFloat(selectedResult.confidence_score) > 0 && (
                      <div style={{ 
                        fontSize: '20px', 
                        fontWeight: 'bold', 
                        color: '#7b1fa2',
                        textShadow: '0 1px 2px rgba(0,0,0,0.1)',
                        marginBottom: '8px'
                      }}>
                        Tổng: {(parseFloat(selectedResult.confidence_score) * 100).toFixed(1)}%
                      </div>
                    )}
                    
                    {/* Chi tiết OCR và Detection */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
                      {parseFloat(selectedResult.ocr_confidence) > 0 && (
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '8px',
                          background: 'rgba(255,255,255,0.7)',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '12px'
                        }}>
                          <span style={{ fontWeight: '500', color: '#6a1b9a' }}>OCR:</span>
                          <span style={{ 
                            fontWeight: 'bold',
                            color: parseFloat(selectedResult.ocr_confidence) > 0.8 ? '#2e7d32' : 
                                   parseFloat(selectedResult.ocr_confidence) > 0.6 ? '#f57c00' : '#d32f2f'
                          }}>
                            {(parseFloat(selectedResult.ocr_confidence) * 100).toFixed(0)}%
                          </span>
                        </div>
                      )}
                      
                      {parseFloat(selectedResult.detection_confidence) > 0 && (
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '8px',
                          background: 'rgba(255,255,255,0.7)',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '12px'
                        }}>
                          <span style={{ fontWeight: '500', color: '#6a1b9a' }}>Detection:</span>
                          <span style={{ 
                            fontWeight: 'bold',
                            color: parseFloat(selectedResult.detection_confidence) > 0.8 ? '#1565c0' : 
                                   parseFloat(selectedResult.detection_confidence) > 0.6 ? '#f57f17' : '#c2185b'
                          }}>
                            {(parseFloat(selectedResult.detection_confidence) * 100).toFixed(0)}%
                          </span>
                        </div>
                      )}
                      
                      {/* Hiển thị thông báo nếu không có độ tin cậy nào */}
                      {parseFloat(selectedResult.confidence_score) === 0 && 
                       parseFloat(selectedResult.ocr_confidence) === 0 && 
                       parseFloat(selectedResult.detection_confidence) === 0 && (
                        <div style={{ 
                          fontSize: '12px', 
                          color: '#d32f2f', 
                          fontStyle: 'italic',
                          background: 'rgba(255,255,255,0.7)',
                          padding: '4px 8px',
                          borderRadius: '6px'
                        }}>
                          Chưa có dữ liệu độ tin cậy
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Thông tin chi tiết - Layout 3 cột */}
                <div style={{
                  background: 'linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%)',
                  borderRadius: '12px',
                  padding: '20px',
                  marginBottom: '24px',
                  border: '1px solid #e0e0e0',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                }}>
                  <h3 style={{ 
                    margin: '0 0 16px 0', 
                    color: '#333', 
                    fontSize: '18px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    📋 Thông tin chi tiết
                  </h3>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                    gap: '16px' 
                  }}>
                    <div style={{
                      background: 'white',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #e0e0e0'
                    }}>
                      <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px', fontWeight: '500' }}>
                        🕐 Thời gian nhận diện
                      </div>
                      <div style={{ fontWeight: '600', color: '#333', fontSize: '14px' }}>
                        {selectedResult.detected_at ? 
                          formatDateTimeForDisplay(selectedResult.detected_at) : 
                          'N/A'
                        }
                      </div>
                    </div>
                    
                    <div style={{
                      background: 'white',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #e0e0e0'
                    }}>
                      <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px', fontWeight: '500' }}>
                        ✅ Trạng thái xác minh
                      </div>
                      <div style={{ 
                        fontWeight: '600', 
                        color: selectedResult.is_verified ? '#4caf50' : '#ff9800',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        {selectedResult.is_verified ? '✅ Đã xác minh' : '⏳ Chưa xác minh'}
                      </div>
                    </div>
                    
                    {selectedResult.source_type === 'video_upload' ? (
                      <div style={{
                        background: 'white',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid #e0e0e0'
                      }}>
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px', fontWeight: '500' }}>
                          🎬 Video Upload
                        </div>
                        <div style={{ fontWeight: '600', color: '#333', fontSize: '14px', wordBreak: 'break-all' }}>
                          {selectedResult.video_filename || 'N/A'}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{
                          background: 'white',
                          padding: '12px',
                          borderRadius: '8px',
                          border: '1px solid #e0e0e0'
                        }}>
                          <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px', fontWeight: '500' }}>
                            📹 Camera
                          </div>
                          <div style={{ fontWeight: '600', color: '#333', fontSize: '14px' }}>
                            {selectedResult.camera_name || `Camera ${selectedResult.camera_id}` || 'N/A'}
                          </div>
                        </div>
                        
                        <div style={{
                          background: 'white',
                          padding: '12px',
                          borderRadius: '8px',
                          border: '1px solid #e0e0e0'
                        }}>
                          <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px', fontWeight: '500' }}>
                            📍 Vị trí
                          </div>
                          <div style={{ fontWeight: '600', color: '#333', fontSize: '14px' }}>
                            {selectedResult.location_name || 'N/A'}
                          </div>
                        </div>
                      </>
                    )}
                    
                  </div>
                </div>
                
                {/* Hình ảnh biển số */}
                {selectedResult.cropped_plate_image_path && (
                  <div style={{
                    background: 'linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%)',
                    borderRadius: '12px',
                    padding: '20px',
                    border: '1px solid #e0e0e0',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                  }}>
                    <h3 style={{ 
                      margin: '0 0 16px 0', 
                      color: '#333', 
                      fontSize: '18px',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      📸 Hình ảnh biển số
                    </h3>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'center',
                      background: 'white',
                      borderRadius: '8px',
                      padding: '16px',
                      border: '2px solid #e0e0e0',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    }}>
                      <img
                        src={(() => {
                          let imagePath = selectedResult.cropped_plate_image_path;
                          if (imagePath.includes('/static/crops//static/crops/')) {
                            imagePath = imagePath.replace('/static/crops//static/crops/', '/static/crops/');
                          }
                                // Xử lý đường dẫn ảnh
                                if (imagePath.startsWith('/static/crops/')) {
                                  return `http://localhost:5002${imagePath}`;
                                } else if (imagePath.startsWith('static/crops/')) {
                                  return `http://localhost:5002/${imagePath}`;
                                } else {
                                  return `http://localhost:5002/static/crops/${imagePath}`;
                                }
                        })()}
                        alt="Biển số xe"
                        style={{
                          maxWidth: '100%',
                          maxHeight: '300px',
                          width: '100%',
                          height: 'auto',
                          objectFit: 'contain',
                          borderRadius: '8px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                        }}
                        onError={(e) => {
                          console.error('Error loading image:', selectedResult.cropped_plate_image_path);
                          e.target.style.display = 'none';
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
              
              {/* Footer với gradient */}
              <div style={{
                background: 'linear-gradient(135deg, #f5f5f5 0%, #eeeeee 100%)',
                padding: '16px 24px',
                borderTop: '1px solid #e0e0e0',
                display: 'flex',
                gap: '12px',
                justifyContent: 'flex-end',
                borderRadius: '0 0 16px 16px'
              }}>
                {selectedResult.cropped_plate_image_path && (
                  <button
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#2196f3',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 2px 8px rgba(33, 150, 243, 0.3)'
                    }}
                    onClick={() => {
                      if (selectedResult.cropped_plate_image_path) {
                        let imagePath = selectedResult.cropped_plate_image_path;
                        if (imagePath.includes('/static/crops//static/crops/')) {
                          imagePath = imagePath.replace('/static/crops//static/crops/', '/static/crops/');
                        }
                        const imageUrl = imagePath.startsWith('/static/crops/') 
                          ? `http://localhost:5002${imagePath}`
                          : `http://localhost:5002/static/crops/${imagePath}`;
                        window.open(imageUrl, '_blank');
                      }
                    }}
                    onMouseOver={(e) => {
                      e.target.style.backgroundColor = '#1976d2';
                      e.target.style.transform = 'translateY(-1px)';
                    }}
                    onMouseOut={(e) => {
                      e.target.style.backgroundColor = '#2196f3';
                      e.target.style.transform = 'translateY(0)';
                    }}
                  >
                    📷 Mở hình ảnh
                  </button>
                )}
                <button
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#757575',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 8px rgba(117, 117, 117, 0.3)'
                  }}
                  onClick={() => setShowDetailsModal(false)}
                  onMouseOver={(e) => {
                    e.target.style.backgroundColor = '#616161';
                    e.target.style.transform = 'translateY(-1px)';
                  }}
                  onMouseOut={(e) => {
                    e.target.style.backgroundColor = '#757575';
                    e.target.style.transform = 'translateY(0)';
                  }}
                >
                  ✕ Đóng
                </button>
              </div>
            </div>
          </div>
        )}


        {/* Modal xác nhận hành động - Format giống modal xem chi tiết */}
        {confirmationModal.open && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10000,
              padding: '20px',
            }}
            onClick={closeConfirmationModal}
          >
            <div
              style={{
                backgroundColor: 'white',
                borderRadius: '16px',
                padding: '0',
                width: '90%',
                maxWidth: '600px',
                maxHeight: '90vh',
                overflow: 'hidden',
                position: 'relative',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
                display: 'flex',
                flexDirection: 'column',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header với gradient - Format giống modal xem chi tiết */}
              <div
                style={{
                  background: confirmationModal.type === 'delete' 
                    ? 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)'
                    : 'linear-gradient(135deg, #4caf50 0%, #388e3c 100%)',
                  padding: '20px 24px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  color: 'white',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px'
                  }}>
                    {confirmationModal.type === 'delete' ? '🗑️' : '🔍'}
                  </div>
                  <div>
                    <h2 style={{ 
                      margin: 0, 
                      fontSize: '20px',
                      fontWeight: '600',
                      color: 'white'
                    }}>
                      {confirmationModal.title}
                    </h2>
                    <p style={{ 
                      margin: '4px 0 0 0', 
                      fontSize: '14px',
                      color: 'rgba(255, 255, 255, 0.8)'
                    }}>
                      {confirmationModal.message}
                    </p>
                  </div>
                </div>
                <button
                  style={{
                    background: 'rgba(255, 255, 255, 0.2)',
                    border: 'none',
                    fontSize: '24px',
                    cursor: 'pointer',
                    color: 'white',
                    padding: '8px',
                    borderRadius: '50%',
                    width: '40px',
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background 0.2s ease',
                  }}
                  onClick={closeConfirmationModal}
                  onMouseOver={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.3)'}
                  onMouseOut={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.2)'}
                >
                  ×
                </button>
              </div>
              
              {/* Content với scroll - Format giống modal xem chi tiết */}
              <div style={{ 
                padding: '24px', 
                maxHeight: 'calc(90vh - 120px)', 
                overflow: 'auto',
                flex: 1
              }}>
                {/* Chỉ hiển thị chi tiết cho chức năng xác minh */}
                {confirmationModal.type === 'verify' && confirmationModal.details.length > 0 && (
                  <div style={{
                    background: 'linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%)',
                    borderRadius: '12px',
                    padding: '20px',
                    marginBottom: '24px',
                    border: '1px solid #e0e0e0',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                  }}>
                    <h3 style={{ 
                      margin: '0 0 16px 0', 
                      color: '#333', 
                      fontSize: '18px',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      📋 Thông tin chi tiết
                    </h3>
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                      gap: '16px' 
                    }}>
                      {confirmationModal.details.map((detail, index) => (
                        <div 
                          key={index}
                          style={{
                            background: 'white',
                            padding: '12px',
                            borderRadius: '8px',
                            border: '1px solid #e0e0e0',
                            fontSize: '14px',
                            color: '#333',
                            fontWeight: '500'
                          }}
                        >
                          {detail}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hình ảnh biển số - chỉ hiển thị cho chức năng xác minh */}
                {confirmationModal.type === 'verify' && confirmationModal.result && confirmationModal.result.cropped_plate_image_path && (
                  <div style={{
                    background: 'linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%)',
                    borderRadius: '12px',
                    padding: '20px',
                    border: '1px solid #e0e0e0',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                  }}>
                    <h3 style={{ 
                      margin: '0 0 16px 0', 
                      color: '#333', 
                      fontSize: '18px',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      📸 Hình ảnh biển số
                    </h3>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'center',
                      background: 'white',
                      borderRadius: '8px',
                      padding: '16px',
                      border: '2px solid #e0e0e0',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    }}>
                      <img
                        src={(() => {
                          let imagePath = confirmationModal.result.cropped_plate_image_path;
                          if (imagePath.includes('/static/crops//static/crops/')) {
                            imagePath = imagePath.replace('/static/crops//static/crops/', '/static/crops/');
                          }
                                // Xử lý đường dẫn ảnh
                                if (imagePath.startsWith('/static/crops/')) {
                                  return `http://localhost:5002${imagePath}`;
                                } else if (imagePath.startsWith('static/crops/')) {
                                  return `http://localhost:5002/${imagePath}`;
                                } else {
                                  return `http://localhost:5002/static/crops/${imagePath}`;
                                }
                        })()}
                        alt="Biển số xe"
                        style={{
                          maxWidth: '100%',
                          maxHeight: '200px',
                          width: '100%',
                          height: 'auto',
                          objectFit: 'contain',
                          borderRadius: '8px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                        }}
                        onError={(e) => {
                          console.error('Error loading image:', confirmationModal.result.cropped_plate_image_path);
                          e.target.style.display = 'none';
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
              
              {/* Footer với buttons - Format giống modal xem chi tiết */}
              <div style={{
                background: 'linear-gradient(135deg, #f5f5f5 0%, #eeeeee 100%)',
                padding: '16px 24px',
                borderTop: '1px solid #e0e0e0',
                display: 'flex',
                gap: '12px',
                justifyContent: 'flex-end',
                borderRadius: '0 0 16px 16px'
              }}>
                <button
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#757575',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 8px rgba(117, 117, 117, 0.3)',
                    opacity: confirmationModal.loading ? 0.6 : 1,
                    pointerEvents: confirmationModal.loading ? 'none' : 'auto'
                  }}
                  onClick={closeConfirmationModal}
                  onMouseOver={(e) => {
                    if (!confirmationModal.loading) {
                      e.target.style.backgroundColor = '#616161';
                      e.target.style.transform = 'translateY(-1px)';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!confirmationModal.loading) {
                      e.target.style.backgroundColor = '#757575';
                      e.target.style.transform = 'translateY(0)';
                    }
                  }}
                >
                  ✕ Hủy bỏ
                </button>
                <button
                  style={{
                    padding: '10px 20px',
                    backgroundColor: confirmationModal.type === 'delete' ? '#f44336' : '#4caf50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: confirmationModal.loading ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    transition: 'all 0.2s ease',
                    boxShadow: confirmationModal.type === 'delete' 
                      ? '0 2px 8px rgba(244, 67, 54, 0.3)'
                      : '0 2px 8px rgba(76, 175, 80, 0.3)',
                    opacity: confirmationModal.loading ? 0.6 : 1,
                    pointerEvents: confirmationModal.loading ? 'none' : 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  onClick={confirmationModal.onConfirm}
                  onMouseOver={(e) => {
                    if (!confirmationModal.loading) {
                      e.target.style.backgroundColor = confirmationModal.type === 'delete' ? '#d32f2f' : '#388e3c';
                      e.target.style.transform = 'translateY(-1px)';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!confirmationModal.loading) {
                      e.target.style.backgroundColor = confirmationModal.type === 'delete' ? '#f44336' : '#4caf50';
                      e.target.style.transform = 'translateY(0)';
                    }
                  }}
                >
                  {confirmationModal.loading ? (
                    <>
                      <div style={{
                        width: '16px',
                        height: '16px',
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderTop: '2px solid white',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                      }} />
                      Đang xử lý...
                    </>
                  ) : (
                    <>
                      {confirmationModal.type === 'delete' ? '🗑️ Xóa' : '✅ Xác minh'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CSS Animation */}
        <style jsx>{`
          @keyframes modalSlideIn {
            from {
              opacity: 0;
              transform: scale(0.9) translateY(-20px);
            }
            to {
              opacity: 1;
              transform: scale(1) translateY(0);
            }
          }
          
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>

        {/* Enhanced Alert (giống User management) */}
        {alertBox.open && (
          <Alert 
            severity={alertBox.error ? 'error' : 'success'}
            onClose={() => setAlertBox({ ...alertBox, open: false })}
            sx={{ 
              position: 'fixed', 
              top: 20, 
              right: 20, 
              zIndex: 9999,
              minWidth: 350,
              borderRadius: 3,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
              border: '1px solid #e0e0e0',
              '& .MuiAlert-icon': {
                fontSize: '1.5rem'
              },
              '& .MuiAlert-message': {
                fontWeight: 500
              }
            }}
          >
            {alertBox.msg}
          </Alert>
        )}

      {/* Toast Notifications cho BlackList/WhiteList */}
      {toastNotifications.map((notification, index) => (
        <Snackbar
          key={notification.id}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          open={true}
          autoHideDuration={notification.type === 'blacklist' ? 8000 : 6000}
          onClose={() => setToastNotifications(prev => prev.filter(n => n.id !== notification.id))}
          sx={{
            position: 'fixed',
            top: 24 + (index * 80), // Xếp chồng các thông báo
            right: 24,
            zIndex: 9999,
            '& .MuiSnackbar-root': {
              position: 'fixed !important'
            }
          }}
        >
          <Alert
            onClose={() => setToastNotifications(prev => prev.filter(n => n.id !== notification.id))}
            severity={notification.severity}
            sx={{ 
              width: '100%',
              minWidth: 350,
              maxWidth: 500,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
              borderRadius: 2,
              '& .MuiAlert-message': {
                fontSize: '0.95rem',
                fontWeight: 500
              }
            }}
          >
            <Typography variant="body1" sx={{ fontWeight: 500 }}>
              {notification.message}
            </Typography>
          </Alert>
        </Snackbar>
      ))}
    </Box>
  );
};

export default SamplePage;