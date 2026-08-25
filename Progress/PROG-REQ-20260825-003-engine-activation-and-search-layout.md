# PROG-REQ-20260825-003：搜索引擎启用前置校验与首页结果布局

## 目标

移除 Brave；补齐 API Key/代理前置校验和安全配置弹窗；统一引擎 Tag 与官方图标；用现有设计 token 优化首页筛选和结果信息层级。

## 已完成

- [x] 读取现有 API、数据库、上游边界、UI Guide、设计说明和 `baoyu-design` 方法。
- [x] 用户确认 API Key 加密保存、独立 daemon 重启边界。
- [x] 移除 Brave 运行时引擎、默认数据、迁移入口，并清理历史快照和审计日志中的旧引擎引用。
- [x] 为代理/API Key 引擎增加启用前置校验；API Key 通过弹窗加密保存，并提示独立 daemon 重启边界。
- [x] 统一首页、结果、历史、引擎管理和统计页面的引擎 Tag 与官方 favicon 图标。
- [x] 使用现有设计 token 调整首页筛选网格、结果摘要工具栏、分组结果卡片和响应式层级。

## 验证证据

2026-08-25：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 和 `git diff --check` 均通过。测试包含 7 项源码契约测试、18 项服务端测试，以及旧 Brave 历史/审计数据过滤；lint 仅报告 `.pnpm-patches` 中原有的 5 个未使用变量警告。浏览器预览已验证首页筛选与图标、历史详情结果 Tag、结果整项点击正文阅读器、引擎管理 7/7 和 API Key 配置弹窗。

## 风险与边界

Open-WebSearch daemon 是独立进程，门户保存 API Key 后不能修改已运行 daemon 的环境变量；UI 必须明确提示重启，不把“已保存”描述为“已生效”。
