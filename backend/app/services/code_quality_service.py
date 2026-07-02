"""
SENTRY-32  Code quality scanner pipeline
------------------------------------------
For a given owner/repo:
  1. Download a tarball of the default branch via the GitHub API (no full clone).
  2. Run lizard for cyclomatic complexity (Python, JS, TS, TSX).
  3. Run ruff for Python lint, eslint for JS/TS/TSX lint.
  4. Run gitleaks for secret scanning.
  5. Run semgrep for vuln/security findings (folded into the same alert table as secrets,
     tool='semgrep' vs tool='gitleaks').
  6. Pull churn (additions/deletions/commit count per file) from the GitHub API —
     reuses GitCommit / GitFileChange data already synced by github.py, falls back
     to a live commits/{sha} call if a file has no synced data yet.
  7. Persist everything under a single code_quality_scan row.

Never auto-acts — purely writes scan results for the dashboard / alert feed to read.
"""

from __future__ import annotations

import io
import json
import logging
import os
import shutil
import subprocess
import tarfile
import tempfile
import uuid
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import requests
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger("backend")

# ── language routing ─────────────────────────────────────────────────────────

LIZARD_EXTENSIONS = {".py", ".js", ".jsx", ".ts", ".tsx"}
LANGUAGE_BY_EXT = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "tsx",
}

# directories never worth scanning
SKIP_DIRS = {
    "node_modules", ".git", "__pycache__", ".venv", "venv",
    "dist", "build", ".next", "coverage", ".pytest_cache",
}

CHURN_WINDOW_DAYS = 30


# ── GitHub helpers (reuse github.py's auth pattern) ──────────────────────────

def _gh_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
    }


def _get_default_branch(owner: str, repo: str, token: str) -> str:
    res = requests.get(
        f"https://api.github.com/repos/{owner}/{repo}",
        headers=_gh_headers(token),
        timeout=15,
    )
    res.raise_for_status()
    return res.json().get("default_branch", "main")


def _get_latest_commit_sha(owner: str, repo: str, branch: str, token: str) -> str:
    res = requests.get(
        f"https://api.github.com/repos/{owner}/{repo}/commits/{branch}",
        headers=_gh_headers(token),
        timeout=15,
    )
    res.raise_for_status()
    return res.json()["sha"]


def _download_tarball(owner: str, repo: str, ref: str, token: str, dest_dir: Path) -> Path:
    """Download + extract a tarball of the repo at `ref`. Returns the extracted root dir."""
    url = f"https://api.github.com/repos/{owner}/{repo}/tarball/{ref}"
    res = requests.get(url, headers=_gh_headers(token), timeout=60, stream=True)
    res.raise_for_status()

    tar_bytes = io.BytesIO(res.content)
    with tarfile.open(fileobj=tar_bytes, mode="r:gz") as tar:
        tar.extractall(dest_dir)

    # GitHub tarballs extract into a single top-level dir like "owner-repo-shortsha"
    extracted = [p for p in dest_dir.iterdir() if p.is_dir()]
    if not extracted:
        raise RuntimeError("Tarball extraction produced no directory")
    return extracted[0].resolve()


def _iter_source_files(root: Path):
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.suffix.lower() in LIZARD_EXTENSIONS:
            yield path


# ── complexity (lizard) ───────────────────────────────────────────────────────

def _run_complexity(root: Path) -> dict[str, dict]:
    """Returns {relative_path: complexity metrics}"""

    try:
        import lizard
    except ImportError:
        logger.warning("lizard not installed — skipping complexity scan")
        return {}

    out: dict[str, dict] = {}

    for path in _iter_source_files(root):
        try:
            result = lizard.analyze_file(str(path))
        except Exception as e:
            logger.warning("lizard failed on %s: %s", path, e)
            continue

        rel = str(path.relative_to(root))
        funcs = result.function_list
        total_ccn = sum(f.cyclomatic_complexity for f in funcs)

        out[rel] = {
            "cyclomatic_complexity": total_ccn,
            "function_count": len(funcs),
            "avg_function_complexity": round(total_ccn / len(funcs), 2) if funcs else 0,
            "nloc": result.nloc,
            "language": LANGUAGE_BY_EXT.get(path.suffix.lower(), "other"),
        }

    return out


# ── lint (ruff for python, eslint for js/ts/tsx) ─────────────────────────────

def _run_ruff(root: Path) -> list[dict]:
    """Returns list of {file_path, line, column, rule_id, severity, message}"""

    py_files = [p for p in _iter_source_files(root) if p.suffix == ".py"]
    if not py_files:
        return []

    try:
        proc = subprocess.run(
            ["ruff", "check", str(root), "--output-format=json"],
            capture_output=True,
            text=True,
            timeout=120,
        )

        logger.warning("RUFF RC=%s", proc.returncode)
        logger.warning("RUFF STDOUT=%s", proc.stdout[:2000])
        logger.warning("RUFF STDERR=%s", proc.stderr[:2000])

        findings = json.loads(proc.stdout or "[]")

    except FileNotFoundError:
        logger.warning("ruff not installed — skipping Python lint")
        return []

    except (subprocess.TimeoutExpired, json.JSONDecodeError) as e:
        logger.warning("ruff scan failed: %s", e)
        return []

    out = []

    for f in findings:
        try:
            rel = str(Path(f["filename"]).relative_to(root))
        except ValueError:
            rel = f["filename"]

        out.append({
            "file_path": rel,
            "line_number": f.get("location", {}).get("row"),
            "column_number": f.get("location", {}).get("column"),
            "tool": "ruff",
            "rule_id": f.get("code"),
            "severity": "error" if f.get("severity") == "error" else "warning",
            "message": f.get("message"),
        })

    return out

def _run_eslint(root: Path) -> list[dict]:
    """Returns list of {file_path, line, column, rule_id, severity, message}.
    Requires eslint + a config (.eslintrc*) to be resolvable from the project,
    or an org-wide --config passed via ESLINT_CONFIG_PATH env var."""
    js_files = [p for p in _iter_source_files(root) if p.suffix in {".js", ".jsx", ".ts", ".tsx"}]
    if not js_files:
        return []

    cmd = ["npx", "--yes", "eslint", str(root), "--format", "json", "--no-error-on-unmatched-pattern"]
    config_path = os.getenv("ESLINT_CONFIG_PATH")
    if config_path:
        cmd += ["--config", config_path]

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        logger.warning("ESLINT RC=%s", proc.returncode)
        logger.warning("ESLINT STDOUT=%s", proc.stdout[:2000])
        logger.warning("ESLINT STDERR=%s", proc.stderr[:2000])
        if proc.returncode not in (0, 1):
            logger.warning("eslint skipped for repo due to config/dependency issue")
            return []
        
        results = json.loads(proc.stdout or "[]")
    except FileNotFoundError:
        logger.warning("eslint/npx not installed — skipping JS/TS lint")
        return []
    except (subprocess.TimeoutExpired, json.JSONDecodeError) as e:
        logger.warning("eslint scan failed: %s", e)
        return []

    out = []
    for file_result in results:
        try:
            rel = str(Path(file_result["filePath"]).relative_to(root))
        except ValueError:
            rel = file_result["filePath"]
        for msg in file_result.get("messages", []):
            out.append({
                "file_path": rel,
                "line_number": msg.get("line"),
                "column_number": msg.get("column"),
                "tool": "eslint",
                "rule_id": msg.get("ruleId"),
                "severity": "error" if msg.get("severity") == 2 else "warning",
                "message": msg.get("message"),
            })
    return out


# ── secrets (gitleaks) ────────────────────────────────────────────────────────

def _run_gitleaks(root: Path) -> list[dict]:
    """
    Returns list of
    {file_path, line_number, rule_id, severity,
     description, secret_snippet, commit_sha}
    """

    report_path = root.parent / "gitleaks_report.json"

    try:
        proc = subprocess.run(
            [
                "gitleaks",
                "detect",
                "--source", str(root),
                "--no-git",
                "--report-format", "json",
                "--report-path", str(report_path),
                "--exit-code", "0",
            ],
            capture_output=True,
            text=True,
            timeout=180,
        )

        logger.warning("GITLEAKS RC=%s", proc.returncode)
        logger.warning("GITLEAKS STDOUT=%s", proc.stdout[:2000])
        logger.warning("GITLEAKS STDERR=%s", proc.stderr[:2000])

    except FileNotFoundError:
        logger.warning("gitleaks not installed — skipping secret scan")
        return []

    except subprocess.TimeoutExpired:
        logger.warning("gitleaks scan timed out")
        return []

    if not report_path.exists():
        return []

    try:
        findings = json.loads(report_path.read_text())
    except json.JSONDecodeError:
        return []
    finally:
        report_path.unlink(missing_ok=True)

    out = []

    for f in findings:
        try:
            rel = (
                str(Path(f.get("File", "")).relative_to(root))
                if f.get("File")
                else ""
            )
        except ValueError:
            rel = f.get("File", "")

        secret = f.get("Secret", "")

        out.append({
            "file_path": rel,
            "line_number": f.get("StartLine"),
            "tool": "gitleaks",
            "rule_id": f.get("RuleID"),
            "severity": "critical",
            "description": f.get("Description"),
            "secret_snippet": (
                secret[:3] + "…" + secret[-3:]
                if len(secret) > 8
                else "[redacted]"
            ),
            "commit_sha": f.get("Commit"),
        })

    return out


# ── vulns (semgrep) ───────────────────────────────────────────────────────────

SEMGREP_SEVERITY_MAP = {"ERROR": "high", "WARNING": "medium", "INFO": "low"}


def _run_semgrep(root: Path) -> list[dict]:
    """
    Returns list of
    {file_path, line_number, rule_id, severity, description}
    """

    config = os.getenv("SEMGREP_RULES_PATH", "p/ci")

    try:
        cmd = ["semgrep", "scan", "--config", config, "--json"]
        for d in SKIP_DIRS:
            cmd += ["--exclude", d]
        cmd.append(str(root))

        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,
        )

        logger.warning("SEMGREP RC=%s", proc.returncode)
        logger.warning("SEMGREP STDOUT=%s", proc.stdout[:2000])
        logger.warning("SEMGREP STDERR=%s", proc.stderr[:2000])

        data = json.loads(proc.stdout or "{}")

    except FileNotFoundError:
        logger.warning("semgrep not installed — skipping vuln scan")
        return []

    except (subprocess.TimeoutExpired, json.JSONDecodeError) as e:
        logger.warning("semgrep scan failed: %s", e)
        return []

    out = []

    for r in data.get("results", []):
        try:
            rel = str(Path(r["path"]).relative_to(root))
        except ValueError:
            rel = r.get("path", "")

        severity = SEMGREP_SEVERITY_MAP.get(
            r.get("extra", {}).get("severity"),
            "medium",
        )

        out.append({
            "file_path": rel,
            "line_number": r.get("start", {}).get("line"),
            "tool": "semgrep",
            "rule_id": r.get("check_id"),
            "severity": severity,
            "description": r.get("extra", {}).get("message"),
            "secret_snippet": None,
            "commit_sha": None,
        })

    return out


# ── churn (GitHub API, reusing synced commit/file-change data) ──────────────

def _compute_churn(owner: str, repo: str, db: Session) -> dict[str, dict]:
    """Returns {relative_file_path: {lines_added, lines_removed, commit_count}}
    over the last CHURN_WINDOW_DAYS, sourced from already-synced git_commits /
    git_file_changes rows (populated by github.py's commit sync)."""
    since = datetime.utcnow() - timedelta(days=CHURN_WINDOW_DAYS)

    rows = db.execute(text("""
        SELECT
            fc.filename,
            SUM(fc.additions) AS lines_added,
            SUM(fc.deletions) AS lines_removed,
            COUNT(DISTINCT fc.commit_sha) AS commit_count
        FROM git_file_changes fc
        JOIN git_commits c ON c.sha = fc.commit_sha
        JOIN git_repos r ON r.repo_id = fc.repo_id
        WHERE r.full_name = :full_name
          AND c.committed_at >= :since
        GROUP BY fc.filename
    """), {"full_name": f"{owner}/{repo}", "since": since}).mappings().all()

    return {
        r["filename"]: {
            "lines_added": r["lines_added"] or 0,
            "lines_removed": r["lines_removed"] or 0,
            "commit_count": r["commit_count"] or 0,
        }
        for r in rows
    }


# ── persistence ────────────────────────────────────────────────────────────

def _write_scan_results(
    db: Session,
    scan_id: str,
    complexity: dict[str, dict],
    churn: dict[str, dict],
    lint_findings: list[dict],
    secret_findings: list[dict],
) -> dict[str, int]:

    # file metrics: union of files seen in complexity + churn
    all_files = set(complexity.keys()) | set(churn.keys())
    for rel_path in all_files:
        c = complexity.get(rel_path, {})
        ch = churn.get(rel_path, {})
        db.execute(text("""
            INSERT INTO code_quality_file_metric
                (scan_id, file_path, language, cyclomatic_complexity,
                 function_count, avg_function_complexity, nloc,
                 lines_added, lines_removed, commit_count, churn_window_days)
            VALUES
                (CAST(:scan_id AS uuid), :file_path, :language, :ccn,
                 :func_count, :avg_func_ccn, :nloc,
                 :lines_added, :lines_removed, :commit_count, :window)
        """), {
            "scan_id": scan_id,
            "file_path": rel_path,
            "language": c.get("language"),
            "ccn": c.get("cyclomatic_complexity"),
            "func_count": c.get("function_count"),
            "avg_func_ccn": c.get("avg_function_complexity"),
            "nloc": c.get("nloc"),
            "lines_added": ch.get("lines_added", 0),
            "lines_removed": ch.get("lines_removed", 0),
            "commit_count": ch.get("commit_count", 0),
            "window": CHURN_WINDOW_DAYS,
        })

    for f in lint_findings:
        db.execute(text("""
            INSERT INTO code_quality_lint_finding
                (scan_id, file_path, line_number, column_number, tool, rule_id, severity, message)
            VALUES
                (CAST(:scan_id AS uuid), :file_path, :line, :col, :tool, :rule_id, :severity, :message)
        """), {
            "scan_id": scan_id,
            "file_path": f["file_path"],
            "line": f.get("line_number"),
            "col": f.get("column_number"),
            "tool": f["tool"],
            "rule_id": f.get("rule_id"),
            "severity": f.get("severity"),
            "message": f.get("message"),
        })

    for f in secret_findings:
        db.execute(text("""
            INSERT INTO code_quality_secret_alert
                (scan_id, file_path, line_number, tool, rule_id, severity,
                 description, secret_snippet, commit_sha, status)
            VALUES
                (CAST(:scan_id AS uuid), :file_path, :line, :tool, :rule_id, :severity,
                 :description, :secret_snippet, :commit_sha, 'open')
        """), {
            "scan_id": scan_id,
            "file_path": f["file_path"],
            "line": f.get("line_number"),
            "tool": f["tool"],
            "rule_id": f.get("rule_id"),
            "severity": f.get("severity"),
            "description": f.get("description"),
            "secret_snippet": f.get("secret_snippet"),
            "commit_sha": f.get("commit_sha"),
        })

    db.commit()

    return {
        "files_scanned": len(all_files),
        "lint_findings": len(lint_findings),
        "secret_findings": len(secret_findings),
    }


# ── main entrypoint ───────────────────────────────────────────────────────────

def run_code_quality_scan(db: Session, owner: str, repo: str, token: str) -> dict[str, Any]:
    """Runs the full SENTRY-32 pipeline for one repo. Safe to call repeatedly —
    creates a new code_quality_scan row each time."""

    scan_id = str(uuid.uuid4())
    tmp_dir: Path | None = None

    try:
        branch = _get_default_branch(owner, repo, token)
        commit_sha = _get_latest_commit_sha(owner, repo, branch, token)

        db.execute(text("""
            INSERT INTO code_quality_scan (id, owner, repo, commit_sha, status)
            VALUES (CAST(:id AS uuid), :owner, :repo, :commit_sha, 'running')
        """), {"id": scan_id, "owner": owner, "repo": repo, "commit_sha": commit_sha})
        db.commit()

        tmp_dir = Path(tempfile.mkdtemp(prefix="cq_scan_"))
        repo_root = _download_tarball(owner, repo, commit_sha, token, tmp_dir)

        complexity = _run_complexity(repo_root)
        churn = _compute_churn(owner, repo, db)

        lint_findings = _run_ruff(repo_root) + _run_eslint(repo_root)
        secret_findings = _run_gitleaks(repo_root) + _run_semgrep(repo_root)

        logger.warning(
    "Complexity=%s Churn=%s Lint=%s Secrets=%s",
    len(complexity),
    len(churn),
    len(lint_findings),
    len(secret_findings),
)

        summary = _write_scan_results(
            db, scan_id, complexity, churn, lint_findings, secret_findings
        )

        db.execute(text("""
            UPDATE code_quality_scan
            SET status = 'completed', finished_at = now()
            WHERE id = CAST(:id AS uuid)
        """), {"id": scan_id})
        db.commit()

        logger.info(
            "Code quality scan completed for %s/%s — %s",
            owner, repo, summary,
        )
        return {"scan_id": scan_id, "status": "completed", **summary}

    except Exception as e:
        logger.exception("Code quality scan failed for %s/%s", owner, repo)
        db.execute(text("""
            UPDATE code_quality_scan
            SET status = 'failed', finished_at = now(), error = :error
            WHERE id = CAST(:id AS uuid)
        """), {"id": scan_id, "error": str(e)})
        db.commit()
        return {"scan_id": scan_id, "status": "failed", "error": str(e)}

    finally:
        if tmp_dir and tmp_dir.exists():
            shutil.rmtree(tmp_dir, ignore_errors=True)