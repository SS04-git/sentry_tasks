from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app.db.database import SessionLocal
from app.models.github_account import GitHubAccount
from app.models.github_data import GitRepo, GitCommit, GitFileChange
from app.models.user import User
from app.core.dependencies import get_current_user
from app.services.defect_risk_service import train_model, predict_risk

router = APIRouter()

# Extensions considered actual source code (exclude docs/config/lock files)
CODE_EXTENSIONS = {
    ".js", ".jsx", ".ts", ".tsx", ".py", ".java", ".kt", ".swift",
    ".go", ".rs", ".rb", ".php", ".cs", ".cpp", ".c", ".h", ".vue",
    ".svelte", ".dart", ".scala", ".ex", ".exs", ".clj", ".hs",
}

# Filenames to always exclude regardless of extension
EXCLUDED_NAMES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "poetry.lock", "cargo.lock", "composer.lock",
    "go.sum", ".gitignore", ".env.example",
}


def _is_code_file(filename: str) -> bool:
    import os
    if os.path.basename(filename).lower() in EXCLUDED_NAMES:
        return False
    _, ext = os.path.splitext(filename)
    return ext.lower() in CODE_EXTENSIONS


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _mine_file_rows(db: Session, repo_id: int) -> list[dict]:
    rows = (
        db.query(
            GitFileChange.filename,
            func.sum(GitFileChange.additions + GitFileChange.deletions).label("churn"),
            func.count(GitFileChange.commit_sha.distinct()).label("change_frequency"),
            func.count(GitCommit.author_github_login.distinct()).label("authors"),
            func.avg(GitCommit.files_changed).label("complexity"),
        )
        .join(GitCommit, GitCommit.sha == GitFileChange.commit_sha)
        .filter(GitFileChange.repo_id == repo_id)
        .group_by(GitFileChange.filename)
        .all()
    )

    if not rows:
        return []

    bug_counts_raw = (
        db.query(
            GitFileChange.filename,
            func.count(GitFileChange.commit_sha.distinct()).label("bug_commits"),
        )
        .join(GitCommit, GitCommit.sha == GitFileChange.commit_sha)
        .filter(
            GitFileChange.repo_id == repo_id,
            or_(
                GitCommit.message.ilike("%fix%"),
                GitCommit.message.ilike("%bug%"),
                GitCommit.message.ilike("%hotfix%"),
                GitCommit.message.ilike("%patch%"),
                GitCommit.message.ilike("%error%"),
                GitCommit.message.ilike("%issue%"),
                GitCommit.message.ilike("%revert%"),
            ),
        )
        .group_by(GitFileChange.filename)
        .all()
    )
    bug_map = {r.filename: r.bug_commits for r in bug_counts_raw}

    result = []
    for r in rows:
        if not _is_code_file(r.filename):
            continue
        result.append({
            "file":             r.filename,
            "churn":            int(r.churn or 0),
            "complexity":       round(float(r.complexity or 0), 2),
            "authors":          int(r.authors or 0),
            "change_frequency": int(r.change_frequency),
            "bug_history":      bug_map.get(r.filename, 0),
            "label":            0,  # computed in train_model
        })

    result.sort(key=lambda x: x["change_frequency"])
    return result


@router.get("")
def get_risk_watchlist(
    owner: str = Query(...),
    repo:  str = Query(...),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    app_user = db.query(User).filter(User.email == current_user["email"]).first()
    if not app_user:
        raise HTTPException(status_code=404, detail="User not found")

    account = db.query(GitHubAccount).filter(
        GitHubAccount.user_id == app_user.id
    ).first()
    if not account:
        raise HTTPException(status_code=401, detail="GitHub not connected")

    git_repo = (
        db.query(GitRepo)
        .filter(
            GitRepo.github_account_id == account.id,
            GitRepo.full_name == f"{owner}/{repo}",
        )
        .first()
    )
    if not git_repo:
        raise HTTPException(
            status_code=404,
            detail=f"Repo {owner}/{repo} not synced. Go to Repositories and sync it first.",
        )

    rows = _mine_file_rows(db, git_repo.repo_id)

    if len(rows) < 3:
        raise HTTPException(
            status_code=422,
            detail=(
                "Not enough source-code files to build a risk model "
                f"(found {len(rows)}, need ≥ 3). "
                "Sync more commits or check that your repo contains supported source files."
            ),
        )

    model, metrics, labels = train_model(rows)
    ranked = predict_risk(model, rows, labels)
    ranked = sorted(ranked, key=lambda x: x["risk_score"], reverse=True)

    return {
        "repo":    f"{owner}/{repo}",
        "metrics": metrics,
        "data":    ranked,
    }