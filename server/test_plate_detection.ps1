# Script test cho module detect_plate.py trên Windows
param(
    [string]$ImagePath = ""
)

Write-Host "License Plate Detection Module Test" -ForegroundColor Green
Write-Host "=" * 50 -ForegroundColor Green
Write-Host ""

# Kiểm tra Python
Write-Host "=== Checking Python Environment ===" -ForegroundColor Yellow
try {
    $pythonVersion = python --version 2>&1
    Write-Host "✅ Python found: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Python not found or not in PATH" -ForegroundColor Red
    exit 1
}

# Kiểm tra các thư viện cần thiết
Write-Host "`n=== Checking Required Libraries ===" -ForegroundColor Yellow
$requiredLibraries = @("torch", "cv2", "numpy", "paddleocr")

foreach ($lib in $requiredLibraries) {
    try {
        $result = python -c "import $lib; print('OK')" 2>&1
        if ($result -eq "OK") {
            Write-Host "✅ $lib is available" -ForegroundColor Green
        } else {
            Write-Host "❌ $lib is not available" -ForegroundColor Red
        }
    } catch {
        Write-Host "❌ $lib is not available" -ForegroundColor Red
    }
}

# Kiểm tra module detect_plate.py
Write-Host "`n=== Checking Plate Detection Module ===" -ForegroundColor Yellow
$modulePath = Join-Path $PSScriptRoot "controllers\WhiteList\detect_plate.py"
if (Test-Path $modulePath) {
    Write-Host "✅ Module found: $modulePath" -ForegroundColor Green
} else {
    Write-Host "❌ Module not found: $modulePath" -ForegroundColor Red
    exit 1
}

# Kiểm tra model files
Write-Host "`n=== Checking Model Files ===" -ForegroundColor Yellow
$modelsDir = Join-Path $PSScriptRoot "models"
$detectorModel = Join-Path $modelsDir "LP_detector_nano_61.pt"

if (Test-Path $detectorModel) {
    Write-Host "✅ Detector model found: $detectorModel" -ForegroundColor Green
} else {
    Write-Host "❌ Detector model not found: $detectorModel" -ForegroundColor Red
    exit 1
}

# Kiểm tra thư mục yolov5
Write-Host "`n=== Checking YOLOv5 Directory ===" -ForegroundColor Yellow
$yolov5Dir = Join-Path $PSScriptRoot "models\yolov5"
if (Test-Path $yolov5Dir) {
    Write-Host "✅ YOLOv5 directory found: $yolov5Dir" -ForegroundColor Green
    
    # Kiểm tra các file cần thiết
    $requiredFiles = @(
        "models\common.py",
        "utils\general.py", 
        "utils\torch_utils.py"
    )
    
    foreach ($file in $requiredFiles) {
        $fullPath = Join-Path $yolov5Dir $file
        if (Test-Path $fullPath) {
            Write-Host "✅ YOLOv5 file found: $file" -ForegroundColor Green
        } else {
            Write-Host "❌ YOLOv5 file not found: $file" -ForegroundColor Red
        }
    }
} else {
    Write-Host "❌ YOLOv5 directory not found: $yolov5Dir" -ForegroundColor Red
    exit 1
}

# Test với ảnh nếu được cung cấp
if ($ImagePath -and (Test-Path $ImagePath)) {
    Write-Host "`n=== Testing with Image ===" -ForegroundColor Yellow
    Write-Host "Image path: $ImagePath" -ForegroundColor Cyan
    
    try {
        # Chạy module detection
        $detectionCommand = "python `"$modulePath`" --image `"$ImagePath`""
        Write-Host "Running: $detectionCommand" -ForegroundColor Cyan
        
        $result = Invoke-Expression $detectionCommand 2>&1
        
        # Lấy dòng cuối cùng (JSON result)
        $lastLine = ($result | Select-Object -Last 1).Trim()
        
        try {
            $jsonResult = $lastLine | ConvertFrom-Json
            if ($jsonResult.success) {
                Write-Host "✅ Detection successful!" -ForegroundColor Green
                Write-Host "Text: $($jsonResult.text)" -ForegroundColor Cyan
                Write-Host "Method: $($jsonResult.method)" -ForegroundColor Cyan
                if ($jsonResult.confidence) {
                    Write-Host "Confidence: $([math]::Round($jsonResult.confidence * 100, 1))%" -ForegroundColor Cyan
                }
                if ($jsonResult.bbox) {
                    Write-Host "Bounding box: $($jsonResult.bbox | ConvertTo-Json -Compress)" -ForegroundColor Cyan
                }
                if ($jsonResult.detections) {
                    Write-Host "Total detections: $($jsonResult.detections.Count)" -ForegroundColor Cyan
                }
                if ($jsonResult.message) {
                    Write-Host "Message: $($jsonResult.message)" -ForegroundColor Yellow
                }
            } else {
                Write-Host "⚠️ Detection failed: $($jsonResult.message)" -ForegroundColor Yellow
            }
        } catch {
            Write-Host "❌ Failed to parse JSON result: $lastLine" -ForegroundColor Red
        }
        
    } catch {
        Write-Host "❌ Error running detection: $($_.Exception.Message)" -ForegroundColor Red
    }
} elseif ($ImagePath) {
    Write-Host "`n❌ Image file not found: $ImagePath" -ForegroundColor Red
} else {
    Write-Host "`nℹ️ No image provided for testing. Use -ImagePath <path> to test with an image." -ForegroundColor Yellow
}

Write-Host "`n" + ("=" * 50) -ForegroundColor Green
Write-Host "✅ Module test completed!" -ForegroundColor Green
Write-Host ""
Write-Host "Module features:" -ForegroundColor Cyan
Write-Host "- YOLOv5 detection with LP_detector_nano_61.pt" -ForegroundColor White
Write-Host "- PaddleOCR recognition with Vietnamese language" -ForegroundColor White
Write-Host "- Multiple plate detection support" -ForegroundColor White
Write-Host "- Fallback to full image OCR" -ForegroundColor White
Write-Host "- Confidence scoring" -ForegroundColor White
Write-Host "- Detailed detection information" -ForegroundColor White
Write-Host ""
Write-Host "To test with an image:" -ForegroundColor Yellow
Write-Host ".\test_plate_detection.ps1 -ImagePath `"path\to\your\image.jpg`"" -ForegroundColor White 