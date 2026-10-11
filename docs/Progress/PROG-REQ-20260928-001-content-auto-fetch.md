# PROG-REQ-20260928-001 内容抓取自动匹配与状态颜色

## 当前状态

此前实现与本地验证完成。2026-10-11 追加两处补充：门户搜索页阅读器改走服务端统一路由（不再维护硬编码主机白名单），编程导航链接识别扩展到 `/post` `/essay` `/qa` 三形态。Linux.do 当前出口返回源站 403，待可访问网络复测。

## 证据与后续

- 已核对门户内容页、现有平台抓取器、四个站点抓取器和上游 URL 格式。Linux.do 专用上游要求 `/t/topic/<id>.json`。
- 路由测试覆盖四种专用来源、普通网页回退、伪装主机、Linux.do 路径转换及小红书媒体保留。前端 26 项、服务端 71 项测试通过，类型检查、Lint、构建通过。
- 浏览器核对启用状态绿/红文字、全部来源标签、GitHub README 预览和 Markdown 下载、窄屏布局；小红书帖子预览图片正常加载。
- 当前出口的真实 CSDN、掘金、GitHub README 抽样请求分别返回 4115、3184、31992 字符。Linux.do 当前出口的主题 JSON 接口返回 403，页面会显示源站拒绝抓取；需在可访问网络和目标设备复测。
- 本轮将内容页来源标签切换为共享 `EngineTag`，并让自动匹配未命中的链接进入通用正文读取流程；未运行自动化测试、浏览器回归或构建。

## 2026-10-11 补充

- `search-page.tsx` 的 `read()` 改为 `fetchContent(url, 50_000, true)`，删除硬编码平台主机白名单；首页点击 CSDN、掘金、Linux.do、GitHub 结果时也启用对应站点专用抓取器。
- 编程导航实测修正：无移动域名、`/question/` 非真实路由；识别扩展为 `/post/{id}`、`/essay/{id}`、`/qa/{id}`，`identifyCodefatherArticleUrl` 更名为 `identifyCodefatherContentUrl`（返回 `{ kind, id }`），`matchSiteContentUrl` 与 `identifyPlatformContentUrl` 同步覆盖。
- 真实网络验证：`/post` `/essay` `/qa` 三个链接均返回标题、作者、发布时间与 Markdown 正文（`/essay` 标题由正文首行推断）。
- 验证命令：`pnpm typecheck`、`pnpm lint`、`pnpm build` 通过；服务端测试 92 项、前端契约测试 26 项全部通过。
