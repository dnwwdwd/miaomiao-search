"use client";

import { useMemo, useState } from "react";
import { api, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Dropdown } from "@/components/ui/dropdown";
import { Switch } from "@/components/ui/switch";
import { Icon } from "@/components/ui/icon";
import { EngineTag } from "@/components/ui/engine-tag";
import { Tag, type TagTone } from "@/components/ui/tag";
import { ErrorDisclosure, friendlyError } from "@/components/portal/error-message";
import { usePortal } from "@/components/portal/portal-context";
import type { SearchEngine, SettingsState } from "@/types/portal";

const healthTone: Record<SearchEngine["health"], TagTone> = { Healthy: "green", Degraded: "amber", "Rate Limited": "amber", Blocked: "red", Unavailable: "red", Disabled: "neutral", Unknown: "neutral" };
const healthLabel = (health: SearchEngine["health"], english: boolean) => ({ Healthy: english ? "Healthy" : "健康", Degraded: english ? "Degraded" : "降级", "Rate Limited": english ? "Rate limited" : "频率受限", Blocked: english ? "Blocked" : "已阻断", Unavailable: english ? "Unavailable" : "不可用", Disabled: english ? "Disabled" : "已停用", Unknown: english ? "Unknown" : "未知" }[health]);
const displayTime = (value: string, locale: string) => value === "—" ? "—" : new Intl.DateTimeFormat(locale, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
type OrderScope = "homeEngineOrder" | "mcpEngineOrder";
const completeOrder = (preferred: string[], ids: string[]) => [...new Set([...preferred.filter((id) => ids.includes(id)), ...ids])];

function EngineOrderList({ items, english, dragging, onDragStart, onDragEnd, onDrop, onMove }: { items: SearchEngine[]; english: boolean; dragging: string | null; onDragStart: (id: string) => void; onDragEnd: () => void; onDrop: (id: string) => void; onMove: (id: string, direction: -1 | 1) => void }) {
  return <div className="space-y-2" onDragOver={(event) => event.preventDefault()}>{items.map((engine, index) => <div key={engine.id} draggable onDragStart={() => onDragStart(engine.id)} onDragEnd={onDragEnd} onDragOver={(event) => event.preventDefault()} onDrop={() => onDrop(engine.id)} className={`flex items-center gap-2 rounded-xl border bg-white px-3 py-2.5 transition-colors ${dragging === engine.id ? "border-blue-400 bg-blue-50 shadow-sm" : "border-slate-200 hover:border-blue-200"}`}><span className="cursor-grab text-slate-400 active:cursor-grabbing" aria-hidden="true"><Icon name="dots-six-vertical" /></span><EngineTag engine={engine.name} compact /><span className="ml-auto text-[10px] font-semibold text-slate-400">{engine.enabled ? (english ? "Enabled" : "已启用") : (english ? "Disabled" : "已停用")}</span><button type="button" className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30" disabled={index === 0} onClick={() => onMove(engine.id, -1)} aria-label={english ? `Move ${engine.name} up` : `将 ${engine.name} 上移`}><Icon name="caret-up" /></button><button type="button" className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30" disabled={index === items.length - 1} onClick={() => onMove(engine.id, 1)} aria-label={english ? `Move ${engine.name} down` : `将 ${engine.name} 下移`}><Icon name="caret-down" /></button></div>)}</div>;
}

export function EnginesPage() {
  const { engines, settings, locale, notify, refresh, setUsageLogs, setSettings } = usePortal();
  const english = locale === "en";
  const [testing, setTesting] = useState<SearchEngine | null>(null);
  const [credentialEngine, setCredentialEngine] = useState<SearchEngine | null>(null);
  const [credentialDraft, setCredentialDraft] = useState("");
  const [enableAfterSave, setEnableAfterSave] = useState(false);
  const [savingCredential, setSavingCredential] = useState(false);
  const [query, setQuery] = useState("lazycat search");
  const [batching, setBatching] = useState(false);
  const [lastResult, setLastResult] = useState<{ engine: string; count: number; latency: number } | null>(null);
  const [testError, setTestError] = useState<{ engine: string; code: string; message: string } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const enabled = engines.filter((engine) => engine.enabled);
  const engineIds = useMemo(() => engines.map((engine) => engine.id), [engines]);
  const homeOrder = useMemo(() => completeOrder(settings.homeEngineOrder, engineIds), [settings.homeEngineOrder, engineIds]);
  const mcpOrder = useMemo(() => completeOrder(settings.mcpEngineOrder, engineIds), [settings.mcpEngineOrder, engineIds]);
  const orderItems = (order: string[]) => order.map((id) => engines.find((engine) => engine.id === id)).filter((engine): engine is SearchEngine => Boolean(engine));
  const t = english ? { title: "Search engine management", subtitle: "Monitor health, prerequisites, and per-engine result counts.", test: "Test", testSearch: "Test Search", batch: "Run health checks", enabled: "Enabled", default: "Default", resultLimit: "Per search", systemDefault: "Engine default (10)", configure: "Configure API Key" } : { title: "搜索引擎管理", subtitle: "查看健康度、启用前置条件，并为每个引擎设置独立返回数量。", test: "测试", testSearch: "测试搜索", batch: "运行健康测试", enabled: "启用", default: "默认", resultLimit: "每次返回", systemDefault: "搜索引擎默认值（10）", configure: "配置 API Key" };

  const patch = async (id: string, value: object) => {
    try { await api.updateEngine(id, value); await refresh(); }
    catch (error) { const detail = error instanceof Error ? error.message : (english ? "Could not update engine." : "引擎更新失败。"); notify(friendlyError({ code: error instanceof ApiClientError ? error.code : undefined, message: detail }, english).summary, "error"); }
  };

  const toggleEnabled = async (engine: SearchEngine, value: boolean) => {
    if (!value) return void patch(engine.id, { enabled: false });
    if (engine.requiresApiKey && !engine.apiKeyConfigured) {
      notify(english ? `${engine.name} needs an API Key before it can be enabled.` : `${engine.name} 启用前需要先配置 API Key。`, "info");
      setCredentialEngine(engine);
      setCredentialDraft("");
      setEnableAfterSave(true);
      return;
    }
    if (engine.requiresProxy) notify(english ? `${engine.name} uses the Lazycat VPN/TUN route. Make sure the system proxy is enabled.` : `${engine.name} 使用懒猫微服 VPN/TUN 路由，请确认系统代理已开启。`, "info");
    void patch(engine.id, { enabled: true });
  };

  const openCredential = (engine: SearchEngine, activate = false) => {
    setCredentialEngine(engine);
    setCredentialDraft("");
    setEnableAfterSave(activate);
  };

  const saveCredential = async () => {
    if (!credentialEngine) return;
    const value = credentialDraft.trim();
    if (!value) return notify(english ? "Enter an API Key, or use Clear to remove the saved key." : "请输入 API Key；如需删除已保存密钥，请点击清除。", "error");
    setSavingCredential(true);
    try {
      await api.updateEngine(credentialEngine.id, { apiKey: value });
      await refresh();
      if (enableAfterSave) {
        await api.updateEngine(credentialEngine.id, { enabled: true });
        await refresh();
      }
      setCredentialEngine(null);
      notify(english ? "API Key saved. Restart the Open-WebSearch daemon for it to take effect." : "API Key 已保存；请重启 Open-WebSearch daemon 后生效。", "info");
    } catch (error) {
      notify(error instanceof Error ? error.message : (english ? "Could not save API Key." : "API Key 保存失败。"), "error");
    } finally { setSavingCredential(false); }
  };

  const clearCredential = async () => {
    if (!credentialEngine) return;
    setSavingCredential(true);
    try {
      await api.updateEngine(credentialEngine.id, { apiKey: null });
      await refresh();
      setCredentialEngine(null);
      notify(english ? "API Key cleared. Restart the Open-WebSearch daemon if it is still running with the old key." : "API Key 已清除；如 daemon 仍在运行，请重启以移除旧密钥。", "info");
    } catch (error) {
      notify(error instanceof Error ? error.message : (english ? "Could not clear API Key." : "API Key 清除失败。"), "error");
    } finally { setSavingCredential(false); }
  };

  const test = async () => {
    if (!testing) return;
    setTestError(null);
    try {
      const result = await api.testEngine(testing.id, query);
      setLastResult({ engine: testing.name, count: Number(result.resultCount), latency: Number(result.latencyMs) });
      setTestError(result.failure ? { engine: testing.id, ...result.failure } : null);
      setUsageLogs((items) => [{ id: `engine-test-${Date.now()}`, channel: "Web", operation: "engineTest", token: "—", engines: [testing.name], latency: Number(result.latencyMs), cacheHit: false, resultCount: Number(result.resultCount), status: "Success", errorCode: "—", createdAt: new Date().toISOString() }, ...items]);
      await refresh();
    } catch (error) {
      setLastResult(null);
      setTestError(error instanceof ApiClientError ? { engine: testing.id, code: error.code, message: error.message } : { engine: testing.id, code: "REQUEST_FAILED", message: error instanceof Error ? error.message : (english ? "Engine test failed." : "测试失败") });
    }
  };

  const openTest = (engine: SearchEngine) => {
    setTesting(engine);
    setQuery("lazycat search");
    setLastResult(null);
    setTestError(null);
  };

  const batch = async () => {
    setBatching(true);
    try {
      const queue = [...enabled]; let success = 0;
      const workers = Array.from({ length: Math.min(Math.max(1, settings.engineConcurrency), queue.length) }, async () => { while (queue.length) { const engine = queue.shift(); if (!engine) return; try { await api.testEngine(engine.id, "lazycat search"); success += 1; } catch { /* individual failures are persisted by the service */ } } });
      await Promise.all(workers); await refresh(); notify(english ? `${success}/${enabled.length} checks completed.` : `${success}/${enabled.length} 个健康检查已完成。`, success === enabled.length ? "success" : "info");
    } finally { setBatching(false); }
  };

  const persistOrder = async (scope: OrderScope, nextOrder: string[]) => {
    const previous = settings;
    const nextSettings: SettingsState = { ...settings, [scope]: nextOrder };
    setSettings(nextSettings);
    try { setSettings(await api.updateSettings(nextSettings)); notify(english ? "Engine order saved." : "引擎顺序已保存。", "success"); }
    catch (error) { setSettings(previous); notify(error instanceof Error ? error.message : (english ? "Could not save engine order." : "引擎顺序保存失败。"), "error"); }
  };

  const moveEngine = (scope: OrderScope, id: string, direction: -1 | 1) => {
    const current = scope === "homeEngineOrder" ? homeOrder : mcpOrder;
    const index = current.indexOf(id); const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return;
    const next = [...current]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    void persistOrder(scope, next);
  };

  const dropEngine = (scope: OrderScope, targetId: string) => {
    if (!dragging || dragging === targetId) return setDragging(null);
    const current = scope === "homeEngineOrder" ? homeOrder : mcpOrder;
    const from = current.indexOf(dragging); const to = current.indexOf(targetId);
    if (from < 0 || to < 0) return setDragging(null);
    const next = [...current]; next.splice(from, 1); next.splice(to, 0, dragging); setDragging(null); void persistOrder(scope, next);
  };

  const orderCard = (scope: OrderScope, title: string, description: string, order: string[]) => <Card className="white-card rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"><div className="mb-3 flex items-start justify-between gap-3"><div><h2 className="text-sm font-bold text-slate-900">{title}</h2><p className="mt-1 text-[11px] leading-5 text-slate-500">{description}</p></div><Icon name="sort-ascending" className="text-lg text-blue-500" /></div><EngineOrderList items={orderItems(order)} english={english} dragging={dragging} onDragStart={setDragging} onDragEnd={() => setDragging(null)} onDrop={(target) => dropEngine(scope, target)} onMove={(id, direction) => moveEngine(scope, id, direction)} /></Card>;

  return <section className="mx-auto w-full max-w-none space-y-5 pb-16">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{t.title}</h1><p className="mt-1 text-xs text-slate-500">{t.subtitle}</p></div><Button disabled={batching || !enabled.length} onClick={() => void batch()} className="rounded-xl px-4 py-2 shadow-md shadow-blue-600/20"><Icon name="arrows-clockwise" className={batching ? "animate-spin" : ""} /> {t.batch}</Button></div>
    <div className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-xs text-blue-900"><div className="flex items-start gap-2"><Icon name="shield-check" className="mt-0.5 text-blue-600" /><p>{english ? "DuckDuckGo follows the Lazycat VPN/TUN route. Make sure the system proxy is enabled." : "DuckDuckGo 使用懒猫微服 VPN/TUN 路由，请确认系统代理已开启。"}</p></div></div>
    <div className="grid gap-4 lg:grid-cols-2">{orderCard("homeEngineOrder", english ? "Homepage search order" : "首页搜索顺序", english ? "Drag to set the persistent order used by the Web search source picker and default requests." : "拖动设置首页来源选择器和默认搜索请求使用的固定顺序。", homeOrder)}{orderCard("mcpEngineOrder", english ? "MCP search order" : "MCP 搜索顺序", english ? "Drag to set the persistent order used when an MCP search call omits engines." : "拖动设置 MCP search 未指定 engines 时使用的固定顺序。", mcpOrder)}</div>
    <div className="white-card overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"><div className="table-scroll overflow-x-auto"><table className="w-full min-w-[1120px] border-collapse text-left"><thead><tr className="border-b border-slate-200 bg-slate-100/70 text-[11px] font-bold uppercase tracking-wider text-slate-500"><th className="whitespace-nowrap p-4">{english ? "Engine" : "搜索引擎"}</th><th className="whitespace-nowrap p-4 text-center">{english ? "Enabled" : "启用 (Enabled)"}</th><th className="whitespace-nowrap p-4 text-center">{english ? "Default" : "默认选定"}</th><th className="whitespace-nowrap p-4">Search Mode</th><th className="whitespace-nowrap p-4">{t.resultLimit}</th><th className="whitespace-nowrap p-4">{english ? "Prerequisites" : "启用条件"}</th><th className="whitespace-nowrap p-4">{english ? "Last test" : "最近测试"}</th><th className="whitespace-nowrap p-4">{english ? "Health" : "健康度状态"}</th><th className="whitespace-nowrap p-4">{english ? "Latency" : "延迟"}</th><th className="whitespace-nowrap p-4">{english ? "Last error" : "最近错误"}</th><th className="whitespace-nowrap p-4 text-right">{english ? "Action" : "操作"}</th></tr></thead><tbody className="divide-y divide-slate-100 font-mono text-xs">{engines.map((engine) => <tr key={engine.id} className="hover:bg-slate-50/50"><td className="p-4 font-sans"><EngineTag engine={engine.name} compact /></td><td className="p-4 text-center"><Switch label={`${engine.name} ${t.enabled}`} checked={engine.enabled} onChange={(value) => void toggleEnabled(engine, value)} /></td><td className="p-4 text-center"><input type="checkbox" aria-label={`${engine.name} ${t.default}`} checked={engine.isDefault} onChange={(event) => void patch(engine.id, { isDefault: event.target.checked })} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" /></td><td className="whitespace-nowrap p-4 font-bold text-slate-600">{engine.mode}</td><td className="min-w-40 p-3"><Dropdown containerClassName="w-40" className="w-full rounded-lg bg-white py-1 text-[11px]" value={engine.resultLimit === null ? "default" : String(engine.resultLimit)} onChange={(value) => void patch(engine.id, { resultLimit: value === "default" ? null : Number(value) })} ariaLabel={`${engine.name} ${t.resultLimit}`} options={[{ value: "default", label: t.systemDefault }, ...[5, 10, 20, 30, 50].map((value) => ({ value: String(value), label: `${value} ${english ? "results" : "条"}` }))]} /></td><td className="p-4 font-sans"><div className="flex flex-wrap items-center gap-1.5">{engine.requiresProxy ? <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700"><Icon name="globe" className="mr-1" />Proxy</span> : null}{engine.requiresApiKey ? <button type="button" onClick={() => openCredential(engine)} className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${engine.apiKeyConfigured ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}><Icon name="key" className="mr-1" />{engine.apiKeyConfigured ? (english ? "Key ready" : "已配置 Key") : (english ? "Key needed" : "需要 Key")}</button> : engine.requiresProxy ? null : <span className="text-[10px] text-slate-400">{english ? "None" : "无"}</span>}</div></td><td className="whitespace-nowrap p-4 text-slate-500">{displayTime(engine.lastTestAt, english ? "en-US" : "zh-CN")}</td><td className="whitespace-nowrap p-4"><Tag tone={healthTone[engine.health]}>{healthLabel(engine.health, english)}</Tag></td><td className="whitespace-nowrap p-4 font-bold text-blue-600">{engine.latency === null ? "—" : `${engine.latency}ms`}</td><td className="p-4 font-sans text-xs text-slate-400">{engine.lastError === "—" ? "—" : <ErrorDisclosure message={engine.lastError} english={english} />}</td><td className="whitespace-nowrap p-4 text-right"><button type="button" className="text-xs font-bold text-blue-600 hover:underline" onClick={() => openTest(engine)}>{t.testSearch}</button></td></tr>)}</tbody></table></div></div>
    {testing ? <Modal title={`${t.test} · ${testing.name}`} onClose={() => setTesting(null)} footer={<><Button variant="secondary" onClick={() => setTesting(null)}>{english ? "Close" : "关闭"}</Button><Button onClick={() => void test()}>{english ? "Run test" : "发起测试"}</Button></>}><p className="mb-4 text-xs leading-5 text-slate-500">{english ? "This sends one real search request to the selected upstream." : "此操作会向所选上游发起一次真实搜索请求。"}</p><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-700">{english ? "Selected engine" : "选择的引擎"}<Input className="mt-1" readOnly value={testing.name} /></label><label className="text-xs font-bold text-slate-700">{english ? "Test query" : "测试关键词"}<Input className="mt-1" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>{testError?.engine === testing.id ? <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800"><ErrorDisclosure code={testError.code} message={testError.message} english={english} /></div> : null}{lastResult ? <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3 font-mono text-xs text-emerald-800">{testing.name}: {lastResult.count} results · {lastResult.latency}ms</div> : testError?.engine === testing.id ? null : <div className="mt-4 rounded-xl bg-slate-950 p-3 font-mono text-[11px] text-slate-300">&gt; ready to test {testing.name}</div>}</Modal> : null}
    {credentialEngine ? <Modal title={`${t.configure} · ${credentialEngine.name}`} onClose={() => { if (!savingCredential) setCredentialEngine(null); }} closeLabel={english ? "Close API Key dialog" : "关闭 API Key 配置弹窗"} footer={<div className="flex w-full flex-wrap items-center justify-between gap-2"><Button variant="ghost" className="text-red-600 hover:bg-red-50" disabled={savingCredential || !credentialEngine.apiKeyConfigured} onClick={() => void clearCredential()}><Icon name="trash" />{english ? "Clear saved key" : "清除已保存密钥"}</Button><div className="flex gap-2"><Button variant="secondary" disabled={savingCredential} onClick={() => setCredentialEngine(null)}>{english ? "Cancel" : "取消"}</Button><Button disabled={savingCredential} onClick={() => void saveCredential()}>{savingCredential ? "…" : (english ? "Save Key" : "保存 Key")}</Button></div></div>}><div className="space-y-4"><label className="block text-xs font-bold text-slate-700">API Key<Input autoFocus className="mt-1 font-mono" type="password" placeholder={credentialEngine.apiKeyConfigured ? (english ? "Enter a new key to replace the saved one" : "输入新密钥以替换已保存密钥") : (english ? "Paste the API Key" : "粘贴 API Key")} value={credentialDraft} onChange={(event) => setCredentialDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveCredential(); }} /></label>{enableAfterSave ? <p className="text-xs font-semibold text-blue-700">{english ? "After saving, this engine will be enabled automatically." : "保存后会自动尝试启用此引擎。"}</p> : null}</div></Modal> : null}
  </section>;
}
