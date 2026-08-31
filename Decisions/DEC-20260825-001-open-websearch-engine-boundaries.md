# DEC-20260825-001：Open-WebSearch 搜索引擎上游边界与错误映射

> Exa 的环境变量方案已被 `DEC-20260831-003` 取代。当前 Exa 由 Fastify Provider 读取每用户加密设置并调用官方 Search API；本记录中的 Exa 历史验证仅用于说明原问题。

## 状态

已实施，适用于固定版本 `open-websearch@2.1.11` 的本地补丁。

## 背景

2026-08-25 本地真实请求发现：Brave 页面已经移除旧的 `#results` 容器；Exa 的无密钥网页接口返回 HTTP 500；Startpage 返回带 `anubis_version` 的反爬中间页；DuckDuckGo 和部分海外源在未启用本机代理时连接超时。

## 决策

1. 通过 pnpm patch 固化 Brave 当前 SSR DOM 的 `.snippet` 解析选择器。
2. Exa 的历史环境变量方案已废弃；当前由 Fastify Provider 从用户加密设置读取 Key 并调用官方 Search API。旧网页接口失败映射仅作为历史问题记录。
3. Startpage 识别 Anubis 反爬页面并返回明确错误；不实现验证码或反爬绕过。
4. DuckDuckGo、Brave 的无代理超时以及 Startpage/Sogou 的上游限流或反爬不归因于门户搜索聚合逻辑；本地通过代理时再做 daemon 验证。

## 安全边界

Exa Key 由当前用户 SettingsService 加密保存，不写入日志、响应或仓库。Open-WebSearch daemon 仍只能绑定私有地址，正文抓取和搜索结果 URL 的既有安全校验不变。

## 验证

代理 daemon 的 `OpenAI`、每引擎 `limit=3` 请求中，Bing、Baidu、DuckDuckGo、Brave、CSDN、Juejin 返回 3 条；旧 Exa daemon 路径返回明确的 `engine_error`；Startpage 返回明确的反爬错误。当前 Exa Provider 的凭据和 MCP 路径由 `DEC-20260831-003` 及其测试覆盖。
