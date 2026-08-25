# lazycat-search 项目进度

> 最后更新：2026-08-25
> 当前阶段：阶段 3 基线已完成；REQ-20260824-007 正在进行阶段 3 后续收口；REQ-20260825-006 正在实施 LPK 多实例、OIDC 与打包，完成构建后按用户要求不进行额外验证。

## 当前口径

lazycat-search 计划作为自托管联网搜索服务运行，提供懒猫 OIDC Web 门户和可供外部 Agent 调用的 MCP 服务。产品范围以 `懒猫搜索 PRD.md` 为准，技术方案以 `Lazycat Search 技术实现文档.md` 为准。

本轮初始化开始前，仓库只有 PRD、技术实现文档、静态门户原型和协作规范四个项目文件。当前根目录已有 Next.js 工程与 pnpm workspace，`packages/server` 已包含数据库迁移、领域服务、管理 API、MCP transport 和服务端测试；Docker 与懒猫微服仍未实现。

被引用的“分析项目技术栈”任务实际读取了另一个 `jobclaw` 目录，其 Python、Playwright 和文件存储结论不适用于本项目。本项目当前使用 Node.js、TypeScript、Next.js App Router、React、Tailwind CSS v4、pnpm、Fastify、SQLite、Drizzle ORM 与 MCP TypeScript server v2；Docker 和部署配置仍待实现。

## 模块进度

| 模块 | 状态 | 当前事实 | 下一步 |
|---|---|---|---|
| 产品需求 | 已同步当前实现 | PRD 定义六个页面、MCP、安全、审计和中英文切换要求；已补充结果快照、永久保存、全局 Limit 与顶部品牌状态口径。 | 阶段 4 生产部署和端到端验收。 |
| 技术设计 | 已同步当前实现 | 技术文档已区分实际 Next/Fastify/SQLite/MCP 实现与历史部署草图；已补充真实 API、历史快照和保留策略。 | Docker、懒猫微服和生产拓扑确认。 |
| 门户交互原型 | 已保留为历史参照 | `lazycat_search_portal.html` 覆盖原始页面和交互说明。 | 与 JSX 门户保持需求一致。 |
| 工程基础 | 已完成前端范围 | 根目录已有 Next.js、pnpm、TypeScript、Tailwind CSS、ESLint、生产构建和 lockfile。 | 真实服务端接入前确认项目目录和运行方式。 |
| 服务端与数据库 | 阶段 3 基线完成；结果分组需求进行中 | `packages/server` 已有 SQLite 迁移、管理 API、管理员 Cookie、MCP Token、Streamable HTTP、设置加密、审计、历史结果快照、永久保存、按引擎搜索分组和私有 daemon 适配器；`engine.result_limit` 管理链路尚未收口。 | 完成 REQ-20260824-007，再做部署配置与真实网络回归。 |
| Web 前端 | 阶段 3 基线完成；结果分组需求进行中 | `app/` 与 `src/components/portal/` 的登录和五个管理页面已使用 Next rewrite 调用真实 API；RadioGroup、Dropdown、Modal 已统一封装并替换页面内联控件。首页仍以平铺聚合视图为主，分组切换待完成。 | 完成首页分组/聚合切换，再做部署后的同源路径回归。 |
| 测试与安全验证 | V1 基线已验证；REQ-20260824-007 测试收口中 | 类型检查通过；门户契约测试通过；现有服务端测试 14 项中 13 项通过，独立引擎缓存语义使旧调用次数断言失败。 | 更新结果分组/独立缓存测试，再做 Docker、反向代理、真实抓取和 MCP 客户端回归。 |
| Docker 与懒猫微服 | LPK 实施中 | 已加入 LPK V2 配置、`web`/`api` 双服务、空 SQLite 挂载、OIDC 回调和 MCP 网关放行；不使用自定义 Docker 镜像。 | 构建 LPK 后直接交付，不执行额外验证。 |

## 当前里程碑

- 2026-08-25：确认并实施 LPK V2 多实例。每个新实例挂载空数据库目录；门户以点击按钮触发 OIDC 授权码回调，`/mcp` 是唯一网关放行路径且保持独立 Token 鉴权。

- 2026-08-24：搜索历史已扩展为关键词、引擎选择和结果快照，历史详情支持查看旧结果与再次搜索；`-1` 表示永久保存；首页按原型视觉语言完成工作区层级优化。
- 2026-08-24：完成顶部应用品牌与服务状态 Tag、MCP 模板换行、页面说明收敛和统计审计多维度布局；同步 PRD、技术实现、业务流程及需求/决策/进度台账。
- 2026-08-24：确认多引擎独立结果数量与分组展示需求；服务层已开始返回 `engineResults[]`，兼容保留 `results`，管理 API、门户视图和完整验收进行中。
- [x] 建立文档地图、需求台账、决策台账、功能进度台账、UI Guide 和业务流程文档。
- [x] 静态核对门户原型与 PRD，差异已记录在 `REQ-20260823-001`。
- [x] 原型补齐 Search、MCP、Engines、Usage 与 Settings 的已确认页面能力，并完成浏览器检查。
- [x] 确认 V1 只使用 HTTP request 搜索模式；中英文切换属于 V1。
- [x] 将静态门户迁移为 Next.js JSX，建立项目内基础组件、mock 数据和本地验证命令。
- [x] 确认并实现 Open-WebSearch 私有 daemon HTTP 适配。
- [x] 以原型样式复核门户，并完成 RadioGroup、Dropdown、Modal 共享组件化和页面替换。
- [ ] 初始化工程并完成 V1 实现、测试、Docker 与懒猫微服验证。

## 主要待确认事项与风险

1. 上游 Open-WebSearch 未在本仓库中，当前以固定版本私有 daemon HTTP 适配器运行；许可证、上游升级和引擎限制仍需生产环境复核。
2. 搜索引擎限制、真实网页正文抓取、MCP 客户端兼容性和懒猫微服部署只能在阶段 4 进行实机回归。

## 2026-08-25 本地真实上游回归

- 已使用 `SEARCH_MODE=request`、`USE_PROXY=true`、`PROXY_URL=http://127.0.0.1:7890` 启动固定版本 Open-WebSearch daemon，并对九个搜索引擎分别请求 `OpenAI`、`limit=3`。
- Bing、Baidu、DuckDuckGo、CSDN、Juejin 的真实上游回归曾返回 3 条；Exa 通过官方 API Key 路径单独校验。Brave 已从 lazycat-search 可用引擎中移除。
- Exa 的无密钥网页接口仍返回 HTTP 500；补丁已支持 `EXA_API_KEY` 官方 API 路径，并将无密钥失败映射为 `engine_error`。Startpage/Sogou 的反爬页属于上游限制，不实现绕过。
- `pnpm test`、`pnpm typecheck`、`pnpm build` 通过；`pnpm lint` 无错误，忽略 pnpm 临时补丁编辑目录后无警告。

## 文档同步边界

- `docs/UI_GUIDE.md` 已包含当前顶部状态、历史快照、永久保存、模板换行和统计维度口径，并补充 REQ-20260824-007 的分组视图实现边界。
- `README.md` 已正确描述本地 Fastify/Next.js 运行方式以及 Docker、懒猫微服和生产回归未完成，本轮核对后无需改写。
