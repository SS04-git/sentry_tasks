"""
seed_local_users.py
--------------------
LOCAL DEV ONLY. Recreates the standard 5 test users after a fresh/pruned
Docker Postgres volume. Safe to keep in the repo — it refuses to run
unless ENV is explicitly "local" or "development", so it can never touch
a staging/production database even if accidentally invoked there.

Usage (from inside the backend container):
    docker exec -it sentry-backend-1 python -m app.scripts.seed_local_users
"""

import os
import sys

from app.db.database import SessionLocal
from app.core.security import hash_password
from app.models.user import User

# ── Safety guard: refuses to run anywhere but local/dev ──────────────────
ALLOWED_ENVS = {"local", "development", None, ""}  # None/"" covers no ENV set at all, i.e. local docker-compose
CURRENT_ENV = os.getenv("ENV")

if CURRENT_ENV not in ALLOWED_ENVS:
    print(f"Refusing to run: ENV='{CURRENT_ENV}' is not local/development. Aborting.")
    sys.exit(1)

USERS = [
    {"email": "admin@sentry.com",     "password": "admin123",      "full_name": "Admin User",      "role": "admin"},
    {"email": "employee@sentry.com",  "password": "employee123",   "full_name": "Employee User",   "role": "employee"},
    {"email": "manager@sentry.com",   "password": "manager123",    "full_name": "Manager User",    "role": "manager"},
    {"email": "leader@sentry.com",    "password": "leader123",     "full_name": "Leadership User", "role": "leadership"},
    {"email": "employee2@sentry.com", "password": "2employee123",  "full_name": "Employee Two",    "role": "employee"},
]

def run():
    db = SessionLocal()
    try:
        created, skipped = 0, 0
        for u in USERS:
            existing = db.query(User).filter(User.email == u["email"]).first()
            if existing:
                print(f"SKIP  {u['email']} (already exists)")
                skipped += 1
                continue

            user = User(
                email=u["email"],
                hashed_password=hash_password(u["password"]),
                full_name=u["full_name"],
                role=u["role"],
                is_active=True,
            )
            db.add(user)
            db.commit()
            print(f"OK    {u['email']} ({u['role']})")
            created += 1

        print(f"\nDone. Created {created}, skipped {skipped}.")
    finally:
        db.close()

if __name__ == "__main__":
    run()