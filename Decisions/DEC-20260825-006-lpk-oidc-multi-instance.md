# DEC-20260825-006：LPK 数据挂载与 OIDC 基线（多实例方案已被替代）

## 状态

历史方案。多实例和全局单库口径已由 DEC-20260826-001 替代；本记录仅保留 LPK、OIDC 环境变量和挂载目录背景。

已确认实施；认证边界由 `DEC-20260825-012` 补充。用户于 2026-08-25 确认本记录的多实例方案，并明确新实例应挂载空数据库目录，应用不得以首次启动逻辑清空数据库。

## 决定

- 采用 LPK V2：`package.yml` 保存元数据和权限，`lzc-manifest.yml` 保存运行拓扑，`lzc-build.yml` 生成 release 包。
+ API 仍使用 `/lzcapp/var/miaomiao-search/data` 作为持久化目录，但单实例内部拆分身份库和按 UID 用户库。
- 门户认证以懒猫 OIDC 授权码流程为建号入口；应用登录不依赖网关注入 Header。首次 OIDC 成功后可使用本地账号密码登录，门户会话仍按账户记录方式区分。
- 网关放行门户根路径、`/api/auth/*` 和 `/mcp`，管理 API 继续由应用会话保护；`/mcp` 只校验应用 Access Token，完全独立于懒猫账户与门户 Cookie。
+ 使用基于 AppDomain 的 `stable_secret` 生成安装级密钥，派生 Cookie 签名、MCP Token HMAC 与 SQLite 设置加密密钥。

## 数据与回退

新增迁移删除遗留 `admin` 表并创建 `local_account`。LPK 不携带任何 SQLite 文件，因此新安装不会带入本地数据；升级已部署实例时保留其挂载数据库。旧版本没有 `local_account` 时需要先完成一次 OIDC 建号。
