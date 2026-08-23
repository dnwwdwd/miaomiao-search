# lazycat-search 项目进度

> 最后更新：2026-08-23
> 当前阶段：阶段 3 已完成；等待 Docker、懒猫微服打包与生产环境端到端验证。

## 当前口径

lazycat-search 计划作为自托管联网搜索服务运行，提供管理员 Web 页面和可供外部 Agent 调用的 MCP 服务。产品范围以 `懒猫搜索 PRD.md` 为准，技术方案以 `Lazycat Search 技术实现文档.md` 为准。

本轮初始化开始前，仓库只有 PRD、技术实现文档、静态门户原型和协作规范四个项目文件。当前根目录已有 Next.js 工程与 pnpm workspace，`packages/server` 已包含数据库迁移、领域服务、管理 API、MCP transport 和服务端测试；Docker 与懒猫微服仍未实现。

被引用的“分析项目技术栈”任务实际读取了另一个 `jobclaw` 目录，其 Python、Playwright 和文件存储结论不适用于本项目。本项目当前使用 Node.js、TypeScript、Next.js App Router、React、Tailwind CSS v4、pnpm、Fastify、SQLite、Drizzle ORM 与 MCP TypeScript server v2；Docker 和部署配置仍待实现。

## 模块进度

| 模块 | 状态 | 当前事实 | 下一步 |
|---|---|---|---|
| 产品需求 | 已具备设计文档 | PRD 定义六个页面、MCP、安全、审计和中英文切换要求；V1 只使用 HTTP request 搜索。 | 确认上游 Open-WebSearch 的复用方式。 |
| 技术设计 | 已具备设计文档 | 技术栈、目录、数据库、API、部署方案已写明 | 确认上游 Open-WebSearch 的复用方式。 |
| 门户交互原型 | 已保留为历史参照 | `lazycat_search_portal.html` 覆盖原始页面和交互说明。 | 与 JSX 门户保持需求一致。 |
| 工程基础 | 已完成前端范围 | 根目录已有 Next.js、pnpm、TypeScript、Tailwind CSS、ESLint、生产构建和 lockfile。 | 真实服务端接入前确认项目目录和运行方式。 |
| 服务端与数据库 | 阶段 3 已完成 | `packages/server` 已有六表 SQLite、管理 API、管理员 Cookie、MCP Token、Streamable HTTP、设置加密、审计、缓存、搜索聚合、正文 URL 校验和私有 daemon 适配器。 | 部署配置与真实网络回归。 |
| Web 前端 | 阶段 3 已完成 | `app/` 与 `src/components/portal/` 的登录和五个管理页面已使用 Next rewrite 调用真实 API。 | 部署后的同源路径回归。 |
| 测试与安全验证 | API/MCP 验证已完成 | `pnpm test`、lint、类型检查、服务端构建和 Next.js 生产构建已通过；浏览器已验证登录、页面切换和真实搜索。 | Docker、反向代理、真实抓取和 MCP 客户端回归。 |
| Docker 与懒猫微服 | 未开始 | 仅有技术设计中的示例 | 构建镜像、部署包并验证安装路径。 |

## 当前里程碑

- [x] 建立文档地图、需求台账、决策台账、功能进度台账、UI Guide 和业务流程文档。
- [x] 静态核对门户原型与 PRD，差异已记录在 `REQ-20260823-001`。
- [x] 原型补齐 Search、MCP、Engines、Usage 与 Settings 的已确认页面能力，并完成浏览器检查。
- [x] 确认 V1 只使用 HTTP request 搜索模式；中英文切换属于 V1。
- [x] 将静态门户迁移为 Next.js JSX，建立项目内基础组件、mock 数据和本地验证命令。
- [x] 确认并实现 Open-WebSearch 私有 daemon HTTP 适配。
- [ ] 初始化工程并完成 V1 实现、测试、Docker 与懒猫微服验证。

## 主要待确认事项与风险

1. 上游 Open-WebSearch 未在本仓库中，无法确认可直接复用的模块、许可证、依赖版本或改造成本。
2. 搜索引擎限制、真实网页正文抓取、MCP 客户端兼容性和懒猫微服部署只能在应用实现后进行实机回归。
