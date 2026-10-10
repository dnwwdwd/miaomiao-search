# DEC-20261010-001 微信公众号抓取与文章发现整合方案

## 状态

方案已向用户确认（2026-10-10）：正文抓取用本项目既有 Playwright/Chromium 运行时；文章发现同时纳入搜狗微信搜索与今天看啥镜像站，并支持微信直链抓取；MCP 新增搜索与抓取 Tool；不归档、实时返回。

## 参考项目核查（2026-10-10）

| 项目与核查方式 | 已有能力 | 对本需求的边界及可用做法 |
|---|---|---|
| wechat-notebank（本机 `/home/burger/Documents/projects/wechat-notebank`，MIT） | `src/lib/parser.ts` 用 Puppeteer + 本机 Chrome 打开 `mp.weixin.qq.com` 文章页，Cheerio 多选择器降级解析标题/公众号/发布时间/正文，清洗代码块与懒加载图片后经 node-html-markdown 转 Markdown；`src/lib/sogou.ts` 解析搜狗微信搜索结果并识别验证码；`src/lib/mirror.ts` 解析今天看啥专栏页并还原微信直链；`src/commands/search.ts` 编排单浏览器会话内逐条还原直链。 | 不调用微信私有 API，不需要 Cookie/Token/fakeid 凭证；搜狗结果条目的跳转链接是会话绑定的，必须在同一浏览器会话内导航还原。解析、节流（默认 3000ms）、验证码即停、SSRF 校验和错误语义可整体移植；Puppeteer/Chrome 依赖替换为本项目 Playwright/Chromium（DEC-20260829-001）。 |
| 本仓库既有平台抓取（DEC-20260925-001） | `platform-content.ts` 的 URL 识别 + 平台抓取器 + `PlatformContent` 统一返回；MCP `fetchWebContent`/`fetchPlatformContent` 自动分流。 | 微信抓取作为第三个平台接入同一模式，返回结构沿用 `PlatformContent`，`platform` 取值扩展 `"wechat"`。 |

### wechat-notebank 实现要点（移植依据）

- 正文抓取：`page.goto(url, { waitUntil: 'domcontentloaded' })`，导航超时不中断，等待 `#js_content`（默认 30s，超时继续取整页 HTML）。解析顺序：标题 `#activity-name` → `h1` → `.article-title`；作者/公众号 `#js_name` → `.account_nickname` → `[itemprop="author"]`；发布时间 `#publish_time` → `.time` → 页面脚本 `var ct = "<unix秒>"`（转 Asia/Shanghai 日期）；正文 `#js_content` → `.article-content` → `article`。`.weui-msg__title` 为「参数错误」判链接失效。清洗：移除 copyright/footer 节点、`data-src` 懒加载还原、`.code-snippet__fix`/`pre` 重建为干净围栏代码块。
- 搜狗发现：先访问 `weixin.sogou.com` 首页落 SNUID Cookie，再进 `/weixin?type=2&query=<关键词>`；结果条目 `li[id^='sogou_vr_11002601_box']`，账号 `.all-time-y2`，日期取 `timeConvert(<unix>)`；单页约 10 条，无翻页。验证码判据：URL 含 `/antispider` 或正文含 VerifyCode/验证码/seccode，命中立即停止不重试；还原中途触发时已解析条目保留（partial）。逐条还原：sleep 节流 → `goto(rawLink)` → 每 200ms 轮询 `page.url()` 直到跳到 `mp.weixin.qq.com`（≤10s）→ 再等 `#js_content` 2s 双闸确认。
- 镜像发现：专栏页 `/column/` 与文章页 `/t/` 用纯 HTTP fetch + Cheerio；列表链接 `a[href*='/t/']`，翻页 `rel=next`/`#p_next`/中文标签启发式，跨页按标题去重、`visitedPages` 防循环；直链从 `/t/` 页 HTML（先做实体与 `\/` 转义归一化）用严格正则提取，VIP 墙时返回未还原。关键词便利路径借搜狗会话搜 `site:jintiankansha.me <关键词>` 找专栏地址。
- 存储与搜索边界：原项目搜索只是 Markdown 文件元数据子串匹配，无数据库、无正文检索；本轮不移植其文件归档。

## 实施方案

1. 新增 `packages/server/src/services/wechat-content.ts`：
   - `identifyWechatArticleUrl`：仅接受 `https://mp.weixin.qq.com/s/...` 文章直链。
   - `WechatContentService.fetchArticle(url, maxChars)`：Playwright 启动 Chromium（与飞书公开页读取同配置），路由只放行微信系静态资源主机；抓整页 HTML 后用 Cheerio 完成解析、清洗与图片/代码块处理，经 node-html-markdown 输出 Markdown。不下载图片本地化，只返回图片 URL。
   - `WechatContentService.searchArticles({ query, source, limit })`：`source: "sogou" | "mirror"`。搜狗源在单浏览器会话内完成搜索与逐条直链还原；镜像源接受今天看啥专栏 URL 或关键词（关键词时先经搜狗找专栏），纯 HTTP 解析并还原直链。条目输出 `{ title, account, publishedAt, sourceUrl, resolved }`。
2. `platform-content.ts` 的 `identifyPlatformContentUrl` 与 `Platform` 扩展 `"wechat"`，`PlatformContentService.fetch` 将微信链接分流到 `WechatContentService`；`fetchWebContent`/`fetchPlatformContent` 的 MCP 自动匹配、门户 `/api/platform-content`、`/api/fetch-content` 自动匹配因此同时支持微信链接。
3. MCP 新增两个 Tool：
   - `searchWechatArticles`（scope `search`）：参数 `query, limit?, source?`，返回发现条目列表。
   - `fetchWechatArticle`（scope `fetch`，站点专用，host 限 `mp.weixin.qq.com`）：参数 `url, maxChars?`，内部走平台抓取器。
   - 默认启用状态与其他抓取 Tool 一致。
4. 门户新增 `POST /api/wechat/discover`（登录 + 限流 + 审计），供后续页面接入；本轮不改门户页面 UI。

## 数据与安全边界

- 不新增持久化数据、不建表、不迁移；发现与抓取结果实时返回，不落库。微信正文带当前会话性质的内容，沿用平台抓取器「不缓存」的口径（`fetchPlatformContent` 本身不写缓存）。
- 无微信凭证：不注入 Cookie、Token、fakeid；搜狗仅使用浏览器会话自然落下的 SNUID。不绕过验证码：搜狗验证码立即停止并返回明确错误码，不自动重试。
- 浏览器请求限制：只允许 HTTPS 目标、固定 UA、响应超时（导航 30s、`#js_content` 30s、直链还原轮询 10s）、节流间隔默认 3000ms（`WECHAT_SEARCH_INTERVAL_MS` 可调）；Chromium 路由只放行 `mp.weixin.qq.com`、`*.qq.com`、`*.qpic.cn`、`*.qlogo.cn`、`*.wximg.cn` 等微信静态资源主机，其余中断。
- 输出安全闸：发现结果中的直链必须通过 `assertHttpUrlWithoutCredentials` 且 host 全等 `mp.weixin.qq.com`，否则标 `resolved: false`；正文图片 URL 仅接受 HTTPS 媒体主机。不执行源站脚本渲染结果以外的任何内容（页面内脚本随浏览器加载，预览只用解析后的 Markdown/URL）。
- 认证、限流、审计沿用现有门户用户与 MCP Token 体系；Tool 开关沿用 `mcp.tools` 设置。

## 已确认口径

1. 用户确认抓取方案为 Playwright/Chromium，发现来源搜狗 + 镜像 + 直链全做，MCP 搜索与抓取 Tool 都加，不归档、实时返回。
2. 用户 2026-10-10 追加确认：将公众号搜索升级为统一搜索源 `wechat`（首页可选、MCP `search` 引擎枚举可勾），复用搜狗发现链路，默认停用；单页约 10 条、逐条 3 秒节流导致整体耗时高于其他引擎，验证码命中即停。新增 `WechatProvider` 注册进 Provider Registry，结果只包含已还原直链的条目，描述字段携带公众号与日期。
3. 搜狗与镜像站为第三方页面，选择器与可用性不受本项目控制；页面改版或验证码时按结构化错误码返回，不承诺恒可用。
4. wechat-notebank 的文件归档、Excel 导入、Job 队列与图片本地化不纳入本轮。
