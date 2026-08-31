import { eq } from "drizzle-orm";
import type { ServerConfig } from "../config.js";
import { engineIds } from "../domain.js";
import type { AppDatabase } from "../db/client.js";
import { engines, settings } from "../db/schema.js";
import { engineCatalog } from "../engine-catalog.js";

const defaultEngineIds = engineIds.filter((id) => engineCatalog[id].defaultEnabled && engineCatalog[id].defaultSelected);

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
  "search.defaultEngines": defaultEngineIds,
  "search.defaultLimit": 10,
  "search.homeEngines": [],
  "search.homeRequestLimit": null,
  "search.homeBingMode": "request",
  "search.maxLimit": 50,
  "fetch.maxChars": 50000,
  "history.enabled": true,
  "history.retentionDays": 30,
  "log.saveQuery": false,
  "mcp.legacySse": false,
  "mcp.tools": { search: true, fetchWebContent: true, fetchCsdnArticle: true, fetchJuejinArticle: true, fetchGithubReadme: true, fetchLinuxDoArticle: false },
};

export async function bootstrapDatabase(database: AppDatabase, config: ServerConfig): Promise<void> {
  void config;
  const now = new Date().toISOString();
  for (const id of engineIds) {
    const existing = database.orm.select({ id: engines.id }).from(engines).where(eq(engines.id, id)).get();
    if (!existing) {
      const enabledByDefault = engineCatalog[id].defaultEnabled;
      database.orm.insert(engines).values({
        id,
        enabled: enabledByDefault,
        isDefault: engineCatalog[id].defaultSelected,
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
