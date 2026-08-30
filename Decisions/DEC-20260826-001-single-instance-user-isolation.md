# DEC-20260826-001：单实例与按懒猫用户隔离

## 状态

已确认实施。

## 决定

- 应用采用单实例，删除 application.multi_instance。
- 使用 identity.sqlite 保存身份映射和 Token owner 索引；使用 users/<sha256(gateway_uid)>/miaomiao-search.db 保存业务数据。
- 继续使用签名 HttpOnly 会话 Cookie，在 JWT 中绑定 gatewayUserId 和 ownerId；每个生产请求都与当前 X-HC-User-ID 比较。
- /mcp 保持公开路径。Token 在创建时绑定 owner；Token 认证先通过身份库索引找到用户库，再执行 scope、状态、过期和限额校验。
- 使用 stable_secret("miaomiao-search:<AppDomain>") 作为安装级密钥来源，不再使用 DeployID。
- 不兼容旧 LPK 单库数据，旧文件留在挂载目录但不参与启动迁移或读取。

## 安全边界

门户 API 缺少网关 UID、会话 UID 不一致或身份映射不存在时返回统一认证错误并清除 Cookie。MCP 请求没有网关 UID 时仍可使用有效 Token；若带 UID 则必须匹配 Token owner。
