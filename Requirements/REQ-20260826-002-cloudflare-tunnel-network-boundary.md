# REQ-20260826-002：Cloudflare Tunnel 网络边界放宽

## 状态

已完成实现，待 Cloudflare Tunnel/设备实机验证。

## 用户目标

项目部署在 Cloudflare Tunnel 后，由 Tunnel 将公网请求转发到应用。应用不再因为 Tunnel 使用的公网 Host、内部服务 Host 或出站 URL 的 DNS/IP 类型而拒绝请求。

## 变更范围

- 移除 Fastify `Host`/`Origin` 校验和对应环境变量。
- 移除 Next.js 开发来源限制。
- 移除应用层正文读取的 DNS、私网 IP、回环地址、链路本地地址和重定向 SSRF 校验。
- 移除 Open-WebSearch 正文抓取运行时的同类 DNS/IP/重定向拦截。
- 保留 HTTP(S) URL 格式、无凭据 URL、超时、响应体大小、正文最大字符数、认证、Token、限流和审计。

## 写入与读取入口

- 入口配置：`packages/server/src/config.ts`、`lzc-manifest.yml`。
- Fastify hooks：`packages/server/src/app.ts`。
- 正文服务：`packages/server/src/services/search.ts`、Open-WebSearch 运行时补丁。
- 搜索、MCP 和门户继续读取相同的 SearchService、认证和限流路径。

## 失败与安全边界

- 非 HTTP(S)、格式非法、带 URL 凭据、请求超时、响应过大、正文超过配置上限和上游错误仍失败。
- 任意可达 HTTP(S) 主机均可作为正文读取目标；私网、回环、链路本地、metadata 和 DNS 重绑定不再由本应用拦截。
- Cloudflare Tunnel 不替代 OIDC/本地账号或 MCP Token；外部 MCP 请求仍需 Bearer Token，管理 API 仍需应用会话。

## 验收矩阵

| 场景 | 预期 |
|---|---|
| Cloudflare Tunnel 公网 Host 转发到 API | 不因 Host Header 被 403；请求继续进入认证流程 |
| `Origin` 为 Tunnel 公网域名或其他来源 | 不因 Origin allowlist 被 403；CORS 由通用配置响应 |
| 正文 URL 使用私网/回环 IP | 不再返回 `SSRF_BLOCKED` |
| 域名解析到私网地址 | 不再返回 `SSRF_BLOCKED` 或 `DNS_RESOLUTION_FAILED` |
| 正文重定向到私网/回环地址 | 不再被应用或 Open-WebSearch 的 URL 安全层拦截 |
| 非 HTTP(S) 或带凭据 URL | 继续拒绝 |
| 无效管理会话或 MCP Token | 继续按现有认证规则拒绝 |

## 未受影响模块

数据库 schema、OIDC/本地账号、用户隔离、MCP Token Hash/Scope、搜索引擎配置、缓存、审计、限流、XSS 文本转换和 LPK 数据目录保持原行为。
