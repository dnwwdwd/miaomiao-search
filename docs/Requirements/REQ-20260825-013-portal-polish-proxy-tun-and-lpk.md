# REQ-20260825-013：门户细节、TUN 代理提示与 LPK 重新打包

## 状态

已完成。按用户确认收口包元数据、MCP Token 表单、DuckDuckGo 启用提示和 OIDC 登录页，并重新生成 LPK；本地自动化、项目检查和 LPK 校验均通过。

## 范围

- `package.yml` 顶层 `name` 使用“喵喵搜索”。
- 新建 Access Token 时，Token 名称输入框初始为空且不设置 placeholder；服务端仍要求用户填写非空名称。
- Access Token 创建成功弹窗把完整 Secret 与复制按钮放在同一行，窄屏允许 Secret 换行但按钮保持可点击。
- 懒猫微服运行依赖 TUN/VPN 接管应用流量，Settings 不再提供网络访问代理卡片；DuckDuckGo 启用只提示用户确认系统代理已开启，不要求填写代理地址或依赖门户开关。
- 登录页按 `baoyu-design` 高保真交互规范重做，保持克制、优雅和响应式；登录页不使用彩色边框。
- 修改后执行前端/服务端检查并重新构建 LPK。

## 数据与安全边界

- 不新增数据库表、迁移或凭据字段。
- 保留既有 `proxy.enabled`、`proxy.url` 持久化字段以兼容旧实例，但 DuckDuckGo 启用流程不再依赖其值，Settings 页面不再展示或编辑代理配置。
- Token Secret 仍只在创建响应和当前弹窗中展示，持久化层只保存 Hash。
- OIDC 回调、MCP Token 鉴权、SSRF/XSS 防护和搜索上游调用边界不变。

## 验收矩阵

| 场景 | 预期 |
|---|---|
| 打开新建 Token 弹窗 | 名称输入框为空，DOM 没有 placeholder 属性值 |
| Token 名称为空提交 | 不创建 Token，显示名称必填错误 |
| Token 创建成功 | Secret 与复制按钮同一行；复制成功/失败均有反馈 |
| DuckDuckGo 启用 | 页面提示确认系统 TUN/VPN 代理已开启，随后调用启用接口；不要求代理 URL |
| Settings 页面 | 不展示网络访问代理卡片、代理地址输入或测试入口 |
| 登录页 | 中英文文案、OIDC 错误提示、按钮跳转和移动端布局可用；登录页无彩色边框 |
| LPK 构建 | `lzc-cli project build` 生成包含最新 web/api 内容的 `.lpk` |
