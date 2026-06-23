from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.dependencies import require_role
from app.db.database import get_db
from app.api.v1.github import get_github_token
from app.models.user import User
from app.services.code_quality_service import run_code_quality_scan

router = APIRouter()


def _resolve_github_token(db: Session, email: str) -> str:
    app_user = db.query(User).filter(User.email == email).first()
    if not app_user:
        raise HTTPException(status_code=404, detail="User not found")
    return get_github_token(app_user.id)


# ── TRIGGER SCAN ──────────────────────────────────────────────────────────────

@router.post("/scan/{owner}/{repo}")
def trigger_code_quality_scan(
    owner: str,
    repo: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership")),
):
    """Runs the scan pipeline and returns a summary (scan_id, status, counts).
    Results are written to the DB — callers must follow up with the GET
    endpoints below to read the actual dashboard data back out."""
    token = _resolve_github_token(db, current_user["email"])
    return run_code_quality_scan(db, owner, repo, token)


# ── READ APIs ─────────────────────────────────────────────────────────────────
# All of these query Postgres views directly with raw SQL — no SQLAlchemy ORM
# model classes are needed or defined for views, just db.execute(text(...)).

@router.get("/complexity")
def get_complexity(
    owner: str = Query(...),
    repo: str = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership")),
):
    rows = db.execute(
        text("SELECT * FROM v_cq_complexity_summary WHERE owner = :owner AND repo = :repo"),
        {"owner": owner, "repo": repo},
    ).mappings().all()
    return {"data": [dict(r) for r in rows]}


@router.get("/churn")
def get_churn(
    owner: str = Query(...),
    repo: str = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership")),
):
    rows = db.execute(
        text("SELECT * FROM v_cq_churn_summary WHERE owner = :owner AND repo = :repo"),
        {"owner": owner, "repo": repo},
    ).mappings().all()
    return {"data": [dict(r) for r in rows]}


@router.get("/lint")
def get_lint(
    owner: str = Query(...),
    repo: str = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership")),
):
    # Custom query that LEFT JOINs so repos with zero findings still appear
    rows = db.execute(text("""
        SELECT
            ls.owner,
            ls.repo,
            ls.scan_id,
            ls.finished_at,
            COUNT(lf.id)                                                    AS total_findings,
            COUNT(lf.id) FILTER (WHERE lf.severity = 'error')              AS error_count,
            COUNT(lf.id) FILTER (WHERE lf.severity = 'warning')            AS warning_count,
            ROUND(
                COUNT(lf.id)::numeric / NULLIF(
                    (SELECT SUM(fm.nloc) FROM code_quality_file_metric fm
                     WHERE fm.scan_id = ls.scan_id), 0
                ) * 1000, 2
            ) AS findings_per_kloc
        FROM v_cq_latest_scan ls
        LEFT JOIN code_quality_lint_finding lf ON lf.scan_id = ls.scan_id
        WHERE ls.owner = :owner AND ls.repo = :repo
        GROUP BY ls.owner, ls.repo, ls.scan_id, ls.finished_at
        ORDER BY total_findings DESC NULLS LAST
    """), {"owner": owner, "repo": repo}).mappings().all()
    return {"data": [dict(r) for r in rows]}


@router.get("/secrets")
def get_secrets(
    owner: str = Query(...),
    repo: str = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership")),
):
    rows = db.execute(
        text("SELECT * FROM v_cq_secret_alerts_open WHERE owner = :owner AND repo = :repo"),
        {"owner": owner, "repo": repo},
    ).mappings().all()
    return {"data": [dict(r) for r in rows], "count": len(rows)}


@router.get("/trend")
def get_trend(
    owner: str = Query(...),
    repo: str = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership")),
):
    rows = db.execute(
        text("""
            SELECT scan_date, avg_complexity, high_complexity_files
            FROM v_cq_complexity_trend
            WHERE owner = :owner AND repo = :repo
            ORDER BY scan_date
        """),
        {"owner": owner, "repo": repo},
    ).mappings().all()
    return {"data": [dict(r) for r in rows]}