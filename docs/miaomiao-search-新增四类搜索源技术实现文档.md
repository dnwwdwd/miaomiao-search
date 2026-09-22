# 喵喵搜索新增 Firecrawl、Tavily、GitHub、B站搜索源技术实现文档

文档版本：v1.0
编写日期：2026-08-31
目标仓库：`https://github.com/dnwwdwd/miaomiao-search`
交付对象：Codex
实现状态：待开发

## 1. 目标与范围

本次在喵喵搜索中新增四个搜索源：

- `firecrawl`：通过 Firecrawl Search API 搜索公开网页。
- `tavily`：通过 Tavily Search API 搜索公开网页。
- `github`：通过官方 `@octokit/rest` SDK 搜索 GitHub 公共仓库。
- `bilibili`：通过 Bilibili Web 搜索接口搜索视频。

四个搜索源同时接入现有 Web 搜索和 MCP `search` Tool，继续使用当前的分组结果、聚合结果、缓存、历史记录、审计、单引擎测试和部分失败契约。

V1 只实现搜索：

- Firecrawl 不接管 `fetchWebContent`，不启用 Search API 的网页正文抓取参数。
- Tavily 不启用 Answer、Extract、Crawl、Raw Content。
- GitHub 只搜索公共仓库，不搜索代码、Issue、PR、用户和私有仓库。
- B站只搜索视频，不读取字幕、评论、弹幕、用户空间和登录态数据。
- 不新增独立的 `searchGithub`、`searchBilibili` MCP Tool。
- 不 fork `open-websearch`。
- 不接入第三方 B站中转 API。
- 不改 SQLite 表结构，不新增数据库迁移。

## 2. 当前代码结构与受影响边界

仓库当前有以下实现特征：

- 后端是 Fastify + TypeScript，运行在 `packages/server`。
- 搜索引擎 ID 在 `packages/server/src/domain.ts` 中以闭合数组定义。
- `SearchService` 通过 Provider Registry 调度搜索；六个旧引擎和正文抓取继续使用 `OpenWebSearchClient`，Exa、Firecrawl、Tavily、GitHub、B站由 Fastify Provider 直接访问固定 Endpoint。
- 每位懒猫用户有独立 SQLite、`SettingsService`、缓存、审计、Token 和 `SearchService`；Exa、Firecrawl、Tavily、GitHub 凭据从当前用户加密设置读取。
- API Key 保存于用户自己的 `setting` 表，并由 `SettingsService` 使用 AES-256-GCM 加密。
- `engine` 表的主键是文本，新增引擎只需要插入新行。
- MCP `search` Tool 根据当前启用的 `engineIds` 动态生成参数枚举。
- 前端有独立的引擎目录、引擎管理页和 API 类型。

现有结构允许在 Fastify 内增加搜索 Provider，同时保留 Open-WebSearch daemon。正文抓取继续走原链路，四个新搜索源直接由 Fastify 调用外部服务。

## 3. 已确定的技术方案

### 3.1 Provider Registry

在 `packages/server/src/providers/` 新增统一 Provider 层。

```text
Web / MCP
    |
    v
SearchService
    |
    v
SearchProviderRegistry
    |
    +-- OpenWebSearchProvider
    |     +-- Bing
    |     +-- Baidu
    |     +-- DuckDuckGo
    |     +-- CSDN
    |     +-- Juejin
    |     +-- Sogou
    |
    +-- FirecrawlProvider
    +-- TavilyProvider
    +-- ExaProvider
    +-- GitHubProvider
    +-- BilibiliProvider

fetchWebContent / 站点正文 Tool
    |
    v
OpenWebSearchClient
```

`SearchService` 只负责：

- 解析本次搜索使用的引擎。
- 计算每个引擎的有效返回数量。
- 并发调度 Provider。
- 读写缓存。
- 汇总分组结果和聚合结果。
- 记录历史与审计。
- 保留部分失败语义。

Provider 负责：

- 读取本用户的凭据。
- 组装请求。
- 控制单次请求超时和响应体大小。
- 校验上游响应。
- 映射为统一 `SearchResult`。
- 把上游状态转成稳定错误码。
- 清理 HTML 标签和无效 URL。

### 3.2 Provider 接口

新增 `packages/server/src/providers/types.ts`：

```ts
import type { EngineId, SearchMode, SearchResult } from "../domain.js";

export type ProviderSearchInput = {
  query: string;
  limit: number;
  searchMode?: SearchMode;
};

export type ProviderSearchResponse = {
  results: SearchResult[];
  failures: Array<{
    code: string;
    message: string;
  }>;
};

export interface SearchProvider {
  readonly engine: EngineId;
  readonly maxResults: number;
  readonly cacheVersion: string;

  search(input: ProviderSearchInput): Promise<ProviderSearchResponse>;
}
```

实现要求：

- Provider 实例按用户创建，构造函数可持有当前用户的 `SettingsService`。
- 每次请求时读取 API Key，保存或清除密钥后立即生效。
- Provider 不把 API Key 缓存在模块级变量。
- `cacheVersion` 用于字段映射变化后的缓存失效，例如 `firecrawl-v1`。
- 旧引擎由 `OpenWebSearchProvider` 适配，原 `OpenWebSearchClient` 继续复用。
- 正文抓取方法不放进 `SearchProvider`，继续由 `SearchService` 持有 `OpenWebSearchClient`。

新增 `packages/server/src/providers/registry.ts`：

```ts
export class SearchProviderRegistry {
  constructor(private readonly providers: Map<EngineId, SearchProvider>) {}

  get(engine: EngineId): SearchProvider {
    const provider = this.providers.get(engine);
    if (!provider) {
      throw new DomainError(
        "ENGINE_PROVIDER_MISSING",
        `搜索引擎 ${engine} 未注册 Provider`,
      );
    }
    return provider;
  }
}
```

在 `UserStoreManager.open()` 中创建当前用户的 Registry，再传给 `SearchService`。不要创建跨用户共享的 Firecrawl、Tavily 或 GitHub Client。

## 4. 引擎目录与默认状态

### 4.1 新增 ID

修改 `packages/server/src/domain.ts`：

```ts
export const engineIds = [
  "bing",
  "baidu",
  "duckduckgo",
  "exa",
  "csdn",
  "juejin",
  "sogou",
  "firecrawl",
  "tavily",
  "github",
  "bilibili",
] as const;
```

### 4.2 扩展后端引擎定义

重构 `packages/server/src/engine-catalog.ts`，每个引擎显式声明默认状态和凭据模式。

```ts
export type CredentialMode = "none" | "optional" | "required";
export type ProviderKind =
  | "open-websearch"
  | "firecrawl"
  | "tavily"
  | "github"
  | "bilibili";

export type EngineDefinition = {
  provider: ProviderKind;
  requiresProxy: boolean;
  credentialMode: CredentialMode;
  credentialLabel?: string;
  credentialPlaceholder?: string;
  defaultEnabled: boolean;
  defaultSelected: boolean;
  maxResults: number;
};
```

四个新引擎的定义：

```ts
firecrawl: {
  provider: "firecrawl",
  requiresProxy: false,
  credentialMode: "required",
  credentialLabel: "Firecrawl API Key",
  credentialPlaceholder: "fc-...",
  defaultEnabled: false,
  defaultSelected: false,
  maxResults: 50,
},

tavily: {
  provider: "tavily",
  requiresProxy: false,
  credentialMode: "required",
  credentialLabel: "Tavily API Key",
  credentialPlaceholder: "tvly-...",
  defaultEnabled: false,
  defaultSelected: false,
  maxResults: 20,
},

github: {
  provider: "github",
  requiresProxy: false,
  credentialMode: "optional",
  credentialLabel: "GitHub Personal Access Token",
  credentialPlaceholder: "github_pat_... / ghp_...",
  defaultEnabled: false,
  defaultSelected: false,
  maxResults: 50,
},

bilibili: {
  provider: "bilibili",
  requiresProxy: false,
  credentialMode: "none",
  defaultEnabled: false,
  defaultSelected: false,
  maxResults: 20,
},
```

旧引擎的默认状态必须与当前行为一致：

- 默认启用并选中：`bing`、`baidu`、`csdn`、`juejin`、`sogou`。
- 默认关闭：`duckduckgo`、`exa`。
- 四个新引擎全部默认关闭。

### 4.3 禁止重置老用户设置

当前 `bootstrapDatabase()` 会根据目录推导默认引擎集合，并在集合变化后更新已有记录。新增不需要 API Key 的 GitHub、B站后，这段逻辑可能覆盖老用户已经设置好的启用状态和默认顺序。

本次必须调整为：

```ts
for (const id of engineIds) {
  const existing = db.select().from(engines).where(eq(engines.id, id)).get();

  if (!existing) {
    const definition = engineCatalog[id];
    db.insert(engines).values({
      id,
      enabled: definition.defaultEnabled,
      isDefault: definition.defaultSelected,
      searchMode: id === "bing" ? "request" : null,
      resultLimit: null,
      lastTestAt: null,
      status: definition.defaultEnabled ? "unknown" : "disabled",
      latencyMs: null,
      lastError: null,
      updatedAt: now,
    }).run();
  }
}
```

约束：

- 只插入缺失的引擎行。
- 不更新已有引擎的 `enabled`、`isDefault`、`resultLimit`、`searchMode`。
- 不覆盖已有 `search.homeEngineOrder` 和 `search.mcpEngineOrder`。
- 前端现有 `completeOrder()` 会把新 ID 补到顺序末尾，新引擎保持关闭即可。
- 不需要 SQL migration。

## 5. 凭据与配置

### 5.1 设置键

继续使用每用户设置表：

```text
engine.exa.apiKey
engine.firecrawl.apiKey
engine.tavily.apiKey
engine.github.apiKey
```

GitHub Token 可选。未配置 Token 时仍允许启用 GitHub 引擎。

### 5.2 敏感设置识别

`SettingsService` 从引擎目录生成敏感键，代理地址和所有支持凭据的引擎均使用 AES-256-GCM：

```ts
const sensitiveKeys = new Set([
  "proxy.url",
  ...engineIds
    .filter((id) => engineCatalog[id].credentialMode !== "none")
    .map(engineApiKeySetting),
]);
```

验收要求：

- Exa、Firecrawl、Tavily、GitHub 凭据都以加密值写入 SQLite。
- `GET /api/engines` 只返回“是否已配置”。
- API、审计日志、错误日志、搜索历史都不能出现密钥。
- 上游原始错误体不能直接返回前端。
- 修改或清除凭据后调用 `SearchService.clearSearchCache()`。
- Exa、Firecrawl、Tavily、GitHub 凭据保存后立即生效，不提示重启 Open-WebSearch daemon；Exa Provider 不读取 `EXA_API_KEY` 环境变量。

### 5.3 API 响应字段

扩展引擎接口：

```ts
type SearchEngineCredentialInfo = {
  supportsApiKey: boolean;
  requiresApiKey: boolean;
  apiKeyOptional: boolean;
  apiKeyConfigured: boolean;
  credentialLabel?: string;
  credentialPlaceholder?: string;
  maxResults: number;
};
```

兼容现有前端时保留 `requiresApiKey` 和 `apiKeyConfigured`，新增：

- `supportsApiKey`
- `apiKeyOptional`
- `credentialLabel`
- `credentialPlaceholder`
- `maxResults`

`PATCH /api/engines/:id` 继续使用 `apiKey` 字段：

- `apiKey: "..."`：保存。
- `apiKey: null`：清除。
- `credentialMode === "none"`：返回 `ENGINE_API_KEY_UNSUPPORTED`。
- `credentialMode === "required"` 且未配置：禁止启用，返回 `ENGINE_API_KEY_REQUIRED`。
- `credentialMode === "optional"`：无 Token 时也可启用。

## 6. 通用 HTTP 访问工具

新增 `packages/server/src/providers/http-json.ts`，供 Firecrawl、Tavily、B站复用。

接口建议：

```ts
export async function fetchJson<T>(
  url: string,
  init: RequestInit,
  options: {
    timeoutMs: number;
    maxBytes: number;
    schema: z.ZodType<T>;
  },
): Promise<{
  status: number;
  headers: Headers;
  data: T;
}>;
```

实现要求：

- 使用 Node.js 20 自带的 `fetch`。
- 使用 `AbortController` 控制超时。
- 超时错误统一转成 `UPSTREAM_TIMEOUT`。
- 先检查 `Content-Length`，再限制流式读取字节数。
- 默认最大响应体 2 MiB。
- JSON 解析失败返回 `UPSTREAM_INVALID_RESPONSE`。
- Zod 校验失败返回 `UPSTREAM_INVALID_RESPONSE`。
- 日志只记录引擎、状态码、耗时和稳定错误码。
- 不记录请求 Header、Authorization、Cookie、完整响应体。
- 三个 Provider 使用固定 HTTPS 地址，不接受用户配置 Base URL。
- B站查询参数使用 `URLSearchParams`，禁止字符串拼接未编码关键词。

## 7. Firecrawl Provider

### 7.1 接入方式

使用官方 Search REST API：

```text
POST https://api.firecrawl.dev/v2/search
Authorization: Bearer <Firecrawl API Key>
Content-Type: application/json
```

请求体：

```json
{
  "query": "用户查询",
  "limit": 10,
  "sources": ["web"],
  "safe": true,
  "timeout": 15000,
  "ignoreInvalidURLs": true
}
```

固定行为：

- `limit` 最大 50，仍受应用全局上限 50 约束。
- `sources` 固定为 `["web"]`。
- 不传 `categories`，避免与独立 GitHub 引擎产生来源重叠。
- 不传 `scrapeOptions`，避免搜索时抓取全文、增加计费和响应体。
- Provider 侧总超时 20 秒。
- API Key 从 `engine.firecrawl.apiKey` 读取。

### 7.2 不引入 Firecrawl JS SDK

当前镜像使用 `node:20-bookworm-slim`。调研时 Firecrawl 官方 SDK 的当前包声明要求 Node.js 22。直接调用官方 REST API 可以保留 Node.js 20，减少依赖和 LPK 体积。

不要：

- 升级 Dockerfile 到 Node.js 22。
- 固定使用一个旧版 Firecrawl SDK。
- 同时安装 `firecrawl` 和 `@mendable/firecrawl-js`。
- 把 Firecrawl API Key 写入环境变量或 Open-WebSearch daemon。

### 7.3 响应映射

预期响应结构：

```ts
const firecrawlSchema = z.object({
  success: z.boolean(),
  data: z.object({
    web: z.array(z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      url: z.string(),
    })).default([]),
  }).optional(),
  warning: z.string().optional(),
});
```

映射规则：

```ts
{
  title: cleanText(item.title) || item.url,
  url: normalizeHttpUrl(item.url),
  description: cleanText(item.description),
  faviconUrl: faviconFromUrl(item.url),
  engines: ["firecrawl"],
}
```

单条 URL 无效时丢弃该条。响应成功但全部条目无效，返回空结果，不把它当成 Provider 故障。

### 7.4 错误码

- `FIRECRAWL_AUTH_FAILED`：HTTP 401 或 403。
- `FIRECRAWL_QUOTA_EXHAUSTED`：HTTP 402 或明确的额度错误。
- `FIRECRAWL_RATE_LIMITED`：HTTP 429。
- `UPSTREAM_TIMEOUT`：HTTP 408 或本地超时。
- `UPSTREAM_INVALID_RESPONSE`：JSON/Schema 无法解析。
- `UPSTREAM_UNAVAILABLE`：HTTP 5xx 或网络失败。

## 8. Tavily Provider

### 8.1 接入方式

使用官方 Search REST API：

```text
POST https://api.tavily.com/search
Authorization: Bearer <Tavily API Key>
Content-Type: application/json
```

请求体：

```json
{
  "query": "用户查询",
  "search_depth": "basic",
  "topic": "general",
  "max_results": 10,
  "include_answer": false,
  "include_raw_content": false,
  "include_images": false,
  "include_favicon": true,
  "auto_parameters": false
}
```

固定行为：

- `max_results` 最大 20。
- `search_depth` 固定为 `basic`。
- `auto_parameters` 固定为 `false`，避免服务自动切到 `advanced` 并增加 credits。
- 不请求 LLM Answer。
- 不请求原始正文。
- 不请求图片。
- Provider 超时 20 秒。
- API Key 从 `engine.tavily.apiKey` 读取。

Tavily 官方 JS SDK 可用，但当前 Provider 只调用一个稳定的 HTTP Endpoint。直接 REST 能少引入 `axios`、`https-proxy-agent` 和 `js-tiktoken`，也便于复用本项目的超时、响应体上限和 Zod 校验。

### 8.2 响应映射

```ts
const tavilySchema = z.object({
  results: z.array(z.object({
    title: z.string(),
    url: z.string(),
    content: z.string().optional(),
    score: z.number().optional(),
    favicon: z.string().optional(),
  })).default([]),
  request_id: z.string().optional(),
  response_time: z.number().optional(),
});
```

映射规则：

```ts
{
  title: cleanText(item.title) || item.url,
  url: normalizeHttpUrl(item.url),
  description: cleanText(item.content),
  faviconUrl: validHttpUrl(item.favicon)
    ? item.favicon
    : faviconFromUrl(item.url),
  engines: ["tavily"],
}
```

V1 不把 `score` 写进 `SearchResult`，不扩展前端结果卡片。

### 8.3 错误码

- `TAVILY_AUTH_FAILED`：HTTP 401 或 403 中的凭据错误。
- `TAVILY_QUOTA_EXHAUSTED`：额度、计划或 Pay-as-you-go 限制。
- `TAVILY_RATE_LIMITED`：HTTP 429。
- `UPSTREAM_TIMEOUT`
- `UPSTREAM_INVALID_RESPONSE`
- `UPSTREAM_UNAVAILABLE`

## 9. GitHub Provider

### 9.1 依赖

只新增一个生产依赖：

```bash
pnpm --filter @miaomiao-search/server add @octokit/rest
```

提交 `pnpm-lock.yaml`。

当前 `@octokit/rest` 支持 Node.js 20，和镜像运行时一致。

### 9.2 搜索范围

V1 调用：

```ts
octokit.rest.search.repos(...)
```

只返回公共仓库。不要调用：

- Code Search
- Issue/PR Search
- User Search
- GraphQL Search
- 仓库 README 二次读取
- 每条仓库的额外详情请求

每次用户搜索只发出一个 GitHub API 请求。

### 9.3 Client 创建

Provider 按用户创建，按当前 Token 延迟创建或按 Token 变化重建：

```ts
const octokit = new Octokit({
  auth: token || undefined,
  userAgent: "miaomiao-search/0.1.0",
  request: {
    timeout: 15_000,
  },
});
```

实现要求：

- Token 可选。
- 未配置 Token 时发送匿名请求。
- 配置 Token 后只用于提高请求额度。
- 查询追加公共仓库限制，例如 `${query} is:public`。
- 不返回 Token 可访问的私有仓库。
- 不校验 Token 前缀，兼容 fine-grained PAT 和 classic PAT。
- 不在启用引擎时额外请求 GitHub。
- 单引擎测试才发出真实请求。

搜索调用：

```ts
const response = await octokit.rest.search.repos({
  q: `${input.query} is:public`,
  per_page: Math.min(input.limit, 50),
  page: 1,
});
```

不传 `sort` 和 `order`，保留 GitHub 的 Best Match 排序。

### 9.4 响应映射

```ts
{
  title: repository.full_name,
  url: repository.html_url,
  description: cleanText(repository.description ?? ""),
  faviconUrl: "https://github.com/favicon.ico",
  engines: ["github"],
}
```

V1 不把 stars、forks、language、topics、license 和更新时间加入 `SearchResult`。需要仓库富卡片时再单独扩展统一结果契约。

### 9.5 限流处理

GitHub Search 有独立限流。遇到 403 或 429 时读取：

- `retry-after`
- `x-ratelimit-remaining`
- `x-ratelimit-reset`

规则：

- `x-ratelimit-remaining === "0"` 或错误信息明确指向 rate limit，返回 `GITHUB_RATE_LIMITED`。
- 不自动循环重试。
- 错误消息可返回重置时间，格式化成 ISO 时间。
- 401 返回 `GITHUB_AUTH_FAILED`。
- 422 返回 `GITHUB_QUERY_INVALID`。
- 其他 5xx 返回 `UPSTREAM_UNAVAILABLE`。

## 10. Bilibili Provider

### 10.1 方案选择

已调研以下方案：

- `34892002/bilibili-mcp-js`：包含视频搜索实现，使用 `/x/web-interface/search/all/v2`、浏览器 User-Agent、Referer 和 Cookie 预热。
- `public-clis/bilibili-cli`：功能较全，依赖 Python 运行时，不适合当前 Node.js LPK。
- `bilibili-API-collect` 的维护分支和社区验证文档：可用于确认请求参数与响应字段。
- 第三方免费中转 API：服务归属、隐私、限流和可用性无法控制。

最终实现直接调用 Bilibili Web API，仅参考开源项目的请求和字段映射。不要把完整 MCP Server、LangChain、Express、Python CLI 或第三方中转服务打进喵喵搜索。

### 10.2 搜索端点

首选：

```text
GET https://api.bilibili.com/x/web-interface/search/all/v2
```

查询参数：

```text
keyword=<URL 编码后的关键词>
page=1
order=totalrank
```

请求 Header：

```text
Accept: application/json, text/plain, */*
Accept-Language: zh-CN,zh;q=0.9
User-Agent: 当前项目固定的桌面浏览器 UA
Referer: https://search.bilibili.com/all?keyword=<URL 编码后的关键词>
```

不使用 `/x/web-interface/search/type`。近期服务器环境报告显示该端点更容易触发 HTTP 412。

### 10.3 Cookie 预热与重试

执行顺序：

1. 直接请求 `/search/all/v2`。
2. HTTP 200 且 JSON `code === 0`，解析结果。
3. HTTP 412 或 JSON `code === -412` 时，请求一次 `https://www.bilibili.com/` 获取匿名 Cookie。
4. 只提取响应中的 `name=value`，拼成 Cookie Header。
5. 使用匿名 Cookie 重试 `/search/all/v2` 一次。
6. 再次失败时返回 `BILIBILI_BLOCKED`。

约束：

- 最多两次搜索请求和一次首页预热。
- 匿名 Cookie 只保存在本次 Provider 调用的内存中。
- 不写入 SQLite、文件、日志或搜索历史。
- 不读取用户浏览器 Cookie。
- 不提供扫码登录。
- 不实现 WBI 签名。
- 不轮换代理和 User-Agent。
- 不自动切换第三方中转 API。

Node.js 20 下优先使用 `Headers.getSetCookie()`。为兼容类型定义，可写一个窄化辅助函数；缺失该方法时再解析 `headers.get("set-cookie")`。

### 10.4 响应解析

```ts
const bilibiliSchema = z.object({
  code: z.number(),
  message: z.string().optional(),
  data: z.object({
    result: z.array(z.object({
      result_type: z.string(),
      data: z.array(z.record(z.string(), z.unknown())).optional(),
    })).optional(),
  }).optional(),
});
```

从 `data.result` 中寻找：

```ts
group.result_type === "video"
```

每条视频读取：

- `bvid`
- `title`
- `arcurl`
- `description`
- `author`

映射规则：

```ts
{
  title: stripBilibiliMarkup(item.title),
  url: item.bvid
    ? `https://www.bilibili.com/video/${item.bvid}`
    : normalizeBilibiliUrl(item.arcurl),
  description:
    stripBilibiliMarkup(item.description) ||
    stripBilibiliMarkup(item.author),
  faviconUrl: "https://www.bilibili.com/favicon.ico",
  engines: ["bilibili"],
}
```

`stripBilibiliMarkup()` 需要：

- 删除 `<em class="keyword">` 等标签。
- 解码 `&amp;`、`&lt;`、`&gt;`、`&quot;`、`&#39;`。
- 合并多余空白。
- 不把上游 HTML 直接传给 React。
- 标题清理后为空时丢弃该条。

URL 只允许：

- `https://www.bilibili.com/`
- `https://bilibili.com/`
- BVID 拼出的固定地址

### 10.5 数量与错误码

- 单页最多使用 20 条视频。
- `maxResults = 20`。
- V1 不为了满足 21～50 条结果连续翻页，减少风控触发概率。

错误码：

- `BILIBILI_BLOCKED`：HTTP 412 或 JSON `code === -412`，预热重试后仍失败。
- `BILIBILI_RATE_LIMITED`：HTTP 429。
- `BILIBILI_API_ERROR`：HTTP 200 但 `code !== 0`。
- `UPSTREAM_TIMEOUT`
- `UPSTREAM_INVALID_RESPONSE`
- `UPSTREAM_UNAVAILABLE`

B站接口没有公开稳定性承诺。单个 B站 Provider 失败时保留其他引擎结果，并在该引擎分组中返回 failure。

## 11. SearchService 改造

把当前按引擎直接调用 `OpenWebSearchClient.search()` 的代码改为 Registry 调度。

伪代码：

```ts
const provider = this.providers.get(engine);

const configuredLimit =
  configuredLimits[engine] ??
  input.limit ??
  settingsDefaultLimit;

const effectiveLimit = Math.min(
  configuredLimit,
  provider.maxResults,
  50,
);

const cacheKey = JSON.stringify({
  query: normalizedQuery,
  engine,
  limit: effectiveLimit,
  searchMode,
  providerVersion: provider.cacheVersion,
});

const response = await provider.search({
  query: normalizedQuery,
  limit: effectiveLimit,
  searchMode: engine === "bing" ? resolvedBingMode : undefined,
});
```

保留当前行为：

- 每个引擎独立缓存。
- 每个引擎独立 failure。
- 聚合结果按 canonical URL 去重。
- 同一 URL 命中多个引擎时合并 `engines`。
- 并发数继续由 `engine.concurrency` 控制。
- 一个引擎失败不终止其他引擎。
- 全部引擎失败时返回单失败或聚合失败。
- Web 和 MCP 共用同一个 `SearchService`。
- 历史记录和审计结构不变。

调整：

- `SearchEngineResultGroup.limit` 写入 `effectiveLimit`。
- 新增 `clearSearchCache()`，凭据变化后清空搜索缓存。
- Provider 未注册时返回 `ENGINE_PROVIDER_MISSING`。
- Provider 返回的 `SearchResult.engines` 必须只包含当前引擎 ID。
- Provider 抛出的错误不得带 API Key、Cookie 和完整上游响应。
- `fetchContent()`、`fetchSiteContent()` 继续调用 `OpenWebSearchClient`。

## 12. API、MCP 与前端修改

### 12.1 后端路由

修改：

- `packages/server/src/domain.ts`
- `packages/server/src/engine-catalog.ts`
- `packages/server/src/routes.ts`
- `packages/server/src/services/bootstrap.ts`
- `packages/server/src/services/settings.ts`
- `packages/server/src/services/search.ts`
- `packages/server/src/services/user-stores.ts`
- `packages/server/src/mcp.ts`

`searchSchema`、Usage 查询枚举和 MCP 引擎枚举会随 `engineIds` 自动扩展。

单引擎测试路由需要补齐失败状态持久化：

- 成功：`healthy`。
- 限流：`rate_limited`。
- B站 412：`blocked`。
- 认证失败、上游故障：`degraded` 或 `unavailable`。
- 无论成功或失败，都更新 `lastTestAt`、`latencyMs`、`lastError`。

不要在 `/health` 启动检查中调用 Firecrawl、Tavily、GitHub 或 B站。它们依赖用户配置和外部网络，故障不能阻止 Fastify 启动。

### 12.2 MCP

继续使用现有 `search` Tool：

```json
{
  "query": "...",
  "engines": ["github", "bilibili"],
  "limit": 10
}
```

要求：

- 启用后的新引擎出现在 MCP Tool 的 `engines` 枚举。
- 未启用引擎仍被 `getEnabledEngines()` 排除。
- Tool 的文字描述从“public web engines”调整为“enabled search sources”。
- `structuredContent` 和文本 JSON 保持一致。
- 不新增四个 Provider 专属 Tool。

### 12.3 前端

修改：

- `src/types/portal.ts`
- `src/lib/engine-catalog.ts`
- `src/components/portal/pages/engines-page.tsx`
- `src/components/portal/pages/search-page.tsx`
- `src/lib/api.ts`
- `app/globals.css`
- 必要时更新 `src/lib/mock-data.ts`

引擎目录新增：

```ts
firecrawl: {
  id: "firecrawl",
  name: "Firecrawl",
  iconUrl: "https://firecrawl.dev/favicon.ico",
  tagClass: "engine-tag-firecrawl",
},

tavily: {
  id: "tavily",
  name: "Tavily",
  iconUrl: "https://tavily.com/favicon.ico",
  tagClass: "engine-tag-tavily",
},

github: {
  id: "github",
  name: "GitHub",
  iconUrl: "https://github.com/favicon.ico",
  tagClass: "engine-tag-github",
},

bilibili: {
  id: "bilibili",
  name: "B站",
  iconUrl: "https://www.bilibili.com/favicon.ico",
  tagClass: "engine-tag-bilibili",
},
```

引擎管理页：

- Firecrawl、Tavily 显示“需要 API Key”。
- GitHub 显示“Token 可选；匿名搜索额度较低”。
- B站显示“无需密钥”。
- `supportsApiKey` 决定是否显示配置按钮。
- `requiresApiKey` 决定启用前是否强制弹出凭据窗口。
- GitHub 未配置 Token 时允许启用。
- 每引擎返回数量不得超过 `maxResults`。
- 保存四类凭据后提示“已保存并立即生效”。
- 不提示重启 Open-WebSearch daemon；Exa 同样由 Fastify 直接读取用户设置。
- 中英文文案同时补齐。
- 搜索页不新增 Provider 专属参数。
- 搜索结果卡片结构不改。

CSS 只新增四个 `engine-tag-*` 类，沿用现有低饱和标签样式。不要调整整页布局。

## 13. 建议文件结构

新增：

```text
packages/server/src/providers/
  types.ts
  registry.ts
  http-json.ts
  text.ts
  open-websearch-provider.ts
  firecrawl-provider.ts
  tavily-provider.ts
  github-provider.ts
  bilibili-provider.ts
```

新增测试：

```text
packages/server/test/providers/
  firecrawl-provider.test.ts
  tavily-provider.test.ts
  github-provider.test.ts
  bilibili-provider.test.ts
```

如果现有 Node test 脚本只匹配 `test/*.test.ts`，把 Provider 测试放到该目录，或同步修改脚本为递归匹配。不要新增另一套测试框架。

## 14. 测试要求

### 14.1 Provider 单元测试

Firecrawl：

- 正常响应映射。
- 空结果。
- 无效 URL 被丢弃。
- 401。
- 402/额度耗尽。
- 429。
- 超时。
- 非 JSON。
- 超过响应体上限。
- 未配置 API Key。

Tavily：

- `basic`、`auto_parameters: false` 等固定参数。
- 最大 20 条。
- favicon 映射。
- 额度错误。
- 429。
- 超时。
- Schema 异常。
- 未配置 API Key。

GitHub：

- 无 Token 时创建匿名 Client。
- 有 Token 时传入 `auth`。
- 查询追加公共仓库限制。
- 使用 `search.repos`，只发一个请求。
- Best Match，不传 sort。
- 401。
- 403/429 rate limit。
- 422。
- 私有仓库响应不能进入结果；测试夹具中加入 private item 并过滤。
- Token 变化后 Client 重建。

B站：

- 首次请求成功。
- 第一次 412，Cookie 预热后成功。
- 两次 412，返回 `BILIBILI_BLOCKED`。
- `code === -412`。
- 无 `video` 分组时返回空结果。
- 标题 `<em>` 清理。
- HTML entity 解码。
- BVID URL 生成。
- 非 Bilibili URL 被丢弃。
- 最多返回 20 条。
- Cookie 不进入日志和返回值。

### 14.2 服务与路由测试

- Registry 将十一种引擎映射到正确 Provider。
- 旧七种引擎仍调用 Open-WebSearch。
- `fetchWebContent` 仍调用 Open-WebSearch。
- 多引擎请求中一个新 Provider 失败，其他结果正常返回。
- 全部 Provider 失败时维持现有错误契约。
- 缓存按引擎和 Provider 版本隔离。
- 保存或清除密钥后缓存被清空。
- Firecrawl/Tavily 未配 Key 时不能启用。
- GitHub 未配 Token 时能启用。
- 密钥写入设置表后处于加密状态。
- 两个用户的密钥、缓存和结果完全隔离。
- 新增引擎后，已有引擎状态和顺序不被 bootstrap 覆盖。
- 引擎测试失败也会写入健康状态。
- Usage 的 engine facet 包含新 ID。
- MCP 省略 engines 时继续使用用户自己的默认顺序。
- MCP 显式选择 GitHub、B站时返回统一结构。

### 14.3 前端契约测试

更新 `tests/source-contract.test.mjs`：

- 四个引擎出现在前端目录。
- GitHub Token 标记为可选。
- Firecrawl、Tavily 启用前要求密钥。
- B站不展示密钥按钮。
- 保存新 Provider 密钥时不出现“重启 daemon”提示。
- `maxResults` 在 UI 中生效。
- 中英文文案存在。
- 新引擎标签类存在。

### 14.4 外部实测

默认测试不能消耗真实 credits，也不能依赖 B站在线状态。

可选本地实测使用：

```text
RUN_EXTERNAL_SEARCH_TESTS=1
FIRECRAWL_TEST_API_KEY=...
TAVILY_TEST_API_KEY=...
GITHUB_TEST_TOKEN=...
```

真实密钥只放进当前终端环境变量，不提交 `.env`。

B站外部实测失败只能作为网络证据，不能让默认 CI 失败。

## 15. 安全与稳定性要求

- Firecrawl、Tavily、GitHub、B站使用固定域名，不开放自定义 Endpoint。
- API Key 和 Token 只从每用户加密设置读取。
- GitHub Token 只搜索公共仓库。
- B站不持久化 Cookie。
- B站返回标题先清理 HTML，再进入 React。
- 所有 URL 经过协议、凭据和 Host 校验。
- Provider 单次响应体限制 2 MiB。
- Provider 有独立超时。
- 不把上游完整错误体返回用户。
- 不在应用启动时探测付费 API。
- 不对 401、403、412、429 进行无限重试。
- 搜索并发仍受 `engine.concurrency` 限制。
- 现有 SSRF、认证、Token scope、限流和用户隔离逻辑不得弱化。

## 16. 文档同步

仓库 `AGENTS.md` 要求跨模块搜索能力同步需求、决策和进度文档。Codex 开工前读取 `DOCUMENT_MAP.md`，按当前台账编号创建或更新：

- `docs/Requirements/REQ-*.md`
- `docs/Requirements/LEDGER.md`
- `docs/Decisions/DEC-*.md`
- `docs/Decisions/LEDGER.md`
- `docs/Progress/PROG-*.md`
- `docs/Progress/LEDGER.md`
- `docs/Miaomiao Search 技术实现文档.md`
- `docs/SEARCH_AND_MCP_BUSINESS_FLOW.md`
- `docs/PROGRESS.md`
- `README.md` 中的搜索源、密钥和本地验证说明

决策记录至少写清：

- Fastify Provider Registry。
- Firecrawl/Tavily 采用 REST。
- GitHub 采用 `@octokit/rest`。
- B站采用公开 Web API 和一次匿名 Cookie 预热。
- 不使用第三方 B站中转 API。
- 不改变 Node.js 20。
- 不重置已有用户的引擎配置。

## 17. 实现顺序

1. 更新需求、决策和进度记录。
2. 扩展 `engineIds` 和后端 `engineCatalog`。
3. 修复 bootstrap，保护已有用户配置。
4. 新增 Provider 类型、Registry、通用 HTTP 工具。
5. 把旧七个源包进 `OpenWebSearchProvider`。
6. 实现 Firecrawl、Tavily、GitHub、B站 Provider。
7. 改造 `SearchService` 和 `UserStoreManager`。
8. 扩展凭据加密、引擎路由和测试状态。
9. 更新前端类型、引擎目录、管理页和标签样式。
10. 更新 MCP 描述和契约测试。
11. 完成单元测试、服务测试、用户隔离测试。
12. 更新主技术文档、业务流程和 README。
13. 运行完整验证命令。

验证命令：

```bash
pnpm lint
pnpm typecheck
pnpm --filter @miaomiao-search/server typecheck
pnpm test
pnpm build
```

## 18. 验收标准

- 十一种引擎都能在管理页显示。
- 四个新引擎首次升级后处于关闭状态。
- 升级前的引擎启用状态、默认状态、返回数量和顺序保持不变。
- Firecrawl、Tavily 配置 Key 后可搜索。
- GitHub 无 Token 可搜索公共仓库，配置 Token 后继续只返回公共仓库。
- B站可返回视频结果；触发 412 后进行一次匿名 Cookie 预热和一次重试。
- B站持续受阻时，该分组返回明确 failure，其他引擎仍返回结果。
- Web 与 MCP 的结果结构一致。
- 现有正文抓取 Tool 行为不变。
- 新 Provider 不依赖 Open-WebSearch daemon 的 API Key。
- 新增凭据加密保存，接口和日志不泄露。
- 默认测试不请求真实外部 API。
- `lint`、前后端 `typecheck`、`test`、`build` 全部通过。
- 只新增 `@octokit/rest` 生产依赖。
- Dockerfile 继续使用 Node.js 20。
- 不新增 SQL migration。
- 不新增 B站第三方中转服务。
- 不新增 Provider 专属 MCP Tool。

## 19. Codex 执行约束

Codex 开始编码前必须读取：

```text
AGENTS.md
DOCUMENT_MAP.md
docs/Miaomiao Search 技术实现文档.md
docs/SEARCH_AND_MCP_BUSINESS_FLOW.md
docs/Requirements/LEDGER.md
docs/Decisions/LEDGER.md
docs/Progress/LEDGER.md
```

编码时遵守：

- 只完成本文件范围。
- 保留用户已有改动。
- 不 fork 或修改 `open-websearch` 依赖来承载四个新源。
- 不升级 Node.js。
- 不引入 Firecrawl SDK、Tavily SDK、B站 MCP Server、Python CLI。
- 不重构正文抓取链路。
- 已确认并实现 `SearchResult.thumbnailUrl?: string`：仅用于结果封面展示，Provider 必须先做 URL 校验；封面不下载、不代理、不存储，历史快照缺少该字段时保持兼容。
- 不保存 B站登录 Cookie。
- 不提交真实 API Key、Token、Cookie、数据库和日志。
- 不在默认测试中访问真实外部服务。
- 新增依赖后提交 lockfile。
- 每完成一个阶段同步 Progress 记录。
- 交付时列出修改文件、测试结果、未解决风险。

## 20. 参考资料

- Firecrawl Search API：<https://docs.firecrawl.dev/api-reference/endpoint/search>
- Firecrawl Node.js Quickstart：<https://docs.firecrawl.dev/quickstarts/nodejs>
- Firecrawl JS SDK 源码：<https://github.com/firecrawl/firecrawl/tree/main/apps/js-sdk/firecrawl>
- Tavily Search API：<https://docs.tavily.com/documentation/api-reference/endpoint/search>
- Tavily JavaScript SDK Reference：<https://docs.tavily.com/sdk/javascript/reference>
- Octokit REST.js：<https://octokit.github.io/rest.js/>
- GitHub REST Search：<https://docs.github.com/en/rest/search/search>
- GitHub REST API Best Practices：<https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api>
- B站 `/all/v2` 服务器环境验证：<https://github.com/Panniantong/Agent-Reach/issues/180>
- B站搜索接口社区验证文档：<https://github.com/lovelyyoshino/Bilibili-Live-API/blob/master/API.search_v2.md>
- Bilibili MCP JS 参考实现：<https://github.com/34892002/bilibili-mcp-js>
