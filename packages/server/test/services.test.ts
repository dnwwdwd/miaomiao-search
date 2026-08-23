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
import { AuthService } from "../src/services/auth.js";
import { bootstrapDatabase } from "../src/services/bootstrap.js";
import { SearchService } from "../src/services/search.js";
import { SettingsService } from "../src/services/settings.js";
import { TokenService } from "../src/services/tokens.js";
import { SlidingWindowRateLimiter } from "../src/services/rate-limiter.js";
import { validatePublicHttpUrl } from "../src/services/security.js";
import type { OpenWebSearchClient } from "../src/upstream/open-websearch.js";
import { HttpOpenWebSearchClient } from "../src/upstream/open-websearch.js";
import { buildServer } from "../src/app.js";

const key = Buffer.alloc(32, 9).toString("base64");

class FakeUpstream implements OpenWebSearchClient {
  searches = 0;
  lastInput?: SearchInput;
  async health(): Promise<void> {}
  async assertSecureRuntime(): Promise<void> {}
  async search(input: SearchInput): Promise<UpstreamSearchResponse> {
    this.searches += 1;
    this.lastInput = input;
    return {
      results: [
        { title: "One", url: "https://example.com/article#top", description: "a", engines: ["bing"] },
        { title: "Two", url: "https://example.com/article/", description: "b", engines: ["duckduckgo"] },
      ],
      failures: [{ engine: "brave", code: "RATE_LIMITED", message: "429" }],
    };
  }
  async fetchWebContent(input: { url: string; maxChars: number }): Promise<FetchContent> {
    return { url: input.url, finalUrl: input.url, title: "Example", contentType: "text/html", truncated: false, content: "content" };
  }
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "lazycat-search-"));
  const config = loadConfig({ NODE_ENV: "test", DATA_DIR: dir, ADMIN_PASSWORD: "a-safe-test-password", JWT_SECRET: "a-safe-test-jwt-secret-at-least-32", TOKEN_HASH_KEY: "a-safe-token-hash-key-at-least-32", SETTINGS_ENCRYPTION_KEY: key });
  const database = openDatabase(config.databasePath);
  migrate(database.sqlite);
  return { dir, config, database };
}

function count(database: ReturnType<typeof openDatabase>, sql: string): number {
  return (database.sqlite.prepare(sql).get() as { count: number }).count;
}

test("migration and bootstrap create one administrator and default engines", async () => {
  const { dir, config, database } = setup();
  try {
    await bootstrapDatabase(database, config);
    await bootstrapDatabase(database, config);
    assert.equal(count(database, "SELECT COUNT(*) AS count FROM admin"), 1);
    assert.equal(count(database, "SELECT COUNT(*) AS count FROM engine"), 9);
    assert.equal(count(database, "SELECT COUNT(*) AS count FROM setting"), 19);
    assert.equal((database.sqlite.prepare("SELECT search_mode FROM engine WHERE id = 'bing'").get() as { search_mode: string }).search_mode, "request");
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("administrator passwords are verified with a signed, expiring session", async () => {
  const { dir, config, database } = setup();
  try {
    await bootstrapDatabase(database, config);
    const auth = new AuthService(database, config.jwtSecret);
    const session = await auth.login("admin", "a-safe-test-password");
    assert.equal(await auth.verify(session.token), session.adminId);
    await assert.rejects(() => auth.login("admin", "wrong-password"), (error: unknown) => error instanceof DomainError && error.code === "INVALID_CREDENTIALS");
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
    const input: SearchInput = { query: "lazycat", engines: ["bing", "duckduckgo", "brave"], limit: 10, searchMode: "auto" };
    const first = await service.search(input, { channel: "web" });
    const second = await service.search(input, { channel: "web" });
    assert.equal(first.results.length, 1);
    assert.deepEqual(first.results[0].engines.sort(), ["bing", "duckduckgo"]);
    assert.equal(second.cached, true);
    assert.equal(upstream.searches, 1);
    assert.equal(upstream.lastInput?.searchMode, "request");
    assert.equal(count(database, "SELECT COUNT(*) AS count FROM request_log WHERE status = 'partial'"), 2);
    assert.equal(count(database, "SELECT COUNT(*) AS count FROM search_history"), 2);
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

test("configuration rejects overlong passwords and non-private upstream hosts", () => {
  assert.throws(() => loadConfig({ NODE_ENV: "test", DATA_DIR: tmpdir(), ADMIN_PASSWORD: "a".repeat(73) }), /72 UTF-8 bytes/);
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

test("management API authenticates a session and returns persisted portal data", async () => {
  const { dir, config, database } = setup();
  try {
    await bootstrapDatabase(database, config);
    const upstream = new FakeUpstream();
    const audit = new AuditService(database);
    const settings = new SettingsService(database, config.settingsEncryptionKey);
    const app = buildServer(config, upstream, { database, audit, settings, auth: new AuthService(database, config.jwtSecret), tokens: new TokenService(database, config.tokenHashKey), search: new SearchService(upstream, audit, settings), rateLimiter: new SlidingWindowRateLimiter() });
    await app.ready();
    const login = await app.inject({ method: "POST", url: "/api/auth/login", headers: { host: "127.0.0.1" }, payload: { username: "admin", password: "a-safe-test-password" } });
    assert.equal(login.statusCode, 200);
    const cookie = login.headers["set-cookie"];
    assert.ok(cookie);
    const enginesResponse = await app.inject({ method: "GET", url: "/api/engines", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] } });
    assert.equal(enginesResponse.statusCode, 200);
    assert.equal(enginesResponse.json().engines.length, 9);
    const unauthenticated = await app.inject({ method: "GET", url: "/api/settings", headers: { host: "127.0.0.1" } });
    assert.equal(unauthenticated.statusCode, 401);
    await app.close();
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
    const app = buildServer(config, upstream, { database, audit, settings, auth: new AuthService(database, config.jwtSecret), tokens: new TokenService(database, config.tokenHashKey), search: new SearchService(upstream, audit, settings), rateLimiter: new SlidingWindowRateLimiter() });
    await app.ready();
    const response = await app.inject({ method: "POST", url: "/mcp", headers: { host: "127.0.0.1" }, payload: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } } } });
    assert.equal(response.statusCode, 401);
    const token = new TokenService(database, config.tokenHashKey).create({ name: "MCP test" });
    const authorized = await app.inject({ method: "POST", url: "/mcp", headers: { host: "127.0.0.1", authorization: `Bearer ${token.secret}`, accept: "application/json, text/event-stream" }, payload: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } } } });
    assert.equal(authorized.statusCode, 200);
    assert.match(authorized.body, /lazycat-search/);
    await app.close();
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
