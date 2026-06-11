from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.db.database import engine
from app.core.logging import logger
from app.core.dependencies import require_role
from app.api.v1.auth import router as auth_router
from app.api.v1.users import router as users_router

logger.info("Starting application")
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users_router, prefix="/api/v1/users", tags=["users"])

@app.get("/health")
def health():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok"}

# only admin and leadership can access
@app.get("/api/v1/admin/dashboard")
def admin_dashboard(current_user=Depends(require_role("admin", "leadership"))):
    return {"message": f"Welcome {current_user['email']}"}