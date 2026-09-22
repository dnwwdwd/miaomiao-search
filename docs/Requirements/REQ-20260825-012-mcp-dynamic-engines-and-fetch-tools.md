# REQ-20260825-012：MCP 动态引擎与正文 Tool 可用性

## 状态

已完成。MCP 搜索的可选引擎跟随引擎管理启停，站点专用正文 Tool 使用对应 daemon 能力，并将具体上游失败原因返回给调用方。

## 范围

- MCP `search` 的引擎枚举和描述按当前启用引擎动态生成。
- 未显式传入引擎时，服务端使用当前启用且设为默认的引擎；显式传入已停用引擎必须拒绝。
- CSDN、掘金、GitHub README、Linux.do Tool 分别调用专用正文接口；通用网页 Tool 保持原有接口。
- 规范化上游错误码和消息，保留可定位的失败原因。
- DuckDuckGo 搜索引擎 Tag 使用仓库内图标资源，并纳入 LPK Web 静态文件。

## 非目标

- 不把当前网络环境的“可用/不可用”测试结果硬编码为引擎状态。
- 不放宽公网 URL、DNS、重定向、XSS、Token Hash、Scope 或限流校验。
- 不新增 MCP Tool 类型、数据库 schema 或外部密钥。

## 数据与失败边界

| 场景 | 预期行为 |
|---|---|
| 引擎管理停用后发起新 MCP 请求 | `tools/list` 和 `search` schema 不再允许该引擎 |
| MCP 未传 `engines` | 使用当前启用且标记为默认的集合 |
| 显式指定停用引擎 | 服务端返回 `ENGINE_DISABLED` |
| 站点专用 Tool URL 主机不匹配 | 返回 `MCP_TOOL_URL_DENIED`，不访问上游 |
| 专用 daemon 返回错误 envelope | 返回清洗后的 `UPSTREAM_*` code 和上游 message，并写入审计 |
| 上游响应格式无效/超时/过大 | 使用 `UPSTREAM_INVALID_RESPONSE`、`UPSTREAM_TIMEOUT` 或 `UPSTREAM_RESPONSE_TOO_LARGE` |

## 验收矩阵

| 场景 | 验收结果 |
|---|---|
| 停用/启用搜索引擎 | 后续 MCP Server 的工具 schema 动态变化 |
| CSDN、掘金、GitHub、Linux.do | 分别命中专用 daemon endpoint |
| 网络搜索 | 仅允许当前引擎管理启用的引擎 |
| 上游失败 | 调用方看到具体错误码和消息，不再全部归为同一异常 |
| DuckDuckGo 图标 | 页面使用本地资源，LPK 包含该文件 |
