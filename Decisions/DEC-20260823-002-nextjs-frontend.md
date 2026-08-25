# DEC-20260823-002：V1 门户迁移到 Next.js

## 状态

已实施。2026-08-23，用户明确要求将 `lazycat_search_portal.html` 的页面与交互迁移为 Next.js JSX，并建立项目内基础组件与各页 mock 数据。

## 背景

在 2026-08-23 决策时，仓库没有应用工程，只有静态 HTML 原型。技术实现文档原先把前端预设为 React + Vite；这不能满足当时要求的 Next.js 工程结构。当前工程已按该决策建立并接入真实服务。

## 决定

- 在仓库根目录建立 Next.js App Router、TypeScript 与 Tailwind CSS v4 前端工程。
- 使用一个受控的客户端门户容器保存演示状态；页面、基础组件和 mock 数据分目录维护。
- 基础组件包含 Button、Card、Input、SearchInput、Tag、Tabs、Switch、Select、Modal、Toast；功能组件按 Search、MCP、Engines、Usage、Settings 分组。
- mock 数据只用于前端交互还原，不写入数据库、不调用 `/api/*` 或 `/mcp`，也不产生真实 Token、认证或搜索请求。
- `lazycat_search_portal.html` 保留为历史原型参照，在 Next.js 页面完成验证前不删除。

## 取舍

官方 Next.js 建议使用 TypeScript、App Router、Tailwind 和 ESLint。本项目还没有既有前端代码，因此采用该组合的迁移成本低，也为后续 API、登录和服务端渲染保留了空间。

替代方案是直接把 HTML 拆为纯 React + Vite 页面。该方案当时改动较小，但与用户已确认的 Next.js 方向不一致，因此不采用。

## 风险与边界

- 所有交互都必须明确为 mock；不能把浏览器内状态描述成真实的管理操作。
- React 默认文本转义用于结果、日志和正文 mock；真实正文接入前仍需按照 PRD 完成安全转换和 SSRF 防护。
- 这次不修改现有数据库、认证、API 或部署方案。它们在后续实施时仍需单独确认。

## 验收

- [x] `pnpm dev` 能启动门户，`pnpm lint`、`pnpm typecheck`、`pnpm build` 已通过。
- [x] Login、Search、MCP、Engines、Usage、Settings 已以 JSX 组件呈现，覆盖静态原型已有交互。
- [x] 基础组件与 mock 数据已由多个页面复用。
