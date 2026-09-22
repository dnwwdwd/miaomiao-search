# PROG-REQ-20260825-014：本地账号登录与自定义应用镜像

## 当前阶段

代码、镜像发布与 LPK 构建已完成，设备回归待执行。

## 已完成

- [x] 新增 `local_account` 迁移和 scrypt 密码服务。
- [x] OIDC 首次建号、默认密码、本地登录、改密和账户冲突保护。
- [x] 改密成功清除当前应用会话并跳转登录页，覆盖本地和 OIDC 登录方式。
- [x] 登录页双方式切换；Settings 显示账号、登录方式和改密表单。
- [x] 新增认证接口和会话字段；补齐服务端路由与服务测试。
- [x] 修正懒猫账号来源：优先使用 `X-HC-User-ID`，并让已有 OIDC 会话在 `/api/auth/me` 自愈本地账号。
- [x] 退出登录清除应用/OIDC state Cookie，并跳转懒猫 OIDC logout 端点。
- [x] 自定义镜像、轻量 LPK 构建脚本和镜像内运行路径。
- [x] 修正旧源码契约测试和相关中英文文案。

## 本地证据

- `pnpm test` 通过（18 项门户契约测试、29 项服务端测试，含网关 UID 账号解析、旧会话自愈和退出登录）。
- `node --test tests/source-contract.test.mjs` 在修正认证断言后通过。
- `pnpm lint`、`pnpm typecheck` 和 `pnpm build` 均通过；`sh -n` 已检查四个懒猫脚本。
- Docker Hub 镜像 `docker.io/c1own123/lazycat:miaomiao-search-0.1.0-amd64` 已重新推送，digest 为 `sha256:065a27414cceab75237d28f872256449e657f9eae1f0751af9cec77326462c8e`；官方镜像为 `registry.lazycat.cloud/u30387910/c1own123/lazycat:a3bea6e9c8a0614c`。
- `lzc-cli project lint`、`lzc-cli project build`、`lzc-cli lpk lint` 均通过；LPK 为 146 KiB，内容 tar 只有 `README.txt`，没有 `node_modules`、`.next`、源码或数据库。
- 已用 Docker 容器分别启动镜像内 web/API，首页和 `/health` 均返回成功；API daemon 在 Fastify 前正常就绪。

## 待执行

- [x] 使用 `./lzc/build-image.sh` 构建并推送 amd64 镜像。
- [x] 通过 `lzc-cli appstore copy-image --arch amd64` 获取官方 registry 地址并写回清单。
- [x] 执行 `lzc-cli project lint`、`lzc-cli project build`、`lzc-cli lpk lint`，检查 LPK 体积和内容。
- [ ] 在懒猫设备验证首次 OIDC 建号、本地登录、改密、账号显示、路由和 MCP Token。

## 风险

- 真实设备仍需回归确认网关 UID与 OIDC UserInfo 的返回值；实现已优先使用 `X-HC-User-ID`，并保留 UserInfo/ID Token 兼容回退。
