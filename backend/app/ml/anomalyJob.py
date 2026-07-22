from __future__ import annotations

import logging
from typing import Any

import pandas as pd
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.ml.anomaly_model import BaselineAnomalyScorer, Z_SCORE_THRESHOLD

logger = logging.getLogger("backend")


def _build_features(rows: list) -> pd.DataFrame:
    df = pd.DataFrame([dict(r) for r in rows])
    df["event_ts"] = pd.to_datetime(df["event_ts"], utc=True)
    df = df.sort_values(["person_id", "event_ts"]).reset_index(drop=True)

    # temporal
    df["hour_of_day"] = df["event_ts"].dt.hour
    df["day_of_week"] = df["event_ts"].dt.dayofweek
    df["is_weekend"]  = (df["day_of_week"] >= 5).astype(int)

    # categorical encodings
    df["direction_enc"]     = df["direction"].map({"entry": 0, "exit": 1}).fillna(2)
    df["access_result_enc"] = df["access_result"].map({"granted": 0, "denied": 1}).fillna(2)

    # gap since last event per person (minutes, capped at 24h)
    df["gap_since_last_event_min"] = (
        df.groupby("person_id")["event_ts"]
          .diff()
          .dt.total_seconds()
          .div(60)
          .fillna(0)
          .clip(upper=1440)
    )

    # running entry/exit balance per person
    df["entry_exit_balance"] = (
        df.groupby("person_id")["direction_enc"]
          .transform(lambda s: (s == 0).cumsum() - (s == 1).cumsum())
    )

    return df


def _make_reason(row: pd.Series) -> str:
    """
    Built directly from the same values the scorer used to decide,
    so what a reviewer reads matches what actually triggered the flag.
    """
    parts = []

    if row["denied_flag"]:
        parts.append("denied access")

    if not row["has_personal_baseline"]:
        parts.append("limited history for this person — compared to org-wide baseline")

    for z_col, label in [
        ("hour_of_day_z", "badge time"),
        ("gap_since_last_event_min_z", "gap since previous swipe"),
        ("entry_exit_balance_z", "entry/exit balance"),
    ]:
        z = row[z_col]
        if z >= Z_SCORE_THRESHOLD:
            parts.append(f"{label} {z:.1f}x deviation from baseline")

    if not parts:
        parts.append("statistical deviation from personal baseline")

    return ", ".join(parts)


def run_anomaly_detection(db: Session) -> dict[str, Any]:
    rows = db.execute(text("""
        SELECT id, person_id, event_ts, direction, access_result
        FROM fact_access_event
        ORDER BY event_ts DESC
        LIMIT 1000
    """)).mappings().all()

    if not rows:
        return {"flagged": 0, "error": None}

    df = _build_features(rows)

    scorer = BaselineAnomalyScorer()
    df = scorer.score(df)

    anomalies = df[df["is_anomaly"]]

    flagged = 0
    for _, row in anomalies.iterrows():
        db.execute(text("""
            INSERT INTO access_review_queue
                (event_id, person_id, score, reason, status)
            VALUES
                (CAST(:event_id AS uuid), :person_id, :score, :reason, 'pending')
            ON CONFLICT (event_id, person_id, status)
            DO UPDATE SET
                score  = EXCLUDED.score,
                reason = EXCLUDED.reason
        """), {
            "event_id":  str(row["id"]),
            "person_id": str(row["person_id"]),
            "score":     round(float(row["normalised_score"]), 4),
            "reason":    _make_reason(row),
        })
        flagged += 1

    db.commit()
    logger.info("Anomaly detection — flagged %d events", flagged)
    return {"flagged": flagged, "error": None}