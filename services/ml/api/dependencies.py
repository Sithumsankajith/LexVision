import logging
import os
from pathlib import Path
import secrets
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from jose import JWTError, jwt
from typing import Optional
from dotenv import load_dotenv

from . import models, schemas
from .database import get_db
from .sms import SmsService, get_sms_service as build_sms_service

_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_env_path)

logger = logging.getLogger(__name__)

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    SECRET_KEY = secrets.token_urlsafe(32)
    logger.warning(
        "SECRET_KEY is not set; generated an ephemeral key for this process. "
        "Set SECRET_KEY in services/ml/.env for stable auth tokens."
    )
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24)))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
citizen_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = schemas.TokenData(email=email)
    except JWTError:
        raise credentials_exception
        
    user = db.query(models.User).filter(models.User.email == token_data.email).first()
    if user is None:
        raise credentials_exception
    return user

def get_current_active_user(current_user: models.User = Depends(get_current_user)):
    return current_user


def create_citizen_access_token(citizen: models.Citizen, expires_delta: Optional[timedelta] = None):
    return create_access_token(
        data={
            "sub": citizen.id,
            "role": models.RoleEnum.CITIZEN.value,
            "token_scope": "citizen",
        },
        expires_delta=expires_delta,
    )


def get_current_citizen_account(token: Optional[str] = Depends(citizen_oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"message": "Authentication required to submit reports."},
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        citizen_id: str = payload.get("sub")
        token_scope: str = payload.get("token_scope")
        if token_scope == "citizen":
            if citizen_id is None:
                raise credentials_exception
            token_data = schemas.CitizenTokenData(citizen_id=citizen_id, token_scope=token_scope)
            citizen = db.query(models.Citizen).filter(models.Citizen.id == token_data.citizen_id).first()
            if citizen is None:
                raise credentials_exception
            return citizen

        email: str = payload.get("sub")
        if not email:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None or user.role != models.RoleEnum.CITIZEN:
        raise credentials_exception

    firebase_uid = f"email:{user.id}"
    citizen = db.query(models.Citizen).filter(models.Citizen.firebase_uid == firebase_uid).first()
    if citizen is None:
        citizen = models.Citizen(
            firebase_uid=firebase_uid,
            phone_number=user.email,
        )
        db.add(citizen)
        db.commit()
        db.refresh(citizen)
    return citizen

# --- RBAC Role Dependency Factories ---
def role_required(allowed_roles: list[models.RoleEnum]):
    def role_checker(current_user: models.User = Depends(get_current_active_user)):
        if current_user.role not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user
    return role_checker

# Predefined dependencies
get_citizen = role_required([models.RoleEnum.CITIZEN, models.RoleEnum.POLICE, models.RoleEnum.ADMIN]) 
get_police = role_required([models.RoleEnum.POLICE, models.RoleEnum.ADMIN])
get_admin = role_required([models.RoleEnum.ADMIN])

def log_audit_action(db: Session, user_id: str, action: str, target_type: str = None, target_id: str = None, details: dict = None):
    audit_log = models.AuditLog(
        user_id=user_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        details=details or {}
    )
    db.add(audit_log)
    db.commit()


def get_sms_service(db: Session = Depends(get_db)) -> SmsService:
    return build_sms_service(db)
