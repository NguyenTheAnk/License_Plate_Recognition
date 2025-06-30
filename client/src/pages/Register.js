import React, { useState, useEffect } from 'react';
import { 
  TextField, 
  Button, 
  Paper, 
  Typography, 
  Box, 
  Alert, 
  InputAdornment,
  IconButton,
  Divider,
  LinearProgress,
  Container,
  Card,
  CardContent,
  Avatar,
  Chip,
  Collapse
} from '@mui/material';
import { 
  Visibility, 
  VisibilityOff, 
  PersonAdd,
  Person,
  Lock,
  Email,
  CheckCircle,
  Error as ErrorIcon,
  Phone
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { postData } from '../utils/auth.js';

function Register() {
  const [name, setName] = useState(''); // Thêm field name
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState(''); // Thêm field phone
  const [password, setPassword] = useState('');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (localStorage.getItem('token')) {
      navigate('/');
    }
  }, [navigate]);

  // Hàm tính độ mạnh mật khẩu
  const calculatePasswordStrength = (password) => {
    let strength = 0;
    if (password.length >= 8) strength += 20;
    if (/[A-Z]/.test(password)) strength += 20;
    if (/[a-z]/.test(password)) strength += 20;
    if (/\d/.test(password)) strength += 20;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) strength += 20;
    return strength;
  };

  // Hàm kiểm tra độ phức tạp mật khẩu
  const validatePassword = (password) => {
    const errors = [];
    
    if (password.length < 8) {
      errors.push('Tối thiểu 8 ký tự');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('1 chữ hoa');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('1 chữ thường');
    }
    if (!/\d/.test(password)) {
      errors.push('1 số');
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) {
      errors.push('1 ký tự đặc biệt');
    }
    if (username && password.toLowerCase().includes(username.toLowerCase())) {
      errors.push('Không chứa tên đăng nhập');
    }
    
    setPasswordErrors(errors);
    setPasswordStrength(calculatePasswordStrength(password));
    return errors.length === 0;
  };

  const getStrengthColor = (strength) => {
    if (strength < 40) return '#f44336';
    if (strength < 80) return '#ff9800';
    return '#4caf50';
  };

  const getStrengthText = (strength) => {
    if (strength < 40) return 'Yếu';
    if (strength < 80) return 'Trung bình';
    return 'Mạnh';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    // Validate required fields
    if (!name || !username || !email || !phone || !password) {
      setError('Vui lòng điền đầy đủ thông tin!');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Định dạng email không hợp lệ!');
      return;
    }

    // Validate phone format (Vietnam phone number)
    const phoneRegex = /^(\+84|84|0)(3[2-9]|5[6|8|9]|7[0|6-9]|8[1-6|8|9]|9[0-4|6-9])[0-9]{7}$/;
    if (!phoneRegex.test(phone)) {
      setError('Số điện thoại không hợp lệ!');
      return;
    }
    
    if (!validatePassword(password)) {
      setError('Mật khẩu chưa đáp ứng yêu cầu!');
      return;
    }
    
    try {
      setLoading(true);
      
      const requestData = { 
        name,
        username,
        email,
        phone,
        password
      };
      
      console.log('=== FRONTEND REGISTER DEBUG ===');
      console.log('Sending data:', { ...requestData, password: '[HIDDEN]' });
      
      const response = await postData('api/auth/register', requestData);
      
      console.log('Registration response:', response);
      
      if (response.success) {
        setSuccess('Đăng ký thành công! Chuyển hướng đến trang đăng nhập...');
        
        // Lưu token nếu backend trả về (auto login sau khi register)
        if (response.data && response.data.token) {
          localStorage.setItem('token', response.data.token);
          if (response.data.refreshToken) {
            localStorage.setItem('refreshToken', response.data.refreshToken);
          }
          localStorage.setItem('user', JSON.stringify(response.data.user));
          
          // Có thể redirect về home thay vì login
          setTimeout(() => navigate('/'), 2000);
        } else {
          // Nếu không auto login thì redirect về login
          setTimeout(() => navigate('/login'), 2000);
        }
      } else {
        setError(response.message || 'Đăng ký thất bại!');
      }
    } catch (err) {
      console.error('Registration error:', err);
      if (err.response && err.response.data) {
        setError(err.response.data.message || 'Đăng ký thất bại!');
      } else {
        setError(err.message || 'Đăng ký thất bại! Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #ff6b6b 0%, #4ecdc4 50%, #45b7d1 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      py: 3
    }}>
      <Container maxWidth="md">
        <Card 
          elevation={24}
          sx={{ 
            borderRadius: 4,
            overflow: 'hidden',
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}
        >
          {loading && (
            <LinearProgress 
              sx={{ 
                height: 3,
                backgroundColor: 'rgba(255, 107, 107, 0.1)',
                '& .MuiLinearProgress-bar': {
                  background: 'linear-gradient(90deg, #ff6b6b 0%, #4ecdc4 50%, #45b7d1 100%)'
                }
              }} 
            />
          )}
          
          <CardContent sx={{ p: 5 }}>
            {/* Header */}
            <Box sx={{ textAlign: 'center', mb: 4 }}>
              <Avatar 
                sx={{ 
                  width: 80, 
                  height: 80, 
                  mx: 'auto', 
                  mb: 2,
                  background: 'linear-gradient(135deg, #ff6b6b 0%, #4ecdc4 50%, #45b7d1 100%)',
                  fontSize: '2rem'
                }}
              >
                <PersonAdd fontSize="large" />
              </Avatar>
              
              <Typography 
                variant="h4" 
                component="h1"
                sx={{ 
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, #ff6b6b 0%, #4ecdc4 50%, #45b7d1 100%)',
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  mb: 1
                }}
              >
                Tạo tài khoản mới
              </Typography>
              
              <Typography 
                variant="body1" 
                color="text.secondary"
                sx={{ fontWeight: 400 }}
              >
                Điền thông tin để bắt đầu sử dụng hệ thống
              </Typography>
            </Box>

            {/* Alerts */}
            {error && (
              <Alert 
                severity="error" 
                sx={{ 
                  mb: 3,
                  borderRadius: 2,
                  '& .MuiAlert-icon': { fontSize: '1.5rem' }
                }}
              >
                {error}
              </Alert>
            )}

            {success && (
              <Alert 
                severity="success" 
                sx={{ 
                  mb: 3,
                  borderRadius: 2,
                  '& .MuiAlert-icon': { fontSize: '1.5rem' }
                }}
              >
                {success}
              </Alert>
            )}

            {/* Form */}
            <Box component="form" onSubmit={handleSubmit}>
              {/* Name Field */}
              <TextField
                label="Họ và tên"
                fullWidth
                margin="normal"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={loading}
                required
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Person color="action" />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  mb: 2,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 3,
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    },
                    '&.Mui-focused': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 4px 12px rgba(255, 107, 107, 0.3)'
                    }
                  }
                }}
              />

              {/* Username Field */}
              <TextField
                label="Tên đăng nhập"
                fullWidth
                margin="normal"
                value={username}
                onChange={e => setUsername(e.target.value)}
                disabled={loading}
                required
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Person color="action" />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  mb: 2,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 3,
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    },
                    '&.Mui-focused': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 4px 12px rgba(255, 107, 107, 0.3)'
                    }
                  }
                }}
              />

              {/* Email Field */}
              <TextField
                label="Email"
                type="email"
                fullWidth
                margin="normal"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={loading}
                required
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Email color="action" />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  mb: 2,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 3,
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    },
                    '&.Mui-focused': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 4px 12px rgba(78, 205, 196, 0.3)'
                    }
                  }
                }}
              />

              {/* Phone Field */}
              <TextField
                label="Số điện thoại"
                fullWidth
                margin="normal"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                disabled={loading}
                required
                placeholder="0123456789"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Phone color="action" />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  mb: 2,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 3,
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    },
                    '&.Mui-focused': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 4px 12px rgba(69, 183, 209, 0.3)'
                    }
                  }
                }}
              />

              {/* Password Field */}
              <TextField
                label="Mật khẩu"
                type={showPassword ? 'text' : 'password'}
                fullWidth
                margin="normal"
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  validatePassword(e.target.value);
                }}
                disabled={loading}
                required
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Lock color="action" />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                        disabled={loading}
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={{
                  mb: 1,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 3,
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    },
                    '&.Mui-focused': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 4px 12px rgba(69, 183, 209, 0.3)'
                    }
                  }
                }}
              />

              {/* Password Strength Indicator */}
              {password && (
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Typography variant="body2" sx={{ mr: 1 }}>
                      Độ mạnh:
                    </Typography>
                    <Chip 
                      label={getStrengthText(passwordStrength)}
                      size="small"
                      sx={{ 
                        backgroundColor: getStrengthColor(passwordStrength),
                        color: 'white',
                        fontWeight: 600
                      }}
                    />
                  </Box>
                  <LinearProgress 
                    variant="determinate" 
                    value={passwordStrength} 
                    sx={{
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: 'rgba(0,0,0,0.1)',
                      '& .MuiLinearProgress-bar': {
                        backgroundColor: getStrengthColor(passwordStrength),
                        borderRadius: 3,
                      }
                    }}
                  />
                </Box>
              )}

              {/* Password Requirements */}
              <Collapse in={passwordErrors.length > 0}>
                <Alert 
                  severity="warning" 
                  sx={{ 
                    mb: 2,
                    borderRadius: 2,
                    '& .MuiAlert-message': { width: '100%' }
                  }}
                >
                  <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
                    Yêu cầu mật khẩu:
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {passwordErrors.map((error, index) => (
                      <Chip
                        key={index}
                        label={error}
                        size="small"
                        color="warning"
                        icon={<ErrorIcon />}
                      />
                    ))}
                  </Box>
                </Alert>
              </Collapse>

              {/* Submit Button */}
              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={loading || passwordErrors.length > 0}
                sx={{
                  py: 1.5,
                  mb: 2,
                  borderRadius: 3,
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  background: 'linear-gradient(135deg, #ff6b6b 0%, #4ecdc4 50%, #45b7d1 100%)',
                  boxShadow: '0 4px 15px rgba(255, 107, 107, 0.4)',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: '0 6px 20px rgba(255, 107, 107, 0.6)',
                  },
                  '&:disabled': {
                    background: '#cccccc',
                    transform: 'none',
                    boxShadow: 'none'
                  }
                }}
              >
                {loading ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}
              </Button>

              {/* Divider */}
              <Divider sx={{ my: 3 }}>
                <Typography variant="body2" color="text.secondary">
                  hoặc
                </Typography>
              </Divider>

              {/* Login Button */}
              <Button
                fullWidth
                variant="outlined"
                onClick={() => navigate('/login')}
                disabled={loading}
                sx={{
                  py: 1.5,
                  borderRadius: 3,
                  fontSize: '1rem',
                  fontWeight: 500,
                  textTransform: 'none',
                  borderColor: '#ff6b6b',
                  color: '#ff6b6b',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    borderColor: '#ff6b6b',
                    backgroundColor: 'rgba(255, 107, 107, 0.1)',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 4px 12px rgba(255, 107, 107, 0.2)'
                  }
                }}
              >
                Đã có tài khoản? Đăng nhập
              </Button>
            </Box>

            {/* Footer */}
            <Box sx={{ textAlign: 'center', mt: 4 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                Bằng việc đăng ký, bạn đồng ý với điều khoản sử dụng
              </Typography>
              <Typography variant="caption" color="text.secondary">
                © 2025 License Plate Recognition System
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}

export default Register;