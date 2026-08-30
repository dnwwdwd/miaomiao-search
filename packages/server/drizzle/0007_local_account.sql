CREATE TABLE IF NOT EXISTS local_account (
  id TEXT PRIMARY KEY NOT NULL,
  account TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (role IN ('ADMIN', 'NORMAL'))
);

CREATE INDEX IF NOT EXISTS local_account_account_idx ON local_account(account);
