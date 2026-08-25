import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { hostHeaderValidation, originValidation } from "@modelcontextprotocol/fastify";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import Fastify from "fastify";
import type { ServerConfig } from "./config.js";
import { createMcpServer } from "./mcp.js";
import { registerAdminRoutes, type ServerDependencies } from "./routes.js";
import type { OpenWebSearchClient } from "./upstream/open-websearch.js";

export function buildServer(config: ServerConfig, upstream: OpenWebSearchClient, dependencies: ServerDependencies) {
  const app = Fastify({ logger: config.environment !== "test" });
  app.register(cookie, { secret: config.cookieSecret });
  app.register(cors, {
    origin: config.environment === "production" ? false : config.allowedOrigins,
    credentials: true,
  });
  app.register(rateLimit, { global: false });
  app.addHook("onRequest", hostHeaderValidation(config.allowedHosts));
  app.addHook("onRequest", originValidation(config.allowedOrigins.map((origin) => new URL(origin).hostname)));
  app.addHook("onReady", async () => upstream.assertSecureRuntime());
  app.get("/health", async () => {
    await upstream.health();
    return { status: "ok" };
  });
  registerAdminRoutes(app, config, dependencies);
  app.post("/mcp", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request, reply) => {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) return reply.code(401).header("www-authenticate", "Bearer").send({ error: { code: "TOKEN_UNAUTHORIZED", message: "需要 Bearer Token" } });
    try {
      const token = dependencies.tokens.authenticate(authorization.slice("Bearer ".length));
      const server = createMcpServer({ search: dependencies.search, tokens: dependencies.tokens, settings: dependencies.settings, token });
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
