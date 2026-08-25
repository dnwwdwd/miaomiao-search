import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import { openDatabase } from "../src/db/client.js";
import { migrate } from "../src/db/migrate.js";
import type { FetchContent, SearchInput, UpstreamSearchResponse } from "../src/domain.js";
import { DomainError } from "../src/domain.js";
import { AuditService } from "../src/services/audit.js";
import { bootstrapDatabase } from "../src/services/bootstrap.js";
import { OidcService } from "../src/services/oidc.js";
import { SearchService } from "../src/services/search.js";
import { SettingsService } from "../src/services/settings.js";
import { TokenService } from "../src/services/tokens.js";
import { SlidingWindowRateLimiter } from "../src/services/rate-limiter.js";
import { validatePublicHttpUrl } from "../src/services/security.js";
import type { OpenWebSearchClient } from "../src/upstream/open-websearch.js";
import { HttpOpenWebSearchClient } from "../src/upstream/open-websearch.js";
import { buildServer } from "../src/app.js";

const DAY_MS = 24 * 60 * 60 * 1_000;

class FakeUpstream implements OpenWebSearchClient {
  searches = 0;
  lastInput?: SearchInput;
  inputs: SearchInput[] = [];
  async health(): Promise<void> {}
  async assertSecureRuntime(): Promise<void> {}
  async search(input: SearchInput): Promise<UpstreamSearchResponse> {
    this.searches += 1;
    this.lastInput = input;
    this.inputs.push(input);
    const engine = input.engines[0];
    return {
      results: engine === "exa" ? [] : [{ title: engine === "bing" ? "One" : "Two", url: engine === "bing" ? "https://example.com/article#top" : "https://example.com/article/", description: "a", engines: [engine] }],
      failures: engine === "exa" ? [{ engine, code: "RATE_LIMITED", message: "429" }] : [],
    };
  }
  async fetchWebContent(input: { url: string; maxChars: number }): Promise<FetchContent> {
    return { url: input.url, finalUrl: input.url, title: "Example", contentType: "text/html", truncated: false, content: "content" };
  }
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "lazycat-search-"));
  const config = loadConfig({ NODE_ENV: "test", DATA_DIR: dir });
  const database = openDatabase(config.databasePath);
  migrate(database.sqlite);
  return { dir, config, database };
}

function oidc(config: ReturnType<typeof loadConfig>) {
  return new OidcService(config.oidc, config.sessionSecret);
}

function count(database: ReturnType<typeof openDatabase>, sql: string): number {
  return (database.sqlite.prepare(sql).get() as { count: number }).count;
}

test("migration and bootstrap create default engines without a local administrator", async () => {
  const { dir, config, database } = setup();
  try {
    await bootstrapDatabase(database, config);
    await bootstrapDatabase(database, config);
    assert.equal(count(database, "SELECT COUNT(*) AS count FROM engine"), 7);
    assert.equal(count(database, "SELECT COUNT(*) AS count FROM engine WHERE id = 'startpage'"), 0);
    assert.equal(count(database, "SELECT COUNT(*) AS count FROM setting"), 22);
    assert.equal((database.sqlite.prepare("SELECT search_mode FROM engine WHERE id = 'bing'").get() as { search_mode: string }).search_mode, "request");
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("OIDC users receive a signed, expiring application session", async () => {
  const { dir, config, database } = setup();
  try {
    const auth = oidc(config);
    const session = await auth.createSession({ id: "lazycat-user", name: "Lazycat User", role: "NORMAL" });
    assert.deepEqual(await auth.verifySession(session), { id: "lazycat-user", name: "Lazycat User", role: "NORMAL" });
    await assert.rejects(() => auth.verifySession("invalid"), (error: unknown) => error instanceof DomainError && error.code === "SESSION_UNAUTHORIZED");
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("token originals cannot be recovered and revoked tokens are rejected", () => {
  const { dir, config, database } = setup();
  try {
    const tokens = new TokenService(database, config.tokenHashKey);
    const created = tokens.create({ name: "test", scope: "search" });
    assert.equal((database.sqlite.prepare("SELECT hash FROM access_token WHERE id = ?").get(created.id) as { hash: string }).hash.includes(created.secret), false);
    assert.equal(tokens.verify(created.secret, "search").id, created.id);
    tokens.setStatus(created.id, "revoked");
    assert.throws(() => tokens.verify(created.secret, "search"), (error: unknown) => error instanceof DomainError && error.code === "TOKEN_UNAUTHORIZED");
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("token limits reject calls already recorded within their windows", () => {
  const { dir, config, database } = setup();
  try {
    const tokens = new TokenService(database, config.tokenHashKey);
    const created = tokens.create({ name: "limited", rpmLimit: 1, dailyLimit: 1 });
    const audit = new AuditService(database);
    audit.record({ channel: "mcp", operation: "search", tokenId: created.id, tokenPrefix: created.prefix, latencyMs: 1, cacheHit: false, status: "success" });
    assert.throws(() => tokens.verify(created.secret, "search"), (error: unknown) => error instanceof DomainError && error.code === "TOKEN_RATE_LIMITED");
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pending MCP token reservations reject concurrent tool calls before audit records exist", () => {
  const { dir, config, database } = setup();
  try {
    const tokens = new TokenService(database, config.tokenHashKey);
    const created = tokens.create({ name: "concurrent", rpmLimit: 1 });
    const token = tokens.authenticate(created.secret);
    const release = tokens.verifyTokenContext(token, "search");
    assert.throws(() => tokens.verifyTokenContext(token, "search"), (error: unknown) => error instanceof DomainError && error.code === "TOKEN_RATE_LIMITED");
    release();
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("sensitive settings are encrypted in SQLite", () => {
  const { dir, config, database } = setup();
  try {
    const settings = new SettingsService(database, config.settingsEncryptionKey);
    settings.set("proxy.url", "http://user:secret@example.test:8080");
    const stored = (database.sqlite.prepare("SELECT value FROM setting WHERE key = 'proxy.url'").get() as { value: string }).value;
    assert.equal(stored.includes("secret"), false);
    assert.equal(settings.get<string>("proxy.url"), "http://user:secret@example.test:8080");
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("search deduplicates, caches, and persists partial-success audit data", async () => {
  const { dir, config, database } = setup();
  try {
    const upstream = new FakeUpstream();
    const service = new SearchService(upstream, new AuditService(database), new SettingsService(database, config.settingsEncryptionKey));
    const input: SearchInput = { query: "lazycat", engines: ["bing", "duckduckgo", "exa"], limit: 10, searchMode: "auto" };
    const first = await service.search(input, { channel: "web" });
    const second = await service.search(input, { channel: "web" });
    assert.equal(first.results.length, 1);
    assert.deepEqual(first.results[0].engines.sort(), ["bing", "duckduckgo"]);
    assert.equal(first.engineResults.length, 3);
    assert.equal(first.engineResults.find((group) => group.engine === "exa")?.failure?.code, "RATE_LIMITED");
    assert.equal(second.cached, true);
    assert.equal(upstream.searches, 3);
    assert.ok(upstream.inputs.some((item) => item.engines[0] === "bing" && item.searchMode === "request"));
    assert.equal(count(database, "SELECT COUNT(*) AS count FROM request_log WHERE status = 'partial'"), 2);
    assert.equal(count(database, "SELECT COUNT(*) AS count FROM search_history"), 2);
    const history = database.sqlite.prepare("SELECT engines, result_snapshot FROM search_history ORDER BY id DESC LIMIT 1").get() as { engines: string; result_snapshot: string | null };
    assert.deepEqual(JSON.parse(history.engines), ["bing", "duckduckgo", "exa"]);
    assert.equal(JSON.parse(history.result_snapshot ?? "{}").results.length, 1);
    assert.equal(JSON.parse(history.result_snapshot ?? "{}").engineResults.length, 3);
    assert.equal((database.sqlite.prepare("SELECT query FROM request_log LIMIT 1").get() as { query: null }).query, null);
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("SSRF validation rejects local targets and accepts public DNS answers", async () => {
  await assert.rejects(() => validatePublicHttpUrl("http://127.0.0.1/"), (error: unknown) => error instanceof DomainError && error.code === "SSRF_BLOCKED");
  await assert.rejects(() => validatePublicHttpUrl("https://safe.example/", async () => [{ address: "10.0.0.2" }]), (error: unknown) => error instanceof DomainError && error.code === "SSRF_BLOCKED");
  const url = await validatePublicHttpUrl("https://safe.example/path", async () => [{ address: "8.8.8.8" }]);
  assert.equal(url.hostname, "safe.example");
});

test("configuration does not require local passwords and rejects non-private upstream hosts", () => {
  assert.doesNotThrow(() => loadConfig({ NODE_ENV: "test", DATA_DIR: tmpdir() }));
  assert.throws(() => loadConfig({ NODE_ENV: "test", DATA_DIR: tmpdir(), OPEN_WEBSEARCH_URL: "https://untrusted.example" }), /private Open-WebSearch daemon/);
});

test("upstream adapter rejects insecure runtime settings and unsafe result URLs", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (input: URL | string) => {
      const path = new URL(String(input)).pathname;
      const data = path === "/status"
        ? { version: "2.1.11", configSummary: { effectiveSearchMode: "request", fetchWebAllowInsecureTls: false } }
        : [{ title: "unsafe", url: "javascript:alert(1)", description: "", engine: "bing" }];
      return new Response(JSON.stringify({ status: "ok", data, error: null }), { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const client = new HttpOpenWebSearchClient(new URL("http://127.0.0.1:3210"), "2.1.11");
    await client.assertSecureRuntime();
    await assert.rejects(() => client.search({ query: "safe", engines: ["bing"], limit: 1, searchMode: "request" }), (error: unknown) => error instanceof DomainError && error.code === "UPSTREAM_INVALID_RESPONSE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("search applies per-engine limits, request caps, and independent cache keys", async () => {
  const { dir, config, database } = setup();
  try {
    const upstream = new FakeUpstream();
    const settings = new SettingsService(database, config.settingsEncryptionKey);
    const service = new SearchService(upstream, new AuditService(database), settings, undefined, undefined, undefined, (requested) => Object.fromEntries(requested.map((engine) => [engine, engine === "bing" ? 5 : 20])));
    await service.search({ query: "limits", engines: ["bing", "duckduckgo"], limit: 7 }, { channel: "mcp", saveHistory: false });
    assert.equal(upstream.inputs.find((input) => input.engines[0] === "bing")?.limit, 5);
    assert.equal(upstream.inputs.find((input) => input.engines[0] === "duckduckgo")?.limit, 7);
    const second = await service.search({ query: "limits", engines: ["bing", "duckduckgo"], limit: 20 }, { channel: "mcp", saveHistory: false });
    assert.equal(second.engineResults.find((group) => group.engine === "bing")?.limit, 5);
    assert.equal(second.engineResults.find((group) => group.engine === "duckduckgo")?.limit, 20);
    assert.equal(second.cached, false);
    assert.equal(upstream.searches, 3);
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("usage statistics aggregate the selected range and include MCP filters and pagination", async () => {
  const { dir, config, database } = setup();
  try {
    await bootstrapDatabase(database, config);
    const now = Date.now();
    const insert = database.sqlite.prepare("INSERT INTO request_log (id, channel, operation, token_prefix, engines, latency_ms, cache_hit, result_count, status, error_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    const insertLog = (id: string, channel: string, operation: string, engines: string | null, latency: number, cacheHit: number, resultCount: number | null, status: string, ageMs: number) => insert.run(id, channel, operation, channel === "mcp" ? "mcp_test" : null, engines, latency, cacheHit, resultCount, status, status === "error" ? "UPSTREAM_TIMEOUT" : null, new Date(now - ageMs).toISOString());
    insertLog("web-old", "web", "search", '["bing"]', 90, 0, 1, "success", 400 * DAY_MS);
    insertLog("web-search", "web", "search", '["bing"]', 100, 1, 4, "success", 3 * DAY_MS);
    insertLog("mcp-search", "mcp", "search", '["exa"]', 300, 0, 2, "partial", 2 * DAY_MS);
    insertLog("mcp-fetch", "mcp", "fetchWebContent", null, 500, 0, null, "error", 60 * 60 * 1_000);
    insertLog("web-second", "web", "search", '["bing"]', 200, 0, 3, "success", 30 * 60 * 1_000);

    const audit = new AuditService(database);
    const from = new Date(now - 4 * DAY_MS).toISOString();
    const to = new Date(now + DAY_MS).toISOString();
    const result = audit.usage({ from, to, timeZone: "Asia/Shanghai", page: 1, pageSize: 2 });
    assert.equal(result.summary.total, 4);
    assert.equal(result.summary.success, 2);
    assert.equal(result.summary.partial, 1);
    assert.equal(result.summary.errors, 1);
    assert.equal(result.summary.cacheHits, 1);
    assert.equal(result.summary.p95LatencyMs, 500);
    assert.deepEqual(result.channels, { web: 2, mcp: 2 });
    assert.equal(result.operations.find((item) => item.name === "search")?.count, 3);
    assert.equal(result.engines.find((item) => item.engine === "bing")?.calls, 2);
    assert.equal(result.engines.find((item) => item.engine === "exa")?.calls, 1);
    assert.equal(result.pagination.total, 4);
    assert.equal(result.pagination.totalPages, 2);
    assert.equal(result.logs.length, 2);
    assert.ok(result.series.length >= 2);

    const mcpSearch = audit.usage({ from, to, channel: "mcp", operation: "search", timeZone: "Asia/Shanghai" });
    assert.equal(mcpSearch.summary.total, 1);
    assert.equal(mcpSearch.channels.mcp, 1);
    assert.equal(mcpSearch.logs[0]?.operation, "search");
    assert.deepEqual(mcpSearch.facets.engines, ["bing", "exa"]);
    assert.throws(() => audit.usage({ from: to, to: from }), (error: unknown) => error instanceof DomainError && error.code === "USAGE_RANGE_INVALID");
    assert.throws(() => audit.usage({ from: new Date(now - 366 * DAY_MS).toISOString(), to }), (error: unknown) => error instanceof DomainError && error.code === "USAGE_RANGE_TOO_LARGE");
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("unconfigured engines fall back to the system default result count", async () => {
  const { dir, config, database } = setup();
  try {
    const upstream = new FakeUpstream();
    const service = new SearchService(upstream, new AuditService(database), new SettingsService(database, config.settingsEncryptionKey));
    await service.search({ query: "fallback", engines: ["bing"] }, { channel: "mcp", saveHistory: false });
    assert.equal(upstream.inputs.at(-1)?.limit, 10);
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("all engine failures preserve the stable error code", async () => {
  const { dir, config, database } = setup();
  try {
    const upstream: OpenWebSearchClient = {
      health: async () => {},
      assertSecureRuntime: async () => {},
      search: async () => { throw new DomainError("UPSTREAM_TIMEOUT", "timed out", 504); },
      fetchWebContent: async (input) => ({ url: input.url, finalUrl: input.url, title: "", contentType: "text/plain", truncated: false, content: "" }),
    };
    const service = new SearchService(upstream, new AuditService(database), new SettingsService(database, config.settingsEncryptionKey));
    await assert.rejects(() => service.search({ query: "timeout", engines: ["bing", "duckduckgo"] }, { channel: "mcp", saveHistory: false }), (error: unknown) => error instanceof DomainError && error.code === "ALL_ENGINES_FAILED");
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("upstream fetch enables readability extraction for HTML pages", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  try {
    globalThis.fetch = (async (input: URL | string, init?: RequestInit) => {
      assert.equal(new URL(String(input)).pathname, "/fetch-web");
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        status: "ok",
        data: {
          url: "https://example.com/article",
          finalUrl: "https://example.com/article",
          title: "Article",
          contentType: "text/html",
          truncated: false,
          content: "Readable article content",
          readableHtml: "<div><p>First paragraph</p><p>Second &amp; paragraph</p></div>",
        },
        error: null,
      }), { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const client = new HttpOpenWebSearchClient(new URL("http://127.0.0.1:3210"), "2.1.11");
    const result = await client.fetchWebContent({ url: "https://example.com/article", maxChars: 50_000 });
    assert.equal(requestBody?.readability, true);
    assert.equal(requestBody?.renderMode, "request");
    assert.equal(result.content, "First paragraph\n\nSecond & paragraph");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("management API authenticates a session and returns persisted portal data", async () => {
  const { dir, config, database } = setup();
  try {
    await bootstrapDatabase(database, config);
    const upstream = new FakeUpstream();
    const audit = new AuditService(database);
    const settings = new SettingsService(database, config.settingsEncryptionKey);
    const auth = oidc(config);
    const app = buildServer(config, upstream, { database, audit, settings, auth, tokens: new TokenService(database, config.tokenHashKey), search: new SearchService(upstream, audit, settings), rateLimiter: new SlidingWindowRateLimiter() });
    await app.ready();
    const cookie = `lazycat_search_session=${await auth.createSession({ id: "lazycat-user", name: "Lazycat User", role: "NORMAL" })}`;
    const enginesResponse = await app.inject({ method: "GET", url: "/api/engines", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] } });
    assert.equal(enginesResponse.statusCode, 200);
    assert.equal(enginesResponse.json().engines.length, 7);
    assert.equal(enginesResponse.json().engines.find((engine: { id: string }) => engine.id === "brave"), undefined);
    const exaWithoutKey = await app.inject({ method: "PATCH", url: "/api/engines/exa", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] }, payload: { enabled: true } });
    assert.equal(exaWithoutKey.statusCode, 400);
    assert.equal(exaWithoutKey.json().error.code, "ENGINE_API_KEY_REQUIRED");
    const exaKey = await app.inject({ method: "PATCH", url: "/api/engines/exa", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] }, payload: { apiKey: "exa-secret-for-test" } });
    assert.equal(exaKey.statusCode, 200);
    assert.equal(exaKey.json().engine.apiKeyConfigured, true);
    assert.doesNotMatch(JSON.stringify(exaKey.json()), /exa-secret-for-test/);
    assert.doesNotMatch(String((database.sqlite.prepare("SELECT value FROM setting WHERE key = 'engine.exa.apiKey'").get() as { value: string }).value), /exa-secret-for-test/);
    const duckWithoutProxy = await app.inject({ method: "PATCH", url: "/api/engines/duckduckgo", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] }, payload: { enabled: true } });
    assert.equal(duckWithoutProxy.statusCode, 400);
    assert.equal(duckWithoutProxy.json().error.code, "ENGINE_PROXY_REQUIRED");
    const limitUpdate = await app.inject({ method: "PATCH", url: "/api/engines/bing", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] }, payload: { resultLimit: 20 } });
    assert.equal(limitUpdate.statusCode, 200);
    assert.equal(limitUpdate.json().engine.resultLimit, 20);
    const clearLimit = await app.inject({ method: "PATCH", url: "/api/engines/bing", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] }, payload: { resultLimit: null } });
    assert.equal(clearLimit.statusCode, 200);
    assert.equal(clearLimit.json().engine.resultLimit, null);
    const invalidLimit = await app.inject({ method: "PATCH", url: "/api/engines/bing", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] }, payload: { resultLimit: 51 } });
    assert.equal(invalidLimit.statusCode, 400);
    const defaultSearch = await app.inject({ method: "POST", url: "/api/search", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] }, payload: { query: "lazycat", engines: ["bing"] } });
    assert.equal(defaultSearch.statusCode, 200);
    assert.equal(defaultSearch.json().engineResults[0].limit, 10);
    const usageResponse = await app.inject({ method: "GET", url: "/api/usage?page=1&pageSize=20&timeZone=Asia%2FShanghai", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] } });
    assert.equal(usageResponse.statusCode, 200);
    assert.equal(usageResponse.json().summary.total, 1);
    assert.equal(usageResponse.json().pagination.page, 1);
    assert.equal(usageResponse.json().pagination.pageSize, 20);
    const invalidUsageRange = await app.inject({ method: "GET", url: "/api/usage?from=2026-08-02T00%3A00%3A00.000Z&to=2026-08-01T00%3A00%3A00.000Z", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] } });
    assert.equal(invalidUsageRange.statusCode, 400);
    const unauthenticated = await app.inject({ method: "GET", url: "/api/settings", headers: { host: "127.0.0.1" } });
    assert.equal(unauthenticated.statusCode, 401);
    const currentSettings = (await app.inject({ method: "GET", url: "/api/settings", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] } })).json().settings;
    const foreverSettings = { ...currentSettings, historyRetentionDays: -1 };
    const settingsUpdate = await app.inject({ method: "PUT", url: "/api/settings", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] }, payload: foreverSettings });
    assert.equal(settingsUpdate.statusCode, 200);
    assert.equal(settingsUpdate.json().settings.historyRetentionDays, -1);
    database.sqlite.prepare("UPDATE setting SET value = ? WHERE key = ?").run(JSON.stringify(["bing", "brave"]), "search.homeEngines");
    const legacySettings = (await app.inject({ method: "GET", url: "/api/settings", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] } })).json().settings;
    assert.deepEqual(legacySettings.homeEngines, ["bing"]);
    const legacyHomePreferenceUpdate = await app.inject({ method: "PUT", url: "/api/settings", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] }, payload: { ...legacySettings, homeEngines: ["bing", "brave", "baidu"] } });
    assert.equal(legacyHomePreferenceUpdate.statusCode, 200);
    assert.deepEqual(legacyHomePreferenceUpdate.json().settings.homeEngines, ["bing", "baidu"]);
    const homePreferenceSettings = { ...settingsUpdate.json().settings, homeEngines: ["bing", "duckduckgo"], homeRequestLimit: 20, homeBingMode: "auto" };
    const homePreferenceUpdate = await app.inject({ method: "PUT", url: "/api/settings", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] }, payload: homePreferenceSettings });
    assert.equal(homePreferenceUpdate.statusCode, 200);
    assert.deepEqual(homePreferenceUpdate.json().settings.homeEngines, ["bing", "duckduckgo"]);
    assert.equal(homePreferenceUpdate.json().settings.homeRequestLimit, 20);
    assert.equal(homePreferenceUpdate.json().settings.homeBingMode, "auto");
    await app.close();
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("negative one history retention keeps existing records", async () => {
  const { dir, config, database } = setup();
  try {
    await bootstrapDatabase(database, config);
    const audit = new AuditService(database);
    database.sqlite.prepare("INSERT INTO search_history (query, engines, result_count, result_snapshot, created_at) VALUES (?, ?, ?, ?, ?)").run("old record", "[\"bing\"]", 1, null, new Date(Date.now() - 90 * 24 * 60 * 60 * 1_000).toISOString());
    audit.pruneHistory(-1);
    assert.equal(audit.listHistory().length, 1);
    audit.pruneHistory(30);
    assert.equal(audit.listHistory().length, 0);
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("removed engines are hidden from legacy history and audit data", async () => {
  const { dir, config, database } = setup();
  try {
    await bootstrapDatabase(database, config);
    database.sqlite.prepare("INSERT INTO search_history (query, engines, result_count, result_snapshot, created_at) VALUES (?, ?, ?, ?, ?)").run(
      "legacy brave record",
      '["bing","brave"]',
      1,
      JSON.stringify({
        results: [{ title: "legacy", url: "https://example.com", description: "", engines: ["brave"] }],
        failures: [{ engine: "brave", code: "OLD", message: "legacy" }],
        engineResults: [{ engine: "brave", limit: 10, results: [], cached: false }],
      }),
      new Date().toISOString(),
    );
    database.sqlite.prepare("INSERT INTO request_log (id, channel, operation, engines, latency_ms, cache_hit, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      "legacy-log",
      "web",
      "search",
      '["brave","bing"]',
      10,
      0,
      "success",
      new Date().toISOString(),
    );
    const audit = new AuditService(database);
    const history = audit.listHistory()[0];
    assert.deepEqual(history.engines, ["bing"]);
    assert.deepEqual(history.snapshot?.results[0]?.engines, []);
    assert.deepEqual(history.snapshot?.failures, []);
    assert.deepEqual(history.snapshot?.engineResults, []);
    assert.deepEqual(audit.listLogs()[0]?.engines, ["bing"]);
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("MCP transport rejects missing bearer credentials and serves an authorized initialize request", async () => {
  const { dir, config, database } = setup();
  try {
    await bootstrapDatabase(database, config);
    const upstream = new FakeUpstream();
    const audit = new AuditService(database);
    const settings = new SettingsService(database, config.settingsEncryptionKey);
    const app = buildServer(config, upstream, { database, audit, settings, auth: oidc(config), tokens: new TokenService(database, config.tokenHashKey), search: new SearchService(upstream, audit, settings), rateLimiter: new SlidingWindowRateLimiter() });
    await app.ready();
    const response = await app.inject({ method: "POST", url: "/mcp", headers: { host: "127.0.0.1" }, payload: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } } } });
    assert.equal(response.statusCode, 401);
    const token = new TokenService(database, config.tokenHashKey).create({ name: "MCP test" });
    const authorized = await app.inject({ method: "POST", url: "/mcp", headers: { host: "127.0.0.1", authorization: `Bearer ${token.secret}`, accept: "application/json, text/event-stream" }, payload: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } } } });
    assert.equal(authorized.statusCode, 200);
    assert.match(authorized.body, /lazycat-search/);
    const searchCall = await app.inject({ method: "POST", url: "/mcp", headers: { host: "127.0.0.1", authorization: `Bearer ${token.secret}`, accept: "application/json, text/event-stream" }, payload: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "search", arguments: { query: "lazycat", engines: ["bing"], limit: 3 } } } });
    assert.equal(searchCall.statusCode, 200);
    assert.match(searchCall.body, /engineResults/);
    assert.match(searchCall.body, /resultCount/);
    await app.close();
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
