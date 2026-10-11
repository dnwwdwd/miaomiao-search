# 喵喵搜索（miaomiao-search）更新日志

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；版本号与 `package.yml` 一致。

## [0.1.5] - 2026-10-11

对应需求台账 REQ-20261010-002（编程导航搜索与正文接入）及 REQ-20260928-001（内容抓取自动匹配）的补充改动。

### 新增

- **编程导航（codefather）搜索源与正文读取**（REQ-20261010-002）
  - 新增 `codefather` 引擎：首页与 MCP 可选，引擎管理页统一管理。
  - 正文读取接入官方免登录接口，支持 `codefather.cn/post/{id}`、`/essay/{id}`、`/qa/{id}` 三种链接形态；`/essay/{id}` 无标题字段，回退为正文首行或分类名。
  - MCP 新增 `fetchCodefatherArticle` Tool；`fetchWebContent`/`fetchPlatformContent` 对编程导航链接自动分流。

### 修复

- 内容抓取页编程导航链接未走专用接口：平台正文路由改为只依据 URL 识别结果决定，不再依赖调用方 `autoMatch` 开关（此前门户搜索页不传该参数，导致链接落入通用网页抓取，丢失代码块与图片）。
- 首页搜索页阅读器对 CSDN、掘金、Linux.do、GitHub 结果走通用网页抓取：搜索页阅读器改为与服务端统一路由（`fetchContent(url, 50_000, true)`），并移除前端硬编码平台主机白名单。
- 使用统计 `to` 边界改为包含当前毫秒，修复同毫秒写入的记录被排除、统计偶发少计的问题。

### 已知问题

- 编程导航无移动域名（`m.codefather.cn` 无 DNS 记录），`/question/` 非真实路由，均不识别。
- Linux.do 主题抓取在部分网络出口仍被源站 Cloudflare 拦截（403/429）。

## [0.1.4] - 2026-10-10

对应需求台账 REQ-20261010-001（微信抓取、发现与统一搜索源）及 BUG-20261010-001/002。

### 新增

- **微信公众号内容抓取与文章发现**（REQ-20261010-001）
  - 微信文章正文抓取：`mp.weixin.qq.com` 文章链接自动解析标题、公众号、发布日期与正文，返回 Markdown 与图片链接；基于既有 Playwright/Chromium 运行时，无需任何微信凭证。
  - 文章发现：搜狗微信搜索与今天看啥镜像站两个来源，条目自动还原微信直链；搜狗验证码命中即停并保留已还原条目。
  - MCP 新增 `searchWechatArticles`（搜索发现）与 `fetchWechatArticle`（微信正文）Tool；`fetchWebContent`/`fetchPlatformContent` 对微信链接自动分流。
  - 门户新增 `POST /api/wechat/discover` 接口；内容抓取页支持微信文章链接与"微信公众号"来源标签。
- **微信公众号统一搜索源**（REQ-20261010-001）
  - 新增 `wechat` 引擎：首页可选（默认停用）、MCP `search` 引擎枚举动态纳入、引擎管理页统一管理；结果描述携带公众号与发布日期。
  - 首页搜索结果点击微信文章链接改用微信平台抓取器读取正文（与内容抓取页一致）。
  - 启用后单次请求耗时高于其他引擎（逐条 3 秒节流 + 浏览器会话还原），验证码命中返回 `SOGOU_CAPTCHA`。

### 修复

- 开启 LinuxDo MCP Tool（及任意单个 Tool 开关）报"请求参数无效"：zod v4 枚举键 record 要求全键齐全，改用 `z.partialRecord` 允许部分提交（BUG-20261010-001）。
- 内容抓取页图片全部堆在文末：预览改用 `react-markdown` + `remark-gfm` 组件，图片跟随原文位置内联展示；未内联的图片仍由末尾网格兜底（BUG-20261010-002）。
- 首页搜索源标签 `wechat` 显示原始 ID：补齐引擎名称映射，统一显示"微信公众号"。

### 依赖

- 服务端新增运行时依赖 `cheerio`、`node-html-markdown`（微信页面解析与 Markdown 转换）；门户新增 `react-markdown`、`remark-gfm`（正文预览）；服务端新增类型依赖 `domhandler`。

### 已知问题

- 搜狗、今天看啥与微信文章页均为第三方页面，页面改版或验证码会以 `SOGOU_CAPTCHA`、`WECHAT_SEARCH_UNAVAILABLE` 等结构化错误码返回；真实网络行为待设备环境验证。
- Linux.do 主题抓取在部分网络出口仍被源站 Cloudflare 拦截（403/429），沿用 0.1.3 已知问题。

### 交付物

- Docker Hub：`docker.io/c1own123/lazycat:miaomiao-search-0.1.4-amd64`（digest `sha256:49e5f9cc3b2a602647920251802677c5919093636dfc63d8a83e185776abec90`）
- 懒猫官方仓库：`registry.lazycat.cloud/u30387910/c1own123/lazycat:c37f8d6655fee51e`
- LPK：`release/miaomiao-search-0.1.4.lpk`
- LPK SHA-256：`a99be1549f04739f4346141be19b18ede95aa8155e8e1a9530825bd7dbb241e8`
- 验证：`pnpm typecheck`、`pnpm lint`、服务端测试 83 项、`lzc-cli project lint` 全部通过；镜像内已抽查确认前端包含"微信公众号"名称映射。

## [0.1.3] - 2026-10-09

首次打包于 2026-09-28（对应需求台账 REQ-20260925-001、REQ-20260928-001）；2026-10-09 重建并加入 Linux.do 标签图标修正。

### 新增

- **平台内容抓取**（REQ-20260925-001）
  - 小红书帖子专用抓取器：支持分享短链解析与 `xsec_token`，返回正文、图片和视频链接。
  - 飞书：OAuth 设备授权后搜索当前用户可访问的文档，官方 Docx API 读取；公开分享链接可直接网页抓取，官方路径失败自动回退分享页提取。
  - 门户新增"内容抓取"独立页：按链接自动识别平台，正文预览、Markdown 下载、懒猫文件拦截下载。
  - MCP 新增 `fetchPlatformContent` Tool；`fetchWebContent` 遇到平台链接自动分流到对应抓取器。
- **知乎官方 CLI 搜索**（REQ-20260925-001）
  - 新增 `zhihu_official` 引擎，Access Secret 按用户加密保存，单次最多 10 条结果。
- **内容抓取自动匹配**（REQ-20260928-001）
  - 抓取页支持 CSDN、掘金、Linux.do、GitHub README 链接自动匹配专用抓取器。
  - Linux.do `/t/<slug>/<id>` 地址自动转换为上游 `/t/topic/<id>.json`。
  - 未命中专用来源的链接回退通用网页抓取。
  - 来源标签切换为共享 `EngineTag` 组件，并补充启用状态颜色。

### 变更

- 移除旧 `zhihu`（Cookie 方案）引擎，由 `zhihu_official` 替代；移除 Startpage 与搜索结果 JSON 展示遗留入口。
- Linux.do 内容标签改用官方图标本地托管资源（`/engine-icons/linuxdo.png`），不再依赖被 Cloudflare 拦截的远程 favicon。（2026-10-09）

### 修复

- 修正内容页来源标签的过期测试断言（`<Tag tone>` → `EngineTag`）。（2026-10-09）

### 已知问题

- Linux.do 主题抓取在部分网络出口被源站 Cloudflare 拦截（403/429），需可访问网络或设备出口复测；MCP `fetchLinuxDoArticle` 默认关闭，可在门户 MCP 设置中启用。
- 知乎匿名访问受限（BUG-20260925-003）：匿名搜索可能返回空结果或 403，待有效凭据或出口验证。
- 飞书 OAuth、知乎 Access Secret 与懒猫设备端下载仍待真实账号和设备验证。

### 交付物

- Docker Hub：`docker.io/c1own123/lazycat:miaomiao-search-0.1.3-amd64`（digest `sha256:3bedcf35ecd69f0341a9be7bb2b699cab43a8414b1663f365c03878770fc3668`）
- 懒猫官方仓库：`registry.lazycat.cloud/u30387910/c1own123/lazycat:56ee42b4225e1133`
- LPK：`release/miaomiao-search-0.1.3.lpk`
- LPK SHA-256：`1d5bc5a39aba58fb76477ff39cd8bf64beb743c3bd3198dd0253c6b6d4d45861`

## [0.1.2] - 2026-09-04

### 新增

- 新增 Firecrawl、Tavily、GitHub 与 B站搜索源（REQ-20260831-001）。
- Exa 迁移为 Fastify 直接 Provider，MCP 使用用户数据库加密凭据（REQ-20260831-003）。
- 门户下拉浮层、正文阅读器与凭据交互收口（REQ-20260831-002）。
- MCP 动态引擎与站点专用正文 Tool（`fetchCsdnArticle`、`fetchJuejinArticle`、`fetchGithubReadme`、`fetchLinuxDoArticle`）（REQ-20260825-012）。

## [0.1.1] - 2026-08-29

### 新增

- 懒猫 Resource MCP 与应用间委托调用（REQ-20260829-003）。
- Bing 重定向容错、多策略网页正文提取与 Playwright/Chromium 生产运行时（REQ-20260828-001）。
- 正文阅读器、错误本地化、引擎顺序持久化与桌面宽度调整（REQ-20260829-002）。

## [0.1.0] - 2026-08-25

### 新增

- V1 基线：多引擎聚合搜索、搜索历史快照、调用统计与审计日志、MCP Streamable HTTP（REQ-20260823-001 等）。
- LPK 多实例与懒猫 OIDC 登录、单实例用户隔离（REQ-20260825-006、REQ-20260826-001）。
- 本地账号登录与自定义运行时镜像（REQ-20260825-014）。
- MCP Token 管理：限额、今日用量、删除、Secret 复制（REQ-20260825-010/011/012）。
- 品牌标识与发布包更新（REQ-20260827-001）。
