import { DomainError } from "../domain.js";
import type { FeishuConnectionService } from "../services/feishu-connection.js";
import type { ProviderSearchInput, ProviderSearchResponse, SearchProvider } from "./types.js";

type SearchUnit = { title_highlighted?: unknown; summary_highlighted?: unknown; result_meta?: { token?: unknown; url?: unknown; doc_types?: unknown } };

export class FeishuProvider implements SearchProvider {
  readonly engine = "feishu" as const;
  readonly maxResults = 20;
  readonly cacheVersion = "feishu-oauth-doc-search-v1";

  constructor(private readonly connection: FeishuConnectionService) {}

  async search(input: ProviderSearchInput): Promise<ProviderSearchResponse> {
    const wanted = Math.min(this.maxResults, Math.max(1, input.limit));
    const results: ProviderSearchResponse["results"] = [];
    let pageToken = "";
    for (let page = 0; page < 3 && results.length < wanted; page++) {
      const data = await this.connection.request("/open-apis/search/v2/doc_wiki/search", { method: "POST", body: JSON.stringify({ query: input.query.trim(), page_size: Math.min(20, wanted - results.length), doc_filter: {}, wiki_filter: {}, ...(pageToken ? { page_token: pageToken } : {}) }) });
      const payload = data.data as { res_units?: SearchUnit[]; has_more?: boolean; page_token?: string } | undefined;
      if (!payload || !Array.isArray(payload.res_units)) throw new DomainError("FEISHU_SEARCH_INVALID_RESPONSE", "飞书搜索响应无效", 502);
      for (const item of payload.res_units) {
        const rawUrl = item.result_meta?.url;
        if (typeof rawUrl !== "string" || !isFeishuDocumentUrl(rawUrl)) continue;
        const title = cleanHighlight(item.title_highlighted);
        if (!title) continue;
        results.push({ title, url: rawUrl, description: cleanHighlight(item.summary_highlighted), faviconUrl: "https://www.feishu.cn/favicon.ico", engines: [this.engine] });
        if (results.length >= wanted) break;
      }
      if (!payload.has_more || !payload.page_token) break;
      pageToken = payload.page_token;
    }
    return { results, failures: [] };
  }
}

export function isFeishuDocumentUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && !url.username && !url.password
      && (url.hostname === "feishu.cn" || url.hostname.endsWith(".feishu.cn") || url.hostname === "larksuite.com" || url.hostname.endsWith(".larksuite.com"))
      && /^\/(wiki|docx|docs)\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname);
  } catch { return false; }
}

function cleanHighlight(value: unknown): string {
  return typeof value === "string" ? value.replace(/<\/?h>/g, "").replace(/<[^>]*>/g, "").trim() : "";
}
