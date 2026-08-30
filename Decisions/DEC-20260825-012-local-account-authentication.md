# DEC-20260825-012：OIDC 建号与本地账号密码认证

## 状态

已确认实施。

## 决策

- 懒猫 OIDC 是本地账号的唯一建号入口。首次 OIDC 成功后写入 `local_account`，默认密码为 `12345678`。
- 每个懒猫用户按 OIDC `sub` 独立建号；部署在懒猫微服时优先使用网关注入的 `X-HC-User-ID` 作为懒猫账号，再使用 UserInfo/ID Token 的 `preferred_username → username → account → email → sub` 兼容取值，并统一小写。
- 密码使用 Node `scrypt` 加随机盐保存，不保存明文或可逆密钥。默认密码不强制首次修改。
- OIDC 会话可以直接设置或重置密码；本地会话改密必须验证当前密码。
- 任一本地账号或 OIDC 会话改密成功后，服务端清除当前应用会话，前端跳转登录页，用户必须重新登录。
- 会话 JWT 继续由服务端 HttpOnly Cookie 承载，并增加 `account`、`loginMethod` 字段。MCP Token 不与门户账号互通。
- 退出登录清除应用会话和 OIDC state Cookie，并跳转懒猫 `/sys/oauth/logout` 清除微服认证会话；本地账号记录和密码数据保留。

## 安全与兼容

- 本地登录路由单独限流，未建号账户使用统一错误文案，避免暴露账户是否存在。
- OIDC 资料更新发生账号唯一键冲突时拒绝本次同步，保留数据库中的原记录。
- OIDC 回调失败会写入 Fastify 警告日志；已有 OIDC 应用会话访问 `GET /api/auth/me` 时会按当前网关注入 UID 自愈本地账号记录，并刷新应用会话。
- 旧会话没有 `account` 或 `loginMethod` 时按兼容规则回退到 OIDC，会话仍需重新登录后才能使用本地密码。

## 关联

- 需求：`REQ-20260825-014`
- 迁移：`packages/server/drizzle/0007_local_account.sql`
