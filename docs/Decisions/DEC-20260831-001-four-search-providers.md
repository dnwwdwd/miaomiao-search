# DEC-20260831-001：四类搜索源的 Provider、凭据与 B站封面方案

## 状态

已确认实施。关联需求：`docs/Requirements/REQ-20260831-001-four-search-providers.md`。

## 决定

- 在 Fastify 内建立按用户实例创建的 Search Provider Registry；旧七个搜索源通过 Open-WebSearch Provider 适配，正文读取链路不变。
- Firecrawl 和 Tavily 直接调用固定 REST API，不引入对应 JavaScript SDK；GitHub 使用 `@octokit/rest`；B站直接调用公开 Web API。
- B站优先使用 `/x/web-interface/search/all/v2`；HTTP 412 或 JSON `code=-412` 时请求一次首页匿名 Cookie，再重试一次搜索。
- B站封面映射自 `pic`，仅接受无凭据 HTTPS `*.hdslb.com` 官方 CDN URL；封面作为可选 `thumbnailUrl` 贯穿响应和历史快照，服务端不下载、代理或存储。
- 凭据保存在每用户 SettingsService 加密设置中；Firecrawl/Tavily 必填，GitHub 可选，B站无凭据；新 Provider 凭据保存后立即生效。
- Bootstrap 只补齐缺失引擎，不重置已有用户的引擎状态、顺序和默认设置；不新增 SQL migration。

## 错误与健康状态

- Provider 错误映射为稳定码：认证、额度、限流、阻断、查询无效、超时、无效响应和上游不可用。
- 单引擎测试绕过搜索缓存并持久化测试时间、延迟、错误和健康状态；限流为 `rate_limited`，B站阻断为 `blocked`，超时/不可用为 `unavailable`，其他失败为 `degraded`。

## 取舍

- 不开放第三方 B站中转、不读取用户浏览器 Cookie、不保存匿名 Cookie、不实现 WBI 或登录态。
- 不扩展 GitHub 富卡片字段；除 `thumbnailUrl` 外保持现有 SearchResult 展示契约。
- Node.js 继续使用 20，默认单元测试全部使用可注入的 HTTP/Octokit 客户端。
