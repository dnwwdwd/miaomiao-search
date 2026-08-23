# lazycat-search V1 实施进度

> 关联需求：`REQ-20260823-001`
> 状态：进行中
> 最后更新：2026-08-23

## 目标、范围与确认口径

- 已确认目标：实现管理员 Web 搜索与远程 MCP 两个入口的自托管联网搜索服务，并在 V1 提供中文/英文切换。
- 包含：PRD 定义的六个页面、多引擎搜索、正文抓取、MCP、认证、SQLite、审计、Docker 和懒猫微服部署。
- 阶段边界：阶段 3 已创建面向浏览器的 `/api/*`、MCP Endpoint 与真实门户数据接入；Docker 与懒猫微服产物仍未创建。
- 关联决策：`Decisions/DEC-20260823-001-v1-search-mode.md`、`Decisions/DEC-20260823-002-nextjs-frontend.md`。
- 主要风险与依赖：V1 只使用 HTTP request 搜索；`open-websearch@2.1.11` 作为私有 daemon 依赖运行；真实搜索引擎和 MCP 客户端需在具备网络和凭据的环境回归。

## 阶段计划

| 阶段 | 目标与交付物 | 前置条件 | DoD / 验证证据 | 状态 |
|---|---|---|---|---|
| 0 | 建立协作文档、核对 PRD 与原型 | 已有 PRD、技术文档和原型 | 文档地图、需求/决策/进度记录齐全；原型差异已补齐并完成浏览器检查 | 已完成 |
| 1 | 建立 Next.js 门户工程 | 用户确认前端迁移范围 | App Router、基础组件、六页面 JSX、每页 mock 数据、可重复本地构建命令 | 已完成 |
| 2 | 实现数据、安全、搜索和正文服务 | 阶段 1 完成；`DEC-20260823-003` 已确认 | 迁移、SSRF、认证、缓存、聚合搜索和测试通过 | 已完成 |
| 3 | 实现 MCP、管理 API 和 Web 页面 | 阶段 2 完成 | 六页面接入真实 API；MCP 认证、Tool 和审计可验证 | 已完成 |
| 4 | 部署与端到端验证 | 阶段 3 完成 | Docker、懒猫微服包与真实用户路径完成回归 | 待开始 |

## 进度日志

### 2026-08-23 — 阶段 0

- 完成：创建协作契约、文档地图、需求与决策台账、功能进度记录、UI/流程文档和总体进度文档；检查静态门户原型。
- 验证证据：仓库根目录与治理目录已建立，门户静态页面含 Login、Search、MCP、Engines、Usage、Settings。
- 阻塞或变更：用户确认 V1 保留中英文切换，移除 Playwright；Search、MCP、Engines、Usage 与 Settings 的原型缺项已补齐。
- 下一步：确认上游复用方式后初始化工程目录与依赖。

### 2026-08-23 — 门户原型补齐

- 完成：保留中英文切换；移除 Playwright 选项；补充 Search 错误状态、阅读 URL 信息与历史结果数量，Token 时间/撤销/过期日期，引擎测试时间与状态，Usage 日志字段/筛选/分页，以及 Settings 的缓存、限流、默认引擎、历史和代理编辑。
- 验证证据：浏览器检查通过了新增控件、30 天 Token 过期日期、Usage 按 Channel 筛选、375px 窄屏无横向溢出，以及英文导航、Token 占位符和无 Playwright 文案。
- 待实机回归：所有交互仍使用浏览器内 mock 数据，尚未接入真实 API、认证、数据库或 MCP Endpoint。

### 2026-08-23 — Next.js 门户迁移

- 完成：创建 Next.js 16、React 19、TypeScript、Tailwind CSS v4 与 ESLint 工程；把静态页面迁移为 Login、Search、MCP、Engines、Usage、Settings 的 JSX；建立 Button、Card、Input、SearchInput、Tag、Tabs、Switch、Select、Modal、Toast 基础组件和页面 mock 数据。
- 验证证据：`pnpm test`（5 个源代码契约测试）、`pnpm lint`、`pnpm typecheck`、`pnpm build` 均通过；浏览器已验证登录、搜索结果与限流错误、MCP Token 创建和过期日期、Usage 筛选分页、代理编辑和无 Playwright 控件。语言切换会更新页面文案和 HTML 的 `lang` 属性。
- 待实机回归：当前没有真实 API、数据库、认证、Token Secret、搜索或正文抓取请求；窄屏采用 CSS 响应式规则，仍需在目标移动设备上做实机回归。最后一次自动浏览器复核受本地地址访问策略限制，改以构建、类型和源码契约测试确认。

## 阶段 1 结果（历史记录）

- 完成范围：已完成 Next.js mock 门户、基础组件和阶段 2 服务端领域层；当时真实 Web API、MCP 与部署尚未开始。
- 验证结果：当时门户与服务端单元测试、lint、类型检查和构建已验证；真实搜索、MCP、部署和安全路径尚未实机验证。
- 后续：阶段 3 已在下文完成管理 API、MCP、会话路由与门户真实数据接入。

### 2026-08-23 — 阶段 2 设计确认

- 完成：调查 Open-WebSearch 当前公开的 daemon HTTP 接口、npm 包形态与许可；建立 `DEC-20260823-003`，比较 daemon 适配、源码复制和自行实现三种方案。
- 建议：使用不对公网开放的 Open-WebSearch daemon HTTP API，Fastify 服务通过受测适配器调用它；数据库使用六表 SQLite 结构，代理 URL 加密存储。
- 结果：用户随后明确要求直接完成阶段 2，方案已实施。

### 2026-08-23 — 阶段 2 实施

- 完成：建立 `packages/server` workspace、六表 SQLite 迁移与 Drizzle schema；实现管理员 bcrypt/JWT、独立 Token HMAC、AES-256-GCM 代理设置、Token 额度、审计、历史、TTL/LRU 缓存、聚合搜索、正文 URL 校验和 Open-WebSearch daemon 适配器。
- 安全边界：服务只接受私有 daemon 地址，固定 `open-websearch@2.1.11`；启动时检查上游版本、request 模式与 TLS 校验。正文输入拒绝本地、私网和非 HTTP(S) URL，服务端限制上游响应体大小。
- 验证证据：新增 9 项服务端测试；`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm --filter @lazycat-search/server build`、`pnpm build` 以及项目检查脚本均通过。
- 待实机回归：真实 daemon 对 DNS 重绑定与跳转的逐跳验证、各搜索引擎、网页抓取和私有网络部署将在阶段 4 验证。

### 2026-08-23 — 阶段 3 实施

- 完成：Fastify 增加管理员会话、搜索、正文、引擎、Token、设置、历史、审计与 MCP 管理 API；门户五个管理页改为调用真实 API。MCP 使用官方 Streamable HTTP v2 transport，创建独立请求上下文并在 Tool 执行前检查 Bearer Token、Scope、状态和额度。
- 安全边界：管理员 Cookie 为 HttpOnly、SameSite=Strict，开发环境通过 Next rewrite 以同源路径访问 Fastify；管理 API 和 MCP 都有限定 Host/Origin 列表。代理 URL 返回时脱敏，Token 原文只在创建响应中出现一次；禁用引擎、无默认引擎与不安全 Bing 模式均被拒绝。Web 与 MCP 的限额使用内存预占避免并发请求绕过审计后计数。
- 验证证据：服务端 12 项测试、门户源码契约、`pnpm lint`、`pnpm typecheck` 和 `pnpm build` 均通过；本地启动 daemon `:3210`、Fastify `:3001` 与 Next.js `:3000` 后，浏览器已验证登录、页面切换和真实 OpenAI 搜索结果。
- 下一步：阶段 4 建立 Docker 与懒猫微服产物，配置生产 Host/Origin allowlist、反向代理及 daemon 私有网络，并完成真实抓取与发布路径回归。

### 2026-08-23 — 门户原型视觉还原修正

- 完成：以 `lazycat_search_portal.html` 为参照，恢复登录页、顶栏、固定侧栏和 Search、MCP、Engines、Usage、Settings 五页的卡片、表格、弹窗与信息层级；页面保留阶段 3 已接入的真实 API。
- 事实边界：原型中的登录、搜索和正文状态选择器仅作为明确标注的页面预览，不改变服务端数据；搜索、历史、Token、Tool、引擎测试、审计和设置仍显示实际服务数据。Bing 的 Auto 选项仅为原型界面兼容，服务端请求仍使用 Request 模式。
- 验证证据：`pnpm lint`、`pnpm test`、`pnpm typecheck`、`pnpm build` 通过；本地服务仍可访问 `:3000`、`:3001` 与 `:3210`。
