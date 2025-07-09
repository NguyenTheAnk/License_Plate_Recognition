const db = require('./db');
const path = require('path');
const { execSync } = require('child_process');

async function debugWhitelistCreation() {
    const connection = await db.promise();
    
    try {
        console.log('=== Debug Whitelist Creation ===');
        
        // 1. Kiểm tra cấu trúc bảng
        console.log('\n1. Checking table structure...');
        const [columns] = await connection.execute('DESCRIBE vehicle_whitelist');
        const detectedPlateColumn = columns.find(col => col.Field === 'detected_plate_image');
        console.log('detected_plate_image column:', detectedPlateColumn);
        
        // 2. Kiểm tra dữ liệu mới nhất
        console.log('\n2. Checking latest whitelist entries...');
        const [latestEntries] = await connection.execute(`
            SELECT id, plate_number, plate_image_path, detected_plate_image, created_at 
            FROM vehicle_whitelist 
            ORDER BY created_at DESC 
            LIMIT 5
        `);
        
        console.log('Latest entries:');
        latestEntries.forEach(entry => {
            console.log(`  ID: ${entry.id}, Plate: ${entry.plate_number}`);
            console.log(`    plate_image_path: ${entry.plate_image_path}`);
            console.log(`    detected_plate_image: ${entry.detected_plate_image}`);
            console.log(`    created_at: ${entry.created_at}`);
            console.log('');
        });
        
        // 3. Test Python script
        console.log('\n3. Testing Python detection script...');
        const testImagePath = path.join(__dirname, 'public/uploads/whitelist/test_image.jpg');
        
        if (require('fs').existsSync(testImagePath)) {
            try {
                const pythonScript = path.join(__dirname, 'controllers/WhiteList/detect_plate.py');
                console.log(`Running: python "${pythonScript}" --image "${testImagePath}" --save-crop`);
                
                const result = execSync(`python "${pythonScript}" --image "${testImagePath}" --save-crop`).toString();
                console.log('Python script output:');
                console.log(result);
                
                // Parse JSON result
                const lines = result.trim().split('\n');
                const lastLine = lines[lines.length - 1];
                try {
                    const ocrResult = JSON.parse(lastLine);
                    console.log('Parsed OCR result:', JSON.stringify(ocrResult, null, 2));
                    
                    if (ocrResult.detected_plate_image) {
                        const fullPath = path.join(__dirname, 'public', ocrResult.detected_plate_image.lstrip('/'));
                        console.log('Detected image should be at:', fullPath);
                        console.log('File exists:', require('fs').existsSync(fullPath));
                    }
                } catch (parseError) {
                    console.log('Failed to parse JSON:', parseError.message);
                }
            } catch (execError) {
                console.log('Python script error:', execError.message);
            }
        } else {
            console.log('Test image not found:', testImagePath);
        }
        
        // 4. Kiểm tra thư mục uploads
        console.log('\n4. Checking upload directories...');
        const uploadDirs = [
            path.join(__dirname, 'public/uploads'),
            path.join(__dirname, 'public/uploads/whitelist'),
            path.join(__dirname, 'public/uploads/whitelist/detected_plates')
        ];
        
        uploadDirs.forEach(dir => {
            const exists = require('fs').existsSync(dir);
            console.log(`${dir}: ${exists ? 'EXISTS' : 'MISSING'}`);
        });
        
        // 5. Kiểm tra file model
        console.log('\n5. Checking model file...');
        const modelPath = path.join(__dirname, 'models/LP_detector_nano_61.pt');
        const modelExists = require('fs').existsSync(modelPath);
        console.log(`Model file: ${modelExists ? 'EXISTS' : 'MISSING'}`);
        
        if (modelExists) {
            const stats = require('fs').statSync(modelPath);
            console.log(`Model size: ${stats.size} bytes`);
        }
        
    } catch (error) {
        console.error('Debug error:', error);
    } finally {
        await connection.end();
    }
}

// Chạy debug
debugWhitelistCreation().then(() => {
    console.log('\n=== Debug completed ===');
    process.exit(0);
}).catch(error => {
    console.error('Debug failed:', error);
    process.exit(1);
}); 