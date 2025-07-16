import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, TextField, Button, Select, MenuItem, InputLabel, FormControl, Tabs, Tab, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Autocomplete, Divider, Snackbar, Alert, Stack, Avatar, Fade, Collapse, useTheme, alpha, Paper, Tooltip, Badge,
  TablePagination
} from '@mui/material';
import { 
  Search as SearchIcon, DirectionsCar, Person, Phone, Email, LocationOn, CheckCircle, Block, History, CameraAlt, Info, Event, Description, Close as CloseIcon, FilterList, Refresh, TuneRounded, ExpandMore, ExpandLess, Visibility, ArrowForward, Timeline, Security, LocationSearching
} from '@mui/icons-material';
import { fetchDataFromAPI } from '../../utils/auth';

function SearchPage() {
  const theme = useTheme();
  
  // Danh sách khu vực lấy từ API
  const [locations, setLocations] = useState([]);

  const cameras = [
    { id: 1, name: 'Camera 01', location: 'Cổng chính', status: 'online' },
    { id: 2, name: 'Camera 02', location: 'Bãi xe A', status: 'online' },
    { id: 3, name: 'Camera 03', location: 'Bãi xe B', status: 'offline' }
  ];

  // Enhanced filter options with better UX
  const statusOptions = [
    { value: '', label: 'Tất cả trạng thái', color: 'default' },
    { value: 'whitelist', label: 'Whitelist', color: 'success' },
    { value: 'blacklist', label: 'Blacklist', color: 'error' }
  ];

  const validStatusOptions = [
    { value: '', label: 'Tất cả', color: 'default' },
    { value: 'valid', label: 'Còn hiệu lực', color: 'success' },
    { value: 'expired', label: 'Hết hạn', color: 'error' },
    { value: 'future', label: 'Chưa có hiệu lực', color: 'warning' },
    { value: 'permanent', label: 'Vĩnh viễn', color: 'info' }
  ];

  const approvalOptions = [
    { value: '', label: 'Tất cả', color: 'default' },
    { value: 'approved', label: 'Đã duyệt', color: 'success' },
    { value: 'pending', label: 'Chờ duyệt', color: 'warning' },
    { value: 'rejected', label: 'Từ chối', color: 'error' }
  ];

  const violationTypes = [
    { value: '', label: 'Tất cả loại', color: 'default' },
    { value: 'unauthorized', label: 'Không phép', color: 'error' },
    { value: 'security_threat', label: 'Nguy cơ an ninh', color: 'error' },
    { value: 'unpaid_fine', label: 'Chưa nộp phạt', color: 'warning' },
    { value: 'banned', label: 'Cấm', color: 'error' },
    { value: 'suspicious', label: 'Đáng ngờ', color: 'warning' },
    { value: 'other', label: 'Khác', color: 'info' }
  ];

  const severityOptions = [
    { value: '', label: 'Tất cả mức độ', color: 'default' },
    { value: 'low', label: 'Thấp', color: 'info' },
    { value: 'medium', label: 'Trung bình', color: 'warning' },
    { value: 'high', label: 'Cao', color: 'error' },
    { value: 'critical', label: 'Nghiêm trọng', color: 'error' }
  ];

  // Enhanced tab configuration with better icons and descriptions
  const tabList = [
    { 
      label: 'Tổng quan', 
      value: 'all', 
      icon: <SearchIcon />, 
      description: 'Tìm kiếm tất cả',
      color: 'primary'
    },
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
      label: 'Lịch sử', 
      value: 'history', 
      icon: <History />, 
      description: 'Lịch sử ra vào',
      color: 'info'
    },
    { 
      label: 'Chủ xe', 
      value: 'owner', 
      icon: <Person />, 
      description: 'Thông tin chủ xe',
      color: 'secondary'
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
    { 
      label: 'Truy cập', 
      value: 'access', 
      icon: <Security />, 
      description: 'Kiểm soát truy cập',
      color: 'warning'
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
    owner_name: '',
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
  
  const [tab, setTab] = useState('all');
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
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [error, setError] = useState(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [searchHistory, setSearchHistory] = useState([]);

  // State cho phân trang
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

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
        // Có thể log lỗi hoặc hiển thị thông báo nếu cần
      }
    };
    fetchLocations();
  }, []);

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
      fetchDataFromAPI(`/api/camera`, token, { params }),
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
    const searchTerm = filters.plate_number || filters.owner_name || filters.q || 'Tìm kiếm tổng quát';
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
    owner_name: '',
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

  // Enhanced filter rendering based on tab
  const renderFilters = () => {
    const commonFilters = (
      <>
        <Grid item xs={12} md={3}>
          <TextField 
            label="Biển số xe" 
            value={filters.plate_number} 
            onChange={e => handleFilterChange('plate_number', e.target.value)} 
            fullWidth 
            size="small" 
            InputProps={{ 
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} /> 
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                '&:hover fieldset': {
                  borderColor: theme.palette.primary.main,
                },
              }
            }}
          />
        </Grid>
      </>
    );

    if (tab === 'journey') {
      return (
        <>
          {commonFilters}
          <Grid item xs={12} md={3}>
            <TextField 
              label="Ngày lộ trình" 
              type="date" 
              value={filters.journey_date || ''} 
              onChange={e => handleFilterChange('journey_date', e.target.value)} 
              fullWidth 
              size="small" 
              InputLabelProps={{ shrink: true }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Grid>
        </>
      );
    }

    if (tab === 'plate') {
      return (
        <>
          {commonFilters}
          <Grid item xs={12} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Camera</InputLabel>
              <Select 
                value={filters.camera_id} 
                label="Camera" 
                onChange={e => handleFilterChange('camera_id', e.target.value)}
                sx={{ borderRadius: 2 }}
              >
                <MenuItem value="">Tất cả</MenuItem>
                {cameras.map(cam => (
                  <MenuItem key={cam.id} value={cam.id}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <CameraAlt sx={{ fontSize: 16 }} />
                      {cam.name}
                      <Chip 
                        label={cam.status} 
                        size="small" 
                        color={cam.status === 'online' ? 'success' : 'error'}
                        sx={{ ml: 1 }}
                      />
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Khu vực</InputLabel>
              <Select 
                value={filters.location_id} 
                label="Khu vực" 
                onChange={e => handleFilterChange('location_id', e.target.value)}
                sx={{ borderRadius: 2 }}
              >
                <MenuItem value="">Tất cả</MenuItem>
                {locations.map(loc => (
                  <MenuItem key={loc.id} value={loc.id}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <LocationOn sx={{ fontSize: 16 }} />
                      {loc.name}
                      <Chip label={`${loc.camera_count} camera`} size="small" sx={{ ml: 1 }} />
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2}>
            <TextField 
              label="Từ ngày" 
              type="date" 
              value={filters.date_from || ''} 
              onChange={e => handleFilterChange('date_from', e.target.value)} 
              fullWidth 
              size="small" 
              InputLabelProps={{ shrink: true }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Grid>
          <Grid item xs={12} md={2}>
            <TextField 
              label="Đến ngày" 
              type="date" 
              value={filters.date_to || ''} 
              onChange={e => handleFilterChange('date_to', e.target.value)} 
              fullWidth 
              size="small" 
              InputLabelProps={{ shrink: true }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Grid>
        </>
      );
    }
    // Thêm vào hàm renderFilters(), sau case 'access':
if (tab === 'location') {
  return (
    <>
      <Grid item xs={12} md={3}>
        <TextField 
          label="Tên khu vực" 
          value={filters.location_name || ''} 
          onChange={e => handleFilterChange('location_name', e.target.value)} 
          fullWidth 
          size="small" 
          InputProps={{ 
            startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} /> 
          }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
      </Grid>
      <Grid item xs={12} md={3}>
        <TextField 
          label="Mã khu vực" 
          value={filters.location_code || ''} 
          onChange={e => handleFilterChange('location_code', e.target.value)} 
          fullWidth 
          size="small" 
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
      </Grid>
      <Grid item xs={12} md={2}>
        <FormControl fullWidth size="small">
          <InputLabel>Loại khu vực</InputLabel>
          <Select 
            value={filters.zone_type || ''} 
            label="Loại khu vực" 
            onChange={e => handleFilterChange('zone_type', e.target.value)}
            sx={{ borderRadius: 2 }}
          >
            <MenuItem value="">Tất cả</MenuItem>
            <MenuItem value="entry">Cổng vào</MenuItem>
            <MenuItem value="exit">Cổng ra</MenuItem>
            <MenuItem value="parking">Bãi xe</MenuItem>
            <MenuItem value="internal">Nội bộ</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12} md={2}>
        <FormControl fullWidth size="small">
          <InputLabel>Trạng thái</InputLabel>
          <Select 
            value={filters.is_active || ''} 
            label="Trạng thái" 
            onChange={e => handleFilterChange('is_active', e.target.value)}
            sx={{ borderRadius: 2 }}
          >
            <MenuItem value="">Tất cả</MenuItem>
            <MenuItem value="true">
              <Chip label="Hoạt động" color="success" size="small" />
            </MenuItem>
            <MenuItem value="false">
              <Chip label="Tạm dừng" color="default" size="small" />
            </MenuItem>
          </Select>
        </FormControl>
      </Grid>
    </>
  );
}
    if (tab === 'access') {
      return (
        <>
          {commonFilters}
          <Grid item xs={12} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Loại danh sách</InputLabel>
              <Select 
                value={filters.list_type || ''} 
                label="Loại danh sách" 
                onChange={e => handleFilterChange('list_type', e.target.value)}
                sx={{ borderRadius: 2 }}
              >
                {accessListTypes.map(opt => (
                  <MenuItem key={opt.value} value={opt.value}>
                    <Chip label={opt.label} color={opt.color} size="small" />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Khu vực</InputLabel>
              <Select 
                value={filters.location_id} 
                label="Khu vực" 
                onChange={e => handleFilterChange('location_id', e.target.value)}
                sx={{ borderRadius: 2 }}
              >
                <MenuItem value="">Tất cả</MenuItem>
                {locations.map(loc => (
                  <MenuItem key={loc.id} value={loc.id}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <LocationOn sx={{ fontSize: 16 }} />
                      {loc.name}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Trạng thái</InputLabel>
              <Select 
                value={filters.is_active || ''} 
                label="Trạng thái" 
                onChange={e => handleFilterChange('is_active', e.target.value)}
                sx={{ borderRadius: 2 }}
              >
                <MenuItem value="">Tất cả</MenuItem>
                <MenuItem value="true">
                  <Chip label="Hoạt động" color="success" size="small" />
                </MenuItem>
                <MenuItem value="false">
                  <Chip label="Tạm dừng" color="default" size="small" />
                </MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </>
      );
    }

    // Default comprehensive filters
    return (
      <>
        {commonFilters}
        <Grid item xs={12} md={2}>
          <TextField 
            label="Chủ xe" 
            value={filters.owner_name} 
            onChange={e => handleFilterChange('owner_name', e.target.value)} 
            fullWidth 
            size="small" 
            InputProps={{ 
              startAdornment: <Person sx={{ mr: 1, color: 'text.secondary' }} /> 
            }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
        </Grid>
        <Grid item xs={12} md={2}>
          <TextField 
            label="Số điện thoại" 
            value={filters.owner_phone} 
            onChange={e => handleFilterChange('owner_phone', e.target.value)} 
            fullWidth 
            size="small" 
            InputProps={{ 
              startAdornment: <Phone sx={{ mr: 1, color: 'text.secondary' }} /> 
            }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
        </Grid>
        <Grid item xs={12} md={2}>
          <FormControl fullWidth size="small">
            <InputLabel>Khu vực</InputLabel>
            <Select 
              value={filters.location_id} 
              label="Khu vực" 
              onChange={e => handleFilterChange('location_id', e.target.value)}
              sx={{ borderRadius: 2 }}
            >
              <MenuItem value="">Tất cả</MenuItem>
              {locations.map(loc => (
                <MenuItem key={loc.id} value={loc.id}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <LocationOn sx={{ fontSize: 16, color: 'primary.main' }} />
                    {loc.name}
                    <Chip label={loc.zone_type} size="small" sx={{ ml: 1 }} />
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        
        {/* Advanced Filters - Collapsible */}
        <Grid item xs={12}>
          <Button
            variant="text"
            startIcon={showAdvancedFilters ? <ExpandLess /> : <ExpandMore />}
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            sx={{ 
              textTransform: 'none',
              color: 'text.secondary',
              '&:hover': { backgroundColor: alpha(theme.palette.primary.main, 0.04) }
            }}
          >
            Bộ lọc nâng cao
          </Button>
        </Grid>
        
        <Collapse in={showAdvancedFilters} timeout="auto" unmountOnExit>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Trạng thái</InputLabel>
                <Select 
                  value={filters.status} 
                  label="Trạng thái" 
                  onChange={e => handleFilterChange('status', e.target.value)}
                  sx={{ borderRadius: 2 }}
                >
                  {statusOptions.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>
                      <Chip label={opt.label} color={opt.color} size="small" />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Hiệu lực</InputLabel>
                <Select 
                  value={filters.valid_status} 
                  label="Hiệu lực" 
                  onChange={e => handleFilterChange('valid_status', e.target.value)}
                  sx={{ borderRadius: 2 }}
                >
                  {validStatusOptions.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>
                      <Chip label={opt.label} color={opt.color} size="small" />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Phê duyệt</InputLabel>
                <Select 
                  value={filters.approval_status} 
                  label="Phê duyệt" 
                  onChange={e => handleFilterChange('approval_status', e.target.value)}
                  sx={{ borderRadius: 2 }}
                >
                  {approvalOptions.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>
                      <Chip label={opt.label} color={opt.color} size="small" />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Loại vi phạm</InputLabel>
                <Select 
                  value={filters.violation_type} 
                  label="Loại vi phạm" 
                  onChange={e => handleFilterChange('violation_type', e.target.value)}
                  sx={{ borderRadius: 2 }}
                >
                  {violationTypes.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>
                      <Chip label={opt.label} color={opt.color} size="small" />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Mức độ</InputLabel>
                <Select 
                  value={filters.severity} 
                  label="Mức độ" 
                  onChange={e => handleFilterChange('severity', e.target.value)}
                  sx={{ borderRadius: 2 }}
                >
                  {severityOptions.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>
                      <Chip label={opt.label} color={opt.color} size="small" />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField 
                label="Từ ngày" 
                type="date" 
                value={filters.date_from} 
                onChange={e => handleFilterChange('date_from', e.target.value)} 
                fullWidth 
                size="small" 
                InputLabelProps={{ shrink: true }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField 
                label="Đến ngày" 
                type="date" 
                value={filters.date_to} 
                onChange={e => handleFilterChange('date_to', e.target.value)} 
                fullWidth 
                size="small" 
                InputLabelProps={{ shrink: true }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Camera</InputLabel>
                <Select 
                  value={filters.camera_id} 
                  label="Camera" 
                  onChange={e => handleFilterChange('camera_id', e.target.value)}
                  sx={{ borderRadius: 2 }}
                >
                  <MenuItem value="">Tất cả</MenuItem>
                  {cameras.map(cam => (
                    <MenuItem key={cam.id} value={cam.id}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <CameraAlt sx={{ fontSize: 16 }} />
                        {cam.name}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField 
                label="Tìm kiếm toàn văn" 
                value={filters.q} 
                onChange={e => handleFilterChange('q', e.target.value)} 
                fullWidth 
                size="small" 
                placeholder="Nhập từ khóa tìm kiếm..."
                InputProps={{ 
                  startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} /> 
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Grid>
          </Grid>
        </Collapse>
      </>
    );
  };

  // Enhanced statistics cards
  const renderStatsCards = () => {
    const statsData = [
      { 
        label: 'Tổng kết quả', 
        value: stats.total || 0, 
        color: '#1976d2', 
        bgColor: '#e3f2fd',
        icon: <SearchIcon />
      },
      { 
        label: 'Whitelist', 
        value: stats.whitelist || 0, 
        color: '#2e7d32', 
        bgColor: '#e8f5e9',
        icon: <CheckCircle />
      },
      { 
        label: 'Blacklist', 
        value: stats.blacklist || 0, 
        color: '#d32f2f', 
        bgColor: '#ffebee',
        icon: <Block />
      },
      { 
        label: 'Còn hiệu lực', 
        value: stats.valid || 0, 
        color: '#ed6c02', 
        bgColor: '#fff3e0',
        icon: <CheckCircle />
      },
      { 
        label: 'Hết hạn', 
        value: stats.expired || 0, 
        color: '#9c27b0', 
        bgColor: '#f3e5f5',
        icon: <Event />
      },
      { 
        label: 'Camera', 
        value: stats.cameras || 0, 
        color: '#ff9800', 
        bgColor: '#fff3e0',
        icon: <CameraAlt />
      }
    ];

    return (
      <Grid container spacing={2}>
        {statsData.map((stat, index) => (
          <Grid item xs={6} md={2} key={index}>
            <Fade in timeout={300 + index * 100}>
              <Card 
                sx={{ 
                  borderRadius: 3, 
                  bgcolor: stat.bgColor, 
                  boxShadow: 'none',
                  border: `1px solid ${alpha(stat.color, 0.2)}`,
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: `0 8px 25px ${alpha(stat.color, 0.15)}`,
                    border: `1px solid ${alpha(stat.color, 0.3)}`
                  }
                }}
              >
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Box display="flex" alignItems="center" gap={1} mb={1}>
                    <Avatar sx={{ bgcolor: stat.color, width: 32, height: 32 }}>
                      {React.cloneElement(stat.icon, { sx: { fontSize: 18, color: 'white' } })}
                    </Avatar>
                    <Typography variant="body2" color="text.secondary" fontWeight={500}>
                      {stat.label}
                    </Typography>
                  </Box>
                  <Typography variant="h4" fontWeight={700} color={stat.color}>
                    {stat.value.toLocaleString()}
                  </Typography>
                </CardContent>
              </Card>
            </Fade>
          </Grid>
        ))}
      </Grid>
    );
  };

useEffect(() => {
  const fetchTabData = async () => {
    setLoading(true);
    setError(null);
    const token = localStorage.getItem('token');
    // THÊM: Tham số phân trang
    let params = { page: currentPage, limit: itemsPerPage };
    try {
      let data = [];
      let totalCountFromAPI = 0;
      let totalPagesFromAPI = 1;
      
      switch (tab) {
        case 'whitelist':
          data = await fetchDataFromAPI(`/api/whitelist`, token, { params });
          setResults(data.data || []);
          totalCountFromAPI = data.pagination?.total || data.total || 0; // Sửa: lấy từ pagination.total nếu có
          totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
          break;
        case 'blacklist':
          data = await fetchDataFromAPI(`/api/blacklist`, token, { params });
          setResults(data.data || []);
          totalCountFromAPI = data.pagination?.total || data.total || 0; // Sửa: lấy từ pagination.total nếu có
          totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
          break;
        case 'camera':
          data = await fetchDataFromAPI(`/api/camera`, token, { params });
          setResults(data.data || []);
          totalCountFromAPI = data.total || data.pagination?.total || 0;
          totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
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
          data = await fetchDataFromAPI(`/api/plates`, token, { params });
          setResults(data.data || []);
          totalCountFromAPI = data.total || data.pagination?.total || 0;
          totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
          break;
        case 'access':
          data = await fetchDataFromAPI(`/api/access-control`, token, { params });
          setResults(data || []);
          totalCountFromAPI = data.total || data.pagination?.total || 0;
          totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
          break;
        default:
          setResults([]);
          totalCountFromAPI = 0;
          totalPagesFromAPI = 1;
      }
      setTotalCount(totalCountFromAPI);
      setTotalItems(totalCountFromAPI);
      setTotalPages(totalPagesFromAPI);
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
  if (tab !== 'all') fetchTabData();
}, [tab, currentPage, itemsPerPage]);

useEffect(() => {
  if (tab === 'all') return;
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
          totalCountFromAPI = data.pagination?.total || data.total || 0; // Sửa: lấy từ pagination.total nếu có
          totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
          break;
        case 'blacklist':
          data = await fetchDataFromAPI(`/api/blacklist`, token, { params });
          setResults(data.data || []);
          totalCountFromAPI = data.pagination?.total || data.total || 0; // Sửa: lấy từ pagination.total nếu có
          totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
          break;
        case 'camera':
          data = await fetchDataFromAPI(`/api/camera`, token, { params });
          setResults(data.data || []);
          totalCountFromAPI = data.total || data.pagination?.total || 0;
          totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
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
          data = await fetchDataFromAPI(`/api/plates`, token, { params });
          setResults(data.data || []);
          totalCountFromAPI = data.total || data.pagination?.total || 0;
          totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
          break;
        case 'access':
          data = await fetchDataFromAPI(`/api/access-control`, token, { params });
          setResults(data || []);
          totalCountFromAPI = data.total || data.pagination?.total || 0;
          totalPagesFromAPI = data.pagination?.total_pages || Math.ceil(totalCountFromAPI / itemsPerPage);
          break;
        default:
          setResults([]);
          totalCountFromAPI = 0;
          totalPagesFromAPI = 1;
      }
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
      case 'access':
        return 'linear-gradient(90deg, #ef6c00 0%, #ff9800 100%)';
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

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8f9fa', py: 3 }}>
      {/* Enhanced Header */}
      <Box sx={{ px: 3, mb: 3 }}>
        <Card 
          sx={{ 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
            color: 'white', 
            borderRadius: 4, 
            boxShadow: '0 10px 30px rgba(102, 126, 234, 0.3)',
            overflow: 'hidden',
            position: 'relative'
          }}
        >
          <Box 
            sx={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '200px',
              height: '200px',
              background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)',
              borderRadius: '50%',
              transform: 'translate(50%, -50%)'
            }}
          />
          <CardContent sx={{ p: 4, position: 'relative' }}>
            <Box display="flex" alignItems="center" gap={3}>
              <Avatar 
                sx={{ 
                  bgcolor: 'rgba(255, 255, 255, 0.2)', 
                  color: 'white', 
                  width: 80, 
                  height: 80,
                  backdropFilter: 'blur(10px)'
                }}
              >
                <SearchIcon sx={{ fontSize: 40 }} />
              </Avatar>
              <Box flex={1}>
                <Typography variant="h3" fontWeight={700} sx={{ mb: 1 }}>
                  Hệ thống tra cứu thông minh
                </Typography>
                <Typography variant="h6" sx={{ opacity: 0.9, mb: 2 }}>
                  Tìm kiếm và quản lý thông tin phương tiện, biển số, lịch sử ra vào một cách toàn diện
                </Typography>
                <Box display="flex" gap={2} flexWrap="wrap">
                  <Chip 
                    label="Tìm kiếm thông minh" 
                    sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 600 }}
                  />
                  <Chip 
                    label="Báo cáo chi tiết" 
                    sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 600 }}
                  />
                  <Chip 
                    label="Theo dõi realtime" 
                    sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 600 }}
                  />
                </Box>
              </Box>
              {searchHistory.length > 0 && (
                <Box>
                  <Typography variant="body2" sx={{ opacity: 0.8, mb: 1 }}>
                    Tìm kiếm gần đây
                  </Typography>
                  {searchHistory.slice(0, 3).map((search, index) => (
                    <Box key={index} display="flex" alignItems="center" gap={1} mb={0.5}>
                      <History sx={{ fontSize: 14, opacity: 0.7 }} />
                      <Typography variant="caption" sx={{ opacity: 0.9 }}>
                        {search.term} ({search.results} kết quả)
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Enhanced Filter Section */}
      <Box sx={{ px: 3, mb: 3 }}>
        <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
          <CardContent sx={{ p: 3 }}>
            <Box display="flex" alignItems="center" gap={2} mb={3}>
              <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                <TuneRounded sx={{ fontSize: 18 }} />
              </Avatar>
              <Typography variant="h6" fontWeight={600}>
                Bộ lọc tìm kiếm
              </Typography>
              <Chip 
                label={`Tab: ${tabList.find(t => t.value === tab)?.label}`}
                color="primary"
                size="small"
                sx={{ ml: 'auto' }}
              />
            </Box>
            
            <Grid container spacing={2}>
              {renderFilters()}
              
              {/* Action Buttons */}
              <Grid item xs={12} display="flex" alignItems="center" gap={2} mt={2}>
                <Button 
                  variant="contained" 
                  color="primary" 
                  startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}
                  onClick={handleSearch} 
                  sx={{ 
                    borderRadius: 3, 
                    px: 4, 
                    py: 1.5,
                    fontWeight: 600,
                    textTransform: 'none',
                    minWidth: 140,
                    boxShadow: '0 4px 15px rgba(25, 118, 210, 0.3)',
                    '&:hover': {
                      boxShadow: '0 6px 20px rgba(25, 118, 210, 0.4)',
                      transform: 'translateY(-1px)'
                    }
                  }} 
                  disabled={loading}
                >
                  {loading ? 'Đang tìm...' : 'Tìm kiếm'}
                </Button>
                
                <Button 
                  variant="outlined" 
                  color="secondary" 
                  startIcon={<Refresh />}
                  onClick={handleClearFilters} 
                  sx={{ 
                    borderRadius: 3, 
                    px: 3, 
                    py: 1.5,
                    fontWeight: 600,
                    textTransform: 'none',
                    borderWidth: 2,
                    '&:hover': {
                      borderWidth: 2,
                      transform: 'translateY(-1px)'
                    }
                  }} 
                  disabled={loading}
                >
                  Làm mới
                </Button>

                {Object.values(filters).some(value => value !== '') && (
                  <Chip 
                    label="Đang áp dụng bộ lọc"
                    color="warning"
                    onDelete={handleClearFilters}
                    sx={{ ml: 2 }}
                  />
                )}
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Box>

      {/* Enhanced Statistics */}
      <Box sx={{ px: 3, mb: 3 }}>
        {renderStatsCards()}
      </Box>

      {/* Enhanced Tabs */}
      <Box sx={{ px: 3, mb: 3 }}>
        <Card sx={{ borderRadius: 3, boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
            <Tabs 
              value={tab} 
              onChange={handleTabChange} 
              variant="scrollable" 
              scrollButtons="auto" 
              allowScrollButtonsMobile
              sx={{
                '& .MuiTab-root': {
                  fontWeight: 600,
                  fontSize: 14,
                  minHeight: 64,
                  textTransform: 'none',
                  borderRadius: 2,
                  margin: '8px 4px',
                  transition: 'all 0.2s ease',
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
                    <Box display="flex" alignItems="center" gap={1}>
                      {React.cloneElement(t.icon, { 
                        sx: { 
                          fontSize: 18,
                          color: tab === t.value ? t.color + '.main' : 'text.secondary'
                        } 
                      })}
                      <Box>
                        <Typography variant="body2" fontWeight={600}>
                          {t.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {t.description}
                        </Typography>
                      </Box>
                      {stats[t.value.replace('all', 'total')] > 0 && (
                        <Badge 
                          badgeContent={stats[t.value.replace('all', 'total')] || stats.total} 
                          color={t.color}
                          max={999}
                        />
                      )}
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
                        {tab === 'camera' ? (
                          <>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>
                              <Box display="flex" alignItems="center" gap={1}>
                                <CameraAlt />
                                Tên camera
                              </Box>
                            </TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Mã camera</TableCell>
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
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Mã khu vực</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Loại</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Trạng thái</TableCell>
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
                        ) : tab === 'access' ? (
                          <>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>
                              <Box display="flex" alignItems="center" gap={1}>
                                <Security />
                                Biển số
                              </Box>
                            </TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Loại danh sách</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Khu vực</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Người thêm</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Trạng thái</TableCell>
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
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Chủ xe</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Khu vực</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Trạng thái</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Phê duyệt</TableCell>
                            <TableCell sx={{ color: 'white', fontWeight: 700 }}>Thao tác</TableCell>
                          </>
                        )}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {results.length === 0 ? (
                        <TableRow>
                          <TableCell 
                            colSpan={tab === 'camera' || tab === 'location' || tab === 'journey' ? 6 : tab === 'plate' || tab === 'access' ? 7 : 8} 
                            align="center"
                            sx={{ py: 8 }}
                          >
                            <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
                              <Avatar sx={{ bgcolor: 'grey.100', width: 64, height: 64 }}>
                                <SearchIcon sx={{ fontSize: 32, color: 'grey.400' }} />
                              </Avatar>
                              <Typography variant="h6" color="text.secondary">
                                Không tìm thấy kết quả
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Thử điều chỉnh bộ lọc hoặc từ khóa tìm kiếm
                              </Typography>
                              <Button 
                                variant="outlined" 
                                startIcon={<Refresh />}
                                onClick={handleClearFilters}
                                sx={{ mt: 1 }}
                              >
                                Xóa bộ lọc
                              </Button>
                            </Box>
                          </TableCell>
                        </TableRow>
                      ) : (
                        results.map((item, index) => {
                          const avatarStyle = getAvatarColor();
                          return (
                            <Fade in key={item.id || index} timeout={200 + index * 50}>
                              <TableRow 
                                hover 
                                sx={{ 
                                  '&:hover': { 
                                    backgroundColor: alpha(theme.palette.primary.main, 0.04),
                                    cursor: 'pointer'
                                  },
                                  transition: 'all 0.2s ease'
                                }}
                                onClick={() => handleOpenDetail(item)}
                              >
                                {/* STT Cell */}
                                <TableCell /* STT Cell */ sx={{ /* remove color and fontWeight, use default */ }}>
                                  {((currentPage - 1) * itemsPerPage) + index + 1}
                                </TableCell>

                                {/* Dynamic table rows based on tab */}
                                {tab === 'camera' ? (
                                  <>
                                    <TableCell>
                                      <Box display="flex" alignItems="center" gap={2}>
                                        <Avatar sx={{ bgcolor: 'warning.light', width: 40, height: 40 }}>
                                          <CameraAlt />
                                        </Avatar>
                                        <Typography variant="body2" fontWeight={600}>
                                          {item.name}
                                        </Typography>
                                      </Box>
                                    </TableCell>
                                    <TableCell>
                                      <Chip 
                                        label={item.camera_key || item.camera_id} 
                                        variant="outlined" 
                                        size="small"
                                      />
                                    </TableCell>
                                    <TableCell>{item.location_name}</TableCell>
                                    <TableCell>
                                      <Chip 
                                        label={item.is_active ? 'Hoạt động' : 'Tạm dừng'} 
                                        color={item.is_active ? 'success' : 'default'} 
                                        size="small"
                                        sx={{ fontWeight: 600 }}
                                      />
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
                                      <Chip 
                                        label={item.code} 
                                        variant="outlined" 
                                        size="small"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Chip 
                                        label={item.zone_type} 
                                        color="info" 
                                        size="small"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Chip 
                                        label={item.is_active ? 'Hoạt động' : 'Tạm dừng'} 
                                        color={item.is_active ? 'success' : 'default'} 
                                        size="small"
                                        sx={{ fontWeight: 600 }}
                                      />
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
                                ) : tab === 'journey' ? (
                                  <>
                                    <TableCell>
                                      <Typography variant="body1" fontWeight={600} color="primary.main">
                                        {item.plate_number}
                                      </Typography>
                                    </TableCell>
                                    <TableCell>
                                      <Typography variant="body2">
                                        {item.journey_date || item.date}
                                      </Typography>
                                    </TableCell>
                                    <TableCell>
                                      <Typography variant="body2">
                                        {item.route || item.journey_route || 'N/A'}
                                      </Typography>
                                    </TableCell>
                                    <TableCell>
                                      <Chip 
                                        label={item.vehicle_type || 'Không xác định'} 
                                        color="info" 
                                        size="small"
                                      />
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
                                        {item.detected_at || item.timestamp || 'N/A'}
                                      </Typography>
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
                                ) : tab === 'access' ? (
                                  <>
                                    <TableCell>
                                      <Typography variant="body1" fontWeight={600} color="primary.main">
                                        {item.plate_number}
                                      </Typography>
                                    </TableCell>
                                    <TableCell>
                                      <Chip 
                                        label={item.list_type === 'whitelist' ? 'Whitelist' : 'Blacklist'} 
                                        color={item.list_type === 'whitelist' ? 'success' : 'error'} 
                                        size="small"
                                        sx={{ fontWeight: 600 }}
                                      />
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
                                      <Box display="flex" alignItems="center" gap={1}>
                                        <Person sx={{ fontSize: 16, color: 'secondary.main' }} />
                                        <Typography variant="body2">
                                          {item.added_by || item.created_by || 'N/A'}
                                        </Typography>
                                      </Box>
                                    </TableCell>
                                    <TableCell>
                                      <Chip 
                                        label={item.is_active ? 'Hoạt động' : 'Tạm dừng'} 
                                        color={item.is_active ? 'success' : 'default'} 
                                        size="small"
                                        sx={{ fontWeight: 600 }}
                                      />
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
                                ) : (
                                  // Default table row for whitelist/blacklist and general search
                                  <>
                                    <TableCell /* Biển số Cell */ sx={{ color: 'black', fontSize: 14 }}>
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
                                      <Box>
                                        <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                                          <Person sx={{ fontSize: 16, color: 'primary.main' }} />
                                          <Typography variant="body2" fontWeight={600}>
                                            {item.owner_name || 'Chưa có thông tin'}
                                          </Typography>
                                        </Box>
                                        <Box display="flex" alignItems="center" gap={1}>
                                          <Phone sx={{ fontSize: 14, color: 'text.secondary' }} />
                                          <Typography variant="caption" color="text.secondary">
                                            {item.owner_phone || 'N/A'}
                                          </Typography>
                                        </Box>
                                      </Box>
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
                                      {item.current_status && (
                                        <Chip 
                                          label={
                                            item.current_status === 'valid' ? 'Còn hiệu lực' :
                                            item.current_status === 'expired' ? 'Hết hạn' :
                                            item.current_status === 'future' ? 'Chưa hiệu lực' : 'Vĩnh viễn'
                                          }
                                          color={
                                            item.current_status === 'valid' ? 'success' :
                                            item.current_status === 'expired' ? 'error' :
                                            item.current_status === 'future' ? 'warning' : 'info'
                                          }
                                          size="small"
                                          sx={{ fontWeight: 600 }}
                                        />
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      <Chip 
                                        label={item.approval_status === 'approved' ? 'Đã duyệt' : item.approval_status === 'pending' ? 'Chờ duyệt' : 'Từ chối'}
                                        color={item.approval_status === 'approved' ? 'success' : item.approval_status === 'pending' ? 'warning' : 'error'}
                                        size="small"
                                        sx={{ fontWeight: 600, fontSize: 13 }}
                                      />
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
                                )}
                              </TableRow>
                            </Fade>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>

               <Box sx={{ 
  borderTop: '1px solid rgba(0, 0, 0, 0.1)',
  background: 'rgba(0, 0, 0, 0.02)'
}}>
  <Typography variant="body2" color="textSecondary" sx={{ fontWeight: 500, px: 3, pt: 2 }}>
    {totalItems === 0
      ? 'Hiển thị 0/0 bản ghi'
      : `Hiển thị ${((currentPage - 1) * itemsPerPage) + 1} - ${Math.min(currentPage * itemsPerPage, totalItems)} / ${totalItems} bản ghi`
    }
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
              </>
            )}
          </CardContent>
        </Card>
      </Box>

      {/* Enhanced Detail Modal */}
      <Dialog 
        open={openDetail} 
        onClose={handleCloseDetail} 
        maxWidth="lg" 
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)'
          }
        }}
      >
        <DialogTitle 
          sx={{ 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
            color: 'white', 
            display: 'flex', 
            alignItems: 'center', 
            gap: 2,
            py: 3
          }}
        >
          <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 48, height: 48 }}>
            <Info sx={{ fontSize: 24 }} />
          </Avatar>
          <Box flex={1}>
            <Typography variant="h5" fontWeight={700}>
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
              bgcolor: 'rgba(255,255,255,0.1)',
              '&:hover': {
                bgcolor: 'rgba(255,255,255,0.2)'
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
              <Box sx={{ p: 3, bgcolor: alpha(theme.palette.primary.main, 0.02) }}>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={4}>
                    <Box display="flex" flexDirection="column" alignItems="center">
                      <Avatar 
                        variant="rounded" 
                        src={selectedItem.detected_plate_image || selectedItem.plate_image || ''} 
                        sx={{ 
                          width: 200, 
                          height: 120, 
                          bgcolor: alpha(theme.palette.primary.main, 0.1),
                          border: `3px solid ${alpha(theme.palette.primary.main, 0.2)}`,
                          mb: 2
                        }}
                      >
                        <DirectionsCar sx={{ fontSize: 60, color: 'primary.main' }} />
                      </Avatar>
                      
                      <Typography variant="h4" fontWeight={700} color="primary.main" mb={1}>
                        {selectedItem.plate_number}
                      </Typography>
                      
                      <Stack direction="row" spacing={1} mb={2} flexWrap="wrap" justifyContent="center">
                        {selectedItem.status === 'whitelist' && (
                          <Chip label="Whitelist" color="success" sx={{ fontWeight: 600 }} />
                        )}
                        {selectedItem.status === 'blacklist' && (
                          <Chip label="Blacklist" color="error" sx={{ fontWeight: 600 }} />
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
                      <Grid item xs={12}>
                        <Paper sx={{ p: 2, borderRadius: 2, bgcolor: 'background.paper' }}>
                          <Typography variant="h6" fontWeight={600} mb={2} color="primary.main">
                            <DirectionsCar sx={{ mr: 1, verticalAlign: 'middle' }} />
                            Thông tin phương tiện
                          </Typography>
                          <Grid container spacing={2}>
                            <Grid item xs={6}>
                              <Typography variant="body2" color="text.secondary">Biển số</Typography>
                              <Typography variant="h6" fontWeight={600}>{selectedItem.plate_number}</Typography>
                            </Grid>
                            <Grid item xs={6}>
                              <Typography variant="body2" color="text.secondary">Loại xe</Typography>
                              <Typography variant="body1">
                                {selectedItem.vehicle_type || selectedItem.make + ' ' + selectedItem.model || 'N/A'}
                              </Typography>
                            </Grid>
                            <Grid item xs={6}>
                              <Typography variant="body2" color="text.secondary">Khu vực</Typography>
                              <Box display="flex" alignItems="center" gap={1}>
                                <LocationOn sx={{ fontSize: 16, color: 'primary.main' }} />
                                <Typography variant="body1">{selectedItem.location_name || 'N/A'}</Typography>
                              </Box>
                            </Grid>
                            <Grid item xs={6}>
                              <Typography variant="body2" color="text.secondary">Camera phát hiện</Typography>
                              <Box display="flex" alignItems="center" gap={1}>
                                <CameraAlt sx={{ fontSize: 16, color: 'warning.main' }} />
                                <Typography variant="body1">{selectedItem.camera_name || 'N/A'}</Typography>
                              </Box>
                            </Grid>
                          </Grid>
                        </Paper>
                      </Grid>

                      {/* Owner Information */}
                      {(selectedItem.owner_name || selectedItem.owner_phone || selectedItem.contact_email) && (
                        <Grid item xs={12}>
                          <Paper sx={{ p: 2, borderRadius: 2, bgcolor: 'background.paper' }}>
                            <Typography variant="h6" fontWeight={600} mb={2} color="secondary.main">
                              <Person sx={{ mr: 1, verticalAlign: 'middle' }} />
                              Thông tin chủ xe
                            </Typography>
                            <Grid container spacing={2}>
                              <Grid item xs={12} md={4}>
                                <Box display="flex" alignItems="center" gap={2} mb={1}>
                                  <Avatar sx={{ bgcolor: 'secondary.light', width: 32, height: 32 }}>
                                    <Person sx={{ fontSize: 18 }} />
                                  </Avatar>
                                  <Box>
                                    <Typography variant="body2" color="text.secondary">Họ tên</Typography>
                                    <Typography variant="body1" fontWeight={500}>
                                      {selectedItem.owner_name || 'Chưa có thông tin'}
                                    </Typography>
                                  </Box>
                                </Box>
                              </Grid>
                              <Grid item xs={12} md={4}>
                                <Box display="flex" alignItems="center" gap={2} mb={1}>
                                  <Avatar sx={{ bgcolor: 'success.light', width: 32, height: 32 }}>
                                    <Phone sx={{ fontSize: 18 }} />
                                  </Avatar>
                                  <Box>
                                    <Typography variant="body2" color="text.secondary">Số điện thoại</Typography>
                                    <Typography variant="body1" fontWeight={500}>
                                      {selectedItem.owner_phone || 'N/A'}
                                    </Typography>
                                  </Box>
                                </Box>
                              </Grid>
                              <Grid item xs={12} md={4}>
                                <Box display="flex" alignItems="center" gap={2} mb={1}>
                                  <Avatar sx={{ bgcolor: 'warning.light', width: 32, height: 32 }}>
                                    <Email sx={{ fontSize: 18 }} />
                                  </Avatar>
                                  <Box>
                                    <Typography variant="body2" color="text.secondary">Email</Typography>
                                    <Typography variant="body1" fontWeight={500}>
                                      {selectedItem.contact_email || 'N/A'}
                                    </Typography>
                                  </Box>
                                </Box>
                              </Grid>
                            </Grid>
                          </Paper>
                        </Grid>
                      )}

                      {/* Additional Information */}
                      <Grid item xs={12}>
                        <Paper sx={{ p: 2, borderRadius: 2, bgcolor: 'background.paper' }}>
                          <Typography variant="h6" fontWeight={600} mb={2} color="info.main">
                            <Info sx={{ mr: 1, verticalAlign: 'middle' }} />
                            Thông tin bổ sung
                          </Typography>
                          <Grid container spacing={2}>
                            <Grid item xs={12} md={6}>
                              <Box display="flex" alignItems="center" gap={2} mb={2}>
                                <Description sx={{ color: 'text.secondary' }} />
                                <Box>
                                  <Typography variant="body2" color="text.secondary">Loại vi phạm</Typography>
                                  <Typography variant="body1">
                                    {selectedItem.violation_type ? 
                                      violationTypes.find(v => v.value === selectedItem.violation_type)?.label || selectedItem.violation_type
                                      : 'Không có vi phạm'
                                    }
                                  </Typography>
                                </Box>
                              </Box>
                            </Grid>
                            <Grid item xs={12} md={6}>
                              <Box display="flex" alignItems="center" gap={2} mb={2}>
                                <Event sx={{ color: 'text.secondary' }} />
                                <Box>
                                  <Typography variant="body2" color="text.secondary">Lịch sử phát hiện</Typography>
                                  <Typography variant="body1">
                                    {selectedItem.history_count || 0} lần
                                  </Typography>
                                </Box>
                              </Box>
                            </Grid>
                            {selectedItem.valid_from && (
                              <Grid item xs={12}>
                                <Box display="flex" alignItems="center" gap={2} mb={1}>
                                  <Event sx={{ color: 'text.secondary' }} />
                                  <Box>
                                    <Typography variant="body2" color="text.secondary">Thời gian hiệu lực</Typography>
                                    <Typography variant="body1">
                                      {selectedItem.valid_from} - {selectedItem.valid_to || 'Vĩnh viễn'}
                                    </Typography>
                                  </Box>
                                </Box>
                              </Grid>
                            )}
                            {selectedItem.created_at && (
                              <Grid item xs={12}>
                                <Box display="flex" alignItems="center" gap={2} mb={1}>
                                  <Event sx={{ color: 'text.secondary' }} />
                                  <Box>
                                    <Typography variant="body2" color="text.secondary">Ngày tạo</Typography>
                                    <Typography variant="body1">{selectedItem.created_at}</Typography>
                                  </Box>
                                </Box>
                              </Grid>
                            )}
                            {selectedItem.description && (
                              <Grid item xs={12}>
                                <Divider sx={{ my: 2 }} />
                                <Typography variant="body2" color="text.secondary" mb={1}>Mô tả chi tiết</Typography>
                                <Typography variant="body1">{selectedItem.description}</Typography>
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
        
        <DialogActions sx={{ p: 3, gap: 2 }}>
          <Button 
            onClick={handleCloseDetail} 
            variant="outlined" 
            startIcon={<CloseIcon />} 
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
            startIcon={<Info />}
            sx={{ 
              borderRadius: 2,
              px: 3,
              py: 1.5,
              textTransform: 'none',
              fontWeight: 600
            }}
          >
            Xem lịch sử
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