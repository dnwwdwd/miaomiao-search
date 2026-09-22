# DEC-20260831-003：Exa 凭据从用户数据库读取

## 状态

已确认实施。关联需求：`docs/Requirements/REQ-20260831-003-exa-mcp-database-credential.md`。

## 决定

- Exa Provider 在 Fastify 进程内直接调用官方 Search API；每个用户实例创建自己的 Provider Registry，并将用户 `SettingsService` 注入 Exa Provider。
- `engine.exa.apiKey` 是敏感设置，使用既有 AES-256-GCM 保存。Provider 每次请求读取设置，因此凭据变更无需重启 Open-WebSearch daemon。
- Exa Provider 不读取 `EXA_API_KEY` 环境变量。daemon 只承载其他 Open-WebSearch 引擎和正文抓取。
- 测试通过可注入 `fetch` 验证请求头、响应映射和 MCP 调用，默认测试禁止访问 Exa 网络。

## 安全与兼容

Exa Key 不进入日志、审计、历史快照、错误响应或 MCP structured content；固定 Endpoint、超时、响应大小上限和禁止自动重定向沿用统一 HTTP Provider 边界。已有用户设置无需迁移，旧环境变量即使存在也不再参与 Exa 请求。
