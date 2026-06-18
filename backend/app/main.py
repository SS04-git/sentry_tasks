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
import os


logger.info("Starting application")
app = FastAPI()

print("CLIENT_SECRET exists:", bool(os.getenv("GITHUB_CLIENT_SECRET")))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users_router, prefix="/api/v1/users", tags=["users"])
app.include_router(github.router, prefix="/api/v1/github", tags=["GitHub"])
app.include_router(attendance.router, prefix="/api/v1/attendance", tags=["attendance"])
app.include_router(occupancy_router, prefix="/api/v1/occupancy", tags=["occupancy"])
app.include_router(security.router, prefix="/api/v1/security", tags=["security"])


@app.get("/health")
def health():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok"}

@app.get("/api/v1/admin/dashboard")
def admin_dashboard(current_user=Depends(require_role("admin", "leadership"))):
    return {"message": f"Welcome {current_user['email']}"}
