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
| BUG-20260831-002 | 已修复 | Exa MCP 使用不到引擎管理中保存的 Key，仍依赖 daemon 环境变量 | Exa 原先由 Open-WebSearch 补丁读取独立进程的 `EXA_API_KEY`，与按用户隔离的 Settings 数据不一致。 | Exa 改为 Fastify `ExaProvider`，从当前用户 `SettingsService` 读取 `engine.exa.apiKey` 并调用官方 Search API；UserStore/MCP 注入对应 Provider Registry，测试使用注入式 fetch。 | Exa Provider、加密设置、MCP 请求头和 401/402/429 错误映射测试通过；最终全量检查与 LPK 发布待完成。 |
| BUG-20260831-001 | 待验证 | 引擎管理表格中的结果数量下拉被表格或滚动容器遮挡 | Dropdown 原本作为表格滚动容器内的绝对定位子节点，受 `overflow-x-auto` 和相邻行层叠上下文影响。 | 共享 Dropdown 改为 Portal 浮层，使用按钮视口坐标定位，并在滚动/窗口变化时更新；凭据 Tag 同步显示点击修改提示。 | `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 通过；待登录后浏览器确认桌面宽表和窄屏滚动。 |
| BUG-20260828-001 | 待验证 | Bing 搜索源返回 `engine_error: Request failed with status code 302`，或经日本 VPN 出口得到错误地区结果 | `www.bing.com/search` 会按区域跳转到 `cn.bing.com`；原请求禁止重定向且继承全局代理。 | Bing request 适配器改用 `www.bing.com/search`，手动跟随最多 3 跳 Bing 站内重定向、传递 Cookie，并设置 `disableProxy` 绕过显式 HTTP 代理。若 TUN 在内核层接管流量，仍需在 VPN 客户端规则中为 Bing 配置 DIRECT。 | 补丁应用、主机白名单和 Cookie 契约测试通过；待懒猫设备真实请求验证。 |
| BUG-20260828-002 | 待验证 | 正文读取返回 400，门户只显示通用失败，用户无法区分“页面不可达”和“没有识别出正文” | 上游把无正文异常统一标成 400 `validation_failed`；提取路径对 SPA/结构化正文覆盖不足。 | 保留请求、浏览器 Cookie、浏览器渲染、Readability、语义容器、body、JSON-LD、`__NEXT_DATA__` 和正文属性等候选；无正文改为 422 `CONTENT_NOT_EXTRACTED`，Web/MCP 共用，门户提供重试和打开源站。 | 服务端 422 映射、Web/MCP 共用错误和前端契约测试通过；待动态站点实测。 |
| BUG-20260829-003 | 待验证 | 正文弹窗加载时空白、链接无法直接打开；上游错误码和 302/Invalid URL 原样暴露；首页与 MCP 引擎顺序无法固定 | 门户在请求期间没有 loading 状态，正文按纯文本渲染；错误只使用原始消息；引擎列表顺序来自数据库插入顺序。 | 新增骨架屏、安全 HTTP(S) 链接新窗口、来源 EngineTag、错误摘要/详情展开；Settings 保存独立的首页/MCP 顺序，后端按 channel 应用，桌面内容宽度改为约 90%。 | `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 通过；待登录后的浏览器和 MCP 顺序回归。 |
| BUG-20260826-002 | 已修复 | 退出登录后跳转到 404 或门户首页，未进入独立登录页 | 原顶栏使用 OIDC logout 地址会命中实例不可用路径；改用 POST 后仍把地址写死为 `/`，而根路由同时承载门户和登录态判断，无法作为明确的退出落点。 | 新增公开的 `/login` 路由。顶栏退出、会话失效和 GET `/api/auth/logout` 都清除应用 Cookie 并进入 `/login`；不再访问懒猫 OIDC logout 地址，本地账号记录保留。 | `pnpm typecheck`、18 项门户契约测试和 28 项服务端测试通过；服务端回归断言 GET 退出返回 302 `/login`。 |
| BUG-20260826-001 | 已修复 | 引擎管理单独测试失败时显示“所有搜索引擎均失败”，且错误只出现在 Toast | 单引擎搜索沿用了多引擎聚合的统一错误码；测试接口没有返回部分失败详情，前端 catch 后只发送全局 Toast。 | 单引擎失败保留上游错误码和消息；测试接口返回部分失败详情，失败时在当前测试弹窗内显示代码和报错内容。 | 新增单引擎服务与管理 API 回归测试，契约测试覆盖弹窗告警；需在真实上游环境确认具体错误文案。 |
| BUG-20260825-012 | 已修复 | 首页 Baidu 搜索成功，但 MCP Baidu 搜索报“302 重定向错误” | Open-WebSearch Baidu 适配器使用 Axios 且禁止重定向；Baidu 对部分请求返回站内 302 验证/跳转，MCP 因此直接失败。首页可能命中缓存或请求条件不同。 | 无代理时改用 Node 原生 `fetch`，手动跟随最多 3 次 HTTPS `baidu.com` 子域名重定向；代理场景保留 Axios 通道，并统一请求头和参数。 | 本地 daemon 的 `lazycat`、`喵喵搜索`、`MCP服务`、`百度搜索` 均返回 Baidu 结果；`pnpm install --frozen-lockfile`、lint、typecheck、35 项测试、生产构建、`lzc-cli project lint` 和 `lzc-cli lpk lint` 全部通过；新 LPK 已确认包含补丁后的 Baidu 适配器。 |
| BUG-20260825-011 | 已修复 | LPK Bing 搜索报 `engine_error: Request failed with status code 301` | Open-WebSearch 的 Bing 请求固定使用 `https://cn.bing.com/search`；该入口在当前出口返回 301，且安全请求选项禁止跟随重定向。 | 在 `open-websearch@2.1.11` pnpm patch 中将 Bing 搜索基址切换为 `https://www.bing.com/search`，保留禁止未知静态主机重定向的安全边界。 | `pnpm install --frozen-lockfile` 应用补丁后，安装包源码确认使用 `www.bing.com/search`；`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 通过。 |
| BUG-20260825-010 | 已修复 | MCP Token 列表“今日调用量”固定显示 0 | 前端 `api.tokens()` 将 `usageToday` 写死为 `0`，服务端列表未聚合已有 `request_log.token_id`。 | `TokenService.list()` 按 UTC 自然日聚合审计记录并返回 `usageToday`；前端改为读取服务端数值。 | 服务端 Token 与管理 API 测试覆盖当日记录，`pnpm typecheck`、`pnpm lint`、`pnpm test` 通过。 |
| BUG-20260825-009 | 已修复 | Usage 审计表的水平滚动条停在表格内容中部，筛选器和分页不在同一滚动上下文 | 横向滚动容器只包住 `<table>`，宽表在页面中间结束滚动轨道，移动端需要在表格区域内寻找滚动条。 | 将审计卡片的筛选器、表格和分页放入同一个 `audit-table-scroll` 容器，宽度由表格最小宽度驱动，滚动条固定在卡片底部。 | `pnpm typecheck`、`pnpm lint`、`pnpm test` 与生产构建通过；lint 仅保留两个既有 warning。 |
| BUG-20260825-008 | 已修复 | DuckDuckGo 搜索引擎来源 Tag 的官方图标加载失败时经常只显示 Globe fallback | Tag 使用根路径 `favicon.ico`，在部分嵌入式 WebView/出口环境中响应不稳定。 | 切换到 DuckDuckGo 发布的 `DDG-iOS-icon_60x60.png` 官方稳定资源，并保留图片失败时的 Globe fallback。 | 资源返回 HTTP 200 图片响应；`pnpm typecheck`、`pnpm lint`、`pnpm test` 与生产构建通过。 |
| BUG-20260825-007 | 已修复 | LPK 启动后 API 健康检查持续返回 `403` | API 启用了 Host 头 DNS 重绑定防护，但健康检查使用 `127.0.0.1`，而白名单只允许写死的应用内部 appid 域名；回环地址因此被拒绝。 | 路由、API 上游和 API 健康检查统一使用懒猫服务内部 DNS 名 `api`/`web`；`ALLOWED_HOSTS` 只保留 `api`，不写死 appid 域名，也不放行回环地址。 | `lzc-cli project lint` 通过；`validateHostHeader('api:3001', ['api'])` 通过，`127.0.0.1:3001` 仍被拒绝；重新生成 LPK 后包内 manifest 已确认。 |
| BUG-20260825-006 | 已修复 | LPK 安装后 API 加载 `better_sqlite3.node` 报 `ERR_DLOPEN_FAILED` | LPK 内的 better-sqlite3、sharp 和 Next SWC 原生模块为 ARM64，而设备运行环境为 x86-64；改为 x86-64 后又因主机 glibc 2.41 编译产物引用了运行镜像没有的 `GLIBC_2.38`。 | 默认构建目标改回 Linux x86-64；在 glibc 2.36 的 `node:20-bookworm` 容器中用 node-gyp 重建 better-sqlite3，再复制进最终 LPK；`package.yml` 不再声明 `unsupported_platforms`。 | 包内 better-sqlite3 与 sharp 原生文件通过 ELF 头校验为 x86-64；better-sqlite3 最高依赖 `GLIBC_2.34`；`lzc-cli project lint` 通过。 |
| BUG-20260825-005 | 已修复 | LPK 安装失败：`services.api.healthcheck.test.1 must be a string` | 健康检查命令使用 YAML plain scalar，命令内的 `? 0 : 1` 被 YAML 解析成键值对象。 | `web` 与 `api` 的健康检查命令改为 folded scalar，确保 `test` 数组中的两个元素都是字符串。 | 用与安装器相同的 YAML 解析器检查重新生成的 LPK，两个服务的 `healthcheck.test` 均为 2 个字符串。 |
| BUG-20260825-004 | 已修复 | LPK API 服务启动时一直等待或因上游版本校验退出 | `run-api.sh` 检查 daemon 根路径 `/`，而 Open-WebSearch 只提供 `/health`；CLI `serve` 的状态版本为 `unknown`，生产 API 会拒绝该版本。 | 重写 API/Web 运行脚本；API 通过包内启动器以锁定的 `2.1.11` 版本启动 daemon，轮询 `/health` 后再启动 Fastify，并在退出和信号时清理两个子进程；构建目录改用 `.lzc-work` 并限制服务包内容。 | `sh -n`、`node --check`、生产模式 API `/health`、Web 首页和终止信号检查通过；`lzc-cli project build` 生成 LPK。 |
| BUG-20260825-003 | 已修复 | 引擎管理中 DuckDuckGo 的启用条件同时显示 `Proxy` 和“无” | 条件渲染只判断 `requiresApiKey`，没有在已有代理条件时抑制“无”占位文案。 | 仅当引擎没有代理和 API Key 任一前置条件时显示“无”；DuckDuckGo 现在只显示 `Proxy`。 | 浏览器引擎管理页确认 DuckDuckGo 仅显示 `Proxy`，Bing、Baidu 等无前置条件引擎仍显示“无”，Exa 仍显示“需要 Key”。 |
| BUG-20260825-002 | 已修复 | 首页点击搜索引擎来源提示“请求参数无效” | 移除 Brave 后，本地 `search.homeEngines` 仍残留 `brave`；来源切换会提交整份首页设置，服务端 `homeEngines` 枚举校验因此拒绝请求。 | 服务端读取和写入首页来源设置时过滤已不存在的引擎 ID，前端保存入口同步做有效引擎过滤，并补充旧设置回归测试。 | 浏览器复现旧数据后切换 Bing、再次选择和恢复默认均无错误；服务端测试 18 项通过，服务端 typecheck 通过。 |
| BUG-20260825-001 | 已修复（Exa 路径已由 BUG-20260831-002 取代） | 本地多搜索引擎中 Brave、Exa、Startpage 返回空结果或错误不清晰 | Brave 解析器仍使用已消失的 `#results` 容器；Exa 无密钥适配器调用已返回 HTTP 500 的网页私有接口并吞掉异常；Startpage 的 Anubis 反爬页面没有被识别。DuckDuckGo/Brave 的无代理超时和 Startpage/Sogou 的反爬属于本机出口或上游限制。 | 通过 pnpm patch 固化 Brave 新 DOM 选择器；Startpage 增加 Anubis 标识识别；Exa 后续迁移为 Fastify Provider，从用户加密设置读取 Key，详见 BUG-20260831-002。 | Brave/Startpage 边界保持原验证；Exa 新路径由 Provider 与 MCP 测试覆盖。 |
| BUG-20260824-007 | 已修复 | 首页搜索引擎来源选择刷新后丢失 | 来源选择只保存在 `SearchPage` 临时状态，未写入 `/api/settings`。 | 新增 `search.homeEngines` 设置，来源选择、恢复默认和历史重搜统一持久化。 | `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 通过；浏览器验证因当前页面未登录未完成。 |
| BUG-20260824-001 | 已修复 | 登录提交显示“服务请求失败” | pnpm 10.12 未识别 `allowBuilds` 配置，跳过 `better-sqlite3` 原生构建，服务端启动时无法加载 SQLite binding。 | 改用该版本支持的 `onlyBuiltDependencies` 配置，重新安装原生依赖；以安全的 `request` 模式启动私有 Open-WebSearch daemon；移除登录页的原型测试场景控件。 | 本地 `:3001` 返回预期的未授权响应；浏览器以本地管理员账户登录成功进入门户；lint、类型检查、17 项测试和生产构建通过。 |
| BUG-20260824-002 | 已修复 | 搜索提交长时间无结果 | 本地 daemon 未启用 `USE_PROXY=true`，外网搜索源请求超时；不是门户提交控件或 API 参数错误。 | 补充 daemon 的 `request` 模式与代理启动说明；用本机代理启动 daemon。 | `POST /search` 返回 5 条结果；门户搜索 `OpenAI` 返回 10 条聚合结果，耗时约 1.8 秒。 |
| BUG-20260824-003 | 已修复 | 读取网页正文显示为无空格的连续字符串 | 真实 `/api/fetch-content` 请求通过 Open-WebSearch daemon 抓取 TRAE 首页；原始 body/textContent 提取丢失 HTML 段落边界，误看起来像 mock 文案。 | 服务端 fetch-web 请求启用 Readability，并从其返回的 HTML 结构恢复段落换行、常见实体和列表边界；未改为前端 mock 或绕过 SSRF 校验。 | 浏览器以新的缓存键读取 `https://www.trae.ai/`，正文按 5 段显示；新增上游适配器回归测试；lint、类型检查、13 项服务端测试和生产构建通过。 |
| BUG-20260824-004 | 已修复 | 真实搜索/正文状态与原型状态模拟混用 | 页面请求真实 API，但状态控件只按手动选择展示；搜索失败只弹 Toast，正文失败不会打开对应原型错误弹窗。 | 搜索成功、空结果、部分失败及错误码会自动回填原型状态；正文读取失败会按 SSRF、重定向、TLS、超时、禁止访问或提取失败打开对应状态弹窗；手动控件仍仅用于原型预览。 | Browser 已验证：真实搜索返回 10 条结果并保持“正常多源结果”；私网正文 URL 自动打开弹窗并回填“DNS 解析到私网 IP”；页面无应用级 console 错误。Next CLI 的 `spawn EPERM` 仍是当前环境限制，验证使用同配置的编程式 Next 开发入口。 |

| BUG-20260824-005 | 宸蹭慨澶?| 首页返回数量上限 Limit 变更后刷新丢失 | `SearchPage` 仅更新本地组件 state，未写入 `/api/settings` 的 `search.defaultLimit`；同时异步 settings 加载后没有稳定的显示来源。 | 首页 Limit 变更立即调用 `api.updateSettings` 持久化，成功后同步服务端设置；失败回滚并提示，异步加载期间从共享 settings 派生当前值。 | `pnpm typecheck`、`pnpm lint` 通过；登录后 API PUT/GET 验证 20 可持久化并恢复原值 10。 |
| BUG-20260824-006 | 宸蹭慨澶?| Next 本地开发服务端口监听但首页请求卡死 | `pnpm dev` 默认启用 Turbopack，Windows Watchpack 扫描工作盘系统文件后开发请求处理线程失去响应；端口仍监听，浏览器表现为进程终止。 | 默认开发脚本切换为 `next dev --webpack`，重启后连续首页请求返回 200；API 与 Open-WebSearch 服务保持原配置。 | `pnpm typecheck`、`pnpm lint` 通过；本地首页连续请求均返回 200，3000/3001/3210 均在监听。 |
