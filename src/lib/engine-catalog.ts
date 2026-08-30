export type EngineCatalogEntry = {
  id: string;
  name: string;
  iconUrl: string;
  tagClass: string;
};

export const engineCatalog: Record<string, EngineCatalogEntry> = {
  bing: { id: "bing", name: "Bing", iconUrl: "https://www.bing.com/favicon.ico", tagClass: "engine-tag-bing" },
  baidu: { id: "baidu", name: "Baidu", iconUrl: "https://www.baidu.com/favicon.ico", tagClass: "engine-tag-baidu" },
  duckduckgo: { id: "duckduckgo", name: "DuckDuckGo", iconUrl: "/engine-icons/duckduckgo.png", tagClass: "engine-tag-duckduckgo" },
  exa: { id: "exa", name: "Exa", iconUrl: "https://exa.ai/favicon.ico", tagClass: "engine-tag-exa" },
  csdn: { id: "csdn", name: "CSDN", iconUrl: "https://www.csdn.net/favicon.ico", tagClass: "engine-tag-csdn" },
  juejin: { id: "juejin", name: "Juejin", iconUrl: "https://juejin.cn/favicon.ico", tagClass: "engine-tag-juejin" },
  sogou: { id: "sogou", name: "Sogou", iconUrl: "https://www.sogou.com/favicon.ico", tagClass: "engine-tag-sogou" },
};

export function getEngineMeta(value: string): EngineCatalogEntry {
  const normalized = value.toLowerCase();
  return Object.values(engineCatalog).find((engine) => engine.id === normalized || engine.name.toLowerCase() === normalized) ?? {
    id: value,
    name: value,
    iconUrl: "",
    tagClass: "engine-tag-unknown",
  };
}
