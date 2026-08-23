import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { ServerConfig } from "../config.js";
import { engineIds } from "../domain.js";
import type { AppDatabase } from "../db/client.js";
import { admins, engines, settings } from "../db/schema.js";

const defaultSettings: Record<string, unknown> = {
  "proxy.enabled": false,
  "proxy.url": "",
  "cache.search.enabled": true,
  "cache.search.ttl": 3600,
  "cache.search.maxSize": 1000,
  "cache.content.enabled": true,
  "cache.content.ttl": 86400,
  "rateLimit.web.rpm": 30,
  "rateLimit.mcp.rpm": 60,
  "engine.concurrency": 3,
  "search.defaultEngines": ["bing", "duckduckgo"],
  "search.defaultLimit": 10,
  "search.maxLimit": 50,
  "fetch.maxChars": 50000,
  "history.enabled": true,
  "history.retentionDays": 30,
  "log.saveQuery": false,
  "mcp.legacySse": false,
  "mcp.tools": { search: true, fetchWebContent: true, fetchCsdnArticle: true, fetchJuejinArticle: true, fetchGithubReadme: true, fetchLinuxDoArticle: false },
};

export async function bootstrapDatabase(database: AppDatabase, config: ServerConfig): Promise<void> {
  const now = new Date().toISOString();
  const existingAdmin = database.orm.select({ id: admins.id }).from(admins).limit(1).get();
  if (!existingAdmin) {
    if (!config.adminPassword) {
      throw new Error("ADMIN_PASSWORD is required when initializing an empty database");
    }
    const passwordHash = await bcrypt.hash(config.adminPassword, 12);
    database.orm.insert(admins).values({ username: config.adminUsername, passwordHash, createdAt: now, updatedAt: now }).run();
  }

  for (const id of engineIds) {
    const existing = database.orm.select({ id: engines.id }).from(engines).where(eq(engines.id, id)).get();
    if (!existing) {
      database.orm.insert(engines).values({
        id,
        enabled: id === "bing" || id === "duckduckgo",
        isDefault: id === "bing" || id === "duckduckgo",
        searchMode: id === "bing" ? "request" : null,
        status: "unknown",
        updatedAt: now,
      }).run();
    }
  }

  for (const [key, value] of Object.entries(defaultSettings)) {
    const existing = database.orm.select({ key: settings.key }).from(settings).where(eq(settings.key, key)).get();
    if (!existing) database.orm.insert(settings).values({ key, value: JSON.stringify(value), encrypted: false, updatedAt: now }).run();
  }
}
