# PROG-REQ-20260829-003：懒猫 Resource MCP 与应用间委托调用

## 目标与状态

- 目标：导出喵喵搜索 MCP provider，并支持小龙猫、Codex 等 Agent 通过 `.lzcx` 以当前懒猫用户身份调用。
- 状态：代码与本地验证已完成；设备上的真实 Resource MCP 发现和应用间回归待执行。
- 关联需求：`docs/Requirements/REQ-20260829-003-lazycat-resource-mcp.md`
- 关联决策：`docs/Decisions/DEC-20260829-003-lazycat-resource-mcp.md`

## 实施记录

- [x] 新增 `mcp-providers/miaomiao-search/mcp.yml`，endpoint 为 `/mcp`。
- [x] 在 `lzc-build.yml` 增加 `mcp-providers` 资源导出。
- [x] 将 `package.yml` 最低系统版本提升到 `1.5.2`。
- [x] 为 `/mcp` 增加可信懒猫应用间委托分支，Bearer Token 路径保持兼容。
- [x] 增加委托来源、UID、审计和用户隔离自动化测试。
- [x] 同步 README、技术实现文档和搜索/MCP 业务流程。
- [ ] 在 `lzcos >= 1.5.2` 设备上验证系统资源发现、`.lzcx` 路由和真实 Agent MCP 调用。

## 验证证据

- 已完成：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`。
- 已完成：`lzc-cli project lint` 与 `lzc-cli lpk lint`（均无警告）；本地 LPK `release/miaomiao-search-0.1.1-resource-mcp.lpk` 构建成功，产物包含 `exports/mcp-providers/miaomiao-search/mcp.yml`（SHA-256：`0b20655c0156c2e68ab64acc0dbd3b7e062f1efd90f49e4d83b07e6b34c8554a`）。
- 设备回归重点：provider 发现、用户票据消费后的 `X-HC-SOURCE` / `X-HC-USER-ID`、不同用户数据隔离、委托 RPM 和搜索/正文 Tool。

## 风险与边界

- 当前本地测试只能模拟 ingress 注入的身份头，不能替代懒猫设备对用户票据和 `.lzcx` DNS/Host 路由的验证。
- 委托调用没有 Access Token 每日额度，部署侧必须确保应用间来源头不会被外部入口透传或伪造。
