from __future__ import annotations

import logging
from typing import Any

import pandas as pd
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.ml.anomaly_model import AnomalyModel

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

    # normalised swipe frequency
    df["swipe_freq"] = (
        df.groupby("person_id")["id"].transform("count") / len(df)
    )

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
    parts = []
    if row["access_result_enc"] == 1:
        parts.append("denied access")
    if row["hour_of_day"] < 6 or row["hour_of_day"] >= 22:
        parts.append(f"unusual hour ({int(row['hour_of_day'])}:00)")
    if row["is_weekend"]:
        parts.append("weekend access")
    if 0 < row["gap_since_last_event_min"] < 2:
        parts.append(f"rapid re-entry ({row['gap_since_last_event_min']:.1f} min gap)")
    if abs(row["entry_exit_balance"]) >= 3:
        parts.append(f"entry/exit imbalance ({int(row['entry_exit_balance'])})")
    return ", ".join(parts) if parts else "statistical anomaly"


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

    model = AnomalyModel()
    model.train(df)
    df = model.score(df)

    # normalise score to [0,1] where 1 = most anomalous
    mn, mx = df["anomaly_score"].min(), df["anomaly_score"].max()
    df["normalised_score"] = 1 - (df["anomaly_score"] - mn) / (mx - mn + 1e-9)

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