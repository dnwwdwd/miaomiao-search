"use client";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { Switch } from "@/components/ui/switch";
import { Icon } from "@/components/ui/icon";
import { EngineTag } from "@/components/ui/engine-tag";
import { usePortal } from "@/components/portal/portal-context";
import type { SettingsState } from "@/types/portal";

function NumberField({ label, value, onChange, help }: { label: string; value: number; onChange: (value: number) => void; help?: string }) {
  return (
    <label className="block text-xs font-semibold text-slate-700">
      <span className="mb-1 block">{label}</span>
      <Input className="font-mono" type="number" min={1} value={value} onChange={(event) => onChange(Math.max(1, Number(event.target.value)))} />
      {help ? <span className="mt-1 block text-[10px] font-normal leading-4 text-slate-400">{help}</span> : null}
    </label>
  );
}


export function SettingsPage() {
  const { settings, setSettings, engines, locale, notify, refresh } = usePortal();
  const english = locale === "en";
  const update = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => setSettings((current) => ({ ...current, [key]: value }));
  const save = async () => {
    try {
      const saved = await api.updateSettings(settings);
      setSettings(saved);
      await refresh();
      notify(english ? "System settings saved." : "系统参数已保存。");
    } catch (error) {
      notify(error instanceof Error ? error.message : "保存失败", "error");
    }
  };
  const clearHistory = async () => {
    try {
      await api.clearHistory();
      await refresh();
      notify(english ? "Search history cleared." : "搜索历史已清除。");
    } catch (error) {
      notify(error instanceof Error ? error.message : "清除失败", "error");
    }
  };
  const testProxy = () => {
    if (!settings.proxyEnabled || !settings.proxyUrl) {
      notify(english ? "Enable the proxy and enter its URL first." : "请先启用代理并填写地址。", "error");
      return;
    }
    try {
      new URL(settings.proxyUrl);
      notify(english ? "URL format is valid. This local runtime has no standalone proxy-test endpoint." : "代理地址格式有效；当前本地运行时未提供独立的代理测试接口。", "info");
    } catch {
      notify(english ? "Enter a complete proxy URL." : "请输入完整的代理地址。", "error");
    }
  };
  const toggleDefault = async (id: string, isDefault: boolean) => {
    try {
      await api.updateEngine(id, { isDefault });
      await refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : "更新失败", "error");
    }
  };
  const t = english
    ? { title: "System settings", subtitle: "Configure proxy, cache, limits, and retention.", cache: "Cache policy", rate: "Rate limits", defaults: "Search defaults", data: "Data management", save: "Save settings" }
    : { title: "系统参数配置", subtitle: "配置代理、缓存、限流和数据保留。", cache: "缓存策略", rate: "限流策略", defaults: "默认搜索参数", data: "数据管理与审计隐私", save: "保存设置" };

  return (
    <section className="mx-auto max-w-5xl space-y-6 pb-20">
      <div><h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{t.title}</h1><p className="mt-1 text-xs text-slate-500">{t.subtitle}</p></div>

      <Card className="white-card space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div><h2 className="flex items-center text-sm font-bold text-slate-900"><Icon name="globe" weight="fill" className="mr-2 text-lg text-blue-600" />{english ? "Network & Proxy (Search Runtime Proxy)" : "网络与代理 (Search Runtime Proxy)"}</h2><p className="mt-0.5 text-xs text-slate-500">{english ? "Used only for outbound HTTP requests to search engines. Passwords are masked automatically." : "仅用于向搜索引擎发起外网 HTTP 请求。密码自动脱敏显示。"}</p></div>
          <Switch size="md" label={english ? "Enable proxy" : "启用搜索代理"} checked={settings.proxyEnabled} onChange={(value) => update("proxyEnabled", value)} />
        </div>
        <div className="space-y-3 text-xs"><label className="block text-slate-700"><span className="mb-1 block font-semibold">Proxy URL</span><div className="flex gap-2"><Input className="flex-1 font-mono" disabled={!settings.proxyEnabled} placeholder="http://admin:••••••••@10.0.0.5:7890" value={settings.proxyUrl} onChange={(event) => update("proxyUrl", event.target.value)} /><Button variant="secondary" className="shrink-0 rounded-xl" onClick={testProxy}>{english ? "Test proxy" : "测试代理"}</Button></div></label></div>
      </Card>

      <Card className="white-card space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="border-b border-slate-100 pb-3"><h2 className="flex items-center text-sm font-bold text-slate-900"><Icon name="hard-drives" weight="fill" className="mr-2 text-lg text-blue-600" />{t.cache}</h2><p className="mt-0.5 text-xs text-slate-500">{english ? "Search cache keys include query + engines + limit + search mode. Web and MCP share the same policy." : "搜索缓存 Key 包含 query + engines + limit + searchMode。MCP 与 Web 共用缓存。"}</p></div>
        <div className="grid grid-cols-1 gap-4 text-xs md:grid-cols-2"><ToggleRow label={english ? "Enable search cache" : "启用搜索缓存"} checked={settings.searchCacheEnabled} onChange={(value) => update("searchCacheEnabled", value)} /><ToggleRow label={english ? "Enable content cache" : "启用正文缓存"} checked={settings.contentCacheEnabled} onChange={(value) => update("contentCacheEnabled", value)} /><NumberField label={english ? "Search result Cache TTL (seconds)" : "搜索结果 Cache TTL (秒)"} value={settings.searchTtl} onChange={(value) => update("searchTtl", value)} /><NumberField label={english ? "Fetched content Cache TTL (seconds)" : "正文抓取 Cache TTL (秒)"} value={settings.contentTtl} onChange={(value) => update("contentTtl", value)} /><NumberField label={english ? "Maximum cache entries" : "搜索缓存最大条数"} value={settings.cacheMaxSize} onChange={(value) => update("cacheMaxSize", value)} /></div>
      </Card>

      <Card className="white-card space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="border-b border-slate-100 pb-3"><h2 className="flex items-center text-sm font-bold text-slate-900"><Icon name="speedometer" weight="fill" className="mr-2 text-lg text-blue-600" />{t.rate}</h2><p className="mt-0.5 text-xs text-slate-500">{english ? "Limit the request pace for Web, MCP, and each search engine separately." : "分别限制 Web、MCP 与单个搜索引擎的请求节奏。"}</p></div>
        <div className="grid grid-cols-1 gap-4 text-xs md:grid-cols-3"><NumberField label={english ? "Web / IP (per minute)" : "Web / IP（每分钟）"} value={settings.webRpm} onChange={(value) => update("webRpm", value)} /><NumberField label={english ? "MCP / Token (per minute)" : "MCP / Token（每分钟）"} value={settings.mcpRpm} onChange={(value) => update("mcpRpm", value)} /><NumberField label={english ? "Per-engine concurrency" : "单引擎并发"} value={settings.engineConcurrency} onChange={(value) => update("engineConcurrency", value)} /></div>
      </Card>

      <Card className="white-card space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="border-b border-slate-100 pb-3"><h2 className="flex items-center text-sm font-bold text-slate-900"><Icon name="sliders" weight="fill" className="mr-2 text-lg text-blue-600" />{t.defaults}</h2></div>
        <div className="grid grid-cols-1 gap-4 text-xs md:grid-cols-2"><div className="md:col-span-2"><label className="mb-2 block font-semibold text-slate-700">{english ? "Default engines" : "默认搜索引擎"}</label><div className="flex flex-wrap gap-2">{engines.map((engine) => <EngineDefaultButton key={engine.id} name={engine.name} checked={engine.isDefault} onClick={() => void toggleDefault(engine.id, !engine.isDefault)} />)}</div></div><label className="block font-semibold text-slate-700">{english ? "Search default result count" : "搜索默认返回数"}<Dropdown containerClassName="mt-1 w-full" className="w-full font-mono" value={settings.defaultLimit} onChange={(value) => update("defaultLimit", value)} ariaLabel={english ? "Search default result count" : "搜索默认返回数"} options={[{ value: 5, label: `5 ${english ? "results" : "条"}` }, { value: 10, label: `10 ${english ? "(search default)" : "条（搜索默认）"}` }, { value: 20, label: `20 ${english ? "results" : "条"}` }, { value: 30, label: `30 ${english ? "results" : "条"}` }, { value: 50, label: `50 ${english ? "results" : "条"}` }]} /></label><div><span className="mb-1 block font-semibold text-slate-700">Bing {english ? "default Search Mode" : "默认 Search Mode"}</span><div className="rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2 font-mono text-slate-600">Request Mode（原生 HTTP）</div></div></div>
      </Card>

      <Card className="white-card space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="border-b border-slate-100 pb-3"><h2 className="flex items-center text-sm font-bold text-slate-900"><Icon name="database" weight="fill" className="mr-2 text-lg text-blue-600" />{t.data}</h2></div>
        <div className="space-y-3 text-xs"><div className="flex items-center justify-between border-b border-slate-100 pb-2"><div><span className="block font-semibold text-slate-800">{english ? "Save search history" : "保存搜索历史"}</span><span className="text-[11px] text-slate-500">{english ? "Disable to stop writing new Web search records." : "关闭后不再写入新的 Web 搜索记录。"}</span></div><Switch size="md" label={english ? "Save search history" : "保存搜索历史"} checked={settings.historyEnabled} onChange={(value) => update("historyEnabled", value)} /></div><div className="flex items-center justify-between"><div><span className="block font-semibold text-slate-800">{english ? "History retention" : "搜索历史保存天数"}</span><span className="text-[11px] text-slate-500">{english ? "Choose a retention period or keep records forever." : "选择保留期限，也可以永久保存。"}</span></div><Dropdown containerClassName="w-auto" className="w-auto px-3 py-1 font-mono" value={settings.historyRetentionDays} onChange={(value) => update("historyRetentionDays", value)} ariaLabel={english ? "History retention" : "搜索历史保存天数"} options={[{ value: -1, label: english ? "Forever" : "永久保存" }, { value: 7, label: `7 ${english ? "days" : "天"}` }, { value: 30, label: `30 ${english ? "days" : "天"}` }, { value: 90, label: `90 ${english ? "days" : "天"}` }]} /></div><div className="flex items-center justify-between border-t border-slate-100 pt-2"><div><span className="block font-semibold text-slate-800">{english ? "Clear search history" : "清空搜索历史"}</span><span className="text-[11px] text-slate-500">{english ? "Remove stored search records immediately." : "立即清除已保存的搜索记录。"}</span></div><Button variant="danger" className="rounded-lg px-3 py-1.5" onClick={() => void clearHistory()}>{english ? "Clear records" : "清空记录"}</Button></div><div className="flex items-center justify-between border-t border-slate-100 pt-2"><div><span className="block font-semibold text-slate-800">{english ? "Store full Query in MCP logs" : "MCP 请求记录完整 Query 到数据库日志"}</span><span className="text-[11px] text-slate-500">{english ? "Disable for stronger privacy; enable for full auditability." : "关闭可提升隐私防护；开启便于全量审计。"}</span></div><Switch size="md" label={english ? "Store full query in logs" : "在日志中记录完整 Query"} checked={settings.logFullQuery} onChange={(value) => update("logFullQuery", value)} /></div></div>
      </Card>

      <div className="flex justify-end"><Button className="rounded-xl px-6 py-2.5 shadow-md shadow-blue-600/20" onClick={() => void save()}><Icon name="check" /> {t.save}</Button></div>
    </section>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2"><span className="font-semibold text-slate-700">{label}</span><Switch size="md" label={label} checked={checked} onChange={onChange} /></div>;
}

function EngineDefaultButton({ name, checked, onClick }: { name: string; checked: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-xl transition-[box-shadow,transform] active:scale-[0.98] ${checked ? "ring-2 ring-blue-500/20" : "opacity-60 grayscale hover:opacity-100"}`} aria-pressed={checked}><EngineTag engine={name} compact /></button>;
}
