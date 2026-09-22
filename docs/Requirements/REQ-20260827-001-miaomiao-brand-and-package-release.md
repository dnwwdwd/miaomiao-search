# REQ-20260827-001：喵喵搜索品牌、包标识符与发布包更新

## 状态

已完成。镜像已推送 Docker Hub 并复制到懒猫官方 registry，LPK 已构建并通过 lint；真实懒猫设备安装回归仍属于部署环境验证。

## 范围

- 将应用显示名称、所有 locale 名称、门户顶部品牌和登录页品牌统一为“喵喵搜索 / Miaomiao Search”。
- 将 LPK 包标识符更新为 `cloud.lazycat.app.miaomiao-search`。
- 将项目运行时 slug、MCP 示例、会话 Cookie、持久化路径和镜像/LPK 输出名统一为 `miaomiao-search`。
- 重新构建 Linux amd64 自定义镜像，推送 Docker Hub，再通过 `lzc-cli appstore copy-image` 复制到懒猫官方 registry，并将官方镜像写回 `lzc-manifest.yml`。

## 数据与兼容边界

- 包标识符、subdomain、Cookie 名称和 `/lzcapp/var/miaomiao-search` 持久化目录均发生变化，懒猫平台将其视为新的应用身份；旧包实例数据不自动迁移。
- OIDC、MCP Token、SSRF/XSS、防护限流、数据库 schema 和搜索引擎行为保持不变。
- GitHub 源码仓库 URL 和 Docker Hub 仓库 `c1own123/lazycat` 保持不变，仅更新镜像 tag。

## 验收矩阵

| 场景 | 预期 |
|---|---|
| `package.yml` | 顶层 `name` 为“喵喵搜索”，包 ID 为 `cloud.lazycat.app.miaomiao-search`，四个 locale 名称已更新 |
| 门户顶部与登录页 | 中文显示“喵喵搜索”，英文显示“Miaomiao Search” |
| 全文件替换 | 源码、配置、文档、示例和历史原型不再出现旧品牌或旧项目 slug（GitHub 仓库 URL 除外） |
| 镜像发布 | Docker Hub tag `docker.io/c1own123/lazycat:miaomiao-search-0.1.0-amd64` 推送成功，官方 registry 镜像复制成功 |
| LPK | `lzc-cli project lint`、`lzc-cli project build` 和 `lzc-cli lpk lint` 通过，包内元数据和官方镜像地址正确 |
