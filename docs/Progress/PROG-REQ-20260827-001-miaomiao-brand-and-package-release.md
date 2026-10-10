# PROG-REQ-20260827-001：喵喵搜索品牌、包标识符与发布包更新

## 当前阶段

`0.1.1` 镜像已发布、LPK 已构建并通过校验；真实懒猫设备安装回归待部署环境执行。

## 已完成

- [x] 更新 `package.yml` 顶层名称、四个 locale 名称和包 ID。
- [x] 更新门户顶部菜单、登录页、页面 metadata、历史原型、文档和示例。
- [x] 统一运行时 slug、MCP server 名称、Cookie、数据目录、Dockerfile 路径和构建脚本输出。
- [x] 保留 GitHub 仓库 URL 与 Docker Hub 仓库名，避免改变源码来源和仓库归属。

## 待完成

- [x] 构建并推送 `docker.io/c1own123/lazycat:miaomiao-search-0.1.0-amd64`（digest `sha256:065a27414cceab75237d28f872256449e657f9eae1f0751af9cec77326462c8e`）。
- [x] 复制镜像到懒猫官方 registry `registry.lazycat.cloud/u30387910/c1own123/lazycat:a3bea6e9c8a0614c`，并写入 `lzc-manifest.yml`。
- [x] 构建 `release/miaomiao-search-0.1.0.lpk`，执行项目与 LPK lint。
- [x] LPK 信息核对通过：包 ID `cloud.lazycat.app.miaomiao-search`、版本 `0.1.0`、未嵌入镜像；web/API 容器健康探针均通过。
- [x] 构建并推送 `docker.io/c1own123/lazycat:miaomiao-search-0.1.1-amd64`（digest `sha256:6d7848eabdab831faa100ac946770b1a3769262ca297643b93b09e1fe75505fe`）。
- [x] 复制镜像到懒猫官方 registry `registry.lazycat.cloud/u30387910/c1own123/lazycat:ea3fb3085d670d4e`，并更新 `lzc-manifest.yml`。
- [x] 构建并校验 `release/miaomiao-search-0.1.1.lpk`；包内 web/API 均引用新镜像并注入 Playwright 配置。
- [x] 2026-09-13 重新打包 `0.1.3`：镜像 `docker.io/c1own123/lazycat:miaomiao-search-0.1.3-amd64`（digest `sha256:ff756f8d962c2e476a697a11f824d1fc65523a5e8020aaae39e7281473efa2a3`）已推送 Docker Hub。
- [x] 复制到懒猫官方 registry `registry.lazycat.cloud/u30387910/c1own123/lazycat:e7c7298f4c759b30`，并更新 `lzc-manifest.yml`。
- [x] 构建并校验 `release/miaomiao-search-0.1.3.lpk`（152,064 bytes，SHA-256 `00d658a12e4d312df2684a2be2f89813c2a2702dfbc82a715094a1efbd84c9c2`）；项目与 LPK lint 均通过。

## 2026-09-26 重新打包

- [x] 构建并推送 `docker.io/c1own123/lazycat:miaomiao-search-0.1.3-amd64`（digest `sha256:7519499f4d0973f539823accaec363cb243f4cbd87c3b9903b499ad19dc69741`）。
- [x] 复制到懒猫官方 registry `registry.lazycat.cloud/u30387910/c1own123/lazycat:0da1d1c5dbddc16c`，并更新 `lzc-manifest.yml`。
- [x] 重新生成 `release/miaomiao-search-0.1.3.lpk`（1,214,976 bytes，SHA-256 `dc3fad589738dd542975e808e516e38272d223e617415097ecaea9a04e32e5e2`）；`lzc-cli project lint` 与 `lzc-cli lpk lint` 均通过。

## 2026-09-28 重新打包

- [x] 构建并推送 `docker.io/c1own123/lazycat:miaomiao-search-0.1.3-amd64`（digest `sha256:16fb5bbd551c525c176ea483ccf87719a670c724e167f33dc7912d9f71588fdd`）。
- [x] 复制到懒猫官方 registry `registry.lazycat.cloud/u30387910/c1own123/lazycat:0338ebb0dd589a1d`，并更新 `lzc-manifest.yml`。
- [x] 重新生成 `release/miaomiao-search-0.1.3.lpk`（1,214,976 bytes，SHA-256 `a4d958794a439c31b0d5c2e666b2142375b166f3cdf445c93465fbf349905b5a`）；`lzc-cli project lint` 与 `lzc-cli lpk lint` 均通过。

## 2026-09-28 再次重新打包

- [x] 基于当前源码构建并推送 `docker.io/c1own123/lazycat:miaomiao-search-0.1.3-amd64`（digest `sha256:e3ba9dedc550b1558c0db76088a346f56da1afd55db41c539119f989c250cf4b`）。
- [x] 复制到懒猫官方 registry `registry.lazycat.cloud/u30387910/c1own123/lazycat:0405d931400c998c`，并更新 `lzc-manifest.yml`。
- [x] `lzc-cli project lint` 与 `lzc-cli lpk lint` 均通过；重新生成 `release/miaomiao-search-0.1.3.lpk`（1,214,976 bytes，SHA-256 `3ba4023e333f051a5231f082a7de37b13e6a45e5e75fbbf8b579e5c000d7639a`）。
