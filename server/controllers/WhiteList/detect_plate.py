import argparse
import json
from paddleocr import PaddleOCR
import sys
import os
os.environ['FLAGS_log_level'] = '3'

def recognize_plate(image_path, ocr):
    result = ocr.ocr(image_path, cls=True)
    texts = []
    for line in result:
        for word in line:
            texts.append(word[1][0])
    joined = ' '.join(texts)
    return joined

def main():
    sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', required=True, help='Path to input image')
    args = parser.parse_args()
    try:
        ocr = PaddleOCR(use_angle_cls=True, lang='vi')
        ocr_text = recognize_plate(args.image, ocr)
        print(json.dumps({'success': True, 'text': ocr_text}))
    except Exception as e:
        print(json.dumps({'success': False, 'message': str(e)}))

if __name__ == '__main__':
    main() 