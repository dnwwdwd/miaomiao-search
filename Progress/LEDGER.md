# 功能进度台账

| REQ ID | 标题 | 状态 | 当前阶段 | 功能进度文档 | 最近更新 | 阻塞 / 下一步 |
|---|---|---|---|---|---|---|
| REQ-20260825-006 | LPK 多实例与懒猫 OIDC 登录 | 进行中 | 实施与打包 | `Progress/PROG-REQ-20260825-006-lpk-oidc-multi-instance.md` | 2026-08-25 | 完成 OIDC、LPK 内容与直接打包；按用户要求不额外验证。 |
| REQ-20260825-005 | 调用统计与审计日志时间范围查询 | 已完成 | 阶段 3 收口 | `Progress/PROG-REQ-20260825-005-usage-time-range-audit.md` | 2026-08-25 | 服务端聚合、门户范围筛选、自动化测试和浏览器回归均已完成。 |
| REQ-20260825-003 | 搜索引擎启用前置校验、API Key 弹窗与首页结果布局 | 已完成 | 阶段 3 收口 | `Progress/PROG-REQ-20260825-003-engine-activation-and-search-layout.md` | 2026-08-25 | lint、typecheck、test、build、diff-check 通过；本地浏览器已验证首页、历史详情、引擎管理和 API Key 弹窗。 |
| REQ-20260825-002 | 移除 Startpage 与搜索结果 JSON 展示 | 待验证 | 阶段 3 收口 | `Progress/PROG-REQ-20260825-002-retire-startpage-and-result-json.md` | 2026-08-25 | lint、typecheck、test、build 已通过；完整三进程登录后的首页和 MCP 客户端回归待执行。 |
| REQ-20260824-002 | Search history result snapshots and homepage UX | 已完成 | 阶段 3 收口 | `Progress/PROG-REQ-20260823-001-v1-implementation.md` | 2026-08-24 | 本地浏览器已验证；生产部署与端到端回归随 V1 阶段 4 执行。 |
| REQ-20260824-003 | 调用统计与审计日志多维度布局 | 已完成 | 阶段 3 收口 | `Progress/PROG-REQ-20260823-001-v1-implementation.md` | 2026-08-24 | 复用现有审计数据完成维度展示；不改服务端 schema。 |
| REQ-20260824-004 | 顶部服务状态与 App 品牌栏统一 | 已完成 | 阶段 3 收口 | `Progress/PROG-REQ-20260823-001-v1-implementation.md` | 2026-08-24 | 顶部统一服务状态 Tag、应用名和语言切换；生产状态仍需阶段 4 验证。 |
| REQ-20260824-005 | 配置模板换行与页面说明文案收敛 | 已完成 | 阶段 3 收口 | `Progress/PROG-REQ-20260823-001-v1-implementation.md` | 2026-08-24 | 模板换行/折行和页面一句话说明已在门户实现。 |
| REQ-20260824-006 | 搜索历史永久保存 | 已完成 | 阶段 3 收口 | `Progress/PROG-REQ-20260823-001-v1-implementation.md` | 2026-08-24 | `-1` 永久保存及自动清理边界已通过服务端测试。 |
| REQ-20260824-007 | 多引擎独立结果数量与分组展示 | 待验收 | 阶段 3 收口 | `Progress/PROG-REQ-20260824-007-search-engine-result-limits.md` | 2026-08-24 | 代码和本地自动化验收已通过；待部署环境、真实 Open-WebSearch 各引擎数量和外部 MCP 客户端回归。 |
| REQ-20260823-001 | lazycat-search V1 实施基线 | 进行中 | 阶段 3 已完成：管理 API、MCP、门户真实数据接入与共享控件组件化 | `Progress/PROG-REQ-20260823-001-v1-implementation.md` | 2026-08-24 | 阶段 4：Docker、懒猫微服打包与生产拓扑验证。 |
