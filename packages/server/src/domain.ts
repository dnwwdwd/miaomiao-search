export const engineIds = ["bing", "baidu", "duckduckgo", "exa", "csdn", "juejin", "sogou"] as const;
export type EngineId = (typeof engineIds)[number];
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
};

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
