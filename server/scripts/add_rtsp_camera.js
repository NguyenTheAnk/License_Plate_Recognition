const db = require('../db');

// Thông tin camera RTSP
const cameraData = {
    name: "Camera RTSP - 117.4.240.104",
    code: "CAM_RTSP_001", // Mã camera duy nhất
    url: "rtsp://admin:Admin123@117.4.240.104:8084/Streaming/Channels/101/",
    location_id: null, // Sẽ được set sau khi tạo location
    direction: "bidirectional", // Hướng giám sát: inbound, outbound, bidirectional, entry_only, exit_only
    camera_type: "fixed", // Loại camera: fixed, ptz, mobile
    camera_role: "overview", // Vai trò camera: entry, exit, internal, overview
    monitoring_location_id: null, // Vị trí giám sát chính (có thể null)
    resolution: "1920x1080", // Độ phân giải
    fps: 30, // Khung hình/giây
    installation_date: new Date().toISOString().split('T')[0], // Ngày lắp đặt (hôm nay)
    maintenance_schedule: "Hàng tháng" // Lịch bảo trì
};

// Thông tin location cho camera
const locationData = {
    name: "Vị trí Camera RTSP",
    code: "LOC_RTSP_001", // Mã vị trí duy nhất
    address: "117.4.240.104:8084", // Địa chỉ IP và port
    latitude: null, // Vĩ độ (có thể null)
    longitude: null, // Kinh độ (có thể null)
    description: "Vị trí lắp đặt camera RTSP",
    zone_type: "checkpoint", // Loại khu vực: entrance, exit, checkpoint, parking, restricted, entry_point, exit_point, monitoring_zone
    is_restricted: false, // Khu vực hạn chế
    parent_location_id: null, // Vị trí cha (có thể null)
    entry_exit_pair_id: null, // ID cặp vào/ra (có thể null)
    is_main_entry: false, // Là lối vào chính
    is_main_exit: false, // Là lối ra chính
    max_stay_duration_hours: 24, // Thời gian lưu trú tối đa (giờ)
    alert_on_overstay: true, // Cảnh báo khi ở lại quá lâu
    alert_on_no_exit: true // Cảnh báo khi không có bản ghi ra
};

async function addRTSPCamera() {
    const connection = await db.promise();

    try {
        console.log('Bắt đầu thêm camera RTSP...');

        // Bước 1: Tạo location trước
        console.log('1. Tạo vị trí cho camera...');

        // Kiểm tra xem location code đã tồn tại chưa
        const [existingLocation] = await connection.execute(
            'SELECT id FROM locations WHERE code = ?',
            [locationData.code]
        );

        let locationId;
        if (existingLocation.length > 0) {
            console.log(`Vị trí với mã ${locationData.code} đã tồn tại, sử dụng vị trí hiện có.`);
            locationId = existingLocation[0].id;
        } else {
            // Tạo location mới
            const [locationResult] = await connection.execute(
                `INSERT INTO locations (
                    name, code, address, latitude, longitude, description, zone_type,
                    is_restricted, parent_location_id, entry_exit_pair_id,
                    is_main_entry, is_main_exit, max_stay_duration_hours,
                    alert_on_overstay, alert_on_no_exit, is_active, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
                [
                    locationData.name, locationData.code, locationData.address,
                    locationData.latitude, locationData.longitude, locationData.description,
                    locationData.zone_type, locationData.is_restricted, locationData.parent_location_id,
                    locationData.entry_exit_pair_id, locationData.is_main_entry, locationData.is_main_exit,
                    locationData.max_stay_duration_hours, locationData.alert_on_overstay, locationData.alert_on_no_exit
                ]
            );
            locationId = locationResult.insertId;
            console.log(`Đã tạo vị trí mới với ID: ${locationId}`);
        }

        // Bước 2: Kiểm tra xem camera code đã tồn tại chưa
        console.log('2. Kiểm tra camera code...');
        const [existingCamera] = await connection.execute(
            'SELECT id FROM cameras WHERE code = ?',
            [cameraData.code]
        );

        if (existingCamera.length > 0) {
            console.log(`Camera với mã ${cameraData.code} đã tồn tại!`);
            console.log('Nếu muốn cập nhật, hãy thay đổi cameraData.code và chạy lại script.');
            return;
        }

        // Bước 3: Tạo camera
        console.log('3. Tạo camera...');
        cameraData.location_id = locationId;

        const [cameraResult] = await connection.execute(
            `INSERT INTO cameras (
                name, code, url, location_id, direction, camera_type, camera_role,
                monitoring_location_id, resolution, fps, installation_date, 
                maintenance_schedule, status, is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'offline', 1, NOW(), NOW())`,
            [
                cameraData.name,
                cameraData.code,
                cameraData.url,
                cameraData.location_id,
                cameraData.direction,
                cameraData.camera_type,
                cameraData.camera_role,
                cameraData.monitoring_location_id,
                cameraData.resolution,
                cameraData.fps,
                cameraData.installation_date,
                cameraData.maintenance_schedule
            ]
        );

        const cameraId = cameraResult.insertId;
        console.log(`Đã tạo camera mới với ID: ${cameraId}`);

        // Bước 4: Lấy thông tin camera đã tạo
        console.log('4. Lấy thông tin camera đã tạo...');
        const [createdCamera] = await connection.execute(`
            SELECT 
                c.*,
                l.name as location_name,
                l.address as location_address,
                l.zone_type as location_zone_type,
                ml.name as monitoring_location_name,
                ml.zone_type as monitoring_zone_type
            FROM cameras c
            JOIN locations l ON c.location_id = l.id
            LEFT JOIN locations ml ON c.monitoring_location_id = ml.id
            WHERE c.id = ?
        `, [cameraId]);

        console.log('\n=== THÔNG TIN CAMERA ĐÃ TẠO ===');
        console.log(`ID: ${createdCamera[0].id}`);
        console.log(`Tên: ${createdCamera[0].name}`);
        console.log(`Mã: ${createdCamera[0].code}`);
        console.log(`URL: ${createdCamera[0].url}`);
        console.log(`Vị trí: ${createdCamera[0].location_name} (${createdCamera[0].location_address})`);
        console.log(`Loại khu vực: ${createdCamera[0].location_zone_type}`);
        console.log(`Hướng giám sát: ${createdCamera[0].direction}`);
        console.log(`Loại camera: ${createdCamera[0].camera_type}`);
        console.log(`Vai trò: ${createdCamera[0].camera_role}`);
        console.log(`Độ phân giải: ${createdCamera[0].resolution}`);
        console.log(`FPS: ${createdCamera[0].fps}`);
        console.log(`Trạng thái: ${createdCamera[0].status}`);
        console.log(`Ngày lắp đặt: ${createdCamera[0].installation_date}`);
        console.log(`Lịch bảo trì: ${createdCamera[0].maintenance_schedule}`);
        console.log('===============================\n');

        console.log('✅ Thêm camera RTSP thành công!');

    } catch (error) {
        console.error('❌ Lỗi khi thêm camera RTSP:', error);
        console.error('Chi tiết lỗi:', error.message);
    } finally {
        await connection.end();
    }
}

// Chạy script
if (require.main === module) {
    addRTSPCamera();
}

module.exports = { addRTSPCamera, cameraData, locationData };