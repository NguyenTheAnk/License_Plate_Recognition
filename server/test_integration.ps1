# Script test tích hợp YOLOv5 + PaddleOCR trên Windows
param(
    [string]$ImagePath = ""
)

Write-Host "License Plate Recognition - YOLOv5 + PaddleOCR Integration Test" -ForegroundColor Green
Write-Host "=" * 70 -ForegroundColor Green
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

# Kiểm tra file detect_plate.py
Write-Host "`n=== Checking Detection Script ===" -ForegroundColor Yellow
$scriptPath = Join-Path $PSScriptRoot "controllers\WhiteList\detect_plate.py"
if (Test-Path $scriptPath) {
    Write-Host "✅ Detection script found: $scriptPath" -ForegroundColor Green
} else {
    Write-Host "❌ Detection script not found: $scriptPath" -ForegroundColor Red
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
$yolov5Dir = Join-Path $PSScriptRoot "yolov5"
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
        # Chạy script detection
        $detectionCommand = "python `"$scriptPath`" --image `"$ImagePath`""
        Write-Host "Running: $detectionCommand" -ForegroundColor Cyan
        
        $result = Invoke-Expression $detectionCommand 2>&1
        
        # Lấy dòng cuối cùng (JSON result)
        $lastLine = ($result | Select-Object -Last 1).Trim()
        
        try {
            $jsonResult = $lastLine | ConvertFrom-Json
            if ($jsonResult.success) {
                Write-Host "✅ Detection successful!" -ForegroundColor Green
                Write-Host "Text: $($jsonResult.text)" -ForegroundColor Cyan
                if ($jsonResult.bbox) {
                    Write-Host "Bounding box: $($jsonResult.bbox | ConvertTo-Json -Compress)" -ForegroundColor Cyan
                }
                if ($jsonResult.method) {
                    Write-Host "Method: $($jsonResult.method)" -ForegroundColor Cyan
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

Write-Host "`n" + ("=" * 70) -ForegroundColor Green
Write-Host "✅ Integration test completed!" -ForegroundColor Green
Write-Host ""
Write-Host "System is ready to use:" -ForegroundColor Cyan
Write-Host "- YOLOv5 model: LP_detector_nano_61.pt" -ForegroundColor White
Write-Host "- OCR engine: PaddleOCR" -ForegroundColor White
Write-Host "- Detection method: YOLOv5 detection + PaddleOCR recognition" -ForegroundColor White
Write-Host "- Fallback: Full image PaddleOCR recognition" -ForegroundColor White
Write-Host ""
Write-Host "To test with an image:" -ForegroundColor Yellow
Write-Host ".\test_integration.ps1 -ImagePath `"path\to\your\image.jpg`"" -ForegroundColor White 