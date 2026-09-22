# PROG-REQ-20260831-001：四类搜索源接入

## 当前状态

本地实现完成。B站 POC 和方案审计已转化为 Provider、统一搜索链路、门户、MCP、历史快照、审计和测试；真实外部服务与设备回归待验证。

## 已确认证据

- B站 `/x/web-interface/search/all/v2` 多次返回 HTTP 200、`code=0`，存在 `video` 分组；`pic` 封面 URL 可转 HTTPS 并返回图片内容。
- B站结果会混入 `live_room`，标题含 `<em class="keyword">`；`/x/web-interface/search/type` 更容易返回 412，故不采用。
- B站 412 场景可通过首页匿名 Cookie 预热后重试；Cookie 只在单次请求内存中使用。

## 里程碑

1. Provider、引擎目录、凭据和 Bootstrap 兼容。
2. SearchService 聚合、缓存、历史和测试状态。
3. Web/MCP/API/门户封面、错误和数量上限。
4. 单测、契约测试、类型检查、Lint 与构建。

本地验收已完成：11 个引擎目录、四类 Provider、注入式 HTTP/Octokit 测试、B站封面和 412 重试、缓存版本隔离、凭据清理、动态 MCP 枚举、门户数量上限与双语错误文案均已接入。

## 风险与剩余验证

- Firecrawl/Tavily 额度和 GitHub/B站在线限流只在显式外部测试中验证，不进入默认 CI。
- B站公开接口无稳定性承诺；持续阻断时保留其他引擎结果并展示明确 failure。
- 本轮不执行镜像推送、LPK 发布或设备端回归。
