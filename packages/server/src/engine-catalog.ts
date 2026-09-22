import type { EngineId } from "./domain.js";

export type CredentialMode = "none" | "optional" | "required";
export type ProviderKind = "open-websearch" | "exa" | "firecrawl" | "tavily" | "github" | "bilibili" | "zhihu";
export type EngineDefinition = {
  provider: ProviderKind;
  requiresProxy: boolean;
  credentialMode: CredentialMode;
  credentialLabel?: string;
  credentialPlaceholder?: string;
  credentialUrl?: string;
  defaultEnabled: boolean;
  defaultSelected: boolean;
  maxResults: number;
};

export const engineCatalog: Record<EngineId, EngineDefinition> = {
  bing: { provider: "open-websearch", requiresProxy: false, credentialMode: "none", defaultEnabled: true, defaultSelected: true, maxResults: 50 },
  baidu: { provider: "open-websearch", requiresProxy: false, credentialMode: "none", defaultEnabled: true, defaultSelected: true, maxResults: 50 },
  duckduckgo: { provider: "open-websearch", requiresProxy: true, credentialMode: "none", defaultEnabled: false, defaultSelected: false, maxResults: 50 },
  exa: { provider: "exa", requiresProxy: false, credentialMode: "required", credentialLabel: "Exa API Key", credentialPlaceholder: "exa-...", credentialUrl: "https://dashboard.exa.ai/api-keys", defaultEnabled: false, defaultSelected: false, maxResults: 50 },
  csdn: { provider: "open-websearch", requiresProxy: false, credentialMode: "none", defaultEnabled: true, defaultSelected: true, maxResults: 50 },
  juejin: { provider: "open-websearch", requiresProxy: false, credentialMode: "none", defaultEnabled: true, defaultSelected: true, maxResults: 50 },
  sogou: { provider: "open-websearch", requiresProxy: false, credentialMode: "none", defaultEnabled: true, defaultSelected: true, maxResults: 50 },
  firecrawl: { provider: "firecrawl", requiresProxy: false, credentialMode: "required", credentialLabel: "Firecrawl API Key", credentialPlaceholder: "fc-...", credentialUrl: "https://www.firecrawl.dev/app/api-keys", defaultEnabled: false, defaultSelected: false, maxResults: 50 },
  tavily: { provider: "tavily", requiresProxy: false, credentialMode: "required", credentialLabel: "Tavily API Key", credentialPlaceholder: "tvly-...", credentialUrl: "https://app.tavily.com/home", defaultEnabled: false, defaultSelected: false, maxResults: 20 },
  github: { provider: "github", requiresProxy: false, credentialMode: "optional", credentialLabel: "GitHub Personal Access Token", credentialPlaceholder: "github_pat_... / ghp_...", credentialUrl: "https://github.com/settings/tokens/new", defaultEnabled: false, defaultSelected: false, maxResults: 50 },
  bilibili: { provider: "bilibili", requiresProxy: false, credentialMode: "none", defaultEnabled: false, defaultSelected: false, maxResults: 20 },
  zhihu: { provider: "zhihu", requiresProxy: false, credentialMode: "none", defaultEnabled: false, defaultSelected: false, maxResults: 20 },
};

export type CatalogEngineId = keyof typeof engineCatalog;

export function supportsApiKey(id: CatalogEngineId): boolean {
  return engineCatalog[id].credentialMode !== "none";
}

export function engineApiKeySetting(id: CatalogEngineId): string {
  return `engine.${id}.apiKey`;
}
