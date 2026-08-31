import { z } from "zod";
import { DomainError } from "../domain.js";
import { engineApiKeySetting } from "../engine-catalog.js";
import type { SettingsService } from "../services/settings.js";
import { fetchJson } from "./http-json.js";
import { cleanText, faviconFromUrl, normalizeHttpUrl } from "./text.js";
import type { SearchProvider, ProviderSearchInput, ProviderSearchResponse } from "./types.js";

const schema = z.object({
  results: z.array(z.object({ title: z.string(), url: z.string(), content: z.string().nullish(), score: z.number().optional(), favicon: z.string().nullish() })).default([]),
  request_id: z.string().optional(),
  response_time: z.number().optional(),
});

export class TavilyProvider implements SearchProvider {
  readonly engine = "tavily" as const;
  readonly maxResults = 20;
  readonly cacheVersion = "tavily-v1";

  constructor(private readonly settings: SettingsService, private readonly fetchImpl: typeof fetch = fetch) {}

  async search(input: ProviderSearchInput): Promise<ProviderSearchResponse> {
    const apiKey = this.settings.get<string>(engineApiKeySetting(this.engine))?.trim();
    if (!apiKey) throw new DomainError("ENGINE_API_KEY_REQUIRED", "Tavily 启用前需要先配置 API Key");
    const response = await fetchJson("https://api.tavily.com/search", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ query: input.query, search_depth: "basic", topic: "general", max_results: Math.min(input.limit, this.maxResults), include_answer: false, include_raw_content: false, include_images: false, include_favicon: true, auto_parameters: false }),
    }, { timeoutMs: 20_000, schema, fetch: this.fetchImpl });
    if (response.status === 401 || response.status === 403) throw new DomainError("TAVILY_AUTH_FAILED", "Tavily API Key 无效或无权限", 502);
    if (response.status === 402) throw new DomainError("TAVILY_QUOTA_EXHAUSTED", "Tavily 额度已用尽", 502);
    if (response.status === 429) throw new DomainError("TAVILY_RATE_LIMITED", "Tavily 请求过于频繁", 429);
    if (response.status === 408) throw new DomainError("UPSTREAM_TIMEOUT", "Tavily 请求超时", 504);
    if (response.status >= 500) throw new DomainError("UPSTREAM_UNAVAILABLE", "Tavily 服务暂时不可用", 502);
    if (!response.data) throw new DomainError("UPSTREAM_INVALID_RESPONSE", "Tavily 响应格式无效", 502);
    const results = response.data.results.flatMap((item) => {
      const url = normalizeHttpUrl(item.url);
      if (!url) return [];
      const favicon = normalizeHttpUrl(item.favicon);
      return [{ title: cleanText(item.title) || url, url, description: cleanText(item.content), faviconUrl: favicon ?? faviconFromUrl(url), engines: [this.engine] as ["tavily"] }];
    }).slice(0, this.maxResults);
    return { results, failures: [] };
  }
}
