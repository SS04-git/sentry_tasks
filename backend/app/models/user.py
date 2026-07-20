from sqlalchemy import Column, Integer, String, Enum, Boolean, DateTime, JSON
from sqlalchemy.sql import func
from app.db.database import Base
import enum

class RoleEnum(str, enum.Enum):
    admin = "admin"
    leadership = "leadership"
    manager = "manager"
    employee = "employee"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(RoleEnum), default=RoleEnum.employee, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    full_name = Column(String, nullable=True)
    permissions = Column(JSON, nullable=True)  # null = inherit role defaults; list[str] = explicit override
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())