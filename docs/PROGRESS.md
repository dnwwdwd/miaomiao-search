# 喵喵搜索项目进度

> 最后更新：2026-09-13
> 当前阶段：知乎站内搜索实验已完成本地 Provider、门户和 MCP 接入；真实网络、浏览器运行时与懒猫设备回归待执行。

## 当前口径

喵喵搜索计划作为自托管联网搜索服务运行，提供懒猫 OIDC/本地账号 Web 门户和可供外部 Agent 调用的 MCP 服务。当前发布 LPK 目标为 Linux x86-64；产品范围以 `docs/喵喵搜索 PRD.md` 为准，技术方案以 `docs/Miaomiao Search 技术实现文档.md` 为准。

本轮初始化开始前，仓库只有 PRD、技术实现文档、静态门户原型和协作规范四个项目文件。当前根目录已有 Next.js 工程与 pnpm workspace，`packages/server` 已包含数据库迁移、领域服务、管理 API、MCP transport 和服务端测试；LPK V2 配置、Linux x86-64 构建和双服务运行脚本已实现，懒猫设备安装与真实端到端回归仍待完成。

被引用的“分析项目技术栈”任务实际读取了另一个 `jobclaw` 目录，其 Python、Playwright 和文件存储结论不适用于本项目。本项目当前使用 Node.js、TypeScript、Next.js App Router、React、Tailwind CSS v4、pnpm、Fastify、SQLite、Drizzle ORM 与 MCP TypeScript server v2；Dockerfile 和懒猫 LPK 配置已实现，镜像已发布，设备回归待完成。

## 模块进度

| 模块 | 状态 | 当前事实 | 下一步 |
|---|---|---|---|
| 产品需求 | 已同步当前实现 | PRD 定义六个页面、MCP、安全、审计和中英文切换要求；已补充结果快照、永久保存、全局 Limit 与顶部品牌状态口径。 | 阶段 4 生产部署和端到端验收。 |
| 技术设计 | 已同步当前实现 | 技术文档已区分实际 Next/Fastify/SQLite/MCP 实现与历史部署草图；已补充 Provider Registry、Exa/Firecrawl/Tavily/GitHub/B站固定外部 Endpoint、用户加密凭据、thumbnailUrl 和 B站结果边界。 | Docker、懒猫微服和生产拓扑确认。 |
| 门户交互原型 | 已保留为历史参照 | `miaomiao_search_portal.html` 覆盖原始页面和交互说明。 | 与 JSX 门户保持需求一致。 |
| 工程基础 | 已完成前端范围 | 根目录已有 Next.js、pnpm、TypeScript、Tailwind CSS、ESLint、生产构建和 lockfile。 | 真实服务端接入前确认项目目录和运行方式。 |
| 服务端与数据库 | 知乎 Provider 本地实现完成 | `packages/server` 已有 SQLite 迁移、OIDC/本地账号应用会话、管理 API、MCP Token、Streamable HTTP、设置加密、审计、历史结果快照、永久保存、按引擎搜索分组、Provider Registry、固定 REST/Octokit/B站适配、知乎 Bing→Baidu 站内查询和 Open-WebSearch HTTP 适配器；入口 Host/Origin 与正文 DNS/SSRF 过滤按部署决策移除。 | 完成部署配置与真实网络回归。 |
| Web 前端 | 知乎来源展示接入完成 | `app/` 与 `src/components/portal/` 的登录和五个管理页面已使用 Next rewrite 调用真实 API；首页支持 12 个目录引擎、按 Provider 上限过滤数量、B站封面 lazy/no-referrer/fallback、知乎阅读器来源样式、凭据模式和中英文错误提示。 | 做浏览器端真实 API、知乎正文和部署后的同源路径回归。 |
| 测试与安全验证 | 默认本地验证通过 | 服务端 Provider 与 MCP 凭据注入测试、门户契约、HTTP 响应上限、B站 412 重试与封面校验、GitHub Token 重建、缓存和健康状态均有覆盖；全量命令结果在本轮交付记录。 | 做 Docker、Tunnel 回源、真实抓取和 MCP 客户端回归。 |
| Docker 与懒猫微服 | 自定义 amd64 镜像与轻量 LPK 已发布，含 Chromium/Playwright 运行时，设备回归待执行 | `Dockerfile` 生成 web/API/daemon 运行镜像并安装 Chromium；API 生产依赖包含 `playwright-core`；LPK 内容目录只保留说明文件；清单放行认证入口、注入浏览器路径并挂载 SQLite 数据。 | 在懒猫设备完成 OIDC、本地账号、改密、退出登录、MCP 和动态正文回归。 |

## 当前里程碑

- 2026-08-25：完成门户逐页持久化与 PRD 对齐审查；确认 OIDC、首页偏好、MCP Token 展示和 Settings 控件的边界，修复 Usage 审计滚动条、KPI 卡片布局、Bing 高级选项显示范围和 DuckDuckGo Tag 图标。
+ 2026-08-26：移除 LPK 多实例，改为单实例身份库 + 按懒猫 UID 隔离的用户库；会话绑定网关 UID，切换用户时前端自动回到登录页，`/mcp` Token 绑定 owner。
- 2026-08-25：新增本地账号迁移、首次 OIDC 建号、改密和退出登录流程；新增自定义 Linux amd64 镜像与轻量 LPK 脚本，镜像已推送 Docker Hub 并复制到懒猫官方 registry，LPK 已构建，待设备验证。
- 2026-08-26：按 Cloudflare Tunnel 部署决策移除应用入口 Host/Origin allowlist 与正文 DNS/SSRF 过滤；保留 HTTP(S)、凭据、资源、认证、Token、限流和审计边界，自动化检查通过。
- 2026-08-28：修复 Bing `www` 到 `cn` 的 302，Bing request 绕过显式代理；通用正文增加结构化数据和浏览器回退，无正文统一为 422 `CONTENT_NOT_EXTRACTED`，门户增加重试与打开源站。
- 2026-08-29：补齐正文浏览器回退的生产运行时：加入 `playwright-core`、镜像安装 Chromium、LPK 注入 `/usr/bin/chromium`，并验证 root 容器可执行 JS 空壳页面提取。
- 2026-08-29：完成正文阅读器骨架屏/链接新窗口/引擎来源 Tag、前端错误摘要与详情展开、首页/MCP 引擎顺序拖拽持久化和桌面 90% 宽度调整；待登录后的浏览器与 MCP 顺序回归。
- 2026-08-31：完成 Firecrawl、Tavily、GitHub、B站 Provider Registry、统一 HTTP 安全边界、用户凭据加密、11 引擎目录、Provider 上限、B站视频封面和 412 匿名预热重试；门户、MCP、历史快照、审计、错误本地化和 Provider 单测已同步。
- 2026-08-31：修复表格内 Dropdown 被滚动容器裁剪并强制末行向下展开，正文阅读器内容区补圆角；B站搜索结果增加视频元数据详情弹窗并隐藏正文复制按钮；凭据弹窗增加官网申请入口和明文/脱敏切换，首页最后来源与引擎管理凭据 Tag 增加交互提示；Exa 改为从当前用户加密数据库设置读取并补充 MCP 测试；待登录后的浏览器视觉回归。
- 2026-09-13：新增实验性知乎 Provider，使用 `site:zhuanlan.zhihu.com` 经 Bing request 搜索并在无匹配时回退 Baidu；精确过滤知乎专栏主机，门户正文阅读器增加知乎标题/Tag/打开按钮，MCP 动态枚举与引擎管理目录同步；在线 POC 中 Bing 未返回精确知乎结果，Baidu 返回 `baidu.com/link` 跳转地址后被安全过滤，知乎正文仍受 403 challenge 和 `libnspr4.so` 缺失影响，待完整镜像与设备复测。
- 2026-09-13：版本升级到 `0.1.3`，完成 amd64 镜像 Docker Hub 推送、懒猫官方 registry 复制、`project lint`、LPK release 和 `lpk lint`；设备安装与真实端到端回归仍待执行。

- 2026-08-24：搜索历史已扩展为关键词、引擎选择和结果快照，历史详情支持查看旧结果与再次搜索；`-1` 表示永久保存；首页按原型视觉语言完成工作区层级优化。
- 2026-08-24：完成顶部应用品牌与服务状态 Tag、MCP 模板换行、页面说明收敛和统计审计多维度布局；同步 PRD、技术实现、业务流程及需求/决策/进度台账。
- 2026-08-24：确认多引擎独立结果数量与分组展示需求；服务层已开始返回 `engineResults[]`，兼容保留 `results`，管理 API、门户视图和完整验收进行中。
- [x] 建立文档地图、需求台账、决策台账、功能进度台账、UI Guide 和业务流程文档。
- [x] 静态核对门户原型与 PRD，差异已记录在 `REQ-20260823-001`。
- [x] 原型补齐 Search、MCP、Engines、Usage 与 Settings 的已确认页面能力，并完成浏览器检查。
- [x] 确认 V1 只使用 HTTP request 搜索模式；中英文切换属于 V1。
- [x] 将静态门户迁移为 Next.js JSX，建立项目内基础组件、mock 数据和本地验证命令。
- [x] 确认并实现 Open-WebSearch HTTP 适配。
- [x] 以原型样式复核门户，并完成 RadioGroup、Dropdown、Modal 共享组件化和页面替换。
- [ ] 初始化工程并完成 V1 实现、测试、Docker 与懒猫微服验证。

## 主要待确认事项与风险

1. 上游 Open-WebSearch 未在本仓库中，当前以固定版本 HTTP 适配器运行；许可证、上游升级和引擎限制仍需生产环境复核。
2. 搜索引擎限制、真实网页正文抓取、MCP 客户端兼容性和懒猫微服部署只能在阶段 4 进行实机回归。

## 2026-08-25 本地真实上游回归

- 已使用 `SEARCH_MODE=request`、`USE_PROXY=true`、`PROXY_URL=http://127.0.0.1:7890` 启动固定版本 Open-WebSearch daemon，并对九个搜索引擎分别请求 `OpenAI`、`limit=3`。
- Bing、Baidu、DuckDuckGo、CSDN、Juejin 的真实上游回归曾返回 3 条；Exa 通过官方 API Key 路径单独校验。Brave 已从 miaomiao-search 可用引擎中移除。
- Exa 现由 Fastify Provider 直接调用官方 Search API，从当前用户加密设置读取 Key；不再使用 daemon 的 `EXA_API_KEY` 环境变量。Startpage/Sogou 的反爬页属于上游限制，不实现绕过。
- `pnpm test`、`pnpm typecheck`、`pnpm build` 通过；`pnpm lint` 无错误，忽略 pnpm 临时补丁编辑目录后无警告。

## 文档同步边界

- `docs/UI_GUIDE.md` 已包含当前顶部状态、历史快照、永久保存、模板换行和统计维度口径，并补充四类 Provider 凭据模式、封面卡片、数量上限和错误文案边界。
- `README.md` 已同步 Cloudflare Tunnel 入口和出站网络边界；Docker、懒猫微服和生产回归仍需部署环境验证。
