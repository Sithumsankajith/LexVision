import os
import time
import json
import base64
import logging
import tempfile
from datetime import datetime
from uuid import uuid4

import numpy as np
from sqlalchemy.orm import Session
from .database import SessionLocal
from .models import Report, Evidence, StatusEnum, InferenceLog, AuditLog

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Lazy-loaded ML models ---
_yolo_model = None
_ocr_pipeline = None

def _get_yolo_model():
    """Lazy-load YOLOv8n pretrained model (downloads ~6MB on first use)."""
    global _yolo_model
    if _yolo_model is None:
        from ultralytics import YOLO
        logger.info("Loading YOLOv8n pretrained model...")

        # Check for custom helmet model first
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        custom_model = os.path.join(base_dir, "models", "helmet_v1.0.0", "weights", "best.pt")

        if os.path.exists(custom_model):
            logger.info(f"Using custom model: {custom_model}")
            _yolo_model = YOLO(custom_model)
        else:
            logger.info("Custom model not found, using pretrained YOLOv8n (COCO)")
            _yolo_model = YOLO("yolov8n.pt")

        logger.info("YOLO model loaded.")
    return _yolo_model


def _get_ocr_pipeline():
    """Lazy-load OCR pipeline."""
    global _ocr_pipeline
    if _ocr_pipeline is None:
        import sys
        sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
        from inference.ocr_pipeline import OCRPipeline
        _ocr_pipeline = OCRPipeline()
        logger.info("OCR pipeline initialized.")
    return _ocr_pipeline


def _decode_evidence_image(evidence: Evidence) -> str | None:
    """Decode base64 evidence URL to a temporary image file. Returns file path."""
    if not evidence or not evidence.url:
        return None

    try:
        url = evidence.url
        if url.startswith("data:image"):
            # Strip the data URI prefix: "data:image/png;base64,..."
            header, b64data = url.split(",", 1)
            img_bytes = base64.b64decode(b64data)

            # Determine extension
            ext = ".jpg"
            if "png" in header:
                ext = ".png"

            tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
            tmp.write(img_bytes)
            tmp.close()
            return tmp.name
        elif os.path.exists(url):
            return url
        else:
            logger.warning(f"Evidence URL is not a base64 data URI or file path: {url[:50]}...")
            return None
    except Exception as e:
        logger.error(f"Failed to decode evidence image: {e}")
        return None


# COCO class names relevant to traffic violations
VEHICLE_CLASSES = {"car", "motorcycle", "bus", "truck", "bicycle"}
PERSON_CLASS = "person"

# Violation type mapping based on detected objects
VIOLATION_MAP = {
    "helmet": "no-helmet",
    "red-light": "red-light-violation",
    "white-line": "white-line-crossing",
}


def _run_yolo_detection(image_path: str) -> dict:
    """
    Run YOLOv8 detection on an image.
    Returns detection results with bboxes, classes, and confidences.
    """
    import cv2

    model = _get_yolo_model()
    results = model.predict(source=image_path, verbose=False, device="cpu")

    detections = []
    max_confidence = 0.0
    detected_classes = set()
    has_person = False
    has_vehicle = False

    for result in results:
        boxes = result.boxes
        for box in boxes:
            cls_id = int(box.cls[0])
            cls_name = result.names[cls_id]
            conf = float(box.conf[0])
            xyxy = box.xyxy[0].tolist()

            detections.append({
                "class": cls_name,
                "confidence": round(conf, 4),
                "bbox": {
                    "x1": round(xyxy[0], 1),
                    "y1": round(xyxy[1], 1),
                    "x2": round(xyxy[2], 1),
                    "y2": round(xyxy[3], 1)
                }
            })

            detected_classes.add(cls_name)
            if conf > max_confidence:
                max_confidence = conf

            if cls_name == PERSON_CLASS:
                has_person = True
            if cls_name in VEHICLE_CLASSES:
                has_vehicle = True

    return {
        "detections": detections,
        "max_confidence": max_confidence,
        "detected_classes": list(detected_classes),
        "has_person": has_person,
        "has_vehicle": has_vehicle,
        "num_detections": len(detections)
    }


def _run_ocr(image_path: str) -> dict:
    """Run OCR pipeline on an image to extract license plate text."""
    pipeline = _get_ocr_pipeline()
    return pipeline.extract_text(image_path)


def _determine_violation_type(report_violation: str, yolo_results: dict) -> str:
    """
    Determine the final violation type based on YOLO detections.
    Uses the citizen-reported type as base, enhanced by AI detection.
    """
    # If person + motorcycle detected, likely a helmet violation scenario
    if yolo_results["has_person"] and "motorcycle" in yolo_results["detected_classes"]:
        return "no-helmet"

    # If vehicle detected but different scenario
    if yolo_results["has_vehicle"]:
        mapped = VIOLATION_MAP.get(report_violation, report_violation)
        return mapped

    # Fall back to citizen-reported type
    return VIOLATION_MAP.get(report_violation, report_violation)


def attempt_inference(report: Report, db: Session, attempt: int = 1):
    """Run real ML inference on a report's evidence."""
    logger.info(f"Starting inference job for report {report.id} (Attempt {attempt})")
    start_time = time.time()

    # 1. Status Transition
    if report.status == StatusEnum.SUBMITTED:
        report.status = StatusEnum.AI_PROCESSING
        db.commit()

    # 2. Get evidence image
    evidence = db.query(Evidence).filter(Evidence.report_id == report.id).first()
    image_path = _decode_evidence_image(evidence) if evidence else None

    yolo_results = {"detections": [], "max_confidence": 0.0, "detected_classes": [],
                    "has_person": False, "has_vehicle": False, "num_detections": 0}
    ocr_result = {"text": None, "confidence": 0.0, "status": "no_image"}

    if image_path:
        try:
            # 3. Run YOLO Object Detection
            logger.info(f"Running YOLO detection on {image_path}")
            yolo_results = _run_yolo_detection(image_path)
            logger.info(f"YOLO detected {yolo_results['num_detections']} objects: {yolo_results['detected_classes']}")

            # 4. Run OCR for License Plate
            logger.info(f"Running OCR on {image_path}")
            ocr_result = _run_ocr(image_path)
            logger.info(f"OCR result: {ocr_result.get('text', 'N/A')} (conf: {ocr_result.get('confidence', 0):.2f})")
        except Exception as e:
            logger.error(f"ML inference error: {e}")
        finally:
            # Clean up temp file
            if image_path and image_path.startswith(tempfile.gettempdir()):
                try:
                    os.unlink(image_path)
                except:
                    pass

    # 5. Calculate quality score
    yolo_conf = yolo_results["max_confidence"]
    ocr_conf = ocr_result.get("confidence", 0.0)
    bbox_clarity = min(1.0, yolo_results["num_detections"] / 3) if yolo_results["num_detections"] > 0 else 0.0
    quality_score = (yolo_conf * 0.4) + (ocr_conf * 0.4) + (bbox_clarity * 0.2)

    latency = time.time() - start_time

    # 6. Determine violation type from AI
    detected_violation = _determine_violation_type(report.violation_type, yolo_results)

    # 7. Create inference log
    ocr_text = ocr_result.get("text")
    inference_log = InferenceLog(
        report_id=report.id,
        model_version="yolov8n|easyocr",
        bbox_coordinates={
            "detections": yolo_results["detections"],
            "quality_score": round(quality_score, 4),
            "detected_classes": yolo_results["detected_classes"]
        },
        confidence=round(yolo_conf, 4) if yolo_conf > 0 else round(quality_score, 4),
        ocr_text=ocr_text,
        ocr_confidence=round(ocr_conf, 4),
        inference_latency=round(latency, 4)
    )
    db.add(inference_log)

    # 8. Set status based on quality
    QUALITY_THRESHOLD = 0.15  # Lower threshold since pretrained model may have lower confidence on traffic images
    if quality_score < QUALITY_THRESHOLD and yolo_results["num_detections"] == 0:
        report.status = StatusEnum.REJECTED
        inference_log.bbox_coordinates["filtering"] = "Rejected: no relevant objects detected."
    else:
        report.status = StatusEnum.UNDER_REVIEW
        report.violation_type = detected_violation

    # 9. Audit log
    audit = AuditLog(
        user_id=report.user_id,
        action="INFERENCE_COMPLETION",
        target_type="InferenceLog",
        details={
            "latency_seconds": round(latency, 4),
            "quality_score": round(quality_score, 4),
            "yolo_detections": yolo_results["num_detections"],
            "ocr_text": ocr_text,
            "detected_violation": detected_violation,
            "threshold_met": quality_score >= QUALITY_THRESHOLD,
            "attempt": attempt
        }
    )
    db.add(audit)
    db.commit()
    logger.info(f"Inference complete for {report.id} - Latency: {latency:.2f}s | "
                f"YOLO: {yolo_results['num_detections']} objects | OCR: {ocr_text or 'N/A'} | "
                f"Quality: {quality_score:.4f} | Status: {report.status}")


def run_inference(report_id: str, max_retries: int = 2):
    """Entry point for background inference task."""
    db: Session = SessionLocal()
    try:
        report = db.query(Report).filter(Report.id == report_id).first()
        if not report:
            logger.error(f"Report {report_id} not found.")
            return

        for attempt in range(1, max_retries + 1):
            try:
                attempt_inference(report, db, attempt)
                break
            except Exception as e:
                logger.warning(f"Inference Attempt {attempt} failed for {report_id}: {str(e)}")
                db.rollback()
                if attempt == max_retries:
                    logger.error(f"Max retries reached for {report_id}. Marking as REJECTED.")
                    report.status = StatusEnum.REJECTED
                    db.commit()
                    raise e
                time.sleep(2)
    finally:
        db.close()
