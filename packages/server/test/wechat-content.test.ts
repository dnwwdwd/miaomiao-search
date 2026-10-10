import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../src/domain.js";
import { identifyPlatformContentUrl } from "../src/services/platform-content.js";
import {
  WechatContentService,
  detectSogouAntispider,
  extractWeixinUrlFromMirror,
  hasMirrorColumnPageSkeleton,
  hasSogouResultPageSkeleton,
  identifyWechatArticleUrl,
  isMirrorColumnUrl,
  normalizeWechatDate,
  parseMirrorColumnPage,
  parseSogouResults,
  parseWechatArticleHtml,
} from "../src/services/wechat-content.js";

test("wechat article URL matching only accepts mp.weixin.qq.com /s links", () => {
  assert.ok(identifyWechatArticleUrl("https://mp.weixin.qq.com/s/abcDEF123"));
  assert.ok(identifyWechatArticleUrl("https://mp.weixin.qq.com/s?__biz=MzA1&mid=2&idx=1&sn=x"));
  assert.equal(identifyWechatArticleUrl("http://mp.weixin.qq.com/s/abc"), null);
  assert.equal(identifyWechatArticleUrl("https://mp.weixin.qq.com.evil.test/s/abc"), null);
  assert.equal(identifyWechatArticleUrl("https://mp.weixin.qq.com/misc/abc"), null);
  assert.equal(identifyPlatformContentUrl("https://mp.weixin.qq.com/s/abcDEF123"), "wechat");
  assert.equal(identifyPlatformContentUrl("https://mp.weixin.qq.com/misc/abc"), null);
});

test("wechat article parsing extracts title, author, date and cleans content", () => {
  const html = `<!doctype html><html><body>
    <h1 class="rich_media_title" id="activity-name">  测试文章标题 </h1>
    <a id="js_name"> 某某公众号 </a>
    <em id="publish_time">2026年10月1日</em>
    <div id="js_content">
      <p>第一段 <img data-src="https://mmbiz.qpic.cn/mmbiz/a.jpg" src="data:image/svg+xml,placeholder"></p>
      <div class="code-snippet__fix"><pre><code class="language-javascript hljs"><span class="line">const a = 1;</span><br><span class="line">const b = 2;</span></code></pre></div>
      <div class="rich_media_footer">版权信息</div>
    </div>
  </body></html>`;
  const parsed = parseWechatArticleHtml(html, "https://mp.weixin.qq.com/s/abc");
  assert.equal(parsed.title, "测试文章标题");
  assert.equal(parsed.author, "某某公众号");
  assert.equal(parsed.publishedAt, "2026-10-01");
  assert.ok(parsed.contentHtml.includes("https://mmbiz.qpic.cn/mmbiz/a.jpg"));
  assert.ok(!parsed.contentHtml.includes("data-src"));
  assert.ok(!parsed.contentHtml.includes("rich_media_footer"));
  assert.ok(!parsed.contentHtml.includes("code-snippet__fix"));
  assert.ok(parsed.contentHtml.includes("<pre><code class=\"language-javascript\">"));
  assert.ok(parsed.contentHtml.includes("const a = 1;"));
});

test("wechat article parsing falls back across selectors and extracts script timestamp", () => {
  const html = `<!doctype html><html><body><h1>备用标题</h1>
    <script>var ct = "1727740800";</script>
    <article><p>备用正文</p></article>
  </body></html>`;
  const parsed = parseWechatArticleHtml(html, "https://mp.weixin.qq.com/s/abc");
  assert.equal(parsed.title, "备用标题");
  assert.equal(parsed.publishedAt, "2024-10-01");
  assert.ok(parsed.contentHtml.includes("备用正文"));
});

test("wechat article parsing reports unavailable and parse-failure states", () => {
  assert.throws(() => parseWechatArticleHtml('<div class="weui-msg__title">参数错误</div>', "https://mp.weixin.qq.com/s/abc"), (error: unknown) => error instanceof DomainError && error.code === "WECHAT_ARTICLE_UNAVAILABLE");
  assert.throws(() => parseWechatArticleHtml("<html><body><p>nothing</p></body></html>", "https://mp.weixin.qq.com/s/abc"), (error: unknown) => error instanceof DomainError && error.code === "WECHAT_ARTICLE_PARSE_FAILED");
});

test("wechat date normalization covers chinese, numeric and raw dates", () => {
  assert.equal(normalizeWechatDate("2026年10月1日"), "2026-10-01");
  assert.equal(normalizeWechatDate("2026/10/02"), "2026-10-02");
  assert.equal(normalizeWechatDate("2026-10-03 08:00"), "2026-10-03");
  assert.equal(normalizeWechatDate(""), new Date().toISOString().split("T")[0]);
});

test("sogou result parsing keeps only well-formed entries and detects captcha", () => {
  const html = `<ul class="news-list2">
    <li id="sogou_vr_11002601_box_1"><h3><a href="/link?url=abc">结果一</a></h3><div class="all-time-y2">公众号A</div><div class="s2"><script>timeConvert('1727740800')</script></div></li>
    <li id="sogou_vr_11002601_box_2"><h3><a href="/link?url=def">结果二</a></h3></li>
    <li id="sogou_vr_11002601_box_3"><h3></h3></li>
  </ul>`;
  assert.ok(hasSogouResultPageSkeleton(html));
  const results = parseSogouResults(html);
  assert.equal(results.length, 2);
  assert.equal(results[0].title, "结果一");
  assert.equal(results[0].account, "公众号A");
  assert.equal(results[0].pubDate, "2024-10-01");
  assert.equal(results[0].rawLink, "https://weixin.sogou.com/link?url=abc");
  assert.equal(results[1].account, "");
  assert.ok(detectSogouAntispider("https://weixin.sogou.com/antispider/?a=b", ""));
  assert.ok(detectSogouAntispider("https://weixin.sogou.com/", "<html>请输入验证码</html>"));
  assert.ok(!detectSogouAntispider("https://weixin.sogou.com/weixin?type=2", "<html>正常结果</html>"));
  assert.ok(!hasSogouResultPageSkeleton("<html><body>无关页面</body></html>"));
});

test("mirror column parsing dedupes titles and follows pagination links", () => {
  const html = `<div><a href="/t/abc123">第一篇文章标题</a><a href="/t/abc123">第一篇文章标题</a>
    <a href="/t/def456">第二篇文章标题内容</a>
    <a href="/evil.com/t/bad">邪恶链接不应该出现</a>
    <a id="p_next" href="/column/xyz?page=2">下一页</a></div>`;
  assert.ok(hasMirrorColumnPageSkeleton(html));
  const parsed = parseMirrorColumnPage(html, "https://www.jintiankansha.me/column/xyz");
  assert.deepEqual(parsed.items.map((item) => item.url), ["https://www.jintiankansha.me/t/abc123", "https://www.jintiankansha.me/t/def456"]);
  assert.equal(parsed.nextPageUrl, "https://www.jintiankansha.me/column/xyz?page=2");
  assert.ok(isMirrorColumnUrl("https://www.jintiankansha.me/column/xyz"));
  assert.ok(!isMirrorColumnUrl("https://www.jintiankansha.me.evil.test/column/xyz"));
  assert.ok(!isMirrorColumnUrl("https://www.jintiankansha.me/t/xyz"));
});

test("mirror article pages expose escaped weixin links and reject vip walls", () => {
  assert.equal(extractWeixinUrlFromMirror('<script>var u = "https:\\/\\/mp.weixin.qq.com\\/s\\/abcDEF123?__biz=x"<\/script>'), "https://mp.weixin.qq.com/s/abcDEF123?__biz=x");
  assert.equal(extractWeixinUrlFromMirror("<p>https://mp.weixin.qq.com/s?__biz=MzA1&amp;mid=2</p>"), "https://mp.weixin.qq.com/s?__biz=MzA1&mid=2");
  assert.equal(extractWeixinUrlFromMirror("<div>VIP 专享内容，请开通会员</div>"), null);
  assert.equal(extractWeixinUrlFromMirror("<div>https://example.com/s/abc</div>"), null);
});

test("wechat content service validates discovery input", async () => {
  const service = new WechatContentService();
  await assert.rejects(() => service.searchArticles({ query: "  ", source: "sogou", limit: 10 }), (error: unknown) => error instanceof DomainError && error.code === "QUERY_REQUIRED");
});
