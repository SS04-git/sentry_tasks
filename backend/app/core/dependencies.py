from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from app.core.security import SECRET_KEY, ALGORITHM

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        role: str = payload.get("role")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return {"email": user_id, "role": role}
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    

# def get_current_user(token: str = Depends(oauth2_scheme)):
#     try:
#         print("TOKEN RECEIVED:", token)
#         print("SECRET_KEY:", SECRET_KEY)

#         payload = jwt.decode(
#             token,
#             SECRET_KEY,
#             algorithms=[ALGORITHM]
#         )

#         print("PAYLOAD:", payload)

#         user_id = payload.get("sub")
#         role = payload.get("role")

#         return {
#             "email": user_id,
#             "role": role
#         }

#     except Exception as e:
#         print("JWT ERROR:", str(e))
#         raise HTTPException(
#             status_code=401,
#             detail=str(e)
#         )


def require_role(*roles: str):
    def checker(current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user
    return checker