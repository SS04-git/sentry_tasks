from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.user import User
from app.core.security import verify_password, create_access_token
from collections import defaultdict
from datetime import datetime, timedelta
import logging

logger = logging.getLogger("backend")
router = APIRouter()

# fake_user = {
#     "email": "test@gm.com",
#     "hashed_password": "$2b$12$8kGn0Qdu.fG97dYqxJnQguYrGkux7JXBWhHBo.SAfIK23Sb9M6sBq",
#     "role": "admin"
# }

class LoginRequest(BaseModel):
    email: str
    password: str

FAILED_LOGINS = defaultdict(list)
MAX_ATTEMPTS = 5
LOCKOUT_MINUTES = 3

# @router.post("/login")
# def login(data: LoginRequest):
#     if data.email != fake_user["email"]:
#         raise HTTPException(status_code=401, detail="Invalid credentials")
#     if not verify_password(data.password, fake_user["hashed_password"]):
#         raise HTTPException(status_code=401, detail="Invalid credentials")
#     token = create_access_token({"sub": data.email, "role": fake_user["role"]})
#     logger.info(f"Login successful for {data.email} with role {fake_user['role']}")
#     return {"access_token": token, "token_type": "bearer"}

@router.post("/login")
def login(
    data: LoginRequest,
    db: Session = Depends(get_db),
):

    attempts = FAILED_LOGINS[data.email]

    cutoff = datetime.utcnow() - timedelta(
        minutes=LOCKOUT_MINUTES
    )

    attempts[:] = [
        t for t in attempts
        if t > cutoff
    ]

    if len(attempts) >= MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail="Account temporarily locked"
        )

    user = db.query(User).filter(
        User.email == data.email
    ).first()

    if not user:
        FAILED_LOGINS[data.email].append(
            datetime.utcnow()
        )

        raise HTTPException(
            status_code=401,
            detail="Invalid credentials"
        )

    if not verify_password(
        data.password,
        user.hashed_password,
    ):
        FAILED_LOGINS[data.email].append(
            datetime.utcnow()
        )

        raise HTTPException(
            status_code=401,
            detail="Invalid credentials"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=403,
            detail="Account disabled"
        )

    FAILED_LOGINS[data.email].clear()

    token = create_access_token(
        {
            "sub": user.email,
            "role": user.role,
        }
    )

    logger.info(
        f"Login successful for {user.email}"
    )

    return {
        "access_token": token,
        "token_type": "bearer",
    }