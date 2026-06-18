import requests
import time
from datetime import datetime
from fastapi import APIRouter, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.database import SessionLocal
from app.models.github_account import GitHubAccount
from app.models.github_data import (
    GitRepo, GitCommit, GitContributorStat,
    GitPullRequest, GitFileChange, GitReview, GitSyncStatus
)
from fastapi.responses import RedirectResponse
from app.core import config
from app.core.security import create_access_token

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_github_token() -> str:
    db: Session = SessionLocal()
    try:
        account = db.query(GitHubAccount).first()
        if not account:
            raise HTTPException(status_code=401, detail="GitHub not connected")
        return account.access_token
    finally:
        db.close()


def gh_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
    }


def check_rate_limit(token: str) -> dict:
    res = requests.get(
        "https://api.github.com/rate_limit",
        headers=gh_headers(token),
        timeout=10,
    )
    data = res.json()
    core = data.get("resources", {}).get("core", {})
    return {
        "remaining": core.get("remaining", 0),
        "reset": core.get("reset", 0),
        "limit": core.get("limit", 5000),
    }


def rate_limited_get(url: str, token: str, params: dict = None, min_remaining: int = 50) -> dict:
    """GET with rate-limit awareness — sleeps if budget is low."""
    rate = check_rate_limit(token)
    if rate["remaining"] < min_remaining:
        reset_time = rate["reset"]
        sleep_secs = max(0, reset_time - time.time()) + 5
        print(f"Rate limit low ({rate['remaining']} left), sleeping {sleep_secs:.0f}s")
        time.sleep(min(sleep_secs, 60))

    res = requests.get(url, headers=gh_headers(token), params=params, timeout=15)
    return res


def update_sync_status(db: Session, repo_full_name: str, status: str,
                        error: str = None, commits: int = None,
                        prs: int = None, rate_remaining: int = None,
                        rate_reset: datetime = None):
    existing = db.query(GitSyncStatus).filter(
        GitSyncStatus.repo_full_name == repo_full_name
    ).first()

    if existing:
        existing.last_sync_at = datetime.utcnow()
        existing.last_sync_status = status
        existing.last_error = error
        if commits is not None:
            existing.commits_synced = commits
        if prs is not None:
            existing.prs_synced = prs
        if rate_remaining is not None:
            existing.rate_limit_remaining = rate_remaining
        if rate_reset is not None:
            existing.rate_limit_reset = rate_reset
        existing.updated_at = datetime.utcnow()
    else:
        db.add(GitSyncStatus(
            repo_full_name=repo_full_name,
            last_sync_at=datetime.utcnow(),
            last_sync_status=status,
            last_error=error,
            commits_synced=commits or 0,
            prs_synced=prs or 0,
            rate_limit_remaining=rate_remaining,
            rate_limit_reset=rate_reset,
        ))
    db.commit()


def parse_dt(s: str):
    if not s:
        return None
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


# ── Auth ──────────────────────────────────────────────────────────────────────

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

    user_response = requests.get(
        "https://api.github.com/user",
        headers=gh_headers(access_token),
        timeout=10,
    )
    github_user = user_response.json()

    if "id" not in github_user:
        raise HTTPException(status_code=400, detail=github_user)

    db: Session = SessionLocal()
    try:
        account = db.query(GitHubAccount).filter(
            GitHubAccount.github_id == github_user["id"]
        ).first()

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

    token = create_access_token({
        "sub": github_user["login"],
        "role": "employee"
    })

    return RedirectResponse(f"http://localhost:3000/repositories?token={token}")


@router.delete("/disconnect")
def disconnect_github():
    db: Session = SessionLocal()
    try:
        db.query(GitHubAccount).delete()
        db.commit()
        return {"message": "Disconnected"}
    finally:
        db.close()


# ── Repositories ──────────────────────────────────────────────────────────────

@router.get("/repositories")
def get_repositories(background_tasks: BackgroundTasks):
    access_token = get_github_token()

    response = requests.get(
        "https://api.github.com/user/repos",
        headers=gh_headers(access_token),
        params={"visibility": "all", "per_page": 100},
        timeout=10,
    )
    data = response.json()

    if isinstance(data, dict) and data.get("message"):
        raise HTTPException(status_code=400, detail=data.get("message"))

    background_tasks.add_task(sync_repos_to_db, data, access_token)
    return data


def sync_repos_to_db(repos: list, access_token: str):
    db: Session = SessionLocal()
    try:
        account = db.query(GitHubAccount).first()
        if not account:
            return

        for repo in repos:
            existing = db.query(GitRepo).filter(
                GitRepo.repo_id == repo["id"]
            ).first()

            if existing:
                existing.stars = repo.get("stargazers_count", 0)
                existing.forks = repo.get("forks_count", 0)
                existing.open_issues = repo.get("open_issues_count", 0)
                existing.synced_at = datetime.utcnow()
            else:
                db.add(GitRepo(
                    github_account_id=account.id,
                    repo_id=repo["id"],
                    owner=repo["owner"]["login"],
                    name=repo["name"],
                    full_name=repo["full_name"],
                    description=repo.get("description"),
                    private=repo.get("private", False),
                    language=repo.get("language"),
                    default_branch=repo.get("default_branch", "main"),
                    stars=repo.get("stargazers_count", 0),
                    forks=repo.get("forks_count", 0),
                    open_issues=repo.get("open_issues_count", 0),
                    synced_at=datetime.utcnow(),
                ))

        db.commit()
    except Exception as e:
        print(f"Sync repos error: {e}")
    finally:
        db.close()


# ── Commits ───────────────────────────────────────────────────────────────────

@router.get("/repos/{owner}/{repo}/commits")
def get_commits(owner: str, repo: str, per_page: int = 30,
                background_tasks: BackgroundTasks = None):
    access_token = get_github_token()

    response = rate_limited_get(
        f"https://api.github.com/repos/{owner}/{repo}/commits",
        access_token,
        params={"per_page": per_page},
    )
    data = response.json()

    if isinstance(data, dict) and data.get("message"):
        raise HTTPException(status_code=400, detail=data.get("message"))

    result = []
    for c in data:
        result.append({
            "sha": c.get("sha", "")[:7],
            "full_sha": c.get("sha", ""),
            "message": c.get("commit", {}).get("message", "").split("\n")[0],
            "author": c.get("commit", {}).get("author", {}).get("name", "Unknown"),
            "author_login": c.get("author", {}).get("login") if c.get("author") else None,
            "author_avatar": c.get("author", {}).get("avatar_url") if c.get("author") else None,
            "date": c.get("commit", {}).get("author", {}).get("date", ""),
            "url": c.get("html_url", ""),
        })

    if background_tasks:
        background_tasks.add_task(sync_commits_to_db, owner, repo, data, access_token)

    return result


def sync_commits_to_db(owner: str, repo: str, commits: list, access_token: str):
    db: Session = SessionLocal()
    try:
        git_repo = db.query(GitRepo).filter(
            GitRepo.full_name == f"{owner}/{repo}"
        ).first()
        if not git_repo:
            return

        commits_added = 0
        for c in commits:
            sha = c.get("sha", "")
            existing = db.query(GitCommit).filter(GitCommit.sha == sha).first()
            if existing:
                continue

            detail_res = rate_limited_get(
                f"https://api.github.com/repos/{owner}/{repo}/commits/{sha}",
                access_token,
            )
            detail = detail_res.json()
            stats = detail.get("stats", {})

            date_str = c.get("commit", {}).get("author", {}).get("date", "")
            committed_at = parse_dt(date_str) or datetime.utcnow()

            commit = GitCommit(
                repo_id=git_repo.repo_id,
                sha=sha,
                short_sha=sha[:7],
                message=c.get("commit", {}).get("message", "").split("\n")[0],
                author_name=c.get("commit", {}).get("author", {}).get("name"),
                author_email=c.get("commit", {}).get("author", {}).get("email"),
                author_github_login=c.get("author", {}).get("login") if c.get("author") else None,
                committed_at=committed_at,
                additions=stats.get("additions", 0),
                deletions=stats.get("deletions", 0),
                files_changed=len(detail.get("files", [])),
                url=c.get("html_url", ""),
            )
            db.add(commit)
            db.flush()

            # Sync file changes
            for f in detail.get("files", []):
                db.add(GitFileChange(
                    commit_sha=sha,
                    repo_id=git_repo.repo_id,
                    filename=f.get("filename", ""),
                    status=f.get("status"),
                    additions=f.get("additions", 0),
                    deletions=f.get("deletions", 0),
                    changes=f.get("changes", 0),
                    patch=f.get("patch"),
                ))

            commits_added += 1
            time.sleep(0.1)

        db.commit()
        update_sync_status(db, f"{owner}/{repo}", "success", commits=commits_added)

    except Exception as e:
        print(f"Sync commits error: {e}")
        db_status: Session = SessionLocal()
        try:
            update_sync_status(db_status, f"{owner}/{repo}", "error", error=str(e))
        finally:
            db_status.close()
    finally:
        db.close()


# ── Contributor Stats ─────────────────────────────────────────────────────────

@router.get("/repos/{owner}/{repo}/stats")
def get_contributor_stats(owner: str, repo: str):
    access_token = get_github_token()

    for attempt in range(3):
        response = rate_limited_get(
            f"https://api.github.com/repos/{owner}/{repo}/stats/contributors",
            access_token,
        )
        if response.status_code == 200:
            break
        if response.status_code == 202:
            time.sleep(2)
            continue

    if response.status_code != 200:
        return []

    data = response.json()
    if not isinstance(data, list):
        return []

    result = []
    db: Session = SessionLocal()
    try:
        git_repo = db.query(GitRepo).filter(
            GitRepo.full_name == f"{owner}/{repo}"
        ).first()

        for contributor in data:
            total_additions = sum(w.get("a", 0) for w in contributor.get("weeks", []))
            total_deletions = sum(w.get("d", 0) for w in contributor.get("weeks", []))
            total_commits = contributor.get("total", 0)
            login = contributor.get("author", {}).get("login", "Unknown")
            avatar = contributor.get("author", {}).get("avatar_url", "")

            result.append({
                "author": login,
                "avatar": avatar,
                "commits": total_commits,
                "additions": total_additions,
                "deletions": total_deletions,
            })

            if git_repo:
                existing = db.query(GitContributorStat).filter(
                    GitContributorStat.repo_id == git_repo.repo_id,
                    GitContributorStat.github_login == login,
                ).first()

                if existing:
                    existing.total_commits = total_commits
                    existing.total_additions = total_additions
                    existing.total_deletions = total_deletions
                    existing.avatar_url = avatar
                    existing.synced_at = datetime.utcnow()
                else:
                    db.add(GitContributorStat(
                        repo_id=git_repo.repo_id,
                        github_login=login,
                        avatar_url=avatar,
                        total_commits=total_commits,
                        total_additions=total_additions,
                        total_deletions=total_deletions,
                    ))

        db.commit()
    except Exception as e:
        print(f"Sync stats error: {e}")
    finally:
        db.close()

    result.sort(key=lambda x: x["commits"], reverse=True)
    return result


# ── Pull Requests ─────────────────────────────────────────────────────────────

@router.get("/repos/{owner}/{repo}/pulls")
def get_pull_requests(owner: str, repo: str, state: str = "all", per_page: int = 30):
    access_token = get_github_token()

    response = rate_limited_get(
        f"https://api.github.com/repos/{owner}/{repo}/pulls",
        access_token,
        params={"state": state, "per_page": per_page},
    )
    data = response.json()

    if isinstance(data, dict) and data.get("message"):
        raise HTTPException(status_code=400, detail=data.get("message"))

    result = []
    db: Session = SessionLocal()
    try:
        git_repo = db.query(GitRepo).filter(
            GitRepo.full_name == f"{owner}/{repo}"
        ).first()

        for pr in data:
            pr_data = {
                "number": pr.get("number"),
                "title": pr.get("title"),
                "state": pr.get("state"),
                "author": pr.get("user", {}).get("login"),
                "author_avatar": pr.get("user", {}).get("avatar_url"),
                "merged": pr.get("merged_at") is not None,
                "draft": pr.get("draft", False),
                "opened_at": pr.get("created_at"),
                "merged_at": pr.get("merged_at"),
                "closed_at": pr.get("closed_at"),
                "url": pr.get("html_url"),
            }
            result.append(pr_data)

            if git_repo:
                existing = db.query(GitPullRequest).filter(
                    GitPullRequest.repo_id == git_repo.repo_id,
                    GitPullRequest.pr_number == pr.get("number"),
                ).first()

                if existing:
                    existing.state = pr.get("state")
                    existing.merged = pr.get("merged_at") is not None
                    existing.synced_at = datetime.utcnow()
                else:
                    db.add(GitPullRequest(
                        repo_id=git_repo.repo_id,
                        pr_number=pr.get("number"),
                        title=pr.get("title"),
                        state=pr.get("state"),
                        author_login=pr.get("user", {}).get("login"),
                        author_avatar=pr.get("user", {}).get("avatar_url"),
                        merged=pr.get("merged_at") is not None,
                        draft=pr.get("draft", False),
                        opened_at=parse_dt(pr.get("created_at")),
                        merged_at=parse_dt(pr.get("merged_at")),
                        closed_at=parse_dt(pr.get("closed_at")),
                        url=pr.get("html_url"),
                    ))

                # Sync reviews for this PR
                reviews_res = rate_limited_get(
                    f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr.get('number')}/reviews",
                    access_token,
                )
                reviews = reviews_res.json()
                if isinstance(reviews, list):
                    for review in reviews:
                        existing_review = db.query(GitReview).filter(
                            GitReview.repo_id == git_repo.repo_id,
                            GitReview.pr_number == pr.get("number"),
                            GitReview.reviewer_login == review.get("user", {}).get("login"),
                            GitReview.state == review.get("state"),
                        ).first()
                        if not existing_review:
                            db.add(GitReview(
                                repo_id=git_repo.repo_id,
                                pr_number=pr.get("number"),
                                reviewer_login=review.get("user", {}).get("login"),
                                reviewer_avatar=review.get("user", {}).get("avatar_url"),
                                state=review.get("state"),
                                submitted_at=parse_dt(review.get("submitted_at")),
                                url=review.get("html_url"),
                            ))

        db.commit()
        update_sync_status(db, f"{owner}/{repo}", "success", prs=len(result))
    except Exception as e:
        print(f"Sync PRs error: {e}")
    finally:
        db.close()

    return result


# ── Sync Status ───────────────────────────────────────────────────────────────

@router.get("/sync-status")
def get_sync_status():
    access_token = get_github_token()
    rate = check_rate_limit(access_token)

    db: Session = SessionLocal()
    try:
        statuses = db.query(GitSyncStatus).all()
        return {
            "rate_limit": {
                "remaining": rate["remaining"],
                "limit": rate["limit"],
                "reset": datetime.utcfromtimestamp(rate["reset"]).isoformat(),
                "percent_used": round((1 - rate["remaining"] / rate["limit"]) * 100, 1),
            },
            "repos": [
                {
                    "repo": s.repo_full_name,
                    "last_sync_at": s.last_sync_at.isoformat() if s.last_sync_at else None,
                    "status": s.last_sync_status,
                    "error": s.last_error,
                    "commits_synced": s.commits_synced,
                    "prs_synced": s.prs_synced,
                }
                for s in statuses
            ],
        }
    finally:
        db.close()


@router.post("/repos/{owner}/{repo}/sync")
def trigger_sync(owner: str, repo: str, background_tasks: BackgroundTasks):
    access_token = get_github_token()
    background_tasks.add_task(full_repo_sync, owner, repo, access_token)
    return {"message": f"Sync started for {owner}/{repo}"}


def full_repo_sync(owner: str, repo: str, access_token: str):
    db: Session = SessionLocal()
    try:
        update_sync_status(db, f"{owner}/{repo}", "running")

        # Commits
        commits_res = rate_limited_get(
            f"https://api.github.com/repos/{owner}/{repo}/commits",
            access_token,
            params={"per_page": 100},
        )
        commits = commits_res.json()
        if isinstance(commits, list):
            sync_commits_to_db(owner, repo, commits, access_token)

        # PRs
        prs_res = rate_limited_get(
            f"https://api.github.com/repos/{owner}/{repo}/pulls",
            access_token,
            params={"state": "all", "per_page": 100},
        )
        prs = prs_res.json()

        rate = check_rate_limit(access_token)
        update_sync_status(
            db, f"{owner}/{repo}", "success",
            rate_remaining=rate["remaining"],
            rate_reset=datetime.utcfromtimestamp(rate["reset"]),
        )

    except Exception as e:
        print(f"Full sync error: {e}")
        update_sync_status(db, f"{owner}/{repo}", "error", error=str(e))
    finally:
        db.close()


# ── Analytics ─────────────────────────────────────────────────────────────────

@router.get("/repos/{owner}/{repo}/analytics")
def get_repo_analytics(owner: str, repo: str):
    db: Session = SessionLocal()
    try:
        git_repo = db.query(GitRepo).filter(
            GitRepo.full_name == f"{owner}/{repo}"
        ).first()
        if not git_repo:
            return {"error": "Repo not synced yet"}

        total_commits = db.query(func.count(GitCommit.id)).filter(
            GitCommit.repo_id == git_repo.repo_id
        ).scalar()

        total_additions = db.query(func.sum(GitCommit.additions)).filter(
            GitCommit.repo_id == git_repo.repo_id
        ).scalar() or 0

        total_deletions = db.query(func.sum(GitCommit.deletions)).filter(
            GitCommit.repo_id == git_repo.repo_id
        ).scalar() or 0

        open_prs = db.query(func.count(GitPullRequest.id)).filter(
            GitPullRequest.repo_id == git_repo.repo_id,
            GitPullRequest.state == "open",
        ).scalar()

        merged_prs = db.query(func.count(GitPullRequest.id)).filter(
            GitPullRequest.repo_id == git_repo.repo_id,
            GitPullRequest.merged == True,
        ).scalar()

        top_contributors = db.query(GitContributorStat).filter(
            GitContributorStat.repo_id == git_repo.repo_id
        ).order_by(GitContributorStat.total_commits.desc()).limit(5).all()

        return {
            "repo": f"{owner}/{repo}",
            "total_commits_synced": total_commits,
            "total_additions": total_additions,
            "total_deletions": total_deletions,
            "open_prs": open_prs,
            "merged_prs": merged_prs,
            "top_contributors": [
                {
                    "login": c.github_login,
                    "avatar": c.avatar_url,
                    "commits": c.total_commits,
                    "additions": c.total_additions,
                    "deletions": c.total_deletions,
                }
                for c in top_contributors
            ],
        }
    finally:
        db.close()