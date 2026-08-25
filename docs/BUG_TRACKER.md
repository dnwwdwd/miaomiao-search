# Bug 台账

## 状态说明

- 待定位
- 修复中
- 已修复
- 已缓解
- 待验证
- 待修复方案确认

## 当前记录

本轮发现的 PRD、技术文档和原型口径差异记录在 `Requirements/REQ-20260823-001-v1-implementation-baseline.md` 与 `Decisions/DEC-20260823-001-v1-search-mode.md`，不作为运行时 Bug。

| ID | 状态 | 问题 | 根因 / 发现 | 修复情况 | 验证 |
|---|---|---|---|---|---|
| BUG-20260825-003 | 已修复 | 引擎管理中 DuckDuckGo 的启用条件同时显示 `Proxy` 和“无” | 条件渲染只判断 `requiresApiKey`，没有在已有代理条件时抑制“无”占位文案。 | 仅当引擎没有代理和 API Key 任一前置条件时显示“无”；DuckDuckGo 现在只显示 `Proxy`。 | 浏览器引擎管理页确认 DuckDuckGo 仅显示 `Proxy`，Bing、Baidu 等无前置条件引擎仍显示“无”，Exa 仍显示“需要 Key”。 |
| BUG-20260825-002 | 已修复 | 首页点击搜索引擎来源提示“请求参数无效” | 移除 Brave 后，本地 `search.homeEngines` 仍残留 `brave`；来源切换会提交整份首页设置，服务端 `homeEngines` 枚举校验因此拒绝请求。 | 服务端读取和写入首页来源设置时过滤已不存在的引擎 ID，前端保存入口同步做有效引擎过滤，并补充旧设置回归测试。 | 浏览器复现旧数据后切换 Bing、再次选择和恢复默认均无错误；服务端测试 18 项通过，服务端 typecheck 通过。 |
| BUG-20260825-001 | 已修复 | 本地多搜索引擎中 Brave、Exa、Startpage 返回空结果或错误不清晰 | Brave 解析器仍使用已消失的 `#results` 容器；Exa 无密钥适配器调用已返回 HTTP 500 的网页私有接口并吞掉异常；Startpage 的 Anubis 反爬页面没有被识别。DuckDuckGo/Brave 的无代理超时和 Startpage/Sogou 的反爬属于本机出口或上游限制。 | 通过 pnpm patch 固化 Brave 新 DOM 选择器；Exa 支持通过仅环境变量 `EXA_API_KEY` 调用官方 Search API，并在无密钥网页接口不可用时抛出可诊断失败；Startpage 增加 Anubis 标识识别，不绕过反爬。 | 代理 daemon 实测 Bing、Baidu、DuckDuckGo、Brave、CSDN、Juejin 各返回 3 条；Exa 返回 `engine_error` 并明确提示需要 `EXA_API_KEY`；Startpage 返回反爬错误；源代码契约测试通过。 |
| BUG-20260824-007 | 已修复 | 首页搜索引擎来源选择刷新后丢失 | 来源选择只保存在 `SearchPage` 临时状态，未写入 `/api/settings`。 | 新增 `search.homeEngines` 设置，来源选择、恢复默认和历史重搜统一持久化。 | `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 通过；浏览器验证因当前页面未登录未完成。 |
| BUG-20260824-001 | 已修复 | 登录提交显示“服务请求失败” | pnpm 10.12 未识别 `allowBuilds` 配置，跳过 `better-sqlite3` 原生构建，服务端启动时无法加载 SQLite binding。 | 改用该版本支持的 `onlyBuiltDependencies` 配置，重新安装原生依赖；以安全的 `request` 模式启动私有 Open-WebSearch daemon；移除登录页的原型测试场景控件。 | 本地 `:3001` 返回预期的未授权响应；浏览器以本地管理员账户登录成功进入门户；lint、类型检查、17 项测试和生产构建通过。 |
| BUG-20260824-002 | 已修复 | 搜索提交长时间无结果 | 本地 daemon 未启用 `USE_PROXY=true`，外网搜索源请求超时；不是门户提交控件或 API 参数错误。 | 补充 daemon 的 `request` 模式与代理启动说明；用本机代理启动 daemon。 | `POST /search` 返回 5 条结果；门户搜索 `OpenAI` 返回 10 条聚合结果，耗时约 1.8 秒。 |
| BUG-20260824-003 | 已修复 | 读取网页正文显示为无空格的连续字符串 | 真实 `/api/fetch-content` 请求通过 Open-WebSearch daemon 抓取 TRAE 首页；原始 body/textContent 提取丢失 HTML 段落边界，误看起来像 mock 文案。 | 服务端 fetch-web 请求启用 Readability，并从其返回的 HTML 结构恢复段落换行、常见实体和列表边界；未改为前端 mock 或绕过 SSRF 校验。 | 浏览器以新的缓存键读取 `https://www.trae.ai/`，正文按 5 段显示；新增上游适配器回归测试；lint、类型检查、13 项服务端测试和生产构建通过。 |
| BUG-20260824-004 | 已修复 | 真实搜索/正文状态与原型状态模拟混用 | 页面请求真实 API，但状态控件只按手动选择展示；搜索失败只弹 Toast，正文失败不会打开对应原型错误弹窗。 | 搜索成功、空结果、部分失败及错误码会自动回填原型状态；正文读取失败会按 SSRF、重定向、TLS、超时、禁止访问或提取失败打开对应状态弹窗；手动控件仍仅用于原型预览。 | Browser 已验证：真实搜索返回 10 条结果并保持“正常多源结果”；私网正文 URL 自动打开弹窗并回填“DNS 解析到私网 IP”；页面无应用级 console 错误。Next CLI 的 `spawn EPERM` 仍是当前环境限制，验证使用同配置的编程式 Next 开发入口。 |

| BUG-20260824-005 | 宸蹭慨澶?| 首页返回数量上限 Limit 变更后刷新丢失 | `SearchPage` 仅更新本地组件 state，未写入 `/api/settings` 的 `search.defaultLimit`；同时异步 settings 加载后没有稳定的显示来源。 | 首页 Limit 变更立即调用 `api.updateSettings` 持久化，成功后同步服务端设置；失败回滚并提示，异步加载期间从共享 settings 派生当前值。 | `pnpm typecheck`、`pnpm lint` 通过；登录后 API PUT/GET 验证 20 可持久化并恢复原值 10。 |
| BUG-20260824-006 | 宸蹭慨澶?| Next 本地开发服务端口监听但首页请求卡死 | `pnpm dev` 默认启用 Turbopack，Windows Watchpack 扫描工作盘系统文件后开发请求处理线程失去响应；端口仍监听，浏览器表现为进程终止。 | 默认开发脚本切换为 `next dev --webpack`，重启后连续首页请求返回 200；API 与 Open-WebSearch 服务保持原配置。 | `pnpm typecheck`、`pnpm lint` 通过；本地首页连续请求均返回 200，3000/3001/3210 均在监听。 |
