---
id: "notus_7c82e4f0b553301e930e67c2"
created_by: notus_agent
title: "Lazycat Search 技术实现文档"
---

# Lazycat Search 技术实现文档

> 项目名：lazycat-search　基础项目：Open-WebSearch　文档版本：v1.0　日期：2026-08-22

## 1. 技术栈总览

| 层 | 技术 | 版本要求 | 选型理由 |
|---|------|---------|---------|
| 运行时 | Node.js | ≥ 20 LTS | 上游 Open-WebSearch 基于 Node.js，复用其搜索引擎适配层和 MCP SDK |
| 语言 | TypeScript | ≥ 5.4 | 全栈类型安全，前后端共享类型定义 |
| 后端框架 | Fastify | ≥ 5.x | 高性能、原生 TypeScript 支持、插件体系成熟、JSON Schema 校验内建 |
| 前端框架 | Next.js（React） | ≥ 16 | 使用 App Router 管理页面与布局，为后续服务端集成保留边界 |
| 前端构建 | Next.js / Turbopack | — | 使用 Next.js 官方开发与生产构建流程 |
| UI 组件库 | 项目内基础组件 + Tailwind CSS v4 | — | Button、Input、SearchInput、Tag、Tabs、Switch、Select、Modal、Toast 由项目源码维护，避免运行时组件依赖 |
| 状态管理 | React Context + useState（当前 mock） | React 内建 | 当前阶段只维护浏览器内演示状态；接入真实数据时再按需求确认服务端状态方案 |
| HTTP 客户端 | 原生 fetch（待接入） | 浏览器内建 | 当前 mock 不发起 API 请求；真实 API 实现时统一封装 |
| 数据库 | SQLite | — | 单文件、零运维，适合自托管和懒猫微服 `/lzcapp/var/data` 持久化 |
| ORM | Drizzle ORM + drizzle-kit | ≥ 0.38 | 类型安全、SQL-first、SQLite 适配良好、迁移工具内建 |
| MCP SDK | @modelcontextprotocol/sdk | ≥ 1.x | 官方 SDK，Streamable HTTP Transport 开箱可用 |
| 认证 | JWT (jose) + bcrypt (bcryptjs) | — | 无状态 Token；bcrypt 哈希管理员密码 |
| 日志 | pino | ≥ 9.x | Fastify 默认日志库，JSON 结构化输出 |
| 测试 | Node.js Test Runner、Next.js 构建、TypeScript、ESLint | — | 当前已有 3 个源代码契约测试，并具备 lint、类型与生产构建命令 |
| 容器 | Docker multi-stage | — | 构建阶段 + 运行阶段分离，最终镜像 ≤ 200 MB |
| 包管理 | pnpm | ≥ 9.x | Monorepo workspace 支持、依赖安装快、磁盘占用小 |

## 2. 项目结构

### 2.1 后端与部署规划目录（尚未实现）

```
lazycat-search/
├── packages/
│   ├── server/                  # 后端
│   │   ├── src/
│   │   │   ├── app.ts           # Fastify 实例与插件注册
│   │   │   ├── config.ts        # 环境变量与运行时配置
│   │   │   ├── index.ts         # 入口
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts      # POST /api/auth/login, POST /api/auth/logout
│   │   │   │   ├── search.ts    # POST /api/search, POST /api/fetch-content
│   │   │   │   ├── engines.ts   # GET/PATCH /api/engines, POST /api/engines/:id/test
│   │   │   │   ├── tokens.ts    # CRUD /api/tokens
│   │   │   │   ├── settings.ts  # GET/PATCH /api/settings
│   │   │   │   ├── usage.ts     # GET /api/usage/overview, GET /api/usage/logs
│   │   │   │   └── mcp-admin.ts # GET /api/mcp/status, PATCH /api/mcp/tools
│   │   │   ├── mcp/
│   │   │   │   ├── server.ts    # MCP Server 实例，注册 Tool
│   │   │   │   ├── transport.ts # Streamable HTTP + Legacy SSE Transport 适配
│   │   │   │   └── tools/       # search, fetchWebContent, fetchCsdnArticle...
│   │   │   ├── engines/
│   │   │   │   ├── manager.ts   # 引擎注册、状态管理、健康检查
│   │   │   │   ├── base.ts      # SearchEngine 抽象基类
│   │   │   │   └── adapters/    # bing.ts, baidu.ts, duckduckgo.ts, brave.ts...
│   │   │   ├── services/
│   │   │   │   ├── search.ts    # 多引擎聚合搜索、去重、排序
│   │   │   │   ├── fetch.ts     # 网页正文抓取、SSRF 防护
│   │   │   │   ├── cache.ts     # 搜索缓存 + 正文缓存
│   │   │   │   ├── auth.ts      # 管理员认证 + Token 认证
│   │   │   │   ├── rate-limit.ts # 限流
│   │   │   │   └── usage.ts     # 调用记录与统计
│   │   │   ├── db/
│   │   │   │   ├── schema.ts    # Drizzle 表定义
│   │   │   │   ├── migrate.ts   # 启动时自动迁移
│   │   │   │   └── client.ts    # SQLite 连接
│   │   │   ├── middleware/
│   │   │   │   ├── jwt.ts       # JWT 校验 hook
│   │   │   │   └── mcp-auth.ts  # MCP Token 校验 hook
│   │   │   └── utils/
│   │   │       ├── ssrf.ts      # IP/DNS 黑名单检查
│   │   │       └── id.ts        # Request ID 生成
│   │   ├── drizzle/             # 迁移文件
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── web/                     # 前端
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx          # 路由 + 布局
│   │   │   ├── stores/          # Zustand stores
│   │   │   ├── pages/
│   │   │   │   ├── Login.tsx
│   │   │   │   ├── Search.tsx
│   │   │   │   ├── MCP.tsx
│   │   │   │   ├── Engines.tsx
│   │   │   │   ├── Usage.tsx
│   │   │   │   └── Settings.tsx
│   │   │   ├── components/      # 可复用组件
│   │   │   │   ├── layout/      # Sidebar, TopBar
│   │   │   │   ├── search/      # SearchInput, EngineSelector, ResultList, ReadingPanel...
│   │   │   │   ├── mcp/         # TokenTable, ConfigTemplate, ConnectionTest...
│   │   │   │   └── ui/          # shadcn/ui 组件
│   │   │   ├── hooks/           # useSearch, useAuth, useMCPStatus...
│   │   │   ├── lib/
│   │   │   │   ├── api.ts       # ky 封装，拦截器
│   │   │   │   └── utils.ts
│   │   │   └── types/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   └── package.json
│   └── shared/                  # 前后端共享
│       ├── types.ts             # API Request/Response 类型
│       └── constants.ts         # 引擎名、状态枚举、错误码
├── docker/
│   ├── Dockerfile
│   └── run.sh                   # 容器入口脚本
├── lazycat/                     # 懒猫微服打包
│   ├── package.yml
│   ├── lzc-manifest.yml
│   ├── lzc-build.yml
│   └── build-package.sh
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

### 2.2 当前已实现的 Next.js 门户

```
lazycat-search/
├── app/                         # Next.js App Router 入口
│   ├── layout.tsx               # 全局样式与 metadata
│   ├── page.tsx                 # 门户入口
│   └── globals.css              # Tailwind 和设计 token
├── src/
│   ├── components/
│   │   ├── ui/                  # 项目基础组件
│   │   └── portal/              # Shell、状态上下文与五个管理页面 JSX
│   ├── lib/mock-data.ts         # 每页 mock 数据与客户端模板
│   └── types/portal.ts          # 门户状态和数据类型
├── docs/DESIGN.md               # 门户视觉与组件规范
├── package.json                 # pnpm scripts 与 Next.js 依赖
├── next.config.ts
├── postcss.config.mjs
└── tsconfig.json
```

### 2.3 当前已实现的服务端领域层

```
packages/server/
├── drizzle/0000_initial.sql    # 六表 SQLite 初始迁移
├── src/
│   ├── db/                     # Drizzle schema、SQLite 连接和迁移执行器
│   ├── services/               # 认证、Token、设置、审计、缓存、搜索和 SSRF
│   └── upstream/               # Open-WebSearch 私有 daemon HTTP 适配器
└── test/services.test.ts       # 领域服务与安全路径测试
```

当前工程已实现 Fastify 管理 API、SQLite、管理员会话、MCP Token、缓存、搜索聚合、正文 URL 校验、Open-WebSearch 适配器、远程 `/mcp` 与门户真实数据接入；Docker 与懒猫微服配置仍是后续工作。

## 3. 数据库设计

SQLite 数据库文件路径：`DATA_DIR/lazycat-search.db`，懒猫微服部署时 `DATA_DIR=/lzcapp/var/data`。

### 3.1 表结构

```sql
-- 管理员账户（V1 单用户）
CREATE TABLE admin (
  id         INTEGER PRIMARY KEY,
  username   TEXT    NOT NULL UNIQUE,
  password   TEXT    NOT NULL,          -- bcrypt hash
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- MCP Access Token
CREATE TABLE access_token (
  id              TEXT    PRIMARY KEY,  -- nanoid
  name            TEXT    NOT NULL,
  prefix          TEXT    NOT NULL,     -- Token 前 8 位，用于列表展示
  hash            TEXT    NOT NULL,     -- SHA-256(raw token)
  scope           TEXT    NOT NULL DEFAULT 'all',  -- 'all' | 'search' | 'fetch'
  rpm_limit       INTEGER,             -- 每分钟请求上限，NULL 表示不限
  daily_limit     INTEGER,             -- 每日请求上限，NULL 表示不限
  expires_at      TEXT,                -- NULL 表示永不过期
  last_used_at    TEXT,
  status          TEXT    NOT NULL DEFAULT 'active', -- 'active' | 'disabled' | 'revoked'
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 搜索引擎配置
CREATE TABLE engine (
  id           TEXT    PRIMARY KEY,     -- 'bing' | 'baidu' | 'duckduckgo' | ...
  enabled      INTEGER NOT NULL DEFAULT 1,
  is_default   INTEGER NOT NULL DEFAULT 0,
  search_mode  TEXT,                    -- Bing 专属：'auto' | 'request'
  last_test_at TEXT,
  status       TEXT    NOT NULL DEFAULT 'unknown',
  latency_ms   INTEGER,
  last_error   TEXT,
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 搜索历史
CREATE TABLE search_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  query      TEXT    NOT NULL,
  engines    TEXT    NOT NULL,          -- JSON array
  result_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 请求日志
CREATE TABLE request_log (
  id           TEXT    PRIMARY KEY,     -- Request ID
  channel      TEXT    NOT NULL,        -- 'web' | 'mcp'
  operation    TEXT    NOT NULL,        -- 'search' | 'fetchWebContent' | ...
  token_id     TEXT,                    -- MCP 调用关联的 Token ID
  query        TEXT,                    -- 管理员配置是否记录
  engines      TEXT,                    -- JSON array
  latency_ms   INTEGER NOT NULL,
  cache_hit    INTEGER NOT NULL DEFAULT 0,
  result_count INTEGER,
  status       TEXT    NOT NULL,        -- 'success' | 'partial' | 'error'
  error_code   TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 系统配置 KV
CREATE TABLE setting (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 3.2 Settings KV 预置键

| Key | 默认值 | 说明 |
|-----|--------|------|
| `proxy.enabled` | `false` | 代理开关 |
| `proxy.url` | `""` | HTTP/SOCKS5 代理地址 |
| `cache.search.enabled` | `true` | 搜索缓存开关 |
| `cache.search.ttl` | `3600` | 搜索缓存 TTL（秒） |
| `cache.search.maxSize` | `1000` | 最大缓存条数 |
| `cache.content.enabled` | `true` | 正文缓存开关 |
| `cache.content.ttl` | `86400` | 正文缓存 TTL（秒） |
| `rateLimit.web.rpm` | `30` | Web 每 IP 每分钟请求上限 |
| `search.defaultEngines` | `["bing","duckduckgo"]` | 默认搜索引擎 |
| `search.defaultLimit` | `10` | 默认结果数量 |
| `search.maxLimit` | `50` | 最大结果数量 |
| `fetch.maxChars` | `50000` | 正文最大字符数 |
| `history.enabled` | `true` | 搜索历史开关 |
| `history.retentionDays` | `30` | 搜索历史保留天数 |
| `log.saveQuery` | `false` | 日志是否记录 Query 原文 |
| `mcp.legacySse` | `false` | Legacy SSE Transport 开关 |

## 4. 后端架构

### 4.1 Fastify 插件注册顺序

```typescript
// app.ts
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';

const app = Fastify({ logger: true, requestId: true });

// 1. CORS — MCP Endpoint 需要跨域
await app.register(fastifyCors, { origin: getCorsOrigin() });

// 2. JWT 认证 hook
await app.register(jwtPlugin);

// 3. API 路由
await app.register(authRoutes,    { prefix: '/api/auth' });
await app.register(searchRoutes,  { prefix: '/api/search' });
await app.register(engineRoutes,  { prefix: '/api/engines' });
await app.register(tokenRoutes,   { prefix: '/api/tokens' });
await app.register(settingsRoutes,{ prefix: '/api/settings' });
await app.register(usageRoutes,   { prefix: '/api/usage' });
await app.register(mcpAdminRoutes,{ prefix: '/api/mcp' });

// 4. MCP Endpoint — 独立认证，不走 JWT
await app.register(mcpTransport,  { prefix: '/mcp' });

// 5. 前端静态文件 — SPA fallback
await app.register(fastifyStatic, {
  root: path.join(__dirname, '../../web/dist'),
  wildcard: false,
});
app.setNotFoundHandler((req, reply) => {
  if (!req.url.startsWith('/api') && !req.url.startsWith('/mcp')) {
    return reply.sendFile('index.html');
  }
  reply.code(404).send({ error: 'Not Found' });
});
```

### 4.2 认证流程

**管理员登录（Web）：**

```
POST /api/auth/login
  Body: { username, password }
  → bcrypt.compare(password, admin.password)
  → 签发 JWT { sub: admin.id, iat, exp: 24h }
  → Set-Cookie: token=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/
  → Response: { ok: true }
```

JWT 通过 HttpOnly Cookie 传输，前端不直接接触 Token 值。每个 `/api/*` 请求由 `jwtPlugin` 校验 Cookie。

**MCP Token 认证：**

```
POST /mcp
  Header: Authorization: Bearer <raw_token>
  → SHA-256(raw_token) → 查 access_token 表匹配 hash
  → 检查 status='active'、未过期、未超出 RPM/Daily 限额
  → 通过后进入 MCP Server 处理
```

### 4.3 搜索引擎适配层

从 Open-WebSearch 抽取并重构搜索引擎适配器：

```typescript
// engines/base.ts
export interface SearchResult {
  title: string;
  url: string;
  description: string;
  engine: string;
}

export interface SearchOptions {
  query: string;
  limit: number;
  searchMode?: 'auto' | 'request';
  proxy?: string;
  signal?: AbortSignal;
}

export abstract class SearchEngine {
  abstract readonly id: string;
  abstract readonly name: string;

  abstract search(options: SearchOptions): Promise<SearchResult[]>;

  // 健康检查：用固定关键词执行一次搜索
  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      await this.search({ query: 'test', limit: 1 });
      return { ok: true, latencyMs: Date.now() - start };
    } catch (e) {
      return { ok: false, latencyMs: Date.now() - start, error: String(e) };
    }
  }
}
```

**引擎管理器** 负责：
- 启动时从 `engine` 表加载配置，合并上游默认值
- 执行多引擎并发搜索（`Promise.allSettled`）
- 跟踪每个引擎的状态和最近错误
- 定时健康检查（可选，默认关闭）

### 4.4 多引擎聚合搜索

```typescript
// services/search.ts
export async function aggregateSearch(params: {
  query: string;
  engines: string[];
  limit: number;
  searchMode?: string;
}): Promise<{
  results: MergedResult[];
  failures: EngineFailure[];
  cached: boolean;
}> {
  // 1. 检查缓存
  const cacheKey = buildCacheKey(params);
  const cached = cache.get(cacheKey);
  if (cached) return { ...cached, cached: true };

  // 2. 并发调用各引擎
  const tasks = params.engines.map(id =>
    engineManager.get(id).search({
      query: params.query,
      limit: params.limit,
      searchMode: params.searchMode,
    })
  );
  const settled = await Promise.allSettled(tasks);

  // 3. 收集结果和失败
  const allResults: SearchResult[] = [];
  const failures: EngineFailure[] = [];
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      allResults.push(...result.value);
    } else {
      failures.push({ engine: params.engines[i], error: result.reason });
    }
  });

  // 4. URL 去重合并 — 同一 URL 的结果合并来源引擎标签
  const merged = deduplicateByUrl(allResults);

  // 5. 写入缓存
  cache.set(cacheKey, { results: merged, failures });

  return { results: merged, failures, cached: false };
}
```

### 4.5 正文抓取与 SSRF 防护

```typescript
// services/fetch.ts
export async function fetchWebContent(url: string, maxChars: number): Promise<FetchResult> {
  // 1. URL 合法性检查 — 仅允许 http/https
  assertValidScheme(url);

  // 2. DNS 解析 + IP 黑名单检查
  const resolved = await dns.resolve(new URL(url).hostname);
  assertNotPrivateIP(resolved);

  // 3. 发起请求，跟踪重定向
  const response = await fetchWithRedirectCheck(url, {
    maxRedirects: 5,
    onRedirect: (redirectUrl) => {
      // 每次重定向重新检查 DNS + IP
      const rResolved = await dns.resolve(new URL(redirectUrl).hostname);
      assertNotPrivateIP(rResolved);
    },
  });

  // 4. 正文提取（从 Open-WebSearch 复用 readability / cheerio 逻辑）
  const content = extractContent(response.body, maxChars);

  return {
    title: content.title,
    url: url,
    finalUrl: response.url,
    contentType: response.headers['content-type'],
    truncated: content.truncated,
    content: content.text,
  };
}
```

**IP 黑名单列表** (`utils/ssrf.ts`)：

- `127.0.0.0/8`、`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`
- `169.254.0.0/16`（link-local）
- `0.0.0.0/8`
- IPv6：`::1`、`fc00::/7`（ULA）、`fe80::/10`（link-local）、`::ffff:0:0/96`（IPv4-mapped）
- 云 metadata：`169.254.169.254`

### 4.6 缓存实现

使用内存 LRU 缓存，进程重启后缓存清空（自托管场景可接受）。

```typescript
// services/cache.ts
import { LRUCache } from 'lru-cache';

// 搜索缓存
const searchCache = new LRUCache<string, CachedSearchResult>({
  max: settings.get('cache.search.maxSize'),
  ttl: settings.get('cache.search.ttl') * 1000,
});

// 正文缓存
const contentCache = new LRUCache<string, CachedContent>({
  max: 200,
  ttl: settings.get('cache.content.ttl') * 1000,
});
```

缓存 Key 生成策略：
- 搜索：`SHA-256(query + engines.sort().join(',') + limit + searchMode)`
- 正文：`SHA-256(url)`

Web 和 MCP 共用同一缓存实例。

### 4.7 限流实现

基于滑动窗口计数器，内存实现。

```typescript
// services/rate-limit.ts
import { RateLimiterMemory } from 'rate-limiter-flexible';

// Web 限流 — 按客户端 IP
const webLimiter = new RateLimiterMemory({
  points: settings.get('rateLimit.web.rpm'),
  duration: 60,
});

// MCP 限流 — 按 Token ID，使用 Token 自身的 rpm_limit / daily_limit
function getMcpLimiter(tokenId: string, rpm: number) {
  // 动态创建/复用 limiter
}
```

### 4.8 Usage 日志写入

每次搜索或正文抓取请求，由 `usageService.log()` 异步写入 `request_log` 表。写入失败不阻塞主请求。

```typescript
// services/usage.ts
export function logRequest(entry: RequestLogEntry) {
  // 异步写入，不等待
  db.insert(requestLog).values(entry).run();
}

export function getOverview(range: 'today' | '7d' | '30d') {
  // 聚合查询：调用量、成功率、缓存命中率、平均延迟
}

export function getLogs(params: { page, pageSize, channel?, operation?, tokenId? }) {
  // 分页查询 request_log
}
```

## 5. MCP Server 实现

### 5.1 Server 实例

```typescript
// mcp/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const mcpServer = new McpServer({
  name: 'lazycat-search',
  version: '1.0.0',
});

// 注册 Tools
mcpServer.tool('search', searchSchema, searchHandler);
mcpServer.tool('fetchWebContent', fetchWebContentSchema, fetchWebContentHandler);
mcpServer.tool('fetchCsdnArticle', fetchCsdnSchema, fetchCsdnHandler);
mcpServer.tool('fetchJuejinArticle', fetchJuejinSchema, fetchJuejinHandler);
mcpServer.tool('fetchGithubReadme', fetchGithubSchema, fetchGithubHandler);
mcpServer.tool('fetchLinuxDoArticle', fetchLinuxDoSchema, fetchLinuxDoHandler);
```

### 5.2 Transport 适配

```typescript
// mcp/transport.ts
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

export async function mcpTransport(app: FastifyInstance) {
  // Streamable HTTP — 主协议
  app.all('/', async (req, reply) => {
    // Token 认证
    const token = await authenticateMcpRequest(req);
    if (!token) return reply.code(401).send({ error: 'Unauthorized' });

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    reply.raw.on('close', () => transport.close());
    await mcpServer.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });

  // Legacy SSE — 兼容旧客户端，默认关闭
  if (settings.get('mcp.legacySse')) {
    app.get('/sse', async (req, reply) => { /* SSE 长连接 */ });
    app.post('/messages', async (req, reply) => { /* SSE 消息接收 */ });
  }
}
```

### 5.3 Tool 返回格式

`search` Tool 扩展返回字段，兼容上游调用方：

```typescript
// 上游原始字段保留
{
  title: string;
  url: string;
  description: string;
}
// 扩展字段
{
  engines: string[];          // 去重合并后的来源引擎
  cached: boolean;            // 是否命中缓存
  requestId: string;          // 请求追踪 ID
}
```

## 6. 前端架构

### 6.1 路由

```text
app/layout.tsx  -> 全局布局、全局 CSS 与 metadata
app/page.tsx    -> PortalApp
PortalApp       -> LoginScreen 或 PortalShell
PortalShell     -> Search / MCP / Engines / Usage / Settings 页面 JSX
```

当前 mock 阶段把五个管理页面保持在一个受控门户容器中，以复现静态原型的无刷新导航。接入真实会话和 URL 路由时，应迁移到 App Router 的受保护路由段，并由服务端鉴权决定访问权限。

### 6.2 状态管理

```typescript
// portal-context.tsx — 当前浏览器内的 mock 状态
// SearchPage — 搜索输入、引擎选择、结果列表、正文面板
// SettingsPage — 可编辑配置的 mock 状态
```

关键原则：
- 当前状态不持久化、不发起网络请求，刷新页面会恢复初始 mock 数据。
- 真实服务状态接入后，Token、引擎和 Usage 必须由受保护 API 提供，不能复用 mock 逻辑。
- 引擎最近选择是否持久化到浏览器仍需在真实会话方案确定后实现。

### 6.3 页面与组件对应

| 页面 | 关键组件 | 数据来源 |
|------|---------|---------|
| Login | `LoginForm`, `ErrorAlert` | `POST /api/auth/login` |
| Search | `SearchInput`, `EngineSelector`, `LimitSelect`, `AdvancedOptions`, `ResultList`, `ResultCard`, `FailureBanner`, `ReadingPanel`, `HistoryDrawer` | `POST /api/search`, `POST /api/fetch-content` |
| MCP | `ServiceStatus`, `ToolList`, `TokenTable`, `CreateTokenDialog`, `ConfigTemplate`, `ConnectionTest` | `GET /api/mcp/status`, `/api/tokens` |
| Engines | `EngineTable`, `StatusBadge`, `TestDialog` | `GET /api/engines`, `POST /api/engines/:id/test` |
| Usage | `OverviewCards`, `EngineChart`, `LogTable` | `GET /api/usage/overview`, `GET /api/usage/logs` |
| Settings | `ProxyForm`, `CacheForm`, `RateLimitForm`, `SearchDefaultsForm`, `DataManagement` | `GET/PATCH /api/settings` |

### 6.4 正文阅读面板

用户点击搜索结果的"读取正文"按钮后：

1. 调用 `POST /api/fetch-content` → 返回提取后的纯文本
2. `ReadingPanel` 侧栏或下方展开，显示标题、URL 信息、正文内容
3. 正文使用 `<pre>` 或经安全转义的 Markdown 渲染，禁止执行任何脚本
4. 失败时根据 `errorCode` 显示对应的中文错误说明

### 6.5 XSS 防护

- 搜索结果的 `title`、`description` 使用 React 默认转义（`textContent`），不使用 `dangerouslySetInnerHTML`
- 正文内容如需 HTML 渲染，经过 `DOMPurify.sanitize()` 处理
- URL 展示使用 `textContent`，点击跳转使用 `<a>` 标签 + `rel="noopener noreferrer"`

## 7. API 设计

### 7.1 认证

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| POST | `/api/auth/login` | — | 登录 |
| POST | `/api/auth/logout` | JWT | 登出（清除 Cookie） |

### 7.2 搜索

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| POST | `/api/search` | JWT | 聚合搜索 |
| POST | `/api/fetch-content` | JWT | 抓取网页正文 |

**POST /api/search**

```jsonc
// Request
{
  "query": "lazycat microserver",
  "engines": ["bing", "duckduckgo"],
  "limit": 10,
  "searchMode": "auto"  // 可选，仅 Bing 生效
}

// Response
{
  "requestId": "req_abc123",
  "results": [
    {
      "title": "...",
      "url": "https://...",
      "description": "...",
      "engines": ["bing", "duckduckgo"]
    }
  ],
  "failures": [
    { "engine": "brave", "error": "429 Too Many Requests" }
  ],
  "cached": false,
  "resultCount": 8
}
```

### 7.3 引擎管理

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| GET | `/api/engines` | JWT | 引擎列表 |
| PATCH | `/api/engines/:id` | JWT | 修改引擎配置（enabled, isDefault, searchMode） |
| POST | `/api/engines/:id/test` | JWT | 测试搜索 |

### 7.4 Token 管理

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| GET | `/api/tokens` | JWT | Token 列表 |
| POST | `/api/tokens` | JWT | 创建 Token，返回完整 Secret（仅一次） |
| PATCH | `/api/tokens/:id` | JWT | 修改状态（disable / enable / revoke） |
| DELETE | `/api/tokens/:id` | JWT | 删除 Token |

### 7.5 系统配置

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| GET | `/api/settings` | JWT | 读取全部配置 |
| PATCH | `/api/settings` | JWT | 批量更新配置 |
| POST | `/api/settings/proxy/test` | JWT | 测试代理连通性 |
| POST | `/api/settings/history/clear` | JWT | 清空搜索历史 |

### 7.6 Usage

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| GET | `/api/usage/overview` | JWT | 概览指标 |
| GET | `/api/usage/engines` | JWT | 各引擎统计 |
| GET | `/api/usage/logs` | JWT | 请求日志（分页） |

### 7.7 MCP 管理

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| GET | `/api/mcp/status` | JWT | MCP 服务状态 |
| PATCH | `/api/mcp/tools/:toolName` | JWT | 启停单个 Tool |
| POST | `/api/mcp/test` | JWT | 连接测试 |

### 7.8 MCP Endpoint

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| POST | `/mcp` | Bearer Token | Streamable HTTP MCP Endpoint |
| GET | `/mcp/sse` | Bearer Token | Legacy SSE（默认关闭） |
| POST | `/mcp/messages` | Bearer Token | Legacy SSE 消息接收 |

## 8. 部署

> 当前仓库尚未创建 Docker、Fastify 或懒猫微服文件。下列内容是后端实施前的历史部署规划，其中 Vite 前端构建说明已不适用；当前 Next.js 门户使用 `pnpm build` 生成生产构建。部署方案将在新增服务端与容器文件前重新确认。

### 8.1 Docker 构建

```dockerfile
# docker/Dockerfile
# ---- Build Stage ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/ packages/
RUN corepack enable pnpm && pnpm install --frozen-lockfile
RUN pnpm --filter web build        # Vite 构建前端
RUN pnpm --filter server build     # TypeScript 编译后端
RUN pnpm deploy --filter server --prod /prod  # 生产依赖

# ---- Runtime Stage ----
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /prod .
COPY --from=builder /app/packages/web/dist ./web/dist
COPY docker/run.sh /app/run.sh
RUN chmod +x /app/run.sh

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3000
EXPOSE 3000

CMD ["/app/run.sh"]
```

```bash
# docker/run.sh
#!/bin/sh
set -e

# 首次启动初始化
if [ ! -f "$DATA_DIR/lazycat-search.db" ]; then
  echo "Initializing database..."
fi

# 运行数据库迁移
node dist/db/migrate.js

# 启动服务
exec node dist/index.js
```

### 8.2 懒猫微服打包

**package.yml：**

```yaml
package:
  id: cloud.lazycat.app.open-websearch
  name:
    zh-CN: 懒猫搜索
    en-US: Lazycat Search
  version: "1.0.0"
  author: Aas-ee
  description:
    zh-CN: 多引擎联网搜索服务，支持 Web 界面和 MCP 协议
    en-US: Multi-engine web search with Web UI and MCP protocol
  permissions:
    - net.internet
```

**lzc-manifest.yml：**

```yaml
version: "1"
services:
  web:
    image: lazycat-search:latest
    volumes:
      - /lzcapp/var/data:/data
      - /lzcapp/cache:/cache
    environment:
      DATA_DIR: /data
      CACHE_DIR: /cache
      PORT: "3000"
      NODE_ENV: production
    health_check:
      path: /api/health
      interval: 30s
      timeout: 5s

routes:
  - path: /
    upstream: web
    port: 3000

upstreams:
  - path: /mcp
    upstream: web
    port: 3000
```

**lzc-build.yml：**

```yaml
version: "1"
builds:
  web:
    context: .
    dockerfile: docker/Dockerfile
```

### 8.3 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | HTTP 监听端口 |
| `DATA_DIR` | `./data` | SQLite 数据库和持久化目录 |
| `ADMIN_USERNAME` | `admin` | 首次启动创建的管理员用户名 |
| `ADMIN_PASSWORD` | — | 首次启动创建的管理员密码（必填） |
| `JWT_SECRET` | — | JWT 签名密钥；生产环境必填，不写入数据库。 |
| `TOKEN_HASH_KEY` | — | Access Token HMAC 密钥；生产环境必填，独立于 JWT 密钥。 |
| `SETTINGS_ENCRYPTION_KEY` | — | 32 字节 Base64 密钥，用于加密持久化的代理 URL；生产环境必填。 |
| `OPEN_WEBSEARCH_URL` | `http://127.0.0.1:3210` | 私有 Open-WebSearch daemon 地址，只允许本机或 Docker 内部服务名。 |
| `OPEN_WEBSEARCH_VERSION` | `2.1.11` | 服务启动时校验的上游 daemon 版本。 |
| `NODE_ENV` | `development` | 生产环境设为 `production` |

## 9. 从 Open-WebSearch 复用的模块

| 上游模块 | 复用方式 | 改造点 |
|---------|---------|-------|
| 搜索引擎适配器（Bing、Baidu、DDG 等） | 抽取并重构为 `SearchEngine` 子类 | 统一接口、统一错误处理、注入代理配置 |
| 网页正文抓取（readability + cheerio） | 抽取为 `fetchService` | 增加 SSRF 防护层、重定向检查 |
| MCP Tool 定义（search、fetchWebContent 等） | 复用 Tool Schema 和语义 | 从 stdio transport 改为 Streamable HTTP；增加认证层 |

## 10. 版本规划

### V1 — 核心功能

- 6 个页面完整实现（Login + Search + MCP + Engines + Usage + Settings）
- Streamable HTTP MCP + Access Token 认证
- 多引擎聚合搜索 + URL 去重 + 正文抓取
- SSRF 防护
- SQLite 持久化
- Docker 镜像 + 懒猫微服 LPK
- 管理员单账户

### V1.1 — 增强

- Legacy SSE Transport 兼容
- 搜索结果导出
- 引擎定时健康检查
