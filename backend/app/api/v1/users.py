from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.user import User, RoleEnum
from app.models.audit_log import AuditLog
from app.core.dependencies import require_role
from app.core.security import hash_password
import logging

logger = logging.getLogger("backend")
router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None
    role: RoleEnum = RoleEnum.employee

class UpdateUserRequest(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None

class AssignRoleRequest(BaseModel):
    role: RoleEnum

class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str | None
    role: str
    is_active: bool

    class Config:
        from_attributes = True


# ── Audit helper ─────────────────────────────────────────────

def log_action(db: Session, action: str, performed_by: str, target_user: str = None, detail: str = None):
    entry = AuditLog(
        action=action,
        performed_by=performed_by,
        target_user=target_user,
        detail=detail,
    )
    db.add(entry)
    db.commit()
    logger.info(f"AUDIT | {action} | by={performed_by} | target={target_user} | {detail}")


# ── Endpoints ─────────────────────────────────────────────────

@router.get("/", response_model=list[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership")),
):
    return db.query(User).all()


@router.post("/", response_model=UserResponse, status_code=201)
def create_user(
    data: CreateUserRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        role=data.role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    log_action(db, "create_user", current_user["email"], data.email, f"role={data.role}")
    return user


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    data: UpdateUserRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if data.full_name is not None:
        user.full_name = data.full_name
    if data.email is not None:
        user.email = data.email

    db.commit()
    db.refresh(user)

    log_action(db, "update_user", current_user["email"], user.email, str(data.dict(exclude_none=True)))
    return user


@router.patch("/{user_id}/disable", response_model=UserResponse)
def disable_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="User already disabled")

    user.is_active = False
    db.commit()
    db.refresh(user)

    log_action(db, "disable_user", current_user["email"], user.email)
    return user


@router.patch("/{user_id}/enable", response_model=UserResponse)
def enable_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = True
    db.commit()
    db.refresh(user)

    log_action(db, "enable_user", current_user["email"], user.email)
    return user


@router.patch("/{user_id}/role", response_model=UserResponse)
def assign_role(
    user_id: int,
    data: AssignRoleRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_role = user.role
    user.role = data.role
    db.commit()
    db.refresh(user)

    log_action(db, "assign_role", current_user["email"], user.email, f"{old_role} → {data.role}")
    return user


@router.get("/audit-logs")
def get_audit_logs(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership")),
):
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(100).all()
    return logs