# PROG-REQ-20260826-002：Cloudflare Tunnel 网络边界放宽

## 当前阶段

代码与自动化验证已完成；等待 Cloudflare Tunnel/设备实机回归。

## 计划

- [x] 建立 Cloudflare Tunnel 网络边界决策和需求记录。
- [x] 移除 Fastify/Next.js Host、Origin allowlist。
- [x] 移除应用层和 Open-WebSearch 正文 DNS/SSRF 拦截。
- [x] 同步部署、技术、业务流程和安全文档。
- [x] 运行 lint、typecheck、测试、生产构建和补丁安装校验。

## 完成证据

- `packages/server/src/app.ts` 不再注册 Host/Origin 校验 hook，CORS 允许 Tunnel Origin；`next.config.ts` 不再设置 `allowedDevOrigins`。
- `packages/server/src/config.ts` 和 `lzc-manifest.yml` 不再读取或注入 `ALLOWED_HOSTS`、`ALLOWED_ORIGINS`；`OPEN_WEBSEARCH_URL` 仅保留 HTTP(S) 协议检查。
- `packages/server/src/services/search.ts` 不再校验正文目标及最终重定向地址；`open-websearch@2.1.11` 补丁保留协议检查但移除 DNS/IP 过滤并改用普通 Agent。
- 新增测试覆盖任意 Tunnel Host/Origin 和回环正文 URL；`pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 均通过。

## 风险

正文 Tool 将可访问应用网络命名空间内的任意 HTTP(S) 地址，包括私有服务和回环服务。Cloudflare Tunnel 只改变入口路径，不限制出站访问；认证和 MCP Token 必须保持启用。Tunnel 域名回源、真实上游和设备认证仍需部署环境验证。
