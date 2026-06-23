FROM python:3.12-slim

WORKDIR /app

# ── System deps ───────────────────────────────────────────────────────────────
# curl + tar are needed to download the gitleaks binary.
# nodejs + npm are needed for eslint (JS/TS lint).
# build-essential is needed by some Python packages (e.g. psycopg2 fallback).
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    tar \
    nodejs \
    npm \
    build-essential \
  && rm -rf /var/lib/apt/lists/*

# ── gitleaks (Go binary — not a pip package) ──────────────────────────────────
# Pinned to a specific release so builds are reproducible.
RUN curl -sSL \
    https://github.com/gitleaks/gitleaks/releases/download/v8.21.2/gitleaks_8.21.2_linux_x64.tar.gz \
    | tar -xz -C /usr/local/bin gitleaks \
  && chmod +x /usr/local/bin/gitleaks

# ── Python deps (including ruff, lizard, semgrep) ────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--reload"]