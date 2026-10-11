import assert from "node:assert/strict";
import test from "node:test";
import { CodefatherContentService, identifyCodefatherContentUrl } from "../src/services/codefather-content.js";
import { identifyPlatformContentUrl } from "../src/services/platform-content.js";
import { matchSiteContentUrl } from "../src/services/search.js";

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...(headers ?? {}) } });
}

test("identifyCodefatherContentUrl matches post/essay/qa URLs and rejects invalid ones", () => {
  assert.deepEqual(identifyCodefatherContentUrl("https://www.codefather.cn/post/1904850755499778050"), { kind: "post", id: "1904850755499778050" });
  assert.deepEqual(identifyCodefatherContentUrl("https://codefather.cn/post/12345/"), { kind: "post", id: "12345" });
  assert.deepEqual(identifyCodefatherContentUrl("https://www.codefather.cn/essay/2104434026335993858"), { kind: "essay", id: "2104434026335993858" });
  assert.deepEqual(identifyCodefatherContentUrl("https://www.codefather.cn/qa/2108205366507503617"), { kind: "qa", id: "2108205366507503617" });
  assert.equal(identifyCodefatherContentUrl("https://www.codefather.cn/search/all"), null);
  assert.equal(identifyCodefatherContentUrl("https://www.codefather.cn/question/123"), null);
  assert.equal(identifyCodefatherContentUrl("https://m.codefather.cn/post/123"), null);
  assert.equal(identifyCodefatherContentUrl("https://other.com/post/123"), null);

  assert.equal(identifyPlatformContentUrl("https://www.codefather.cn/post/1904850755499778050"), "codefather");
  assert.equal(identifyPlatformContentUrl("https://www.codefather.cn/essay/2104434026335993858"), "codefather");
  assert.equal(identifyPlatformContentUrl("https://www.codefather.cn/qa/2108205366507503617"), "codefather");

  const site = matchSiteContentUrl("https://www.codefather.cn/post/1904850755499778050");
  assert.equal(site?.tool, "fetchCodefatherArticle");
  assert.equal(site?.source, "codefather");
  assert.equal(matchSiteContentUrl("https://www.codefather.cn/essay/2104434026335993858")?.tool, "fetchCodefatherArticle");
  assert.equal(matchSiteContentUrl("https://www.codefather.cn/qa/2108205366507503617")?.tool, "fetchCodefatherArticle");
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

test("CodefatherContentService routes essay and qa to their own APIs and derives essay titles", async () => {
  const requests: string[] = [];
  const service = new CodefatherContentService(async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.includes("/api/essay/get/vo")) {
      return json({ code: 0, data: { id: "2104434026335993858", content: "现在这个行情，技术想转产品或者运营该怎么转。\n\n第二段正文。", category: "交流", createTime: 1790571145000, user: { userName: "王同学要加油" } } });
    }
    return json({ code: 0, data: { id: "2108205366507503617", title: "26 届双非硕，毕业 3 个月，想转回开发岗，该怎么做？", content: "### 求职目标\n\n正文内容。", category: "job", createTime: 1791470302000, user: { userName: "菜菜求带" } } });
  });

  const essay = await service.fetchArticle("https://www.codefather.cn/essay/2104434026335993858");
  assert.equal(essay.sourceUrl, "https://www.codefather.cn/essay/2104434026335993858");
  assert.equal(essay.title, "现在这个行情，技术想转产品或者运营该怎么转。");
  assert.equal(essay.author, "王同学要加油");
  assert.match(essay.markdown, /第二段正文/);

  const qa = await service.fetchArticle("https://www.codefather.cn/qa/2108205366507503617");
  assert.equal(qa.sourceUrl, "https://www.codefather.cn/qa/2108205366507503617");
  assert.equal(qa.title, "26 届双非硕，毕业 3 个月，想转回开发岗，该怎么做？");
  assert.equal(qa.author, "菜菜求带");

  assert.match(requests[0], /\/api\/essay\/get\/vo\?id=2104434026335993858/);
  assert.match(requests[1], /\/api\/qa\/get\/vo\?id=2108205366507503617/);
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
