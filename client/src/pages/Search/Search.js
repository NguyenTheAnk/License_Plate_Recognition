import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, TextField, Button, Select, MenuItem, InputLabel, FormControl, Tabs, Tab, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Autocomplete, Snackbar, Alert, Stack, Avatar, Fade, useTheme, alpha, Paper, Tooltip, Badge, Divider,
  TablePagination
} from '@mui/material';
import { 
  Search as SearchIcon, DirectionsCar, Person, Phone, Email, LocationOn, CheckCircle, Block, History, CameraAlt, Info, Event, Description, Close as CloseIcon, FilterList, Refresh, TuneRounded, Visibility, ArrowForward, Timeline, Security, LocationSearching, FirstPage, LastPage, ChevronLeft, ChevronRight, BarChart, Videocam, Code
} from '@mui/icons-material';
import { fetchDataFromAPI } from '../../utils/auth';
import { InputBase, InputAdornment } from '@mui/material';

function SearchPage() {
  const theme = useTheme();
  
  // Danh sách khu vực lấy từ API
  const [locations, setLocations] = useState([]);

  // Danh sách camera lấy từ API
  const [cameras, setCameras] = useState([]);

  const statusOptions = [
    { value: '', label: 'Tất cả trạng thái', color: 'default' },
    { value: 'whitelist', label: 'Whitelist', color: 'success' },
    { value: 'blacklist', label: 'Blacklist', color: 'error' }
  ];


  // Enhanced tab configuration with better icons and descriptions
  const tabList = [
    { 
      label: 'Whitelist', 
      value: 'whitelist', 
      icon: <CheckCircle />, 
      description: 'Danh sách cho phép',
      color: 'success'
    },
    { 
      label: 'Blacklist', 
      value: 'blacklist', 
      icon: <Block />, 
      description: 'Danh sách cấm',
      color: 'error'
    },
    { 
      label: 'Camera', 
      value: 'camera', 
      icon: <CameraAlt />, 
      description: 'Hệ thống camera',
      color: 'warning'
    },
    { 
      label: 'Khu vực', 
      value: 'location', 
      icon: <LocationOn />, 
      description: 'Quản lý khu vực',
      color: 'info'
    },
    { 
      label: 'Lộ trình', 
      value: 'journey', 
      icon: <Timeline />, 
      description: 'Theo dõi lộ trình',
      color: 'primary'
    },
    { 
      label: 'Phát hiện', 
      value: 'plate', 
      icon: <LocationSearching />, 
      description: 'Phát hiện biển số',
      color: 'secondary'
    },
  ];

  const accessListTypes = [
    { value: '', label: 'Tất cả danh sách', color: 'default' },
    { value: 'whitelist', label: 'Whitelist', color: 'success' },
    { value: 'blacklist', label: 'Blacklist', color: 'error' }
  ];

  // Enhanced state management
  const [filters, setFilters] = useState({
    plate_number: '',
    owner_phone: '',
    contact_email: '',
    location_id: '',
    status: '',
    valid_status: '',
    approval_status: '',
    violation_type: '',
    severity: '',
    date_from: '',
    date_to: '',
    camera_id: '',
    q: '',
    journey_date: '',
    list_type: '',
    is_active: '',
    location_name: '',
    location_code: '',
    zone_type: ''
  });
  
  const [tab, setTab] = useState('whitelist');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [stats, setStats] = useState({});
  const [openDetail, setOpenDetail] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [allResults, setAllResults] = useState({ 
    whitelist: [], blacklist: [], history: [], camera: [], location: [],
    journey: [], plate: [], access: []
  });
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [showCameraDetails, setShowCameraDetails] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [showLocationDetails, setShowLocationDetails] = useState(false);
  const [selectedPlate, setSelectedPlate] = useState(null);
  const [showPlateDetails, setShowPlateDetails] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [error, setError] = useState(null);
  const [searchHistory, setSearchHistory] = useState([]);

  // State cho phân trang
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [hasViewDetailWhiteList, setHasViewDetailWhiteList] = useState(false);
  const [hasViewDetailBlackList, setHasViewDetailBlackList] = useState(false);
  const [hasViewDetailLocation, setHasViewDetailLocation] = useState(false);

  
  useEffect(() => {
            const storedUser = localStorage.getItem('user');
            if (storedUser ) {
                try {
                    const user = JSON.parse(storedUser); // Parse dữ liệu user
                    const permissions = user.permissions || [];
                    setHasViewDetailWhiteList(permissions.some(permission => permission.code === 'role.view_detail'));
                    setHasViewDetailBlackList(permissions.some(permission => permission.code === 'blacklist.view_detail'));
                    setHasViewDetailLocation(permissions.some(permission => permission.code === 'location.view_detail'));

  
                } catch (error) {
                    console.error('Error parsing permissions:', error);
                }
            }
        }, []);
  // Thêm state gotoPage và reset khi currentPage thay đổi:
  const [gotoPage, setGotoPage] = useState('');
  useEffect(() => { setGotoPage(''); }, [currentPage]);

  // Fetch locations from API on mount
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetchDataFromAPI('/api/location/active', token, { params: { page: 1, limit: 1000 } });
        if (res && (res.data?.locations || res.data)) {
          setLocations(res.data?.locations || res.data);
        }
      } catch (err) {
        console.error('Error fetching locations:', err);
        setSnackbar({
          open: true,
          message: 'Lỗi khi tải danh sách khu vực',
          severity: 'error'
        });
      }
    };
    fetchLocations();
  }, []);

  // Fetch cameras from API on mount
  useEffect(() => {
    const fetchCameras = async () => {
      try {
        const token = localStorage.getItem('token');
        const data = await fetchDataFromAPI('/api/cameras', token);
        // Lấy danh sách camera từ API (giống Sidebar)
        const cameraList = data.data?.cameras || [];
        setCameras(cameraList);
      } catch (error) {
        console.error('Error fetching cameras:', error);
        setSnackbar({
          open: true,
          message: 'Lỗi khi tải danh sách camera',
          severity: 'error'
        });
      }
    };
    fetchCameras();
  }, []);

  // Load stats for all tabs on mount
  useEffect(() => {
    const loadAllStats = async () => {
      try {
        const token = localStorage.getItem('token');
        const statsPromises = [
          // Whitelist stats
          fetchDataFromAPI('/api/whitelist', token, { params: { page: 1, limit: 1 } }).then(res => ({
            whitelist: res.pagination?.total || res.total || 0
          })).catch(() => ({ whitelist: 0 })),
          
          // Blacklist stats
          fetchDataFromAPI('/api/blacklist', token, { params: { page: 1, limit: 1 } }).then(res => ({
            blacklist: res.pagination?.total || res.total || 0
          })).catch(() => ({ blacklist: 0 })),
          
          // Camera stats
          fetchDataFromAPI('/api/cameras', token).then(res => ({
            camera: res.data?.cameras?.length || res.data?.length || 0
          })).catch(() => ({ camera: 0 })),
          
          // Location stats
          fetchDataFromAPI('/api/location/active', token, { params: { page: 1, limit: 1 } }).then(res => ({
            location: res.data?.pagination?.total_records || res.pagination?.total || res.total || (res.data?.locations?.length || res.data?.length || 0)
          })).catch(() => ({ location: 0 })),
          
          // Journey stats
          fetchDataFromAPI('/api/journey', token, { params: { page: 1, limit: 1 } }).then(res => ({
            journey: res.pagination?.total || res.total || 0
          })).catch(() => ({ journey: 0 })),
          
          // Plate detection stats
          fetchDataFromAPI('/api/plate-recognitions', token, { params: { page: 1, limit: 1 } }).then(res => ({
            plate: res.pagination?.total || res.total || 0
          })).catch(() => ({ plate: 0 }))
        ];

        const results = await Promise.all(statsPromises);
        const combinedStats = results.reduce((acc, curr) => ({ ...acc, ...curr }), {});
        
        setStats(prevStats => ({
          ...prevStats,
          ...combinedStats
        }));
        
        console.log('Loaded all stats:', combinedStats);
      } catch (error) {
        console.error('Error loading stats:', error);
      }
    };

    loadAllStats();
  }, []);

  // Load data for the first tab when component mounts
  useEffect(() => {
    if (tab === 'whitelist') {
      // Gọi fetchTabData trực tiếp thay vì qua function
      const loadFirstTab = async () => {
        setLoading(true);
        setError(null);
        const token = localStorage.getItem('token');
        let params = { 
          page: 1, // Sử dụng page 1 cho lần load đầu tiên
          limit: 10, // Sử dụng limit mặc định
          ...filters
        };
        try {
          let data = [];
          let totalCountFromAPI = 0;
          let totalPagesFromAPI = 1;
          
          switch (tab) {
            case 'whitelist':
              data = await fetchDataFromAPI(`/api/whitelist`, token, { params });
              setResults(data.data || []);
              totalCountFromAPI = data.pagination?.total || data.total || 0;
              totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / 10);
              break;
            default:
              // Không cần xử lý gì cho các tab khác
              break;
          }
          
          setTotalCount(totalCountFromAPI);
          setTotalItems(totalCountFromAPI);
          setTotalPages(totalPagesFromAPI);
          
          // Cập nhật stats cho tab hiện tại
          setStats(prevStats => ({
            ...prevStats,
            [tab]: totalCountFromAPI
          }));
        } catch (error) {
          console.error('Error loading first tab:', error);
          setError('Lỗi khi tải dữ liệu');
        } finally {
          setLoading(false);
        }
      };
      
      loadFirstTab();
    }
  }, [tab, filters]); // Chạy khi tab hoặc filters thay đổi

 const handleSearch = async () => {
  setLoading(true);
  setError(null);
  
  try {
    const token = localStorage.getItem('token');
    // THÊM: Tham số phân trang
    const params = { 
      ...filters, 
      page: currentPage, 
      limit: itemsPerPage 
    };
    
    // Show loading message
    setSnackbar({
      open: true,
      message: 'Đang tìm kiếm...',
      severity: 'info'
    });

    // Parallel API calls with improved error handling
    const [whitelistRes, blacklistRes, cameraRes, locationRes, journeyRes, plateRes, accessRes] = await Promise.allSettled([
      fetchDataFromAPI(`/api/whitelist`, token, { params }),
      fetchDataFromAPI(`/api/blacklist`, token, { params }),
      fetchDataFromAPI(`/api/cameras`, token, { params }),
      fetchDataFromAPI(`/api/location/active`, token, { params }),
      fetchDataFromAPI(`/api/journey`, token, { params }),
      fetchDataFromAPI(`/api/plates`, token, { params }),
      fetchDataFromAPI(`/api/access-control`, token, { params })
    ]);

    // Process results
    const processResult = (result) => result.status === 'fulfilled' ? result.value?.data || [] : [];
    
    const newResults = {
      whitelist: processResult(whitelistRes),
      blacklist: processResult(blacklistRes),
      camera: processResult(cameraRes),
      location: processResult(locationRes)?.locations || processResult(locationRes),
      journey: processResult(journeyRes),
      plate: processResult(plateRes),
      access: processResult(accessRes)
    };

    setAllResults(newResults);

    // Enhanced statistics calculation
    const totalWhitelist = newResults.whitelist.length;
    const totalBlacklist = newResults.blacklist.length;
    const totalResults = totalWhitelist + totalBlacklist;
    
    // THÊM: Xử lý thông tin phân trang từ API response
    let apiTotalCount = 0;
    let apiTotalPages = 1;
    
    if (whitelistRes.status === 'fulfilled' && whitelistRes.value?.pagination) {
      apiTotalCount = whitelistRes.value.pagination.total || 0;
      apiTotalPages = whitelistRes.value.pagination.total_pages || 1;
    } else if (blacklistRes.status === 'fulfilled' && blacklistRes.value?.pagination) {
      apiTotalCount = blacklistRes.value.pagination.total || 0;
      apiTotalPages = blacklistRes.value.pagination.total_pages || 1;
    }
    
    setTotalItems(apiTotalCount || totalResults);
    setTotalPages(apiTotalPages || Math.ceil((apiTotalCount || totalResults) / itemsPerPage));
    
    setStats({
      total: totalResults,
      whitelist: totalWhitelist,
      blacklist: totalBlacklist,
      cameras: newResults.camera.length,
      locations: newResults.location.length, // Đảm bảo đúng số lượng
      journeys: newResults.journey.length,
      plates: newResults.plate.length,
      access: newResults.access.length,
      valid: [...newResults.whitelist, ...newResults.blacklist].filter(x => x.current_status === 'valid').length,
      expired: [...newResults.whitelist, ...newResults.blacklist].filter(x => x.current_status === 'expired').length
    });

    // Set initial results
    setResults([
      ...newResults.whitelist.map(r => ({ ...r, status: 'whitelist' })),
      ...newResults.blacklist.map(r => ({ ...r, status: 'blacklist' }))
    ]);

    // Set total count for pagination
    setTotalCount(totalResults);

    // Add to search history
    const searchTerm = filters.plate_number || filters.q || 'Tìm kiếm tổng quát';
    setSearchHistory(prev => [
      { term: searchTerm, timestamp: new Date(), results: totalResults },
      ...prev.slice(0, 4)
    ]);

    setSnackbar({
      open: true,
      message: `Tìm thấy ${totalResults} kết quả`,
      severity: 'success'
    });

  } catch (err) {
    console.error('Search error:', err);
    setError('Lỗi khi tra cứu: ' + (err.message || 'Không xác định'));
    setResults([]);
    setStats({});
    setTotalCount(0);
    setTotalItems(0);
    setTotalPages(1);
    setSnackbar({
      open: true,
      message: 'Có lỗi xảy ra khi tìm kiếm',
      severity: 'error'
    });
  } finally {
    setLoading(false);
  }
};
const handleItemsPerPageChange = (event) => {
  setItemsPerPage(parseInt(event.target.value));
  setCurrentPage(1);
};
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
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

 const handleTabChange = (e, value) => {
  setTab(value);
  setCurrentPage(1); // Reset về trang đầu khi đổi tab
};

  const handleOpenDetail = (item) => {
    setSelectedItem(item);
    setOpenDetail(true);
  };

  const handleCloseDetail = () => {
    setOpenDetail(false);
    setSelectedItem(null);
  };

  const handleClearFilters = () => {
  setFilters({
    plate_number: '',
    owner_phone: '',
    contact_email: '',
    location_id: '',
    status: '',
    valid_status: '',
    approval_status: '',
    violation_type: '',
    severity: '',
    date_from: '',
    date_to: '',
    camera_id: '',
    q: '',
    journey_date: '',
    list_type: '',
    is_active: '', 
    location_name: '',
    location_code: '',
    zone_type: ''
  });
  setResults([]);
  setStats({});
  setCurrentPage(1); // Reset về trang đầu
  setTotalCount(0);
  setTotalItems(0);
  setTotalPages(1);
};

  // Pagination handlers
  const handleChangePage = (event, newPage) => {
    setCurrentPage(newPage);
    // Gọi lại fetchTabData hoặc fetchFilteredData
  };

  const handleChangeRowsPerPage = (event) => {
    setItemsPerPage(parseInt(event.target.value, 10));
    setCurrentPage(1);
    // Gọi lại fetchTabData hoặc fetchFilteredData
  };

  // Render filters based on current tab
  const renderTabSpecificFilters = () => {
    switch (tab) {
      case 'whitelist':
        return (
          <>
            {/* Hàng 1 */}
            <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Biển số xe"
                  value={filters.plate_number}
                  onChange={e => handleFilterChange('plate_number', e.target.value)}
                  fullWidth
                  size="medium"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon sx={{ color: '#2e7d32' }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper' }}>
                  <InputLabel sx={{ fontWeight: 600, fontSize: 14 }}>Khu vực</InputLabel>
                  <Select
                    value={filters.location_id}
                    label="Khu vực"
                    onChange={e => handleFilterChange('location_id', e.target.value)}
                    startAdornment={
                      <InputAdornment position="start">
                        <LocationOn sx={{ color: '#2e7d32', ml: 1 }} />
                      </InputAdornment>
                    }
                    sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                    MenuProps={{
                      PaperProps: {
                        style: {
                          maxHeight: 300,
                          overflowY: 'auto',
                          borderRadius: 8,
                          boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
                        }
                      }
                    }}
                  >
                    <MenuItem value="">Tất cả khu vực</MenuItem>
                    {locations.map(location => (
                      <MenuItem key={location.id} value={location.id}>{location.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper' }}>
                  <InputLabel sx={{ fontWeight: 600, fontSize: 14 }}>Trạng thái</InputLabel>
                  <Select
                    value={filters.valid_status}
                    label="Trạng thái"
                    onChange={e => handleFilterChange('valid_status', e.target.value)}
                    sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                    MenuProps={{
                      PaperProps: {
                        style: {
                          maxHeight: 200,
                          overflowY: 'auto',
                          borderRadius: 8,
                          boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
                        }
                      }
                    }}
                  >
                    <MenuItem value="">Tất cả</MenuItem>
                    <MenuItem value="valid">Còn hiệu lực</MenuItem>
                    <MenuItem value="expired">Hết hạn</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper' }}>
                  <InputLabel sx={{ fontWeight: 600, fontSize: 14 }}>Loại xe</InputLabel>
                  <Select
                    value={filters.vehicle_type}
                    label="Loại xe"
                    onChange={e => handleFilterChange('vehicle_type', e.target.value)}
                    sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                    MenuProps={{
                      PaperProps: {
                        style: {
                          maxHeight: 200,
                          overflowY: 'auto',
                          borderRadius: 8,
                          boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
                        }
                      }
                    }}
                  >
                    <MenuItem value="">Tất cả</MenuItem>
                    <MenuItem value="car">Ô tô</MenuItem>
                    <MenuItem value="motorcycle">Xe máy</MenuItem>
                    <MenuItem value="truck">Xe tải</MenuItem>
                    <MenuItem value="bus">Xe bus</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            {/* Hàng 2 */}
            <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper' }}>
                  <InputLabel sx={{ fontWeight: 600, fontSize: 14 }}>Màu sắc</InputLabel>
                  <Select
                    value={filters.color}
                    label="Màu sắc"
                    onChange={e => handleFilterChange('color', e.target.value)}
                    sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                    MenuProps={{
                      PaperProps: {
                        style: {
                          maxHeight: 200,
                          overflowY: 'auto',
                          borderRadius: 8,
                          boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
                        }
                      }
                    }}
                  >
                    <MenuItem value="">Tất cả</MenuItem>
                    <MenuItem value="white">Trắng</MenuItem>
                    <MenuItem value="black">Đen</MenuItem>
                    <MenuItem value="red">Đỏ</MenuItem>
                    <MenuItem value="blue">Xanh</MenuItem>
                    <MenuItem value="green">Xanh lá</MenuItem>
                    <MenuItem value="yellow">Vàng</MenuItem>
                    <MenuItem value="gray">Xám</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Từ ngày"
                  type="date"
                  value={filters.date_from}
                  onChange={e => handleFilterChange('date_from', e.target.value)}
                  fullWidth
                  size="medium"
                  InputLabelProps={{ shrink: true }}
                  sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Đến ngày"
                  type="date"
                  value={filters.date_to}
                  onChange={e => handleFilterChange('date_to', e.target.value)}
                  fullWidth
                  size="medium"
                  InputLabelProps={{ shrink: true }}
                  sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <Button
                  variant="contained"
                  onClick={handleSearch}
                  startIcon={<SearchIcon />}
                  sx={{ 
                    borderRadius: 3, 
                    textTransform: 'none', 
                    fontWeight: 600, 
                    fontSize: 15, 
                    py: 1.5,
                    background: 'linear-gradient(90deg, #2e7d32 0%, #4caf50 100%)',
                    boxShadow: '0 4px 12px rgba(46,125,50,0.3)',
                    '&:hover': {
                      background: 'linear-gradient(90deg, #1b5e20 0%, #2e7d32 100%)',
                      boxShadow: '0 6px 16px rgba(46,125,50,0.4)'
                    }
                  }}
                >
                  Tìm kiếm
                </Button>
              </Grid>
            </Grid>
          </>
        );

      case 'blacklist':
        return (
          <>
            {/* Hàng 1 */}
            <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Biển số xe"
                  value={filters.plate_number}
                  onChange={e => handleFilterChange('plate_number', e.target.value)}
                  fullWidth
                  size="medium"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon sx={{ color: '#d32f2f' }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper' }}>
                  <InputLabel sx={{ fontWeight: 600, fontSize: 14 }}>Khu vực</InputLabel>
                  <Select
                    value={filters.location_id}
                    label="Khu vực"
                    onChange={e => handleFilterChange('location_id', e.target.value)}
                    startAdornment={
                      <InputAdornment position="start">
                        <LocationOn sx={{ color: '#d32f2f', ml: 1 }} />
                      </InputAdornment>
                    }
                    sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                    MenuProps={{
                      PaperProps: {
                        style: {
                          maxHeight: 300,
                          overflowY: 'auto',
                          borderRadius: 8,
                          boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
                        }
                      }
                    }}
                  >
                    <MenuItem value="">Tất cả khu vực</MenuItem>
                    {locations.map(location => (
                      <MenuItem key={location.id} value={location.id}>{location.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper' }}>
                  <InputLabel sx={{ fontWeight: 600, fontSize: 14 }}>Lý do cấm</InputLabel>
                  <Select
                    value={filters.reason}
                    label="Lý do cấm"
                    onChange={e => handleFilterChange('reason', e.target.value)}
                    sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                    MenuProps={{
                      PaperProps: {
                        style: {
                          maxHeight: 200,
                          overflowY: 'auto',
                          borderRadius: 8,
                          boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
                        }
                      }
                    }}
                  >
                    <MenuItem value="">Tất cả</MenuItem>
                    <MenuItem value="stolen">Xe bị mất cắp</MenuItem>
                    <MenuItem value="wanted">Xe bị truy nã</MenuItem>
                    <MenuItem value="violation">Vi phạm giao thông</MenuItem>
                    <MenuItem value="suspicious">Nghi ngờ</MenuItem>
                    <MenuItem value="other">Khác</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper' }}>
                  <InputLabel sx={{ fontWeight: 600, fontSize: 14 }}>Mức độ nghiêm trọng</InputLabel>
                  <Select
                    value={filters.severity}
                    label="Mức độ nghiêm trọng"
                    onChange={e => handleFilterChange('severity', e.target.value)}
                    sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                    MenuProps={{
                      PaperProps: {
                        style: {
                          maxHeight: 200,
                          overflowY: 'auto',
                          borderRadius: 8,
                          boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
                        }
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
            </Grid>

            {/* Hàng 2 */}
            <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper' }}>
                  <InputLabel sx={{ fontWeight: 600, fontSize: 14 }}>Loại xe</InputLabel>
                  <Select
                    value={filters.vehicle_type}
                    label="Loại xe"
                    onChange={e => handleFilterChange('vehicle_type', e.target.value)}
                    sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                    MenuProps={{
                      PaperProps: {
                        style: {
                          maxHeight: 200,
                          overflowY: 'auto',
                          borderRadius: 8,
                          boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
                        }
                      }
                    }}
                  >
                    <MenuItem value="">Tất cả</MenuItem>
                    <MenuItem value="car">Ô tô</MenuItem>
                    <MenuItem value="motorcycle">Xe máy</MenuItem>
                    <MenuItem value="truck">Xe tải</MenuItem>
                    <MenuItem value="bus">Xe bus</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Từ ngày"
                  type="date"
                  value={filters.date_from}
                  onChange={e => handleFilterChange('date_from', e.target.value)}
                  fullWidth
                  size="medium"
                  InputLabelProps={{ shrink: true }}
                  sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Đến ngày"
                  type="date"
                  value={filters.date_to}
                  onChange={e => handleFilterChange('date_to', e.target.value)}
                  fullWidth
                  size="medium"
                  InputLabelProps={{ shrink: true }}
                  sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <Button
                  variant="contained"
                  onClick={handleSearch}
                  startIcon={<SearchIcon />}
                  sx={{ 
                    borderRadius: 3, 
                    textTransform: 'none', 
                    fontWeight: 600, 
                    fontSize: 15, 
                    py: 1.5,
                    background: 'linear-gradient(90deg, #d32f2f 0%, #f44336 100%)',
                    boxShadow: '0 4px 12px rgba(211,47,47,0.3)',
                    '&:hover': {
                      background: 'linear-gradient(90deg, #b71c1c 0%, #d32f2f 100%)',
                      boxShadow: '0 6px 16px rgba(211,47,47,0.4)'
                    }
                  }}
                >
                  Tìm kiếm
                </Button>
              </Grid>
            </Grid>
          </>
        );

      case 'camera':
        return (
          <>
            {/* Hàng 1 */}
            <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Tên camera"
                  value={filters.camera_name}
                  onChange={e => handleFilterChange('camera_name', e.target.value)}
                  fullWidth
                  size="medium"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Videocam sx={{ color: '#ff9800' }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper' }}>
                  <InputLabel sx={{ fontWeight: 600, fontSize: 14 }}>Khu vực</InputLabel>
                  <Select
                    value={filters.location_id}
                    label="Khu vực"
                    onChange={e => handleFilterChange('location_id', e.target.value)}
                    startAdornment={
                      <InputAdornment position="start">
                        <LocationOn sx={{ color: '#ff9800', ml: 1 }} />
                      </InputAdornment>
                    }
                    sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                    MenuProps={{
                      PaperProps: {
                        style: {
                          maxHeight: 300,
                          overflowY: 'auto',
                          borderRadius: 8,
                          boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
                        }
                      }
                    }}
                  >
                    <MenuItem value="">Tất cả khu vực</MenuItem>
                    {locations.map(location => (
                      <MenuItem key={location.id} value={location.id}>{location.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper' }}>
                  <InputLabel sx={{ fontWeight: 600, fontSize: 14 }}>Trạng thái</InputLabel>
                  <Select
                    value={filters.status}
                    label="Trạng thái"
                    onChange={e => handleFilterChange('status', e.target.value)}
                    sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                    MenuProps={{
                      PaperProps: {
                        style: {
                          maxHeight: 200,
                          overflowY: 'auto',
                          borderRadius: 8,
                          boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
                        }
                      }
                    }}
                  >
                    <MenuItem value="">Tất cả</MenuItem>
                    <MenuItem value="online">Online</MenuItem>
                    <MenuItem value="offline">Offline</MenuItem>
                    <MenuItem value="maintenance">Bảo trì</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper' }}>
                  <InputLabel sx={{ fontWeight: 600, fontSize: 14 }}>Loại camera</InputLabel>
                  <Select
                    value={filters.camera_type}
                    label="Loại camera"
                    onChange={e => handleFilterChange('camera_type', e.target.value)}
                    sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                    MenuProps={{
                      PaperProps: {
                        style: {
                          maxHeight: 200,
                          overflowY: 'auto',
                          borderRadius: 8,
                          boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
                        }
                      }
                    }}
                  >
                    <MenuItem value="">Tất cả</MenuItem>
                    <MenuItem value="fixed">Cố định</MenuItem>
                    <MenuItem value="ptz">PTZ</MenuItem>
                    <MenuItem value="dome">Dome</MenuItem>
                    <MenuItem value="bullet">Bullet</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            {/* Hàng 2 */}
            <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper' }}>
                  <InputLabel sx={{ fontWeight: 600, fontSize: 14 }}>Độ phân giải</InputLabel>
                  <Select
                    value={filters.resolution}
                    label="Độ phân giải"
                    onChange={e => handleFilterChange('resolution', e.target.value)}
                    sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                    MenuProps={{
                      PaperProps: {
                        style: {
                          maxHeight: 200,
                          overflowY: 'auto',
                          borderRadius: 8,
                          boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
                        }
                      }
                    }}
                  >
                    <MenuItem value="">Tất cả</MenuItem>
                    <MenuItem value="720p">720p</MenuItem>
                    <MenuItem value="1080p">1080p</MenuItem>
                    <MenuItem value="4k">4K</MenuItem>
                    <MenuItem value="8mp">8MP</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Từ ngày"
                  type="date"
                  value={filters.date_from}
                  onChange={e => handleFilterChange('date_from', e.target.value)}
                  fullWidth
                  size="medium"
                  InputLabelProps={{ shrink: true }}
                  sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Đến ngày"
                  type="date"
                  value={filters.date_to}
                  onChange={e => handleFilterChange('date_to', e.target.value)}
                  fullWidth
                  size="medium"
                  InputLabelProps={{ shrink: true }}
                  sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <Button
                  variant="contained"
                  onClick={handleSearch}
                  startIcon={<SearchIcon />}
                  sx={{ 
                    borderRadius: 3, 
                    textTransform: 'none', 
                    fontWeight: 600, 
                    fontSize: 15, 
                    py: 1.5,
                    background: 'linear-gradient(90deg, #ff9800 0%, #ffc107 100%)',
                    boxShadow: '0 4px 12px rgba(255,152,0,0.3)',
                    '&:hover': {
                      background: 'linear-gradient(90deg, #f57c00 0%, #ff9800 100%)',
                      boxShadow: '0 6px 16px rgba(255,152,0,0.4)'
                    }
                  }}
                >
                  Tìm kiếm
                </Button>
              </Grid>
            </Grid>
          </>
        );

      case 'location':
        return (
          <>
            {/* Hàng 1 */}
            <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Tên khu vực"
                  value={filters.location_name}
                  onChange={e => handleFilterChange('location_name', e.target.value)}
                  fullWidth
                  size="medium"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LocationOn sx={{ color: '#2196f3' }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Mã khu vực"
                  value={filters.location_code}
                  onChange={e => handleFilterChange('location_code', e.target.value)}
                  fullWidth
                  size="medium"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Code sx={{ color: '#2196f3' }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper' }}>
                  <InputLabel sx={{ fontWeight: 600, fontSize: 14 }}>Loại khu vực</InputLabel>
                  <Select
                    value={filters.zone_type}
                    label="Loại khu vực"
                    onChange={e => handleFilterChange('zone_type', e.target.value)}
                    sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                    MenuProps={{
                      PaperProps: {
                        style: {
                          maxHeight: 200,
                          overflowY: 'auto',
                          borderRadius: 8,
                          boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
                        }
                      }
                    }}
                  >
                    <MenuItem value="">Tất cả</MenuItem>
                    <MenuItem value="entrance">Lối vào</MenuItem>
                    <MenuItem value="exit">Lối ra</MenuItem>
                    <MenuItem value="parking">Bãi đỗ xe</MenuItem>
                    <MenuItem value="monitoring">Giám sát</MenuItem>
                    <MenuItem value="restricted">Khu hạn chế</MenuItem>
                    <MenuItem value="public">Khu công cộng</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper' }}>
                  <InputLabel sx={{ fontWeight: 600, fontSize: 14 }}>Trạng thái</InputLabel>
                  <Select
                    value={filters.status}
                    label="Trạng thái"
                    onChange={e => handleFilterChange('status', e.target.value)}
                    sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                    MenuProps={{
                      PaperProps: {
                        style: {
                          maxHeight: 200,
                          overflowY: 'auto',
                          borderRadius: 8,
                          boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
                        }
                      }
                    }}
                  >
                    <MenuItem value="">Tất cả</MenuItem>
                    <MenuItem value="active">Hoạt động</MenuItem>
                    <MenuItem value="inactive">Không hoạt động</MenuItem>
                    <MenuItem value="maintenance">Bảo trì</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            {/* Hàng 2 */}
            <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Địa chỉ"
                  value={filters.address}
                  onChange={e => handleFilterChange('address', e.target.value)}
                  fullWidth
                  size="medium"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LocationOn sx={{ color: '#2196f3' }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Từ ngày"
                  type="date"
                  value={filters.date_from}
                  onChange={e => handleFilterChange('date_from', e.target.value)}
                  fullWidth
                  size="medium"
                  InputLabelProps={{ shrink: true }}
                  sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Đến ngày"
                  type="date"
                  value={filters.date_to}
                  onChange={e => handleFilterChange('date_to', e.target.value)}
                  fullWidth
                  size="medium"
                  InputLabelProps={{ shrink: true }}
                  sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <Button
                  variant="contained"
                  onClick={handleSearch}
                  startIcon={<SearchIcon />}
                  sx={{ 
                    borderRadius: 3, 
                    textTransform: 'none', 
                    fontWeight: 600, 
                    fontSize: 15, 
                    py: 1.5,
                    background: 'linear-gradient(90deg, #1976d2 0%, #2196f3 100%)',
                    boxShadow: '0 4px 12px rgba(25,118,210,0.3)',
                    '&:hover': {
                      background: 'linear-gradient(90deg, #1565c0 0%, #1976d2 100%)',
                      boxShadow: '0 6px 16px rgba(25,118,210,0.4)'
                    }
                  }}
                >
                  Tìm kiếm
                </Button>
              </Grid>
            </Grid>
          </>
        );

      case 'journey':
        return (
          <>
            {/* Hàng 1 */}
            <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
            <Grid item xs={12} md={3}>
              <TextField
                label="Biển số xe"
                value={filters.plate_number}
                onChange={e => handleFilterChange('plate_number', e.target.value)}
                fullWidth
                size="medium"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: '#9c27b0' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper' }}>
                <InputLabel sx={{ fontWeight: 600, fontSize: 14 }}>Khu vực bắt đầu</InputLabel>
                <Select
                  value={filters.start_location}
                  label="Khu vực bắt đầu"
                  onChange={e => handleFilterChange('start_location', e.target.value)}
                  startAdornment={
                    <InputAdornment position="start">
                      <LocationOn sx={{ color: '#9c27b0', ml: 1 }} />
                    </InputAdornment>
                  }
                  sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                  MenuProps={{
                    PaperProps: {
                      style: {
                        maxHeight: 300,
                        overflowY: 'auto',
                        borderRadius: 8,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
                      }
                    }
                  }}
                >
                  <MenuItem value="">Tất cả</MenuItem>
                  {locations.map(location => (
                    <MenuItem key={location.id} value={location.id}>{location.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper' }}>
                <InputLabel sx={{ fontWeight: 600, fontSize: 14 }}>Khu vực kết thúc</InputLabel>
                <Select
                  value={filters.end_location}
                  label="Khu vực kết thúc"
                  onChange={e => handleFilterChange('end_location', e.target.value)}
                  startAdornment={
                    <InputAdornment position="start">
                      <LocationOn sx={{ color: '#9c27b0', ml: 1 }} />
                    </InputAdornment>
                  }
                  sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                  MenuProps={{
                    PaperProps: {
                      style: {
                        maxHeight: 300,
                        overflowY: 'auto',
                        borderRadius: 8,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
                      }
                    }
                  }}
                >
                  <MenuItem value="">Tất cả</MenuItem>
                  {locations.map(location => (
                    <MenuItem key={location.id} value={location.id}>{location.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper' }}>
                <InputLabel sx={{ fontWeight: 600, fontSize: 14 }}>Trạng thái lộ trình</InputLabel>
                <Select
                  value={filters.journey_status}
                  label="Trạng thái lộ trình"
                  onChange={e => handleFilterChange('journey_status', e.target.value)}
                  sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                  MenuProps={{
                    PaperProps: {
                      style: {
                        maxHeight: 200,
                        overflowY: 'auto',
                        borderRadius: 8,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
                      }
                    }
                  }}
                >
                  <MenuItem value="">Tất cả</MenuItem>
                  <MenuItem value="completed">Hoàn thành</MenuItem>
                  <MenuItem value="in_progress">Đang di chuyển</MenuItem>
                  <MenuItem value="cancelled">Hủy bỏ</MenuItem>
                  <MenuItem value="suspicious">Nghi ngờ</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            </Grid>

            {/* Hàng 2 */}
            <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper' }}>
                  <InputLabel sx={{ fontWeight: 600, fontSize: 14 }}>Loại xe</InputLabel>
                  <Select
                    value={filters.vehicle_type}
                    label="Loại xe"
                    onChange={e => handleFilterChange('vehicle_type', e.target.value)}
                    sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                    MenuProps={{
                      PaperProps: {
                        style: {
                          maxHeight: 200,
                          overflowY: 'auto',
                          borderRadius: 8,
                          boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
                        }
                      }
                    }}
                  >
                    <MenuItem value="">Tất cả</MenuItem>
                    <MenuItem value="car">Ô tô</MenuItem>
                    <MenuItem value="motorcycle">Xe máy</MenuItem>
                    <MenuItem value="truck">Xe tải</MenuItem>
                    <MenuItem value="bus">Xe bus</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Từ ngày"
                  type="date"
                  value={filters.date_from}
                  onChange={e => handleFilterChange('date_from', e.target.value)}
                  fullWidth
                  size="medium"
                  InputLabelProps={{ shrink: true }}
                  sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Đến ngày"
                  type="date"
                  value={filters.date_to}
                  onChange={e => handleFilterChange('date_to', e.target.value)}
                  fullWidth
                  size="medium"
                  InputLabelProps={{ shrink: true }}
                  sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <Button
                  variant="contained"
                  onClick={handleSearch}
                  startIcon={<SearchIcon />}
                  sx={{ 
                    borderRadius: 3, 
                    textTransform: 'none', 
                    fontWeight: 600, 
                    fontSize: 15, 
                    py: 1.5,
                    background: 'linear-gradient(90deg, #7b1fa2 0%, #9c27b0 100%)',
                    boxShadow: '0 4px 12px rgba(123,31,162,0.3)',
                    '&:hover': {
                      background: 'linear-gradient(90deg, #6a1b9a 0%, #7b1fa2 100%)',
                      boxShadow: '0 6px 16px rgba(123,31,162,0.4)'
                    }
                  }}
                >
                  Tìm kiếm
                </Button>
              </Grid>
            </Grid>
          </>
        );

      case 'plate':
        return (
          <>
            {/* Hàng 1 */}
            <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
            <Grid item xs={12} md={3}>
              <TextField
                label="Biển số xe"
                value={filters.plate_number}
                onChange={e => handleFilterChange('plate_number', e.target.value)}
                fullWidth
                size="medium"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: '#5d4037' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper' }}>
                <InputLabel sx={{ fontWeight: 600, fontSize: 14 }}>Khu vực</InputLabel>
                <Select
                  value={filters.location_id}
                  label="Khu vực"
                  onChange={e => handleFilterChange('location_id', e.target.value)}
                  startAdornment={
                    <InputAdornment position="start">
                      <LocationOn sx={{ color: '#5d4037', ml: 1 }} />
                    </InputAdornment>
                  }
                  sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                  MenuProps={{
                    PaperProps: {
                      style: {
                        maxHeight: 300,
                        overflowY: 'auto',
                        borderRadius: 8,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
                      }
                    }
                  }}
                >
                  <MenuItem value="">Tất cả khu vực</MenuItem>
                  {locations.map(location => (
                    <MenuItem key={location.id} value={location.id}>{location.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper' }}>
                <InputLabel sx={{ fontWeight: 600, fontSize: 14 }}>Camera</InputLabel>
                <Select
                  value={filters.camera_id}
                  label="Camera"
                  onChange={e => handleFilterChange('camera_id', e.target.value)}
                  startAdornment={
                    <InputAdornment position="start">
                      <Videocam sx={{ color: '#5d4037', ml: 1 }} />
                    </InputAdornment>
                  }
                  sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                  MenuProps={{
                    PaperProps: {
                      style: {
                        maxHeight: 300,
                        overflowY: 'auto',
                        borderRadius: 8,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
                      }
                    }
                  }}
                >
                  <MenuItem value="">Tất cả camera</MenuItem>
                  {cameras.map(camera => (
                    <MenuItem key={camera.id} value={camera.id}>{camera.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper' }}>
                <InputLabel sx={{ fontWeight: 600, fontSize: 14 }}>Độ tin cậy</InputLabel>
                <Select
                  value={filters.confidence}
                  label="Độ tin cậy"
                  onChange={e => handleFilterChange('confidence', e.target.value)}
                  sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                  MenuProps={{
                    PaperProps: {
                      style: {
                        maxHeight: 200,
                        overflowY: 'auto',
                        borderRadius: 8,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
                      }
                    }
                  }}
                >
                  <MenuItem value="">Tất cả</MenuItem>
                  <MenuItem value="high">Cao (&gt;80%)</MenuItem>
                  <MenuItem value="medium">Trung bình (60-80%)</MenuItem>
                  <MenuItem value="low">Thấp (&lt;60%)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            </Grid>

            {/* Hàng 2 */}
            <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper' }}>
                  <InputLabel sx={{ fontWeight: 600, fontSize: 14 }}>Loại xe</InputLabel>
                  <Select
                    value={filters.vehicle_type}
                    label="Loại xe"
                    onChange={e => handleFilterChange('vehicle_type', e.target.value)}
                    sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                    MenuProps={{
                      PaperProps: {
                        style: {
                          maxHeight: 200,
                          overflowY: 'auto',
                          borderRadius: 8,
                          boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
                        }
                      }
                    }}
                  >
                    <MenuItem value="">Tất cả</MenuItem>
                    <MenuItem value="car">Ô tô</MenuItem>
                    <MenuItem value="motorcycle">Xe máy</MenuItem>
                    <MenuItem value="truck">Xe tải</MenuItem>
                    <MenuItem value="bus">Xe bus</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="medium" sx={{ borderRadius: 3, bgcolor: 'background.paper' }}>
                  <InputLabel sx={{ fontWeight: 600, fontSize: 14 }}>Màu sắc</InputLabel>
                  <Select
                    value={filters.color}
                    label="Màu sắc"
                    onChange={e => handleFilterChange('color', e.target.value)}
                    sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                    MenuProps={{
                      PaperProps: {
                        style: {
                          maxHeight: 200,
                          overflowY: 'auto',
                          borderRadius: 8,
                          boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
                        }
                      }
                    }}
                  >
                    <MenuItem value="">Tất cả</MenuItem>
                    <MenuItem value="white">Trắng</MenuItem>
                    <MenuItem value="black">Đen</MenuItem>
                    <MenuItem value="red">Đỏ</MenuItem>
                    <MenuItem value="blue">Xanh</MenuItem>
                    <MenuItem value="green">Xanh lá</MenuItem>
                    <MenuItem value="yellow">Vàng</MenuItem>
                    <MenuItem value="gray">Xám</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Từ ngày"
                  type="date"
                  value={filters.date_from}
                  onChange={e => handleFilterChange('date_from', e.target.value)}
                  fullWidth
                  size="medium"
                  InputLabelProps={{ shrink: true }}
                  sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Đến ngày"
                  type="date"
                  value={filters.date_to}
                  onChange={e => handleFilterChange('date_to', e.target.value)}
                  fullWidth
                  size="medium"
                  InputLabelProps={{ shrink: true }}
                  sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                />
              </Grid>
            </Grid>

            {/* Hàng 3 */}
            <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Từ giờ"
                  type="time"
                  value={filters.time_from}
                  onChange={e => handleFilterChange('time_from', e.target.value)}
                  fullWidth
                  size="medium"
                  InputLabelProps={{ shrink: true }}
                  sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  label="Đến giờ"
                  type="time"
                  value={filters.time_to}
                  onChange={e => handleFilterChange('time_to', e.target.value)}
                  fullWidth
                  size="medium"
                  InputLabelProps={{ shrink: true }}
                  sx={{ borderRadius: 3, bgcolor: 'background.paper', fontSize: 15, fontWeight: 500 }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Button
                  variant="contained"
                  onClick={handleSearch}
                  startIcon={<SearchIcon />}
                  sx={{ 
                    borderRadius: 3, 
                    textTransform: 'none', 
                    fontWeight: 600, 
                    fontSize: 15, 
                    py: 1.5,
                    background: 'linear-gradient(90deg, #5d4037 0%, #8d6e63 100%)',
                    boxShadow: '0 4px 12px rgba(93,64,55,0.3)',
                    '&:hover': {
                      background: 'linear-gradient(90deg, #4e342e 0%, #5d4037 100%)',
                      boxShadow: '0 6px 16px rgba(93,64,55,0.4)'
                    }
                  }}
                >
                  Tìm kiếm
                </Button>
              </Grid>
            </Grid>
          </>
        );

      default:
        return null;
    }
  };


useEffect(() => {
  const fetchTabData = async () => {
    setLoading(true);
    setError(null);
    const token = localStorage.getItem('token');
    // THÊM: Tham số phân trang và filters
    let params = { 
      page: currentPage, 
      limit: itemsPerPage,
      ...filters // Thêm filters vào params
    };
    try {
      let data = [];
      let totalCountFromAPI = 0;
      let totalPagesFromAPI = 1;
      
      switch (tab) {
        case 'whitelist':
          data = await fetchDataFromAPI(`/api/whitelist`, token, { params });
          setResults(data.data || []);
          totalCountFromAPI = data.pagination?.total || data.pagination?.total_records || data.total || (Array.isArray(data.data) ? data.data.length : 0) || (Array.isArray(data) ? data.length : 0);
          totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage) || 1;
          break;
        case 'blacklist':
          try {
            const token = localStorage.getItem('token');
            console.log('Loading blacklist with token (filtered):', token ? 'Token exists' : 'No token');
            
            const params = new URLSearchParams();
            params.append('page', currentPage.toString());
            params.append('limit', itemsPerPage.toString());
            
            // Add filters to params
            Object.entries(filters).forEach(([key, value]) => {
              if (value !== '' && value !== null && value !== undefined) {
                params.append(key, value);
              }
            });

            const headers = {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            };

            const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/blacklist?${params.toString()}`, {
              method: 'GET',
              headers
            });

            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Blacklist API response (fetchFilteredData):', data);
            console.log('Blacklist params sent (fetchFilteredData):', params.toString());

            if (data.success) {
              console.log('Blacklist loaded (filtered):', data.data);
              
              // Process data like BlackList.js
              const processedData = data.data.map(item => ({
                ...item,
                _refreshTimestamp: Date.now(),
                detected_plate_image: item.detected_plate_image,
                plate_image_path: item.plate_image_path
              }));
              
              setResults(processedData);
              console.log('Blacklist results after setResults (filtered):', processedData);
              
              if (data.pagination) {
                totalCountFromAPI = data.pagination.total || 0;
                totalPagesFromAPI = data.pagination.total_pages || 1;
              }
            } else {
              console.warn('Blacklist API returned error (filtered):', data.message);
              setResults([]);
              totalCountFromAPI = 0;
              totalPagesFromAPI = 1;
            }
          } catch (error) {
            console.error('Error loading blacklist (filtered):', error);
            setResults([]);
            totalCountFromAPI = 0;
            totalPagesFromAPI = 1;
          }
          break;
        case 'camera':
          data = await fetchDataFromAPI(`/api/cameras`, token, { params });
          // Đảm bảo setResults là mảng camera
          const cameraList = (data.data && Array.isArray(data.data.cameras)) ? data.data.cameras : [];
          setResults(cameraList);
          totalCountFromAPI = cameraList.length;
          totalPagesFromAPI = Math.ceil(totalCountFromAPI / itemsPerPage);
          break;
        case 'location':
          data = await fetchDataFromAPI(`/api/location/active`, token, { params });
          console.log('Location API response:', data);
          console.log('Params sent:', params);
          if (data.data && data.data.locations) {
            setResults(data.data.locations);
            totalCountFromAPI = data.data.pagination?.total_records || 0; // Sửa: lấy từ pagination.total_records
            totalPagesFromAPI = data.data.pagination?.total_pages || 1;
          } else if (data.locations) {
            setResults(data.locations);
            totalCountFromAPI = data.pagination?.total_records || 0; // Sửa: lấy từ pagination.total_records
            totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
          } else if (Array.isArray(data.data)) {
            setResults(data.data);
            totalCountFromAPI = data.total || data.pagination?.total || 0;
            totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
          } else if (Array.isArray(data)) {
            setResults(data);
            totalCountFromAPI = data.length;
            totalPagesFromAPI = 1;
          } else {
            setResults([]);
            totalCountFromAPI = 0;
            totalPagesFromAPI = 1;
          }
          break;
        case 'journey':
          data = await fetchDataFromAPI(`/api/journey`, token, { params });
          setResults(data.data || []);
          totalCountFromAPI = data.total || data.pagination?.total || 0;
          totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
          break;
        case 'plate':
          data = await fetchDataFromAPI(`/api/plate-recognitions`, token, { params });
          setResults(data.data || []);
          totalCountFromAPI = data.pagination?.total || data.pagination?.total_records || data.total || (Array.isArray(data.data) ? data.data.length : 0) || (Array.isArray(data) ? data.length : 0);
          totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage) || 1;
          break;
        default:
          setResults([]);
          totalCountFromAPI = 0;
          totalPagesFromAPI = 1;
      }
      console.log('Setting totalCount:', totalCountFromAPI, 'totalPages:', totalPagesFromAPI);
      console.log('Current tab:', tab);
      setTotalCount(totalCountFromAPI);
      setTotalItems(totalCountFromAPI);
      setTotalPages(totalPagesFromAPI);
      
      // Cập nhật stats cho tab hiện tại
      setStats(prevStats => ({
        ...prevStats,
        [tab]: totalCountFromAPI
      }));
    } catch (err) {
      console.error('Fetch tab data error:', err);
      setError('Lỗi khi tải dữ liệu: ' + (err.message || 'Không xác định'));
      setResults([]);
      setTotalCount(0);
      setTotalItems(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  };
  fetchTabData();
}, [tab, currentPage, itemsPerPage, filters]); // Thêm filters vào dependencies

useEffect(() => {
  const hasFilter = Object.values(filters).some(v => v && v !== '');
  if (!hasFilter) return;
  const fetchFilteredData = async () => {
    setLoading(true);
    setError(null);
    const token = localStorage.getItem('token');
    // THÊM: Tham số phân trang
    let params = { ...filters, page: currentPage, limit: itemsPerPage };
    try {
      let data = [];
      let totalCountFromAPI = 0;
      let totalPagesFromAPI = 1;
      
      switch (tab) {
        case 'whitelist':
          data = await fetchDataFromAPI(`/api/whitelist`, token, { params });
          setResults(data.data || []);
          console.log('Blacklist results after setResults (filtered):', data.data || []);
          totalCountFromAPI = data.pagination?.total || data.pagination?.total_records || data.total || (Array.isArray(data.data) ? data.data.length : 0) || (Array.isArray(data) ? data.length : 0);
          totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage) || 1;
          break;
        case 'blacklist':
          try {
            const token = localStorage.getItem('token');
            console.log('Loading blacklist with token (filtered):', token ? 'Token exists' : 'No token');
            
            const params = new URLSearchParams();
            params.append('page', currentPage.toString());
            params.append('limit', itemsPerPage.toString());
            
            // Add filters to params
            Object.entries(filters).forEach(([key, value]) => {
              if (value !== '' && value !== null && value !== undefined) {
                params.append(key, value);
              }
            });

            const headers = {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            };

            const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/blacklist?${params.toString()}`, {
              method: 'GET',
              headers
            });

            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Blacklist API response (fetchFilteredData):', data);
            console.log('Blacklist params sent (fetchFilteredData):', params.toString());

            if (data.success) {
              console.log('Blacklist loaded (filtered):', data.data);
              
              // Process data like BlackList.js
              const processedData = data.data.map(item => ({
                ...item,
                _refreshTimestamp: Date.now(),
                detected_plate_image: item.detected_plate_image,
                plate_image_path: item.plate_image_path
              }));
              
              setResults(processedData);
              console.log('Blacklist results after setResults (filtered):', processedData);
              
              if (data.pagination) {
                totalCountFromAPI = data.pagination.total || 0;
                totalPagesFromAPI = data.pagination.total_pages || 1;
              }
            } else {
              console.warn('Blacklist API returned error (filtered):', data.message);
              setResults([]);
              totalCountFromAPI = 0;
              totalPagesFromAPI = 1;
            }
          } catch (error) {
            console.error('Error loading blacklist (filtered):', error);
            setResults([]);
            totalCountFromAPI = 0;
            totalPagesFromAPI = 1;
          }
          break;
        case 'camera':
          data = await fetchDataFromAPI(`/api/cameras`, token, { params });
          // Đảm bảo setResults là mảng camera
          const cameraList = (data.data && Array.isArray(data.data.cameras)) ? data.data.cameras : [];
          setResults(cameraList);
          totalCountFromAPI = cameraList.length;
          totalPagesFromAPI = Math.ceil(totalCountFromAPI / itemsPerPage);
          break;
        case 'location':
            // SỬA: Gửi đúng tham số cho location API với filters
            const locationFilterParams = {
              name: filters.location_name,     // ✅ ĐÚNG field name
              code: filters.location_code,     // ✅ ĐÚNG field name
              zone_type: filters.zone_type,
              is_active: filters.is_active,
              page: currentPage, 
              limit: itemsPerPage
            };
            data = await fetchDataFromAPI(`/api/location/active`, token, { params: locationFilterParams });
            console.log('Filtered Location API response:', data);
            console.log('Location filter params sent:', locationFilterParams);
          if (data.data && data.data.locations) {
            setResults(data.data.locations);
            totalCountFromAPI = data.data.pagination?.total_records || 0; // Sửa: lấy từ pagination.total_records
            totalPagesFromAPI = data.data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
          } else if (data.locations) {
            setResults(data.locations);
            totalCountFromAPI = data.pagination?.total_records || 0; // Sửa: lấy từ pagination.total_records
            totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
          } else if (Array.isArray(data.data)) {
            setResults(data.data);
            totalCountFromAPI = data.total || data.pagination?.total || 0;
            totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
          } else if (Array.isArray(data)) {
            setResults(data);
            totalCountFromAPI = data.length;
            totalPagesFromAPI = 1;
          } else {
            setResults([]);
            totalCountFromAPI = 0;
            totalPagesFromAPI = 1;
          }
          break;
        case 'journey':
          data = await fetchDataFromAPI(`/api/journey`, token, { params });
          setResults(data.data || []);
          totalCountFromAPI = data.total || data.pagination?.total || 0;
          totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
          break;
        case 'plate':
          data = await fetchDataFromAPI(`/api/plate-recognitions`, token, { params });
          setResults(data.data || []);
          totalCountFromAPI = data.pagination?.total || data.pagination?.total_records || data.total || (Array.isArray(data.data) ? data.data.length : 0) || (Array.isArray(data) ? data.length : 0);
          totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage) || 1;
          break;
        default:
          setResults([]);
          totalCountFromAPI = 0;
          totalPagesFromAPI = 1;
      }
      console.log('Setting totalCount (filtered):', totalCountFromAPI, 'totalPages:', totalPagesFromAPI);
      console.log('Current tab (filtered):', tab);
      setTotalCount(totalCountFromAPI);
      setTotalItems(totalCountFromAPI);
      setTotalPages(totalPagesFromAPI);
    } catch (err) {
      console.error('Filtered data error:', err);
      setError('Lỗi khi lọc dữ liệu: ' + (err.message || 'Không xác định'));
      setResults([]);
      setTotalCount(0);
      setTotalItems(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  };
  fetchFilteredData();
}, [filters, tab, currentPage, itemsPerPage]);

  // Helper function to get table header color based on tab
  const getTableHeaderStyle = () => {
    switch (tab) {
      case 'whitelist':
        return 'linear-gradient(90deg, #2e7d32 0%, #4caf50 100%)';
      case 'blacklist':
        return 'linear-gradient(90deg, #d32f2f 0%, #f44336 100%)';
      case 'camera':
        return 'linear-gradient(90deg, #ff9800 0%, #ffc107 100%)';
      case 'location':
        return 'linear-gradient(90deg, #1976d2 0%, #2196f3 100%)';
      case 'journey':
        return 'linear-gradient(90deg, #7b1fa2 0%, #9c27b0 100%)';
      case 'plate':
        return 'linear-gradient(90deg, #5d4037 0%, #8d6e63 100%)';
      default:
        return 'linear-gradient(90deg, #1976d2 0%, #1565c0 100%)';
    }
  };

  // Helper function to get avatar color based on tab
  const getAvatarColor = () => {
    switch (tab) {
      case 'whitelist':
        return { bgcolor: '#e8f5e9', border: '2px solid #4caf50', iconColor: '#4caf50' };
      case 'blacklist':
        return { bgcolor: '#ffebee', border: '2px solid #f44336', iconColor: '#f44336' };
      case 'camera':
        return { bgcolor: '#fff3e0', border: '2px solid #ff9800', iconColor: '#ff9800' };
      case 'location':
        return { bgcolor: '#e3f2fd', border: '2px solid #2196f3', iconColor: '#2196f3' };
      default:
        return { bgcolor: '#e0e0e0', border: '2px solid #757575', iconColor: '#757575' };
    }
  };

  // Helper function to format date with time (dd/mm/yyyy HH:mm)
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString; // Return original if invalid date
    
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  // Helper functions from BlackList.js
  const getStatusChip = (status) => {
    const statusConfig = {
      // Camera status values
      'online': { label: 'Online', color: 'success' },
      'offline': { label: 'Offline', color: 'error' },
      'maintenance': { label: 'Bảo trì', color: 'warning' },
      // Other status values
      'valid': { label: 'Còn hiệu lực', color: 'success' },
      'expired': { label: 'Hết hạn', color: 'error' },
      'future': { label: 'Chưa hiệu lực', color: 'warning' },
      'permanent': { label: 'Vĩnh viễn', color: 'info' },
      'active': { label: 'Hoạt động', color: 'success' },
      'inactive': { label: 'Không hoạt động', color: 'error' }
    };
    
    const config = statusConfig[status] || { label: status || 'N/A', color: 'default' };
    
    return <Chip 
      label={config.label} 
      color={config.color} 
      size="small" 
      sx={{ fontWeight: 600 }}
    />;
  };

  const handleViewCameraDetails = async (camera) => {
    try {
      // Close any existing modals first
      setOpenDetail(false);
      setShowLocationDetails(false);
      
      const token = localStorage.getItem('token');
      const response = await fetchDataFromAPI(`/api/cameras/${camera.id}`, token);
      
      if (response.success) {
        setSelectedCamera(response.data.camera);
        setShowCameraDetails(true);
      } else {
        setSnackbar({
          open: true,
          message: 'Không thể tải thông tin camera',
          severity: 'error'
        });
      }
    } catch (error) {
      console.error('Error fetching camera details:', error);
      setSnackbar({
        open: true,
        message: 'Lỗi khi tải thông tin camera',
        severity: 'error'
      });
    }
  };

  const handleViewLocationDetails = async (location) => {
    try {
      // Close any existing modals first
      setOpenDetail(false);
      setShowCameraDetails(false);
      
      // Add a small delay to ensure modals are closed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const token = localStorage.getItem('token');
      
      if (!token) {
        setSnackbar({
          open: true,
          message: 'Vui lòng đăng nhập để xem chi tiết',
          severity: 'error'
        });
        return;
      }
      
      console.log('Fetching location details for ID:', location.id);
      const response = await fetchDataFromAPI(`/api/location/${location.id}`, token);
      
      console.log('Location API response:', response);
      
      if (response && response.success) {
        setSelectedLocation(response.data);
        setShowLocationDetails(true);
      } else {
        setSnackbar({
          open: true,
          message: 'Không thể tải thông tin khu vực',
          severity: 'error'
        });
      }
    } catch (error) {
      console.error('Error fetching location details:', error);
      
      if (error.message.includes('Token has expired') || error.message.includes('invalid')) {
        setSnackbar({
          open: true,
          message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
          severity: 'error'
        });
        // Redirect to login or clear token
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      } else if (error.status === 403) {
        setSnackbar({
          open: true,
          message: 'Bạn không có quyền xem chi tiết khu vực này',
          severity: 'error'
        });
      } else {
        setSnackbar({
          open: true,
          message: 'Lỗi khi tải thông tin khu vực',
          severity: 'error'
        });
      }
    }
  };

  const getViolationTypeChip = (type) => {
    const typeConfig = {
      'unauthorized': { label: 'Không phép', color: 'error' },
      'security_threat': { label: 'Nguy cơ an ninh', color: 'error' },
      'unpaid_fine': { label: 'Chưa nộp phạt', color: 'warning' },
      'banned': { label: 'Cấm', color: 'error' },
      'suspicious': { label: 'Đáng ngờ', color: 'warning' },
      'other': { label: 'Khác', color: 'default' }
    };
    
    const config = typeConfig[type] || { label: type || 'N/A', color: 'default' };
    
    return <Chip 
      label={config.label} 
      color={config.color} 
      size="small" 
      sx={{ fontWeight: 600 }}
    />;
  };

  const getSeverityChip = (severity) => {
    const severityConfig = {
      'low': { label: 'Thấp', color: 'success' },
      'medium': { label: 'Trung bình', color: 'warning' },
      'high': { label: 'Cao', color: 'error' },
      'critical': { label: 'Nghiêm trọng', color: 'error' }
    };
    
    const config = severityConfig[severity] || { label: severity || 'N/A', color: 'default' };
    
    return <Chip 
      label={config.label} 
      color={config.color} 
      size="small" 
      sx={{ fontWeight: 600 }}
    />;
  };

  const getApprovalChip = (status) => {
    const statusConfig = {
      'approved': { label: 'Đã phê duyệt', color: 'success' },
      'pending': { label: 'Chờ phê duyệt', color: 'warning' },
      'rejected': { label: 'Từ chối', color: 'error' }
    };
    
    const config = statusConfig[status] || { label: status || 'N/A', color: 'default' };
    
    return <Chip 
      label={config.label} 
      color={config.color} 
      size="small" 
      sx={{ fontWeight: 600 }}
    />;
  };

  // Debug: Log results state
  console.log('Current results state:', results);
  console.log('Current tab:', tab);
  console.log('Current loading state:', loading);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8f9fa', py: 3 }}>
      {/* Optimized Header */}
      <Box sx={{ px: 3, mb: 2 }}>
        <Card sx={{ 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
          color: 'white', 
          borderRadius: 3, 
          boxShadow: '0 8px 32px rgba(102, 126, 234, 0.3)',
          overflow: 'hidden',
          position: 'relative'
        }}>
          <CardContent sx={{ p: 4, textAlign: 'center', position: 'relative', zIndex: 2 }}>
            <Box display="flex" alignItems="center" justifyContent="center" mb={2}>
              <Avatar sx={{ 
                bgcolor: 'rgba(255,255,255,0.2)', 
                color: 'white', 
                width: 56, 
                height: 56, 
                mr: 2,
                backdropFilter: 'blur(10px)',
                border: '2px solid rgba(255,255,255,0.3)'
              }}>
                <SearchIcon sx={{ fontSize: 32 }} />
              </Avatar>
              <Box>
                <Typography variant="h4" fontWeight={700} sx={{ 
                  color: 'white', 
                  mb: 0.5,
                  textShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                  Tra cứu & Quản lý
                </Typography>
                <Typography variant="h6" sx={{ 
                  color: 'rgba(255,255,255,0.9)', 
                  fontWeight: 400,
                  textShadow: '0 1px 2px rgba(0,0,0,0.1)'
                }}>
                  Hệ thống quản lý biển số xe thông minh
                </Typography>
              </Box>
            </Box>
          </CardContent>
          {/* Decorative background elements */}
          <Box sx={{
            position: 'absolute',
            top: -50,
            right: -50,
            width: 200,
            height: 200,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)',
            zIndex: 1
          }} />
          <Box sx={{
            position: 'absolute',
            bottom: -30,
            left: -30,
            width: 150,
            height: 150,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.05)',
            zIndex: 1
          }} />
        </Card>
      </Box>

      {/* Optimized Filter Section */}
      <Box sx={{ px: 3, mb: 3 }}>
        <Card sx={{ 
          borderRadius: 3, 
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)', 
          background: '#fff',
          border: '1px solid rgba(0,0,0,0.05)'
        }}>
          <CardContent sx={{ p: 3 }}>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
              <Box display="flex" alignItems="center" gap={2}>
                <Avatar sx={{ 
                  bgcolor: '#1976d2', 
                  width: 40, 
                  height: 40,
                  boxShadow: '0 2px 8px rgba(25,118,210,0.2)'
                }}>
                  <TuneRounded sx={{ fontSize: 22, color: 'white' }} />
                </Avatar>
                <Typography variant="h6" fontWeight={600} sx={{ color: '#1976d2' }}>
                  Bộ lọc tìm kiếm
                </Typography>
              </Box>
              <Chip 
                label={`Tab: ${tabList.find(t => t.value === tab)?.label}`} 
                color="primary" 
                size="small" 
                sx={{ 
                  fontWeight: 600, 
                  fontSize: 13, 
                  px: 2, 
                  py: 0.5, 
                  borderRadius: 2,
                  bgcolor: '#e3f2fd',
                  color: '#1976d2'
                }} 
              />
            </Box>
            
            {renderTabSpecificFilters()}
          </CardContent>
        </Card>
      </Box>


      {/* Enhanced Tabs */}
      <Box sx={{ px: 3, mb: 3 }}>
        <Card sx={{ borderRadius: 3, boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
            <Tabs 
              value={tab} 
              onChange={handleTabChange} 
              variant="fullWidth"
              sx={{
                '& .MuiTab-root': {
                  fontWeight: 600,
                  fontSize: 14,
                  minHeight: 80,
                  textTransform: 'none',
                  borderRadius: 2,
                  margin: '8px 2px',
                  transition: 'all 0.2s ease',
                  flex: 1,
                  position: 'relative',
                  '&:hover': {
                    backgroundColor: alpha(theme.palette.primary.main, 0.04)
                  }
                }
              }}
            >
              {tabList.map(t => (
                <Tab 
                  key={t.value} 
                  value={t.value} 
                  label={
                    <Box 
                      display="flex" 
                      alignItems="center" 
                      gap={1.5} 
                      width="100%" 
                      position="relative"
                      sx={{ minHeight: 60 }}
                    >
                      {React.cloneElement(t.icon, { 
                        sx: { 
                          fontSize: 20,
                          color: tab === t.value ? t.color + '.main' : 'text.secondary'
                        } 
                      })}
                      <Box flex={1}>
                        <Typography variant="body1" fontWeight={600} sx={{ mb: 0.5 }}>
                          {t.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {t.description}
                        </Typography>
                      </Box>
                      {/* Số lượng bản ghi ở góc phải trên */}
                      <Box 
                        sx={{ 
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          minWidth: 24,
                          height: 24,
                          borderRadius: '50%',
                          backgroundColor: tab === t.value ? t.color + '.main' : 'grey.300',
                          color: tab === t.value ? 'white' : 'text.secondary',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          boxShadow: tab === t.value ? `0 2px 8px ${theme.palette[t.color].main}40` : 'none'
                        }}
                      >
                        {stats[t.value] || 0}
                      </Box>
                    </Box>
                  }
                />
              ))}
            </Tabs>
          </Box>
        </Card>
      </Box>

      {/* Enhanced Results Table */}
      <Box sx={{ px: 3 }}>
        <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
          <CardContent sx={{ p: 0 }}>
            {loading ? (
              <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight={300}>
                <CircularProgress size={60} thickness={4} />
                <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
                  Đang tìm kiếm...
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Vui lòng đợi trong giây lát
                </Typography>
              </Box>
            ) : error ? (
              <Box display="flex" justifyContent="center" alignItems="center" minHeight={300} p={3}>
                <Alert 
                  severity="error" 
                  sx={{ 
                    width: '100%', 
                    maxWidth: 500,
                    borderRadius: 2
                  }}
                  action={
                    <Button color="inherit" size="small" onClick={handleSearch}>
                      Thử lại
                    </Button>
                  }
                >
                  <Typography variant="subtitle1" fontWeight={600}>
                    Có lỗi xảy ra
                  </Typography>
                  <Typography variant="body2">
                    {error}
                  </Typography>
                </Alert>
              </Box>
                          ) : (
                <>
                  <TableContainer>
                    <Table>
                    <TableHead>
                      <TableRow sx={{ 
                        background: getTableHeaderStyle()
                      }}>
                        {/* STT Column */}
                        <TableCell sx={{ color: 'white', fontWeight: 700, py: 2, width: '80px' }}>
                          <Box display="flex" alignItems="center" gap={1}>
                            STT
                          </Box>
                        </TableCell>

                        {/* Dynamic headers based on tab */}
                        {tab === 'whitelist' || tab === 'blacklist' ? (
                          <>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>
                              <Box display="flex" alignItems="center" gap={1}>
                                <DirectionsCar />
                                Biển số xe
                              </Box>
                            </TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Ảnh biển số</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Trạng thái</TableCell>
                            {tab === 'whitelist' && (
                              <TableCell sx={{ color: 'white', fontWeight: 700 }}>Phê duyệt</TableCell>
                            )}
                            {tab === 'blacklist' && (
                              <TableCell sx={{ color: 'white', fontWeight: 700 }}>Loại vi phạm</TableCell>
                            )}
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thao tác</TableCell>
                          </>
                        ) : tab === 'camera' ? (
                          <>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>
                              <Box display="flex" alignItems="center" gap={1}>
                                <CameraAlt />
                                Tên camera
                              </Box>
                            </TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Vị trí</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Trạng thái</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thao tác</TableCell>
                          </>
                        ) : tab === 'location' ? (
                          <>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>
                              <Box display="flex" alignItems="center" gap={1}>
                                <LocationOn />
                                Tên khu vực
                              </Box>
                            </TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Địa chỉ</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Camera</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thao tác</TableCell>
                          </>
                        ) : tab === 'journey' ? (
                          <>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>
                              <Box display="flex" alignItems="center" gap={1}>
                                <DirectionsCar />
                                Biển số
                              </Box>
                            </TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Ngày</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Lộ trình</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Loại xe</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thao tác</TableCell>
                          </>
                        ) : tab === 'plate' ? (
                          <>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>
                              <Box display="flex" alignItems="center" gap={1}>
                                <DirectionsCar />
                                Biển số
                              </Box>
                            </TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Ảnh phát hiện</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Camera</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Khu vực</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thời gian</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thao tác</TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>
                              <Box display="flex" alignItems="center" gap={1}>
                                <DirectionsCar />
                                Biển số
                              </Box>
                            </TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Hình ảnh</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Khu vực</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Trạng thái</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Phê duyệt</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thao tác</TableCell>
                          </>
                        )}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tab === 'camera' ? (
                        cameras.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} align="center">
                              <Typography color="text.secondary" sx={{ py: 4 }}>
                                Không có camera nào
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ) : (
                          cameras.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((item, index) => (
                            <TableRow key={item.id || index} hover>
                              <TableCell>{((currentPage - 1) * itemsPerPage) + index + 1}</TableCell>
                              <TableCell>{item.name}</TableCell>
                              <TableCell>{item.location_name || item.location || ''}</TableCell>
                              <TableCell>
                                {getStatusChip(item.status)}
                              </TableCell>
                              <TableCell>
                                <Button 
                                  variant="outlined" 
                                  size="small" 
                                  startIcon={<Visibility />} 
                                  sx={{ borderRadius: 2, textTransform: 'none' }}
                                  onClick={() => handleViewCameraDetails(item)}
                                >
                                  Xem chi tiết
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )
                      ) : (
                        results?.map((item, index) => {
                          const avatarStyle = getAvatarColor();
                          console.log('Rendering item:', item, 'at index:', index);
                          return (
                            <Fade in key={item.id || index} timeout={200 + index * 50}>
                              <TableRow 
                                hover 
                                sx={{ 
                                  '&:hover': { 
                                    backgroundColor: alpha(theme.palette.primary.main, 0.04),
                                    cursor: tab !== 'location' && tab !== 'plate' ? 'pointer' : 'default'
                                  },
                                  transition: 'all 0.2s ease'
                                }}
                                onClick={tab !== 'location' && tab !== 'plate' ? () => handleOpenDetail(item) : null}
                              >
                                {/* STT Cell */}
                                <TableCell /* STT Cell */ sx={{ /* remove color and fontWeight, use default */ }}>
                                  {((currentPage - 1) * itemsPerPage) + index + 1}
                                </TableCell>

                                {/* Dynamic table rows based on tab */}
                                {tab === 'camera' ? (
                                  cameras.length === 0 ? (
                                    <TableRow>
                                      <TableCell colSpan={6} align="center">
                                        <Typography color="text.secondary" sx={{ py: 4 }}>
                                          Không có camera nào
                                        </Typography>
                                      </TableCell>
                                    </TableRow>
                                  ) : (
                                    cameras.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((item, index) => (
                                      <TableRow key={item.id || index} hover>
                                        <TableCell>{((currentPage - 1) * itemsPerPage) + index + 1}</TableCell>
                                        <TableCell>{item.name}</TableCell>
                                        <TableCell>{item.location_name || item.location || ''}</TableCell>
                                        <TableCell>
                                          {getStatusChip(item.status)}
                                        </TableCell>
                                        <TableCell>
                                          <Button 
                                            variant="outlined" 
                                            size="small" 
                                            startIcon={<Visibility />} 
                                            sx={{ borderRadius: 2, textTransform: 'none' }}
                                            onClick={() => handleViewCameraDetails(item)}
                                          >
                                            Xem chi tiết
                                          </Button>
                                        </TableCell>
                                      </TableRow>
                                    ))
                                  )
                                ) : tab === 'location' ? (
                                  <>
                                    <TableCell>
                                      <Box display="flex" alignItems="center" gap={2}>
                                        <Avatar sx={{ bgcolor: 'secondary.light', width: 40, height: 40 }}>
                                          <LocationOn />
                                        </Avatar>
                                        <Typography variant="body2" fontWeight={600}>
                                          {item.name}
                                        </Typography>
                                      </Box>
                                    </TableCell>
                                    <TableCell>
                                      <Typography variant="body2" color="text.secondary">
                                        {item.address || 'N/A'}
                                      </Typography>
                                    </TableCell>
                                    <TableCell>
                                      <Box display="flex" alignItems="flex-start" gap={1}>
                                        <CameraAlt sx={{ fontSize: 16, color: 'primary.main', mt: 0.5 }} />
                                        <Box>
                                          <Typography variant="body2" fontWeight={500} color="primary.main" sx={{ mb: 0.5 }}>
                                            {item.camera_count || 0} camera
                                          </Typography>
                                          <Typography variant="caption" color="text.secondary" sx={{ 
                                            display: 'block',
                                            lineHeight: 1.2,
                                            maxWidth: 200,
                                            wordBreak: 'break-word'
                                          }}>
                                            {item.camera_names || 'Không có camera'}
                                          </Typography>
                                        </Box>
                                      </Box>
                                    </TableCell>
                                    <TableCell>
                                      <Button 
                                        variant="outlined" 
                                        size="small" 
                                        startIcon={<Visibility />}
                                        sx={{ borderRadius: 2, textTransform: 'none' }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleViewLocationDetails(item);
                                        }}
                                      >
                                        Xem chi tiết
                                      </Button>
                                    </TableCell>
                                  </>
                                ) : tab === 'journey' ? (
                                  <>
                                    <TableCell>
                                      <Typography variant="body1" fontWeight={600} color="primary.main">
                                        {item.plate_number}
                                      </Typography>
                                    </TableCell>
                                    <TableCell>
                                      <Typography variant="body2">
                                        {formatDate(item.journey_date || item.date)}
                                      </Typography>
                                    </TableCell>
                                    <TableCell>
                                      <Typography variant="body2">
                                        {item.route || item.journey_route || 'N/A'}
                                      </Typography>
                                    </TableCell>
                                    <TableCell>
                                      {getSeverityChip(item.vehicle_type || 'unknown')}
                                    </TableCell>
                                    <TableCell>
                                      <Button 
                                        variant="outlined" 
                                        size="small" 
                                        startIcon={<Visibility />}
                                        sx={{ borderRadius: 2, textTransform: 'none' }}
                                      >
                                        Xem chi tiết
                                      </Button>
                                    </TableCell>
                                  </>
                                ) : tab === 'plate' ? (
                                  <>
                                    <TableCell>
                                      <Typography variant="body1" fontWeight={600} color="primary.main">
                                        {item.plate_number}
                                      </Typography>
                                    </TableCell>
                                    <TableCell>
                                      <Avatar
                                        variant="rounded"
                                        src={item.cropped_plate_image_path || item.original_image_path}
                                        sx={{ 
                                          width: 120, 
                                          height: 72,
                                          ...avatarStyle
                                        }}
                                        imgProps={{ style: { objectFit: 'contain', width: '100%', height: '100%' } }}
                                      >
                                        <DirectionsCar sx={{ color: avatarStyle.iconColor }} />
                                      </Avatar>
                                    </TableCell>
                                    <TableCell>
                                      <Box display="flex" alignItems="center" gap={1}>
                                        <CameraAlt sx={{ fontSize: 16, color: 'warning.main' }} />
                                        <Typography variant="body2">
                                          {item.camera_name || 'N/A'}
                                        </Typography>
                                      </Box>
                                    </TableCell>
                                    <TableCell>
                                      <Box display="flex" alignItems="center" gap={1}>
                                        <LocationOn sx={{ fontSize: 16, color: 'primary.main' }} />
                                        <Typography variant="body2">
                                          {item.location_name || 'N/A'}
                                        </Typography>
                                      </Box>
                                    </TableCell>
                                    <TableCell>
                                      <Typography variant="body2" color="text.secondary">
                                        {formatDate(item.detected_at || item.timestamp) || 'N/A'}
                                      </Typography>
                                    </TableCell>
                                    <TableCell>
                                      <Button 
                                        variant="outlined" 
                                        size="small" 
                                        startIcon={<Visibility />}
                                        sx={{ borderRadius: 2, textTransform: 'none' }}
                                        onClick={() => {
                                          setSelectedPlate(item);
                                          setShowPlateDetails(true);
                                        }}
                                      >
                                        Xem chi tiết
                                      </Button>
                                    </TableCell>
                                  </>
                                ) : tab === 'whitelist' || tab === 'blacklist' ? (
                                  <>
                                    <TableCell sx={{ color: 'black', fontSize: 14, fontWeight: 600 }}>
                                      {item.plate_number}
                                    </TableCell>
                                    <TableCell>
                                      <Avatar
                                        variant="rounded"
                                        src={item.detected_plate_image || item.plate_image}
                                        sx={{ 
                                          width: 80, 
                                          height: 48,
                                          ...avatarStyle
                                        }}
                                        imgProps={{ style: { objectFit: 'cover', width: '100%', height: '100%' } }}
                                      >
                                        <DirectionsCar sx={{ color: avatarStyle.iconColor }} />
                                      </Avatar>
                                    </TableCell>
                                    <TableCell>
                                      {getStatusChip(item.current_status)}
                                    </TableCell>
                                    {tab === 'whitelist' && (
                                      <TableCell>
                                        {getApprovalChip(item.approval_status)}
                                      </TableCell>
                                    )}
                                    {tab === 'blacklist' && (
                                      <TableCell>
                                        {getViolationTypeChip(item.violation_type)}
                                      </TableCell>
                                    )}
                                    <TableCell>
                                      <Button 
                                        variant="outlined" 
                                        size="small" 
                                        startIcon={<Visibility />}
                                        sx={{ borderRadius: 2, textTransform: 'none' }}
                                      >
                                        Xem chi tiết
                                      </Button>
                                    </TableCell>
                                  </>
                                ) : (
                                  // Default table row for other tabs
                                  <>
                                    <TableCell sx={{ color: 'black', fontSize: 14 }}>
                                      {item.plate_number}
                                    </TableCell>
                                    <TableCell>
                                      <Avatar
                                        variant="rounded"
                                        src={item.detected_plate_image || item.plate_image}
                                        sx={{ 
                                          width: 80, 
                                          height: 48,
                                          ...avatarStyle
                                        }}
                                        imgProps={{ style: { objectFit: 'cover', width: '100%', height: '100%' } }}
                                      >
                                        <DirectionsCar sx={{ color: avatarStyle.iconColor }} />
                                      </Avatar>
                                    </TableCell>

                                    <TableCell>
                                      <Box display="flex" alignItems="center" gap={1}>
                                        <LocationOn sx={{ fontSize: 16, color: 'primary.main' }} />
                                        <Typography variant="body2" fontWeight={500}>
                                          {item.location_name || 'N/A'}
                                        </Typography>
                                      </Box>
                                    </TableCell>
                                    <TableCell>
                                      {getStatusChip(item.current_status)}
                                    </TableCell>
                                    <TableCell>
                                      {getApprovalChip(item.approval_status)}
                                    </TableCell>
                                    <TableCell>
                                      {hasViewDetailLocation && (
<Button 
                                        variant="outlined" 
                                        size="small" 
                                        startIcon={<Visibility />}
                                        sx={{ borderRadius: 2, textTransform: 'none' }}
                                      >
                                        Xem chi tiết
                                      </Button>
                                      )}
                                      
                                    </TableCell>
                                  </>
                                )}
                              </TableRow>
                            </Fade>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>

               <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'stretch', md: 'center' }, justifyContent: 'space-between', gap: 2, p: 2, borderTop: '1px solid #e0e0e0', backgroundColor: '#fafafa' }}>
  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
    {totalCount === 0
      ? 'Hiển thị 0/0 bản ghi'
      : `Hiển thị ${((currentPage - 1) * itemsPerPage) + 1} - ${Math.min(currentPage * itemsPerPage, totalCount)} của ${totalCount} bản ghi`}
    {/* Debug: totalCount = {totalCount}, results.length = {results.length}, tab = {tab} */}
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
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Button size="small" variant="outlined" onClick={() => setCurrentPage(1)} disabled={currentPage === 1} sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}><FirstPage fontSize="small" /></Button>
      <Button size="small" variant="outlined" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}><ChevronLeft fontSize="small" /></Button>
      {getPaginationItems(currentPage, totalPages).map((item, idx) => (
        item === '...'
          ? <Box key={`dots-${idx}`} sx={{ px: 1, color: '#999' }}>...</Box>
          : <Button key={item} variant={item === currentPage ? 'contained' : 'outlined'} size="small" onClick={() => setCurrentPage(item)} sx={{ minWidth: 32, width: 32, height: 32, borderRadius: 1, fontSize: '0.875rem', fontWeight: item === currentPage ? 600 : 400, ...(item === currentPage ? { backgroundColor: '#1976d2', color: 'white', border: 'none', '&:hover': { backgroundColor: '#1565c0' } } : { borderColor: '#e0e0e0', color: '#666', '&:hover': { backgroundColor: '#f5f5f5', borderColor: '#1976d2' } }) }}>{item}</Button>
      ))}
      <Button size="small" variant="outlined" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}><ChevronRight fontSize="small" /></Button>
      <Button size="small" variant="outlined" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} sx={{ minWidth: 32, width: 32, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}><LastPage fontSize="small" /></Button>
    </Box>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography variant="body2" color="text.secondary">Đến trang:</Typography>
      <InputBase value={gotoPage} onChange={e => setGotoPage(e.target.value.replace(/[^0-9]/g, ''))} onKeyDown={e => { if (e.key === 'Enter') { const page = parseInt(gotoPage, 10); if (page && page >= 1 && page <= totalPages) { setCurrentPage(page); setGotoPage(''); } } }} placeholder="1" sx={{ width: 60, height: 32, border: '1px solid #e0e0e0', borderRadius: 1, px: 1, fontSize: '0.875rem', '& input': { textAlign: 'center' } }} />
      <Button size="small" variant="outlined" onClick={() => { const page = parseInt(gotoPage, 10); if (page && page >= 1 && page <= totalPages) { setCurrentPage(page); setGotoPage(''); } }} disabled={!gotoPage || parseInt(gotoPage, 10) < 1 || parseInt(gotoPage, 10) > totalPages} sx={{ minWidth: 'auto', px: 2, height: 32, textTransform: 'none', fontSize: '0.875rem' }}>Đi</Button>
    </Box>
  </Box>
</Box>
              </>
            )}
          </CardContent>
        </Card>
      </Box>

      {/* Camera Details Modal */}
      <Dialog 
        open={openDetail} 
        onClose={handleCloseDetail} 
        maxWidth="lg" 
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
            overflow: 'hidden'
          }
        }}
      >
        <DialogTitle 
          sx={{ 
            background: '#1976d2', 
            color: 'white', 
            display: 'flex', 
            alignItems: 'center', 
            gap: 2,
            py: 3,
            px: 3
          }}
        >
          <Avatar sx={{ 
            bgcolor: 'rgba(255,255,255,0.2)', 
            width: 40, 
            height: 40
          }}>
            <Info sx={{ fontSize: 20 }} />
          </Avatar>
          <Box flex={1}>
            <Typography variant="h5" fontWeight={600}>
              Thông tin chi tiết
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              {selectedItem?.plate_number || 'Xem thông tin đầy đủ'}
            </Typography>
          </Box>
          <IconButton 
            onClick={handleCloseDetail} 
            sx={{ 
              color: 'white',
              '&:hover': {
                bgcolor: 'rgba(255,255,255,0.1)'
              }
            }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        
        <DialogContent dividers sx={{ p: 0 }}>
          {selectedItem && (
            <Box>
              {/* Header Section */}
              <Box sx={{ 
                p: 3, 
                background: '#f5f5f5',
                borderBottom: '1px solid #e0e0e0'
              }}>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={4}>
                    <Box display="flex" flexDirection="column" alignItems="center">
                      <Avatar 
                        variant="rounded" 
                        src={selectedItem.detected_plate_image || selectedItem.plate_image || ''} 
                        sx={{ 
                          width: 180, 
                          height: 110, 
                          bgcolor: '#e3f2fd',
                          border: '2px solid #1976d2',
                          mb: 2
                        }}
                      >
                        <DirectionsCar sx={{ fontSize: 50, color: '#1976d2' }} />
                      </Avatar>
                      
                      <Typography variant="h4" fontWeight={600} color="primary.main" mb={2}>
                        {selectedItem.plate_number}
                      </Typography>
                      
                      <Stack direction="row" spacing={1} mb={2} flexWrap="wrap" justifyContent="center">
                        {selectedItem.status === 'whitelist' && (
                          <Chip 
                            label="Whitelist" 
                            color="success"
                            sx={{ fontWeight: 600 }} 
                          />
                        )}
                        {selectedItem.status === 'blacklist' && (
                          <Chip 
                            label="Blacklist" 
                            color="error"
                            sx={{ fontWeight: 600 }} 
                          />
                        )}
                        {selectedItem.current_status && (
                          <Chip 
                            label={
                              selectedItem.current_status === 'valid' ? 'Còn hiệu lực' : 
                              selectedItem.current_status === 'expired' ? 'Hết hạn' : 
                              selectedItem.current_status === 'future' ? 'Chưa hiệu lực' : 'Vĩnh viễn'
                            }
                            color={
                              selectedItem.current_status === 'valid' ? 'success' : 
                              selectedItem.current_status === 'expired' ? 'error' : 
                              selectedItem.current_status === 'future' ? 'warning' : 'info'
                            }
                            sx={{ fontWeight: 600 }}
                          />
                        )}
                        {selectedItem.approval_status && (
                          <Chip 
                            label={
                              selectedItem.approval_status === 'approved' ? 'Đã duyệt' : 
                              selectedItem.approval_status === 'pending' ? 'Chờ duyệt' : 'Từ chối'
                            }
                            color={
                              selectedItem.approval_status === 'approved' ? 'success' : 
                              selectedItem.approval_status === 'pending' ? 'warning' : 'error'
                            }
                            sx={{ fontWeight: 600 }}
                          />
                        )}
                      </Stack>
                    </Box>
                  </Grid>
                  
                  <Grid item xs={12} md={8}>
                    <Grid container spacing={3}>
                      {/* Vehicle Information */}
                      {/* Vehicle Information */}
                      <Grid item xs={12}>
                        <Paper sx={{ 
                          p: 2, 
                          borderRadius: 2, 
                          bgcolor: 'background.paper', 
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                        }}>
                          <Typography variant="h6" fontWeight={600} mb={2} color="primary.main" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <DirectionsCar sx={{ fontSize: 20, color: 'primary.main' }} />
                            Thông tin phương tiện
                          </Typography>
                          <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                              <Box>
                                <Typography variant="body2" color="text.secondary" mb={1}>
                                  Biển số xe
                                </Typography>
                                <Typography variant="h6" fontWeight={600} color="primary.main">
                                  {selectedItem.plate_number}
                                </Typography>
                              </Box>
                            </Grid>
                            <Grid item xs={12} md={6}>
                              <Box>
                                <Typography variant="body2" color="text.secondary" mb={1}>
                                  Trạng thái
                                </Typography>
                                <Box display="flex" alignItems="center" gap={1}>
                                  {selectedItem.current_status && (
                                    <Chip 
                                      label={
                                        selectedItem.current_status === 'valid' ? 'Còn hiệu lực' : 
                                        selectedItem.current_status === 'expired' ? 'Hết hạn' : 
                                        selectedItem.current_status === 'future' ? 'Chưa hiệu lực' : 'Vĩnh viễn'
                                      }
                                      color={
                                        selectedItem.current_status === 'valid' ? 'success' : 
                                        selectedItem.current_status === 'expired' ? 'error' : 
                                        selectedItem.current_status === 'future' ? 'warning' : 'info'
                                      }
                                      size="small"
                                    />
                                  )}
                                </Box>
                              </Box>
                            </Grid>
                          </Grid>
                        </Paper>
                      </Grid>

                      {/* Owner Information */}
                      {(selectedItem.owner_name || selectedItem.owner_phone || selectedItem.contact_email) && (
                        <Grid item xs={12}>
                                                  <Paper sx={{ 
                          p: 2, 
                          borderRadius: 2, 
                          bgcolor: 'background.paper', 
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                        }}>
                          <Typography variant="h6" fontWeight={600} mb={2} color="secondary.main" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Person sx={{ fontSize: 20, color: 'secondary.main' }} />
                            Thông tin chủ xe
                          </Typography>
                            <Grid container spacing={3}>
                                                              <Grid item xs={12} md={4}>
                                  <Box>
                                    <Typography variant="body2" color="text.secondary" mb={1}>
                                      Họ tên
                                    </Typography>
                                    <Typography variant="body1" fontWeight={500}>
                                      {selectedItem.owner_name || 'Chưa có thông tin'}
                                    </Typography>
                                  </Box>
                                </Grid>
                                <Grid item xs={12} md={4}>
                                  <Box>
                                    <Typography variant="body2" color="text.secondary" mb={1}>
                                      Số điện thoại
                                    </Typography>
                                    <Typography variant="body1" fontWeight={500}>
                                      {selectedItem.owner_phone || 'N/A'}
                                    </Typography>
                                  </Box>
                                </Grid>
                                <Grid item xs={12} md={4}>
                                  <Box>
                                    <Typography variant="body2" color="text.secondary" mb={1}>
                                      Email
                                    </Typography>
                                    <Typography variant="body1" fontWeight={500}>
                                      {selectedItem.contact_email || 'N/A'}
                                    </Typography>
                                  </Box>
                                </Grid>
                            </Grid>
                          </Paper>
                        </Grid>
                      )}

                      {/* Additional Information */}
                      <Grid item xs={12}>
                        <Paper sx={{ 
                          p: 2, 
                          borderRadius: 2, 
                          bgcolor: 'background.paper', 
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                        }}>
                          <Typography variant="h6" fontWeight={600} mb={2} color="info.main" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Info sx={{ fontSize: 20, color: 'info.main' }} />
                            Thông tin bổ sung
                          </Typography>
                          <Grid container spacing={3}>
                            {selectedItem.violation_type && (
                              <Grid item xs={12} md={6}>
                                <Box>
                                  <Typography variant="body2" color="text.secondary" mb={1}>
                                    Loại vi phạm
                                  </Typography>
                                  <Box>
                                    {getViolationTypeChip(selectedItem.violation_type)}
                                  </Box>
                                </Box>
                              </Grid>
                            )}
                            <Grid item xs={12} md={6}>
                              <Box>
                                <Typography variant="body2" color="text.secondary" mb={1}>
                                  Lịch sử phát hiện
                                </Typography>
                                <Typography variant="body1" fontWeight={500}>
                                  {selectedItem.history_count || 0} lần
                                </Typography>
                              </Box>
                            </Grid>
                            {selectedItem.valid_from && (
                              <Grid item xs={12} md={6}>
                                <Box>
                                  <Typography variant="body2" color="text.secondary" mb={1}>
                                    Thời gian hiệu lực
                                  </Typography>
                                  <Typography variant="body1" fontWeight={500}>
                                    {formatDate(selectedItem.valid_from)} - {selectedItem.valid_to ? formatDate(selectedItem.valid_to) : 'Vĩnh viễn'}
                                  </Typography>
                                </Box>
                              </Grid>
                            )}
                            {selectedItem.created_at && (
                              <Grid item xs={12} md={6}>
                                <Box>
                                  <Typography variant="body2" color="text.secondary" mb={1}>
                                    Ngày tạo
                                  </Typography>
                                  <Typography variant="body1" fontWeight={500}>
                                    {formatDate(selectedItem.created_at)}
                                  </Typography>
                                </Box>
                              </Grid>
                            )}
                            {selectedItem.description && (
                              <Grid item xs={12}>
                                <Box>
                                  <Typography variant="body2" color="text.secondary" mb={1}>
                                    Mô tả chi tiết
                                  </Typography>
                                  <Typography variant="body1" sx={{ lineHeight: 1.6 }}>
                                    {selectedItem.description}
                                  </Typography>
                                </Box>
                              </Grid>
                            )}
                          </Grid>
                        </Paper>
                      </Grid>
                    </Grid>
                  </Grid>
                </Grid>
              </Box>
            </Box>
          )}
        </DialogContent>
        
        <DialogActions sx={{ 
          p: 2, 
          gap: 2, 
          background: '#fafafa',
          borderTop: '1px solid #e0e0e0'
        }}>
          <Button 
            onClick={handleCloseDetail} 
            variant="outlined" 
            startIcon={<CloseIcon />} 
            sx={{ 
              borderRadius: 2,
              px: 3,
              py: 1,
              textTransform: 'none',
              fontWeight: 500
            }}
          >
            Đóng
          </Button>
          {/* Only show "Xem lịch sử" button for tabs other than whitelist and blacklist */}
          {tab !== 'whitelist' && tab !== 'blacklist' && (
            <Button 
              variant="contained" 
              startIcon={<Info />}
              sx={{ 
                borderRadius: 2,
                px: 3,
                py: 1,
                textTransform: 'none',
                fontWeight: 500
              }}
            >
              Xem lịch sử
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Camera Details Modal */}
      <Dialog 
        open={showCameraDetails} 
        onClose={() => setShowCameraDetails(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 3, minHeight: '70vh' }
        }}
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={2}>
            <CameraAlt color="primary" />
            <Typography variant="h5" fontWeight={600}>
              Chi tiết Camera
            </Typography>
            <Chip 
              label={selectedCamera?.status || 'N/A'} 
              color={selectedCamera?.status === 'online' ? 'success' : selectedCamera?.status === 'offline' ? 'error' : 'warning'}
              size="small"
            />
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 3 }}>
          {selectedCamera && (
            <Grid container spacing={3}>
              {/* Basic Information */}
              <Grid item xs={12} md={6}>
                <Card sx={{ p: 3, height: '100%' }}>
                  <Typography variant="h6" gutterBottom color="primary" fontWeight={600}>
                    <Info sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Thông tin cơ bản
                  </Typography>
                  <Stack spacing={2}>
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">Tên camera:</Typography>
                      <Typography variant="body1" fontWeight={500}>{selectedCamera.name}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">Trạng thái:</Typography>
                      <Chip 
                        label={selectedCamera.status || 'N/A'} 
                        color={selectedCamera.status === 'online' ? 'success' : selectedCamera.status === 'offline' ? 'error' : 'warning'}
                        size="small"
                        sx={{ fontWeight: 600 }}
                      />
                    </Box>
                  </Stack>
                </Card>
              </Grid>

              {/* Location Information */}
              <Grid item xs={12} md={6}>
                <Card sx={{ p: 3, height: '100%' }}>
                  <Typography variant="h6" gutterBottom color="primary" fontWeight={600}>
                    <LocationOn sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Thông tin vị trí
                  </Typography>
                  <Stack spacing={2}>
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">Vị trí:</Typography>
                      <Typography variant="body1" fontWeight={500}>{selectedCamera.location_name}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">Địa chỉ:</Typography>
                      <Typography variant="body1" fontWeight={500}>{selectedCamera.location_address || 'N/A'}</Typography>
                    </Box>
                    {selectedCamera.location_latitude && selectedCamera.location_longitude && (
                      <Box>
                        <Typography variant="subtitle2" color="text.secondary">Tọa độ:</Typography>
                        <Typography variant="body1" fontWeight={500}>
                          {selectedCamera.location_latitude}, {selectedCamera.location_longitude}
                        </Typography>
                      </Box>
                    )}
                  </Stack>
                </Card>
              </Grid>

              {/* Technical Specifications */}
              <Grid item xs={12} md={6}>
                <Card sx={{ p: 3, height: '100%' }}>
                  <Typography variant="h6" gutterBottom color="primary" fontWeight={600}>
                    <Security sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Thông số kỹ thuật
                  </Typography>
                  <Stack spacing={2}>
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">Độ phân giải:</Typography>
                      <Typography variant="body1" fontWeight={500}>
                        {selectedCamera.width && selectedCamera.height ? `${selectedCamera.width}x${selectedCamera.height}` : 'N/A'}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">FPS:</Typography>
                      <Typography variant="body1" fontWeight={500}>{selectedCamera.fps || 'N/A'}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">Giao thức:</Typography>
                      <Typography variant="body1" fontWeight={500}>{selectedCamera.protocol || 'N/A'}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">Host:</Typography>
                      <Typography variant="body1" fontWeight={500}>{selectedCamera.host}:{selectedCamera.port}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">Phát hiện biển số:</Typography>
                      <Chip 
                        label={selectedCamera.is_detect ? 'Bật' : 'Tắt'} 
                        color={selectedCamera.is_detect ? 'success' : 'default'}
                        size="small"
                      />
                    </Box>
                  </Stack>
                </Card>
              </Grid>

            </Grid>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button 
            onClick={() => setShowCameraDetails(false)}
            variant="outlined"
            sx={{ borderRadius: 2, textTransform: 'none' }}
          >
            Đóng
          </Button>
        </DialogActions>
      </Dialog>

      {/* Location Details Modal */}
      <Dialog 
        open={showLocationDetails} 
        onClose={() => setShowLocationDetails(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 3, minHeight: '70vh' }
        }}
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={2}>
            <LocationOn color="primary" />
            <Typography variant="h5" fontWeight={600}>
              Chi tiết Khu vực
            </Typography>
            <Chip 
              label={selectedLocation?.is_active ? 'Hoạt động' : 'Không hoạt động'} 
              color={selectedLocation?.is_active ? 'success' : 'error'}
              size="small"
            />
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 3 }}>
          {selectedLocation && (
            <Grid container spacing={3}>
              {/* Basic Information */}
              <Grid item xs={12} md={6}>
                <Card sx={{ p: 3, height: '100%' }}>
                  <Typography variant="h6" gutterBottom color="primary" fontWeight={600}>
                    <Info sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Thông tin cơ bản
                  </Typography>
                  <Stack spacing={2}>
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">Tên khu vực:</Typography>
                      <Typography variant="body1" fontWeight={500}>{selectedLocation.name}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">Mã khu vực:</Typography>
                      <Typography variant="body1" fontWeight={500}>{selectedLocation.code || 'N/A'}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">Loại khu vực:</Typography>
                      <Chip 
                        label={selectedLocation.zone_type || 'N/A'} 
                        color="primary"
                        size="small"
                        sx={{ fontWeight: 600 }}
                      />
                    </Box>
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">Trạng thái:</Typography>
                      <Chip 
                        label={selectedLocation.is_active ? 'Hoạt động' : 'Không hoạt động'} 
                        color={selectedLocation.is_active ? 'success' : 'error'}
                        size="small"
                        sx={{ fontWeight: 600 }}
                      />
                    </Box>
                  </Stack>
                </Card>
              </Grid>

              {/* Location Details */}
              <Grid item xs={12} md={6}>
                <Card sx={{ p: 3, height: '100%' }}>
                  <Typography variant="h6" gutterBottom color="primary" fontWeight={600}>
                    <LocationOn sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Thông tin vị trí
                  </Typography>
                  <Stack spacing={2}>
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">Địa chỉ:</Typography>
                      <Typography variant="body1" fontWeight={500}>{selectedLocation.address || 'N/A'}</Typography>
                    </Box>
                    {selectedLocation.latitude && selectedLocation.longitude && (
                      <Box>
                        <Typography variant="subtitle2" color="text.secondary">Tọa độ:</Typography>
                        <Typography variant="body1" fontWeight={500}>
                          {selectedLocation.latitude}, {selectedLocation.longitude}
                        </Typography>
                      </Box>
                    )}
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">Khu vực hạn chế:</Typography>
                      <Chip 
                        label={selectedLocation.is_restricted ? 'Có' : 'Không'} 
                        color={selectedLocation.is_restricted ? 'warning' : 'success'}
                        size="small"
                      />
                    </Box>
                    {selectedLocation.description && (
                      <Box>
                        <Typography variant="subtitle2" color="text.secondary">Mô tả:</Typography>
                        <Typography variant="body1" fontWeight={500}>{selectedLocation.description}</Typography>
                      </Box>
                    )}
                  </Stack>
                </Card>
              </Grid>

              {/* Camera Information */}
              <Grid item xs={12}>
                <Card sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom color="primary" fontWeight={600}>
                    <CameraAlt sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Thông tin Camera
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={4}>
                      <Box textAlign="center" p={2} sx={{ bgcolor: 'primary.light', borderRadius: 2 }}>
                        <Typography variant="h4" fontWeight={700} color="primary.main">
                          {selectedLocation.camera_count || 0}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Tổng Camera
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Box textAlign="center" p={2} sx={{ bgcolor: 'success.light', borderRadius: 2 }}>
                        <Typography variant="h4" fontWeight={700} color="success.main">
                          {selectedLocation.online_camera_count || 0}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Online
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Box textAlign="center" p={2} sx={{ bgcolor: 'info.light', borderRadius: 2 }}>
                        <Typography variant="h4" fontWeight={700} color="info.main">
                          {selectedLocation.detection_enabled_camera_count || 0}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Phát hiện
                        </Typography>
                      </Box>
                    </Grid>
                  </Grid>
                  
                  {selectedLocation.camera_names && (
                    <Box mt={3}>
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        Danh sách Camera:
                      </Typography>
                      <Typography variant="body1" fontWeight={500}>
                        {selectedLocation.camera_names}
                      </Typography>
                    </Box>
                  )}
                </Card>
              </Grid>

              {/* Statistics */}
              <Grid item xs={12}>
                <Card sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom color="primary" fontWeight={600}>
                    <BarChart sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Thống kê
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={4}>
                      <Box textAlign="center" p={2} sx={{ bgcolor: 'grey.100', borderRadius: 2 }}>
                        <Typography variant="h5" fontWeight={700} color="primary.main">
                          {selectedLocation.total_detections || 0}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Tổng phát hiện
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Box textAlign="center" p={2} sx={{ bgcolor: 'grey.100', borderRadius: 2 }}>
                        <Typography variant="h5" fontWeight={700} color="success.main">
                          {selectedLocation.today_detections || 0}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Hôm nay
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Box textAlign="center" p={2} sx={{ bgcolor: 'grey.100', borderRadius: 2 }}>
                        <Typography variant="h5" fontWeight={700} color="info.main">
                          {selectedLocation.week_detections || 0}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Tuần này
                        </Typography>
                      </Box>
                    </Grid>
                  </Grid>
                </Card>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button 
            onClick={() => setShowLocationDetails(false)}
            variant="outlined"
            sx={{ borderRadius: 2, textTransform: 'none' }}
          >
            Đóng
          </Button>
        </DialogActions>
      </Dialog>

      {/* Plate Detection Details Modal */}
      <Dialog 
        open={showPlateDetails} 
        onClose={() => setShowPlateDetails(false)}
        maxWidth="md"
        fullWidth
        sx={{
          '& .MuiDialog-paper': {
            borderRadius: 3,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)'
          }
        }}
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={2}>
            <DirectionsCar color="primary" />
            <Typography variant="h6" fontWeight={600}>
              Chi tiết phát hiện biển số
            </Typography>
            <Box sx={{ flexGrow: 1 }} />
            <IconButton 
              onClick={() => setShowPlateDetails(false)}
              size="small"
              sx={{ 
                bgcolor: 'rgba(0,0,0,0.04)', 
                '&:hover': { bgcolor: 'rgba(0,0,0,0.08)' }
              }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        
        <DialogContent dividers sx={{ p: 0 }}>
          {selectedPlate && (
            <Box>
              {/* Header Section */}
              <Box sx={{ 
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
                color: 'white', 
                p: 3,
                textAlign: 'center'
              }}>
                <Typography variant="h4" fontWeight={700} sx={{ mb: 1 }}>
                  {selectedPlate.plate_number}
                </Typography>
                <Typography variant="body1" sx={{ opacity: 0.9 }}>
                  {selectedPlate.raw_plate_text && selectedPlate.raw_plate_text !== selectedPlate.plate_number 
                    ? `Gốc: ${selectedPlate.raw_plate_text}` 
                    : 'Biển số đã được chuẩn hóa'
                  }
                </Typography>
              </Box>

              <Box sx={{ p: 3 }}>
                <Grid container spacing={3}>
                  {/* Ảnh phát hiện */}
                  <Grid item xs={12} md={6}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                        Ảnh phát hiện
                      </Typography>
                      <Box sx={{ 
                        border: '2px solid #e0e0e0', 
                        borderRadius: 2, 
                        overflow: 'hidden',
                        display: 'inline-block'
                      }}>
                        <Avatar
                          variant="rounded"
                          src={selectedPlate.cropped_plate_image_path || selectedPlate.original_image_path}
                          sx={{ 
                            width: 300, 
                            height: 180,
                            '& img': { objectFit: 'contain' }
                          }}
                        >
                          <DirectionsCar sx={{ fontSize: 60, color: '#666' }} />
                        </Avatar>
                      </Box>
                    </Box>
                  </Grid>

                  {/* Thông tin chi tiết */}
                  <Grid item xs={12} md={6}>
                    <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                      Thông tin chi tiết
                    </Typography>
                    
                    <Stack spacing={2}>
                      {/* Camera */}
                      <Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                          Camera
                        </Typography>
                        <Typography variant="body1" fontWeight={500}>
                          {selectedPlate.camera_name || `Camera ${selectedPlate.camera_id}` || 'N/A'}
                        </Typography>
                      </Box>

                      {/* Khu vực */}
                      <Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                          Khu vực
                        </Typography>
                        <Typography variant="body1" fontWeight={500}>
                          {selectedPlate.location_name || 'N/A'}
                        </Typography>
                      </Box>

                      {/* Thời gian phát hiện */}
                      <Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                          Thời gian phát hiện
                        </Typography>
                        <Typography variant="body1" fontWeight={500}>
                          {formatDate(selectedPlate.detected_at) || 'N/A'}
                        </Typography>
                      </Box>

                      {/* Độ tin cậy */}
                      <Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                          Độ tin cậy
                        </Typography>
                        <Box display="flex" gap={2} alignItems="center">
                          <Chip 
                            label={`OCR: ${selectedPlate.ocr_confidence ? (selectedPlate.ocr_confidence * 100).toFixed(1) : 0}%`}
                            color="success"
                            size="small"
                          />
                          <Chip 
                            label={`Det: ${selectedPlate.detection_confidence ? (selectedPlate.detection_confidence * 100).toFixed(1) : 0}%`}
                            color="primary"
                            size="small"
                          />
                        </Box>
                      </Box>

                      {/* Trạng thái */}
                      <Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                          Trạng thái
                        </Typography>
                        <Box display="flex" gap={1} flexWrap="wrap">
                          {selectedPlate.is_whitelist_match && (
                            <Chip 
                              label="Whitelist" 
                              color="success" 
                              size="small"
                              icon={<CheckCircle />}
                            />
                          )}
                          {selectedPlate.is_blacklist_match && (
                            <Chip 
                              label="Blacklist" 
                              color="error" 
                              size="small"
                              icon={<Block />}
                            />
                          )}
                          {selectedPlate.is_verified ? (
                            <Chip 
                              label="Đã xác minh" 
                              color="info" 
                              size="small"
                              icon={<CheckCircle />}
                            />
                          ) : (
                            <Chip 
                              label="Chưa xác minh" 
                              color="warning" 
                              size="small"
                            />
                          )}
                        </Box>
                      </Box>
                    </Stack>
                  </Grid>

                  {/* Thông tin bổ sung */}
                  <Grid item xs={12}>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                      Thông tin bổ sung
                    </Typography>
                    
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6}>
                        <Box>
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                            ID phát hiện
                          </Typography>
                          <Typography variant="body2" fontFamily="monospace">
                            {selectedPlate.detection_uuid || 'N/A'}
                          </Typography>
                        </Box>
                      </Grid>
                      
                      <Grid item xs={12} sm={6}>
                        <Box>
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                            Loại nguồn
                          </Typography>
                          <Typography variant="body2">
                            {selectedPlate.source_type || 'Camera'}
                          </Typography>
                        </Box>
                      </Grid>

                      {selectedPlate.video_filename && (
                        <Grid item xs={12} sm={6}>
                          <Box>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                              Tên video
                            </Typography>
                            <Typography variant="body2">
                              {selectedPlate.video_filename}
                            </Typography>
                          </Box>
                        </Grid>
                      )}

                      {selectedPlate.detected_vehicle_type && (
                        <Grid item xs={12} sm={6}>
                          <Box>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                              Loại xe
                            </Typography>
                            <Typography variant="body2">
                              {selectedPlate.detected_vehicle_type}
                            </Typography>
                          </Box>
                        </Grid>
                      )}

                      {selectedPlate.detected_vehicle_color && (
                        <Grid item xs={12} sm={6}>
                          <Box>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                              Màu xe
                            </Typography>
                            <Typography variant="body2">
                              {selectedPlate.detected_vehicle_color}
                            </Typography>
                          </Box>
                        </Grid>
                      )}

                      {selectedPlate.vehicle_speed && (
                        <Grid item xs={12} sm={6}>
                          <Box>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                              Tốc độ
                            </Typography>
                            <Typography variant="body2">
                              {selectedPlate.vehicle_speed} km/h
                            </Typography>
                          </Box>
                        </Grid>
                      )}
                    </Grid>
                  </Grid>
                </Grid>
              </Box>
            </Box>
          )}
        </DialogContent>
        
        <DialogActions sx={{ p: 3, gap: 2 }}>
          <Button 
            onClick={() => setShowPlateDetails(false)}
            variant="outlined"
            sx={{ borderRadius: 2, textTransform: 'none' }}
          >
            Đóng
          </Button>
        </DialogActions>
      </Dialog>

      {/* Enhanced Snackbar */}
      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={4000} 
        onClose={() => setSnackbar({ ...snackbar, open: false })} 
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setSnackbar({ ...snackbar, open: false })} 
          severity={snackbar.severity} 
          sx={{ 
            width: '100%',
            borderRadius: 2,
            fontWeight: 600,
            '& .MuiAlert-icon': {
              fontSize: 24
            }
          }}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default SearchPage;