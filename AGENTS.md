---
id: "notus_8255540ce95520a795c0406c"
created_by: notus_agent
---

# miaomiao-search 协作规范

本文件规定本仓库内的协作、变更和交付规则。产品、技术、UI、流程和进度事实以 `DOCUMENT_MAP.md` 指向的文档为准；本文件只说明工作方式和阅读入口，不重复记录实现细节。

## 工作原则

- 以当前用户明确确认的目标、范围和验收要求为最高优先级。
- 只改当前任务涉及的内容，保留无关的用户改动；不做未经确认的功能扩展或无关重构。
- 文档、代码和测试不一致时，先记录差异并说明影响。涉及产品范围、数据语义、权限、安全、兼容性或成本的差异，必须等用户确认后再定案。
- 回复使用清楚、平实的中文。不要使用含义模糊的行业套话。

## 本地启动方式

本项目本地运行需要同时启动三个进程，启动顺序为 Open-WebSearch daemon → Fastify API → Next.js 门户：

| 服务 | 默认地址 | 启动命令 |
|---|---|---|
| Open-WebSearch daemon | `http://127.0.0.1:3210` | `pnpm --filter @miaomiao-search/server exec open-websearch serve --port 3210` |
| Fastify API / MCP | `http://127.0.0.1:3001` | `pnpm server:dev` |
| Next.js 门户 | `http://127.0.0.1:3000` | `pnpm dev` |

要求 Node.js 20+、pnpm，以及可用的 Open-WebSearch daemon。Windows PowerShell 可按下面的顺序在三个终端启动。环境变量只放在当前终端进程中，不要把真实密钥写入仓库：

```powershell
# 终端 1：启动 Open-WebSearch
$env:SEARCH_MODE = "request"
# 如果需要通过本机代理访问外网，再打开下面两项
# $env:USE_PROXY = "true"
# $env:PROXY_URL = "http://127.0.0.1:7890"
# Exa API Key 在门户“引擎管理”按用户保存，不再通过 daemon 环境变量配置
pnpm --filter @miaomiao-search/server exec open-websearch serve --port 3210
```

```powershell
# 终端 2：启动 Fastify API 和 MCP
$env:NODE_ENV = "development"
$env:DATA_DIR = ".\.local-data"
$env:APP_ORIGIN = "http://127.0.0.1:3000"
$env:APP_INSTANCE_SECRET = "请替换为至少 32 个字符的实例密钥"
$env:OIDC_CLIENT_ID = "请替换为懒猫 OIDC Client ID"
$env:OIDC_CLIENT_SECRET = "请替换为懒猫 OIDC Client Secret"
$env:OIDC_ISSUER_URI = "请替换为懒猫 OIDC Issuer URI"
$env:OIDC_AUTH_URI = "请替换为懒猫 OIDC Authorization URI"
$env:OIDC_TOKEN_URI = "请替换为懒猫 OIDC Token URI"
$env:OIDC_USERINFO_URI = "请替换为懒猫 OIDC UserInfo URI"
$env:OPEN_WEBSEARCH_URL = "http://127.0.0.1:3210"
pnpm server:dev
```

```powershell
# 终端 3：启动 Next.js 门户
pnpm dev
```

启动后访问 `http://127.0.0.1:3000/`。可用以下命令验证三个服务：

```powershell
Invoke-WebRequest http://127.0.0.1:3210 -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:3001/health -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:3000/ -UseBasicParsing
```

`/health` 会检查上游 daemon；如果 API 启动时报 `UPSTREAM_UNAVAILABLE`，先确认 `3210` 已启动。应用认证通过用户点击登录页按钮发起 OIDC 授权，不使用 `X-HC-*` Header 自动登录；`.local-data` 只作为当前开发实例的数据目录，启动和重启不会清空其中的数据。停止服务时分别在三个终端按 `Ctrl+C`，不要强制结束不确定归属的进程。

## 开始任务前的阅读顺序

1. 根目录 `AGENTS.md` 与当前用户要求。
2. 根目录 `DOCUMENT_MAP.md`，再按任务范围阅读对应的 PRD、技术规格、UI 规范、业务流程、需求、决策和进度记录。
3. 受影响的源码、测试、配置、迁移和构建脚本。

常用入口如下：

| 场景 | 优先阅读 |
|---|---|
| 前端页面或交互 | `app/`、`src/components/portal/`、`src/components/ui/`、`src/lib/mock-data.ts`、`docs/UI_GUIDE.md`、`docs/DESIGN.md` |
| 搜索或正文能力 | 技术规格、业务流程、对应路由或服务、共享类型、SSRF 防护代码 |
| MCP、Token 或鉴权 | 技术规格、业务流程、MCP Server、目标 Tool、鉴权中间件与共享类型 |
| 数据库或迁移 | 唯一 schema 来源、迁移、所有读写入口和关联需求/决策记录 |
| 部署或懒猫微服 | 技术规格、Docker 文件、运行脚本和懒猫微服配置 |

## 需求、决策与进度记录

- Bug 记录在 `docs/BUG_TRACKER.md`；功能、功能调整和体验调整记录在 `docs/Requirements/LEDGER.md`。
- 涉及检索、MCP、认证、缓存、持久化数据、多个运行时或部署平台的非 Bug 需求，必须建立详细需求记录。记录写清写入入口、读取方、刷新或恢复方式、失败与安全边界、未受影响模块和行为验收矩阵。
- 新增或修改持久化数据、数据库 schema、迁移、公开 API、权限、安全策略、外部依赖或难以撤回的实现方案，先在 `docs/Decisions/` 写出方案并取得用户确认。确认前不得把它实现为既定行为。
- 多阶段或跨模块任务在 `docs/Progress/` 建立功能进度记录，并同步更新需求台账和功能进度台账。
- 变更事实后同步更新相应文档；如某份相关文档无需更新，在需求记录或交付说明中写明理由。

## LPK 打包与镜像发布（强制流程）

- 用户要求“打包 LPK”时，必须完整执行镜像发布链路：先运行 `sh lzc/build-image.sh`，构建当前源码对应的 Docker 镜像、推送到 Docker Hub，并通过 `lzc-cli appstore copy-image` 复制到懒猫官方镜像仓库。
- 只有镜像推送和官方仓库复制都成功、且 `lzc-manifest.yml` 已更新为官方仓库镜像后，才允许运行 `lzc-cli project release -o release/<package>-<version>.lpk` 生成 LPK。
- 不得只运行 `lzc-cli project build/release` 就交付 LPK；镜像构建、推送或 `copy-image` 任一步失败时必须停止后续打包并向用户报告失败原因。
- LPK 交付前运行 `lzc-cli project lint`，同时记录 Docker 镜像地址、官方镜像地址、LPK 路径和校验值。除非用户另行要求，打包完成后不自动安装到设备。

## 实现规则

- 改动前阅读实际源码，不按文件名、框架惯例或旧文档推断现有行为。
- 当前门户的页面状态属于 mock 演示。未获得新的用户确认前，不接入真实 API、认证、数据库、搜索请求、正文抓取或 MCP Endpoint，也不把 mock 结果描述成真实服务行为。
- 页面优先复用 `src/components/ui/` 的基础组件和既有设计规范。新增可见文案同时维护中文与英文，并在语言切换后检查页面语义和 HTML `lang` 属性。
- 新增依赖、修改 Next.js 配置或变更架构时，先核对本地安装版本对应的官方文档与现有决策记录。
- 搜索、正文抓取、认证和 MCP 相关改动不得弱化 SSRF、XSS、认证、限流、Token Secret 或密钥保护。真实 Token 只允许展示一次，持久化层只能保存 Hash。
- 不提交密钥、`.env*`、本地数据库、备份、日志、依赖目录或构建产物，除非项目文档明确要求。
