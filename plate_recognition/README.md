# License Plate Recognition System

Hệ thống nhận dạng biển số xe tự động với khả năng xử lý real-time, hỗ trợ GPU acceleration và tích hợp WebSocket.

## Tính năng chính

- 🚗 Nhận dạng biển số xe tự động với độ chính xác cao
- ⚡ Xử lý real-time với tối ưu hóa GPU
- 🌐 API REST và WebSocket cho tích hợp
- 📹 Hỗ trợ camera IP, RTSP stream và video file
- 🎯 Object tracking với BYTETracker
- 🔄 Chống trùng lặp thông minh
- 📊 Thống kê và báo cáo chi tiết

## Yêu cầu hệ thống

- Python 3.11+
- CUDA 11.8+ (tùy chọn, cho GPU acceleration)
- RAM: 8GB+ (khuyến nghị 16GB+)
- GPU: NVIDIA GTX 1060+ (tùy chọn)

## Cài đặt

### 1. Tạo môi trường ảo

```bash
# Tạo môi trường ảo Python 3.11
python -m venv venv

# Kích hoạt môi trường ảo
# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate
```

### 2. Cài đặt dependencies

```bash
# Cài đặt các thư viện cơ bản
pip install -r requirements.txt

# Hoặc cài đặt với GPU support
pip install -r requirements.txt
pip install tensorrt torch torchvision --index-url https://download.pytorch.org/whl/cu118

# Cài đặt thêm cho development (tùy chọn)
pip install -r requirements-dev.txt
```

### 3. Cài đặt Redis (bắt buộc)

#### Windows:
```bash
# Tải Redis từ https://github.com/microsoftarchive/redis/releases
# Hoặc sử dụng Docker
docker run -d -p 6379:6379 redis:latest
```

#### Linux:
```bash
sudo apt-get update
sudo apt-get install redis-server
sudo systemctl start redis-server
```

#### Mac:
```bash
brew install redis
brew services start redis
```

## Sử dụng

### 1. Khởi động server

```bash
python app.py
```

Server sẽ chạy trên `http://localhost:5002`

### 2. API Endpoints

#### Nhận dạng ảnh
```bash
POST /recognize
Content-Type: multipart/form-data
Body: image file
```

#### WebSocket cho real-time
```bash
ws://localhost:5002/recognize-ws
```

#### Health check
```bash
GET /health
```

#### GPU status
```bash
GET /gpu-status
```

### 3. Sử dụng với frontend

Xem thư mục `client/` để có frontend React.js hoàn chỉnh.

## Cấu hình

### Biến môi trường

Tạo file `.env` trong thư mục gốc:

```env
# GPU Configuration
CUDA_VISIBLE_DEVICES=0
TF_FORCE_GPU_ALLOW_GROWTH=true

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# Server Configuration
FLASK_HOST=0.0.0.0
FLASK_PORT=5002
FLASK_DEBUG=False

# Performance
OMP_NUM_THREADS=4
ORT_LOGGING_LEVEL=3
TF_CPP_MIN_LOG_LEVEL=3
```

### Tối ưu hóa hiệu suất

1. **GPU Acceleration**: Đảm bảo CUDA và cuDNN được cài đặt
2. **Memory Management**: Điều chỉnh `TF_FORCE_GPU_ALLOW_GROWTH=true`
3. **Threading**: Tăng `OMP_NUM_THREADS` theo số core CPU
4. **Redis**: Sử dụng Redis để cache kết quả

## Cấu trúc dự án

```
plate_recognition/
├── app.py                 # Flask server chính
├── detector.py            # Module nhận dạng biển số
├── requirements.txt       # Dependencies cơ bản
├── requirements-dev.txt   # Dependencies development
├── setup.py              # Package setup
├── static/               # Static files
├── temp_videos/          # Video tạm thời
├── debug_crops/          # Debug images
└── venv/                 # Virtual environment
```

## Troubleshooting

### Lỗi thường gặp

1. **CUDA out of memory**
   ```bash
   # Giảm batch size hoặc sử dụng CPU
   export CUDA_VISIBLE_DEVICES=""
   ```

2. **Redis connection failed**
   ```bash
   # Kiểm tra Redis server
   redis-cli ping
   ```

3. **ONNX Runtime errors**
   ```bash
   # Cài đặt lại ONNX Runtime
   pip uninstall onnxruntime onnxruntime-gpu
   pip install onnxruntime-gpu
   ```

### Performance Tips

1. Sử dụng GPU khi có thể
2. Tối ưu hóa kích thước frame input
3. Sử dụng Redis để cache
4. Điều chỉnh FPS phù hợp với hardware

## Đóng góp

1. Fork repository
2. Tạo feature branch
3. Commit changes
4. Push to branch
5. Tạo Pull Request

## License

MIT License - xem file LICENSE để biết thêm chi tiết.

## Liên hệ

- Email: your.email@example.com
- GitHub: https://github.com/yourusername/license-plate-recognition
