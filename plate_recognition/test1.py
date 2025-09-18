from typing import get_args
import cv2
import numpy as np
from PIL import Image
from fast_alpr import ALPR
from fast_alpr.default_detector import PlateDetectorModel
from fast_alpr.default_ocr import OcrModel


# Load image from local path
image_path = "upload/135913.png"
img = Image.open(image_path)
img_array = np.array(img.convert("RGB"))

# Initialize ALPR with selected models
alpr = ALPR(detector_model="yolo-v9-t-640-license-plate-end2end", ocr_model="cct-s-v1-global-model")

# Run ALPR on the image
print("Processing...")
results = alpr.predict(img_array)

# Draw predictions on the image
annotated_img_array = alpr.draw_predictions(img_array)

# Convert annotated image to BGR for OpenCV display
annotated_img_bgr = cv2.cvtColor(annotated_img_array, cv2.COLOR_RGB2BGR)

# Display the annotated image using OpenCV
cv2.imshow("Annotated Image with OCR Results", annotated_img_bgr)
cv2.waitKey(0)  # Wait for any key press
cv2.destroyAllWindows()  # Close the window

# Print OCR results to console
if results:
    print("OCR Results:")
    for result in results:
        plate_text = result.ocr.text if result.ocr else "N/A"
        plate_confidence = result.ocr.confidence if result.ocr else 0.0
        print(f"- Detected Plate: {plate_text} with confidence {plate_confidence:.2f}")
else:
    print("No license plate detected.")