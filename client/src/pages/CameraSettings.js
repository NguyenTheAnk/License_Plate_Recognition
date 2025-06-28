import React, { useState } from 'react';
import {
  Box, Typography, Paper, TextField, Button, Grid, MenuItem, Select, InputLabel, FormControl
} from '@mui/material';

const CAMERA_DATA = {
  new: {
    mode: 'Xem trực tiếp (liveview)',
    screenCode: 'fkl6keMfl3',
    name: 'Some Stream',
    tag: '',
    days: 5,
    note: ''
  },
  cam1: {
    mode: 'Ghi hình',
    screenCode: 'cam1folder',
    name: 'Camera 1',
    tag: 'Nhóm 1',
    days: 7,
    note: 'Camera ngoài cổng'
  },
  cam2: {
    mode: 'Xem trực tiếp (liveview)',
    screenCode: 'cam2folder',
    name: 'Camera 2',
    tag: 'Nhóm 2',
    days: 3,
    note: 'Camera trong nhà'
  }
};

function CameraSettings() {
  const [camera, setCamera] = useState('new');
  const [room, setRoom] = useState('');
  const [mode, setMode] = useState(CAMERA_DATA['new'].mode);
  const [screenCode, setScreenCode] = useState(CAMERA_DATA['new'].screenCode);
  const [name, setName] = useState(CAMERA_DATA['new'].name);
  const [tag, setTag] = useState(CAMERA_DATA['new'].tag);
  const [days, setDays] = useState(CAMERA_DATA['new'].days);
  const [note, setNote] = useState(CAMERA_DATA['new'].note);

  // Đầu vào
  const [analyzeTime, setAnalyzeTime] = useState('0');
  const [probeSize, setProbeSize] = useState('32');
  const [fps, setFps] = useState('');
  const [displayTime, setDisplayTime] = useState('');

  // Chuỗi phát trực tuyến
  const [streamType, setStreamType] = useState('Mjpeg');
  const [frameRatio, setFrameRatio] = useState('25');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [rotate, setRotate] = useState('');

  // Tua nhanh thời gian
  const [timelapseActive, setTimelapseActive] = useState('');

  // Cài đặt giám sát chuyển động
  const [motionActive, setMotionActive] = useState('Không');

  // Điều khiển
  const [canControl, setCanControl] = useState('Có');
  const [callMethod, setCallMethod] = useState('ONVIF');
  const [onvifControl, setOnvifControl] = useState('Using Preset 1, Non-Standard, Hikvision Clone');
  const [stopCommand, setStopCommand] = useState('Khi click chuột');
  const [stopDelay, setStopDelay] = useState('500');
  const [rotateSpeed, setRotateSpeed] = useState('0.5');
  const [ptz, setPtz] = useState('Không');

  // Sao chép cài đặt
  const [copySetting, setCopySetting] = useState('Không');

  // Ghi nhật ký
  const [logLevel, setLogLevel] = useState('Tất cả các cảnh báo');
  const [logToDb, setLogToDb] = useState('Không');

  // Thiết lập kết nối
  const [inputType, setInputType] = useState('');
  const [autoConfig, setAutoConfig] = useState('');
  const [fullUrl, setFullUrl] = useState('');
  const [retry, setRetry] = useState('');
  const [skipPing, setSkipPing] = useState('');
  const [onvif, setOnvif] = useState('');
  const [onvifPort, setOnvifPort] = useState('');

  const handleCameraChange = (e) => {
    const value = e.target.value;
    setCamera(value);
    setMode(CAMERA_DATA[value].mode);
    setScreenCode(CAMERA_DATA[value].screenCode);
    setName(CAMERA_DATA[value].name);
    setTag(CAMERA_DATA[value].tag);
    setDays(CAMERA_DATA[value].days);
    setNote(CAMERA_DATA[value].note);
  };

  return (
    <Box sx={{ minHeight: '100vh', background: '#d3d3d3', p: 2 }}>
      <Grid container spacing={2} justifyContent="center">
        {/* Card cấu hình camera */}
        <Grid item xs={12} md={10} lg={8}>
          <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3, mb: 2 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2, borderBottom: '2px dashed #43a047', pb: 1 }}>
              Cấu hình camera : Thêm mới
            </Typography>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Chọn camera</InputLabel>
              <Select
                value={camera}
                label="Chọn camera"
                onChange={handleCameraChange}
              >
                <MenuItem value="new">Thêm mới</MenuItem>
                <MenuItem value="cam1">Camera 1</MenuItem>
                <MenuItem value="cam2">Camera 2</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Giảng đường"
              value={room}
              onChange={e => setRoom(e.target.value)}
              fullWidth
              sx={{ mb: 2 }}
            />
            <Button variant="contained" color="success" fullWidth sx={{ fontWeight: 700, py: 1 }}>
              Làm mới
            </Button>
          </Paper>
        </Grid>

        {/* Card thông tin camera */}
        <Grid item xs={12} md={10} lg={8}>
          <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3, mb: 2 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2, borderBottom: '2px dashed #888', pb: 1 }}>
              Thông tin camera
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Chế độ giám sát"
                  value={mode}
                  onChange={e => setMode(e.target.value)}
                  fullWidth
                  sx={{ mb: 2 }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Mã màn hình giám sát"
                  value={screenCode}
                  onChange={e => setScreenCode(e.target.value)}
                  fullWidth
                  sx={{ mb: 2 }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Tên camera"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  fullWidth
                  sx={{ mb: 2 }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Thẻ"
                  value={tag}
                  onChange={e => setTag(e.target.value)}
                  fullWidth
                  sx={{ mb: 2 }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Số ngày để giữ Video"
                  value={days}
                  onChange={e => setDays(e.target.value)}
                  fullWidth
                  sx={{ mb: 2 }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Ghi chú"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  fullWidth
                  sx={{ mb: 2 }}
                />
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Card Thiết lập kết nối */}
        <Grid item xs={12} md={10} lg={8}>
          <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3, mb: 2 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2, borderBottom: '2px dotted #bfa047', pb: 1 }}>
              Thiết lập kết nối
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Kiểu đầu vào"
                  value={inputType}
                  onChange={e => setInputType(e.target.value)}
                  fullWidth
                  sx={{ mb: 2 }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Tự động cấu hình đường dẫn camera"
                  value={autoConfig}
                  onChange={e => setAutoConfig(e.target.value)}
                  fullWidth
                  sx={{ mb: 2 }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Đường dẫn URL đầy đủ"
                  value={fullUrl}
                  onChange={e => setFullUrl(e.target.value)}
                  fullWidth
                  sx={{ mb: 2 }}
                  placeholder="Example : rtsp://username:password@123.123.123.123/stream/1"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Thử kết nối lại"
                  value={retry}
                  onChange={e => setRetry(e.target.value)}
                  fullWidth
                  sx={{ mb: 2 }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Bỏ qua ping"
                  value={skipPing}
                  onChange={e => setSkipPing(e.target.value)}
                  fullWidth
                  sx={{ mb: 2 }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Camera chuẩn ONVIF"
                  value={onvif}
                  onChange={e => setOnvif(e.target.value)}
                  fullWidth
                  sx={{ mb: 2 }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Cổng Onvif"
                  value={onvifPort}
                  onChange={e => setOnvifPort(e.target.value)}
                  fullWidth
                  sx={{ mb: 2 }}
                />
              </Grid>
            </Grid>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 2 }}>
              <Button variant="contained" color="success" fullWidth sx={{ fontWeight: 700, py: 1, fontSize: 16 }}>
                <span role="img" aria-label="search">🔍</span> Thăm dò
              </Button>
              <Button variant="contained" fullWidth sx={{ fontWeight: 700, py: 1, fontSize: 16, bgcolor: '#bfa047', color: '#fff', '&:hover': { bgcolor: '#a88c2c' } }}>
                <span role="img" aria-label="onvif">⚙️</span> Trình quản lý thiết bị ONVIF
              </Button>
            </Box>
          </Paper>
        </Grid>

        {/* Card Đầu vào */}
        <Grid item xs={12} md={10} lg={8}>
          <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3, mb: 2 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2, borderBottom: '2px dashed #43a047', pb: 1 }}>
              Đầu vào
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Thời gian phân tích"
                  value={analyzeTime}
                  onChange={e => setAnalyzeTime(e.target.value)}
                  fullWidth
                  sx={{ mb: 2 }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Kích thước thăm dò"
                  value={probeSize}
                  onChange={e => setProbeSize(e.target.value)}
                  fullWidth
                  sx={{ mb: 2 }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Tốc độ ghi hình của camera (FPS)"
                  value={fps}
                  onChange={e => setFps(e.target.value)}
                  fullWidth
                  sx={{ mb: 2 }}
                  placeholder="Example : 25"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Thời gian hiển thị"
                  value={displayTime}
                  onChange={e => setDisplayTime(e.target.value)}
                  fullWidth
                  sx={{ mb: 2 }}
                />
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Card Chuỗi phát trực tuyến */}
        <Grid item xs={12} md={10} lg={8}>
          <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3, mb: 2, border: '1px dotted #1976d2' }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2, color: '#1976d2', borderBottom: '2px dotted #1976d2', pb: 1 }}>
              Chuỗi phát trực tuyến
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField label="Loại phát trực tuyến" value={streamType} onChange={e => setStreamType(e.target.value)} fullWidth sx={{ mb: 2 }} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField label="Tỷ lệ khung hình" value={frameRatio} onChange={e => setFrameRatio(e.target.value)} fullWidth sx={{ mb: 2 }} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField label="Chiều rộng" value={width} onChange={e => setWidth(e.target.value)} fullWidth sx={{ mb: 2 }} placeholder="Example : 640" />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField label="Chiều cao" value={height} onChange={e => setHeight(e.target.value)} fullWidth sx={{ mb: 2 }} placeholder="Example : 480" />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField label="Quay" value={rotate} onChange={e => setRotate(e.target.value)} fullWidth sx={{ mb: 2 }} />
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Card Tua nhanh thời gian */}
        <Grid item xs={12} md={10} lg={8}>
          <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3, mb: 2, border: '1px dotted #d32f2f', background: '#fff8f8' }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2, color: '#d32f2f', borderBottom: '2px dotted #d32f2f', pb: 1 }}>
              Tua nhanh thời gian
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField label="Kích hoạt" value={timelapseActive} onChange={e => setTimelapseActive(e.target.value)} fullWidth sx={{ mb: 2 }} />
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Card Cài đặt giám sát chuyển động */}
        <Grid item xs={12} md={10} lg={8}>
          <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3, mb: 2, border: '1px dotted #bfa047', background: '#fdfaf4' }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2, color: '#bfa047', borderBottom: '2px dotted #bfa047', pb: 1 }}>
              Cài đặt giám sát chuyển động
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField label="Kích hoạt" value={motionActive} onChange={e => setMotionActive(e.target.value)} fullWidth sx={{ mb: 2 }} />
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Card Điều khiển */}
        <Grid item xs={12} md={10} lg={8}>
          <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3, mb: 2, border: '1px dotted #1976d2', background: '#f4f8fd' }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2, color: '#1976d2', borderBottom: '2px dotted #1976d2', pb: 1 }}>
              Điều khiển
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField label="Có thể kiểm soát được" value={canControl} onChange={e => setCanControl(e.target.value)} fullWidth sx={{ mb: 2 }} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField label="Phương thức gọi" value={callMethod} onChange={e => setCallMethod(e.target.value)} fullWidth sx={{ mb: 2 }} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField label="Điều khiển ONVIF" value={onvifControl} onChange={e => setOnvifControl(e.target.value)} fullWidth sx={{ mb: 2 }} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField label="Dừng lệnh" value={stopCommand} onChange={e => setStopCommand(e.target.value)} fullWidth sx={{ mb: 2 }} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField label="Dừng thời gian chờ" value={stopDelay} onChange={e => setStopDelay(e.target.value)} fullWidth sx={{ mb: 2 }} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField label="Tốc độ quay" value={rotateSpeed} onChange={e => setRotateSpeed(e.target.value)} fullWidth sx={{ mb: 2 }} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField label="Theo dõi PTZ" value={ptz} onChange={e => setPtz(e.target.value)} fullWidth sx={{ mb: 2 }} />
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Card Sao chép cài đặt */}
        <Grid item xs={12} md={10} lg={8}>
          <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3, mb: 2, border: '1px dotted #bfa047', background: '#fdfaf4' }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2, color: '#bfa047', borderBottom: '2px dotted #bfa047', pb: 1 }}>
              Sao chép cài đặt
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField label="Sao chép vào các camera đã được chọn" value={copySetting} onChange={e => setCopySetting(e.target.value)} fullWidth sx={{ mb: 2 }} />
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Card Ghi nhật ký */}
        <Grid item xs={12} md={10} lg={8}>
          <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3, mb: 2, border: '1px dotted #43a047', background: '#f4fdf4' }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2, color: '#43a047', borderBottom: '2px dotted #43a047', pb: 1 }}>
              Ghi nhật ký
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField label="Mức độ lưu nhật ký" value={logLevel} onChange={e => setLogLevel(e.target.value)} fullWidth sx={{ mb: 2 }} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField label="Lưu nhật ký vào cơ sở dữ liệu" value={logToDb} onChange={e => setLogToDb(e.target.value)} fullWidth sx={{ mb: 2 }} />
              </Grid>
            </Grid>
            <Paper sx={{ p: 2, mt: 2, border: '1px dotted #43a047', background: '#f8fff8' }}>
              <Typography variant="h6" fontWeight={700}>Nhật ký</Typography>
            </Paper>
          </Paper>
        </Grid>

        {/* Nút điều khiển chung */}
        <Grid item xs={12} md={10} lg={8}>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 2, mb: 4 }}>
            <Button 
              variant="outlined" 
              color="inherit"
              sx={{ minWidth: 120 }}
            >
              Giản dị
            </Button>
            <Button 
              variant="contained" 
              color="success"
              sx={{ minWidth: 120 }}
            >
              Lưu
            </Button>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}

export default CameraSettings;
