from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.db.database import engine
from app.core.logging import logger
from app.core.dependencies import require_role
from app.api.v1.auth import router as auth_router
from app.api.v1.users import router as users_router
from app.api.v1.occupancy import router as occupancy_router
from app.api.v1 import github
from app.api.v1 import attendance
from app.api.v1 import security
from app.api.v1 import code_quality
from app.api.v1 import dora
from app.api.v1 import cohorts
from app.api.v1 import defect_risk
from app.api.v1 import governance
from app.services.platform_service import start_scheduler
from app.api.v1 import roi
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from app.api.v1 import profile
import os

logger.info("Starting application")
app = FastAPI()

print("CLIENT_SECRET exists:", bool(os.getenv("GITHUB_CLIENT_SECRET")))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],)

app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users_router, prefix="/api/v1/users", tags=["users"])
app.include_router(github.router, prefix="/api/v1/github", tags=["GitHub"])
app.include_router(attendance.router, prefix="/api/v1/attendance", tags=["attendance"])
app.include_router(occupancy_router, prefix="/api/v1/occupancy", tags=["occupancy"])
app.include_router(security.router, prefix="/api/v1/security", tags=["security"])
app.include_router(code_quality.router, prefix="/api/v1/code_quality", tags=["code_quality"])
app.include_router(dora.router, prefix="/api/v1/dora", tags=["dora_metrics"])
app.include_router(cohorts.router, prefix="/api/v1/cohorts", tags=["cohorts"])
app.include_router(defect_risk.router, prefix="/api/v1/defect_risk", tags=["defect_risk"])
app.include_router(governance.router, prefix="/api/v1/governance", tags=["Governance"],)
app.include_router(roi.router, prefix="/api/v1/roi", tags=["ROI"],)
app.include_router(profile.router, prefix="/api/v1/users", tags=["profile"])

@app.get("/health")
def health():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok"}

@app.get("/api/v1/admin/dashboard")
def admin_dashboard(current_user=Depends(require_role("admin", "leadership"))):
    return {"message": f"Welcome {current_user['email']}"}


@app.on_event("startup")
def startup_event():
    try:
        start_scheduler()
        logger.info("Pipeline scheduler started")
    except Exception as e:
        logger.error(f"Failed to start scheduler: {e}")

if os.getenv("ENV") == "production":
    app.add_middleware(
        HTTPSRedirectMiddleware
    )