from api.database import SessionLocal, engine
from sqlalchemy import text

try:
    session = SessionLocal()
    legacy_count = session.execute(text('SELECT count(*) FROM reports')).scalar()
    print(f"Legacy Reports: {legacy_count}")
    try:
        evidence_count = session.execute(text('SELECT count(*) FROM evidence_reports')).scalar()
        print(f"Evidence Reports: {evidence_count}")
    except Exception as e:
        print(f"Evidence Reports: ERROR ({e})")
except Exception as e:
    print(f"DB Error: {e}")
