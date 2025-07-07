#!/bin/bash

echo "=== Testing License Plate Detection Pipeline ==="
echo ""

# Check if image path is provided
if [ $# -eq 0 ]; then
    echo "Usage: ./test_detection.sh <image_path>"
    echo "Example: ./test_detection.sh ../uploads/whitelist/images/test_plate.jpg"
    exit 1
fi

IMAGE_PATH=$1

echo "Testing with image: $IMAGE_PATH"
echo ""

# Check if image exists
if [ ! -f "$IMAGE_PATH" ]; then
    echo "❌ ERROR: Image file not found: $IMAGE_PATH"
    exit 1
fi

echo "✅ Image file found"
echo ""

# Test Python script directly
echo "=== Testing Python Detection Script ==="
cd models
python detect_plate.py "$IMAGE_PATH"
echo ""

# Test debug script
echo "=== Testing Debug Script ==="
python debug_detection.py "$IMAGE_PATH"
echo ""

# Test full pipeline
echo "=== Testing Full Pipeline ==="
python test_pipeline.py "$IMAGE_PATH"
echo ""

echo "=== Test Complete ===" 