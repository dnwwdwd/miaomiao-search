import assert from "node:assert/strict";
import test from "node:test";
import { FeishuProvider } from "../src/providers/feishu-provider.js";
import { FeishuConnectionService } from "../src/services/feishu-connection.js";
import { PlatformContentService } from "../src/services/platform-content.js";
import type { SettingsService } from "../src/services/settings.js";

function settings(): SettingsService {
  const state = new Map<string, unknown>();
  return { get: (key: string) => state.get(key), set: (key: string, value: unknown) => { state.set(key, value); }, delete: (key: string) => { state.delete(key); } } as SettingsService;
}

function json(body: unknown): Response { return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }); }

test("Feishu OAuth device flow stores tokens and refreshes them for official search", async () => {
  const store = settings();
  const requests: Array<{ path: string; authorization: string }> = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input);
    requests.push({ path: url.pathname, authorization: new Headers(init?.headers).get("authorization") ?? "" });
    if (url.pathname === "/oauth/v1/device_authorization") return json({ device_code: "device", user_code: "ABCD", verification_uri: "https://accounts.feishu.cn/device", interval: 5, expires_in: 300 });
    if (url.pathname === "/open-apis/authen/v2/oauth/token") return json({ access_token: "access", refresh_token: "refresh", expires_in: 7200 });
    if (url.pathname === "/open-apis/search/v2/doc_wiki/search") return json({ code: 0, data: { res_units: [{ title_highlighted: "<h>测试文档</h>", summary_highlighted: "摘要", result_meta: { url: "https://team.feishu.cn/docx/ABC123" } }] } });
    throw new Error(`Unexpected ${url.pathname}`);
  }) as typeof fetch;
  const connection = new FeishuConnectionService(store, fetchImpl);
  connection.configure("cli_abcdefgh", "secret");
  const started = await connection.begin();
  assert.equal(started.userCode, "ABCD");
  assert.equal((await connection.poll()).status, "connected");
  assert.equal(connection.status().connected, true);
  const results = await new FeishuProvider(connection).search({ query: "测试", limit: 5 });
  assert.equal(results.results[0]?.url, "https://team.feishu.cn/docx/ABC123");
  assert.equal(requests.at(-1)?.authorization, "Bearer access");
  connection.disconnect();
  assert.equal(connection.status().connected, false);
});

test("Feishu official Docx fetch uses block structure with raw content fallback", async () => {
  const store = settings();
  store.set("feishu.appId", "cli_abcdefgh");
  store.set("feishu.appSecret", "secret");
  store.set("feishu.oauthToken", { accessToken: "access", refreshToken: "refresh", expiresAt: Date.now() + 3600_000 });
  const fetchImpl = (async (input: string | URL) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/raw_content")) return json({ code: 0, data: { content: "文档标题\n正文" } });
    if (url.pathname.endsWith("/blocks")) return json({ code: 0, data: { items: [
      { block_type: 1, page: { elements: [{ text_run: { content: "文档标题" } }] } },
      { block_type: 3, heading1: { elements: [{ text_run: { content: "第一节" } }] } },
      { block_type: 2, text: { elements: [{ text_run: { content: "正文内容" } }] } },
    ] } });
    throw new Error(`Unexpected ${url.pathname}`);
  }) as typeof fetch;
  const connection = new FeishuConnectionService(store, fetchImpl);
  const content = await new PlatformContentService(store, fetchImpl, connection).fetch("https://team.feishu.cn/docx/ABC123");
  assert.equal(content.retrievalMethod, "official-api");
  assert.equal(content.title, "文档标题");
  assert.match(content.markdown, /# 第一节\n\n正文内容/);
});
