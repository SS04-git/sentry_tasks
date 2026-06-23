from fastapi import APIRouter

from app.services.platform_service import (
    evaluate_model,
    detect_drift,
    build_governance_report,
)

from app.core.governance import KPI_CAVEATS, validate_governance

router = APIRouter()


@router.get("/")
def governance_report():

    y_true = [1, 1, 0, 0, 1]
    y_pred = [1, 1, 0, 1, 1]
    y_scores = [0.9, 0.8, 0.2, 0.6, 0.95]

    metrics = evaluate_model(
        y_true,
        y_pred,
        y_scores,
    )

    drift = detect_drift(
        [10, 12, 11, 13, 12],
        [17, 18, 20, 16, 19],
    )

    governance_rules = validate_governance()

    report = build_governance_report(
        metrics,
        drift,
    )

    report["governance"] = governance_rules

    return report

@router.get("/caveats")
def get_caveats():
    return KPI_CAVEATS

@router.get("/policy")
def get_policy():
    return validate_governance()