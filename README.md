# lazycat-search

一个可自托管的多引擎联网搜索与 Remote MCP 服务。项目提供管理员门户、搜索与正文读取 API、MCP Token 鉴权、审计记录和 SQLite 持久化。

当前实现包含 Next.js 管理门户和 Fastify 服务端；Docker 与懒猫微服部署包仍在后续阶段。

## 功能

- 聚合 Bing、Baidu、DuckDuckGo 等搜索源，并记录部分失败信息。
- 读取网页正文，服务端限制协议、域名、DNS 和重定向，避免访问本机或私网地址。
- 管理搜索引擎、缓存、限流、历史记录和审计日志。
- 通过 Streamable HTTP 暴露 MCP Tools；Access Token 只展示一次，持久化层只保存 Hash。
- 管理员门户支持中文和英文界面。

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
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD='请替换为至少 12 个字符的密码'
export JWT_SECRET='请替换为至少 32 个字符的随机字符串'
export TOKEN_HASH_KEY='请替换为至少 32 个字符的随机字符串'
export SETTINGS_ENCRYPTION_KEY='请替换为 32 字节密钥的 Base64 编码'
export OPEN_WEBSEARCH_URL=http://127.0.0.1:3210
```

在另一个终端启动服务端：

```bash
pnpm server:dev
```

再启动门户：

```bash
pnpm dev
```

开发环境默认地址：

- 门户：`http://127.0.0.1:3000`
- 服务端：`http://127.0.0.1:3001`
- MCP Endpoint：`http://127.0.0.1:3000/mcp`

Next.js 会将 `/api/*` 和 `/mcp` 同源转发到服务端。通过 `LAZYCAT_SEARCH_SERVER_URL` 可以覆盖服务端地址。

## 验证

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 安全说明

- 生产环境必须设置管理员密码、JWT 密钥、Token Hash 密钥和设置加密密钥。
- Open-WebSearch daemon 只应运行在私有网络；服务端会拒绝非私有 daemon 地址。
- `.env*`、本地数据库、依赖目录和构建产物均已列入 `.gitignore`。
- 生产部署前应配置 Host、Origin 允许列表，并完成真实搜索源、正文读取和 MCP 客户端回归。

## 文档

文档入口在 [DOCUMENT_MAP.md](DOCUMENT_MAP.md)。产品需求、技术实现、UI 规范、业务流程、需求记录、决策记录和进度记录均可从该文件定位。

## 许可

当前仓库尚未声明开源许可证。GitHub 仓库以私有方式托管。
