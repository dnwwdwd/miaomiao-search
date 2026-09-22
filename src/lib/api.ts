import type { McpToken, McpTool, PortalUser, SearchEngine, SearchEngineResultGroup, SearchHistory, SearchResult, SettingsState, UsageData, UsageQuery } from "@/types/portal";

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

type ApiError = { error?: { code?: string; message?: string } };

export class ApiClientError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode?: number) {
    super(message);
    this.name = "ApiClientError";
  }
}

const sessionErrorCodes = new Set(["SESSION_UNAUTHORIZED", "GATEWAY_USER_MISSING", "GATEWAY_USER_MISMATCH", "IDENTITY_NOT_FOUND"]);

function notifySessionExpired(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("miaomiao-search:session-expired"));
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({})) as ApiError & T;
  if (!response.ok) {
    const code = body.error?.code ?? "REQUEST_FAILED";
    if (sessionErrorCodes.has(code) && path !== "/api/auth/logout") notifySessionExpired();
    throw new ApiClientError(code, body.error?.message ?? "服务请求失败", response.status);
  }
  return body as T;
}

const engineNames: Record<string, string> = { bing: "Bing", baidu: "Baidu", duckduckgo: "DuckDuckGo", exa: "Exa", csdn: "CSDN", juejin: "Juejin", sogou: "Sogou", firecrawl: "Firecrawl", tavily: "Tavily", github: "GitHub", bilibili: "Bilibili", zhihu: "知乎" };
const engineHealth = (value: string, enabled: boolean): SearchEngine["health"] => !enabled ? "Disabled" : value === "healthy" ? "Healthy" : value === "degraded" ? "Degraded" : value === "rate_limited" ? "Rate Limited" : value === "blocked" ? "Blocked" : value === "unavailable" ? "Unavailable" : "Unknown";
const tokenStatus = (value: string): McpToken["status"] => value === "active" ? "Active" : value === "disabled" ? "Disabled" : "Revoked";

export const api = {
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  me: () => request<{ user: PortalUser }>("/api/auth/me").then((value) => value.user),
  localLogin: (account: string, password: string) => request<{ user: PortalUser }>("/api/auth/local/login", { method: "POST", body: JSON.stringify({ account, password }) }).then((value) => value.user),
  changePassword: (input: { currentPassword?: string; newPassword: string }) => request<{ ok: true; reloginRequired: true }>("/api/auth/password", { method: "PUT", body: JSON.stringify(input) }),
  search: (input: { query: string; engines: string[]; limit?: number; searchMode?: "auto" | "request" }) => request<{ results: Array<{ title: string; url: string; description: string; faviconUrl?: string; thumbnailUrl?: string; videoMeta?: SearchResult["videoMeta"]; engines: string[] }>; engineResults: Array<{ engine: string; limit: number; results: Array<{ title: string; url: string; description: string; faviconUrl?: string; thumbnailUrl?: string; videoMeta?: SearchResult["videoMeta"]; engines: string[] }>; cached: boolean; failure?: { engine: string; code: string; message: string } }>; resultCount: number; failures: Array<{ engine: string; code: string; message: string }>; cached: boolean; requestId: string }>("/api/search", { method: "POST", body: JSON.stringify(input) }),
  fetchContent: (url: string, maxChars = 50_000) => request<{ content: { url: string; finalUrl: string; title: string; contentType: string; truncated: boolean; content: string; retrievalMethod?: string; extractionMethod?: string; readabilityApplied?: boolean }; cached: boolean; requestId: string }>("/api/fetch-content", { method: "POST", body: JSON.stringify({ url, maxChars }) }),
  engines: async (): Promise<SearchEngine[]> => (await request<{ engines: Array<Record<string, unknown>> }>("/api/engines")).engines.map((item) => ({ id: String(item.id), name: engineNames[String(item.id)] ?? String(item.id), enabled: Boolean(item.enabled), isDefault: Boolean(item.isDefault), mode: item.searchMode === "request" ? "Request" : item.searchMode === "auto" ? "Auto" : "—", resultLimit: typeof item.resultLimit === "number" ? item.resultLimit : null, health: engineHealth(String(item.status), Boolean(item.enabled)), latency: typeof item.latencyMs === "number" ? item.latencyMs : null, lastError: typeof item.lastError === "string" ? item.lastError : "—", lastTestAt: typeof item.lastTestAt === "string" ? item.lastTestAt : "—", requiresProxy: Boolean(item.requiresProxy), requiresApiKey: Boolean(item.requiresApiKey), supportsApiKey: Boolean(item.supportsApiKey ?? item.requiresApiKey), apiKeyOptional: Boolean(item.apiKeyOptional), apiKeyConfigured: Boolean(item.apiKeyConfigured), credentialLabel: typeof item.credentialLabel === "string" ? item.credentialLabel : undefined, credentialPlaceholder: typeof item.credentialPlaceholder === "string" ? item.credentialPlaceholder : undefined, credentialUrl: typeof item.credentialUrl === "string" ? item.credentialUrl : undefined, maxResults: typeof item.maxResults === "number" ? item.maxResults : 50 })),
  updateEngine: (id: string, patch: object) => request(`/api/engines/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  testEngine: (id: string, query: string) => request<{ resultCount: number; latencyMs: number; failure?: { code: string; message: string } }>(`/api/engines/${id}/test`, { method: "POST", body: JSON.stringify({ query }) }),
  tokens: async (): Promise<McpToken[]> => (await request<{ tokens: Array<Record<string, unknown>> }>("/api/tokens")).tokens.map((item) => ({ id: String(item.id), name: String(item.name), prefix: String(item.prefix), scope: item.scope as McpToken["scope"], rpmLimit: typeof item.rpmLimit === "number" ? item.rpmLimit : null, dailyLimit: typeof item.dailyLimit === "number" ? item.dailyLimit : null, createdAt: String(item.createdAt), expiresAt: typeof item.expiresAt === "string" ? item.expiresAt : "—", lastUsedAt: typeof item.lastUsedAt === "string" ? item.lastUsedAt : "—", usageToday: typeof item.usageToday === "number" ? item.usageToday : 0, status: tokenStatus(String(item.status)) })),
  createToken: (input: object) => request<{ id: string; secret: string; prefix: string; expiresAt: string | null }>("/api/tokens", { method: "POST", body: JSON.stringify(input) }),
  updateToken: (id: string, status: string) => request(`/api/tokens/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  deleteToken: (id: string) => request(`/api/tokens/${id}`, { method: "DELETE" }),
  mcp: async (): Promise<McpTool[]> => (await request<{ tools: Array<Record<string, unknown>> }>("/api/mcp")).tools.map((item) => ({ id: String(item.id), name: String(item.name), description: String(item.description), parameters: String(item.parameters), enabled: Boolean(item.enabled), siteSpecific: Boolean(item.siteSpecific) })),
  updateMcpTools: (tools: Record<string, boolean>) => request("/api/mcp/tools", { method: "PUT", body: JSON.stringify(tools) }),
  settings: () => request<{ settings: SettingsState }>("/api/settings").then((value) => value.settings),
  updateSettings: (settings: SettingsState) => request<{ settings: SettingsState }>("/api/settings", { method: "PUT", body: JSON.stringify(settings) }).then((value) => value.settings),
  history: async (): Promise<SearchHistory[]> => (await request<{ history: Array<{ id: number; query: string; engines: string[]; resultCount: number; snapshot: { results: Array<{ title: string; url: string; description: string; faviconUrl?: string; thumbnailUrl?: string; videoMeta?: SearchResult["videoMeta"]; engines: string[] }>; failures: Array<{ engine: string; code: string; message: string }>; engineResults?: Array<{ engine: string; limit: number; results: Array<{ title: string; url: string; description: string; faviconUrl?: string; thumbnailUrl?: string; videoMeta?: SearchResult["videoMeta"]; engines: string[] }>; cached: boolean; failure?: { engine: string; code: string; message: string } }> } | null; createdAt: string }> }>("/api/history")).history.map((item) => { const mapResults = (results: Array<{ title: string; url: string; description: string; faviconUrl?: string; thumbnailUrl?: string; videoMeta?: SearchResult["videoMeta"]; engines: string[] }>, prefix: string) => results.map((result, index) => ({ id: `${prefix}-${index}`, ...result })); const engineResults: SearchEngineResultGroup[] = (item.snapshot?.engineResults ?? []).map((group) => ({ engine: group.engine, limit: group.limit, cached: group.cached, failure: group.failure, results: mapResults(group.results, `${item.id}-${group.engine}`) })); return { id: String(item.id), query: item.query, engines: item.engines, count: item.resultCount, results: mapResults(item.snapshot?.results ?? [], String(item.id)), engineResults, failures: item.snapshot?.failures ?? [], createdAt: item.createdAt }; }),
  clearHistory: () => request("/api/history", { method: "DELETE" }),
  usage: async (query?: Partial<UsageQuery>): Promise<UsageData> => {
    const now = new Date();
    const requestQuery = { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000).toISOString(), to: now.toISOString(), channel: "all" as const, status: "all" as const, page: 1, pageSize: 20, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai", ...query };
    const params = new URLSearchParams({ from: requestQuery.from, to: requestQuery.to, channel: requestQuery.channel, status: requestQuery.status, page: String(requestQuery.page), pageSize: String(requestQuery.pageSize), timeZone: requestQuery.timeZone });
    if (requestQuery.operation) params.set("operation", requestQuery.operation);
    if (requestQuery.engine) params.set("engine", requestQuery.engine);
    const data = await request<{ range: UsageData["range"]; summary: UsageData["summary"]; channels: UsageData["channels"]; series: UsageData["series"]; operations: UsageData["operations"]; engines: UsageData["engines"]; facets: UsageData["facets"]; pagination: UsageData["pagination"]; logs: Array<Record<string, unknown>> }>(`/api/usage?${params.toString()}`);
    return { ...data, logs: data.logs.map((item) => ({ id: String(item.id), channel: item.channel === "mcp" ? "MCP" : "Web", operation: String(item.operation), token: typeof item.tokenPrefix === "string" ? item.tokenPrefix : "—", engines: Array.isArray(item.engines) ? item.engines.map(String) : [], latency: Number(item.latencyMs), cacheHit: Boolean(item.cacheHit), resultCount: typeof item.resultCount === "number" ? item.resultCount : 0, status: item.status === "partial" ? "Partial" : item.status === "error" ? "Error" : "Success", errorCode: typeof item.errorCode === "string" ? item.errorCode : "—", createdAt: String(item.createdAt) })) };
  },
};
