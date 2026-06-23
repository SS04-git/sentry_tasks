"""
Consolidated module for SENTRY-50 / 51 / 52.

Covers:
  - Observability  : structured logging + alerting (SENTRY-52)
  - Governance     : train/test split, drift monitoring, retraining
                     trigger, sample auditing, report builder (SENTRY-50)
  - Pipeline       : ingest → clean → ML → refresh, with validation (SENTRY-51)
  - Scheduler      : APScheduler wiring for daily pipeline run (SENTRY-51)

SENTRY-49 (role-gate / suppression middleware) and
SENTRY-53 (HTTPS / rate-limit / secrets) and
SENTRY-54 (governance policy) live in their own layers
(middleware and policy modules) and are intentionally kept separate.
"""

from __future__ import annotations

import logging
from datetime import datetime

import numpy as np
from apscheduler.schedulers.background import BackgroundScheduler
from sklearn.metrics import precision_score, recall_score, roc_auc_score

# ---------------------------------------------------------------------------
# Logging setup  (SENTRY-52)
# ---------------------------------------------------------------------------
# One named logger for the entire ops surface.
# Wire this to your log aggregator (Sentry, Datadog, CloudWatch …) by
# adding the appropriate handler in your app factory — never here.

logger = logging.getLogger("platform_ops")


# ===========================================================================
# OBSERVABILITY  (SENTRY-52)
# ===========================================================================

def log_pipeline_step(
    step: str,
    rows_processed: int,
    validation_failures: int = 0,
) -> None:
    """Emit a structured INFO record for a completed pipeline step."""
    logger.info(
        "%s | rows=%d | validation_failures=%d",
        step,
        rows_processed,
        validation_failures,
    )


def log_failure(step: str, error: str) -> None:
    """Emit a structured ERROR record when a step raises."""
    logger.error("%s failed: %s", step, error)


def alert_failure(step: str, reason: str) -> None:
    """
    Emit a CRITICAL record that downstream handlers can route to PagerDuty /
    Slack / email.  Never log credentials or tokens here (SENTRY-53).
    """
    logger.critical("ALERT | %s | %s", step, reason)


# ===========================================================================
# GOVERNANCE — data validation  (SENTRY-52)
# ===========================================================================

def validate_rows(rows: list[dict]) -> list[dict]:
    """
    Return every row that fails the minimum-field contract.

    Required fields: ``arrival_time``, ``session_length``.
    A ``None`` row (sentinel) is also collected so callers never have to
    guard against it themselves.
    """
    failures: list[dict] = []
    for row in rows:
        if row is None:
            failures.append(row)
            continue
        if row.get("arrival_time") is None:
            failures.append(row)
        elif row.get("session_length") is None:
            failures.append(row)
    return failures


# ===========================================================================
# GOVERNANCE — ML framework  (SENTRY-50)
# ===========================================================================

# ---------------------------------------------------------------------------
# Chronological train / test split
# ---------------------------------------------------------------------------

def chronological_split(
    events: list[dict],
    train_ratio: float = 0.8,
) -> tuple[list[dict], list[dict]]:
    """
    Sort *events* by ``timestamp`` and split at *train_ratio*.

    Each event must contain at minimum::

        {"timestamp": "<ISO-8601 string>", "label": 0 | 1, ...}

    Returns ``(train, test)``.
    """
    events = sorted(events, key=lambda x: x["timestamp"])
    split_idx = int(len(events) * train_ratio)
    return events[:split_idx], events[split_idx:]


# ---------------------------------------------------------------------------
# Evaluation metrics
# ---------------------------------------------------------------------------

def evaluate_model(
    y_true,
    y_pred,
    y_scores=None,
) -> dict:
    """
    Return precision, recall, and (optionally) ROC-AUC.

    *y_scores* should be the positive-class probability column.
    ROC-AUC is silently omitted when the label set is degenerate.
    """
    result = {
        "precision": precision_score(y_true, y_pred, zero_division=0),
        "recall": recall_score(y_true, y_pred, zero_division=0),
    }
    if y_scores is not None:
        try:
            result["roc_auc"] = roc_auc_score(y_true, y_scores)
        except Exception:
            result["roc_auc"] = None
    return result


# ---------------------------------------------------------------------------
# Feature-drift monitoring
# ---------------------------------------------------------------------------

def calculate_feature_drift(
    baseline_values,
    current_values,
) -> float:
    """
    Return the number of baseline standard deviations by which the current
    mean has shifted (a simple population z-score drift metric).

    Returns ``1.0`` (drift present) when the baseline has zero variance and
    the current mean differs; ``0.0`` when they are equal.
    """
    baseline_mean = np.mean(baseline_values)
    current_mean = np.mean(current_values)
    baseline_std = np.std(baseline_values)

    if baseline_std == 0:
        return float(current_mean != baseline_mean)

    return round(float(abs(current_mean - baseline_mean) / baseline_std), 3)


def detect_drift(
    baseline_values,
    current_values,
    threshold: float = 2.0,
) -> dict:
    """Wrap :func:`calculate_feature_drift` with a boolean gate."""
    score = calculate_feature_drift(baseline_values, current_values)
    return {
        "drift_score": score,
        "drift_detected": score > threshold,
    }


# ---------------------------------------------------------------------------
# Retraining trigger
# ---------------------------------------------------------------------------

def should_retrain(
    metrics: dict,
    drift_detected: bool,
    precision_threshold: float = 0.70,
    recall_threshold: float = 0.70,
) -> bool:
    """
    Return ``True`` when any governance gate fails:

    * Feature drift detected above threshold, **or**
    * Precision below *precision_threshold*, **or**
    * Recall below *recall_threshold*.
    """
    if drift_detected:
        return True
    if metrics["precision"] < precision_threshold:
        return True
    if metrics["recall"] < recall_threshold:
        return True
    return False


# ---------------------------------------------------------------------------
# Sample auditing
# ---------------------------------------------------------------------------

def audit_predictions(
    records: list,
    sample_size: int = 20,
) -> list:
    """
    Return a random sample of *records* for human review.

    Returns the full list unchanged when it is smaller than *sample_size*.
    """
    if len(records) <= sample_size:
        return records
    idx = np.random.choice(len(records), sample_size, replace=False)
    return [records[i] for i in idx]


# ---------------------------------------------------------------------------
# Governance report
# ---------------------------------------------------------------------------

def build_governance_report(
    metrics: dict,
    drift_result: dict,
    split_info: dict | None = None,
) -> dict:
    """
    Assemble the per-run governance snapshot that is stored / surfaced in the
    admin dashboard.

    ``split_info`` is optional; pass ``{"train_size": N, "test_size": M}``
    when the split sizes are known.
    """
    return {
        "generated_at": datetime.utcnow().isoformat(),
        "precision": metrics.get("precision"),
        "recall": metrics.get("recall"),
        "roc_auc": metrics.get("roc_auc"),
        "drift_score": drift_result["drift_score"],
        "drift_detected": drift_result["drift_detected"],
        "retrain_required": should_retrain(
            metrics,
            drift_result["drift_detected"],
        ),
        "train_size": split_info["train_size"] if split_info else None,
        "test_size": split_info["test_size"] if split_info else None,
    }


# ===========================================================================
# PIPELINE ORCHESTRATION  (SENTRY-51)
# ===========================================================================

def _ingest() -> list[dict]:
    """
    Pull the latest incremental batch from the source layer.

    Replace this stub with your real loader (database cursor, S3 manifest,
    Kafka consumer …).  Every load must be incremental and idempotent.
    """
    return [
        {"arrival_time": 1, "session_length": 30},
        {"arrival_time": 2, "session_length": 25},
        {"arrival_time": 3, "session_length": 15},
    ]


def _clean(data: list[dict]) -> list[dict]:
    """
    Apply field normalisation and type coercion.

    Extend with your domain-specific cleaning rules.
    """
    return data


def _train(data: list[dict]) -> None:
    """
    Delegate to the cohort-training layer.

    Import kept local to avoid a circular dependency at module load time.
    """
    from app.services.cohorts_service import train_cohorts  # noqa: PLC0415
    train_cohorts(data)


def _refresh_views(data: list[dict]) -> None:
    """Materialise downstream read models / aggregation views."""
    # Replace with your actual view-refresh logic.
    pass


def run_pipeline() -> dict:
    """
    Execute the full ingest → clean → ML → refresh sequence.

    Each step is logged (SENTRY-52).  A validation failure raises an alert
    and short-circuits the run rather than loading bad data (SENTRY-52).

    Returns a result dict with ``steps`` and timestamps on success, or
    ``{"status": "failed", ...}`` on error.
    """
    result: dict = {
        "started_at": datetime.utcnow().isoformat(),
        "steps": [],
    }

    try:
        # ------------------------------------------------------------------ #
        # INGEST
        # ------------------------------------------------------------------ #
        data = _ingest()
        failures = validate_rows(data)

        if failures:
            alert_failure("ingest", f"{len(failures)} validation failure(s)")
            return {"status": "failed", "reason": "validation_failed"}

        log_pipeline_step("ingest", len(data), len(failures))
        result["steps"].append({"step": "ingest", "status": "success"})

        # ------------------------------------------------------------------ #
        # CLEAN
        # ------------------------------------------------------------------ #
        cleaned = _clean(data)
        log_pipeline_step("clean", len(cleaned))
        result["steps"].append({"step": "clean", "status": "success"})

        # ------------------------------------------------------------------ #
        # ML — cohort training
        # ------------------------------------------------------------------ #
        _train(cleaned)
        log_pipeline_step("cohort_training", len(cleaned))
        result["steps"].append({"step": "cohort_training", "status": "success"})

        # ------------------------------------------------------------------ #
        # REFRESH — materialised views
        # ------------------------------------------------------------------ #
        _refresh_views(cleaned)
        log_pipeline_step("refresh_views", len(cleaned))
        result["steps"].append({"step": "refresh_views", "status": "success"})

        result["completed_at"] = datetime.utcnow().isoformat()
        return result

    except Exception as exc:  # noqa: BLE001
        log_failure("pipeline", str(exc))
        alert_failure("pipeline", str(exc))
        return {"status": "failed", "error": str(exc)}


# ===========================================================================
# SCHEDULER  (SENTRY-51)
# ===========================================================================

_scheduler = BackgroundScheduler()


def start_scheduler() -> None:
    """
    Register the daily pipeline job and start the background scheduler.

    Call once from your application factory (e.g. ``create_app``).
    The job is idempotent — ``replace_existing=True`` means restarting the
    process won't register duplicate jobs.
    """
    _scheduler.add_job(
        run_pipeline,
        trigger="interval",
        hours=24,
        id="daily_pipeline",
        replace_existing=True,
    )
    _scheduler.start()


def stop_scheduler() -> None:
    """Gracefully stop the scheduler (useful in tests and shutdown hooks)."""
    if _scheduler.running:
        _scheduler.shutdown(wait=False)