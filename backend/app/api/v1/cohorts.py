from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db.database import get_db
from app.services.cohorts_service import train_cohorts
import numpy as np

router = APIRouter()

@router.get("/")
def get_cohorts(db: Session = Depends(get_db)):
    rows = db.execute(text("""
        SELECT
            person_id,
            avg_arrival_minutes / 60.0  AS arrival_time,
            avg_session_hours           AS session_length
        FROM v_attendance_kpi
        WHERE avg_arrival_minutes IS NOT NULL
          AND avg_session_hours   IS NOT NULL
          AND avg_session_hours   > 0
    """)).fetchall()

    if not rows:
        return {"k": 0, "centroids": [], "labels": [], "cluster_sizes": [], "insights": []}

    events = [
        {"arrival_time": float(r.arrival_time), "session_length": float(r.session_length)}
        for r in rows
    ]

    result    = train_cohorts(events)
    centroids = result["centroids"]
    labels    = result["labels"]
    k         = result["k"]

    labels_arr    = np.array(labels)
    cluster_sizes = [int(np.sum(labels_arr == i)) for i in range(k)]
    total         = len(labels)

    insights = []
    arrivals = [c[0] for c in centroids]
    sessions = [c[1] for c in centroids]

    earliest_idx  = int(np.argmin(arrivals))
    latest_idx    = int(np.argmax(arrivals))
    arrival_range = round(max(arrivals) - min(arrivals), 2)

    longest_idx   = int(np.argmax(sessions))
    shortest_idx  = int(np.argmin(sessions))
    session_range = round(max(sessions) - min(sessions), 2)

    mean_arrival  = float(np.mean(arrivals))
    mean_session  = float(np.mean(sessions))

    # 1. Arrival difference — always show
    conf = round(min(0.93, 0.6 + arrival_range * 0.05), 2)
    insights.append({
        "hypothesis": f"Cluster {earliest_idx} arrives ~{arrival_range}h earlier than Cluster {latest_idx} — "
                      f"{'a notable difference suggesting distinct work patterns' if arrival_range > 0.5 else 'a small difference; patterns are broadly similar'}.",
        "confidence": conf,
        "interval": f"{round((conf - 0.1) * 100)}% - {round((conf + 0.1) * 100)}%",
        "sample_size": total,
    })

    # 2. Session length difference — always show
    conf = round(min(0.90, 0.55 + session_range * 0.05), 2)
    insights.append({
        "hypothesis": f"Cluster {longest_idx} logs ~{session_range}h longer sessions than Cluster {shortest_idx} — "
                      f"{'suggesting meaningfully different engagement depths' if session_range > 0.5 else 'a small gap; session lengths are broadly consistent'}.",
        "confidence": conf,
        "interval": f"{round((conf - 0.1) * 100)}% - {round((conf + 0.1) * 100)}%",
        "sample_size": total,
    })

    # 3. Dominant cluster
    dominant_idx = int(np.argmax(cluster_sizes))
    dominant_pct = round(cluster_sizes[dominant_idx] / total * 100)
    if dominant_pct > 40:
        insights.append({
            "hypothesis": f"Cluster {dominant_idx} is the modal pattern, covering {dominant_pct}% of users ({cluster_sizes[dominant_idx]} people).",
            "confidence": round(dominant_pct / 100, 2),
            "interval": f"{dominant_pct - 10}% - {min(dominant_pct + 10, 100)}%",
            "sample_size": cluster_sizes[dominant_idx],
        })

    # 4. Early + long session
    mean_arrival = float(np.mean(arrivals))
    mean_session = float(np.mean(sessions))
    early_long   = [i for i, c in enumerate(centroids)
                    if c[0] < mean_arrival and c[1] > mean_session]
    if early_long:
        idx = early_long[0]
        insights.append({
            "hypothesis": f"Cluster {idx} arrives early and stays longer than average — consistent with focused or deep-work patterns.",
            "confidence": 0.74,
            "interval": "64% - 84%",
            "sample_size": cluster_sizes[idx],
        })

    # 5. Late + short session
    late_short = [i for i, c in enumerate(centroids)
                  if c[0] > mean_arrival and c[1] < mean_session]
    if late_short:
        idx = late_short[0]
        insights.append({
            "hypothesis": f"Cluster {idx} arrives later and has shorter sessions — may reflect flexible or part-time work patterns.",
            "confidence": 0.68,
            "interval": "58% - 78%",
            "sample_size": cluster_sizes[idx],
        })

    # 6. Always: spread summary
    spread = round(float(np.std(arrivals + sessions)), 2)
    insights.append({
        "hypothesis": f"Overall behavioural spread across {k} clusters is {spread} (std dev of centroids) — {'high' if spread > 1 else 'low'} variation in work patterns detected.",
        "confidence": 0.80,
        "interval": "70% - 90%",
        "sample_size": total,
    })

    insights = [i for i in insights if i["sample_size"] >= 1]

    return {
        "k": k,
        "centroids": centroids,
        "labels": labels,
        "cluster_sizes": cluster_sizes,
        "insights": insights,
    }