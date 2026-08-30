import { buildServer } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db/client.js";
import { migrate } from "./db/migrate.js";
import { OidcService } from "./services/oidc.js";
import { LocalAccountService } from "./services/local-accounts.js";
import { SlidingWindowRateLimiter } from "./services/rate-limiter.js";
import { HttpOpenWebSearchClient } from "./upstream/open-websearch.js";
import { UserStoreManager } from "./services/user-stores.js";

const config = loadConfig();
const database = openDatabase(config.identityDatabasePath);
migrate(database.sqlite);
const upstream = new HttpOpenWebSearchClient(config.openWebSearchUrl, config.openWebSearchVersion, 20_000, config.environment !== "production");
const userStores = new UserStoreManager(config, upstream, database);
const app = buildServer(config, upstream, {
  database,
  auth: new OidcService(config.oidc, config.sessionSecret),
  localAccounts: new LocalAccountService(database),
  userStores,
  rateLimiter: new SlidingWindowRateLimiter(),
});

const close = async () => {
  await app.close();
  userStores.closeAll();
  database.close();
};
process.on("SIGINT", () => void close());
process.on("SIGTERM", () => void close());
await app.listen({ port: config.port, host: config.serverHost });
