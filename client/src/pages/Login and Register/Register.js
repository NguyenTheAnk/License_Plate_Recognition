import React, { useState, useEffect } from 'react';
import { 
  TextField, 
  Button, 
  Typography, 
  Box, 
  Alert, 
  InputAdornment,
  IconButton,
  LinearProgress,
  Card,
  CardContent,
  Avatar,
  Link,
  Collapse,
  Fade,
  Slide
} from '@mui/material';
import { 
  Visibility, 
  VisibilityOff, 
  PersonAdd,
  Person,
  Lock,
  Email,
  Phone,
  Security,
  Shield,
  VpnKey
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { postData } from '../../utils/auth.js';

function Register() {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [showWelcome] = useState(true);
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
    if (strength < 40) return '#ef4444';
    if (strength < 80) return '#f59e0b';
    return '#10b981';
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
      display: 'flex',
      flexDirection: 'row',
      background: { xs: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', md: 'none' },
    }}>
      {/* Left: Background + Welcome */}
      <Box
        sx={{
          flex: { xs: 0, md: '0 0 70%' },
          display: { xs: 'none', md: 'flex' },
          alignItems: 'center',
          justifyContent: 'center',
          background: 'url(/background.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          position: 'relative',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            //background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.7) 0%, rgba(118, 75, 162, 0.7) 100%)',
            zIndex: 0,
          }
        }}
      >
        <Box sx={{
          position: 'relative',
          zIndex: 1,
          color: '#fff',
          textAlign: 'center',
          px: 6,
          py: 8,
          maxWidth: 700,
        }}>
          <Slide direction="right" in={true} timeout={800}>
            <Box>
              <Avatar 
                sx={{ 
                  width: 120, 
                  height: 120, 
                  mx: 'auto', 
                  mb: 4,
                  background: 'rgba(255, 255, 255, 0.2)',
                  backdropFilter: 'blur(10px)',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                }}
              >
                <Shield sx={{ fontSize: '4rem', color: '#fff' }} />
              </Avatar>
              <Typography variant="h2" component="h1" sx={{ 
                fontWeight: 800, 
                mb: 3, 
                textShadow: '2px 2px 4px rgba(0,0,0,0.3)',
                background: 'linear-gradient(45deg, #fff, #e3f2fd)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontSize: { xs: '2.5rem', md: '3.5rem' }
              }}>
                LPR SYSTEM
              </Typography>
            </Box>
          </Slide>
          <Fade in={true} timeout={1500}>
            <Typography variant="h4" sx={{ 
              mb: 4, 
              textShadow: '1px 1px 3px rgba(0,0,0,0.2)',
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.95)'
            }}>
              Hệ thống nhận diện biển số xe
            </Typography>
          </Fade>
          <Fade in={true} timeout={2000}>
            <Box sx={{ 
              display: 'flex', 
              justifyContent: 'center', 
              gap: 4, 
              mb: 4,
              flexWrap: 'wrap'
            }}>
              {[
                { icon: <Security />, text: 'Bảo mật cao' },
                { icon: <VpnKey />, text: 'Tin cậy' },
                { icon: <Shield />, text: 'Hiệu quả' }
              ].map((item, index) => (
                <Box key={index} sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 1,
                  background: 'rgba(255, 255, 255, 0.1)',
                  backdropFilter: 'blur(10px)',
                  px: 3,
                  py: 1.5,
                  borderRadius: 3,
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}>
                  {item.icon}
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>
                    {item.text}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Fade>
          <Fade in={true} timeout={2500}>
            <Typography variant="body1" sx={{ 
              opacity: 0.9, 
              textShadow: '1px 1px 2px rgba(0,0,0,0.1)',
              fontSize: '1.1rem',
              lineHeight: 1.6,
              maxWidth: 500,
              mx: 'auto'
            }}>
              Giải pháp công nghệ tiên tiến cho việc quản lý và giám sát phương tiện giao thông
            </Typography>
          </Fade>
        </Box>
      </Box>

      {/* Right: Register form */}
      <Box
        sx={{
          flex: { xs: 1, md: '0 0 30%' },
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: { 
            xs: 'rgba(255, 255, 255, 0.1)', 
            md: 'linear-gradient(145deg, #f8fafc 0%, #e2e8f0 100%)' 
          },
          backdropFilter: { xs: 'blur(20px)', md: 'none' },
          position: 'relative',
          px: { xs: 3, md: 4 },
        }}
      >
        <Slide direction="left" in={showWelcome} timeout={800}>
          <Card 
            elevation={24}
            sx={{ 
              borderRadius: 6,
              overflow: 'hidden',
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.1)',
              transition: 'all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)',
              width: { xs: '100%', sm: '520px' },
              maxWidth: '100%',
              maxHeight: '95vh',
              overflowY: 'auto',
              '&:hover': {
                transform: 'translateY(-8px)',
                boxShadow: '0 32px 80px rgba(0, 0, 0, 0.15)'
              }
            }}
          >
            {loading && (
              <LinearProgress 
                sx={{ 
                  height: 4,
                  background: 'linear-gradient(90deg, #667eea, #764ba2)',
                  '& .MuiLinearProgress-bar': {
                    background: 'linear-gradient(90deg, #667eea, #764ba2)',
                  }
                }} 
              />
            )}
            
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ textAlign: 'center', mb: 3 }}>
                <Fade in={true} timeout={1000}>
                  <Avatar 
                    sx={{ 
                      width: 80, 
                      height: 80, 
                      mx: 'auto', 
                      mb: 2,
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      fontSize: '2rem',
                      boxShadow: '0 8px 32px rgba(102, 126, 234, 0.4)',
                      transition: 'transform 0.3s ease',
                      '&:hover': {
                        transform: 'scale(1.05)'
                      }
                    }}
                  >
                    <PersonAdd fontSize="large" />
                  </Avatar>
                </Fade>
                
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
                  Tạo tài khoản
                </Typography>
                <Typography 
                  variant="body1" 
                  color="text.secondary"
                  sx={{ fontWeight: 400 }}
                >
                  Điền thông tin để bắt đầu sử dụng
                </Typography>
              </Box>

              {error && (
                <Fade in={!!error}>
                  <Alert 
                    severity="error" 
                    sx={{ 
                      mb: 3,
                      borderRadius: 3,
                      border: '1px solid #ffcdd2',
                      background: 'linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%)',
                      animation: 'shake 0.5s ease-in-out',
                      '@keyframes shake': {
                        '0%': { transform: 'translateX(0)' },
                        '25%': { transform: 'translateX(-5px)' },
                        '50%': { transform: 'translateX(5px)' },
                        '75%': { transform: 'translateX(-5px)' },
                        '100%': { transform: 'translateX(0)' }
                      }
                    }}
                  >
                    {error}
                  </Alert>
                </Fade>
              )}

              {success && (
                <Fade in={!!success}>
                  <Alert 
                    severity="success" 
                    sx={{ 
                      mb: 3,
                      borderRadius: 3,
                      border: '1px solid #c8e6c9',
                      background: 'linear-gradient(135deg, #e8f5e8 0%, #c8e6c9 100%)',
                    }}
                  >
                    {success}
                  </Alert>
                </Fade>
              )}

              <Box component="form" onSubmit={handleSubmit}>
                {/* Name and Username Fields */}
                <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, mb: 2 }}>
                  <TextField
                    label="Họ và tên"
                    fullWidth
                    value={name}
                    onChange={e => setName(e.target.value)}
                    disabled={loading}
                    required
                    placeholder="Nhập họ và tên"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Person sx={{ color: '#667eea' }} />
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 3,
                        transition: 'all 0.3s ease',
                        '&:hover': {
                          boxShadow: '0 4px 20px rgba(102, 126, 234, 0.15)'
                        },
                        '&.Mui-focused': {
                          boxShadow: '0 4px 20px rgba(102, 126, 234, 0.25)'
                        }
                      }
                    }}
                  />

                  <TextField
                    label="Tên đăng nhập"
                    fullWidth
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    disabled={loading}
                    required
                    placeholder="Tên đăng nhập"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Person sx={{ color: '#667eea' }} />
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 3,
                        transition: 'all 0.3s ease',
                        '&:hover': {
                          boxShadow: '0 4px 20px rgba(102, 126, 234, 0.15)'
                        },
                        '&.Mui-focused': {
                          boxShadow: '0 4px 20px rgba(102, 126, 234, 0.25)'
                        }
                      }
                    }}
                  />
                </Box>

                {/* Email and Phone Fields */}
                <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, mb: 2 }}>
                  <TextField
                    label="Email"
                    type="email"
                    fullWidth
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    disabled={loading}
                    required
                    placeholder="Email của bạn"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Email sx={{ color: '#667eea' }} />
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 3,
                        transition: 'all 0.3s ease',
                        '&:hover': {
                          boxShadow: '0 4px 20px rgba(102, 126, 234, 0.15)'
                        },
                        '&.Mui-focused': {
                          boxShadow: '0 4px 20px rgba(102, 126, 234, 0.25)'
                        }
                      }
                    }}
                  />

                  <TextField
                    label="Số điện thoại"
                    fullWidth
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    disabled={loading}
                    required
                    placeholder="0123456789"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Phone sx={{ color: '#667eea' }} />
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 3,
                        transition: 'all 0.3s ease',
                        '&:hover': {
                          boxShadow: '0 4px 20px rgba(102, 126, 234, 0.15)'
                        },
                        '&.Mui-focused': {
                          boxShadow: '0 4px 20px rgba(102, 126, 234, 0.25)'
                        }
                      }
                    }}
                  />
                </Box>

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
                  placeholder="Nhập mật khẩu"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Lock sx={{ color: '#667eea' }} />
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
                    mb: 2,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 3,
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        boxShadow: '0 4px 20px rgba(102, 126, 234, 0.15)'
                      },
                      '&.Mui-focused': {
                        boxShadow: '0 4px 20px rgba(102, 126, 234, 0.25)'
                      }
                    }
                  }}
                />

                {/* Password Strength Indicator */}
                {password && (
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                        Độ mạnh mật khẩu:
                      </Typography>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          color: getStrengthColor(passwordStrength),
                          textTransform: 'uppercase'
                        }}
                      >
                        {getStrengthText(passwordStrength)}
                      </Typography>
                    </Box>
                    <LinearProgress 
                      variant="determinate" 
                      value={passwordStrength} 
                      sx={{
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: '#e2e8f0',
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: getStrengthColor(passwordStrength),
                          borderRadius: 4,
                          transition: 'all 0.3s ease'
                        }
                      }}
                    />
                  </Box>
                )}

                {/* Password Requirements */}
                <Collapse in={passwordErrors.length > 0}>
                  <Box sx={{ 
                    mb: 3, 
                    p: 2.5, 
                    borderRadius: 3, 
                    background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                    border: '1px solid #f59e0b'
                  }}>
                    <Typography variant="body2" fontWeight={600} sx={{ mb: 1.5, color: '#d97706', fontSize: '0.9rem' }}>
                      ⚠️ Yêu cầu mật khẩu:
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1 }}>
                      {passwordErrors.map((error, index) => (
                        <Box
                          key={index}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            fontSize: '0.8rem',
                            color: '#b45309',
                            fontWeight: 500,
                            p: 0.5,
                            borderRadius: 2,
                            background: 'rgba(185, 83, 9, 0.1)',
                            '&::before': {
                              content: '"•"',
                              marginRight: 0.5,
                              color: '#f59e0b'
                            }
                          }}
                        >
                          {error}
                        </Box>
                      ))}
                    </Box>
                  </Box>
                </Collapse>

                {/* Submit Button */}
                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  disabled={loading || passwordErrors.length > 0}
                  sx={{
                    py: 1.8,
                    borderRadius: 3,
                    fontSize: '1.1rem',
                    fontWeight: 600,
                    textTransform: 'none',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    boxShadow: '0 8px 32px rgba(102, 126, 234, 0.4)',
                    mb: 3,
                    '&:hover': {
                      background: 'linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%)',
                      boxShadow: '0 12px 40px rgba(102, 126, 234, 0.5)',
                      transform: 'translateY(-2px)'
                    },
                    '&:disabled': {
                      background: '#e2e8f0',
                      boxShadow: 'none',
                      transform: 'none'
                    }
                  }}
                >
                  {loading ? (
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <PersonAdd sx={{ mr: 1, animation: 'spin 1s linear infinite' }} />
                      Đang tạo tài khoản...
                    </Box>
                  ) : (
                    'Tạo tài khoản'
                  )}
                </Button>
              </Box>
              
              <Box sx={{ textAlign: 'center', mb: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Đã có tài khoản? 
                </Typography>
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={() => navigate('/login')}
                  startIcon={<Person />}
                  sx={{
                    py: 1.2,
                    borderRadius: 3,
                    fontSize: '1rem',
                    fontWeight: 500,
                    textTransform: 'none',
                    borderColor: '#667eea',
                    color: '#667eea',
                    borderWidth: 2,
                    '&:hover': {
                      borderColor: '#5a6fd8',
                      backgroundColor: 'rgba(102, 126, 234, 0.04)',
                      borderWidth: 2,
                      transform: 'translateY(-1px)'
                    }
                  }}
                >
                  Chuyển đến đăng nhập
                </Button>
              </Box>
              
              <Box sx={{ textAlign: 'center', pt: 2, borderTop: '1px solid #e2e8f0' }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  © 2025 License Plate Recognition System
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Phiên bản 2.1.0 • Bảo mật & An toàn
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Slide>
      </Box>

      {/* CSS for animations */}
      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Box>
  );
}

export default Register;