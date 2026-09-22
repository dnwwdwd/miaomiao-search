# DEC-20260825-011：TUN/VPN 场景下的 DuckDuckGo 启用边界

## 用户确认

2026-08-25：用户确认懒猫微服的 VPN 使用 TUN 模式，应用流量默认经过代理；产品不要求用户填写代理地址，Settings 不再提供代理卡片，DuckDuckGo 启用时只做 TUN/VPN 提示。

## 决策

1. 保留 DuckDuckGo 的 `requiresProxy` 元数据，用于引擎管理页展示“需要代理”条件。
2. DuckDuckGo 启用不再校验 `proxy.enabled` 或 `proxy.url`；引擎管理页只提示用户确认系统 TUN/VPN 代理已开启，然后继续启用请求。
3. Settings 页面移除代理卡片、代理地址输入和格式测试入口；懒猫微服的 TUN/VPN 流量边界由运行环境负责。
4. 既有 `proxy.enabled`、`proxy.url` 加密存储和 API 字段暂时保留，兼容旧实例和旧客户端；当前产品流程不再依赖它们。
5. 本地开发 daemon 仍可通过 `USE_PROXY` / `PROXY_URL` 访问外网；LPK 运行时不额外注入代理地址，依赖懒猫微服 TUN/VPN 网络。

## 未受影响模块

- Open-WebSearch daemon 的启动方式、`request` 搜索模式、TLS 校验、MCP 鉴权、Token Secret Hash、数据库 schema 和 SSRF 防护保持不变。
