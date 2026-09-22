import { DomainError } from "../domain.js";
import type { OpenWebSearchClient } from "../upstream/open-websearch.js";
import type { ProviderFailure, ProviderSearchInput, ProviderSearchResponse, SearchProvider } from "./types.js";

const zhihuHost = "zhuanlan.zhihu.com";
const zhihuFavicon = "https://zhuanlan.zhihu.com/favicon.ico";

/**
 * Experimental Zhihu source.
 *
 * Zhihu does not expose a public search API in this flow. We use the existing
 * request-mode search engines with a host-restricted query, then normalize the
 * returned records so callers only see the logical `zhihu` source.
 */
export class ZhihuProvider implements SearchProvider {
  readonly engine = "zhihu" as const;
  readonly maxResults = 20;
  readonly cacheVersion = "zhihu-site-query-v1";

  constructor(private readonly upstream: OpenWebSearchClient) {}

  async search(input: ProviderSearchInput): Promise<ProviderSearchResponse> {
    const limit = Math.max(1, Math.min(this.maxResults, input.limit));
    const query = `site:${zhihuHost} ${input.query.trim()}`;
    let bingResponse: Awaited<ReturnType<OpenWebSearchClient["search"]>> | undefined;
    let bingError: unknown;

    try {
      // Bing is the primary path because the daemon's request-mode parser is
      // already hardened for redirects and challenge responses.
      bingResponse = await this.upstream.search({ query, engines: ["bing"], limit, searchMode: "request" });
      const results = normalizeResults(bingResponse.results, limit);
      if (results.length > 0) return { results, failures: [] };
    } catch (error) {
      bingError = error;
    }

    try {
      const baiduResponse = await this.upstream.search({ query, engines: ["baidu"], limit });
      const results = normalizeResults(baiduResponse.results, limit);
      if (results.length > 0) return { results, failures: [] };
      const failure = failureFromResponse(baiduResponse.failures)
        ?? (bingResponse ? failureFromResponse(bingResponse.failures) : undefined)
        ?? (bingError ? failureFromError(bingError) : undefined);
      return failure ? { results: [], failures: [failure] } : { results: [], failures: [] };
    } catch (baiduError) {
      // Keep the failure code stable for the UI/MCP contract while retaining a
      // useful DomainError code when the upstream adapter supplied one.
      const sourceError = baiduError ?? bingError;
      throw sourceError instanceof DomainError
        ? sourceError
        : new DomainError("ZHIHU_SEARCH_UNAVAILABLE", "知乎搜索暂时不可用", 502);
    }
  }
}

function normalizeResults(results: Awaited<ReturnType<OpenWebSearchClient["search"]>>["results"], limit: number) {
  return results
    .filter((result) => isZhihuUrl(result.url))
    .map((result) => ({ ...result, faviconUrl: zhihuFavicon, engines: ["zhihu"] as ["zhihu"] }))
    .slice(0, limit);
}

function isZhihuUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:")
      && !url.username
      && !url.password
      && url.hostname.toLowerCase() === zhihuHost;
  } catch {
    return false;
  }
}

function failureFromResponse(failures: Array<{ code: string; message: string }>): ProviderFailure | undefined {
  const failure = failures[0];
  return failure ? { code: failure.code, message: failure.message } : undefined;
}

function failureFromError(error: unknown): ProviderFailure {
  return error instanceof DomainError
    ? { code: error.code, message: error.message }
    : { code: "ZHIHU_SEARCH_UNAVAILABLE", message: "知乎搜索暂时不可用" };
}
