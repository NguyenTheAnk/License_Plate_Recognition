import React, { useState } from 'react';
import { Box, Typography, Paper, Button, Grid, TextField, MenuItem, Select, InputLabel, FormControl } from '@mui/material';

const subAccountsSample = [
  { username: 'motest', id: 'nH1PSU7bwt' },
  { username: 'admin2', id: 'JAEK91xceD' },
];
const activeSample = [
  { username: 'admin', time: 'Xác thực 19:23:48 2025-05-03', id: 'z8ESLYMinxsepjz6AAAB' },
];

function SubAccountManager() {
  const [subAccounts] = useState(subAccountsSample);
  const [activeUsers] = useState(activeSample);
  const [searchActive, setSearchActive] = useState('');
  const [selectedMenu, setSelectedMenu] = useState(['Trang chủ', 'Đang xem trực tiếp', 'Camera', 'Danh sách video']);
  const [allCams, setAllCams] = useState('Không');
  const [canCreateCam, setCanCreateCam] = useState('Không');
  const [canChangeUser, setCanChangeUser] = useState('Không');
  const [canViewLog, setCanViewLog] = useState('Không');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rePassword, setRePassword] = useState('');

  return (
    <Box sx={{ minHeight: '100vh', background: '#d3d3d3', p: 3 }}>
      <Grid container spacing={3}>
        {/* Tài khoản phụ */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, borderRadius: 2, mb: 2 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2, borderBottom: '2px dashed #bfa047', pb: 1 }}>
              Tài khoản phụ
            </Typography>
            {subAccounts.map(acc => (
              <Paper key={acc.id} sx={{ p: 2, mb: 2, background: '#f4f4f4', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography fontWeight={700}>{acc.username}</Typography>
                  <Typography variant="caption" color="text.secondary">{acc.id}</Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button variant="contained" size="small" color="info" sx={{ fontWeight: 700 }}>
                    ⚙ Chỉnh sửa
                  </Button>
                  <Button variant="contained" size="small" color="error" sx={{ fontWeight: 700 }}>
                    🗑 Xóa bỏ
                  </Button>
                </Box>
              </Paper>
            ))}
          </Paper>
        </Grid>
        {/* Đang hoạt động */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, borderRadius: 2, mb: 2 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2, borderBottom: '2px dashed #43a047', pb: 1 }}>
              Đang hoạt động
            </Typography>
            <TextField label="Tìm kiếm" value={searchActive} onChange={e => setSearchActive(e.target.value)} fullWidth sx={{ mb: 2 }} />
            {activeUsers.map(u => (
              <Paper key={u.id} sx={{ p: 2, background: '#232f3e', color: '#fff', borderRadius: 2, mb: 2 }}>
                <Typography fontWeight={700}>{u.username}</Typography>
                <Typography variant="body2">{u.time}</Typography>
                <Typography variant="caption" sx={{ color: '#b2dfdb' }}>{u.id}</Typography>
              </Paper>
            ))}
          </Paper>
        </Grid>
        {/* Thông tin tài khoản */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, borderRadius: 2, mb: 2 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2, borderBottom: '2px dashed #1976d2', pb: 1 }}>
              Thông tin tài khoản
            </Typography>
            <TextField label="Tên đăng nhập" value={username} onChange={e => setUsername(e.target.value)} fullWidth sx={{ mb: 2 }} />
            <TextField label="Mật khẩu" type="password" value={password} onChange={e => setPassword(e.target.value)} fullWidth sx={{ mb: 2 }} />
            <TextField label="Nhập lại mật khẩu" type="password" value={rePassword} onChange={e => setRePassword(e.target.value)} fullWidth sx={{ mb: 2 }} />
            <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
              <Button variant="contained" color="inherit" sx={{ flex: 1, fontWeight: 700 }}>
                ⟳ Xóa
              </Button>
              <Button variant="contained" color="success" sx={{ flex: 1, fontWeight: 700 }}>
                + Thêm mới
              </Button>
            </Box>
          </Paper>
        </Grid>
        {/* Phân quyền tài khoản */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, borderRadius: 2, mb: 2 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2, borderBottom: '2px dashed #d32f2f', pb: 1 }}>
              Phân quyền tài khoản
            </Typography>
            <TextField
              label="Phân quyền Menu"
              value={selectedMenu.join('\n')}
              onChange={e => setSelectedMenu(e.target.value.split('\n'))}
              fullWidth
              sx={{ mb: 2 }}
              multiline
              minRows={4}
            />
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Tất cả các camera và quyền</InputLabel>
              <Select value={allCams} label="Tất cả các camera và quyền" onChange={e => setAllCams(e.target.value)}>
                <MenuItem value="Không">Không</MenuItem>
                <MenuItem value="Có">Có</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Có thể tạo và xóa camera</InputLabel>
              <Select value={canCreateCam} label="Có thể tạo và xóa camera" onChange={e => setCanCreateCam(e.target.value)}>
                <MenuItem value="Không">Không</MenuItem>
                <MenuItem value="Có">Có</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Có thể thay đổi cài đặt người dùng</InputLabel>
              <Select value={canChangeUser} label="Có thể thay đổi cài đặt người dùng" onChange={e => setCanChangeUser(e.target.value)}>
                <MenuItem value="Không">Không</MenuItem>
                <MenuItem value="Có">Có</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Có thể xem nhật ký</InputLabel>
              <Select value={canViewLog} label="Có thể xem nhật ký" onChange={e => setCanViewLog(e.target.value)}>
                <MenuItem value="Không">Không</MenuItem>
                <MenuItem value="Có">Có</MenuItem>
              </Select>
            </FormControl>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

export default SubAccountManager; 