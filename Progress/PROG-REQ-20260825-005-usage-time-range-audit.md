# PROG-REQ-20260825-005 调用统计与审计日志增强

## 状态

已完成，代码、自动化测试、质量门禁和浏览器回归均已收口。

## 完成项

- [x] 在 `AuditService` 增加时间范围、Channel、Operation、状态、引擎过滤和服务端分页。
- [x] 返回范围汇总、P95、Web/MCP 分布、趋势、Operation、引擎统计、筛选项和分页日志。
- [x] `GET /api/usage` 增加 Zod 查询参数校验及非法范围错误映射。
- [x] 门户 Usage 页面改为默认最近 7 天，支持预设、自定义日期、服务端筛选和分页。
- [x] 补充 Web/MCP、状态、范围边界、空范围和分页自动化测试。
- [x] 同步 UI Guide、Design、Requirements 与 Decisions 文档。

## 待验证

- [x] 运行 `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm build` 和 `git diff --check`。
- [x] 浏览器验证预设切换、自定义日期控件、MCP/Operation 筛选、分页和当前范围空状态。
- [x] 确认无日志范围显示选定范围，不显示样本或 Top 100 误导文案。

## 影响范围

修改集中在 `AuditService`、Usage 管理 API、门户 API 类型/请求层和 Usage 页面；未修改 SQLite schema、搜索历史、MCP Tool 协议或密钥存储。
