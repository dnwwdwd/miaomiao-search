import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { ServerConfig } from "./config.js";
import { engines } from "./db/schema.js";
import { DomainError, engineIds, type EngineId } from "./domain.js";
import { getMcpTools, mcpTools } from "./mcp.js";
import type { AuditService } from "./services/audit.js";
import type { OidcService, OidcState, PortalUser } from "./services/oidc.js";
import type { SearchService } from "./services/search.js";
import type { SettingsService } from "./services/settings.js";
import type { TokenService } from "./services/tokens.js";
import type { SlidingWindowRateLimiter } from "./services/rate-limiter.js";
import type { AppDatabase } from "./db/client.js";
import { engineApiKeySetting, engineCatalog } from "./engine-catalog.js";

const sessionCookie = "lazycat_search_session";
const oidcStateCookie = "lazycat_search_oidc_state";
const oidcCallbackSchema = z.object({ code: z.string().min(1).max(10_000), state: z.string().min(1).max(1_000), error: z.string().max(200).optional() });
const searchSchema = z.object({ query: z.string().min(1).max(500), engines: z.array(z.enum(engineIds)).min(1).max(engineIds.length), limit: z.number().int().min(1).max(50).optional(), searchMode: z.enum(["auto", "request"]).optional() });
const fetchSchema = z.object({ url: z.string().url(), maxChars: z.number().int().min(1_000).max(200_000).default(50_000) });
const usageQuerySchema = z.object({ from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional(), channel: z.enum(["all", "web", "mcp"]).default("all"), operation: z.string().trim().max(120).optional(), status: z.enum(["all", "success", "partial", "error"]).default("all"), engine: z.enum(engineIds).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), timeZone: z.string().trim().min(1).max(100).default("Asia/Shanghai") });
const sanitizeEngineIds = (value: unknown): EngineId[] => Array.isArray(value) ? value.filter((item): item is EngineId => typeof item === "string" && (engineIds as readonly string[]).includes(item)) : [];
const settingsSchema = z.object({ proxyEnabled: z.boolean(), proxyUrl: z.string().max(2_000), searchCacheEnabled: z.boolean(), contentCacheEnabled: z.boolean(), searchTtl: z.number().int().min(1).max(604_800), contentTtl: z.number().int().min(1).max(2_592_000), cacheMaxSize: z.number().int().min(1).max(10_000), webRpm: z.number().int().min(1).max(10_000), mcpRpm: z.number().int().min(1).max(10_000), engineConcurrency: z.number().int().min(1).max(100), defaultLimit: z.number().int().min(1).max(50), homeEngines: z.array(z.string()).default([]).transform(sanitizeEngineIds), homeRequestLimit: z.number().int().min(1).max(50).nullable().default(null), homeBingMode: z.enum(["auto", "request"]).default("request"), historyEnabled: z.boolean(), historyRetentionDays: z.number().int().min(-1).max(3650), logFullQuery: z.boolean() });

export type ServerDependencies = { database: AppDatabase; auth: OidcService; tokens: TokenService; audit: AuditService; search: SearchService; settings: SettingsService; rateLimiter: SlidingWindowRateLimiter };

function errorBody(error: unknown) {
  if (error instanceof DomainError) return { status: error.statusCode, body: { error: { code: error.code, message: error.message } } };
  if (error instanceof z.ZodError) return { status: 400, body: { error: { code: "INVALID_REQUEST", message: "请求参数无效", details: error.flatten() } } };
  return { status: 500, body: { error: { code: "INTERNAL_ERROR", message: "服务内部错误" } } };
}

function sessionOptions(config: ServerConfig) {
  return { path: "/", httpOnly: true, sameSite: "lax" as const, secure: config.environment === "production", maxAge: 60 * 60 * 24 };
}

function oidcStateOptions(config: ServerConfig) {
  return { path: "/api/auth/oidc/callback", httpOnly: true, signed: true, sameSite: "lax" as const, secure: config.environment === "production", maxAge: 10 * 60 };
}

function serializeOidcState(state: OidcState): string {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

function parseOidcState(value: string): OidcState {
  const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<OidcState>;
  if (typeof parsed.state !== "string" || typeof parsed.nonce !== "string" || typeof parsed.codeVerifier !== "string" || typeof parsed.createdAt !== "number") throw new Error("invalid oidc state");
  return parsed as OidcState;
}

async function requirePortalUser(request: FastifyRequest, dependencies: ServerDependencies): Promise<PortalUser> {
  const token = request.cookies[sessionCookie];
  if (!token) throw new DomainError("SESSION_UNAUTHORIZED", "登录会话无效", 401);
  return dependencies.auth.verifySession(token);
}

function isCompleteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function assertEngineReady(id: keyof typeof engineCatalog, dependencies: ServerDependencies): void {
  const requirement = engineCatalog[id];
  if (requirement.requiresProxy) {
    const proxyUrl = dependencies.settings.get<string>("proxy.url") ?? "";
    if (!dependencies.settings.get<boolean>("proxy.enabled") || !isCompleteHttpUrl(proxyUrl)) {
      throw new DomainError("ENGINE_PROXY_REQUIRED", `${id} 启用前需要先开启并配置有效的 HTTP(S) 代理地址`);
    }
  }
  if (requirement.requiresApiKey && !(dependencies.settings.get<string>(engineApiKeySetting(id)) ?? "").trim()) {
    throw new DomainError("ENGINE_API_KEY_REQUIRED", `${id} 启用前需要先配置 API Key`);
  }
}

function engineResponse(id: string, row: typeof engines.$inferSelect, settings: SettingsService) {
  const catalogId = id as keyof typeof engineCatalog;
  const requirement = engineCatalog[catalogId];
  if (!requirement) return row;
  return {
    ...row,
    requiresProxy: requirement.requiresProxy,
    requiresApiKey: requirement.requiresApiKey,
    apiKeyConfigured: requirement.requiresApiKey ? Boolean(settings.get<string>(engineApiKeySetting(catalogId))) : false,
  };
}

export function registerAdminRoutes(app: FastifyInstance, config: ServerConfig, dependencies: ServerDependencies): void {
  const portalUser = async (request: FastifyRequest) => { await requirePortalUser(request, dependencies); };
  app.get("/api/auth/oidc/start", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (_request, reply) => {
    const started = dependencies.auth.begin();
    reply.setCookie(oidcStateCookie, serializeOidcState(started.state), oidcStateOptions(config));
    return reply.redirect(started.authorizationUrl);
  });
  app.get("/api/auth/oidc/callback", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    try {
      const input = oidcCallbackSchema.parse(request.query);
      if (input.error) throw new DomainError("OIDC_AUTHORIZATION_DENIED", "登录授权被取消或拒绝", 401);
      const rawState = request.cookies[oidcStateCookie];
      if (!rawState) throw new DomainError("OIDC_STATE_MISSING", "登录状态已失效，请重新发起登录", 401);
      const unsignedState = request.unsignCookie(rawState);
      if (!unsignedState.valid) throw new DomainError("OIDC_STATE_INVALID", "登录状态校验失败", 401);
      const user = await dependencies.auth.complete(input.code, input.state, parseOidcState(unsignedState.value));
      reply.clearCookie(oidcStateCookie, { path: "/api/auth/oidc/callback" });
      reply.setCookie(sessionCookie, await dependencies.auth.createSession(user), sessionOptions(config));
      return reply.redirect("/");
    } catch {
      reply.clearCookie(oidcStateCookie, { path: "/api/auth/oidc/callback" });
      return reply.redirect("/?authError=oidc_failed");
    }
  });
  app.post("/api/auth/logout", async (_request, reply) => { reply.clearCookie(sessionCookie, { path: "/" }); return { ok: true }; });
  app.get("/api/auth/me", async (request, reply) => {
    try { return { user: await requirePortalUser(request, dependencies) }; } catch (error) { const response = errorBody(error); return reply.code(response.status).send(response.body); }
  });

  app.post("/api/search", { preHandler: portalUser, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    try { dependencies.rateLimiter.assert(`web:${request.ip}`, dependencies.settings.get<number>("rateLimit.web.rpm") ?? 30); return await dependencies.search.search(searchSchema.parse(request.body), { channel: "web" }); } catch (error) { const response = errorBody(error); return reply.code(response.status).send(response.body); }
  });
  app.post("/api/fetch-content", { preHandler: portalUser, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    try { dependencies.rateLimiter.assert(`web:${request.ip}`, dependencies.settings.get<number>("rateLimit.web.rpm") ?? 30); const input = fetchSchema.parse(request.body); return await dependencies.search.fetchContent(input.url, input.maxChars, { channel: "web" }); } catch (error) { const response = errorBody(error); return reply.code(response.status).send(response.body); }
  });

  app.get("/api/engines", { preHandler: portalUser }, async () => ({ engines: dependencies.database.orm.select().from(engines).all().map((engine) => engineResponse(engine.id, engine, dependencies.settings)) }));
  app.patch("/api/engines/:id", { preHandler: portalUser }, async (request, reply) => {
    try {
      const id = z.enum(engineIds).parse((request.params as { id: string }).id);
      const patch = z.object({ enabled: z.boolean().optional(), isDefault: z.boolean().optional(), searchMode: z.enum(["auto", "request"]).nullable().optional(), resultLimit: z.number().int().min(1).max(50).nullable().optional(), apiKey: z.string().max(500).nullable().optional() }).parse(request.body);
      if (id === "bing" && patch.searchMode === "auto") throw new DomainError("BING_MODE_UNSAFE", "V1 只允许 Bing 使用 request 模式");
      const current = dependencies.database.orm.select().from(engines).where(eq(engines.id, id)).get();
      if (!current) throw new DomainError("ENGINE_NOT_FOUND", "搜索引擎不存在", 404);
      if (patch.apiKey !== undefined) {
        if (!engineCatalog[id].requiresApiKey) throw new DomainError("ENGINE_API_KEY_UNSUPPORTED", "该搜索引擎不支持 API Key 配置");
        if (patch.apiKey === null || !patch.apiKey.trim()) dependencies.settings.delete(engineApiKeySetting(id));
        else dependencies.settings.set(engineApiKeySetting(id), patch.apiKey.trim());
      }
      const nextEnabled = patch.enabled ?? current.enabled;
      const nextDefault = patch.isDefault ?? current.isDefault;
      if (patch.enabled === true) assertEngineReady(id, dependencies);
      if (nextDefault && !nextEnabled) throw new DomainError("DEFAULT_ENGINE_DISABLED", "默认搜索引擎必须处于启用状态");
      if (current.isDefault && !nextDefault) {
        const otherDefault = dependencies.database.orm.select().from(engines).all().some((engine) => engine.id !== id && engine.enabled && engine.isDefault);
        if (!otherDefault) throw new DomainError("DEFAULT_ENGINE_REQUIRED", "至少需要保留一个默认搜索引擎");
      }
      if (current.isDefault && !nextEnabled) {
        const otherDefault = dependencies.database.orm.select().from(engines).all().some((engine) => engine.id !== id && engine.enabled && engine.isDefault);
        if (!otherDefault) throw new DomainError("DEFAULT_ENGINE_REQUIRED", "至少需要保留一个默认搜索引擎");
      }
      const enginePatch = { ...patch };
      delete enginePatch.apiKey;
      const result = dependencies.database.orm.update(engines).set({ ...enginePatch, updatedAt: new Date().toISOString() }).where(eq(engines.id, id)).run();
      if (result.changes !== 1) throw new DomainError("ENGINE_NOT_FOUND", "搜索引擎不存在", 404);
      return { engine: engineResponse(id, dependencies.database.orm.select().from(engines).where(eq(engines.id, id)).get()!, dependencies.settings) };
    } catch (error) { const response = errorBody(error); return reply.code(response.status).send(response.body); }
  });
  app.post("/api/engines/:id/test", { preHandler: portalUser }, async (request, reply) => {
    try {
      const id = z.enum(engineIds).parse((request.params as { id: string }).id);
      const engine = dependencies.database.orm.select().from(engines).where(eq(engines.id, id)).get();
      if (!engine) throw new DomainError("ENGINE_NOT_FOUND", "搜索引擎不存在", 404);
      const startedAt = Date.now();
      if (!engine.enabled) throw new DomainError("ENGINE_DISABLED", "搜索引擎已停用");
      assertEngineReady(id, dependencies);
      const result = await dependencies.search.search({ query: z.object({ query: z.string().min(1).max(500).default("lazycat search") }).parse(request.body).query, engines: [id], searchMode: id === "bing" ? "request" : undefined }, { channel: "web", saveHistory: false });
      const latencyMs = Date.now() - startedAt;
      dependencies.database.orm.update(engines).set({ lastTestAt: new Date().toISOString(), status: result.failures.length ? "degraded" : "healthy", latencyMs, lastError: result.failures[0]?.message ?? null, updatedAt: new Date().toISOString() }).where(eq(engines.id, id)).run();
      return { resultCount: result.results.length, latencyMs, engine: engineResponse(id, dependencies.database.orm.select().from(engines).where(eq(engines.id, id)).get()!, dependencies.settings) };
    } catch (error) { const response = errorBody(error); return reply.code(response.status).send(response.body); }
  });

  app.get("/api/tokens", { preHandler: portalUser }, async () => ({ tokens: dependencies.tokens.list() }));
  app.post("/api/tokens", { preHandler: portalUser }, async (request, reply) => {
    try {
      const input = z.object({ name: z.string().min(1).max(120), scope: z.enum(["all", "search", "fetch"]).default("all"), rpmLimit: z.number().int().min(1).max(10_000).nullable().optional(), dailyLimit: z.number().int().min(1).max(1_000_000).nullable().optional(), expiresAt: z.string().datetime().nullable().optional() }).parse(request.body);
      const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
      if (expiresAt && expiresAt.getTime() <= Date.now()) throw new DomainError("TOKEN_EXPIRY_INVALID", "过期时间必须在未来");
      return dependencies.tokens.create({ ...input, rpmLimit: input.rpmLimit ?? undefined, dailyLimit: input.dailyLimit ?? undefined, expiresAt });
    } catch (error) { const response = errorBody(error); return reply.code(response.status).send(response.body); }
  });
  app.patch("/api/tokens/:id", { preHandler: portalUser }, async (request, reply) => {
    try { const input = z.object({ status: z.enum(["active", "disabled", "revoked"]) }).parse(request.body); dependencies.tokens.setStatus((request.params as { id: string }).id, input.status); return { ok: true }; } catch (error) { const response = errorBody(error); return reply.code(response.status).send(response.body); }
  });
  app.delete("/api/tokens/:id", { preHandler: portalUser }, async (request, reply) => { try { dependencies.tokens.remove((request.params as { id: string }).id); return { ok: true }; } catch (error) { const response = errorBody(error); return reply.code(response.status).send(response.body); } });

  app.get("/api/settings", { preHandler: portalUser }, async () => ({ settings: readSettings(dependencies.settings) }));
  app.put("/api/settings", { preHandler: portalUser }, async (request, reply) => {
    try { const input = settingsSchema.parse(request.body); writeSettings(dependencies.settings, input); dependencies.audit.pruneHistory(input.historyRetentionDays); return { settings: readSettings(dependencies.settings) }; } catch (error) { const response = errorBody(error); return reply.code(response.status).send(response.body); }
  });
  app.get("/api/history", { preHandler: portalUser }, async () => { dependencies.audit.pruneHistory(dependencies.settings.get<number>("history.retentionDays") ?? 30); return { history: dependencies.audit.listHistory() }; });
  app.delete("/api/history", { preHandler: portalUser }, async () => { dependencies.audit.clearHistory(); return { ok: true }; });
  app.get("/api/usage", { preHandler: portalUser }, async (request, reply) => {
    try { return dependencies.audit.usage(usageQuerySchema.parse(request.query)); }
    catch (error) { const response = errorBody(error); return reply.code(response.status).send(response.body); }
  });
  app.get("/api/mcp", { preHandler: portalUser }, async () => ({ endpoint: "/mcp", healthy: true, legacySse: dependencies.settings.get<boolean>("mcp.legacySse") ?? false, tools: mcpTools.map((tool) => ({ ...tool, enabled: getMcpTools(dependencies.settings)[tool.name] })) }));
  app.put("/api/mcp/tools", { preHandler: portalUser }, async (request, reply) => {
    try { const tools = z.record(z.enum(mcpTools.map((tool) => tool.name) as [string, ...string[]]), z.boolean()).parse(request.body); dependencies.settings.set("mcp.tools", { ...getMcpTools(dependencies.settings), ...tools }); return { tools: mcpTools.map((tool) => ({ ...tool, enabled: getMcpTools(dependencies.settings)[tool.name] })) }; } catch (error) { const response = errorBody(error); return reply.code(response.status).send(response.body); }
  });
}

function readSettings(settings: SettingsService) {
  return { proxyEnabled: settings.get<boolean>("proxy.enabled") ?? false, proxyUrl: maskProxyUrl(settings.get<string>("proxy.url") ?? ""), searchCacheEnabled: settings.get<boolean>("cache.search.enabled") ?? true, contentCacheEnabled: settings.get<boolean>("cache.content.enabled") ?? true, searchTtl: settings.get<number>("cache.search.ttl") ?? 3600, contentTtl: settings.get<number>("cache.content.ttl") ?? 86400, cacheMaxSize: settings.get<number>("cache.search.maxSize") ?? 1000, webRpm: settings.get<number>("rateLimit.web.rpm") ?? 30, mcpRpm: settings.get<number>("rateLimit.mcp.rpm") ?? 60, engineConcurrency: settings.get<number>("engine.concurrency") ?? 3, defaultLimit: settings.get<number>("search.defaultLimit") ?? 10, homeEngines: sanitizeEngineIds(settings.get<unknown>("search.homeEngines")), homeRequestLimit: settings.get<number | null>("search.homeRequestLimit") ?? null, homeBingMode: settings.get<"auto" | "request">("search.homeBingMode") ?? "request", historyEnabled: settings.get<boolean>("history.enabled") ?? true, historyRetentionDays: settings.get<number>("history.retentionDays") ?? 30, logFullQuery: settings.get<boolean>("log.saveQuery") ?? false };
}

function writeSettings(settings: SettingsService, value: z.infer<typeof settingsSchema>): void {
  settings.set("proxy.enabled", value.proxyEnabled); if (!value.proxyUrl.includes("••••")) settings.set("proxy.url", value.proxyUrl); settings.set("cache.search.enabled", value.searchCacheEnabled); settings.set("cache.content.enabled", value.contentCacheEnabled); settings.set("cache.search.ttl", value.searchTtl); settings.set("cache.content.ttl", value.contentTtl); settings.set("cache.search.maxSize", value.cacheMaxSize); settings.set("rateLimit.web.rpm", value.webRpm); settings.set("rateLimit.mcp.rpm", value.mcpRpm); settings.set("engine.concurrency", value.engineConcurrency); settings.set("search.defaultLimit", value.defaultLimit); settings.set("search.homeEngines", value.homeEngines); settings.set("search.homeRequestLimit", value.homeRequestLimit); settings.set("search.homeBingMode", value.homeBingMode); settings.set("history.enabled", value.historyEnabled); settings.set("history.retentionDays", value.historyRetentionDays); settings.set("log.saveQuery", value.logFullQuery);
}

function maskProxyUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!url.password) return value;
    return `${url.protocol}//${url.username}:••••@${url.host}${url.pathname}${url.search}${url.hash}`;
  } catch { return ""; }
}
