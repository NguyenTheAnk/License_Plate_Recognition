# Testing License Plate Detection Pipeline

param(
    [Parameter(Mandatory=$true)]
    [string]$ImagePath
)

Write-Host "=== Testing License Plate Detection Pipeline ===" -ForegroundColor Green
Write-Host ""

Write-Host "Testing with image: $ImagePath" -ForegroundColor Yellow
Write-Host ""

# Check if image exists
if (-not (Test-Path $ImagePath)) {
    Write-Host "❌ ERROR: Image file not found: $ImagePath" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Image file found" -ForegroundColor Green
Write-Host ""

# Test Python script directly
Write-Host "=== Testing Python Detection Script ===" -ForegroundColor Cyan
Set-Location models
python detect_plate.py $ImagePath
Write-Host ""

# Test debug script
Write-Host "=== Testing Debug Script ===" -ForegroundColor Cyan
python debug_detection.py $ImagePath
Write-Host ""

# Test full pipeline
Write-Host "=== Testing Full Pipeline ===" -ForegroundColor Cyan
python test_pipeline.py $ImagePath
Write-Host ""

Write-Host "=== Test Complete ===" -ForegroundColor Green 