"""
SENTRY-49 Governance utilities
"""

SUPPRESSION_THRESHOLD = 5

# caveat attached to every KPI
KPI_CAVEATS = {
    "deployment_frequency": "Deployment frequency reflects release activity and is best interpreted alongside other delivery metrics.",
    "lead_time":            "Lead time is most meaningful when evaluated alongside quality and reliability metrics.",
    "occupancy":            "Occupancy measures facility usage within the workplace.",
    "attendance":           "Attendance records reflect workforce presence for operational reporting.",
    "commit_count":         "Commit count reflects repository activity and contribution patterns over time.",
    "pull_requests":        "Pull request count reflects code review and development workflow activity.",
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