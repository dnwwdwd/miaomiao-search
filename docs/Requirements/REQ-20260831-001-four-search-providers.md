# REQ-20260831-001：新增 Firecrawl、Tavily、GitHub 与 B站搜索源

## 状态

本地实现完成，外部服务与设备回归待验证。关联决策：`docs/Decisions/DEC-20260831-001-four-search-providers.md`；关联进度：`docs/Progress/PROG-REQ-20260831-001-four-search-providers.md`。

## 用户目标

在现有 Web 搜索和统一 MCP `search` Tool 中增加 Firecrawl、Tavily、GitHub 公共仓库和 B站视频搜索，同时保留现有 Open-WebSearch 搜索源、正文读取、缓存、历史、审计和部分失败语义。

## 范围与边界

- 新增四个 Provider，四个引擎首次出现时默认关闭。
- Firecrawl、Tavily 使用固定 REST API；GitHub 使用 `@octokit/rest`；B站使用公开 `/x/web-interface/search/all/v2`。
- GitHub Token 可选且只返回公共仓库；Firecrawl/Tavily API Key 必填；B站不需要密钥。
- B站仅返回视频结果；触发 HTTP 412 或 `code=-412` 时最多进行一次匿名 Cookie 预热和一次搜索重试。
- `SearchResult` 增加可选 `thumbnailUrl`。B站封面只返回 HTTPS `*.hdslb.com` 官方 CDN URL，不下载、代理或持久化。
- 不新增数据库表或迁移，不升级 Node.js，不引入第三方 B站中转服务，不新增 Provider 专属 MCP Tool。

## 写入与读取入口

- 引擎目录、Provider Registry 和用户设置由 Fastify 服务端维护。
- 新增凭据写入当前用户加密设置；保存或清除后清空该用户搜索缓存。
- Web、MCP、历史快照和前端结果卡片读取统一搜索响应；旧历史快照缺失 `thumbnailUrl` 时按无封面兼容。

## 失败与安全边界

- Provider 固定 HTTPS Endpoint，禁止用户自定义 Base URL 和自动跟随重定向。
- 所有外部响应受超时和 2 MiB 上限约束；错误返回稳定错误码，不返回 Authorization、Cookie 或完整上游响应。
- B站标题和摘要先清理 HTML 与实体；视频 URL 和封面 URL 均进行协议、凭据和 Host 校验。
- 单个 Provider 失败保留其他引擎结果；全部失败继续遵守现有错误契约。

## 验收矩阵

| 场景 | 验收结果 |
|---|---|
| 新实例或已有用户升级 | 新增引擎关闭；已有引擎状态、默认值、返回数量、搜索模式和 Web/MCP 顺序不变 |
| Firecrawl/Tavily | 配置凭据后可搜索；认证、额度、限流、超时和无效响应有稳定错误码 |
| GitHub | 无 Token 可搜索公共仓库；有 Token 仍过滤私有仓库；限流头被正确处理 |
| B站 | 视频结果含可访问封面；过滤直播/无效条目；412 只预热一次并重试一次 |
| 搜索聚合 | URL 去重合并来源；已有结果无封面时补入后续 Provider 的封面 |
| 门户/MCP | 11 个引擎可管理；MCP 枚举跟随启用状态；Web/MCP 结构一致 |
| 安全与兼容 | 凭据加密保存；旧快照可读；默认测试不访问真实外部 API |
