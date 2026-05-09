import sys
sys.path.insert(0, 'services/ml')
from api.database import SessionLocal
from api.models import User
import jwt
from datetime import datetime, timedelta

db = SessionLocal()
user = db.query(User).filter(User.email == 'police1@lexvision.gov').first()
# Actually, the secret key is probably in services/ml/api/citizen_auth.py or env.py
