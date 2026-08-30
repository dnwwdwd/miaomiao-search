# DEC-20260826-002：Cloudflare Tunnel 部署下移除 Host 与出站 URL 网络限制

## 状态

已确认实施。用户于 2026-08-26 指定项目通过 Cloudflare Tunnel 转发流量，并要求移除 `allowedHosts` 以及 DNS/SSRF 限制。

## 决定

1. Fastify 不再注册 `Host` Header 和 `Origin` allowlist hook；删除 `ALLOWED_HOSTS`、`ALLOWED_ORIGINS` 配置及 LPK 注入项。Cloudflare Tunnel/反向代理负责入口流量转发，应用不再要求后端收到固定的内部 Host。
2. Next.js 不再设置 `allowedDevOrigins`。开发和 Cloudflare Tunnel 入口均由实际反向代理或浏览器同源策略决定访问路径。
3. 正文读取不再执行域名 DNS 解析、私网/回环/链路本地/metadata IP 检查，也不在重定向时按目标 IP 拦截。保留 URL 解析、HTTP(S) 协议、无凭据、响应体大小、超时和正文长度约束。
4. Open-WebSearch 2.1.11 的运行时补丁移除正文抓取、浏览器回退和重定向路径中的 DNS/私网目标过滤，并改用普通 HTTP(S) Agent；固定搜索引擎自身的站点重定向规则继续保留。
5. `OPEN_WEBSEARCH_URL` 保留 HTTP(S) 协议校验，但不再限制必须是本机或私有 daemon 主机。站点专用 MCP Tool 仍校验各自的功能域名（如 `csdn.net`、`juejin.cn`、`github.com`、`linux.do`）。

## 保留的边界

- OIDC/本地账号会话、MCP Bearer Token Hash、Scope、限流、审计、Cookie、XSS 文本处理、响应体大小和 TLS 配置继续生效。
- Cloudflare Tunnel 只负责网络入口，不提供应用层认证；生产环境仍必须配置 OIDC 或本地账号，并为 MCP 使用独立 Bearer Token。

## 影响与恢复

正文 Tool 可以访问应用运行环境能够连接到的任意 HTTP(S) 地址，包括私网、回环地址和 DNS 解析到这些地址的主机。错误的 URL、非 HTTP(S) Scheme、带凭据 URL、超时、过大响应和上游自身失败仍会被拒绝或映射为错误。

需要恢复原限制时，恢复 `ALLOWED_HOSTS`/`ALLOWED_ORIGINS` hook、`services/security.ts` 校验和 Open-WebSearch 的 URL 安全补丁即可；数据库 schema 不受影响。
