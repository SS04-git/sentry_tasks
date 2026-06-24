-- ============================================================
-- SENTRY COMPLETE DATABASE SETUP - CLEAN VERSION
-- Drop everything first, then recreate
-- ============================================================

-- ── DROP everything ──────────────────────────────────────────

DROP VIEW IF EXISTS v_entry_exit_imbalance CASCADE;
DROP VIEW IF EXISTS v_denied_access CASCADE;
DROP VIEW IF EXISTS v_mobile_adoption CASCADE;
DROP VIEW IF EXISTS v_occupancy_trend CASCADE;
DROP VIEW IF EXISTS v_occupancy_hourly CASCADE;
DROP VIEW IF EXISTS v_occupancy_daily_peak CASCADE;
DROP VIEW IF EXISTS v_occupancy_series CASCADE;
DROP VIEW IF EXISTS v_attendance_weekly_trend CASCADE;
DROP VIEW IF EXISTS v_attendance_kpi CASCADE;
DROP VIEW IF EXISTS v_attendance_daily CASCADE;

DROP TABLE IF EXISTS anomaly_review_queue CASCADE;
DROP TABLE IF EXISTS git_sync_status CASCADE;
DROP TABLE IF EXISTS git_reviews CASCADE;
DROP TABLE IF EXISTS git_file_changes CASCADE;
DROP TABLE IF EXISTS git_pull_requests CASCADE;
DROP TABLE IF EXISTS git_contributor_stats CASCADE;
DROP TABLE IF EXISTS git_commits CASCADE;
DROP TABLE IF EXISTS git_repos CASCADE;
DROP TABLE IF EXISTS github_accounts CASCADE;
DROP TABLE IF EXISTS fact_access_event CASCADE;
DROP TABLE IF EXISTS raw_access_events CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS alembic_version CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP TYPE IF EXISTS role_enum CASCADE;

-- ── STEP 1: Core tables ──────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE role_enum AS ENUM ('admin', 'leadership', 'manager', 'employee');

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    role role_enum NOT NULL DEFAULT 'employee',
    is_active BOOLEAN DEFAULT true,
    full_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    action VARCHAR(100) NOT NULL,
    performed_by VARCHAR(255) NOT NULL,
    target_user VARCHAR(255),
    detail TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE raw_access_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payload JSONB NOT NULL,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE fact_access_event (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id VARCHAR NOT NULL,
    event_ts TIMESTAMP WITH TIME ZONE NOT NULL,
    direction VARCHAR NOT NULL,
    source_event_id UUID,
    access_method VARCHAR,
    access_result TEXT DEFAULT 'granted',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_access_event UNIQUE (person_id, event_ts, direction)
);

CREATE TABLE github_accounts (
    id SERIAL PRIMARY KEY,
    user_id BIGINT,
    github_id BIGINT UNIQUE NOT NULL,
    github_login VARCHAR(255) NOT NULL,
    access_token TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE git_repos (
    id SERIAL PRIMARY KEY,
    github_account_id INTEGER REFERENCES github_accounts(id),
    repo_id BIGINT UNIQUE NOT NULL,
    owner VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    description TEXT,
    private BOOLEAN DEFAULT false,
    language VARCHAR(100),
    default_branch VARCHAR(100) DEFAULT 'main',
    stars INTEGER DEFAULT 0,
    forks INTEGER DEFAULT 0,
    open_issues INTEGER DEFAULT 0,
    synced_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE git_commits (
    id SERIAL PRIMARY KEY,
    repo_id BIGINT REFERENCES git_repos(repo_id),
    sha VARCHAR(40) UNIQUE NOT NULL,
    short_sha VARCHAR(7) NOT NULL,
    message TEXT NOT NULL,
    author_name VARCHAR(255),
    author_email VARCHAR(255),
    author_github_login VARCHAR(255),
    committed_at TIMESTAMP NOT NULL,
    additions INTEGER DEFAULT 0,
    deletions INTEGER DEFAULT 0,
    files_changed INTEGER DEFAULT 0,
    url TEXT,
    synced_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE git_contributor_stats (
    id SERIAL PRIMARY KEY,
    repo_id BIGINT REFERENCES git_repos(repo_id),
    github_login VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    total_commits INTEGER DEFAULT 0,
    total_additions INTEGER DEFAULT 0,
    total_deletions INTEGER DEFAULT 0,
    synced_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(repo_id, github_login)
);

CREATE TABLE git_pull_requests (
    id SERIAL PRIMARY KEY,
    repo_id BIGINT REFERENCES git_repos(repo_id),
    pr_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    state VARCHAR(20) NOT NULL,
    author_login VARCHAR(255),
    author_avatar TEXT,
    merged BOOLEAN DEFAULT false,
    draft BOOLEAN DEFAULT false,
    commits INTEGER DEFAULT 0,
    additions INTEGER DEFAULT 0,
    deletions INTEGER DEFAULT 0,
    changed_files INTEGER DEFAULT 0,
    opened_at TIMESTAMP,
    merged_at TIMESTAMP,
    closed_at TIMESTAMP,
    url TEXT,
    synced_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(repo_id, pr_number)
);

CREATE TABLE git_file_changes (
    id SERIAL PRIMARY KEY,
    commit_sha VARCHAR(40) REFERENCES git_commits(sha) ON DELETE CASCADE,
    repo_id BIGINT REFERENCES git_repos(repo_id),
    filename TEXT NOT NULL,
    status VARCHAR(20),
    additions INTEGER DEFAULT 0,
    deletions INTEGER DEFAULT 0,
    changes INTEGER DEFAULT 0,
    patch TEXT,
    synced_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE git_reviews (
    id SERIAL PRIMARY KEY,
    repo_id BIGINT REFERENCES git_repos(repo_id),
    pr_number INTEGER NOT NULL,
    reviewer_login VARCHAR(255),
    reviewer_avatar TEXT,
    state VARCHAR(50),
    submitted_at TIMESTAMP,
    url TEXT,
    synced_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE git_sync_status (
    id SERIAL PRIMARY KEY,
    repo_full_name VARCHAR(255) UNIQUE NOT NULL,
    last_sync_at TIMESTAMP,
    last_sync_status VARCHAR(20) DEFAULT 'pending',
    last_error TEXT,
    commits_synced INTEGER DEFAULT 0,
    prs_synced INTEGER DEFAULT 0,
    rate_limit_remaining INTEGER,
    rate_limit_reset TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE anomaly_review_queue (
    id SERIAL PRIMARY KEY,
    person_id TEXT NOT NULL,
    event_ts TIMESTAMP,
    anomaly_type TEXT NOT NULL,
    score NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewer TEXT,
    review_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL,
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- ── STEP 2: Indexes (no expression indexes) ──────────────────

CREATE INDEX idx_git_commits_repo      ON git_commits(repo_id);
CREATE INDEX idx_git_commits_author    ON git_commits(author_github_login);
CREATE INDEX idx_git_commits_date      ON git_commits(committed_at);
CREATE INDEX idx_git_prs_repo          ON git_pull_requests(repo_id);
CREATE INDEX idx_git_prs_state         ON git_pull_requests(state);
CREATE INDEX idx_git_contributor_repo  ON git_contributor_stats(repo_id);
CREATE INDEX idx_git_file_changes_sha  ON git_file_changes(commit_sha);
CREATE INDEX idx_git_file_changes_repo ON git_file_changes(repo_id);
CREATE INDEX idx_git_reviews_repo_pr   ON git_reviews(repo_id, pr_number);
CREATE INDEX idx_fact_access_person_ts ON fact_access_event(person_id, event_ts DESC);
CREATE INDEX idx_fact_access_direction ON fact_access_event(direction);
CREATE INDEX idx_fact_access_ts_only   ON fact_access_event(event_ts);

-- ── STEP 3: Seed users ───────────────────────────────────────

INSERT INTO alembic_version (version_num) VALUES ('heads');

INSERT INTO users (email, hashed_password, role, is_active, full_name) VALUES
  ('admin@sentry.com',    '$2b$12$mhQKJEbhiXBxAEXPPFeIa.1.B4e5a.DEvVU40hYYuttMCLRFcCteW', 'admin',      true, 'Admin User'),
  ('employee@sentry.com', '$2b$12$FvHkSa4ZsKJ0zJdP3A2uH.72a9vcG9wPVUt7L0R9LxS9BKym1A3y6', 'employee',   true, 'Test Employee'),
  ('manager@sentry.com',  '$2b$12$SM7wmv8z4DqIRzO1uB17suDKpSKM0FpwXSqIVl1Gz0fhz/lQ5HKEi', 'manager',    true, 'Test Manager'),
  ('leader@sentry.com',   '$2b$12$WOvs8u04b4LVjnkq2/IK6eYF6btqA9ey/Qrgy01CVYxNWZLc90dvK', 'leadership', true, 'Test Leadership'),
  ('employee2@sentry.com','$2b$12$duBlevhaS/VW66jE6dvP4.cu5y1jweSzoZENL81eoiVxZouPf2TSi', 'employee',   true, 'Second Employee');

-- ── STEP 4: Seed access events ───────────────────────────────

INSERT INTO fact_access_event (id, person_id, event_ts, direction, created_at)
SELECT
    gen_random_uuid(),
    u.person_id,
    (date_trunc('day', day)
        + interval '8 hours'
        + (random() * interval '2 hours')
        + (random() * interval '10 minutes')
    ) AT TIME ZONE 'UTC',
    'entry',
    now()
FROM
    (SELECT generate_series(
        current_date - interval '60 days',
        current_date - interval '1 day',
        interval '1 day'
    ) AS day) days
    CROSS JOIN (VALUES ('1'),('2'),('3'),('4'),('5')) AS u(person_id)
WHERE
    EXTRACT(DOW FROM day) BETWEEN 1 AND 5
    AND random() < 0.85
ON CONFLICT ON CONSTRAINT uq_access_event DO NOTHING;

INSERT INTO fact_access_event (id, person_id, event_ts, direction, created_at)
SELECT
    gen_random_uuid(),
    e.person_id,
    e.event_ts + interval '6 hours' + (random() * interval '3 hours'),
    'exit',
    now()
FROM fact_access_event e
WHERE e.direction = 'entry'
  AND NOT EXISTS (
      SELECT 1 FROM fact_access_event x
      WHERE x.person_id = e.person_id
        AND x.direction = 'exit'
        AND DATE(x.event_ts AT TIME ZONE 'UTC') = DATE(e.event_ts AT TIME ZONE 'UTC')
  )
ON CONFLICT ON CONSTRAINT uq_access_event DO NOTHING;

-- ── STEP 5: Attendance views ──────────────────────────────────

CREATE OR REPLACE VIEW v_attendance_daily AS
SELECT
    person_id,
    DATE(event_ts AT TIME ZONE 'UTC')                   AS work_date,
    MIN(event_ts) FILTER (WHERE direction = 'entry')    AS first_entry,
    MAX(event_ts) FILTER (WHERE direction = 'exit')     AS last_exit,
    EXTRACT(EPOCH FROM (
        MAX(event_ts) FILTER (WHERE direction = 'exit')
      - MIN(event_ts) FILTER (WHERE direction = 'entry')
    )) / 3600.0                                         AS session_hours
FROM fact_access_event
GROUP BY person_id, DATE(event_ts AT TIME ZONE 'UTC');

CREATE OR REPLACE VIEW v_attendance_kpi AS
WITH base AS (
    SELECT * FROM v_attendance_daily
    WHERE work_date >= current_date - interval '30 days'
),
working_days AS (
    SELECT COUNT(*) AS total_working_days
    FROM generate_series(
        current_date - interval '30 days',
        current_date - interval '1 day',
        interval '1 day'
    ) d
    WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 5
)
SELECT
    b.person_id,
    COUNT(DISTINCT b.work_date)                         AS days_present,
    wd.total_working_days,
    ROUND(COUNT(DISTINCT b.work_date)::numeric
        / NULLIF(wd.total_working_days, 0) * 100, 1)   AS attendance_pct,
    ROUND(AVG(
        EXTRACT(HOUR FROM b.first_entry AT TIME ZONE 'UTC') * 60
      + EXTRACT(MINUTE FROM b.first_entry AT TIME ZONE 'UTC')
    )::numeric, 1)                                      AS avg_arrival_minutes,
    ROUND(STDDEV(
        EXTRACT(HOUR FROM b.first_entry AT TIME ZONE 'UTC') * 60
      + EXTRACT(MINUTE FROM b.first_entry AT TIME ZONE 'UTC')
    )::numeric, 1)                                      AS arrival_stddev_minutes,
    ROUND(AVG(b.session_hours)::numeric, 2)             AS avg_session_hours,
    ROUND(SUM(b.session_hours)::numeric, 2)             AS total_session_hours
FROM base b
CROSS JOIN working_days wd
WHERE b.first_entry IS NOT NULL
GROUP BY b.person_id, wd.total_working_days;

CREATE OR REPLACE VIEW v_attendance_weekly_trend AS
SELECT
    person_id,
    date_trunc('week', work_date)::date                 AS week_start,
    COUNT(DISTINCT work_date)                           AS days_present,
    ROUND(AVG(session_hours)::numeric, 2)               AS avg_session_hours,
    ROUND(AVG(
        EXTRACT(HOUR FROM first_entry AT TIME ZONE 'UTC') * 60
      + EXTRACT(MINUTE FROM first_entry AT TIME ZONE 'UTC')
    )::numeric, 1)                                      AS avg_arrival_minutes
FROM v_attendance_daily
WHERE work_date >= current_date - interval '8 weeks'
  AND first_entry IS NOT NULL
GROUP BY person_id, date_trunc('week', work_date)::date
ORDER BY person_id, week_start;

-- ── STEP 6: Occupancy views ───────────────────────────────────

CREATE OR REPLACE VIEW v_occupancy_series AS
SELECT
    event_ts,
    person_id,
    direction,
    CASE direction WHEN 'entry' THEN 1 ELSE -1 END      AS delta,
    SUM(CASE direction WHEN 'entry' THEN 1 ELSE -1 END)
        OVER (ORDER BY event_ts
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
                                                        AS running_count,
    DATE(event_ts AT TIME ZONE 'UTC')                   AS event_date
FROM fact_access_event
ORDER BY event_ts;

CREATE OR REPLACE VIEW v_occupancy_daily_peak AS
SELECT
    event_date,
    MAX(running_count)                                  AS peak_occupancy,
    MIN(running_count)                                  AS min_occupancy,
    ROUND(AVG(running_count)::numeric, 1)               AS avg_occupancy,
    COUNT(*)                                            AS event_count
FROM v_occupancy_series
GROUP BY event_date
ORDER BY event_date;

CREATE OR REPLACE VIEW v_occupancy_hourly AS
SELECT
    event_date,
    EXTRACT(HOUR FROM event_ts AT TIME ZONE 'UTC')::int AS hour_of_day,
    MAX(running_count)                                  AS peak_in_hour,
    ROUND(AVG(running_count)::numeric, 1)               AS avg_in_hour
FROM v_occupancy_series
GROUP BY event_date, EXTRACT(HOUR FROM event_ts AT TIME ZONE 'UTC')::int
ORDER BY event_date, hour_of_day;

CREATE OR REPLACE VIEW v_occupancy_trend AS
SELECT
    event_date,
    peak_occupancy,
    ROUND(AVG(peak_occupancy) OVER (
        ORDER BY event_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    )::numeric, 1)                                      AS ma7_peak,
    ROUND((
        REGR_SLOPE(peak_occupancy, EXTRACT(EPOCH FROM event_date::timestamp))
        OVER (ORDER BY event_date ROWS BETWEEN 13 PRECEDING AND CURRENT ROW)
        * 86400 * 7
    )::numeric, 2)                                      AS weekly_slope
FROM v_occupancy_daily_peak
ORDER BY event_date;

CREATE OR REPLACE VIEW v_mobile_adoption AS
SELECT
    DATE(event_ts AT TIME ZONE 'UTC')                   AS event_date,
    COUNT(*) FILTER (WHERE access_method = 'mobile')   AS mobile_events,
    COUNT(*) FILTER (WHERE access_method = 'card')     AS card_events,
    ROUND((100.0
        * COUNT(*) FILTER (WHERE access_method = 'mobile')
        / NULLIF(COUNT(*), 0)
    )::numeric, 2)                                      AS mobile_adoption_pct
FROM fact_access_event
GROUP BY DATE(event_ts AT TIME ZONE 'UTC')
ORDER BY event_date;

-- ── STEP 7: Anomaly views ─────────────────────────────────────

CREATE OR REPLACE VIEW v_denied_access AS
SELECT id, person_id, event_ts, access_method, access_result
FROM fact_access_event
WHERE access_result = 'denied';

CREATE OR REPLACE VIEW v_entry_exit_imbalance AS
SELECT
    person_id,
    DATE(event_ts AT TIME ZONE 'UTC')                   AS event_date,
    SUM(CASE WHEN direction = 'entry' THEN 1 ELSE 0 END) AS entries,
    SUM(CASE WHEN direction = 'exit'  THEN 1 ELSE 0 END) AS exits,
    ABS(
        SUM(CASE WHEN direction = 'entry' THEN 1 ELSE 0 END)
      - SUM(CASE WHEN direction = 'exit'  THEN 1 ELSE 0 END)
    )                                                   AS imbalance
FROM fact_access_event
GROUP BY person_id, DATE(event_ts AT TIME ZONE 'UTC')
HAVING ABS(
    SUM(CASE WHEN direction = 'entry' THEN 1 ELSE 0 END)
  - SUM(CASE WHEN direction = 'exit'  THEN 1 ELSE 0 END)
) > 0;

-- ── STEP 8: Sanity check ─────────────────────────────────────

SELECT 'users'                     AS label, COUNT(*) AS n FROM users
UNION ALL SELECT 'fact_access_event',         COUNT(*) FROM fact_access_event
UNION ALL SELECT 'v_attendance_daily',        COUNT(*) FROM v_attendance_daily
UNION ALL SELECT 'v_attendance_kpi',          COUNT(*) FROM v_attendance_kpi
UNION ALL SELECT 'v_attendance_weekly_trend', COUNT(*) FROM v_attendance_weekly_trend
UNION ALL SELECT 'v_occupancy_daily_peak',    COUNT(*) FROM v_occupancy_daily_peak
UNION ALL SELECT 'v_occupancy_trend',         COUNT(*) FROM v_occupancy_trend;





-- =========================
-- SENTRY-28 CLEAN REBUILD
-- =========================


-- =========================
-- DROP VIEWS (safe reset)
-- =========================

DROP VIEW IF EXISTS v_review_queue CASCADE;
DROP VIEW IF EXISTS v_access_enriched CASCADE;
DROP VIEW IF EXISTS v_denied_access CASCADE;
DROP VIEW IF EXISTS v_entry_exit_imbalance CASCADE;

CREATE TABLE IF NOT EXISTS access_review_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    event_id UUID NOT NULL,
    person_id TEXT NOT NULL,

    score DOUBLE PRECISION,
    reason TEXT,

    status TEXT DEFAULT 'pending',

    created_at TIMESTAMP DEFAULT now(),
    reviewed_at TIMESTAMP NULL,
    reviewed_by TEXT NULL,

    UNIQUE (event_id, person_id, status)
);

-- indexes
CREATE INDEX IF NOT EXISTS idx_access_review_status
ON access_review_queue(status);

CREATE INDEX IF NOT EXISTS idx_access_review_person
ON access_review_queue(person_id);

CREATE INDEX IF NOT EXISTS idx_access_review_event
ON access_review_queue(event_id);


--enriched view
CREATE OR REPLACE VIEW v_access_enriched AS
SELECT
    e.id,
    e.person_id,
    e.event_ts,
    e.direction,
    e.access_method,
    e.access_result,
    q.score,
    q.reason,
    q.status
FROM fact_access_event e
LEFT JOIN access_review_queue q
    ON e.id = q.event_id;


--safe seed
INSERT INTO access_review_queue (
    event_id,
    person_id,
    score,
    reason,
    status
)
SELECT
    id,
    person_id,
    0.8,
    'Synthetic anomaly seed',
    'pending'
FROM fact_access_event e
WHERE NOT EXISTS (
    SELECT 1
    FROM access_review_queue q
    WHERE q.event_id = e.id
      AND q.person_id = e.person_id
      AND q.status = 'pending'
)
ORDER BY random()
LIMIT 50;





-- =========================
-- SENTRY-29
-- =========================

--Denied access rate
CREATE OR REPLACE VIEW v_denied_access AS
SELECT
    person_id,
    COUNT(*) FILTER (WHERE access_result = 'denied') AS denied_count,
    COUNT(*) AS total_events,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE access_result = 'denied')
        / NULLIF(COUNT(*), 0),
        2
    ) AS denied_rate_pct
FROM fact_access_event
GROUP BY person_id;


--Entry/exit imbalance
CREATE OR REPLACE VIEW v_entry_exit_imbalance AS
SELECT
    person_id,
    DATE(event_ts) AS event_date,

    COUNT(*) FILTER (WHERE direction = 'entry') AS entry_count,
    COUNT(*) FILTER (WHERE direction = 'exit')  AS exit_count,

    COUNT(*) FILTER (WHERE direction = 'entry')
    - COUNT(*) FILTER (WHERE direction = 'exit') AS imbalance_score
FROM fact_access_event
GROUP BY person_id, DATE(event_ts);

--review queue
CREATE OR REPLACE VIEW v_review_queue AS
SELECT
    q.id,
    q.event_id,
    q.person_id,
    q.score,
    q.reason,
    q.status,
    q.created_at,
    e.event_ts,
    e.direction,
    e.access_result,
    e.access_method
FROM access_review_queue q
JOIN fact_access_event e
    ON e.id = q.event_id
WHERE q.status = 'pending';


SELECT COUNT(*) FROM v_review_queue;


DELETE FROM access_review_queue
WHERE reason = 'Synthetic anomaly seed';


INSERT INTO access_review_queue (event_id, person_id, score, reason, status)
SELECT id, person_id, round((random() * 0.5 + 0.5)::numeric, 2), 'Test anomaly', 'pending'
FROM fact_access_event
ORDER BY random()
LIMIT 10;

DROP VIEW IF EXISTS v_review_queue CASCADE;

CREATE VIEW v_review_queue AS
SELECT
    q.id,
    q.event_id,
    q.person_id,
    u.full_name,
    q.score,
    q.reason,
    q.status,
    q.created_at,
    e.event_ts,
    e.direction,
    e.access_result,
    e.access_method
FROM access_review_queue q
JOIN fact_access_event e ON e.id = q.event_id
LEFT JOIN users u ON u.id::text = q.person_id
WHERE q.status = 'pending';


-- SENTRY-28: Prevent duplicate review queue entries for the same event/person/status
-- This ensures the Isolation Forest job does NOT insert duplicates on repeated runs
ALTER TABLE access_review_queue
ADD CONSTRAINT uq_review_queue_event_person_status
UNIQUE (event_id, person_id, status);


-- SENTRY-28: Clean up previously generated ML anomaly entries
-- Removes Isolation Forest seeded anomalies so only fresh ML results exist
DELETE FROM access_review_queue
WHERE reason = 'Isolation Forest anomaly';







-- =====================================================
-- SENTRY-31  Code Quality schema/views
-- Per-file complexity & churn, lint findings, secret-scan alerts
-- =====================================================

-- ── Scan run tracking ────────────────────────────────
-- One row per scan invocation against a repo.
CREATE TABLE IF NOT EXISTS code_quality_scan (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner           TEXT NOT NULL,
    repo            TEXT NOT NULL,
    commit_sha      TEXT NOT NULL,
    started_at      TIMESTAMP DEFAULT now(),
    finished_at     TIMESTAMP NULL,
    status          TEXT DEFAULT 'running',   -- running | completed | failed
    error           TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_cq_scan_repo
    ON code_quality_scan(owner, repo);
CREATE INDEX IF NOT EXISTS idx_cq_scan_started
    ON code_quality_scan(started_at);


-- ── Per-file complexity & churn (E1, E2) ─────────────
CREATE TABLE IF NOT EXISTS code_quality_file_metric (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id         UUID NOT NULL REFERENCES code_quality_scan(id) ON DELETE CASCADE,

    file_path       TEXT NOT NULL,
    language        TEXT,                      -- python | typescript | javascript | tsx | other

    -- complexity (lizard)
    cyclomatic_complexity   INTEGER,
    function_count          INTEGER,
    avg_function_complexity DOUBLE PRECISION,
    nloc                     INTEGER,           -- non-comment lines of code

    -- churn (git diff/blame over a lookback window)
    lines_added      INTEGER DEFAULT 0,
    lines_removed    INTEGER DEFAULT 0,
    commit_count      INTEGER DEFAULT 0,        -- commits touching this file in window
    churn_window_days INTEGER DEFAULT 30,

    created_at      TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cq_file_scan
    ON code_quality_file_metric(scan_id);
CREATE INDEX IF NOT EXISTS idx_cq_file_path
    ON code_quality_file_metric(file_path);
CREATE INDEX IF NOT EXISTS idx_cq_file_complexity
    ON code_quality_file_metric(cyclomatic_complexity);


-- ── Lint findings (E3) ────────────────────────────────
CREATE TABLE IF NOT EXISTS code_quality_lint_finding (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id         UUID NOT NULL REFERENCES code_quality_scan(id) ON DELETE CASCADE,

    file_path       TEXT NOT NULL,
    line_number     INTEGER,
    column_number   INTEGER,

    tool            TEXT NOT NULL,        -- eslint | ruff
    rule_id         TEXT,                  -- e.g. no-unused-vars, E501
    severity        TEXT,                  -- error | warning | info
    message         TEXT,

    created_at      TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cq_lint_scan
    ON code_quality_lint_finding(scan_id);
CREATE INDEX IF NOT EXISTS idx_cq_lint_severity
    ON code_quality_lint_finding(severity);
CREATE INDEX IF NOT EXISTS idx_cq_lint_file
    ON code_quality_lint_finding(file_path);


-- ── Secret / vuln scan alerts (E4, E5) ───────────────
CREATE TABLE IF NOT EXISTS code_quality_secret_alert (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id         UUID NOT NULL REFERENCES code_quality_scan(id) ON DELETE CASCADE,

    file_path       TEXT NOT NULL,
    line_number     INTEGER,

    tool            TEXT NOT NULL,        -- gitleaks | semgrep
    rule_id         TEXT,                  -- e.g. generic-api-key, aws-access-key
    severity        TEXT,                  -- critical | high | medium | low
    description     TEXT,
    secret_snippet  TEXT,                  -- redacted/truncated, never full secret
    commit_sha      TEXT,

    status          TEXT DEFAULT 'open',   -- open | acknowledged | resolved | false_positive
    acknowledged_by TEXT NULL,
    acknowledged_at TIMESTAMP NULL,

    created_at      TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cq_secret_scan
    ON code_quality_secret_alert(scan_id);
CREATE INDEX IF NOT EXISTS idx_cq_secret_status
    ON code_quality_secret_alert(status);
CREATE INDEX IF NOT EXISTS idx_cq_secret_severity
    ON code_quality_secret_alert(severity);


-- =====================================================
-- VIEWS
-- =====================================================

-- latest completed scan per repo
CREATE OR REPLACE VIEW v_cq_latest_scan AS
SELECT DISTINCT ON (owner, repo)
    id AS scan_id, owner, repo, commit_sha, started_at, finished_at
FROM code_quality_scan
WHERE status = 'completed'
ORDER BY owner, repo, finished_at DESC;


-- complexity summary per repo (latest scan only)
CREATE OR REPLACE VIEW v_cq_complexity_summary AS
SELECT
    ls.owner,
    ls.repo,
    ls.scan_id,
    ls.finished_at,
    COUNT(*) AS file_count,
    ROUND(AVG(fm.cyclomatic_complexity)::numeric, 2) AS avg_complexity,
    MAX(fm.cyclomatic_complexity) AS max_complexity,
    COUNT(*) FILTER (WHERE fm.cyclomatic_complexity > 10) AS high_complexity_files
FROM v_cq_latest_scan ls
JOIN code_quality_file_metric fm ON fm.scan_id = ls.scan_id
GROUP BY ls.owner, ls.repo, ls.scan_id, ls.finished_at;


-- churn summary per repo (latest scan only)
CREATE OR REPLACE VIEW v_cq_churn_summary AS
SELECT
    ls.owner,
    ls.repo,
    ls.scan_id,
    ls.finished_at,
    SUM(fm.lines_added)   AS total_lines_added,
    SUM(fm.lines_removed) AS total_lines_removed,
    SUM(fm.commit_count)  AS total_commits,
    COUNT(*) FILTER (
        WHERE fm.commit_count >= 5
    ) AS high_churn_files
FROM v_cq_latest_scan ls
JOIN code_quality_file_metric fm ON fm.scan_id = ls.scan_id
GROUP BY ls.owner, ls.repo, ls.scan_id, ls.finished_at;


-- lint density per repo (latest scan only)
CREATE OR REPLACE VIEW v_cq_lint_density AS
SELECT
    ls.owner,
    ls.repo,
    ls.scan_id,
    ls.finished_at,
    COUNT(*) AS total_findings,
    COUNT(*) FILTER (WHERE lf.severity = 'error')   AS error_count,
    COUNT(*) FILTER (WHERE lf.severity = 'warning') AS warning_count,
    ROUND(
        COUNT(*)::numeric / NULLIF(
            (SELECT SUM(fm.nloc) FROM code_quality_file_metric fm WHERE fm.scan_id = ls.scan_id), 0
        ) * 1000, 2
    ) AS findings_per_kloc
FROM v_cq_latest_scan ls
JOIN code_quality_lint_finding lf ON lf.scan_id = ls.scan_id
GROUP BY ls.owner, ls.repo, ls.scan_id, ls.finished_at;


-- open secret/vuln alerts feed (across all scans, not just latest)
CREATE OR REPLACE VIEW v_cq_secret_alerts_open AS
SELECT
    sa.id,
    s.owner,
    s.repo,
    sa.file_path,
    sa.line_number,
    sa.tool,
    sa.rule_id,
    sa.severity,
    sa.description,
    sa.commit_sha,
    sa.status,
    sa.created_at
FROM code_quality_secret_alert sa
JOIN code_quality_scan s ON s.id = sa.scan_id
WHERE sa.status = 'open'
ORDER BY
    CASE sa.severity
        WHEN 'critical' THEN 1
        WHEN 'high'     THEN 2
        WHEN 'medium'   THEN 3
        ELSE 4
    END,
    sa.created_at DESC;


-- complexity trend over time, per repo (all scans, daily granularity)
CREATE OR REPLACE VIEW v_cq_complexity_trend AS
SELECT
    s.owner,
    s.repo,
    DATE(s.finished_at) AS scan_date,
    ROUND(AVG(fm.cyclomatic_complexity)::numeric, 2) AS avg_complexity,
    COUNT(*) FILTER (WHERE fm.cyclomatic_complexity > 10) AS high_complexity_files
FROM code_quality_scan s
JOIN code_quality_file_metric fm ON fm.scan_id = s.id
WHERE s.status = 'completed'
GROUP BY s.owner, s.repo, DATE(s.finished_at)
ORDER BY scan_date;




-- ─────────────────────────────────────────────────────────────────────────────
-- SENTRY-35  DORA Delivery Metrics — aggregation views
-- Run with:
--   type backend\app\scripts\dora_views.sql | docker exec -i sentry-db-1 psql -U postgres -d sentry_db
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS v_dora_kpi_summary        CASCADE;
DROP VIEW IF EXISTS v_dora_szz_blame          CASCADE;
DROP VIEW IF EXISTS v_dora_review_latency     CASCADE;
DROP VIEW IF EXISTS v_dora_time_to_restore    CASCADE;
DROP VIEW IF EXISTS v_dora_change_failure_rate CASCADE;
DROP VIEW IF EXISTS v_dora_lead_time          CASCADE;
DROP VIEW IF EXISTS v_dora_deployment_freq    CASCADE;


-- ── F1: Deployment Frequency ──────────────────────────────────────────────────
-- Merged PRs are the deployment proxy. One row per repo per week.

CREATE VIEW v_dora_deployment_freq AS
SELECT
    r.owner,
    r.name                                             AS repo,
    r.full_name,
    DATE_TRUNC('week', pr.merged_at)::date             AS week,
    COUNT(*)                                           AS deployments
FROM git_pull_requests pr
JOIN git_repos r ON r.repo_id = pr.repo_id
WHERE pr.merged = true
  AND pr.merged_at IS NOT NULL
GROUP BY r.owner, r.name, r.full_name,
         DATE_TRUNC('week', pr.merged_at)::date
ORDER BY week DESC;


-- ── F2: Lead Time for Change ──────────────────────────────────────────────────
-- Time from PR opened → merged, in hours. One row per repo per week.

CREATE VIEW v_dora_lead_time AS
SELECT
    r.owner,
    r.name                                                       AS repo,
    r.full_name,
    DATE_TRUNC('week', pr.merged_at)::date                       AS week,
    ROUND(AVG(
        EXTRACT(EPOCH FROM (pr.merged_at - pr.opened_at)) / 3600.0
    )::numeric, 2)                                               AS avg_lead_time_hours,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (pr.merged_at - pr.opened_at)) / 3600.0
    )::numeric, 2)                                               AS median_lead_time_hours,
    COUNT(*)                                                     AS pr_count
FROM git_pull_requests pr
JOIN git_repos r ON r.repo_id = pr.repo_id
WHERE pr.merged = true
  AND pr.merged_at IS NOT NULL
  AND pr.opened_at IS NOT NULL
  AND pr.merged_at > pr.opened_at      -- sanity guard
GROUP BY r.owner, r.name, r.full_name,
         DATE_TRUNC('week', pr.merged_at)::date
ORDER BY week DESC;


-- ── F3: Change Failure Rate ────────────────────────────────────────────────────
-- Fix/hotfix/bug/revert PRs as a percentage of total merged PRs, per week.

CREATE VIEW v_dora_change_failure_rate AS
SELECT
    r.owner,
    r.name                                                       AS repo,
    r.full_name,
    DATE_TRUNC('week', pr.merged_at)::date                       AS week,
    COUNT(*)                                                     AS total_deployments,
    COUNT(*) FILTER (
        WHERE pr.title ~* '\y(fix|bug|hotfix|revert|patch|incident|rollback)\y'
    )                                                            AS failed_deployments,
    ROUND(
        COUNT(*) FILTER (
            WHERE pr.title ~* '\y(fix|bug|hotfix|revert|patch|incident|rollback)\y'
        )::numeric
        / NULLIF(COUNT(*), 0) * 100, 1
    )                                                            AS failure_rate_pct
FROM git_pull_requests pr
JOIN git_repos r ON r.repo_id = pr.repo_id
WHERE pr.merged = true
  AND pr.merged_at IS NOT NULL
GROUP BY r.owner, r.name, r.full_name,
         DATE_TRUNC('week', pr.merged_at)::date
ORDER BY week DESC;


-- ── F4: Time to Restore ───────────────────────────────────────────────────────
-- Duration of "fix" PRs (opened → merged). Proxy for MTTR.

CREATE VIEW v_dora_time_to_restore AS
SELECT
    r.owner,
    r.name                                                       AS repo,
    r.full_name,
    DATE_TRUNC('week', pr.merged_at)::date                       AS week,
    ROUND(AVG(
        EXTRACT(EPOCH FROM (pr.merged_at - pr.opened_at)) / 3600.0
    )::numeric, 2)                                               AS avg_restore_hours,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (pr.merged_at - pr.opened_at)) / 3600.0
    )::numeric, 2)                                               AS median_restore_hours,
    COUNT(*)                                                     AS fix_pr_count
FROM git_pull_requests pr
JOIN git_repos r ON r.repo_id = pr.repo_id
WHERE pr.merged = true
  AND pr.merged_at IS NOT NULL
  AND pr.opened_at IS NOT NULL
  AND pr.merged_at > pr.opened_at
  AND pr.title ~* '\y(fix|bug|hotfix|revert|patch|incident|rollback)\y'
GROUP BY r.owner, r.name, r.full_name,
         DATE_TRUNC('week', pr.merged_at)::date
ORDER BY week DESC;


-- ── F5: PR Review Latency ─────────────────────────────────────────────────────
-- Time from PR opened → first review, and first review → merged. Per week.

CREATE VIEW v_dora_review_latency AS
SELECT
    r.owner,
    r.name                                                       AS repo,
    r.full_name,
    DATE_TRUNC('week', pr.merged_at)::date                       AS week,
    ROUND(AVG(
        EXTRACT(EPOCH FROM (first_rv.first_review_at - pr.opened_at)) / 3600.0
    )::numeric, 2)                                               AS avg_time_to_first_review_hours,
    ROUND(AVG(
        EXTRACT(EPOCH FROM (pr.merged_at - first_rv.first_review_at)) / 3600.0
    )::numeric, 2)                                               AS avg_review_to_merge_hours,
    ROUND(AVG(
        EXTRACT(EPOCH FROM (pr.merged_at - pr.opened_at)) / 3600.0
    )::numeric, 2)                                               AS avg_total_cycle_hours,
    COUNT(*)                                                     AS pr_count
FROM git_pull_requests pr
JOIN git_repos r ON r.repo_id = pr.repo_id
JOIN (
    SELECT repo_id, pr_number, MIN(submitted_at) AS first_review_at
    FROM git_reviews
    WHERE submitted_at IS NOT NULL
    GROUP BY repo_id, pr_number
) first_rv ON first_rv.repo_id = pr.repo_id
          AND first_rv.pr_number = pr.pr_number
WHERE pr.merged = true
  AND pr.merged_at IS NOT NULL
  AND pr.opened_at IS NOT NULL
  AND first_rv.first_review_at > pr.opened_at
GROUP BY r.owner, r.name, r.full_name,
         DATE_TRUNC('week', pr.merged_at)::date
ORDER BY week DESC;


-- ── F7: SZZ Blame ────────────────────────────────────────────────────────────
-- Links each fix commit back to the most recent non-fix commit that last
-- touched the same file — the likely bug-introducing commit.

CREATE VIEW v_dora_szz_blame AS
SELECT
    r.owner,
    r.name                      AS repo,
    r.full_name,
    fix_c.sha                   AS fix_sha,
    fix_c.short_sha             AS fix_short_sha,
    fix_c.message               AS fix_message,
    fix_c.committed_at          AS fix_committed_at,
    fix_c.author_github_login   AS fix_author,
    fc.filename                 AS affected_file,
    bug_c.sha                   AS bug_sha,
    bug_c.short_sha             AS bug_short_sha,
    bug_c.message               AS bug_message,
    bug_c.committed_at          AS bug_committed_at,
    bug_c.author_github_login   AS bug_author,
    ROUND(
        EXTRACT(EPOCH FROM (fix_c.committed_at - bug_c.committed_at))
        / 3600.0
    )::int                      AS hours_from_bug_to_fix
FROM git_commits fix_c
JOIN git_repos r       ON r.repo_id = fix_c.repo_id
JOIN git_file_changes fc ON fc.commit_sha = fix_c.sha
JOIN LATERAL (
    -- most recent prior commit that touched the same file and is NOT itself a fix
    SELECT c2.sha, c2.short_sha, c2.message, c2.committed_at, c2.author_github_login
    FROM git_file_changes fc2
    JOIN git_commits c2 ON c2.sha = fc2.commit_sha
    WHERE fc2.filename    = fc.filename
      AND c2.repo_id      = fix_c.repo_id
      AND c2.committed_at < fix_c.committed_at
      AND NOT (c2.message ~* '\y(fix|bug|hotfix|revert|patch|rollback)\y')
    ORDER BY c2.committed_at DESC
    LIMIT 1
) bug_c ON true
WHERE fix_c.message ~* '\y(fix|bug|hotfix|revert|patch|rollback)\y';


-- ── KPI Summary (last 30 days, one row per repo) ─────────────────────────────
-- Used for the four headline KPI cards on the dashboard.

CREATE VIEW v_dora_kpi_summary AS
SELECT
    r.owner,
    r.name                                                               AS repo,
    r.full_name,

    -- Deployment Frequency: avg deployments per week over last 4 completed weeks
    ROUND(
        COUNT(*) FILTER (
            WHERE pr.merged_at >= NOW() - INTERVAL '28 days'
        )::numeric / 4.0, 2
    )                                                                    AS deployments_per_week,

    -- Lead Time: avg hours, last 30 days
    ROUND(AVG(
        EXTRACT(EPOCH FROM (pr.merged_at - pr.opened_at)) / 3600.0
    ) FILTER (
        WHERE pr.merged_at >= NOW() - INTERVAL '30 days'
          AND pr.opened_at IS NOT NULL
          AND pr.merged_at > pr.opened_at
    )::numeric, 2)                                                       AS avg_lead_time_hours,

    -- Change Failure Rate: last 30 days
    ROUND(
        COUNT(*) FILTER (
            WHERE pr.merged_at >= NOW() - INTERVAL '30 days'
              AND pr.title ~* '\y(fix|bug|hotfix|revert|patch|incident|rollback)\y'
        )::numeric
        / NULLIF(
            COUNT(*) FILTER (WHERE pr.merged_at >= NOW() - INTERVAL '30 days'),
          0) * 100, 1
    )                                                                    AS change_failure_rate_pct,

    -- Time to Restore: avg hours for fix PRs, last 30 days
    ROUND(AVG(
        EXTRACT(EPOCH FROM (pr.merged_at - pr.opened_at)) / 3600.0
    ) FILTER (
        WHERE pr.merged_at >= NOW() - INTERVAL '30 days'
          AND pr.opened_at IS NOT NULL
          AND pr.merged_at > pr.opened_at
          AND pr.title ~* '\y(fix|bug|hotfix|revert|patch|incident|rollback)\y'
    )::numeric, 2)                                                       AS avg_restore_hours

FROM git_pull_requests pr
JOIN git_repos r ON r.repo_id = pr.repo_id
WHERE pr.merged = true
  AND pr.merged_at IS NOT NULL
GROUP BY r.owner, r.name, r.full_name;


-- Verify
SELECT table_name FROM information_schema.tables
WHERE table_name LIKE 'v_dora_%'
ORDER BY table_name;



--roi
CREATE TABLE roi_tracking (
    id SERIAL PRIMARY KEY,
    quarter VARCHAR(20) NOT NULL,
    rework_savings FLOAT DEFAULT 0,
    delivery_savings FLOAT DEFAULT 0,
    facilities_savings FLOAT DEFAULT 0,
    incident_avoidance FLOAT DEFAULT 0,
    realised_value FLOAT DEFAULT 0,
    model_value FLOAT DEFAULT 0
);

INSERT INTO roi_tracking
(
 quarter,
 rework_savings,
 delivery_savings,
 facilities_savings,
 incident_avoidance,
 realised_value,
 model_value
)
VALUES
('2025-Q1', 12000, 5000, 3000, 4000, 18000, 22000),
('2025-Q2', 14000, 6500, 3500, 5000, 22000, 25000),
('2025-Q3', 16000, 8000, 4000, 6000, 28000, 30000);



--dora and defect risk issues
-- Check the actual values first
UPDATE git_pull_requests 
SET 
  opened_at = merged_at,
  merged_at = closed_at,
  closed_at = opened_at
WHERE merged = true;

-- Remove venv and cache files from git_file_changes
DELETE FROM git_file_changes 
WHERE filename LIKE '%/venv/%'
   OR filename LIKE '%/.venv/%'
   OR filename LIKE '%__pycache__%'
   OR filename LIKE '%.pyc'
   OR filename LIKE '%.gz'
   OR filename LIKE '%.pkl';

-- Remove the bad PRs so re-sync writes clean data
DELETE FROM git_reviews;
DELETE FROM git_pull_requests;





-- ============================================================
-- CODE QUALITY VIEWS
-- ============================================================

DROP VIEW IF EXISTS v_cq_latest_scan CASCADE;
DROP VIEW IF EXISTS v_cq_complexity_summary CASCADE;
DROP VIEW IF EXISTS v_cq_complexity_trend CASCADE;
DROP VIEW IF EXISTS v_cq_churn_summary CASCADE;
DROP VIEW IF EXISTS v_cq_lint_density CASCADE;
DROP VIEW IF EXISTS v_cq_secret_alerts_open CASCADE;

-- ============================================================
-- Latest completed scan per repository
-- ============================================================

CREATE OR REPLACE VIEW v_cq_latest_scan AS
SELECT DISTINCT ON (owner, repo)
       id AS scan_id,
       owner,
       repo,
       commit_sha,
       started_at,
       finished_at
FROM code_quality_scan
WHERE status = 'completed'
ORDER BY owner, repo, finished_at DESC;

-- ============================================================
-- Complexity Summary
-- ============================================================

CREATE OR REPLACE VIEW v_cq_complexity_summary AS
SELECT
    ls.owner,
    ls.repo,
    ls.scan_id,
    ls.finished_at,

    COUNT(*) AS file_count,

    ROUND(
        AVG(fm.cyclomatic_complexity)::numeric,
        2
    ) AS avg_complexity,

    MAX(fm.cyclomatic_complexity) AS max_complexity,

    COUNT(*) FILTER (
        WHERE fm.cyclomatic_complexity > 10
    ) AS high_complexity_files

FROM v_cq_latest_scan ls
JOIN code_quality_file_metric fm
    ON fm.scan_id = ls.scan_id

GROUP BY
    ls.owner,
    ls.repo,
    ls.scan_id,
    ls.finished_at;

-- ============================================================
-- Complexity Trend
-- ============================================================

CREATE OR REPLACE VIEW v_cq_complexity_trend AS
SELECT
    s.owner,
    s.repo,

    DATE(s.finished_at) AS scan_date,

    ROUND(
        AVG(fm.cyclomatic_complexity)::numeric,
        2
    ) AS avg_complexity,

    COUNT(*) FILTER (
        WHERE fm.cyclomatic_complexity > 10
    ) AS high_complexity_files

FROM code_quality_scan s
JOIN code_quality_file_metric fm
    ON fm.scan_id = s.id

WHERE s.status = 'completed'

GROUP BY
    s.owner,
    s.repo,
    DATE(s.finished_at)

ORDER BY
    scan_date;

-- ============================================================
-- Churn Summary
-- ============================================================

CREATE OR REPLACE VIEW v_cq_churn_summary AS
SELECT
    ls.owner,
    ls.repo,
    ls.scan_id,
    ls.finished_at,

    COALESCE(SUM(fm.lines_added),0) AS total_lines_added,
    COALESCE(SUM(fm.lines_removed),0) AS total_lines_removed,

    COALESCE(SUM(fm.commit_count),0) AS total_commits,

    COUNT(*) FILTER (
        WHERE fm.commit_count >= 5
    ) AS high_churn_files

FROM v_cq_latest_scan ls
JOIN code_quality_file_metric fm
    ON fm.scan_id = ls.scan_id

GROUP BY
    ls.owner,
    ls.repo,
    ls.scan_id,
    ls.finished_at;

-- ============================================================
-- Lint Density
-- ============================================================

CREATE OR REPLACE VIEW v_cq_lint_density AS
SELECT
    ls.owner,
    ls.repo,
    ls.scan_id,
    ls.finished_at,

    COUNT(*) AS total_findings,

    COUNT(*) FILTER (
        WHERE lf.severity = 'error'
    ) AS error_count,

    COUNT(*) FILTER (
        WHERE lf.severity = 'warning'
    ) AS warning_count,

    ROUND(
        (
            COUNT(*)::numeric
            /
            NULLIF(
                (
                    SELECT SUM(fm.nloc)
                    FROM code_quality_file_metric fm
                    WHERE fm.scan_id = ls.scan_id
                ),
                0
            )
        ) * 1000,
        2
    ) AS findings_per_kloc

FROM v_cq_latest_scan ls
JOIN code_quality_lint_finding lf
    ON lf.scan_id = ls.scan_id

GROUP BY
    ls.owner,
    ls.repo,
    ls.scan_id,
    ls.finished_at;

-- ============================================================
-- Open Secret Alerts
-- ============================================================

CREATE OR REPLACE VIEW v_cq_secret_alerts_open AS
SELECT
    sa.id,
    s.owner,
    s.repo,

    sa.file_path,
    sa.line_number,

    sa.tool,
    sa.rule_id,
    sa.severity,

    sa.description,
    sa.commit_sha,

    sa.status,
    sa.created_at

FROM code_quality_secret_alert sa
JOIN code_quality_scan s
    ON s.id = sa.scan_id

WHERE sa.status = 'open'

ORDER BY
    CASE sa.severity
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        ELSE 4
    END,
    sa.created_at DESC;

SELECT viewname
FROM pg_views
WHERE schemaname='public'
AND viewname LIKE 'v_cq%';
SELECT * FROM v_cq_latest_scan LIMIT 5;

SELECT * FROM v_cq_complexity_summary LIMIT 5;

SELECT * FROM v_cq_complexity_trend LIMIT 5;

SELECT * FROM v_cq_churn_summary LIMIT 5;

SELECT * FROM v_cq_lint_density LIMIT 5;

SELECT * FROM v_cq_secret_alerts_open LIMIT 5;

SELECT
    total_lines_added,
    total_lines_removed,
    total_commits,
    ROUND(
        (total_lines_added + total_lines_removed)::numeric
        / NULLIF(total_commits,0),
        2
    ) AS avg_lines_changed_per_commit
FROM v_cq_churn_summary
WHERE repo='git_repo_con';

SELECT * FROM v_cq_latest_scan;

SELECT * FROM v_cq_complexity_summary;

SELECT * FROM v_cq_churn_summary;

SELECT * FROM v_cq_lint_density;

SELECT * FROM v_cq_secret_alerts_open;

SELECT COUNT(*) FROM code_quality_lint_finding;

SELECT COUNT(*) FROM code_quality_secret_alert;

SELECT *
FROM code_quality_scan
ORDER BY finished_at DESC
LIMIT 5;

SELECT
    id,
    owner,
    repo,
    status,
    error,
    started_at,
    finished_at
FROM code_quality_scan
ORDER BY finished_at DESC
LIMIT 10;















--TO check:answer must be 5
SELECT table_name FROM information_schema.views WHERE table_schema = 'public';
SELECT COUNT(*) FROM users;
SELECT to_regclass('public.v_attendance_kpi');
