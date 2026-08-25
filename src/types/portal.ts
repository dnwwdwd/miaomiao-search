export type Locale = "zh" | "en";
export type ServiceStatus = "checking" | "online" | "offline";
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
  resultLimit: number | null;
  health: EngineHealth;
  latency: number | null;
  lastError: string;
  lastTestAt: string;
  requiresProxy: boolean;
  requiresApiKey: boolean;
  apiKeyConfigured: boolean;
};

export type SearchResult = { id: string; title: string; url: string; description: string; faviconUrl?: string; engines: string[] };
export type SearchFailure = { engine: string; code: string; message: string };
export type SearchEngineResultGroup = { engine: string; limit: number; results: SearchResult[]; cached: boolean; failure?: SearchFailure };
export type SearchHistory = { id: string; query: string; engines: string[]; count: number; results: SearchResult[]; engineResults: SearchEngineResultGroup[]; failures: SearchFailure[]; createdAt: string };
export type McpToken = { id: string; name: string; prefix: string; scope: "all" | "search" | "fetch"; rpmLimit: number; dailyLimit: number; createdAt: string; expiresAt: string; lastUsedAt: string; usageToday: number; status: TokenStatus };
export type McpTool = { id: string; name: string; description: string; parameters: string; enabled: boolean; siteSpecific?: boolean };
export type UsageLog = { id: string; channel: "Web" | "MCP"; operation: string; token: string; engines: string[]; latency: number; cacheHit: boolean; resultCount: number; status: "Success" | "Partial" | "Error"; errorCode: string; createdAt: string };
export type UsageQuery = { from: string; to: string; channel: "all" | "web" | "mcp"; operation?: string; status: "all" | "success" | "partial" | "error"; engine?: string; page: number; pageSize: number; timeZone: string };
export type UsageData = {
  range: { from: string; to: string; timeZone: string; bucket: "hour" | "day" };
  summary: { total: number; success: number; partial: number; errors: number; cacheHits: number; avgLatencyMs: number; p95LatencyMs: number; avgResultCount: number };
  channels: { web: number; mcp: number };
  series: Array<{ bucket: string; total: number; web: number; mcp: number; success: number; partial: number; errors: number; cacheHits: number; avgLatencyMs: number; avgResultCount: number }>;
  operations: Array<{ name: string; count: number; avgLatencyMs: number }>;
  engines: Array<{ engine: string; calls: number; success: number; cacheHits: number; avgLatencyMs: number; avgResultCount: number }>;
  facets: { operations: string[]; engines: string[] };
  logs: UsageLog[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};
export type SettingsState = { proxyEnabled: boolean; proxyUrl: string; searchCacheEnabled: boolean; contentCacheEnabled: boolean; searchTtl: number; contentTtl: number; cacheMaxSize: number; webRpm: number; mcpRpm: number; engineConcurrency: number; defaultLimit: number; homeEngines: string[]; homeRequestLimit: number | null; homeBingMode: "auto" | "request"; historyEnabled: boolean; historyRetentionDays: number; logFullQuery: boolean };
