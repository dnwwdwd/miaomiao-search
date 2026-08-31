import { z } from "zod";
import { DomainError } from "../domain.js";
import { engineApiKeySetting } from "../engine-catalog.js";
import type { SettingsService } from "../services/settings.js";
import { fetchJson } from "./http-json.js";
import { cleanText, faviconFromUrl, normalizeHttpUrl } from "./text.js";
import type { SearchProvider, ProviderSearchInput, ProviderSearchResponse } from "./types.js";

const itemSchema = z.object({ title: z.string().nullish(), description: z.string().nullish(), url: z.string() });
const schema = z.object({
  success: z.boolean(),
  // Firecrawl has returned both a flat data array and a { web } envelope across API versions.
  data: z.union([z.array(itemSchema), z.object({ web: z.array(itemSchema).default([]) })]).optional(),
  warning: z.string().optional(),
});

export class FirecrawlProvider implements SearchProvider {
  readonly engine = "firecrawl" as const;
  readonly maxResults = 50;
  readonly cacheVersion = "firecrawl-v1";

  constructor(private readonly settings: SettingsService, private readonly fetchImpl: typeof fetch = fetch) {}

  async search(input: ProviderSearchInput): Promise<ProviderSearchResponse> {
    const apiKey = this.settings.get<string>(engineApiKeySetting(this.engine))?.trim();
    if (!apiKey) throw new DomainError("ENGINE_API_KEY_REQUIRED", "Firecrawl 启用前需要先配置 API Key");
    const response = await fetchJson("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ query: input.query, limit: Math.min(input.limit, this.maxResults), sources: ["web"], safe: true, timeout: 15_000, ignoreInvalidURLs: true }),
    }, { timeoutMs: 20_000, schema, fetch: this.fetchImpl });
    if (response.status === 401 || response.status === 403) throw new DomainError("FIRECRAWL_AUTH_FAILED", "Firecrawl API Key 无效或无权限", 502);
    if (response.status === 402) throw new DomainError("FIRECRAWL_QUOTA_EXHAUSTED", "Firecrawl 额度已用尽", 502);
    if (response.status === 429) throw new DomainError("FIRECRAWL_RATE_LIMITED", "Firecrawl 请求过于频繁", 429);
    if (response.status === 408) throw new DomainError("UPSTREAM_TIMEOUT", "Firecrawl 请求超时", 504);
    if (response.status >= 500) throw new DomainError("UPSTREAM_UNAVAILABLE", "Firecrawl 服务暂时不可用", 502);
    if (!response.data || !response.data.success) throw new DomainError("UPSTREAM_INVALID_RESPONSE", "Firecrawl 响应格式无效", 502);
    const items = Array.isArray(response.data.data) ? response.data.data : response.data.data?.web ?? [];
    const results = items.flatMap((item) => {
      const url = normalizeHttpUrl(item.url);
      if (!url) return [];
      return [{ title: cleanText(item.title) || url, url, description: cleanText(item.description), faviconUrl: faviconFromUrl(url), engines: [this.engine] as ["firecrawl"] }];
    }).slice(0, this.maxResults);
    return { results, failures: [] };
  }
}
