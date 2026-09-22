# DEC-20260827-001：喵喵搜索的新包身份与运行时命名

## 状态

已确认实施。

## 决定

- LPK 包 ID 使用 `cloud.lazycat.app.miaomiao-search`，显示名使用“喵喵搜索”，英文显示名使用“Miaomiao Search”。
- 应用 subdomain 使用 `miaomiao-search`；镜像 tag 使用 `miaomiao-search-<version>-amd64`。
- 运行时目录、数据目录、MCP server 名称、会话 Cookie 和前端事件名同步使用 `miaomiao-search`，避免新应用继续暴露旧身份。
- GitHub 仓库地址和 Docker Hub 仓库名不改动，保证源码来源与已有镜像仓库连续。

## 影响

包 ID、subdomain、Cookie 和数据目录均属于应用身份的一部分。发布后懒猫平台会按新包建立实例；旧包数据不在本轮迁移范围内。
