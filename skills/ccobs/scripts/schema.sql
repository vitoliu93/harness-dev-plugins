-- ccobs schema — derived, rebuildable index over ~/.claude/projects JSONL.
-- Facts + pointers only: no message bodies, no secrets. Drop the DB and re-ingest at will.

PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS ingest_state (
  path    TEXT PRIMARY KEY,   -- absolute jsonl path
  offset  INTEGER NOT NULL    -- byte offset of next unread line
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id  TEXT PRIMARY KEY,          -- filename stem; subagents: 'agent-xxxx'
  kind        TEXT NOT NULL,             -- 'main' | 'subagent'
  parent_id   TEXT,                      -- parent session_id for subagents
  project     TEXT NOT NULL,             -- ~/.claude/projects/<project>/
  cwd         TEXT,
  git_branch  TEXT,
  cc_version  TEXT,
  started_at  TEXT,                      -- ISO8601, min event ts
  ended_at    TEXT,                      -- ISO8601, max event ts
  file_path   TEXT NOT NULL              -- pointer back to raw jsonl
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
  is_error      INTEGER DEFAULT 0        -- set from matching tool_result
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
  dispatch_engine  TEXT,                 -- if /dispatch was used
  dispatch_result  TEXT,                 -- ok|retried|blocked
  summary          TEXT,                 -- one line, human-readable
  learn_candidates TEXT                  -- JSON array of rule candidates
);

-- ============ the six observability views ============

-- 1. skill usage: dead skills vs hot skills (practice-guide §体检)
CREATE VIEW IF NOT EXISTS v_skill_usage AS
SELECT skill,
       COUNT(*)                    AS calls,
       COUNT(DISTINCT session_id)  AS sessions,
       MAX(ts)                     AS last_used
FROM tool_calls
WHERE tool IN ('Skill','SlashCommand') AND skill IS NOT NULL
GROUP BY skill ORDER BY calls DESC;

-- 2. agent-spawn model discipline (CLAUDE.md: always pass model explicitly)
CREATE VIEW IF NOT EXISTS v_agent_spawns AS
SELECT subagent_type,
       COUNT(*)                                        AS spawns,
       SUM(model_param IS NULL)                        AS missing_model,
       GROUP_CONCAT(DISTINCT model_param)              AS models_used,
       MAX(ts)                                         AS last_spawn
FROM tool_calls
WHERE tool = 'Agent'
GROUP BY subagent_type ORDER BY spawns DESC;

-- 3. token economy: spend by model × main/subagent (north-star: 执行 token 外包率)
CREATE VIEW IF NOT EXISTS v_token_economy AS
SELECT t.model,
       s.kind,
       COUNT(DISTINCT t.session_id)      AS sessions,
       SUM(t.input_tokens)               AS in_tok,
       SUM(t.output_tokens)              AS out_tok,
       SUM(t.cache_read)                 AS cache_read_tok
FROM turns t JOIN sessions s ON s.session_id = t.session_id
GROUP BY t.model, s.kind ORDER BY out_tok DESC;

-- 4. hook health: fire counts, latency, errors
CREATE VIEW IF NOT EXISTS v_hook_health AS
SELECT command,
       COUNT(*)                 AS fires,
       ROUND(AVG(duration_ms))  AS avg_ms,
       MAX(duration_ms)         AS max_ms,
       SUM(error IS NOT NULL)   AS errors
FROM hook_runs GROUP BY command ORDER BY fires DESC;

-- 5. activity by project × week
CREATE VIEW IF NOT EXISTS v_weekly_activity AS
SELECT project,
       strftime('%Y-W%W', started_at)    AS week,
       COUNT(*)                          AS sessions,
       SUM(kind = 'subagent')            AS subagent_runs
FROM sessions GROUP BY project, week ORDER BY week DESC, sessions DESC;

-- 6. semantic rollup: task mix, outcomes, correction rate (needs distiller)
CREATE VIEW IF NOT EXISTS v_session_quality AS
SELECT task_type,
       outcome,
       COUNT(*)                  AS sessions,
       ROUND(AVG(corrections),2) AS avg_corrections,
       SUM(dispatch_result = 'blocked') AS dispatch_blocked
FROM observations GROUP BY task_type, outcome ORDER BY sessions DESC;
