"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { clientTemplates } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Dropdown } from "@/components/ui/dropdown";
import { Switch } from "@/components/ui/switch";
import { Icon } from "@/components/ui/icon";
import { usePortal } from "@/components/portal/portal-context";
import type { McpToken } from "@/types/portal";

const formatDate = (value: string, locale: string) => value === "—" ? value : new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

function LimitControl({ label, unlimitedLabel, value, unlimited, hint, placeholder, max, onValueChange, onUnlimitedChange }: { label: string; unlimitedLabel: string; value: string; unlimited: boolean; hint: string; placeholder: string; max: number; onValueChange: (value: string) => void; onUnlimitedChange: (value: boolean) => void }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-slate-700">{label}</span>
        <div className="flex shrink-0 items-center gap-2 text-[11px] font-semibold text-slate-500">
          <span>{unlimitedLabel}</span>
          <Switch size="md" checked={unlimited} onChange={onUnlimitedChange} label={unlimitedLabel} />
        </div>
      </div>
      <Input className="mt-2 bg-white" type="number" min={1} max={max} inputMode="numeric" value={value} disabled={unlimited} onChange={(event) => onValueChange(event.target.value)} placeholder={placeholder} aria-label={label} />
      <p className="mt-1 text-[10px] leading-4 text-slate-400">{hint}</p>
    </div>
  );
}

export function McpPage() {
  const { locale, tools, tokens, setTools, notify, refresh } = usePortal();
  const english = locale === "en";
  const configuredBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  const endpointBase = configuredBase && /^https?:\/\//.test(configuredBase) ? configuredBase : (typeof window === "undefined" ? "http://localhost" : window.location.origin);
  const endpoint = new URL("/mcp", endpointBase).toString();
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<McpToken | null>(null);
  const [testReport, setTestReport] = useState<string[] | null>(null);
  const [activeConfig, setActiveConfig] = useState<keyof typeof clientTemplates>("WorkBuddy");
  const [name, setName] = useState("");
  const [scope, setScope] = useState<McpToken["scope"]>("all");
  const [rpmLimit, setRpmLimit] = useState("60");
  const [dailyLimit, setDailyLimit] = useState("5000");
  const [rpmUnlimited, setRpmUnlimited] = useState(false);
  const [dailyUnlimited, setDailyUnlimited] = useState(false);
  const [expiry, setExpiry] = useState("30");
  const copy = async (value: string) => { try { if (!navigator.clipboard) throw new Error("clipboard unavailable"); await navigator.clipboard.writeText(value); notify(english ? "Copied to clipboard." : "已复制到剪贴板"); } catch { notify(english ? "Clipboard access was not granted." : "浏览器未授予剪贴板权限。", "error"); } };
  const config = clientTemplates[activeConfig].replaceAll("https://search.example.com/mcp", endpoint);
  const changeTool = async (toolName: string, enabled: boolean) => { try { await api.updateMcpTools({ [toolName]: enabled }); setTools((items) => items.map((tool) => tool.name === toolName ? { ...tool, enabled } : tool)); notify(english ? "Tool exposure updated." : "Tool 暴露状态已更新。"); } catch (error) { notify(error instanceof Error ? error.message : "保存失败", "error"); } };
  const create = async () => {
    const readLimit = (value: string, max: number, label: string) => {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
        notify(english ? `${label} must be an integer between 1 and ${max}.` : `${label}请输入 1 到 ${max} 之间的整数。`, "error");
        return undefined;
      }
      return parsed;
    };
    const rpm = rpmUnlimited ? null : readLimit(rpmLimit, 10_000, english ? "Per-minute limit" : "每分钟限流");
    const daily = dailyUnlimited ? null : readLimit(dailyLimit, 1_000_000, english ? "Daily limit" : "每日调用上限");
    if ((!rpmUnlimited && rpm === undefined) || (!dailyUnlimited && daily === undefined)) return;
    try { const expiresAt = expiry === "never" ? null : new Date(Date.now() + Number(expiry) * 86_400_000).toISOString(); const token = await api.createToken({ name, scope, rpmLimit: rpm, dailyLimit: daily, expiresAt }); setOpen(false); setSecret(token.secret); await refresh(); } catch (error) { notify(error instanceof Error ? error.message : "创建失败", "error"); }
  };
  const changeToken = async (id: string, status: "active" | "disabled" | "revoked") => { try { await api.updateToken(id, status); await refresh(); } catch (error) { notify(error instanceof Error ? error.message : "更新失败", "error"); } };
  const deleteToken = async () => {
    if (!deleting) return;
    try {
      await api.deleteToken(deleting.id);
      setDeleting(null);
      await refresh();
      notify(english ? "Access Token deleted." : "Access Token 已删除。", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : (english ? "Delete failed." : "删除失败。"), "error");
    }
  };
  const runTest = async () => { try { const toolsSnapshot = await api.mcp(); setTestReport(["[✓] 管理端点返回成功", `[✓] 已读取 ${toolsSnapshot.length} 个 Tools 声明`, `[✓] 当前启用 ${toolsSnapshot.filter((tool) => tool.enabled).length} 个 Tools`, "[i] 带 Token 的 MCP initialize 需由外部客户端执行。"]); } catch (error) { setTestReport([`[×] ${error instanceof Error ? error.message : "管理端点不可用"}`]); } };
  const openCreate = () => { setName(""); setOpen(true); };

  return (
    <section className="mcp-page mx-auto w-full max-w-none space-y-6 pb-16">
      <div><h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{english ? "MCP service management" : "MCP 服务管理"}</h1><p className="mt-1 text-xs text-slate-500">{english ? "Manage remote MCP tools and access credentials." : "管理远程 MCP Tools 与接入凭据。"}</p></div>
      <Card className="white-card space-y-4 rounded-2xl border border-blue-100 bg-gradient-to-br from-white via-blue-50/20 to-sky-50/20 p-6 shadow-xs"><div className="flex items-center"><span className="flex items-center text-sm font-bold text-slate-900"><Icon name="broadcast" weight="fill" className="mr-2 text-xl text-blue-600" />{english ? "MCP service endpoint" : "MCP 服务端点"}</span></div><div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 p-3.5 font-mono text-xs text-slate-100 shadow-inner"><div><p className="mb-0.5 text-[10px] text-slate-400">STREAMABLE HTTP ENDPOINT</p><code className="font-bold text-emerald-400">{endpoint}</code></div><button type="button" onClick={() => void copy(endpoint)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label={english ? "Copy MCP endpoint" : "复制 MCP Endpoint"}><Icon name="copy" /></button></div></Card>
      <Card className="white-card overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/50 p-4"><div><h2 className="text-sm font-bold text-slate-900">{english ? `Exposed Tools (${tools.length})` : `暴露的 Tools 声明 (${tools.length} Tools)`}</h2><p className="mt-1 text-[11px] leading-5 text-slate-500">{english ? "search accepts an optional limit. Its response includes engineResults for grouped results and results for the deduplicated compatibility view." : "search 的 limit 为可选参数；响应同时提供按引擎分组的 engineResults，以及兼容的聚合去重 results。"}</p></div><span className="text-xs text-slate-400">{english ? "Site-specific fetch tools can be toggled by the administrator" : "站点专用 fetch Tool 可由管理员单独启停"}</span></div><div className="table-scroll overflow-x-auto"><table className="w-full border-collapse text-left"><thead><tr className="border-b border-slate-200 bg-slate-100/70 text-[10px] font-bold uppercase text-slate-500"><th className="p-3">{english ? "Tool" : "Tool 名称"}</th><th className="p-3">{english ? "Description" : "描述"}</th><th className="p-3">{english ? "Parameters" : "关键参数"}</th><th className="p-3 text-center">{english ? "Status" : "状态 / 启停"}</th></tr></thead><tbody className="divide-y divide-slate-100 font-mono text-xs text-slate-700">{tools.map((tool) => <tr key={tool.name} className="hover:bg-slate-50/50"><td className="p-3 font-bold text-blue-700">{tool.name}</td><td className="p-3 font-sans text-slate-600">{tool.description}</td><td className="p-3 text-[11px] text-slate-500">{tool.parameters}</td><td className="p-3 text-center">{tool.name === "search" ? <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{english ? "Required" : "核心必须"}</span> : <Switch label={`${tool.name} enabled`} checked={tool.enabled} onChange={(enabled) => void changeTool(tool.name, enabled)} />}</td></tr>)}</tbody></table></div></Card>
      <Card className="white-card overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 p-5"><div><h2 className="text-base font-bold text-slate-900">{english ? "Access Tokens (MCP credentials)" : "Access Tokens (MCP 鉴权密钥)"}</h2><p className="mt-0.5 text-xs text-slate-500">{english ? "External agents authenticate with the Authorization header." : "外部 Agent 通过 Header Authorization: Bearer ows_... 鉴权"}</p></div><Button className="rounded-xl" onClick={openCreate}>＋ {english ? "New Access Token" : "新建 Access Token"}</Button></div><div className="table-scroll overflow-x-auto"><table className="w-full border-collapse text-left"><thead><tr className="border-b border-slate-200 bg-slate-100/70 text-[10px] font-bold uppercase text-slate-500"><th className="p-4">{english ? "Name" : "名称"}</th><th className="p-4">Prefix</th><th className="p-4">Scope</th><th className="p-4">{english ? "Created" : "创建时间"}</th><th className="p-4">{english ? "Limits (Min/Day)" : "限流 (Min/Day)"}</th><th className="p-4">{english ? "Expires" : "过期时间"}</th><th className="p-4">{english ? "Last used" : "最近使用"}</th><th className="p-4">{english ? "Today" : "今日调用"}</th><th className="p-4">{english ? "Status" : "状态"}</th><th className="p-4 text-right">{english ? "Action" : "操作"}</th></tr></thead><tbody className="divide-y divide-slate-100 font-mono text-xs">{tokens.length ? tokens.map((token) => <tr key={token.id} className="hover:bg-slate-50/50"><td className="p-4 font-sans font-bold text-slate-900">{token.name}</td><td className="p-4 font-bold text-blue-600">{token.prefix}</td><td className="p-4"><span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">{token.scope}</span></td><td className="whitespace-nowrap p-4 text-slate-500">{formatDate(token.createdAt, english ? "en-US" : "zh-CN")}</td><td className="p-4 text-slate-600">{token.rpmLimit === null ? (english ? "Unlimited" : "无限制") : token.rpmLimit} / {token.dailyLimit === null ? (english ? "Unlimited" : "无限制") : token.dailyLimit}</td><td className="p-4 text-slate-500">{formatDate(token.expiresAt, english ? "en-US" : "zh-CN")}</td><td className="whitespace-nowrap p-4 text-slate-500">{token.lastUsedAt === "—" ? (english ? "Never" : "从未") : formatDate(token.lastUsedAt, english ? "en-US" : "zh-CN")}</td><td className="p-4 font-bold text-slate-800">{token.usageToday}</td><td className="p-4"><span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${token.status === "Active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-500"}`}>{token.status}</span></td><td className="whitespace-nowrap p-4 text-right">{token.status !== "Revoked" ? <><button type="button" className="font-bold text-blue-600 hover:underline" onClick={() => void changeToken(token.id, token.status === "Active" ? "disabled" : "active")}>{token.status === "Active" ? (english ? "Disable" : "禁用") : (english ? "Enable" : "启用")}</button><button type="button" className="ml-2 font-bold text-amber-600 hover:underline" onClick={() => void changeToken(token.id, "revoked")}>{english ? "Revoke" : "撤销"}</button></> : <span className="text-slate-400">—</span>}<button type="button" className="ml-2 font-bold text-red-600 hover:underline" onClick={() => setDeleting(token)}>{english ? "Delete" : "删除"}</button></td></tr>) : <tr><td colSpan={10} className="p-8 text-center text-slate-400">{english ? "No Access Tokens yet." : "尚未创建 Access Token。"}</td></tr>}</tbody></table></div></Card>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2"><Card className="white-card space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"><h2 className="text-sm font-bold text-slate-900">{english ? "Client configuration templates (5)" : "客户端接入配置模板 (5 Templates)"}</h2><div className="flex gap-1.5 overflow-x-auto border-b border-slate-200 pb-2 text-xs">{Object.keys(clientTemplates).map((key) => <button key={key} type="button" onClick={() => setActiveConfig(key as keyof typeof clientTemplates)} className={`shrink-0 rounded-lg px-3 py-1.5 font-bold ${activeConfig === key ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{key}</button>)}</div><pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs leading-relaxed text-emerald-400">{config}</pre><Button variant="quiet" className="w-full rounded-xl" onClick={() => void copy(config)}><Icon name="copy" /> {english ? "Copy configuration" : "复制配置代码"}</Button></Card><Card className="white-card flex flex-col justify-between space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"><div><h2 className="mb-1 text-sm font-bold text-slate-900">{english ? "MCP endpoint connection test" : "MCP Endpoint 连接测试"}</h2><p className="text-xs text-slate-500">{english ? "Reads endpoint metadata and the Tools list." : "读取端点元数据和 Tools 列表。"}</p></div><pre className="min-h-28 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-700">{testReport?.join("\n") ?? (english ? "// Click below to start the check..." : "// 点击下方按钮开始测试...")}</pre><Button className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600" onClick={() => void runTest()}><Icon name="play" weight="fill" /> {english ? "Run management check" : "运行管理端检查"}</Button></Card></div>
      {open ? <Modal title={english ? "New Access Token" : "新建 Access Token"} onClose={() => setOpen(false)} footer={<><Button variant="secondary" onClick={() => setOpen(false)}>{english ? "Cancel" : "取消"}</Button><Button onClick={() => void create()}>{english ? "Generate Token" : "生成 Token"}</Button></>}><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-700 sm:col-span-2">{english ? "Token name" : "Token 名称"}<Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} /></label><label className="text-xs font-bold text-slate-700">Scope<Dropdown containerClassName="mt-1 w-full" className="w-full" value={scope} onChange={(value) => setScope(value)} ariaLabel="Scope" options={[{ value: "all" as const, label: "search, fetch" }, { value: "search" as const, label: "search" }, { value: "fetch" as const, label: "fetch" }]} /></label><label className="text-xs font-bold text-slate-700">{english ? "Expiry" : "有效期"}<Dropdown containerClassName="mt-1 w-full" className="w-full" value={expiry} onChange={setExpiry} ariaLabel={english ? "Expiry" : "有效期"} options={[{ value: "30", label: english ? "30 days" : "30 天" }, { value: "90", label: english ? "90 days" : "90 天" }, { value: "365", label: english ? "1 year" : "1 年" }, { value: "never", label: english ? "Never" : "永不过期" }]} /></label><div className="sm:col-span-2 grid gap-3 sm:grid-cols-2"><LimitControl label={english ? "Per-minute limit" : "每分钟限流"} unlimitedLabel={english ? "Unlimited" : "无限制"} value={rpmLimit} unlimited={rpmUnlimited} onValueChange={setRpmLimit} onUnlimitedChange={setRpmUnlimited} max={10_000} placeholder={english ? "Enter a value" : "手动输入数值"} hint={rpmUnlimited ? (english ? "No per-minute cap." : "不限制每分钟调用次数。") : (english ? "Enter 1–10,000 requests per minute." : "请输入每分钟 1–10,000 次。")} /><LimitControl label={english ? "Daily limit" : "每日调用上限"} unlimitedLabel={english ? "Unlimited" : "无限制"} value={dailyLimit} unlimited={dailyUnlimited} onValueChange={setDailyLimit} onUnlimitedChange={setDailyUnlimited} max={1_000_000} placeholder={english ? "Enter a value" : "手动输入数值"} hint={dailyUnlimited ? (english ? "No daily cap." : "不限制每日调用次数。") : (english ? "Enter 1–1,000,000 requests per day." : "请输入每日 1–1,000,000 次。")} /></div><p className="text-xs text-amber-700 sm:col-span-2">{english ? "The full secret is shown once; only its hash is stored." : "完整 Secret 仅显示一次，数据库只保存其 Hash 摘要。"}</p></div></Modal> : null}{secret ? <Modal title={english ? "Access Token created" : "Access Token 创建成功"} onClose={() => setSecret(null)} footer={<Button onClick={() => setSecret(null)}>{english ? "Done" : "完成"}</Button>}><p className="mb-3 text-xs text-slate-600">{english ? "The full secret is shown once. Store it securely:" : "完整 Secret 仅显示一次，请妥善保存："}</p><div className="flex items-center gap-2 rounded-2xl bg-slate-900 p-3"><code className="min-w-0 flex-1 break-all text-xs font-bold leading-5 text-emerald-400">{secret}</code><Button variant="quiet" className="size-9 shrink-0 rounded-xl bg-white/10 p-0 text-slate-100 hover:bg-white/20" onClick={() => void copy(secret)} aria-label={english ? "Copy Access Token" : "复制 Access Token"}><Icon name="copy" /></Button></div></Modal> : null}{deleting ? <Modal title={english ? "Delete Access Token?" : "删除 Access Token？"} onClose={() => setDeleting(null)} footer={<><Button variant="secondary" onClick={() => setDeleting(null)}>{english ? "Cancel" : "取消"}</Button><Button className="bg-red-600 hover:bg-red-700" onClick={() => void deleteToken()}>{english ? "Delete permanently" : "确认删除"}</Button></>}><p className="text-sm leading-6 text-slate-700">{english ? `Delete ${deleting.name} (${deleting.prefix}) permanently? Existing audit records remain, but this token can no longer be used.` : `确定永久删除 ${deleting.name}（${deleting.prefix}）？已有审计记录会保留，但此 Token 将无法再使用。`}</p></Modal> : null}
    </section>
  );
}
