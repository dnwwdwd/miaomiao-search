import { DomainError, engineIds, type EngineId } from "../domain.js";
import { engineCatalog } from "../engine-catalog.js";
import type { OpenWebSearchClient } from "../upstream/open-websearch.js";
import type { SettingsService } from "../services/settings.js";
import { BilibiliProvider } from "./bilibili-provider.js";
import { ExaProvider } from "./exa-provider.js";
import { FirecrawlProvider } from "./firecrawl-provider.js";
import { GithubProvider, type GithubClientFactory } from "./github-provider.js";
import { OpenWebSearchProvider } from "./open-websearch-provider.js";
import { TavilyProvider } from "./tavily-provider.js";
import type { SearchProvider } from "./types.js";

export class SearchProviderRegistry {
  constructor(private readonly providers: Map<EngineId, SearchProvider>) {}

  get(engine: EngineId): SearchProvider {
    const provider = this.providers.get(engine);
    if (!provider) throw new DomainError("ENGINE_PROVIDER_MISSING", `搜索引擎 ${engine} 未注册 Provider`, 500);
    return provider;
  }
}

export function createProviderRegistry(settings: SettingsService, upstream: OpenWebSearchClient, options: { fetch?: typeof fetch; githubClientFactory?: GithubClientFactory } = {}): SearchProviderRegistry {
  const providers = new Map<EngineId, SearchProvider>();
  for (const id of engineIds) {
    const kind = engineCatalog[id].provider;
    if (kind === "open-websearch") providers.set(id, new OpenWebSearchProvider(id, upstream));
    else if (kind === "exa") providers.set(id, new ExaProvider(settings, options.fetch));
    else if (kind === "firecrawl") providers.set(id, new FirecrawlProvider(settings));
    else if (kind === "tavily") providers.set(id, new TavilyProvider(settings));
    else if (kind === "github") providers.set(id, new GithubProvider(settings, options.githubClientFactory));
    else if (kind === "bilibili") providers.set(id, new BilibiliProvider());
  }
  return new SearchProviderRegistry(providers);
}

export function createOpenWebSearchRegistry(upstream: OpenWebSearchClient): SearchProviderRegistry {
  const providers = new Map<EngineId, SearchProvider>();
  for (const id of engineIds) if (engineCatalog[id].provider === "open-websearch") providers.set(id, new OpenWebSearchProvider(id, upstream));
  return new SearchProviderRegistry(providers);
}
