# REQ-20261010-001 微信公众号内容抓取与文章发现

## 背景

用户要求把 `wechat-notebank` 的微信公众号内容抓取和文章发现实现整合到本项目，并纳入 MCP Tool。方案已经用户确认并记录在 `docs/Decisions/DEC-20261010-001-wechat-content-fetch.md`。

## 需求范围

1. 微信文章正文抓取：输入 `https://mp.weixin.qq.com/s/...` 直链，返回标题、公众号（作者）、发布日期、Markdown 正文、图片 URL 与截断标记；不下载图片、不归档。
2. 文章发现（微信搜索）：
   - 搜狗源：关键词搜索，返回条目标题、公众号、日期和已还原的微信直链；验证码立即停止并保留已还原条目。
   - 镜像源：今天看啥专栏 URL 或关键词；关键词先经搜狗找专栏，再纯 HTTP 解析列表并还原直链。
   - 统一搜索源：`wechat` 引擎（2026-10-10 用户追加确认），走搜狗发现链路，默认停用；首页搜索与 MCP `search` 引擎枚举按现有引擎体系纳入，结果只含已还原直链条目，描述携带公众号与日期。
3. MCP：新增 `searchWechatArticles`（scope `search`）与 `fetchWechatArticle`（scope `fetch`，host 限 `mp.weixin.qq.com`）；`fetchWebContent`/`fetchPlatformContent` 对微信链接自动分流。
4. 门户：`/api/platform-content` 与 `/api/fetch-content` 自动匹配支持微信链接；新增 `POST /api/wechat/discover` 供后续页面使用。本轮不改门户页面 UI。

## 写入入口与读取方

- 写入入口：`POST /api/wechat/discover`（发现）、既有 `POST /api/platform-content`、`POST /api/fetch-content`（抓取）、MCP Tool。
- 读取方：门户页面（现有抓取页自动支持微信链接）、MCP 客户端。无新增读取 API。

## 刷新/恢复方式

- 无状态服务，无缓存、无持久化；失败直接重试即可。Chromium 与上游站点不可用时返回结构化错误码。

## 失败与安全边界

- 错误码：`WECHAT_ARTICLE_UNAVAILABLE`（页面不可读/失效）、`WECHAT_ARTICLE_PARSE_FAILED`（解析不出标题或正文）、`SOGOU_CAPTCHA`（验证码，即停）、`WECHAT_SEARCH_UNAVAILABLE`（结果页/专栏页无法识别或不可达）、`WECHAT_BROWSER_UNAVAILABLE`（Chromium 不可用）。
- 搜狗验证码在首屏命中时抛错；逐条还原中途命中时返回 partial（`failure` 字段 + 已还原条目）。
- 浏览器路由只放行微信系主机；输出直链 host 全等校验；响应超时、节流、无凭据注入。详见决策记录安全边界一节。

## 行为验收矩阵

| 输入 | 期望 |
|---|---|
| `mp.weixin.qq.com/s/xxx` 直链（正常文章） | 返回标题/公众号/日期/Markdown/图片 URL，`retrievalMethod: "public-page"` |
| 已失效/参数错误链接 | `WECHAT_ARTICLE_UNAVAILABLE` |
| 无 `#js_content` 的页面 | `WECHAT_ARTICLE_PARSE_FAILED` |
| 搜狗关键词正常 | 条目含标题/账号/日期/直链，`resolved: true` |
| 搜狗验证码 | `SOGOU_CAPTCHA`（首屏）或 partial + failure（还原中途） |
| 搜狗结果页改版 | `WECHAT_SEARCH_UNAVAILABLE` |
| 镜像专栏 URL | 列表条目 + 直链还原，`resolved` 按实际标记 |
| 镜像关键词命中专栏 | 自动定位专栏后同上 |
| 镜像关键词未命中专栏 | `WECHAT_SEARCH_UNAVAILABLE` + 专栏链接提示 |
| `wechat` 引擎（已启用）搜索 | 返回微信文章结果，描述含公众号与日期；验证码时 `SOGOU_CAPTCHA` |
| `wechat` 引擎（默认停用）被请求 | `ENGINE_REQUIRED`/枚举校验拒绝 |
| MCP `fetchWebContent` 传微信链接 | 自动走微信抓取器，返回 `platform: "wechat"` |
| MCP `fetchWechatArticle` 传非微信 URL | `MCP_TOOL_URL_DENIED` |
| `maxChars` 越界 | `INVALID_MAX_CHARS` |

## 未受影响模块

- 搜索引擎 Provider、Open-WebSearch 上游、Token/鉴权、数据库 schema、迁移、既有小红书/飞书抓取行为、门户页面 UI 均不变。`Platform`/`FetchContent` 类型扩展 `"wechat"` 取值对既有调用方向后兼容。

## 验证方式

- `pnpm --filter @miaomiao-search/server test`（新增 `test/wechat-content.test.ts` 纯解析用例）、`pnpm typecheck`、`pnpm lint`、`pnpm build`。
- 真实搜狗/镜像/微信页面行为与设备端验证依赖外部网络环境，标注为待验证。
