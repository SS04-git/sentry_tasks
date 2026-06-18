from sqlalchemy import (
    Column,
    String,
    DateTime,
    Index,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
import uuid

from app.db.database import Base


class RawAccessEvent(Base):
    __tablename__ = "raw_access_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    payload = Column(JSONB, nullable=False)

    received_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class FactAccessEvent(Base):
    __tablename__ = "fact_access_event"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    person_id = Column(String, nullable=False)

    event_ts = Column(
        DateTime(timezone=True),
        nullable=False,
    )

    direction = Column(
    String,
    nullable=False,
)

    access_method = Column(
    String,
    nullable=False,
    server_default="card"
)

    source_event_id = Column(
    UUID(as_uuid=True),
    nullable=True,
)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "person_id",
            "event_ts",
            "direction",
            name="uq_access_event"
        ),
        Index(
            "ix_person_event_ts",
            "person_id",
            "event_ts"
        ),
    )
