from fastapi import APIRouter, HTTPException

from app.services.anomaly_service import run_anomaly_detection
from app.api.v1.security import router as security_router

router = APIRouter()


@router.get("/")
def root():
    return {"message": "API v1 working"}


@router.post("/anomaly/run")
def run_anomaly():
    try:
        result = run_anomaly_detection()

        return {
            "success": True,
            "data": result
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


router.include_router(
    security_router,
    prefix="/security",
    tags=["Security"],
)