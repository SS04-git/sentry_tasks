"""
SENTRY-36  DORA Delivery Metrics API 
---------------------------------------------------
F1  /deployment-frequency    Deployments per week (merged-PR proxy)
F2  /lead-time               PR open → merge time series
F3  /change-failure-rate     Fix-PR ratio per week
F4  /time-to-restore         Fix-PR duration per week
F5  /review-latency          PR open → first review → merge per week
F7  /szz-blame               Fix commits traced to bug-introducing commits
    /kpi-summary             Headline KPIs for the four stat cards
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.dependencies import require_role
from app.db.database import get_db

router = APIRouter()


# ── serializer ────────────────────────────────────────────────────────────────

def _s(row: dict) -> dict:
    out = {}
    for k, v in row.items():
        if isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, UUID):
            out[k] = str(v)
        else:
            out[k] = v
    return out


# ── F1: Deployment Frequency ──────────────────────────────────────────────────

@router.get("/deployment-frequency")
def deployment_frequency(
    owner: str = Query(...),
    repo: str = Query(...),
    weeks: int = Query(default=12, ge=1, le=52),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership", "manager")),
):
    """Weekly deployment counts (merged PRs) for the last `weeks` weeks."""
    rows = db.execute(text("""
        SELECT week, deployments
        FROM v_dora_deployment_freq
        WHERE owner = :owner AND repo = :repo
          AND week >= (CURRENT_DATE - (:weeks * 7)::int)
        ORDER BY week
    """), {"owner": owner, "repo": repo, "weeks": weeks}).mappings().all()
    return {"data": [_s(dict(r)) for r in rows]}


# ── F2: Lead Time for Change ──────────────────────────────────────────────────

@router.get("/lead-time")
def lead_time(
    owner: str = Query(...),
    repo: str = Query(...),
    weeks: int = Query(default=12, ge=1, le=52),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership", "manager")),
):
    """Average and median PR lead time (hours) per week."""
    rows = db.execute(text("""
        SELECT week, avg_lead_time_hours, median_lead_time_hours, pr_count
        FROM v_dora_lead_time
        WHERE owner = :owner AND repo = :repo
          AND week >= (CURRENT_DATE - (:weeks * 7)::int)
        ORDER BY week
    """), {"owner": owner, "repo": repo, "weeks": weeks}).mappings().all()
    return {"data": [_s(dict(r)) for r in rows]}


# ── F3: Change Failure Rate ───────────────────────────────────────────────────

@router.get("/change-failure-rate")
def change_failure_rate(
    owner: str = Query(...),
    repo: str = Query(...),
    weeks: int = Query(default=12, ge=1, le=52),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership", "manager")),
):
    """Fix-PR ratio as a percentage of total deployments per week."""
    rows = db.execute(text("""
        SELECT week, total_deployments, failed_deployments, failure_rate_pct
        FROM v_dora_change_failure_rate
        WHERE owner = :owner AND repo = :repo
          AND week >= (CURRENT_DATE - (:weeks * 7)::int)
        ORDER BY week
    """), {"owner": owner, "repo": repo, "weeks": weeks}).mappings().all()
    return {"data": [_s(dict(r)) for r in rows]}


# ── F4: Time to Restore ───────────────────────────────────────────────────────

@router.get("/time-to-restore")
def time_to_restore(
    owner: str = Query(...),
    repo: str = Query(...),
    weeks: int = Query(default=12, ge=1, le=52),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership", "manager")),
):
    """Average and median duration of fix PRs (hours) per week."""
    rows = db.execute(text("""
        SELECT week, avg_restore_hours, median_restore_hours, fix_pr_count
        FROM v_dora_time_to_restore
        WHERE owner = :owner AND repo = :repo
          AND week >= (CURRENT_DATE - (:weeks * 7)::int)
        ORDER BY week
    """), {"owner": owner, "repo": repo, "weeks": weeks}).mappings().all()
    return {"data": [_s(dict(r)) for r in rows]}


# ── F5: PR Review Latency ─────────────────────────────────────────────────────

@router.get("/review-latency")
def review_latency(
    owner: str = Query(...),
    repo: str = Query(...),
    weeks: int = Query(default=12, ge=1, le=52),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership", "manager")),
):
    """Time to first review, review to merge, and total cycle time per week."""
    rows = db.execute(text("""
        SELECT
            week,
            avg_time_to_first_review_hours,
            avg_review_to_merge_hours,
            avg_total_cycle_hours,
            pr_count
        FROM v_dora_review_latency
        WHERE owner = :owner AND repo = :repo
          AND week >= (CURRENT_DATE - (:weeks * 7)::int)
        ORDER BY week
    """), {"owner": owner, "repo": repo, "weeks": weeks}).mappings().all()
    return {"data": [_s(dict(r)) for r in rows]}


# ── F7: SZZ Blame ─────────────────────────────────────────────────────────────

@router.get("/szz-blame")
def szz_blame(
    owner: str = Query(...),
    repo: str = Query(...),
    fix_sha: str = Query(default=None, description="Filter to a specific fix commit SHA"),
    limit: int = Query(default=50, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership", "manager")),
):
    """
    SZZ tracing: links each fix commit back to the most recent non-fix
    commit that last touched the same file — the likely bug-introducing commit.
    """
    query = """
        SELECT
            fix_sha, fix_short_sha, fix_message, fix_committed_at, fix_author,
            affected_file,
            bug_sha, bug_short_sha, bug_message, bug_committed_at, bug_author,
            hours_from_bug_to_fix
        FROM v_dora_szz_blame
        WHERE owner = :owner AND repo = :repo
    """
    params: dict = {"owner": owner, "repo": repo, "limit": limit}

    if fix_sha:
        query += " AND fix_sha = :fix_sha"
        params["fix_sha"] = fix_sha

    query += " ORDER BY fix_committed_at DESC, affected_file LIMIT :limit"

    rows = db.execute(text(query), params).mappings().all()
    return {"data": [_s(dict(r)) for r in rows], "count": len(rows)}


# ── KPI Summary ───────────────────────────────────────────────────────────────

@router.get("/kpi-summary")
def kpi_summary(
    owner: str = Query(...),
    repo: str = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership", "manager")),
):
    """
    Headline KPIs for the four DORA stat cards, covering the last 30 days.
    Also returns a DORA performance classification (elite / high / medium / low)
    for each metric.
    """
    rows = db.execute(text("""
        SELECT
            deployments_per_week,
            avg_lead_time_hours,
            change_failure_rate_pct,
            avg_restore_hours
        FROM v_dora_kpi_summary
        WHERE owner = :owner AND repo = :repo
    """), {"owner": owner, "repo": repo}).mappings().all()

    if not rows:
        return {
            "deployments_per_week": None,
            "avg_lead_time_hours": None,
            "change_failure_rate_pct": None,
            "avg_restore_hours": None,
            "classifications": {},
        }

    row = dict(rows[0])

    def classify_deploy_freq(dpw):
        if dpw is None:
            return "unknown"
        dpw = float(dpw)
        if dpw >= 7:    return "elite"
        if dpw >= 1:    return "high"
        if dpw >= 0.25: return "medium"
        return "low"

    def classify_lead_time(hours):
        if hours is None:
            return "unknown"
        hours = float(hours)
        if hours < 1:    return "elite"
        if hours < 24:   return "high"
        if hours < 168:  return "medium"
        return "low"

    def classify_cfr(pct):
        if pct is None:
            return "unknown"
        pct = float(pct)
        if pct < 5:  return "elite"
        if pct < 10: return "high"
        if pct < 15: return "medium"
        return "low"

    def classify_restore(hours):
        if hours is None:
            return "unknown"
        hours = float(hours)
        if hours < 1:   return "elite"
        if hours < 24:  return "high"
        if hours < 168: return "medium"
        return "low"

    return {
        "deployments_per_week":     row.get("deployments_per_week"),
        "avg_lead_time_hours":      row.get("avg_lead_time_hours"),
        "change_failure_rate_pct":  row.get("change_failure_rate_pct"),
        "avg_restore_hours":        row.get("avg_restore_hours"),
        "classifications": {
            "deployment_frequency": classify_deploy_freq(row.get("deployments_per_week")),
            "lead_time":            classify_lead_time(row.get("avg_lead_time_hours")),
            "change_failure_rate":  classify_cfr(row.get("change_failure_rate_pct")),
            "time_to_restore":      classify_restore(row.get("avg_restore_hours")),
        },
    }