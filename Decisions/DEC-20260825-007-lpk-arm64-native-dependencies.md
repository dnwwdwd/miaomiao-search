# DEC-20260825-007：LPK 原生依赖与构建目标

## 状态

已确认实施。懒猫设备安装后 API 加载 `better_sqlite3.node` 报 `ERR_DLOPEN_FAILED`；日志对应的设备运行环境为 Linux x86-64，本版本 LPK 以 Linux x86-64 为发布目标。

## 决定

- 按最新发布口径，`package.yml` 不再声明 `unsupported_platforms`；最终包内原生依赖与设备运行环境保持 Linux x86-64 一致。
- `lzc-build.yml` 使用构建主机架构，构建脚本通过 `TARGET_ARCH` 支持显式目标架构；未配置交叉构建环境时拒绝生成不同架构的包。
- `better-sqlite3`、`koffi`、Next standalone 的 sharp/libvips 与 SWC 原生文件均按 Linux x86-64 构建。
- `better-sqlite3` 在 `node:20-bookworm`（glibc 2.36）容器中用 `node-gyp 10.3.1` 编译，部署包内最高 glibc 符号为 `GLIBC_2.34`，避免主机 glibc 2.41 的符号泄漏。
- 运行脚本保留按架构设置 `LD_LIBRARY_PATH` 的逻辑，兼容懒猫 Node 镜像缺少对应运行库的情况。

## 验收边界

- 包内实际加载的 `better_sqlite3.node` 与 sharp 原生文件均为 x86-64；API/Web 容器可使用对应 Node 运行时。
- x86-64 Node 可加载 better-sqlite3、koffi、sharp；API 可启动到上游健康检查阶段，Web standalone 可监听端口。
- 最终 LPK 中 better-sqlite3 的 glibc 版本需求不超过运行镜像提供的 glibc 2.36。
- 重新生成的 LPK 元数据不声明平台黑名单，健康检查字段仍由安装器解析为字符串数组。
