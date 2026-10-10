import { isIP } from "node:net";
import type { AnyNode, Element } from "domhandler";
import * as cheerio from "cheerio";
import { NodeHtmlMarkdown } from "node-html-markdown";
import { DomainError, assertHttpUrlWithoutCredentials } from "../domain.js";

export const weixinArticleHost = "mp.weixin.qq.com";
const sogouBaseUrl = "https://weixin.sogou.com";
const mirrorHosts = ["jintiankansha.me", "www.jintiankansha.me"];
const browserUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";
const browserAllowedSuffixes = ["qq.com", "qpic.cn", "qlogo.cn", "wximg.cn", "weixinbridge.com"];
const mediaAllowedSuffixes = ["qpic.cn", "qlogo.cn", "qq.com", "wximg.cn"];
const navigationTimeoutMs = 30_000;
const contentTimeoutMs = 30_000;
const resolveTimeoutMs = 10_000;
const resolvePollIntervalMs = 200;
const mirrorFetchTimeoutMs = 20_000;
const defaultSearchIntervalMs = 3_000;
const sogouCaptchaMessage = "搜狗触发验证码或反爬拦截，已停止；请稍后重试";

export type WechatSource = "sogou" | "mirror";
export type WechatDiscoverItem = { title: string; account: string | null; publishedAt: string | null; sourceUrl: string | null; resolved: boolean };
export type WechatDiscoverFailure = { code: string; message: string };
export type WechatDiscoverResult = { query: string; source: WechatSource; columnUrl?: string; limit: number; items: WechatDiscoverItem[]; failure?: WechatDiscoverFailure };
export type WechatArticle = {
  sourceUrl: string;
  title: string;
  author: string;
  publishedAt: string;
  markdown: string;
  images: string[];
  truncated: boolean;
};

/** Accept only HTTPS article links on mp.weixin.qq.com with a /s path. */
export function identifyWechatArticleUrl(input: string): URL | null {
  const url = assertHttpUrlWithoutCredentials(input);
  if (url.protocol !== "https:" || url.hostname !== weixinArticleHost) return null;
  return url.pathname === "/s" || url.pathname.startsWith("/s/") || url.pathname.startsWith("/s?") ? url : null;
}

export class WechatContentService {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async fetchArticle(input: URL, maxChars: number): Promise<WechatArticle> {
    const html = await this.fetchArticleHtml(input);
    const parsed = parseWechatArticleHtml(html, input.toString());
    const images = extractArticleImages(parsed.contentHtml);
    const markdown = markdownTranslator.translate(parsed.contentHtml).trim();
    return {
      sourceUrl: input.toString(),
      title: parsed.title,
      author: parsed.author,
      publishedAt: parsed.publishedAt,
      markdown: markdown.slice(0, maxChars),
      images,
      truncated: markdown.length > maxChars,
    };
  }

  async searchArticles(input: { query: string; source: WechatSource; limit: number }): Promise<WechatDiscoverResult> {
    const query = input.query.trim();
    if (!query) throw new DomainError("QUERY_REQUIRED", "搜索内容不能为空");
    if (input.source === "mirror") return this.searchMirror(query, input.limit);
    return this.searchSogou(query, input.limit);
  }

  private async searchSogou(query: string, limit: number): Promise<WechatDiscoverResult> {
    const result: WechatDiscoverResult = { query, source: "sogou", limit, items: [] };
    const intervalMs = searchIntervalMs();
    await this.withSearchPage(async (page) => {
      await page.goto(sogouBaseUrl, { waitUntil: "domcontentloaded", timeout: navigationTimeoutMs }).catch(() => {});
      await page.goto(buildSogouSearchUrl(query), { waitUntil: "domcontentloaded", timeout: navigationTimeoutMs });
      const listHtml = await page.content();
      if (detectSogouAntispider(page.url(), listHtml)) throw new DomainError("SOGOU_CAPTCHA", sogouCaptchaMessage, 502);
      if (!hasSogouResultPageSkeleton(listHtml)) throw new DomainError("WECHAT_SEARCH_UNAVAILABLE", "搜狗结果页结构无法识别（可能是页面改版或站点不可达）", 502);
      const entries = parseSogouResults(listHtml).slice(0, limit);
      for (const entry of entries) {
        const resolution = await resolveSogouEntry(page, entry.rawLink, intervalMs);
        if (resolution.captcha) {
          result.failure = { code: "SOGOU_CAPTCHA", message: "逐条还原直链中途触发搜狗验证码，已停止；已解析条目保留" };
          break;
        }
        result.items.push({ title: entry.title, account: entry.account || null, publishedAt: entry.pubDate || null, sourceUrl: resolution.sourceUrl, resolved: resolution.sourceUrl !== null });
      }
    });
    return result;
  }

  private async searchMirror(query: string, limit: number): Promise<WechatDiscoverResult> {
    const intervalMs = searchIntervalMs();
    let columnUrl: string;
    if (isMirrorColumnUrl(query)) columnUrl = assertMirrorColumnUrl(query).toString();
    else columnUrl = await this.findMirrorColumnUrlViaSogou(query, intervalMs);
    const result: WechatDiscoverResult = { query, source: "mirror", columnUrl, limit, items: [] };

    const entries: { title: string; url: string }[] = [];
    const seenTitles = new Set<string>();
    const visitedPages = new Set<string>();
    let pageUrl: string | null = columnUrl;
    while (pageUrl && entries.length < limit && !visitedPages.has(pageUrl)) {
      visitedPages.add(pageUrl);
      if (visitedPages.size > 1) await sleep(intervalMs);
      const html = await this.fetchMirrorPage(pageUrl);
      if (!hasMirrorColumnPageSkeleton(html)) throw new DomainError("WECHAT_SEARCH_UNAVAILABLE", "今天看啥专栏页结构无法识别（可能是页面改版或站点不可达）", 502);
      const parsed = parseMirrorColumnPage(html, pageUrl);
      for (const item of parsed.items) {
        if (entries.length >= limit) break;
        if (seenTitles.has(item.title)) continue;
        seenTitles.add(item.title);
        entries.push(item);
      }
      pageUrl = parsed.nextPageUrl;
    }

    for (const entry of entries) {
      await sleep(intervalMs);
      const sourceUrl = await this.resolveMirrorEntry(entry.url);
      result.items.push({ title: entry.title, account: null, publishedAt: null, sourceUrl, resolved: sourceUrl !== null });
    }
    return result;
  }

  /** 关键词 → 专栏 URL：借搜狗会话搜 site:jintiankansha.me 并还原专栏地址。 */
  private async findMirrorColumnUrlViaSogou(keyword: string, intervalMs: number): Promise<string> {
    const mirrorHint = "请直接提供今天看啥专栏链接（https://www.jintiankansha.me/column/...）后重试";
    return await this.withSearchPage(async (page) => {
      await page.goto(sogouBaseUrl, { waitUntil: "domcontentloaded", timeout: navigationTimeoutMs }).catch(() => {});
      await page.goto(buildSogouSearchUrl(`site:jintiankansha.me ${keyword}`), { waitUntil: "domcontentloaded", timeout: navigationTimeoutMs });
      const listHtml = await page.content();
      if (detectSogouAntispider(page.url(), listHtml)) throw new DomainError("SOGOU_CAPTCHA", `${sogouCaptchaMessage}；${mirrorHint}`, 502);
      if (!hasSogouResultPageSkeleton(listHtml)) throw new DomainError("WECHAT_SEARCH_UNAVAILABLE", `搜狗结果页结构无法识别，无法查找专栏。${mirrorHint}`, 502);
      for (const entry of parseSogouResults(listHtml)) {
        await sleep(intervalMs);
        try { await page.goto(entry.rawLink, { waitUntil: "domcontentloaded", timeout: navigationTimeoutMs }); } catch { continue; }
        if (detectSogouAntispider(page.url(), "")) throw new DomainError("SOGOU_CAPTCHA", `${sogouCaptchaMessage}；${mirrorHint}`, 502);
        const finalUrl = await pollPageUrl(page, (url) => isMirrorColumnUrl(url), resolveTimeoutMs);
        if (finalUrl) return assertMirrorColumnUrl(finalUrl).toString();
      }
      throw new DomainError("WECHAT_SEARCH_UNAVAILABLE", `未能通过搜狗找到「${keyword}」的今天看啥专栏。${mirrorHint}`, 502);
    });
  }

  private async fetchMirrorPage(url: string): Promise<string> {
    const response = await this.fetchImpl(url, { headers: mirrorFetchHeaders(), signal: AbortSignal.timeout(mirrorFetchTimeoutMs) }).catch(() => {
      throw new DomainError("WECHAT_SEARCH_UNAVAILABLE", "今天看啥页面获取失败", 502);
    });
    if (!response.ok) throw new DomainError("WECHAT_SEARCH_UNAVAILABLE", `今天看啥页面获取失败（HTTP ${response.status}）`, 502);
    return await response.text();
  }

  /** 单篇 /t/ 页还原失败（非 200 / 无直链）只标未还原，不中断整批。 */
  private async resolveMirrorEntry(articleUrl: string): Promise<string | null> {
    try {
      const response = await this.fetchImpl(articleUrl, { headers: mirrorFetchHeaders(), signal: AbortSignal.timeout(mirrorFetchTimeoutMs) });
      if (!response.ok) return null;
      const weixinUrl = extractWeixinUrlFromMirror(await response.text());
      return weixinUrl ? toResolvedWeixinUrl(weixinUrl) : null;
    } catch {
      return null;
    }
  }

  private async withSearchPage<T>(run: (page: import("playwright-core").Page) => Promise<T>): Promise<T> {
    let chromium: typeof import("playwright-core").chromium;
    try { ({ chromium } = await import("playwright-core")); } catch { throw new DomainError("WECHAT_BROWSER_UNAVAILABLE", "微信内容读取器不可用", 503); }
    const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}), args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"] }).catch(() => { throw new DomainError("WECHAT_BROWSER_UNAVAILABLE", "微信内容读取器无法启动", 503); });
    try {
      const context = await browser.newContext({ locale: "zh-CN", serviceWorkers: "block", userAgent: browserUserAgent, extraHTTPHeaders: { "accept-language": "zh-CN,zh;q=0.9,en;q=0.8" } });
      const page = await context.newPage();
      return await run(page);
    } finally { await browser.close(); }
  }

  private async fetchArticleHtml(url: URL): Promise<string> {
    let chromium: typeof import("playwright-core").chromium;
    try { ({ chromium } = await import("playwright-core")); } catch { throw new DomainError("WECHAT_BROWSER_UNAVAILABLE", "微信内容读取器不可用", 503); }
    const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}), args: ["--no-sandbox", "--disable-dev-shm-usage"] }).catch(() => { throw new DomainError("WECHAT_BROWSER_UNAVAILABLE", "微信内容读取器无法启动", 503); });
    try {
      const context = await browser.newContext({ locale: "zh-CN", serviceWorkers: "block", userAgent: browserUserAgent, extraHTTPHeaders: { "accept-language": "zh-CN,zh;q=0.9,en;q=0.8" } });
      const page = await context.newPage();
      await page.route("**/*", async (route) => {
        try {
          const target = new URL(route.request().url());
          if (target.protocol === "https:" && isAllowedBrowserHost(target.hostname)) await route.continue();
          else await route.abort();
        } catch { await route.abort(); }
      });
      // 微信偶发导航慢；超时后页面往往已经可用，不直接失败。
      await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: navigationTimeoutMs }).catch(() => {});
      await page.locator("#js_content").first().waitFor({ timeout: contentTimeoutMs }).catch(() => {});
      return await page.content();
    } finally { await browser.close(); }
  }
}

// ---------- 搜狗结果页解析 ----------

export type SogouEntry = { title: string; rawLink: string; account: string; pubDate: string };
const sogouResultItemSelector = "li[id^='sogou_vr_11002601_box']";
const sogouSkeletonSelectors = ["#sogou_vr_11002601", "#sogou_vr_11002601_box", ".news-list", "ul.news-list", ".news-list2", "ul.news-list2", sogouResultItemSelector];

export function hasSogouResultPageSkeleton(html: string): boolean {
  const $ = cheerio.load(html || "");
  return sogouSkeletonSelectors.some((selector) => $(selector).length > 0);
}

export function parseSogouResults(html: string): SogouEntry[] {
  const $ = cheerio.load(html || "");
  const results: SogouEntry[] = [];
  $(sogouResultItemSelector).each((_, element) => {
    const item = $(element);
    const anchor = item.find("h3 a").first();
    const href = anchor.attr("href");
    if (!href) return;
    const title = normalizeText(anchor.text());
    if (!title) return;
    let rawLink = href;
    try { rawLink = new URL(href, sogouBaseUrl).toString(); } catch { /* Preserve malformed markup verbatim. */ }
    results.push({ title, rawLink, account: normalizeText(item.find(".all-time-y2").first().text()), pubDate: extractSogouDate($, item) });
  });
  return results;
}

export function detectSogouAntispider(url: string, html: string): boolean {
  if (/\/antispider(?:\/|\?|#|$)/i.test(String(url || ""))) return true;
  return /VerifyCode|验证码|seccode|antispider/i.test(String(html || ""));
}

function extractSogouDate($: cheerio.CheerioAPI, item: cheerio.Cheerio<Element>): string {
  const date = item.find(".s2").first();
  if (!date.length) return "";
  // 时间戳在脚本源码里，Cheerio 解析时 document.write 尚未执行。
  const source = $.html(date) || "";
  const match = source.match(/timeConvert\s*\(\s*(?:['"]|&apos;|&#39;)?(\d{1,12})(?:['"]|&apos;|&#39;)?\s*\)/i);
  return match ? unixSecondsToShanghaiDate(match[1]) : "";
}

function unixSecondsToShanghaiDate(rawSeconds: string): string {
  const seconds = Number(rawSeconds);
  if (!Number.isSafeInteger(seconds)) return "";
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return formatDateInTimeZone(date);
}

// ---------- 今天看啥镜像解析 ----------

export type MirrorColumnItem = { title: string; url: string };
export type MirrorColumnPage = { items: MirrorColumnItem[]; nextPageUrl: string | null };

export function isMirrorColumnUrl(rawUrl: string): boolean {
  try { return isMirrorColumnUrlObject(new URL(rawUrl)); } catch { return false; }
}

export function assertMirrorColumnUrl(rawUrl: string): URL {
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { throw new DomainError("INVALID_URL", `无效的今天看啥专栏链接: ${rawUrl}`); }
  if (!isMirrorColumnUrlObject(parsed)) throw new DomainError("WECHAT_SEARCH_UNAVAILABLE", "今天看啥专栏链接必须使用 jintiankansha.me 或 www.jintiankansha.me 的 /column/ 路径");
  return parsed;
}

export function hasMirrorColumnPageSkeleton(html: string): boolean {
  return cheerio.load(html || "")("a[href*='/t/']").length > 0;
}

export function parseMirrorColumnPage(html: string, baseUrl: string): MirrorColumnPage {
  const $ = cheerio.load(html || "");
  const items: MirrorColumnItem[] = [];
  const seenTitles = new Set<string>();
  $("a[href*='/t/']").each((_, element) => {
    const anchor = $(element);
    const title = normalizeText(anchor.text());
    if (title.length < 5 || seenTitles.has(title)) return;
    const url = resolveMirrorArticleUrl(anchor.attr("href"), baseUrl);
    if (!url) return;
    seenTitles.add(title);
    items.push({ title, url });
  });
  return { items, nextPageUrl: findMirrorNextPageUrl($, baseUrl) };
}

export function extractWeixinUrlFromMirror(html: string): string | null {
  const source = normalizeMirrorHtmlSource(String(html || ""));
  const match = source.match(/https?:\/\/(?:mp\.weixin\.qq\.com)\/s(?=$|[/?#])(?:[/?#][^"'<>\s]*)?/i);
  if (!match) return null;
  const url = match[0].replace(/[.,;:!?)}\]}>]+$/g, "");
  try {
    const parsed = new URL(url);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.hostname.toLowerCase() !== weixinArticleHost || !parsed.pathname.startsWith("/s")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function resolveMirrorArticleUrl(href: string | undefined, baseUrl: string): string | null {
  if (!href) return null;
  let parsed: URL;
  try { parsed = new URL(href, baseUrl); } catch { return null; }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !mirrorHosts.includes(parsed.hostname.toLowerCase()) || !parsed.pathname.startsWith("/t/")) return null;
  return parsed.toString();
}

function findMirrorNextPageUrl($: cheerio.CheerioAPI, baseUrl: string): string | null {
  const candidates: cheerio.Cheerio<Element>[] = [];
  $('a[rel~="next" i]').each((_, element) => { candidates.push($(element) ); });
  $("a#p_next").each((_, element) => { candidates.push($(element) ); });
  $(".next a, a.next, .pagination-next a, .pager-next a").each((_, element) => { candidates.push($(element) ); });
  $("nav a, .pagination a, .pager a, .page a, .pages a").each((_, element) => {
    const anchor = $(element) ;
    if (/^(?:下一页|下页|后一页|next|›|»|>|→)$/.test(normalizeText(anchor.text()).toLowerCase())) candidates.push(anchor);
  });
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const href = candidate.attr("href");
    if (!href) continue;
    let parsed: URL;
    try { parsed = new URL(href, baseUrl); } catch { continue; }
    const normalized = parsed.toString();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    if (isMirrorColumnUrlObject(parsed)) return normalized;
  }
  return null;
}

function isMirrorColumnUrlObject(parsed: URL): boolean {
  return (parsed.protocol === "http:" || parsed.protocol === "https:") && mirrorHosts.includes(parsed.hostname.toLowerCase()) && parsed.pathname.startsWith("/column/") && parsed.pathname.length > "/column/".length;
}

function normalizeMirrorHtmlSource(value: string): string {
  return value.replace(/&amp;/gi, "&").replace(/&#x2f;|&#47;/gi, "/").replace(/&#x3f;|&#63;/gi, "?").replace(/&#x3d;|&#61;/gi, "=").replace(/\\\//g, "/");
}

// ---------- 微信文章页解析 ----------

export type ParsedWechatArticle = { title: string; author: string; publishedAt: string; contentHtml: string };

export function parseWechatArticleHtml(html: string, url: string): ParsedWechatArticle {
  const $ = cheerio.load(html);
  if ($(".weui-msg__title").text().trim() === "参数错误") throw new DomainError("WECHAT_ARTICLE_UNAVAILABLE", "微信文章链接已失效或无法访问", 422);

  const title = ($("#activity-name").length ? $("#activity-name").text() : $("h1").first().length ? $("h1").first().text() : $(".article-title").length ? $(".article-title").text() : "").trim();
  const author = ($("#js_name").length ? $("#js_name").text() : $(".account_nickname").length ? $(".account_nickname").text() : $('[itemprop="author"]').length ? $('[itemprop="author"]').text() : "").trim();

  let publishedAt = $("#publish_time").length ? $("#publish_time").text().trim() : $(".time").length ? $(".time").text().trim() : "";
  if (!publishedAt) publishedAt = extractWechatTimestampDate(html);

  const content = $("#js_content").length ? ($("#js_content").html() || "") : $(".article-content").length ? ($(".article-content").html() || "") : $("article").length ? ($("article").html() || "") : "";
  if (!title || !content) throw new DomainError("WECHAT_ARTICLE_PARSE_FAILED", `微信文章解析失败，可能是反爬或页面结构变化：${url}`, 422);

  return { title, author, publishedAt: normalizeWechatDate(publishedAt), contentHtml: cleanWechatHtml(content) };
}

function cleanWechatHtml(html: string): string {
  const $ = cheerio.load(html);
  $('[class*="copyright"], [class*="footer"], [id*="copyright"]').remove();
  $("img[data-src]").each((_, img) => {
    const $img = $(img);
    const dataSrc = $img.attr("data-src");
    const currentSrc = $img.attr("src") || "";
    if ((currentSrc.startsWith("data:") || currentSrc === "") && dataSrc) $img.attr("src", dataSrc);
    $img.removeAttr("data-src");
  });
  normalizeWechatCodeBlocks($);
  return $.html();
}

function normalizeWechatCodeBlocks($: cheerio.CheerioAPI): void {
  $(".code-snippet__fix").each((_, snippet) => {
    const $snippet = $(snippet);
    const $pre = $snippet.is("pre") ? $snippet : $snippet.find("pre").first();
    if ($pre.length) $snippet.replaceWith(createCleanCodeBlock($, $pre));
  });
  $("pre").each((_, pre) => {
    const $pre = $(pre);
    const attrs = $pre.attr() || {};
    const $code = $pre.children("code");
    const isClean = Object.keys(attrs).length === 0 && $code.length === 1 && $code.children().length === 0;
    if (!isClean) $pre.replaceWith(createCleanCodeBlock($, $pre));
  });
}

const codeBreakSentinel = "\u0001";
const codeBlockTags = ["p", "div", "section", "li", "tr"];

function createCleanCodeBlock($: cheerio.CheerioAPI, $pre: cheerio.Cheerio<Element>): cheerio.Cheerio<AnyNode> {
  const attrs = $pre.attr() || {};
  // 微信页面把语言类名放在 pre 或 code 子元素的 class 上，两处都检查。
  const language = sanitizeCodeLanguage((attrs["data-lang"] || "").toString())
    || sanitizeCodeLanguage(($pre.attr("class") || "").match(/\b(?:language-|code-snippet__)([a-zA-Z0-9_+-]+)/)?.[1] || "")
    || sanitizeCodeLanguage(($pre.children("code").first().attr("class") || "").match(/\b(?:language-|code-snippet__)([a-zA-Z0-9_+-]+)/)?.[1] || "");
  const $codeLines = $pre.children("code");
  const rawText = $codeLines.length > 1
    ? $codeLines.toArray().map((code) => $(code).text()).join("\n")
    : extractCodeTextPreservingBreaks($, $pre);
  const $cleanPre = $("<pre></pre>");
  const $cleanCode = $("<code></code>");
  if (language) $cleanCode.attr("class", `language-${language}`);
  $cleanCode.text(normalizeCodeText(rawText));
  $cleanPre.append($cleanCode);
  return $cleanPre;
}

function extractCodeTextPreservingBreaks($: cheerio.CheerioAPI, $pre: cheerio.Cheerio<Element>): string {
  const $clone = $pre.clone();
  const root = $clone.get(0);
  const elements = root ? [root, ...$clone.find("*").toArray()] : [];
  for (const el of elements) {
    for (const child of $(el).contents().toArray()) {
      const node = child as unknown as { type?: string; data?: string; prev?: unknown; next?: unknown };
      if (!(node.type === "text" && typeof node.data === "string" && /^\s*$/.test(node.data))) continue;
      if (isCodeBlockTag(node.prev) || isCodeBlockTag(node.next)) $(child).remove();
    }
  }
  $clone.find("br").replaceWith(codeBreakSentinel);
  for (const el of $clone.find(codeBlockTags.join(",")).toArray()) {
    $(el).before(codeBreakSentinel);
    $(el).after(codeBreakSentinel);
  }
  return $clone.text().replace(new RegExp(`${codeBreakSentinel}+`, "g"), "\n");
}

function isCodeBlockTag(node: unknown): boolean {
  const value = node as { type?: string; name?: string } | null | undefined;
  return value?.type === "tag" && typeof value.name === "string" && codeBlockTags.includes(value.name);
}

function normalizeCodeText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").replace(/^\n+/, "").replace(/\n+$/, "");
}

function sanitizeCodeLanguage(language: string): string {
  return language.trim().toLowerCase().replace(/[^a-z0-9_+-]/g, "");
}

export function normalizeWechatDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split("T")[0];
  const chinese = dateStr.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (chinese) return formatDateParts(Number(chinese[1]), Number(chinese[2]), Number(chinese[3]));
  const numeric = dateStr.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (numeric) return formatDateParts(Number(numeric[1]), Number(numeric[2]), Number(numeric[3]));
  const date = new Date(dateStr);
  return Number.isNaN(date.getTime()) ? new Date().toISOString().split("T")[0] : date.toISOString().split("T")[0];
}

function extractWechatTimestampDate(html: string): string {
  const match = html.match(/\bvar\s+ct\s*=\s*["'](\d{10})["']/);
  if (!match) return "";
  const date = new Date(Number(match[1]) * 1000);
  return Number.isNaN(date.getTime()) ? "" : formatDateInTimeZone(date);
}

function formatDateParts(year: number, month: number, day: number): string {
  return [String(year).padStart(4, "0"), String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
}

function formatDateInTimeZone(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function extractArticleImages(contentHtml: string): string[] {
  const $ = cheerio.load(contentHtml);
  const images: string[] = [];
  $("img").each((_, element) => {
    const src = $(element).attr("src");
    if (!src || src.startsWith("data:")) return;
    const url = safeMediaUrl(src);
    if (url) images.push(url);
  });
  return [...new Set(images)];
}

function safeMediaUrl(value: string): string {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password && !isIP(host) && mediaAllowedSuffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`)) ? url.toString() : "";
  } catch {
    return "";
  }
}

// ---------- 搜狗会话内直链还原 ----------

async function resolveSogouEntry(page: import("playwright-core").Page, rawLink: string, intervalMs: number): Promise<{ captcha: boolean; sourceUrl: string | null }> {
  await sleep(intervalMs);
  const previousUrl = page.url();
  try {
    await page.goto(rawLink, { waitUntil: "domcontentloaded", timeout: navigationTimeoutMs });
  } catch {
    // 导航失败且页面未变化时，不能把上一篇文章当成当前结果。
    if (page.url() === previousUrl) return { captcha: false, sourceUrl: null };
  }
  if (detectSogouAntispider(page.url(), "")) return { captcha: true, sourceUrl: null };
  const finalUrl = await pollPageUrl(page, (url) => url.startsWith(`https://${weixinArticleHost}/`), resolveTimeoutMs);
  if (detectSogouAntispider(page.url(), "")) return { captcha: true, sourceUrl: null };
  if (!finalUrl) return { captcha: false, sourceUrl: null };
  const sourceUrl = toResolvedWeixinUrl(finalUrl);
  if (!sourceUrl) return { captcha: false, sourceUrl: null };
  // 微信 /s 页面也可能只显示“参数错误”；正文出现才交给调用方。
  try { await page.waitForSelector("#js_content", { timeout: 2_000 }); } catch { return { captcha: false, sourceUrl: null }; }
  return { captcha: false, sourceUrl };
}

async function pollPageUrl(page: import("playwright-core").Page, matches: (url: string) => boolean, timeoutMs: number): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  let current = page.url();
  while (!matches(current) && Date.now() < deadline) {
    await sleep(Math.min(resolvePollIntervalMs, timeoutMs));
    current = page.url();
  }
  return matches(current) ? current : null;
}

function toResolvedWeixinUrl(rawUrl: string): string | null {
  try {
    const parsed = assertHttpUrlWithoutCredentials(rawUrl);
    return parsed.hostname.toLowerCase() === weixinArticleHost ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function buildSogouSearchUrl(query: string): string {
  return `${sogouBaseUrl}/weixin?type=2&query=${encodeURIComponent(query)}`;
}

function mirrorFetchHeaders(): Record<string, string> {
  return { "user-agent": browserUserAgent, "accept-language": "zh-CN,zh;q=0.9,en;q=0.8" };
}

function isAllowedBrowserHost(hostname: string): boolean {
  return browserAllowedSuffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
}

function searchIntervalMs(): number {
  const value = Number(process.env.WECHAT_SEARCH_INTERVAL_MS);
  return Number.isInteger(value) && value > 0 ? value : defaultSearchIntervalMs;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms).unref?.(); });
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

const markdownTranslator = new NodeHtmlMarkdown({ codeBlockStyle: "fenced" });
