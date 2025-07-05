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
  Avatar
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  Warning as WarningIcon,
  Cancel as CancelIcon,
  Event as EventIcon,
  LocationOn as LocationIcon,
  DirectionsCar as CarIcon,
  Person as PersonIcon,
  Phone as PhoneIcon,
  Shield as ShieldIcon,
  Description as DescriptionIcon,
  Schedule as ScheduleIcon,
  Error as ErrorIcon,
  Block as BlockIcon,
  Home as HomeIcon,
  ExpandMore as ExpandMoreIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import {
  FaShieldAlt,
  FaExclamationTriangle,
  FaBan,
  FaClock,
  FaPlus,
  FaSave,
  FaTimes,
  FaEdit,
  FaTrash,
  FaEye
} from 'react-icons/fa';
import { BiRefresh, BiSolidTrashAlt } from 'react-icons/bi';

// Import các hàm từ auth.js
import {
  fetchDataFromAPI,
  postData,
  editData,
  deleteData,
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

const BlackList = () => {
  // States
  const [blacklist, setBlacklist] = useState([]);
  const [loading, setLoading] = useState(false);
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
    violation_type: '',
    severity: '',
    is_active: '',
    valid_status: ''
  });

  // Form data
  const [formData, setFormData] = useState({
    location_id: '',
    plate_number: '',
    vehicle_id: '',
    violation_type: 'unauthorized',
    reason: '',
    severity: 'medium',
    owner_name: '',
    owner_phone: '',
    valid_from: '',
    valid_to: '',
    description: ''
  });

  // Error handling
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteDialog, setDeleteDialog] = useState({ open: false, itemId: null, plateName: '' });

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
    loadBlacklist();
    loadLocations();
    loadStatistics();
  }, [currentPage, itemsPerPage, filters]);

  const loadBlacklist = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const params = {
        page: currentPage,
        limit: itemsPerPage,
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, value]) => value !== '')
        )
      };

      const response = await fetchDataFromAPI('blacklist', token, { params });

      if (response.success) {
        setBlacklist(response.data || []);
        setTotalPages(response.pagination?.total_pages || 1);
        setTotalItems(response.pagination?.total || 0);
      } else {
        setError(response.message || 'Lỗi khi tải danh sách blacklist');
      }
    } catch (error) {
      console.error('Error loading blacklist:', error);
      const errorMessage = handleErrorResponse(error);
      setError(errorMessage);
      
      if (isUnauthorizedError(error)) {
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
    } finally {
      setLoading(false);
    }
  };

  const loadLocations = async () => {
    try {
      const token = getToken();
      const response = await fetchDataFromAPI('locations', token);
      
      if (response.success) {
        setLocations(response.data || []);
      }
    } catch (error) {
      console.error('Error loading locations:', error);
    }
  };

  const loadStatistics = async () => {
    try {
      const token = getToken();
      const response = await fetchDataFromAPI('blacklist/statistics', token);
      
      if (response.success) {
        setStatistics(response.data || {});
      }
    } catch (error) {
      console.error('Error loading statistics:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = getToken();
      let response;

      if (selectedItem) {
        response = await editData(`blacklist/${selectedItem.id}`, formData, token);
        setSuccess('Cập nhật blacklist thành công');
      } else {
        response = await postData('blacklist/create', formData, token);
        setSuccess('Tạo blacklist thành công');
      }

      if (response.success) {
        setOpenModal(false);
        resetForm();
        loadBlacklist();
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
      const response = await deleteData(`blacklist/${id}`, token);
      
      if (response.success) {
        setSuccess('Xóa blacklist thành công');
        setSelectedItems(prev => prev.filter(itemId => itemId !== id));
        loadBlacklist();
      } else {
        setError(response.message || 'Lỗi khi xóa blacklist');
      }
    } catch (error) {
      console.error('Error deleting blacklist:', error);
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
        // Assuming bulk delete API exists
        const response = await postData('blacklist/bulk-delete', { ids: selectedItems }, token);
        if (response.success) {
          setSuccess(`Xóa thành công ${selectedItems.length} mục!`);
          setSelectedItems([]);
          loadBlacklist();
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
      violation_type: item.violation_type || 'unauthorized',
      reason: item.reason || '',
      severity: item.severity || 'medium',
      owner_name: item.owner_name || '',
      owner_phone: item.owner_phone || '',
      valid_from: item.valid_from || '',
      valid_to: item.valid_to || '',
      description: item.description || ''
    });
    setOpenModal(true);
  };

  const handleView = async (id) => {
    try {
      const token = getToken();
      const response = await fetchDataFromAPI(`blacklist/${id}`, token);
      
      if (response.success) {
        setSelectedItem(response.data);
        setOpenDetailModal(true);
      } else {
        setError(response.message || 'Lỗi khi tải chi tiết blacklist');
      }
    } catch (error) {
      console.error('Error viewing blacklist:', error);
      const errorMessage = handleErrorResponse(error);
      setError(errorMessage);
    }
  };

  const resetForm = () => {
    setFormData({
      location_id: '',
      plate_number: '',
      vehicle_id: '',
      violation_type: 'unauthorized',
      reason: '',
      severity: 'medium',
      owner_name: '',
      owner_phone: '',
      valid_from: '',
      valid_to: '',
      description: ''
    });
    setSelectedItem(null);
  };

  const handleRefresh = () => {
    setFilters({
      location_id: '',
      plate_number: '',
      violation_type: '',
      severity: '',
      is_active: '',
      valid_status: ''
    });
    setCurrentPage(1);
    setSelectedItems([]);
    loadBlacklist();
  };

  const handleSelectItem = (itemId) => {
    setSelectedItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
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
                      onChange={(e) => setFilters({...filters, plate_number: e.target.value})}
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
                        onChange={(e) => setFilters({...filters, location_id: e.target.value})}
                        sx={{ borderRadius: 2 }}
                      >
                        <MenuItem value="">Tất cả khu vực</MenuItem>
                        {locations.map(location => (
                          <MenuItem key={location.id} value={location.id}>
                            {location.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6} md={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Loại vi phạm</InputLabel>
                      <Select
                        value={filters.violation_type}
                        label="Loại vi phạm"
                        onChange={(e) => setFilters({...filters, violation_type: e.target.value})}
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
                        onChange={(e) => setFilters({...filters, severity: e.target.value})}
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

          {/* Table */}
          <Card>
            <CardContent>
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : (
                <>
                  <TableContainer component={Paper}>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Biển số</TableCell>
                          <TableCell>Khu vực</TableCell>
                          <TableCell>Loại vi phạm</TableCell>
                          <TableCell>Mức độ</TableCell>
                          <TableCell>Thời gian hiệu lực</TableCell>
                          <TableCell>Trạng thái</TableCell>
                          <TableCell>Thao tác</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {blacklist.map((item) => (
                          <TableRow key={item.id}>
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
                            <TableCell>
                              <Box sx={{ display: 'flex', gap: 0.5 }}>
                                <Tooltip title="Xem chi tiết">
                                  <IconButton
                                    size="small"
                                    color="info"
                                    onClick={() => handleView(item.id)}
                                  >
                                    <VisibilityIcon />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Chỉnh sửa">
                                  <IconButton
                                    size="small"
                                    color="warning"
                                    onClick={() => handleEdit(item)}
                                  >
                                    <EditIcon />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Xóa">
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => handleDelete(item.id)}
                                  >
                                    <DeleteIcon />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>

                  {/* Pagination */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Hiển thị {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalItems)} của {totalItems} bản ghi
                    </Typography>
                    <Pagination
                      count={totalPages}
                      page={currentPage}
                      onChange={handlePageChange}
                      color="primary"
                    />
                  </Box>
                </>
              )}
            </CardContent>
          </Card>
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
                <FormControl fullWidth required>
                  <InputLabel>Khu vực</InputLabel>
                  <Select
                    value={formData.location_id}
                    label="Khu vực"
                    onChange={(e) => setFormData({...formData, location_id: e.target.value})}
                  >
                    {locations.map(location => (
                      <MenuItem key={location.id} value={location.id}>
                        {location.name}
                      </MenuItem>
                    ))}
                  </Select>
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
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth required>
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
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth required>
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
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Có hiệu lực từ"
                  type="date"
                  InputLabelProps={{ shrink: true }}
                  value={formData.valid_from}
                  onChange={(e) => setFormData({...formData, valid_from: e.target.value})}
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
                />
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
                />
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