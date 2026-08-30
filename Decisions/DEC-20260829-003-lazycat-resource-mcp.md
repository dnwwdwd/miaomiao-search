# DEC-20260829-003：懒猫 Resource MCP 与应用间委托鉴权

## 状态

已确认实施。关联需求：`REQ-20260829-003`。用户确认保留现有 Bearer Token，并增加严格限定的懒猫应用间委托模式；资源只发布 MCP provider。

## 决定

1. 使用 `resources/mcp-providers/miaomiao-search/mcp.yml` 作为 provider 入口，内容固定为 `endpoint: /mcp`；`lzc-build.yml` 通过 `resource_exports` 导出 `mcp-providers`。
2. `package.yml:min_os_version` 提升到 `1.5.2`。不添加 `import_resources`，因为本项目提供资源而不消费其他应用资源；不新增 `lzcapp.user_delegate`，该权限属于调用方 Agent。
3. `/mcp` 的认证分支按 Authorization 是否存在区分：
   - Authorization 存在时，只走 Bearer Token owner、状态、过期、Scope、限额和 UID 匹配校验；任何失败直接拒绝。
   - Authorization 不存在时，仅接受 `X-HC-SOURCE=app:<包名>` 和非空 `X-HC-USER-ID`，通过 `UserStoreManager.getForGateway()` 选择用户库。
4. MCP Server 接收可插拔授权上下文。Bearer 上下文继续调用 `TokenService.verifyTokenContext()`；委托上下文按用户 Store 的 `rateLimiter` 和 `rateLimit.mcp.rpm` 限流，并返回空释放函数。
5. 两种上下文共享 Tool schema、动态引擎列表、SearchService、正文抓取、缓存和审计；委托上下文不构造伪造 Token，传给 SearchService 的 Token 字段保持未定义。
6. 不新增数据库 schema。委托调用写入既有 MCP 审计记录，`token_id` 和 `token_prefix` 为 NULL；既有 Token 使用时间、每日额度和 Token 列表统计不包含委托调用。

## 安全边界

- 委托身份头只在懒猫 ingress 的应用间入口使用；服务端不接受 `client` 来源，也不读取 `X-HC-USER-TICKET`。
- 服务端将这两个头视为 ingress 注入结果；部署网络必须阻止公网或普通客户端自行传入/透传身份头，并由 ingress 校验用户票据。缺少或不符合 `app:<包名>` 的来源仍返回 401。
- Fastify `/mcp` 的 120 次/分钟路由限流继续生效，委托用户再受其个人 MCP RPM 设置限制。

## 兼容与回退

外部 MCP 客户端继续使用门户生成的 Bearer Token，现有配置模板无需改变。回退时可移除 Resource MCP 资源导出和委托分支；Bearer 路径、数据库 schema 与既有 Token 数据不受影响。
