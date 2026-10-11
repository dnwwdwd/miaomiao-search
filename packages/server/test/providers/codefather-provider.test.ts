import assert from "node:assert/strict";
import test from "node:test";
import { CodefatherProvider } from "../../src/providers/codefather-provider.js";

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...(headers ?? {}) } });
}

test("CodefatherProvider maps search results, strips markup and extracts covers", async () => {
  const provider = new CodefatherProvider(async (_input, init) => {
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.searchText, "Java");
    return json({
      code: 0,
      data: {
        records: [
          {
            id: "1904850755499778050",
            title: "2025 年最全<span style=\"color: red;\">Java</span>面试题",
            plainTextDescription: "为大家准备了 2025年全新热门高频 Java 面试题。",
            thumbnailCover: "https://pic.code-nav.cn/post_cover/thumb.jpg",
          },
          {
            id: "1811341201209098241",
            title: "【学习笔记】Java 设计模式",
            searchSummary: "我分享的学习笔记是关于设计模式...",
            cover: "https://pic.code-nav.cn/post_cover/main.png",
          },
        ],
        total: 100,
      },
    });
  });

  const result = await provider.search({ query: "Java", limit: 10 });
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0]?.url, "https://www.codefather.cn/post/1904850755499778050");
  assert.equal(result.results[0]?.title, "2025 年最全 Java 面试题");
  assert.equal(result.results[0]?.description, "为大家准备了 2025年全新热门高频 Java 面试题。");
  assert.equal(result.results[0]?.thumbnailUrl, "https://pic.code-nav.cn/post_cover/thumb.jpg");
  assert.deepEqual(result.results[0]?.engines, ["codefather"]);

  assert.equal(result.results[1]?.title, "【学习笔记】Java 设计模式");
  assert.equal(result.results[1]?.thumbnailUrl, "https://pic.code-nav.cn/post_cover/main.png");
});

test("CodefatherProvider handles API business errors and status codes", async () => {
  const rateLimited = new CodefatherProvider(async () => json({ code: 429 }, 429));
  await assert.rejects(rateLimited.search({ query: "test", limit: 5 }), (err: unknown) =>
    err instanceof Error && "code" in err && err.code === "CODEFATHER_RATE_LIMITED"
  );

  const apiError = new CodefatherProvider(async () => json({ code: 50000, message: "参数错误" }));
  await assert.rejects(apiError.search({ query: "test", limit: 5 }), (err: unknown) =>
    err instanceof Error && "code" in err && err.code === "CODEFATHER_API_ERROR"
  );
});
