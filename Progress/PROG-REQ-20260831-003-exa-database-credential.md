# PROG-REQ-20260831-003：Exa 数据库凭据与 MCP 验证

## 当前状态

代码与自动化测试完成，待 LPK 构建后的设备端回归。

## 已完成

- 新增 `ExaProvider`，从当前用户 `SettingsService` 读取 `engine.exa.apiKey`，直接调用官方 Search API。
- UserStore 创建的 SearchService 注入按用户实例创建的 Provider Registry；MCP `/mcp` 复用同一 SearchService。
- 补充 Exa Provider、加密存储、错误映射和 MCP 数据库凭据测试；旧服务测试改为注入假的 Exa fetch。
- 更新启动说明、技术文档、业务流程、UI Guide 和旧 Exa 环境变量决策的状态说明。

## 验证证据

- `pnpm --filter @miaomiao-search/server test`：53 项通过。
- `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm build`：待本轮最终执行并记录。

## 待验证

- LPK 镜像发布后，在懒猫设备上用两个用户分别保存 Exa Key，确认 MCP 请求不会串用凭据。
