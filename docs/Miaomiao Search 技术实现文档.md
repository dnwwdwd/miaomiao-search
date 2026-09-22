---
id: "notus_7c82e4f0b553301e930e67c2"
created_by: notus_agent
title: "Miaomiao Search 技术实现文档"
---

# Miaomiao Search 技术实现文档

> 项目名：miaomiao-search　基础项目：Open-WebSearch　文档版本：v1.1　实现同步：2026-09-13

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
| 数据库 | SQLite | — | 单文件、零运维，适合自托管和懒猫微服 `/lzcapp/var/miaomiao-search/data` 持久化 |
| ORM | Drizzle ORM + drizzle-kit | ≥ 0.38 | 类型安全、SQL-first、SQLite 适配良好、迁移工具内建 |
| MCP SDK | @modelcontextprotocol/sdk | ≥ 1.x | 官方 SDK，Streamable HTTP Transport 开箱可用 |
| 认证 | 懒猫 OIDC Authorization Code + PKCE（jose）+ 本地账号密码 | — | 首次 OIDC 建立本地账户；密码使用 scrypt 哈希，验证 state、nonce、PKCE 与 ID Token |
| 日志 | pino | ≥ 9.x | Fastify 默认日志库，JSON 结构化输出 |
| 测试 | Node.js Test Runner、Next.js 构建、TypeScript、ESLint | — | 当前已有 3 个源代码契约测试，并具备 lint、类型与生产构建命令 |
| 容器 | 懒猫 LPK V2 + 自定义 Docker 镜像 | — | `web` 与 `api` 复用同一 Linux amd64 运行时镜像；API 内运行 Open-WebSearch daemon，并提供 Playwright Core + Chromium 正文渲染回退 |
| 包管理 | pnpm | ≥ 9.x | Monorepo workspace 支持、依赖安装快、磁盘占用小 |

## 2026-08-29 门户交互与引擎顺序补充

- SettingsService 保存 `search.homeEngineOrder` 和 `search.mcpEngineOrder` 两个 JSON 数组；旧数据缺键时按当前引擎列表推导，读取时过滤未知/重复 ID 并追加新增引擎。
- SearchService 的引擎解析接收 `channel`，Web 与 MCP 在省略引擎时分别使用对应顺序；MCP Tool schema 同步使用 MCP 顺序，显式 `engines` 数组不重排。
- 门户正文弹窗使用共享 Modal、骨架屏和安全文本链接渲染；`ErrorDisclosure` 只在用户展开详情时显示原始错误。正文 URL 仅渲染为 HTTP(S) 新窗口链接，不触发二次抓取。

### 1.1 当前 LPK、认证与持久化口径（2026-08-25）

- 发布包为 Linux x86-64 的单实例 LPK：`cloud.lazycat.app.miaomiao-search`（`0.1.1`）。`web` 运行 Next standalone，`api` 运行 Fastify 及只监听 `127.0.0.1:3210` 的 Open-WebSearch daemon。
- `api` 的运行脚本先通过包内启动器以锁定的 Open-WebSearch `2.1.11` 版本启动 daemon，轮询 `/health` 就绪后再启动 Fastify；脚本默认使用 `SEARCH_MODE=request`，退出或收到终止信号时会清理两个子进程。
- 根路径、`/api/auth/*` 和 `/mcp` 配置为应用公共路径；门户受保护 API 由应用会话校验，`/mcp` 支持外部 Bearer Token 和懒猫可信应用间委托两种入口。门户 Cookie、OIDC 会话与 MCP Token 互不复用。
- 仅 API 服务挂载 `/lzcapp/var/miaomiao-search/data`，其中的新实例目录由平台以空目录提供。LPK 不携带数据库文件，应用只迁移和写入默认值；不设置首次清空或任意删除挂载数据的逻辑。
- 门户不从 `X-HC-*` Header 自动创建会话。用户可在登录页选择 OIDC 或已建号的本地账号；OIDC 回调校验 state、nonce、签名、issuer、audience 与过期时间，并用 `X-HC-User-ID` 建立映射；受保护 API 会将当前 UID 与会话 UID 比较。
- 安装级密钥由 AppDomain 派生，分别用于 Cookie 签名、应用会话、MCP Token HMAC 与设置加密。身份库保存网关 UID、OIDC sub、账号、角色和 scrypt 密码哈希；业务库按 UID 隔离，历史本地 `admin` 表已由版本化迁移移除。
- web、Fastify API 和 Open-WebSearch daemon 由 Linux amd64 自定义镜像提供，LPK 只保留轻量说明文件；镜像先推送 Docker Hub，再复制到懒猫官方 registry。

## 2. 项目结构

### 2.1 后端与部署历史规划（非当前文件布局）

下列目录树保留为早期架构草图，不代表当前仓库的实际文件路径。当前可运行实现以 2.2、2.3 及第 7 节 API 表为准；当前 LPK 文件位于仓库根目录的 `package.yml`、`lzc-manifest.yml`、`lzc-build.yml` 与 `lzc/`。

```
miaomiao-search/
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
│   │   │   │   ├── fetch.ts     # 网页正文抓取与 HTTP(S) 约束
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
miaomiao-search/
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
│   ├── services/               # 认证、Token、设置、审计、缓存和搜索
│   └── upstream/               # Open-WebSearch HTTP 适配器
└── test/services.test.ts       # 领域服务与认证、网络边界测试
```

当前工程已实现 Fastify 管理 API、SQLite、懒猫 OIDC 门户会话、MCP Token、缓存、搜索聚合、正文 HTTP(S) URL 校验、Open-WebSearch 适配器、远程 `/mcp`、门户真实数据接入和 LPK V2 配置。

## 3. 数据库设计

SQLite 数据库文件路径为身份库 `DATA_DIR/identity.sqlite` 和用户库 `DATA_DIR/users/<sha256(gateway_uid)>/miaomiao-search.db`，懒猫微服部署时 `DATA_DIR=/lzcapp/var/miaomiao-search/data`。旧 LPK 单库不迁移、不读取；新目录只执行版本化迁移和默认设置初始化。

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
| `proxy.enabled` | `false` | 兼容旧实例的代理状态字段；懒猫微服 TUN/VPN 运行路径不由门户控制 |
| `proxy.url` | `""` | 兼容旧实例的加密代理地址；懒猫微服 TUN/VPN 运行路径不依赖该值 |
| `cache.search.enabled` | `true` | 搜索缓存开关 |
| `cache.search.ttl` | `3600` | 搜索缓存 TTL（秒） |
| `cache.search.maxSize` | `1000` | 最大缓存条数 |
| `cache.content.enabled` | `true` | 正文缓存开关 |
| `cache.content.ttl` | `86400` | 正文缓存 TTL（秒） |
| `rateLimit.web.rpm` | `30` | Web 每 IP 每分钟请求上限 |
| `search.defaultEngines` | `["bing","baidu","csdn","juejin","sogou"]` | 兼容保留的默认引擎设置；bootstrap 不因新增 Provider 覆盖已有用户值 |
| `search.defaultLimit` | `10` | 搜索默认返回数；未单独配置引擎数量时使用 |
| `search.maxLimit` | `50` | 最大结果数量 |
| `fetch.maxChars` | `50000` | 正文最大字符数 |
| `history.enabled` | `true` | 搜索历史开关 |
| `history.retentionDays` | `30` | 搜索历史保留天数；`-1` 表示永久保存 |
| `log.saveQuery` | `false` | 日志是否记录 Query 原文 |
| `mcp.legacySse` | `false` | Legacy SSE Transport 开关 |

## 4. 后端架构

### 4.1 Fastify 插件注册顺序

以下代码是早期注册顺序示意，保留用于说明依赖关系；当前可运行入口为 `packages/server/src/app.ts`，由 `buildServer()` 注册 Cookie、CORS、限流、健康检查、管理 API 和 Streamable HTTP `/mcp`。公网入口的 Host/Origin 边界由 Cloudflare Tunnel 或其他反向代理负责，应用不再维护 allowlist。

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
  → 优先使用懒猫网关注入的 X-HC-User-ID 作为本地账号；UserInfo/ID Token 仅作兼容回退
  → 首次回调写入 local_account；已有 OIDC 会话访问 /api/auth/me 时补建并同步 local_account
  → Set-Cookie: miaomiao_search_session；HttpOnly、Secure、SameSite=Lax，24h
  → 302 到固定首页
```

 应用会话通过 HttpOnly Cookie 传输，前端不直接接触其值。每个受保护 `/api/*` 请求校验 Cookie、当前 `X-HC-User-ID` 和 owner 映射；UID 缺失或切换时清除 Cookie 并返回认证错误。

```
POST /api/auth/logout
  → 清除 miaomiao_search_session 和 OIDC state Cookie
  → 前端进入公开的 `/login` 路由
GET /api/auth/logout
  → 清除相同 Cookie
  → 302 到 `/login`，用于兼容直接访问该接口的旧入口
```

**本地账号登录与改密：**

```
POST /api/auth/local/login
  → 按 account 查找已由 OIDC 建立的 local_account
  → scrypt 校验密码，建立 loginMethod=local 的应用会话
PUT /api/auth/password
  → OIDC 会话可直接设置；local 会话必须校验 currentPassword
  → 更新 password_hash，旧密码立即失效
GET /api/auth/me
  → 返回 account、name、role 和 loginMethod
```

**MCP Token 认证：**

```
POST /mcp
  Header: Authorization: Bearer <raw_token>
  → SHA-256(raw_token) → 查 access_token 表匹配 hash
  → 检查 status='active'、未过期、未超出 RPM/Daily 限额
  → 通过后进入 MCP Server 处理
```

**懒猫应用间委托认证：**

```
POST /mcp（通过 app.<包名>.lzcx 访问）
  Header: X-HC-SOURCE: app:<调用方包名>
  Header: X-HC-USER-ID: <当前懒猫 UID>
  → 仅在没有 Authorization Header 时检查这两个头
  → 按 UID 取得独立 UserStore；X-HC-USER-TICKET 不由应用解析
  → Tool 调用按该用户的 rateLimit.mcp.rpm 限流
  → 审计保留 channel=mcp，token_id/token_prefix 为空
```

带有 Authorization 但 Token 无效的请求直接返回 401，不回退到委托模式。委托入口只接受 `X-HC-SOURCE=app:<包名>`，不接受 `client` 来源或缺少 UID 的请求。

### 4.3 搜索引擎适配层

从 Open-WebSearch 抽取并重构搜索引擎适配器：

```typescript
// engines/base.ts
export interface SearchResult {
  title: string;
  url: string;
  description: string;
  thumbnailUrl?: string;
  videoMeta?: { author?: string; duration?: string; views?: number; likes?: number; favorites?: number; comments?: number; publishedAt?: number };
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

当前实现已按引擎独立发起搜索并返回 `engineResults[]` 分组结果，同时保留 `results` 平铺聚合结果以兼容现有 MCP 客户端。每个引擎的有效数量为 `min(调用方 limit, engine.result_limit 或 search.defaultLimit, Provider.maxResults, search.maxLimit)`，先按引擎截取，再按规范化 URL 去重并合并来源标签；同 URL 的已有结果没有封面或视频元数据时会补入后续 Provider 的 `thumbnailUrl`/`videoMeta`。`engine.result_limit` 为空时使用搜索默认值（初始 10）；管理 API、首页分组/聚合视图、历史兼容和 MCP 已完成接入。

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

### 4.5 正文抓取与网络边界

```typescript
// services/search.ts
export async function fetchWebContent(url: string, maxChars: number): Promise<FetchResult> {
  // 1. 保留 URL 解析与 HTTP(S) 协议检查；不解析 DNS，也不拦截私网/回环目标
  assertHttpUrlWithoutCredentials(url);

  // 2. 由 Open-WebSearch 发起请求并按其运行时设置处理重定向
  const response = await openWebSearch.fetchWebContent({ url, maxChars });

  // 3. 限制响应体和正文长度，并安全转换为纯文本
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

当前正文网络边界由部署环境决定：可访问应用运行环境的任意 HTTP(S) 主机，包括私网、回环、链路本地、metadata 以及解析到这些地址的域名。应用仍拒绝无效 URL、非 HTTP(S) Scheme、带凭据 URL，并保留上游超时、响应体大小、正文最大长度、认证、限流和审计。站点专用 MCP Tool 仍只接受其产品定义的站点域名。

Open-WebSearch 的通用正文读取采用多策略回退：先读取 Markdown/纯文本或 HTML 语义容器，再检查 `articleBody`、`data-article-body`、JSON-LD、`__NEXT_DATA__` 等结构化字段；HTML 页面同时尝试 Mozilla Readability，遇到空壳 SPA 或挑战页时再使用带 Playwright Core + Chromium 的浏览器 HTML 渲染与浏览器 Cookie。浏览器回退会等待页面脚本完成并读取最终 DOM；结构化解析路径仍只把脚本当作文本，不执行其中的代码，也不自动抓取提取出的链接。每次响应保留 `retrievalMethod`、`extractionMethod` 和 `readabilityApplied` 元数据。

当页面请求完成但所有候选都没有正文时，daemon 返回 422 `content_not_extracted`，Fastify 映射为 `CONTENT_NOT_EXTRACTED`；这个状态与参数错误、超时、TLS 和响应过大错误分开处理，Web 与 MCP 共享同一 `SearchService.fetchContent` 路径。

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
- 搜索：每个引擎独立使用 `query + engine + effectiveLimit + searchMode + providerVersion`；Provider 版本变化自然切换缓存键，凭据保存或清除会清空当前用户搜索缓存
- 正文：`JSON.stringify({ url, maxChars, extractor: "multi-strategy-v3" })`；提取策略升级时通过版本字段主动避开旧正文结果

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

### 4.9 Provider Registry 与外部搜索源

`packages/server/src/providers/registry.ts` 为每个用户实例创建 Provider。六个旧引擎使用 `OpenWebSearchProvider`，Exa、Firecrawl、Tavily、GitHub 和 Bilibili 在 Fastify 内直接访问固定 HTTPS Endpoint：Exa `/search`、Firecrawl `/v2/search`、Tavily `/search`、GitHub REST `search.repos` 和 Bilibili `/x/web-interface/search/all/v2`。知乎由 `ZhihuProvider` 组合调用 daemon 的 Bing/Baidu，构造 `site:zhuanlan.zhihu.com` 并做精确主机过滤。通用 HTTP 工具支持可注入 `fetch`、超时、2 MiB 响应体上限、禁止自动重定向，并在非 2xx 时保留状态码与响应头；不会记录 Authorization、Cookie、完整响应体或带敏感信息的请求 URL。

Exa、Firecrawl 与 Tavily 从当前用户的 `SettingsService` 读取加密 API Key；GitHub 使用 `@octokit/rest`，查询追加 `is:public`，只返回公共仓库并按 Token 变化重建 Client。Exa 的 Web/MCP 请求直接由 Fastify 发往官方 Search API，不依赖 `EXA_API_KEY` 环境变量。Bilibili 不使用登录态，首次 HTTP 412 或 `code=-412` 时只做一次首页匿名 Cookie 预热和一次重试，Cookie 只存在单次调用内存中。Bilibili 结果只接受视频分组，过滤直播条目，清理 HTML/实体并校验 `thumbnailUrl` 必须是无凭据 HTTPS `*.hdslb.com` URL，同时透传作者、时长、播放、点赞、收藏、评论和发布时间等可选 `videoMeta`。

## 5. MCP Server 实现

### 5.1 Server 实例

```typescript
// mcp/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const mcpServer = new McpServer({
  name: 'miaomiao-search',
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
| Login | `LoginScreen`, `ErrorAlert` | `GET /api/auth/oidc/start`、`GET /api/auth/oidc/callback`、`POST /api/auth/local/login` |
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
| POST | `/api/auth/local/login` | — | 使用 OIDC 已建立的账号和本地密码登录 |
| PUT | `/api/auth/password` | 应用会话 Cookie | 修改当前账号密码 |
| GET/POST | `/api/auth/logout` | — | 清除应用会话；前端 POST 后进入 `/login`，GET 直接 302 到 `/login` |
| GET | `/api/auth/me` | 应用会话 Cookie | 返回当前账户和登录方式 |

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
      "thumbnailUrl": "https://i0.hdslb.com/...",
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
| PATCH | `/api/engines/:id` | 应用会话 | 修改引擎配置（enabled, isDefault, searchMode, resultLimit；resultLimit 可为 null 清空；apiKey 可用于支持必需/可选凭据的引擎） |
| POST | `/api/engines/:id/test` | 应用会话 | 测试搜索 |

`GET /api/engines` 在保留旧字段的同时返回 `supportsApiKey`、`apiKeyOptional`、`credentialLabel`、`credentialPlaceholder`、固定官方申请入口 `credentialUrl` 和 `maxResults`。Exa/Firecrawl/Tavily 的 Key 必须配置后才能启用；GitHub 无 Token 也可启用；B站提交 `apiKey` 返回不支持错误。启用前和修改结果数量时由服务端校验 Provider 约束，凭据变化会清空当前用户搜索缓存。

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
| POST | `/mcp` | Bearer Token 或可信懒猫应用间头 | Streamable HTTP MCP Endpoint；委托请求需 `X-HC-SOURCE=app:<包名>` 与 `X-HC-USER-ID` |
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
if [ ! -f "$DATA_DIR/identity.sqlite" ]; then
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
    zh-CN: 喵喵搜索
    en-US: Miaomiao Search
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
    image: miaomiao-search:latest
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

当前 LPK V2 还会导出 Resource MCP provider：

```yaml
resource_exports:
  - kind: mcp-providers
    source: ./resources/mcp-providers
```

provider 文件位于 `resources/mcp-providers/miaomiao-search/mcp.yml`，内容为 `endpoint: /mcp`。安装到 `lzcos >= v1.5.2` 后，系统会将它暴露给小龙猫、Codex 等 Agent。Agent 通过 `app.cloud.lazycat.app.miaomiao-search.lzcx/mcp` 访问时，ingress 消费用户票据并注入委托身份头。

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
| `OPEN_WEBSEARCH_URL` | `http://127.0.0.1:3210` | Open-WebSearch daemon 的 HTTP(S) 地址；不限制主机是否为本机、私网或公网。 |
| `OPEN_WEBSEARCH_VERSION` | `2.1.11` | 服务启动时校验的上游 daemon 版本。 |
| `NODE_ENV` | `development` | 生产环境设为 `production` |

## 9. 从 Open-WebSearch 复用的模块

| 上游模块 | 复用方式 | 改造点 |
|---------|---------|-------|
| 搜索引擎适配器（Bing、Baidu、DDG 等） | 抽取并重构为 `SearchEngine` 子类 | 统一接口、统一错误处理、注入代理配置 |
| 网页正文抓取（readability + cheerio） | 抽取为 `fetchService` | 保留 HTTP(S)、响应体和正文长度约束；DNS/私网/重定向 SSRF 过滤按 Cloudflare Tunnel 部署决策移除 |
| MCP Tool 定义（search、fetchWebContent 等） | 复用 Tool Schema 和语义 | 从 stdio transport 改为 Streamable HTTP；支持 Bearer Token 与懒猫委托认证 |

## 10. 版本规划

### V1 — 核心功能

- 6 个页面完整实现（Login + Search + MCP + Engines + Usage + Settings）
- Streamable HTTP MCP + Access Token 与懒猫应用间委托认证
- 多引擎聚合搜索 + URL 去重 + 正文抓取
- HTTP(S) 正文抓取约束（协议、超时、响应体与正文长度）
- SQLite 持久化
- Docker 镜像 + 懒猫微服 LPK
- 管理员单账户

### V1.1 — 增强

- Legacy SSE Transport 兼容
- 搜索结果导出
- 引擎定时健康检查

## 11. 四类新增搜索源实现（2026-08-31）

截至 2026-08-31，搜索目录包含 11 个引擎：Bing、Baidu、DuckDuckGo、Exa、CSDN、Juejin、Sogou、Firecrawl、Tavily、GitHub 和 Bilibili。四个新增引擎首次写入用户库时均为关闭状态，bootstrap 只插入缺失引擎，不覆盖已有用户的启用、默认、数量和顺序配置；2026-09-13 新增的知乎实验见下方 11.1。

Fastify 为每个用户实例创建 `SearchProviderRegistry`。六个旧引擎通过 `OpenWebSearchProvider` 继续调用 daemon；Exa、Firecrawl、Tavily、GitHub 和 Bilibili 在 Fastify 内使用固定 HTTPS Endpoint。正文抓取仍由 `SearchService` 复用 Open-WebSearch 链路，不与搜索 Provider 混用。

统一 `SearchResult` 增加可选 `thumbnailUrl` 与 `videoMeta`。Bilibili 只解析 `result_type=video`，过滤 `live_room`，清理标题和摘要 HTML/实体，生成 BVID 视频链接；`pic` 仅接受无凭据的 HTTPS `*.hdslb.com` URL。封面由 Web、聚合结果和历史快照按 16:9 右侧缩略图展示，点击 B站结果进入视频详情弹窗而不读取网页正文；浏览器使用 lazy loading、`no-referrer` 和 favicon 回退，服务端不下载、代理或持久化图片。

Exa、Firecrawl 与 Tavily 使用当前用户的加密 Key，GitHub Token 可选且查询固定追加 `is:public` 并过滤私有仓库；Bilibili 不读取登录态。Bilibili 首次收到 HTTP 412 或响应 `code=-412` 时只做一次匿名首页 Cookie 预热和一次重试，Cookie 只存在本次调用内存中。通用 HTTP 工具限制 20 秒级超时、2 MiB 响应体、禁止自动重定向，并保留非 2xx 状态码和响应头用于 Provider 错误映射。

MCP `search` Tool 名称与返回结构保持不变，工具描述和引擎枚举按当前用户启用状态及 MCP 顺序动态生成。引擎管理 API 返回凭据模式、标签、占位符和 Provider `maxResults`；必需 Key、可选 Token、Bilibili/知乎无凭据和健康状态映射均由服务端校验。默认 CI 使用注入的 fetch/Octokit Client 测试，不访问真实外部 API。

### 11.1 知乎站内搜索实验（2026-09-13）

知乎不接入官方搜索 API、CLI Token 或 Cookie。`packages/server/src/providers/zhihu-provider.ts` 构造 `site:zhuanlan.zhihu.com <query>`，先调用 Open-WebSearch daemon 的 Bing request 模式；过滤精确 `zhuanlan.zhihu.com` 主机后，若无匹配结果再请求 Baidu。结果统一写入 `engines: ["zhihu"]`，Provider 上限为 20 条，首次 bootstrap 为关闭且非默认，不新增数据库字段或迁移。

知乎正文沿用 `SearchService.fetchContent` 和通用 `fetch-web`，因此继续具备 HTTP(S)/无凭据校验、重定向和响应体/正文上限、Readability、结构化数据和 Playwright 浏览器回退。门户仅在阅读器中增加知乎标题、Tag 和“打开知乎”按钮；页面可访问但无正文时仍返回 `CONTENT_NOT_EXTRACTED`，显示重试与打开源站入口。在线 POC 受 Bing 索引、知乎 403 challenge 和目标运行时系统依赖影响，详见 `docs/Requirements/REQ-20260913-001-zhihu-search-source.md`。
