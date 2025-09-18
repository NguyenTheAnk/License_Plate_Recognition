const { exec } = require('child_process');
const path = require('path');

function checkFFmpeg() {
  console.log('Checking FFmpeg installation...');
  
  exec('ffmpeg -version', (error, stdout, stderr) => {
    if (error) {
      console.error('❌ FFmpeg is not installed or not in PATH');
      console.error('Error:', error.message);
      console.log('\n📋 To install FFmpeg:');
      console.log('Windows: Download from https://ffmpeg.org/download.html');
      console.log('macOS: brew install ffmpeg');
      console.log('Ubuntu/Debian: sudo apt update && sudo apt install ffmpeg');
      console.log('CentOS/RHEL: sudo yum install ffmpeg');
      return;
    }
    
    console.log('✅ FFmpeg is installed');
    console.log('Version info:');
    console.log(stdout.split('\n')[0]); // First line contains version info
  });
}

function checkFFmpegCodecs() {
  console.log('\nChecking FFmpeg codecs...');
  
  exec('ffmpeg -codecs', (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Error checking codecs:', error.message);
      return;
    }
    
    const codecs = stdout.split('\n');
    const h264 = codecs.find(line => line.includes('h264'));
    const aac = codecs.find(line => line.includes('aac'));
    
    if (h264) {
      console.log('✅ H.264 codec available');
    } else {
      console.log('❌ H.264 codec not available');
    }
    
    if (aac) {
      console.log('✅ AAC codec available');
    } else {
      console.log('❌ AAC codec not available');
    }
  });
}

function testRTSPConnection() {
  console.log('\nTesting RTSP connection...');
  
  // Test với một RTSP URL mẫu
  const testUrl = 'rtsp://192.168.1.100:554/live/stream1';
  
  exec(`ffmpeg -i "${testUrl}" -t 5 -f null -`, (error, stdout, stderr) => {
    if (error) {
      console.log('❌ RTSP connection test failed (this is normal if no camera is available)');
      console.log('Error:', error.message);
    } else {
      console.log('✅ RTSP connection test successful');
    }
  });
}

// Chạy các kiểm tra
checkFFmpeg();
setTimeout(checkFFmpegCodecs, 1000);
setTimeout(testRTSPConnection, 2000);

