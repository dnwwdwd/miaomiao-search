# REQ-20260825-010：MCP Token 调用量与删除操作

## 状态

已完成。该需求修复 MCP Token 列表的占位调用量，并补齐 PRD 要求的删除操作。

## 范围

- 服务端 `TokenService.list()` 聚合当天每个 Token 的 `request_log` 调用记录。
- 管理 API `/api/tokens` 返回 `usageToday`。
- 前端 MCP 页面展示真实调用量，并为 active、disabled、revoked Token 提供删除入口和确认弹窗。
- 删除只影响 Token 凭据本身，审计日志保留。

## 非目标

- 不新增数据库表或计数字段。
- 不改变 Token Secret 一次性展示、Scope、RPM/Daily 限流、MCP Endpoint 或 OIDC 认证。
- 不把调用量改为浏览器本地状态或页面临时计数。

## 数据与刷新

| 入口 | 写入 | 读取 / 刷新 |
|---|---|---|
| MCP Tool 调用 | `AuditService.record()` 写入 `request_log.token_id` | `/api/tokens` 按 UTC 当日聚合 |
| 删除 Token | `DELETE /api/tokens/:id` 删除 `access_token` 行 | 页面确认成功后调用门户 `refresh()` |

## 验收矩阵

| 场景 | 预期 |
|---|---|
| 当日存在 Token 审计记录 | 列表 `usageToday` 等于记录数 |
| 记录属于前一 UTC 日 | 不计入今日调用量 |
| 删除 active / disabled / revoked Token | 弹出确认，删除成功后列表移除 |
| 删除后查看 Usage | 已有审计日志继续保留 |
| 未确认删除 | 不发起 DELETE |
