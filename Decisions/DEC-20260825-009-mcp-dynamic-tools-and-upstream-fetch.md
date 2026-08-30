# DEC-20260825-009：MCP 动态搜索引擎与专用正文上游

## 状态

已实施。用户于 2026-08-25 提出：MCP 搜索必须跟随引擎管理启用状态，正文类 Tool 不能把不同站点都当作通用网页抓取，并需要保留上游具体错误信息。

## 决定

- 每次建立 `/mcp` Streamable HTTP Server 时从 SQLite 读取当前 `engine.enabled` 状态，动态生成 `search` Tool 的引擎枚举和描述；管理员下一次 MCP 请求即可看到最新启用集合。
- `SearchService` 继续对显式传入的引擎做二次启用校验；搜索请求未传 `engines` 时沿用当前启用且标记为默认的引擎集合。
- `fetchCsdnArticle`、`fetchJuejinArticle`、`fetchGithubReadme`、`fetchLinuxDoArticle` 分别调用 Open-WebSearch daemon 的专用 endpoint；`fetchWebContent` 继续使用通用正文 endpoint。
- MCP Tool 先校验站点主机名，再由服务层执行公网 URL/重定向安全检查；不放宽 SSRF、Token Scope、限流或审计边界。
- daemon 返回 HTTP 错误或错误 envelope 时保留其清洗后的错误码和消息，映射为稳定的 `UPSTREAM_*` DomainError；格式无效、超时和响应过大仍使用本地稳定错误码。

## 影响与兼容性

- MCP 的 Tool schema 会随引擎启停变化，客户端应在连接或工具列表刷新时重新读取 schema。
- 专用正文 Tool 的输出继续使用现有 `{ content, cached, requestId }` 结构；只改变上游调用路径和错误可见性。
- 不新增数据库表、字段或外部凭据；DuckDuckGo 图标属于门户静态资源并随 LPK 一起发布。

## 验收

1. 停用某搜索引擎后，新建 MCP Server 的 `tools/list` 不再声明该引擎；重新启用后恢复。
2. 专用正文 Tool 命中对应 daemon endpoint，站点不匹配时返回 `MCP_TOOL_URL_DENIED`。
3. 上游返回具体错误时 MCP/API 日志和响应包含对应 `UPSTREAM_*` code 与消息，而非统一的“上游服务返回异常”。
4. 本地 DuckDuckGo 图标不依赖外链，LPK 内包含 `web/public/engine-icons/duckduckgo.png`。
