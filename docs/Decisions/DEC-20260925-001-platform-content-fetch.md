# DEC-20260925-001 小红书与飞书抓取、飞书及知乎官方搜索方案

## 状态

用户已确认飞书双路径、OAuth 和知乎官方 CLI 搜索；随后明确要求移除社区版知乎来源及知乎链接抓取。当前方案已实现，待真实账号与设备验证。

## 参考项目核查（2026-09-25）

| 项目与核查提交 | 已有能力 | 对本需求的边界及可用做法 |
|---|---|---|
| [xiaohongshu-cli](https://github.com/tamnd/xiaohongshu-cli/tree/b60f9a384ed32d002aaacbbff95fedb2bdc96682) | `note` 从链接或 ID 读取 SSR `window.__INITIAL_STATE__`，带登录 Cookie 时回退签名 API；返回作者、时间、标签、互动量、图片和视频字段。还提供搜索、评论、用户、推荐流、关联笔记和有界遍历。 | 单篇笔记通常需要分享链接的 `xsec_token`；无 Cookie 时笔记与推荐流可用，搜索和评论需要登录。可复用链接解析、结构化元数据与缺 Token/反爬错误语义。依据 `README.md`、`xiaohongshu/note.go`、`types.go`、`pkg/xhsurl/url.go`。 |
| [OmniSaver](https://github.com/yelosheng/omnisaver/tree/a8986e88258eb28d0a8e3cea366c715d65ca2f1e) | `FeishuService` 抓取 `<workspace>.feishu.cn` / `<workspace>.larksuite.com` 的公开 wiki/docx/docs，Playwright 提取标题、段落、标题层级、列表、代码和图片，转 Markdown 并保存元数据。还有保存任务、重试和已保存内容全文检索。 | **没有全网飞书公开文档搜索**；`/api/saved` 只检索本地归档。私有文档 Cookie 读取仍为 TODO。可借鉴文档块、代码语言、图片、Markdown 导出和无权限识别。依据 `services/feishu_service.py`、`app.py`。 |
| [zhihu-cli](https://github.com/Xiaofan629/zhihu-cli/tree/fdef60e249c70be996b6fe9da32694d313e794b7) | `api/v4/search_v3` 直接搜索；问题、回答、文章、想法各用详情 API，提供规范化 JSON/YAML。还有热榜、用户、收藏、Feed 和互动。 | 多数查询可匿名尝试，仍可能遇到 403/429；收藏、Feed、写操作需要登录。可借鉴搜索类型、内容详情、作者/赞同数和稳定错误码。依据 `zhihu_cli/client.py`、`commands/search.py`、`payloads.py`。 |
| [yet-another-lark-mcp](https://github.com/a4001234567/yet-another-lark-mcp/tree/ed49d65c755a484058f85dcb07baab3c705d800a) | 官方用户 OAuth 设备流；`feishu_doc_search` 调 `POST /open-apis/search/v2/doc_wiki/search`；`feishu_doc_fetch` 调 Docx `rawContent` 和 `documentBlock.list`。 | 搜索的是**授权用户可访问的文档和 Wiki**，不是全网公开分享链接；`fetch` 的结构块摘要仅截取每块前 80 字，正文由 rawContent 返回。可借鉴按用户 OAuth、自动刷新、官方搜索与文档 API。依据 `src/auth.ts`、`src/tools/docs.ts`、`SETUP.md`。 |

四个参考仓库的许可证依次为 Apache-2.0、MIT、Apache-2.0、MIT。本方案借鉴处理方式，不将这些参考项目的 CLI 或外部 MCP 进程作为生产依赖。知乎官方 CLI 是另一个独立的官方发布物。

### 当前出口的匿名请求检查

2026-09-25 用仓库参考项目的请求头和参数访问知乎 `api/v4/search_v3`，返回 HTTP 400、`{"HitLabels":null}`；直接访问其 README 示例文章的 `zhuanlan.zhihu.com/api/articles/<id>` 返回 HTTP 403、错误码 `10003`。不用参考请求头时，搜索接口返回 HTTP 403、错误码 `40362`。这只证明当前出口的匿名请求受限，不代表所有部署环境都不可用；也不能据此承诺替换后能稳定搜索或抓取。

## 实施方案

1. 增加独立“内容抓取”门户页。输入 URL 后按严格主机名和路径识别小红书笔记与飞书公开文档；预览标题、来源、作者、时间、正文及可用媒体。入口及每次跳转只允许无凭据 HTTP(S) URL。
2. 小红书只按帖子链接读取。解析 `xsec_token`，优先 SSR 数据；缺 Token、登录墙或反爬时明确报错。帖子搜索、评论与推荐流不混入此入口。
3. 飞书支持两条读取路径并自动识别：完成飞书用户 OAuth 后优先使用官方 Docx API 搜索与读取授权用户可访问的文档；公开分享链接可直接走现有 Chromium 渲染抓取。官方读取因目标不在授权范围或不支持分享 Token 而失败时，针对原始公开分享链接回退到浏览器抓取。Wiki 链接先经官方节点接口解析 `obj_token`。两条路径都不能把登录页或空壳当作正文。
4. 知乎仅保留开放平台官方 CLI 搜索。旧 `zhihu` 引擎行和 Cookie 设置从用户库删除；知乎结果点击后展示官方搜索摘要详情，并提供源站入口。
5. 飞书新增独立 `feishu` 引擎，使用官方 `search/v2/doc_wiki/search` 搜索当前 OAuth 用户可访问的文档，返回经校验的文档/Wiki 链接与摘要。未授权时明确提示连接飞书。公开分享链接的按 URL 抓取不需要先经过搜索。
6. 下载生成包含来源 URL 与元数据的 Markdown 文件。前端用抓取响应生成 Blob，再触发 `<a download href="blob:...">`；LPK 清单添加官方文件选择器注入与 `download`、`objectUrl` hooks，构建时包含官方脚本。本地浏览器保持普通下载。

## 数据与安全边界

- 新增抓取 API；飞书和知乎官方 CLI 引擎进入搜索目录与 MCP 动态枚举。按当前用户做认证、限流、审计和缓存隔离。
- 即时抓取结果只在页面状态中保存；不新增归档表。下载点击时生成，不自动持久化。
- 飞书 App ID、App Secret、用户 access/refresh token 以及待完成的设备码保存在当前用户加密设置中；门户只显示授权状态，不回传 Secret 或 Token。OAuth 仅申请搜索、只读文档/Wiki 与 `offline_access` 权限；过期时用 refresh token 更新，失效时要求重新授权。懒猫 OIDC 与飞书 OAuth 互不混用。
- 外部请求限制响应体大小、超时、跳转和最终主机；预览不执行源站 HTML 或脚本。不自动获取用户浏览器 Cookie，不绕过验证码或私有文档权限。
- 小红书批量遍历、知乎点赞/收藏、OmniSaver 任务队列与持久归档会改变产品范围和数据模型，本轮不纳入。

## 已确认口径

1. 用户本轮已指定飞书官方 OAuth 搜索与文章读取，并要求公开分享链接抓取回退。该路径不等同于互联网全网公开文档检索。
2. 用户要求先完成内容抓取；下载先提供 Markdown 正文、来源和元数据，媒体预览保留可用链接，不新增离线媒体包。
3. 用户最终确认移除社区版知乎来源及知乎链接抓取；当前只保留官方 CLI 搜索。

用户已确认官方 OAuth 和分享链接回退。`Xiaofan629/zhihu-cli` 是社区项目；知乎开放平台另行提供了[官方 Zhihu CLI](https://developer.zhihu.com/docs?key=zhihu_cli)，二者不能混为一谈。

## 知乎官方 CLI 搜索补充决策

官方 CLI 0.6.0 的 `search zhihu --query ... --count 1-10` 返回官方搜索 JSON，含标题、摘要、原文链接和作者等字段。它另有 `search global` 全网搜索、`hot` 热榜、`answer` 直答、`question` 问题推荐与回答摘要、`me` 当前账号内容、`knowledge` 知识库和 `quota` 额度查询；这些命令涉及不同数据与权限，本轮只把站内搜索纳入统一搜索引擎。官方 Skill 并不附带二进制。依据官方文档、Skill `references/cli.md` 与[发布清单](https://developer-cdn.zhihu.com/zhihu-cli/releases/stable/manifest.json)，2026-09-25 已校验 Linux amd64 发布包的 SHA-256，运行了 `--help`。

保留 `zhihu_official` 引擎，删除原有 `zhihu` 站点 API 搜索与链接抓取。用户在引擎管理填写自己的知乎开放平台 Access Secret，按当前门户用户加密保存，启用时必填；不得跨用户共享。服务端只向 CLI 子进程的 `ZHIHU_ACCESS_SECRET` 环境变量注入当前用户凭据，固定执行 `search zhihu` 命令与参数，不传入 shell，不回传 CLI 的原始错误和输出。子进程有 18 秒超时与 1 MB 输出上限。搜索结果仍受统一引擎限流、分组、审计和 MCP 枚举约束。Docker 构建从知乎官方 CDN 获取固定版本二进制并校验官方发布清单的 SHA-256；本地开发可配置 `ZHIHU_CLI_PATH` 指向已安装的官方 CLI。真实 Access Secret 和目标镜像的在线搜索待部署环境验证。官方 `zhihu_search` 文档提供内容类型、作者、赞同、评论、更新时间等结果字段和 `30001` 频率限制码；CLI 错误文档列出 `30002` 配额耗尽。门户详情只使用搜索返回的摘要元数据，错误码映射为本地化折叠式错误提示，服务端不回传 CLI 原始诊断。

## MCP 按链接自动抓取补充决策

用户要求把小红书与飞书按链接抓取也交给 MCP，并由 URL 自动匹配来源。新增 `fetchPlatformContent(url, maxChars?)` Tool，返回平台、标题、作者、Markdown、媒体链接和来源 URL；沿用当前用户的抓取权限与飞书 OAuth。已有 `fetchWebContent` Tool 收到受支持的小红书帖子/分享短链和飞书文档链接时调用同一平台抓取器，返回兼容的 `content` 字段并附平台元数据；其他 URL 仍走通用正文读取器。URL 识别只接受固定 HTTPS 主机和内容路径，平台服务再次校验链接与跳转。新 Tool 使用原有 Fetch scope、MCP 限流与审计，不缓存带用户授权内容；原有 Tool 的普通网页响应契约不变。
