# REQ-20260823-001：lazycat-search V1 实施基线

## 分类与状态

- 分类：功能需求
- 状态：进行中
- 用户确认：2026-08-23 已确认建立协作流程、核对原型并编写项目进度；确认 V1 保留中英文切换、移除 Playwright，并补齐本记录列出的门户能力；同日确认把静态门户迁移为 Next.js JSX、建立原型数据；随后明确要求直接完成阶段 2，确认 `DEC-20260823-003` 的推荐方案。
- 决策记录：`Decisions/DEC-20260823-001-v1-search-mode.md`、`Decisions/DEC-20260823-002-nextjs-frontend.md`、`Decisions/DEC-20260823-003-stage-2-data-and-upstream.md`
- 功能进度文档：`Progress/PROG-REQ-20260823-001-v1-implementation.md`
- 后续关联需求：`REQ-20260824-007` 将多引擎独立结果数量与分组展示作为阶段 3 后续收口，不改变本 V1 基线的阶段 4 部署边界。

## 背景与目标

项目要实现一个可自托管的多引擎联网搜索服务，提供管理员 Web 页面和需要 Access Token 的远程 MCP 服务。本记录保留 2026-08-23 的 V1 实施基线；当前实现状态以根目录 PRD、技术实现文档、业务流程和阶段进度记录为准。

## 已确认需求

- 主入口：管理员登录后的 Web Search，以及外部 Agent 经 Streamable HTTP 调用的 Remote MCP。
- 包含：Login、Search、MCP、Engines、Usage、Settings 六个页面；多引擎聚合、正文抓取、MCP Token、审计、SQLite 持久化、Docker 和懒猫微服部署。
- 包含：把 `lazycat_search_portal.html` 的六个页面与交互还原为 Next.js 前端页面，建立可复用基础组件和各页面 mock 数据。
- 当时不包含：在原型迁移阶段不创建或修改数据库 schema、迁移、真实 API、认证、MCP Endpoint 或发布产物；该限制已由后续阶段 2/3 决策解除，当前代码已实现本地服务。
- 权限、安全与数据边界：Web 使用管理员会话；MCP 使用独立 Bearer Token；正文抓取受 SSRF 和 XSS 防护约束；Token Secret 只能展示一次且数据库只保存 Hash。
- 兼容性与运行约束：Node.js 20+、TypeScript、pnpm、Next.js App Router、Tailwind CSS v4；主 MCP Transport 为 Streamable HTTP，Legacy SSE 默认关闭。
- 当时验收标准：项目文档有明确索引；Next.js 的六个页面、基础组件和原型交互能通过类型、lint、生产构建和浏览器路径验证。阶段 2/3 后续验收已扩展为真实 API、认证、MCP、历史和审计路径。

## 待确认问题

1. 无。阶段 2 的 Open-WebSearch 接入方式、SQLite 六表结构、密钥保护与启动条件已由 `DEC-20260823-003` 确认并实施。

## 现状与受影响范围

- 当前实现：仓库根目录已建立 Next.js App Router、TypeScript、Tailwind CSS v4、ESLint 与 pnpm 配置。`app/` 为入口，`src/components/ui/` 提供基础组件，`src/components/portal/pages/` 提供五个管理页 JSX，登录页由门户入口呈现。
- 数据：`packages/server` 已建立 SQLite schema 与迁移，搜索历史包含结果快照字段；`-1` 表示搜索历史永久保存。
- UI：Next.js 门户已覆盖六个页面，具体组件和视觉规则见 `docs/UI_GUIDE.md` 与 `docs/DESIGN.md`；页面业务数据来自受保护 Fastify API，`src/lib/mock-data.ts` 仅保留历史原型常量和客户端模板。
- API/外部依赖：`/api/*` 管理 API、`/mcp` Streamable HTTP Endpoint 和 Open-WebSearch 私有 daemon 适配器已在本地实现；Docker、懒猫微服和生产网络仍待阶段 4。
- 文档：产品与技术事实分别位于根目录 PRD 和技术实现文档。

### 门户原型与 PRD 核对

六个页面和侧边导航均已出现在原型中，Login、Search、MCP、Engines、Usage、Settings 的主要功能方向与 PRD 一致。原型是历史交互参照，下面保留当时的差异记录；当前行为以真实门户和服务端 API 为准。

| 页面或全局区域 | 原型已有内容 | 与 PRD 不一致或缺少的内容 | PRD 未要求的原型内容 |
|---|---|---|---|
| Login | 用户名、密码、Enter 提交和错误提示 | 当时没有真实凭据校验；当前由服务端会话 API 校验，页面不提供错误场景模拟按钮 | 预填 `admin/admin123` 和错误场景模拟按钮仅属于历史原型内容。 |
| Search | 输入、URL 提示、九个引擎、数量、结果、去重来源、部分失败、阅读弹窗和历史 | 已补充引擎限流、代理异常、运行时启动失败；阅读弹窗补充原始/最终 URL 和无法提取正文；历史展示结果数量。Bing 未选中时隐藏高级项，且只保留 Auto / Request。 | 搜索与阅读的状态模拟控件。 |
| MCP | Endpoint、Transport、六个 Tool、Token 创建、客户端模板与连接测试 | 已补充 Token 创建时间、最近使用时间、撤销操作和过期日期；当前管理 API 返回服务元数据和 Tool 状态，带 Token 的 MCP initialize 仍待生产回归 | 把 Codex 与 Cursor 合为一个模板；配置模板使用 Token 占位符，生产环境读取实际 Endpoint 与 Token。 |
| Engines | 启用、默认、健康状态、延迟、最近错误与测试入口 | 已补充最近测试时间、完整状态枚举示例和按引擎显示的 Search Mode。 | 批量健康测试为 mock 操作。 |
| Usage | 概览指标、引擎统计和请求日志 | 已补充 engines、resultCount、errorCode、createdAt，以及 Channel/Operation 筛选和分页。 | 侧边栏的缓存命中率和 SQLite 大小摘要。 |
| Settings | 代理展示与测试、两个 TTL、默认结果数、Bing 模式、历史保留期、Query 日志 | 已补充缓存开关、最大条数、Web/MCP/引擎限流、默认引擎、历史开关与设置页清空操作；代理地址可编辑。 | 无。 |
| 全局 | 顶栏、侧栏、会话状态与登出 | 中英文切换已明确纳入 V1；当前顶栏显示应用名和服务状态 Tag，不显示版本或管理员标签 | 演示指标和版本标签仅属于历史原型内容。 |

此前的 Bing 搜索模式差异已由 `DEC-20260823-001` 确认并处理：V1 只保留 HTTP request 路径。

## 跨模块影响分析

| 维度 | 已确认内容 |
|---|---|
| 写入入口 | Web 管理员页面会写入引擎设置、MCP Token、系统设置、搜索历史和审计数据；MCP 请求会更新 Token 使用情况和审计数据。 |
| 读取方与状态传播 | Web 页面经 API 读取配置、结果和统计；MCP 从 `/mcp` 读取 Token、引擎、缓存和 Tool 开关。进程重启后 SQLite 数据需恢复，内存缓存可清空。 |
| 失败与边界 | 搜索允许部分失败；正文抓取必须检查 URL、DNS 和重定向；Web 与 MCP 的认证、限流、缓存和审计规则不同；生产环境需要 HTTPS。 |
| 已检查但不受影响 | 本轮文档同步不改运行时代码、数据库、API、认证、MCP 或部署文件；阶段 2/3 的运行时实现保持不变。 |

## 方案与计划

1. 完成项目协作文档、文档地图、需求与进度基线。
2. 完成 Next.js 门户、基础组件和 mock 数据迁移。
3. 确认上游复用方式和数据设计后，实现服务、API、安全边界、真实 UI 数据、测试和部署。

## 验收与结果

- [x] 建立项目文档索引、需求台账、决策台账和进度台账。
- [x] 核对门户原型与 PRD 的主要页面和功能。
- [x] 确认 V1 搜索模式边界与中英文切换范围。
- [x] 将静态门户还原为 Next.js JSX，建立基础组件与原型数据；后续已接入真实管理 API。
- [x] 确认并实施上游 daemon HTTP 适配方式。
- [ ] 按阶段完成和验证 V1；阶段 4 仍待开始。
- 待实机回归：搜索引擎可用性、MCP 客户端接入、真实网页抓取、Docker 与懒猫微服安装；本地服务已可运行，生产凭据和网络仍待准备。
- 未做项、风险或后续：历史原型数据和演示凭据不得进入生产实现；生产部署、真实引擎限制和 MCP 客户端兼容性仍需验证。

### 行为验收矩阵

| 场景 | 前置条件 | 操作 | 预期结果 | 验证状态 |
|---|---|---|---|---|
| 文档导航 | 打开仓库根目录 | 查阅 `DOCUMENT_MAP.md` | 能定位产品、技术、UI、流程、需求、决策和进度文档 | 已验证 |
| 原型页面覆盖 | 打开静态门户原型 | 检查登录和五个导航页面 | 六个页面均存在，页面细项与 PRD 差异已记录 | 已验证（静态检查） |
| V1 搜索模式 | 已确认决策 | 检查 PRD、技术文档和原型 | 仅保留 Auto / Request，原型与文档已同步 | 已验证（静态检查） |
| Next.js 门户 | Node.js 24、pnpm | 执行 `pnpm test`、`pnpm lint`、`pnpm typecheck`、`pnpm build` | 5 个源代码契约测试通过；无 lint 或类型错误，生产构建生成 `/` 静态路由 | 已验证 |
| 门户主要交互 | 本地 `pnpm dev` | 登录，搜索错误状态，MCP Token 创建，Usage 筛选分页，Settings 代理编辑与中英文切换 | 对应 mock 状态与页面内容可见；无真实网络请求 | 已验证；最后一次自动复核受本地地址访问策略限制 |
