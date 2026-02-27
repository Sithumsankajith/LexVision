import os
import shutil
import uuid
import torch
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta
from ultralytics import YOLO

# Fix for torch 2.6+ security restriction on loading custom classes
# We monkeypatch torch.load to default weights_only=False because YOLOv8 models
# contain various custom architecture classes that are blocked by default.
original_load = torch.load
def patched_load(*args, **kwargs):
    if 'weights_only' not in kwargs:
        kwargs['weights_only'] = False
    return original_load(*args, **kwargs)
torch.load = patched_load

import sqlite3
import json

app = FastAPI(title="LexVision ML Inference API")

# Allow CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# === SQLITE DATABASE FOR DEMO ===
DB_FILE = os.path.join(base_dir, "db.sqlite3")

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS reports (
            id TEXT PRIMARY KEY,
            trackingId TEXT,
            status TEXT,
            createdAt TEXT,
            updatedAt TEXT,
            data TEXT
        )
    ''')
    conn.commit()

    # Check if empty to seed
    c.execute("SELECT count(*) FROM reports")
    if c.fetchone()[0] == 0:
        for i in range(5):
            now = datetime.utcnow()
            rid = str(uuid.uuid4())
            tracking_id = f"LEX-2026-{1000 + i}"
            status = 'submitted' if i < 2 else ('under-review' if i < 4 else 'verified')
            created_at = (now - timedelta(days=i)).isoformat() + "Z"
            updated_at = (now - timedelta(hours=i)).isoformat() + "Z"
            
            report_data = {
                "id": rid,
                "trackingId": tracking_id,
                "citizen": {"email": f"citizen{i}@example.com"},
                "violationType": 'red-light' if i % 3 == 0 else ('helmet' if i % 3 == 1 else 'white-line'),
                "datetime": now.isoformat() + "Z",
                "location": {
                    "lat": 6.9271, "lng": 79.8612,
                    "address": 'Galle Rd, Col 03' if i % 2 == 0 else 'Union Place, Col 02',
                    "city": 'Colombo'
                },
                "evidence": [{
                    "id": f"ev-{i}", "type": 'image', "url": 'https://via.placeholder.com/600x400', "name": f"capture_{i}.jpg", "size": 102400
                }],
                "vehicle": {},
                "status": status,
                "createdAt": created_at,
                "updatedAt": updated_at
            }
            c.execute("INSERT INTO reports VALUES (?, ?, ?, ?, ?, ?)", 
                      (rid, tracking_id, status, created_at, updated_at, json.dumps(report_data)))
        conn.commit()
    conn.close()

init_db()

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

class ReportUpdate(BaseModel):
    status: str
    notes: Optional[str] = None

@app.get("/api/reports")
def get_reports():
    conn = get_db_connection()
    reports = conn.execute("SELECT data FROM reports").fetchall()
    conn.close()
    return [json.loads(r['data']) for r in reports]

@app.get("/api/reports/{identifier}")
def get_report(identifier: str):
    conn = get_db_connection()
    row = conn.execute("SELECT data FROM reports WHERE id = ? OR trackingId = ?", (identifier, identifier)).fetchone()
    conn.close()
    if row is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return json.loads(row['data'])

@app.post("/api/reports")
def create_report(report: dict):
    report["id"] = str(uuid.uuid4())
    report["trackingId"] = f"LEX-{datetime.now().year}-{str(uuid.uuid4())[:4].upper()}"
    report["status"] = "submitted"
    report["createdAt"] = datetime.utcnow().isoformat() + "Z"
    report["updatedAt"] = report["createdAt"]
    
    conn = get_db_connection()
    conn.execute("INSERT INTO reports VALUES (?, ?, ?, ?, ?, ?)", 
                 (report["id"], report["trackingId"], report["status"], report["createdAt"], report["updatedAt"], json.dumps(report)))
    conn.commit()
    conn.close()
    return report

@app.put("/api/reports/{report_id}/status")
def update_report_status(report_id: str, update: ReportUpdate):
    conn = get_db_connection()
    row = conn.execute("SELECT data FROM reports WHERE id = ?", (report_id,)).fetchone()
    if row is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Report not found")
        
    report = json.loads(row['data'])
    report["status"] = update.status
    report["updatedAt"] = datetime.utcnow().isoformat() + "Z"
    if update.notes:
        report["notes"] = f"{report.get('notes', '')}\n{update.notes}".strip()
        
    conn.execute("UPDATE reports SET status = ?, updatedAt = ?, data = ? WHERE id = ?",
                 (report["status"], report["updatedAt"], json.dumps(report), report_id))
    conn.commit()
    conn.close()
    return report

# === ML MODELS ===

models_dir = os.path.join(base_dir, "models")
temp_dir = os.path.join(base_dir, "temp")
os.makedirs(temp_dir, exist_ok=True)

helmet_model_path = os.path.join(models_dir, "helmet_v1", "weights", "best.pt")
anpr_model_path = os.path.join(models_dir, "anpr_v1", "weights", "best.pt")

try:
    helmet_model = YOLO(helmet_model_path) if os.path.exists(helmet_model_path) else YOLO('yolov8n.pt')
    anpr_model = YOLO(anpr_model_path) if os.path.exists(anpr_model_path) else YOLO('yolov8n.pt')
    print("Models loaded successfully.")
    if not os.path.exists(helmet_model_path) or not os.path.exists(anpr_model_path):
        print("WARNING: Custom trained weights not found. Using default YOLOv8 nano model for predictions.")
except Exception as e:
    print(f"Error loading models: {e}")
    helmet_model = None
    anpr_model = None

@app.get("/health")
def health_check():
    return {"status": "ok", "models_loaded": helmet_model is not None and anpr_model is not None}

@app.post("/predict")
async def predict_evidence(file: UploadFile = File(...)):
    if helmet_model is None or anpr_model is None:
        raise HTTPException(status_code=500, detail="Models not loaded")

    # Save uploaded file temporarily
    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1]
    temp_path = os.path.join(temp_dir, f"{file_id}{ext}")
    
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        # 1. Run Helmet Detection
        helmet_results = helmet_model.predict(source=temp_path, save=False, conf=0.25)
        
        detected_violation = None
        helmet_boxes = helmet_results[0].boxes
        if helmet_boxes is not None and len(helmet_boxes) > 0:
            for i, c in enumerate(helmet_boxes.cls):
                class_name = helmet_model.names[int(c)]
                if class_name.lower() in ['not wearing helmet', 'no-helmet', 'without helmet']:
                    detected_violation = "helmet"
                    break
        
        # Determine violation - simplified logic
        # If no helmet bounding box found matching "no helmet", default to unknown or let frontend decide
        if not detected_violation and len(helmet_boxes) > 0:
             detected_violation = "potential_helmet_violation" # Placeholder based on just finding *something*
             
        # 2. Run ANPR
        anpr_results = anpr_model.predict(source=temp_path, save=False, conf=0.25)
        detected_plate = None
        anpr_boxes = anpr_results[0].boxes
        
        # Note: Actual OCR is complex. We simulate reading the plate here if a box is found
        if anpr_boxes is not None and len(anpr_boxes) > 0:
            detected_plate = "WP CAA-1234" # Mock read from bounding box

        return {
            "success": True,
            "filename": file.filename,
            "detectedViolationType": "helmet" if detected_violation else None,
            "detectedPlate": detected_plate
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Cleanup
        if os.path.exists(temp_path):
            os.remove(temp_path)

if __name__ == "__main__":
    import uvicorn
    # Make sure to run from the ml/ directory or specify python path
    uvicorn.run("services.ml.api.server:app", host="0.0.0.0", port=8000, reload=True)
