import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { DomainError, assertHttpUrlWithoutCredentials } from "../domain.js";
import { fetchText } from "../providers/http-json.js";
import { isFeishuDocumentUrl } from "../providers/feishu-provider.js";
import { FeishuConnectionService } from "./feishu-connection.js";
import { WechatContentService, identifyWechatArticleUrl } from "./wechat-content.js";
import type { SettingsService } from "./settings.js";

export type Platform = "xiaohongshu" | "feishu" | "wechat";
/** Match only content URL shapes supported by the platform fetchers. */
export function identifyPlatformContentUrl(input: string): Platform | null {
  const url = assertHttpUrlWithoutCredentials(input);
  if (url.protocol !== "https:") return null;
  if (url.hostname === "xhslink.com" || url.hostname.endsWith(".xhslink.com")) return /^\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname) ? "xiaohongshu" : null;
  if (url.hostname === "www.xiaohongshu.com" || url.hostname === "xiaohongshu.com") return /^\/(?:explore|discovery\/item|item)\/[a-fA-F0-9]{24}(?:\/|$)/.test(url.pathname) ? "xiaohongshu" : null;
  if (identifyWechatArticleUrl(url.toString())) return "wechat";
  if (isFeishuDocumentUrl(url.toString())) return "feishu";
  return null;
}
export type PlatformContent = {
  platform: Platform;
  sourceUrl: string;
  title: string;
  author?: string;
  publishedAt?: string;
  markdown: string;
  images: string[];
  videoUrls: string[];
  truncated: boolean;
  retrievalMethod: "official-api" | "public-page";
};

type PlainObject = Record<string, unknown>;
const xhsHost = "www.xiaohongshu.com";
const xhsUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

export class PlatformContentService {
  private readonly wechat: WechatContentService;
  constructor(private readonly settings: SettingsService, private readonly fetchImpl: typeof fetch = fetch, private readonly feishu = new FeishuConnectionService(settings, fetchImpl)) {
    this.wechat = new WechatContentService(fetchImpl);
  }

  async fetch(input: string, maxChars = 50_000): Promise<PlatformContent> {
    if (!Number.isInteger(maxChars) || maxChars < 1_000 || maxChars > 200_000) throw new DomainError("INVALID_MAX_CHARS", "正文长度限制无效", 400);
    const initial = assertHttpUrlWithoutCredentials(input);
    if (initial.protocol !== "https:") throw new DomainError("URL_SCHEME_NOT_ALLOWED", "平台链接必须使用 HTTPS", 400);
    const url = initial.hostname === "xhslink.com" || initial.hostname.endsWith(".xhslink.com") ? await this.resolveXhsShortLink(initial) : initial;
    if (url.hostname === xhsHost || url.hostname === "xiaohongshu.com") return this.fetchXhs(url, maxChars);
    const wechatUrl = identifyWechatArticleUrl(url.toString());
    if (wechatUrl) {
      const article = await this.wechat.fetchArticle(wechatUrl, maxChars);
      return { platform: "wechat", sourceUrl: article.sourceUrl, title: article.title, ...(article.author ? { author: article.author } : {}), ...(article.publishedAt ? { publishedAt: article.publishedAt } : {}), markdown: article.markdown, images: article.images, videoUrls: [], truncated: article.truncated, retrievalMethod: "public-page" };
    }
    if (isFeishuDocumentUrl(url.toString())) return this.fetchFeishu(url, maxChars);
    throw new DomainError("PLATFORM_URL_UNSUPPORTED", "暂不支持该平台或链接类型", 400);
  }

  private async resolveXhsShortLink(input: URL): Promise<URL> {
    let current = input;
    for (let count = 0; count < 5; count++) {
      const response = await this.fetchImpl(current, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(15_000) }).catch(() => { throw new DomainError("XHS_SHARE_UNAVAILABLE", "小红书分享链接暂时无法访问", 502); });
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (response.status < 300 || response.status >= 400) throw new DomainError("XHS_SHARE_INVALID", "小红书分享链接没有返回有效跳转", 422);
      if (!location) throw new DomainError("XHS_SHARE_INVALID", "小红书分享链接无法解析", 422);
      const next = assertHttpUrlWithoutCredentials(new URL(location, current).toString());
      if (next.protocol !== "https:" || !(next.hostname === "xhslink.com" || next.hostname.endsWith(".xhslink.com") || next.hostname === "www.xiaohongshu.com" || next.hostname === "xiaohongshu.com")) throw new DomainError("XHS_SHARE_INVALID", "小红书分享链接跳转目标无效", 422);
      if (next.hostname === "www.xiaohongshu.com" || next.hostname === "xiaohongshu.com") return next;
      current = next;
    }
    throw new DomainError("XHS_SHARE_INVALID", "小红书分享链接跳转次数过多", 422);
  }

  private async fetchXhs(url: URL, maxChars: number): Promise<PlatformContent> {
    const match = /^\/(?:explore|discovery\/item|item)\/([a-fA-F0-9]{24})/.exec(url.pathname);
    if (!match) throw new DomainError("XHS_NOTE_URL_INVALID", "请输入小红书帖子链接", 400);
    const noteId = match[1];
    const token = url.searchParams.get("xsec_token") ?? "";
    const canonical = new URL(`https://${xhsHost}/explore/${noteId}`);
    canonical.searchParams.set("xsec_source", url.searchParams.get("xsec_source") || "pc_feed");
    if (token) canonical.searchParams.set("xsec_token", token);
    let html: string;
    try { html = await this.fetchXhsHtml(url); }
    catch (error) {
      if (url.toString() === canonical.toString()) {
        if (!token && error instanceof DomainError && error.code === "XHS_PAGE_UNAVAILABLE") throw new DomainError("XHS_TOKEN_REQUIRED", "请使用包含 xsec_token 的小红书分享链接", 422);
        throw error;
      }
      try { html = await this.fetchXhsHtml(canonical); }
      catch (retryError) {
        if (!token && retryError instanceof DomainError && retryError.code === "XHS_PAGE_UNAVAILABLE") throw new DomainError("XHS_TOKEN_REQUIRED", "请使用包含 xsec_token 的小红书分享链接", 422);
        throw retryError;
      }
    }
    let note = findXhsNote(html, noteId);
    if (!note && url.toString() !== canonical.toString()) {
      try { note = findXhsNote(await this.fetchXhsHtml(canonical), noteId); }
      catch { /* The original page may still expose a usable share link. */ }
    }
    if (!note && !token) {
      const shareLinks = [...html.matchAll(/https:\/\/(?:[a-zA-Z0-9-]+\.)?xhslink\.com\/[a-zA-Z0-9_-]+/g)].slice(0, 3);
      for (const share of shareLinks) {
        try {
          const shared = await this.resolveXhsShortLink(new URL(share[0]));
          if (!shared.pathname.includes(noteId) || !shared.searchParams.get("xsec_token")) continue;
          note = findXhsNote(await this.fetchXhsHtml(shared), noteId);
          if (note) { canonical.searchParams.set("xsec_token", shared.searchParams.get("xsec_token")!); break; }
        } catch { /* Another share URL on the page may not refer to this note. */ }
      }
    }
    if (!note) throw new DomainError(token ? "XHS_CONTENT_NOT_FOUND" : "XHS_TOKEN_REQUIRED", token ? "小红书页面未返回帖子内容" : "该帖子需要包含 xsec_token 的分享链接", 422);
    const description = stringValue(note.desc);
    const images = arrayValue(note.imageList).map((item) => { const image = objectValue(item); return safeMediaUrl(image.urlDefault) || safeMediaUrl(image.url); }).filter(Boolean);
    const video = objectValue(note.video);
    const stream = objectValue(objectValue(video.media).stream);
    const videoUrls = [...arrayValue(stream.h264), ...arrayValue(stream.h265)].map((item) => safeMediaUrl(objectValue(item).masterUrl)).filter(Boolean);
    const title = stringValue(note.title) || description.slice(0, 60) || "小红书帖子";
    const author = stringValue(objectValue(note.user).nickname) || stringValue(objectValue(note.user).nickName);
    const tags = arrayValue(note.tagList).map((item) => stringValue(objectValue(item).name)).filter(Boolean);
    const markdown = [`# ${title}`, "", description, ...(tags.length ? ["", tags.map((tag) => `#${tag}`).join(" ")] : []), ...images.map((image, index) => `\n![图片 ${index + 1}](${image})`), ...(videoUrls[0] ? [`\n[视频](${videoUrls[0]})`] : [])].join("\n").trim();
    return bounded({ platform: "xiaohongshu", sourceUrl: canonical.toString(), title, ...(author ? { author } : {}), ...(dateFromMillis(note.time) ? { publishedAt: dateFromMillis(note.time) } : {}), markdown, images, videoUrls, retrievalMethod: "public-page" }, maxChars);
  }

  private async fetchXhsHtml(url: URL): Promise<string> {
    const response = this.fetchImpl === fetch
      ? await fetchXhsHtmlNative(url)
      : await fetchText(url.toString(), { headers: { "user-agent": xhsUserAgent, accept: "text/html,application/xhtml+xml", "accept-language": "zh-CN,zh;q=0.9" } }, { timeoutMs: 20_000, maxBytes: 5_000_000, fetch: this.fetchImpl });
    if (response.status === 429) throw new DomainError("XHS_RATE_LIMITED", "小红书访问过于频繁", 429);
    if (response.status >= 300) throw new DomainError("XHS_PAGE_UNAVAILABLE", "小红书帖子暂时无法读取", 502);
    return response.text;
  }

  private async fetchFeishu(url: URL, maxChars: number): Promise<PlatformContent> {
    if (!this.feishu.status().connected) return this.fetchFeishuPublic(url, maxChars);
    try { return await this.fetchFeishuOfficial(url, maxChars); }
    catch (error) {
      if (!(error instanceof DomainError) || !["FEISHU_PERMISSION_DENIED", "FEISHU_DOC_TYPE_UNSUPPORTED", "FEISHU_CONTENT_NOT_FOUND", "FEISHU_API_FAILED"].includes(error.code)) throw error;
      try { return await this.fetchFeishuPublic(url, maxChars); }
      catch (fallback) {
        if (fallback instanceof DomainError) throw new DomainError("FEISHU_READ_FAILED", `官方读取失败：${error.message}；分享页读取失败：${fallback.message}`, fallback.statusCode);
        throw fallback;
      }
    }
  }

  private async fetchFeishuOfficial(url: URL, maxChars: number): Promise<PlatformContent> {
    const match = /^\/(wiki|docx|docs)\/([a-zA-Z0-9_-]+)/.exec(url.pathname);
    if (!match) throw new DomainError("FEISHU_DOC_URL_INVALID", "飞书文档链接无效", 400);
    let documentId = match[2];
    if (match[1] === "wiki") {
      const nodeData = await this.feishu.request(`/open-apis/wiki/v2/spaces/get_node?token=${encodeURIComponent(documentId)}&obj_type=wiki`);
      const node = objectValue(objectValue(nodeData.data).node);
      if (stringValue(node.obj_type) !== "docx" || !stringValue(node.obj_token)) throw new DomainError("FEISHU_DOC_TYPE_UNSUPPORTED", "该飞书 Wiki 页面暂不支持正文读取", 422);
      documentId = stringValue(node.obj_token);
    }
    if (match[1] === "docs") throw new DomainError("FEISHU_DOC_TYPE_UNSUPPORTED", "旧版飞书文档改用公开分享链接读取", 422);
    const data = await this.feishu.request(`/open-apis/docx/v1/documents/${encodeURIComponent(documentId)}/raw_content?lang=0`);
    const content = stringValue(objectValue(data.data).content).trim();
    if (!content) throw new DomainError("FEISHU_CONTENT_NOT_FOUND", "飞书文档未返回正文", 422);
    const title = content.split("\n").find((line) => line.trim())?.trim().slice(0, 200) || "飞书文档";
    const structured = await this.fetchFeishuBlocks(documentId).catch(() => "");
    return bounded({ platform: "feishu", sourceUrl: url.toString(), title, markdown: structured || content, images: [], videoUrls: [], retrievalMethod: "official-api" }, maxChars);
  }

  private async fetchFeishuBlocks(documentId: string): Promise<string> {
    const parts: string[] = [];
    let pageToken = "";
    for (let page = 0; page < 3; page++) {
      const params = new URLSearchParams({ page_size: "200", document_revision_id: "-1", ...(pageToken ? { page_token: pageToken } : {}) });
      const response = await this.feishu.request(`/open-apis/docx/v1/documents/${encodeURIComponent(documentId)}/blocks?${params}`);
      const payload = objectValue(response.data);
      const blocks = arrayValue(payload.items);
      if (!blocks.length) break;
      for (const value of blocks) {
        const block = objectValue(value);
        const kind = Number(block.block_type);
        const key = kind === 1 ? "page" : kind === 2 ? "text" : kind >= 3 && kind <= 8 ? `heading${kind - 2}` : kind === 12 ? "bullet" : kind === 13 ? "ordered" : kind === 14 ? "code" : kind === 15 ? "quote" : kind === 17 ? "todo" : "";
        if (!key) continue;
        const elements = arrayValue(objectValue(block[key]).elements);
        const line = elements.map((element) => stringValue(objectValue(objectValue(element).text_run).content)).join("").trim();
        if (!line) continue;
        if (kind === 1) continue;
        if (kind >= 3 && kind <= 8) parts.push(`${"#".repeat(kind - 2)} ${line}`);
        else if (kind === 12 || kind === 17) parts.push(`- ${line}`);
        else if (kind === 13) parts.push(`1. ${line}`);
        else if (kind === 14) parts.push(`\`\`\`\n${line}\n\`\`\``);
        else if (kind === 15) parts.push(`> ${line}`);
        else parts.push(line);
      }
      if (!payload.has_more || !stringValue(payload.page_token)) break;
      pageToken = stringValue(payload.page_token);
    }
    return parts.join("\n\n");
  }

  private async fetchFeishuPublic(url: URL, maxChars: number): Promise<PlatformContent> {
    let chromium: typeof import("playwright-core").chromium;
    try { ({ chromium } = await import("playwright-core")); } catch { throw new DomainError("FEISHU_BROWSER_UNAVAILABLE", "飞书公开文档读取器不可用", 503); }
    const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}), args: ["--no-sandbox", "--disable-dev-shm-usage"] }).catch(() => { throw new DomainError("FEISHU_BROWSER_UNAVAILABLE", "飞书公开文档读取器无法启动", 503); });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 4000 }, locale: "zh-CN", serviceWorkers: "block" });
      const page = await context.newPage();
      await page.route("**/*", async (route) => {
        try {
          const target = new URL(route.request().url());
          const host = target.hostname;
          if (target.protocol === "https:" && (host === "feishu.cn" || host.endsWith(".feishu.cn") || host === "larksuite.com" || host.endsWith(".larksuite.com") || host.endsWith(".byteimg.com") || host.endsWith(".bytecdn.cn") || host.endsWith(".larksuitecdn.com"))) await route.continue();
          else await route.abort();
        } catch { await route.abort(); }
      });
      await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => { throw new DomainError("FEISHU_SHARE_UNAVAILABLE", "飞书分享页面暂时无法读取", 502); });
      if (!isFeishuDocumentUrl(page.url())) throw new DomainError("FEISHU_SHARE_REDIRECTED", "分享链接跳转到了非文档页面", 422);
      await page.locator("[data-block-type], .docs-reader, article").first().waitFor({ timeout: 15_000 }).catch(() => {});
      const title = (await page.title()).replace(/\s*[-|–]\s*(飞书|Feishu|Lark).*$/i, "").trim() || "飞书文档";
      const blocks = await page.locator("[data-block-type]").evaluateAll((elements) => elements.map((element) => {
        const type = element.getAttribute("data-block-type") || "";
        if (!["text", "bullet", "ordered", "todo", "code", "image", "divider"].includes(type) && !/^heading[1-6]$/.test(type)) return null;
        const image = type === "image" ? element.querySelector("img[src]") as HTMLImageElement | null : null;
        const lines = type === "code" ? [...element.querySelectorAll(".code-line-wrapper")].map((line) => (line as HTMLElement).innerText).join("\n") : "";
        return { type, text: lines || (element as HTMLElement).innerText.trim(), src: image?.src || "", language: type === "code" ? element.querySelector(".code-block-header-btn span")?.textContent?.trim() || "" : "" };
      }).filter(Boolean));
      const images: string[] = [];
      const parts = blocks.map((block) => {
        if (!block) return "";
        if (block.type === "image") { const media = safeMediaUrl(block.src); if (media) images.push(media); return media ? `![图片](${media})` : ""; }
        if (block.type === "divider") return "---";
        if (block.type === "code") return `\`\`\`${block.language}\n${block.text}\n\`\`\``;
        if (block.type.startsWith("heading")) return `${"#".repeat(Number(block.type.slice(-1)))} ${block.text}`;
        if (block.type === "bullet" || block.type === "todo") return `- ${block.text}`;
        if (block.type === "ordered") return `1. ${block.text}`;
        return block.text;
      }).filter(Boolean);
      if (!parts.length) throw new DomainError("FEISHU_CONTENT_NOT_FOUND", "公开分享页没有可读正文，可能需要登录", 422);
      return bounded({ platform: "feishu", sourceUrl: url.toString(), title, markdown: parts.join("\n\n"), images, videoUrls: [], retrievalMethod: "public-page" }, maxChars);
    } finally { await browser.close(); }
  }

}

function fetchXhsHtmlNative(url: URL): Promise<{ status: number; text: string }> {
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !["www.xiaohongshu.com", "xiaohongshu.com"].includes(url.hostname)) {
    throw new DomainError("XHS_PAGE_UNAVAILABLE", "小红书帖子链接无效", 400);
  }
  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, { method: "GET", headers: {
      "user-agent": xhsUserAgent,
      accept: "text/html,application/xhtml+xml",
      "accept-language": "zh-CN,zh;q=0.9",
    } }, (response) => {
      const maxBytes = 5_000_000;
      const declaredLength = Number(response.headers["content-length"] ?? 0);
      if (declaredLength > maxBytes) { request.destroy(); reject(new DomainError("UPSTREAM_RESPONSE_TOO_LARGE", "小红书页面响应过大", 502)); return; }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) { request.destroy(); reject(new DomainError("UPSTREAM_RESPONSE_TOO_LARGE", "小红书页面响应过大", 502)); return; }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({ status: response.statusCode ?? 502, text: Buffer.concat(chunks).toString("utf8") }));
      response.on("error", () => reject(new DomainError("XHS_PAGE_UNAVAILABLE", "小红书帖子暂时无法读取", 502)));
    });
    request.setTimeout(20_000, () => { request.destroy(); reject(new DomainError("UPSTREAM_TIMEOUT", "小红书页面请求超时", 504)); });
    request.on("error", () => reject(new DomainError("XHS_PAGE_UNAVAILABLE", "小红书帖子暂时无法读取", 502)));
    request.end();
  });
}

function bounded(content: Omit<PlatformContent, "truncated">, maxChars: number): PlatformContent { return { ...content, markdown: content.markdown.slice(0, maxChars), truncated: content.markdown.length > maxChars }; }
function objectValue(value: unknown): PlainObject { return value && typeof value === "object" && !Array.isArray(value) ? value as PlainObject : {}; }
function arrayValue(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function stringValue(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function safeMediaUrl(value: unknown): string { try { const url = new URL(String(value)); const host = url.hostname.toLowerCase(); if (url.protocol === "http:" && host.endsWith(".xhscdn.com")) url.protocol = "https:"; return url.protocol === "https:" && !url.username && !url.password && !isIP(host) && !host.startsWith("[") && host.includes(".") && host !== "localhost" && !host.endsWith(".local") ? url.toString() : ""; } catch { return ""; } }
function dateFromMillis(value: unknown): string { const n = Number(value); return Number.isFinite(n) && n > 0 && n < 8.64e15 ? new Date(n).toISOString() : ""; }

function findXhsNote(html: string, noteId: string): PlainObject | null {
  const marker = "window.__INITIAL_STATE__";
  const markerAt = html.indexOf(marker);
  if (markerAt < 0) return null;
  const start = html.indexOf("{", markerAt + marker.length);
  if (start < 0) return null;
  let depth = 0, quoted = false, escaped = false, end = -1;
  for (let i = start; i < html.length; i++) {
    const char = html[i];
    if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; continue; }
    if (char === '"') { quoted = true; continue; }
    if (char === "{") depth++;
    if (char === "}" && --depth === 0) { end = i + 1; break; }
  }
  if (end < 0) return null;
  const raw = normalizeXhsState(html.slice(start, end));
  let state: PlainObject;
  try { state = JSON.parse(raw) as PlainObject; } catch { return null; }
  const details = objectValue(objectValue(state.note).noteDetailMap);
  const entry = objectValue(details[noteId] ?? Object.values(details)[0]);
  const note = objectValue(entry.note);
  return stringValue(note.noteId) || stringValue(note.desc) ? note : null;
}

function normalizeXhsState(raw: string): string {
  let result = "", quoted = false, escaped = false;
  for (let i = 0; i < raw.length;) {
    const char = raw[i];
    if (quoted) {
      result += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      i++;
      continue;
    }
    if (char === '"') { quoted = true; result += char; i++; continue; }
    const token = (char === "u" && raw.startsWith("undefined", i) ? "undefined" : char === "N" && raw.startsWith("NaN", i) ? "NaN" : char === "I" && raw.startsWith("Infinity", i) ? "Infinity" : "");
    if (token && (i === 0 || /[\s:[,{]/.test(raw[i - 1])) && (i + token.length === raw.length || /[^\w$]/.test(raw[i + token.length]))) { result += "null"; i += token.length; continue; }
    result += char; i++;
  }
  return result;
}
