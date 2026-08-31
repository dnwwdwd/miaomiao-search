import { z } from "zod";
import { DomainError } from "../domain.js";
import { fetchJson, fetchText } from "./http-json.js";
import { bilibiliVideoUrl, normalizeBilibiliUrl, officialBilibiliThumbnail, stripBilibiliMarkup } from "./text.js";
import type { SearchProvider, ProviderSearchInput, ProviderSearchResponse } from "./types.js";

const schema = z.object({
  code: z.number(),
  message: z.string().optional(),
  data: z.object({ result: z.array(z.record(z.string(), z.unknown())).optional() }).optional(),
});
const userAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36";

export class BilibiliProvider implements SearchProvider {
  readonly engine = "bilibili" as const;
  readonly maxResults = 20;
  readonly cacheVersion = "bilibili-v2";

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async search(input: ProviderSearchInput): Promise<ProviderSearchResponse> {
    const first = await this.requestSearch(input);
    let response = first;
    if (isBlocked(response)) {
      let cookie = "";
      try {
        const warmed = await fetchText("https://www.bilibili.com/", { headers: { accept: "text/html,application/xhtml+xml", "user-agent": userAgent } }, { timeoutMs: 15_000, fetch: this.fetchImpl });
        cookie = extractCookies(warmed.headers);
      } catch { /* retry the API even if the anonymous warm-up cannot be read */ }
      response = await this.requestSearch(input, cookie);
    }
    return this.mapResponse(response);
  }

  private async requestSearch(input: ProviderSearchInput, cookie = "") {
    const url = new URL("https://api.bilibili.com/x/web-interface/search/all/v2");
    url.search = new URLSearchParams({ keyword: input.query, page: "1", order: "totalrank" }).toString();
    const response = await fetchJson(url.toString(), {
      headers: { accept: "application/json, text/plain, */*", "accept-language": "zh-CN,zh;q=0.9", "user-agent": userAgent, referer: `https://search.bilibili.com/all?keyword=${encodeURIComponent(input.query)}`, ...(cookie ? { cookie } : {}) },
    }, { timeoutMs: 20_000, schema, fetch: this.fetchImpl });
    return response;
  }

  private mapResponse(response: Awaited<ReturnType<BilibiliProvider["requestSearch"]>>): ProviderSearchResponse {
    if (response.status === 429) throw new DomainError("BILIBILI_RATE_LIMITED", "B站请求过于频繁", 429);
    if (response.status === 408) throw new DomainError("UPSTREAM_TIMEOUT", "B站请求超时", 504);
    if (response.status === 412 || response.data?.code === -412) throw new DomainError("BILIBILI_BLOCKED", "B站公开搜索接口暂时阻断", 502);
    if (response.status >= 500) throw new DomainError("UPSTREAM_UNAVAILABLE", "B站服务暂时不可用", 502);
    if (!response.data) throw new DomainError("UPSTREAM_INVALID_RESPONSE", "B站响应格式无效", 502);
    if (response.data.code !== 0) throw new DomainError("BILIBILI_API_ERROR", "B站搜索接口返回错误", 502);
    const groups = response.data.data?.result ?? [];
    const videoGroup = groups.find((group) => group.result_type === "video");
    const items = videoGroup && Array.isArray(videoGroup.data) ? videoGroup.data : [];
    const results = items.flatMap((item) => {
      if (item.type === "live_room" || item.result_type === "live_room") return [];
      const title = stripBilibiliMarkup(item.title);
      if (!title) return [];
      const url = bilibiliVideoUrl(item.bvid) ?? normalizeBilibiliUrl(item.arcurl);
      if (!url) return [];
      const thumbnailUrl = officialBilibiliThumbnail(item.pic);
      const videoMeta = {
        ...(stringValue(item.author) ? { author: stripBilibiliMarkup(item.author) } : {}),
        ...(stringValue(item.duration) ? { duration: stringValue(item.duration) } : {}),
        ...(numberValue(item.play) !== undefined ? { views: numberValue(item.play) } : {}),
        ...(numberValue(item.like) !== undefined ? { likes: numberValue(item.like) } : {}),
        ...(numberValue(item.favorites) !== undefined ? { favorites: numberValue(item.favorites) } : {}),
        ...(numberValue(item.video_review ?? item.review) !== undefined ? { comments: numberValue(item.video_review ?? item.review) } : {}),
        ...(numberValue(item.pubdate) !== undefined ? { publishedAt: numberValue(item.pubdate) } : {}),
      };
      return [{ title, url, description: stripBilibiliMarkup(item.description) || stripBilibiliMarkup(item.author), faviconUrl: "https://www.bilibili.com/favicon.ico", ...(thumbnailUrl ? { thumbnailUrl } : {}), ...(Object.keys(videoMeta).length ? { videoMeta } : {}), engines: [this.engine] as ["bilibili"] }];
    }).slice(0, this.maxResults);
    return { results, failures: [] };
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function isBlocked(response: { status: number; data?: { code: number } }): boolean {
  return response.status === 412 || response.data?.code === -412;
}

function extractCookies(headers: Headers): string {
  const source = typeof (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === "function"
    ? (headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
    : [headers.get("set-cookie") ?? ""];
  return source.map((value) => value.split(";", 1)[0]?.trim()).filter(Boolean).join("; ");
}
