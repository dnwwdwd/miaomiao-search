# PROG-REQ-20260913-001 知乎搜索源与正文读取实验

## 当前状态

本地实现完成，待真实网络、浏览器运行时和懒猫设备验证。

## 已完成

- 新增 `zhihu` EngineId、服务端/前端目录、favicon、Tag 颜色、mock 契约和 20 条 Provider 上限。
- 新增 `ZhihuProvider`，实现 Bing request → Baidu 回退、`site:zhuanlan.zhihu.com` 查询、精确主机过滤、来源归一化和稳定失败码。
- Registry、引擎 bootstrap、管理 API、首页来源选择、MCP 动态引擎枚举和历史快照路径自动覆盖知乎。
- 正文阅读器增加知乎专用标题、来源 Tag 和“打开知乎”按钮；保留错误详情、重试、中文 URL 新窗口打开。
- 新增 Provider 单测并更新引擎数量/目录契约。

## 证据

- `pnpm typecheck`：通过。
- `pnpm lint`、`pnpm test`、`pnpm build`：通过（全量测试最终 25 个门户契约 + 57 个服务端用例通过）。
- `pnpm --filter @miaomiao-search/server exec node --import tsx --test test/providers/zhihu-provider.test.ts`：4 个测试通过。
- 直接运行依赖内置 `test-zhihu.js` 的 Bing POC：0 条精确知乎结果；DuckDuckGo 出口返回 403。
- 启动本地 `open-websearch` daemon 后用 `ZhihuProvider` 实际请求 `websearchmcp`：Bing 返回非知乎结果，Baidu 返回 `baidu.com/link?...` 跳转结果；精确主机过滤后返回 0 条、无伪结果、无失败码。
- 直接请求示例知乎专栏页：403 challenge；当前环境的 Playwright 回退缺少 `libnspr4.so`，未能启动浏览器。

## 待验证

1. 在包含 Chromium 系统依赖的完整镜像启动三进程，启用知乎后验证 Bing/Baidu 搜索分组、缓存和 MCP `tools/list`。
2. 使用公开 `zhuanlan.zhihu.com/p/<数字>` 页面验证通用正文提取；分别记录静态正文、JS 页面、挑战页和无正文错误。
3. 登录门户检查知乎 Tag、中文标题、正文链接新窗口和错误组件；移动端检查弹窗滚动。
4. 真实验证完成后再决定是否将默认状态从关闭改为开启，或增加知乎专用正文 endpoint。

## 风险

知乎可能返回挑战页、登录墙或空壳 HTML；Bing/Baidu 的站内索引也可能变化。当前实现不会绕过这些限制，失败时保留可解释错误和源站入口。

## LPK 发布验证（2026-09-13）

- 版本从 `0.1.2` 升级到 `0.1.3`。
- Docker Hub 镜像：`docker.io/c1own123/lazycat:miaomiao-search-0.1.3-amd64`，digest：`sha256:ff756f8d962c2e476a697a11f824d1fc65523a5e8020aaae39e7281473efa2a3`。
- 懒猫官方镜像：`registry.lazycat.cloud/u30387910/c1own123/lazycat:e7c7298f4c759b30`，已写入 `lzc-manifest.yml` 的 `web` 和 `api` 服务。
- LPK：`release/miaomiao-search-0.1.3.lpk`，152,064 bytes，SHA-256：`00d658a12e4d312df2684a2be2f89813c2a2702dfbc82a715094a1efbd84c9c2`。
- `lzc-cli project lint` 与 `lzc-cli lpk lint release/miaomiao-search-0.1.3.lpk` 均无警告；未自动安装到设备。
