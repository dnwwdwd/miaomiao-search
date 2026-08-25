"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import type { Locale, PortalTab, ServiceStatus } from "@/types/portal";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Tag } from "@/components/ui/tag";
import { usePortal } from "@/components/portal/portal-context";

const navigation: Array<{ id: PortalTab; zh: string; en: string; icon: string }> = [
  { id: "search", zh: "联网搜索", en: "Web search", icon: "magnifying-glass" },
  { id: "mcp", zh: "MCP 服务", en: "MCP service", icon: "plugs-connected" },
  { id: "engines", zh: "引擎管理", en: "Engine management", icon: "cpu" },
  { id: "usage", zh: "统计审计", en: "Usage audit", icon: "chart-line-up" },
  { id: "settings", zh: "系统配置", en: "System settings", icon: "gear" },
];

const serviceStatusTone: Record<ServiceStatus, "neutral" | "green" | "red"> = {
  checking: "neutral",
  online: "green",
  offline: "red",
};

export function PortalShell({ active, onNavigate, locale, onLocaleChange, onLogout, children }: { active: PortalTab; onNavigate: (tab: PortalTab) => void; locale: Locale; onLocaleChange: (locale: Locale) => void; onLogout: () => void; children: ReactNode }) {
  const { engines, usageLogs, serviceStatus } = usePortal();
  const cacheHits = usageLogs.filter((log) => log.cacheHit).length;
  const cacheRate = usageLogs.length ? Math.round((cacheHits / usageLogs.length) * 100) : 0;
  const enabled = engines.filter((engine) => engine.enabled).length;
  const appName = locale === "zh" ? "懒猫搜索" : "Lazycat Search";
  const statusText = serviceStatus === "online"
    ? (locale === "zh" ? "服务在线" : "Service online")
    : serviceStatus === "offline"
      ? (locale === "zh" ? "服务离线" : "Service offline")
      : (locale === "zh" ? "服务连接中" : "Connecting");

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-slate-50 text-slate-800">
      <header className="z-30 flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 text-xs shadow-2xs md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Image src="/icon.png" alt="Lazycat Search" width={32} height={32} className="size-8 shrink-0 rounded-xl object-cover shadow-md shadow-blue-500/20" priority />
          <span className="truncate text-sm font-extrabold tracking-tight text-slate-900">{appName}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2 md:gap-3">
          <Tag tone={serviceStatusTone[serviceStatus]} className="gap-1.5 px-2.5 py-1 text-[10px]" aria-live="polite"><span className={cn("size-1.5 rounded-full", serviceStatus === "online" ? "bg-emerald-500" : serviceStatus === "offline" ? "bg-red-500" : "bg-slate-400")} />{statusText}</Tag>
          <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5" aria-label={locale === "zh" ? "语言选择" : "Language selector"}>
            <button type="button" onClick={() => onLocaleChange("zh")} className={cn("rounded-md px-2.5 py-1 text-[11px] font-bold", locale === "zh" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600")}>中文</button>
            <button type="button" onClick={() => onLocaleChange("en")} className={cn("rounded-md px-2.5 py-1 text-[11px] font-bold", locale === "en" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600")}>EN</button>
          </div>
          <Button variant="ghost" onClick={onLogout} className="min-h-8 border border-slate-200 bg-slate-100 px-3 hover:border-red-200 hover:bg-red-50 hover:text-red-600"><Icon name="sign-out" />{locale === "zh" ? "登出" : "Logout"}</Button>
        </div>
      </header>
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <aside className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 flex h-[72px] shrink-0 rounded-3xl border-t border-slate-200/90 bg-white/95 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:relative md:inset-auto md:z-20 md:h-auto md:w-60 md:flex-col md:rounded-none md:border-r md:border-t-0 md:bg-white md:shadow-xs md:backdrop-blur-none">
          <nav className="flex flex-1 flex-row items-center justify-around gap-1 overflow-visible p-2 md:block md:space-y-1 md:overflow-y-auto md:p-3" aria-label={locale === "zh" ? "主导航" : "Main navigation"}>
            {navigation.map((item) => <button key={item.id} type="button" onClick={() => onNavigate(item.id)} title={locale === "zh" ? item.zh : item.en} aria-label={locale === "zh" ? item.zh : item.en} aria-current={active === item.id ? "page" : undefined} className={cn("flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center rounded-2xl px-2 py-2 text-[10px] font-semibold transition-[background-color,color,transform,box-shadow] active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:w-full md:flex-row md:items-center md:justify-start md:rounded-xl md:px-3.5 md:py-2.5 md:text-left md:text-xs", active === item.id ? "border border-blue-200/80 bg-blue-50/80 font-bold text-blue-800 shadow-sm md:shadow-none" : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900")}><Icon name={item.icon} weight="fill" className={cn("text-xl leading-none md:mr-3 md:text-lg", active === item.id ? "text-blue-600" : "text-slate-500")} /><span className="hidden md:inline">{locale === "zh" ? item.zh : item.en}</span>{item.id === "mcp" ? <span className="ml-auto hidden rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-700 md:inline">HTTP</span> : null}{item.id === "engines" ? <span className="ml-auto hidden rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 md:inline">{enabled}/{engines.length}</span> : null}</button>)}
          </nav>
          <div className="m-3 hidden space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs md:block"><div className="flex items-center justify-between text-slate-600"><span className="text-[11px] font-medium">{locale === "zh" ? "缓存命中率" : "Cache hit rate"}</span><span className="font-mono font-bold text-blue-600">{cacheRate}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: `${cacheRate}%` }} /></div><div className="flex justify-between pt-1 text-[10px] text-slate-400"><span>SQLite: 7.2 MB</span></div></div>
        </aside>
        <main className="portal-main min-w-0 flex-1 overflow-y-auto bg-slate-50/50 p-4 md:p-8"><div className="mx-auto w-full max-w-5xl pb-16">{children}</div></main>
      </div>
    </div>
  );
}
