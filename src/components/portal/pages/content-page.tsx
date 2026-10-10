"use client";

/* Remote media stays on its source CDN; the server does not proxy images. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, type FormEvent } from "react";
import { ApiClientError, api } from "@/lib/api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { extractPlatformUrl } from "@/lib/platform-url";
import { friendlyError } from "@/components/portal/error-message";
import { usePortal } from "@/components/portal/portal-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { EngineTag } from "@/components/ui/engine-tag";
import type { FeishuConnection } from "@/types/portal";

type PreviewSource = "xiaohongshu" | "feishu" | "wechat" | "csdn" | "juejin" | "linuxdo" | "github" | "webpage";
type PreviewContent = { source: PreviewSource; sourceUrl: string; title: string; author?: string; publishedAt?: string; markdown: string; images: string[]; videoUrls: string[]; truncated: boolean };

const platformName: Record<PreviewSource, { zh: string; en: string }> = {
  xiaohongshu: { zh: "小红书", en: "Xiaohongshu" },
  feishu: { zh: "飞书", en: "Feishu" },
  wechat: { zh: "微信公众号", en: "WeChat Official Account" },
  csdn: { zh: "CSDN", en: "CSDN" },
  juejin: { zh: "掘金", en: "Juejin" },
  linuxdo: { zh: "Linux.do", en: "Linux.do" },
  github: { zh: "GitHub README", en: "GitHub README" },
  webpage: { zh: "网页", en: "Web page" },
};
const previewSources = Object.keys(platformName) as PreviewSource[];

function downloadMarkdown(content: PreviewContent): void {
  const title = content.title.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(0, 80) || "content";
  const header = [`Source: ${content.sourceUrl}`, ...(content.author ? [`Author: ${content.author}`] : []), ...(content.publishedAt ? [`Published: ${content.publishedAt}`] : []), "", "---", ""].join("\n");
  const blob = new Blob([header, content.markdown], { type: "text/markdown;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = `${title}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

function explainError(cause: unknown, english: boolean, fallback: string): string {
  return cause instanceof ApiClientError
    ? friendlyError({ code: cause.code, message: cause.message }, english).summary
    : cause instanceof Error ? cause.message : fallback;
}

function MarkdownPreview({ content, images }: { content: string; images: string[] }) {
  // 图片跟随 markdown 原有位置内联渲染；未出现在正文里的图片（如通用网页抓取）仍用末尾网格兜底。
  const inlineImages = new Set([...content.matchAll(/!\[[^\]]*\]\((https:\/\/[^)\s]+)\)/g)].map((match) => match[1]));
  const fallbackImages = images.filter((url) => !inlineImages.has(url));
  return (
    <div className="space-y-1 text-sm leading-7 text-slate-700">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: ({ src, alt }) => typeof src === "string" && src.startsWith("https://")
            ? <img src={src} alt={alt ?? ""} loading="lazy" referrerPolicy="no-referrer" className="my-3 max-h-96 w-auto max-w-full rounded-xl border border-slate-200" />
            : null,
          pre: ({ children }) => <pre className="my-3 overflow-x-auto rounded-xl bg-slate-900 p-4 font-mono text-xs leading-6 text-slate-100">{children}</pre>,
          code: ({ className, children }) => className?.includes("language-") || String(children).includes("\n")
            ? <code className="font-mono">{children}</code>
            : <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-800">{children}</code>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-blue-600 underline">{children}</a>,
          h1: ({ children }) => <h1 className="pt-4 text-xl font-bold text-slate-900">{children}</h1>,
          h2: ({ children }) => <h2 className="pt-4 text-lg font-bold text-slate-900">{children}</h2>,
          h3: ({ children }) => <h3 className="pt-3 text-base font-bold text-slate-900">{children}</h3>,
          h4: ({ children }) => <h4 className="pt-3 font-bold text-slate-900">{children}</h4>,
          h5: ({ children }) => <h5 className="pt-3 font-bold text-slate-900">{children}</h5>,
          h6: ({ children }) => <h6 className="pt-3 font-bold text-slate-900">{children}</h6>,
          table: ({ children }) => <div className="my-3 overflow-x-auto"><table className="w-full border-collapse text-xs">{children}</table></div>,
          th: ({ children }) => <th className="border border-slate-200 bg-slate-50 px-2 py-1 text-left font-bold">{children}</th>,
          td: ({ children }) => <td className="border border-slate-200 px-2 py-1 align-top">{children}</td>,
          blockquote: ({ children }) => <blockquote className="my-3 border-l-4 border-slate-300 pl-3 text-slate-600">{children}</blockquote>,
          p: ({ children }) => <p className="min-h-3 whitespace-pre-wrap break-words">{children}</p>,
        }}
      >
        {content}
      </ReactMarkdown>
      {fallbackImages.length ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{fallbackImages.map((url, index) => <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-slate-200"><img src={url} alt={`图片 ${index + 1}`} loading="lazy" referrerPolicy="no-referrer" className="aspect-square w-full object-cover" /></a>)}</div>
      ) : null}
    </div>
  );
}

export function ContentPage() {
  const { locale, notify, refresh } = usePortal();
  const english = locale === "en";
  const [input, setInput] = useState("");
  const [content, setContent] = useState<PreviewContent | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<FeishuConnection | null>(null);
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [authorization, setAuthorization] = useState<{ verificationUrl: string; userCode: string } | null>(null);

  useEffect(() => { let cancelled = false; void api.feishuConnection().then((value) => { if (!cancelled) { setConnection(value); setAppId(value.appId); } }).catch(() => {}); return () => { cancelled = true; }; }, []);
  useEffect(() => {
    if (!authorization) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const result = await api.pollFeishuOAuth();
        if (cancelled) return;
        if (result.status === "connected") {
          setAuthorization(null);
          setConnection(await api.feishuConnection());
          notify(english ? "Feishu is connected." : "飞书账号已连接。", "success");
          try { await api.updateEngine("feishu", { enabled: true }); await refresh(); }
          catch (cause) { setError(explainError(cause, english, english ? "Enable Feishu search in Engine Management." : "请在引擎管理中启用飞书搜索。")); }
          return;
        }
        timer = setTimeout(() => void poll(), Math.max(5, result.retryAfter) * 1_000);
      } catch (cause) {
        if (cancelled) return;
        setAuthorization(null);
        setError(explainError(cause, english, english ? "Feishu authorization failed." : "飞书授权失败。"));
      }
    };
    timer = setTimeout(() => void poll(), 5_000);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [authorization, english, notify, refresh]);

  const fetchContent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const url = extractPlatformUrl(input);
    if (!url) return;
    setFetching(true); setError(""); setContent(null);
    try {
      const result = (await api.fetchContent(url, 50_000, true)).content;
      const source = result.platform ?? result.source ?? "webpage";
      const heading = /^#\s+(.+)$/m.exec(result.content)?.[1]?.trim();
      setContent({ source, sourceUrl: result.url, title: result.title.trim() || heading || new URL(result.url).hostname, author: result.author, publishedAt: result.publishedAt, markdown: result.content, images: result.images ?? [], videoUrls: result.videoUrls ?? [], truncated: result.truncated });
    }
    catch (cause) { setError(explainError(cause, english, english ? "Fetch failed." : "抓取失败。")); }
    finally { setFetching(false); }
  };

  const saveConnection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError("");
    try { const value = await api.setFeishuConnection(appId, appSecret); setConnection(value); setAppSecret(""); notify(english ? "Feishu app saved." : "飞书应用已保存。", "success"); }
    catch (cause) { setError(explainError(cause, english, english ? "Could not save Feishu app." : "保存飞书应用失败。")); }
    finally { setSaving(false); }
  };

  const startOAuth = async () => {
    setSaving(true); setError("");
    try { const result = await api.startFeishuOAuth(); setAuthorization({ verificationUrl: result.verificationUrl, userCode: result.userCode }); }
    catch (cause) { setError(explainError(cause, english, english ? "Could not start authorization." : "无法发起授权。")); }
    finally { setSaving(false); }
  };

  const clearConnection = async () => {
    setSaving(true); setError("");
    try { setConnection(await api.clearFeishuConnection()); setAppId(""); setAppSecret(""); setAuthorization(null); notify(english ? "Feishu connection removed." : "飞书连接已移除。", "success"); }
    catch (cause) { setError(explainError(cause, english, english ? "Could not remove connection." : "无法移除飞书连接。")); }
    finally { setSaving(false); }
  };

  return <div className="space-y-6">
    <div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-600">CONTENT</p><h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">{english ? "Fetch content" : "内容抓取"}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{english ? "Paste an article or web page link to preview and download its content. The source is detected automatically." : "粘贴文章或网页链接，自动识别来源，预览正文并下载。"}</p></div>
    <Card className="p-5"><form onSubmit={(event) => void fetchContent(event)} className="space-y-3"><label htmlFor="content-url" className="block text-xs font-bold text-slate-700">{english ? "Content link" : "内容链接"}</label><div className="flex flex-col gap-3 sm:flex-row"><Input id="content-url" type="text" value={input} onChange={(event) => setInput(event.target.value)} placeholder={english ? "Paste a link or share text" : "粘贴链接或分享文案"} autoComplete="off" className="flex-1" /><Button type="submit" disabled={!input.trim() || fetching}><Icon name={fetching ? "circle-notch" : "download-simple"} className={fetching ? "animate-spin" : ""} />{fetching ? (english ? "Fetching…" : "抓取中…") : (english ? "Fetch content" : "抓取内容")}</Button></div><div className="flex flex-wrap items-center gap-2" aria-label={english ? "Supported sources" : "支持的来源"}>{previewSources.map((source) => <EngineTag key={source} engine={source} label={platformName[source][locale]} compact />)}</div></form></Card>
    {error ? <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert"><Icon name="warning-circle" className="mr-2" />{error}</Card> : null}
    {content ? <Card className="overflow-hidden"><div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 p-5"><div className="min-w-0"><EngineTag engine={content.source} label={platformName[content.source][locale]} compact /><h2 className="mt-1 text-lg font-bold text-slate-900">{content.title}</h2><p className="mt-1 text-xs text-slate-500">{[content.author, content.publishedAt].filter(Boolean).join(" · ")}</p><a href={content.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 block break-all text-xs text-blue-600 underline">{content.sourceUrl}</a></div><Button onClick={() => downloadMarkdown(content)}><Icon name="download-simple" />{english ? "Download Markdown" : "下载 Markdown"}</Button></div><div className="max-h-[60vh] overflow-y-auto p-5"><MarkdownPreview content={content.markdown} images={content.images} />{content.truncated ? <p className="mt-4 text-xs text-amber-700">{english ? "Content was truncated at the configured limit." : "正文达到长度上限，已截断。"}</p> : null}{content.videoUrls.length ? <div className="mt-5 space-y-2">{content.videoUrls.slice(0, 3).map((url, index) => <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="block break-all text-xs text-blue-600 underline">{english ? `Open video ${index + 1}` : `打开视频 ${index + 1}`}</a>)}</div> : null}</div></Card> : null}
    <Card className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-bold text-slate-900">{english ? "Feishu account" : "飞书账号"}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{english ? "Connect an official Feishu app to search and read documents you can access. Public share links can be fetched directly." : "连接官方飞书应用后，可搜索和读取当前账号有权访问的文档。公开分享链接可直接抓取。"}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${connection?.connected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{connection?.connected ? (english ? "Connected" : "已连接") : connection?.configured ? (english ? "Authorization needed" : "待授权") : (english ? "Not configured" : "未配置")}</span></div><form onSubmit={(event) => void saveConnection(event)} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><Input value={appId} onChange={(event) => setAppId(event.target.value)} placeholder="App ID · cli_..." aria-label="Feishu App ID" /><Input value={appSecret} onChange={(event) => setAppSecret(event.target.value)} placeholder={connection?.configured ? (english ? "New App Secret" : "新的 App Secret") : "App Secret"} aria-label="Feishu App Secret" type="password" autoComplete="off" /><Button type="submit" variant="secondary" disabled={saving || !appId.trim() || !appSecret.trim()}>{english ? "Save app" : "保存应用"}</Button></form><p className="mt-3 text-[11px] leading-5 text-slate-500">{english ? "Create a self-built app in Feishu Open Platform. Enable User OAuth device flow and grant search:docs:read, docx:document:readonly, wiki:node:read, wiki:node:retrieve, offline_access." : "在飞书开放平台创建自建应用，启用用户 OAuth 设备流，并授予 search:docs:read、docx:document:readonly、wiki:node:read、wiki:node:retrieve、offline_access 权限。"} <a href="https://open.feishu.cn/app" target="_blank" rel="noreferrer" className="text-blue-600 underline">{english ? "Open Feishu platform" : "打开飞书开放平台"}</a></p><div className="mt-4 flex flex-wrap gap-2">{connection?.configured ? <Button onClick={() => void startOAuth()} disabled={saving}>{english ? "Connect Feishu" : "连接飞书"}</Button> : null}{connection?.configured ? <Button variant="ghost" onClick={() => void clearConnection()} disabled={saving}>{english ? "Remove connection" : "移除连接"}</Button> : null}</div>{authorization ? <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs leading-6 text-blue-900"><p>{english ? "Open the authorization link and enter this code:" : "打开授权链接并输入此代码："} <strong className="font-mono text-sm">{authorization.userCode}</strong></p><a href={authorization.verificationUrl} target="_blank" rel="noreferrer" className="font-bold text-blue-700 underline">{english ? "Open Feishu authorization" : "打开飞书授权页"}</a><p>{english ? "Waiting for authorization…" : "正在等待授权…"}</p></div> : null}</Card>
  </div>;
}
