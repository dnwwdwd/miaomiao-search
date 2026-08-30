# PROG-REQ-20260828-001：Bing 与正文读取容错

## 状态

已实现，等待真实设备和懒猫 TUN 环境验证。

## 已完成

- Bing 切换到 `www.bing.com/search`，手动安全跟随 `www`/`cn` 站内 302，保存 Cookie，并在 request 模式绕过显式代理。
- Open-WebSearch 正文返回抓取方式、提取方式和 Readability 状态；补充 JSON-LD、`__NEXT_DATA__`、`articleBody` 和 `data-article-body` 候选。
- daemon 对无正文响应 422 `content_not_extracted`；Fastify 统一映射为 `CONTENT_NOT_EXTRACTED`。
- Web 与 MCP 共用 `SearchService.fetchContent`，审计失败状态保持一致。
- 门户正文弹窗识别 `CONTENT_NOT_EXTRACTED`，显示“页面已访问，但未识别到可读正文”，提供重试和打开源站。
- 正文缓存键升级为 `multi-strategy-v3`，避免旧策略结果遮蔽新提取器。
- 修复 pnpm patch hunk 计数，`pnpm install` 已能应用 Open-WebSearch 补丁。
- 补齐 JS 正文回退运行时：加入 `playwright-core` 生产依赖，Docker 最终镜像安装 Chromium，LPK 注入浏览器路径，并为 root 容器补充 Chromium sandbox 参数。

## 自动化证据

- `pnpm typecheck` 通过。
- `pnpm test` 通过：门户契约 19 项，服务端 34 项。
- 新增覆盖：正文元数据保留、422 错误映射、Web/MCP 同一错误契约、补丁中的 Bing 主机白名单/Cookie/直连和前端重试状态。
- 新增运行时验证：`pnpm install --frozen-lockfile`、Docker amd64 镜像构建通过；root 容器中的 JS 空壳测试返回 `retrievalMethod=browser-html` 和脚本渲染正文。

## 待验证

1. 使用真实设备网络验证 Bing 不再返回 `engine_error: Request failed with status code 302`，并确认 TUN 客户端是否仍在内核层接管 Bing 流量。
2. 验证日本代理开启时 Bing 的出口和结果地区；若仍为日本，需在懒猫 VPN/TUN 规则中为 `www.bing.com`、`cn.bing.com` 配置 DIRECT。
3. 在懒猫设备用依赖 JavaScript、JSON-LD 和反爬挑战的页面分别验证正文回退；确认无正文页面在 Web 和 MCP 中展示 422 语义，并确认设备镜像中的 Chromium 能启动。

## 风险

- Bing 可能新增其他合法区域主机；遇到新的站内跳转时需要审查后再加入白名单。
- 站点登录墙和验证码不会被绕过，最终仍可能返回 `CONTENT_NOT_EXTRACTED` 或上游拒绝错误。
- Chromium 增加镜像体积和启动资源消耗；当前只对 Linux amd64 完成镜像构建，其他架构需要单独验证。
