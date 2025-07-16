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
  Avatar
} from '@mui/material';
import { 
  Visibility, 
  VisibilityOff, 
  Login as LoginIcon,
  Person,
  Lock,
  Email
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { postData } from '../../utils/auth.js';

function Login({ onLogin }) {
  const [email, setEmail] = useState(''); // Đổi từ username thành email
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (localStorage.getItem('token')) {
      navigate('/');
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    if (!email || !password) {
      setError('Vui lòng nhập đầy đủ thông tin đăng nhập!');
      setLoading(false);
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Vui lòng nhập đúng định dạng email!');
      setLoading(false);
      return;
    }

    try {
      console.log('=== LOGIN FRONTEND DEBUG ===');
      console.log('Sending login data:', { email, password: '[HIDDEN]' });
      
      const response = await postData('api/auth/login', { 
        email, 
        password 
      });
      
      console.log('Login response:', response);
      
      if (response.success && response.data) {
        const { token, refreshToken, user } = response.data;
        
        // Lưu token và refresh token
        localStorage.setItem('token', token);
        if (refreshToken) {
          localStorage.setItem('refreshToken', refreshToken);
        }
        
        // Lưu thông tin user
        localStorage.setItem('user', JSON.stringify(user));
        
        // Kiểm tra nếu mật khẩu hết hạn (nếu có field này trong response)
        if (user.passwordExpired) {
          localStorage.setItem('passwordExpired', 'true');
          onLogin(user);
          navigate('/change-password');
        } else {
          localStorage.removeItem('passwordExpired');
          onLogin(user);
          navigate('/');
        }
      } else {
        setError(response.message || 'Đăng nhập thất bại!');
      }
      
    } catch (err) {
      console.error('Login error:', err);
      if (err.response && err.response.data) {
        setError(err.response.data.message || 'Email hoặc mật khẩu không chính xác!');
      } else if (err.message) {
        setError(err.message);
      } else {
        setError('Có lỗi xảy ra khi đăng nhập. Vui lòng thử lại!');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      py: 3
    }}>
      <Container maxWidth="sm">
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
                backgroundColor: 'rgba(103, 126, 234, 0.1)',
                '& .MuiLinearProgress-bar': {
                  backgroundColor: '#667eea'
                }
              }} 
            />
          )}
          
          <CardContent sx={{ p: 5 }}>
            {/* Header với Logo/Avatar */}
            <Box sx={{ textAlign: 'center', mb: 4 }}>
              <Avatar 
                sx={{ 
                  width: 80, 
                  height: 80, 
                  mx: 'auto', 
                  mb: 2,
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  fontSize: '2rem'
                }}
              >
                <LoginIcon fontSize="large" />
              </Avatar>
              
              <Typography 
                variant="h4" 
                component="h1"
                sx={{ 
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  mb: 1
                }}
              >
                Chào mừng trở lại!
              </Typography>
              
              <Typography 
                variant="body1" 
                color="text.secondary"
                sx={{ fontWeight: 400 }}
              >
                Đăng nhập để tiếp tục sử dụng hệ thống
              </Typography>
            </Box>

            {/* Error Alert */}
            {error && (
              <Alert 
                severity="error" 
                sx={{ 
                  mb: 3,
                  borderRadius: 2,
                  '& .MuiAlert-icon': {
                    fontSize: '1.5rem'
                  }
                }}
              >
                {error}
              </Alert>
            )}

            {/* Login Form */}
            <Box component="form" onSubmit={handleSubmit}>
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
                      boxShadow: '0 4px 12px rgba(103, 126, 234, 0.3)'
                    }
                  }
                }}
              />

              <TextField
                label="Mật khẩu"
                type={showPassword ? 'text' : 'password'}
                fullWidth
                margin="normal"
                value={password}
                onChange={e => setPassword(e.target.value)}
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
                  mb: 3,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 3,
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    },
                    '&.Mui-focused': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 4px 12px rgba(103, 126, 234, 0.3)'
                    }
                  }
                }}
              />

              {/* Login Button */}
              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={loading}
                sx={{
                  py: 1.5,
                  mb: 2,
                  borderRadius: 3,
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  boxShadow: '0 4px 15px rgba(103, 126, 234, 0.4)',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%)',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 6px 20px rgba(103, 126, 234, 0.6)',
                  },
                  '&:disabled': {
                    background: '#cccccc',
                    transform: 'none',
                    boxShadow: 'none'
                  }
                }}
              >
                {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
              </Button>

              {/* Divider */}
              <Divider sx={{ my: 3 }}>
                <Typography variant="body2" color="text.secondary">
                  hoặc
                </Typography>
              </Divider>

              {/* Register Button */}
              <Button
                fullWidth
                variant="outlined"
                onClick={() => navigate('/register')}
                disabled={loading}
                sx={{
                  py: 1.5,
                  borderRadius: 3,
                  fontSize: '1rem',
                  fontWeight: 500,
                  textTransform: 'none',
                  borderColor: '#667eea',
                  color: '#667eea',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(103, 126, 234, 0.1)',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 4px 12px rgba(103, 126, 234, 0.2)'
                  }
                }}
              >
                Tạo tài khoản mới
              </Button>
            </Box>

            {/* Footer */}
            <Box sx={{ textAlign: 'center', mt: 4 }}>
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

export default Login;