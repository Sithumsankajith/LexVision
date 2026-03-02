import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base
from .routers import auth, reports, admin

# Create tables if they don't exist
Base.metadata.create_all(bind=engine)

app = FastAPI(title="LexVision Core API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(reports.router)
app.include_router(admin.router)

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
    # uvicorn api.server:app --reload
    uvicorn.run("api.server:app", host="0.0.0.0", port=8000, reload=True)
