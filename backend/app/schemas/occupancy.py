from pydantic import BaseModel
from datetime import date


class OccupancyKPI(BaseModel):
    peak_occupancy: int
    avg_occupancy: float
    min_occupancy: int


class OccupancyTrend(BaseModel):
    event_date: date
    peak_occupancy: int
    weekly_slope: float


class ForecastPoint(BaseModel):
    ds: str
    yhat: float
    yhat_lower: float
    yhat_upper: float


class MobileAdoption(BaseModel):
    event_date: date
    mobile_events: int
    card_events: int
    mobile_adoption_pct: float