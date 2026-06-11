from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.db.database import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(String, nullable=False)        # e.g. "create_user", "disable_user"
    performed_by = Column(String, nullable=False)  # email of admin who did it
    target_user = Column(String, nullable=True)    # email of user affected
    detail = Column(String, nullable=True)         # extra info
    created_at = Column(DateTime(timezone=True), server_default=func.now())