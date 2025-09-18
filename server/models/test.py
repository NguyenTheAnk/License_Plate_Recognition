from flask import Flask, Response, render_template, jsonify, request, send_from_directory
import cv2
import torch
import math
import numpy as np
import time
import os
from filterpy.kalman import KalmanFilter
import function.utils_rotate as utils_rotate
import function.helper as helper
import uuid
from werkzeug.utils import secure_filename
import shutil
# Khởi tạo Flask app
app = Flask(__name__)

# Tạo thư mục để lưu các crop
CROPS_FOLDER = 'static/crops'
os.makedirs(CROPS_FOLDER, exist_ok=True)

# Cấu hình CUDA và PyTorch
torch.backends.cudnn.benchmark = True
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Sử dụng thiết bị: {device}")

# Tải các mô hình YOLOv5 lên GPU
yolo_LP_detect = torch.hub.load('yolov8', 'custom', path='model/best (3).pt', force_reload=True, source='local').to(device)
yolo_license_plate = torch.hub.load('yolov5', 'custom', path='model/LP_ocr_nano_62.pt', force_reload=True, source='local').to(device)
yolo_license_plate.conf = 0.60

# Biến toàn cục
tracked_objects = {}
detected_plates = {}
next_object_id = 0
frame_count = 0
ROI_XMIN, ROI_YMIN, ROI_XMAX, ROI_YMAX = 100, 450, 1850, 1000
DISTANCE_THRESHOLD = 100
MAX_DISAPPEARED = 20
UPDATE_INTERVAL = 3
MIN_CONFIDENCE = 0.6
MIN_CROP_QUALITY = 30
MAX_CROP_UPDATES = 3
MIN_IMPROVEMENT_RATIO = 1.2
UPLOAD_FOLDER = 'static/uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'mkv'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS
# Các hàm phụ trợ
def initialize_kalman(x, y, w, h):
    kf = KalmanFilter(dim_x=8, dim_z=4)
    kf.x = np.array([x, y, w, h, 0, 0, 0, 0])
    dt = 1.0
    kf.F = np.array([
        [1, 0, 0, 0, dt, 0, 0, 0],
        [0, 1, 0, 0, 0, dt, 0, 0],
        [0, 0, 1, 0, 0, 0, dt, 0],
        [0, 0, 0, 1, 0, 0, 0, dt],
        [0, 0, 0, 0, 1, 0, 0, 0],
        [0, 0, 0, 0, 0, 1, 0, 0],
        [0, 0, 0, 0, 0, 0, 1, 0],
        [0, 0, 0, 0, 0, 0, 0, 1]
    ])
    kf.H = np.array([
        [1, 0, 0, 0, 0, 0, 0, 0],
        [0, 1, 0, 0, 0, 0, 0, 0],
        [0, 0, 1, 0, 0, 0, 0, 0],
        [0, 0, 0, 1, 0, 0, 0, 0]
    ])
    kf.Q = np.eye(8) * 0.05
    kf.R = np.eye(4) * 2.0
    kf.P *= 500.0
    return kf

def calculate_centroid(xmin, ymin, xmax, ymax):
    return ((xmin + xmax) / 2, (ymin + ymax) / 2)

def calculate_distance(centroid1, centroid2):
    return math.sqrt((centroid1[0] - centroid2[0])**2 + (centroid1[1] - centroid2[1])**2)

def is_in_roi(centroid):
    x, y = centroid
    return ROI_XMIN <= x <= ROI_XMAX and ROI_YMIN <= y <= ROI_YMAX

def is_box_valid(bbox, frame_shape):
    xmin, ymin, xmax, ymax = bbox
    height, width = frame_shape[:2]
    return (xmax - xmin) >= 10 and (ymax - ymin) >= 10 and 0 <= xmin < width and 0 <= ymin < height and xmax <= width and ymax <= height

def calculate_crop_quality(crop_img):
    if crop_img is None or crop_img.size == 0:
        return 0
    gray = cv2.cvtColor(crop_img, cv2.COLOR_BGR2GRAY) if len(crop_img.shape) == 3 else crop_img
    contrast = np.std(gray)
    brightness = np.mean(gray)
    brightness_score = 1 - abs(brightness - 127) / 127
    sharpness = cv2.Laplacian(gray, cv2.CV_64F).var()
    quality_score = contrast * brightness_score * (sharpness ** 0.5)
    return quality_score

def recognize_license_plate(crop_img):
    with torch.no_grad():
        for cc in range(0, 2):
            for ct in range(0, 2):
                rotated_img = utils_rotate.deskew(crop_img, cc, ct)
                lp = helper.read_plate(yolo_license_plate, rotated_img)
                if lp != "unknown":
                    return lp
    return "unknown"

# Hàm xử lý và stream video
current_video_capture = None
video_lock = False

def cleanup_video():
    global current_video_capture
    if current_video_capture is not None:
        current_video_capture.release()
        current_video_capture = None
def generate_frames(video_path):
    global frame_count, next_object_id, tracked_objects, detected_plates
    
    shutil.rmtree(CROPS_FOLDER, ignore_errors=True)
    os.makedirs(CROPS_FOLDER, exist_ok=True)
    # Xóa tất cả các file crop cũ
    for file in os.listdir(CROPS_FOLDER):
        if file.endswith('.jpg'):
            os.remove(os.path.join(CROPS_FOLDER, file))
    while video_lock:
        time.sleep(0.1)
    
    # Reset biến toàn cục
    tracked_objects = {}
    detected_plates = {}
    next_object_id = 0
    frame_count = 0

    vid = cv2.VideoCapture(video_path)
    if not vid.isOpened():
        return

    width = int(vid.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(vid.get(cv2.CAP_PROP_FRAME_HEIGHT))

    prev_time = time.time()
    frame_delay = 0.01  # Độ trễ giữa các frame (giây), tăng giá trị này để làm chậm video

    while True:
        ret, frame = vid.read()
        if not ret:
            break
        clean_frame = frame.copy()

        # Vẽ ROI và các overlay lên frame (KHÔNG vẽ lên clean_frame)
        cv2.rectangle(frame, (ROI_XMIN, ROI_YMIN), (ROI_XMAX, ROI_YMAX), (255, 0, 0), 2)
        frame_count += 1

        # Tính FPS
        current_time = time.time()
        fps = 1 / (current_time - prev_time) if current_time > prev_time else 0
        prev_time = current_time

        # Vẽ vùng ROI
        cv2.rectangle(frame, (ROI_XMIN, ROI_YMIN), (ROI_XMAX, ROI_YMAX), (255, 0, 0), 2)

        # Cập nhật trạng thái biến mất cho các đối tượng đang theo dõi
        for obj_id, obj in list(tracked_objects.items()):
            if 'disappeared' not in obj:
                obj['disappeared'] = 0
            obj['kf'].predict()
            predicted_state = obj['kf'].x
            x, y, w, h = predicted_state[:4]
            predicted_bbox = (max(0, int(x - w/2)), max(0, int(y - h/2)), 
                             min(width, int(x + w/2)), min(height, int(y + h/2)))
            obj['bbox'] = predicted_bbox
            obj['centroid'] = (x, y)
            
            if not is_in_roi(obj['centroid']) or obj['disappeared'] > MAX_DISAPPEARED:
                if obj_id not in detected_plates and obj['has_crop']:
                    detected_plates[obj_id] = {
                        'id': obj_id,
                        'crop_filename': obj['crop_filename'],
                        'plate_number': obj['plate_number'],
                        'first_seen': obj['first_seen'],
                        'best_quality': obj['best_quality'],
                        'active': False
                    }
                del tracked_objects[obj_id]
            else:
                obj['disappeared'] += 1

        # Phát hiện biển số
        if frame_count % UPDATE_INTERVAL == 0:
            with torch.amp.autocast(device_type='cuda', enabled=True):
                plates = yolo_LP_detect(frame, size=640)
            list_plates = plates.pandas().xyxy[0].values.tolist()

            new_objects = []
            for plate in list_plates:
                conf = plate[4]
                if conf < MIN_CONFIDENCE:
                    continue
                xmin, ymin, xmax, ymax = map(int, plate[:4])
                centroid = calculate_centroid(xmin, ymin, xmax, ymax)
                if is_in_roi(centroid) and is_box_valid((xmin, ymin, xmax, ymax), frame.shape):
                    new_objects.append({
                        'bbox': (xmin, ymin, xmax, ymax),
                        'centroid': centroid,
                        'confidence': conf
                    })

            assigned_objects = set()
            for obj_id, tracked_obj in list(tracked_objects.items()):
                if not new_objects:
                    continue
                tracked_centroid = tracked_obj['centroid']
                best_match_idx, min_distance = -1, float('inf')
                for i, new_obj in enumerate(new_objects):
                    if i in assigned_objects:
                        continue
                    distance = calculate_distance(tracked_centroid, new_obj['centroid'])
                    if distance < DISTANCE_THRESHOLD and distance < min_distance:
                        min_distance = distance
                        best_match_idx = i
                if best_match_idx != -1:
                    matched_obj = new_objects[best_match_idx]
                    xmin, ymin, xmax, ymax = matched_obj['bbox']
                    width, height = xmax - xmin, ymax - ymin
                    cx, cy = matched_obj['centroid']
                    tracked_obj['kf'].update(np.array([cx, cy, width, height]))
                    updated_state = tracked_obj['kf'].x
                    x, y, w, h = updated_state[:4]
                    updated_bbox = (
                        max(0, int(x - w/2)), 
                        max(0, int(y - h/2)), 
                        min(frame.shape[1], int(x + w/2)), 
                        min(frame.shape[0], int(y + h/2))
                    )
                    tracked_obj['bbox'] = updated_bbox
                    tracked_obj['centroid'] = (x, y)
                    tracked_obj['disappeared'] = 0
                    if tracked_obj['has_crop'] is False or matched_obj['confidence'] > tracked_obj['best_confidence']:
                        xmin, ymin, xmax, ymax = updated_bbox
                        clean_frame = frame.copy()
                        current_crop = clean_frame[ymin:ymax, xmin:xmax]
                        current_quality = calculate_crop_quality(current_crop)
                        if tracked_obj['has_crop'] is False or current_quality > tracked_obj['best_quality']:
                            tracked_obj['best_quality'] = current_quality
                            tracked_obj['best_confidence'] = matched_obj['confidence']
                            if tracked_obj['has_crop']:
                                try:
                                    os.remove(os.path.join(CROPS_FOLDER, tracked_obj['crop_filename']))
                                except:
                                    pass
                            crop_filename = f"{obj_id}.jpg"
                            crop_path = os.path.join(CROPS_FOLDER, crop_filename)
                            cv2.imwrite(crop_path, current_crop)
                            tracked_obj['has_crop'] = True
                            tracked_obj['crop_filename'] = crop_filename
                            print(f"Cập nhật crop cho biển số #{obj_id}: {crop_filename}")
                            if obj_id in detected_plates:
                                detected_plates[obj_id]['crop_filename'] = crop_filename
                    if obj_id in detected_plates:
                        detected_plates[obj_id]['active'] = True
                    assigned_objects.add(best_match_idx)

            for i, new_obj in enumerate(new_objects):
                if i not in assigned_objects:
                    xmin, ymin, xmax, ymax = new_obj['bbox']
                    width, height = xmax - xmin, ymax - ymin
                    cx, cy = new_obj['centroid']
                    kf = initialize_kalman(cx, cy, width, height)
                    crop_img = clean_frame[ymin:ymax, xmin:xmax]
                    quality = calculate_crop_quality(crop_img)
                    obj_id = str(next_object_id)
                    next_object_id += 1
                    crop_filename = f"{obj_id}.jpg"
                    crop_path = os.path.join(CROPS_FOLDER, crop_filename)
                    cv2.imwrite(crop_path, crop_img)
                    tracked_objects[obj_id] = {
                        'bbox': new_obj['bbox'],
                        'centroid': new_obj['centroid'],
                        'kf': kf,
                        'disappeared': 0,
                        'first_seen': frame_count,
                        'has_crop': True,
                        'crop_filename': crop_filename,
                        'best_quality': quality,
                        'best_confidence': new_obj['confidence'],
                        'plate_number': None
                    }
                    detected_plates[obj_id] = {
                        'id': obj_id,
                        'crop_filename': crop_filename,
                        'plate_number': None,
                        'first_seen': frame_count,
                        'best_quality': quality,
                        'active': True
                    }
                    print(f"Phát hiện biển số mới #{obj_id}: {crop_filename}")

        # Vẽ bounding box và ký tự
        for obj_id, obj in tracked_objects.items():
            if is_in_roi(obj['centroid']) and obj['disappeared'] <= MAX_DISAPPEARED:
                xmin, ymin, xmax, ymax = map(int, obj['bbox'])
                thickness = max(1, 3 - obj['disappeared'] // 5)
                alpha = max(0.3, 1.0 - (obj['disappeared'] / MAX_DISAPPEARED))
                overlay = frame.copy()
                cv2.rectangle(overlay, (xmin, ymin), (xmax, ymax), (0, 0, 255), thickness)
                cv2.putText(overlay, f"#{obj_id}", (xmin, ymin - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 0), thickness)
                if obj['plate_number'] is not None:
                    cv2.putText(overlay, obj['plate_number'], (xmin, ymin - 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), thickness)
                cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0, frame)

        # Hiển thị số lượng đối tượng đang theo dõi và tổng số biển số đã phát hiện
        cv2.putText(frame, f"Tracking: {len(tracked_objects)} | Total: {len(detected_plates)}", (7, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)

        # Hiển thị FPS
        cv2.putText(frame, f"FPS: {fps:.2f}", (7, 60), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)

        # Resize frame 
        frame = cv2.resize(frame, (640, 480))

        # Chuyển frame thành JPEG để stream
        ret, buffer = cv2.imencode('.jpg', frame)
        frame_bytes = buffer.tobytes()

        # Yield frame dưới dạng multipart response
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

        # Thêm độ trễ để làm chậm video
        time.sleep(frame_delay)

    vid.release()

# Hàm để nhận diện ký tự biển số
def process_license_plates():
    results = []
    all_plates = {}
    for obj_id, obj in tracked_objects.items():
        if obj['has_crop'] and obj['plate_number'] is None:
            all_plates[obj_id] = {
                'crop_path': os.path.join(CROPS_FOLDER, obj['crop_filename']),
                'obj': obj
            }
    for plate_id, plate in detected_plates.items():
        if plate['plate_number'] is None and plate_id not in all_plates:
            all_plates[plate_id] = {
                'crop_path': os.path.join(CROPS_FOLDER, plate['crop_filename']),
                'obj': plate
            }
    for obj_id, info in all_plates.items():
        crop_img = cv2.imread(info['crop_path'])
        if crop_img is not None:
            plate_number = recognize_license_plate(crop_img)
            if obj_id in tracked_objects:
                tracked_objects[obj_id]['plate_number'] = plate_number
            if obj_id in detected_plates:
                detected_plates[obj_id]['plate_number'] = plate_number
            results.append({
                'id': obj_id,
                'plate_number': plate_number,
                'crop_path': os.path.basename(info['crop_path'])
            })
    return results

# API endpoint để stream video
@app.route('/video_feed')
def video_feed():
    # Kiểm tra video mới nhất trong thư mục upload
    uploaded_videos = [f for f in os.listdir(UPLOAD_FOLDER) if allowed_file(f)]
    if uploaded_videos:
        # Sắp xếp để lấy video mới nhất (dựa trên thời gian sửa đổi)
        uploaded_videos.sort(key=lambda x: os.path.getmtime(os.path.join(UPLOAD_FOLDER, x)), reverse=True)
        video_path = os.path.join(UPLOAD_FOLDER, uploaded_videos[0])
    else:
        video_path = "20210530_090333.mp4"  # Video mặc định
    
    # Trả về response với header ngăn cache
    response = Response(generate_frames(video_path), mimetype='multipart/x-mixed-replace; boundary=frame')
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# API để lấy danh sách biển số đã phát hiện
@app.route('/plates')
def get_plates():
    plates_list = []
    for plate_id, plate in detected_plates.items():
        plates_list.append({
            'id': plate_id,
            'crop_path': plate['crop_filename'],
            'plate_number': plate['plate_number'],
            'first_seen': plate['first_seen'],
            'active': plate.get('active', False)
        })
    plates_list.sort(key=lambda x: x['first_seen'])
    print(f"Trả về danh sách biển số: {plates_list}")  # Log để kiểm tra
    return jsonify(plates_list)
@app.route('/upload_video', methods=['POST'])
def upload_video():
    global current_video_capture, video_lock, tracked_objects, detected_plates, next_object_id, frame_count
    
    while video_lock:
        time.sleep(0.1)
    
    video_lock = True
    try:
        if 'video' not in request.files:
            return jsonify({'success': False, 'message': 'No video file uploaded'})
        
        file = request.files['video']
        if file.filename == '':
            return jsonify({'success': False, 'message': 'No selected file'})
        
        if not allowed_file(file.filename):
            return jsonify({'success': False, 'message': 'Invalid file type'})

        # Giải phóng video capture hiện tại nếu có
        cleanup_video()
        
        # Xóa thư mục upload và crops cũ
        shutil.rmtree(UPLOAD_FOLDER, ignore_errors=True)
        shutil.rmtree(CROPS_FOLDER, ignore_errors=True)
        os.makedirs(UPLOAD_FOLDER, exist_ok=True)
        os.makedirs(CROPS_FOLDER, exist_ok=True)
        
        # Lưu file mới
        filename = secure_filename(file.filename)
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)
        
        # Reset trạng thái nhận diện
        tracked_objects = {}
        detected_plates = {}
        next_object_id = 0
        frame_count = 0
        
        print("Đã reset trạng thái: detected_plates =", detected_plates)  # Thêm log để kiểm tra
        
        return jsonify({
            'success': True,
            'message': 'Video uploaded successfully',
            'filepath': filepath,
            'timestamp': int(time.time())
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f'Error uploading video: {str(e)}'})
    finally:
        video_lock = False
# API để xử lý nhận diện biển số
@app.route('/process_plates', methods=['POST'])
def api_process_plates():
    results = process_license_plates()
    return jsonify({'success': True, 'plates': results})

# API để lấy ảnh crop
@app.route('/static/crops/<filename>')
def serve_crop(filename):
    return send_from_directory(CROPS_FOLDER, filename)

# Trang HTML để hiển thị video và danh sách biển số
@app.route('/')
def index():
    return """
    <!DOCTYPE html>
<html>
<head>
    <title>Nhận diện biển số xe</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f0f2f5;
            position: relative;
        }
        .container {
            display: flex;
            gap: 20px;
        }
        .video-container {
            flex: 1;
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .plates-container {
            flex: 1;
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 {
            color: #1a73e8;
            text-align: center;
            margin-bottom: 20px;
        }
        .plate-item {
            display: flex;
            align-items: center;
            margin-bottom: 15px;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 5px;
        }
        .plate-item.active {
            border-left: 4px solid #4CAF50;
        }
        .plate-image {
            width: 150px;
            height: auto;
            margin-right: 15px;
            border: 1px solid #eee;
        }
        .plate-info {
            flex: 1;
        }
        .plates-list {
            max-height: 500px;
            overflow-y: auto;
        }
        button {
            background: #1a73e8;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
            margin: 10px 0;
        }
        button:hover {
            background: #1557b0;
        }
        .status-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            margin-left: 10px;
        }
        .status-active {
            background-color: #4CAF50;
            color: white;
        }
        .status-inactive {
            background-color: #9E9E9E;
            color: white;
        }
        .video-controls {
            margin-bottom: 15px;
        }
        #video-input {
            display: none;
        }
        button:disabled {
            background: #cccccc !important;
            cursor: not-allowed;
        }
    </style>
</head>
<body>
    <h1>NHẬN DIỆN BIỂN SỐ XE</h1>
    <div class="container">
        <div class="video-container">
            <h2>Video</h2>
            <div class="video-controls">
                <input type="file" id="video-input" accept="video/*">
            </div>
            <img id="video-feed" src="/video_feed" width="100%" height="auto">
        </div>
        <div class="plates-container">
            <h2>Danh sách biển số</h2>
            <div class="plates-list" id="plates-list"></div>
        </div>
    </div>
    <button id="select-video-btn">Chọn video</button>
    <button id="process-btn">Nhận diện ký tự biển số</button>

    <script>
        const videoInput = document.getElementById('video-input');
        const videoFeed = document.getElementById('video-feed');
        const selectVideoBtn = document.getElementById('select-video-btn');
        const processBtn = document.getElementById('process-btn');

        selectVideoBtn.addEventListener('click', () => {
            videoInput.click();
        });

       videoInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;

            const validExtensions = ['mp4', 'avi', 'mov', 'mkv'];
            const extension = file.name.split('.').pop().toLowerCase();
            
            if (!validExtensions.includes(extension)) {
                alert('Vui lòng chọn file video (định dạng .mp4, .avi, .mov, .mkv)');
                return;
            }

            const formData = new FormData();
            formData.append('video', file);
            
            selectVideoBtn.disabled = true;
            selectVideoBtn.textContent = 'Đang tải video...';
            
            fetch('/upload_video', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Làm mới video feed với timestamp
                    videoFeed.src = '/video_feed?' + data.timestamp;
                    // Làm mới danh sách biển số ngay lập tức
                    setTimeout(updatePlatesList, 1000);  // Chờ 100ms để server reset xong
                    alert('Video đã được tải lên thành công!');
                } else {
                    alert('Lỗi khi tải video: ' + data.message);
                }
            })
            .catch(error => {
                console.error('Error uploading video:', error);
                alert('Lỗi khi tải video: ' + error.message);
            })
            .finally(() => {
                selectVideoBtn.disabled = false;
                selectVideoBtn.textContent = 'Chọn video';
                videoInput.value = '';
            });
        });

        // Lưu trữ trạng thái hiện tại của danh sách biển số
        let currentPlates = [];

        function updatePlatesList() {
            fetch('/plates')
                .then(response => response.json())
                .then(plates => {
                    const platesList = document.getElementById('plates-list');
                    
                    // Nếu không có biển số nào
                    if (plates.length === 0 && currentPlates.length === 0) {
                        platesList.innerHTML = '<p>Chưa phát hiện biển số nào.</p>';
                        return;
                    }

                    // So sánh danh sách mới với danh sách hiện tại
                    const platesMap = new Map(plates.map(p => [p.id, p]));
                    const currentMap = new Map(currentPlates.map(p => [p.id, p]));

                    // Thêm hoặc cập nhật các biển số
                    plates.forEach(plate => {
                        const existingItem = document.getElementById(`plate-${plate.id}`);
                        if (!existingItem) {
                            // Thêm biển số mới
                            const plateItem = createPlateItem(plate);
                            platesList.appendChild(plateItem);
                        } else {
                            // Cập nhật biển số hiện có nếu có thay đổi
                            updatePlateItem(existingItem, plate);
                        }
                    });

                    // Xóa các biển số không còn trong danh sách mới
                    currentPlates.forEach(oldPlate => {
                        if (!platesMap.has(oldPlate.id)) {
                            const item = document.getElementById(`plate-${oldPlate.id}`);
                            if (item) item.remove();
                        }
                    });

                    // Cập nhật danh sách hiện tại
                    currentPlates = plates;
                    
                    if (plates.length === 0) {
                        platesList.innerHTML = '<p>Chưa phát hiện biển số nào.</p>';
                    }
                })
                .catch(error => console.error('Error fetching plates:', error));
        }

        // Tạo một phần tử biển số mới
        function createPlateItem(plate) {
            const plateItem = document.createElement('div');
            plateItem.id = `plate-${plate.id}`;
            plateItem.className = 'plate-item' + (plate.active ? ' active' : '');
            
            const plateImage = document.createElement('img');
            plateImage.className = 'plate-image';
            plateImage.src = `/static/crops/${plate.crop_path}?${new Date().getTime()}`; // Chỉ tải lần đầu
            plateImage.alt = `Biển số #${plate.id}`;
            
            const plateInfo = document.createElement('div');
            plateInfo.className = 'plate-info';
            
            const plateIndex = document.createElement('p');
            plateIndex.innerHTML = `Biển số #${plate.id}`;
            
            const statusBadge = document.createElement('span');
            statusBadge.className = 'status-badge ' + (plate.active ? 'status-active' : 'status-inactive');
            statusBadge.textContent = plate.active ? 'Đang theo dõi' : 'Đã rời đi';
            plateIndex.appendChild(statusBadge);
            
            const plateNumber = document.createElement('p');
            plateNumber.id = `plate-number-${plate.id}`;
            if (plate.plate_number) {
                plateNumber.textContent = `Kết quả: ${plate.plate_number}`;
            } else {
                plateNumber.textContent = 'Chưa nhận diện';
                plateNumber.style.color = '#999';
            }
            
            plateInfo.appendChild(plateIndex);
            plateInfo.appendChild(plateNumber);
            plateItem.appendChild(plateImage);
            plateItem.appendChild(plateInfo);
            
            return plateItem;
        }

        // Cập nhật một phần tử biển số hiện có
        function updatePlateItem(element, plate) {
            const isActive = plate.active;
            element.className = 'plate-item' + (isActive ? ' active' : '');
            
            const statusBadge = element.querySelector('.status-badge');
            statusBadge.className = 'status-badge ' + (isActive ? 'status-active' : 'status-inactive');
            statusBadge.textContent = isActive ? 'Đang theo dõi' : 'Đã rời đi';
            
            const plateNumber = element.querySelector(`#plate-number-${plate.id}`);
            if (plate.plate_number) {
                plateNumber.textContent = `Kết quả: ${plate.plate_number}`;
                plateNumber.style.color = '';
            } else if (plateNumber.textContent !== 'Chưa nhận diện') {
                plateNumber.textContent = 'Chưa nhận diện';
                plateNumber.style.color = '#999';
            }
        }

        // Cập nhật ban đầu và định kỳ
        updatePlatesList();
        setInterval(updatePlatesList, 5000); // Tăng lên 5 giây để giảm tải
    
        
        processBtn.addEventListener('click', function() {
            this.disabled = true;
            this.textContent = 'Đang xử lý...';
            fetch('/process_plates', {
                method: 'POST'
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    updatePlatesList();
                }
                this.disabled = false;
                this.textContent = 'Nhận diện ký tự biển số';
            })
            .catch(error => {
                console.error('Error processing plates:', error);
                this.disabled = false;
                this.textContent = 'Nhận diện ký tự biển số';
            });
        });
        
    </script>
</body>
</html>
    """

if __name__ == "__main__":
    if torch.cuda.is_available():
        print(f"CUDA available: {torch.cuda.is_available()}")
        print(f"CUDA Device: {torch.cuda.get_device_name(0)}")
        print(f"CUDA Version: {torch.version.cuda}")
    else:
        print("CUDA không khả dụng, đang sử dụng CPU")
    app.run(host="0.0.0.0", port=5000, debug=True)