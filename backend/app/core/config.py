from dotenv import load_dotenv
import os

load_dotenv()

APP_NAME = os.getenv("APP_NAME", "FastAPI App")
ENV = os.getenv("ENV", "development")
DEBUG = os.getenv("DEBUG", "False") == "True"

DATABASE_URL = os.getenv("DATABASE_URL")

GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET")
GITHUB_REDIRECT_URI = os.getenv("GITHUB_CALLBACK_URL")