import os
import time
import json
import logging
from datetime import datetime
from uuid import uuid4

from sqlalchemy.orm import Session
from .database import SessionLocal
from .models import Report, StatusEnum, InferenceLog, AuditLog

# Try importing YOLO and OCR Pipeline
try:
    from ultralytics import YOLO
    from ..inference.ocr_pipeline import OCRPipeline
    
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    models_dir = os.path.join(base_dir, "models")
    helmet_model_path = os.path.join(models_dir, "helmet_v1.0.0", "weights", "best.pt")
    anpr_model_path = os.path.join(models_dir, "anpr_v1.0.0", "weights", "best.pt")

    helmet_model = YOLO(helmet_model_path) if os.path.exists(helmet_model_path) else None
    anpr_model = YOLO(anpr_model_path) if os.path.exists(anpr_model_path) else None
    ocr_pipeline = OCRPipeline()
except ImportError:
    helmet_model = None
    anpr_model = None
    ocr_pipeline = None

# Configure basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def attempt_inference(report, db: Session, attempt: int = 1):
    logger.info(f"Starting inference job for report {report.id} (Attempt {attempt})")
    start_time = time.time()
    
    # 1. Status Transition
    if report.status == StatusEnum.SUBMITTED:
        report.status = StatusEnum.AI_PROCESSING
        db.commit()
    
    # Normally we load the image from report.evidence url here
    # For now, simulate the image matrix retrieval
    
    # SIMULATION Logic (To maintain requested API structure without real media dependency)
    simulated_bbox = [{"x": 100, "y": 150, "w": 50, "h": 50, "class": "no_helmet"}]
    simulated_conf = 0.89  # YOLO Confidence
    
    # OCR Enhancement Pipeline
    # mock_ocr_result = ocr_pipeline.extract_text(image_path)
    # Using the mock return structure directly to simulate:
    ocr_confidence = 0.95
    ocr_text = "WP BBA-5678"
    
    # 2. Quality Score Calculation
    # Formula: (Helmet Confidence * 0.4) + (OCR Conf * 0.4) + (Bbox Clarity * 0.2)
    bbox_clarity_weight = 0.85 # Simulated clarity weight
    quality_score = (simulated_conf * 0.4) + (ocr_confidence * 0.4) + (bbox_clarity_weight * 0.2)
    
    latency = time.time() - start_time
    
    # 3. False Positive Mitigation
    QUALITY_THRESHOLD = 0.60
    
    inference_log = InferenceLog(
        report_id=report.id,
        model_version="helmet_v1.0.0|anpr_v1.0.0", # Version tracking
        bbox_coordinates={"raw": simulated_bbox, "quality_score": quality_score},
        confidence=simulated_conf,
        ocr_text=ocr_text,
        ocr_confidence=ocr_confidence,
        inference_latency=latency
    )
    db.add(inference_log)
    
    if quality_score < QUALITY_THRESHOLD:
        report.status = StatusEnum.REJECTED  # Automatically reject low confidence
        inference_log.bbox_coordinates["filtering"] = "Rejected due to low quality score."
    else:
        report.status = StatusEnum.UNDER_REVIEW # Pass to Police for manual override
    
    # 4. Audit Logging (Inference Completion)
    audit = AuditLog(
        user_id=report.user_id,
        action="INFERENCE_COMPLETION",
        target_type="InferenceLog",
        details={
            "latency_seconds": latency, 
            "quality_score": quality_score, 
            "threshold_met": quality_score >= QUALITY_THRESHOLD,
            "attempt": attempt
        }
    )
    db.add(audit)
    db.commit()
    logger.info(f"Inference complete for {report.id} - Latency: {latency:.4f}s")


def run_inference(report_id: str, max_retries: int = 2):
    db: Session = SessionLocal()
    try:
        report = db.query(Report).filter(Report.id == report_id).first()
        if not report:
            logger.error(f"Report {report_id} not found.")
            return

        for attempt in range(1, max_retries + 1):
            try:
                attempt_inference(report, db, attempt)
                break # Success, exit retry loop
            except Exception as e:
                logger.warning(f"Inference Attempt {attempt} failed for {report_id}: {str(e)}")
                db.rollback()
                if attempt == max_retries:
                    logger.error(f"Max retries reached for {report_id}. Marking as REJECTED.")
                    report.status = StatusEnum.REJECTED
                    db.commit()
                    raise e
                time.sleep(2) # Backoff before retry
    finally:
        db.close()
