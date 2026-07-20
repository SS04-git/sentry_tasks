from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.user import User, RoleEnum
from app.models.audit_log import AuditLog
from app.core.dependencies import require_role, get_current_user
from app.core.security import hash_password, verify_password
import logging

logger = logging.getLogger("backend")
router = APIRouter()


# ── Permission catalog ───────────────────────────────────────

PERMISSION_CATALOG = {
    "view_own_attendance": "View Own Attendance",
    "apply_leave": "Apply Leave",
    "view_own_leave": "View Own Leave",
    "view_shifts": "View Shifts",
    "view_payslips": "View Payslips",
    "view_announcements": "View Announcements",
    "view_directory": "View Directory",
    "view_team_attendance": "View Team Attendance",
    "approve_leave": "Approve Leave",
    "manage_shifts": "Manage Shifts",
    "view_reports": "View Reports",
}

DEFAULT_ROLE_PERMISSIONS = {
    RoleEnum.employee: [
        "view_own_attendance", "apply_leave", "view_own_leave",
        "view_shifts", "view_payslips", "view_announcements", "view_directory",
    ],
    RoleEnum.manager: [
        "view_own_attendance", "apply_leave", "view_own_leave", "view_shifts",
        "view_payslips", "view_announcements", "view_directory",
        "view_team_attendance", "approve_leave", "manage_shifts",
    ],
    RoleEnum.leadership: list(PERMISSION_CATALOG.keys()),
    RoleEnum.admin: list(PERMISSION_CATALOG.keys()),
}


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

class UpdatePermissionsRequest(BaseModel):
    permissions: list[str]

class UpdateOwnProfileRequest(BaseModel):
    full_name: str | None = None

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str | None
    role: str
    is_active: bool
    permissions: list[str]

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


def to_user_response(user: User) -> UserResponse:
    perms = user.permissions if user.permissions is not None else DEFAULT_ROLE_PERMISSIONS.get(user.role, [])
    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        permissions=perms,
    )


# ── Endpoints ─────────────────────────────────────────────────

@router.get("/", response_model=list[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership")),
):
    return [to_user_response(u) for u in db.query(User).all()]


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
    return to_user_response(user)

@router.get("/audit-logs")
def get_audit_logs(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership")),
):
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()
    return logs

@router.get("/audit-logs/count")
def get_audit_logs_count(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership")),
):
    count = db.query(AuditLog).count()
    return {"count": count}

@router.get("/audit-logs/me")
def get_own_audit_logs(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    logs = (
        db.query(AuditLog)
        .filter(AuditLog.target_user == current_user["email"])
        .order_by(AuditLog.created_at.desc())
        .limit(20)
        .all()
    )
    return logs

@router.get("/permissions/catalog")
def get_permissions_catalog(
    current_user=Depends(require_role("admin")),
):
    return {
        "permissions": PERMISSION_CATALOG,
        "role_defaults": {role.value: perms for role, perms in DEFAULT_ROLE_PERMISSIONS.items()},
    }

@router.patch("/me", response_model=UserResponse)
def update_own_profile(
    data: UpdateOwnProfileRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    user = db.query(User).filter(User.email == current_user["email"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if data.full_name is not None:
        user.full_name = data.full_name

    db.commit()
    db.refresh(user)

    log_action(db, "update_profile", current_user["email"], user.email, str(data.dict(exclude_none=True)))
    return to_user_response(user)


@router.patch("/me/password", response_model=UserResponse)
def change_own_password(
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
    db.refresh(user)

    log_action(db, "change_password", current_user["email"], user.email)
    return to_user_response(user)

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
    return to_user_response(user)


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
    return to_user_response(user)


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
    return to_user_response(user)


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
    return to_user_response(user)


@router.patch("/{user_id}/permissions", response_model=UserResponse)
def update_permissions(
    user_id: int,
    data: UpdatePermissionsRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    invalid = set(data.permissions) - set(PERMISSION_CATALOG.keys())
    if invalid:
        raise HTTPException(status_code=400, detail=f"Unknown permissions: {', '.join(invalid)}")

    user.permissions = data.permissions
    db.commit()
    db.refresh(user)

    log_action(db, "update_permissions", current_user["email"], user.email, str(data.permissions))
    return to_user_response(user)


@router.delete("/{user_id}/permissions", response_model=UserResponse)
def reset_permissions(
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.permissions = None
    db.commit()
    db.refresh(user)

    log_action(db, "reset_permissions", current_user["email"], user.email)
    return to_user_response(user)