import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import type { OpenWebSearchClient } from "../upstream/open-websearch.js";
import type { ServerConfig } from "../config.js";
import { openDatabase, type AppDatabase } from "../db/client.js";
import { migrate } from "../db/migrate.js";
import { engines, tokenOwners } from "../db/schema.js";
import { DomainError, orderEngineIds, type Channel, type EngineId } from "../domain.js";
import { bootstrapDatabase } from "./bootstrap.js";
import { AuditService } from "./audit.js";
import { SearchService } from "./search.js";
import { SettingsService } from "./settings.js";
import { TokenService, type TokenOwnerIndex, type VerifiedToken } from "./tokens.js";
import { SlidingWindowRateLimiter } from "./rate-limiter.js";
import { normalizeGatewayUserId, ownerIdForGateway } from "./local-accounts.js";

export type UserStore = {
  gatewayUserId: string;
  ownerId: string;
  database: AppDatabase;
  settings: SettingsService;
  audit: AuditService;
  tokens: TokenService;
  search: SearchService;
  rateLimiter: SlidingWindowRateLimiter;
};

export type TokenStoreContext = {
  store: UserStore;
  token: VerifiedToken;
  gatewayUserId: string;
  ownerId: string;
};

export class LegacyUserStoreManager {
  constructor(private readonly store: UserStore) {}

  getForOwner(): UserStore { return this.store; }
  getForGateway(): UserStore { return this.store; }
  authenticateToken(secret: string): TokenStoreContext {
    return { store: this.store, token: this.store.tokens.authenticate(secret), gatewayUserId: this.store.gatewayUserId, ownerId: this.store.ownerId };
  }
  closeAll(): void {}
}

export class UserStoreManager implements TokenOwnerIndex {
  private readonly stores = new Map<string, UserStore>();

  constructor(private readonly config: ServerConfig, private readonly upstream: OpenWebSearchClient, private readonly identityDatabase: AppDatabase) {}

  getForGateway(gatewayUserId: string): UserStore {
    const normalized = normalizeGatewayUserId(gatewayUserId);
    return this.open(ownerIdForGateway(normalized), normalized);
  }

  getForOwner(ownerId: string, gatewayUserId: string): UserStore {
    const normalized = normalizeGatewayUserId(gatewayUserId);
    if (ownerId !== ownerIdForGateway(normalized)) throw new DomainError("GATEWAY_USER_MISMATCH", "当前懒猫用户已切换，请重新登录", 401);
    return this.open(ownerId, normalized);
  }

  authenticateToken(secret: string): TokenStoreContext {
    const tokenHash = hashToken(secret, this.config.tokenHashKey);
    const owner = this.identityDatabase.orm.select().from(tokenOwners).where(eq(tokenOwners.tokenHash, tokenHash)).get();
    if (!owner) throw new DomainError("TOKEN_UNAUTHORIZED", "Token 无效", 401);
    const store = this.open(owner.ownerId, owner.gatewayUserId);
    const token = store.tokens.authenticate(secret);
    return { store, token, gatewayUserId: owner.gatewayUserId, ownerId: owner.ownerId };
  }

  register(input: { tokenHash: string; tokenId: string; gatewayUserId: string; ownerId: string }): void {
    this.identityDatabase.orm.insert(tokenOwners).values({ ...input, createdAt: new Date().toISOString() }).run();
  }

  remove(tokenId: string): void {
    this.identityDatabase.orm.delete(tokenOwners).where(eq(tokenOwners.tokenId, tokenId)).run();
  }

  closeAll(): void {
    for (const store of this.stores.values()) store.database.close();
    this.stores.clear();
  }

  private open(ownerId: string, gatewayUserId: string): UserStore {
    const existing = this.stores.get(ownerId);
    if (existing) return existing;
    const database = openDatabase(`${this.config.userDataDir}/${ownerId}/miaomiao-search.db`);
    migrate(database.sqlite);
    void bootstrapDatabase(database, this.config);
    const settings = new SettingsService(database, this.config.settingsEncryptionKey);
    const audit = new AuditService(database);
    const tokens = new TokenService(database, this.config.tokenHashKey, { gatewayUserId, ownerId }, this);
    const rateLimiter = new SlidingWindowRateLimiter();
    const search = new SearchService(this.upstream, audit, settings, undefined, undefined, (requested: EngineId[], channel?: Channel) => {
      const configured = database.orm.select().from(engines).all();
      const available = configured.filter((engine) => engine.isDefault && engine.enabled).map((engine) => engine.id as EngineId);
      const orderKey = channel === "mcp" ? "search.mcpEngineOrder" : "search.homeEngineOrder";
      const selected = requested.length ? requested : orderEngineIds(settings.get<unknown>(orderKey), available);
      if (!selected.length) throw new DomainError("ENGINE_REQUIRED", "至少配置一个默认搜索引擎");
      const enabled = new Set(configured.filter((engine) => engine.enabled).map((engine) => engine.id));
      const disabled = selected.find((id) => !enabled.has(id));
      if (disabled) throw new DomainError("ENGINE_DISABLED", `搜索引擎 ${disabled} 已停用`);
      return selected;
    }, (requested: EngineId[]) => {
      const configured = database.orm.select().from(engines).all();
      return Object.fromEntries(requested.map((id) => [id, configured.find((engine) => engine.id === id)?.resultLimit ?? null]));
    });
    const store = { gatewayUserId, ownerId, database, settings, audit, tokens, search, rateLimiter } satisfies UserStore;
    this.stores.set(ownerId, store);
    return store;
  }
}

export function hashToken(secret: string, key: string): string {
  return createHmac("sha256", key).update(secret).digest("hex");
}
