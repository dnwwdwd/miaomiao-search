import type { EngineId } from "../domain.js";
import type { OpenWebSearchClient } from "../upstream/open-websearch.js";
import type { SearchProvider, ProviderSearchInput, ProviderSearchResponse } from "./types.js";

export class OpenWebSearchProvider implements SearchProvider {
  readonly maxResults = 50;
  readonly cacheVersion = "open-websearch-v1";

  constructor(readonly engine: EngineId, private readonly upstream: OpenWebSearchClient) {}

  async search(input: ProviderSearchInput): Promise<ProviderSearchResponse> {
    const response = await this.upstream.search({ query: input.query, engines: [this.engine], limit: input.limit, searchMode: input.searchMode });
    return {
      results: response.results.map((result) => ({ ...result, engines: [this.engine] })),
      failures: response.failures.filter((failure) => failure.engine === this.engine).map(({ code, message }) => ({ code, message })),
    };
  }
}
