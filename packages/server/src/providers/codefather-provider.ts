import { z } from "zod";
import { DomainError } from "../domain.js";
import { fetchJson } from "./http-json.js";
import { cleanText } from "./text.js";
import type { SearchProvider, ProviderSearchInput, ProviderSearchResponse } from "./types.js";

const schema = z.object({
  code: z.number(),
  message: z.string().optional(),
  data: z.object({
    records: z.array(z.record(z.string(), z.unknown())).optional(),
    total: z.union([z.number(), z.string()]).optional(),
  }).optional(),
});

const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

export class CodefatherProvider implements SearchProvider {
  readonly engine = "codefather" as const;
  readonly maxResults = 20;
  readonly cacheVersion = "codefather-v1";

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async search(input: ProviderSearchInput): Promise<ProviderSearchResponse> {
    const response = await this.requestSearch(input);
    return this.mapResponse(response);
  }

  private async requestSearch(input: ProviderSearchInput) {
    const url = "https://api.codefather.cn/api/post/search/page/vo";
    const body = JSON.stringify({
      searchText: input.query,
      pageSize: Math.min(input.limit, this.maxResults),
      current: 1,
    });
    return fetchJson(url, {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/json",
        origin: "https://www.codefather.cn",
        referer: "https://www.codefather.cn/",
        "user-agent": userAgent,
      },
      body,
    }, { timeoutMs: 15_000, schema, fetch: this.fetchImpl });
  }

  private mapResponse(response: Awaited<ReturnType<CodefatherProvider["requestSearch"]>>): ProviderSearchResponse {
    if (response.status === 429) throw new DomainError("CODEFATHER_RATE_LIMITED", "编程导航请求过于频繁", 429);
    if (response.status === 408) throw new DomainError("UPSTREAM_TIMEOUT", "编程导航请求超时", 504);
    if (response.status >= 500) throw new DomainError("UPSTREAM_UNAVAILABLE", "编程导航服务暂时不可用", 502);
    if (!response.data) throw new DomainError("UPSTREAM_INVALID_RESPONSE", "编程导航响应格式无效", 502);
    if (response.data.code !== 0) throw new DomainError("CODEFATHER_API_ERROR", response.data.message || "编程导航搜索接口返回错误", 502);

    const records = response.data.data?.records ?? [];
    const results = records.flatMap((item) => {
      const id = item.id != null ? String(item.id).trim() : "";
      if (!id) return [];
      const title = cleanText(item.title);
      if (!title) return [];
      const description = cleanText(item.plainTextDescription ?? item.searchSummary ?? "");
      const cover = typeof item.thumbnailCover === "string" && item.thumbnailCover
        ? item.thumbnailCover
        : typeof item.cover === "string" && item.cover
          ? item.cover
          : undefined;

      return [{
        title,
        url: `https://www.codefather.cn/post/${id}`,
        description,
        faviconUrl: "https://www.codefather.cn/favicon.ico",
        ...(cover ? { thumbnailUrl: cover } : {}),
        engines: ["codefather" as const],
      }];
    });

    return { results, failures: [] };
  }
}
