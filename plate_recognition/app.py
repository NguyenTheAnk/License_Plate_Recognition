# app.py
from flask import Flask, request, jsonify
import cv2
import numpy as np
from detector import detect_and_ocr

app = Flask(__name__)

@app.route('/recognize', methods=['POST'])
def recognize():
    if 'image' not in request.files:
        return jsonify({"error": "No image provided"}), 400
    file = request.files['image']
    bytes_data = file.read()
    np_img = np.frombuffer(bytes_data, np.uint8)
    img = cv2.imdecode(np_img, cv2.IMREAD_COLOR)

    result = detect_and_ocr(img)
    return jsonify({"plates": result})

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5001)