const db = require('./db');

async function fixDatabase() {
    const connection = await db.promise();
    
    try {
        console.log('=== Database Fix Script ===');
        
        // 1. Kiểm tra cấu trúc bảng
        console.log('\n1. Checking table structure...');
        const [columns] = await connection.execute('DESCRIBE vehicle_whitelist');
        
        const detectedPlateColumn = columns.find(col => col.Field === 'detected_plate_image');
        if (detectedPlateColumn) {
            console.log('✅ detected_plate_image column exists:', detectedPlateColumn);
        } else {
            console.log('❌ detected_plate_image column missing!');
            
            // Thêm cột nếu thiếu
            console.log('Adding detected_plate_image column...');
            await connection.execute(`
                ALTER TABLE vehicle_whitelist 
                ADD COLUMN detected_plate_image VARCHAR(500) COMMENT 'Đường dẫn ảnh biển số đã phát hiện'
            `);
            console.log('✅ Column added successfully');
        }
        
        // 2. Kiểm tra dữ liệu hiện tại
        console.log('\n2. Checking current data...');
        const [entries] = await connection.execute(`
            SELECT id, plate_number, plate_image_path, detected_plate_image, created_at 
            FROM vehicle_whitelist 
            WHERE plate_image_path IS NOT NULL 
            ORDER BY created_at DESC 
            LIMIT 10
        `);
        
        console.log(`Found ${entries.length} entries with images:`);
        entries.forEach(entry => {
            console.log(`  ID: ${entry.id}, Plate: ${entry.plate_number}`);
            console.log(`    plate_image_path: ${entry.plate_image_path}`);
            console.log(`    detected_plate_image: ${entry.detected_plate_image || 'NULL'}`);
        });
        
        // 3. Kiểm tra thư mục uploads
        console.log('\n3. Checking upload directories...');
        const fs = require('fs');
        const path = require('path');
        
        const uploadDirs = [
            path.join(__dirname, 'public/uploads'),
            path.join(__dirname, 'public/uploads/whitelist'),
            path.join(__dirname, 'public/uploads/whitelist/detected_plates')
        ];
        
        uploadDirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                console.log(`Creating directory: ${dir}`);
                fs.mkdirSync(dir, { recursive: true });
            }
            console.log(`✅ ${dir}: EXISTS`);
        });
        
        // 4. Kiểm tra file model
        console.log('\n4. Checking model file...');
        const modelPath = path.join(__dirname, 'models/LP_detector_nano_61.pt');
        if (fs.existsSync(modelPath)) {
            const stats = fs.statSync(modelPath);
            console.log(`✅ Model file exists: ${stats.size} bytes`);
        } else {
            console.log('❌ Model file missing:', modelPath);
        }
        
        // 5. Tạo thư mục detected_plates nếu chưa có
        const detectedPlatesDir = path.join(__dirname, 'public/uploads/whitelist/detected_plates');
        if (!fs.existsSync(detectedPlatesDir)) {
            console.log('\n5. Creating detected_plates directory...');
            fs.mkdirSync(detectedPlatesDir, { recursive: true });
            console.log('✅ detected_plates directory created');
        } else {
            console.log('\n5. ✅ detected_plates directory already exists');
        }
        
        console.log('\n=== Database fix completed ===');
        
    } catch (error) {
        console.error('Database fix error:', error);
    } finally {
        await connection.end();
    }
}

// Chạy fix
fixDatabase().then(() => {
    console.log('Fix completed successfully');
    process.exit(0);
}).catch(error => {
    console.error('Fix failed:', error);
    process.exit(1);
}); 