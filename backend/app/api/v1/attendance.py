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

def _get_uploaded_data_range(db: Session) -> tuple[Optional[datetime], Optional[datetime]]:
    """
    Returns (earliest, latest) event_ts from the uploaded attendance CSV
    (fact_access_event). Commit/lint correlation should be scoped to this
    same window, not a fixed rolling 30 days from "now" — otherwise the
    git activity shown has no relationship to the attendance dates being
    displayed. Falls back to (None, None) if no data has been uploaded yet.
    """
    row = db.execute(text("""
        SELECT MIN(event_ts) AS earliest, MAX(event_ts) AS latest
        FROM fact_access_event
    """)).mappings().fetchone()

    if not row or row["earliest"] is None:
        return None, None
    return row["earliest"], row["latest"]


# KPI
@router.get("/kpi")
def get_attendance_kpi(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership", "manager", "employee")),
):
    role = current_user["role"]
    email = current_user["email"]
    can_view_git_stats = role == "admin"   # single source of truth for this gate

    rows = db.execute(text("""...""")).mappings().all()
    cohort_size = len(rows)

    own_commit_stats: dict[str, dict] = {}
    data_start, data_end = (None, None)
    if can_view_git_stats:
        data_start, data_end = _get_uploaded_data_range(db)
        by_login = _get_commit_and_lint_by_login(db, data_start, data_end)
        linked_logins = _get_linked_github_logins(db)
        for login, person_id in linked_logins.items():
            if login in by_login:
                own_commit_stats[person_id] = by_login[login]

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
            "commit_count": own_commit_stats.get(r["person_id"], {}).get("commit_count") if can_view_git_stats else None,
            "lint_errors": own_commit_stats.get(r["person_id"], {}).get("lint_errors") if can_view_git_stats else None,
            "lint_warnings": own_commit_stats.get(r["person_id"], {}).get("lint_warnings") if can_view_git_stats else None,
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

    if can_view_git_stats:
        result = result + _get_unlinked_contributors(db, data_start, data_end)

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

def _get_linked_github_logins(db: Session) -> dict[str, str]:
    """
    github_login -> person_id, for accounts that were actually connected via
    real OAuth (i.e. rows in github_accounts). This is NOT hardcoded — it's
    only populated when a person genuinely authorizes their GitHub account.
    Used so someone who is both an employee AND the repo contributor gets
    their commits merged into their own row instead of a duplicate one.
    """
    rows = db.execute(text("""
        SELECT github_login, user_id::text AS person_id
        FROM github_accounts
    """)).mappings().all()
    return {r["github_login"]: r["person_id"] for r in rows}


def _get_commit_and_lint_by_login(
    db: Session,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
) -> dict[str, dict]:
    """
    Raw commit/lint counts keyed by github_login (not person_id) — used both
    for merging into linked employee rows and for standalone contributor rows.
    Scoped to [start, end] — the actual date range of the uploaded attendance
    data — so commit counts line up with the attendance window being shown.
    Falls back to a rolling 30-day window if no attendance data has been
    uploaded yet (start/end are None).
    """
    if start is None or end is None:
        # No attendance data uploaded yet — fall back to a sane default
        # so the admin still sees *something* from git_commits directly.
        commit_rows = db.execute(text("""
            SELECT
                gc.author_github_login,
                MIN(gc.author_name) AS author_name,
                MIN(gc.author_email) AS author_email,
                COUNT(DISTINCT gc.sha) AS commit_count
            FROM git_commits gc
            WHERE gc.committed_at >= now() - interval '30 days'
            GROUP BY gc.author_github_login
        """)).mappings().all()
    else:
        commit_rows = db.execute(text("""
            SELECT
                gc.author_github_login,
                MIN(gc.author_name) AS author_name,
                MIN(gc.author_email) AS author_email,
                COUNT(DISTINCT gc.sha) AS commit_count
            FROM git_commits gc
            WHERE gc.committed_at >= :start
              AND gc.committed_at <= :end
            GROUP BY gc.author_github_login
        """), {"start": start, "end": end}).mappings().all()

    try:
        if start is None or end is None:
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
                    WHERE lb.blamed_commit_at >= now() - interval '30 days'
                ) x
                GROUP BY author_github_login
            """)).mappings().all()
        else:
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
                    WHERE lb.blamed_commit_at >= :start
                      AND lb.blamed_commit_at <= :end
                ) x
                GROUP BY author_github_login
            """), {"start": start, "end": end}).mappings().all()
    except Exception:
        logger.warning("v_lint_blame_current unavailable; skipping lint correlation", exc_info=True)
        lint_rows = []

    lint_by_login = {r["author_github_login"]: r for r in lint_rows}

    return {
        r["author_github_login"]: {
            "full_name": r["author_name"] or r["author_github_login"],
            "email": r["author_email"],
            "commit_count": r["commit_count"],
            "lint_errors": lint_by_login.get(r["author_github_login"], {}).get("error_count", 0),
            "lint_warnings": lint_by_login.get(r["author_github_login"], {}).get("warning_count", 0),
        }
        for r in commit_rows
    }


def _get_unlinked_contributors(
    db: Session,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
) -> list[dict]:
    """
    Standalone contributor rows for GitHub logins that are NOT linked to any
    employee via github_accounts. Linked logins (real OAuth accounts) get
    merged into their own employee row instead — see get_attendance_kpi.
    """
    by_login = _get_commit_and_lint_by_login(db, start, end)

    linked_logins = set(_get_linked_github_logins(db).keys())

    return [
        {
            "person_id": f"gh:{login}",
            "full_name": data["full_name"],
            "email": data["email"],
            "user_role": "contributor",
            "days_present": None,
            "total_working_days": None,
            "attendance_pct": None,
            "avg_arrival": None,
            "arrival_consistency": None,
            "avg_session_hours": None,
            "total_session_hours": None,
            "is_own": False,
            "commit_count": data["commit_count"],
            "lint_errors": data["lint_errors"],
            "lint_warnings": data["lint_warnings"],
        }
        for login, data in by_login.items()
        if login not in linked_logins
    ]

# CLEAR DATA
@router.delete("/clear")
async def clear_attendance_data(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership")),
):
    result = db.execute(text("SELECT COUNT(*) FROM fact_access_event"))
    row_count = result.scalar()

    db.execute(text("TRUNCATE TABLE fact_access_event"))
    db.commit()

    db.execute(text("""
        INSERT INTO audit_logs (action, performed_by, target_user, detail, created_at)
        VALUES (:action, :performed_by, NULL, :detail, now())
    """), {
        "action": "attendance_data_cleared",
        "performed_by": current_user["email"],
        "detail": f"rows_cleared={row_count}",
    })
    db.commit()

    return {"rows_cleared": row_count}