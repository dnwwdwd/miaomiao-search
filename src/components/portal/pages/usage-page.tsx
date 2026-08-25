"use client";

import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dropdown } from "@/components/ui/dropdown";
import { Icon } from "@/components/ui/icon";
import { EngineTag } from "@/components/ui/engine-tag";
import { usePortal } from "@/components/portal/portal-context";
import type { UsageData, UsageLog, UsageQuery } from "@/types/portal";

type RangePreset = "24h" | "7d" | "30d" | "90d" | "custom";
type FilterValue = "all" | string;

const DAY_MS = 24 * 60 * 60 * 1_000;
const number = (value: number, locale: string) => new Intl.NumberFormat(locale === "en" ? "en-US" : "zh-CN").format(value);
const shortTime = (value: string, locale: string) => new Intl.DateTimeFormat(locale, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
const statusClass = (status: UsageLog["status"]) => status === "Error" ? "border-red-200 bg-red-50 text-red-700" : status === "Partial" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700";

function timeZone() { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai"; }

function dateInputValue(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function presetRange(preset: Exclude<RangePreset, "custom">): UsageQuery {
  const to = new Date();
  const from = new Date(to.getTime() - (preset === "24h" ? DAY_MS : preset === "7d" ? 7 * DAY_MS : preset === "30d" ? 30 * DAY_MS : 90 * DAY_MS));
  return { from: from.toISOString(), to: to.toISOString(), channel: "all", status: "all", page: 1, pageSize: 20, timeZone: timeZone() };
}

function customRange(fromValue: string, toValue: string): UsageQuery | null {
  if (!fromValue || !toValue) return null;
  const from = new Date(`${fromValue}T00:00:00`);
  const to = new Date(`${toValue}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) return null;
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString(), channel: "all", status: "all", page: 1, pageSize: 20, timeZone: timeZone() };
}

function rangeLabel(range: UsageData["range"], locale: string) {
  const formatter = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const end = new Date(new Date(range.to).getTime() - 1);
  return `${formatter.format(new Date(range.from))} – ${formatter.format(end)}`;
}

function seriesLabel(bucket: string, mode: "hour" | "day", locale: string) {
  if (mode === "hour") return bucket.slice(11, 16);
  const date = new Date(`${bucket}T00:00:00`);
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}

export function UsagePage() {
  const { locale, notify } = usePortal();
  const english = locale === "en";
  const [draftPreset, setDraftPreset] = useState<RangePreset>("7d");
  const [customFrom, setCustomFrom] = useState(() => dateInputValue(new Date(Date.now() - 7 * DAY_MS)));
  const [customTo, setCustomTo] = useState(() => dateInputValue(new Date()));
  const [range, setRange] = useState<UsageQuery>(() => presetRange("7d"));
  const [channel, setChannel] = useState<FilterValue>("all");
  const [operation, setOperation] = useState<FilterValue>("all");
  const [status, setStatus] = useState<FilterValue>("all");
  const [engine, setEngine] = useState<FilterValue>("all");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<UsageData | null>(null);
  const [loadedQueryKey, setLoadedQueryKey] = useState<string | null>(null);
  const queryKey = [range.from, range.to, range.timeZone, channel, operation, status, engine, page, reloadKey].join("|");
  const loading = loadedQueryKey !== queryKey;

  useEffect(() => {
    let active = true;
    void api.usage({ ...range, channel: channel as UsageQuery["channel"], operation: operation === "all" ? undefined : operation, status: status as UsageQuery["status"], engine: engine === "all" ? undefined : engine, page }).then((next) => {
      if (active) {
        setData(next);
        setLoadedQueryKey(queryKey);
      }
    }).catch((error) => {
      if (active) {
        setLoadedQueryKey(queryKey);
        notify(error instanceof Error ? error.message : (english ? "Unable to load audit data." : "审计数据加载失败。"), "error");
      }
    });
    return () => { active = false; };
  }, [range, channel, operation, status, engine, page, queryKey, notify, english]);

  const text = english
    ? { title: "Usage statistics and audit logs", subtitle: "Review traffic, reliability, and engine contribution across a selected time range.", range: "Time range", custom: "Custom range", apply: "Apply range", calls: "Total requests", success: "Success rate", errors: "Errors", cache: "Cache hit rate", latency: "Avg latency", p95: "P95 latency", results: "Avg results", trend: "Request trend", trendDesc: "Requests grouped by selected range", status: "Outcome mix", channel: "Traffic split", operations: "Operation mix", enginesTitle: "Engine contribution", logs: "Request audit logs", allChannels: "All channels", allOperations: "All operations", allStatuses: "All statuses", allEngines: "All engines", clear: "Reset filters", previous: "Previous", next: "Next", noLogs: "No logs match the selected filters.", noData: "No audit data in this time range.", records: "records", web: "Web", mcp: "MCP", successes: "successful", partial: "partial", error: "errors", avg: "avg", today: "selected range" }
    : { title: "调用统计与审计日志", subtitle: "按时间范围查看流量、稳定性和搜索引擎贡献。", range: "统计范围", custom: "自定义范围", apply: "应用范围", calls: "总调用量", success: "成功率", errors: "错误请求", cache: "缓存命中率", latency: "平均延迟", p95: "P95 延迟", results: "平均结果数", trend: "调用趋势", trendDesc: "按当前时间范围聚合", status: "结果状态", channel: "流量来源", operations: "操作类型", enginesTitle: "引擎贡献", logs: "请求审计日志", allChannels: "全部 Channel", allOperations: "全部 Operation", allStatuses: "全部状态", allEngines: "全部引擎", clear: "重置筛选", previous: "上一页", next: "下一页", noLogs: "当前筛选条件下没有日志。", noData: "当前统计范围内暂无审计数据。", records: "条记录", web: "Web", mcp: "MCP", successes: "成功", partial: "部分成功", error: "错误", avg: "平均", today: "当前范围" };

  const summary = data?.summary ?? { total: 0, success: 0, partial: 0, errors: 0, cacheHits: 0, avgLatencyMs: 0, p95LatencyMs: 0, avgResultCount: 0 };
  const channels = data?.channels ?? { web: 0, mcp: 0 };
  const successRate = summary.total ? Math.round(((summary.success + summary.partial) / summary.total) * 100) : 0;
  const cacheRate = summary.total ? Math.round((summary.cacheHits / summary.total) * 100) : 0;
  const webShare = summary.total ? Math.round((channels.web / summary.total) * 100) : 0;
  const mcpShare = summary.total ? 100 - webShare : 0;
  const series = data?.series ?? [];
  const maxSeries = Math.max(1, ...series.map((item) => item.total));
  const totalPages = data?.pagination.totalPages ?? 1;
  const currentPage = data?.pagination.page ?? page;

  const changePreset = (value: RangePreset) => {
    setDraftPreset(value);
    setPage(1);
    if (value !== "custom") setRange(presetRange(value));
  };
  const commitCustom = (fromValue: string, toValue: string) => {
    const next = customRange(fromValue, toValue);
    if (!next) return false;
    setPage(1);
    setRange(next);
    return true;
  };
  const applyCustom = () => {
    if (!commitCustom(customFrom, customTo)) notify(english ? "Choose a valid start and end date." : "请选择有效的起止日期。", "error");
  };
  const clearFilters = () => { setChannel("all"); setOperation("all"); setStatus("all"); setEngine("all"); setPage(1); };
  const pageSummary = data?.pagination.total ? `${(currentPage - 1) * (data.pagination.pageSize) + 1}-${Math.min(currentPage * data.pagination.pageSize, data.pagination.total)} / ${data.pagination.total}` : "0 / 0";

  return (
    <section className="usage-page mx-auto max-w-6xl space-y-5 pb-16">
      <div className="usage-hero rounded-3xl border border-blue-100/80 bg-white px-5 py-6 shadow-sm sm:px-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div><div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600"><span className="size-1.5 rounded-full bg-blue-500" />OBSERVABILITY / AUDIT</div><h1 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-[2.15rem]">{text.title}</h1><p className="mt-2 max-w-2xl text-xs leading-6 text-slate-500">{text.subtitle}</p></div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="min-w-44 text-[10px] font-bold uppercase tracking-wider text-slate-500">{text.range}<Dropdown containerClassName="mt-1 w-full" className="min-h-9 rounded-xl bg-slate-50 px-3 text-xs normal-case tracking-normal" value={draftPreset} onChange={changePreset} ariaLabel={text.range} options={[{ value: "24h", label: english ? "Last 24 hours" : "最近 24 小时" }, { value: "7d", label: english ? "Last 7 days" : "最近 7 天" }, { value: "30d", label: english ? "Last 30 days" : "最近 30 天" }, { value: "90d", label: english ? "Last 90 days" : "最近 90 天" }, { value: "custom", label: text.custom }]} /></label>
            <Button variant="secondary" className="min-h-9 rounded-xl px-3" disabled={loading} onClick={() => setReloadKey((value) => value + 1)}><Icon name="arrow-clockwise" className={loading ? "animate-spin" : ""} />{english ? "Refresh" : "刷新数据"}</Button>
          </div>
        </div>
            {draftPreset === "custom" ? <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-end"><label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{english ? "From" : "开始日期"}<input type="date" value={customFrom} onChange={(event) => { const value = event.target.value; setCustomFrom(value); commitCustom(value, customTo); }} className="mt-1 block min-h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-mono font-normal normal-case tracking-normal text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label><label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{english ? "To" : "结束日期"}<input type="date" value={customTo} onChange={(event) => { const value = event.target.value; setCustomTo(value); commitCustom(customFrom, value); }} className="mt-1 block min-h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-mono font-normal normal-case tracking-normal text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label><Button className="min-h-9 rounded-xl px-4" onClick={applyCustom}>{text.apply}</Button></div> : null}
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-4 text-[10px] text-slate-400"><span className="flex items-center gap-1.5"><Icon name="calendar" className="text-blue-500" />{data ? rangeLabel(data.range, locale) : "—"}</span><span className="flex items-center gap-1.5"><Icon name="clock" className="text-blue-500" />{text.web} {channels.web} · {text.mcp} {channels.mcp} ({text.today})</span><span className="font-mono text-slate-400">{summary.total} {text.records}</span></div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
        <Metric label={text.calls} value={number(summary.total, locale)} detail={`${text.web} ${webShare}% / ${text.mcp} ${mcpShare}%`} icon="activity" tone="blue" />
        <Metric label={text.success} value={`${successRate}%`} detail={`${number(summary.success + summary.partial, locale)} ${text.successes}`} icon="check-circle" tone="green" />
        <Metric label={text.errors} value={number(summary.errors, locale)} detail={`${number(summary.partial, locale)} ${text.partial}`} icon="warning-circle" tone="red" />
        <Metric label={text.cache} value={`${cacheRate}%`} detail={`${number(summary.cacheHits, locale)} ${english ? "cache hits" : "次命中"}`} icon="lightning" tone="indigo" />
        <Metric label={text.latency} value={<>{summary.avgLatencyMs}<span className="text-xs font-normal text-slate-400">ms</span></>} detail={english ? "End-to-end" : "端到端耗时"} icon="timer" tone="slate" />
        <Metric label={text.p95} value={<>{summary.p95LatencyMs}<span className="text-xs font-normal text-slate-400">ms</span></>} detail={english ? "Slowest 5% boundary" : "较慢请求边界"} icon="chart-line-up" tone="amber" />
        <Metric label={text.results} value={summary.avgResultCount} detail={english ? "Per request" : "每次请求平均"} icon="list-bullets" tone="slate" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.45fr_0.95fr]">
        <Card className="usage-panel overflow-hidden rounded-2xl border-slate-200 bg-white p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-bold text-slate-900">{text.trend}</h2><p className="mt-1 text-[10px] text-slate-400">{text.trendDesc}</p></div><div className="flex gap-3 text-[10px] font-semibold text-slate-500"><span className="flex items-center gap-1"><i className="size-2 rounded-full bg-blue-500" />{text.web}</span><span className="flex items-center gap-1"><i className="size-2 rounded-full bg-indigo-400" />{text.mcp}</span></div></div>{series.length ? <div className="mt-5 overflow-x-auto pb-1"><div className="grid min-w-[560px] items-end gap-2 border-b border-l border-slate-100 px-2 pb-0 pt-3" style={{ gridTemplateColumns: `repeat(${series.length}, minmax(22px, 1fr))` }}>{series.map((item) => <div key={item.bucket} className="flex h-40 flex-col items-center justify-end gap-2"><div className="flex h-full w-full items-end" title={`${item.bucket}: ${item.total}`}><div className="flex w-full flex-col justify-end overflow-hidden rounded-t-md bg-slate-100" style={{ height: `${Math.max(item.total ? 10 : 2, (item.total / maxSeries) * 100)}%` }}><div className="min-h-0 bg-indigo-400" style={{ height: `${item.total ? (item.mcp / item.total) * 100 : 0}%` }} /><div className="min-h-0 bg-blue-500" style={{ height: `${item.total ? (item.web / item.total) * 100 : 0}%` }} /></div></div><span className="font-mono text-[9px] text-slate-400">{seriesLabel(item.bucket, data?.range.bucket ?? "day", locale)}</span></div>)}</div></div> : <EmptyState label={text.noData} />}</Card>
        <Card className="usage-panel rounded-2xl border-slate-200 bg-white p-5"><div className="flex items-start justify-between"><div><h2 className="text-sm font-bold text-slate-900">{text.status}</h2><p className="mt-1 text-[10px] text-slate-400">Success / Partial / Error</p></div><Icon name="chart-donut" className="text-xl text-blue-500" /></div><div className="mt-6 flex h-3 overflow-hidden rounded-full bg-slate-100"><div className="bg-emerald-500" style={{ width: `${summary.total ? (summary.success / summary.total) * 100 : 0}%` }} /><div className="bg-amber-400" style={{ width: `${summary.total ? (summary.partial / summary.total) * 100 : 0}%` }} /><div className="bg-red-500" style={{ width: `${summary.total ? (summary.errors / summary.total) * 100 : 0}%` }} /></div><div className="mt-5 grid grid-cols-3 gap-2"><StatusStat label={text.successes} count={summary.success} total={summary.total} color="text-emerald-700" /><StatusStat label={text.partial} count={summary.partial} total={summary.total} color="text-amber-700" /><StatusStat label={text.error} count={summary.errors} total={summary.total} color="text-red-700" /></div><div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 text-[10px] text-slate-500"><span>{text.channel}</span><span className="font-mono font-bold text-blue-700">{text.web} {webShare}% · {text.mcp} {mcpShare}%</span></div></Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.95fr_1.45fr]">
        <Card className="usage-panel rounded-2xl border-slate-200 bg-white p-5"><div className="flex items-start justify-between"><div><h2 className="text-sm font-bold text-slate-900">{text.operations}</h2><p className="mt-1 text-[10px] text-slate-400">{english ? "Calls and average latency" : "调用量与平均延迟"}</p></div><Icon name="stack" className="text-xl text-indigo-500" /></div><div className="mt-4 space-y-3">{data?.operations.length ? data.operations.map((item) => <div key={item.name}><div className="mb-1 flex items-center justify-between gap-3 text-[10px]"><span className="truncate font-semibold text-slate-700">{item.name}</span><span className="shrink-0 font-mono tabular-nums text-slate-400">{item.count} · {item.avgLatencyMs}ms</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-400" style={{ width: `${Math.max(summary.total ? (item.count / summary.total) * 100 : 0, 4)}%` }} /></div></div>) : <EmptyState label={text.noData} compact />}</div></Card>
        <Card className="usage-panel overflow-hidden rounded-2xl border-slate-200 bg-white"><div className="flex items-start justify-between border-b border-slate-100 bg-slate-50/60 p-5"><div><h2 className="text-sm font-bold text-slate-900">{text.enginesTitle}</h2><p className="mt-1 text-[10px] text-slate-400">{english ? "Traffic, reliability, cache, and latency" : "流量、成功率、缓存与延迟"}</p></div><Icon name="cpu" className="text-xl text-blue-500" /></div><div className="table-scroll overflow-x-auto"><table className="w-full min-w-[600px] text-left text-xs"><thead><tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400"><th className="p-3 pl-5">{english ? "Engine" : "引擎"}</th><th className="p-3 text-right">{english ? "Calls" : "调用"}</th><th className="p-3 text-right">{english ? "Success" : "成功率"}</th><th className="p-3 text-right">{english ? "Cache" : "缓存"}</th><th className="p-3 text-right">{english ? "Avg latency" : "平均延迟"}</th><th className="p-3 pr-5 text-right">{english ? "Avg results" : "平均结果"}</th></tr></thead><tbody className="divide-y divide-slate-100">{data?.engines.length ? data.engines.map((item) => <tr key={item.engine}><td className="p-3 pl-5"><EngineTag engine={item.engine} compact /></td><td className="p-3 text-right font-mono font-bold tabular-nums text-slate-800">{item.calls}</td><td className="p-3 text-right font-mono font-bold tabular-nums text-emerald-600">{item.calls ? Math.round((item.success / item.calls) * 100) : 0}%</td><td className="p-3 text-right font-mono tabular-nums text-blue-700">{item.calls ? Math.round((item.cacheHits / item.calls) * 100) : 0}%</td><td className="p-3 text-right font-mono tabular-nums text-slate-600">{item.avgLatencyMs}ms</td><td className="p-3 pr-5 text-right font-mono tabular-nums text-slate-600">{item.avgResultCount}</td></tr>) : <tr><td colSpan={6}><EmptyState label={text.noData} /></td></tr>}</tbody></table></div></Card>
      </div>

      <Card className="usage-panel overflow-hidden rounded-2xl border-slate-200 bg-white"><div className="space-y-3 border-b border-slate-100 bg-slate-50/60 p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><h2 className="text-sm font-bold text-slate-900">{text.logs}</h2><span className="rounded-lg bg-blue-50 px-2 py-1 font-mono text-[10px] font-bold text-blue-700">{pageSummary}</span></div><p className="mt-1 text-[10px] text-slate-400">{english ? "Server-side filters for the selected time range" : "服务端按当前统计范围筛选并分页"}</p></div><Button variant="ghost" className="min-h-8 self-start rounded-lg px-2.5 text-[11px]" onClick={clearFilters}><Icon name="funnel-simple" />{text.clear}</Button></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Dropdown containerClassName="w-full" className="min-h-8 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-normal" value={channel} onChange={(value) => { setChannel(value); setPage(1); }} ariaLabel={text.allChannels} options={[{ value: "all", label: text.allChannels }, { value: "web", label: "Web" }, { value: "mcp", label: "MCP" }]} /><Dropdown containerClassName="w-full" className="min-h-8 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-normal" value={operation} onChange={(value) => { setOperation(value); setPage(1); }} ariaLabel={text.allOperations} options={[{ value: "all", label: text.allOperations }, ...(data?.facets.operations ?? []).map((item) => ({ value: item, label: item }))]} /><Dropdown containerClassName="w-full" className="min-h-8 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-normal" value={status} onChange={(value) => { setStatus(value); setPage(1); }} ariaLabel={text.allStatuses} options={[{ value: "all", label: text.allStatuses }, { value: "success", label: english ? "Success" : "成功" }, { value: "partial", label: english ? "Partial" : "部分成功" }, { value: "error", label: english ? "Error" : "错误" }]} /><Dropdown containerClassName="w-full" className="min-h-8 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-normal" value={engine} onChange={(value) => { setEngine(value); setPage(1); }} ariaLabel={text.allEngines} options={[{ value: "all", label: text.allEngines }, ...(data?.facets.engines ?? []).map((item) => ({ value: item, label: item }))]} /></div></div><div className="table-scroll overflow-x-auto"><table className="w-full min-w-[1100px] border-collapse text-left"><thead><tr className="border-b border-slate-200 bg-slate-100/70 text-[10px] font-bold uppercase tracking-wider text-slate-500"><th className="p-3 pl-5">Request ID</th><th className="p-3">Channel</th><th className="p-3">Operation</th><th className="p-3">Token</th><th className="p-3">Engines</th><th className="p-3 text-right">Latency</th><th className="p-3 text-right">Cache</th><th className="p-3 text-right">Results</th><th className="p-3">Status</th><th className="p-3">Error</th><th className="p-3 pr-5">Created At</th></tr></thead><tbody className="divide-y divide-slate-100 font-mono text-xs text-slate-700">{data?.logs.length ? data.logs.map((log) => <tr key={log.id} className="transition-colors hover:bg-blue-50/40"><td className="max-w-44 truncate p-3 pl-5 text-slate-500" title={log.id}>{log.id}</td><td className={`p-3 font-bold ${log.channel === "MCP" ? "text-blue-600" : "text-slate-800"}`}>{log.channel}</td><td className="p-3 font-bold text-slate-800">{log.operation}</td><td className="p-3 text-[11px] text-slate-400">{log.token}</td><td className="max-w-52 truncate p-3 text-slate-500">{log.engines.join(", ") || "—"}</td><td className="p-3 text-right tabular-nums text-slate-600">{log.latency}ms</td><td className="p-3 text-right"><span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${log.cacheHit ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>{log.cacheHit ? "HIT" : "MISS"}</span></td><td className="p-3 text-right font-bold tabular-nums text-slate-700">{log.resultCount}</td><td className="p-3"><span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${statusClass(log.status)}`}>{log.status}</span></td><td className={`max-w-48 truncate p-3 text-[10px] ${log.status === "Error" ? "text-red-600" : "text-slate-400"}`} title={log.errorCode}>{log.errorCode}</td><td className="whitespace-nowrap p-3 pr-5 text-slate-500">{shortTime(log.createdAt, english ? "en-US" : "zh-CN")}</td></tr>) : <tr><td colSpan={11}><EmptyState label={data ? text.noLogs : text.noData} /></td></tr>}</tbody></table></div><footer className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3"><span className="font-mono text-[10px] text-slate-400">{currentPage} / {totalPages}</span><Button variant="secondary" className="min-h-8 rounded-lg px-3 py-1.5 text-[11px]" disabled={currentPage <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>{text.previous}</Button><Button variant="secondary" className="min-h-8 rounded-lg px-3 py-1.5 text-[11px]" disabled={currentPage >= totalPages || loading} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>{text.next}</Button></footer></Card>
    </section>
  );
}

function Metric({ label, value, detail, icon, tone }: { label: string; value: ReactNode; detail: string; icon: string; tone: "blue" | "green" | "red" | "indigo" | "amber" | "slate" }) {
  const colors = { blue: "text-blue-600 bg-blue-50", green: "text-emerald-600 bg-emerald-50", red: "text-red-600 bg-red-50", indigo: "text-indigo-600 bg-indigo-50", amber: "text-amber-600 bg-amber-50", slate: "text-slate-700 bg-slate-100" };
  return <Card className="usage-metric rounded-2xl border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-2"><p className="text-[10px] font-semibold text-slate-500">{label}</p><span className={`grid size-7 place-items-center rounded-lg text-sm ${colors[tone]}`}><Icon name={icon} /></span></div><p className="mt-3 font-mono text-2xl font-extrabold tracking-tight text-slate-950 tabular-nums">{value}</p><p className="mt-1 truncate text-[10px] font-semibold text-slate-400">{detail}</p></Card>;
}

function StatusStat({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  return <div className="rounded-xl bg-slate-50 p-2.5"><span className={`block text-[10px] font-semibold ${color}`}>{label}</span><strong className="mt-1 block font-mono text-lg tabular-nums text-slate-900">{count}</strong><span className="text-[9px] text-slate-400">{total ? Math.round((count / total) * 100) : 0}%</span></div>;
}

function EmptyState({ label, compact = false }: { label: string; compact?: boolean }) {
  return <div className={`${compact ? "py-5" : "py-10"} text-center text-xs text-slate-400`}><Icon name="chart-line-up" className="text-2xl text-slate-300" /><p className="mt-2">{label}</p></div>;
}
