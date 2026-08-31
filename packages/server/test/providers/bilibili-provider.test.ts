import assert from "node:assert/strict";
import test from "node:test";
import { BilibiliProvider } from "../../src/providers/bilibili-provider.js";

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...(headers ?? {}) } });
}

test("Bilibili maps video results, cleans markup, filters live rooms, and validates thumbnails", async () => {
  const provider = new BilibiliProvider(async () => json({ code: 0, data: { result: [{ result_type: "video", data: [{ type: "video", bvid: "BV1abc", title: "<em class=\"keyword\">喵喵</em> 搜索 &amp; POC", description: "<em>摘要</em>", author: "UP 主", duration: "03:21", play: 12345, like: 678, favorites: 90, video_review: 12, pubdate: 1_700_000_000, pic: "//i0.hdslb.com/bfs/archive/cover.jpg" }, { type: "live_room", bvid: "BVlive", title: "直播", pic: "https://i0.hdslb.com/live.jpg" }, { type: "video", bvid: "BVbad", title: "坏封面", pic: "https://images.example.com/nope.jpg" }] }] } }));
  const result = await provider.search({ query: "喵喵", limit: 20 });
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0]?.url, "https://www.bilibili.com/video/BV1abc");
  assert.equal(result.results[0]?.title, "喵喵 搜索 & POC");
  assert.equal(result.results[0]?.thumbnailUrl, "https://i0.hdslb.com/bfs/archive/cover.jpg");
  assert.deepEqual(result.results[0]?.videoMeta, { author: "UP 主", duration: "03:21", views: 12345, likes: 678, favorites: 90, comments: 12, publishedAt: 1_700_000_000 });
  assert.equal(result.results[1]?.thumbnailUrl, undefined);
});

test("Bilibili warms anonymous cookies once and retries a 412 response", async () => {
  const urls: string[] = [];
  let apiCalls = 0;
  const provider = new BilibiliProvider(async (input, init) => {
    const url = String(input);
    urls.push(url);
    if (url === "https://www.bilibili.com/") return new Response("<html />", { headers: { "set-cookie": "SESSDATA=anonymous; Path=/" } });
    apiCalls += 1;
    if (apiCalls === 1) return json({ code: 0, data: { result: [] } }, 412);
    assert.match(String(init?.headers && new Headers(init.headers).get("cookie")), /SESSDATA=anonymous/);
    return json({ code: 0, data: { result: [{ result_type: "video", data: [{ bvid: "BV1retry", title: "retry", description: "", type: "video" }] }] } });
  });
  const result = await provider.search({ query: "retry", limit: 2 });
  assert.equal(result.results[0]?.url, "https://www.bilibili.com/video/BV1retry");
  assert.deepEqual(urls, ["https://api.bilibili.com/x/web-interface/search/all/v2?keyword=retry&page=1&order=totalrank", "https://www.bilibili.com/", "https://api.bilibili.com/x/web-interface/search/all/v2?keyword=retry&page=1&order=totalrank"]);
});

test("Bilibili maps persistent blocking and -412", async () => {
  const blocked = new BilibiliProvider(async (input) => String(input) === "https://www.bilibili.com/" ? new Response("ok") : json({ code: -412, message: "blocked" }));
  await assert.rejects(blocked.search({ query: "x", limit: 1 }), (error: unknown) => error instanceof Error && "code" in error && error.code === "BILIBILI_BLOCKED");
});

test("Bilibili rejects bare CDN hosts and strips encoded control characters", async () => {
  const provider = new BilibiliProvider(async () => json({ code: 0, data: { result: [{ result_type: "video", data: [{ bvid: "BV1safe", title: "hello &#0; world", description: "", pic: "https://hdslb.com/not-a-cdn-host.jpg" }] }] } }));
  const result = await provider.search({ query: "safe", limit: 1 });
  assert.equal(result.results[0]?.title, "hello world");
  assert.equal(result.results[0]?.thumbnailUrl, undefined);
});
