from fastapi import APIRouter
from app.services.cohorts_service import train_cohorts

router = APIRouter()


@router.get("/")
def get_cohorts():
    events = [
        {"arrival_time": 1.2, "session_length": 30},
        {"arrival_time": 5.0, "session_length": 10},
        {"arrival_time": 2.0, "session_length": 45},
        {"arrival_time": 6.5, "session_length": 8},
        {"arrival_time": 3.1, "session_length": 25},
        {"arrival_time": 7.2, "session_length": 5},
    ]

    result = train_cohorts(events)

    insights = [
        {
            "title": "Presence vs Delivery",
            "hypothesis": "Higher workplace presence may correlate with faster delivery.",
            "confidence": 0.82,
            "interval": "72% - 92%",
            "sample_size": 12,
        },
        {
            "title": "Onboarding Ramp",
            "hypothesis": "New joiners appear to reach steady productivity after 6-8 weeks.",
            "confidence": 0.76,
            "interval": "66% - 86%",
            "sample_size": 15,
        },
        {
            "title": "Work Mode Mix",
            "hypothesis": "Hybrid teams show slightly higher collaboration activity.",
            "confidence": 0.71,
            "interval": "61% - 81%",
            "sample_size": 18,
        },
        {
            "title": "Trend Shift",
            "hypothesis": "A change-point was detected in attendance patterns this quarter.",
            "confidence": 0.68,
            "interval": "58% - 78%",
            "sample_size": 20,
        },
    ]

    # Suppress cohorts smaller than 5 people
    insights = [
        i for i in insights
        if i["sample_size"] >= 5
    ]

    return {
        "k": result["k"],
        "centroids": result["centroids"],
        "labels": result["labels"],
        "insights": insights,
    }