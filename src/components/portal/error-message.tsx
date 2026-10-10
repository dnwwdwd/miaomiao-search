"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

type ErrorInput = { code?: string; message?: string };

const codeText: Record<string, { zh: string; en: string }> = {
  CONTENT_NOT_EXTRACTED: { zh: "页面已访问，但未识别到可读正文", en: "The page was reached, but no readable content was detected" },
  INVALID_URL: { zh: "链接格式无效", en: "The link format is invalid" },
  URL_SCHEME_NOT_ALLOWED: { zh: "仅支持 HTTP(S) 网页链接", en: "Only HTTP(S) links are supported" },
  URL_CREDENTIALS_NOT_ALLOWED: { zh: "链接不能包含账号或密码", en: "Links cannot contain a username or password" },
  UPSTREAM_UNAVAILABLE: { zh: "搜索引擎暂时无法访问", en: "The search engine is temporarily unavailable" },
  UPSTREAM_REDIRECT: { zh: "搜索引擎返回了异常重定向", en: "The search engine returned an unexpected redirect" },
  UPSTREAM_INVALID_URL: { zh: "搜索引擎返回了无效链接", en: "The search engine returned an invalid link" },
  ALL_ENGINES_FAILED: { zh: "所有已选搜索引擎均未返回结果", en: "All selected search engines failed" },
  ENGINE_REQUIRED: { zh: "请至少选择一个搜索引擎", en: "Select at least one search engine" },
  ENGINE_DISABLED: { zh: "所选搜索引擎已停用", en: "A selected search engine is disabled" },
  PROXY_CONNECT_FAILED: { zh: "代理连接失败", en: "The proxy connection failed" },
  RATE_LIMITED: { zh: "搜索请求过于频繁，请稍后再试", en: "Too many requests; try again later" },
  ENGINE_RATE_LIMIT: { zh: "搜索引擎触发了频率限制", en: "The search engine rate limit was reached" },
  TIMEOUT: { zh: "搜索请求超时", en: "The search request timed out" },
  FETCH_FAILED: { zh: "网页正文读取失败", en: "The page content could not be read" },
  SOURCE_ACCESS_DENIED: { zh: "源站拒绝了当前网络的抓取请求", en: "The source site blocked requests from this network" },
  INTERNAL_ERROR: { zh: "服务暂时不可用", en: "The service is temporarily unavailable" },
  FIRECRAWL_AUTH_FAILED: { zh: "Firecrawl API Key 无效或无权限", en: "The Firecrawl API Key is invalid or unauthorized" },
  FIRECRAWL_QUOTA_EXHAUSTED: { zh: "Firecrawl 额度已用尽", en: "The Firecrawl quota has been exhausted" },
  FIRECRAWL_RATE_LIMITED: { zh: "Firecrawl 请求触发限流", en: "Firecrawl rate limit reached" },
  TAVILY_AUTH_FAILED: { zh: "Tavily API Key 无效或无权限", en: "The Tavily API Key is invalid or unauthorized" },
  TAVILY_QUOTA_EXHAUSTED: { zh: "Tavily 额度已用尽", en: "The Tavily quota has been exhausted" },
  TAVILY_RATE_LIMITED: { zh: "Tavily 请求触发限流", en: "Tavily rate limit reached" },
  GITHUB_AUTH_FAILED: { zh: "GitHub Token 无效或无权限", en: "The GitHub Token is invalid or unauthorized" },
  GITHUB_RATE_LIMITED: { zh: "GitHub 请求触发限流", en: "GitHub rate limit reached" },
  GITHUB_QUERY_INVALID: { zh: "GitHub 查询条件无效", en: "The GitHub query is invalid" },
  BILIBILI_BLOCKED: { zh: "B站公开搜索接口暂时阻断", en: "Bilibili public search is temporarily blocked" },
  BILIBILI_RATE_LIMITED: { zh: "B站请求触发限流", en: "Bilibili rate limit reached" },
  BILIBILI_API_ERROR: { zh: "B站搜索接口返回错误", en: "Bilibili search returned an API error" },
  ZHIHU_RATE_LIMITED: { zh: "知乎搜索次数或请求频率已达上限，请稍后再试", en: "Zhihu search limit reached; try again later" },
  ZHIHU_CLI_UNAVAILABLE: { zh: "知乎官方 CLI 尚未安装", en: "The official Zhihu CLI is not installed" },
  ZHIHU_CLI_FAILED: { zh: "知乎官方 CLI 搜索失败", en: "Official Zhihu CLI search failed" },
  ZHIHU_AUTH_FAILED: { zh: "知乎 Access Secret 无效或无权限", en: "The Zhihu Access Secret is invalid or unauthorized" },
  ZHIHU_QUOTA_EXHAUSTED: { zh: "知乎官方接口额度已用尽", en: "The official Zhihu API quota has been exhausted" },
  XHS_TOKEN_REQUIRED: { zh: "请使用包含 xsec_token 的小红书分享链接", en: "Use a Xiaohongshu share link with xsec_token" },
  XHS_CONTENT_NOT_FOUND: { zh: "小红书页面没有返回帖子内容", en: "The Xiaohongshu page did not return the note" },
  XHS_SHARE_INVALID: { zh: "小红书分享链接无法解析", en: "The Xiaohongshu share link could not be resolved" },
  XHS_PAGE_UNAVAILABLE: { zh: "小红书帖子暂时无法读取", en: "The Xiaohongshu note is temporarily unavailable" },
  FEISHU_OAUTH_REQUIRED: { zh: "请先连接飞书账号", en: "Connect your Feishu account first" },
  FEISHU_OAUTH_EXPIRED: { zh: "飞书授权已失效，请重新连接", en: "Feishu authorization expired. Reconnect your account" },
  FEISHU_PERMISSION_DENIED: { zh: "当前飞书账号无权读取该文档", en: "Your Feishu account cannot read this document" },
  FEISHU_CONTENT_NOT_FOUND: { zh: "飞书文档没有返回可读正文", en: "The Feishu document did not return readable content" },
  FEISHU_BROWSER_UNAVAILABLE: { zh: "飞书公开文档读取器不可用", en: "The Feishu public document reader is unavailable" },
  FEISHU_OAUTH_FAILED: { zh: "飞书授权失败，请检查应用配置", en: "Feishu authorization failed. Check your app settings" },
  FEISHU_OAUTH_DENIED: { zh: "飞书授权未完成", en: "Feishu authorization was not completed" },
  FEISHU_APP_INVALID: { zh: "飞书应用凭据格式无效", en: "The Feishu app credentials are invalid" },
  FEISHU_APP_REQUIRED: { zh: "请先配置飞书应用", en: "Configure your Feishu app first" },
  FEISHU_API_FAILED: { zh: "飞书文档接口请求失败", en: "The Feishu document request failed" },
  FEISHU_SHARE_REDIRECTED: { zh: "飞书分享链接跳转到了非文档页面", en: "The Feishu share link redirected away from the document" },
  FEISHU_SHARE_UNAVAILABLE: { zh: "飞书分享页面暂时无法读取", en: "The Feishu share page is temporarily unavailable" },
  FEISHU_READ_FAILED: { zh: "飞书官方接口和分享页都未能读取正文", en: "Neither the Feishu API nor the share page returned readable content" },
  PLATFORM_URL_UNSUPPORTED: { zh: "暂不支持该平台或链接", en: "This platform or link is not supported" },
  ENGINE_API_KEY_REQUIRED: { zh: "启用此搜索源前需要配置 API Key", en: "Configure an API Key before enabling this source" },
  ENGINE_API_KEY_UNSUPPORTED: { zh: "此搜索源不支持 API Key", en: "This search source does not support an API Key" },
  ENGINE_RESULT_LIMIT_EXCEEDED: { zh: "返回数量超过此搜索源上限", en: "The requested result limit exceeds this source's maximum" },
  ENGINE_PROVIDER_MISSING: { zh: "搜索源 Provider 未注册", en: "The search source Provider is not registered" },
  UPSTREAM_INVALID_RESPONSE: { zh: "搜索引擎返回了无效响应", en: "The search engine returned an invalid response" },
  UPSTREAM_RESPONSE_TOO_LARGE: { zh: "搜索引擎响应体过大", en: "The search engine response was too large" },
  UPSTREAM_TIMEOUT: { zh: "搜索引擎请求超时", en: "The search engine request timed out" },
  SESSION_UNAUTHORIZED: { zh: "登录会话已失效，请重新登录", en: "Your session has expired; sign in again" },
  GATEWAY_USER_MISSING: { zh: "未识别当前懒猫用户", en: "The current Lazycat user could not be identified" },
  GATEWAY_USER_MISMATCH: { zh: "当前用户已切换，请重新登录", en: "The current user changed; sign in again" },
  OIDC_AUTHORIZATION_DENIED: { zh: "懒猫登录授权被取消或拒绝", en: "Lazycat authorization was cancelled or denied" },
  LOCAL_LOGIN_INVALID: { zh: "账号或密码错误", en: "The account or password is incorrect" },
  TOKEN_UNAUTHORIZED: { zh: "MCP Token 无效或已失效", en: "The MCP Token is invalid or expired" },
};

function normalizedCode(code?: string, message?: string): string {
  const value = (code ?? "").toUpperCase();
  if (value.includes("CONTENT_NOT_EXTRACTED") || /no readable content/i.test(message ?? "")) return "CONTENT_NOT_EXTRACTED";
  if (value.includes("TIMEOUT") || /timed out|超时/i.test(message ?? "")) return "TIMEOUT";
  if (/request failed with status code 403|\bHTTP\s*403\b/i.test(message ?? "")) return "SOURCE_ACCESS_DENIED";
  // Upstream adapters often preserve the generic UPSTREAM_UNAVAILABLE code
  // while exposing the useful HTTP/URL detail only in the message.
  // The daemon may call this `engine_error`, so classify the useful detail
  // even when the transport code is not `UPSTREAM_UNAVAILABLE`.
  if (!value.includes("TIMEOUT") && /request failed with status code 30\d|\bHTTP\s*30\d\b/i.test(message ?? "")) return "UPSTREAM_REDIRECT";
  if (!value.endsWith("INVALID_URL") && /invalid url/i.test(message ?? "")) return "UPSTREAM_INVALID_URL";
  return value;
}

export function friendlyError(input: ErrorInput, english: boolean): { code: string; summary: string; detail: string } {
  const code = normalizedCode(input.code, input.message);
  const known = codeText[code];
  const message = input.message?.trim() || (english ? "The request failed." : "请求失败。");
  const summary = known
    ? (english ? known.en : known.zh)
    : code === "REQUEST_FAILED" || code === ""
      ? (english ? "The request could not be completed" : "请求暂时未能完成")
      : (english ? "The search request failed" : "搜索请求失败");
  return { code: code || "REQUEST_FAILED", summary, detail: `${input.code || code || "REQUEST_FAILED"}: ${message}` };
}

export function ErrorDisclosure({ code, message, english, className }: ErrorInput & { english: boolean; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const friendly = friendlyError({ code, message }, english);
  return (
    <div className={cn("text-xs", className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold">{friendly.summary}</span>
        <button type="button" className="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900" onClick={() => setExpanded((value) => !value)}>
          {expanded ? (english ? "Hide details" : "收起详情") : (english ? "View details" : "查看详情")}
        </button>
      </div>
      {expanded ? <p className="mt-2 break-words rounded-lg border border-current/15 bg-white/60 p-2 font-mono text-[10px] leading-5 opacity-80">{friendly.detail}</p> : null}
    </div>
  );
}
