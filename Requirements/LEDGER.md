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
| REQ-20260825-006 | 2026-08-25 | 功能需求 / 部署 / 认证 | LPK 多实例与懒猫 OIDC 登录 | 进行中 | `Requirements/REQ-20260825-006-lpk-oidc-multi-instance.md`、`Decisions/DEC-20260825-006-lpk-oidc-multi-instance.md`、`Progress/PROG-REQ-20260825-006-lpk-oidc-multi-instance.md` | 新实例挂载空数据库目录；门户显式 OIDC，`/mcp` 网关放行但保持独立 Token。 |
| REQ-20260825-005 | 2026-08-25 | 功能需求 / UI/体验调整 | 调用统计与审计日志时间范围查询 | 已完成 | `Requirements/REQ-20260825-005-usage-time-range-audit.md`、`Decisions/DEC-20260825-005-usage-time-range-audit.md`、`Progress/PROG-REQ-20260825-005-usage-time-range-audit.md` | 默认最近 7 天；支持预设、自定义范围、Web/MCP 统一统计、服务端筛选分页和用户时区趋势。 |
| REQ-20260825-004 | 2026-08-25 | UI/体验调整 | 移除门户重复的 MCP 传输说明 | 已完成 | `docs/UI_GUIDE.md` | 侧边栏不再显示 MCP 传输标识，MCP 管理页不再重复展示 Transport 协议模式；服务端 Streamable HTTP Endpoint 与客户端配置模板保持不变。 |
| REQ-20260825-003 | 2026-08-25 | 功能需求 / UI/体验调整 | 搜索引擎启用前置校验、API Key 弹窗与首页结果布局 | 已完成 | `Decisions/DEC-20260825-003-engine-activation-requirements.md`、`Progress/PROG-REQ-20260825-003-engine-activation-and-search-layout.md` | Brave 已从运行时移除；启用前置校验、加密 API Key 弹窗、统一官方图标 Tag、首页布局和本地验证均已完成。 |
| REQ-20260825-002 | 2026-08-25 | 功能需求 | 移除 Startpage 与搜索结果 JSON 展示 | 待验证 | `Decisions/DEC-20260825-002-retire-startpage-and-result-json.md`、`Progress/PROG-REQ-20260825-002-retire-startpage-and-result-json.md` | 代码、自动化测试、类型检查和构建已通过；登录后的浏览器交互待在完整三进程环境验证。 |
| REQ-20260824-004 | 2026-08-24 | UI/体验调整 | 顶部服务状态与 App 品牌栏统一 | 已完成 | `docs/UI_GUIDE.md` | 顶部统一显示连接中/在线/离线 Tag；移除页面内 Live/Active 服务状态与版本说明；品牌按中英文显示懒猫搜索 / Lazycat Search。 |
| REQ-20260824-005 | 2026-08-24 | UI/体验调整 | 配置模板换行与页面说明文案收敛 | 已完成 | `docs/UI_GUIDE.md` | MCP 客户端配置保留 JSON 换行并支持长行折行；搜索、MCP、引擎、统计、系统配置及登录页说明统一压缩为一句话。 |
| REQ-20260824-006 | 2026-08-24 | 功能需求 | 搜索历史永久保存 | 已完成 | `Decisions/DEC-20260824-006-search-history-retention.md` | `history.retentionDays=-1` 表示永久保存；设置、读取历史和新增搜索时按保留策略清理，手动清空仍可用。 |
| REQ-20260824-003 | 2026-08-24 | UI/体验调整 | 调用统计与审计日志多维度布局 | 已完成 | `docs/UI_GUIDE.md` | 新增时间节奏、结果状态、流量来源、操作类型、引擎贡献和组合筛选；仅复用现有审计日志数据，不改变服务端 schema。 |
| REQ-20260824-007 | 2026-08-24 | 功能需求 | 多引擎独立结果数量与分组展示 | 待验收 | `Decisions/DEC-20260824-007-search-engine-result-limits.md`、`Progress/PROG-REQ-20260824-007-search-engine-result-limits.md` | 数据库迁移、服务端按引擎并发、独立缓存、管理 API、首页分组/聚合视图、历史兼容和 MCP 响应已实现；待部署环境、真实上游和外部 MCP 客户端回归。 |
| REQ-20260823-001 | 2026-08-23 | 功能需求 | lazycat-search V1 实施基线 | 进行中 | `Decisions/DEC-20260823-001-v1-search-mode.md`、`Decisions/DEC-20260823-003-stage-2-data-and-upstream.md`、`Decisions/DEC-20260823-004-stage-3-api-and-mcp.md` / `Progress/PROG-REQ-20260823-001-v1-implementation.md` | 阶段 1 门户、阶段 2 服务端领域层和阶段 3 管理 API/MCP 已完成；等待阶段 4 部署与端到端验证。 |
| REQ-20260824-002 | 2026-08-24 | 功能需求 | 搜索历史结果快照与首页体验 | 已完成 | `Decisions/DEC-20260824-002-search-history-snapshot.md` | 本地浏览器已验证列表、详情、旧快照和再次搜索；生产部署与端到端回归仍归属 V1 阶段 4。 |
