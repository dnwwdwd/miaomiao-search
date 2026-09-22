# 门户持久化、PRD 对齐与可用性审查

> 审查日期：2026-08-25
> 对照文档：`docs/喵喵搜索 PRD.md`、`docs/UI_GUIDE.md`、`docs/DESIGN.md`
> 证据范围：`app/`、`src/components/portal/`、`src/lib/api.ts`、`packages/server/src/`、现有契约/服务端测试

## 结论

当前门户已经接入 Fastify API，Search、MCP、Engines、Usage、Settings 五个管理页面和 OIDC 登录入口都能按代码路径运行；核心搜索、正文读取、历史快照、引擎管理、Usage 聚合与 MCP 管理均有真实写入或读取入口。

项目当前还不能宣称“页面和功能全部与 PRD 完全一致、全部在生产环境可用”。主要原因有三类：

1. PRD 仍保留用户名/密码登录、浏览器最近选择和本次临时 Limit 的旧口径；当前实现按 OIDC、服务端设置和持久化首页偏好运行，UI Guide 已记录新口径。
2. 懒猫微服运行不依赖门户代理配置；设备安装、真实 OIDC、外部 MCP 客户端 initialize 和所有上游引擎的生产网络条件仍需阶段 4 回归。

## 页面变量持久化矩阵

“持久化”指刷新页面或重启门户后仍可从服务端/数据库恢复；只在 React state、URL 或浏览器临时状态中的变量归为临时状态。

| 页面 | 变量/动作 | 当前存储与写入时机 | 刷新后 | 结论 |
|---|---|---|---|---|
| Login | OIDC 会话 | 服务端 `miaomiao_search_session` HttpOnly Cookie | 保持会话，过期后重新登录 | 可持久化 |
| Login | `authError=oidc_failed` | 回调 URL 查询参数 | 只在当前错误跳转显示 | 临时 |
| 全局 | 中文/英文 `locale` | `PortalProvider` React state | 恢复中文 | 临时；PRD 只要求可切换，未要求记忆 |
| 全局 | 当前一级页面 `active` | `PortalWorkspace` React state | 回到 Search | 临时 |
| Search | Query、加载状态、结果、失败信息、耗时 | 页面 React state | 清空 | 临时 |
| Search | 结果视图 grouped/aggregate、正文/JSON/历史弹窗、滚动位置 | 页面 React state/ref | 清空 | 临时 |
| Search | 已选引擎 `homeEngines` | `setting` KV；每次选择、恢复默认、历史重搜立即 PUT | 恢复 | 可持久化；当前是服务端实例级，不是浏览器级 |
| Search | 本次每引擎上限 `homeRequestLimit` | `setting` KV；选择后立即 PUT | 恢复 | 可持久化；与 PRD“本次请求临时上限”旧口径不一致 |
| Search | Bing 模式 `homeBingMode` | `setting` KV；选择后立即 PUT | 恢复 | 可持久化；服务端 V1 实际始终使用 Request |
| Search | 搜索历史与快照 | `search_history`；真实 Web 搜索成功后写入，按保留策略清理 | 恢复 | 可持久化 |
| Search | 清空历史 | DELETE `/api/history` | 已删除 | 立即持久化 |
| MCP | Tool 启停 | `mcp.tools` 设置 KV；切换后立即 PUT | 恢复 | 可持久化 |
| MCP | Token 名称、Scope、限流、过期时间 | `access_token` 表；点击生成后写入 | 恢复 | 可持久化 |
| MCP | Token 今日调用量 | `request_log.token_id` 按 UTC 自然日聚合；每次读取 `/api/tokens` 计算 | 恢复当前真实数量 | 可持久化派生值；不新增计数列 |
| MCP | Token Secret | 创建响应和一次性弹窗 | 不可恢复；数据库只保存 Hash | 一次性显示 |
| MCP | 当前模板、Token 表单、连接测试报告、Secret 弹窗 | 页面 React state | 清空 | 临时 |
| Engines | enabled、isDefault、Search Mode、resultLimit | `engine` 表；切换后 PATCH | 恢复 | 可持久化 |
| Engines | Exa API Key | 加密 `setting` KV；保存/清除后写入，不回显 | 恢复“已配置”状态 | 可持久化且加密 |
| Engines | 测试关键词、测试弹窗、最近一次测试结果 | 页面 React state；健康结果本身由测试接口写入 `engine` 表 | 关键词/弹窗清空，健康结果恢复 | 混合 |
| Usage | 时间范围、Channel/Operation/Status/Engine 筛选、页码 | 页面 React state；每次变更重新请求 `/api/usage` | 回到最近 7 天和默认筛选 | 临时；统计数据由 `request_log` 派生 |
| Settings | 代理、缓存、限流、默认 Limit、历史和日志开关 | 页面先编辑 React state，点击“保存设置”后写入设置 KV | 已保存值恢复，未保存草稿丢失 | 可持久化；保存按钮语义明确 |
| Settings | 各引擎默认选定 | PATCH `/api/engines/:id`，点击即写入 | 恢复 | 可持久化 |
| Settings | 清空历史 | DELETE `/api/history`，点击即执行 | 已删除 | 立即持久化 |

敏感字段边界：代理 URL 返回浏览器时会遮罩密码，PUT 遇到遮罩值不会覆盖原密钥；Exa Key 加密保存；MCP Secret 只显示一次。真实正文、搜索结果和日志均由 React 文本节点渲染。

## PRD 对齐情况

| 页面/能力 | 状态 | 证据与差异 |
|---|---|---|
| Login | 部分对齐 | 当前实现是 OIDC 按钮和失败提示，符合 `docs/UI_GUIDE.md` 与懒猫部署方案；PRD 3.1 仍写用户名/密码表单，需要统一文档口径。 |
| Search | 基本对齐 | 多引擎搜索、空输入保护、URL 正文提示、并发分组结果、聚合去重、部分失败、历史快照和正文阅读均已接真实 API。首页来源与 Limit 持久化是当前实现口径；Bing Auto 选项可保存，但服务端实际固定 Request，存在语义差异。 |
| MCP | 基本对齐 | Endpoint、Tool 启停、Token 创建/禁用/启用/撤销/删除、配置模板和管理端检查已实现。Token 今日调用量按 UTC 当日 `request_log.token_id` 聚合返回；删除确认后保留审计记录。带 Token 的 initialize/search 仍需外部客户端回归。 |
| Engines | 基本对齐 | 默认引擎、Search Mode、每引擎返回数量、健康测试、状态和 Exa Key 弹窗均已实现。DuckDuckGo 保留代理提示但不依赖 Settings 开关；Tag 图标已改用稳定的官方平台图标入口。真实可用性受 TUN/VPN 与上游限制影响。 |
| Usage | 基本对齐 | 范围预设、自定义日期、Web/MCP、状态/操作/引擎筛选、趋势、KPI、引擎统计和服务端分页审计表均已实现；本轮修复了审计表横向滚动条位置、范围下拉遮挡、审计文案国际化并重新排列 KPI 卡片。 |
| Settings | 部分对齐 | 缓存、限流、默认引擎/Limit、历史保留和 Query 日志开关均可保存。代理卡片、代理地址和代理测试入口已按 TUN/VPN 运行边界移除。PRD 要求的每引擎独立速率配置、正文最大字符数配置尚未提供页面控件。 |
| 安全边界 | 基本对齐 | OIDC、MCP Token Hash、敏感设置加密、认证会话、限流、HTTP(S) 正文协议/大小约束和文本渲染已在代码路径中；按 Cloudflare Tunnel 部署决策移除 Origin/Host allowlist 与 DNS/私网/重定向 SSRF 过滤。生产 HTTPS、设备部署与外部客户端仍未完成最终回归。 |

## 可用性分级

- 已可本地验证：门户认证状态流转、真实 Web 搜索/正文读取、搜索历史快照、引擎启用前置校验、设置读写、Usage 服务端聚合和 MCP 管理 API。
- 有明确运行前置条件：DuckDuckGo 需要懒猫微服 TUN/VPN 代理已开启；Exa 需要 API Key；Open-WebSearch daemon 必须先启动；OIDC 需要懒猫配置。
- 仍待外部验证：懒猫设备安装后的双服务启动、真实 OIDC 回调、Streamable HTTP MCP 外部客户端 initialize/search、真实出口下的所有搜索源。
- 已知产品缺口：Settings 每引擎速率与正文最大长度控件。

## LPK 多实例核对

当前源清单和已生成包均明确启用多实例：

| 证据 | 结果 |
|---|---|
| `lzc-manifest.yml` / 包内 `manifest.yml` | `application.multi_instance: true` |
| API 持久化目录 | 仅 `api` 挂载 `/lzcapp/var/miaomiao-search/data`，实例目录由平台独立提供；包内不含数据库 |
| 实例密钥 | `APP_INSTANCE_SECRET` 由 `stable_secret("miaomiao-search:" + .S.AppDomain)` 派生，每个部署实例独立 |
| 路由与服务 | Web、API、Open-WebSearch daemon 通过当前实例内部服务通信；`/mcp` 是当前实例独立 Endpoint |

结论：当前 LPK 是应用多实例配置。每个安装实例拥有独立域名、SQLite 数据、Token、审计和密钥；多实例能力已经写入清单，但懒猫设备上的并行安装与 OIDC 回调仍待阶段 4 实机验证。

## 本轮 UI 修复验收

- 审计表把筛选器、数据表和分页放入同一个横向滚动容器，滚动条位于审计卡片底部。
- Usage KPI 从宽屏 7 列改为最多 4 列，避免统计维度卡片过窄；中小屏保持 2/3 列响应式布局。
- DuckDuckGo Tag 改用 `DDG-iOS-icon_60x60.png` 官方稳定资源，并保留加载失败时的 Globe fallback。
- Bing 高级 Search Mode 仅在当前选择包含 Bing 时显示，避免无关引擎场景出现误导控件。
