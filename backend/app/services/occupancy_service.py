import pandas as pd
from prophet import Prophet
from sqlalchemy import text

def get_forecast(db):

    df = pd.read_sql(
        """
        SELECT
            event_date as ds,
            peak_occupancy as y
        FROM v_occupancy_daily_peak
        ORDER BY event_date
        """,
        db.bind
    )

    model = Prophet(
        interval_width=0.95
    )

    model.fit(df)

    future = model.make_future_dataframe(
        periods=14
    )

    forecast = model.predict(future)

    return forecast[
        [
            "ds",
            "yhat",
            "yhat_lower",
            "yhat_upper"
        ]
    ].tail(14)