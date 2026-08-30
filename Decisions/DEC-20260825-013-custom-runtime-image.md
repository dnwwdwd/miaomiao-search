# DEC-20260825-013：自定义运行时镜像与轻量 LPK

## 状态

已实施，等待懒猫设备安装验证。

## 决策

- `web`、Fastify API 和 Open-WebSearch daemon 放入同一个 Linux amd64 自定义镜像，镜像内路径固定为 `/opt/miaomiao-search`。
- 镜像由根目录 `Dockerfile` 多阶段构建：构建阶段生成 Next standalone 和服务端生产依赖，运行阶段只复制必要运行文件与启动脚本。
- LPK 不再复制 `api/node_modules`、`.next` 或源码；`lzc/build-package.sh` 只生成轻量内容目录，服务通过镜像启动。
- 镜像先发布到 `docker.io/c1own123/lazycat:miaomiao-search-<version>-amd64`，再由 `lzc-cli appstore copy-image --arch amd64` 复制到官方 registry。正式 LPK 只能引用官方 registry 地址。

## 兼容边界

- 当前发布架构为 Linux amd64；arm64 继续沿用现有原生依赖决策，待单独构建验证后再开放。
- API 数据仍挂载到 `/lzcapp/var/miaomiao-search/data`，镜像和 LPK 都不携带实例数据库或密钥。

## 关联

- 需求：`REQ-20260825-014`
- 脚本：`Dockerfile`、`lzc/build-image.sh`、`lzc/build-package.sh`
- 发布结果：Docker Hub `docker.io/c1own123/lazycat:miaomiao-search-0.1.0-amd64`（digest `sha256:065a27414cceab75237d28f872256449e657f9eae1f0751af9cec77326462c8e`）；官方 registry `registry.lazycat.cloud/u30387910/c1own123/lazycat:a3bea6e9c8a0614c`。
