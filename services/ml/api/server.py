from contextlib import asynccontextmanager
import logging

import time
from collections import defaultdict, deque

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from sqlalchemy import inspect, text

from .env import get_env_value, load_service_env, log_roboflow_config
from .production_config import get_cors_origins, validate_production_environment


load_service_env()

from .database import engine, Base, SessionLocal
from .routers import admin, auth, citizen_reports, evidence_reports, notifications, reports, tickets, users, fine_rules, media
from . import models
from .tasks import get_queue_health


logger = logging.getLogger(__name__)
_request_buckets: dict[str, deque[float]] = defaultdict(deque)

# Keep SQLite zero-config for local demos; PostgreSQL should be migrated explicitly.
if engine.dialect.name == "sqlite":
    Base.metadata.create_all(bind=engine)


def ensure_sqlite_schema_compatibility():
    if engine.dialect.name != "sqlite":
        return

    with engine.begin() as connection:
        inspector = inspect(connection)
        table_names = set(inspector.get_table_names())

        def add_report_location_columns(table_name: str) -> None:
            if table_name not in table_names:
                return
            columns = {column["name"] for column in inspector.get_columns(table_name)}
            if "location_district" not in columns:
                connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN location_district VARCHAR"))
            if "custom_violation_description" not in columns:
                connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN custom_violation_description TEXT"))
            if "manual_review_required" not in columns:
                connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN manual_review_required BOOLEAN DEFAULT 0 NOT NULL"))
            connection.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{table_name}_location_district ON {table_name} (location_district)"))

        inference_log_columns = {column["name"] for column in inspector.get_columns("inference_logs")} if "inference_logs" in table_names else set()
        if "inference_logs" in table_names and "evidence_report_id" not in inference_log_columns:
            connection.execute(text("ALTER TABLE inference_logs ADD COLUMN evidence_report_id VARCHAR"))
            connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_inference_logs_evidence_report_id ON inference_logs (evidence_report_id)"))
        if "inference_logs" in table_names:
            inference_log_columns = {column["name"] for column in inspector.get_columns("inference_logs")}
            anpr_columns = {
                "plate_text": "VARCHAR",
                "normalized_plate_text": "VARCHAR",
                "plate_confidence": "FLOAT",
                "plate_bbox": "JSON",
                "anpr_status": "VARCHAR",
                "anpr_error": "TEXT",
                "plate_crop_path": "TEXT",
                "officer_corrected_plate_text": "VARCHAR",
                "plate_corrected_by": "VARCHAR",
                "plate_corrected_at": "TIMESTAMP",
            }
            for column_name, column_type in anpr_columns.items():
                if column_name not in inference_log_columns:
                    connection.execute(text(f"ALTER TABLE inference_logs ADD COLUMN {column_name} {column_type}"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_inference_logs_normalized_plate_text ON inference_logs (normalized_plate_text)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_inference_logs_anpr_status ON inference_logs (anpr_status)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_inference_logs_officer_corrected_plate_text ON inference_logs (officer_corrected_plate_text)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_inference_logs_plate_corrected_by ON inference_logs (plate_corrected_by)"))

        if "evidence_files" in table_names:
            evidence_file_columns = {column["name"] for column in inspector.get_columns("evidence_files")}
            if "storage_backend" not in evidence_file_columns:
                connection.execute(text("ALTER TABLE evidence_files ADD COLUMN storage_backend VARCHAR DEFAULT 'legacy' NOT NULL"))
            if "storage_path" not in evidence_file_columns:
                connection.execute(text("ALTER TABLE evidence_files ADD COLUMN storage_path TEXT"))
            if "checksum_sha256" not in evidence_file_columns:
                connection.execute(text("ALTER TABLE evidence_files ADD COLUMN checksum_sha256 VARCHAR"))
            if "access_metadata" not in evidence_file_columns:
                connection.execute(text("ALTER TABLE evidence_files ADD COLUMN access_metadata JSON"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_evidence_files_checksum_sha256 ON evidence_files (checksum_sha256)"))

        add_report_location_columns("reports")
        add_report_location_columns("evidence_reports")

        if "evidence_reports" in table_names:
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_evidence_reports_violation_created_at ON evidence_reports (violation_type, created_at)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_evidence_reports_vehicle_plate ON evidence_reports (vehicle_plate)"))

        if "notifications" in table_names:
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_notifications_recipient_user_id ON notifications (recipient_user_id)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_notifications_recipient_citizen_id ON notifications (recipient_citizen_id)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_notifications_is_read_created_at ON notifications (is_read, created_at)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_notifications_related_entity_id ON notifications (related_entity_id)"))


ensure_sqlite_schema_compatibility()

# Seed initial rewards if they don't exist
def seed_rewards():
    db = SessionLocal()
    try:
        if "rewards" not in inspect(engine).get_table_names():
            return
        if db.query(models.Reward).count() == 0:
            rewards = [
                models.Reward(
                    title="Fuel Voucher (Rs. 1000)",
                    description="Redeemable at all major fuel stations.",
                    points_cost=500,
                    image_url="https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?auto=format&fit=crop&w=300"
                ),
                models.Reward(
                    title="Supermarket Discount Coupon",
                    description="10% off on your next purchase above Rs. 5000.",
                    points_cost=300,
                    image_url="https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=300"
                ),
                models.Reward(
                    title="LexVision Pro Badge",
                    description="Special digital badge on your profile.",
                    points_cost=100,
                    image_url="https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=300"
                )
            ]
            db.add_all(rewards)
            db.commit()
    finally:
        db.close()

seed_rewards()

# Seed default fine rules
def seed_fine_rules():
    db = SessionLocal()
    try:
        if "fine_rules" not in inspect(engine).get_table_names():
            return
        
        default_rules = [
            {
                "violation_type": "helmet",
                "penal_code": "MVA-123",
                "fine_amount": 2500,
                "description": "Riding a motorcycle without a protective helmet."
            },
            {
                "violation_type": "red_light",
                "penal_code": "MVA-456",
                "fine_amount": 5000,
                "description": "Failing to obey a red traffic light signal."
            },
            {
                "violation_type": "white_line",
                "penal_code": "MVA-789",
                "fine_amount": 3000,
                "description": "Crossing the continuous white line on the road."
            }
        ]

        for rule_data in default_rules:
            # Check if an active rule for this violation type already exists
            existing = db.query(models.FineRule).filter(
                models.FineRule.violation_type == rule_data["violation_type"],
                models.FineRule.active == True
            ).first()

            if not existing:
                new_rule = models.FineRule(
                    violation_type=rule_data["violation_type"],
                    penal_code=rule_data["penal_code"],
                    fine_amount=rule_data["fine_amount"],
                    currency="LKR",
                    description=rule_data["description"],
                    active=True,
                    version=1
                )
                db.add(new_rule)
        
        db.commit()
    finally:
        db.close()

seed_fine_rules()


@asynccontextmanager
async def lifespan(_: FastAPI):
    validate_production_environment()
    log_roboflow_config(context="backend startup", target_logger=logger)
    yield


app = FastAPI(title="LexVision Core API", version="1.0.0", lifespan=lifespan)


@app.middleware("http")
async def security_and_timing_middleware(request: Request, call_next):
    started_at = time.perf_counter()
    rate_limit = int(get_env_value("RATE_LIMIT_PER_MINUTE", "300") or "300")
    auth_rate_limit = int(get_env_value("AUTH_RATE_LIMIT_PER_MINUTE", "30") or "30")
    active_limit = auth_rate_limit if request.url.path.startswith("/api/auth") else rate_limit
    client_host = request.client.host if request.client else "unknown"
    bucket_key = f"{client_host}:{request.url.path.split('/')[1:3]}"
    now = time.time()
    bucket = _request_buckets[bucket_key]
    while bucket and bucket[0] <= now - 60:
        bucket.popleft()
    if len(bucket) >= active_limit:
        return Response(
            content='{"detail":"Too many requests. Please retry shortly."}',
            status_code=429,
            media_type="application/json",
            headers={"Retry-After": "60"},
        )
    bucket.append(now)

    response: Response = await call_next(request)
    duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
    response.headers["X-Process-Time-Ms"] = str(duration_ms)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; frame-ancestors 'none'"
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(citizen_reports.router)
app.include_router(evidence_reports.router)
app.include_router(reports.router)
app.include_router(tickets.router)
app.include_router(admin.router)
app.include_router(users.router)
app.include_router(fine_rules.router)
app.include_router(media.router)
app.include_router(notifications.router)
app.include_router(notifications.citizen_router)

@app.get("/")
def read_root():
    return {
        "service": "LexVision Core API",
        "status": "online",
        "version": "1.0.0"
    }

@app.get("/health")
def health_check():
    queue_health = get_queue_health()
    return {
        "status": "ok",
        "db": "connected",
        "queue_mode": queue_health["backend"],
        "redis_configured": bool(get_env_value("REDIS_URL")),
        "queue": queue_health,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.server:app", host="0.0.0.0", port=8000, reload=True)
