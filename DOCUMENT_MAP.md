# 文档地图

本表是文档职责到仓库实际路径的唯一索引，只用于导航。它不记录产品或技术结论，也不改变 `AGENTS.md` 定义的优先级。

## 实际路径

| 职责 | 实际路径 | 说明与更新时机 |
|---|---|---|
| 项目协作契约 | `AGENTS.md` | 协作、验证或提交规则变化时更新。 |
| 文档地图 | `DOCUMENT_MAP.md` | 新建、移动或替换事实文档时更新。 |
| 产品需求与产品设计 | `懒猫搜索 PRD.md` | 产品范围、页面、用户流程或验收变化时更新。 |
| 技术规格 | `Lazycat Search 技术实现文档.md` | 架构、接口、数据、兼容性或部署方案变化时更新。 |
| UI 规范 | `docs/UI_GUIDE.md` | UI、交互、状态或响应式规则变化时更新。 |
| 前端设计说明 | `docs/DESIGN.md` | Next.js 门户的视觉 token、组件和响应式规则变化时更新。 |
| 业务流程 | `docs/SEARCH_AND_MCP_BUSINESS_FLOW.md` | Web 搜索、MCP、权限或数据流变化时更新。 |
| 项目进度 | `docs/PROGRESS.md` | 总体阶段、里程碑或主要风险变化时更新。 |
| Bug 台账 | `docs/BUG_TRACKER.md` | 发现、修复或验证 Bug 时更新。 |
| 需求台账 | `Requirements/LEDGER.md` | 每个非 Bug 需求创建、变更或完成时更新。 |
| 详细需求记录 | `Requirements/REQ-*.md` | 跨模块、复杂或长期需求的范围、方案和验收变化时更新。 |
| 决策台账 | `Decisions/LEDGER.md` | 重大方案提出、确认、调整或归档时更新。 |
| 决策记录 | `Decisions/DEC-*.md` | 数据、架构、API、安全、外部依赖或难以回退的方案变化时更新。 |
| 功能进度台账 | `Progress/LEDGER.md` | 大任务创建或阶段状态变化时更新。 |
| 功能进度记录 | `Progress/PROG-*.md` | 大任务的计划、证据、风险、阻塞或完成结果变化时更新。 |

## 当前事实边界

- 当前仓库包含产品需求、技术设计、静态交互原型、Next.js 门户与 `packages/server` Fastify 服务；已有 pnpm workspace、SQLite 迁移、服务端测试、ESLint、TypeScript 和生产构建配置。Docker 与懒猫微服产物尚未实现。
- `lazycat_search_portal.html` 是历史静态交互原型；Next.js 门户已通过同源 `/api/*` 与 `/mcp` 路径接入本地 Fastify 服务，页面外观以该原型为参照。
- 2026-08-23 读取的外部引用任务 `019fc202-22de-77e1-b91a-daf1a50a51ef` 指向 `jobclaw`，与本仓库不一致；其中技术栈结论不作为 lazycat-search 的事实来源。
