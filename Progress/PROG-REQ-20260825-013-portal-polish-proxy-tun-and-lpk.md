# PROG-REQ-20260825-013：门户细节、TUN 代理提示与 LPK 重新打包

## 当前阶段

已完成。

## 计划与验收

- [x] 明确用户确认的 TUN/VPN 代理边界并记录决策。
- [x] 完成 package 元数据、MCP Token 和 DuckDuckGo 启用逻辑。
- [x] 完成 baoyu-design 登录页并检查中英文与响应式布局。
- [x] 运行 lint、typecheck、test、build 和 LPK 构建，核对包内容。

## 完成证据

- `package.yml` 顶层 `name` 为“喵喵搜索”。
- 新建 Access Token 的名称状态为空且无 placeholder；创建成功弹窗将 Secret 与复制按钮置于同行，并保留窄屏折行能力。
- DuckDuckGo 启用只提示确认系统 TUN/VPN 代理；Settings 已移除网络访问代理卡片，文案不再要求代理地址。
- 登录页采用克制的浅色双栏布局，响应式降为单栏，登录面板未设置彩色边框。
- `release/miaomiao-search-0.1.0.lpk` 已重新生成，`lzc-cli lpk lint release/miaomiao-search-0.1.0.lpk` 无警告；包内 `package.yml` 名称已核对为“喵喵搜索”。
- `pnpm typecheck`、`pnpm lint`（仅保留既有 warning）、`pnpm test`、`pnpm build` 和 `lzc-cli project lint` 均通过。

## 未受影响模块

SQLite schema、迁移、OIDC 回调、MCP Transport、搜索正文 SSRF 校验和 Token Hash 语义不在本轮范围内。
