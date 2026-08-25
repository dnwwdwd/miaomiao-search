import type { McpToken, McpTool, SearchEngine, SearchHistory, SearchResult, SettingsState, UsageLog } from "@/types/portal";

export const initialEngines: SearchEngine[] = [
  { id: "bing", name: "Bing", enabled: true, isDefault: true, mode: "Auto", resultLimit: null, health: "Healthy", latency: 210, lastError: "—", lastTestAt: "2026-08-23 16:02", requiresProxy: false, requiresApiKey: false, apiKeyConfigured: false },
  { id: "baidu", name: "Baidu", enabled: true, isDefault: false, mode: "—", resultLimit: 20, health: "Degraded", latency: 870, lastError: "部分结果缺失", lastTestAt: "2026-08-23 15:58", requiresProxy: false, requiresApiKey: false, apiKeyConfigured: false },
  { id: "duckduckgo", name: "DuckDuckGo", enabled: true, isDefault: true, mode: "—", resultLimit: null, health: "Healthy", latency: 256, lastError: "—", lastTestAt: "2026-08-23 16:02", requiresProxy: true, requiresApiKey: false, apiKeyConfigured: false },
  { id: "sogou", name: "Sogou", enabled: true, isDefault: false, mode: "—", resultLimit: 5, health: "Rate Limited", latency: 0, lastError: "HTTP 429", lastTestAt: "2026-08-23 15:55", requiresProxy: false, requiresApiKey: false, apiKeyConfigured: false },
  { id: "exa", name: "Exa", enabled: true, isDefault: false, mode: "—", resultLimit: 10, health: "Blocked", latency: 0, lastError: "上游拒绝连接", lastTestAt: "2026-08-23 15:51", requiresProxy: false, requiresApiKey: true, apiKeyConfigured: false },
  { id: "csdn", name: "CSDN", enabled: true, isDefault: false, mode: "—", resultLimit: 10, health: "Unknown", latency: null, lastError: "尚未测试", lastTestAt: "—", requiresProxy: false, requiresApiKey: false, apiKeyConfigured: false },
  { id: "juejin", name: "Juejin", enabled: false, isDefault: false, mode: "—", resultLimit: null, health: "Disabled", latency: null, lastError: "管理员已停用", lastTestAt: "2026-08-22 18:10", requiresProxy: false, requiresApiKey: false, apiKeyConfigured: false },
];

export const initialResults: SearchResult[] = [
  { id: "r-1", title: "Open-WebSearch：自托管多引擎搜索服务", url: "https://github.com/open-websearch/open-websearch", description: "面向自托管场景的搜索聚合和网页正文提取工具，支持多源结果去重。", engines: ["Bing", "DuckDuckGo"] },
  { id: "r-2", title: "如何设计可维护的 MCP 搜索工具", url: "https://example.org/guides/mcp-search-tools", description: "从 Token 鉴权、限流、审计日志和内容抓取安全边界讲解 MCP 服务设计。", engines: ["Baidu", "Bing"] },
  { id: "r-3", title: "自托管搜索服务的缓存与观测实践", url: "https://example.net/notes/search-cache-observability", description: "介绍搜索结果缓存、正文缓存和按引擎统计的基础实现方法。", engines: ["DuckDuckGo", "Bing"] },
];

export const initialHistory: SearchHistory[] = [
  { id: "h-1", query: "Open-WebSearch MCP", engines: ["Bing", "DuckDuckGo"], count: 12, results: [], engineResults: [], failures: [], createdAt: "今天 15:42" },
  { id: "h-2", query: "自托管联网搜索", engines: ["Baidu", "Bing"], count: 8, results: [], engineResults: [], failures: [], createdAt: "昨天 11:16" },
  { id: "h-3", query: "网页正文提取 SSRF", engines: ["Bing"], count: 5, results: [], engineResults: [], failures: [], createdAt: "8 月 21 日" },
];

export const initialTools: McpTool[] = [
  { id: "search", name: "search", description: "多引擎分组与聚合搜索", parameters: "query, limit?, engines, searchMode", enabled: true },
  { id: "fetchWebContent", name: "fetchWebContent", description: "抓取通用网页正文", parameters: "url, maxChars", enabled: true },
  { id: "fetchCsdnArticle", name: "fetchCsdnArticle", description: "读取 CSDN 文章正文", parameters: "url", enabled: true, siteSpecific: true },
  { id: "fetchJuejinArticle", name: "fetchJuejinArticle", description: "读取掘金文章正文", parameters: "url", enabled: true, siteSpecific: true },
  { id: "fetchGithubReadme", name: "fetchGithubReadme", description: "读取 GitHub README", parameters: "url", enabled: true, siteSpecific: true },
  { id: "fetchLinuxDoArticle", name: "fetchLinuxDoArticle", description: "读取 Linux.do 文章", parameters: "url", enabled: false, siteSpecific: true },
];

export const initialTokens: McpToken[] = [
  { id: "tk-1", name: "Claude Code / Team", prefix: "ows_38Af…", scope: "all", rpmLimit: 60, dailyLimit: 5000, createdAt: "2026-08-01 09:25", expiresAt: "2026-11-01 09:25", lastUsedAt: "今天 16:01", usageToday: 642, status: "Active" },
  { id: "tk-2", name: "Research workflow", prefix: "ows_A8dK…", scope: "search", rpmLimit: 30, dailyLimit: 2000, createdAt: "2026-07-18 14:10", expiresAt: "永不过期", lastUsedAt: "昨天 18:22", usageToday: 128, status: "Disabled" },
  { id: "tk-3", name: "Old automation", prefix: "ows_B7fP…", scope: "fetch", rpmLimit: 20, dailyLimit: 1000, createdAt: "2026-06-11 11:05", expiresAt: "2026-08-11 11:05", lastUsedAt: "已撤销", usageToday: 0, status: "Revoked" },
];

export const initialUsageLogs: UsageLog[] = [
  { id: "req_01HZYKX8", channel: "MCP", operation: "search", token: "ows_38Af…", engines: ["Bing", "DuckDuckGo"], latency: 384, cacheHit: false, resultCount: 10, status: "Success", errorCode: "—", createdAt: "2026-08-23 16:12:09" },
  { id: "req_01HZYKX7", channel: "Web", operation: "fetchWebContent", token: "—", engines: [], latency: 612, cacheHit: true, resultCount: 1, status: "Success", errorCode: "—", createdAt: "2026-08-23 16:08:51" },
  { id: "req_01HZYKX6", channel: "MCP", operation: "search", token: "ows_38Af…", engines: ["DuckDuckGo", "Bing"], latency: 1050, cacheHit: false, resultCount: 8, status: "Partial", errorCode: "ENGINE_RATE_LIMIT", createdAt: "2026-08-23 15:56:20" },
  { id: "req_01HZYKX5", channel: "Web", operation: "search", token: "—", engines: ["Baidu"], latency: 0, cacheHit: false, resultCount: 0, status: "Error", errorCode: "PROXY_CONNECT_FAILED", createdAt: "2026-08-23 15:49:02" },
  { id: "req_01HZYKX4", channel: "MCP", operation: "fetchGithubReadme", token: "ows_A8dK…", engines: [], latency: 326, cacheHit: true, resultCount: 1, status: "Success", errorCode: "—", createdAt: "2026-08-23 15:37:46" },
  { id: "req_01HZYKX2", channel: "Web", operation: "search", token: "—", engines: ["Sogou"], latency: 0, cacheHit: false, resultCount: 0, status: "Error", errorCode: "ENGINE_RATE_LIMIT", createdAt: "2026-08-23 15:12:35" },
];

export const initialSettings: SettingsState = { proxyEnabled: true, proxyUrl: "http://admin:••••••••@10.0.0.5:7890", searchCacheEnabled: true, contentCacheEnabled: true, searchTtl: 3600, contentTtl: 86400, cacheMaxSize: 1000, webRpm: 30, mcpRpm: 60, engineConcurrency: 3, defaultLimit: 10, homeEngines: [], homeRequestLimit: null, homeBingMode: "request", historyEnabled: true, historyRetentionDays: 30, logFullQuery: false };

export const clientTemplates: Record<string, string> = {
  "WorkBuddy": `{
  "mcpServers": {
    "lazycat-search": {
      "url": "https://search.example.com/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_ACCESS_TOKEN>"
      }
    }
  }
}`,
  "Cherry Studio": `{
  "mcpServers": [
    {
      "name": "lazycat-search",
      "type": "streamable-http",
      "url": "https://search.example.com/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_ACCESS_TOKEN>"
      }
    }
  ]
}`,
  "Claude Code": `claude mcp add --transport http lazycat-search https://search.example.com/mcp --header "Authorization: Bearer <YOUR_ACCESS_TOKEN>"`,
  "Codex / Cursor": `{
  "lazycat-search": {
    "command": "npx",
    "args": [
      "mcp-remote",
      "https://search.example.com/mcp"
    ],
    "env": {
      "AUTHORIZATION": "Bearer <YOUR_ACCESS_TOKEN>"
    }
  }
}`,
  "Generic": `curl https://search.example.com/mcp -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>"`,
};
