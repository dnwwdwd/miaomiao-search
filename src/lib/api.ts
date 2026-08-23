import type { McpToken, McpTool, SearchEngine, SearchHistory, SettingsState, UsageLog } from "@/types/portal";

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

type ApiError = { error?: { code?: string; message?: string } };

export class ApiClientError extends Error { constructor(public readonly code: string, message: string) { super(message); } }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({})) as ApiError & T;
  if (!response.ok) throw new ApiClientError(body.error?.code ?? "REQUEST_FAILED", body.error?.message ?? "服务请求失败");
  return body as T;
}

const engineNames: Record<string, string> = { bing: "Bing", baidu: "Baidu", duckduckgo: "DuckDuckGo", exa: "Exa", brave: "Brave", csdn: "CSDN", juejin: "Juejin", startpage: "Startpage", sogou: "Sogou" };
const engineHealth = (value: string, enabled: boolean): SearchEngine["health"] => !enabled ? "Disabled" : value === "healthy" ? "Healthy" : value === "degraded" ? "Degraded" : value === "rate_limited" ? "Rate Limited" : value === "blocked" ? "Blocked" : value === "unavailable" ? "Unavailable" : "Unknown";
const tokenStatus = (value: string): McpToken["status"] => value === "active" ? "Active" : value === "disabled" ? "Disabled" : "Revoked";

export const api = {
  login: (username: string, password: string) => request<{ adminId: number }>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  me: () => request<{ adminId: number }>("/api/auth/me"),
  search: (input: { query: string; engines: string[]; limit: number; searchMode?: "auto" | "request" }) => request<{ results: Array<{ title: string; url: string; description: string; engines: string[] }>; failures: Array<{ engine: string; code: string; message: string }>; cached: boolean; requestId: string }>("/api/search", { method: "POST", body: JSON.stringify(input) }),
  fetchContent: (url: string, maxChars = 50_000) => request<{ content: { url: string; finalUrl: string; title: string; contentType: string; truncated: boolean; content: string }; cached: boolean }>("/api/fetch-content", { method: "POST", body: JSON.stringify({ url, maxChars }) }),
  engines: async (): Promise<SearchEngine[]> => (await request<{ engines: Array<Record<string, unknown>> }>("/api/engines")).engines.map((item) => ({ id: String(item.id), name: engineNames[String(item.id)] ?? String(item.id), enabled: Boolean(item.enabled), isDefault: Boolean(item.isDefault), mode: item.searchMode === "request" ? "Request" : item.searchMode === "auto" ? "Auto" : "—", health: engineHealth(String(item.status), Boolean(item.enabled)), latency: typeof item.latencyMs === "number" ? item.latencyMs : null, lastError: typeof item.lastError === "string" ? item.lastError : "—", lastTestAt: typeof item.lastTestAt === "string" ? item.lastTestAt : "—" })),
  updateEngine: (id: string, patch: object) => request(`/api/engines/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  testEngine: (id: string, query: string) => request<{ resultCount: number; latencyMs: number }>(`/api/engines/${id}/test`, { method: "POST", body: JSON.stringify({ query }) }),
  tokens: async (): Promise<McpToken[]> => (await request<{ tokens: Array<Record<string, unknown>> }>("/api/tokens")).tokens.map((item) => ({ id: String(item.id), name: String(item.name), prefix: String(item.prefix), scope: item.scope as McpToken["scope"], rpmLimit: typeof item.rpmLimit === "number" ? item.rpmLimit : 0, dailyLimit: typeof item.dailyLimit === "number" ? item.dailyLimit : 0, createdAt: String(item.createdAt), expiresAt: typeof item.expiresAt === "string" ? item.expiresAt : "—", lastUsedAt: typeof item.lastUsedAt === "string" ? item.lastUsedAt : "—", usageToday: 0, status: tokenStatus(String(item.status)) })),
  createToken: (input: object) => request<{ id: string; secret: string; prefix: string; expiresAt: string | null }>("/api/tokens", { method: "POST", body: JSON.stringify(input) }),
  updateToken: (id: string, status: string) => request(`/api/tokens/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  deleteToken: (id: string) => request(`/api/tokens/${id}`, { method: "DELETE" }),
  mcp: async (): Promise<McpTool[]> => (await request<{ tools: Array<Record<string, unknown>> }>("/api/mcp")).tools.map((item) => ({ id: String(item.id), name: String(item.name), description: String(item.description), parameters: String(item.parameters), enabled: Boolean(item.enabled), siteSpecific: Boolean(item.siteSpecific) })),
  updateMcpTools: (tools: Record<string, boolean>) => request("/api/mcp/tools", { method: "PUT", body: JSON.stringify(tools) }),
  settings: () => request<{ settings: SettingsState }>("/api/settings").then((value) => value.settings),
  updateSettings: (settings: SettingsState) => request<{ settings: SettingsState }>("/api/settings", { method: "PUT", body: JSON.stringify(settings) }).then((value) => value.settings),
  history: async (): Promise<SearchHistory[]> => (await request<{ history: Array<{ id: number; query: string; engines: string[]; resultCount: number; createdAt: string }> }>("/api/history")).history.map((item) => ({ id: String(item.id), query: item.query, engines: item.engines, count: item.resultCount, createdAt: item.createdAt })),
  clearHistory: () => request("/api/history", { method: "DELETE" }),
  usage: async (): Promise<{ logs: UsageLog[]; overview: { total: number; mcpToday: number; webToday: number; successful: number } }> => { const data = await request<{ overview: { total: number; mcpToday: number; webToday: number; successful: number }; logs: Array<Record<string, unknown>> }>("/api/usage"); return { overview: data.overview, logs: data.logs.map((item) => ({ id: String(item.id), channel: item.channel === "mcp" ? "MCP" : "Web", operation: String(item.operation), token: typeof item.tokenPrefix === "string" ? item.tokenPrefix : "—", engines: Array.isArray(item.engines) ? item.engines.map(String) : [], latency: Number(item.latencyMs), cacheHit: Boolean(item.cacheHit), resultCount: typeof item.resultCount === "number" ? item.resultCount : 0, status: item.status === "partial" ? "Partial" : item.status === "error" ? "Error" : "Success", errorCode: typeof item.errorCode === "string" ? item.errorCode : "—", createdAt: String(item.createdAt) })) }; },
};
