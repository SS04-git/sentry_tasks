from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import SessionLocal
from app.models.roi import ROIRecord

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/")
def get_roi(db: Session = Depends(get_db)):
    rows = db.query(ROIRecord).all()

    return [
        {
            "quarter": r.quarter,
            "realised": r.realised_value,
            "model": r.model_value,
            "rework": r.rework_savings,
            "delivery": r.delivery_savings,
            "facilities": r.facilities_savings,
            "incident": r.incident_avoidance,
        }
        for r in rows
    ]