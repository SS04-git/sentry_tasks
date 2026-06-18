from sqlalchemy.orm import Session
from app.db.database import SessionLocal
from app.ml.anomaly_model import AnomalyModel
from sqlalchemy import text
import pandas as pd
import joblib

MODEL_PATH = "/app/ml/model.joblib"

def load_data(db: Session):
    query = text("SELECT * FROM v_access_anomaly_features")
    df = pd.read_sql(query, db.bind)
    return df

def main():
    db = SessionLocal()

    df = load_data(db)

    model = AnomalyModel()
    model.train(df)
    model.save(MODEL_PATH)

    print("Model trained and saved:", MODEL_PATH)

if __name__ == "__main__":
    main()