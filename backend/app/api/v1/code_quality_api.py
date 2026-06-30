"""
SENTRY-33  Code Quality KPI API
E1  /complexity        per-repo complexity summary (latest scan)
E2  /churn             per-repo churn summary (latest scan)
E3  /lint              lint density summary + paginated findings list
E4  /secrets           open secret-scan alert feed
E5  /trend             complexity trend over time, per repo
"""
from __future__ import annotations
print("LOADED CODE_QUALITY_API")

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.v1.github import get_github_token
from app.core.dependencies import require_role
from app.db.database import get_db
from app.models.user import User
from app.services.code_quality_service import run_code_quality_scan

router = APIRouter()


# ── serializer ───────────────────────────────────────────────────────────────

def _serialize(row: dict) -> dict:
    out = {}
    for k, v in row.items():
        if isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, UUID):
            out[k] = str(v)
        else:
            out[k] = v
    return out


def _resolve_github_token(db: Session, email: str) -> str:
    """current_user (from require_role) only carries the JWT payload —
    email/role — not a user_id, and get_github_token() needs a user_id.
    Resolve the app User row from the email first, same as github.py does."""
    app_user = db.query(User).filter(User.email == email).first()
    if not app_user:
        raise HTTPException(status_code=404, detail="User not found")
    return get_github_token(app_user.id)


# ── E1: COMPLEXITY ────────────────────────────────────────────────────────────

@router.get("/complexity")
def get_complexity_summary(
    owner: Optional[str] = Query(default=None),
    repo: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership", "manager")),
):
    query = "SELECT * FROM v_cq_complexity_summary"
    params = {}
    conditions = []

    if owner:
        conditions.append("owner = :owner")
        params["owner"] = owner
    if repo:
        conditions.append("repo = :repo")
        params["repo"] = repo

    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY avg_complexity DESC NULLS LAST"

    rows = db.execute(text(query), params).mappings().all()
    return {"data": [_serialize(dict(r)) for r in rows]}


# ── E2: CHURN ──────────────────────────────────────────────────────────────────

@router.get("/churn")
def get_churn_summary(
    owner: Optional[str] = Query(default=None),
    repo: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership", "manager")),
):
    query = "SELECT * FROM v_cq_churn_summary"
    params = {}
    conditions = []

    if owner:
        conditions.append("owner = :owner")
        params["owner"] = owner
    if repo:
        conditions.append("repo = :repo")
        params["repo"] = repo

    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY total_commits DESC NULLS LAST"

    rows = db.execute(text(query), params).mappings().all()
    return {"data": [_serialize(dict(r)) for r in rows]}


# ── E3: LINT ───────────────────────────────────────────────────────────────────

@router.get("/lint")
def get_lint_summary(
    owner: Optional[str] = Query(default=None),
    repo: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership", "manager")),
):
    """Density summary per repo. Uses a LEFT JOIN against the latest scan so
    repos with zero lint findings still appear (with zero counts) instead of
    being dropped, which the underlying view's INNER JOIN would otherwise do."""
    query = """
        SELECT
            ls.owner,
            ls.repo,
            ls.scan_id,
            ls.finished_at,
            COUNT(lf.id) AS total_findings,
            COUNT(lf.id) FILTER (WHERE lf.severity = 'error')   AS error_count,
            COUNT(lf.id) FILTER (WHERE lf.severity = 'warning') AS warning_count,
            ROUND(
                COUNT(lf.id)::numeric / NULLIF(
                    (SELECT SUM(fm.nloc) FROM code_quality_file_metric fm
                     WHERE fm.scan_id = ls.scan_id), 0
                ) * 1000, 2
            ) AS findings_per_kloc
        FROM v_cq_latest_scan ls
        LEFT JOIN code_quality_lint_finding lf ON lf.scan_id = ls.scan_id
        WHERE 1=1
    """
    params = {}
    if owner:
        query += " AND ls.owner = :owner"
        params["owner"] = owner
    if repo:
        query += " AND ls.repo = :repo"
        params["repo"] = repo

    query += """
        GROUP BY ls.owner, ls.repo, ls.scan_id, ls.finished_at
        ORDER BY total_findings DESC NULLS LAST
    """

    rows = db.execute(text(query), params).mappings().all()
    return {"data": [_serialize(dict(r)) for r in rows]}


@router.get("/lint/findings")
def get_lint_findings(
    owner: str = Query(...),
    repo: str = Query(...),
    severity: Optional[str] = Query(default=None),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership", "manager")),
):
    """Paginated raw findings for the latest scan of a single repo."""
    query = """
        SELECT
            lf.id, lf.file_path, lf.line_number, lf.column_number,
            lf.tool, lf.rule_id, lf.severity, lf.message
        FROM v_cq_latest_scan ls
        JOIN code_quality_lint_finding lf ON lf.scan_id = ls.scan_id
        WHERE ls.owner = :owner AND ls.repo = :repo
    """
    params = {"owner": owner, "repo": repo, "limit": limit, "offset": offset}

    if severity:
        query += " AND lf.severity = :severity"
        params["severity"] = severity

    query += " ORDER BY lf.severity, lf.file_path LIMIT :limit OFFSET :offset"

    rows = db.execute(text(query), params).mappings().all()
    return {"data": [_serialize(dict(r)) for r in rows], "limit": limit, "offset": offset}


# ── E4: SECRETS / VULN ALERTS ───────────────────────────────────────────────────

@router.get("/secrets")
def get_secret_alerts(
    owner: Optional[str] = Query(default=None),
    repo: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    tool: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership", "manager")),
):
    """Open secret/vuln alert feed, severity-sorted. Covers gitleaks (secrets)
    and semgrep (vulns) — distinguished by the `tool` field."""
    query = "SELECT * FROM v_cq_secret_alerts_open WHERE 1=1"
    params = {}

    if owner:
        query += " AND owner = :owner"
        params["owner"] = owner
    if repo:
        query += " AND repo = :repo"
        params["repo"] = repo
    if severity:
        query += " AND severity = :severity"
        params["severity"] = severity
    if tool:
        query += " AND tool = :tool"
        params["tool"] = tool

    rows = db.execute(text(query), params).mappings().all()
    return {"data": [_serialize(dict(r)) for r in rows], "count": len(rows)}


@router.patch("/secrets/{alert_id}/acknowledge")
def acknowledge_secret_alert(
    alert_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership")),
):
    db.execute(text("""
        UPDATE code_quality_secret_alert
        SET status = 'acknowledged',
            acknowledged_by = :user,
            acknowledged_at = now()
        WHERE id = CAST(:id AS uuid)
    """), {"id": alert_id, "user": current_user["email"]})
    db.commit()
    return {"status": "acknowledged"}


@router.patch("/secrets/{alert_id}/resolve")
def resolve_secret_alert(
    alert_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership")),
):
    db.execute(text("""
        UPDATE code_quality_secret_alert
        SET status = 'resolved',
            acknowledged_by = :user,
            acknowledged_at = now()
        WHERE id = CAST(:id AS uuid)
    """), {"id": alert_id, "user": current_user["email"]})
    db.commit()
    return {"status": "resolved"}


@router.patch("/secrets/{alert_id}/dismiss")
def dismiss_secret_alert(
    alert_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership")),
):
    db.execute(text("""
        UPDATE code_quality_secret_alert
        SET status = 'false_positive',
            acknowledged_by = :user,
            acknowledged_at = now()
        WHERE id = CAST(:id AS uuid)
    """), {"id": alert_id, "user": current_user["email"]})
    db.commit()
    return {"status": "false_positive"}


# ── E5: TREND ────────────────────────────────────────────────────────────────

@router.get("/trend")
def get_complexity_trend(
    owner: str = Query(...),
    repo: str = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership", "manager")),
):
    rows = db.execute(text("""
        SELECT scan_date, avg_complexity, high_complexity_files
        FROM v_cq_complexity_trend
        WHERE owner = :owner AND repo = :repo
        ORDER BY scan_date
    """), {"owner": owner, "repo": repo}).mappings().all()

    return {"data": [_serialize(dict(r)) for r in rows]}


# ── Drill-down: per-file metrics for latest scan ─────────────────────────────

@router.get("/files/{owner}/{repo}")
def get_file_metrics(
    owner: str,
    repo: str,
    sort_by: str = Query(default="cyclomatic_complexity"),
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership", "manager")),
):
    allowed_sorts = {
        "cyclomatic_complexity", "commit_count", "lines_added",
        "lines_removed", "nloc", "function_count",
    }
    sort_col = sort_by if sort_by in allowed_sorts else "cyclomatic_complexity"

    rows = db.execute(text(f"""
        SELECT fm.*
        FROM v_cq_latest_scan ls
        JOIN code_quality_file_metric fm ON fm.scan_id = ls.scan_id
        WHERE ls.owner = :owner AND ls.repo = :repo
        ORDER BY fm.{sort_col} DESC NULLS LAST
        LIMIT :limit
    """), {"owner": owner, "repo": repo, "limit": limit}).mappings().all()

    return {"data": [_serialize(dict(r)) for r in rows]}


# ── Scan history ──────────────────────────────────────────────────────────────

@router.get("/scans/{owner}/{repo}")
def get_scan_history(
    owner: str,
    repo: str,
    limit: int = Query(default=20, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership", "manager")),
):
    rows = db.execute(text("""
        SELECT id, owner, repo, commit_sha, started_at, finished_at, status, error
        FROM code_quality_scan
        WHERE owner = :owner AND repo = :repo
        ORDER BY started_at DESC
        LIMIT :limit
    """), {"owner": owner, "repo": repo, "limit": limit}).mappings().all()

    return {"data": [_serialize(dict(r)) for r in rows]}


@router.post("/scan/{owner}/{repo}")
def trigger_code_quality_scan(
    owner: str,
    repo: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership")),
):
    """Runs the scan and returns its summary (scan_id, status, counts — see
    run_code_quality_scan). This does NOT return the dashboard data itself —
    the scan only writes results to the DB. Callers should follow up with
    GET /complexity, /churn, /lint, /secrets, /trend (each scoped with
    ?owner=&repo=) to read the actual results back out."""
    token = _resolve_github_token(db, current_user["email"])
    return run_code_quality_scan(db, owner, repo, token)