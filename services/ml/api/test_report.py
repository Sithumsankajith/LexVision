import sys
import json
from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session, joinedload
sys.path.insert(0, '.')
from api.database import SessionLocal
from api.models import Report
from api.schemas import ReportResponse
from api.presenters import present_report

app = FastAPI()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/test_report/{report_id}", response_model=ReportResponse)
def get_report(report_id: str, db: Session = Depends(get_db)):
    report = db.query(Report).options(
        joinedload(Report.evidence),
        joinedload(Report.inference_log)
    ).filter(Report.id == report_id).first()
    return present_report(report)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
