import { readFileSync } from "node:fs";
import type Database from "better-sqlite3";

const migrations = [
  { id: "0000_initial", file: "0000_initial.sql" },
  { id: "0001_search_history_snapshot", file: "0001_search_history_snapshot.sql" },
  { id: "0002_engine_result_limit", file: "0002_engine_result_limit.sql" },
  { id: "0003_remove_startpage", file: "0003_remove_startpage.sql" },
  { id: "0004_remove_brave", file: "0004_remove_brave.sql" },
  { id: "0005_purge_removed_brave_history", file: "0005_purge_removed_brave_history.sql" },
  { id: "0006_remove_legacy_admin", file: "0006_remove_legacy_admin.sql" },
] as const;

export function migrate(sqlite: Database.Database): void {
  sqlite.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL)");
  const transaction = sqlite.transaction(() => {
    for (const migration of migrations) {
      const done = sqlite.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(migration.id);
      if (done) continue;
      sqlite.exec(readFileSync(new URL(`../../drizzle/${migration.file}`, import.meta.url), "utf8"));
      sqlite.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(migration.id, new Date().toISOString());
    }
  });
  transaction();
}
