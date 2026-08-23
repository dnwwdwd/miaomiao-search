CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS access_token (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL,
  rpm_limit INTEGER,
  daily_limit INTEGER,
  expires_at TEXT,
  last_used_at TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (scope IN ('all', 'search', 'fetch')),
  CHECK (status IN ('active', 'disabled', 'revoked'))
);

CREATE TABLE IF NOT EXISTS engine (
  id TEXT PRIMARY KEY NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  search_mode TEXT,
  last_test_at TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  latency_ms INTEGER,
  last_error TEXT,
  updated_at TEXT NOT NULL,
  CHECK (search_mode IS NULL OR search_mode IN ('auto', 'request'))
);

CREATE TABLE IF NOT EXISTS search_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  engines TEXT NOT NULL,
  result_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS request_log (
  id TEXT PRIMARY KEY NOT NULL,
  channel TEXT NOT NULL,
  operation TEXT NOT NULL,
  token_id TEXT,
  token_prefix TEXT,
  query TEXT,
  engines TEXT,
  latency_ms INTEGER NOT NULL,
  cache_hit INTEGER NOT NULL DEFAULT 0,
  result_count INTEGER,
  status TEXT NOT NULL,
  error_code TEXT,
  created_at TEXT NOT NULL,
  CHECK (channel IN ('web', 'mcp')),
  CHECK (status IN ('success', 'partial', 'error'))
);

CREATE TABLE IF NOT EXISTS setting (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  encrypted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS access_token_hash_idx ON access_token(hash);
CREATE INDEX IF NOT EXISTS search_history_created_at_idx ON search_history(created_at);
CREATE INDEX IF NOT EXISTS request_log_created_at_idx ON request_log(created_at);
CREATE INDEX IF NOT EXISTS request_log_channel_created_at_idx ON request_log(channel, created_at);
CREATE INDEX IF NOT EXISTS request_log_token_created_at_idx ON request_log(token_id, created_at);
