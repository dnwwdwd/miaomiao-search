# DEC-20260928-001 内容抓取按链接匹配现有抓取器

## 状态

按用户对内容抓取页自动匹配、未支持链接走通用网页抓取和统一来源标签颜色的要求实施；本地代码完成，补充改动待回归。

## 更新（2026-10-11，随编程导航接入调整）

原方案中「平台正文抓取仅在 `channel === "mcp"` 或调用方显式传入 `autoMatch: true` 时启用」的约束已撤销。原因是门户搜索页阅读器调用 `/api/fetch-content` 时不传 `autoMatch`，导致编程导航等平台链接落入通用网页抓取，抓取 HTML 页面会丢失代码块、图片和文档结构。经用户确认，平台正文路由改为**只依据 URL 识别结果**决定，不再依赖调用方开关或渠道：

- `SearchService.fetchContent` 在 URL 命中 `identifyPlatformContentUrl`（小红书、微信公众号、编程导航、飞书）时，无条件走平台专用/官方接口。
- `autoMatch` 参数保留，继续控制站点专用抓取器（CSDN、掘金、Linux.do、GitHub README）的启用；不传时这些站点仍走通用网页抓取。
- 未命中平台识别的普通链接继续走通用网页抓取，行为不变。

## 更新（2026-10-11，门户搜索页阅读路由统一）

经用户确认，撤销「搜索页阅读器不启用门户自动匹配」的既有约束，搜索页与内容抓取页统一走同一套服务端路由：

- `search-page.tsx` 的 `read()` 不再维护硬编码平台主机白名单，改为调用 `api.fetchContent(url, 50_000, true)`，由服务端按 URL 决定平台抓取器与站点专用抓取器；普通链接仍走通用网页抓取。
- 因此首页点击 CSDN、掘金、Linux.do、GitHub 搜索结果时也启用对应站点专用抓取器（此前这些来源在搜索页走通用网页抓取）。小红书、微信、飞书、编程导航的行为不变。
- 前端不再重复实现主机判断，避免服务端已支持的来源被前端白名单静默丢弃。

## 编程导航链接形态（2026-10-11 实测修正）

实测确认编程导航**没有移动域名**（`m.codefather.cn` 无 DNS 记录），`/question/` 也非真实路由。真实内容形态为三种，均各有公开接口，现已全部识别：

- `/post/{id}` → `post/get/vo`（原有）。
- `/essay/{id}` → `essay/get/vo`；该接口无 `title` 字段，标题回退为正文首个非空行（去除 Markdown 标记）或分类名。
- `/qa/{id}` → `qa/get/vo`；返回 `title` 与 `content`。

`identifyCodefatherArticleUrl` 重命名为 `identifyCodefatherContentUrl`，返回 `{ kind, id }`；`matchSiteContentUrl` 与 `identifyPlatformContentUrl` 同步覆盖三种形态。仅数字 ID 输入仍按 `post` 处理，保持既有 MCP 调用兼容。

## 方案

在现有 `/api/fetch-content` 请求体增加可选 `autoMatch`，默认关闭，只由内容抓取页传入。服务端识别受支持的平台和专用站点，调用既有抓取器；没有命中专用来源与路径的 URL 走通用网页抓取。响应增加可选站点来源字段，用于预览标签。平台抓取继续返回媒体元数据。

仅 HTTPS 且主机、内容路径均准确匹配时才使用专用抓取器。Linux.do 的普通主题地址转换为上游要求的 `/t/topic/<id>.json`；GitHub 仅仓库首页匹配 README 抓取器。站点专用抓取器目前主要返回文本，正文预览和 Markdown 文件保留这些文本；不推断不存在的图片链接。

内容抓取页的来源标签复用首页 `EngineTag` 组件和来源色板，并保留当前语言对应的名称。现有 `/api/platform-content`、MCP Tool 及平台正文路由语义保持一致。鉴权、限流、审计、URL 约束及用户隔离沿用当前服务。
