ALTER TABLE local_account ADD COLUMN gateway_user_id TEXT;
ALTER TABLE local_account ADD COLUMN owner_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS local_account_gateway_user_idx ON local_account(gateway_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS local_account_owner_idx ON local_account(owner_id);

CREATE TABLE IF NOT EXISTS token_owner (
  token_hash TEXT PRIMARY KEY NOT NULL,
  token_id TEXT NOT NULL UNIQUE,
  gateway_user_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS token_owner_token_id_idx ON token_owner(token_id);
CREATE INDEX IF NOT EXISTS token_owner_owner_id_idx ON token_owner(owner_id);
