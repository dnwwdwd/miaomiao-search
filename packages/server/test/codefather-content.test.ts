import assert from "node:assert/strict";
import test from "node:test";
import { CodefatherContentService, identifyCodefatherArticleUrl } from "../src/services/codefather-content.js";
import { identifyPlatformContentUrl } from "../src/services/platform-content.js";
import { matchSiteContentUrl } from "../src/services/search.js";

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...(headers ?? {}) } });
}

test("identifyCodefatherArticleUrl correctly matches codefather URLs and rejects invalid ones", () => {
  assert.equal(identifyCodefatherArticleUrl("https://www.codefather.cn/post/1904850755499778050"), "1904850755499778050");
  assert.equal(identifyCodefatherArticleUrl("https://codefather.cn/post/12345/"), "12345");
  assert.equal(identifyCodefatherArticleUrl("https://www.codefather.cn/search/all"), null);
  assert.equal(identifyCodefatherArticleUrl("https://other.com/post/123"), null);

  assert.equal(identifyPlatformContentUrl("https://www.codefather.cn/post/1904850755499778050"), "codefather");

  const site = matchSiteContentUrl("https://www.codefather.cn/post/1904850755499778050");
  assert.equal(site?.tool, "fetchCodefatherArticle");
  assert.equal(site?.source, "codefather");
});

test("CodefatherContentService fetches full Markdown, extracts metadata and images", async () => {
  const service = new CodefatherContentService(async (input) => {
    const url = String(input);
    assert.match(url, /id=1904850755499778050/);
    return json({
      code: 0,
      data: {
        id: "1904850755499778050",
        title: "2025 年最全 Java 面试题",
        content: "# 标题\n\n正文介绍内容。\n\n![架构图](https://pic.code-nav.cn/post/arch.png)\n\n代码示例：\n```java\nSystem.out.println(\"hello\");\n```",
        createTime: 1742986785000,
        cover: "https://pic.code-nav.cn/post_cover/cover.jpg",
        user: { userName: "程序员鱼皮" },
      },
    });
  });

  const article = await service.fetchArticle("https://www.codefather.cn/post/1904850755499778050");
  assert.equal(article.title, "2025 年最全 Java 面试题");
  assert.equal(article.author, "程序员鱼皮");
  assert.equal(article.sourceUrl, "https://www.codefather.cn/post/1904850755499778050");
  assert.match(article.markdown, /System\.out\.println/);
  assert.equal(article.truncated, false);
  assert.deepEqual(article.images, ["https://pic.code-nav.cn/post_cover/cover.jpg", "https://pic.code-nav.cn/post/arch.png"]);
});

test("CodefatherContentService handles login required and not found", async () => {
  const loginRequired = new CodefatherContentService(async () => json({ code: 40100, message: "未登录" }));
  await assert.rejects(loginRequired.fetchArticle("123"), (err: unknown) =>
    err instanceof Error && "code" in err && err.code === "CODEFATHER_LOGIN_REQUIRED"
  );

  const notFound = new CodefatherContentService(async () => json({ code: 40400, message: "不存在" }, 404));
  await assert.rejects(notFound.fetchArticle("123"), (err: unknown) =>
    err instanceof Error && "code" in err && err.code === "CONTENT_NOT_FOUND"
  );
});
