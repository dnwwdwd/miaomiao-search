export const engineIds = ["bing", "baidu", "duckduckgo", "exa", "csdn", "juejin", "sogou", "firecrawl", "tavily", "github", "bilibili", "zhihu"] as const;
export type EngineId = (typeof engineIds)[number];

/**
 * Return the configured order followed by any newly-added engines.
 * Settings are user-editable JSON, so unknown, duplicate and disabled IDs
 * must never leak into a search request or MCP schema.
 */
export function orderEngineIds(preferred: unknown, available: EngineId[]): EngineId[] {
  const validAvailable = [...new Set(available.filter((id): id is EngineId => engineIds.includes(id)))];
  const availableSet = new Set(validAvailable);
  const configured = Array.isArray(preferred)
    ? preferred.filter((id): id is EngineId => typeof id === "string" && availableSet.has(id as EngineId))
    : [];
  return [...new Set([...configured, ...validAvailable])];
}
export type SearchMode = "auto" | "request";
export type Channel = "web" | "mcp";

export type SearchInput = {
  query: string;
  engines: EngineId[];
  limit?: number;
  searchMode?: SearchMode;
};

export type SearchResult = {
  title: string;
  url: string;
  description: string;
  faviconUrl?: string;
  thumbnailUrl?: string;
  videoMeta?: {
    author?: string;
    duration?: string;
    views?: number;
    likes?: number;
    favorites?: number;
    comments?: number;
    publishedAt?: number;
  };
  engines: EngineId[];
};

export type SearchFailure = { engine: EngineId; code: string; message: string };
export type UpstreamSearchResponse = { results: SearchResult[]; failures: SearchFailure[] };
export type EngineSearchResultGroup = {
  engine: EngineId;
  limit: number;
  results: SearchResult[];
  cached: boolean;
  failure?: SearchFailure;
};
export type SearchResponse = {
  results: SearchResult[];
  engineResults: EngineSearchResultGroup[];
  failures: SearchFailure[];
  resultCount: number;
  cached: boolean;
  requestId: string;
};
export type FetchContent = {
  url: string;
  finalUrl: string;
  title: string;
  contentType: string;
  truncated: boolean;
  content: string;
  retrievalMethod?: string;
  extractionMethod?: string;
  readabilityApplied?: boolean;
};

export function assertHttpUrlWithoutCredentials(value: string, label = "URL"): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DomainError("INVALID_URL", `${label} 格式无效`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new DomainError("URL_SCHEME_NOT_ALLOWED", `${label} 仅允许 HTTP(S) URL`);
  if (url.username || url.password) throw new DomainError("URL_CREDENTIALS_NOT_ALLOWED", `${label} 不能包含凭据`);
  return url;
}

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
