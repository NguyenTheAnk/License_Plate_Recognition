import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  FormControlLabel,
  Switch,
  Select,
  MenuItem,
  InputLabel,
  Grid,
  Card,
  CardContent,
  Divider,
  Tooltip,
  Alert,
  Snackbar,
  Skeleton,
  Fade,
  Container,
  InputAdornment,
  Avatar,
  Checkbox,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormGroup
} from '@mui/material';

import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  Search as SearchIcon,
  Security as SecurityIcon,
  People as PeopleIcon,
  ExpandMore as ExpandMoreIcon,
  Save as SaveIcon,
  Close as CloseIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  FolderOpen as FolderOpenIcon,
  CameraAlt as CameraAltIcon,
  Settings as SettingsIcon,
  ListAlt as ListAltIcon,
  BarChart as BarChartIcon,
  Report as ReportIcon,
  DirectionsCar as DirectionsCarIcon,
  LocationOn as LocationOnIcon,
  Notifications as NotificationsIcon,
  VpnKey as VpnKeyIcon
} from '@mui/icons-material';

import { 
  FaUserShield, 
  FaUsers, 
  FaChartLine, 
  FaLayerGroup,
  FaCrown,
  FaUserTie,
  FaUserCheck
} from 'react-icons/fa';

// Import API functions từ auth.js
import { 
  fetchDataFromAPI, 
  postData, 
  editData, 
  deleteData, 
  handleErrorResponse 
} from '../utils/auth';

// Modern Header Component
const RoleHeader = ({ onAdd, onBulkDelete, selectedCount }) => (
  <Paper elevation={0} sx={{ p: 4, mb: 4, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
    <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
      <Box>
        <Typography variant="h3" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <FaUserShield size={40} />
          Quản lý Vai trò
        </Typography>
        <Typography variant="h6" sx={{ opacity: 0.9 }}>
          Quản lý vai trò và quyền hạn trong hệ thống
        </Typography>
      </Box>
      <Box display="flex" gap={2}>
        {selectedCount > 0 && (
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={onBulkDelete}
            sx={{ fontWeight: 'bold', bgcolor: 'rgba(255,255,255,0.15)', color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' } }}
          >
            Xóa các vai trò đã chọn ({selectedCount})
          </Button>
        )}
        <Button
          variant="contained"
          size="large"
          startIcon={<AddIcon />}
          onClick={onAdd}
          sx={{ fontWeight: 'bold', fontSize: '1rem', bgcolor: 'rgba(255,255,255,0.2)', color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' } }}
        >
          Thêm vai trò
        </Button>
      </Box>
    </Box>
  </Paper>
);

const RoleManagement = () => {
  // State management
  const [roles, setRoles] = useState([]);
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [permissionsByModule, setPermissionsByModule] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [currentPage, setCurrentPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalRoles, setTotalRoles] = useState(0);
  const [selectedRole, setSelectedRole] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState('create');
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'success' });
  const [expandedModule, setExpandedModule] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    parent_role_id: '',
    level: 0,
    is_default_role: false,
    is_active: true,
    permissionIds: []
  });

  // Permission hierarchy definitions
  const permissionHierarchy = {
    'roles': {
      'view': [],
      'search': [],
      'create': ['view', 'search'],
      'edit': ['view', 'search'],
      'delete': ['view', 'search', 'edit']
    },
    'users': {
      'view': [],
      'search': [],
      'create': ['view', 'search'],
      'edit': ['view', 'search'],
      'delete': ['view', 'search', 'edit']
    },
    'permissions': {
      'view': [],
      'search': [],
      'create': ['view', 'search'],
      'edit': ['view', 'search'],
      'delete': ['view', 'search', 'edit']
    }
  };

  // Get token from localStorage
  const getToken = () => {
    return localStorage.getItem('token');
  };

  // Fetch permissions từ API
  const fetchPermissions = useCallback(async () => {
    try {
      const token = getToken();
      // Sử dụng endpoint trả về tất cả quyền
      const response = await fetchDataFromAPI('api/roles/permissions/all', token);
      if (response.success) {
        // Nếu API trả về dạng { permissions: { module: [quyền] } }
        let permissionsData = [];
        if (Array.isArray(response.data.permissions)) {
          permissionsData = response.data.permissions;
        } else if (typeof response.data.permissions === 'object') {
          // Nếu trả về dạng group by module
          permissionsData = Object.values(response.data.permissions).flat();
        }
        setPermissions(permissionsData);
        // Group permissions by module
        const grouped = permissionsData.reduce((acc, permission) => {
          const module = permission.module || 'other';
          if (!acc[module]) {
            acc[module] = [];
          }
          acc[module].push(permission);
          return acc;
        }, {});
        setPermissionsByModule(grouped);
      }
    } catch (error) {
      console.error('Error fetching permissions:', error);
    }
  }, []);

  // Fetch roles từ API
  const fetchRoles = useCallback(async () => {
    try {
      setLoading(true);
      const token = getToken();
      
      const params = {
        page: currentPage + 1,
        limit: rowsPerPage,
        search: searchTerm,
        is_active: filterActive === 'all' ? '' : (filterActive === 'active' ? 'true' : 'false'),
        sort_by: sortBy,
        sort_order: sortOrder
      };

      // Loại bỏ params rỗng
      Object.keys(params).forEach(key => {
        if (params[key] === '' || params[key] === null || params[key] === undefined) {
          delete params[key];
        }
      });

      const response = await fetchDataFromAPI('api/roles', token, { params });
      
      if (response.success) {
        setRoles(response.data.roles || []);
        setTotalRoles(response.data.pagination.total || 0);
      } else {
        showNotification(response.message || 'Lỗi khi tải danh sách vai trò', 'error');
      }
    } catch (error) {
      console.error('Error fetching roles:', error);
      showNotification(handleErrorResponse(error), 'error');
    } finally {
      setLoading(false);
    }
  }, [currentPage, rowsPerPage, searchTerm, filterActive, sortBy, sortOrder]);

  // Fetch role details
  const fetchRoleDetails = async (roleId) => {
    try {
      const token = getToken();
      const response = await fetchDataFromAPI(`api/roles/${roleId}`, token);
      
      if (response.success) {
        return response.data.role;
      } else {
        showNotification(response.message || 'Lỗi khi tải chi tiết vai trò', 'error');
        return null;
      }
    } catch (error) {
      console.error('Error fetching role details:', error);
      showNotification(handleErrorResponse(error), 'error');
      return null;
    }
  };

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  // Auto-select dependent permissions
  const getRequiredPermissions = (module, action, selectedPermissions) => {
    const hierarchy = permissionHierarchy[module];
    if (!hierarchy || !hierarchy[action]) return selectedPermissions;

    const requiredActions = hierarchy[action];
    const modulePermissions = permissionsByModule[module] || [];
    
    const newPermissions = [...selectedPermissions];
    
    requiredActions.forEach(requiredAction => {
      const requiredPermission = modulePermissions.find(p => p.action === requiredAction);
      if (requiredPermission && !newPermissions.includes(requiredPermission.id)) {
        newPermissions.push(requiredPermission.id);
      }
    });

    return newPermissions;
  };

  // Handle permission selection
  const handlePermissionChange = (permissionId, checked) => {
    const permission = permissions.find(p => p.id === permissionId);
    if (!permission) return;

    let newPermissions = [...formData.permissionIds];

    if (checked) {
      // Add permission and its dependencies
      if (!newPermissions.includes(permissionId)) {
        newPermissions.push(permissionId);
      }
      
      // Auto-select required permissions
      newPermissions = getRequiredPermissions(permission.module, permission.action, newPermissions);
    } else {
      // Remove permission and check if any other permissions depend on it
      newPermissions = newPermissions.filter(id => id !== permissionId);
      
      // Remove dependent permissions that are no longer valid
      const remainingPermissions = permissions.filter(p => newPermissions.includes(p.id));
      const validPermissions = [];
      
      remainingPermissions.forEach(p => {
        const required = getRequiredPermissions(p.module, p.action, [p.id]);
        const hasAllRequired = required.every(reqId => 
          reqId === p.id || newPermissions.includes(reqId)
        );
        
        if (hasAllRequired) {
          validPermissions.push(p.id);
        }
      });
      
      newPermissions = validPermissions;
    }

    setFormData(prev => ({ ...prev, permissionIds: newPermissions }));
  };

  // Handle module selection
  const handleModuleChange = (module, checked) => {
    const modulePermissions = permissionsByModule[module] || [];
    let newPermissions = [...formData.permissionIds];

    if (checked) {
      // Add all permissions in module
      modulePermissions.forEach(permission => {
        if (!newPermissions.includes(permission.id)) {
          newPermissions.push(permission.id);
        }
      });
    } else {
      // Remove all permissions in module
      const modulePermissionIds = modulePermissions.map(p => p.id);
      newPermissions = newPermissions.filter(id => !modulePermissionIds.includes(id));
    }

    setFormData(prev => ({ ...prev, permissionIds: newPermissions }));
  };

  // Check if module is fully selected
  const isModuleSelected = (module) => {
    const modulePermissions = permissionsByModule[module] || [];
    return modulePermissions.every(permission => 
      formData.permissionIds.includes(permission.id)
    );
  };

  // Check if module is partially selected
  const isModulePartiallySelected = (module) => {
    const modulePermissions = permissionsByModule[module] || [];
    const selectedCount = modulePermissions.filter(permission => 
      formData.permissionIds.includes(permission.id)
    ).length;
    return selectedCount > 0 && selectedCount < modulePermissions.length;
  };

  // Notification
  const showNotification = (message, severity = 'success') => {
    setNotification({ open: true, message, severity });
  };

  const closeNotification = () => {
    setNotification(prev => ({ ...prev, open: false }));
  };

  // Dialog handlers
  const openDialog = async (type, role = null) => {
    setDialogType(type);
    setSelectedRole(role);
    
    if (type === 'create') {
      setFormData({
        name: '',
        description: '',
        parent_role_id: '',
        level: 0,
        is_default_role: false,
        is_active: true,
        permissionIds: []
      });
    } else if (type === 'edit' && role) {
      const detailedRole = await fetchRoleDetails(role.id);
      if (detailedRole) {
        setFormData({
          name: detailedRole.name || '',
          description: detailedRole.description || '',
          parent_role_id: detailedRole.parent_role_id || '',
          level: detailedRole.level || 0,
          is_default_role: Boolean(detailedRole.is_default_role),
          is_active: Boolean(detailedRole.is_active),
          permissionIds: detailedRole.permissions?.map(p => p.id) || []
        });
        setSelectedRole(detailedRole);
      }
    } else if (type === 'view' && role) {
      const detailedRole = await fetchRoleDetails(role.id);
      if (detailedRole) {
        setSelectedRole(detailedRole);
      }
    }
    
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setSelectedRole(null);
  };

  // CRUD operations
  const handleCreate = async () => {
    try {
      setLoading(true);
      const token = getToken();
      
      const requestData = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        parent_role_id: formData.parent_role_id || null,
        level: parseInt(formData.level) || 0,
        is_default_role: formData.is_default_role,
        permissionIds: formData.permissionIds || []
      };

      const response = await postData('api/roles', requestData, token);
      
      if (response.success) {
        showNotification(response.message || 'Tạo vai trò thành công');
        closeDialog();
        fetchRoles();
      } else {
        showNotification(response.message || 'Lỗi khi tạo vai trò', 'error');
      }
    } catch (error) {
      console.error('Error creating role:', error);
      showNotification(handleErrorResponse(error), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    try {
      setLoading(true);
      const token = getToken();
      
      const requestData = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        parent_role_id: formData.parent_role_id || null,
        level: parseInt(formData.level) || 0,
        is_default_role: formData.is_default_role,
        is_active: formData.is_active,
        permissionIds: formData.permissionIds || []
      };

      const response = await editData(`api/roles/${selectedRole.id}`, requestData, token);
      
      if (response.success) {
        showNotification(response.message || 'Cập nhật vai trò thành công');
        closeDialog();
        fetchRoles();
      } else {
        showNotification(response.message || 'Lỗi khi cập nhật vai trò', 'error');
      }
    } catch (error) {
      console.error('Error updating role:', error);
      showNotification(handleErrorResponse(error), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      setLoading(true);
      const token = getToken();
      
      const response = await deleteData(`api/roles/${selectedRole.id}`, token);
      
      if (response.success) {
        showNotification(response.message || 'Xóa vai trò thành công');
        closeDialog();
        fetchRoles();
      } else {
        showNotification(response.message || 'Lỗi khi xóa vai trò', 'error');
      }
    } catch (error) {
      console.error('Error deleting role:', error);
      showNotification(handleErrorResponse(error), 'error');
    } finally {
      setLoading(false);
    }
  };

  // Form handlers
  const handleInputChange = (e) => {
    const { name, value, checked } = e.target;
    let processedValue = value;
    
    if (name === 'level') {
      processedValue = parseInt(value) || 0;
    } else if (name === 'parent_role_id') {
      processedValue = value === '' ? '' : parseInt(value);
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: e.target.type === 'checkbox' ? checked : processedValue
    }));
  };

  // Stats calculation
  const stats = {
    total: roles?.length || 0,
    active: roles?.filter(r => r.is_active)?.length || 0,
    totalUsers: roles?.reduce((sum, role) => sum + (role.users_count || 0), 0) || 0,
    maxLevel: roles?.length > 0 ? Math.max(...roles.map(r => r.level || 0)) : 0
  };

  // Role icon based on level and type
  const getRoleIcon = (role) => {
    if (!role) return <FaUserCheck style={{ color: '#059669' }} />;
    
    if (role.is_default_role) return <FaCrown style={{ color: '#f59e0b' }} />;
    if (role.level === 0) return <FaUserShield style={{ color: '#dc2626' }} />;
    if (role.level === 1) return <FaUserTie style={{ color: '#2563eb' }} />;
    return <FaUserCheck style={{ color: '#059669' }} />;
  };

  const handleExpandModule = (module) => {
    setExpandedModule(prev => prev === module ? null : module);
  };

  // Hàm lấy icon cho module
  const getModuleIcon = (module) => {
    switch (module) {
      case 'users': return <PeopleIcon color="primary" sx={{ mr: 1 }} />;
      case 'roles': return <SecurityIcon color="secondary" sx={{ mr: 1 }} />;
      case 'cameras': return <CameraAltIcon color="action" sx={{ mr: 1 }} />;
      case 'alerts': return <WarningIcon color="error" sx={{ mr: 1 }} />;
      case 'settings': return <SettingsIcon color="info" sx={{ mr: 1 }} />;
      case 'logs': return <ListAltIcon color="warning" sx={{ mr: 1 }} />;
      case 'reports': return <ReportIcon color="success" sx={{ mr: 1 }} />;
      case 'journeys': return <BarChartIcon color="primary" sx={{ mr: 1 }} />;
      case 'vehicles': return <DirectionsCarIcon color="secondary" sx={{ mr: 1 }} />;
      case 'locations': return <LocationOnIcon color="error" sx={{ mr: 1 }} />;
      case 'detections': return <FolderOpenIcon color="info" sx={{ mr: 1 }} />;
      case 'permissions': return <VpnKeyIcon color="success" sx={{ mr: 1 }} />;
      default: return <FolderOpenIcon color="disabled" sx={{ mr: 1 }} />;
    }
  };

  // Custom Pagination
  const renderPagination = () => {
    const totalPages = Math.ceil(totalRoles / rowsPerPage);
    const pages = [];
    const maxDisplay = 5;
    const startPage = Math.max(0, currentPage - 1);
    const endPage = Math.min(totalPages - 1, currentPage + 1);

    // Always show first page
    pages.push(0);
    if (startPage > 1) pages.push('start-ellipsis');
    for (let i = startPage; i <= endPage; i++) {
      if (i !== 0 && i !== totalPages - 1) pages.push(i);
    }
    if (endPage < totalPages - 2) pages.push('end-ellipsis');
    if (totalPages > 1) pages.push(totalPages - 1);

    const from = totalRoles === 0 ? 0 : currentPage * rowsPerPage + 1;
    const to = Math.min((currentPage + 1) * rowsPerPage, totalRoles);

    return (
      <Box sx={{ width: '100%' }}>
        {/* Info tổng số ở trên */}
        <Box display="flex" justifyContent="flex-start" sx={{ mb: 1 }}>
          <Typography variant="body2" color="primary">Hiển thị {from} - {to} / {totalRoles} vai trò</Typography>
        </Box>
        {/* Selector và phân trang ở dưới */}
        <Box display="flex" alignItems="center" justifyContent="flex-end" sx={{ gap: 2, flexWrap: 'wrap' }}>
          {/* Selector số hàng/trang */}
          <Box display="flex" alignItems="center" gap={1}>
            <Typography variant="body2">Hiển thị</Typography>
            <Select
              size="small"
              value={rowsPerPage}
              onChange={e => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setCurrentPage(0);
              }}
              sx={{ minWidth: 70 }}
            >
              {[5, 10, 20, 50, 100].map(opt => (
                <MenuItem key={opt} value={opt}>{opt}</MenuItem>
              ))}
            </Select>
            <Typography variant="body2">hàng</Typography>
          </Box>
          {/* Nút phân trang */}
          <Box display="flex" alignItems="center" gap={1}>
            <Button size="small" onClick={() => setCurrentPage(0)} disabled={currentPage === 0}>{'<<'}</Button>
            <Button size="small" onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))} disabled={currentPage === 0}>{'<'}</Button>
            {pages.map((page, idx) =>
              page === 'start-ellipsis' || page === 'end-ellipsis' ? (
                <Box key={page + idx} sx={{ px: 1, color: 'text.secondary' }}>...</Box>
              ) : (
                <Button
                  key={page}
                  variant={page === currentPage ? 'contained' : 'outlined'}
                  color={page === currentPage ? 'primary' : 'inherit'}
                  size="small"
                  sx={{ minWidth: 36 }}
                  onClick={() => setCurrentPage(page)}
                  disabled={page === currentPage}
                >
                  {page + 1}
                </Button>
              )
            )}
            <Button size="small" onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))} disabled={currentPage === totalPages - 1}>{'>'}</Button>
            <Button size="small" onClick={() => setCurrentPage(totalPages - 1)} disabled={currentPage === totalPages - 1}>{'>>'}</Button>
          </Box>
        </Box>
      </Box>
    );
  };

  // Handler chọn tất cả
  const handleSelectAll = (event) => {
    if (event.target.checked) {
      const allIds = roles.filter(r => !r.is_default_role).map((r) => r.id);
      setSelectedRoles(allIds);
    } else {
      setSelectedRoles([]);
    }
  };

  // Handler chọn từng dòng
  const handleSelectRow = (id) => {
    setSelectedRoles((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  // Handler xóa nhiều
  const handleBulkDelete = async () => {
    if (selectedRoles.length === 0) return;
    if (!window.confirm(`Bạn có chắc muốn xóa ${selectedRoles.length} vai trò?`)) return;
    try {
      const token = getToken();
      for (const id of selectedRoles) {
        await deleteData(`api/roles/${id}`, token);
      }
      showNotification('Đã xóa vai trò thành công!');
      setSelectedRoles([]);
      fetchRoles();
    } catch (error) {
      showNotification('Lỗi khi xóa vai trò', 'error');
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <RoleHeader onAdd={() => openDialog('create')} onBulkDelete={handleBulkDelete} selectedCount={selectedRoles.length} />

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={3}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom variant="h6">
                    Tổng vai trò
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="primary">
                    {stats.total}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'primary.main' }}>
                  <FaLayerGroup />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={3}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom variant="h6">
                    Đang hoạt động
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="success.main">
                    {stats.active}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'success.main' }}>
                  <CheckCircleIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={3}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom variant="h6">
                    Người dùng
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="info.main">
                    {stats.totalUsers}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'info.main' }}>
                  <FaUsers />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={3}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom variant="h6">
                    Cấp độ cao nhất
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="warning.main">
                    {stats.maxLevel}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'warning.main' }}>
                  <FaChartLine />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Search and Filters */}
      <Paper elevation={2} sx={{ p: 3, mb: 4 }}>
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Tìm kiếm vai trò..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          
          <Grid item xs={12} md={2}>
            <FormControl fullWidth>
              <InputLabel>Trạng thái</InputLabel>
              <Select
                value={filterActive}
                label="Trạng thái"
                onChange={(e) => setFilterActive(e.target.value)}
              >
                <MenuItem value="all">Tất cả</MenuItem>
                <MenuItem value="active">Hoạt động</MenuItem>
                <MenuItem value="inactive">Không hoạt động</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>Sắp xếp</InputLabel>
              <Select
                value={`${sortBy}_${sortOrder}`}
                label="Sắp xếp"
                onChange={(e) => {
                  const [field, order] = e.target.value.split('_');
                  setSortBy(field);
                  setSortOrder(order);
                }}
              >
                <MenuItem value="created_at_desc">Mới nhất</MenuItem>
                <MenuItem value="created_at_asc">Cũ nhất</MenuItem>
                <MenuItem value="name_asc">Tên A-Z</MenuItem>
                <MenuItem value="name_desc">Tên Z-A</MenuItem>
                <MenuItem value="level_asc">Level thấp đến cao</MenuItem>
                <MenuItem value="level_desc">Level cao đến thấp</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Roles Table */}
      <Paper elevation={2}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={selectedRoles.length > 0 && selectedRoles.length < roles.filter(r => !r.is_default_role).length}
                    checked={roles.length > 0 && selectedRoles.length === roles.filter(r => !r.is_default_role).length}
                    onChange={handleSelectAll}
                    inputProps={{ 'aria-label': 'select all roles' }}
                  />
                </TableCell>
                <TableCell align="center" sx={{ width: 60 }}>STT</TableCell>
                <TableCell>Vai trò</TableCell>
                <TableCell>Mô tả</TableCell>
                <TableCell align="center">Cấp độ</TableCell>
                <TableCell align="center">Người dùng</TableCell>
                <TableCell align="center">Quyền hạn</TableCell>
                <TableCell align="center">Trạng thái</TableCell>
                <TableCell align="center">Thao tác</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                [...Array(5)].map((_, index) => (
                  <TableRow key={index}>
                    <TableCell><Skeleton variant="text" width="80%" /></TableCell>
                    <TableCell><Skeleton variant="text" width="40%" /></TableCell>
                    <TableCell><Skeleton variant="text" width="80%" /></TableCell>
                    <TableCell><Skeleton variant="text" width="100%" /></TableCell>
                    <TableCell><Skeleton variant="text" width="40%" /></TableCell>
                    <TableCell><Skeleton variant="text" width="40%" /></TableCell>
                    <TableCell><Skeleton variant="text" width="40%" /></TableCell>
                    <TableCell><Skeleton variant="text" width="60%" /></TableCell>
                    <TableCell><Skeleton variant="text" width="80%" /></TableCell>
                  </TableRow>
                ))
              ) : (
                roles.map((role, idx) => (
                  <TableRow key={role.id} hover selected={selectedRoles.includes(role.id)}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectedRoles.includes(role.id)}
                        onChange={() => handleSelectRow(role.id)}
                        disabled={role.is_default_role}
                      />
                    </TableCell>
                    <TableCell align="center">{currentPage * rowsPerPage + idx + 1}</TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={2}>
                        {getRoleIcon(role)}
                        <Box>
                          <Typography variant="subtitle1" fontWeight="medium">
                            {role.name}
                          </Typography>
                          {role.is_default_role && (
                            <Chip label="Mặc định" size="small" color="secondary" />
                          )}
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="textSecondary">
                        {role.description || 'Không có mô tả'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={`Level ${role.level || 0}`}
                        size="small"
                        variant="outlined"
                        color="primary"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        icon={<PeopleIcon />}
                        label={role.users_count || 0}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        icon={<SecurityIcon />}
                        label={role.permissions_count || 0}
                        size="small"
                        variant="outlined"
                        color="info"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={role.is_active ? 'Hoạt động' : 'Tạm dừng'}
                        color={role.is_active ? 'success' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Box display="flex" justifyContent="center" gap={1}>
                        <Tooltip title="Xem chi tiết">
                          <IconButton onClick={() => openDialog('view', role)} size="small">
                            <VisibilityIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Chỉnh sửa">
                          <IconButton onClick={() => openDialog('edit', role)} size="small">
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        {!role.is_default_role && (
                          <Tooltip title="Xóa">
                            <IconButton onClick={() => openDialog('delete', role)} size="small">
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        {/* Custom Pagination */}
        {renderPagination()}
        {/* Nút Thêm vai trò ở dưới bảng */}
        <Box display="flex" justifyContent="flex-end" sx={{ p: 2 }}>
          <Button
            variant="contained"
            size="large"
            startIcon={<AddIcon />}
            onClick={() => openDialog('create')}
            sx={{ fontWeight: 'bold', fontSize: '1rem' }}
          >
            Thêm vai trò
          </Button>
        </Box>
        {/* Bulk delete button */}
        {selectedRoles.length > 0 && (
          <Box display="flex" alignItems="center" gap={2} sx={{ p: 2, pb: 0 }}>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={handleBulkDelete}
              sx={{ fontWeight: 'bold' }}
            >
              Xóa các vai trò đã chọn ({selectedRoles.length})
            </Button>
          </Box>
        )}
      </Paper>

      {/* Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        maxWidth="lg"
        fullWidth
        TransitionComponent={Fade}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {dialogType === 'create' && <><AddIcon /> Tạo vai trò mới</>}
            {dialogType === 'edit' && <><EditIcon /> Chỉnh sửa vai trò</>}
            {dialogType === 'view' && <><VisibilityIcon /> Chi tiết vai trò</>}
            {dialogType === 'delete' && <><DeleteIcon /> Xác nhận xóa</>}
          </Typography>
          <IconButton onClick={closeDialog}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ minHeight: '500px' }}>
          {dialogType === 'delete' ? (
            <Box textAlign="center" py={3}>
              <Avatar sx={{ bgcolor: 'error.main', width: 64, height: 64, mx: 'auto', mb: 2 }}>
                <WarningIcon fontSize="large" />
              </Avatar>
              <Typography variant="h6" gutterBottom>
                Xóa vai trò "{selectedRole?.name}"?
              </Typography>
              <Typography color="textSecondary">
                Hành động này không thể hoàn tác. Tất cả dữ liệu liên quan sẽ bị xóa.
              </Typography>
            </Box>
          ) : dialogType === 'view' ? (
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                  Tên vai trò
                </Typography>
                <Typography variant="h6" gutterBottom fontWeight="medium">
                  {selectedRole?.name}
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                  Cấp độ
                </Typography>
                <Chip
                  label={`Level ${selectedRole?.level || 0}`}
                  size="medium"
                  variant="outlined"
                  color="primary"
                />
              </Grid>

              <Grid item xs={12}>
                <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                  Mô tả
                </Typography>
                <Typography variant="body1" gutterBottom>
                  {selectedRole?.description || 'Không có mô tả'}
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                  Vai trò cha
                </Typography>
                <Typography variant="body1">
                  {selectedRole?.parent_role_name || 'Không có'}
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                  Trạng thái
                </Typography>
                <Chip
                  label={selectedRole?.is_active ? 'Hoạt động' : 'Tạm dừng'}
                  color={selectedRole?.is_active ? 'success' : 'default'}
                  size="medium"
                />
              </Grid>

              <Grid item xs={12}>
                <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                  Quyền hạn ({selectedRole?.permissions?.length || 0})
                </Typography>
                <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                  {selectedRole?.permissions && selectedRole.permissions.length > 0 ? (
                    Object.entries(
                      selectedRole.permissions.reduce((acc, permission) => {
                        const module = permission.module || 'other';
                        if (!acc[module]) acc[module] = [];
                        acc[module].push(permission);
                        return acc;
                      }, {})
                    ).map(([module, modulePermissions]) => (
                      <Card key={module} elevation={3} sx={{ mb: 3, borderRadius: 2, boxShadow: 3, bgcolor: 'background.paper' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'primary.100', borderTopLeftRadius: 8, borderTopRightRadius: 8, p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                          {getModuleIcon(module)}
                          <Typography variant="h6" fontWeight="bold" sx={{ textTransform: 'capitalize', color: 'primary.main' }}>{module}</Typography>
                        </Box>
                        <Box sx={{ p: 2 }}>
                          <Grid container spacing={2}>
                            {modulePermissions.map((permission) => (
                              <Grid item xs={12} sm={6} md={4} key={permission.id}>
                                <Box
                                  sx={{
                                    p: 2,
                                    borderRadius: 2,
                                    bgcolor: 'grey.50',
                                    boxShadow: 1,
                                    mb: 1,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'flex-start',
                                    transition: 'box-shadow 0.2s',
                                    '&:hover': {
                                      boxShadow: 4,
                                      bgcolor: 'primary.50',
                                    },
                                  }}
                                >
                                  <Typography variant="subtitle2" color="primary" fontWeight="bold" sx={{ mb: 0.5 }}>
                                    {permission.action}
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                    {permission.description}
                                  </Typography>
                                </Box>
                              </Grid>
                            ))}
                          </Grid>
                        </Box>
                      </Card>
                    ))
                  ) : (
                    <Typography variant="body2" color="textSecondary" sx={{ fontStyle: 'italic' }}>
                      Chưa có quyền nào được gán
                    </Typography>
                  )}
                </Box>
              </Grid>
            </Grid>
          ) : (
            <Grid container spacing={4}>
              {/* Left Column - Basic Information */}
              <Grid item xs={12} md={5}>
                <Paper elevation={1} sx={{ p: 3, height: 'fit-content' }}>
                  <Typography variant="h6" gutterBottom sx={{ borderBottom: 1, borderColor: 'divider', pb: 1 }}>
                    {dialogType === 'create' ? 'Thông Tin Vai Trò' : 'Thông Tin Vai Trò'}
                  </Typography>

                  <Box sx={{ mt: 3 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Tên Vai Trò
                    </Typography>
                    <TextField
                      fullWidth
                      placeholder="Nhập tên vai trò"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                      variant="outlined"
                      size="small"
                      sx={{ mb: 2 }}
                    />

                    <Typography variant="subtitle2" gutterBottom>
                      Mô Tả
                    </Typography>
                    <TextField
                      fullWidth
                      placeholder="Mô tả về vai trò"
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      multiline
                      rows={4}
                      variant="outlined"
                      size="small"
                      sx={{ mb: 2 }}
                    />

                    {dialogType === 'edit' && (
                      <Box sx={{ mt: 3 }}>
                        <Typography variant="subtitle2" gutterBottom>
                          Cấp độ
                        </Typography>
                        <TextField
                          fullWidth
                          name="level"
                          type="number"
                          value={formData.level}
                          onChange={handleInputChange}
                          inputProps={{ min: 0 }}
                          variant="outlined"
                          size="small"
                          sx={{ mb: 2 }}
                        />

                        <FormControl fullWidth sx={{ mb: 2 }}>
                          <Typography variant="subtitle2" gutterBottom>
                            Vai trò cha
                          </Typography>
                          <Select
                            name="parent_role_id"
                            value={formData.parent_role_id}
                            onChange={handleInputChange}
                            size="small"
                          >
                            <MenuItem value="">Không có vai trò cha</MenuItem>
                            {roles
                              .filter(r => r.id !== selectedRole?.id)
                              .map(role => (
                                <MenuItem key={role.id} value={role.id}>
                                  {role.name}
                                </MenuItem>
                              ))
                            }
                          </Select>
                        </FormControl>

                        <Box sx={{ mt: 2 }}>
                          <FormControlLabel
                            control={
                              <Switch
                                checked={formData.is_default_role}
                                onChange={handleInputChange}
                                name="is_default_role"
                                color="secondary"
                                size="small"
                              />
                            }
                            label="Vai trò mặc định"
                            sx={{ display: 'block', mb: 1 }}
                          />
                          <FormControlLabel
                            control={
                              <Switch
                                checked={formData.is_active}
                                onChange={handleInputChange}
                                name="is_active"
                                color="primary"
                                size="small"
                              />
                            }
                            label="Kích hoạt"
                            sx={{ display: 'block' }}
                          />
                        </Box>
                      </Box>
                    )}

                    <Box sx={{ mt: 4, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                      <Button
                        fullWidth
                        variant="contained"
                        onClick={dialogType === 'create' ? handleCreate : handleUpdate}
                        disabled={!formData.name.trim()}
                        startIcon={<SaveIcon />}
                        sx={{ 
                          py: 1.5,
                          fontSize: '1rem',
                          fontWeight: 'bold'
                        }}
                      >
                        {dialogType === 'create' ? 'THÊM VAI TRÒ' : 'UPDATE ROLE'}
                      </Button>
                    </Box>
                  </Box>
                </Paper>
              </Grid>

              {/* Right Column - Permissions */}
              <Grid item xs={12} md={7}>
                <Paper elevation={1} sx={{ p: 3, height: '600px' }}>
                  <Typography variant="h6" gutterBottom sx={{ borderBottom: 1, borderColor: 'divider', pb: 1 }}>
                    Quyền Người Dùng
                  </Typography>

                  <Box sx={{ 
                    maxHeight: 520, 
                    overflow: 'auto', 
                    mt: 2,
                    p: 1
                  }}>
                    {Object.entries(permissionsByModule).map(([module, modulePermissions]) => {
                      const isSelected = isModuleSelected(module);
                      return (
                        <Accordion
                          key={module}
                          expanded={expandedModule === module}
                          onChange={() => handleExpandModule(module)}
                          sx={{
                            mb: 2,
                            bgcolor: isSelected ? 'primary.50' : 'grey.100',
                            border: '1px solid',
                            borderColor: isSelected ? 'primary.main' : 'divider',
                            borderRadius: 1,
                            boxShadow: 'none',
                          }}
                        >
                          <AccordionSummary
                            expandIcon={<ExpandMoreIcon />}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              cursor: 'pointer',
                              minHeight: 48,
                            }}
                          >
                            <Checkbox
                              checked={isModuleSelected(module)}
                              indeterminate={isModulePartiallySelected(module)}
                              onChange={(e) => handleModuleChange(module, e.target.checked)}
                              size="small"
                              sx={{ p: 0.5 }}
                              onClick={e => e.stopPropagation()}
                            />
                            <Typography 
                              variant="subtitle1" 
                              fontWeight="bold" 
                              sx={{ 
                                textTransform: 'capitalize',
                                color: isSelected ? 'primary.main' : 'text.primary'
                              }}
                            >
                              {module}
                            </Typography>
                          </AccordionSummary>
                          <AccordionDetails sx={{ pl: 3, pt: 0 }}>
                            <Grid container spacing={1}>
                              {modulePermissions.map((permission) => (
                                <Grid item xs={4} key={permission.id}>
                                  <Box
                                    sx={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 1,
                                      p: 0.5,
                                      borderRadius: 1,
                                      '&:hover': { 
                                        bgcolor: 'action.hover',
                                        cursor: 'pointer'
                                      },
                                      bgcolor: formData.permissionIds.includes(permission.id) 
                                        ? 'primary.50' 
                                        : 'transparent'
                                    }}
                                    onClick={() => handlePermissionChange(permission.id, !formData.permissionIds.includes(permission.id))}
                                  >
                                    <Checkbox
                                      checked={formData.permissionIds.includes(permission.id)}
                                      onChange={(e) => handlePermissionChange(permission.id, e.target.checked)}
                                      size="small"
                                      sx={{ p: 0.5 }}
                                    />
                                    <Typography 
                                      variant="body2" 
                                      sx={{ 
                                        fontWeight: formData.permissionIds.includes(permission.id) ? 'medium' : 'normal',
                                        color: formData.permissionIds.includes(permission.id) ? 'primary.main' : 'text.primary',
                                        fontSize: '0.875rem'
                                      }}
                                    >
                                      {permission.action}
                                    </Typography>
                                  </Box>
                                </Grid>
                              ))}
                            </Grid>
                          </AccordionDetails>
                        </Accordion>
                      );
                    })}
                  </Box>
                </Paper>
              </Grid>
            </Grid>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 3 }}>
          <Button onClick={closeDialog} color="inherit" size="large">
            Hủy
          </Button>
          {dialogType === 'delete' && (
            <Button
              onClick={handleDelete}
              color="error"
              variant="contained"
              startIcon={<DeleteIcon />}
              size="large"
            >
              Xóa vai trò
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Snackbar Notification */}
      <Snackbar
        open={notification.open}
        autoHideDuration={4000}
        onClose={closeNotification}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        TransitionComponent={Fade}
      >
        <Alert
          onClose={closeNotification}
          severity={notification.severity}
          variant="filled"
          sx={{ width: '100%' }}
          iconMapping={{
            success: <CheckCircleIcon fontSize="inherit" />,
            error: <ErrorIcon fontSize="inherit" />,
          }}
        >
          {notification.message}
        </Alert>
      </Snackbar>

      {/* Empty State */}
      {!loading && roles.length === 0 && (
        <Paper elevation={2} sx={{ p: 8, textAlign: 'center', mt: 4 }}>
          <Avatar sx={{ bgcolor: 'grey.100', width: 80, height: 80, mx: 'auto', mb: 3 }}>
            <FaUserShield size={40} color="#666" />
          </Avatar>
          <Typography variant="h5" gutterBottom color="textSecondary">
            Chưa có vai trò nào
          </Typography>
          <Typography variant="body1" color="textSecondary" paragraph>
            Bắt đầu bằng cách tạo vai trò đầu tiên cho hệ thống của bạn.
          </Typography>
          <Button
            variant="contained"
            size="large"
            startIcon={<AddIcon />}
            onClick={() => openDialog('create')}
            sx={{ mt: 2 }}
          >
            Tạo vai trò đầu tiên
          </Button>
        </Paper>
      )}
    </Container>
  );
};

export default RoleManagement;