const db = require('../db');

// Thông tin camera VLC RTSP
const cameraData = {
    name: "VLC RTSP Test Camera",
    code: "VLC_RTSP_001", // Mã camera duy nhất
    protocol: "rtsp",
    host: "localhost", // VLC server chạy trên localhost
    port: 8554, // Port mặc định của VLC RTSP
    path: "/stream1", // Path từ file .bat
    location_id: null, // Sẽ được set sau khi tạo location
    direction: "bidirectional", // Hướng giám sát
    camera_type: "fixed", // Loại camera
    camera_role: "overview", // Vai trò camera
    width: 1920, // Độ phân giải width
    height: 1080, // Độ phân giải height
    fps: 25, // Khung hình/giây
    installation_date: new Date().toISOString().split('T')[0], // Ngày lắp đặt
    maintenance_schedule: "Hàng tháng", // Lịch bảo trì
    details: "VLC RTSP stream từ file video test", // Chi tiết
    status: "offline", // Trạng thái ban đầu
    is_active: 1, // Camera đang hoạt động
    is_detect: 1 // Bật nhận diện biển số
};

// Thông tin location cho camera
const locationData = {
    name: "VLC Test Location",
    code: "LOC_VLC_001", // Mã vị trí duy nhất
    address: "localhost:8554", // Địa chỉ VLC server
    latitude: null, // Vĩ độ
    longitude: null, // Kinh độ
    description: "Vị trí test VLC RTSP stream",
    zone_type: "checkpoint", // Loại khu vực
    is_restricted: false, // Khu vực hạn chế
    parent_location_id: null, // Vị trí cha
    entry_exit_pair_id: null, // ID cặp vào/ra
    is_main_entry: false, // Là lối vào chính
    is_main_exit: false, // Là lối ra chính
    max_stay_duration_hours: 24, // Thời gian lưu trú tối đa
    alert_on_overstay: true, // Cảnh báo khi ở lại quá lâu
    alert_on_no_exit: true // Cảnh báo khi không có bản ghi ra
};

async function addVLCRTSPCamera() {
    const connection = await db.promise();

    try {
        console.log('🚀 Bắt đầu thêm VLC RTSP Camera...');

        // Bước 1: Tạo location trước
        console.log('1. Tạo location...');
        const [locationResult] = await connection.execute(
            `INSERT INTO locations (
                name, code, address, latitude, longitude, description, zone_type,
                is_restricted, parent_location_id, entry_exit_pair_id, is_main_entry, is_main_exit,
                max_stay_duration_hours, alert_on_overstay, alert_on_no_exit, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
                locationData.name,
                locationData.code,
                locationData.address,
                locationData.latitude,
                locationData.longitude,
                locationData.description,
                locationData.zone_type,
                locationData.is_restricted,
                locationData.parent_location_id,
                locationData.entry_exit_pair_id,
                locationData.is_main_entry,
                locationData.is_main_exit,
                locationData.max_stay_duration_hours,
                locationData.alert_on_overstay,
                locationData.alert_on_no_exit
            ]
        );

        const locationId = locationResult.insertId;
        console.log(`✅ Đã tạo location với ID: ${locationId}`);

        // Bước 2: Kiểm tra xem camera code đã tồn tại chưa
        console.log('2. Kiểm tra camera code...');
        const [existingCamera] = await connection.execute(
            'SELECT id FROM cameras WHERE code = ?',
            [cameraData.code]
        );

        if (existingCamera.length > 0) {
            console.log(`⚠️  Camera với mã ${cameraData.code} đã tồn tại!`);
            console.log('Nếu muốn cập nhật, hãy thay đổi cameraData.code và chạy lại script.');
            return;
        }

        // Bước 3: Tạo camera
        console.log('3. Tạo camera...');
        cameraData.location_id = locationId;

        const [cameraResult] = await connection.execute(
            `INSERT INTO cameras (
                name, code, protocol, host, port, path, location_id, direction, camera_type, camera_role,
                width, height, fps, installation_date, maintenance_schedule, details, 
                status, is_active, is_detect, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
                cameraData.name,
                cameraData.code,
                cameraData.protocol,
                cameraData.host,
                cameraData.port,
                cameraData.path,
                cameraData.location_id,
                cameraData.direction,
                cameraData.camera_type,
                cameraData.camera_role,
                cameraData.width,
                cameraData.height,
                cameraData.fps,
                cameraData.installation_date,
                cameraData.maintenance_schedule,
                cameraData.details,
                cameraData.status,
                cameraData.is_active,
                cameraData.is_detect
            ]
        );

        const cameraId = cameraResult.insertId;
        console.log(`✅ Đã tạo camera mới với ID: ${cameraId}`);

        // Bước 4: Lấy thông tin camera đã tạo
        console.log('4. Lấy thông tin camera đã tạo...');
        const [createdCamera] = await connection.execute(`
            SELECT 
                c.*,
                l.name as location_name,
                l.address as location_address,
                l.zone_type as location_zone_type
            FROM cameras c
            JOIN locations l ON c.location_id = l.id
            WHERE c.id = ?
        `, [cameraId]);

        if (createdCamera.length > 0) {
            const camera = createdCamera[0];
            console.log('📋 Thông tin camera đã tạo:');
            console.log(`   - ID: ${camera.id}`);
            console.log(`   - Tên: ${camera.name}`);
            console.log(`   - Mã: ${camera.code}`);
            console.log(`   - Protocol: ${camera.protocol}`);
            console.log(`   - Host: ${camera.host}`);
            console.log(`   - Port: ${camera.port}`);
            console.log(`   - Path: ${camera.path}`);
            console.log(`   - RTSP URL: ${camera.protocol}://${camera.host}:${camera.port}${camera.path}`);
            console.log(`   - Location: ${camera.location_name} (${camera.location_address})`);
            console.log(`   - Resolution: ${camera.width}x${camera.height}`);
            console.log(`   - FPS: ${camera.fps}`);
            console.log(`   - Status: ${camera.status}`);
            console.log(`   - Detection: ${camera.is_detect ? 'Enabled' : 'Disabled'}`);
        }

        console.log('\n🎉 Hoàn thành! Camera VLC RTSP đã được thêm vào database.');
        console.log('\n📝 Hướng dẫn sử dụng:');
        console.log('1. Chạy file vlc_rtsp_server.bat để khởi động VLC RTSP server');
        console.log('2. Truy cập ứng dụng web và tìm camera "VLC RTSP Test Camera"');
        console.log('3. Click vào camera để xem stream');
        console.log('4. Nếu có lỗi, kiểm tra console log để debug');

    } catch (error) {
        console.error('❌ Lỗi khi thêm VLC RTSP Camera:', error);
        throw error;
    } finally {
        connection.end();
    }
}

// Chạy script
if (require.main === module) {
    addVLCRTSPCamera()
        .then(() => {
            console.log('✅ Script hoàn thành thành công!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Script thất bại:', error);
            process.exit(1);
        });
}

module.exports = { addVLCRTSPCamera };
