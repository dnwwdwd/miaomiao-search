export type EngineRequirement = "proxy" | "apiKey";

export const engineCatalog = {
  bing: { requiresProxy: false, requiresApiKey: false },
  baidu: { requiresProxy: false, requiresApiKey: false },
  duckduckgo: { requiresProxy: true, requiresApiKey: false },
  exa: { requiresProxy: false, requiresApiKey: true },
  csdn: { requiresProxy: false, requiresApiKey: false },
  juejin: { requiresProxy: false, requiresApiKey: false },
  sogou: { requiresProxy: false, requiresApiKey: false },
} as const;

export type CatalogEngineId = keyof typeof engineCatalog;

export function engineApiKeySetting(id: CatalogEngineId): string {
  return `engine.${id}.apiKey`;
}
