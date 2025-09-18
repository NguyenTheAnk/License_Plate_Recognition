-- Migration: Add source_type column to license_plate_detections table
-- Date: 2025-01-27

-- Check if source_type column exists, if not add it
SET @column_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'license_plate_detections'
    AND COLUMN_NAME = 'source_type'
);

-- Add source_type column if it doesn't exist
SET @sql = IF(@column_exists = 0,
    'ALTER TABLE license_plate_detections ADD COLUMN `source_type` ENUM(''camera'', ''video_upload'', ''websocket_stream'', ''websocket_video'', ''video_file'') DEFAULT ''camera'' COMMENT ''Nguồn dữ liệu: camera live, video upload, websocket stream, websocket video, hoặc video file''',
    'SELECT ''Column source_type already exists'' as message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Update existing records to have default source_type
UPDATE license_plate_detections 
SET source_type = 'camera' 
WHERE source_type IS NULL;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_source_type ON license_plate_detections(source_type);

-- Show result
SELECT 'Migration completed: source_type column added to license_plate_detections' as result;






