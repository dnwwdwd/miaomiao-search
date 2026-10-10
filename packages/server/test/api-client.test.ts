import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { api } from "../../../src/lib/api.js";

test("portal API sends empty actions without JSON content type and keeps JSON bodies", async () => {
  const app = Fastify();
  const seen: string[] = [];
  app.delete("/api/tokens/:id", async (request) => { seen.push(`delete-token:${(request.params as { id: string }).id}`); return { ok: true }; });
  app.delete("/api/history", async () => { seen.push("clear-history"); return { ok: true }; });
  app.post("/api/auth/logout", async () => { seen.push("logout"); return { ok: true }; });
  app.delete("/api/feishu/connection", async () => { seen.push("clear-feishu"); return { connection: { status: "disconnected" } }; });
  app.post("/api/feishu/oauth/start", async () => { seen.push("start-oauth"); return { verificationUrl: "https://example.com", userCode: "ABCD", expiresIn: 60 }; });
  app.post("/api/feishu/oauth/poll", async () => { seen.push("poll-oauth"); return { status: "pending", retryAfter: 1 }; });
  app.post("/api/tokens", async (request) => {
    assert.equal(request.headers["content-type"], "application/json");
    assert.deepEqual(request.body, { name: "test" });
    seen.push("create-token");
    return { id: "new-token", secret: "once", prefix: "ows_", expiresAt: null };
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const response = await app.inject({
      method: (init?.method ?? "GET") as "GET" | "POST" | "DELETE",
      url: String(input),
      headers: Object.fromEntries(new Headers(init?.headers)),
      payload: init?.body == null ? undefined : String(init.body),
    });
    return new Response(response.body, { status: response.statusCode, headers: { "content-type": "application/json" } });
  };
  try {
    await api.deleteToken("existing-token");
    await api.clearHistory();
    await api.logout();
    await api.clearFeishuConnection();
    await api.startFeishuOAuth();
    await api.pollFeishuOAuth();
    await api.createToken({ name: "test" });
    assert.deepEqual(seen, ["delete-token:existing-token", "clear-history", "logout", "clear-feishu", "start-oauth", "poll-oauth", "create-token"]);
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
  }
});
