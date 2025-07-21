import React, { useState, useContext, useEffect } from 'react';
import {
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
  Grid,
  Typography,
  Box,
  Card,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Pagination,
  Checkbox,
  IconButton,
  Alert,
  Avatar,
  ListItemText,
  Breadcrumbs,
  Stepper,
  Step,
  StepLabel
} from '@mui/material';
import {
  FaEye,
  FaPencilAlt,
  FaUserPlus,
  FaUser,
  FaEnvelope,
  FaPhone,
  FaLock,
  FaUserTag,
  FaSave,
  FaTimes,
  FaLockOpen,
  FaKey,
  FaEyeSlash,
} from 'react-icons/fa';
import {
  BiSolidTrashAlt,
  BiRefresh
} from 'react-icons/bi';
import {
  Home as HomeIcon,
  ExpandMore as ExpandMoreIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

// Import API functions from utils
import { 
  fetchDataFromAPI, 
  postData, 
  editData, 
  deleteData, 
  handleErrorResponse 
} from '../../utils/auth';


// Context - in real app, this would be imported from a separate context file
const MyContext = React.createContext({
  setProgress: () => {},
  setAlertBox: () => {},
  setIsHideSidebarAndHeader: () => {}
});

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

// Create User Dialog Component
const CreateUserDialog = ({ open, handleClose, onUserCreated }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    status: 'active',
    roleIds: []
  });
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [activeStep, setActiveStep] = useState(0);
  const context = useContext(MyContext);

  const steps = ['Thông tin cơ bản', 'Bảo mật', 'Phân quyền'];

  useEffect(() => {
    if (open) {
      fetchRoles();
      resetForm();
    }
  }, [open]);

  const fetchRoles = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetchDataFromAPI('/api/roles', token);
      if (response.success) {
        setRoles(response.data?.roles || []);
      } else {
        // Handle API response with error
        context.setAlertBox({
          open: true,
          error: true,
          msg: response.message || 'Lỗi khi tải danh sách vai trò!'
        });
      }
    } catch (error) {
      console.error('Error fetching roles:', error);
      context.setAlertBox({
        open: true,
        error: true,
        msg: handleErrorResponse(error)
      });
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) newErrors.name = 'Tên là bắt buộc';
    if (!formData.email.trim()) newErrors.email = 'Email là bắt buộc';
    if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Email không hợp lệ';
    if (!formData.password) newErrors.password = 'Mật khẩu là bắt buộc';
    if (formData.password.length < 8) newErrors.password = 'Mật khẩu phải có ít nhất 8 ký tự';
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Mật khẩu xác nhận không khớp';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      // Prepare data for API (remove confirmPassword)
      const { confirmPassword, ...userData } = formData;
            
      const response = await postData('/api/user/create', userData, token);
      
      // Check if response has success field or if it's a successful response
      if (response.success || response.status === 'success' || response.user || response.id) {
        context.setAlertBox({
          open: true,
          error: false,
          msg: response.message || 'Tạo người dùng thành công!'
        });
        onUserCreated();
        handleClose();
        resetForm();
      } else {
        // Handle API response with error
        context.setAlertBox({
          open: true,
          error: true,
          msg: response.message || 'Lỗi khi tạo người dùng!'
        });
      }
    } catch (error) {
      console.error('Error creating user:', error);
      // Check if the error is actually a success (user was created but response format is unexpected)
      if (error.response?.data?.user || error.response?.data?.id) {
        context.setAlertBox({
          open: true,
          error: false,
          msg: 'Tạo người dùng thành công!'
        });
        onUserCreated();
        handleClose();
        resetForm();
      } else {
        context.setAlertBox({
          open: true,
          error: true,
          msg: handleErrorResponse(error)
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      status: 'active',
      roleIds: []
    });
    setErrors({});
    setActiveStep(0);
  };

  const handleNext = () => {
    if (activeStep === 0) {
      // Validate basic info
      const basicErrors = {};
      if (!formData.name.trim()) basicErrors.name = 'Tên là bắt buộc';
      if (!formData.email.trim()) basicErrors.email = 'Email là bắt buộc';
      if (!/\S+@\S+\.\S+/.test(formData.email)) basicErrors.email = 'Email không hợp lệ';
      
      setErrors(basicErrors);
      if (Object.keys(basicErrors).length === 0) {
        setActiveStep(activeStep + 1);
      }
    } else if (activeStep === 1) {
      // Validate security info
      const securityErrors = {};
      if (!formData.password) securityErrors.password = 'Mật khẩu là bắt buộc';
      if (formData.password.length < 8) securityErrors.password = 'Mật khẩu phải có ít nhất 8 ký tự';
      if (formData.password !== formData.confirmPassword) {
        securityErrors.confirmPassword = 'Mật khẩu xác nhận không khớp';
      }
      
      setErrors(securityErrors);
      if (Object.keys(securityErrors).length === 0) {
        setActiveStep(activeStep + 1);
      }
    }
  };

  const handleBack = () => {
    setActiveStep(activeStep - 1);
  };

  const renderStepContent = (step) => {
    switch (step) {
      case 0:
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Họ và tên"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                error={!!errors.name}
                helperText={errors.name}
                InputProps={{
                  startAdornment: <FaUser style={{ marginRight: 8, color: '#666' }} />
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                error={!!errors.email}
                helperText={errors.email}
                InputProps={{
                  startAdornment: <FaEnvelope style={{ marginRight: 8, color: '#666' }} />
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Số điện thoại"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                InputProps={{
                  startAdornment: <FaPhone style={{ marginRight: 8, color: '#666' }} />
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Trạng thái</InputLabel>
                <Select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  label="Trạng thái"
                >
                  <MenuItem value="active">Hoạt động</MenuItem>
                  <MenuItem value="inactive">Không hoạt động</MenuItem>
                  <MenuItem value="suspended">Tạm khóa</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        );
      case 1:
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Mật khẩu"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                error={!!errors.password}
                helperText={errors.password}
                InputProps={{
                  startAdornment: <FaLock style={{ marginRight: 8, color: '#666' }} />
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Xác nhận mật khẩu"
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                error={!!errors.confirmPassword}
                helperText={errors.confirmPassword}
                InputProps={{
                  startAdornment: <FaLock style={{ marginRight: 8, color: '#666' }} />
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <Alert severity="info">
                Mật khẩu phải có ít nhất 8 ký tự và nên bao gồm chữ hoa, chữ thường, số và ký tự đặc biệt.
              </Alert>
            </Grid>
          </Grid>
        );
      case 2:
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                <FaUserTag style={{ marginRight: 8 }} />
                Chọn vai trò
              </Typography>
              <FormControl fullWidth>
                <InputLabel>Vai trò</InputLabel>
                <Select
                  multiple
                  value={formData.roleIds}
                  onChange={(e) => setFormData({ ...formData, roleIds: e.target.value })}
                  label="Vai trò"
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selected.map((value) => {
                        const role = roles.find(r => r.id === value);
                        return (
                          <Chip 
                            key={value} 
                            label={role?.name} 
                            size="small"
                            color="primary"
                          />
                        );
                      })}
                    </Box>
                  )}
                >
                  {roles.map((role) => (
                    <MenuItem key={role.id} value={role.id}>
                      <Checkbox checked={formData.roleIds.indexOf(role.id) > -1} />
                      <ListItemText 
                        primary={role.name} 
                        secondary={role.description}
                      />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <Alert severity="warning">
                Việc phân quyền sẽ xác định những chức năng mà người dùng có thể truy cập trong hệ thống.
              </Alert>
            </Grid>
          </Grid>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: { 
          minHeight: '600px',
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
          <FaUserPlus style={{ marginRight: 12, fontSize: '1.5rem' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Thêm người dùng mới
          </Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ mb: 4 }}>
          <Stepper activeStep={activeStep} alternativeLabel>
            {steps.map((label, index) => (
              <Step key={label}>
                <StepLabel 
                  sx={{
                    '& .MuiStepLabel-label': {
                      fontWeight: activeStep === index ? 600 : 400,
                      color: activeStep === index ? '#1976d2' : 'text.secondary',
                    },
                    '& .MuiStepLabel-iconContainer': {
                      '& .MuiStepIcon-root': {
                        color: activeStep >= index ? '#1976d2' : '#ccc',
                        '&.Mui-active': {
                          color: '#1976d2',
                        },
                        '&.Mui-completed': {
                          color: '#4caf50',
                        },
                      },
                    },
                  }}
                >
                  {label}
                </StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>
        
        <Box sx={{ mt: 3 }}>
          {renderStepContent(activeStep)}
        </Box>
      </DialogContent>
      
      <DialogActions sx={{ 
        p: 3, 
        borderTop: '1px solid #e0e0e0',
        background: '#fafafa'
      }}>
        <Button 
          onClick={handleClose} 
          disabled={loading}
          sx={{
            borderRadius: 2,
            px: 3,
            py: 1.5,
            textTransform: 'none',
            fontWeight: 600,
            borderColor: '#ccc',
            color: '#666',
            '&:hover': {
              backgroundColor: 'rgba(0, 0, 0, 0.04)',
            },
          }}
        >
          <FaTimes style={{ marginRight: 8 }} />
          Hủy
        </Button>
        {activeStep > 0 && (
          <Button 
            onClick={handleBack} 
            disabled={loading}
            sx={{
              borderRadius: 2,
              px: 3,
              py: 1.5,
              textTransform: 'none',
              fontWeight: 600,
              borderColor: '#667eea',
              color: '#667eea',
              '&:hover': {
                backgroundColor: 'rgba(102, 126, 234, 0.04)',
              },
            }}
          >
            Quay lại
          </Button>
        )}
        {activeStep < steps.length - 1 ? (
          <Button 
            variant="contained" 
            onClick={handleNext}
            sx={{
              borderRadius: 2,
              px: 3,
              py: 1.5,
              textTransform: 'none',
              fontWeight: 600,
              backgroundColor: '#1976d2',
              boxShadow: '0 2px 8px rgba(25, 118, 210, 0.3)',
              '&:hover': {
                backgroundColor: '#1565c0',
                boxShadow: '0 4px 12px rgba(25, 118, 210, 0.4)',
                transform: 'translateY(-1px)'
              },
              transition: 'all 0.2s ease'
            }}
          >
            Tiếp theo
          </Button>
        ) : (
          <Button 
            variant="contained" 
            onClick={handleSubmit} 
            disabled={loading}
            sx={{
              borderRadius: 2,
              px: 3,
              py: 1.5,
              textTransform: 'none',
              fontWeight: 600,
              backgroundColor: '#4caf50',
              boxShadow: '0 2px 8px rgba(76, 175, 80, 0.3)',
              '&:hover': {
                backgroundColor: '#45a049',
                boxShadow: '0 4px 12px rgba(76, 175, 80, 0.4)',
                transform: 'translateY(-1px)'
              },
              '&:disabled': {
                background: '#ccc',
                boxShadow: 'none',
                transform: 'none'
              },
              transition: 'all 0.2s ease'
            }}
          >
            <FaSave style={{ marginRight: 8 }} />
            {loading ? 'Đang tạo...' : 'Tạo người dùng'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

// Update User Dialog Component
const UpdateUserDialog = ({ open, handleClose, user, onUserUpdated }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    status: 'active',
    roleIds: []
  });
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const context = useContext(MyContext);

  useEffect(() => {
    if (open && user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        status: user.status || 'active',
        roleIds: user.roles?.map(role => role.id) || []
      });
      fetchRoles();
    }
  }, [open, user]);

  const fetchRoles = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetchDataFromAPI('/api/roles', token);
      if (response.success) {
        setRoles(response.data?.roles || []);
      } else {
        // Handle API response with error
        context.setAlertBox({
          open: true,
          error: true,
          msg: response.message || 'Lỗi khi tải danh sách vai trò!'
        });
      }
    } catch (error) {
      console.error('Error fetching roles:', error);
      context.setAlertBox({
        open: true,
        error: true,
        msg: handleErrorResponse(error)
      });
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) newErrors.name = 'Tên là bắt buộc';
    if (!formData.email.trim()) newErrors.email = 'Email là bắt buộc';
    if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Email không hợp lệ';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await editData(`/api/user/${user.id}`, formData, token);
      
      // Check if response has success field or if it's a successful response
      if (response.success || response.status === 'success' || response.user || response.id) {
        context.setAlertBox({
          open: true,
          error: false,
          msg: response.message || 'Cập nhật người dùng thành công!'
        });
        onUserUpdated();
        handleClose();
      } else {
        // Handle API response with error
        context.setAlertBox({
          open: true,
          error: true,
          msg: response.message || 'Lỗi khi cập nhật người dùng!'
        });
      }
    } catch (error) {
      console.error('Error updating user:', error);
      // Check if the error is actually a success (user was updated but response format is unexpected)
      if (error.response?.data?.user || error.response?.data?.id) {
        context.setAlertBox({
          open: true,
          error: false,
          msg: 'Cập nhật người dùng thành công!'
        });
        onUserUpdated();
        handleClose();
      } else {
        context.setAlertBox({
          open: true,
          error: true,
          msg: handleErrorResponse(error)
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md"
      PaperProps={{
        sx: { borderRadius: 3, minWidth: 0, maxWidth: 900 }
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
          <FaPencilAlt style={{ marginRight: 12, fontSize: '1.5rem', color: '#888' }} />
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#222' }}>
            Cập nhật thông tin người dùng
          </Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Grid container spacing={3} sx={{ mt: 1 }}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Họ và tên"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              error={!!errors.name}
              helperText={errors.name}
              InputProps={{
                startAdornment: <FaUser style={{ marginRight: 8, color: '#666' }} />
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              error={!!errors.email}
              helperText={errors.email}
              InputProps={{
                startAdornment: <FaEnvelope style={{ marginRight: 8, color: '#666' }} />
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Số điện thoại"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              InputProps={{
                startAdornment: <FaPhone style={{ marginRight: 8, color: '#666' }} />
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Trạng thái</InputLabel>
              <Select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                label="Trạng thái"
              >
                <MenuItem value="active">Hoạt động</MenuItem>
                <MenuItem value="inactive">Không hoạt động</MenuItem>
                <MenuItem value="suspended">Tạm khóa</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Vai trò</InputLabel>
              <Select
                multiple
                value={formData.roleIds}
                onChange={(e) => setFormData({ ...formData, roleIds: e.target.value })}
                label="Vai trò"
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((value) => {
                      const role = roles.find(r => r.id === value);
                      return (
                        <Chip 
                          key={value} 
                          label={role?.name} 
                          size="small"
                          color="primary"
                        />
                      );
                    })}
                  </Box>
                )}
              >
                {roles.map((role) => (
                  <MenuItem key={role.id} value={role.id}>
                    <Checkbox checked={formData.roleIds.indexOf(role.id) > -1} />
                    <ListItemText 
                      primary={role.name} 
                      secondary={role.description}
                    />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </DialogContent>
      
      <DialogActions sx={{ 
        p: 3, 
        borderTop: '1px solid #e0e0e0',
        background: '#fafafa'
      }}>
        <Button 
          onClick={handleClose} 
          disabled={loading}
          sx={{
            borderRadius: 2,
            px: 3,
            py: 1.5,
            textTransform: 'none',
            fontWeight: 600,
            backgroundColor: '#f5f5f5',
            color: '#222',
            boxShadow: 'none',
            '&:hover': {
              backgroundColor: '#ededed',
            },
            transition: 'all 0.2s ease'
          }}
        >
          <FaTimes style={{ marginRight: 8, color: '#888' }} />
          Hủy
        </Button>
        <Button 
          variant="contained" 
          onClick={handleSubmit} 
          disabled={loading}
          sx={{
            borderRadius: 2,
            px: 3,
            py: 1.5,
            textTransform: 'none',
            fontWeight: 600,
            backgroundColor: '#1976d2',
            color: 'white',
            boxShadow: 'none',
            '&:hover': {
              backgroundColor: '#1565c0',
            },
            transition: 'all 0.2s ease'
          }}
        >
          <FaSave style={{ marginRight: 8, color: '#fff' }} />
          {loading ? 'Đang cập nhật...' : 'Cập nhật'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Reset Password Dialog Component
const ResetPasswordDialog = ({ open, handleClose, user, onResetSuccess }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const context = useContext(MyContext);

  // Hàm kiểm tra mật khẩu mạnh
  const isStrongPassword = (password) => {
    // Tối thiểu 8 ký tự, ít nhất 1 chữ hoa, 1 ký tự đặc biệt
    return /^(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/.test(password);
  };

  const validate = () => {
    if (!newPassword || newPassword.length < 8) {
      setError('Mật khẩu phải có ít nhất 8 ký tự!');
      return false;
    }
    if (!isStrongPassword(newPassword)) {
      setError('Mật khẩu phải có ít nhất 8 ký tự, 1 chữ hoa và 1 ký tự đặc biệt!');
      return false;
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp!');
      return false;
    }
    setError('');
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      context.setProgress(30);
      const token = localStorage.getItem('token');
      const response = await postData(`/api/user/${user.id}/reset-password`, { newPassword, forceChangeOnLogin: false }, token);      context.setAlertBox({
        open: true,
        error: false,
        msg: response.message || 'Đặt lại mật khẩu thành công!'
      });
      setNewPassword('');
      setConfirmPassword('');
      handleClose();
      if (onResetSuccess) onResetSuccess();
    } catch (err) {
      context.setAlertBox({
        open: true,
        error: true,
        msg: handleErrorResponse(err)
      });
    } finally {
      setLoading(false);
      context.setProgress(100);
    }
  };

  const handleDialogClose = () => {
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    handleClose();
  };

  return (
    <Dialog open={open} onClose={handleDialogClose} maxWidth="sm" fullWidth
      PaperProps={{ sx: { borderRadius: 3, background: 'white', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', border: '1px solid #e0e0e0' } }}
    >
      <DialogTitle sx={{ background: '#1976d2', color: 'white', borderRadius: '12px 12px 0 0', borderBottom: '1px solid #e0e0e0' }}>
        <Box display="flex" alignItems="center">
          <FaKey style={{ marginRight: 12, fontSize: '1.5rem' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Đặt lại mật khẩu cho "{user?.name}"
          </Typography>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ p: 3 }}>
        <TextField
          fullWidth
          label="Mật khẩu mới"
          type={showPassword ? 'text' : 'password'}
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          margin="normal"
          autoFocus
          InputProps={{
            endAdornment: (
              <IconButton onClick={() => setShowPassword(v => !v)} edge="end" size="small">
                {showPassword ? <FaEye /> : <FaEyeSlash />}
              </IconButton>
            )
          }}
        />
        <TextField
          fullWidth
          label="Xác nhận mật khẩu"
          type={showPassword ? 'text' : 'password'}
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          margin="normal"
          InputProps={{
            endAdornment: (
              <IconButton onClick={() => setShowPassword(v => !v)} edge="end" size="small">
                {showPassword ? <FaEye /> : <FaEyeSlash />}
              </IconButton>
            )
          }}
        />
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ p: 3, borderTop: '1px solid #e0e0e0', background: '#fafafa' }}>
        <Button onClick={handleDialogClose} disabled={loading} sx={{ borderRadius: 2, px: 3, py: 1.5, textTransform: 'none', fontWeight: 600, color: '#666', backgroundColor: '#f5f5f5', '&:hover': { backgroundColor: '#ededed' } }}>Hủy</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={loading} sx={{ borderRadius: 2, px: 3, py: 1.5, textTransform: 'none', fontWeight: 600, backgroundColor: '#1976d2', color: 'white', '&:hover': { backgroundColor: '#1565c0' } }}>
          {loading ? 'Đang xử lý...' : 'Đặt lại mật khẩu'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Main Users Management Component
const UsersManagement = () => {
  const [userData, setUserData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  
  // Dialog states (loại bỏ selectedUser)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [userToUpdate, setUserToUpdate] = useState(null);
  // Dialog states
  const [resetPasswordDialog, setResetPasswordDialog] = useState({ open: false, user: null });
  
  // Permissions
  const [permissions, setPermissions] = useState({
    canCreate: false,
    canView: false,
    canUpdate: false,
    canDelete: false
  });

  const context = useContext(MyContext);
  const navigate = useNavigate();

  // useEffect for initial load and page changes
  useEffect(() => {
    checkPermissions();
    fetchUsersWithFilters();
  }, [currentPage, pageSize]);

  // useEffect for search and filters with debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (currentPage === 1) {
        fetchUsersWithFilters();
      } else {
        setCurrentPage(1); // This will trigger fetchUsers via the other useEffect
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, statusFilter, roleFilter]);

  const checkPermissions = () => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        const userPermissions = user.permissions || [];
        setPermissions({
          canCreate: userPermissions.some(p => p.code === 'user.create'),
          canView: userPermissions.some(p => p.code === 'user.view'),
          canUpdate: userPermissions.some(p => p.code === 'user.update'),
          canDelete: userPermissions.some(p => p.code === 'user.delete')
        });
      } catch (error) {
        console.error('Error parsing user permissions:', error);
      }
    }
  };

  const fetchUsers = async () => {
    await fetchUsersWithFilters();
  };

  const [deleteDialog, setDeleteDialog] = useState({ open: false, userId: null, name: '' });

  const handleDeleteUser = (userId, name) => {
    setDeleteDialog({ open: true, userId, name });
  };

  const confirmDeleteUser = async () => {
    const { userId } = deleteDialog;
    try {
      const token = localStorage.getItem('token');
      const response = await deleteData(`/api/user/${userId}`, token);
      if (response.success || response.status === 'success' || response.message) {
        context.setAlertBox({
          open: true,
          error: false,
          msg: response.message || 'Xóa người dùng thành công!'
        });
        // Remove deleted user from selectedUsers if it exists
        setSelectedUsers(prev => prev.filter(id => id !== userId));
        fetchUsersWithFilters();
      } else {
        // Handle API response with error
        context.setAlertBox({
          open: true,
          error: true,
          msg: response.message || 'Lỗi khi xóa người dùng!'
        });
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      context.setAlertBox({
        open: true,
        error: true,
        msg: handleErrorResponse(error)
      });
    } finally {
      setDeleteDialog({ open: false, userId: null, name: '' });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedUsers.length === 0) {
      context.setAlertBox({
        open: true,
        error: true,
        msg: 'Vui lòng chọn ít nhất một người dùng để xóa!'
      });
      return;
    }

    if (window.confirm(`Bạn có chắc chắn muốn xóa ${selectedUsers.length} người dùng đã chọn?`)) {
      try {
        const token = localStorage.getItem('token');
        const response = await postData('/api/user/bulk/delete', { userIds: selectedUsers }, token);
        if (response.success || response.status === 'success' || response.message) {
          context.setAlertBox({
            open: true,
            error: false,
            msg: response.message || `Xóa thành công ${selectedUsers.length} người dùng!`
          });
          setSelectedUsers([]);
          fetchUsersWithFilters();
        } else {
          // Handle API response with error
          context.setAlertBox({
            open: true,
            error: true,
            msg: response.message || 'Lỗi khi xóa nhiều người dùng!'
          });
        }
      } catch (error) {
        console.error('Error bulk deleting users:', error);
        context.setAlertBox({
          open: true,
          error: true,
          msg: handleErrorResponse(error)
        });
      }
    }
  };

  const handleSelectUser = (userId) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSelectAll = () => {
    if (selectedUsers.length === userData.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(userData.map(user => user.id));
    }
  };

  const handleRefresh = () => {
    // Reset all filters and search
    setSearchTerm('');
    setStatusFilter('');
    setRoleFilter('');
    setCurrentPage(1);
    setSelectedUsers([]);
    // Fetch users with reset filters
    fetchUsersWithFilters();
  };

  const fetchUsersWithFilters = async () => {
    setLoading(true);
    context.setProgress(20);
    
    try {
      const token = localStorage.getItem('token');
      const queryParams = new URLSearchParams();
      
      queryParams.append('page', currentPage.toString());
      queryParams.append('limit', pageSize.toString());
      
      if (searchTerm.trim()) {
        queryParams.append('search', searchTerm.trim());
      }
      if (statusFilter) {
        queryParams.append('status', statusFilter);
      }
      if (roleFilter) {
        queryParams.append('role', roleFilter);
      }

      const response = await fetchDataFromAPI(`/api/user?${queryParams}`, token);
      
      if (response.success || response.users || response.data?.users) {
        setUserData(response.data?.users || response.users || []);
        setTotalPages(response.data?.pagination?.totalPages || response.pagination?.totalPages || 1);
        setTotalUsers(response.data?.pagination?.totalUsers || response.pagination?.totalUsers || 0);
      } else {
        // Handle API response with error
        context.setAlertBox({
          open: true,
          error: true,
          msg: response.message || 'Lỗi khi tải danh sách người dùng!'
        });
      }
      
      context.setProgress(100);
    } catch (error) {
      console.error('Error fetching users:', error);
      context.setAlertBox({
        open: true,
        error: true,
        msg: handleErrorResponse(error)
      });
      context.setProgress(100);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'success';
      case 'inactive': return 'default';
      case 'suspended': return 'error';
      default: return 'default';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'active': return 'Hoạt động';
      case 'inactive': return 'Không hoạt động';
      case 'suspended': return 'Tạm khóa';
      default: return status;
    }
  };

  // Thêm hàm tạo mảng trang với dấu ...
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

  // Handler for lock/unlock user
  const handleLockUnlockUser = async (user) => {
    const token = localStorage.getItem('token');
    let newStatus, lockedUntil = null;
    if (user.status === 'suspended') {
      newStatus = 'active';
      lockedUntil = null;
    } else {
      newStatus = 'suspended';
      // 30 ngày kể từ hiện tại
      const now = new Date();
      const until = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      lockedUntil = until.toISOString().slice(0, 19).replace('T', ' ');
    }
    try {
      context.setProgress(30);
      const response = await editData(`/api/user/${user.id}/status`, { status: newStatus, locked_until: lockedUntil }, token);
      context.setAlertBox({
        open: true,
        error: false,
        msg: response.message || (user.status === 'suspended' ? 'Mở khóa tài khoản thành công!' : 'Khóa tài khoản thành công!')
      });
      fetchUsersWithFilters();
    } catch (error) {
      context.setAlertBox({
        open: true,
        error: true,
        msg: handleErrorResponse(error)
      });
    } finally {
      context.setProgress(100);
    }
  };

  // Handler for reset password
  const handleResetPassword = (user) => {
    setResetPasswordDialog({ open: true, user });
  };

  // Handler for view user history
  const handleViewHistory = (user) => {
    navigate(`/user/${user.id}/detailed`);
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
                  color: '#1976d2',
                  mb: 1
                }}>
                  Quản lý người dùng
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  Quản lý và theo dõi tất cả người dùng trong hệ thống
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
                    label="Quản lý người dùng"
                    icon={<ExpandMoreIcon fontSize="small" />}
                  />
                </Breadcrumbs>
                
                {permissions.canCreate && (
                  <Button
                    variant="contained"
                    startIcon={<FaUserPlus />}
                    onClick={() => setIsCreateModalOpen(true)}
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
                    Thêm người dùng
                  </Button>
                )}
              </Box>
            </Box>
          </Box>
        </Card>
      </Box>

      {/* Enhanced Filters */}
      <Box sx={{ px: 3, mb: 3 }}>
        <Card sx={{ 
          background: 'white',
          borderRadius: 3,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          border: '1px solid #e0e0e0'
        }}>
          <Box sx={{ p: 3 }}>
            <Grid container spacing={3} alignItems="center">
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  fullWidth
                  label="Tìm kiếm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Tên, email, name..."
                  size="small"
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      '&:hover fieldset': {
                        borderColor: '#1976d2',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: '#1976d2',
                      },
                    },
                  }}
                />
              </Grid>
              
              <Grid item xs={12} sm={6} md={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Trạng thái</InputLabel>
                  <Select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    label="Trạng thái"
                    sx={{
                      borderRadius: 2,
                      '& .MuiOutlinedInput-notchedOutline': {
                        '&:hover': {
                          borderColor: '#1976d2',
                        },
                      },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#1976d2',
                      },
                    }}
                  >
                    <MenuItem value="">Tất cả</MenuItem>
                    <MenuItem value="active">Hoạt động</MenuItem>
                    <MenuItem value="inactive">Không hoạt động</MenuItem>
                    <MenuItem value="suspended">Tạm khóa</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} sm={6} md={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Vai trò</InputLabel>
                  <Select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    label="Vai trò"
                    sx={{
                      borderRadius: 2,
                      '& .MuiOutlinedInput-notchedOutline': {
                        '&:hover': {
                          borderColor: '#1976d2',
                        },
                      },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#1976d2',
                      },
                    }}
                  >
                    <MenuItem value="">Tất cả</MenuItem>
                    <MenuItem value="SuperAdmin">SuperAdmin</MenuItem>
                    <MenuItem value="Admin">Admin</MenuItem>
                    <MenuItem value="Manager">Manager</MenuItem>
                    <MenuItem value="Operator">Operator</MenuItem>
                    <MenuItem value="Viewer">Viewer</MenuItem>
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
                    py: 1.5,
                    textTransform: 'none',
                    fontWeight: 600,
                    borderColor: '#1976d2',
                    color: '#1976d2',
                    '&:hover': {
                      borderColor: '#1565c0',
                      backgroundColor: 'rgba(25, 118, 210, 0.04)',
                    },
                  }}
                >
                  Làm mới
                </Button>
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                {selectedUsers.length > 0 && permissions.canDelete && (
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
                      fontWeight: 600,
                      '&:hover': {
                        backgroundColor: 'rgba(244, 67, 54, 0.04)',
                      },
                    }}
                  >
                    Xóa đã chọn ({selectedUsers.length})
                  </Button>
                )}
              </Grid>
            </Grid>
          </Box>
        </Card>
      </Box>

      {/* Enhanced Users Table */}
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
                      checked={userData.length > 0 && selectedUsers.length === userData.length}
                      indeterminate={selectedUsers.length > 0 && selectedUsers.length < userData.length}
                      onChange={handleSelectAll}
                      sx={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        '&.Mui-checked': {
                          color: 'white',
                        },
                        '&.MuiCheckbox-indeterminate': {
                          color: 'white',
                        },
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ width: 80 }}>ID</TableCell>
                  <TableCell>Người dùng</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Số điện thoại</TableCell>
                  <TableCell>Vai trò</TableCell>
                  <TableCell>Ngày tạo</TableCell>                
                  <TableCell>Trạng thái</TableCell>
                  <TableCell align="center" sx={{ width: 120 }}>Thao tác</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
                        <Box
                          sx={{
                            width: 40,
                            height: 40,
                            border: '3px solid #f3f3f3',
                            borderTop: '3px solid #1976d2',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                            '@keyframes spin': {
                              '0%': { transform: 'rotate(0deg)' },
                              '100%': { transform: 'rotate(360deg)' },
                            },
                          }}
                        />
                        <Typography variant="body2" color="text.secondary">
                          Đang tải dữ liệu...
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : userData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                      <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
                        <FaUser size={48} color="#ccc" />
                        <Typography variant="h6" color="text.secondary">
                          Không có dữ liệu
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Không tìm thấy người dùng nào phù hợp với bộ lọc
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : (
                  userData.map((user, index) => (
                    <TableRow 
                      key={user.id} 
                      hover
                      sx={{ 
                        '&:hover': {
                          backgroundColor: 'rgba(25, 118, 210, 0.04)',
                          transition: 'background-color 0.2s ease',
                        },
                        '&:nth-of-type(even)': {
                          backgroundColor: 'rgba(0, 0, 0, 0.02)',
                        },
                      }}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedUsers.includes(user.id)}
                          onChange={() => handleSelectUser(user.id)}
                          sx={{
                            '&.Mui-checked': {
                              color: '#667eea',
                            },
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1976d2' }}>
                          #{index + 1 + (currentPage - 1) * pageSize}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={2}>
                          <Avatar sx={{ 
                            bgcolor: '#1976d2',
                            background: '#1976d2',
                            width: 48,
                            height: 48,
                            fontSize: '1.2rem',
                            fontWeight: 600
                          }}>
                            {user.name.charAt(0).toUpperCase()}
                          </Avatar>
                          <Box>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                              {user.name}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {user.email}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {user.phone || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box display="flex" flexWrap="wrap" gap={0.5}>
                          {user.roles?.map((role) => (
                            <Chip
                              key={role.id}
                              label={role.name}
                              size="small"
                              sx={{
                                background: '#1976d2',
                                color: 'white',
                                fontWeight: 600,
                                fontSize: '0.7rem',
                                height: 24,
                                '& .MuiChip-label': {
                                  px: 1,
                                },
                              }}
                            />
                          )) || (
                            <Chip
                              label="Chưa có vai trò"
                              size="small"
                              variant="outlined"
                              sx={{
                                borderColor: '#ccc',
                                color: '#666',
                                fontSize: '0.7rem',
                                height: 24,
                              }}
                            />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {user.created_at ? new Date(user.created_at).toLocaleDateString('vi-VN') : '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={getStatusText(user.status)}
                          color={getStatusColor(user.status)}
                          size="small"
                          sx={{
                            fontWeight: 600,
                            fontSize: '0.75rem',
                            height: 24,
                            minWidth: 80,
                          }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Box display="flex" justifyContent="center" gap={1}>
                        {permissions.canView && (
                          <IconButton
                            size="small"
                            onClick={() => {
                              navigate(`/user/${user.id}/detailed`);
                            }}
                            title="Xem chi tiết"
                            sx={{
                              color: '#1976d2',
                              backgroundColor: 'rgba(25, 118, 210, 0.1)',
                              '&:hover': {
                                backgroundColor: 'rgba(25, 118, 210, 0.2)',
                              },
                              transition: 'background-color 0.2s ease',
                            }}
                          >
                            <FaEye size={14} />
                          </IconButton>
                        )}
                          {permissions.canUpdate && (
                            <IconButton
                              size="small"
                              onClick={() => {
                                setUserToUpdate(user);
                                setIsUpdateModalOpen(true);
                              }}
                              title="Chỉnh sửa"
                              sx={{
                                color: '#ff9800',
                                backgroundColor: 'rgba(255, 152, 0, 0.1)',
                                '&:hover': {
                                  backgroundColor: 'rgba(255, 152, 0, 0.2)',
                                },
                                transition: 'background-color 0.2s ease',
                              }}
                            >
                              <FaPencilAlt size={14} />
                            </IconButton>
                          )}
                          {permissions.canDelete && (
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteUser(user.id, user.name)}
                              title="Xóa"
                              sx={{
                                color: '#f44336',
                                backgroundColor: 'rgba(244, 67, 54, 0.1)',
                                '&:hover': {
                                  backgroundColor: 'rgba(244, 67, 54, 0.2)',
                                },
                                transition: 'background-color 0.2s ease',
                              }}
                            >
                              <BiSolidTrashAlt size={14} />
                            </IconButton>
                          )}
                          {permissions.canUpdate && (
                            <IconButton
                              size="small"
                              onClick={() => handleLockUnlockUser(user)}
                              title={user.status === 'suspended' ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}
                              sx={{
                                color: user.status === 'suspended' ? '#43a047' : '#e53935',
                                backgroundColor: user.status === 'suspended' ? 'rgba(67, 160, 71, 0.1)' : 'rgba(229, 57, 53, 0.1)',
                                '&:hover': {
                                  backgroundColor: user.status === 'suspended' ? 'rgba(67, 160, 71, 0.2)' : 'rgba(229, 57, 53, 0.2)',
                                },
                                transition: 'background-color 0.2s ease',
                              }}
                            >
                              {user.status === 'suspended' ? <FaLockOpen size={14} /> : <FaLock size={14} />}
                            </IconButton>
                          )}
                          {permissions.canUpdate && (
                            <IconButton
                              size="small"
                              onClick={() => handleResetPassword(user)}
                              title="Reset mật khẩu"
                              sx={{
                                color: '#1976d2',
                                backgroundColor: 'rgba(25, 118, 210, 0.1)',
                                '&:hover': {
                                  backgroundColor: 'rgba(25, 118, 210, 0.2)',
                                },
                                transition: 'background-color 0.2s ease',
                              }}
                            >
                              <FaKey size={14} />
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

          <Typography variant="body2" color="textSecondary" sx={{ fontWeight: 500, px: 3, pt: 2 }}>
            Hiển thị {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalUsers)} / {totalUsers} người dùng
          </Typography>
          <Box display="flex" justifyContent="space-between" alignItems="center" p={3} sx={{
            borderTop: '1px solid rgba(0, 0, 0, 0.1)',
            background: 'rgba(0, 0, 0, 0.02)',
          }}>
            <FormControl size="small" sx={{ minWidth: 120, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 500, mr: 1 }}>
                Hiển thị
              </Typography>
              <Select
                value={pageSize}
                onChange={e => {
                  const value = Number(e.target.value);
                  setPageSize(value);
                  setCurrentPage(1);
                }}
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
            {/* Pagination right */}
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
                      sx={{ minWidth: 36, fontWeight: 600, borderRadius: 2, mx: 0.25, ...(item === currentPage && { boxShadow: '0 2px 8px rgba(25, 118, 210, 0.15)' }) }}
                      onClick={() => setCurrentPage(item)}
                    >
                      {item}
                    </Button>
              )}
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
        </Card>
      </Box>

      {/* Dialogs */}
      <CreateUserDialog
        open={isCreateModalOpen}
        handleClose={() => setIsCreateModalOpen(false)}
        onUserCreated={fetchUsersWithFilters}
      />
      
      <UpdateUserDialog
        open={isUpdateModalOpen}
        handleClose={() => {
          setIsUpdateModalOpen(false);
          setUserToUpdate(null);
        }}
        user={userToUpdate}
        onUserUpdated={fetchUsersWithFilters}
      />

      {/* Reset Password Dialog */}
      <ResetPasswordDialog
        open={resetPasswordDialog.open}
        handleClose={() => setResetPasswordDialog({ open: false, user: null })}
        user={resetPasswordDialog.user}
        onResetSuccess={fetchUsersWithFilters}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, userId: null, name: '' })}
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
            Bạn có chắc chắn muốn xóa người dùng <strong>"{deleteDialog.name}"</strong>?
          </Typography>
          <Alert severity="warning" sx={{ mb: 2, background: '#fffbe6', color: '#8a6d3b', border: '1px solid #faebcc' }}>
            <Typography variant="body2" sx={{ color: '#8a6d3b' }}>
              • Tất cả dữ liệu liên quan đến người dùng này sẽ bị xóa vĩnh viễn<br/>
              • Người dùng sẽ không thể đăng nhập vào hệ thống<br/>
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
            onClick={() => setDeleteDialog({ open: false, userId: null, name: '' })}
            sx={{
              borderRadius: 2,
              px: 3,
              py: 1.5,
              textTransform: 'none',
              fontWeight: 600,
              backgroundColor: '#f5f5f5',
              color: '#222',
              boxShadow: 'none',
              '&:hover': {
                backgroundColor: '#ededed',
              },
              transition: 'all 0.2s ease'
            }}
          >
            Hủy
          </Button>
          <Button
            variant="contained"
            onClick={confirmDeleteUser}
            sx={{
              borderRadius: 2,
              px: 3,
              py: 1.5,
              textTransform: 'none',
              fontWeight: 600,
              backgroundColor: '#e53935',
              color: 'white',
              boxShadow: 'none',
              '&:hover': {
                backgroundColor: '#b71c1c',
              },
              transition: 'all 0.2s ease'
            }}
          >
            <BiSolidTrashAlt style={{ marginRight: 8, color: '#fff' }} />
            Xóa người dùng
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

// Demo Component with Context Provider
const UserManagementDemo = () => {
  const [progress, setProgress] = useState(0);
  const [alertBox, setAlertBox] = useState({ open: false, error: false, msg: '' });
  const [isHideSidebarAndHeader, setIsHideSidebarAndHeader] = useState(false);

  // Auto close alert after 5 seconds
  useEffect(() => {
    if (alertBox.open) {
      const timer = setTimeout(() => {
        setAlertBox({ ...alertBox, open: false });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [alertBox.open]);

  const contextValue = {
    setProgress,
    setAlertBox,
    setIsHideSidebarAndHeader
  };

  return (
    <MyContext.Provider value={contextValue}>
      <Box sx={{ minHeight: '100vh' }}>
        {/* Progress Bar */}
        {progress > 0 && progress < 100 && (
          <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999 }}>
            <Box sx={{ width: '100%', height: 4, backgroundColor: 'rgba(0, 0, 0, 0.1)' }}>
              <Box
                sx={{
                  width: `${progress}%`,
                  height: '100%',
                  backgroundColor: '#1976d2',
                  transition: 'width 0.3s ease',
                  boxShadow: '0 0 8px rgba(25, 118, 210, 0.3)'
                }}
              />
            </Box>
          </Box>
        )}
        
        {/* Enhanced Alert */}
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
        
        <UsersManagement />
      </Box>
    </MyContext.Provider>
  );
};

export default UserManagementDemo;

