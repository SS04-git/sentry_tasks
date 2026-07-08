"""
SENTRY-22  Attendance KPI API  (A1-A6)
--------------------------------------
"""

from __future__ import annotations

import csv
import io
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, UploadFile, File, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.dependencies import require_role
from app.db.database import get_db

from app.core.governance import suppress, should_suppress

logger = logging.getLogger("backend")
router = APIRouter()



# helpers

def _minutes_to_hhmm(minutes: Optional[float]) -> Optional[str]:
    if minutes is None:
        return None
    h = int(minutes) // 60
    m = int(minutes) % 60
    return f"{h:02d}:{m:02d}"


# KPI

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
            "commit_count": None,
            "lint_errors": None,
            "lint_warnings": None,
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

    # Admin-only: append real git contributors, sourced live from git_commits.
    # No hardcoding — new contributors appear automatically on next commit.
    if role == "admin":
        result = result + _get_all_contributors(db)

    return {"cohort_size": cohort_size, "window_days": 30, "data": result}

# TREND
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


# DAILY
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


# PREVIEW
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

# CSV UPLOAD
REQUIRED_CSV_COLUMNS = {"person_id", "event_ts", "direction"}

@router.post("/upload")
async def upload_attendance_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership")),
):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv")

    raw = await file.read()
    try:
        text_content = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Could not decode file as UTF-8")

    reader = csv.DictReader(io.StringIO(text_content))
    if not reader.fieldnames or not REQUIRED_CSV_COLUMNS.issubset(set(reader.fieldnames)):
        raise HTTPException(
            status_code=400,
            detail=(
                "CSV must include columns: person_id, event_ts, direction. "
                "Optional: email (used instead of person_id), access_method, access_result"
            ),
        )

    users = db.execute(text("SELECT id, email FROM users")).mappings().all()
    email_to_id = {u["email"].lower(): str(u["id"]) for u in users}
    valid_ids = {str(u["id"]) for u in users}

    db.execute(text("TRUNCATE TABLE fact_access_event"))
    db.commit()

    inserted, skipped, errors = 0, 0, []

    for i, row in enumerate(reader, start=2):
        raw_person = (row.get("person_id") or "").strip()
        raw_email  = (row.get("email") or "").strip().lower()

        person_id = None
        if raw_person and raw_person in valid_ids:
            person_id = raw_person
        elif raw_email and raw_email in email_to_id:
            person_id = email_to_id[raw_email]

        if not person_id:
            errors.append(f"Row {i}: unknown person_id/email ('{raw_person or raw_email}')")
            skipped += 1
            continue

        direction = (row.get("direction") or "").strip().lower()
        if direction not in ("entry", "exit"):
            errors.append(f"Row {i}: direction must be 'entry' or 'exit', got '{direction}'")
            skipped += 1
            continue

        raw_ts = (row.get("event_ts") or "").strip()
        try:
            event_ts = datetime.fromisoformat(raw_ts)
        except ValueError:
            errors.append(f"Row {i}: invalid event_ts '{raw_ts}' (use ISO format, e.g. 2026-06-01T08:15:00)")
            skipped += 1
            continue

        access_method = (row.get("access_method") or None)
        access_result = (row.get("access_result") or "granted")

        try:
            result = db.execute(text("""
                INSERT INTO fact_access_event
                    (id, person_id, event_ts, direction, access_method, access_result, created_at)
                VALUES
                    (gen_random_uuid(), :person_id, :event_ts, :direction, :access_method, :access_result, now())
                ON CONFLICT ON CONSTRAINT uq_access_event DO NOTHING
            """), {
                "person_id": person_id,
                "event_ts": event_ts,
                "direction": direction,
                "access_method": access_method,
                "access_result": access_result,
            })
            if result.rowcount > 0:
                inserted += 1
            else:
                skipped += 1
                errors.append(f"Row {i}: duplicate event (already exists), skipped")
        except Exception as e:
            errors.append(f"Row {i}: insert failed ({e})")
            skipped += 1

    db.commit()

    db.execute(text("""
        INSERT INTO audit_logs (action, performed_by, target_user, detail, created_at)
        VALUES (:action, :performed_by, NULL, :detail, now())
    """), {
        "action": "attendance_csv_upload",
        "performed_by": current_user["email"],
        "detail": f"file={file.filename} inserted={inserted} skipped={skipped}",
    })
    db.commit()

    return {
        "filename": file.filename,
        "rows_inserted": inserted,
        "rows_skipped": skipped,
        "errors": errors[:50],
    }

def _get_all_contributors(db: Session, window_days: int = 30) -> list[dict]:
    """
    Pulls every distinct git contributor directly from git_commits + lint views,
    with NO dependency on github_accounts or the users table. This means new
    contributors show up automatically the moment they commit to the connected
    repo — nothing to insert or configure per person.
    """
    commit_rows = db.execute(text("""
        SELECT
            gc.author_github_login,
            MIN(gc.author_name) AS author_name,
            MIN(gc.author_email) AS author_email,
            COUNT(gc.sha) AS commit_count
        FROM git_commits gc
        WHERE gc.committed_at >= now() - (:window_days || ' days')::interval
        GROUP BY gc.author_github_login
    """), {"window_days": window_days}).mappings().all()

    try:
        lint_rows = db.execute(text("""
            SELECT
                author_github_login,
                SUM(error_count) AS error_count,
                SUM(warning_count) AS warning_count
            FROM (
                SELECT
                    lb.author_github_login,
                    lb.finding_id,
                    CASE WHEN lb.severity = 'error' THEN 1 ELSE 0 END AS error_count,
                    CASE WHEN lb.severity = 'warning' THEN 1 ELSE 0 END AS warning_count
                FROM v_lint_blame_current lb
            ) x
            GROUP BY author_github_login
        """)).mappings().all()
    except Exception:
        logger.warning("v_lint_blame_current unavailable; skipping lint correlation", exc_info=True)
        lint_rows = []

    lint_by_login = {r["author_github_login"]: r for r in lint_rows}

    return [
        {
            "person_id": f"gh:{r['author_github_login']}",
            "full_name": r["author_name"] or r["author_github_login"],
            "email": r["author_email"],
            "user_role": "contributor",
            "days_present": None,
            "total_working_days": None,
            "attendance_pct": None,
            "avg_arrival": None,
            "arrival_consistency": None,
            "avg_session_hours": None,
            "total_session_hours": None,
            "is_own": False,
            "commit_count": r["commit_count"],
            "lint_errors": lint_by_login.get(r["author_github_login"], {}).get("error_count", 0),
            "lint_warnings": lint_by_login.get(r["author_github_login"], {}).get("warning_count", 0),
        }
        for r in commit_rows
    ]