import { DomainError, type Channel, type EngineId, type EngineSearchResultGroup, type FetchContent, type SearchFailure, type SearchInput, type SearchResponse, type SearchResult, type UpstreamSearchResponse } from "../domain.js";
import type { OpenWebSearchClient } from "../upstream/open-websearch.js";
import { AuditService } from "./audit.js";
import { TtlLruCache } from "./cache.js";
import { validatePublicHttpUrl } from "./security.js";
import { SettingsService } from "./settings.js";

const searchCacheTtlMs = 60 * 60 * 1_000;
const contentCacheTtlMs = 24 * 60 * 60 * 1_000;

type EngineLimitResolver = (engines: EngineId[]) => Partial<Record<EngineId, number | null>>;

export class SearchService {
  constructor(
    private readonly upstream: OpenWebSearchClient,
    private readonly audit: AuditService,
    private readonly settings?: SettingsService,
    private readonly searchCache = new TtlLruCache<UpstreamSearchResponse>(1_000),
    private readonly contentCache = new TtlLruCache<FetchContent>(1_000),
    private readonly resolveEngines: (engines: EngineId[]) => EngineId[] = (engines) => engines,
    private readonly resolveEngineLimits: EngineLimitResolver = () => ({}),
  ) {}

  async search(input: SearchInput, context: { channel: Channel; saveHistory?: boolean; tokenId?: string; tokenPrefix?: string }): Promise<SearchResponse> {
    const resolvedInput = { ...input, engines: this.resolveEngines(input.engines) };
    this.validateSearchInput(resolvedInput);
    const startedAt = Date.now();
    const configuredLimits = this.resolveEngineLimits(resolvedInput.engines);
    const concurrency = this.setting("engine.concurrency", 3);
    let cached = false;

    try {
      const engineResults = await mapWithConcurrency(resolvedInput.engines, concurrency, async (engine) => {
        const configuredLimit = configuredLimits[engine];
        const fallbackLimit = this.setting("search.defaultLimit", 10);
        const limit = Math.min(input.limit ?? (configuredLimit ?? fallbackLimit), configuredLimit ?? fallbackLimit, this.setting("search.maxLimit", 50));
        const searchMode = engine === "bing" ? "request" : undefined;
        const executionInput: SearchInput = { query: resolvedInput.query, engines: [engine], limit, searchMode };
        const key = JSON.stringify({ query: executionInput.query, engine, limit, searchMode });
        const searchCacheEnabled = this.setting("cache.search.enabled", true);
        let response = searchCacheEnabled ? this.searchCache.get(key) : undefined;
        const groupCached = Boolean(response);
        try {
          if (!response) {
            response = await this.upstream.search(executionInput);
            if (searchCacheEnabled) this.searchCache.set(key, response, this.setting("cache.search.ttl", searchCacheTtlMs / 1_000) * 1_000, this.setting("cache.search.maxSize", 1_000));
          }
          const failures = response.failures.map((failure) => ({ ...failure, engine }));
          const group: EngineSearchResultGroup = {
            engine,
            limit,
            results: response.results.slice(0, limit).map((result) => ({ ...result, engines: [engine] })),
            cached: groupCached,
            ...(failures[0] ? { failure: failures[0] } : {}),
          };
          return group;
        } catch (error) {
          const failure = this.toFailure(engine, error);
          return { engine, limit, results: [], cached: groupCached, failure } satisfies EngineSearchResultGroup;
        }
      });

      const failures = engineResults.flatMap((group) => group.failure ? [group.failure] : []);
      if (engineResults.every((group) => group.failure && group.results.length === 0)) {
        const allTimedOut = engineResults.every((group) => group.failure?.code.includes("TIMEOUT"));
        throw new DomainError("ALL_ENGINES_FAILED", allTimedOut ? "所有搜索引擎响应超时" : "所有搜索引擎均失败", 502);
      }

      const results = deduplicateResults(engineResults.flatMap((group) => group.results));
      cached = engineResults.length > 0 && engineResults.every((group) => group.cached);
      const status = failures.length > 0 ? "partial" : "success";
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
      if (context.channel === "web" && context.saveHistory !== false && this.setting("history.enabled", true)) {
        this.audit.pruneHistory(this.setting("history.retentionDays", 30));
        this.audit.saveHistory(resolvedInput.query, resolvedInput.engines, results.length, { results, failures, engineResults });
      }
      return { results, engineResults, failures, resultCount: results.length, cached, requestId };
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
    const key = JSON.stringify({ url, maxChars, extractor: "readability-v2" });
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
    if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50)) throw new DomainError("INVALID_LIMIT", "结果数量必须在 1 到 50 之间");
    if (input.searchMode && !input.engines.includes("bing")) throw new DomainError("SEARCH_MODE_NOT_APPLICABLE", "搜索模式仅适用于 Bing");
  }

  private toFailure(engine: EngineId, error: unknown): SearchFailure {
    if (error instanceof DomainError) return { engine, code: error.code, message: error.message };
    return { engine, code: "UPSTREAM_UNAVAILABLE", message: error instanceof Error ? error.message : "上游搜索失败" };
  }

  private setting<T>(key: string, fallback: T): T {
    return this.settings?.get<T>(key) ?? fallback;
  }
}

async function mapWithConcurrency<T, R>(items: T[], requestedConcurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const concurrencyValue = Number.isFinite(requestedConcurrency) ? Math.floor(requestedConcurrency) : 1;
  const concurrency = Math.max(1, Math.min(items.length || 1, concurrencyValue));
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  }));
  return results;
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
