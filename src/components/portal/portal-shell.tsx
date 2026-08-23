"use client";

import type { ReactNode } from "react";
import type { Locale, PortalTab } from "@/types/portal";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { usePortal } from "@/components/portal/portal-context";

const navigation: Array<{ id: PortalTab; zh: string; en: string; icon: string }> = [
  { id: "search", zh: "联网搜索", en: "Web search", icon: "magnifying-glass" },
  { id: "mcp", zh: "MCP 服务", en: "MCP service", icon: "plugs-connected" },
  { id: "engines", zh: "引擎管理", en: "Engine management", icon: "cpu" },
  { id: "usage", zh: "统计审计", en: "Usage audit", icon: "chart-line-up" },
  { id: "settings", zh: "系统配置", en: "System settings", icon: "gear" },
];

export function PortalShell({ active, onNavigate, locale, onLocaleChange, onLogout, children }: { active: PortalTab; onNavigate: (tab: PortalTab) => void; locale: Locale; onLocaleChange: (locale: Locale) => void; onLogout: () => void; children: ReactNode }) {
  const { engines, usageLogs } = usePortal();
  const cacheHits = usageLogs.filter((log) => log.cacheHit).length;
  const cacheRate = usageLogs.length ? Math.round((cacheHits / usageLogs.length) * 100) : 0;
  const enabled = engines.filter((engine) => engine.enabled).length;
  return (
    <div className="flex h-screen min-h-[640px] w-full flex-col overflow-hidden bg-slate-50 text-slate-800">
      <header className="z-30 flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3 text-xs shadow-[0_1px_2px_rgba(15,23,42,0.03)] md:px-5">
        <div className="flex items-center gap-3"><div className="grid size-8 place-items-center rounded-xl bg-gradient-to-tr from-blue-700 via-blue-600 to-indigo-600 text-xl font-bold text-white shadow-md shadow-blue-500/20"><Icon name="planet" weight="fill" className="text-xl" /></div><div><span className="block text-sm font-extrabold leading-none tracking-tight text-slate-900">lazycat-search</span><span className="font-mono text-[10px] font-bold text-blue-600">PRD v0.5 Specification</span></div></div>
        <div className="flex items-center gap-2 md:gap-3"><div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5" aria-label="语言选择"><button type="button" onClick={() => onLocaleChange("zh")} className={cn("rounded-md px-2.5 py-1 text-[11px] font-bold", locale === "zh" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600")}>中文</button><button type="button" onClick={() => onLocaleChange("en")} className={cn("rounded-md px-2.5 py-1 text-[11px] font-bold", locale === "en" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600")}>EN</button></div><div className="hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600 sm:flex"><span className="size-2 rounded-full bg-emerald-500" /><span className="font-semibold text-slate-800">{locale === "zh" ? "管理员会话已启用" : "Admin Session Active"}</span></div><Button variant="ghost" onClick={onLogout} className="min-h-8 border border-slate-200 bg-slate-100 px-3 hover:border-red-200 hover:bg-red-50 hover:text-red-600">{locale === "zh" ? "登出" : "Logout"}</Button></div>
      </header>
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <aside className="z-20 flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white shadow-[1px_0_2px_rgba(15,23,42,0.02)] max-md:w-[68px]">
          <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="主导航">
            {navigation.map((item) => <button key={item.id} type="button" onClick={() => onNavigate(item.id)} title={locale === "zh" ? item.zh : item.en} className={cn("flex w-full items-center rounded-xl px-3.5 py-2.5 text-left text-xs font-semibold transition-[background-color,color,transform] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500", active === item.id ? "border border-blue-200/80 bg-blue-50/80 font-bold text-blue-800" : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900")}><Icon name={item.icon} weight="fill" className={cn("mr-3 text-lg leading-none max-md:mr-0", active === item.id ? "text-blue-600" : "text-slate-500")} /><span className="max-md:hidden">{locale === "zh" ? item.zh : item.en}</span>{item.id === "mcp" ? <span className="ml-auto rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-700 max-md:hidden">HTTP</span> : null}{item.id === "engines" ? <span className="ml-auto rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 max-md:hidden">{enabled}/{engines.length}</span> : null}</button>)}
          </nav>
          <div className="m-3 hidden space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs lg:block"><div className="flex items-center justify-between text-slate-600"><span className="text-[11px] font-medium">{locale === "zh" ? "缓存命中率" : "Cache hit rate"}</span><span className="font-mono font-bold text-blue-600">{cacheRate}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: `${cacheRate}%` }} /></div><div className="flex justify-between pt-1 text-[10px] text-slate-400"><span>SQLite · local</span><span className="font-bold text-emerald-600">Streamable HTTP</span></div></div>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto bg-slate-50/50 p-4 md:p-8"><div className="mx-auto w-full max-w-5xl pb-16">{children}</div></main>
      </div>
    </div>
  );
}
