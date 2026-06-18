from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from datetime import datetime
from uuid import UUID
from app.core.dependencies import require_role
from app.db.database import get_db
from app.ml.anomalyJob import run_anomaly_detection

router = APIRouter()


# ── Serializer ────────────────────────────────────────────────
def serialize(row: dict) -> dict:
    out = {}
    for k, v in row.items():
        if isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, UUID):
            out[k] = str(v)
        else:
            out[k] = v
    return out


# ─────────────────────────────────────────────
# METRICS
# ─────────────────────────────────────────────
@router.get("/metrics")
def get_security_metrics(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership", "manager")),
):
    denied = db.execute(text("""
        SELECT person_id, denied_count, total_events, denied_rate_pct
        FROM v_denied_access
        ORDER BY denied_count DESC
    """)).mappings().all()

    imbalance = db.execute(text("""
        SELECT person_id, SUM(entry_count) AS entry_count,
               SUM(exit_count) AS exit_count,
               SUM(imbalance_score) AS imbalance_score
        FROM v_entry_exit_imbalance
        GROUP BY person_id
        ORDER BY ABS(SUM(imbalance_score)) DESC
    """)).mappings().all()

    return {
        "denied_access": [serialize(dict(r)) for r in denied],
        "entry_exit_imbalance": [serialize(dict(r)) for r in imbalance],
    }


# ─────────────────────────────────────────────
# REVIEW QUEUE
# ─────────────────────────────────────────────
@router.get("/queue")
def get_queue(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership", "manager")),
):
    rows = db.execute(text("""
        SELECT id, event_id, person_id, full_name, score, reason, status,
           created_at, event_ts, direction, access_result, access_method
        FROM v_review_queue
        ORDER BY score DESC
    """)).mappings().all()

    return {"data": [serialize(dict(r)) for r in rows]}


# ─────────────────────────────────────────────
# CONFIRM
# ─────────────────────────────────────────────
@router.post("/queue/{queue_id}/confirm")
def confirm(
    queue_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership", "manager")),
):
    db.execute(text("""
        UPDATE access_review_queue
        SET status='confirmed',
            reviewed_at=now(),
            reviewed_by=:user
        WHERE id=:id
    """), {"id": queue_id, "user": current_user["email"]})

    db.commit()
    return {"status": "confirmed"}


# ─────────────────────────────────────────────
# DISMISS
# ─────────────────────────────────────────────
@router.post("/queue/{queue_id}/dismiss")
def dismiss(
    queue_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "leadership", "manager")),
):
    db.execute(text("""
        UPDATE access_review_queue
        SET status='dismissed',
            reviewed_at=now(),
            reviewed_by=:user
        WHERE id=:id
    """), {"id": queue_id, "user": current_user["email"]})

    db.commit()
    return {"status": "dismissed"}

@router.post("/run-anomaly-scan")
def trigger_scan(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    result = run_anomaly_detection(db)
    return result