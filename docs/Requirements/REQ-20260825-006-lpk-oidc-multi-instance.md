# REQ-20260825-006：LPK、OIDC 与数据库挂载基线（历史）

## 状态

本需求的多实例部分已由 REQ-20260826-001 替代。

进行中。用户于 2026-08-25 确认以 LPK V2 打包 Linux amd64 应用；本地账号认证边界已由 `REQ-20260825-014` 补充。

## 范围与数据

- 新增 LPK V2 元数据、清单、构建和运行脚本；运行时包含 Next.js `web`、Fastify `api` 和 API 容器内私有 Open-WebSearch daemon。
+ 单实例只将 `DATA_DIR=/lzcapp/var/miaomiao-search/data` 挂载给 API；包内不包含数据库、缓存、Token、日志或密钥。用户数据隔离由 REQ-20260826-001 定义。
- SQLite 的写入方为迁移、默认初始化、引擎、设置、历史、审计和 MCP Token 服务；门户和 MCP 为读取方。应用不会清理、重置或迁移外部挂载目录以外的数据。
- 历史本地 `admin` 表通过版本化迁移删除，`local_account` 由首次 OIDC 登录建立；其余已挂载数据库数据不因升级被主动删除。

## 认证与安全边界

- 网关放行门户根路径和 `/api/auth/*`；登录页提供 OIDC 与本地账号入口，OIDC 仍使用 Authorization Code + PKCE，服务不以 `X-HC-*` 头自动建立登录会话。
- OIDC state、nonce、PKCE、issuer、audience、ID Token 签名和过期时间必须校验；会话 Cookie 为 HttpOnly、Secure、SameSite=Lax。
- `/mcp` 继续接受独立 Bearer Token 的 Hash、Scope、状态和额度校验；不绑定或读取 OIDC/本地门户身份。
+ 安装级 stable_secret 派生门户会话、MCP Token Hash 和加密设置密钥；真实密钥不写入包、数据库或日志。

## 失败与验收

| 场景 | 预期行为 |
|---|---|
| 空挂载启动 | 执行迁移和默认初始化，创建空实例可用的 SQLite 数据库 |
| OIDC 拒绝、过期或回调校验失败 | 清理临时 state Cookie，返回登录页通用错误 |
| 无门户会话访问管理 API | 返回会话未授权；网关仍负责门户登录前置 |
| 无效 MCP Token | 即使网关放行也返回 Token 未授权，不进入 Tool |
| 重启或升级 | 复用已挂载数据库，不执行清理 |

未受影响：搜索语义、正文 SSRF/XSS 防护、MCP Tool 名称/响应兼容结构、Token 原文仅展示一次与审计保留策略。
