import { buildServer } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db/client.js";
import { migrate } from "./db/migrate.js";
import { bootstrapDatabase } from "./services/bootstrap.js";
import { AuditService } from "./services/audit.js";
import { AuthService } from "./services/auth.js";
import { SearchService } from "./services/search.js";
import { SettingsService } from "./services/settings.js";
import { TokenService } from "./services/tokens.js";
import { SlidingWindowRateLimiter } from "./services/rate-limiter.js";
import { DomainError, type EngineId } from "./domain.js";
import { engines } from "./db/schema.js";
import { HttpOpenWebSearchClient } from "./upstream/open-websearch.js";

const config = loadConfig();
const database = openDatabase(config.databasePath);
migrate(database.sqlite);
await bootstrapDatabase(database, config);
const upstream = new HttpOpenWebSearchClient(config.openWebSearchUrl, config.openWebSearchVersion, 20_000, config.environment !== "production");
const audit = new AuditService(database);
const settings = new SettingsService(database, config.settingsEncryptionKey);
const app = buildServer(config, upstream, {
  database,
  audit,
  settings,
  auth: new AuthService(database, config.jwtSecret),
  tokens: new TokenService(database, config.tokenHashKey),
  rateLimiter: new SlidingWindowRateLimiter(),
  search: new SearchService(upstream, audit, settings, undefined, undefined, (requested: EngineId[]) => {
    const configured = database.orm.select().from(engines).all();
    const selected = requested.length ? requested : configured.filter((engine) => engine.isDefault && engine.enabled).map((engine) => engine.id as EngineId);
    if (!selected.length) throw new DomainError("ENGINE_REQUIRED", "至少配置一个默认搜索引擎");
    const enabled = new Set(configured.filter((engine) => engine.enabled).map((engine) => engine.id));
    const disabled = selected.find((id) => !enabled.has(id));
    if (disabled) throw new DomainError("ENGINE_DISABLED", `搜索引擎 ${disabled} 已停用`);
    return selected;
  }),
});

const close = async () => {
  await app.close();
  database.close();
};
process.on("SIGINT", () => void close());
process.on("SIGTERM", () => void close());
await app.listen({ port: config.port, host: config.serverHost });
