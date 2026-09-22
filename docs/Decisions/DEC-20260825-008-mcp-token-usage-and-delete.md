# DEC-20260825-008：MCP Token 调用量与删除

## 状态

已确认实施。该变更由用户于 2026-08-25 明确提出，用于补齐 MCP Token 管理页面与 PRD 的差异。

## 决定

- Token 列表的“今日调用量”直接从 `request_log.token_id` 聚合，不新增计数列或缓存计数。
- “今日”沿用 Token 每日限流的 UTC 自然日边界。统计包含该 Token 已记录的成功、部分成功和错误请求，保证展示值与每日限流口径一致。
- `/api/tokens` 返回 `usageToday` 数值；门户只展示服务端返回值，不再使用固定占位值。
- 删除继续使用已有 `DELETE /api/tokens/:id` 接口。删除前由门户弹窗确认；删除 Access Token 只移除 `access_token` 记录，已有 `request_log` 审计记录保留，便于统计和追溯。

## 数据与安全边界

- Token Secret 仍只在创建响应中展示一次，统计查询不读取或暴露 Hash、Secret。
- 删除后 Token 无法再次认证；历史审计行的 `token_id` 不因删除而清理。
- 不修改数据库 schema，不改变 MCP Endpoint、Scope、限流和 OIDC 认证边界。

## 验收

1. Token 今日有审计记录时，管理 API 和门户显示实际数量；跨 UTC 日的旧记录不计入。
2. Token 列表每一行都有删除入口，确认后调用 DELETE，成功刷新列表并给出反馈。
3. 删除后的 Token 不再出现在列表，既有审计记录仍可在 Usage 中保留。
