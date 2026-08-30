# REQ-20260828-001：Bing 搜索与网页正文读取容错

## 背景

当前 Open-WebSearch 的 Bing request 模式可能收到 `www.bing.com` 到 `cn.bing.com` 的站内 302。Axios 的原始请求把重定向当成异常，门户和 MCP 最终看到 `engine_error`。

通用网页读取已经包含 HTML、Readability 和浏览器渲染路径，但正文未识别时统一返回 400 `validation_failed`。这会把上游抓取结果不足误认为用户参数错误，门户也只能显示通用失败 Toast。金价等每天变化的查询还需要明确知道搜索缓存和正文缓存的边界。

## 范围

- Bing request 搜索：固定使用 `https://www.bing.com/search`，安全跟随 Bing 站内重定向，保留 Cookie，并在显式 HTTP 代理存在时绕过该代理。
- 通用 `fetchWebContent`：保留请求抓取、浏览器 Cookie、浏览器 HTML 渲染、Readability 和纯 HTML 文本路径，增加 JSON-LD、`__NEXT_DATA__`、`articleBody` 等结构化正文提取。
- 生产运行时：将 Playwright 客户端作为 API 生产依赖，镜像安装 Chromium，并通过 LPK 环境变量指定浏览器路径，确保浏览器 HTML 回退可执行。
- 正文失败语义：页面已访问但没有正文时返回 422 `CONTENT_NOT_EXTRACTED`，Web 与 MCP 共用该错误码和消息。
- 门户：在正文弹窗内显示可理解的状态，提供重试和打开源站入口；普通网络、TLS、超时和参数错误继续按错误状态显示。
- 缓存：正文提取策略版本变更后不复用旧单策略结果；保留设置中的 TTL 控制。

## 不在范围

- 不绕过站点验证码、登录墙或反爬挑战。
- 不把正文失败伪装成成功内容，也不放宽 URL scheme、凭据或最终 URL 校验。
- 不改变搜索历史快照语义和 MCP Token 权限。

## 写入入口与读取方

| 数据/状态 | 写入入口 | 读取方 | 刷新方式 |
|---|---|---|---|
| Bing 搜索结果 | Open-WebSearch Bing request 适配器 | Fastify `SearchService`、Web、MCP | 站内重定向自动跟随；缓存到期后重新请求 |
| 通用正文 | Open-WebSearch `fetch-web` | Fastify `SearchService`、Web `/api/fetch-content`、MCP `fetchWebContent` | 请求、浏览器 Cookie、浏览器 HTML、Readability、结构化数据依次提供候选 |
| 正文缓存 | `SearchService.contentCache` | Web/MCP 正文读取 | `cache.content.ttl` 到期或提取器版本变化后重新抓取 |

## 失败与安全边界

- Bing 只允许 `www.bing.com` 与 `cn.bing.com` 之间的最多 3 跳重定向；未知主机、超出跳数或非 HTTP(S) 目标失败。
- Bing 直连只影响该搜索引擎的 HTTP 请求；其他引擎和正文抓取仍按全局代理/部署网络策略执行。
- `CONTENT_NOT_EXTRACTED` 表示目标请求已完成，但没有足够正文；它不是请求参数错误，HTTP 状态为 422。
- 上游格式错误、超时、响应过大、TLS、URL 校验和站点拒绝仍保留各自错误码。
- 结构化数据只作为候选正文，不执行其中的脚本，不信任其中的链接作为抓取目标；浏览器回退在独立页面中执行公开页面 JavaScript，再对最终 DOM 做同样的正文提取。

## 验收矩阵

| 场景 | 预期 |
|---|---|
| Bing `www` 返回到 `cn` 的 302 | 跟随站内跳转并解析结果，不再返回 302 错误 |
| Bing 请求配置了日本代理 | Bing request 请求不使用该代理；其他流量不受影响 |
| HTML 有 `<article>` 或 Readability 正文 | 返回正文并记录提取方式 |
| HTML 只有 JSON-LD/Next 数据中的 `articleBody` | 返回结构化正文 |
| 首屏是 JS 空壳且镜像浏览器可用 | 执行 JavaScript，返回最终 DOM 中的正文，并标记 `retrievalMethod=browser-html` |
| 首次正文抓取没有可读内容 | Web/MCP 均返回 `CONTENT_NOT_EXTRACTED`、422 |
| 门户遇到 `CONTENT_NOT_EXTRACTED` | 弹窗说明页面已访问但未识别正文，可重试或打开源站 |
| 同一 URL 读取缓存 | 默认正文 TTL 为 86400 秒；提取器版本变化不会命中旧策略缓存 |
