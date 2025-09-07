import React, { useState } from 'react';
import { Box, Typography, Paper, TextField, Button, Grid, MenuItem, Select, InputLabel, FormControl } from '@mui/material';

function AccountSettings() {
  // Hồ sơ
  const [auto, setAuto] = useState('Không');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [rePassword, setRePassword] = useState('');
  const [maxStorage, setMaxStorage] = useState('100000');
  const [maxStorageSec, setMaxStorageSec] = useState('10000');
  const [videoDays, setVideoDays] = useState('10');
  const [eventDays, setEventDays] = useState('10');
  const [timelapseDays, setTimelapseDays] = useState('60');
  const [logDays, setLogDays] = useState('10');
  const [lang, setLang] = useState('vi_org');
  const [alertSound1, setAlertSound1] = useState('alert.mp3');
  const [alertSound2, setAlertSound2] = useState('pop.mp3');
  const [alertDelay, setAlertDelay] = useState('1');
  const [showEventScreen, setShowEventScreen] = useState('Không');

  // Đang xem trực tiếp
  const [camsPerRow, setCamsPerRow] = useState('3');
  const [switchScreensPerRow, setSwitchScreensPerRow] = useState('2');
  const [switchScreenCount, setSwitchScreenCount] = useState('4');
  const [switchScreenHeight, setSwitchScreenHeight] = useState('4');
  const [switchScreenTime, setSwitchScreenTime] = useState('30000');

  // Sở thích
  const [clockFormat, setClockFormat] = useState('$DAYNAME $DAY $MONTHNAME $YEAR');
  const [customCss, setCustomCss] = useState('#main-header{background: #fff}');
  const [hlsOption, setHlsOption] = useState('{}');
  const [camsPerRowPref, setCamsPerRowPref] = useState('');
  const [browserLog, setBrowserLog] = useState('Không');
  const [userLog, setUserLog] = useState('Có');
  const [theme, setTheme] = useState('Ice-v3');

  return (
    <Box sx={{ minHeight: '100vh', background: '#d3d3d3', p: 3, position: 'relative' }}>
      {/* Header tài khoản */}
      <Paper sx={{ p: 2, background: '#232f3e', color: '#fff', borderRadius: 2, mb: 3, minWidth: 400 }}>
        <Typography variant="h6" fontWeight={700} sx={{ opacity: 0.5 }}>admin</Typography>
        <Box sx={{ mt: 1 }}>
          <Typography sx={{ display: 'inline-block', background: '#1976d2', color: '#fff', borderRadius: 1, px: 2, py: 0.5, fontSize: 15, fontWeight: 700 }}>
            Khóa nhóm : c1KlbmTPpw
          </Typography>
        </Box>
      </Paper>
      {/* Card hệ thống giám sát thông minh */}
      <Paper sx={{ p: 3, borderRadius: 2, mb: 3, minWidth: 400 }}>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 2, borderBottom: '2px dashed #1976d2', pb: 1 }}>
          Hệ thống giám sát thông minh
        </Typography>
        <FormControl fullWidth>
          <InputLabel>Tự động</InputLabel>
          <Select
            value={auto}
            label="Tự động"
            onChange={e => setAuto(e.target.value)}
          >
            <MenuItem value="Không">Không</MenuItem>
            <MenuItem value="Có">Có</MenuItem>
          </Select>
        </FormControl>
      </Paper>
      {/* Card hồ sơ */}
      <Paper sx={{ p: 3, borderRadius: 2, mb: 3, minWidth: 400 }}>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 2, borderBottom: '2px dotted #888', pb: 1 }}>
          Hồ sơ
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12}><TextField label="Tên đăng nhập" value={username} onChange={e => setUsername(e.target.value)} fullWidth sx={{ mb: 2 }} /></Grid>
          <Grid item xs={12}><TextField label="Mật khẩu" type="password" value={password} onChange={e => setPassword(e.target.value)} fullWidth sx={{ mb: 2 }} /></Grid>
          <Grid item xs={12}><TextField label="Nhập lại mật khẩu" type="password" value={rePassword} onChange={e => setRePassword(e.target.value)} fullWidth sx={{ mb: 2 }} /></Grid>
          <Grid item xs={12}><TextField label="Số lượng lưu trữ tối đa" value={maxStorage} onChange={e => setMaxStorage(e.target.value)} fullWidth sx={{ mb: 2 }} /></Grid>
          <Grid item xs={12}><TextField label="Số lượng lưu trữ tối đa : giây" value={maxStorageSec} onChange={e => setMaxStorageSec(e.target.value)} fullWidth sx={{ mb: 2 }} /></Grid>
          <Grid item xs={12}><TextField label="Số ngày để giữ Video" value={videoDays} onChange={e => setVideoDays(e.target.value)} fullWidth sx={{ mb: 2 }} /></Grid>
          <Grid item xs={12}><TextField label="Số ngày để giữ Sự kiện" value={eventDays} onChange={e => setEventDays(e.target.value)} fullWidth sx={{ mb: 2 }} /></Grid>
          <Grid item xs={12}><TextField label="Số ngày để giữ Tua nhanh thời gian (Timelapse)" value={timelapseDays} onChange={e => setTimelapseDays(e.target.value)} fullWidth sx={{ mb: 2 }} /></Grid>
          <Grid item xs={12}><TextField label="Số ngày để giữ Nhật ký" value={logDays} onChange={e => setLogDays(e.target.value)} fullWidth sx={{ mb: 2 }} /></Grid>
          <Grid item xs={12}><TextField label="Ngôn ngữ bảng điều khiển" value={lang} onChange={e => setLang(e.target.value)} fullWidth sx={{ mb: 2 }} /></Grid>
          <Grid item xs={12}><TextField label="Âm thanh cảnh báo" value={alertSound1} onChange={e => setAlertSound1(e.target.value)} fullWidth sx={{ mb: 2 }} /></Grid>
          <Grid item xs={12}><TextField label="Âm thanh cảnh báo" value={alertSound2} onChange={e => setAlertSound2(e.target.value)} fullWidth sx={{ mb: 2 }} /></Grid>
          <Grid item xs={12}><TextField label="Độ trễ âm thanh cảnh báo" value={alertDelay} onChange={e => setAlertDelay(e.target.value)} fullWidth sx={{ mb: 2 }} /></Grid>
          <Grid item xs={12}>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Hiển thị màn hình khi có sự kiện</InputLabel>
              <Select value={showEventScreen} label="Hiển thị màn hình khi có sự kiện" onChange={e => setShowEventScreen(e.target.value)}>
                <MenuItem value="Không">Không</MenuItem>
                <MenuItem value="Có">Có</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>
      {/* Card Đang xem trực tiếp */}
      <Paper sx={{ p: 3, borderRadius: 2, mb: 3, minWidth: 400 }}>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 2, borderBottom: '2px dashed #1976d2', pb: 1 }}>
          Đang xem trực tiếp
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12}><TextField label="Camera trên mỗi hàng" value={camsPerRow} onChange={e => setCamsPerRow(e.target.value)} fullWidth sx={{ mb: 2 }} /></Grid>
          <Grid item xs={12}><TextField label="Các màn hình luân phiên trên mỗi hàng" value={switchScreensPerRow} onChange={e => setSwitchScreensPerRow(e.target.value)} fullWidth sx={{ mb: 2 }} /></Grid>
          <Grid item xs={12}><TextField label="Số lượng màn hình luân phiên" value={switchScreenCount} onChange={e => setSwitchScreenCount(e.target.value)} fullWidth sx={{ mb: 2 }} /></Grid>
          <Grid item xs={12}><TextField label="Chiều cao màn hình luân phiên" value={switchScreenHeight} onChange={e => setSwitchScreenHeight(e.target.value)} fullWidth sx={{ mb: 2 }} /></Grid>
          <Grid item xs={12}><TextField label="Thời gian luân phiên" value={switchScreenTime} onChange={e => setSwitchScreenTime(e.target.value)} fullWidth sx={{ mb: 2 }} /></Grid>
        </Grid>
      </Paper>
      {/* Card Sở thích */}
      <Paper sx={{ p: 3, borderRadius: 2, minWidth: 400 }}>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 2, borderBottom: '2px dashed #1976d2', pb: 1 }}>
          Sở thích
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12}><TextField label="Định dạng đồng hồ" value={clockFormat} onChange={e => setClockFormat(e.target.value)} fullWidth sx={{ mb: 2 }} /></Grid>
          <Grid item xs={12}><TextField label="Thiết kế Kiểu bảng điều khiển của bạn." value={customCss} onChange={e => setCustomCss(e.target.value)} fullWidth sx={{ mb: 2 }} multiline minRows={2} /></Grid>
          <Grid item xs={12}><TextField label="Tùy chọn HLS" value={hlsOption} onChange={e => setHlsOption(e.target.value)} fullWidth sx={{ mb: 2 }} multiline minRows={2} /></Grid>
          <Grid item xs={12}><TextField label="Số lượng camera trên mỗi hàng" value={camsPerRowPref} onChange={e => setCamsPerRowPref(e.target.value)} fullWidth sx={{ mb: 2 }} /></Grid>
          <Grid item xs={12}>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Nhật ký bảng điều khiển trình duyệt</InputLabel>
              <Select value={browserLog} label="Nhật ký bảng điều khiển trình duyệt" onChange={e => setBrowserLog(e.target.value)}>
                <MenuItem value="Không">Không</MenuItem>
                <MenuItem value="Có">Có</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Nhận nhật ký cho người dùng</InputLabel>
              <Select value={userLog} label="Nhận nhật ký cho người dùng" onChange={e => setUserLog(e.target.value)}>
                <MenuItem value="Không">Không</MenuItem>
                <MenuItem value="Có">Có</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}><TextField label="Chủ đề" value={theme} onChange={e => setTheme(e.target.value)} fullWidth sx={{ mb: 2 }} /></Grid>
        </Grid>
      </Paper>
      {/* Nút lưu nổi góc phải dưới */}
      <Box sx={{ position: 'fixed', right: 32, bottom: 32, zIndex: 10 }}>
        <Button variant="contained" color="success" sx={{ fontWeight: 700, px: 4, py: 1.5, borderRadius: 2 }}>
          ✓ Lưu
        </Button>
      </Box>
    </Box>
  );
}

export default AccountSettings; 