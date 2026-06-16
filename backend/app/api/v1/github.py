import requests
from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session

from app.db.database import SessionLocal
from app.models.github_account import GitHubAccount
from fastapi.responses import RedirectResponse
from app.core import config
from app.core.security import create_access_token

router = APIRouter()


@router.get("/login")
def github_login():
    github_url = (
        "https://github.com/login/oauth/authorize"
        f"?client_id={config.GITHUB_CLIENT_ID}"
        f"&redirect_uri={config.GITHUB_REDIRECT_URI}"
        "&scope=repo read:user"
    )
    return RedirectResponse(github_url)


@router.get("/callback")
def github_callback(code: str):
    if not code:
        raise HTTPException(status_code=400, detail="Missing code")

    # 1. Exchange code for access token
    token_response = requests.post(
        "https://github.com/login/oauth/access_token",
        headers={"Accept": "application/json"},
        data={
            "client_id": config.GITHUB_CLIENT_ID,
            "client_secret": config.GITHUB_CLIENT_SECRET,
            "code": code,
        },
        timeout=10,
    )

    token_json = token_response.json()

    if "error" in token_json:
        return RedirectResponse(
            f"http://localhost:3000/repositories?error={token_json['error']}"
        )

    if "access_token" not in token_json:
        raise HTTPException(status_code=400, detail=token_json)

    access_token = token_json["access_token"]

    # 2. Get GitHub user
    user_response = requests.get(
        "https://api.github.com/user",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )

    github_user = user_response.json()

    if "id" not in github_user:
        raise HTTPException(status_code=400, detail=github_user)

    # 3. Save in DB
    db: Session = SessionLocal()

    try:
        account = (
            db.query(GitHubAccount)
            .filter(GitHubAccount.github_id == github_user["id"])
            .first()
        )

        if not account:
            account = GitHubAccount(
                github_id=github_user["id"],
                github_login=github_user["login"],
                access_token=access_token,
            )
            db.add(account)
        else:
            account.access_token = access_token

        db.commit()

    finally:
        db.close()

    # 4. Generate JWT
    token = create_access_token({
        "sub": github_user["login"],
        "role": "employee"
    })

    # 5. Redirect with token
    return RedirectResponse(
        f"http://localhost:3000/repositories?token={token}"
    )

@router.get("/repositories")
def get_repositories():
    db: Session = SessionLocal()

    try:
        account = db.query(GitHubAccount).first()

        if not account:
            raise HTTPException(
                status_code=401,
                detail="GitHub not connected"
            )

        response = requests.get(
            "https://api.github.com/user/repos",
            headers={
                "Authorization": f"Bearer {account.access_token}"
            },
            params={
                "visibility": "all",
                "per_page": 100
            },
            timeout=10,
        )

        data = response.json()

        if isinstance(data, dict) and data.get("message"):
            raise HTTPException(
                status_code=400,
                detail=data.get("message")
            )

        return data

    finally:
        db.close()

@router.delete("/disconnect")
def disconnect_github():
    db: Session = SessionLocal()
    try:
        db.query(GitHubAccount).delete()
        db.commit()
        return {"message": "Disconnected"}
    finally:
        db.close()