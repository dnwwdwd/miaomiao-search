import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { engineIds, type EngineId } from "./domain.js";
import { DomainError } from "./domain.js";
import type { SearchService } from "./services/search.js";
import type { SettingsService } from "./services/settings.js";
import type { TokenService, VerifiedToken } from "./services/tokens.js";

export const mcpTools = [
  { id: "search", name: "search", description: "多引擎聚合搜索", parameters: "query, limit, engines, searchMode", scope: "search" as const },
  { id: "fetchWebContent", name: "fetchWebContent", description: "抓取通用网页正文", parameters: "url, maxChars", scope: "fetch" as const },
  { id: "fetchCsdnArticle", name: "fetchCsdnArticle", description: "读取 CSDN 文章正文", parameters: "url", scope: "fetch" as const, siteSpecific: true, host: "csdn.net" },
  { id: "fetchJuejinArticle", name: "fetchJuejinArticle", description: "读取掘金文章正文", parameters: "url", scope: "fetch" as const, siteSpecific: true, host: "juejin.cn" },
  { id: "fetchGithubReadme", name: "fetchGithubReadme", description: "读取 GitHub README", parameters: "url", scope: "fetch" as const, siteSpecific: true, host: "github.com" },
  { id: "fetchLinuxDoArticle", name: "fetchLinuxDoArticle", description: "读取 Linux.do 文章正文", parameters: "url", scope: "fetch" as const, siteSpecific: true, host: "linux.do" },
] as const;

export type McpToolState = Record<(typeof mcpTools)[number]["name"], boolean>;

export function getMcpTools(settings: SettingsService): McpToolState {
  const defaults = Object.fromEntries(mcpTools.map((tool) => [tool.name, tool.name !== "fetchLinuxDoArticle"])) as McpToolState;
  return { ...defaults, ...(settings.get<Partial<McpToolState>>("mcp.tools") ?? {}) };
}

export function createMcpServer(dependencies: { search: SearchService; tokens: TokenService; settings: SettingsService; token: VerifiedToken }): McpServer {
  const server = new McpServer({ name: "lazycat-search", version: "0.1.0" });
  const enabled = getMcpTools(dependencies.settings);
  const ensureScope = (scope: "search" | "fetch") => dependencies.tokens.verifyTokenContext(dependencies.token, scope, dependencies.settings.get<number>("rateLimit.mcp.rpm") ?? 60);

  if (enabled.search) {
    server.registerTool("search", {
      title: "Multi-engine search", description: "Search with the enabled public web engines.",
      inputSchema: z.object({ query: z.string().min(1).max(500), engines: z.array(z.enum(engineIds)).min(1).max(engineIds.length).optional(), limit: z.number().int().min(1).max(50).default(10), searchMode: z.enum(["auto", "request"]).optional() }),
    }, async ({ query, engines, limit, searchMode }) => {
      const release = ensureScope("search");
      try {
        const result = await dependencies.search.search({ query, engines: (engines ?? []) as EngineId[], limit, searchMode }, { channel: "mcp", tokenId: dependencies.token.id, tokenPrefix: dependencies.token.prefix });
        return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
      } finally { release(); }
    });
  }

  for (const tool of mcpTools.filter((item) => item.scope === "fetch" && enabled[item.name])) {
    server.registerTool(tool.name, {
      title: tool.name, description: tool.description,
      inputSchema: z.object({ url: z.string().url(), maxChars: z.number().int().min(1_000).max(200_000).optional() }),
    }, async ({ url, maxChars }) => {
      const release = ensureScope("fetch");
      try {
        if ("host" in tool) {
          const hostname = new URL(url).hostname.toLowerCase();
          if (hostname !== tool.host && !hostname.endsWith(`.${tool.host}`)) throw new DomainError("MCP_TOOL_URL_DENIED", `此 Tool 仅允许 ${tool.host} URL`);
        }
        const result = await dependencies.search.fetchContent(url, maxChars ?? 50_000, { channel: "mcp", tokenId: dependencies.token.id, tokenPrefix: dependencies.token.prefix });
        return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
      } finally { release(); }
    });
  }
  return server;
}
