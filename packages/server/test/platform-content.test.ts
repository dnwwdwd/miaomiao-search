import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../src/domain.js";
import { PlatformContentService, identifyPlatformContentUrl } from "../src/services/platform-content.js";
import type { SettingsService } from "../src/services/settings.js";

const settings = { get: () => undefined } as unknown as SettingsService;
const noteId = "0123456789abcdef01234567";
const noteState = JSON.stringify({ note: { noteDetailMap: { [noteId]: { note: { noteId, title: "文章中的 undefined 不该丢失", desc: "正文 NaN 保留", user: { nickname: "作者" }, imageList: [{ urlDefault: "https://example.com/a.jpg" }, { urlDefault: "http://sns-webpic-qc.xhscdn.com/b.jpg" }, { urlDefault: "http://example.com/unsafe.jpg" }] } } } } });

test("platform URL matching uses exact hosts and supported content paths", () => {
  assert.equal(identifyPlatformContentUrl(`https://www.xiaohongshu.com/explore/${noteId}`), "xiaohongshu");
  assert.equal(identifyPlatformContentUrl("https://xhslink.com/abc123"), "xiaohongshu");
  assert.equal(identifyPlatformContentUrl("https://team.feishu.cn/docx/ABC123"), "feishu");
  assert.equal(identifyPlatformContentUrl("https://www.zhihu.com/question/123/answer/456"), null);
  assert.equal(identifyPlatformContentUrl("https://zhuanlan.zhihu.com/p/123"), null);
  assert.equal(identifyPlatformContentUrl("https://www.zhihu.com/people/123"), null);
  assert.equal(identifyPlatformContentUrl("https://www.zhihu.com.evil.test/question/123"), null);
  assert.equal(identifyPlatformContentUrl("http://www.zhihu.com/question/123"), null);
  assert.equal(identifyPlatformContentUrl("https://example.com/other"), null);
});

function fetchStub(handler: (url: URL, init?: RequestInit) => Response): typeof fetch {
  return (async (input: string | URL, init?: RequestInit) => handler(new URL(input), init)) as typeof fetch;
}

test("Xiaohongshu resolves a share link and keeps JSON string values intact", async () => {
  const calls: string[] = [];
  const client = fetchStub((url) => {
    calls.push(url.hostname);
    if (url.hostname === "xhslink.com") return new Response(null, { status: 302, headers: { location: `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=abc` } });
    return new Response(`<script>window.__INITIAL_STATE__=${noteState.replace('"imageList"', '"unused":undefined,"imageList"')}</script>`, { status: 200 });
  });
  const content = await new PlatformContentService(settings, client).fetch("https://xhslink.com/A1b2");
  assert.deepEqual(calls, ["xhslink.com", "www.xiaohongshu.com"]);
  assert.equal(content.title, "文章中的 undefined 不该丢失");
  assert.match(content.markdown, /正文 NaN 保留/);
  assert.equal(content.images[0], "https://example.com/a.jpg");
  assert.equal(content.images[1], "https://sns-webpic-qc.xhscdn.com/b.jpg");
  assert.equal(content.images.length, 2);
  assert.match(content.markdown, /!\[图片 2\]\(https:\/\/sns-webpic-qc\.xhscdn\.com\/b\.jpg\)/);
});

test("Xiaohongshu rejects cross-host share redirects before requesting them", async () => {
  const calls: string[] = [];
  const client = fetchStub((url) => { calls.push(url.hostname); return new Response(null, { status: 302, headers: { location: "https://127.0.0.1/private" } }); });
  await assert.rejects(new PlatformContentService(settings, client).fetch("https://xhslink.com/abc"), (error: unknown) => error instanceof DomainError && error.code === "XHS_SHARE_INVALID");
  assert.deepEqual(calls, ["xhslink.com"]);
});

test("Xiaohongshu tries an embedded share link when a plain note URL has no content", async () => {
  const client = fetchStub((url) => {
    if (url.hostname === "xhslink.com") return new Response(null, { status: 302, headers: { location: `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=shared` } });
    if (url.searchParams.get("xsec_token") === "shared") return new Response(`<script>window.__INITIAL_STATE__=${noteState}</script>`);
    return new Response(`<a href="https://xhslink.com/abc123">分享</a>`);
  });
  const content = await new PlatformContentService(settings, client).fetch(`https://www.xiaohongshu.com/explore/${noteId}`);
  assert.match(content.sourceUrl, /xsec_token=shared/);
  assert.equal(content.author, "作者");
});

test("Xiaohongshu asks for a share link when a plain URL is blocked", async () => {
  const client = fetchStub(() => new Response("blocked", { status: 403 }));
  await assert.rejects(new PlatformContentService(settings, client).fetch(`https://www.xiaohongshu.com/explore/${noteId}`), (error: unknown) => error instanceof DomainError && error.code === "XHS_TOKEN_REQUIRED");
});

test("Xiaohongshu rejects a login redirect instead of treating it as post content", async () => {
  const client = fetchStub(() => new Response("login", { status: 302, headers: { location: "https://www.xiaohongshu.com/login" } }));
  await assert.rejects(new PlatformContentService(settings, client).fetch(`https://www.xiaohongshu.com/explore/${noteId}?xsec_token=share`), (error: unknown) => error instanceof DomainError && error.code === "XHS_PAGE_UNAVAILABLE");
});

test("platform content service rejects unsupported links", async () => {
  await assert.rejects(new PlatformContentService(settings).fetch("https://www.zhihu.com/question/123"), (error: unknown) => error instanceof DomainError && error.code === "PLATFORM_URL_UNSUPPORTED");
});
