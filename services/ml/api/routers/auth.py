import os

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta

from .. import models, schemas
from ..citizen_auth import CitizenAccountConflictError, CitizenAuthError, get_or_create_citizen_account, verify_citizen_firebase_identity
from ..database import get_db
from ..dependencies import create_access_token, create_citizen_access_token, get_current_citizen_account, get_current_user, log_audit_action
from ..firebase_admin import FirebaseAdminConfigError, get_firebase_admin_status
import bcrypt

router = APIRouter(prefix="/api/auth", tags=["auth"])
DEMO_FIREBASE_UID_PREFIX = "demo-otp:"


def _is_demo_citizen_login_enabled() -> bool:
    """
    Temporary development/demo-only guard for simulated citizen OTP login.
    This must remain disabled for production deployments.
    """
    return os.getenv("DEMO_OTP_ENABLED", "false").lower() == "true"


def _normalize_demo_phone_number(phone_number: str) -> str:
    stripped = phone_number.strip()
    if not stripped.startswith("+") or not stripped[1:].isdigit():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enter a valid phone number in international format, for example +94771234567.",
        )
    return stripped

def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

@router.post("/register", response_model=schemas.UserResponse)
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = get_password_hash(user.password)
    db_user = models.User(email=user.email, hashed_password=hashed_password, role=user.role)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    # Audit log
    log_audit_action(db, db_user.id, "USER_REGISTRATION", "User", db_user.id)
    
    return db_user

@router.post("/login", response_model=schemas.Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        log_audit_action(db, user.id if user else None, "FAILED_LOGIN_ATTEMPT", "User", form_data.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    from ..dependencies import ACCESS_TOKEN_EXPIRE_MINUTES
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email, "role": getattr(user.role, 'name', user.role)},
        expires_delta=access_token_expires
    )
    # Audit log
    log_audit_action(db, user.id, "LOGIN_ATTEMPT_SUCCESS", "User", user.id)
    
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/citizen/firebase-login", response_model=schemas.CitizenAuthResponse)
def login_citizen_with_firebase(
    payload: schemas.FirebaseCitizenAuthRequest,
    db: Session = Depends(get_db),
):
    try:
        identity = verify_citizen_firebase_identity(payload.id_token)
    except FirebaseAdminConfigError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except CitizenAuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Firebase ID token.",
        ) from exc

    try:
        citizen = get_or_create_citizen_account(
            db,
            firebase_uid=identity["firebase_uid"],
            phone_number=identity["phone_number"],
        )
    except CitizenAccountConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    from ..dependencies import ACCESS_TOKEN_EXPIRE_MINUTES

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_citizen_access_token(citizen, expires_delta=access_token_expires)

    log_audit_action(
        db,
        None,
        "CITIZEN_FIREBASE_LOGIN_SUCCESS",
        "Citizen",
        citizen.id,
        details={
            "firebase_uid": citizen.firebase_uid,
            "phone_number": citizen.phone_number,
        },
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "citizen": citizen,
    }


@router.post("/citizen/demo-login", response_model=schemas.CitizenAuthResponse)
def login_citizen_with_demo_otp(
    payload: schemas.DemoCitizenAuthRequest,
    db: Session = Depends(get_db),
):
    if not _is_demo_citizen_login_enabled():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Demo citizen OTP login is disabled for this backend environment.",
        )

    normalized_phone_number = _normalize_demo_phone_number(payload.phone_number)
    citizen = get_or_create_citizen_account(
        db,
        firebase_uid=f"{DEMO_FIREBASE_UID_PREFIX}{normalized_phone_number}",
        phone_number=normalized_phone_number,
    )

    from ..dependencies import ACCESS_TOKEN_EXPIRE_MINUTES

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_citizen_access_token(citizen, expires_delta=access_token_expires)

    log_audit_action(
        db,
        None,
        "CITIZEN_DEMO_LOGIN_SUCCESS",
        "Citizen",
        citizen.id,
        details={
            "firebase_uid": citizen.firebase_uid,
            "phone_number": citizen.phone_number,
            "mode": "demo",
        },
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "citizen": citizen,
    }


@router.get("/citizen/me", response_model=schemas.CitizenResponse)
def get_current_citizen_profile(current_citizen: models.Citizen = Depends(get_current_citizen_account)):
    return current_citizen


@router.get("/citizen/otp-readiness", response_model=schemas.CitizenOtpReadinessResponse)
def get_citizen_otp_readiness():
    backend_status = get_firebase_admin_status()
    return {
        "backend_configured": backend_status["configured"],
        "firebase_project_id": backend_status["project_id"],
        "missing_backend_env": backend_status["missing_env"],
        "requirements": [
            "Citizen portal frontend must include all VITE_FIREBASE_* values in apps/citizen-portal/.env.local.",
            "Backend must include FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in services/ml/.env.",
            "Firebase Authentication Phone provider must be enabled for this project.",
            "The Firebase project must be on the Blaze plan because verification SMS is not available on Spark.",
            "Phone Number Verification / OAuth branding must be verified and published in Google Cloud.",
            "SMS region policy must allow Sri Lanka (LK) for OTP delivery.",
            "The testing domain such as localhost or your deployed domain must be listed in Firebase Authorized domains.",
        ],
    }
