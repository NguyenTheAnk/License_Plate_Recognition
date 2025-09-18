import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Divider,
  Alert,
} from '@mui/material';
import axios from 'axios';

function Settings() {
  const [settings, setSettings] = useState({
    cameraUrl: '',
    alertThreshold: 0.8,
    enableAlerts: true,
    emailNotifications: false,
    emailAddress: '',
    storageDays: 30,
  });
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/settings');
      setSettings(response.data);
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const handleChange = (event) => {
    const { name, value, checked } = event.target;
    setSettings((prev) => ({
      ...prev,
      [name]: event.target.type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      await axios.post('http://localhost:5000/api/settings', settings);
      setMessage({
        type: 'success',
        text: 'Lưu cài đặt thành công',
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'Lỗi khi lưu cài đặt',
      });
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', background: '#f4f6fa', p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Cài đặt hệ thống
      </Typography>
      {message.text && (
        <Alert severity={message.type} sx={{ mb: 2 }}>
          {message.text}
        </Alert>
      )}
      <Grid container spacing={3} justifyContent="center">
        {/* Card Cài đặt camera */}
        <Grid item xs={12} md={8} lg={6}>
          <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3, mb: 3 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2, borderBottom: '2px dashed #43a047', pb: 1 }}>
              Cài đặt camera
            </Typography>
            <form onSubmit={handleSubmit}>
              <TextField
                fullWidth
                label="Địa chỉ Camera (URL)"
                name="cameraUrl"
                value={settings.cameraUrl}
                onChange={handleChange}
                margin="normal"
              />
              <Button
                type="submit"
                variant="contained"
                color="success"
                size="large"
                sx={{ mt: 2, fontWeight: 700 }}
              >
                Lưu cài đặt
              </Button>
            </form>
          </Paper>
        </Grid>
        {/* Card Cài đặt nhận diện */}
        <Grid item xs={12} md={8} lg={6}>
          <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3, mb: 3 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2, borderBottom: '2px dashed #43a047', pb: 1 }}>
              Cài đặt nhận diện
            </Typography>
            <TextField
              fullWidth
              label="Ngưỡng cảnh báo (Alert Threshold)"
              name="alertThreshold"
              type="number"
              value={settings.alertThreshold}
              onChange={handleChange}
              margin="normal"
              inputProps={{ min: 0, max: 1, step: 0.1 }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={settings.enableAlerts}
                  onChange={handleChange}
                  name="enableAlerts"
                />
              }
              label="Bật cảnh báo"
            />
          </Paper>
        </Grid>
        {/* Card Cài đặt thông báo */}
        <Grid item xs={12} md={8} lg={6}>
          <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3, mb: 3 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2, borderBottom: '2px dashed #43a047', pb: 1 }}>
              Cài đặt thông báo
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.emailNotifications}
                  onChange={handleChange}
                  name="emailNotifications"
                />
              }
              label="Gửi thông báo qua Email"
            />
            <TextField
              fullWidth
              label="Địa chỉ Email"
              name="emailAddress"
              type="email"
              value={settings.emailAddress}
              onChange={handleChange}
              margin="normal"
              disabled={!settings.emailNotifications}
            />
          </Paper>
        </Grid>
        {/* Card Cài đặt lưu trữ */}
        <Grid item xs={12} md={8} lg={6}>
          <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2, borderBottom: '2px dashed #43a047', pb: 1 }}>
              Cài đặt lưu trữ
            </Typography>
            <TextField
              fullWidth
              label="Số ngày lưu trữ"
              name="storageDays"
              type="number"
              value={settings.storageDays}
              onChange={handleChange}
              margin="normal"
              inputProps={{ min: 1, max: 365 }}
            />
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Settings;

export { default as AccountSettings } from '../pages/AccountSettings'; 