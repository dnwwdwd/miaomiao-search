---
id: "notus_7c82e4f0b553301e930e67c2"
created_by: notus_agent
title: "Lazycat Search 技术实现文档"
---

# Lazycat Search 技术实现文档

> 项目名：lazycat-search　基础项目：Open-WebSearch　文档版本：v1.0　实现同步：2026-08-24

## 1. 技术栈总览

| 层 | 技术 | 版本要求 | 选型理由 |
|---|------|---------|---------|
| 运行时 | Node.js | ≥ 20 LTS | 上游 Open-WebSearch 基于 Node.js，复用其搜索引擎适配层和 MCP SDK |
| 语言 | TypeScript | ≥ 5.4 | 全栈类型安全，前后端共享类型定义 |
| 后端框架 | Fastify | ≥ 5.x | 高性能、原生 TypeScript 支持、插件体系成熟、JSON Schema 校验内建 |
| 前端框架 | Next.js（React） | ≥ 16 | 使用 App Router 管理页面与布局，为后续服务端集成保留边界 |
| 前端构建 | Next.js / Turbopack | — | 使用 Next.js 官方开发与生产构建流程 |
| UI 组件库 | 项目内基础组件 + Tailwind CSS v4 | — | Button、Input、SearchInput、Tag、Tabs、Switch、RadioGroup、Dropdown、Select、Modal、Toast 由项目源码维护，避免运行时组件依赖 |
| 状态管理 | React Context + useState | React 内建 | Context 保存页面会话数据和短暂交互状态；引擎、历史、Token、设置和审计数据通过同源管理 API 刷新 |
| HTTP 客户端 | 原生 fetch 封装 | 浏览器内建 | `src/lib/api.ts` 统一处理 Cookie、JSON 请求和服务端错误；仅开发环境使用 Next rewrite，LPK 由网关直接转发 `/api/` 与 `/mcp` |
| 数据库 | SQLite | — | 单文件、零运维，适合自托管和懒猫微服 `/lzcapp/var/lazycat-search/data` 持久化 |
| ORM | Drizzle ORM + drizzle-kit | ≥ 0.38 | 类型安全、SQL-first、SQLite 适配良好、迁移工具内建 |
| MCP SDK | @modelcontextprotocol/sdk | ≥ 1.x | 官方 SDK，Streamable HTTP Transport 开箱可用 |
| 认证 | 懒猫 OIDC Authorization Code + PKCE（jose） | — | 用户点击门户按钮发起授权；验证 state、nonce、PKCE 与 ID Token，不保留本地密码账户 |
| 日志 | pino | ≥ 9.x | Fastify 默认日志库，JSON 结构化输出 |
| 测试 | Node.js Test Runner、Next.js 构建、TypeScript、ESLint | — | 当前已有 3 个源代码契约测试，并具备 lint、类型与生产构建命令 |
| 容器 | 懒猫 LPK V2 | — | `web` 与 `api` 使用懒猫 Node 基础镜像；API 内运行私有 Open-WebSearch daemon |
| 包管理 | pnpm | ≥ 9.x | Monorepo workspace 支持、依赖安装快、磁盘占用小 |

### 1.1 当前 LPK、认证与持久化口径（2026-08-25）

- 发布包为 Linux amd64 的多实例 LPK：`cloud.lazycat.app.lazycat-search`（`0.1.0`）。`web` 运行 Next standalone，`api` 运行 Fastify 及只监听 `127.0.0.1:3210` 的 Open-WebSearch daemon。
- 根路径和 `/api/` 受懒猫网关登录保护；只有 `/mcp` 配置为 `public_path`，并且仍只接受本应用独立签发的 Bearer Token。门户 Cookie、OIDC 会话与 MCP Token 互不复用。
- 门户不从 `X-HC-*` Header 自动登录。用户必须在登录页点击按钮，走 OIDC Authorization Code + PKCE 回调；服务端校验 state、nonce、签名、issuer、audience 与过期时间。
- 仅 API 服务挂载 `/lzcapp/var/lazycat-search/data`，其中的新实例目录由平台以空目录提供。LPK 不携带数据库文件，应用只迁移和写入默认值；不设置首次清空或任意删除挂载数据的逻辑。
- 每实例密钥由 `.S.DeployID` 派生，分别用于 Cookie 签名、应用会话、MCP Token HMAC 与设置加密。历史本地 `admin` 表及密码认证已由版本化迁移移除。

## 2. 项目结构

### 2.1 后端与部署历史规划（非当前文件布局）

下列目录树保留为早期架构草图，不代表当前仓库的实际文件路径。当前可运行实现以 2.2、2.3 及第 7 节 API 表为准；当前 LPK 文件位于仓库根目录的 `package.yml`、`lzc-manifest.yml`、`lzc-build.yml` 与 `lzc/`。

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
│   │   │   │   ├── settings.ts  # 历史规划：配置 API
│   │   │   │   ├── usage.ts     # 历史规划：统计 API
│   │   │   │   └── mcp-admin.ts # 历史规划：MCP 管理 API
│   │   │   ├── mcp/
│   │   │   │   ├── server.ts    # MCP Server 实例，注册 Tool
│   │   │   │   ├── transport.ts # Streamable HTTP + Legacy SSE Transport 适配
│   │   │   │   └── tools/       # search, fetchWebContent, fetchCsdnArticle...
│   │   │   ├── engines/
│   │   │   │   ├── manager.ts   # 引擎注册、状态管理、健康检查
│   │   │   │   ├── base.ts      # SearchEngine 抽象基类
│   │   │   │   └── adapters/    # bing.ts, baidu.ts, duckduckgo.ts, exa.ts...
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
│   ├── lib/mock-data.ts         # 历史原型数据与客户端配置模板；不作为服务端数据源
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
├── drizzle/0001_search_history_snapshot.sql # 搜索历史结果快照迁移
├── drizzle/0002_engine_result_limit.sql     # 引擎独立结果数量迁移
├── src/
│   ├── db/                     # Drizzle schema、SQLite 连接和迁移执行器
│   ├── services/               # 认证、Token、设置、审计、缓存、搜索和 SSRF
│   └── upstream/               # Open-WebSearch 私有 daemon HTTP 适配器
└── test/services.test.ts       # 领域服务与安全路径测试
```

当前工程已实现 Fastify 管理 API、SQLite、懒猫 OIDC 门户会话、MCP Token、缓存、搜索聚合、正文 URL 校验、Open-WebSearch 适配器、远程 `/mcp`、门户真实数据接入和 LPK V2 配置。

## 3. 数据库设计

SQLite 数据库文件路径：`DATA_DIR/lazycat-search.db`，懒猫微服部署时 `DATA_DIR=/lzcapp/var/lazycat-search/data`。新实例挂载空目录，不携带数据库文件；迁移和默认设置只补齐缺失项，不会清理已挂载的数据。

### 3.1 表结构

```sql
-- MCP Access Token（独立于懒猫账户与门户会话）
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
  result_limit INTEGER,                 -- 每引擎结果数量；NULL 使用搜索默认值 search.defaultLimit（初始 10）
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
  result_snapshot TEXT,                 -- JSON: results + failures + 可选 engineResults；不保存正文、Token 或认证信息
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 请求日志
CREATE TABLE request_log (
  id           TEXT    PRIMARY KEY,     -- Request ID
  channel      TEXT    NOT NULL,        -- 'web' | 'mcp'
  operation    TEXT    NOT NULL,        -- 'search' | 'fetchWebContent' | ...
  token_id     TEXT,                    -- MCP 调用关联的 Token ID
  token_prefix TEXT,                    -- 列表展示用 Prefix
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
| `search.defaultLimit` | `10` | 搜索默认返回数；未单独配置引擎数量时使用 |
| `search.maxLimit` | `50` | 最大结果数量 |
| `fetch.maxChars` | `50000` | 正文最大字符数 |
| `history.enabled` | `true` | 搜索历史开关 |
| `history.retentionDays` | `30` | 搜索历史保留天数；`-1` 表示永久保存 |
| `log.saveQuery` | `false` | 日志是否记录 Query 原文 |
| `mcp.legacySse` | `false` | Legacy SSE Transport 开关 |

## 4. 后端架构

### 4.1 Fastify 插件注册顺序

以下代码是早期注册顺序示意，保留用于说明依赖关系；当前可运行入口为 `packages/server/src/app.ts`，由 `buildServer()` 注册 Cookie、CORS、限流、Host/Origin 校验、健康检查、管理 API 和 Streamable HTTP `/mcp`。

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

**门户 OIDC 登录（Web）：**

```
GET /api/auth/oidc/start（由用户点击登录按钮发起）
  → 生成 state、nonce、PKCE verifier/challenge
  → Set-Cookie: 短期签名 OIDC state；HttpOnly、Secure、SameSite=Lax
  → 302 到懒猫 OIDC 授权端
GET /api/auth/oidc/callback
  → 校验 state、nonce、PKCE、ID Token 签名、issuer、audience 与 exp
  → Set-Cookie: lazycat_search_session；HttpOnly、Secure、SameSite=Lax，24h
  → 302 到固定首页
```

应用会话通过 HttpOnly Cookie 传输，前端不直接接触其值。每个受保护 `/api/*` 请求校验该会话；不会以 `X-HC-*` Header 自动创建应用登录状态。

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

当前实现已按引擎独立发起搜索并返回 `engineResults[]` 分组结果，同时保留 `results` 平铺聚合结果以兼容现有 MCP 客户端。每个引擎的有效数量为 `min(调用方 limit, engine.result_limit 或 search.defaultLimit)`，先按引擎截取，再按规范化 URL 去重并合并来源标签。`engine.result_limit` 为空时使用搜索默认值（初始 10）；管理 API、首页分组视图、历史兼容和 MCP 已完成接入。

```typescript
// services/search.ts
export async function aggregateSearch(params: {
  query: string;
  engines: string[];
  limit?: number;
  searchMode?: string;
}): Promise<{
  results: MergedResult[];
  engineResults: EngineResultGroup[];
  resultCount: number;
  failures: EngineFailure[];
  cached: boolean;
}> {
  // 每个引擎独立解析有效数量并使用 query + engine + limit + searchMode 缓存键
  const tasks = params.engines.map(id =>
    engineManager.get(id).search({
      query: params.query,
      limit: Math.min(params.limit ?? getEngineLimit(id), getEngineLimit(id)),
      searchMode: id === 'bing' ? 'request' : undefined,
    })
  );
  const settled = await Promise.allSettled(tasks);

  // 收集每引擎分组，再生成兼容的聚合结果
  const allResults: SearchResult[] = [];
  const engineResults: EngineResultGroup[] = [];
  const failures: EngineFailure[] = [];
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      const group = { engine: params.engines[i], results: result.value.slice(0, getEngineLimit(params.engines[i])), cached: false };
      engineResults.push(group);
      allResults.push(...group.results);
    } else {
      const failure = { engine: params.engines[i], error: result.reason };
      failures.push(failure);
      engineResults.push({ engine: params.engines[i], results: [], cached: false, failure });
    }
  });

  // 4. URL 去重合并 — 同一 URL 的结果合并来源引擎标签
  const merged = deduplicateByUrl(allResults);

  return { results: merged, engineResults, resultCount: merged.length, failures, cached: engineResults.length > 0 && engineResults.every((group) => group.cached) };
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
- 搜索：每个引擎独立使用 `SHA-256(query + engine + effectiveLimit + searchMode)`；配置数量变化自然切换缓存键
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

当前 Usage 实现由 `AuditService.usage()` 提供范围统计，接口参数为 `from`、`to`、`channel`、`operation`、`status`、`engine`、`page`、`pageSize` 和 `timeZone`。默认范围为最近 7 天，查询最多 365 天；范围使用左闭右开时间比较。响应同时返回 summary、Web/MCP channel 分布、按用户时区生成的小时/日趋势、Operation 统计、引擎统计、facets 和分页 logs。MCP `search` 与 `fetchWebContent` 通过 `SearchService` 分别写入 `channel=mcp` 的对应审计记录，统计不会读取或重复计算 `search_history` 快照。

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

当前门户把五个管理页面保持在一个受控容器中，以复现静态原型的无刷新导航；登录、服务状态、页面数据和操作均已通过 Fastify 管理 API 接入。开发环境的 Next rewrite 提供同源 `/api/*` 与 `/mcp`；LPK 生产环境由网关直接转发，应用会话 Cookie 由服务端校验。

### 6.2 状态管理

```typescript
// portal-context.tsx — API 数据与浏览器内短暂交互状态
// SearchPage — 搜索输入、引擎选择、结果列表、正文面板和历史快照
// SettingsPage — 读取并更新服务端持久化设置
```

关键原则：
- Token、引擎、Usage、历史、设置和 MCP Tool 状态由受保护 API 提供，刷新页面会重新读取服务端数据。
- `src/lib/mock-data.ts` 只保留静态客户端模板和历史原型常量，不参与服务数据读写。
- 搜索历史快照只保存结果元数据与失败引擎信息，不保存网页正文、Token 或认证信息。

### 6.3 页面与组件对应

| 页面 | 关键组件 | 数据来源 |
|------|---------|---------|
| Login | `LoginScreen`, `ErrorAlert` | `GET /api/auth/oidc/start`、`GET /api/auth/oidc/callback` |
| Search | `SearchInput`, `EngineSelector`, `LimitSelect`, `AdvancedOptions`, `ResultList`, `ResultCard`, `FailureBanner`, `ReadingPanel`, `HistoryDrawer` | `POST /api/search`, `POST /api/fetch-content` |
| MCP | `ServiceStatus`, `ToolList`, `TokenTable`, `CreateTokenDialog`, `ConfigTemplate`, `ConnectionTest` | `GET /api/mcp`, `/api/tokens` |
| Engines | `EngineTable`, `StatusBadge`, `TestDialog` | `GET /api/engines`, `POST /api/engines/:id/test` |
| Usage | `OverviewCards`, `EngineChart`, `LogTable` | `GET /api/usage` |
| Settings | `ProxyForm`, `CacheForm`, `RateLimitForm`, `SearchDefaultsForm`, `DataManagement` | `GET/PUT /api/settings` |

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
| GET | `/api/auth/oidc/start` | 网关登录 | 用户点击后发起 OIDC 授权码登录 |
| GET | `/api/auth/oidc/callback` | 网关登录 | 校验回调并建立应用会话 |
| POST | `/api/auth/logout` | — | 登出（清除 Cookie） |
| GET | `/api/auth/me` | 应用会话 Cookie | 返回当前 OIDC 用户 |

### 7.2 搜索

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| POST | `/api/search` | 应用会话 | 按引擎分组并返回兼容的聚合结果 |
| POST | `/api/fetch-content` | 应用会话 | 抓取网页正文 |

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
  "engineResults": [
    {
      "engine": "bing",
      "limit": 5,
      "results": [/* 当前引擎的结果 */],
      "cached": false,
      "failure": null
    }
  ],
  "failures": [
  ],
  "cached": false,
  "resultCount": 8
}
```

### 7.3 引擎管理

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| GET | `/api/engines` | 应用会话 | 引擎列表 |
| PATCH | `/api/engines/:id` | 应用会话 | 修改引擎配置（enabled, isDefault, searchMode, resultLimit；resultLimit 可为 null 清空） |
| POST | `/api/engines/:id/test` | 应用会话 | 测试搜索 |

### 7.4 Token 管理

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| GET | `/api/tokens` | 应用会话 | Token 列表 |
| POST | `/api/tokens` | 应用会话 | 创建 Token，返回完整 Secret（仅一次） |
| PATCH | `/api/tokens/:id` | 应用会话 | 修改状态（disable / enable / revoke） |
| DELETE | `/api/tokens/:id` | 应用会话 | 删除 Token |

### 7.5 系统配置

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| GET | `/api/settings` | 应用会话 | 读取全部配置 |
| PUT | `/api/settings` | 应用会话 | 批量更新配置，并按当前保留策略清理历史 |
| DELETE | `/api/history` | 应用会话 | 清空搜索历史；不受 `-1` 永久保存影响 |

### 7.6 Usage

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| GET | `/api/usage` | 应用会话 | 按时间范围和 Channel/Operation/状态/引擎筛选返回完整统计、趋势和服务端分页审计日志 |

### 7.7 MCP 管理

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| GET | `/api/mcp` | 应用会话 | 返回 MCP Endpoint 元数据和 Tool 状态 |
| PUT | `/api/mcp/tools` | 应用会话 | 批量更新 Tool 启停状态 |

### 7.8 MCP Endpoint

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| POST | `/mcp` | Bearer Token | Streamable HTTP MCP Endpoint |
| GET/DELETE | `/mcp` | — | 当前实现拒绝非 POST MCP 请求；Legacy SSE 仅保留为后续兼容范围 |

## 8. 历史部署草图（已被 LPK V2 方案取代）

> 当前 LPK V2 的实际口径以第 1.1 节、根目录的 `package.yml`、`lzc-manifest.yml`、`lzc-build.yml` 和 `lzc/` 脚本为准。下列内容仅保留为早期阶段草图，不代表当前实现，也不得用于部署。

### 8.1 Docker 构建

```dockerfile
# docker/Dockerfile
# ---- Build Stage ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/ packages/
RUN corepack enable pnpm && pnpm install --frozen-lockfile
RUN pnpm build                     # 当前 Next.js 门户的生产构建；此段仍是部署规划示意
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
