const db = require('../db');

async function checkCameras() {
    const connection = await db.promise();

    try {
        console.log('=== KIỂM TRA CAMERAS TRONG DATABASE ===\n');

        // Lấy tất cả cameras
        const [cameras] = await connection.execute(`
            SELECT 
                c.*,
                l.name as location_name,
                l.address as location_address,
                l.zone_type as location_zone_type,
                ml.name as monitoring_location_name,
                ml.zone_type as monitoring_zone_type,
                TIMESTAMPDIFF(SECOND, c.last_heartbeat, NOW()) as seconds_since_heartbeat,
                CASE 
                    WHEN c.last_heartbeat IS NULL THEN 'never'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 5 THEN 'online'
                    WHEN TIMESTAMPDIFF(MINUTE, c.last_heartbeat, NOW()) < 15 THEN 'warning'
                    ELSE 'offline'
                END as connection_status
            FROM cameras c
            JOIN locations l ON c.location_id = l.id
            LEFT JOIN locations ml ON c.monitoring_location_id = ml.id
            WHERE c.is_active = 1
            ORDER BY c.created_at DESC
        `);

        if (cameras.length === 0) {
            console.log('❌ Không có camera nào trong database.');
            return;
        }

        console.log(`📹 Tìm thấy ${cameras.length} camera(s):\n`);

        cameras.forEach((camera, index) => {
            console.log(`--- Camera ${index + 1} ---`);
            console.log(`ID: ${camera.id}`);
            console.log(`Tên: ${camera.name}`);
            console.log(`Mã: ${camera.code || 'N/A'}`);
            console.log(`URL: ${camera.url || 'N/A'}`);
            console.log(`Vị trí: ${camera.location_name} (${camera.location_address})`);
            console.log(`Loại khu vực: ${camera.location_zone_type}`);
            console.log(`Hướng giám sát: ${camera.direction}`);
            console.log(`Loại camera: ${camera.camera_type}`);
            console.log(`Vai trò: ${camera.camera_role || 'N/A'}`);
            console.log(`Độ phân giải: ${camera.resolution || 'N/A'}`);
            console.log(`FPS: ${camera.fps}`);
            console.log(`Trạng thái: ${camera.status}`);
            console.log(`Trạng thái kết nối: ${camera.connection_status}`);
            console.log(`Lần ping cuối: ${camera.last_heartbeat || 'Chưa có'}`);
            console.log(`Ngày lắp đặt: ${camera.installation_date || 'N/A'}`);
            console.log(`Lịch bảo trì: ${camera.maintenance_schedule || 'N/A'}`);
            console.log(`Ngày tạo: ${camera.created_at}`);
            console.log(`Ngày cập nhật: ${camera.updated_at}`);
            console.log('');
        });

        // Thống kê
        console.log('=== THỐNG KÊ ===');
        const totalCameras = cameras.length;
        const onlineCameras = cameras.filter(c => c.connection_status === 'online').length;
        const offlineCameras = cameras.filter(c => c.connection_status === 'offline').length;
        const warningCameras = cameras.filter(c => c.connection_status === 'warning').length;
        const neverConnected = cameras.filter(c => c.connection_status === 'never').length;

        console.log(`Tổng số camera: ${totalCameras}`);
        console.log(`Online: ${onlineCameras}`);
        console.log(`Offline: ${offlineCameras}`);
        console.log(`Warning: ${warningCameras}`);
        console.log(`Chưa kết nối: ${neverConnected}`);

        // Thống kê theo loại
        const fixedCameras = cameras.filter(c => c.camera_type === 'fixed').length;
        const ptzCameras = cameras.filter(c => c.camera_type === 'ptz').length;
        const mobileCameras = cameras.filter(c => c.camera_type === 'mobile').length;

        console.log(`\nTheo loại camera:`);
        console.log(`Fixed: ${fixedCameras}`);
        console.log(`PTZ: ${ptzCameras}`);
        console.log(`Mobile: ${mobileCameras}`);

        // Thống kê theo vai trò
        const entryCameras = cameras.filter(c => c.camera_role === 'entry').length;
        const exitCameras = cameras.filter(c => c.camera_role === 'exit').length;
        const internalCameras = cameras.filter(c => c.camera_role === 'internal').length;
        const overviewCameras = cameras.filter(c => c.camera_role === 'overview').length;

        console.log(`\nTheo vai trò:`);
        console.log(`Entry: ${entryCameras}`);
        console.log(`Exit: ${exitCameras}`);
        console.log(`Internal: ${internalCameras}`);
        console.log(`Overview: ${overviewCameras}`);

    } catch (error) {
        console.error('❌ Lỗi khi kiểm tra cameras:', error);
        console.error('Chi tiết lỗi:', error.message);
    } finally {
        await connection.end();
    }
}

async function checkLocations() {
    const connection = await db.promise();

    try {
        console.log('\n=== KIỂM TRA LOCATIONS TRONG DATABASE ===\n');

        // Lấy tất cả locations
        const [locations] = await connection.execute(`
            SELECT 
                l.*,
                pl.name as parent_location_name,
                COUNT(c.id) as camera_count,
                COUNT(CASE WHEN c.status = 'online' THEN 1 END) as online_camera_count
            FROM locations l
            LEFT JOIN locations pl ON l.parent_location_id = pl.id
            LEFT JOIN cameras c ON (l.id = c.location_id OR l.id = c.monitoring_location_id) AND c.is_active = 1
            WHERE l.is_active = 1
            GROUP BY l.id, l.name, l.zone_type, l.address, l.latitude, l.longitude, 
                     l.parent_location_id, l.is_active, l.created_at, l.updated_at, 
                     pl.name
            ORDER BY l.created_at DESC
        `);

        if (locations.length === 0) {
            console.log('❌ Không có location nào trong database.');
            return;
        }

        console.log(`📍 Tìm thấy ${locations.length} location(s):\n`);

        locations.forEach((location, index) => {
            console.log(`--- Location ${index + 1} ---`);
            console.log(`ID: ${location.id}`);
            console.log(`Tên: ${location.name}`);
            console.log(`Mã: ${location.code || 'N/A'}`);
            console.log(`Địa chỉ: ${location.address || 'N/A'}`);
            console.log(`Loại khu vực: ${location.zone_type}`);
            console.log(`Vị trí cha: ${location.parent_location_name || 'Không có'}`);
            console.log(`Số camera: ${location.camera_count}`);
            console.log(`Camera online: ${location.online_camera_count}`);
            console.log(`Khu vực hạn chế: ${location.is_restricted ? 'Có' : 'Không'}`);
            console.log(`Lối vào chính: ${location.is_main_entry ? 'Có' : 'Không'}`);
            console.log(`Lối ra chính: ${location.is_main_exit ? 'Có' : 'Không'}`);
            console.log(`Thời gian lưu trú tối đa: ${location.max_stay_duration_hours} giờ`);
            console.log(`Ngày tạo: ${location.created_at}`);
            console.log(`Ngày cập nhật: ${location.updated_at}`);
            console.log('');
        });

    } catch (error) {
        console.error('❌ Lỗi khi kiểm tra locations:', error);
        console.error('Chi tiết lỗi:', error.message);
    } finally {
        await connection.end();
    }
}

// Chạy script
if (require.main === module) {
    checkCameras().then(() => {
        return checkLocations();
    }).catch(error => {
        console.error('Lỗi:', error);
    });
}

module.exports = { checkCameras, checkLocations }; 