import React, { useState, useEffect } from 'react';
import './CameraRouteDisplay.css';

const CameraRouteDisplay = ({ routeData, plateNumber, totalDetections, totalCameras, timeRange, onCameraClick }) => {
    const [selectedDate, setSelectedDate] = useState(null);
    const [dailyData, setDailyData] = useState({});

    // Group cameras by date - IMPROVED: Xử lý đầy đủ dữ liệu
    useEffect(() => {
        console.log('🔍 CameraRouteDisplay received routeData:', routeData);
        console.log('🔍 orderedCameras:', routeData?.orderedCameras);
        
        if (routeData && routeData.orderedCameras && routeData.orderedCameras.length > 0) {
            const orderedCameras = routeData.orderedCameras;
            console.log('🔍 Processing orderedCameras:', orderedCameras);
            const grouped = {};
            
            // IMPROVED: Xử lý tất cả detections để có đầy đủ ngày
            orderedCameras.forEach((camera, cameraIndex) => {
                console.log(`🔍 Processing camera ${cameraIndex}:`, camera);
                console.log(`🔍 Camera detections:`, camera.detections);
                
                if (camera.detections && camera.detections.length > 0) {
                    console.log(`🔍 Camera ${camera.camera_id} has ${camera.detections.length} detections`);
                    // Sử dụng tất cả detections để tạo đầy đủ ngày
                    camera.detections.forEach((detection, detectionIndex) => {
                        console.log(`🔍 Processing detection ${detectionIndex}:`, detection);
                        if (detection.detected_at) {
                            const date = new Date(detection.detected_at);
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            const dateString = `${year}-${month}-${day}`;
                            
                            if (!grouped[dateString]) {
                                grouped[dateString] = [];
                            }
                            
                            // Kiểm tra xem camera đã có trong ngày này chưa
                            const existingCamera = grouped[dateString].find(c => c.camera_id === camera.camera_id);
                            if (!existingCamera) {
                                grouped[dateString].push({
                                    ...camera,
                                    detections_for_date: camera.detections.filter(d => {
                                        const dDate = new Date(d.detected_at);
                                        return dDate.getFullYear() === year && 
                                               dDate.getMonth() === date.getMonth() && 
                                               dDate.getDate() === day;
                                    })
                                });
                            }
                        }
                    });
                } else if (camera.detection_count > 0 || camera.first_detected_at) {
                    console.log(`🔍 Camera ${camera.camera_id} using fallback logic, detection_count: ${camera.detection_count}`);
                    // Fallback: sử dụng first_detected_at nếu không có detections
                    if (camera.first_detected_at) {
                        const date = new Date(camera.first_detected_at);
                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        const dateString = `${year}-${month}-${day}`;
                        
                        if (!grouped[dateString]) {
                            grouped[dateString] = [];
                        }
                        
                        // Kiểm tra xem camera đã có trong ngày này chưa
                        const existingCamera = grouped[dateString].find(c => c.camera_id === camera.camera_id);
                        if (!existingCamera) {
                            grouped[dateString].push({
                                ...camera,
                                detections_for_date: [], // Không có detections chi tiết
                                detection_count: camera.detection_count || 0
                            });
                        }
                    }
                }
            });
            
            console.log('🔍 Final grouped data:', grouped);
            setDailyData(grouped);
            
            // Set first date as selected by default
            const dates = Object.keys(grouped).sort();
            console.log('🔍 Available dates:', dates);
            if (dates.length > 0) {
                setSelectedDate(dates[0]);
            }
        } else {
            console.log('🔍 No routeData or orderedCameras available');
        }
    }, [routeData]);

    if (!routeData || !routeData.orderedCameras || routeData.orderedCameras.length === 0) {
        return (
            <div className="camera-route-display">
                <div className="no-data">
                    <p>Chưa có dữ liệu lộ trình</p>
                </div>
            </div>
        );
    }

    const handleCameraClick = (camera) => {
        if (onCameraClick) {
            onCameraClick(camera);
        }
    };

    const formatDateTime = (dateTime) => {
        if (!dateTime) return '';
        const date = new Date(dateTime);
        return date.toLocaleString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('vi-VN', {
            weekday: 'long',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    };

    const getDateStats = (date) => {
        const cameras = dailyData[date] || [];
        const totalDetections = cameras.reduce((sum, camera) => {
            // IMPROVED: Sử dụng detections_for_date nếu có, nếu không thì dùng detection_count
            if (camera.detections_for_date && camera.detections_for_date.length > 0) {
                return sum + camera.detections_for_date.length;
            }
            // Fallback: sử dụng detection_count
            return sum + (camera.detection_count || 0);
        }, 0);
        
        console.log(`🔍 Date ${date} stats:`, { cameraCount: cameras.length, totalDetections });
        return {
            cameraCount: cameras.length,
            totalDetections: totalDetections
        };
    };

    return (
        <div className="camera-route-display">
            {/* Header đơn giản */}
            <div className="route-header">
                <h3>Lộ trình di chuyển</h3>
                <div className="route-summary">
                    <span>Biển số: <strong>{plateNumber}</strong></span>
                    <span>Tổng: <strong>{totalDetections}</strong> lần • <strong>{totalCameras}</strong> camera</span>
                </div>
            </div>

            {/* Tabs cho các ngày */}
            <div className="date-tabs">
                {Object.keys(dailyData).sort().map(date => {
                    const stats = getDateStats(date);
                    return (
                        <button
                            key={date}
                            className={`date-tab ${selectedDate === date ? 'active' : ''}`}
                            onClick={() => setSelectedDate(date)}
                        >
                            <div className="date-info">
                                <span className="date-text">{formatDate(date)}</span>
                                <span className="date-stats">
                                    {stats.cameraCount} camera • {stats.totalDetections} lần
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Lộ trình cho ngày được chọn */}
            {selectedDate && dailyData[selectedDate] && (
                <div className="daily-route">
                    <div className="daily-header">
                        <h4>Lộ trình ngày {formatDate(selectedDate)}</h4>
                    </div>

                    {/* Danh sách camera theo thứ tự */}
                    <div className="camera-list">
                        {dailyData[selectedDate].map((camera, index) => {
                            // IMPROVED: Sử dụng detections_for_date nếu có
                            const detectionCount = (camera.detections_for_date && camera.detections_for_date.length > 0) ? 
                                camera.detections_for_date.length : 
                                (camera.detection_count || 0);
                            
                            const firstDetectionTime = (camera.detections_for_date && camera.detections_for_date.length > 0) ? 
                                camera.detections_for_date[0]?.detected_at : 
                                camera.first_detected_at;
                            
                            console.log(`🔍 Camera ${camera.camera_id} display:`, { 
                                detectionCount, 
                                firstDetectionTime,
                                detections_for_date: camera.detections_for_date?.length,
                                detection_count: camera.detection_count
                            });
                            
                            return (
                                <div key={camera.camera_id} className="camera-item">
                                    <div className="camera-order">{index + 1}</div>
                                    <div 
                                        className="camera-info"
                                        onClick={() => handleCameraClick(camera)}
                                    >
                                        <div className="camera-name">{camera.camera_name}</div>
                                        <div className="camera-details">
                                            <span>ID: {camera.camera_id}</span>
                                            <span>{detectionCount} lần</span>
                                            <span>{formatDateTime(firstDetectionTime)}</span>
                                        </div>
                                        {/* IMPROVED: Hiển thị thêm thông tin chi tiết */}
                                        {camera.detections_for_date && camera.detections_for_date.length > 0 && (
                                            <div className="camera-detections">
                                                <small style={{ color: '#666', fontSize: '11px' }}>
                                                    Lần cuối: {formatDateTime(camera.detections_for_date[camera.detections_for_date.length - 1]?.detected_at)}
                                                </small>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default CameraRouteDisplay;
