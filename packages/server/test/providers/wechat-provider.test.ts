import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../../src/domain.js";
import { WechatProvider } from "../../src/providers/wechat-provider.js";
import type { WechatDiscoverItem, WechatDiscoverResult } from "../../src/services/wechat-content.js";

function fakeService(items: WechatDiscoverItem[], failure?: WechatDiscoverResult["failure"], capture?: { input?: { query: string; source: string; limit: number } }) {
  return {
    async searchArticles(input: { query: string; source: "sogou" | "mirror"; limit: number }) {
      if (capture) capture.input = input;
      return { query: input.query, source: input.source, limit: input.limit, items, ...(failure ? { failure } : {}) } as WechatDiscoverResult;
    },
  };
}

test("wechat provider maps resolved entries and clamps the request to ten", async () => {
  const capture: { input?: { query: string; source: string; limit: number } } = {};
  const provider = new WechatProvider(fakeService([
    { title: "文章一", account: "公众号A", publishedAt: "2026-10-01", sourceUrl: "https://mp.weixin.qq.com/s/abc", resolved: true },
    { title: "未还原", account: null, publishedAt: null, sourceUrl: null, resolved: false },
  ], undefined, capture));
  const result = await provider.search({ query: "  测试  ", limit: 50 });
  assert.deepEqual(capture.input, { query: "测试", source: "sogou", limit: 10 });
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]?.url, "https://mp.weixin.qq.com/s/abc");
  assert.equal(result.results[0]?.description, "公众号：公众号A · 2026-10-01");
  assert.equal(result.results[0]?.engines[0], "wechat");
  assert.deepEqual(result.failures, []);
});

test("wechat provider reports partial captcha failures without dropping results", async () => {
  const provider = new WechatProvider(fakeService([
    { title: "文章一", account: null, publishedAt: null, sourceUrl: "https://mp.weixin.qq.com/s/abc", resolved: true },
  ], { code: "SOGOU_CAPTCHA", message: "已停止" }));
  const result = await provider.search({ query: "test", limit: 3 });
  assert.equal(result.results.length, 1);
  assert.deepEqual(result.failures, [{ code: "SOGOU_CAPTCHA", message: "已停止" }]);
});

test("wechat provider fails when captcha blocks every entry", async () => {
  const provider = new WechatProvider(fakeService([], { code: "SOGOU_CAPTCHA", message: "触发验证码" }));
  await assert.rejects(provider.search({ query: "test", limit: 3 }), (error: unknown) => error instanceof DomainError && error.code === "SOGOU_CAPTCHA");
});
