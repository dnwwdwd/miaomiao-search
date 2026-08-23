# Lazycat Search PRD

> 项目名：lazycat-search 基础项目：Open-WebSearch 文档版本：v0.5 日期：2026-08-22

## 1. 项目背景

Open-WebSearch 已具备多搜索引擎联网搜索、网页正文抓取、MCP Server、CLI、本地 HTTP daemon 等能力，默认不依赖第三方 Search API Key。

当前上游支持 Bing、Baidu、DuckDuckGo、Exa、Brave、CSDN、掘金、Startpage、搜狗等搜索源；MCP 侧暴露 `search`、`fetchWebContent`、`fetchCsdnArticle`、`fetchJuejinArticle`、`fetchGithubReadme`、`fetchLinuxDoArticle` 等工具。

lazycat-search 在 Open-WebSearch 基础上增加 Web 产品层和远程 MCP 服务层，形成一个既能由人直接使用，也能供外部 Agent 调用的自托管联网搜索服务。

### 设计前提

- Self-hosted / 团队内部部署，目标平台为懒猫微服，同时保留通用 Docker 部署。
- V1 单管理员账户；Web 页面需要登录；MCP 通过独立 Access Token 调用；界面提供中文和英文切换。
- 搜索功能本身不接 LLM，使用 Open-WebSearch 的无 Key 搜索 Provider；V1 的 Bing 搜索只使用 HTTP request 模式。
- MCP 以 Streamable HTTP 为主要 Transport；SSE 保留旧客户端兼容，默认关闭。

## 2. 产品目标

两个入口：

1. **Web Search** — 用户通过浏览器进行多引擎联网搜索、查看聚合结果、读取网页正文。
2. **Remote MCP** — 外部 Agent（Claude Code、Codex、Cherry Studio、Cursor 等）通过 Streamable HTTP 调用搜索和正文读取工具。

## 3. 页面与组件

V1 共 6 个页面：Login + 5 个功能页面。管理员登录后可访问全部功能页面。

### 3.1 Login

管理员登录。

| 组件 | 说明 |
| --- | --- |
| 登录表单 | 用户名 + 密码，Enter 提交 |
| 错误提示 | 凭据错误、账户锁定、连续失败限制 |

### 3.2 Search

搜索入口和结果展示，包含正文读取和搜索历史。

| 组件 | 说明 |
| --- | --- |
| 搜索输入框 | 文本输入；Enter 提交；空输入禁止提交；搜索中禁止重复提交；输入为完整 URL 时提示"读取正文" |
| 引擎选择器 | 多选；可选：Bing、Baidu、DuckDuckGo、Exa、Brave、CSDN、Juejin、Startpage、Sogou；已禁用引擎不可选；记住浏览器最近选择；支持"一键恢复默认"。Linux.do 上游标记暂不可用，默认不展示 |
| 搜索数量选择 | 5 / 10 / 20 / 30 / 50，默认 10；后端限制最大值 |
| 高级选项折叠区 | Bing Search Mode（Auto / Request），仅选中 Bing 时显示，默认使用系统配置 |
| 搜索结果列表 | 每条：标题、URL、域名、Description、来源引擎标签；多引擎 URL 去重，同一页面合并来源显示（如 `Bing · DuckDuckGo · Brave`）；操作：打开原网页、读取正文 |
| 部分失败横幅 | 多引擎搜索允许部分成功；显示失败引擎及原因（如 `Brave 搜索失败：429 Too Many Requests`）；单引擎失败不导致整体失败 |
| 空结果 / 错误状态 | 区分：搜索成功但无结果、所有搜索源均失败、网络超时、被搜索引擎限制、代理异常、搜索运行时启动失败 |
| 正文阅读面板 | 点击"读取正文"展开；显示：标题、原始 URL、最终跳转 URL、Content-Type、是否截断、正文内容；操作：复制正文、打开源站。正文最大字符数由服务端设置。失败时区分：URL 不允许访问、DNS 解析到私网、重定向被阻止、TLS 错误、无法提取正文、超时、站点拒绝 |
| 搜索历史 | 保存 Query、搜索引擎、时间、结果数量；默认不保存网页正文 |

### 3.3 MCP

MCP 服务管理和外部 Agent 接入。

| 组件 | 说明 |
| --- | --- |
| 服务状态 | Endpoint URL、Transport 类型（Streamable HTTP / Legacy SSE）、运行状态 |
| Tool 列表 | `search`、`fetchWebContent`、`fetchCsdnArticle`、`fetchJuejinArticle`、`fetchGithubReadme`、`fetchLinuxDoArticle`；每个 Tool 显示关键参数；管理员可单独启停站点专用 fetch Tool |
| Access Token 列表 | 每行：名称、Prefix、Scope、创建时间、过期时间、最近使用时间、今日调用量、状态；操作：创建、禁用、启用、撤销、删除 |
| Token 创建表单 | 字段：名称、过期时间、Scope（search / fetch）、每分钟请求上限、每日请求上限；创建后 Secret 只展示一次，数据库只保存 Hash |
| 客户端配置模板 | WorkBuddy、Cherry Studio、Claude Code、Codex、Generic；每个含 Server Name、Endpoint、Transport、Authorization Header 示例；"复制配置"按钮 |
| 连接测试 | 测试 Endpoint 可访问性、Tool List 可读取、`search` 可执行 |

### 3.4 Engines

搜索引擎管理。

| 组件 | 说明 |
| --- | --- |
| 引擎列表 | 每行：名称、Enabled 开关、是否默认、Search Mode、最近测试时间、状态徽标、延迟、最近错误 |
| 状态枚举 | Healthy / Degraded / Rate Limited / Blocked / Unavailable / Disabled / Unknown |
| 测试搜索 | 固定或自定义关键词；测试不进入搜索历史，计入运行指标 |

### 3.5 Usage

调用统计与审计日志。

| 组件 | 说明 |
| --- | --- |
| 概览指标 | Web / MCP 调用量、成功率、缓存命中率、平均响应时间 |
| 各引擎统计 | 按引擎维度的调用量、成功率 |
| 请求日志表 | 每行：Request ID、channel（web / mcp）、operation、tokenId、engines、latency、cacheHit、resultCount、status、errorCode、createdAt。Query 是否写入长期日志由管理员配置 |

### 3.6 Settings

系统配置。

| 组件 | 说明 |
| --- | --- |
| 代理设置 | 启用开关、Proxy URL、连接测试；含密码时页面只显示脱敏值 |
| 缓存设置 | 搜索缓存：启用开关、TTL、最大缓存数量（Key 包含 query + engines + limit + searchMode）；正文缓存：独立开关和 TTL。MCP 与 Web 共用缓存 |
| 限流设置 | Web 按 IP、MCP 按 Access Token、每引擎独立并发和速率；达到限制后返回明确错误 |
| 搜索参数 | 默认引擎、默认结果数量 |
| 数据管理 | 搜索历史：开关、清空、保留天数；MCP Query 日志开关 |

## 4. 全局布局

| 组件 | 说明 |
| --- | --- |
| 侧边导航栏 | Search、MCP、Engines、Usage、Settings 五个一级入口；当前页面高亮 |
| 顶栏 | 项目名（lazycat-search）、中文/英文切换、管理员标识、登出 |

## 5. MCP 协议

### 5.1 Transport

主要协议：Streamable HTTP，默认 Endpoint `https://example.com/mcp`。

兼容模式：Legacy HTTP + SSE，默认关闭。客户端配置文档优先展示 Streamable HTTP。

### 5.2 Tools

V1 保持 Open-WebSearch Tool 语义：

| Tool | 关键参数 |
| --- | --- |
| `search` | query, limit, engines, searchMode |
| `fetchWebContent` | url, maxChars |
| `fetchCsdnArticle` | url |
| `fetchJuejinArticle` | url |
| `fetchGithubReadme` | url |
| `fetchLinuxDoArticle` | url |

`search` 扩展返回可增加 engines、canonicalUrl、cached、requestId，不能破坏原有调用方。

站点专用 fetch Tool 可由管理员单独启停。

### 5.3 Access Token

默认要求认证。管理员可创建 Token。

创建字段：名称、过期时间、Scope（search / fetch）、每分钟请求上限、每日请求上限。

Token 创建后完整 Secret 只展示一次，数据库只保存 Hash。

Token 列表显示：名称、Prefix、Scope、创建时间、过期时间、最近使用时间、今日调用量、状态。

操作：创建、禁用、启用、撤销、删除。

## 6. 安全

### 6.1 MCP 安全

- `/mcp` 默认要求认证；校验 Origin；CORS 不默认 `*`。
- Token 仅通过 Authorization Header 传输。
- 生产环境必须 HTTPS。

### 6.2 SSRF 防护

`fetchWebContent` 必须拦截：localhost、127.0.0.0/8、RFC1918 私网、link-local、云主机 metadata、IPv6 loopback / ULA / IPv4-mapped、非 HTTP(S) Scheme。

DNS 解析后再次检查目标 IP；每次 Redirect 后重新检查。

### 6.3 XSS

正文渲染必须经过安全转换或转义，前端不执行抓取页面中的 script、iframe、inline event。

## 7. Usage 与审计

每次调用生成 Request ID，记录：channel（web / mcp）、operation、tokenId、engines、latency、cacheHit、resultCount、status、errorCode、createdAt。

Query 是否写入长期日志由管理员配置。
