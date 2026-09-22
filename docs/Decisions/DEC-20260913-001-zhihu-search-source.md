# DEC-20260913-001 知乎搜索源采用站内查询与通用正文链路

## 决策状态

已确认实施，实验性来源默认关闭。

## 决策

知乎搜索采用 `site:zhuanlan.zhihu.com <关键词>`，由现有 Open-WebSearch daemon 的 Bing request 模式承载；Bing 没有过滤出知乎专栏结果时，再请求 Baidu。Fastify 侧新增 `ZhihuProvider` 做查询拼接、精确主机过滤、结果统一标记和回退，不改上游依赖的运行时注册表。

知乎正文不引入新的 Token 或 Cookie 管理，点击结果后复用通用 `fetch-web`/`POST /api/fetch-content`。这条链路已经具备安全 URL 校验、重定向和响应大小限制、多策略提取、Readability、浏览器回退以及 `CONTENT_NOT_EXTRACTED` 错误语义。门户只增加知乎来源的标题、Tag 和打开按钮，失败仍使用统一错误组件。

## 取舍

- 站内查询不依赖知乎官方 API，成本为现有 Bing/Baidu 的公开网页请求；结果质量取决于上游索引和 `site:` 支持。
- Bing 优先保留与项目现有 request-only 安全边界一致；Baidu 只作为无匹配时的回退，避免一次知乎搜索同时扩大外部请求量。
- Provider 默认关闭，与 B 站一致；管理员可以在引擎管理中启用，启用后自动进入 Web/MCP 动态目录。
- 检查父目录 SearXNG 后确认当前版本没有原生 `zhihu.py` 搜索引擎，只有 external bang 将 `!zhihu`/`!zhi` 跳转到知乎站内搜索；因此本实验不伪装成 SearXNG 原生引擎，而是在 Fastify Provider 中组合现有 Bing/Baidu。
- 不把 Open-WebSearch 依赖中未接通的知乎模块直接暴露为 daemon endpoint，避免修改运行时能力、专用 Cookie 处理和部署镜像；通用正文链路已经覆盖静态 HTML、结构化数据和 JS 回退。

## 回退与失败语义

过滤后没有知乎结果属于成功的空结果；Bing 失败但 Baidu 返回知乎结果属于成功回退；两个路径都失败时返回 `ZHIHU_SEARCH_UNAVAILABLE`（若已有明确 DomainError 则保留其码），由现有 SearchService/MCP 错误契约继续向前端或客户端传递。

## 后续变更条件

只有在目标设备上确认站内搜索长期无结果，或通用 `fetch-web` 无法读取公开知乎专栏，才重新评估接入专用浏览器抓取或知乎官方授权能力；任何 Cookie、Token、额度或收费计划均需另建需求和决策记录。
