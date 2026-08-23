import { readFileSync } from "node:fs";
import type Database from "better-sqlite3";

const migrationId = "0000_initial";

export function migrate(sqlite: Database.Database): void {
  sqlite.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL)");
  const done = sqlite.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(migrationId);
  if (done) return;

  const sql = readFileSync(new URL("../../drizzle/0000_initial.sql", import.meta.url), "utf8");
  const transaction = sqlite.transaction(() => {
    sqlite.exec(sql);
    sqlite.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(migrationId, new Date().toISOString());
  });
  transaction();
}
