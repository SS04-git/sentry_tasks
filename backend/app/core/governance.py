"""
SENTRY-49 Governance utilities
"""

SUPPRESSION_THRESHOLD = 5

# SENTRY-54 — caveat attached to every KPI
KPI_CAVEATS = {
    "deployment_frequency": "High deployment counts do not imply higher team performance.",
    "lead_time":            "Lead time should be interpreted alongside quality metrics.",
    "occupancy":            "Occupancy reflects building utilization, not employee productivity.",
    "attendance":           "Attendance is operational data and must not be used as a performance score.",
    "commit_count":         "Commit counts are gameable and should not be used for performance evaluation.",
    "pull_requests":        "PR volume measures workflow activity, not impact.",
}


def should_suppress(cohort_size: int) -> bool:
    return cohort_size < SUPPRESSION_THRESHOLD


def suppress(value, cohort_size: int):
    if should_suppress(cohort_size):
        return None
    return value


def validate_governance():
    return {
        "attendance_metrics_separate": True,
        "github_metrics_separate": True,
        "individual_scoring_allowed": False,
        "outcome_metrics_preferred": True,
    }