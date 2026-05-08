import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import sys
import os
from datetime import datetime, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from api.database import Base, get_db
from api.server import app
from api import models
from api.dependencies import create_access_token, create_citizen_access_token

# Test database setup (In-memory SQLite)
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="session")
def db_engine():
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def db_session(db_engine):
    connection = db_engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)
    
    yield session
    
    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

@pytest.fixture
def admin_user(db_session):
    user = models.User(email="admin_test@test.com", hashed_password="pw", role=models.RoleEnum.ADMIN)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

@pytest.fixture
def admin_token(admin_user):
    return create_access_token(data={"sub": admin_user.email, "role": "ADMIN", "id": admin_user.id})

@pytest.fixture
def police_user(db_session):
    user = models.User(email="police_test@test.com", hashed_password="pw", role=models.RoleEnum.POLICE)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

@pytest.fixture
def police_token(police_user):
    return create_access_token(data={"sub": police_user.email, "role": "POLICE", "id": police_user.id})

@pytest.fixture
def citizen_user(db_session):
    user = models.Citizen(firebase_uid="uid123", phone_number="+94771234567")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

@pytest.fixture
def citizen_token(citizen_user):
    return create_citizen_access_token(citizen_user)

@pytest.fixture
def fine_rule(db_session):
    rule = models.FineRule(
        violation_type="helmet",
        penal_code="MVA-TEST-123",
        fine_amount=2500.0,
        currency="LKR",
        description="Test helmet rule",
        active=True,
        version=1
    )
    db_session.add(rule)
    db_session.commit()
    db_session.refresh(rule)
    return rule

@pytest.fixture
def mock_evidence_report(db_session, citizen_user):
    report = models.EvidenceReport(
        citizen_id=citizen_user.id,
        tracking_id="TEST-1234",
        violation_type="helmet",
        incident_at=datetime(2026, 4, 30, 10, 0, 0, tzinfo=timezone.utc),
        location_lat=6.9271,
        location_lng=79.8612,
        location_address="Colombo, Sri Lanka",
        location_city="Colombo",
        location_district="Colombo",
        vehicle_plate="ABC-1234",
        status=models.ReportStatusEnum.SUBMITTED
    )
    db_session.add(report)
    db_session.commit()
    db_session.refresh(report)
    return report

@pytest.fixture
def mock_validated_report(db_session, mock_evidence_report):
    mock_evidence_report.status = models.ReportStatusEnum.VALIDATED
    db_session.commit()
    db_session.refresh(mock_evidence_report)
    return mock_evidence_report
