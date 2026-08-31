import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../../src/config.js";
import { openDatabase } from "../../src/db/client.js";
import { migrate } from "../../src/db/migrate.js";
import { ExaProvider } from "../../src/providers/exa-provider.js";
import { createProviderRegistry } from "../../src/providers/registry.js";
import type { FetchContent } from "../../src/domain.js";
import { AuditService } from "../../src/services/audit.js";
import { bootstrapDatabase } from "../../src/services/bootstrap.js";
import { LocalAccountService } from "../../src/services/local-accounts.js";
import { OidcService } from "../../src/services/oidc.js";
import { SearchService } from "../../src/services/search.js";
import { SettingsService } from "../../src/services/settings.js";
import { SlidingWindowRateLimiter } from "../../src/services/rate-limiter.js";
import { TokenService } from "../../src/services/tokens.js";
import { buildServer } from "../../src/app.js";
import type { OpenWebSearchClient } from "../../src/upstream/open-websearch.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("Exa reads the encrypted user credential and maps Search API results", async () => {
  const dir = mkdtempSync(join(tmpdir(), "miaomiao-search-exa-"));
  const config = loadConfig({ NODE_ENV: "test", DATA_DIR: dir });
  const database = openDatabase(config.databasePath);
  migrate(database.sqlite);
  try {
    const settings = new SettingsService(database, config.settingsEncryptionKey);
    settings.set("engine.exa.apiKey", "exa-db-test");
    const stored = database.sqlite.prepare("SELECT value FROM setting WHERE key = 'engine.exa.apiKey'").get() as { value: string };
    assert.equal(stored.value.includes("exa-db-test"), false);
    let requestBody: Record<string, unknown> | undefined;
    let requestKey: string | null = null;
    const provider = new ExaProvider(settings, async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requestKey = new Headers(init?.headers).get("x-api-key");
      return response({ requestId: "exa-request", results: [{ title: "A <b>result</b>", url: "https://example.com/a", highlights: ["A &amp; highlight"] }] });
    });

    const result = await provider.search({ query: "lazycat", limit: 10 });
    assert.equal(requestKey, "exa-db-test");
    assert.deepEqual(requestBody, { query: "lazycat", type: "auto", numResults: 10, contents: { highlights: true } });
    assert.deepEqual(result.results[0] && { title: result.results[0].title, description: result.results[0].description, faviconUrl: result.results[0].faviconUrl, engines: result.results[0].engines }, { title: "A result", description: "A & highlight", faviconUrl: "https://example.com/favicon.ico", engines: ["exa"] });
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Exa maps authentication, quota, and rate errors", async () => {
  const settings = { get: <T>() => "exa-test" as T } as never;
  for (const [status, code] of [[401, "EXA_AUTH_FAILED"], [402, "EXA_QUOTA_EXHAUSTED"], [429, "EXA_RATE_LIMITED"]] as const) {
    const provider = new ExaProvider(settings, async () => response({}, status));
    await assert.rejects(provider.search({ query: "x", limit: 1 }), (error: unknown) => error instanceof Error && "code" in error && error.code === code);
  }
});

test("MCP search uses the Exa credential stored in the user database", async () => {
  const dir = mkdtempSync(join(tmpdir(), "miaomiao-search-exa-mcp-"));
  const config = loadConfig({ NODE_ENV: "test", DATA_DIR: dir });
  const database = openDatabase(config.databasePath);
  migrate(database.sqlite);
  const upstream: OpenWebSearchClient = {
    health: async () => {},
    assertSecureRuntime: async () => {},
    search: async () => ({ results: [], failures: [] }),
    fetchWebContent: async (input): Promise<FetchContent> => ({ url: input.url, finalUrl: input.url, title: "", contentType: "text/plain", truncated: false, content: "" }),
    fetchGithubReadme: async () => null,
    fetchCsdnArticle: async () => "",
    fetchJuejinArticle: async () => "",
    fetchLinuxDoArticle: async () => "",
  };
  let app: Awaited<ReturnType<typeof buildServer>> | undefined;
  try {
    await bootstrapDatabase(database, config);
    database.sqlite.prepare("UPDATE engine SET enabled = 1, is_default = 1 WHERE id = 'exa'").run();
    const settings = new SettingsService(database, config.settingsEncryptionKey);
    settings.set("engine.exa.apiKey", "exa-mcp-db-test");
    const audit = new AuditService(database);
    const exaFetch: typeof fetch = async (_input, init) => {
      assert.equal(new Headers(init?.headers).get("x-api-key"), "exa-mcp-db-test");
      return response({ results: [{ title: "MCP Exa result", url: "https://example.com/mcp", text: "Database credential works" }] });
    };
    const search = new SearchService(upstream, audit, settings, undefined, undefined, (engines) => engines, () => ({}), createProviderRegistry(settings, upstream, { fetch: exaFetch }));
    app = buildServer(config, upstream, { database, audit, settings, auth: new OidcService(config.oidc, config.sessionSecret), localAccounts: new LocalAccountService(database), tokens: new TokenService(database, config.tokenHashKey), search, rateLimiter: new SlidingWindowRateLimiter() });
    await app.ready();
    const token = new TokenService(database, config.tokenHashKey).create({ name: "exa-mcp", scope: "search" });
    const headers = { host: "127.0.0.1", authorization: `Bearer ${token.secret}`, accept: "application/json, text/event-stream" };
    const initialize = await app.inject({ method: "POST", url: "/mcp", headers, payload: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "exa-test", version: "1" } } } });
    assert.equal(initialize.statusCode, 200);
    const searchResponse = await app.inject({ method: "POST", url: "/mcp", headers, payload: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "search", arguments: { query: "database credential", engines: ["exa"], limit: 1 } } } });
    assert.equal(searchResponse.statusCode, 200);
    assert.match(searchResponse.body, /Database credential works/);
    await app.close();
    app = undefined;
  } finally {
    if (app) await app.close();
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
