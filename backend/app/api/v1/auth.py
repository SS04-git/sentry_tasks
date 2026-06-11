from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.user import User
from app.core.security import verify_password, create_access_token
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
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    token = create_access_token({"sub": user.email, "role": user.role})
    logger.info(f"Login successful for {user.email} with role {user.role}")
    return {"access_token": token, "token_type": "bearer"}