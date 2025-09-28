@echo off
echo VLC RTSP Server
echo ================
echo.

set VIDEO_FILE="C:\Users\admin\Documents\Nam_5\NCKH\License-Plate-Recognition\samples\test3.mp4"
set VLC_PATH="C:\Program Files\VideoLAN\VLC\vlc.exe"

echo Video: %VIDEO_FILE%
echo Stream: rtsp://localhost:8554/stream1
echo.

REM Kiểm tra file video có tồn tại không
if not exist %VIDEO_FILE% (
    echo ERROR: Video file not found: %VIDEO_FILE%
    echo Please check the file path and try again.
    pause
    exit /b 1
)

REM Kiểm tra VLC có tồn tại không
if not exist %VLC_PATH% (
    echo ERROR: VLC not found at: %VLC_PATH%
    echo Please install VLC or update the path.
    pause
    exit /b 1
)

REM Kill any existing VLC processes
echo Cleaning up existing VLC processes...
taskkill /f /im vlc.exe >nul 2>&1

REM Wait a moment for cleanup
timeout /t 2 /nobreak >nul

REM Check if port 8554 is in use
echo Checking port 8554...
netstat -an | findstr :8554 >nul
if %errorlevel% == 0 (
    echo WARNING: Port 8554 is already in use!
    echo Trying to free the port...
    timeout /t 3 /nobreak >nul
)

echo.
echo Starting VLC RTSP server...
echo Press Ctrl+C to stop, or close this window
echo.

REM Start VLC in background and capture its PID
start /b "" %VLC_PATH% %VIDEO_FILE% --intf dummy --sout "#rtp{sdp=rtsp://localhost:8554/stream1,proto=tcp}" --sout-keep --loop --rtsp-timeout=0 --rtsp-frame-buffer-size=1000000 --rtsp-caching=100 --network-caching=1000 --clock-jitter=0 --clock-synchro=0

REM Wait for user input to stop
echo VLC RTSP server is running...
echo Press any key to stop the server...
pause >nul

REM Kill VLC process when user wants to stop
echo Stopping VLC RTSP server...
taskkill /f /im vlc.exe >nul 2>&1

echo VLC RTSP server stopped.
pause
