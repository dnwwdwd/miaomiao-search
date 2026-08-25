# lazycat-search

一个可自托管的多引擎联网搜索与 Remote MCP 服务。项目提供懒猫 OIDC 管理门户、搜索与正文读取 API、独立 MCP Token 鉴权、审计记录和 SQLite 持久化。

当前实现包含 Next.js 管理门户、Fastify 服务端和 LPK V2 打包配置。LPK 多实例通过挂载的空数据库目录初始化，包内不包含数据库或密钥。

## 功能

- 聚合 Bing、Baidu、DuckDuckGo 等搜索源，并记录部分失败信息。
- 读取网页正文，服务端限制协议、域名、DNS 和重定向，避免访问本机或私网地址。
- 管理搜索引擎、缓存、限流、历史记录和审计日志。
- 通过 Streamable HTTP 暴露 MCP Tools；Access Token 只展示一次，持久化层只保存 Hash。
- 懒猫 OIDC 门户支持中文和英文界面；用户必须点击登录按钮发起授权码回调。

## 技术栈

- Next.js 16、React 19、TypeScript、Tailwind CSS v4
- Fastify 5、SQLite、Drizzle ORM
- MCP TypeScript SDK v2
- `open-websearch@2.1.11` 私有 daemon 适配器

## 本地运行

要求：Node.js 20+、pnpm，以及一个运行在私有地址上的 Open-WebSearch daemon。

安装依赖：

```bash
pnpm install
```

设置服务端环境变量。不要将实际密钥提交到仓库：

```bash
export NODE_ENV=development
export DATA_DIR=./.local-data
export APP_INSTANCE_SECRET='请替换为至少 32 个字符的实例密钥'
export APP_ORIGIN='http://127.0.0.1:3000'
export OIDC_CLIENT_ID='请替换为 OIDC Client ID'
export OIDC_CLIENT_SECRET='请替换为 OIDC Client Secret'
export OIDC_ISSUER_URI='https://oidc.example.com/issuer'
export OIDC_AUTH_URI='https://oidc.example.com/authorize'
export OIDC_TOKEN_URI='https://oidc.example.com/token'
export OIDC_USERINFO_URI='https://oidc.example.com/userinfo'
export OPEN_WEBSEARCH_URL=http://127.0.0.1:3210
```

在另一个终端启动服务端：

```bash
pnpm server:dev
```

先启动 Open-WebSearch 本地 daemon。V1 要求使用 `request` 搜索模式；如果本机通过 `127.0.0.1:7890` 出网代理，需同时打开代理，否则搜索请求会等待上游超时并返回空结果：

```powershell
$env:SEARCH_MODE="request"
$env:USE_PROXY="true"
$env:PROXY_URL="http://127.0.0.1:7890"
# Optional: Exa's official Search API requires an API key; keep it in this terminal only.
# $env:EXA_API_KEY="请替换为 Exa API Key"
pnpm --filter @lazycat-search/server exec open-websearch serve --port 3210
```

再启动门户：

```bash
pnpm dev
```

开发环境默认地址：

- 门户：`http://127.0.0.1:3000`
- 服务端：`http://127.0.0.1:3001`
- MCP Endpoint：`http://127.0.0.1:3000/mcp`

开发模式下 Next.js 将 `/api/*` 和 `/mcp` 同源转发到服务端；生产 LPK 由懒猫 `upstreams` 直接转发。通过 `LAZYCAT_SEARCH_SERVER_URL` 可以覆盖开发服务端地址。

## 验证

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 安全说明

- 生产环境必须由懒猫清单注入 OIDC Client 信息、应用域名和实例密钥；实例密钥会派生会话、MCP Token Hash 与设置加密密钥，不能写入仓库。
- 门户不读取 `X-HC-*` 头自动登录；`/mcp` 是唯一网关放行路径，仍严格要求应用生成的 Bearer Token。
- Open-WebSearch daemon 只应运行在私有网络；服务端会拒绝非私有 daemon 地址。
- `.env*`、本地数据库、依赖目录和构建产物均已列入 `.gitignore`。
- 生产部署前应配置 Host、Origin 允许列表，并完成真实搜索源、正文读取和 MCP 客户端回归。

## 文档

文档入口在 [DOCUMENT_MAP.md](DOCUMENT_MAP.md)。产品需求、技术实现、UI 规范、业务流程、需求记录、决策记录和进度记录均可从该文件定位。

## 许可

Apache-2.0。详见 [LICENSE](LICENSE)。
