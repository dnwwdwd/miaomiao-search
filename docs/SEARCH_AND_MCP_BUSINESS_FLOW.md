# 搜索与 MCP 业务流程

> 最后更新：2026-08-31
> 状态：四类新增搜索源已接入本地实现；阶段 4 部署与生产端到端验证待开始
> 适用范围：Web Search、Remote MCP、认证、缓存、审计、搜索历史、正文抓取和 Provider

## 入口与前置条件

- Web 入口：`/`、`/login`、`/api/auth/*` 由懒猫清单放行给应用自有鉴权。用户可在 Login 页面选择懒猫 OIDC 或本地账号；首次 OIDC 成功后按 OIDC `sub` 建立本地账户记录，并优先使用懒猫网关 UID作为账号，服务端以 HttpOnly、Secure、SameSite=Lax Cookie 建立应用会话。生产 LPK 通过 `upstreams` 同源转发 `/api/*` 到 Fastify。

- 引擎管理的首页顺序与 MCP 顺序分别写入当前用户设置。Web 首页来源选择器按首页顺序展示；MCP `search` 未传 `engines` 时按 MCP 顺序生成 schema 与执行请求，显式数组顺序保持调用方输入。
- 正文阅读器先呈现骨架屏，完成后以安全文本节点展示正文链接；错误先返回当前语言的摘要，查看详情才展示原始码和消息，MCP 仍保留原始错误契约。
- 退出登录：顶栏调用 `POST /api/auth/logout` 清除应用会话和 OIDC state Cookie，然后进入 `/login`；直接访问 `GET /api/auth/logout` 同样清 Cookie 并 302 到 `/login`。本地账号记录和懒猫网关登录态保留。
- 改密成功：`PUT /api/auth/password` 更新密码后清除当前应用会话和 OIDC state Cookie，前端跳转 `/login`，本地账号和 OIDC 登录方式都必须重新登录。
- MCP 入口：外部 Agent 向网关放行的 `/mcp` 发送 Streamable HTTP POST。外部客户端使用有效 Bearer Token；懒猫应用间 Agent 使用 `.lzcx` 入口，由 ingress 消费用户票据并注入 `X-HC-SOURCE=app:<包名>` 和 `X-HC-USER-ID`。当前不开放 Legacy SSE，也不读取 OIDC Cookie 或 `X-HC-USER-TICKET`。
- 持久化数据：引擎配置、系统设置、Access Token、搜索历史和审计日志写入 SQLite；新 LPK 实例挂载空的 `/lzcapp/var/miaomiao-search/data` 目录，包内不携带数据库。搜索与正文缓存为进程内缓存，重启后清空。
- 安全前提：服务端校验 OIDC/本地应用会话、Token Scope、Token 状态和额度；本地密码只保存 scrypt 哈希；正文请求保留 URL、HTTP(S)、无凭据、超时、响应体大小和正文长度约束。公网入口与网络访问范围由 Cloudflare Tunnel/部署网络负责。
- 非目标范围：不改变现有角色和管理权限模型；不启用 Playwright 搜索模式；Bing 实际执行路径固定为 HTTP request；不提供 Provider 专属 MCP Tool，不下载或代理 B站封面。

## Web 搜索主流程

1. 管理员输入关键词或完整 URL；空输入不能提交。
2. 完整 URL 进入正文读取流程；关键词搜索提交选中引擎、首页持久化的可选调用方 Limit 和适用的 Bing 搜索模式，未传 Limit 时使用各引擎配置。
3. 服务端校验会话和参数，读取引擎配置与缓存，再按 Provider Registry 调度对应搜索源。其他六个旧引擎进入 Open-WebSearch daemon；Exa、Firecrawl、Tavily、GitHub、B站由 Fastify 直接调用固定 HTTPS Endpoint。Exa 的 API Key 从当前用户加密设置读取。
4. 服务端按引擎独立请求，每个引擎的有效数量取调用方 Limit、引擎 `result_limit`、Provider `maxResults` 和系统上限的最小值；先按引擎截取，再按规范化 URL 生成聚合结果。响应同时提供 `engineResults[]` 分组结果和兼容的 `results` 平铺结果，重复 URL 在已有封面或视频元数据为空时补入新 `thumbnailUrl`/`videoMeta`。B站结果点击后由门户展示视频详情，不进入通用正文抓取。
5. 服务端记录 Request ID、耗时、缓存命中、结果数、状态和错误码；Web 搜索在历史开启时保存 Query、引擎选择、分组/聚合结果快照与失败引擎信息。
6. 前端展示结果、来源标签、部分失败或明确错误状态。正文请求校验 URL 与 HTTP(S) 协议后交给 Open-WebSearch；上游按请求、浏览器 Cookie、浏览器渲染、Readability、语义 HTML 和结构化数据多策略提取，再按长度限制安全呈现。页面可访问但没有可读正文时返回 `CONTENT_NOT_EXTRACTED`/422，门户显示重试与打开源站入口，MCP 保持相同错误契约。

## 搜索历史与保留策略

- `/api/history` 返回按时间倒序的历史记录和结果快照；快照只包含标题、URL、摘要、来源引擎、可选 `thumbnailUrl`/`videoMeta` 与失败信息，不保存网页正文、Token 或认证信息。旧快照缺少封面或视频字段时继续正常展示。
- 历史详情展示当次搜索条件和旧的分组/聚合结果；“再次搜索”使用原 Query、引擎选择和当前设置重新请求，结果不会覆盖旧快照。
- `history.retentionDays` 为正整数时按天清理；`-1` 表示永久保存并跳过自动删除。修改设置、读取历史和写入新历史前都会执行清理；手动清空始终立即删除记录。
- 旧迁移记录或损坏快照返回空快照状态，不阻塞查看元数据或再次搜索。

## MCP 主流程

1. 客户端通过 `/mcp` 发起 Streamable HTTP 请求。
2. 带 Bearer 的请求按 Token Hash、状态、过期时间、Scope、RPM/Daily 限额和可选 UID 校验；无 Bearer 的请求只有在 `X-HC-SOURCE=app:<包名>` 且存在 `X-HC-USER-ID` 时才进入懒猫委托路径。带无效 Bearer 的请求不会回退到委托路径。
3. Bearer 请求按 Token owner 选择用户库；委托请求按 `X-HC-USER-ID` 选择用户库。两条路径都会在建立 MCP Server 时读取当前启用引擎和 Tool 状态。
4. 已授权请求调用 `search` 或正文 Tool；`search.limit` 可选，未传时按当前启用且设为默认的引擎配置返回，显式停用引擎会被拒绝。MCP `search` 的引擎枚举按当前用户启用状态和 MCP 顺序动态生成。CSDN、掘金、GitHub README 和 Linux.do 使用对应专用 daemon endpoint，通用网页使用通用正文 endpoint。
5. Bearer 请求更新 Token 最近使用时间并写入带 `token_id` 的审计日志；委托请求按用户 MCP RPM 限流，不设置 Token 每日额度，审计的 `token_id` / `token_prefix` 为空。门户按 UTC 自然日从审计日志聚合 Token 调用量，再按 MCP 语义返回结果。

## 状态、异常与安全边界

| 场景 | 系统行为 | 用户或客户端反馈 | 可恢复方式 |
|---|---|---|---|
| 单个搜索源失败 | 保留其他成功结果并记录失败原因 | Web 显示部分失败横幅；MCP 返回结果和失败信息 | 更换或减少引擎，稍后重试 |
| Exa 凭据缺失或失效 | 从当前用户加密设置读取 API Key；未配置时拒绝请求；401/403、额度和限流映射稳定错误码 | 门户显示本地化错误；MCP 保留错误码 | 在引擎管理中保存或更换 Exa Key |
| Firecrawl/Tavily 凭据缺失或失效 | 必需 Key 未配置时拒绝启用；401/403、额度、限流和无效响应映射稳定错误码 | 门户显示本地化错误；MCP 保留错误码 | 配置或更换 Key，等待额度/限流恢复 |
| GitHub 查询失败 | 仅搜索公共仓库；Token 可选；401、422、403/429 和限流重置头映射稳定错误 | 返回 GitHub 专用错误码，不暴露 Token | 修正查询、配置 Token 或等待限流 |
| B站公开搜索被阻断 | 412/-412 只执行一次匿名首页 Cookie 预热和一次重试；持续阻断记为 `BILIBILI_BLOCKED` | Web/MCP 保留其他引擎结果，封面只显示官方 CDN URL | 稍后重试，接受 B站公开接口风控 |
| 所有搜索源失败 | 不返回伪结果，记录错误 | 区分超时、限流、代理和运行时失败 | 检查网络、代理、引擎状态或 daemon 配置 |
| 搜索成功但无结果 | 保存空结果快照并返回成功状态 | Web 展示空结果状态；MCP 返回空数组 | 修改关键词或引擎后重试 |
| 正文 URL 不可用 | 拒绝无效 URL、非 HTTP(S)、带凭据 URL，或由上游返回超时/过大响应 | 返回对应正文读取错误 | 使用可访问且符合协议的 HTTP(S) URL |
| 页面可访问但无可读正文 | 多策略均未识别正文，常见于空壳 SPA、登录墙或反爬挑战 | Web/MCP 返回 `CONTENT_NOT_EXTRACTED`/422；Web 提供重试和打开源站 | 稍后重试或在源站完成登录/验证 |
| MCP Token 无效或超限 | 拒绝 Tool 调用并写入审计 | 401、403 或限流错误 | 使用有效 Token，等待限流窗口或调整额度 |
| MCP 懒猫委托头缺失或来源不可信 | 拒绝未带 Bearer 的请求，不创建用户库上下文 | 401 | 通过懒猫 `.lzcx` 入口访问，并由 ingress 注入 `X-HC-SOURCE` 与 `X-HC-USER-ID` |
| MCP 委托用户调用超限 | 按用户的 `rateLimit.mcp.rpm` 拒绝 Tool 调用；不写入 Token 额度 | 限流错误 | 等待限流窗口或调整当前用户的 MCP RPM 设置 |
| Token Secret 丢失 | 数据库不能恢复原文 | 创建时只展示一次 | 创建新 Token，并按需要撤销旧 Token |
| Token 删除 | 删除 `access_token` 记录但保留审计日志 | 门户确认后刷新列表 | 重新创建 Token；历史调用仍可在 Usage 查看 |
| OIDC 会话失效或授权失败 | API 返回会话错误，门户显示登录或通用授权失败提示 | 重新点击懒猫 OIDC 登录 | 检查 Cookie、OIDC 配置、服务端状态和 Tunnel 回源配置 |
| 未完成 OIDC 的本地登录 | 本地账号表没有记录，接口返回统一账号或密码错误 | 先完成一次懒猫 OIDC 登录 | 检查迁移和 `local_account` 数据 |
| 本地密码错误或改密失败 | 不建立会话；本地会话改密需要当前密码 | 重试或使用 OIDC 会话重置密码 | 检查密码长度、当前密码和账户状态 |
| 改密成功 | 清除当前应用会话和 OIDC state Cookie，返回 `reloginRequired=true` | 回到登录页 | 使用新密码或懒猫 OIDC 重新登录 |
| 网关 UID 缺失或与会话不一致 | 清除应用会话并拒绝门户 API；前端重新校验后回到 `/` | 显示登录页 | 使用当前懒猫账号重新登录 |
| 两个懒猫用户访问同一单实例 | 按 UID 选择独立业务数据库；设置、引擎、历史、审计和 Token 不共享 | 每个用户只看到自己的数据 | 切换到目标懒猫账号后重新登录 |

## 当前验证边界

- 已在本地验证登录、门户页面切换、真实搜索、正文 URL/上游错误、搜索历史快照、永久保存设置、MCP 管理 API 和 Streamable HTTP 路径。
- 已补充 Resource MCP provider 元数据、可信懒猫应用间委托鉴权、用户隔离和委托审计测试；真实小龙猫/Codex 发现及 `.lzcx` 回归仍需部署到 `lzcos >= 1.5.2` 的设备。
- 已补充验证 MCP 引擎启停后的动态 `tools/list`、站点专用正文 endpoint、具体上游错误映射和四类 Provider 的注入式单测；B站 412 预热重试、视频分组过滤、HTML 清理和官方 CDN 封面校验均有覆盖。
- 四类新增搜索源已完成本地实现：服务层分组响应、兼容平铺结果、独立缓存版本、历史封面兼容、MCP 动态枚举、凭据模式和首页/管理页数量上限已接入；真实 Firecrawl、Tavily、GitHub 和设备端 B站回归仍需显式环境与部署环境验证。
- 本地认证测试、Dockerfile 静态检查、脚本语法检查、Docker Hub 推送、官方 registry 复制和懒猫微服打包已完成；阶段 4 仍需验证 Cloudflare Tunnel 回源、真实网络下的各引擎、网页正文、MCP 客户端兼容性，以及懒猫设备上的认证流程。
