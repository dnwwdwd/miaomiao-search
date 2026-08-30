# 需求台账

## 状态说明

- 待澄清：仍有影响范围、数据、权限、兼容性或验收的未知事项。
- 待方案确认：需求口径完整，等待用户确认方案或决策。
- 已确认待排期：需求和方案已确认，尚未开始。
- 进行中：正在按确认方案实施。
- 已阻塞：等待外部条件、用户决定或前置任务。
- 待验证：实现完成，等待约定验证。
- 已完成：验收、文档和进度已同步。
- 已取消：用户明确不继续，并保留原因。

| ID | 日期 | 分类 | 标题 | 状态 | 决策 / 功能进度 | 备注 |
|---|---|---|---|---|---|---|
| REQ-20260829-003 | 2026-08-29 | 功能需求 / MCP / 部署 / 认证 | 懒猫 Resource MCP 与应用间委托调用 | 已实施，待设备验证 | `Requirements/REQ-20260829-003-lazycat-resource-mcp.md`、`Decisions/DEC-20260829-003-lazycat-resource-mcp.md`、`Progress/PROG-REQ-20260829-003-lazycat-resource-mcp.md` | 导出 MCP provider；可信 `app:` 来源可按 UID 委托调用，外部 Bearer Token 保持兼容；待 lzcos 设备和小龙猫/Codex 回归。 |
| REQ-20260828-001 | 2026-08-28 | Bug / 搜索 / 正文抓取 / MCP / UX | Bing 重定向与网页正文读取容错 | 待验证 | `Requirements/REQ-20260828-001-bing-and-web-content-resilience.md`、`Decisions/DEC-20260828-001-bing-and-web-content-resilience.md`、`Decisions/DEC-20260829-001-playwright-runtime.md`、`Progress/PROG-REQ-20260828-001-bing-and-web-content-resilience.md` | Bing 站内 302、代理绕过、多策略正文提取、Playwright/Chromium 生产运行时、422 错误语义和门户重试已实现；待真实设备/TUN 回归。 |
| REQ-20260827-001 | 2026-08-27 | UX / 品牌 / 部署 / 发布 | 喵喵搜索品牌、包标识符与发布包更新 | 已完成 | `Requirements/REQ-20260827-001-miaomiao-brand-and-package-release.md`、`Decisions/DEC-20260827-001-miaomiao-package-identity.md`、`Progress/PROG-REQ-20260827-001-miaomiao-brand-and-package-release.md` | 品牌替换、Docker Hub 推送、懒猫官方镜像复制和 LPK lint 已完成；真实设备安装回归另行执行。 |
| REQ-20260826-001 | 2026-08-26 | 功能改进 / 认证 / 数据隔离 / 部署 | 单实例懒猫用户隔离与会话切换 | 待验证 | Requirements/REQ-20260826-001-single-instance-user-isolation.md、Decisions/DEC-20260826-001-single-instance-user-isolation.md、Progress/PROG-REQ-20260826-001-single-instance-user-isolation.md | 代码和服务端测试已完成；等待懒猫设备双用户、登出和外部 MCP 回归。 |
| REQ-20260826-002 | 2026-08-26 | 功能改进 / 部署 / 网络边界 | Cloudflare Tunnel 网络边界放宽 | 已完成实现，待部署验证 | `Requirements/REQ-20260826-002-cloudflare-tunnel-network-boundary.md`、`Decisions/DEC-20260826-002-cloudflare-tunnel-network-boundary.md`、`Progress/PROG-REQ-20260826-002-cloudflare-tunnel-network-boundary.md` | 代码、Open-WebSearch 补丁、部署清单和文档已完成；自动化检查通过，待 Tunnel 回源与设备环境验证。 |
| REQ-20260825-014 | 2026-08-25 | 功能需求 / 认证 / 部署 | 本地账号登录、改密与自定义运行时镜像 | 待验证 | `Requirements/REQ-20260825-014-local-account-and-custom-image.md`、`Decisions/DEC-20260825-012-local-account-authentication.md`、`Decisions/DEC-20260825-013-custom-runtime-image.md`、`Progress/PROG-REQ-20260825-014-local-account-and-custom-image.md` | 代码、Docker Hub/官方 registry 发布和 LPK 已完成；等待懒猫设备回归。 |
| REQ-20260825-013 | 2026-08-25 | 功能需求 / UI/体验调整 / 部署 | 门户细节、TUN 代理提示与 LPK 重新打包 | 已完成 | `Requirements/REQ-20260825-013-portal-polish-proxy-tun-and-lpk.md`、`Decisions/DEC-20260825-011-proxy-tun-activation.md`、`Progress/PROG-REQ-20260825-013-portal-polish-proxy-tun-and-lpk.md` | 已完成 Token 表单与 Secret 复制布局、TUN 代理提示、登录页重设计和 LPK 重打包；本地检查全部通过。 |
| REQ-20260825-012 | 2026-08-25 | 功能需求 / MCP / 搜索 | MCP 动态引擎与正文 Tool 可用性 | 已完成 | `Requirements/REQ-20260825-012-mcp-dynamic-engines-and-fetch-tools.md`、`Decisions/DEC-20260825-009-mcp-dynamic-tools-and-upstream-fetch.md`、`Progress/PROG-REQ-20260825-012-mcp-dynamic-engines-and-fetch-tools.md` | MCP 搜索跟随引擎管理启用状态；站点正文 Tool 调用专用上游并保留具体错误；DuckDuckGo 图标改为本地资源。 |
| REQ-20260825-011 | 2026-08-25 | 功能需求 / UI/体验调整 / MCP | MCP Token 限额选项与复制 | 已完成 | `Requirements/REQ-20260825-011-mcp-token-limits-and-copy.md`、`Progress/PROG-REQ-20260825-011-mcp-token-limits-and-copy.md` | 每分钟和每日限额支持无限制与手动输入；Secret 弹窗支持一键复制；重新生成 LPK。 |
| REQ-20260825-010 | 2026-08-25 | Bug / 功能需求 / MCP | MCP Token 今日调用量与删除操作 | 已完成 | `Requirements/REQ-20260825-010-mcp-token-usage-and-delete.md`、`Decisions/DEC-20260825-008-mcp-token-usage-and-delete.md`、`Progress/PROG-REQ-20260825-010-mcp-token-usage-and-delete.md` | 按 UTC 当日审计记录返回真实 `usageToday`；MCP 页面增加删除确认和刷新。 |
| REQ-20260825-009 | 2026-08-25 | Bug / UI/体验调整 / 审查 | 门户持久化与 PRD 对齐审查、Usage UI 收口 | 已完成 | `Requirements/REQ-20260825-009-portal-review-and-usage-ui.md`、`docs/PORTAL_REVIEW_20260825.md` | 完成逐页持久化矩阵、PRD 差异和可用性分级；修复 Usage 审计滚动条、KPI 卡片布局、范围下拉遮挡、国际化混杂、引擎统计标题、DuckDuckGo 图标，并移除 Settings 默认搜索参数 Card。 |
| REQ-20260825-008 | 2026-08-25 | 功能需求 / 搜索 | 默认搜索引擎初始启用范围 | 已完成 | `Requirements/REQ-20260825-008-default-engine-bootstrap.md` | 新实例默认启用 Bing、Baidu、CSDN、Juejin、Sogou；Exa 与需要 Proxy 的引擎保持关闭；旧默认列表只迁移一次。 |
| REQ-20260825-006 | 2026-08-25 | 功能需求 / 部署 / 认证 | LPK 多实例与懒猫 OIDC 登录 | 进行中 | `Requirements/REQ-20260825-006-lpk-oidc-multi-instance.md`、`Decisions/DEC-20260825-006-lpk-oidc-multi-instance.md`、`Progress/PROG-REQ-20260825-006-lpk-oidc-multi-instance.md` | 新实例挂载空数据库目录；门户显式 OIDC，`/mcp` 网关放行但保持独立 Token。 |
| REQ-20260825-005 | 2026-08-25 | 功能需求 / UI/体验调整 | 调用统计与审计日志时间范围查询 | 已完成 | `Requirements/REQ-20260825-005-usage-time-range-audit.md`、`Decisions/DEC-20260825-005-usage-time-range-audit.md`、`Progress/PROG-REQ-20260825-005-usage-time-range-audit.md` | 默认最近 7 天；支持预设、自定义范围、Web/MCP 统一统计、服务端筛选分页和用户时区趋势。 |
| REQ-20260825-004 | 2026-08-25 | UI/体验调整 | 移除门户重复的 MCP 传输说明 | 已完成 | `docs/UI_GUIDE.md` | 侧边栏不再显示 MCP 传输标识，MCP 管理页不再重复展示 Transport 协议模式；服务端 Streamable HTTP Endpoint 与客户端配置模板保持不变。 |
| REQ-20260825-003 | 2026-08-25 | 功能需求 / UI/体验调整 | 搜索引擎启用前置校验、API Key 弹窗与首页结果布局 | 已完成 | `Decisions/DEC-20260825-003-engine-activation-requirements.md`、`Progress/PROG-REQ-20260825-003-engine-activation-and-search-layout.md` | Brave 已从运行时移除；启用前置校验、加密 API Key 弹窗、统一官方图标 Tag、首页布局和本地验证均已完成。 |
| REQ-20260825-002 | 2026-08-25 | 功能需求 | 移除 Startpage 与搜索结果 JSON 展示 | 待验证 | `Decisions/DEC-20260825-002-retire-startpage-and-result-json.md`、`Progress/PROG-REQ-20260825-002-retire-startpage-and-result-json.md` | 代码、自动化测试、类型检查和构建已通过；登录后的浏览器交互待在完整三进程环境验证。 |
| REQ-20260824-004 | 2026-08-24 | UI/体验调整 | 顶部服务状态与 App 品牌栏统一 | 已完成 | `docs/UI_GUIDE.md` | 顶部统一显示连接中/在线/离线 Tag；移除页面内 Live/Active 服务状态与版本说明；品牌按中英文显示喵喵搜索 / Miaomiao Search。 |
| REQ-20260824-005 | 2026-08-24 | UI/体验调整 | 配置模板换行与页面说明文案收敛 | 已完成 | `docs/UI_GUIDE.md` | MCP 客户端配置保留 JSON 换行并支持长行折行；搜索、MCP、引擎、统计、系统配置及登录页说明统一压缩为一句话。 |
| REQ-20260824-006 | 2026-08-24 | 功能需求 | 搜索历史永久保存 | 已完成 | `Decisions/DEC-20260824-006-search-history-retention.md` | `history.retentionDays=-1` 表示永久保存；设置、读取历史和新增搜索时按保留策略清理，手动清空仍可用。 |
| REQ-20260824-003 | 2026-08-24 | UI/体验调整 | 调用统计与审计日志多维度布局 | 已完成 | `docs/UI_GUIDE.md` | 新增时间节奏、结果状态、流量来源、操作类型、引擎统计和组合筛选；仅复用现有审计日志数据，不改变服务端 schema。 |
| REQ-20260824-007 | 2026-08-24 | 功能需求 | 多引擎独立结果数量与分组展示 | 待验收 | `Decisions/DEC-20260824-007-search-engine-result-limits.md`、`Progress/PROG-REQ-20260824-007-search-engine-result-limits.md` | 数据库迁移、服务端按引擎并发、独立缓存、管理 API、首页分组/聚合视图、历史兼容和 MCP 响应已实现；待部署环境、真实上游和外部 MCP 客户端回归。 |
| REQ-20260823-001 | 2026-08-23 | 功能需求 | miaomiao-search V1 实施基线 | 进行中 | `Decisions/DEC-20260823-001-v1-search-mode.md`、`Decisions/DEC-20260823-003-stage-2-data-and-upstream.md`、`Decisions/DEC-20260823-004-stage-3-api-and-mcp.md` / `Progress/PROG-REQ-20260823-001-v1-implementation.md` | 阶段 1 门户、阶段 2 服务端领域层和阶段 3 管理 API/MCP 已完成；等待阶段 4 部署与端到端验证。 |
| REQ-20260824-002 | 2026-08-24 | 功能需求 | 搜索历史结果快照与首页体验 | 已完成 | `Decisions/DEC-20260824-002-search-history-snapshot.md` | 本地浏览器已验证列表、详情、旧快照和再次搜索；生产部署与端到端回归仍归属 V1 阶段 4。 |
| REQ-20260829-002 | 2026-08-29 | Bug / 功能改进 / UX / 搜索 / MCP | 正文阅读器、错误本地化、引擎顺序与桌面宽度 | 待验证 | `Requirements/REQ-20260829-002-portal-reader-engine-order-width.md`、`Decisions/DEC-20260829-002-portal-reader-engine-order.md`、`Progress/PROG-REQ-20260829-002-portal-reader-engine-order-width.md` | 代码、类型检查、Lint 和自动化测试已完成；待登录后的桌面/移动浏览器与 MCP 顺序回归。 |
