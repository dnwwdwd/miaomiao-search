import type { EngineId, SearchMode, SearchResult } from "../domain.js";

export type ProviderSearchInput = {
  query: string;
  limit: number;
  searchMode?: SearchMode;
};

export type ProviderFailure = { code: string; message: string };
export type ProviderSearchResponse = { results: SearchResult[]; failures: ProviderFailure[] };

export interface SearchProvider {
  readonly engine: EngineId;
  readonly maxResults: number;
  readonly cacheVersion: string;
  search(input: ProviderSearchInput): Promise<ProviderSearchResponse>;
}
