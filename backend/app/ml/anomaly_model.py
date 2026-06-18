import joblib
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

FEATURES = [
    "hour_of_day",
    "day_of_week",
    "is_weekend",
    "direction_enc",
    "access_result_enc",
    "swipe_freq",
    "gap_since_last_event_min",
    "entry_exit_balance",
]

class AnomalyModel:
    def __init__(self):
        self.model = IsolationForest(
            n_estimators=200,
            contamination=0.015,
            random_state=42,
            n_jobs=-1,
        )
        self.scaler = StandardScaler()

    def train(self, df: pd.DataFrame):
        X = self.scaler.fit_transform(df[FEATURES].fillna(0))
        self.model.fit(X)

    def score(self, df: pd.DataFrame):
        X = self.scaler.transform(df[FEATURES].fillna(0))
        df = df.copy()
        df["anomaly_score"] = self.model.decision_function(X)
        df["is_anomaly"]    = self.model.predict(X) == -1
        return df

    def save(self, path="model.joblib"):
        joblib.dump(self.model, path)

    def load(self, path="model.joblib"):
        self.model = joblib.load(path)