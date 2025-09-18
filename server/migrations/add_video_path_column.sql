-- Migration: Add video_path column to license_plate_detections table
-- Date: 2025-01-09

ALTER TABLE license_plate_detections 
ADD COLUMN `video_path` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Đường dẫn đầy đủ của video upload' 
AFTER `video_filename`;

