from dotenv import load_dotenv
import os

load_dotenv()

APP_NAME = os.getenv("APP_NAME", "FastAPI App")
ENV = os.getenv("ENV", "development")
DEBUG = os.getenv("DEBUG", "False") == "True"