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
  INTERNAL_ERROR: { zh: "服务暂时不可用", en: "The service is temporarily unavailable" },
};

function normalizedCode(code?: string, message?: string): string {
  const value = (code ?? "").toUpperCase();
  if (value.includes("CONTENT_NOT_EXTRACTED") || /no readable content/i.test(message ?? "")) return "CONTENT_NOT_EXTRACTED";
  if (value.includes("TIMEOUT") || /timed out|超时/i.test(message ?? "")) return "TIMEOUT";
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
