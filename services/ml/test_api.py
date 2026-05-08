from fastapi.testclient import TestClient
from api.server import app
from api.database import SessionLocal
from api.models import User, RoleEnum
import uuid

db = SessionLocal()
user = db.query(User).filter(User.role == RoleEnum.POLICE).first()

from api.dependencies import create_access_token
token = create_access_token(data={"sub": user.email, "role": "police"})

client = TestClient(app)
response = client.get("/api/evidence-reports/page", headers={"Authorization": f"Bearer {token}"})
print(f"Status Code: {response.status_code}")
if response.status_code != 200:
    print(response.json())
else:
    data = response.json()
    print(f"Items returned: {len(data['items'])}")
    print(f"Total: {data['total']}")
