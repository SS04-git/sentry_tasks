from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db.database import SessionLocal
from app.services.occupancy_service import get_forecast

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/kpi")
def occupancy_kpi(
    db: Session = Depends(get_db)
):
    result = db.execute(
        text(
            """
            SELECT
                MAX(peak_occupancy) peak,
                AVG(avg_occupancy) avg,
                MIN(min_occupancy) min
            FROM v_occupancy_daily_peak
            """
        )
    ).mappings().first()

    return result


@router.get("/trend")
def occupancy_trend(
    db: Session = Depends(get_db)
):
    rows = db.execute(
        text(
            """
            SELECT *
            FROM v_occupancy_trend
            ORDER BY event_date
            """
        )
    ).mappings().all()

    return rows


@router.get("/mobile-adoption")
def mobile_adoption(
    db: Session = Depends(get_db)
):
    rows = db.execute(
        text(
            """
            SELECT *
            FROM v_mobile_adoption
            ORDER BY event_date
            """
        )
    ).mappings().all()

    return rows


@router.get("/forecast")
def forecast(
    db: Session = Depends(get_db)
):
    df = get_forecast(db)

    return df.to_dict(
        orient="records"
    )