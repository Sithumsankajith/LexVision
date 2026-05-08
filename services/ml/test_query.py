from api.database import SessionLocal, engine
from api.models import EvidenceReport
from sqlalchemy.orm import joinedload
import json

session = SessionLocal()
query = session.query(EvidenceReport).order_by(EvidenceReport.created_at.desc())
total = query.count()
print(f"Total in DB (EvidenceReport): {total}")

# Let's see what they look like
reports = query.limit(5).all()
for r in reports:
    print(f"ID: {r.id}, Status: {r.status}, Tracking ID: {r.tracking_id}, Citizen ID: {r.citizen_id}")

from api.models import Report
legacy_query = session.query(Report).order_by(Report.created_at.desc())
legacy_total = legacy_query.count()
print(f"Total in DB (Legacy Report): {legacy_total}")

for r in legacy_query.limit(5).all():
    print(f"Legacy ID: {r.id}, Status: {r.status}, Tracking ID: {r.tracking_id}")
