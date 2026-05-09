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

        target_width = max(320, gray.shape[1] * 2)
        scale = target_width / max(gray.shape[1], 1)
        resized = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

        denoised = cv2.fastNlMeansDenoising(resized, None, 15, 7, 21)

        # 3. CLAHE contrast normalization
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        contrast = clahe.apply(denoised)

        # 4. Sharpening
        blur = cv2.GaussianBlur(contrast, (9, 9), 10.0)
        sharpened = cv2.addWeighted(contrast, 1.5, blur, -0.5, 0)

        return sharpened

    def preprocess_variants(self, image):
        """
        Build multiple OCR inputs from a cropped plate image.
        This method expects a plate crop, not a full evidence frame.
        """
        if isinstance(image, str):
            img = cv2.imread(image)
            if img is None:
                raise FileNotFoundError(f"Could not load image at {image}")
        else:
            img = image

        deskewed = self.correct_skew(img)
        gray = cv2.cvtColor(deskewed, cv2.COLOR_BGR2GRAY) if len(deskewed.shape) == 3 else deskewed
        scale = 3 if gray.shape[1] < 180 else 2
        resized = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        denoised = cv2.fastNlMeansDenoising(resized, None, 15, 7, 21)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        contrast = clahe.apply(denoised)
        blur = cv2.GaussianBlur(contrast, (9, 9), 10.0)
        sharpened = cv2.addWeighted(contrast, 1.5, blur, -0.5, 0)
        thresholded = cv2.threshold(contrast, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
        adaptive = cv2.adaptiveThreshold(
            contrast,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            31,
            9,
        )

        return [
            ("original_crop", img),
            ("grayscale_resized", contrast),
            ("thresholded", thresholded),
            ("sharpened", sharpened),
            ("adaptive_thresholded", adaptive),
        ]

    @staticmethod
    def _left_to_right_key(result):
        box = result[0] if result else []
        if not box:
            return 0.0
        try:
            return min(float(point[0]) for point in box)
        except (TypeError, ValueError, IndexError):
            return 0.0

    def extract_candidates(self, image, min_confidence: float = 0.2):
        """
        Run EasyOCR over crop variants and return combined fragments.
        Confidence values are EasyOCR confidences; selection scores are computed elsewhere.
        """
        candidates = []
        try:
            reader = _get_reader()
            for variant_name, variant in self.preprocess_variants(image):
                results = reader.readtext(variant, detail=1)
                filtered = []
                for result in sorted(results, key=self._left_to_right_key):
                    text = str(result[1]).strip().upper()
                    conf = float(result[2])
                    if conf < min_confidence:
                        continue
                    if len(text) < 2 or not any(ch.isalnum() for ch in text):
                        continue
                    filtered.append(
                        {
                            "text": text,
                            "confidence": conf,
                            "bbox": result[0],
                        }
                    )

                if not filtered:
                    continue

                combined_text = "".join(fragment["text"] for fragment in filtered)
                avg_confidence = sum(fragment["confidence"] for fragment in filtered) / len(filtered)
                candidates.append(
                    {
                        "text": combined_text,
                        "confidence": avg_confidence,
                        "variant": variant_name,
                        "fragments": filtered,
                    }
                )

                if len(filtered) > 1:
                    spaced_text = " ".join(fragment["text"] for fragment in filtered)
                    candidates.append(
                        {
                            "text": spaced_text,
                            "confidence": avg_confidence,
                            "variant": f"{variant_name}_spaced",
                            "fragments": filtered,
                        }
                    )
            return candidates
        except Exception as e:
            logger.error(f"OCR candidate extraction failed: {e}")
            return []

    def extract_text(self, image):
        """
        Runs the full OCR pipeline using EasyOCR.
        Accepts a file path (str) or a numpy array (BGR image).
        """
        try:
            candidates = self.extract_candidates(image)
            if not candidates:
                return {"text": None, "confidence": 0.0, "status": "no_valid_text_detected"}

            best_result = max(candidates, key=lambda candidate: candidate["confidence"])
            all_text = " ".join(candidate["text"] for candidate in candidates)

            return {
                "text": best_result["text"],
                "confidence": best_result["confidence"],
                "all_text": all_text,
                "status": "success",
                "candidates": candidates,
            }
        except Exception as e:
            logger.error(f"OCR extraction failed: {e}")
            return {"text": None, "confidence": 0.0, "status": f"error: {str(e)}"}
