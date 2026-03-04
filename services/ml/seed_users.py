#!/usr/bin/env python3
import os
import sys
from pathlib import Path

# Add the project root to sys.path to allow imports from services.ml
sys.path.append(str(Path(__file__).resolve().parent.parent))

import bcrypt
from sqlalchemy.orm import Session
from api.database import SessionLocal, engine
from api import models

def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def seed_users():
    db = SessionLocal()
    try:
        # Check if users already exist
        admin_email = "admin@lexvision.com"
        police_email = "police@lexvision.com"
        
        admin_user = db.query(models.User).filter(models.User.email == admin_email).first()
        if not admin_user:
            print(f"Creating Admin user: {admin_email}")
            admin_user = models.User(
                email=admin_email,
                hashed_password=get_password_hash("admin123"),
                role=models.RoleEnum.ADMIN
            )
            db.add(admin_user)
        else:
            print(f"Admin user {admin_email} already exists.")

        police_user = db.query(models.User).filter(models.User.email == police_email).first()
        if not police_user:
            print(f"Creating Police user: {police_email}")
            police_user = models.User(
                email=police_email,
                hashed_password=get_password_hash("police123"),
                role=models.RoleEnum.POLICE
            )
            db.add(police_user)
        else:
            print(f"Police user {police_email} already exists.")

        db.commit()
        print("Seeding completed successfully!")
    except Exception as e:
        print(f"Error seeding users: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_users()
