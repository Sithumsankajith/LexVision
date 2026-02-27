import os
import shutil
import uuid
from typing import Dict, Any

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO

app = FastAPI(title="LexVision ML Inference API")

# Allow CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load Models
base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
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
