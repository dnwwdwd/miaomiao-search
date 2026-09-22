# DEC-20260831-002：门户浮层、凭据入口与 B 站详情展示

## 状态

已确认实施。关联需求：`docs/Requirements/REQ-20260831-002-portal-dropdown-reader-credentials.md`。

## 决定

- Dropdown 统一通过 React Portal 渲染到 `document.body`，使用按钮 `getBoundingClientRect()` 计算固定定位；这样表格的 `overflow-x-auto` 不会裁剪菜单，菜单仍跟随滚动和窗口变化。
- B站搜索结果沿用公开搜索接口返回的数据，新增可选 `videoMeta` 透传；门户点击 B站结果时展示专用详情弹窗，不调用通用正文抓取。详情弹窗保留封面、统计、作者和打开源站操作。
- 凭据申请入口由引擎目录维护固定官方 URL，经管理 API 返回给门户；前端输入框只在当前会话内切换 `password`/`text` 类型。
- 首页来源选择在客户端阻止移除最后一个来源并发送提示；不改变服务端设置结构或默认引擎语义。

## 安全与兼容

- B站封面继续只接受 HTTPS `*.hdslb.com`；视频元数据来自上游公开结果，不保存额外 Cookie 或用户凭据。
- 凭据 URL 是代码中的静态 allowlist；Secret 仍由 SettingsService 加密保存，API 只返回 `apiKeyConfigured`。
- 既有正文阅读器、历史快照和 MCP 的 SearchResult 兼容字段保持不变，新字段均为可选。
