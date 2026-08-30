# REQ-20260825-009 门户审查与 Usage UI 进度

## 状态

已完成（2026-08-25）。

## 已完成事项

- 阅读 PRD、UI Guide、Design、门户页面、API client、Fastify 路由和设置/审计服务。
- 新增 `docs/PORTAL_REVIEW_20260825.md`，列出逐页持久化矩阵、PRD 差异和可用性分级。
- Usage 审计卡片改为统一横向滚动上下文，滚动条位于卡片底部。
- Usage KPI 改为最多四列的响应式布局。
- DuckDuckGo Tag 改用官方稳定平台图标资源，并保留加载失败 fallback。
- Usage 引擎区标题改为“引擎统计”；审计筛选器、表头、状态和缓存状态统一按语言显示，移除中文模式下混入的 Channel/Operation 等英文占位。
- Usage hero 改为允许范围菜单溢出，修复统计范围下拉被 Card 装饰层裁剪。
- Settings 移除“默认搜索参数” Card 及其仅服务于该 Card 的死代码。
- Open-WebSearch Bing 基址由 `cn.bing.com` 切换为 `www.bing.com`，避免 301 被安全请求选项转化为 `engine_error`。
- 更新 UI Guide、Bug 台账、需求台账和文档地图。

## 未完成 / 后续

- Settings 每引擎速率与正文最大长度控件仍是审查中确认的产品缺口；MCP Token 调用量和删除操作已由 REQ-20260825-010 收口。
- 懒猫设备、OIDC 和外部 MCP 客户端回归仍按阶段 4 执行。

## 验证证据

`pnpm typecheck`、`pnpm lint`、`pnpm test` 和 `pnpm build` 已通过。Lint 仅保留两个既有 warning：bootstrap 未使用的 config 参数和 OIDC 内部跳转的 Next 建议。
