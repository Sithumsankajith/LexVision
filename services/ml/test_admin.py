from fastapi.testclient import TestClient
from api.server import app
from api.database import SessionLocal
from api.models import User, RoleEnum
import uuid

db = SessionLocal()
user = db.query(User).filter(User.role == RoleEnum.ADMIN).first()

from api.dependencies import create_access_token
token = create_access_token(data={"sub": user.email, "role": "admin"})

client = TestClient(app)
response = client.get("/api/admin/analytics/status-ratio", headers={"Authorization": f"Bearer {token}"})
print(f"Status Ratio: {response.status_code}")
print(response.json())

response = client.get("/api/admin/analytics/reports-trend", headers={"Authorization": f"Bearer {token}"})
print(f"Reports Trend: {response.status_code}")
print(response.json())
