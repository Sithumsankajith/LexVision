"""Router for managing fine rules and penalties."""

from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..dependencies import get_admin, get_police

router = APIRouter(prefix="/api/fine-rules", tags=["fine-rules"])

@router.get("", response_model=List[schemas.FineRuleResponse])
@router.get("/", include_in_schema=False)
def list_fine_rules(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_police),
):
    """List all fine rules. Available to both police and admin."""
    return db.query(models.FineRule).order_by(models.FineRule.violation_type).all()

@router.get("/{violation_type}", response_model=schemas.FineRuleResponse)
def get_fine_rule_by_violation(
    violation_type: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_police),
):
    """Get the active fine rule for a specific violation type."""
    rule = db.query(models.FineRule).filter(
        models.FineRule.violation_type == violation_type,
        models.FineRule.active == True
    ).first()
    if not rule:
        raise HTTPException(status_code=404, detail=f"No active fine rule found for violation type: {violation_type}")
    return rule

@router.post("", response_model=schemas.FineRuleResponse)
@router.post("/", include_in_schema=False)
def create_fine_rule(
    rule_data: schemas.FineRuleCreate,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_admin),
):
    """Create a new fine rule. Admin only. If a rule for the violation type already exists, it is marked as inactive."""
    # Deactivate existing rule if any
    existing_rules = db.query(models.FineRule).filter(
        models.FineRule.violation_type == rule_data.violation_type,
        models.FineRule.active == True
    ).all()
    for existing in existing_rules:
        existing.active = False
        db.add(existing)

    new_rule = models.FineRule(
        violation_type=rule_data.violation_type,
        penal_code=rule_data.penal_code,
        fine_amount=rule_data.fine_amount,
        currency=rule_data.currency,
        description=rule_data.description,
        severity=rule_data.severity,
        active=rule_data.active,
        version=1,
    )
    db.add(new_rule)
    db.commit()
    db.refresh(new_rule)
    return new_rule

@router.put("/{rule_id}", response_model=schemas.FineRuleResponse)
def update_fine_rule(
    rule_id: str,
    update_data: schemas.FineRuleUpdate,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_admin),
):
    """Update a fine rule. Admin only."""
    rule = db.query(models.FineRule).filter(models.FineRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Fine rule not found")
    
    update_dict = update_data.model_dump(exclude_unset=True)
    if update_dict:
        # Increment version on update
        rule.version += 1
        for key, value in update_dict.items():
            setattr(rule, key, value)
        
        db.add(rule)
        db.commit()
        db.refresh(rule)
    
    return rule
