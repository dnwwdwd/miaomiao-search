# REQ-20260825-014：本地账号登录与自定义应用镜像

## 状态

待验证。代码、迁移、自动化测试、Docker Hub 推送、懒猫官方镜像复制和 LPK 构建已完成；只剩懒猫设备安装回归。

## 用户行为

- 登录页提供“懒猫 OIDC”和“本地账号”两种方式。
- 本地账号使用首次 OIDC 登录时得到的懒猫账号名，默认密码为 `12345678`。
- 未经 OIDC 成功登录的账号不会写入本地账户表，因此不能使用本地密码登录。
- Settings 显示当前账号、角色和本次会话登录方式；OIDC 会话可直接设置密码，本地会话必须填写当前密码。
- 退出登录同时清除应用会话和懒猫 OIDC 登录态，不删除本地账号数据。
- 修改后的密码只保存 scrypt 哈希，旧密码立即失效；改密成功后清除当前应用会话并回到登录页。

## 数据与接口

- 新增 SQLite `local_account` 表，按懒猫用户 `sub` 建立唯一记录，`account` 也保持唯一。
- 账号名优先取懒猫网关注入的 `X-HC-User-ID`，再取 UserInfo/ID Token 的 `preferred_username`、`username`、`account`、`email`、`sub`，并规范化为小写。
- OIDC 回调负责首次建号和后续资料同步；账号名与其他用户冲突时拒绝同步，不覆盖已有账户。
- 已存在的 OIDC 应用会话访问 `GET /api/auth/me` 时，会按当前懒猫网关 UID补建或同步本地账号，避免升级后旧会话缺少本地记录。
- 新增 `POST /api/auth/local/login`、`PUT /api/auth/password`；`GET /api/auth/me` 返回 `account` 和 `loginMethod`。

## 镜像与 LPK

- 应用运行时由一个 Linux amd64 自定义镜像提供 `web`、Fastify API 和私有 Open-WebSearch daemon。
- LPK 内容目录只保留说明文件，运行时镜像使用 Docker Hub `c1own123/lazycat` 的版本化 tag。
- 镜像已推送 Docker Hub，并通过 `lzc-cli appstore copy-image --arch amd64` 复制到懒猫官方 registry；返回地址已写入 `lzc-manifest.yml`。

## 验收矩阵

| 场景 | 预期 |
|---|---|
| 未做 OIDC 的本地登录 | 返回账号或密码错误，不创建会话 |
| 首次 OIDC 登录 | 创建本地账户，默认密码可用，当前会话标记为 OIDC |
| 本地登录 | 建立会话，`/api/auth/me` 返回 `loginMethod=local` |
| Settings 改密 | OIDC 会话无需旧密码；本地会话必须验证旧密码；改密成功清除当前会话并回到登录页；新密码可登录 |
| 账号名冲突 | OIDC 回调失败并保留原账户 |
| LPK 内容 | 不包含源码、`node_modules`、`.next` 或 SQLite 数据库 |
| 镜像发布 | Docker Hub tag 可拉取，官方 registry 地址写回清单，LPK lint 通过 |

## 未受影响模块

搜索、正文 SSRF 校验、MCP Token 语义、引擎配置、缓存和审计字段保持原行为。
