# REQ-20260831-003：Exa MCP 使用用户数据库凭据

## 背景与范围

Exa 已从 Open-WebSearch daemon 的搜索适配路径迁移到 Fastify Provider，但旧文档和运行说明仍要求通过 `EXA_API_KEY` 环境变量提供凭据。需要让 Web 与 MCP 的 Exa 请求都读取发起用户自己的加密设置，避免多用户实例共享进程环境，也避免测试或部署遗漏 daemon 环境变量。

## 已确认行为

- Exa Provider 读取当前用户 `SettingsService` 的 `engine.exa.apiKey`。
- Key 通过 `x-api-key` 请求头发送到固定的 `https://api.exa.ai/search` Endpoint；服务端和 MCP 响应不回显 Key。
- Exa Key 继续使用 SettingsService 的 AES-256-GCM 加密存储；保存、修改或清除凭据后对 Web/MCP 请求立即生效。
- Exa 缺少 Key、认证失败、额度耗尽、限流、超时和上游不可用分别返回稳定错误码。
- 默认测试必须注入 Exa fetch，不能访问真实 Exa API；MCP 测试必须证明请求使用当前用户数据库里的 Key。

## 未改变范围

旧的六个 Open-WebSearch 搜索源和通用正文抓取仍使用 daemon；MCP Tool 名称、Token 鉴权、限流、缓存、历史快照和审计结构保持不变。

## 验收矩阵

| 场景 | 验收 |
|---|---|
| 缺少 Exa Key | Web/MCP 返回 `ENGINE_API_KEY_REQUIRED`，不发起外部请求 |
| 数据库存有 Exa Key | 请求头使用解密后的 Key，SQLite 原文和 API 响应均不可见 |
| MCP 搜索 | 使用当前用户数据库凭据完成统一 `search` Tool 调用 |
| 上游错误 | 401/403、402、429、超时和 5xx 映射稳定错误码 |
| 多用户隔离 | 每个 UserStore 读取自己的 `engine.exa.apiKey`，不读取环境变量 |
