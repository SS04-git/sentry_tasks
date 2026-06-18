from sqlalchemy import Column, Integer, BigInteger, String, Boolean, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.db.database import Base

class GitRepo(Base):
    __tablename__ = "git_repos"

    id = Column(Integer, primary_key=True)
    github_account_id = Column(Integer, ForeignKey("github_accounts.id"))
    repo_id = Column(BigInteger, unique=True, nullable=False)
    owner = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    description = Column(Text)
    private = Column(Boolean, default=False)
    language = Column(String(100))
    default_branch = Column(String(100), default="main")
    stars = Column(Integer, default=0)
    forks = Column(Integer, default=0)
    open_issues = Column(Integer, default=0)
    synced_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())


class GitCommit(Base):
    __tablename__ = "git_commits"

    id = Column(Integer, primary_key=True)
    repo_id = Column(BigInteger, ForeignKey("git_repos.repo_id"))
    sha = Column(String(40), unique=True, nullable=False)
    short_sha = Column(String(7), nullable=False)
    message = Column(Text, nullable=False)
    author_name = Column(String(255))
    author_email = Column(String(255))
    author_github_login = Column(String(255))
    committed_at = Column(DateTime, nullable=False)
    additions = Column(Integer, default=0)
    deletions = Column(Integer, default=0)
    files_changed = Column(Integer, default=0)
    url = Column(Text)
    synced_at = Column(DateTime, server_default=func.now())


class GitContributorStat(Base):
    __tablename__ = "git_contributor_stats"

    id = Column(Integer, primary_key=True)
    repo_id = Column(BigInteger, ForeignKey("git_repos.repo_id"))
    github_login = Column(String(255), nullable=False)
    avatar_url = Column(Text)
    total_commits = Column(Integer, default=0)
    total_additions = Column(Integer, default=0)
    total_deletions = Column(Integer, default=0)
    synced_at = Column(DateTime, server_default=func.now())


class GitPullRequest(Base):
    __tablename__ = "git_pull_requests"

    id = Column(Integer, primary_key=True)
    repo_id = Column(BigInteger, ForeignKey("git_repos.repo_id"))
    pr_number = Column(Integer, nullable=False)
    title = Column(Text, nullable=False)
    state = Column(String(20), nullable=False)
    author_login = Column(String(255))
    author_avatar = Column(Text)
    merged = Column(Boolean, default=False)
    draft = Column(Boolean, default=False)
    commits = Column(Integer, default=0)
    additions = Column(Integer, default=0)
    deletions = Column(Integer, default=0)
    changed_files = Column(Integer, default=0)
    opened_at = Column(DateTime)
    merged_at = Column(DateTime)
    closed_at = Column(DateTime)
    url = Column(Text)
    synced_at = Column(DateTime, server_default=func.now())

class GitFileChange(Base):
    __tablename__ = "git_file_changes"

    id = Column(Integer, primary_key=True)
    commit_sha = Column(String(40), ForeignKey("git_commits.sha", ondelete="CASCADE"))
    repo_id = Column(BigInteger, ForeignKey("git_repos.repo_id"))
    filename = Column(Text, nullable=False)
    status = Column(String(20))
    additions = Column(Integer, default=0)
    deletions = Column(Integer, default=0)
    changes = Column(Integer, default=0)
    patch = Column(Text)
    synced_at = Column(DateTime, server_default=func.now())


class GitReview(Base):
    __tablename__ = "git_reviews"

    id = Column(Integer, primary_key=True)
    repo_id = Column(BigInteger, ForeignKey("git_repos.repo_id"))
    pr_number = Column(Integer, nullable=False)
    reviewer_login = Column(String(255))
    reviewer_avatar = Column(Text)
    state = Column(String(50))
    submitted_at = Column(DateTime)
    url = Column(Text)
    synced_at = Column(DateTime, server_default=func.now())


class GitSyncStatus(Base):
    __tablename__ = "git_sync_status"

    id = Column(Integer, primary_key=True)
    repo_full_name = Column(String(255), unique=True, nullable=False)
    last_sync_at = Column(DateTime)
    last_sync_status = Column(String(20), default="pending")
    last_error = Column(Text)
    commits_synced = Column(Integer, default=0)
    prs_synced = Column(Integer, default=0)
    rate_limit_remaining = Column(Integer)
    rate_limit_reset = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())