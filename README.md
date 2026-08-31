# 喵喵搜索

一个可自托管的多引擎联网搜索与 Remote MCP 服务。项目提供懒猫 OIDC/本地账号管理门户、搜索与正文读取 API、独立 MCP Token 鉴权、审计记录和 SQLite 持久化。

当前实现包含 Next.js 管理门户、Fastify 服务端和 LPK V2 打包配置。应用以单实例运行，在挂载目录中维护身份库与按懒猫 UID 隔离的用户数据库；包内不包含数据库或密钥。

## 功能

- 聚合 11 个搜索源：Bing、Baidu、DuckDuckGo、Exa、CSDN、Juejin、Sogou、Firecrawl、Tavily、GitHub 和 B站，并记录部分失败信息。
- Firecrawl/Tavily 使用用户加密 API Key；GitHub 支持可选 Token 的公共仓库搜索；B站通过公开接口搜索视频并返回经校验的官方 CDN 封面 URL。四个新增源首次启用时默认关闭。
- 读取网页正文；正文目标允许应用运行环境可达的任意 HTTP(S) 地址，保留 URL 格式、无凭据、超时、响应体大小和正文长度限制。
- 管理搜索引擎、缓存、限流、历史记录和审计日志。
- 通过 Streamable HTTP 暴露 MCP Tools；外部客户端使用 Access Token，懒猫小龙猫、Codex 等应用间 Agent 可通过 Resource MCP 委托访问。
- 登录页支持懒猫 OIDC 和本地账号密码两种方式。首次 OIDC 成功后创建本地账号，默认密码为 `12345678`；Settings 可修改密码并显示当前登录方式。

## 技术栈

- Next.js 16、React 19、TypeScript、Tailwind CSS v4
- Fastify 5、SQLite、Drizzle ORM
- MCP TypeScript SDK v2
- `open-websearch@2.1.11` daemon 适配器

## 本地运行

要求：Node.js 20+、pnpm，以及一个应用可通过 HTTP(S) 访问的 Open-WebSearch daemon。

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

Exa、Firecrawl、Tavily 和 GitHub 的凭据在门户“引擎管理”中按用户保存，服务端只在当前用户数据库中保存加密值；Exa MCP/Web 请求直接读取该设置，不依赖 `EXA_API_KEY` 环境变量。B站不需要 Key，也不读取登录态。B站公开接口可能触发 412，服务端只做一次匿名首页 Cookie 预热和一次重试，不保存 Cookie。不要把这些凭据写入仓库或提交到 `.env`。

在另一个终端启动服务端：

```bash
pnpm server:dev
```

先启动 Open-WebSearch 本地 daemon。V1 要求使用 `request` 搜索模式；如果本机通过 `127.0.0.1:7890` 出网代理，需同时打开代理，否则搜索请求会等待上游超时并返回空结果：

```powershell
$env:SEARCH_MODE="request"
$env:USE_PROXY="true"
$env:PROXY_URL="http://127.0.0.1:7890"
pnpm --filter @miaomiao-search/server exec open-websearch serve --port 3210
```

再启动门户：

```bash
pnpm dev
```

开发环境默认地址：

- 门户：`http://127.0.0.1:3000`
- 服务端：`http://127.0.0.1:3001`
- MCP Endpoint：`http://127.0.0.1:3000/mcp`；LPK 同时导出 `mcp-providers/miaomiao-search` 资源。

开发模式下 Next.js 将 `/api/*` 和 `/mcp` 同源转发到服务端；生产 LPK 由懒猫 `upstreams` 直接转发。通过 `MIAOMIAO_SEARCH_SERVER_URL` 可以覆盖开发服务端地址。

## 验证

```bash
pnpm lint
pnpm typecheck
pnpm --filter @miaomiao-search/server typecheck
pnpm test
pnpm build
```

生成懒猫微服 LPK：

```bash
./lzc/build-image.sh
lzc-cli project release -o release/miaomiao-search-0.1.2.lpk
lzc-cli lpk lint release/miaomiao-search-0.1.2.lpk
```

`lzc/build-image.sh` 将镜像推送到 `docker.io/c1own123/lazycat:miaomiao-search-<version>-amd64`，再调用 `lzc-cli appstore copy-image --arch amd64` 并把官方地址写入 `lzc-manifest.yml`。LPK 内容目录只保留说明文件，web/API/daemon 运行文件来自镜像。当前发布包目标为 Linux x86-64；API 容器启动时会在 Fastify 前启动 Open-WebSearch daemon，并等待 `/health` 就绪。

正文抓取的 JavaScript 回退也由该运行镜像提供：API 生产依赖包含 `playwright-core`，镜像安装 Debian Chromium，运行时使用 `/usr/bin/chromium`。LPK 清单注入 `PLAYWRIGHT_PACKAGE=playwright-core` 和 `PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium`；修改 Dockerfile 或正文提取补丁后，需要重新构建镜像并重新生成 LPK，旧镜像不会自动获得浏览器能力。

## 安全说明

- 生产环境必须由懒猫清单注入 OIDC Client 信息、应用域名和实例密钥；实例密钥会派生会话、MCP Token Hash 与设置加密密钥，不能写入仓库。
- 门户不把 `X-HC-*` 头当作登录凭据；OIDC 回调用 `X-HC-User-ID` 建立身份映射，所有受保护 API 将当前 UID 与应用会话绑定校验。`/mcp` 对外继续要求 Bearer Token，对可信懒猫应用间请求使用 `X-HC-SOURCE=app:<包名>` 和 `X-HC-USER-ID` 委托鉴权。
- Cloudflare Tunnel 或其他反向代理负责公网入口；应用不再校验 Host/Origin allowlist，也不限制 Open-WebSearch 或正文目标必须是私有/公网地址。请确保 Tunnel、网络策略和上游服务本身提供所需的访问控制。
- `.env*`、本地数据库、依赖目录和构建产物均已列入 `.gitignore`。旧 LPK 单库数据不迁移、不读取。
- 外部 MCP 客户端继续在 `Authorization: Bearer <Access Token>` 中提供门户创建的 Token。懒猫应用间调用由 ingress 消费用户票据，并向 `/mcp` 注入 `X-HC-SOURCE=app:<包名>` 与 `X-HC-USER-ID`；该路径按用户读取独立数据，不需要额外 Token。
- 委托 MCP 调用使用当前用户的 MCP RPM 设置，不产生 Token 每日额度记录；审计中的 `token_id` 和 `token_prefix` 保持为空。缺少可信应用来源或 UID 的请求仍会被拒绝。
- 生产部署前应完成真实搜索源、正文读取、MCP 客户端、Resource MCP 发现和 Tunnel 域名回归。

## 文档

文档入口在 [DOCUMENT_MAP.md](DOCUMENT_MAP.md)。产品需求、技术实现、UI 规范、业务流程、需求记录、决策记录和进度记录均可从该文件定位。

## 许可

Apache-2.0。详见 [LICENSE](LICENSE)。
