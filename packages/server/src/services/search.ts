import { DomainError, type Channel, type EngineId, type FetchContent, type SearchInput, type SearchResult, type UpstreamSearchResponse } from "../domain.js";
import type { OpenWebSearchClient } from "../upstream/open-websearch.js";
import { AuditService } from "./audit.js";
import { TtlLruCache } from "./cache.js";
import { validatePublicHttpUrl } from "./security.js";
import { SettingsService } from "./settings.js";

const searchCacheTtlMs = 60 * 60 * 1_000;
const contentCacheTtlMs = 24 * 60 * 60 * 1_000;

export class SearchService {
  constructor(
    private readonly upstream: OpenWebSearchClient,
    private readonly audit: AuditService,
    private readonly settings?: SettingsService,
    private readonly searchCache = new TtlLruCache<UpstreamSearchResponse>(1_000),
    private readonly contentCache = new TtlLruCache<FetchContent>(1_000),
    private readonly resolveEngines: (engines: EngineId[]) => EngineId[] = (engines) => engines,
  ) {}

  async search(input: SearchInput, context: { channel: Channel; saveHistory?: boolean; tokenId?: string; tokenPrefix?: string }): Promise<{ results: SearchResult[]; failures: UpstreamSearchResponse["failures"]; cached: boolean; requestId: string }> {
    const resolvedInput = { ...input, engines: this.resolveEngines(input.engines) };
    this.validateSearchInput(resolvedInput);
    const startedAt = Date.now();
    const executionInput: SearchInput = { ...resolvedInput, engines: [...resolvedInput.engines], searchMode: resolvedInput.engines.includes("bing") ? "request" : undefined };
    const key = JSON.stringify({ ...executionInput, engines: [...executionInput.engines].sort() });
    let cached = false;
    try {
      const searchCacheEnabled = this.setting("cache.search.enabled", true);
      let response = searchCacheEnabled ? this.searchCache.get(key) : undefined;
      if (response) cached = true;
      else {
        response = await this.upstream.search(executionInput);
        if (searchCacheEnabled) this.searchCache.set(key, response, this.setting("cache.search.ttl", searchCacheTtlMs / 1_000) * 1_000, this.setting("cache.search.maxSize", 1_000));
      }
      if (response.results.length === 0 && response.failures.length === resolvedInput.engines.length) {
        throw new DomainError("ALL_ENGINES_FAILED", "所有搜索引擎均失败", 502);
      }
      const results = deduplicateResults(response.results);
      const status = response.failures.length > 0 ? "partial" : "success";
      const requestId = this.audit.record({
        channel: context.channel,
        operation: "search",
        tokenId: context.tokenId,
        tokenPrefix: context.tokenPrefix,
        query: context.channel === "web" && this.setting("log.saveQuery", false) ? input.query : undefined,
        engines: resolvedInput.engines,
        latencyMs: Date.now() - startedAt,
        cacheHit: cached,
        resultCount: results.length,
        status,
      });
      if (context.channel === "web" && context.saveHistory !== false && this.setting("history.enabled", true)) this.audit.saveHistory(resolvedInput.query, resolvedInput.engines, results.length);
      return { results, failures: response.failures, cached, requestId };
    } catch (error) {
      const domainError = error instanceof DomainError ? error : new DomainError("SEARCH_FAILED", "搜索失败", 502);
      this.audit.record({
        channel: context.channel,
        operation: "search",
        tokenId: context.tokenId,
        tokenPrefix: context.tokenPrefix,
        engines: resolvedInput.engines,
        latencyMs: Date.now() - startedAt,
        cacheHit: cached,
        status: "error",
        errorCode: domainError.code,
      });
      throw domainError;
    }
  }

  async fetchContent(url: string, maxChars: number, context: { channel: Channel; tokenId?: string; tokenPrefix?: string }): Promise<{ content: FetchContent; cached: boolean; requestId: string }> {
    const configuredMaxChars = this.setting("fetch.maxChars", 50_000);
    if (!Number.isInteger(maxChars) || maxChars < 1_000 || maxChars > Math.min(200_000, configuredMaxChars)) throw new DomainError("INVALID_MAX_CHARS", `正文长度必须在 1000 到 ${Math.min(200_000, configuredMaxChars)} 之间`);
    await validatePublicHttpUrl(url);
    const startedAt = Date.now();
    const key = JSON.stringify({ url, maxChars });
    let cached = false;
    try {
      const contentCacheEnabled = this.setting("cache.content.enabled", true);
      let content = contentCacheEnabled ? this.contentCache.get(key) : undefined;
      if (content) cached = true;
      else {
        content = await this.upstream.fetchWebContent({ url, maxChars });
        await validatePublicHttpUrl(content.finalUrl);
        if (contentCacheEnabled) this.contentCache.set(key, content, this.setting("cache.content.ttl", contentCacheTtlMs / 1_000) * 1_000);
      }
      const requestId = this.audit.record({ channel: context.channel, operation: "fetchWebContent", tokenId: context.tokenId, tokenPrefix: context.tokenPrefix, latencyMs: Date.now() - startedAt, cacheHit: cached, resultCount: 1, status: "success" });
      return { content, cached, requestId };
    } catch (error) {
      const domainError = error instanceof DomainError ? error : new DomainError("FETCH_FAILED", "正文读取失败", 502);
      this.audit.record({ channel: context.channel, operation: "fetchWebContent", tokenId: context.tokenId, tokenPrefix: context.tokenPrefix, latencyMs: Date.now() - startedAt, cacheHit: cached, status: "error", errorCode: domainError.code });
      throw domainError;
    }
  }

  private validateSearchInput(input: SearchInput): void {
    if (!input.query.trim()) throw new DomainError("QUERY_REQUIRED", "搜索内容不能为空");
    if (input.query.length > 500) throw new DomainError("QUERY_TOO_LONG", "搜索内容不能超过 500 个字符");
    if (input.engines.length === 0) throw new DomainError("ENGINE_REQUIRED", "至少选择一个搜索引擎");
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50) throw new DomainError("INVALID_LIMIT", "结果数量必须在 1 到 50 之间");
    if (input.searchMode && !input.engines.includes("bing")) throw new DomainError("SEARCH_MODE_NOT_APPLICABLE", "搜索模式仅适用于 Bing");
  }

  private setting<T>(key: string, fallback: T): T {
    return this.settings?.get<T>(key) ?? fallback;
  }
}

function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    if (url.pathname !== "/" && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, -1);
    return url.toString();
  } catch {
    return value;
  }
}

function deduplicateResults(results: SearchResult[]): SearchResult[] {
  const merged = new Map<string, SearchResult>();
  for (const result of results) {
    const key = canonicalUrl(result.url);
    const existing = merged.get(key);
    if (existing) {
      existing.engines = [...new Set([...existing.engines, ...result.engines])] as EngineId[];
    } else {
      merged.set(key, { ...result, url: key, engines: [...new Set(result.engines)] as EngineId[] });
    }
  }
  return [...merged.values()];
}
