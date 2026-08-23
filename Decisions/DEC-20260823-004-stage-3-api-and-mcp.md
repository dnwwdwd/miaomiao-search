# DEC-20260823-004：阶段 3 管理 API、门户接入与 MCP Transport

## 状态

已确认实施。关联需求：`REQ-20260823-001`。用户于 2026-08-23 要求进入下一阶段并完成开发，同时要求本地运行服务。

## 决定

服务端继续使用 Fastify，开发环境将门户与服务端分开监听：Next.js 门户为 `127.0.0.1:3000`，Fastify 为 `127.0.0.1:3001`。门户通过带 Cookie 的管理 API 请求服务端；仅开发环境允许来自门户地址的跨域请求，生产部署在阶段 4 改由同源反向代理承载。

管理员会话使用 HttpOnly、SameSite=Strict Cookie；所有 `/api/*` 管理接口除登录、退出和会话查询外均需要该会话。MCP 使用官方 `@modelcontextprotocol/server` v2 的 Streamable HTTP transport，固定入口为 `/mcp`，在建立 MCP transport 前校验 `Authorization: Bearer` Token。每个无状态 MCP 请求创建独立 MCP server/transport，避免连接和鉴权上下文互相复用；Host Header 仅接受本地开发地址，以减小 DNS 重绑定风险。

六个 MCP Tool 的启停状态写入既有 `setting` KV（`mcp.tools`），不新增数据表；Token 生命周期、引擎状态、使用记录和历史继续使用阶段 2 的既有表。Token 原文只在创建接口的一次响应中返回，后续列表与日志均不返回原文。

## API 边界

- `/api/auth/*`：登录、退出、当前会话。
- `/api/search`、`/api/fetch-content`：管理员搜索与正文读取。
- `/api/engines`：读取和更新引擎配置，测试会记录状态和审计。
- `/api/tokens`、`/api/mcp`：MCP Token、Tool 清单与运行状态。
- `/api/settings`、`/api/usage`、`/api/history`：运行设置、审计统计与搜索历史。

输入由 Zod 验证；领域错误使用统一 JSON 错误格式。API 和 MCP 通过同一个 SearchService，因此缓存、URL/SSRF 校验、Token 额度与审计规则一致。

## 影响与恢复

本决定不修改 SQLite schema，也不改变阶段 2 的上游 daemon 适配接口。需要回退时可停止 Fastify 与门户进程；数据库中的 Token、设置和审计记录保留，不会暴露 Token 原文。

## 实施结果

已实现 `/api/auth`、`/api/search`、`/api/fetch-content`、`/api/engines`、`/api/tokens`、`/api/settings`、`/api/history`、`/api/usage` 与 `/api/mcp`。Fastify 使用可配置的 `SERVER_HOST`、`ALLOWED_HOSTS`、`ALLOWED_ORIGINS`；开发默认值只允许本机地址，生产部署必须配置实际反向代理入口。

上游 daemon 的当前 `status` 响应会报告 `version: "unknown"`，因此开发模式接受该值，同时仍由固定 npm 依赖锁定版本；生产模式拒绝 unknown。实际状态响应中的 `searchMode` 字段已经适配，并继续强制 request 模式与 TLS 验证。
