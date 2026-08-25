# DEC-20260823-003：阶段 2 的数据、安全与 Open-WebSearch 接入方案

## 状态

已实施。关联需求：`Requirements/REQ-20260823-001-v1-implementation-baseline.md`。用户于 2026-08-23 明确要求开始并完成阶段 2，本记录中的推荐方案随之确认。

## 要解决的问题

阶段 2 需要为后续 Web 与 MCP 入口建立同一套持久化数据、认证与 Token 服务、缓存、搜索聚合和正文抓取安全边界。当前仓库只有 Next.js mock 门户；Open-WebSearch 源码和可供程序调用的库接口均不在仓库内。

Open-WebSearch 当前公开了本地 daemon HTTP API，适合长期进程调用；其 npm 包的公开入口是命令行程序，未声明稳定的库导入导出。上游仓库采用 Apache-2.0 许可，当前调查到的 HEAD 为 `e08a65b1eab856a1acdad8ba37a3b07479eb72af`。

## 备选方案

### 方案 A：Fastify 服务 + 私有 Open-WebSearch daemon HTTP 适配器（推荐）

新增 `packages/server`，由 Fastify 承载本项目的领域服务；搜索与正文服务通过 Open-WebSearch 的已文档化 daemon HTTP API 调用一个不对公网开放的上游进程。阶段 4 在 Docker 网络内运行该 daemon，不发布它的端口；开发环境由 `OPEN_WEBSEARCH_URL` 指向本机 daemon。服务端以接口注入方式测试，单元测试不访问互联网。

- 工作量：中等，需要一个新服务和约 20 个受影响文件。
- 风险：上游 HTTP 契约或抓取页面可能变化；用固定版本、健康检查、适配器契约测试和明确错误映射控制影响。
- 回退（历史阶段说明）：不涉及历史数据转换；停止 `packages/server` 可暂时回到原型门户，已创建的 SQLite 文件保留。当前门户已依赖 Fastify API，不把原型数据当作服务数据源。
- 适配既有设计：保留技术文档中的 Fastify、SQLite、Drizzle 和阶段 3 API 分层，同时避免依赖未公开的上游内部模块。

### 方案 B：将 Open-WebSearch 源码复制到本仓库后直接抽取模块

以当前上游提交为基线复制源码并改造其内部适配器、正文提取和安全模块。

- 工作量：高，需要持续同步上游变更、维护版权声明和多套依赖。
- 风险：模块边界不是公开契约，升级和安全修复成本较高。
- 回退：可回到固定提交，但代码体积和维护负担不会自动消失。

### 方案 C：重新实现搜索引擎与正文提取适配器

仅保留上游工具语义，所有网络抓取逻辑自行实现。

- 工作量：很高，难以在 V1 内达到已有引擎覆盖和安全测试水平。
- 风险：最容易出现引擎兼容、安全校验和反爬变化问题。
- 回退：简单，但前期投入不可复用到上游。

## 推荐方案与压力检查

采用方案 A。它使用上游已公开的 HTTP 契约，不把本项目绑定到未承诺稳定的内部文件；本项目仍在进入上游前校验输入，并固定上游版本。

- 外部依赖失效：上游 daemon 不可用时，返回 `UPSTREAM_UNAVAILABLE`，不伪造搜索结果；缓存命中仍可返回，并记录失败。
- 负载增长：首先受搜索引擎限流影响；本项目在阶段 3 的 HTTP 边界实施 Web/MCP/引擎限流，阶段 2 的聚合器保留每引擎并发上限和超时配置。
- 方案回退：数据库首次迁移只新增表；停止服务不会修改现有门户或删除数据。
- 前提变化：若上游停止维护或 HTTP API 不再兼容，可用同一个 `OpenWebSearchClient` 接口替换为方案 B 的本地实现；不改变数据库和领域服务接口。

## 拟议数据模型（待确认）

数据库为单个 SQLite 文件：`DATA_DIR/lazycat-search.db`。首次迁移已创建下列六张表；项目使用 Drizzle schema 定义及版本化 SQL 迁移，由受测迁移执行器在启动时应用。

| 表 | 作用 | 关键约束与保留规则 |
|---|---|---|
| `admin` | 历史单管理员账户 | 已由 `DEC-20260825-006` 和迁移 `0006_remove_legacy_admin` 取代并删除；不再存在本地密码账户。 |
| `access_token` | MCP Access Token | 只保存 HMAC-SHA-256 值和不可逆 Prefix；状态为 `active`、`disabled` 或 `revoked`；Token 删除只删除 Token 本身，审计日志保留。 |
| `engine` | 引擎配置与健康结果 | 固定 ID；`enabled`、`is_default`、Bing `search_mode`、健康状态、延迟和最近错误；Bing 仅允许 `auto`、`request`。 |
| `search_history` | Web 搜索历史 | 保存 query、引擎 JSON、结果数和创建时间；不保存正文；由 `history.enabled` 和保留天数控制写入与清理。 |
| `request_log` | Web/MCP 审计 | 保存请求 ID、入口、操作、Token ID 快照、引擎 JSON、耗时、缓存命中、结果数、状态、错误码和时间；默认不保存 query。 |
| `setting` | 非敏感运行配置与加密后的代理 URL | 普通值为 JSON 文本；`proxy.url` 始终以 AES-256-GCM 密文保存，使用 `SETTINGS_ENCRYPTION_KEY`，读取时才解密。 |

`request_log.token_id` 不设置外键，以保留已删除或已撤销 Token 的审计记录；同时记录不可逆的 `token_prefix`，便于管理员追溯。表中时间统一使用 UTC ISO-8601 文本。为以下查询创建索引：`access_token(hash)`、`search_history(created_at)`、`request_log(created_at)`、`request_log(channel, created_at)`、`request_log(token_id, created_at)`。

本段历史密钥方案已由 `DEC-20260825-006` 取代：不再使用 `JWT_SECRET`、`TOKEN_HASH_KEY` 或 `SETTINGS_ENCRYPTION_KEY` 外部环境变量。当前由每实例 `.S.DeployID` 派生 Cookie 签名、应用会话、MCP Token HMAC 与设置加密密钥；这些密钥均不会写入数据库、日志或 HTTP 响应。

## 拟议迁移与恢复（待确认）

1. 备份已有 `DATA_DIR/lazycat-search.db`（若存在）。
2. 执行 `0000_initial.sql`，只创建上述表和索引；不删除或修改已有数据。
3. 在空库中写入管理员和引擎默认值；管理员密码只来自启动环境变量，默认引擎为 `bing` 与 `duckduckgo`，Bing 为 `request`。
4. 迁移失败时停止启动，保留原数据库和迁移日志；恢复方式是替换为迁移前备份并修复迁移文件。

当前仓库没有数据库文件或旧版本应用，因此没有历史回填、双写或兼容窗口。后续任何表结构变更均需新建迁移，不能修改已执行迁移。

## 阶段 2 实施范围与结果

已建立 pnpm workspace 的 `packages/server`，包含：配置校验、Drizzle SQLite 存储、管理员与 Token 领域服务、内存 TTL/LRU 缓存、请求审计、聚合搜索、上游 daemon 客户端和正文服务。Token 的每分钟和每日限额使用审计记录的 UTC 窗口执行。缓存、历史和查询日志按 SQLite 设置读取；默认不保存 query。

正文请求会先校验 HTTP(S) URL，拒绝本地、私网、链路本地、IPv6 ULA 与 IPv4-mapped 地址；上游固定为 npm `open-websearch@2.1.11`，只允许私有 daemon 地址。服务启动时验证 daemon 的版本、`request` 搜索模式和 TLS 校验状态；上游负责实际 DNS 与每次重定向的二次检查。V1 即使收到 `auto` 选项，也只向上游发送 `request`。

本阶段不创建面向浏览器的 `/api/*` 路由、不修改既有 portal mock、不开通 `/mcp`、不构建 Docker 或懒猫微服产物。这些属于阶段 3 和阶段 4。

依赖：`fastify`、`drizzle-orm`、`drizzle-kit`、`better-sqlite3`、`jose`、`zod`、`@fastify/cookie`、`@fastify/rate-limit`，以及固定版本的 `open-websearch` daemon。运行时由懒猫 OIDC 配置与每实例派生密钥支撑认证；Open-WebSearch 只允许在私有本机地址提供服务。

## 验证结果

- [x] 空数据库可完成迁移、创建管理员、默认引擎与默认设置；重复启动不会重复初始化。
- [x] 管理员密码、Token 原文、JWT 密钥和代理凭据不写入日志或 SQLite 明文。
- [x] Token 只可验证，禁用、撤销、过期与超额状态均被拒绝。
- [x] 聚合搜索按 URL 去重，保留来源和部分失败；缓存、历史与 query 日志遵从持久化设置。
- [x] 危险 URL、DNS 私网结果、非 HTTP(S) URL、非私有上游和 TLS 校验关闭的上游均被拒绝。
- [x] 上游不可用、超时、格式错误与响应过大均映射为领域错误；测试使用假上游覆盖相关路径。
- [x] `pnpm lint`、`pnpm typecheck`、`pnpm test`、服务端构建、Next.js 生产构建均通过。
- 待阶段 4 实机回归：固定版本 daemon 对真实 DNS 重绑定、每次重定向、搜索引擎与网页抓取的运行时行为；当前测试不访问互联网。
