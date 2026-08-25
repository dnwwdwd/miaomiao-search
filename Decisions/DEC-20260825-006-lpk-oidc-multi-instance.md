# DEC-20260825-006：LPK 多实例、OIDC 与数据库挂载

## 状态

已确认实施。用户于 2026-08-25 确认本记录的方案，并明确新实例应挂载空数据库目录，应用不得以首次启动逻辑清空数据库。

## 决定

- 采用 LPK V2：`package.yml` 保存元数据和权限，`lzc-manifest.yml` 保存运行拓扑，`lzc-build.yml` 生成 release 包。
- 采用 `application.multi_instance: true`；每个实例使用 `/lzcapp/var/lazycat-search/data` 作为唯一应用持久化目录，API 进程在空目录上运行现有迁移与 bootstrap。
- 门户认证改为懒猫 OIDC 授权码流程。应用登录仅由点击按钮触发，不依赖网关注入 Header；每个 OIDC 成功用户拥有其实例的完整门户权限。
- 网关只放行 `/mcp`，该入口只校验应用 Access Token，完全独立于懒猫账户与门户 Cookie。
- 使用 `.S.DeployID` 与 `stable_secret` 生成每实例密钥，派生 Cookie 签名、MCP Token HMAC 与 SQLite 设置加密密钥；不再使用 `ADMIN_*`、`JWT_SECRET`、`TOKEN_HASH_KEY` 或 `SETTINGS_ENCRYPTION_KEY` 外部环境变量。

## 数据与回退

新增迁移删除遗留 `admin` 表。LPK 不携带任何 SQLite 文件，因此新安装不会带入本地数据；升级已部署实例时保留其挂载数据库。回退到旧版本不会恢复已删除的 `admin` 表或本地密码登录，必须重新部署旧数据和旧密钥才可恢复旧认证。
