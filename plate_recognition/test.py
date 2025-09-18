from pathlib import Path
import cv2
import numpy as np
import time
import redis
import csv
from collections import Counter
from fast_plate_ocr.inference.hub import OcrModel
from open_image_models.detection.core.hub import PlateDetectorModel
from fast_alpr.alpr import ALPR
from cjm_byte_track.core import BYTETracker

def levenshtein_distance(s1, s2):
    """Tính khoảng cách Levenshtein giữa hai chuỗi."""
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    return previous_row[-1]

def is_bbox_in_roi(bbox, roi):
    """Kiểm tra xem bounding box có giao với vùng ROI hay không."""
    bbox_x1, bbox_y1, bbox_x2, bbox_y2 = bbox
    roi_x1, roi_y1, roi_x2, roi_y2 = roi
    return not (bbox_x2 < roi_x1 or bbox_x1 > roi_x2 or
                bbox_y2 < roi_y1 or bbox_y1 > roi_y2)

def run_alpr_video(
    video_path: Path,
    detector_model: PlateDetectorModel,
    ocr_model: OcrModel,
) -> None:
    # Kết nối tới Redis
    r = redis.Redis(host='localhost', port=6379, decode_responses=True)

    cap = cv2.VideoCapture(str(video_path))
    assert cap.isOpened(), f"Không mở được video từ: {video_path}"

    alpr = ALPR(detector_model=detector_model, ocr_model=ocr_model)

    # Khởi tạo ByteTrack
    tracker = BYTETracker(
        track_thresh=0.03,
        track_buffer=500,
        match_thresh=0.95,
        frame_rate=30
    )

    # Định nghĩa vùng ROI (x1, y1, x2, y2)
    roi = (50, 300, 1250, 950)  # Giữ ROI hiện tại

    track_info = {}
    plate_history = {}  # Lưu lịch sử biển số cho mỗi track_id
    prev_time = time.time()  # Khởi tạo thời gian để tính FPS
    
    while True:
        start_time = time.time()  # Đo thời gian xử lý khung hình
        ret, frame = cap.read()
        if not ret:
            break

        # Tính FPS
        curr_time = time.time()
        fps = 1 / (curr_time - prev_time) if curr_time != prev_time else 0
        prev_time = curr_time

        height, width = frame.shape[:2]
        results = alpr.predict(frame)

        # Vẽ vùng ROI lên frame
        roi_x1, roi_y1, roi_x2, roi_y2 = roi
        cv2.rectangle(frame, (roi_x1, roi_y1), (roi_x2, roi_y2), (255, 0, 0), 2)
        cv2.putText(frame, "ROI", (roi_x1, roi_y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 0, 0), 2)

        # Chuẩn bị danh sách detections: [x1, y1, x2, y2, conf]
        detections = []
        for res in results:
            bbox = res.detection.bounding_box
            x1, y1 = max(int(bbox.x1), 0), max(int(bbox.y1), 0)
            x2, y2 = min(int(bbox.x2), width), min(int(bbox.y2), height)
            conf = res.detection.confidence or 0.7
            if is_bbox_in_roi((x1, y1, x2, y2), roi):
                detections.append([x1, y1, x2, y2, conf])

        # Chuyển sang numpy array
        if detections:
            detections_np = np.array(detections, dtype=np.float32)
        else:
            detections_np = np.zeros((0, 5), dtype=np.float32)

        # Cập nhật tracker
        tracks = tracker.update(
            output_results=detections_np,
            img_info=(height, width),
            img_size=(height, width)
        )

        # Vẽ kết quả và lưu vào Redis
        for track in tracks:
            tlwh = track.tlwh
            track_id = track.track_id

            x1, y1, w, h = map(int, tlwh)
            x2, y2 = x1 + w, y1 + h
            if x2 <= x1 or y2 <= y1:
                continue

            # Kiểm tra kích thước bbox
            if (x2 - x1) < 50 or (y2 - y1) < 20:
                print(f"Bbox quá nhỏ bị loại: ({x1},{y1},{x2},{y2})")
                continue

            # Kiểm tra xem bounding box có trong vùng ROI hay không
            if is_bbox_in_roi((x1, y1, x2, y2), roi):
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)

                padding = 10
                x1, y1, x2, y2 = max(x1-padding, 0), max(y1-padding, 0), min(x2+padding, width), min(y2+padding, height)
                
                # Cắt vùng biển số để OCR
                crop = frame[y1:y2, x1:x2]
                
                if crop.size == 0:
                    continue

                # Tiền xử lý tối thiểu để giữ chi tiết ảnh gốc
                crop = cv2.resize(crop, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)

                plate_res = alpr.predict(crop)
                if not plate_res or not plate_res[0].ocr:
                    print(f"Không nhận diện được biển số tại bbox: ({x1},{y1},{x2},{y2})")
                    continue

                text = plate_res[0].ocr.text
                conf = plate_res[0].ocr.confidence
                conf_val = (
                    sum(conf) / len(conf)
                    if isinstance(conf, list) else conf
                )

                # Lọc biển số: confidence >= 0.65 và độ dài >= 5
                if conf_val < 0.65 or len(text) < 5:
                    print(f"Biển số bị loại: {text}, conf: {conf_val}")
                    continue

                # Lưu vào lịch sử biển số, hợp nhất với biển số gần giống
                if track_id not in plate_history:
                    plate_history[track_id] = []
                matched = False
                for i, (existing_plate, conf) in enumerate(plate_history[track_id]):
                    if levenshtein_distance(text, existing_plate) <= 5:
                        if conf_val > conf:
                            plate_history[track_id][i] = (text, conf_val)
                        matched = True
                        break
                if not matched:
                    plate_history[track_id].append((text, conf_val))

                # Kiểm tra xem biển số đã tồn tại trong Redis chưa
                plate_key = f"plate:{text}"
                existing_track_id = r.get(plate_key)
                redis_key = f"track:{track_id}"

                if existing_track_id:
                    # Biển số đã tồn tại, so sánh confidence
                    existing_data = r.hgetall(f"track:{existing_track_id}")
                    existing_conf = float(existing_data.get('confidence', 0))
                    existing_plate = existing_data.get('plate', '')

                    # Kiểm tra độ tương đồng giữa biển số
                    lev_distance = levenshtein_distance(text, existing_plate)
                    lev_threshold = 5
                    if lev_distance <= lev_threshold:
                        if conf_val > existing_conf:
                            # Cập nhật thông tin với track_id mới
                            r.hset(redis_key, mapping={
                                'plate': text,
                                'confidence': conf_val,
                                'timestamp': curr_time,
                                'bbox': f"{x1},{y1},{x2},{y2}",
                                'first_seen': curr_time if track_id not in track_info else track_info[track_id].get('first_seen', curr_time),
                                'last_seen': curr_time
                            })
                            r.set(plate_key, track_id)
                            r.delete(f"track:{existing_track_id}")
                    else:
                        # Biển số khác, lưu mới
                        r.hset(redis_key, mapping={
                            'plate': text,
                            'confidence': conf_val,
                            'timestamp': curr_time,
                            'bbox': f"{x1},{y1},{x2},{y2}",
                            'first_seen': curr_time,
                            'last_seen': curr_time
                        })
                        r.set(plate_key, track_id)
                else:
                    # Biển số mới, lưu vào Redis
                    r.hset(redis_key, mapping={
                        'plate': text,
                        'confidence': conf_val,
                        'timestamp': curr_time,
                        'bbox': f"{x1},{y1},{x2},{y2}",
                        'first_seen': curr_time,
                        'last_seen': curr_time
                    })
                    r.set(plate_key, track_id)

                # Cập nhật track_info để hiển thị
                track_info[track_id] = {
                    'plate': text,
                    'confidence': conf_val,
                    'bbox': f"{x1},{y1},{x2},{y2}",
                    'first_seen': curr_time if track_id not in track_info else track_info[track_id].get('first_seen', curr_time),
                    'last_seen': curr_time
                }

                label = f"ID {track_id}: {track_info.get(track_id, {}).get('plate', '')}"
                cv2.putText(frame, label, (x1, y1 - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)

        # Hiển thị FPS
        fps_text = f"FPS: {fps:.2f}"
        cv2.putText(frame, fps_text, (width - 120, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)

        # Hiển thị thời gian xử lý khung hình
        frame_time = time.time() - start_time
        print(f"Thời gian xử lý khung hình: {frame_time:.4f} giây")
        
        cv2.imshow("ALPR + ByteTrack", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    # Nhóm biển số gần giống cho mỗi track_id
    final_plates = {}
    for track_id, plates in plate_history.items():
        if plates:
            # Nhóm các biển số có Levenshtein distance <= 5
            grouped_plates = {}
            for plate, conf in plates:
                matched = False
                for key in grouped_plates:
                    if levenshtein_distance(plate, key) <= 5:
                        grouped_plates[key].append((plate, conf))
                        matched = True
                        break
                if not matched:
                    grouped_plates[plate] = [(plate, conf)]
            
            # Chọn biển số có tần suất cao nhất trong mỗi nhóm
            most_common_plate = None
            max_count = 0
            max_conf = 0
            for key, plate_list in grouped_plates.items():
                plate_counts = Counter(plate for plate, _ in plate_list)
                common_plate, count = plate_counts.most_common(1)[0]
                conf = max(conf for plate, conf in plate_list if plate == common_plate)
                if count > max_count or (count == max_count and conf > max_conf):
                    most_common_plate = common_plate
                    max_count = count
                    max_conf = conf
            final_plates[track_id] = (most_common_plate, max_conf)

    # Cập nhật Redis với biển số cuối cùng
    r.flushall()  # Xóa dữ liệu cũ
    for track_id, (plate, conf) in final_plates.items():
        redis_key = f"track:{track_id}"
        plate_key = f"plate:{plate}"
        r.hset(redis_key, mapping={
            'plate': plate,
            'confidence': conf,
            'timestamp': track_info.get(track_id, {}).get('last_seen', curr_time),
            'bbox': track_info.get(track_id, {}).get('bbox', ''),
            'first_seen': track_info.get(track_id, {}).get('first_seen', curr_time),
            'last_seen': track_info.get(track_id, {}).get('last_seen', curr_time)
        })
        r.set(plate_key, track_id)

    # In danh sách biển số, ID và confidence từ Redis
    print("\nDanh sách biển số xe:")
    print("ID\tPlate\t\tConfidence\tFirst Seen\tLast Seen")
    print("-" * 60)
    for key in sorted(r.keys("track:*")):
        track_data = r.hgetall(key)
        track_id = key.split(":")[1]
        plate = track_data.get('plate', 'N/A')
        confidence = track_data.get('confidence', '0')
        first_seen = track_data.get('first_seen', '0')
        last_seen = track_data.get('last_seen', '0')
        print(f"{track_id}\t{plate}\t\t{confidence}\t{first_seen}\t{last_seen}")

    # Xuất danh sách vào file CSV
    with open('plates.csv', 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['ID', 'Plate', 'Confidence', 'Timestamp', 'BoundingBox', 'First Seen', 'Last Seen'])
        for key in sorted(r.keys("track:*")):
            track_data = r.hgetall(key)
            track_id = key.split(":")[1]
            plate = track_data.get('plate', 'N/A')
            confidence = track_data.get('confidence', '0')
            timestamp = track_data.get('timestamp', '0')
            bbox = track_data.get('bbox', 'N/A')
            first_seen = track_data.get('first_seen', '0')
            last_seen = track_data.get('last_seen', '0')
            writer.writerow([track_id, plate, confidence, timestamp, bbox, first_seen, last_seen])

    # Xóa toàn bộ dữ liệu trong Redis
    r.flushall()
    print("\nĐã xóa cơ sở dữ liệu Redis.")

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    run_alpr_video(
        video_path=Path("upload/sample.mp4"),
        detector_model="yolo-v9-t-416-license-plate-end2end",
        ocr_model="cct-xs-v1-global-model",
    )