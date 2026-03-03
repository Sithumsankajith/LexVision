import cv2
import numpy as np
import logging

logger = logging.getLogger(__name__)

# Lazy-load EasyOCR reader to avoid import overhead on every request
_reader = None

def _get_reader():
    global _reader
    if _reader is None:
        import easyocr
        logger.info("Initializing EasyOCR reader (first load)...")
        _reader = easyocr.Reader(['en'], gpu=False, verbose=False)
        logger.info("EasyOCR reader ready.")
    return _reader


class OCRPipeline:
    def __init__(self):
        pass

    def correct_skew(self, image):
        """Deskew the image using minimum area rectangle."""
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image

        thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]
        coords = np.column_stack(np.where(thresh > 0))

        if len(coords) < 5:
            return image

        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle

        (h, w) = image.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(image, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        return rotated

    def preprocess_image(self, image):
        """
        Applies preprocessing techniques to maximize OCR accuracy.
        Accepts either a file path (str) or a numpy array.
        """
        if isinstance(image, str):
            img = cv2.imread(image)
            if img is None:
                raise FileNotFoundError(f"Could not load image at {image}")
        else:
            img = image

        # 1. Deskew
        deskewed = self.correct_skew(img)

        # 2. Grayscale
        gray = cv2.cvtColor(deskewed, cv2.COLOR_BGR2GRAY) if len(deskewed.shape) == 3 else deskewed

        # 3. CLAHE contrast normalization
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        contrast = clahe.apply(gray)

        # 4. Sharpening
        blur = cv2.GaussianBlur(contrast, (9, 9), 10.0)
        sharpened = cv2.addWeighted(contrast, 1.5, blur, -0.5, 0)

        return sharpened

    def extract_text(self, image):
        """
        Runs the full OCR pipeline using EasyOCR.
        Accepts a file path (str) or a numpy array (BGR image).
        """
        try:
            processed = self.preprocess_image(image)
            reader = _get_reader()
            results = reader.readtext(processed, detail=1)

            if not results:
                return {"text": None, "confidence": 0.0, "status": "no_text_detected"}

            # Combine all detected text, pick the one with highest confidence
            best_result = max(results, key=lambda r: r[2])
            all_text = " ".join([r[1] for r in results])

            return {
                "text": best_result[1].strip().upper(),
                "confidence": float(best_result[2]),
                "all_text": all_text.strip().upper(),
                "status": "success"
            }
        except Exception as e:
            logger.error(f"OCR extraction failed: {e}")
            return {"text": None, "confidence": 0.0, "status": f"error: {str(e)}"}
