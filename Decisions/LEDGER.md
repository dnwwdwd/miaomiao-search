# 决策台账

| ID | 日期 | 标题 | 状态 | 关联需求 | 用户确认 | 记录位置 |
|---|---|---|---|---|---|---|
| DEC-20260829-003 | 2026-08-29 | 懒猫 Resource MCP 与应用间委托鉴权 | 已实施，待设备验证 | REQ-20260829-003 | 保留 Bearer Token，新增仅 `X-HC-SOURCE=app:<包名>` + `X-HC-USER-ID` 的委托分支；LPK 导出 `mcp-providers/miaomiao-search`。 | `Decisions/DEC-20260829-003-lazycat-resource-mcp.md` |
| DEC-20260829-001 | 2026-08-29 | JS 正文抓取的 Playwright 运行时 | 已实施，待设备验证 | REQ-20260828-001 | 用户指出浏览器回退缺少生产依赖并要求补齐；本轮补充 Playwright 客户端、Chromium 镜像层和 LPK 环境配置。 | `Decisions/DEC-20260829-001-playwright-runtime.md` |
| DEC-20260829-002 | 2026-08-29 | 门户正文阅读器与引擎顺序持久化 | 已确认实施 | REQ-20260829-002 | 用户确认正文弹窗、错误本地化、首页/MCP 顺序拖拽和桌面宽度调整；顺序使用现有 Settings JSON 持久化。 | `Decisions/DEC-20260829-002-portal-reader-engine-order.md` |
| DEC-20260828-001 | 2026-08-28 | Bing 重定向与网页正文多策略提取 | 已实施，待设备验证 | REQ-20260828-001 | 2026-08-28：用户要求修复 Bing 302、补充正文抓取策略，并让 Web/MCP 与前端正确表达无正文状态。 | `Decisions/DEC-20260828-001-bing-and-web-content-resilience.md` |
| DEC-20260827-001 | 2026-08-27 | 喵喵搜索的新包身份与运行时命名 | 已确认实施 | REQ-20260827-001 | 用户确认将应用改名为喵喵搜索、修改包标识符、全文件替换并重新发布镜像和 LPK。 | `Decisions/DEC-20260827-001-miaomiao-package-identity.md` |
| DEC-20260826-001 | 2026-08-26 | 单实例与按懒猫用户隔离 | 已确认实施 | REQ-20260826-001 | 用户确认去除多实例，并采用应用内部 UID/OIDC/本地账号映射、独立用户数据和 agent-desk 会话切换行为。 | Decisions/DEC-20260826-001-single-instance-user-isolation.md |
| DEC-20260826-002 | 2026-08-26 | Cloudflare Tunnel 下移除 Host 与 DNS/SSRF 限制 | 已确认实施 | REQ-20260826-002 | 由 Cloudflare Tunnel/反向代理承接入口转发，应用移除 Host/Origin allowlist 与正文 URL DNS/SSRF 拦截，保留认证、Token、限流、协议和资源边界。 | Decisions/DEC-20260826-002-cloudflare-tunnel-network-boundary.md |
| DEC-20260825-013 | 2026-08-25 | 自定义运行时镜像与轻量 LPK | 已确认实施 | REQ-20260825-014 | 确认以 Linux amd64 自定义镜像承载 web/API/daemon，推送 Docker Hub 后复制到懒猫官方 registry；LPK 只保留轻量内容。 | `Decisions/DEC-20260825-013-custom-runtime-image.md` |
| DEC-20260825-012 | 2026-08-25 | OIDC 建号与本地账号密码认证 | 已确认实施 | REQ-20260825-014 | 确认首次 OIDC 建立本地账户，默认密码 `12345678`，Settings 支持改密并显示登录方式。 | `Decisions/DEC-20260825-012-local-account-authentication.md` |
| DEC-20260825-011 | 2026-08-25 | TUN/VPN 场景下的 DuckDuckGo 启用边界 | 已确认实施 | REQ-20260825-013 | 用户确认 TUN/VPN 默认接管应用流量，移除 Settings 代理卡片；DuckDuckGo 启用只提示确认系统代理，不要求填写地址。 | `Decisions/DEC-20260825-011-proxy-tun-activation.md` |
| DEC-20260825-010 | 2026-08-25 | MCP 百度搜索 302 重定向处理 | 已实施 | BUG-20260825-012 | 2026-08-25：用户反馈首页 Baidu 可用但 MCP 返回 302，确认修复上游适配器并重新打包 LPK。 | `Decisions/DEC-20260825-010-baidu-mcp-302-redirect.md` |
| DEC-20260825-009 | 2026-08-25 | MCP 动态引擎与专用正文上游 | 已实施 | REQ-20260825-012 | 2026-08-25：按用户测试反馈，让 MCP 搜索跟随引擎管理启用状态，专用正文 Tool 使用对应 daemon endpoint，并保留具体错误。 | `Decisions/DEC-20260825-009-mcp-dynamic-tools-and-upstream-fetch.md` |
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
