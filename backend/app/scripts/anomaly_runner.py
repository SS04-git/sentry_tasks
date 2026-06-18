import time
from app.db.database import SessionLocal
from app.services.anomaly_service import run_scoring_job

def run_loop():
    while True:
        db = SessionLocal()
        try:
            run_scoring_job(db)
            print("Anomaly scoring completed")
        except Exception as e:
            print("Error:", e)
        finally:
            db.close()

        time.sleep(300)  # run every 5 minutes

if __name__ == "__main__":
    run_loop()