export type Locale = "zh" | "en";
export type PortalTab = "search" | "mcp" | "engines" | "usage" | "settings";
export type EngineHealth = "Healthy" | "Degraded" | "Rate Limited" | "Blocked" | "Unavailable" | "Disabled" | "Unknown";
export type TokenStatus = "Active" | "Disabled" | "Revoked";
export type SearchScenario = "success" | "empty" | "partial" | "timeout" | "rate_limited" | "proxy" | "runtime" | "failed";
export type ReaderScenario = "success" | "blocked" | "dns" | "redirect" | "tls" | "extract" | "timeout" | "refused";

export type SearchEngine = {
  id: string;
  name: string;
  enabled: boolean;
  isDefault: boolean;
  mode: "Auto" | "Request" | "—";
  health: EngineHealth;
  latency: number | null;
  lastError: string;
  lastTestAt: string;
};

export type SearchResult = { id: string; title: string; url: string; description: string; engines: string[] };
export type SearchHistory = { id: string; query: string; engines: string[]; count: number; createdAt: string };
export type McpToken = { id: string; name: string; prefix: string; scope: "all" | "search" | "fetch"; rpmLimit: number; dailyLimit: number; createdAt: string; expiresAt: string; lastUsedAt: string; usageToday: number; status: TokenStatus };
export type McpTool = { id: string; name: string; description: string; parameters: string; enabled: boolean; siteSpecific?: boolean };
export type UsageLog = { id: string; channel: "Web" | "MCP"; operation: string; token: string; engines: string[]; latency: number; cacheHit: boolean; resultCount: number; status: "Success" | "Partial" | "Error"; errorCode: string; createdAt: string };
export type SettingsState = { proxyEnabled: boolean; proxyUrl: string; searchCacheEnabled: boolean; contentCacheEnabled: boolean; searchTtl: number; contentTtl: number; cacheMaxSize: number; webRpm: number; mcpRpm: number; engineConcurrency: number; defaultLimit: number; historyEnabled: boolean; historyRetentionDays: number; logFullQuery: boolean };
