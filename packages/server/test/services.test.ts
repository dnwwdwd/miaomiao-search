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
import { OidcService, resolveOidcAccount } from "../src/services/oidc.js";
import { LocalAccountService } from "../src/services/local-accounts.js";
import { SearchService } from "../src/services/search.js";
import { SettingsService } from "../src/services/settings.js";
import { TokenService } from "../src/services/tokens.js";
import { SlidingWindowRateLimiter } from "../src/services/rate-limiter.js";
import { UserStoreManager } from "../src/services/user-stores.js";
import type { OpenWebSearchClient } from "../src/upstream/open-websearch.js";
import { HttpOpenWebSearchClient } from "../src/upstream/open-websearch.js";
import { buildServer } from "../src/app.js";
import { createProviderRegistry } from "../src/providers/registry.js";
import { engineIds } from "../src/domain.js";

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
  async fetchGithubReadme(): Promise<string> { return "# README"; }
  async fetchCsdnArticle(): Promise<string> { return "CSDN article"; }
  async fetchJuejinArticle(): Promise<string> { return "Juejin article"; }
  async fetchLinuxDoArticle(): Promise<string> { return "Linux.do article"; }
}

const rateLimitedExaFetch: typeof fetch = async () => new Response(JSON.stringify({ error: "rate limited" }), {
  status: 429,
  headers: { "content-type": "application/json" },
});

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "miaomiao-search-"));
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
    assert.equal(count(database, "SELECT COUNT(*) AS count FROM engine"), 11);
    assert.equal(count(database, "SELECT COUNT(*) AS count FROM engine WHERE id = 'startpage'"), 0);
    assert.equal(count(database, "SELECT COUNT(*) AS count FROM setting"), 22);
    assert.equal(count(database, "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'local_account'"), 1);
    assert.equal((database.sqlite.prepare("SELECT search_mode FROM engine WHERE id = 'bing'").get() as { search_mode: string }).search_mode, "request");
    assert.deepEqual((database.sqlite.prepare("SELECT id FROM engine WHERE enabled = 1 AND is_default = 1 ORDER BY id").all() as Array<{ id: string }>).map((row) => row.id), ["baidu", "bing", "csdn", "juejin", "sogou"]);
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bootstrap preserves existing engine defaults and user settings", async () => {
  const { dir, config, database } = setup();
  try {
    await bootstrapDatabase(database, config);
    database.sqlite.prepare("UPDATE engine SET enabled = 0, is_default = 0").run();
    database.sqlite.prepare("UPDATE setting SET value = ? WHERE key = 'search.defaultEngines'").run(JSON.stringify(["bing", "duckduckgo"]));
    await bootstrapDatabase(database, config);
    assert.deepEqual((database.sqlite.prepare("SELECT id FROM engine WHERE enabled = 1 AND is_default = 1 ORDER BY id").all() as Array<{ id: string }>).map((row) => row.id), []);
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("provider registry maps all eleven engines without sharing user settings", async () => {
  const { dir, config, database } = setup();
  try {
    await bootstrapDatabase(database, config);
    const registry = createProviderRegistry(new SettingsService(database, config.settingsEncryptionKey), new FakeUpstream());
    assert.deepEqual(engineIds.map((id) => registry.get(id).engine), [...engineIds]);
    assert.equal(registry.get("tavily").maxResults, 20);
    assert.equal(registry.get("bilibili").maxResults, 20);
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("OIDC users receive a signed, expiring application session", async () => {
  const { dir, config, database } = setup();
  try {
    const auth = oidc(config);
    const session = await auth.createSession({ id: "lazycat-user", account: "lazycat-user", name: "Lazycat User", role: "NORMAL", loginMethod: "oidc" });
    assert.deepEqual(await auth.verifySession(session), { id: "lazycat-user", account: "lazycat-user", name: "Lazycat User", role: "NORMAL", loginMethod: "oidc" });
    await assert.rejects(() => auth.verifySession("invalid"), (error: unknown) => error instanceof DomainError && error.code === "SESSION_UNAUTHORIZED");
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("OIDC logout URL targets the Lazycat logout endpoint", () => {
  const { dir, config, database } = setup();
  try {
    const auth = new OidcService({ ...config.oidc, issuerUri: new URL("https://box.heiyu.space/sys/oauth") }, config.sessionSecret);
    const logoutUrl = new URL(auth.createLogoutUrl("https://miaomiao-search.example/")!);
    assert.equal(logoutUrl.pathname, "/sys/oauth/logout");
    assert.equal(logoutUrl.searchParams.get("client_id"), config.oidc.clientId);
    assert.equal(logoutUrl.searchParams.get("post_logout_redirect_uri"), "https://miaomiao-search.example/");
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("OIDC provisioning creates a default local password and keeps account names unique", () => {
  const { dir, database } = setup();
  try {
    const accounts = new LocalAccountService(database);
    const oidcUser = { id: "lazycat-user", account: "lazycat-user", name: "Lazycat User", role: "NORMAL" as const, loginMethod: "oidc" as const };
    assert.throws(() => accounts.authenticate(oidcUser.account, "12345678"), (error: unknown) => error instanceof DomainError && error.code === "LOCAL_LOGIN_INVALID");
    assert.deepEqual(accounts.provisionFromOidc(oidcUser), oidcUser);
    assert.deepEqual(accounts.authenticate("  LAZYCAT-USER ", "12345678"), { ...oidcUser, loginMethod: "local" });
    accounts.changePassword(oidcUser, undefined, "new-password");
    assert.throws(() => accounts.authenticate(oidcUser.account, "12345678"), (error: unknown) => error instanceof DomainError && error.code === "LOCAL_LOGIN_INVALID");
    assert.deepEqual(accounts.authenticate(oidcUser.account, "new-password"), { ...oidcUser, loginMethod: "local" });
    assert.throws(() => accounts.changePassword({ ...oidcUser, loginMethod: "local" }, "wrong-password", "another-password"), (error: unknown) => error instanceof DomainError && error.code === "CURRENT_PASSWORD_INVALID");
    accounts.changePassword({ ...oidcUser, loginMethod: "local" }, "new-password", "another-password");
    assert.deepEqual(accounts.authenticate(oidcUser.account, "another-password"), { ...oidcUser, loginMethod: "local" });
    accounts.provisionFromOidc({ ...oidcUser, account: "renamed-user" });
    assert.equal(accounts.authenticate("renamed-user", "another-password").account, "renamed-user");
    accounts.provisionFromOidc({ id: "other-user", account: "other-user", name: "Other User", role: "NORMAL", loginMethod: "oidc" });
    assert.throws(() => accounts.provisionFromOidc({ id: "other-user", account: "renamed-user", name: "Other User", role: "NORMAL", loginMethod: "oidc" }), (error: unknown) => error instanceof DomainError && error.code === "LOCAL_ACCOUNT_CONFLICT");
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("OIDC account resolution prefers the Lazycat gateway UID over token claims", () => {
  assert.equal(resolveOidcAccount("LazyCatUser", { preferred_username: "userinfo-name" }, { preferred_username: "internal-name", email: "internal@example.com", sub: "oidc-sub" }), "lazycatuser");
  assert.equal(resolveOidcAccount({ preferred_username: "claim-user", sub: "oidc-sub" }), "claim-user");
  assert.equal(resolveOidcAccount({ sub: "oidc-sub" }), "oidc-sub");
});

test("local auth routes expose the login method and require an OIDC-provisioned account", async () => {
  const { dir, config, database } = setup();
  try {
    const upstream = new FakeUpstream();
    const audit = new AuditService(database);
    const settings = new SettingsService(database, config.settingsEncryptionKey);
    const localAccounts = new LocalAccountService(database);
    const app = buildServer(config, upstream, { database, audit, settings, auth: oidc(config), localAccounts, tokens: new TokenService(database, config.tokenHashKey), search: new SearchService(upstream, audit, settings), rateLimiter: new SlidingWindowRateLimiter() });
    await app.ready();
    const unavailable = await app.inject({ method: "POST", url: "/api/auth/local/login", headers: { host: "127.0.0.1" }, payload: { account: "not-provisioned", password: "12345678" } });
    assert.equal(unavailable.statusCode, 401);
    localAccounts.provisionFromOidc({ id: "route-user", account: "route-user", name: "Route User", role: "NORMAL", loginMethod: "oidc" });
    const login = await app.inject({ method: "POST", url: "/api/auth/local/login", headers: { host: "127.0.0.1" }, payload: { account: "ROUTE-USER", password: "12345678" } });
    assert.equal(login.statusCode, 200);
    assert.equal(login.json().user.loginMethod, "local");
    const setCookie = login.headers["set-cookie"];
    assert.ok(setCookie);
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";", 1)[0];
    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { host: "127.0.0.1", cookie } });
    assert.equal(me.statusCode, 200);
    assert.deepEqual(me.json().user, { id: "route-user", account: "route-user", name: "Route User", role: "NORMAL", loginMethod: "local" });
    const wrongCurrent = await app.inject({ method: "PUT", url: "/api/auth/password", headers: { host: "127.0.0.1", cookie }, payload: { currentPassword: "wrong-password", newPassword: "new-password" } });
    assert.equal(wrongCurrent.statusCode, 400);
    assert.equal(wrongCurrent.json().error.code, "CURRENT_PASSWORD_INVALID");
    const changed = await app.inject({ method: "PUT", url: "/api/auth/password", headers: { host: "127.0.0.1", cookie }, payload: { currentPassword: "12345678", newPassword: "new-password" } });
    assert.equal(changed.statusCode, 200);
    assert.deepEqual(changed.json(), { ok: true, reloginRequired: true });
    const changedCookies = Array.isArray(changed.headers["set-cookie"]) ? changed.headers["set-cookie"] : [String(changed.headers["set-cookie"] ?? "")];
    assert.ok(changedCookies.some((value) => value.startsWith("miaomiao_search_session=") && value.includes("Expires=Thu, 01 Jan 1970")));
    const oldPassword = await app.inject({ method: "POST", url: "/api/auth/local/login", headers: { host: "127.0.0.1" }, payload: { account: "route-user", password: "12345678" } });
    assert.equal(oldPassword.statusCode, 401);
    const newPassword = await app.inject({ method: "POST", url: "/api/auth/local/login", headers: { host: "127.0.0.1" }, payload: { account: "route-user", password: "new-password" } });
    assert.equal(newPassword.statusCode, 200);
    const logoutPost = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { host: "127.0.0.1" } });
    assert.equal(logoutPost.statusCode, 200);
    assert.equal(logoutPost.json().ok, true);
    const logoutPostCookies = Array.isArray(logoutPost.headers["set-cookie"]) ? logoutPost.headers["set-cookie"] : [String(logoutPost.headers["set-cookie"] ?? "")];
    assert.ok(logoutPostCookies.some((cookie) => cookie.startsWith("miaomiao_search_session=")));
    const logout = await app.inject({ method: "GET", url: "/api/auth/logout", headers: { host: "127.0.0.1" } });
    assert.equal(logout.statusCode, 302);
    assert.equal(logout.headers.location, "/login");
    const logoutCookies = Array.isArray(logout.headers["set-cookie"]) ? logout.headers["set-cookie"] : [String(logout.headers["set-cookie"] ?? "")];
    assert.ok(logoutCookies.some((cookie) => cookie.startsWith("miaomiao_search_session=")));
    assert.ok(logoutCookies.some((cookie) => cookie.startsWith("miaomiao_search_oidc_state=")));
    await app.close();
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("OIDC sessions self-heal the local account from the Lazycat gateway UID", async () => {
  const { dir, config, database } = setup();
  try {
    const upstream = new FakeUpstream();
    const audit = new AuditService(database);
    const settings = new SettingsService(database, config.settingsEncryptionKey);
    const localAccounts = new LocalAccountService(database);
    const auth = oidc(config);
    const app = buildServer(config, upstream, { database, audit, settings, auth, localAccounts, tokens: new TokenService(database, config.tokenHashKey), search: new SearchService(upstream, audit, settings), rateLimiter: new SlidingWindowRateLimiter() });
    await app.ready();
  const cookie = `miaomiao_search_session=${await auth.createSession({ id: "legacy-sub", account: "wrong-sub", name: "Lazycat User", role: "NORMAL", loginMethod: "oidc" })}`;
    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { host: "127.0.0.1", cookie, "x-hc-user-id": "LazyCatUser", "x-hc-user-role": "ADMIN" } });
    assert.equal(me.statusCode, 200);
    assert.deepEqual(me.json().user, { id: "legacy-sub", account: "lazycatuser", name: "Lazycat User", role: "ADMIN", loginMethod: "oidc" });
    assert.equal(localAccounts.authenticate("lazycatuser", "12345678").id, "legacy-sub");
    const changed = await app.inject({ method: "PUT", url: "/api/auth/password", headers: { host: "127.0.0.1", cookie, "x-hc-user-id": "LazyCatUser" }, payload: { newPassword: "oidc-new-password" } });
    assert.equal(changed.statusCode, 200);
    assert.deepEqual(changed.json(), { ok: true, reloginRequired: true });
    const changedCookies = Array.isArray(changed.headers["set-cookie"]) ? changed.headers["set-cookie"] : [String(changed.headers["set-cookie"] ?? "")];
  assert.ok(changedCookies.some((value) => value.startsWith("miaomiao_search_session=") && value.includes("Expires=Thu, 01 Jan 1970")));
    assert.equal(localAccounts.authenticate("lazycatuser", "oidc-new-password").id, "legacy-sub");
    await app.close();
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
    assert.equal(tokens.list().find((token) => token.id === created.id)?.usageToday, 1);
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
    const settings = new SettingsService(database, config.settingsEncryptionKey);
    settings.set("engine.exa.apiKey", "exa-test-key");
    const service = new SearchService(upstream, new AuditService(database), settings, undefined, undefined, undefined, undefined, createProviderRegistry(settings, upstream, { fetch: rateLimitedExaFetch }));
    const input: SearchInput = { query: "lazycat", engines: ["bing", "duckduckgo", "exa"], limit: 10, searchMode: "auto" };
    const first = await service.search(input, { channel: "web" });
    const second = await service.search(input, { channel: "web" });
    assert.equal(first.results.length, 1);
    assert.deepEqual(first.results[0].engines.sort(), ["bing", "duckduckgo"]);
    assert.equal(first.engineResults.length, 3);
    assert.equal(first.engineResults.find((group) => group.engine === "exa")?.failure?.code, "EXA_RATE_LIMITED");
    assert.equal(second.cached, false);
    assert.equal(second.engineResults.find((group) => group.engine === "exa")?.failure?.code, "EXA_RATE_LIMITED");
    assert.equal(upstream.searches, 2);
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

test("configuration does not require local passwords and accepts tunnel-compatible upstream URLs", () => {
  assert.doesNotThrow(() => loadConfig({ NODE_ENV: "test", DATA_DIR: tmpdir() }));
  assert.doesNotThrow(() => loadConfig({ NODE_ENV: "test", DATA_DIR: tmpdir(), OPEN_WEBSEARCH_URL: "https://search.example" }));
  assert.throws(() => loadConfig({ NODE_ENV: "test", DATA_DIR: tmpdir(), OPEN_WEBSEARCH_URL: "ftp://search.example" }), /must use HTTP\(S\)/);
});

test("tunnel Host and Origin are not blocked by an application allowlist", async () => {
  const { dir, config, database } = setup();
  try {
    const upstream = new FakeUpstream();
    const app = buildServer(config, upstream, {
      database,
      audit: new AuditService(database),
      settings: new SettingsService(database, config.settingsEncryptionKey),
      auth: oidc(config),
      localAccounts: new LocalAccountService(database),
      tokens: new TokenService(database, config.tokenHashKey),
      search: new SearchService(upstream, new AuditService(database)),
      rateLimiter: new SlidingWindowRateLimiter(),
    });
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/api/auth/me", headers: { host: "public-tunnel.example", origin: "https://public-tunnel.example" } });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, "GATEWAY_USER_MISSING");
    assert.equal(response.headers["access-control-allow-origin"], "https://public-tunnel.example");
    await app.close();
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("content fetch accepts private and DNS-resolved targets by deployment policy", async () => {
  const { dir, config, database } = setup();
  try {
    const upstream = new FakeUpstream();
    const service = new SearchService(upstream, new AuditService(database), new SettingsService(database, config.settingsEncryptionKey));
    const result = await service.fetchContent("http://127.0.0.1:3210/internal", 50_000, { channel: "web" });
    assert.equal(result.content.url, "http://127.0.0.1:3210/internal");
    await assert.rejects(() => service.fetchContent("ftp://127.0.0.1/file", 50_000, { channel: "web" }), (error: unknown) => error instanceof DomainError && error.code === "URL_SCHEME_NOT_ALLOWED");
    await assert.rejects(() => service.fetchContent("http://user:password@127.0.0.1/internal", 50_000, { channel: "web" }), (error: unknown) => error instanceof DomainError && error.code === "URL_CREDENTIALS_NOT_ALLOWED");
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
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
      fetchGithubReadme: async () => null,
      fetchCsdnArticle: async () => "",
      fetchJuejinArticle: async () => "",
      fetchLinuxDoArticle: async () => "",
    };
    const service = new SearchService(upstream, new AuditService(database), new SettingsService(database, config.settingsEncryptionKey));
    await assert.rejects(() => service.search({ query: "timeout", engines: ["bing"] }, { channel: "web", saveHistory: false }), (error: unknown) => error instanceof DomainError && error.code === "UPSTREAM_TIMEOUT" && error.message === "timed out");
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

test("upstream fetch preserves extraction metadata and maps an empty body to a non-400 content error", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let mode: "metadata" | "error" = "metadata";
    globalThis.fetch = (async (input: URL | string) => {
      const path = new URL(String(input)).pathname;
      assert.equal(path, "/fetch-web");
      if (mode === "error") {
        return new Response(JSON.stringify({ status: "error", data: null, error: { code: "content_not_extracted", message: "No readable content was extracted from this URL" } }), { status: 422, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({
        status: "ok",
        data: {
          url: "https://example.com/spa",
          finalUrl: "https://example.com/spa",
          title: "SPA page",
          contentType: "text/html",
          truncated: false,
          content: "Structured article body",
          retrievalMethod: "browser-html",
          extractionMethod: "structured",
          readabilityApplied: false,
        },
        error: null,
      }), { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const client = new HttpOpenWebSearchClient(new URL("http://127.0.0.1:3210"), "2.1.11");
    const result = await client.fetchWebContent({ url: "https://example.com/spa", maxChars: 50_000 });
    assert.equal(result.retrievalMethod, "browser-html");
    assert.equal(result.extractionMethod, "structured");
    assert.equal(result.readabilityApplied, false);
    mode = "error";
    await assert.rejects(() => client.fetchWebContent({ url: "https://example.com/empty", maxChars: 50_000 }), (error: unknown) => error instanceof DomainError && error.code === "CONTENT_NOT_EXTRACTED" && error.statusCode === 422);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("web and MCP content fetch share the same content-not-extracted error contract", async () => {
  const { dir, config, database } = setup();
  try {
    const upstream: OpenWebSearchClient = {
      health: async () => {},
      assertSecureRuntime: async () => {},
      search: async () => ({ results: [], failures: [] }),
      fetchWebContent: async () => { throw new DomainError("CONTENT_NOT_EXTRACTED", "页面已访问，但未识别到可读正文", 422); },
      fetchGithubReadme: async () => null,
      fetchCsdnArticle: async () => "",
      fetchJuejinArticle: async () => "",
      fetchLinuxDoArticle: async () => "",
    };
    const service = new SearchService(upstream, new AuditService(database), new SettingsService(database, config.settingsEncryptionKey));
    for (const channel of ["web", "mcp"] as const) {
      await assert.rejects(() => service.fetchContent("https://example.com/empty", 50_000, { channel }), (error: unknown) => error instanceof DomainError && error.code === "CONTENT_NOT_EXTRACTED" && error.statusCode === 422);
    }
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("upstream specialized fetch adapters use their dedicated daemon endpoints and preserve errors", async () => {
  const requests: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requests.push(new URL(url).pathname);
    const failed = url.endsWith("/fetch-juejin");
    return new Response(JSON.stringify(failed
      ? { status: "error", data: null, error: { code: "validation_failed", message: "请提供 juejin.cn 文章 URL" } }
      : { status: "ok", data: { url: "https://github.com/open-websearch/open-websearch", content: "# README" }, error: null }), { status: failed ? 400 : 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const client = new HttpOpenWebSearchClient(new URL("http://127.0.0.1:3210"), "2.1.11");
    assert.equal(await client.fetchGithubReadme({ url: "https://github.com/open-websearch/open-websearch" }), "# README");
    await assert.rejects(() => client.fetchJuejinArticle({ url: "https://juejin.cn/post/1" }), (error: unknown) => error instanceof DomainError && error.message.includes("请提供 juejin.cn 文章 URL"));
    assert.deepEqual(requests, ["/fetch-github-readme", "/fetch-juejin"]);
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
    const search = new SearchService(upstream, audit, settings, undefined, undefined, undefined, undefined, createProviderRegistry(settings, upstream, { fetch: rateLimitedExaFetch }));
    const app = buildServer(config, upstream, { database, audit, settings, auth, localAccounts: new LocalAccountService(database), tokens: new TokenService(database, config.tokenHashKey), search, rateLimiter: new SlidingWindowRateLimiter() });
    await app.ready();
  const cookie = `miaomiao_search_session=${await auth.createSession({ id: "lazycat-user", account: "lazycat-user", name: "Lazycat User", role: "NORMAL", loginMethod: "oidc" })}`;
    const enginesResponse = await app.inject({ method: "GET", url: "/api/engines", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] } });
    assert.equal(enginesResponse.statusCode, 200);
    assert.equal(enginesResponse.json().engines.length, 11);
    const enginePayload = enginesResponse.json().engines as Array<Record<string, unknown>>;
    assert.equal(enginePayload.find((engine) => engine.id === "tavily")?.maxResults, 20);
    assert.equal(enginePayload.find((engine) => engine.id === "github")?.apiKeyOptional, true);
    assert.equal(enginePayload.find((engine) => engine.id === "exa")?.credentialUrl, "https://dashboard.exa.ai/api-keys");
    assert.equal(enginePayload.find((engine) => engine.id === "bilibili")?.supportsApiKey, false);
    assert.equal(enginesResponse.json().engines.find((engine: { id: string }) => engine.id === "brave"), undefined);
    const exaWithoutKey = await app.inject({ method: "PATCH", url: "/api/engines/exa", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] }, payload: { enabled: true } });
    assert.equal(exaWithoutKey.statusCode, 400);
    assert.equal(exaWithoutKey.json().error.code, "ENGINE_API_KEY_REQUIRED");
    const exaKey = await app.inject({ method: "PATCH", url: "/api/engines/exa", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] }, payload: { apiKey: "exa-secret-for-test" } });
    assert.equal(exaKey.statusCode, 200);
    assert.equal(exaKey.json().engine.apiKeyConfigured, true);
    assert.doesNotMatch(JSON.stringify(exaKey.json()), /exa-secret-for-test/);
    assert.doesNotMatch(String((database.sqlite.prepare("SELECT value FROM setting WHERE key = 'engine.exa.apiKey'").get() as { value: string }).value), /exa-secret-for-test/);
    const exaEnabled = await app.inject({ method: "PATCH", url: "/api/engines/exa", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] }, payload: { enabled: true } });
    assert.equal(exaEnabled.statusCode, 200);
    const githubEnabled = await app.inject({ method: "PATCH", url: "/api/engines/github", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] }, payload: { enabled: true } });
    assert.equal(githubEnabled.statusCode, 200);
    const bilibiliKey = await app.inject({ method: "PATCH", url: "/api/engines/bilibili", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] }, payload: { apiKey: "not-supported" } });
    assert.equal(bilibiliKey.statusCode, 400);
    assert.equal(bilibiliKey.json().error.code, "ENGINE_API_KEY_UNSUPPORTED");
    const tavilyTooMany = await app.inject({ method: "PATCH", url: "/api/engines/tavily", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] }, payload: { resultLimit: 50 } });
    assert.equal(tavilyTooMany.statusCode, 400);
    assert.equal(tavilyTooMany.json().error.code, "ENGINE_RESULT_LIMIT_EXCEEDED");
    const exaTest = await app.inject({ method: "POST", url: "/api/engines/exa/test", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] }, payload: { query: "lazycat" } });
    assert.equal(exaTest.statusCode, 502);
    assert.deepEqual(exaTest.json().error, { code: "EXA_RATE_LIMITED", message: "Exa 请求过于频繁" });
    settings.delete("proxy.url");
    const duckWithTunProxy = await app.inject({ method: "PATCH", url: "/api/engines/duckduckgo", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] }, payload: { enabled: true } });
    assert.equal(duckWithTunProxy.statusCode, 200);
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
    assert.equal(usageResponse.json().summary.total, 2);
    assert.equal(usageResponse.json().pagination.page, 1);
    assert.equal(usageResponse.json().pagination.pageSize, 20);
    const tokenCreate = await app.inject({ method: "POST", url: "/api/tokens", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] }, payload: { name: "portal token", rpmLimit: 60, dailyLimit: 5000, expiresAt: null } });
    assert.equal(tokenCreate.statusCode, 200);
    const createdToken = tokenCreate.json() as { id: string; prefix: string };
    audit.record({ channel: "mcp", operation: "search", tokenId: createdToken.id, tokenPrefix: createdToken.prefix, latencyMs: 1, cacheHit: false, status: "success" });
    const tokenList = await app.inject({ method: "GET", url: "/api/tokens", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] } });
    assert.equal(tokenList.statusCode, 200);
    assert.equal(tokenList.json().tokens.find((token: { id: string }) => token.id === createdToken.id)?.usageToday, 1);
    const tokenDelete = await app.inject({ method: "DELETE", url: `/api/tokens/${createdToken.id}`, headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] } });
    assert.equal(tokenDelete.statusCode, 200);
    assert.equal((await app.inject({ method: "GET", url: "/api/tokens", headers: { host: "127.0.0.1", cookie: String(cookie).split(";")[0] } })).json().tokens.some((token: { id: string }) => token.id === createdToken.id), false);
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
    const app = buildServer(config, upstream, { database, audit, settings, auth: oidc(config), localAccounts: new LocalAccountService(database), tokens: new TokenService(database, config.tokenHashKey), search: new SearchService(upstream, audit, settings), rateLimiter: new SlidingWindowRateLimiter() });
    await app.ready();
    const response = await app.inject({ method: "POST", url: "/mcp", headers: { host: "127.0.0.1" }, payload: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } } } });
    assert.equal(response.statusCode, 401);
    const token = new TokenService(database, config.tokenHashKey).create({ name: "MCP test" });
    const authorized = await app.inject({ method: "POST", url: "/mcp", headers: { host: "127.0.0.1", authorization: `Bearer ${token.secret}`, accept: "application/json, text/event-stream" }, payload: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } } } });
    assert.equal(authorized.statusCode, 200);
  assert.match(authorized.body, /miaomiao-search/);
    const mismatchedUser = await app.inject({ method: "POST", url: "/mcp", headers: { host: "127.0.0.1", authorization: `Bearer ${token.secret}`, "x-hc-user-id": "uid-other", accept: "application/json, text/event-stream" }, payload: { jsonrpc: "2.0", id: 11, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } } } });
    assert.equal(mismatchedUser.statusCode, 401);
    const toolsBefore = await app.inject({ method: "POST", url: "/mcp", headers: { host: "127.0.0.1", authorization: `Bearer ${token.secret}`, accept: "application/json, text/event-stream" }, payload: { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} } });
    assert.equal(toolsBefore.statusCode, 200);
    assert.match(toolsBefore.body, /sogou/);
    database.sqlite.prepare("UPDATE engine SET enabled = 0 WHERE id = 'sogou'").run();
    const toolsAfter = await app.inject({ method: "POST", url: "/mcp", headers: { host: "127.0.0.1", authorization: `Bearer ${token.secret}`, accept: "application/json, text/event-stream" }, payload: { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} } });
    assert.equal(toolsAfter.statusCode, 200);
    assert.doesNotMatch(toolsAfter.body, /sogou/);
    const searchCall = await app.inject({ method: "POST", url: "/mcp", headers: { host: "127.0.0.1", authorization: `Bearer ${token.secret}`, accept: "application/json, text/event-stream" }, payload: { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "search", arguments: { query: "lazycat", engines: ["bing"], limit: 3 } } } });
    assert.equal(searchCall.statusCode, 200);
    assert.match(searchCall.body, /engineResults/);
    assert.match(searchCall.body, /resultCount/);
    await app.close();
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("MCP transport accepts trusted Lazycat app delegation without falling back from invalid bearer credentials", async () => {
  const { dir, config, database } = setup();
  const upstream = new FakeUpstream();
  const stores = new UserStoreManager(config, upstream, database);
  try {
    const delegatedStore = stores.getForGateway("uid-delegated");
    await bootstrapDatabase(delegatedStore.database, config);
    const app = buildServer(config, upstream, { database, auth: oidc(config), localAccounts: new LocalAccountService(database), userStores: stores, rateLimiter: new SlidingWindowRateLimiter() });
    await app.ready();
    const headers = { host: "127.0.0.1", "x-hc-source": "app:cloud.lazycat.app.agent", "x-hc-user-id": "uid-delegated", accept: "application/json, text/event-stream" };
    const initialize = await app.inject({ method: "POST", url: "/mcp", headers, payload: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "delegated-agent", version: "1" } } } });
    assert.equal(initialize.statusCode, 200);
    assert.match(initialize.body, /miaomiao-search/);
    const tools = await app.inject({ method: "POST", url: "/mcp", headers, payload: { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} } });
    assert.equal(tools.statusCode, 200);
    assert.match(tools.body, /search/);
    const search = await app.inject({ method: "POST", url: "/mcp", headers, payload: { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search", arguments: { query: "lazycat", engines: ["bing"], limit: 1 } } } });
    assert.equal(search.statusCode, 200);
    assert.match(search.body, /engineResults/);
    const audit = delegatedStore.database.sqlite.prepare("SELECT token_id, token_prefix FROM request_log WHERE channel = 'mcp' ORDER BY created_at DESC LIMIT 1").get() as { token_id: string | null; token_prefix: string | null };
    assert.equal(audit.token_id, null);
    assert.equal(audit.token_prefix, null);

    const otherStore = stores.getForGateway("uid-other");
    await bootstrapDatabase(otherStore.database, config);
    otherStore.settings.set("mcp.tools", { ...Object.fromEntries(["fetchWebContent", "fetchCsdnArticle", "fetchJuejinArticle", "fetchGithubReadme", "fetchLinuxDoArticle"].map((name) => [name, true])), search: false });
    const otherTools = await app.inject({ method: "POST", url: "/mcp", headers: { ...headers, "x-hc-user-id": "uid-other" }, payload: { jsonrpc: "2.0", id: 4, method: "tools/list", params: {} } });
    assert.equal(otherTools.statusCode, 200);
    assert.doesNotMatch(otherTools.body, /"name":"search"/);
    delegatedStore.settings.set("rateLimit.mcp.rpm", 1);
    const limited = await app.inject({ method: "POST", url: "/mcp", headers, payload: { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "search", arguments: { query: "limited", engines: ["bing"], limit: 1 } } } });
    assert.equal(limited.statusCode, 200);
    assert.match(limited.body, /请求过于频繁/);
    const otherSearch = await app.inject({ method: "POST", url: "/mcp", headers: { ...headers, "x-hc-user-id": "uid-other" }, payload: { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "fetchWebContent", arguments: { url: "https://example.com", maxChars: 1_000 } } } });
    assert.equal(otherSearch.statusCode, 200);
    assert.match(otherSearch.body, /example\.com/);

    const missingSource = await app.inject({ method: "POST", url: "/mcp", headers: { host: headers.host, "x-hc-user-id": headers["x-hc-user-id"], accept: headers.accept }, payload: { jsonrpc: "2.0", id: 7, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "delegated-agent", version: "1" } } } });
    assert.equal(missingSource.statusCode, 401);
    const clientSource = await app.inject({ method: "POST", url: "/mcp", headers: { ...headers, "x-hc-source": "client" }, payload: { jsonrpc: "2.0", id: 8, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "delegated-agent", version: "1" } } } });
    assert.equal(clientSource.statusCode, 401);
    const malformedSource = await app.inject({ method: "POST", url: "/mcp", headers: { ...headers, "x-hc-source": "app:agent source" }, payload: { jsonrpc: "2.0", id: 81, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "delegated-agent", version: "1" } } } });
    assert.equal(malformedSource.statusCode, 401);
    const missingUser = await app.inject({ method: "POST", url: "/mcp", headers: { host: headers.host, "x-hc-source": headers["x-hc-source"], accept: headers.accept }, payload: { jsonrpc: "2.0", id: 9, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "delegated-agent", version: "1" } } } });
    assert.equal(missingUser.statusCode, 401);
    const invalidBearer = await app.inject({ method: "POST", url: "/mcp", headers: { ...headers, authorization: "Bearer invalid" }, payload: { jsonrpc: "2.0", id: 10, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "delegated-agent", version: "1" } } } });
    assert.equal(invalidBearer.statusCode, 401);
    await app.close();
  } finally {
    stores.closeAll();
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
