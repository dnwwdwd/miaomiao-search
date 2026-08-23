# REQ-20260823-001：lazycat-search V1 实施基线

## 分类与状态

- 分类：功能需求
- 状态：进行中
- 用户确认：2026-08-23 已确认建立协作流程、核对原型并编写项目进度；确认 V1 保留中英文切换、移除 Playwright，并补齐本记录列出的门户能力；同日确认把静态门户迁移为 Next.js JSX、建立基础组件和 mock 数据；随后明确要求直接完成阶段 2，确认 `DEC-20260823-003` 的推荐方案。
- 决策记录：`Decisions/DEC-20260823-001-v1-search-mode.md`、`Decisions/DEC-20260823-002-nextjs-frontend.md`、`Decisions/DEC-20260823-003-stage-2-data-and-upstream.md`（待确认）
- 功能进度文档：`Progress/PROG-REQ-20260823-001-v1-implementation.md`

## 背景与目标

项目要实现一个可自托管的多引擎联网搜索服务，提供管理员 Web 页面和需要 Access Token 的远程 MCP 服务。当前仓库仅有 PRD、技术设计和静态门户原型。本需求用于把 V1 的实施范围、依赖和验证口径写成可追踪基线。

## 已确认需求

- 主入口：管理员登录后的 Web Search，以及外部 Agent 经 Streamable HTTP 调用的 Remote MCP。
- 包含：Login、Search、MCP、Engines、Usage、Settings 六个页面；多引擎聚合、正文抓取、MCP Token、审计、SQLite 持久化、Docker 和懒猫微服部署。
- 包含：把 `lazycat_search_portal.html` 的六个页面与交互还原为 Next.js 前端页面，建立可复用基础组件和各页面 mock 数据。
- 不包含：不创建或修改数据库 schema、迁移、真实 API、认证、MCP Endpoint 或发布产物；静态 HTML 保留为参照。
- 权限、安全与数据边界：Web 使用管理员会话；MCP 使用独立 Bearer Token；正文抓取受 SSRF 和 XSS 防护约束；Token Secret 只能展示一次且数据库只保存 Hash。
- 兼容性与运行约束：Node.js 20+、TypeScript、pnpm、Next.js App Router、Tailwind CSS v4；主 MCP Transport 为 Streamable HTTP，Legacy SSE 默认关闭。
- 验收标准：项目文档有明确索引；Next.js 的六个页面、基础组件和 mock 交互能通过类型、lint、生产构建和浏览器路径验证；后端边界仍不被实现为真实行为。

## 待确认问题

1. 无。阶段 2 的 Open-WebSearch 接入方式、SQLite 六表结构、密钥保护与启动条件已由 `DEC-20260823-003` 确认并实施。

## 现状与受影响范围

- 现有实现：仓库根目录已建立 Next.js App Router、TypeScript、Tailwind CSS v4、ESLint 与 pnpm 配置。`app/` 为入口，`src/components/ui/` 提供基础组件，`src/components/portal/pages/` 提供五个管理页 JSX，登录页由门户入口呈现。
- 数据：技术文档已设计 `admin`、`access_token`、`engine`、`search_history`、`request_log`、`setting` 表；本轮未建立或变更数据库。
- UI：Next.js 门户已覆盖六个页面，具体组件和视觉规则见 `docs/UI_GUIDE.md` 与 `docs/DESIGN.md`；所有数据仍为浏览器内 mock。
- API/外部依赖：技术文档定义 `/api/*` 与 `/mcp`，但尚未实现；依赖 Open-WebSearch 的搜索和正文提取能力。
- 文档：产品与技术事实分别位于根目录 PRD 和技术实现文档。

### 门户原型与 PRD 核对

六个页面和侧边导航均已出现在原型中，Login、Search、MCP、Engines、Usage、Settings 的主要功能方向与 PRD 一致。原型为 mock 演示，下列差异需要在转为真实页面前处理。

| 页面或全局区域 | 原型已有内容 | 与 PRD 不一致或缺少的内容 | PRD 未要求的原型内容 |
|---|---|---|---|
| Login | 用户名、密码、Enter 提交和三类错误提示 | 登录始终进入系统，没有真实凭据校验、失败计数或账户锁定行为 | 预填 `admin/admin123` 和错误场景模拟按钮；生产实现不得保留。 |
| Search | 输入、URL 提示、九个引擎、数量、结果、去重来源、部分失败、阅读弹窗和历史 | 已补充引擎限流、代理异常、运行时启动失败；阅读弹窗补充原始/最终 URL 和无法提取正文；历史展示结果数量。Bing 未选中时隐藏高级项，且只保留 Auto / Request。 | 搜索与阅读的状态模拟控件。 |
| MCP | Endpoint、Transport、六个 Tool、Token 创建、客户端模板与连接测试 | 已补充 Token 创建时间、最近使用时间、撤销操作，以及根据表单计算的过期日期。连接测试仍为 mock 输出。 | 把 Codex 与 Cursor 合为一个模板；配置模板使用 Token 占位符，生产实现应从当前环境读取 Endpoint 与 Token。 |
| Engines | 启用、默认、健康状态、延迟、最近错误与测试入口 | 已补充最近测试时间、完整状态枚举示例和按引擎显示的 Search Mode。 | 批量健康测试为 mock 操作。 |
| Usage | 概览指标、引擎统计和请求日志 | 已补充 engines、resultCount、errorCode、createdAt，以及 Channel/Operation 筛选和分页。 | 侧边栏的缓存命中率和 SQLite 大小摘要。 |
| Settings | 代理展示与测试、两个 TTL、默认结果数、Bing 模式、历史保留期、Query 日志 | 已补充缓存开关、最大条数、Web/MCP/引擎限流、默认引擎、历史开关与设置页清空操作；代理地址可编辑。 | 无。 |
| 全局 | 顶栏、侧栏、会话状态与登出 | 中英文切换已明确纳入 V1；原型仍没有可验证的真实会话、数据刷新和错误恢复。 | 演示指标和版本标签。 |

此前的 Bing 搜索模式差异已由 `DEC-20260823-001` 确认并处理：V1 只保留 HTTP request 路径。

## 跨模块影响分析

| 维度 | 已确认内容 |
|---|---|
| 写入入口 | Web 管理员页面会写入引擎设置、MCP Token、系统设置、搜索历史和审计数据；MCP 请求会更新 Token 使用情况和审计数据。 |
| 读取方与状态传播 | Web 页面经 API 读取配置、结果和统计；MCP 从 `/mcp` 读取 Token、引擎、缓存和 Tool 开关。进程重启后 SQLite 数据需恢复，内存缓存可清空。 |
| 失败与边界 | 搜索允许部分失败；正文抓取必须检查 URL、DNS 和重定向；Web 与 MCP 的认证、限流、缓存和审计规则不同；生产环境需要 HTTPS。 |
| 已检查但不受影响 | 本轮不改数据库、API、认证、MCP、部署文件或外部系统；Next.js 页面不发起网络请求。 |

## 方案与计划

1. 完成项目协作文档、文档地图、需求与进度基线。
2. 完成 Next.js 门户、基础组件和 mock 数据迁移。
3. 确认上游复用方式和数据设计后，实现服务、API、安全边界、真实 UI 数据、测试和部署。

## 验收与结果

- [x] 建立项目文档索引、需求台账、决策台账和进度台账。
- [x] 核对门户原型与 PRD 的主要页面和功能。
- [x] 确认 V1 搜索模式边界与中英文切换范围。
- [x] 将静态门户还原为 Next.js JSX，建立基础组件与每页 mock 数据。
- [x] 确认并实施上游 daemon HTTP 适配方式。
- [ ] 按阶段实现和验证 V1。
- 待实机回归：搜索引擎可用性、MCP 客户端接入、真实网页抓取、Docker 与懒猫微服安装；当前没有可运行应用或外部凭据。
- 未做项、风险或后续：原型中的 mock 数据和演示凭据不得进入生产实现；部分页面字段与状态仍需补齐。

### 行为验收矩阵

| 场景 | 前置条件 | 操作 | 预期结果 | 验证状态 |
|---|---|---|---|---|
| 文档导航 | 打开仓库根目录 | 查阅 `DOCUMENT_MAP.md` | 能定位产品、技术、UI、流程、需求、决策和进度文档 | 已验证 |
| 原型页面覆盖 | 打开静态门户原型 | 检查登录和五个导航页面 | 六个页面均存在，页面细项与 PRD 差异已记录 | 已验证（静态检查） |
| V1 搜索模式 | 已确认决策 | 检查 PRD、技术文档和原型 | 仅保留 Auto / Request，原型与文档已同步 | 已验证（静态检查） |
| Next.js 门户 | Node.js 24、pnpm | 执行 `pnpm test`、`pnpm lint`、`pnpm typecheck`、`pnpm build` | 5 个源代码契约测试通过；无 lint 或类型错误，生产构建生成 `/` 静态路由 | 已验证 |
| 门户主要交互 | 本地 `pnpm dev` | 登录，搜索错误状态，MCP Token 创建，Usage 筛选分页，Settings 代理编辑与中英文切换 | 对应 mock 状态与页面内容可见；无真实网络请求 | 已验证；最后一次自动复核受本地地址访问策略限制 |
