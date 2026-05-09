import easyocr
import sys
import os

reader = easyocr.Reader(['en'])
for img_path in sys.argv[1:]:
    if os.path.exists(img_path):
        results = reader.readtext(img_path)
        print(f"--- {img_path} ---")
        for bbox, text, prob in results:
            print(f"{text} (prob: {prob:.2f})")
