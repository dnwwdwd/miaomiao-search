# 需求记录：编程导航（codefather）文章搜索与完整正文接入

- 需求 ID：REQ-20261010-002
- 创建日期：2026-10-10
- 状态：已完成
- 责任人：AI Assistant

## 1. 业务背景与目标

为扩充技术社区与编程实战文章的发现与正文阅读能力，将编程导航（`codefather.cn`）的公开搜索与文章正文接口接入到项目中：
1. **多引擎聚合搜索**：接入 `codefather` 作为独立的搜索引擎源，用户可勾选并搜索技术文章、面试题、笔记等。
2. **正文完整读取**：利用其官方免登录接口 `GET https://api.codefather.cn/api/post/get/vo?id={id}` 获取未经截断的高保真 Markdown 正文，支持自动识别 `codefather.cn/post/*` 链接。
3. **MCP 扩展**：向 AI 客户端暴露专用 MCP 工具 `fetchCodefatherArticle`，并在通用 `fetchWebContent` 中原生自动路由。
4. **前端门户呈现**：引擎目录增加“编程导航”，搜索卡片和内容读取页支持一键渲染与阅读。

## 2. 事实边界与技术契约

- **免登录特性**：官方搜索接口 `POST https://api.codefather.cn/api/post/search/page/vo` 与公开文章详情接口 `GET https://api.codefather.cn/api/post/get/vo?id={id}` 均属于公开接口，无需任何 Cookie 或 Session ID。
- **正文格式**：上游直接返回 Markdown 文本，无需经历 HTML 到 Markdown 的有损转换。
- **受限内容容错**：当遇到受限文章（如需要登录的草稿或付费 VIP 专栏）时，上游返回 `40100` 或 `40102`，系统将其明确映射为 `CODEFATHER_LOGIN_REQUIRED` / `CODEFATHER_VIP_REQUIRED`。

## 3. 验收标准与验证结果

| 验证项 | 预期行为 | 状态 |
|---|---|---|
| Provider 搜索 | 输入关键词返回 `SearchResult` 列表，标题去除 HTML 高亮，封面与 URL 格式正确 | 通过（单元测试 + 真实网络请求验证） |
| 正文读取 | 输入 `codefather.cn/post/{id}` 获取完整 Markdown、作者、发布时间和图片 | 通过（单元测试 + 真实网络请求验证） |
| 站点自动识别 | `matchSiteContentUrl` 与 `identifyPlatformContentUrl` 正确匹配链接 | 通过 |
| 类型与构建 | `tsc --noEmit`、`pnpm lint` 与 `pnpm build` 全部通过 | 通过 |
| 既有契约测试 | `node tests/source-contract.test.mjs` 26 个用例全部通过 | 通过 |
