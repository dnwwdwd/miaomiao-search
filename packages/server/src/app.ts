import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import Fastify from "fastify";
import { eq } from "drizzle-orm";
import type { ServerConfig } from "./config.js";
import { DomainError, orderEngineIds, type EngineId } from "./domain.js";
import { createMcpServer, type McpAuthorization } from "./mcp.js";
import { registerAdminRoutes, type RuntimeServerDependencies, type ServerDependencies } from "./routes.js";
import type { OpenWebSearchClient } from "./upstream/open-websearch.js";
import { engines } from "./db/schema.js";
import { LegacyUserStoreManager } from "./services/user-stores.js";
import { SlidingWindowRateLimiter } from "./services/rate-limiter.js";
import type { UserStore } from "./services/user-stores.js";

export function buildServer(config: ServerConfig, upstream: OpenWebSearchClient, dependencies: ServerDependencies) {
  const app = Fastify({ logger: config.environment !== "test" });
  const runtimeDependencies = (dependencies.userStores
    ? dependencies as RuntimeServerDependencies
    : {
      ...dependencies,
      userStores: new LegacyUserStoreManager({
        gatewayUserId: "legacy-test-user",
        ownerId: "legacy-test-owner",
        database: dependencies.database,
        settings: dependencies.settings!,
        audit: dependencies.audit!,
        tokens: dependencies.tokens!,
        search: dependencies.search!,
        rateLimiter: dependencies.rateLimiter ?? new SlidingWindowRateLimiter(),
      }),
    }) as RuntimeServerDependencies;
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DomainError) return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
    return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "服务内部错误" } });
  });
  app.register(cookie, { secret: config.cookieSecret });
  app.register(cors, {
    origin: true,
    credentials: true,
  });
  app.register(rateLimit, { global: false });
  app.addHook("onReady", async () => upstream.assertSecureRuntime());
  app.get("/health", async () => {
    await upstream.health();
    return { status: "ok" };
  });
  registerAdminRoutes(app, config, runtimeDependencies);
  app.post("/mcp", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request, reply) => {
    const authorization = request.headers.authorization;
    let store: UserStore;
    let mcpAuthorization: McpAuthorization;
    try {
      if (authorization !== undefined) {
        if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return reply.code(401).header("www-authenticate", "Bearer").send({ error: { code: "TOKEN_UNAUTHORIZED", message: "需要 Bearer Token" } });
        const tokenContext = runtimeDependencies.userStores.authenticateToken(authorization.slice("Bearer ".length));
        const gatewayUserId = headerValue(request.headers["x-hc-user-id"]);
        if (gatewayUserId && gatewayUserId !== tokenContext.gatewayUserId) throw new DomainError("GATEWAY_USER_MISMATCH", "Token 不属于当前懒猫用户", 401);
        store = tokenContext.store;
        mcpAuthorization = {
          token: tokenContext.token,
          ensureScope: (scope) => store.tokens.verifyTokenContext(tokenContext.token, scope, store.settings.get<number>("rateLimit.mcp.rpm") ?? 60),
        };
      } else {
        const delegatedUserId = delegatedUserIdFromRequest(request);
        if (!delegatedUserId) return reply.code(401).header("www-authenticate", "Bearer").send({ error: { code: "TOKEN_UNAUTHORIZED", message: "需要 Bearer Token 或可信懒猫应用间身份" } });
        store = runtimeDependencies.userStores.getForGateway(delegatedUserId);
        mcpAuthorization = {
          ensureScope: () => {
            store.rateLimiter.assert("mcp:delegated", store.settings.get<number>("rateLimit.mcp.rpm") ?? 60);
            return () => {};
          },
        };
      }
      const server = createMcpServer({ search: store.search, settings: store.settings, authorization: mcpAuthorization, getEnabledEngines: () => {
        const available = store.database.orm.select({ id: engines.id }).from(engines).where(eq(engines.enabled, true)).all().map((engine) => engine.id as EngineId);
        return orderEngineIds(store.settings.get<unknown>("search.mcpEngineOrder"), available);
      } });
      const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      reply.raw.on("close", () => { void transport.close(); void server.close(); });
      await transport.handleRequest(request.raw, reply.raw, request.body);
      return reply;
    } catch (error) {
      const message = error instanceof Error ? error.message : "MCP 服务错误";
      const code = error instanceof Error && "statusCode" in error ? Number((error as { statusCode: number }).statusCode) : 500;
      return reply.code(code).send({ error: { code: error instanceof Error && "code" in error ? (error as { code: string }).code : "MCP_ERROR", message } });
    }
  });
  const mcpMethodNotAllowed = async (_request: unknown, reply: { code: (status: number) => { header: (key: string, value: string) => { send: (body: unknown) => unknown } } }) => reply.code(405).header("allow", "POST").send({ error: { code: "METHOD_NOT_ALLOWED", message: "仅支持 POST" } });
  app.get("/mcp", mcpMethodNotAllowed);
  app.delete("/mcp", mcpMethodNotAllowed);
  return app;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value) && value[0]?.trim()) return value[0].trim();
  return undefined;
}

function delegatedUserIdFromRequest(request: { headers: Record<string, string | string[] | undefined> }): string | undefined {
  const source = headerValue(request.headers["x-hc-source"]);
  const userId = headerValue(request.headers["x-hc-user-id"]);
  const packageId = source?.slice("app:".length);
  const packageNamePattern = /^[a-z][a-z0-9]*([-][a-z0-9]+)*(?:\.[a-z][a-z0-9]*([-][a-z0-9]+)*)*$/;
  if (!source?.startsWith("app:") || !packageId || !packageNamePattern.test(packageId) || !userId) return undefined;
  return userId;
}
