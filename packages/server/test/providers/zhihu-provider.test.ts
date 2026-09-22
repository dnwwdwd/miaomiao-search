import assert from "node:assert/strict";
import test from "node:test";
import type { FetchContent, SearchInput, UpstreamSearchResponse } from "../../src/domain.js";
import { DomainError } from "../../src/domain.js";
import { ZhihuProvider } from "../../src/providers/zhihu-provider.js";
import type { OpenWebSearchClient } from "../../src/upstream/open-websearch.js";

function upstream(search: (input: SearchInput) => Promise<UpstreamSearchResponse>): OpenWebSearchClient {
  return {
    search,
    health: async () => {},
    assertSecureRuntime: async () => {},
    fetchWebContent: async (input): Promise<FetchContent> => ({ url: input.url, finalUrl: input.url, title: "", contentType: "text/plain", truncated: false, content: "" }),
    fetchGithubReadme: async () => null,
    fetchCsdnArticle: async () => "",
    fetchJuejinArticle: async () => "",
    fetchLinuxDoArticle: async () => "",
  };
}

test("Zhihu builds a site query, filters host, and normalizes the source", async () => {
  const calls: SearchInput[] = [];
  const provider = new ZhihuProvider(upstream(async (input) => {
    calls.push(input);
    return {
      results: [
        { title: "知乎文章", url: "https://zhuanlan.zhihu.com/p/123?from=bing", description: "摘要", engines: ["bing"] },
        { title: "站外结果", url: "https://www.zhihu.com/question/1", description: "", engines: ["bing"] },
        { title: "带凭据结果", url: "https://user:pass@zhuanlan.zhihu.com/p/789", description: "", engines: ["bing"] },
      ],
      failures: [],
    };
  }));

  const result = await provider.search({ query: "  MCP 中文  ", limit: 50 });
  assert.deepEqual(calls, [{ query: "site:zhuanlan.zhihu.com MCP 中文", engines: ["bing"], limit: 20, searchMode: "request" }]);
  assert.deepEqual(result.results[0] && { url: result.results[0].url, faviconUrl: result.results[0].faviconUrl, engines: result.results[0].engines }, { url: "https://zhuanlan.zhihu.com/p/123?from=bing", faviconUrl: "https://zhuanlan.zhihu.com/favicon.ico", engines: ["zhihu"] });
  assert.equal(result.results.length, 1);
});

test("Zhihu falls back from Bing to Baidu when no Zhihu result is returned", async () => {
  const calls: SearchInput[] = [];
  const provider = new ZhihuProvider(upstream(async (input) => {
    calls.push(input);
    if (input.engines[0] === "bing") return { results: [{ title: "unrelated", url: "https://example.com", description: "", engines: ["bing"] }], failures: [] };
    return { results: [{ title: "中文标题", url: "https://zhuanlan.zhihu.com/p/456", description: "内容", engines: ["baidu"] }], failures: [] };
  }));

  const result = await provider.search({ query: "知乎", limit: 5 });
  assert.deepEqual(calls.map((call) => call.engines[0]), ["bing", "baidu"]);
  assert.equal(result.results[0]?.title, "中文标题");
  assert.deepEqual(result.failures, []);
});

test("Zhihu returns an empty success when both engines have no matching result", async () => {
  let calls = 0;
  const provider = new ZhihuProvider(upstream(async () => {
    calls += 1;
    return { results: [{ title: "other", url: "https://example.com/other", description: "", engines: ["bing"] }], failures: [] };
  }));
  const result = await provider.search({ query: "无结果", limit: 3 });
  assert.equal(calls, 2);
  assert.deepEqual(result, { results: [], failures: [] });
});

test("Zhihu exposes a stable unavailable error when both upstream paths fail", async () => {
  const provider = new ZhihuProvider(upstream(async () => { throw new Error("network down"); }));
  await assert.rejects(provider.search({ query: "失败", limit: 3 }), (error: unknown) => error instanceof DomainError && error.code === "ZHIHU_SEARCH_UNAVAILABLE");
});
