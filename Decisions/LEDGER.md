# 决策台账

| ID | 日期 | 标题 | 状态 | 关联需求 | 用户确认 | 记录位置 |
|---|---|---|---|---|---|---|
| DEC-20260825-006 | 2026-08-25 | LPK 多实例、OIDC 与数据库挂载 | 已确认实施 | REQ-20260825-006 | 2026-08-25：多实例空数据库挂载、OIDC 点击授权、仅 `/mcp` 网关放行、MCP Token 与懒猫账户隔离。 | `Decisions/DEC-20260825-006-lpk-oidc-multi-instance.md` |
| DEC-20260825-005 | 2026-08-25 | 调用统计与审计日志时间范围查询 | 已确认实施 | REQ-20260825-005 | 复用 request_log 与现有索引，服务端完成范围聚合、JSON 引擎筛选、P95 和分页；不新增表。 | `Decisions/DEC-20260825-005-usage-time-range-audit.md` |
| DEC-20260825-003 | 2026-08-25 | 搜索引擎启用前置校验与凭据配置 | 已确认实施 | REQ-20260825-003 | 2026-08-25：确认 API Key 通过弹窗加密保存，独立 daemon 需重启后生效 | `Decisions/DEC-20260825-003-engine-activation-requirements.md` |
| DEC-20260825-002 | 2026-08-25 | 移除 Startpage 与搜索结果 JSON 兼容策略 | 已确认实施 | REQ-20260825-002 | 2026-08-25：用户要求移除 Startpage、首页显示网站图标并支持嵌套 JSON，同时确认 MCP 搜索保持 JSON 暴露 | `Decisions/DEC-20260825-002-retire-startpage-and-result-json.md` |
| DEC-20260825-001 | 2026-08-25 | Open-WebSearch 搜索引擎上游边界与错误映射 | 已实施 | BUG-20260825-001 | 2026-08-25：固化 Brave 新解析器，补充 Exa 官方 API 的环境变量路径与明确失败映射，识别 Startpage Anubis 反爬 | `Decisions/DEC-20260825-001-open-websearch-engine-boundaries.md` |
| DEC-20260823-001 | 2026-08-23 | V1 Bing 搜索模式边界 | 已实施 | REQ-20260823-001 | 2026-08-23：采用 HTTP request-only，并保留中英文切换；本地运行时已验证，生产回归归属阶段 4 | `Decisions/DEC-20260823-001-v1-search-mode.md` |
| DEC-20260823-002 | 2026-08-23 | V1 门户迁移到 Next.js | 已实施 | REQ-20260823-001 | 2026-08-23：迁移静态门户为 Next.js JSX，建立基础组件与历史原型数据；当前门户已接入真实管理 API | `Decisions/DEC-20260823-002-nextjs-frontend.md` |
| DEC-20260823-003 | 2026-08-23 | 阶段 2 的数据、安全与 Open-WebSearch 接入方案 | 已实施 | REQ-20260823-001 | 2026-08-23：用户要求直接完成阶段 2，采用私有 daemon HTTP 适配器、六表 SQLite 与独立密钥 | `Decisions/DEC-20260823-003-stage-2-data-and-upstream.md` |
| DEC-20260823-004 | 2026-08-23 | 阶段 3 的管理 API、门户接入与 MCP Transport | 已实施 | REQ-20260823-001 | 2026-08-23：用户要求进入下一阶段并完成开发、运行本地服务；API、门户真实数据和 Streamable HTTP 已在本地验证 | `Decisions/DEC-20260823-004-stage-3-api-and-mcp.md` |
| DEC-20260824-002 | 2026-08-24 | 搜索历史结果快照与再次搜索 | 已实施 | REQ-20260824-002 | 2026-08-24：已保存关键词、引擎选择和结果快照；详情查看与再次搜索已在本地验证 | `Decisions/DEC-20260824-002-search-history-snapshot.md` |
| DEC-20260824-006 | 2026-08-24 | 搜索历史永久保存 | 已实施 | REQ-20260824-006 | 2026-08-24：`-1` 表示永久保存，设置、读取历史、新增搜索和手动清空路径已同步 | `Decisions/DEC-20260824-006-search-history-retention.md` |
| DEC-20260824-007 | 2026-08-24 | 多引擎独立结果数量与分组展示 | 已确认实施 | REQ-20260824-007 | 2026-08-24：确认引擎独立 `result_limit`、调用方临时上限和 `engineResults[]`/`results` 双形态响应；实现与验收进行中 | `Decisions/DEC-20260824-007-search-engine-result-limits.md` |
