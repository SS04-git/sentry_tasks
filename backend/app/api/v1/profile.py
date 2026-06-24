"""
app/api/v1/profile.py
---------------------
Self-service profile and password endpoints.

PATCH /api/v1/users/me          — update own full_name
PATCH /api/v1/users/me/password — change own password
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.core.security import hash_password, verify_password
from app.db.database import get_db
from app.models.user import User

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class UpdateProfileRequest(BaseModel):
    full_name: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.patch("/me")
def update_profile(
    data: UpdateProfileRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    user = db.query(User).filter(User.email == current_user["email"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if data.full_name is not None:
        user.full_name = data.full_name.strip() or user.full_name

    db.commit()
    db.refresh(user)
    return {"email": user.email, "full_name": user.full_name, "role": user.role}


@router.patch("/me/password")
def change_password(
    data: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    user = db.query(User).filter(User.email == current_user["email"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not verify_password(data.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    user.hashed_password = hash_password(data.new_password)
    db.commit()
    return {"message": "Password changed successfully"}