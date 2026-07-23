from datetime import datetime, timedelta
from jose import jwt
import bcrypt
import os

SECRET_KEY = os.getenv("SECRET_KEY", "488ea84330437dcd3f9c0da26673f87d205f80a57471c39c67b82cd8c1403c8a")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 180

def hash_password(password: str) -> str:
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt()
    ).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(
        plain.encode("utf-8"),
        hashed.encode("utf-8")
    )

def create_access_token(data: dict) -> str:
    to_encode = data.copy() 
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
