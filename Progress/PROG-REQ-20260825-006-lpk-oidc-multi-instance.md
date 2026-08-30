# PROG-REQ-20260825-006：LPK、OIDC 与数据库挂载基线（历史）

## 当前阶段

多实例实现已由 PROG-REQ-20260826-001 替代；本记录保留此前 LPK 构建和 OIDC 基线证据。

LPK 构建完成，等待懒猫设备安装验证。

## 已完成

+ 确认 LPK V2、空数据库挂载、OIDC 点击授权和 MCP 网关放行边界；多实例方案已由 REQ-20260826-001 替代。
- 建立 API/Web 双服务清单、内部路径代理、私有 daemon 启动策略与 Linux x86-64 构建方案。
- 开始替换旧本地管理员表为 OIDC 建号流程，并新增删除 `admin` 表的迁移；本地账号密码由 REQ-20260825-014 补齐。
- 重写 `run-api.sh`、`run-web.sh`，新增带版本声明的 Open-WebSearch 启动器；API 先检查 `/health` 再监听管理端口，并在退出时清理两个子进程。
- 将服务 deploy 临时目录移到 `.lzc-work`，生产包只保留编译产物、迁移文件和运行依赖。
- 已生成 `release/miaomiao-search-0.1.0.lpk`，包内不含数据库、源码、测试夹具或历史 `lzc-dist` 嵌套目录；原生模块已按 x86-64 校验，`package.yml` 不再声明 `unsupported_platforms`。
- 修复健康检查命令的 YAML 类型解析问题，重新生成 LPK；`web` 与 `api` 的 `healthcheck.test` 均通过安装器格式检查。
- 修复 API 健康检查因 Host 头校验返回 `403`：路由、上游和探针使用服务内部 DNS 名，API 白名单仅保留 `api`，不写死应用 appid 域名或放行回环地址。
- 已重新生成 `release/miaomiao-search-0.1.0.lpk`；包内 `manifest.yml` 已确认使用 `web`/`api` 内部服务名，原生模块仍为 Linux x86-64，`better-sqlite3` 最高依赖 `GLIBC_2.34`。

## 剩余

- 在懒猫设备安装 `release/miaomiao-search-0.1.0.lpk`，验证 OIDC 回调、双服务路由、空数据库初始化和 `/mcp` Token 鉴权。
- 使用真实 OIDC 配置和外部 MCP 客户端完成部署后的端到端回归。
