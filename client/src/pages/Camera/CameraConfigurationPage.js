import React, { useState, useEffect } from 'react';
import './CameraConfigurationPage.css';

const CameraConfigurationPage = ({ cameraId, onSave }) => {
    const [camera, setCamera] = useState({
        ke: '',
        mid: '',
        name: '',
        code: '',
        details: '',
        protocol: 'rtsp',
        host: '0.0.0.0',
        path: '',
        port: 554,
        fps: 30,
        width: '',
        height: '',
        location_id: '',
        direction: 'bidirectional',
        camera_type: 'fixed',
        camera_role: '',
        monitoring_location_id: '',
        status: 'offline',
        last_heartbeat: '',
        installation_date: '',
        maintenance_schedule: '',
        is_active: true,
        is_detect: true
    });

    useEffect(() => {
        if (cameraId) {
            const sampleData = {
                ke: 'KEY123',
                mid: 'CAM001',
                name: 'Camera 1',
                code: 'CAM-001',
                details: 'Camera giám sát cổng chính',
                protocol: 'rtsp',
                host: '192.168.1.100',
                path: '/stream',
                port: 554,
                fps: 30,
                width: 1920,
                height: 1080,
                location_id: '1',
                direction: 'bidirectional',
                camera_type: 'fixed',
                camera_role: 'entry',
                monitoring_location_id: '1',
                status: 'online',
                last_heartbeat: '2025-07-01 10:00:00',
                installation_date: '2025-01-15',
                maintenance_schedule: 'Monthly',
                is_active: true,
                is_detect: true
            };
            setCamera(sampleData);
        }
    }, [cameraId]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setCamera(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = () => {
        if (onSave) {
            onSave(camera);
        }
        alert('Cấu hình đã được lưu!');
    };

    const handleRefresh = () => {
        if (cameraId) {
            console.log('Làm mới dữ liệu cho camera ID:', cameraId);
        }
    };

    return (
        <div className="camera-config-container">
            <div className="config-section">
                <h3>Cấu hình camera: {camera.name || 'Chưa đặt tên'}</h3>
                <hr />
                <div className="config-group">
                    <label>Chọn camera</label>
                    <input type="text" name="name" value={camera.name} onChange={handleChange} placeholder="Nhập tên camera" />
                </div>
                <div className="config-group">
                    <label>Nhận diện biển số xe</label>
                    <input type="text" name="details" value={camera.details} onChange={handleChange} placeholder="Nhập chi tiết" />
                </div>
                <div className="config-group">
                    <label>Giám sát</label>
                    <select name="monitoring_location_id" value={camera.monitoring_location_id} onChange={handleChange}>
                        <option value="">Chọn giám sát...</option>
                        <option value="1">Vị trí 1</option>
                        <option value="2">Vị trí 2</option>
                    </select>
                </div>
                <button className="refresh-btn" onClick={handleRefresh}>Làm mới</button>
            </div>
            <div className="config-section">
                <h3>Thông tin camera</h3>
                <hr />
                <div className="config-group">
                    <label>Chế độ giám sát</label>
                    <input type="text" name="status" value={camera.status} onChange={handleChange} placeholder="online/offline" />
                </div>
                <div className="config-group">
                    <label>Xem trực tiếp (liveview)</label>
                    <input type="text" name="path" value={camera.path} onChange={handleChange} placeholder="Đường dẫn stream" />
                </div>
                <div className="config-group">
                    <label>Mã máy nhận giám sát (tên thư mục lưu các video camera)</label>
                    <input type="text" name="mid" value={camera.mid} onChange={handleChange} placeholder="Mã định danh" />
                </div>
                <div className="config-group">
                    <label>Tên camera</label>
                    <input type="text" name="name" value={camera.name} onChange={handleChange} placeholder="Nhập tên camera" />
                </div>
                <div className="config-group">
                    <label>Nhận diện biển số xe</label>
                    <input type="text" name="details" value={camera.details} onChange={handleChange} placeholder="Nhập chi tiết" />
                </div>
                <div className="config-group">
                    <label>Thể (phân loại camera theo nhóm)</label>
                    <input type="text" name="camera_type" value={camera.camera_type} onChange={handleChange} placeholder="fixed/ptz/mobile" />
                </div>
                <div className="config-group">
                    <label>Số ngày để lưu Video</label>
                    <input type="number" name="fps" value={camera.fps} onChange={handleChange} placeholder="Số khung hình/giây" />
                </div>
                <div className="config-group">
                    <label>Ghi chú</label>
                    <input type="text" name="maintenance_schedule" value={camera.maintenance_schedule} onChange={handleChange} placeholder="Lịch bảo trì" />
                </div>
            </div>
            <div className="config-section">
                <h3>Thiết lập kết nối</h3>
                <hr />
                <div className="config-group">
                    <label>Khóa đầu vào</label>
                    <input type="text" name="ke" value={camera.ke} onChange={handleChange} placeholder="Khóa định danh" />
                </div>
                <div className="config-group">
                    <label>Tỷ lệ khung hình (FPS)</label>
                    <input type="number" name="fps" value={camera.fps} onChange={handleChange} placeholder="Khung hình/giây" />
                </div>
                <div className="config-group">
                    <label>Độ phân giải chiều rộng</label>
                    <input type="number" name="width" value={camera.width} onChange={handleChange} placeholder="Chiều rộng" />
                </div>
                <div className="config-group">
                    <label>Độ phân giải chiều cao</label>
                    <input type="number" name="height" value={camera.height} onChange={handleChange} placeholder="Chiều cao" />
                </div>
                <div className="config-group">
                    <label>Đường dẫn URL đầu vào</label>
                    <input type="text" name="path" value={camera.path} onChange={handleChange} placeholder="Đường dẫn stream" />
                </div>
                <div className="config-group">
                    <label>Thử kết nối lại</label>
                    <input type="number" name="port" value={camera.port} onChange={handleChange} placeholder="Cổng kết nối" />
                </div>
                <div className="config-group">
                    <label>Bỏ qua ping</label>
                    <input type="checkbox" name="is_active" checked={camera.is_active} onChange={handleChange} />
                </div>
                <div className="config-group">
                    <label>Camera chuẩn ONVIF</label>
                    <input type="checkbox" name="is_detect" checked={camera.is_detect} onChange={handleChange} />
                </div>
                <button className="save-btn" onClick={handleSubmit}>Lưu</button>
                
            </div>
        </div>
    );
};

export default CameraConfigurationPage;