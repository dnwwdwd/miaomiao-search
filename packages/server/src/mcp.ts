import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { engineIds, type EngineId } from "./domain.js";
import { DomainError } from "./domain.js";
import type { SearchService, SiteFetchToolName } from "./services/search.js";
import type { SettingsService } from "./services/settings.js";
import type { AuditService } from "./services/audit.js";
import type { VerifiedToken } from "./services/tokens.js";
import { WechatContentService, type WechatSource } from "./services/wechat-content.js";

export const mcpTools = [
  { id: "search", name: "search", description: "多引擎分组与聚合搜索", parameters: "query, limit?, engines, searchMode", scope: "search" as const },
  { id: "searchWechatArticles", name: "searchWechatArticles", description: "搜索微信公众号文章：搜狗微信搜索或今天看啥镜像发现文章并还原直链", parameters: "query, limit?, source", scope: "search" as const },
  { id: "fetchWebContent", name: "fetchWebContent", description: "按链接自动抓取：小红书帖子、飞书文档、微信公众号文章和编程导航文章使用专用抓取器，其他网页使用通用正文读取器", parameters: "url, maxChars", scope: "fetch" as const },
  { id: "fetchPlatformContent", name: "fetchPlatformContent", description: "输入小红书帖子、飞书文档、微信公众号或编程导航文章链接，自动识别平台并返回 Markdown 正文、作者和媒体链接", parameters: "url, maxChars", scope: "fetch" as const },
  { id: "fetchWechatArticle", name: "fetchWechatArticle", description: "读取微信公众号文章正文", parameters: "url, maxChars", scope: "fetch" as const, siteSpecific: true, host: "mp.weixin.qq.com" },
  { id: "fetchCodefatherArticle", name: "fetchCodefatherArticle", description: "读取编程导航 (codefather.cn) 文章完整 Markdown 正文", parameters: "url", scope: "fetch" as const, siteSpecific: true, host: "codefather.cn" },
  { id: "fetchCsdnArticle", name: "fetchCsdnArticle", description: "读取 CSDN 文章正文", parameters: "url", scope: "fetch" as const, siteSpecific: true, host: "csdn.net" },
  { id: "fetchJuejinArticle", name: "fetchJuejinArticle", description: "读取掘金文章正文", parameters: "url", scope: "fetch" as const, siteSpecific: true, host: "juejin.cn" },
  { id: "fetchGithubReadme", name: "fetchGithubReadme", description: "读取 GitHub README", parameters: "url", scope: "fetch" as const, siteSpecific: true, host: "github.com" },
  { id: "fetchLinuxDoArticle", name: "fetchLinuxDoArticle", description: "读取 Linux.do 文章正文", parameters: "url", scope: "fetch" as const, siteSpecific: true, host: "linux.do" },
] as const;

export type McpToolState = Record<(typeof mcpTools)[number]["name"], boolean>;

export type McpAuthorization = {
  token?: VerifiedToken;
  ensureScope: (scope: "search" | "fetch") => () => void;
};

export function getMcpTools(settings: SettingsService): McpToolState {
  const defaults = Object.fromEntries(mcpTools.map((tool) => [tool.name, tool.name !== "fetchLinuxDoArticle"])) as McpToolState;
  return { ...defaults, ...(settings.get<Partial<McpToolState>>("mcp.tools") ?? {}) };
}

export function createMcpServer(dependencies: { search: SearchService; settings: SettingsService; authorization: McpAuthorization; getEnabledEngines: () => EngineId[]; audit?: AuditService }): McpServer {
  const server = new McpServer({ name: "miaomiao-search", version: "0.1.0" });
  const enabled = getMcpTools(dependencies.settings);
  const tokenContext = { tokenId: dependencies.authorization.token?.id, tokenPrefix: dependencies.authorization.token?.prefix };

  if (enabled.search) {
    const enabledEngineIds = currentEnabledEngineIds(dependencies.getEnabledEngines());
    const engineEnum = enabledEngineIds.length ? z.enum(enabledEngineIds as [EngineId, ...EngineId[]]) : z.never();
    const engineSelection = enabledEngineIds.length
      ? z.array(engineEnum).min(1).max(enabledEngineIds.length).optional()
      : z.array(engineEnum).max(0).optional();
    server.registerTool("search", {
      title: "Multi-engine search", description: enabledEngineIds.length
        ? `Search with currently enabled search sources: ${enabledEngineIds.join(", ")}. Omit engines to use the current MCP order.`
        : "No search source is currently enabled. Enable at least one source before calling search.",
      inputSchema: z.object({ query: z.string().min(1).max(500), engines: engineSelection, limit: z.number().int().min(1).max(50).optional(), searchMode: z.enum(["auto", "request"]).optional() }),
    }, async ({ query, engines, limit, searchMode }) => {
      const release = dependencies.authorization.ensureScope("search");
      try {
        const result = await dependencies.search.search({ query, engines: (engines ?? []) as EngineId[], limit, searchMode }, { channel: "mcp", ...tokenContext });
        return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
      } finally { release(); }
    });

    if (enabled.searchWechatArticles) {
      const wechat = new WechatContentService();
      server.registerTool("searchWechatArticles", {
        title: "WeChat article discovery",
        description: "Discover WeChat Official Account articles by keyword via Sogou WeChat search, or enumerate a jintiankansha.me column. Returns titles, accounts, dates and resolved mp.weixin.qq.com links.",
        inputSchema: z.object({ query: z.string().min(1).max(500), limit: z.number().int().min(1).max(20).optional(), source: z.enum(["sogou", "mirror"]).optional() }),
      }, async ({ query, limit, source }) => {
        const release = dependencies.authorization.ensureScope("search");
        const startedAt = Date.now();
        try {
          const result = await wechat.searchArticles({ query, limit: limit ?? 10, source: (source ?? "sogou") as WechatSource });
          dependencies.audit?.record({ channel: "mcp", operation: "searchWechatArticles", tokenId: tokenContext.tokenId, tokenPrefix: tokenContext.tokenPrefix, query, latencyMs: Date.now() - startedAt, cacheHit: false, resultCount: result.items.filter((item) => item.resolved).length, status: result.failure ? "partial" : "success", errorCode: result.failure?.code });
          return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
        } catch (error) {
          dependencies.audit?.record({ channel: "mcp", operation: "searchWechatArticles", tokenId: tokenContext.tokenId, tokenPrefix: tokenContext.tokenPrefix, query, latencyMs: Date.now() - startedAt, cacheHit: false, status: "error", errorCode: error instanceof DomainError ? error.code : "SEARCH_FAILED" });
          throw error;
        } finally { release(); }
      });
    }
  }

  for (const tool of mcpTools.filter((item) => item.scope === "fetch" && enabled[item.name])) {
    server.registerTool(tool.name, {
      title: tool.name, description: tool.description,
      inputSchema: z.object({ url: z.string().url(), maxChars: z.number().int().min(1_000).max(200_000).optional() }),
    }, async ({ url, maxChars }) => {
      const release = dependencies.authorization.ensureScope("fetch");
      try {
        if ("host" in tool) {
          const hostname = new URL(url).hostname.toLowerCase();
          if (hostname !== tool.host && !hostname.endsWith(`.${tool.host}`)) throw new DomainError("MCP_TOOL_URL_DENIED", `此 Tool 仅允许 ${tool.host} URL`);
        }
        const result = tool.name === "fetchWebContent"
          ? await dependencies.search.fetchContent(url, maxChars ?? 50_000, { channel: "mcp", ...tokenContext })
          : tool.name === "fetchPlatformContent" || tool.name === "fetchWechatArticle"
            ? await dependencies.search.fetchPlatformContent(url, maxChars ?? 50_000, { channel: "mcp", ...tokenContext })
            : await dependencies.search.fetchSiteContent(tool.name as SiteFetchToolName, url, maxChars ?? 50_000, { channel: "mcp", ...tokenContext });
        return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
      } finally { release(); }
    });
  }
  return server;
}

function currentEnabledEngineIds(value: EngineId[]): EngineId[] {
  const enabled = [...new Set(value.filter((id): id is EngineId => engineIds.includes(id)))];
  return enabled;
}
