# PROG-REQ-20261010-001 微信公众号抓取与文章发现

## 状态

本地实现完成，typecheck / lint / test / build 已通过；搜狗、今天看啥镜像与微信文章页的真实网络行为、懒猫设备端验证待执行。

## 已完成

- 2026-10-10 调研 `wechat-notebook`（本机 `/home/burger/Documents/projects/wechat-notebank`）的抓取与发现实现，形成移植对照表（parser/sogou/mirror 纯解析层原样移植，浏览器层换 Playwright，存储层不移植）。
- 2026-10-10 方案经用户确认（Playwright 抓取、搜狗 + 镜像 + 直链发现、MCP 搜索与抓取 Tool、不归档），决策与需求记录归档。
- 新增 `packages/server/src/services/wechat-content.ts`：`identifyWechatArticleUrl`、`WechatContentService.fetchArticle/searchArticles`、搜狗/镜像纯解析函数、代码块与日期归一化。
- 2026-10-10 追加：用户确认升级为统一搜索源。新增 `packages/server/src/providers/wechat-provider.ts`（`wechat` 引擎，默认停用，maxResults 10），注册进 Provider Registry；`engineIds`、服务端 engine-catalog、门户 mock 与引擎目录标签同步；`bootstrap.ts` 的 `mcp.tools` 默认值补充 `searchWechatArticles`/`fetchWechatArticle`。新增 `test/providers/wechat-provider.test.ts`；`services.test.ts` 引擎总数断言 13 → 14。
- `platform-content.ts` 扩展 `wechat` 平台并分流；`domain.ts`、`src/types` 链路兼容；`mcp.ts` 新增 `searchWechatArticles`（含 MCP 审计）与 `fetchWechatArticle`；`routes.ts` 新增 `POST /api/wechat/discover`；`app.ts` 向 MCP 传入 audit。
- 门户最小配套：`engine-catalog.ts` 与 `app/globals.css` 新增 `wechat` 来源标签，内容页 `PreviewSource` 补充 `wechat`（否则微信返回会渲染崩溃，属必要修正而非新 UI）。
- 依赖新增：`cheerio`、`node-html-markdown`（运行时），`domhandler`（类型，devDependency）。
- 新增 `packages/server/test/wechat-content.test.ts` 10 组用例；`services.test.ts` 的 MCP 工具列表断言按新 Tool 集调整（禁用 sogou 引擎的断言改为检查搜索来源枚举）。

## 验证证据

- `pnpm typecheck`、`pnpm lint`、`pnpm build` 通过。
- `pnpm --filter @miaomiao-search/server test`：80/80 通过（含新增微信用例）。
- 2026-10-10 重新打包 0.1.4（用户确认微信搜索源与两项修复合并进 0.1.4，不单独出 0.1.5）：`lzc/build-image.sh` 完成 Docker 镜像构建、Docker Hub 推送与 `lzc-cli appstore copy-image` 官方仓库复制，`lzc-manifest.yml` 已指向官方镜像；`lzc-cli project lint` 通过后运行 `lzc-cli project release` 生成 `release/miaomiao-search-0.1.4.lpk`。交付物：Docker Hub `docker.io/c1own123/lazycat:miaomiao-search-0.1.4-amd64`（digest `sha256:49e5f9cc3b2a602647920251802677c5919093636dfc63d8a83e185776abec90`）、官方镜像 `registry.lazycat.cloud/u30387910/c1own123/lazycat:c37f8d6655fee51e`、LPK SHA-256 `a99be1549f04739f4346141be19b18ede95aa8155e8e1a9530825bd7dbb241e8`。镜像内已抽查确认前端 chunk 包含"微信公众号"名称映射。按惯例未自动安装到设备。注意：2026-10-10 曾有一次构建因 api.ts 编辑未实际写入而遗漏名称映射（当时误报成功），本次构建已修复并验证。
- 2026-10-10 修复三项设备反馈（BUG-20261010-001/002，另见 `docs/BUG_TRACKER.md`）：MCP Tool 单独开关的 zod v4 枚举键 record 全键校验改为 `z.partialRecord`；内容抓取页预览改用 `react-markdown` + `remark-gfm`，图片跟随原文位置内联渲染，未内联图片保留末尾网格兜底；首页搜索源标签补齐 `wechat` → "微信公众号" 名称映射，搜索结果点击微信文章链接改走微信平台抓取器。门户新增依赖 `react-markdown`、`remark-gfm`。

## 风险与待验证

- 搜狗结果页选择器、今天看啥页面结构与微信文章页均属第三方，随时可能改版；验证码命中属预期行为（`SOGOU_CAPTCHA`）。
- 镜像关键词路径依赖搜狗可用性；VIP 墙条目会标 `resolved: false`。
- Chromium 在懒猫设备镜像中的可用性随 DEC-20260829-001 已覆盖，未单独回归。
- 需要真实网络环境验证：搜狗直链还原、镜像直链还原、微信正文解析、MCP 工具端到端。

## 未纳入范围

- wechat-notebank 的 Markdown 文件归档、Excel 批量导入、Job 队列/SSE、图片本地化下载；门户微信文章发现 UI（`/api/wechat/discover` 已就绪，页面接入另行立项）。
