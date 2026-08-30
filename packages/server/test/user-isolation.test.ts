import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import { openDatabase } from "../src/db/client.js";
import { migrate } from "../src/db/migrate.js";
import { DomainError } from "../src/domain.js";
import { OidcService } from "../src/services/oidc.js";
import { UserStoreManager } from "../src/services/user-stores.js";

const upstream = {
  health: async () => {},
  assertSecureRuntime: async () => {},
  search: async () => ({ results: [], failures: [] }),
  fetchWebContent: async (input: { url: string }) => ({ url: input.url, finalUrl: input.url, title: "", contentType: "text/plain", truncated: false, content: "" }),
  fetchGithubReadme: async () => "",
  fetchCsdnArticle: async () => "",
  fetchJuejinArticle: async () => "",
  fetchLinuxDoArticle: async () => "",
};

test("user stores isolate settings and MCP token ownership", () => {
  const dir = mkdtempSync(join(tmpdir(), "miaomiao-search-isolation-"));
  const config = loadConfig({ NODE_ENV: "test", DATA_DIR: dir });
  const identity = openDatabase(config.identityDatabasePath);
  migrate(identity.sqlite);
  const stores = new UserStoreManager(config, upstream, identity);
  try {
    const alice = stores.getForGateway("uid-alice");
    const bob = stores.getForGateway("uid-bob");
    alice.settings.set("proxy.url", "http://alice:secret@example.com");
    assert.notEqual(bob.settings.get<string>("proxy.url"), "http://alice:secret@example.com");
    const created = alice.tokens.create({ name: "alice-token", scope: "search" });
    const resolved = stores.authenticateToken(created.secret);
    assert.equal(resolved.gatewayUserId, "uid-alice");
    assert.equal(resolved.ownerId, alice.ownerId);
    assert.equal(resolved.token.id, created.id);
    assert.throws(() => bob.tokens.authenticate(created.secret), (error: unknown) => error instanceof DomainError && error.code === "TOKEN_UNAUTHORIZED");
  } finally {
    stores.closeAll();
    identity.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("user search defaults follow separate persisted Web and MCP engine orders", async () => {
  const dir = mkdtempSync(join(tmpdir(), "miaomiao-search-order-"));
  const config = loadConfig({ NODE_ENV: "test", DATA_DIR: dir });
  const identity = openDatabase(config.identityDatabasePath);
  migrate(identity.sqlite);
  const calls: string[][] = [];
  const orderUpstream = {
    ...upstream,
    search: async (input: { engines: string[] }) => {
      calls.push(input.engines);
      return { results: [], failures: [] };
    },
  };
  const stores = new UserStoreManager(config, orderUpstream, identity);
  try {
    const alice = stores.getForGateway("uid-order");
    alice.settings.set("search.homeEngineOrder", ["sogou", "bing"]);
    alice.settings.set("search.mcpEngineOrder", ["csdn", "bing"]);

    const web = await alice.search.search({ query: "gold", engines: [] }, { channel: "web", saveHistory: false });
    const mcp = await alice.search.search({ query: "gold", engines: [] }, { channel: "mcp", saveHistory: false });
    const explicit = await alice.search.search({ query: "gold", engines: ["bing", "sogou"] }, { channel: "mcp", saveHistory: false });

    assert.deepEqual(web.engineResults.map((group) => group.engine), ["sogou", "bing", "baidu", "csdn", "juejin"]);
    assert.deepEqual(mcp.engineResults.map((group) => group.engine), ["csdn", "bing", "baidu", "juejin", "sogou"]);
    assert.deepEqual(explicit.engineResults.map((group) => group.engine), ["bing", "sogou"]);
    assert.ok(calls.some((engines) => engines[0] === "sogou"));
  } finally {
    stores.closeAll();
    identity.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("session binding rejects a changed gateway UID", async () => {
  const dir = mkdtempSync(join(tmpdir(), "miaomiao-search-session-"));
  try {
    const config = loadConfig({ NODE_ENV: "test", DATA_DIR: dir });
    const auth = new OidcService(config.oidc, config.sessionSecret);
    const token = await auth.createSession({ id: "oidc-sub", account: "alice", name: "Alice", role: "NORMAL", loginMethod: "oidc" }, { gatewayUserId: "uid-alice", ownerId: "owner-alice" });
    await assert.rejects(() => auth.verifySessionContext(token, "uid-bob"), (error: unknown) => error instanceof DomainError && error.code === "GATEWAY_USER_MISMATCH");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
