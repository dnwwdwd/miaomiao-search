import { z } from "zod";
import { DomainError } from "../domain.js";
import { engineApiKeySetting } from "../engine-catalog.js";
import type { SettingsService } from "../services/settings.js";
import { fetchJson } from "./http-json.js";
import { cleanText, faviconFromUrl, normalizeHttpUrl } from "./text.js";
import type { SearchProvider, ProviderSearchInput, ProviderSearchResponse } from "./types.js";

const schema = z.object({
  requestId: z.string().optional(),
  results: z.array(z.object({
    title: z.string().nullish(),
    url: z.string(),
    text: z.string().nullish(),
    summary: z.string().nullish(),
    highlights: z.array(z.string()).nullish(),
    author: z.string().nullish(),
    publishedDate: z.string().nullish(),
  })).default([]),
});

export class ExaProvider implements SearchProvider {
  readonly engine = "exa" as const;
  readonly maxResults = 50;
  readonly cacheVersion = "exa-v2";

  constructor(private readonly settings: SettingsService, private readonly fetchImpl: typeof fetch = fetch) {}

  async search(input: ProviderSearchInput): Promise<ProviderSearchResponse> {
    const apiKey = this.settings.get<string>(engineApiKeySetting(this.engine))?.trim();
    if (!apiKey) throw new DomainError("ENGINE_API_KEY_REQUIRED", "Exa 启用前需要先配置 API Key");
    const response = await fetchJson("https://api.exa.ai/search", {
      method: "POST",
      headers: { "x-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ query: input.query, type: "auto", numResults: Math.min(input.limit, this.maxResults), contents: { highlights: true } }),
    }, { timeoutMs: 20_000, schema, fetch: this.fetchImpl });
    if (response.status === 401 || response.status === 403) throw new DomainError("EXA_AUTH_FAILED", "Exa API Key 无效或无权限", 502);
    if (response.status === 402) throw new DomainError("EXA_QUOTA_EXHAUSTED", "Exa 额度已用尽", 502);
    if (response.status === 429) throw new DomainError("EXA_RATE_LIMITED", "Exa 请求过于频繁", 429);
    if (response.status === 408) throw new DomainError("UPSTREAM_TIMEOUT", "Exa 请求超时", 504);
    if (response.status >= 500) throw new DomainError("UPSTREAM_UNAVAILABLE", "Exa 服务暂时不可用", 502);
    if (!response.data) throw new DomainError("UPSTREAM_INVALID_RESPONSE", "Exa 响应格式无效", 502);
    const results = response.data.results.flatMap((item) => {
      const url = normalizeHttpUrl(item.url);
      if (!url) return [];
      return [{
        title: cleanText(item.title) || url,
        url,
        description: descriptionFor(item),
        faviconUrl: faviconFromUrl(url),
        engines: [this.engine] as ["exa"],
      }];
    }).slice(0, this.maxResults);
    return { results, failures: [] };
  }
}

function descriptionFor(item: {
  text?: string | null;
  summary?: string | null;
  highlights?: string[] | null;
  author?: string | null;
  publishedDate?: string | null;
}): string {
  const text = cleanText(item.text);
  if (text) return text;
  const summary = cleanText(item.summary);
  if (summary) return summary;
  const highlights = (item.highlights ?? []).map(cleanText).filter(Boolean).join(" ");
  if (highlights) return highlights;
  const author = cleanText(item.author) || "N/A";
  const published = cleanText(item.publishedDate) || "N/A";
  return `Author: ${author}. Published: ${published}`;
}
