"""
SENTRY-22  Attendance KPI API  (A1-A6)
--------------------------------------
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.dependencies import require_role
from app.db.database import get_db

from app.core.governance import suppress, should_suppress

logger = logging.getLogger("backend")
router = APIRouter()



# ── helpers ──────────────────────────────────────────────────────────────────

def _minutes_to_hhmm(minutes: Optional[float]) -> Optional[str]:
    if minutes is None:
        return None
    h = int(minutes) // 60
    m = int(minutes) % 60
    return f"{h:02d}:{m:02d}"


# ── KPI ──────────────────────────────────────────────────────────────────────

@router.get("/kpi")
def get_attendance_kpi(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership", "manager", "employee")),
):
    role = current_user["role"]
    email = current_user["email"]

    rows = db.execute(text("""
        SELECT
            k.person_id,
            u.full_name,
            u.email,
            u.role AS user_role,
            k.days_present,
            k.total_working_days,
            k.attendance_pct,
            k.avg_arrival_minutes,
            k.arrival_stddev_minutes,
            k.avg_session_hours,
            k.total_session_hours
        FROM public.v_attendance_kpi k
        JOIN users u ON u.id::text = k.person_id
        ORDER BY k.attendance_pct DESC NULLS LAST
    """)).mappings().all()

    cohort_size = len(rows)

    def _build(r):
        is_own = r["email"] == email
        visible = role in ("admin", "leadership") or is_own

        return {
            "person_id": r["person_id"],
            "full_name": r["full_name"] if visible else None,
            "email": r["email"] if visible else None,
            "user_role": r["user_role"],
            "days_present": r["days_present"],
            "total_working_days": r["total_working_days"],
            "attendance_pct": float(r["attendance_pct"]) if r["attendance_pct"] else None,
            "avg_arrival": _minutes_to_hhmm(r["avg_arrival_minutes"]),
            "arrival_consistency": suppress(
                float(r["arrival_stddev_minutes"]) if r["arrival_stddev_minutes"] else None,
                cohort_size,
            ),
            "avg_session_hours": float(r["avg_session_hours"]) if r["avg_session_hours"] else None,
            "total_session_hours": float(r["total_session_hours"]) if r["total_session_hours"] else None,
            "is_own": is_own,
        }

    if role == "employee":
        own = db.execute(
            text("SELECT id FROM users WHERE email = :email"),
            {"email": email},
        ).fetchone()
        own_id = str(own[0]) if own else None
        result = [_build(r) for r in rows if r["person_id"] == own_id]
    else:
        result = [_build(r) for r in rows]

    return {"cohort_size": cohort_size, "window_days": 30, "data": result}


# ── TREND ────────────────────────────────────────────────────────────────────

@router.get("/trend")
def get_attendance_trend(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership", "manager", "employee")),
):
    role = current_user["role"]
    email = current_user["email"]

    if role == "employee":
        own = db.execute(
            text("SELECT id FROM users WHERE email = :email"),
            {"email": email},
        ).fetchone()
        own_id = str(own[0]) if own else "-1"

        rows = db.execute(text("""
            SELECT
                week_start,
                days_present,
                avg_session_hours,
                avg_arrival_minutes
            FROM public.v_attendance_weekly_trend
            WHERE person_id = :pid
            ORDER BY week_start
        """), {"pid": own_id}).mappings().all()

        return {
            "mode": "individual",
            "data": [
                {
                    "week_start": str(r["week_start"]),
                    "days_present": r["days_present"],
                    "avg_session_hours": float(r["avg_session_hours"] or 0),
                    "avg_arrival": _minutes_to_hhmm(r["avg_arrival_minutes"]),
                }
                for r in rows
            ],
        }

    rows = db.execute(text("""
        SELECT
            week_start,
            COUNT(DISTINCT person_id) AS active_people,
            ROUND(AVG(days_present)::numeric, 1) AS avg_days_present,
            ROUND(AVG(avg_session_hours)::numeric, 2) AS avg_session_hours,
            ROUND(AVG(avg_arrival_minutes)::numeric, 1) AS avg_arrival_minutes
        FROM public.v_attendance_weekly_trend
        GROUP BY week_start
        ORDER BY week_start
    """)).mappings().all()

    cohort_size = db.execute(text("SELECT COUNT(*) FROM public.v_attendance_kpi")).scalar()

    return {
        "mode": "cohort",
        "cohort_size": cohort_size,
        "suppressed": should_suppress(cohort_size),
        "data": [
            {
                "week_start": str(r["week_start"]),
                "active_people": r["active_people"],
                "avg_days_present": float(r["avg_days_present"] or 0),
                "avg_session_hours": float(r["avg_session_hours"] or 0),
                "avg_arrival": _minutes_to_hhmm(r["avg_arrival_minutes"]),
            }
            for r in rows
        ],
    }


# ── DAILY ────────────────────────────────────────────────────────────────────

@router.get("/daily")
def get_daily_detail(
    person_id: Optional[str] = Query(default=None),
    days: int = Query(default=30, le=90),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership", "manager", "employee")),
):
    role = current_user["role"]
    email = current_user["email"]

    own = db.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": email},
    ).fetchone()
    own_id = str(own[0]) if own else "-1"

    if role == "employee" or not person_id:
        person_id = own_id

    rows = db.execute(text("""
        SELECT
            work_date,
            first_entry,
            last_exit,
            ROUND(session_hours::numeric, 2) AS session_hours
        FROM public.v_attendance_daily
        WHERE person_id = :pid
          AND work_date >= current_date - (:days || ' days')::interval
        ORDER BY work_date DESC
    """), {"pid": person_id, "days": days}).mappings().all()

    return {
        "person_id": person_id,
        "days": days,
        "data": [
            {
                "work_date": str(r["work_date"]),
                "first_entry": r["first_entry"].isoformat() if r["first_entry"] else None,
                "last_exit": r["last_exit"].isoformat() if r["last_exit"] else None,
                "session_hours": float(r["session_hours"]) if r["session_hours"] else None,
            }
            for r in rows
        ],
    }


# ── PREVIEW ──────────────────────────────────────────────────────────────────

@router.get("/preview")
def get_attendance_preview(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership", "manager", "employee")),
):
    role = current_user["role"]
    email = current_user["email"]

    own = db.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": email},
    ).fetchone()
    own_id = str(own[0]) if own else "-1"

    cohort = db.execute(text("""
        SELECT
            COUNT(*) AS cohort_size,
            ROUND(AVG(attendance_pct)::numeric, 1) AS avg_attendance_pct,
            ROUND(AVG(avg_session_hours)::numeric, 2) AS avg_session_hours
        FROM public.v_attendance_kpi
    """)).mappings().fetchone()

    own_row = db.execute(text("""
        SELECT days_present, attendance_pct, avg_arrival_minutes, avg_session_hours
        FROM public.v_attendance_kpi
        WHERE person_id = :pid
    """), {"pid": own_id}).mappings().fetchone()

    week_row = db.execute(text("""
        SELECT COUNT(DISTINCT work_date) AS days_this_week
        FROM public.v_attendance_daily
        WHERE person_id = :pid
          AND work_date >= date_trunc('week', current_date)
    """), {"pid": own_id}).mappings().fetchone()

    cohort_size = cohort["cohort_size"] if cohort else 0

    return {
        "own": {
            "days_present": own_row["days_present"] if own_row else 0,
            "attendance_pct": float(own_row["attendance_pct"]) if own_row and own_row["attendance_pct"] else 0,
            "avg_arrival": _minutes_to_hhmm(own_row["avg_arrival_minutes"]) if own_row else None,
            "avg_session_hours": float(own_row["avg_session_hours"]) if own_row and own_row["avg_session_hours"] else 0,
            "days_this_week": week_row["days_this_week"] if week_row else 0,
        },
        "cohort": {
            "size": cohort_size,
            "avg_attendance_pct": suppress(
                float(cohort["avg_attendance_pct"]) if cohort and cohort["avg_attendance_pct"] else 0,
                cohort_size,
            ),
            "avg_session_hours": suppress(
                float(cohort["avg_session_hours"]) if cohort and cohort["avg_session_hours"] else 0,
                cohort_size,
            ),
        },
    }