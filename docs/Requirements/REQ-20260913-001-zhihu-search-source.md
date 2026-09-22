# REQ-20260913-001 知乎搜索源与正文读取实验

## 状态

待验证，已完成本地实现与注入式单测；真实网络和设备回归待执行。

## 背景与目标

知乎没有在本项目中接入官方搜索 API 或 Token。用户希望用已有搜索引擎支持的 `site:zhuanlan.zhihu.com 关键词` 做低成本 POC，并在结果点击后读取知乎专栏原文。知乎结果需要和 B 站一样有独立的来源展示逻辑；正文读取失败时沿用现有错误组件、重试和打开源站入口。

## 范围

- 新增 `zhihu` 引擎 ID、服务端/前端目录、引擎 Tag 和管理 API 返回信息。
- 新增独立 `ZhihuProvider`：先通过 Open-WebSearch 的 Bing request 模式搜索站内查询，无有效知乎结果时回退 Baidu；仅接受精确主机 `zhuanlan.zhihu.com`，结果统一标记为 `zhihu`。
- Provider 上限为 20 条；不新增凭据、Token、数据库表或迁移。
- 知乎正文继续调用通用 `POST /api/fetch-content`，使用现有 HTTP(S) 校验、重定向/响应大小边界、Readability/结构化提取和浏览器回退。
- 前端正文阅读器对知乎显示“知乎文章”标题、知乎 Tag 和“打开知乎”按钮；正文中的 HTTP(S)（含中文字符）链接在新窗口打开。
- 搜索、正文、MCP、历史快照和审计沿用既有服务与数据契约。

## 非目标

- 不调用知乎官方 CLI、开放 API 或保存 Cookie/Token。
- 不绕过验证码、登录墙或知乎反爬；不把搜索引擎的转载/站外结果伪装成知乎结果。
- 不新增知乎专用 MCP fetch Tool，本轮由通用 `fetchWebContent` 读取。
- 不默认启用该来源，避免新用户在未验证外部质量前增加请求量。

## 数据流

1. 用户在引擎管理启用知乎，或在首页/MCP 显式选择 `zhihu`。
2. `SearchService` 将请求交给 `ZhihuProvider`，Provider 构造 `site:zhuanlan.zhihu.com ${query}`。
3. Provider 请求 Bing（`searchMode=request`）；过滤精确主机结果。过滤后为空时请求 Baidu；两者都无匹配时返回空结果，两者都失败时返回稳定失败码。
4. 结果返回 `engines: ["zhihu"]`、知乎 favicon 和原始 HTTP(S) URL。缓存键包含 Provider 版本。
5. 用户点击结果后，门户调用通用正文读取接口；成功显示纯文本链接，失败显示 `ErrorDisclosure`、重试和打开源站。

## 验收矩阵

| 场景 | 预期行为 | 状态 |
|---|---|---|
| 构造查询 | 请求包含 `site:zhuanlan.zhihu.com`，Bing 使用 request 模式 | 已实现/单测通过 |
| 域名过滤 | 丢弃 `www.zhihu.com`、其他站点和无效 URL | 已实现/单测通过 |
| Bing 有知乎结果 | 不请求 Baidu，最多返回 20 条并标记 `zhihu` | 已实现/单测通过 |
| Bing 无知乎结果 | 请求 Baidu 并使用其知乎结果 | 已实现/单测通过 |
| 两个引擎无匹配 | 返回空结果，不制造伪结果 | 已实现/单测通过 |
| 两个引擎失败 | 返回稳定 `ZHIHU_SEARCH_UNAVAILABLE` 或上游 DomainError | 已实现/单测通过 |
| 正文可读 | 复用通用正文阅读器，知乎 Tag 和新窗口源站按钮可见 | 已实现，待浏览器回归 |
| 正文 403/挑战页 | 显示错误组件、重试和打开源站，不泄露 Cookie | 已有链路，在线回归受外部环境限制 |
| MCP | `zhihu` 随当前用户启用状态进入动态 `search` 枚举 | 已接入，待 MCP 客户端回归 |

## 安全与兼容

知乎 URL 仍经过通用 HTTP(S)、无凭据校验；Provider 不接受搜索结果中的非精确知乎专栏主机。正文内容使用 React 文本节点渲染，不执行抓取页面脚本，也不持久化正文、Cookie 或 Token。已有用户的引擎状态和顺序设置不被重置，新用户默认关闭知乎。

## 当前验证边界

在当前出口对 `site:zhuanlan.zhihu.com` 的 Bing POC 返回 0 条精确知乎结果；本地 daemon 的一次真实请求中，Bing 返回非知乎结果，Baidu 返回若干标题为“知乎”的条目，但 URL 是 `baidu.com/link?...` 跳转地址，Provider 按精确主机边界过滤后仍返回 0 条，不把跳转页伪装成知乎原文。DuckDuckGo 请求被 403。直接访问示例知乎专栏页返回 403 challenge，Playwright 回退在当前运行环境因缺少 `libnspr4.so` 未能启动。这些是外部网络/运行时条件，不能作为 Provider 单测失败；需要在包含 Chromium 系统依赖的目标镜像和懒猫设备上复测。
