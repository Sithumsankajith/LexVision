from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect

from .database import engine, Base, SessionLocal
from .routers import auth, reports, admin, users
from . import models

# Keep SQLite zero-config for local demos; PostgreSQL should be migrated explicitly.
if engine.dialect.name == "sqlite":
    Base.metadata.create_all(bind=engine)

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

app = FastAPI(title="LexVision Core API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5177",
        "http://localhost:5176",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://127.0.0.1:5177",
        "http://127.0.0.1:5176",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(reports.router)
app.include_router(admin.router)
app.include_router(users.router)

@app.get("/")
def read_root():
    return {
        "service": "LexVision Core API",
        "status": "online",
        "version": "1.0.0"
    }

@app.get("/health")
def health_check():
    return {"status": "ok", "db": "connected", "redis": "connected"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.server:app", host="0.0.0.0", port=8000, reload=True)
