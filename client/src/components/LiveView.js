import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  CircularProgress,
} from '@mui/material';
import axios from 'axios';

function LiveView() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentPlate, setCurrentPlate] = useState(null);
  const [loading, setLoading] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const startStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsStreaming(true);
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
    }
  };

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setIsStreaming(false);
    }
  };

  const captureFrame = async () => {
    if (!videoRef.current) return;

    setLoading(true);
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0);

    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
      const formData = new FormData();
      formData.append('image', blob, 'frame.jpg');

      const response = await axios.post('http://localhost:5000/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setCurrentPlate(response.data);
    } catch (error) {
      console.error('Error processing frame:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, []);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Live View
      </Typography>
      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Box sx={{ position: 'relative', paddingTop: '56.25%' }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  backgroundColor: '#000',
                }}
              />
              {!isStreaming && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center',
                  }}
                >
                  <Typography variant="h6" color="text.secondary">
                    Camera is not active
                  </Typography>
                </Box>
              )}
            </Box>
            <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                color="primary"
                onClick={isStreaming ? stopStream : startStream}
              >
                {isStreaming ? 'Stop Stream' : 'Start Stream'}
              </Button>
              <Button
                variant="contained"
                color="secondary"
                onClick={captureFrame}
                disabled={!isStreaming || loading}
              >
                Capture Frame
              </Button>
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Last Detected Plate
              </Typography>
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                  <CircularProgress />
                </Box>
              ) : currentPlate ? (
                <Box>
                  <Typography variant="h4" gutterBottom>
                    {currentPlate.licensePlate}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Detected at: {new Date().toLocaleTimeString()}
                  </Typography>
                  {currentPlate.imagePath && (
                    <Box sx={{ mt: 2 }}>
                      <img
                        src={`http://localhost:5000/${currentPlate.imagePath}`}
                        alt="Detected plate"
                        style={{ width: '100%', borderRadius: 4 }}
                      />
                    </Box>
                  )}
                </Box>
              ) : (
                <Typography color="text.secondary">
                  No plate detected yet
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default LiveView; 