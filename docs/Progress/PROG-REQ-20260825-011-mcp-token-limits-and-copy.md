# PROG-REQ-20260825-011：MCP Token 限额选项与复制

## 当前阶段

已完成，等待懒猫设备上的真实 OIDC 页面回归。

## 已完成

- MCP 新建 Token 表单增加每分钟限流和每日调用上限的“无限制”开关。
- 手动输入改为字符串状态，创建前校验整数范围并避免空值被转换成 `0`。
- 无限限制额通过既有 API 的 `null` 语义写入；门户列表保留 `null` 并显示“无限制”。
- Secret 创建弹窗增加独立的一键复制按钮，复制失败时保留弹窗并提示权限问题。
- 同步 MCP UI 规范、需求台账和本进度记录。
- 已完成 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 和 LPK 重新打包验证。

## 未受影响模块

- SQLite schema、Token Hash、MCP Transport、认证、审计记录和服务端限流判断保持不变。

## 待验证

- 在懒猫设备安装新包后，使用真实 OIDC 会话完成 MCP 页面表单与剪贴板浏览器交互回归。
