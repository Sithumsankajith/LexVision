from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import uuid

from .. import models, schemas
from ..database import get_db
from ..dependencies import get_current_active_user, log_audit_action

router = APIRouter(prefix="/api/users", tags=["users"])

@router.get("/me", response_model=schemas.ProfileResponse)
def get_my_profile(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    reports_count = db.query(models.Report).filter(models.Report.user_id == current_user.id).count()
    validated_count = db.query(models.Report).filter(
        models.Report.user_id == current_user.id,
        models.Report.status == models.StatusEnum.VALIDATED
    ).count()
    
    return {
        "user": current_user,
        "reports_count": reports_count,
        "validated_reports_count": validated_count,
        "claimed_rewards": current_user.claimed_rewards
    }

@router.get("/me/reports", response_model=List[schemas.ReportResponse])
def get_my_reports(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    reports = db.query(models.Report).filter(models.Report.user_id == current_user.id).all()
    return reports

@router.get("/rewards", response_model=List[schemas.RewardResponse])
def list_rewards(db: Session = Depends(get_db)):
    return db.query(models.Reward).all()

@router.post("/rewards/claim/{reward_id}", response_model=schemas.UserRewardResponse)
def claim_reward(reward_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    reward = db.query(models.Reward).filter(models.Reward.id == reward_id).first()
    if not reward:
        raise HTTPException(status_code=404, detail="Reward not found")
    
    if current_user.reward_points < reward.points_cost:
        raise HTTPException(status_code=400, detail="Insufficient reward points")
    
    # Deduct points
    current_user.reward_points -= reward.points_cost
    
    # Create claim
    user_reward = models.UserReward(
        user_id=current_user.id,
        reward_id=reward_id
    )
    db.add(user_reward)
    db.commit()
    db.refresh(user_reward)
    
    log_audit_action(db, current_user.id, "REWARD_CLAIM", "Reward", reward.id, details={"cost": reward.points_cost})
    
    return user_reward

from ..dependencies import get_admin
from .auth import get_password_hash

@router.get("", response_model=List[schemas.UserResponseAdmin])
@router.get("/", include_in_schema=False)
def get_all_users(db: Session = Depends(get_db), current_user: models.User = Depends(get_admin)):
    users = db.query(models.User).order_by(models.User.created_at.desc()).all()
    return users

@router.post("", response_model=schemas.UserResponseAdmin)
@router.post("/", include_in_schema=False)
def create_user(user_in: schemas.UserCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_admin)):
    # Check if user already exists
    existing_user = db.query(models.User).filter(models.User.email == user_in.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
        
    hashed_password = get_password_hash(user_in.password)
    new_user = models.User(
        email=user_in.email,
        hashed_password=hashed_password,
        role=user_in.role
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    log_audit_action(db, current_user.id, "USER_CREATED", "User", new_user.id, details={"role": new_user.role})
    
    return new_user
