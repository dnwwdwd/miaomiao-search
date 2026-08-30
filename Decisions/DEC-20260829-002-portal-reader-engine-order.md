# DEC-20260829-002：门户正文阅读器与引擎顺序持久化

## 决策

1. 正文弹窗沿用共享 `Modal`，新增 loading skeleton、结构化错误详情展开、最终 URL 和统一 `EngineTag`；正文字符串仅拆分为文本和 HTTP(S) anchor，anchor 使用 `target="_blank"` 与 `rel="noreferrer"`。
2. 前端通过错误码和常见上游消息映射友好文案，`ErrorDisclosure` 组件统一控制摘要/详情。服务端和 MCP 的错误契约保持不变。
3. 首页与 MCP 顺序分别保存在用户 Settings JSON 的 `search.homeEngineOrder`、`search.mcpEngineOrder`。SearchService 按调用 channel 为省略的引擎请求选择对应顺序；MCP Tool schema 也按 MCP 顺序生成。显式传入顺序不重排。
4. 门户外层在桌面端使用 `md:w-[90%]`，页面根节点移除原有 `max-w-5xl/6xl` 封顶，移动端仍为 `w-full`。

## 取舍

- 使用现有 SettingsService 避免迁移和额外表；缺少新键的旧用户按当前引擎列表推导默认顺序，首次拖拽时写入新键。
- HTML5 拖拽提供鼠标操作，上下移动按钮覆盖键盘和触控替代路径；禁用引擎仍保留在顺序中，重新启用后位置不变。
- 只在门户做本地化，避免改变外部 MCP 客户端依赖的原始错误。

## 兼容性与安全

- 读取顺序时只保留当前引擎 ID，并追加未出现在设置中的可用引擎；不会把未知 ID 交给上游或 MCP schema。
- 正文链接不自动请求、不使用 `dangerouslySetInnerHTML`，保留既有 URL、凭据和最终 URL 校验。
