# DEC-20260828-001：Bing 重定向与网页正文多策略提取

## 决策

采用 Open-WebSearch pnpm patch 收口上游行为，Fastify 只负责错误映射与缓存，门户负责把可恢复的正文状态展示给用户。

1. Bing request 入口使用 `https://www.bing.com/search`。手动跟随最多 3 跳，只允许 `www.bing.com` 和 `cn.bing.com`，沿途保存 `Set-Cookie`。Bing HTTP 请求设置 `disableProxy: true`，避免继承懒猫 VPN/HTTP 代理的国家节点。
2. 通用正文保留现有请求、浏览器 Cookie 和浏览器 HTML 回退，HTML 候选依次覆盖语义容器、正文属性、JSON-LD/`__NEXT_DATA__`、Readability、body 文本和 Markdown/纯文本。页面脚本不执行，结构化字段只作为文本候选。
3. Open-WebSearch daemon 对 `No readable content was extracted from this URL` 返回 422 `content_not_extracted`。Fastify 将其映射为 `CONTENT_NOT_EXTRACTED`，Web 和 MCP 共用 `SearchService.fetchContent`，因此错误码、消息和审计状态一致。
4. 前端 `ApiClientError` 保留 HTTP 状态码；正文弹窗针对 `CONTENT_NOT_EXTRACTED` 显示说明、重试和打开源站按钮，网络/权限/超时错误仍显示错误状态。
5. 正文缓存键从 `readability-v2` 升级为 `multi-strategy-v3`。默认搜索缓存 TTL 仍为 3600 秒，默认正文缓存 TTL 仍为 86400 秒，两者可在设置中修改。

## 取舍

- 允许 Bing 站内重定向可以兼容当前入口的区域跳转；主机白名单和跳数限制避免把重定向变成通用代理。
- Bing 直连解决日本 VPN 出口导致的区域结果和部分 302 行为，但如果设备本身的 TUN 路由在内核层接管所有流量，应用层不能覆盖该路由，仍需在 TUN 客户端规则中为 Bing 域名设 DIRECT。
- 结构化数据能覆盖 SPA 首屏 HTML 没有可见正文的页面，但不保证字段内容完整；无法提取时明确返回可恢复错误，不拼接标题冒充正文。
- 不引入新的数据库表或外部正文服务，避免新增密钥、部署和数据持久化边界。

## 安全约束

- 所有最终 URL 仍经过 HTTP(S)、凭据和部署策略校验。
- 重定向目标必须是允许的 Bing 主机；正文提取的链接不自动触发二次请求。
- Readability、浏览器渲染和结构化解析失败时仅回退到下一种提取方式，不吞掉超时、响应过大或安全校验错误。
