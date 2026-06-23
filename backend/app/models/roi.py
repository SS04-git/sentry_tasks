from sqlalchemy import Column, Integer, Float, String

from app.db.database import Base


class ROIRecord(Base):
    __tablename__ = "roi_tracking"

    id = Column(Integer, primary_key=True, index=True)

    quarter = Column(String, nullable=False)

    rework_savings = Column(Float, default=0)
    delivery_savings = Column(Float, default=0)
    facilities_savings = Column(Float, default=0)
    incident_avoidance = Column(Float, default=0)

    realised_value = Column(Float, default=0)
    model_value = Column(Float, default=0)