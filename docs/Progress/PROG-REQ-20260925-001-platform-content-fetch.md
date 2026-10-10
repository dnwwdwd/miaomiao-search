# PROG-REQ-20260925-001 小红书与飞书抓取及搜索

## 当前状态

四个参考项目调研、用户范围确认和本地实现完成；真实账号与懒猫设备验证待执行。

## 已完成

- 固定三个参考仓库的核查提交，并核对实际命令、实现、登录要求和附加能力，写入 `DEC-20260925-001`。
- 当时确认知乎 Provider 使用 Bing/Baidu 站内查询；飞书没有现成 Provider；通用正文读取通过 Open-WebSearch daemon。
- 核对懒猫文件拦截的注入、Blob 下载和构建打包要求。
- 核对 `yet-another-lark-mcp` 的官方用户 OAuth 设备流、文档搜索与 Docx 读取；确认搜索权限范围是当前授权用户可访问的文档。
- 当前出口按参考项目的匿名请求头访问知乎搜索 API 返回 HTTP 400 `HitLabels:null`，文章详情 API 返回 HTTP 403 `10003`；无参考请求头时搜索返回 HTTP 403 `40362`。因此用户最终选择只保留官方 CLI 搜索，见决策记录。

## 实现与验证

- 小红书 SSR 帖子读取和分享短链解析、飞书设备 OAuth/官方搜索/Docx 读取及公开页回退已接入。
- 独立抓取页可预览并下载 Markdown；搜索结果中的平台链接使用对应抓取器；LPK 清单和构建脚本包含懒猫下载拦截。
- `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 和 `git diff --check` 本地通过。真实上游成功率、飞书授权和懒猫设备保存仍需目标环境验证。

- 查证知乎开放平台官方 CLI 与社区参考项目是独立项目；官方 Linux 包经 SHA-256 校验并核对命令及 JSON 契约。新增独立 `zhihu_official` 搜索引擎、加密 Access Secret 配置、受限 CLI 子进程和镜像内固定版本安装。
- 官方 CLI 增量经 `pnpm typecheck`、`pnpm lint`、前端 25 项和服务端 68 项测试、`pnpm build`、`lzc-cli project lint` 验证。Docker 独立阶段构建成功，容器中 `zhihu-cli version` 返回 Linux amd64 0.6.0；未使用真实 Access Secret 发起搜索。
- MCP 新增 `fetchPlatformContent` 并使 `fetchWebContent` 自动分流小红书与飞书内容链接；复用平台服务、用户凭据、Fetch scope 和审计。覆盖 URL 识别、工具发现、结构化返回、通用网页回退与 Search-only Token 拒绝测试。
- MCP 抓取增量经 `pnpm typecheck`、`pnpm lint`、前端 25 项与服务端 69 项测试、`pnpm build`、`lzc-cli project lint`、`git diff --check` 验证。真实小红书、飞书链接与设备端 MCP 客户端仍待目标环境验证。
- 用户提供的小红书真实分享链接在当前出口可匿名读取 SSR 正文；修复 Node `fetch` 登录重定向后，项目抓取器直接返回标题“折腾AI两年，我到底在折腾什么东西 🤖”、作者“吃遍全国汉堡🍔”和完整正文。修复后类型检查、Lint、前端 25 项与服务端 70 项测试、构建和差异检查通过；目标设备网络仍待验证。
- 按用户最终确认，移除社区版知乎来源及知乎链接抓取，只保留官方 CLI 搜索。内容抓取页展示小红书、飞书来源 Tag；已有用户库启动时删除旧引擎行和 Cookie 设置，MCP 平台抓取只识别小红书与飞书。类型检查、Lint、前端 26 项与服务端 67 项测试、构建和差异检查通过。
- 核对知乎官方搜索 API 与 CLI 错误文档。搜索结果详情复用官方返回的摘要、内容类型、作者、赞同、评论和更新时间，提供源站阅读全文入口；`30001` 频率限制及 `30002` 配额耗尽映射为固定错误码，页面通过折叠式错误组件展示，不回传 CLI 原始诊断。前端 26 项与服务端 69 项测试、Lint、类型检查、构建和差异检查通过；真实 Access Secret 搜索仍待目标环境验证。
