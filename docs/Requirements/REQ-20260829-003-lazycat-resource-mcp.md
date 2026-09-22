# REQ-20260829-003：懒猫 Resource MCP 与应用间委托调用

## 分类与状态

- 分类：功能需求 / MCP / 部署 / 认证
- 状态：已实施，待设备验证
- 用户确认：2026-08-29 确认保留现有 Bearer Token，并增加严格限定的懒猫应用间委托模式；只发布 MCP provider，不发布项目 Skill。
- 决策记录：`docs/Decisions/DEC-20260829-003-lazycat-resource-mcp.md`
- 功能进度文档：`docs/Progress/PROG-REQ-20260829-003-lazycat-resource-mcp.md`

## 背景与目标

依据懒猫 [Skill / MCP 规范](https://developer.lazycat.cloud/resource-skill-mcp.html)，让已安装的喵喵搜索 MCP provider 能被小龙猫、Codex 等 Agent 发现，并通过 `.lzcx` 应用间入口调用现有 `search` 与正文 Tools。

## 需求范围

- 在 LPK 中导出 `mcp-providers/miaomiao-search/mcp.yml`，endpoint 固定为 `/mcp`。
- 将最低懒猫系统版本提升到 `1.5.2`，并让 `lzc-build.yml` 声明 `mcp-providers` 资源导出。
- 保留外部 MCP 客户端的 Bearer Token 认证、Token Scope、状态、过期、RPM/Daily 限额、owner 校验和审计。
- 为无 Bearer 的可信应用间请求增加委托认证：请求必须包含 `X-HC-SOURCE=app:<包名>` 和 `X-HC-USER-ID`；按 UID 读取独立用户库和当前 Tool/引擎设置。
- 委托请求使用当前用户的 MCP RPM 设置，不绑定 Access Token、不产生 Token 每日额度，审计中的 `token_id` 与 `token_prefix` 为空。

## 写入入口、读取方与状态传播

- 资源写入入口：`resources/mcp-providers/miaomiao-search/mcp.yml` 与 `lzc-build.yml:resource_exports`；构建后位于 LPK 的 `exports/mcp-providers/miaomiao-search/mcp.yml`。
- MCP 运行入口：`POST /mcp`。Bearer 分支从 Token owner 读取 `UserStore`；委托分支从 `X-HC-USER-ID` 读取 `UserStore`。
- 两条分支共享动态 Tool 注册、引擎启停、MCP 顺序、搜索/正文服务、缓存、SSRF/XSS 边界和 MCP 错误契约。
- 委托调用不新增数据库表或字段；既有 `request_log` 记录 MCP 操作，但 Token 字段为空。

## 失败与安全边界

- 缺少 Authorization 且缺少可信应用来源或 UID：返回 401。
- 带 Authorization 但格式错误、Token 无效、过期或被禁用：返回 401，不回退到委托模式。
- Bearer Token 带 UID 且 UID 与 owner 不一致：返回 401。
- 委托来源只接受 `app:<包名>`，不接受 `client` 来源；服务端不解析 `X-HC-USER-TICKET`，由懒猫 ingress 消费票据并注入身份头。
- 委托请求仍受 Fastify `/mcp` 全局限流和当前用户 `rateLimit.mcp.rpm` 限制；搜索、正文 URL、上游和 Tool 站点校验保持原规则。

## 不受影响模块

门户登录、OIDC/本地账号、Access Token 管理 API、数据库迁移、外部 Bearer MCP 配置、搜索引擎适配器、正文抓取和 LPK 镜像发布流程均不改变既有语义。

## 验收矩阵

| 场景 | 预期 |
|---|---|
| Resource MCP 元数据 | LPK 含 `exports/mcp-providers/miaomiao-search/mcp.yml`，内容为 `endpoint: /mcp` |
| 委托 initialize/tools/list | 可信 `app:` 来源和 UID 无 Bearer 时返回成功，并展示当前用户启用的 Tools/引擎 |
| 委托 search/fetch | 使用对应 UID 的用户库执行，结果和错误契约与 Bearer 路径一致 |
| 委托审计 | `channel=mcp`，`token_id` 与 `token_prefix` 为空；不更新 Access Token 使用时间或每日额度 |
| 委托限流 | 同一 UID 按 `rateLimit.mcp.rpm` 限制；不同 UID 的设置、引擎和审计互相隔离 |
| 非可信请求 | 缺失/错误来源、缺失 UID、`client` 来源和无效 Bearer 均返回 401 |
| 兼容回归 | 既有 Bearer Token、Scope、每日额度、动态 Tool 和正文 Tool 测试继续通过 |
| 设备验证 | `lzcos >= 1.5.2` 上 Agent 能发现 provider，并经 `.lzcx` 完成搜索和正文调用 |
