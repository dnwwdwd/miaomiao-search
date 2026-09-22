# PROG-REQ-20260825-012：MCP 动态引擎与正文 Tool 可用性

## 当前阶段

已完成，等待懒猫设备上的真实 OIDC、MCP 客户端和公网数据回归。

## 已完成

- MCP Server 创建时从 SQLite 读取启用引擎，动态生成搜索 Tool 的枚举和说明；SearchService 保留运行时二次校验。
- 站点专用正文 Tool 已接入 daemon 的 `/fetch-github-readme`、`/fetch-csdn`、`/fetch-juejin` 和 `/fetch-linuxdo`。
- 上游 HTTP 适配器保留错误 envelope 的 code/message，并补充响应格式、超时和过大响应的稳定错误映射。
- FakeUpstream、专用端点和动态 `tools/list` 测试已补齐。
- DuckDuckGo 图标已保存到 `public/engine-icons/duckduckgo.png`，LPK 构建脚本会复制 `public/`。
- 针对首页 Baidu 可用而 MCP 返回 302 的差异，Open-WebSearch Baidu 适配器已改为无代理手动跟随安全范围内的站内重定向；MCP 与首页继续共用该 daemon 适配器。

## 未受影响模块

- Token Secret Hash、Scope、MCP Transport、SSRF 校验、审计日志和 SQLite schema。

## 验证结果与待办

- `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 均通过；lint 仅保留仓库已有 warning。
- `lzc-cli project lint` 和 `lzc-cli lpk lint release/miaomiao-search-0.1.0.lpk` 均通过。
- 已重新生成 `release/miaomiao-search-0.1.0.lpk`，包内 `web/public/engine-icons/duckduckgo.png` 与源码校验和一致，`api/dist` 包含动态 MCP 和专用 endpoint 代码。
- `pnpm install --frozen-lockfile`、35 项测试和本地 daemon 的 Baidu 查询均通过；LPK 内已核对补丁后的 Baidu 适配器。
- 懒猫设备安装后，使用真实 OIDC 会话、外部 MCP 客户端和实际上游网络完成回归。
