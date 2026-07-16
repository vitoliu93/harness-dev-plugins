-- ccobs schema — derived, rebuildable index over agent observability JSONL/SQLite.
-- Facts + pointers only: no message bodies, no secrets. Drop the DB and re-ingest at will.
-- Five sources: claude-code, codex, droid, grok, opencode.

PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS ingest_state (
  path    TEXT PRIMARY KEY,   -- absolute jsonl path (or opencode.db for opencode adapter)
  offset  INTEGER NOT NULL    -- byte offset (or epoch-ms watermark for opencode)
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id    TEXT PRIMARY KEY,        -- filename stem; subagents: 'agent-xxxx'
  kind          TEXT NOT NULL,           -- 'main' | 'subagent'
  parent_id     TEXT,                    -- parent session_id for subagents
  subagent_type TEXT,                    -- for kind='subagent': agentType from JSONL, or backfilled from parent's Agent tool_call
  project       TEXT NOT NULL,           -- CC-encoded directory: cwd.replaceAll('/', '-')
  cwd           TEXT,
  git_branch    TEXT,
  cc_version    TEXT,                    -- the tool's own version (e.g. cli_version, model version string)
  started_at    TEXT,                    -- ISO8601, min event ts
  ended_at      TEXT,                    -- ISO8601, max event ts
  file_path     TEXT NOT NULL,           -- pointer back to raw source
  source        TEXT NOT NULL DEFAULT 'claude-code'   -- one of claude-code|codex|droid|grok|opencode
);

-- one row per assistant message (deduped by message_id; streaming emits
-- several events per message that share id + usage)
CREATE TABLE IF NOT EXISTS turns (
  message_id    TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL,
  ts            TEXT,
  model         TEXT,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  cache_read    INTEGER,
  cache_create  INTEGER,
  stop_reason   TEXT
);
CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id);

CREATE TABLE IF NOT EXISTS tool_calls (
  id            TEXT PRIMARY KEY,        -- tool_use block id (toolu_...) or synthetic
  session_id    TEXT NOT NULL,
  ts            TEXT,
  tool          TEXT NOT NULL,           -- Bash / Skill / Agent / SlashCommand / ...
  skill         TEXT,                    -- when tool = Skill | SlashCommand
  subagent_type TEXT,                    -- when tool = Agent
  model_param   TEXT,                    -- explicit model on Agent spawn (NULL = missing!)
  background    INTEGER,                 -- run_in_background
  is_error      INTEGER DEFAULT 0,       -- set from matching tool_result
  error_snippet TEXT                     -- first 300 chars of the error tool_result — the one deliberate exception to "no bodies"
);
CREATE INDEX IF NOT EXISTS idx_tools_session ON tool_calls(session_id);
CREATE INDEX IF NOT EXISTS idx_tools_tool ON tool_calls(tool);

CREATE TABLE IF NOT EXISTS hook_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,
  ts          TEXT,
  command     TEXT,
  duration_ms INTEGER,
  error       TEXT                       -- NULL = clean run
);

-- semantic layer: one row per session, written by the cheap-model distiller
CREATE TABLE IF NOT EXISTS observations (
  session_id       TEXT PRIMARY KEY,
  distilled_at     TEXT,
  distill_model    TEXT,                 -- which cheap model produced this
  task_type        TEXT,                 -- feature|bugfix|research|ops|chat|...
  outcome          TEXT,                 -- done|partial|abandoned|unknown
  corrections      INTEGER,              -- times the user corrected the agent
  dispatch_engine  TEXT,                 -- if dispatch-vendors offloaded to a vendor CLI
  dispatch_result  TEXT,                 -- ok|retried|blocked
  summary          TEXT,                 -- one line, human-readable
  learn_candidates TEXT                  -- JSON array of rule candidates
);

-- ============ the six observability views ============

DROP VIEW IF EXISTS v_skill_usage;
DROP VIEW IF EXISTS v_agent_spawns;
DROP VIEW IF EXISTS v_token_economy;
DROP VIEW IF EXISTS v_weekly_activity;
DROP VIEW IF EXISTS v_tool_overview;

-- 1. skill usage: dead skills vs hot skills (practice-guide §体检)
CREATE VIEW v_skill_usage AS
SELECT s.source,
       tc.skill,
       COUNT(*)                    AS calls,
       COUNT(DISTINCT tc.session_id)  AS sessions,
       MAX(tc.ts)                     AS last_used
FROM tool_calls tc
JOIN sessions s ON s.session_id = tc.session_id
WHERE tc.tool IN ('Skill','SlashCommand') AND tc.skill IS NOT NULL
GROUP BY s.source, tc.skill ORDER BY calls DESC;

-- 2. agent-spawn model discipline (CLAUDE.md: always pass model explicitly)
CREATE VIEW v_agent_spawns AS
SELECT s.source,
       tc.subagent_type,
       COUNT(*)                                        AS spawns,
       SUM(tc.model_param IS NULL)                     AS missing_model,
       GROUP_CONCAT(DISTINCT tc.model_param)           AS models_used,
       MAX(tc.ts)                                      AS last_spawn
FROM tool_calls tc
JOIN sessions s ON s.session_id = tc.session_id
WHERE tc.tool = 'Agent'
GROUP BY s.source, tc.subagent_type ORDER BY spawns DESC;

-- 3. token economy: spend by model × main/subagent × source
CREATE VIEW v_token_economy AS
SELECT t.model,
       s.kind,
       s.source,
       COUNT(DISTINCT t.session_id)      AS sessions,
       SUM(t.input_tokens)               AS in_tok,
       SUM(t.output_tokens)              AS out_tok,
       SUM(t.cache_read)                 AS cache_read_tok
FROM turns t JOIN sessions s ON s.session_id = t.session_id
GROUP BY t.model, s.kind, s.source ORDER BY out_tok DESC;

-- 4. hook health: fire counts, latency, errors
CREATE VIEW IF NOT EXISTS v_hook_health AS
SELECT command,
       COUNT(*)                 AS fires,
       ROUND(AVG(duration_ms))  AS avg_ms,
       MAX(duration_ms)         AS max_ms,
       SUM(error IS NOT NULL)   AS errors
FROM hook_runs GROUP BY command ORDER BY fires DESC;

-- 5. activity by project × week × source
CREATE VIEW v_weekly_activity AS
SELECT s.project,
       s.source,
       strftime('%Y-W%W', s.started_at)    AS week,
       COUNT(*)                          AS sessions,
       SUM(s.kind = 'subagent')            AS subagent_runs
FROM sessions s GROUP BY s.project, s.source, week ORDER BY week DESC, sessions DESC;

-- 6. semantic rollup: task mix, outcomes, correction rate (needs distiller)
CREATE VIEW IF NOT EXISTS v_session_quality AS
SELECT task_type,
       outcome,
       COUNT(*)                  AS sessions,
       ROUND(AVG(corrections),2) AS avg_corrections,
       SUM(dispatch_result = 'blocked') AS dispatch_blocked
FROM observations GROUP BY task_type, outcome ORDER BY sessions DESC;

-- 7. per-source overview: counts and first/last activity
CREATE VIEW v_tool_overview AS
SELECT s.source,
       COUNT(DISTINCT s.session_id)                                        AS sessions,
       COUNT(DISTINCT t.message_id)                                        AS turns,
       COUNT(DISTINCT tc.id)                                               AS tool_calls,
       COUNT(DISTINCT CASE WHEN t.input_tokens IS NOT NULL THEN t.message_id END) AS turns_with_tokens,
       MIN(s.started_at)                                                   AS first_seen,
       MAX(s.ended_at)                                                     AS last_seen
FROM sessions s
LEFT JOIN turns t ON t.session_id = s.session_id
LEFT JOIN tool_calls tc ON tc.session_id = s.session_id
GROUP BY s.source ORDER BY sessions DESC;
