# DEC-20260823-001：V1 Bing 搜索模式边界

- 状态：已确认待实施
- 关联需求：`docs/Requirements/REQ-20260823-001-v1-implementation-baseline.md`
- 确认日期：2026-08-23

## 已确认决定

V1 的 Bing 搜索只支持 `auto` 和 `request` 两种模式，实际执行路径使用 HTTP request。页面、API 枚举、数据库注释、构建依赖和部署方案均不保留 Playwright 选项。

中英文界面切换属于 V1 范围。新增的页面文字需要同时提供中文和英文。

## 处理范围

- 从 Search 与 Settings 的原型控件中移除 Playwright。
- 将运行时错误文案改为不依赖浏览器实现的“搜索运行时启动失败”。
- 更新 PRD、技术实现文档、UI Guide、需求记录和项目进度。

## 后续条件

日后如需使用浏览器自动化搜索，必须建立新的需求和决策记录，评估容器体积、网络拦截、SSRF 约束、运行资源和端到端测试。

