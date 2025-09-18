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
  Checkbox,
  FormControlLabel,
  Fade,
  Slide
} from '@mui/material';
import { 
  Visibility, 
  VisibilityOff, 
  Login as LoginIcon,
  Person,
  Lock,
  Email,
  Security,
  Shield,
  VpnKey
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { postData } from '../../utils/auth.js';

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showWelcome] = useState(true);
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
      const response = await postData('api/auth/login', { 
        email, 
        password 
      });
      if (response.success && response.data) {
        const { token, refreshToken, user } = response.data;
        localStorage.setItem('token', token);
        if (refreshToken) {
          localStorage.setItem('refreshToken', refreshToken);
        }
        localStorage.setItem('user', JSON.stringify(user));
        if (rememberMe) {
          localStorage.setItem('rememberMe', 'true');
          localStorage.setItem('savedEmail', email);
        } else {
          localStorage.removeItem('rememberMe');
          localStorage.removeItem('savedEmail');
        }
        if (onLogin) onLogin(user);
        navigate('/');
      } else {
        setError(response.message || 'Đăng nhập thất bại!');
      }
    } catch (err) {
      setError('Lỗi kết nối hoặc sai thông tin đăng nhập!');
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
            // background: `
            //   radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.3) 0%, transparent 50%),
            //   radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
            //   radial-gradient(circle at 40% 40%, rgba(120, 119, 198, 0.2) 0%, transparent 50%)
            // `,
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

      {/* Right: Login form */}
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
              width: { xs: '100%', sm: '480px' },
              maxWidth: '100%',
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
              <Box sx={{ textAlign: 'center', mb: 4 }}>
                <Fade in={true} timeout={1000}>
                  <Avatar 
                    sx={{ 
                      width: 80, 
                      height: 80, 
                      mx: 'auto', 
                      mb: 3,
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      fontSize: '2rem',
                      boxShadow: '0 8px 32px rgba(102, 126, 234, 0.4)',
                      transition: 'transform 0.3s ease',
                      '&:hover': {
                        transform: 'scale(1.05)'
                      }
                    }}
                  >
                    <LoginIcon fontSize="large" />
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
                  Đăng nhập hệ thống
                </Typography>
                <Typography 
                  variant="body1" 
                  color="text.secondary"
                  sx={{ fontWeight: 400 }}
                >
                  Vui lòng nhập đầy đủ thông tin đăng nhập
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
                  placeholder="Nhập email của bạn"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Email sx={{ color: '#667eea' }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    mb: 3,
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
                  label="Mật khẩu"
                  type={showPassword ? 'text' : 'password'}
                  fullWidth
                  margin="normal"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
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
                          aria-label="toggle password visibility"
                          onClick={() => setShowPassword((show) => !show)}
                          edge="end"
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    )
                  }}
                  sx={{
                    mb: 3,
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

                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  mb: 4 
                }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={rememberMe}
                        onChange={e => setRememberMe(e.target.checked)}
                        sx={{
                          color: '#667eea',
                          '&.Mui-checked': {
                            color: '#667eea',
                          }
                        }}
                        disabled={loading}
                      />
                    }
                    label="Ghi nhớ đăng nhập"
                  />
                  <Link 
                    href="#" 
                    underline="hover" 
                    sx={{ 
                      color: '#667eea', 
                      fontWeight: 500,
                      '&:hover': {
                        color: '#5a6fd8'
                      }
                    }}
                  >
                    Quên mật khẩu?
                  </Link>
                </Box>

                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  disabled={loading}
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
                      <LoginIcon sx={{ mr: 1, animation: 'spin 1s linear infinite' }} />
                      Đang đăng nhập...
                    </Box>
                  ) : (
                    'Đăng nhập'
                  )}
                </Button>
              </Box>
              
              <Box sx={{ textAlign: 'center', mt: 2, mb: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Chưa có tài khoản?
                </Typography>
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={() => navigate('/register')}
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
                  Đăng ký tài khoản mới
                </Button>
              </Box>
              
              <Box sx={{ textAlign: 'center', mt: 3, pt: 3, borderTop: '1px solid #e2e8f0' }}>
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

export default Login;