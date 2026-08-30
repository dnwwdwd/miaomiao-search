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
