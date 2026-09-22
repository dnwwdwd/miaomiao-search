# DEC-20260829-001：JS 正文抓取的 Playwright 运行时

## 决策

为让 `fetchWebContent` 的浏览器回退在 LPK 生产环境真正可用：

1. `packages/server` 将 `playwright-core` 作为生产依赖，供 Open-WebSearch 动态加载 Playwright 客户端。
2. Docker 最终运行镜像安装 Debian Chromium，不下载 Playwright 自带浏览器，减少重复浏览器包；运行时固定使用 `/usr/bin/chromium`。
3. `lzc-manifest.yml` 注入 `PLAYWRIGHT_PACKAGE=playwright-core` 和 `PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium`，API 与 Open-WebSearch daemon 共享配置。
4. 当前 API 容器以 root 启动时，Open-WebSearch 的本地浏览器启动参数自动补充 `--no-sandbox` 与 `--disable-setuid-sandbox`；非 root 运行不强制添加这两个参数。
5. LPK 继续保持轻量，Playwright 客户端随 API 生产依赖进入镜像，Chromium 及其系统库由镜像层提供。

## 原因与边界

此前只实现了浏览器回退代码，没有将 Playwright 客户端和 Chromium 放进生产镜像，因此纯 JS 页面仍会落回 `CONTENT_NOT_EXTRACTED`。本决策补齐代码、npm 依赖、系统浏览器和运行时环境变量四个环节。

浏览器回退只负责执行公开页面的 JavaScript 并读取最终 DOM，不绕过登录墙、验证码、Cloudflare 挑战或用户交互。若浏览器启动失败、页面超时或最终仍没有正文，系统继续保留其他提取策略并返回明确的无正文状态。

## 取舍与恢复

- Chromium 会使最终镜像增加约 700 MB，换取无需依赖懒猫宿主机浏览器。
- 当前发布脚本只构建 Linux amd64；若启用其他架构，需单独验证 Debian Chromium 包和 Playwright 兼容性。
- 如部署环境提供远程浏览器，可改用 `PLAYWRIGHT_CDP_ENDPOINT` 或 `PLAYWRIGHT_WS_ENDPOINT`，并移除本地 Chromium 层；代码依赖仍可保留。

## 验收证据

- `pnpm install --frozen-lockfile` 能应用 Open-WebSearch patch，并将 `playwright-core` 纳入依赖树。
- Docker 镜像构建成功，最终层安装 `/usr/bin/chromium`。
- 在构建出的 root 容器中访问仅有 `Loading...` 初始内容、随后由脚本注入 `<article>` 的测试页面，返回 `retrievalMethod: "browser-html"` 和脚本渲染后的正文。
