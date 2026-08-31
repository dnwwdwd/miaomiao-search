# 功能进度台账

| REQ ID | 标题 | 状态 | 当前阶段 | 功能进度文档 | 最近更新 | 阻塞 / 下一步 |
|---|---|---|---|---|---|---|
| REQ-20260831-003 | Exa MCP 使用用户数据库凭据 | 待验证 | Fastify Exa Provider、加密设置读取和 MCP 测试已完成 | `Progress/PROG-REQ-20260831-003-exa-database-credential.md` | 2026-08-31 | 完成最终 lint/typecheck/test/build 与 LPK 发布；待设备双用户凭据隔离回归。 |
| REQ-20260831-002 | 门户下拉层、正文阅读器与凭据交互收口 | 待验证 | Dropdown 浮层、B站详情、凭据申请入口/明文切换和首页来源交互已完成 | `Progress/PROG-REQ-20260831-002-portal-interaction-and-bilibili-details.md` | 2026-08-31 | 登录后回归表格下拉定位、B站详情统计和凭据链接新窗口行为。 |
| REQ-20260831-001 | 新增 Firecrawl、Tavily、GitHub 与 B站搜索源 | 待验证 | Provider、统一搜索链路、门户、MCP、历史快照和审计已完成 | `Progress/PROG-REQ-20260831-001-four-search-providers.md` | 2026-08-31 | 默认本地验证已通过；真实外部 API、B站在线状态和设备回归待执行。 |
| REQ-20260829-003 | 懒猫 Resource MCP 与应用间委托调用 | 待验证 | Resource MCP 元数据、`/mcp` 双鉴权、本地自动化和 LPK 资源路径检查已完成 | `Progress/PROG-REQ-20260829-003-lazycat-resource-mcp.md` | 2026-08-29 | 在 lzcos 设备上验证小龙猫/Codex 发现和 `.lzcx` 调用。 |
| REQ-20260828-001 | Bing 重定向与网页正文读取容错 | 待验证 | 上游补丁、正文回退、错误语义和 Playwright 生产运行时已实现 | `Progress/PROG-REQ-20260828-001-bing-and-web-content-resilience.md` | 2026-08-29 | 用真实设备验证 Bing 302、代理/TUN DIRECT 规则、Chromium 启动和动态页面正文回退。 |
| REQ-20260827-001 | 喵喵搜索品牌、包标识符与发布包更新 | 已完成 | 品牌替换、镜像发布与 LPK 验证完成 | `Progress/PROG-REQ-20260827-001-miaomiao-brand-and-package-release.md` | 2026-08-27 | Docker Hub digest `sha256:065a27414cceab75237d28f872256449e657f9eae1f0751af9cec77326462c8e`；官方镜像 `registry.lazycat.cloud/u30387910/c1own123/lazycat:a3bea6e9c8a0614c`；设备安装回归待部署环境。 |
| REQ-20260826-001 | 单实例懒猫用户隔离与会话切换 | 待验证 | 代码完成，等待设备双用户回归 | Progress/PROG-REQ-20260826-001-single-instance-user-isolation.md | 2026-08-26 | 验证 UID 切换、登出根路径、用户数据隔离和 Token owner 隔离。 |
| REQ-20260826-002 | Cloudflare Tunnel 网络边界放宽 | 已完成实现，待部署验证 | 移除 Host/Origin 与 DNS/SSRF 限制，自动化检查已通过 | `Progress/PROG-REQ-20260826-002-cloudflare-tunnel-network-boundary.md` | 2026-08-26 | 已更新服务端、Open-WebSearch 补丁、LPK 环境和安全文档；待验证 Tunnel 公网 Host、私网正文 URL 与设备认证边界。 |
| REQ-20260825-014 | 本地账号登录、改密与自定义运行时镜像 | 待验证 | 代码、镜像发布与 LPK 完成，等待设备回归 | `Progress/PROG-REQ-20260825-014-local-account-and-custom-image.md` | 2026-08-25 | 懒猫设备验证首次 OIDC 建号、本地登录、改密、路由和 MCP。 |
| REQ-20260825-013 | 门户细节、TUN 代理提示与 LPK 重新打包 | 已完成 | 阶段 3 UI/配置收口与 LPK 发布 | `Progress/PROG-REQ-20260825-013-portal-polish-proxy-tun-and-lpk.md` | 2026-08-25 | `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`、`lzc-cli project lint`、`lzc-cli lpk lint` 均通过；设备安装与真实 OIDC 回归属于后续部署验证。 |
| REQ-20260825-012 | MCP 动态引擎与正文 Tool 可用性 | 已完成 | 阶段 3 MCP/上游收口 | `Progress/PROG-REQ-20260825-012-mcp-dynamic-engines-and-fetch-tools.md` | 2026-08-25 | 本地代码与自动化验证后重新打包 LPK；待懒猫设备和外部 MCP 客户端回归。 |
| REQ-20260825-011 | MCP Token 限额选项与复制 | 已完成 | 阶段 3 MCP 管理收口 | `Progress/PROG-REQ-20260825-011-mcp-token-limits-and-copy.md` | 2026-08-25 | 本地自动化与 LPK 构建已完成；懒猫设备真实 OIDC 页面交互随阶段 4 回归。 |
| REQ-20260825-010 | MCP Token 调用量与删除操作 | 已完成 | 阶段 3 MCP 管理收口 | `Progress/PROG-REQ-20260825-010-mcp-token-usage-and-delete.md` | 2026-08-25 | 本地自动化验证已补齐；懒猫设备真实 OIDC 页面交互仍随阶段 4 回归。 |
| REQ-20260825-009 | 门户持久化与 PRD 对齐审查、Usage UI 收口 | 已完成 | 阶段 3 UI/文档收口 | `Progress/PROG-REQ-20260825-009-portal-review-and-usage-ui.md` | 2026-08-25 | Usage 滚动条、KPI 布局、范围下拉、国际化与引擎统计标题已收口，Settings 默认搜索参数 Card 已移除；审查确认的每引擎速率与正文长度缺口留待后续需求。 |
| REQ-20260825-006 | LPK 多实例与懒猫 OIDC 登录 | 进行中 | x86-64 LPK 构建完成，待设备安装验证 | `Progress/PROG-REQ-20260825-006-lpk-oidc-multi-instance.md` | 2026-08-25 | 已重写运行脚本并生成 `release/miaomiao-search-0.1.0.lpk`；待懒猫设备安装和真实 OIDC/MCP 回归。 |
| REQ-20260825-005 | 调用统计与审计日志时间范围查询 | 已完成 | 阶段 3 收口 | `Progress/PROG-REQ-20260825-005-usage-time-range-audit.md` | 2026-08-25 | 服务端聚合、门户范围筛选、自动化测试和浏览器回归均已完成。 |
| REQ-20260825-003 | 搜索引擎启用前置校验、API Key 弹窗与首页结果布局 | 已完成 | 阶段 3 收口 | `Progress/PROG-REQ-20260825-003-engine-activation-and-search-layout.md` | 2026-08-25 | lint、typecheck、test、build、diff-check 通过；本地浏览器已验证首页、历史详情、引擎管理和 API Key 弹窗。 |
| REQ-20260825-002 | 移除 Startpage 与搜索结果 JSON 展示 | 待验证 | 阶段 3 收口 | `Progress/PROG-REQ-20260825-002-retire-startpage-and-result-json.md` | 2026-08-25 | lint、typecheck、test、build 已通过；完整三进程登录后的首页和 MCP 客户端回归待执行。 |
| REQ-20260824-002 | Search history result snapshots and homepage UX | 已完成 | 阶段 3 收口 | `Progress/PROG-REQ-20260823-001-v1-implementation.md` | 2026-08-24 | 本地浏览器已验证；生产部署与端到端回归随 V1 阶段 4 执行。 |
| REQ-20260824-003 | 调用统计与审计日志多维度布局 | 已完成 | 阶段 3 收口 | `Progress/PROG-REQ-20260823-001-v1-implementation.md` | 2026-08-24 | 复用现有审计数据完成维度展示；不改服务端 schema。 |
| REQ-20260824-004 | 顶部服务状态与 App 品牌栏统一 | 已完成 | 阶段 3 收口 | `Progress/PROG-REQ-20260823-001-v1-implementation.md` | 2026-08-24 | 顶部统一服务状态 Tag、应用名和语言切换；生产状态仍需阶段 4 验证。 |
| REQ-20260824-005 | 配置模板换行与页面说明文案收敛 | 已完成 | 阶段 3 收口 | `Progress/PROG-REQ-20260823-001-v1-implementation.md` | 2026-08-24 | 模板换行/折行和页面一句话说明已在门户实现。 |
| REQ-20260824-006 | 搜索历史永久保存 | 已完成 | 阶段 3 收口 | `Progress/PROG-REQ-20260823-001-v1-implementation.md` | 2026-08-24 | `-1` 永久保存及自动清理边界已通过服务端测试。 |
| REQ-20260824-007 | 多引擎独立结果数量与分组展示 | 待验收 | 阶段 3 收口 | `Progress/PROG-REQ-20260824-007-search-engine-result-limits.md` | 2026-08-24 | 代码和本地自动化验收已通过；待部署环境、真实 Open-WebSearch 各引擎数量和外部 MCP 客户端回归。 |
| REQ-20260823-001 | miaomiao-search V1 实施基线 | 进行中 | 阶段 3 已完成：管理 API、MCP、门户真实数据接入与共享控件组件化 | `Progress/PROG-REQ-20260823-001-v1-implementation.md` | 2026-08-24 | 阶段 4：Docker、懒猫微服打包与生产拓扑验证。 |
| REQ-20260829-002 | 正文阅读器、错误本地化、引擎顺序与桌面宽度 | 待验证 | 弹窗体验、前端错误摘要/详情、Web/MCP 顺序持久化和 90% 桌面宽度已实现 | `Progress/PROG-REQ-20260829-002-portal-reader-engine-order-width.md` | 2026-08-29 | 登录后完成浏览器交互与 MCP 未指定引擎顺序回归。 |
