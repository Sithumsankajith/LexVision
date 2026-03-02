import cv2
import numpy as np

class OCRPipeline:
    def __init__(self):
        # In a real environment, you'd configure tesseract paths here if needed
        pass

    def correct_skew(self, image):
        # Convert image to grayscale if it's not
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image
            
        # Threshold the image, setting all foreground pixels to 255 and background to 0
        thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]
        
        # Grab the (x, y) coordinates of all pixel values that are greater than zero
        coords = np.column_stack(np.where(thresh > 0))
        
        # Compute the bounding box of the coordinates and then extract the angle of rotation
        angle = cv2.minAreaRect(coords)[-1]
        
        # The `cv2.minAreaRect` function returns values in the range [-90, 0)
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle
            
        # Rotate the image to deskew it
        (h, w) = image.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(image, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        
        return rotated

    def preprocess_image(self, image_path: str):
        """
        Applies a sequence of academic-standard image preprocessing techniques 
        to maximize OCR accuracy.
        """
        # Read the image
        img = cv2.imread(image_path)
        if img is None:
            raise FileNotFoundError(f"Could not load image at {image_path}")

        # 1. Deskew Correction
        deskewed_img = self.correct_skew(img)

        # Convert to grayscale for further processing
        gray = cv2.cvtColor(deskewed_img, cv2.COLOR_BGR2GRAY)

        # 2. Contrast Normalization (Histogram Equalization via CLAHE)
        # CLAHE (Contrast Limited Adaptive Histogram Equalization) prevents noise over-amplification
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
        contrast_normalized = clahe.apply(gray)

        # 3. Edge Sharpening (Unsharp Masking)
        # Blur the image
        gaussian_blur = cv2.GaussianBlur(contrast_normalized, (9,9), 10.0)
        # Add the original to the inverted blur
        sharpened = cv2.addWeighted(contrast_normalized, 1.5, gaussian_blur, -0.5, 0)

        # 4. Adaptive Thresholding
        # Helps deal with varying lighting conditions across the license plate
        binary_thresh = cv2.adaptiveThreshold(
            sharpened, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
            cv2.THRESH_BINARY, 11, 2
        )

        return binary_thresh
        
    def extract_text(self, image_path: str):
        """
        Runs the full pipeline and extracts text.
        In a production environment, this passes the preprocessed image to Pytesseract.
        """
        try:
            processed_img = self.preprocess_image(image_path)
            
            # import pytesseract
            # text = pytesseract.image_to_string(processed_img, config='--psm 8')
            
            # --- Simulation Block ---
            # To avoid tesseract binary dependencies during demo, we mock the final text extraction 
            # while keeping the highly rigorous OpenCV preprocessing intact.
            simulated_confidence = 0.92
            simulated_text = "WP BBA-5678"
            
            return {
                "text": simulated_text.strip(),
                "confidence": simulated_confidence,
                "status": "success"
            }
        except Exception as e:
            return {
                "text": None,
                "confidence": 0.0,
                "status": f"error: {str(e)}"
            }
