"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Toast } from "@/components/ui/toast";
import { Icon } from "@/components/ui/icon";
import { PortalProvider, usePortal } from "@/components/portal/portal-context";
import { PortalShell } from "@/components/portal/portal-shell";
import { SearchPage } from "@/components/portal/pages/search-page";
import { McpPage } from "@/components/portal/pages/mcp-page";
import { EnginesPage } from "@/components/portal/pages/engines-page";
import { UsagePage } from "@/components/portal/pages/usage-page";
import { SettingsPage } from "@/components/portal/pages/settings-page";
import type { PortalTab } from "@/types/portal";
import { api } from "@/lib/api";

function LoginScreen() {
  const { locale } = usePortal();
  const english = locale === "en";
  const [hasOidcError, setHasOidcError] = useState(false);
  useEffect(() => { setHasOidcError(new URLSearchParams(window.location.search).get("authError") === "oidc_failed"); }, []);
  const t = english ? { subtitle: "Self-hosted search and Remote MCP service.", signIn: "Continue with Lazycat" } : { subtitle: "自托管联网搜索与远程 MCP 服务。", signIn: "使用懒猫账号登录" };
  return (
    <main className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-md">
      <Card className="white-card relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-2xl">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-blue-600 via-sky-500 to-indigo-600" />
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-blue-600 text-3xl font-bold text-white shadow-lg shadow-blue-500/30"><Icon name="planet" weight="fill" className="text-3xl" /></div>
        <h2 className="mb-1 text-2xl font-extrabold tracking-tight text-slate-900">{english ? "Lazycat Search" : "懒猫搜索"}</h2>
        <p className="mb-6 text-xs text-slate-500">{t.subtitle}</p>
        {hasOidcError ? <p role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-left text-xs font-semibold text-red-700"><Icon name="warning-circle" className="mt-0.5 shrink-0 text-base text-red-600" />{english ? "Authorization could not be completed. Please try again." : "授权登录未完成，请重新尝试。"}</p> : null}
        <Button type="button" className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3 shadow-md shadow-blue-600/30" onClick={() => window.location.assign("/api/auth/oidc/start")}>{t.signIn} <Icon name="arrow-right" /></Button>
      </Card>
    </main>
  );
}

function PortalWorkspace() {
  const { locale, setLocale, toast, refresh } = usePortal();
  const [active, setActive] = useState<PortalTab>("search");
  const [loggedIn, setLoggedIn] = useState(false);
  const [checking, setChecking] = useState(true);
  useEffect(() => { let cancelled = false; void api.me().then(async () => { await refresh(); if (!cancelled) setLoggedIn(true); }).catch(() => { if (!cancelled) setLoggedIn(false); }).finally(() => { if (!cancelled) setChecking(false); }); return () => { cancelled = true; }; }, [refresh]);
  if (checking) return <main className="grid min-h-screen place-items-center text-sm font-bold text-slate-500">{locale === "zh" ? "懒猫搜索" : "Lazycat Search"}</main>;
  if (!loggedIn) return <LoginScreen />;
  const pages = { search: <SearchPage />, mcp: <McpPage />, engines: <EnginesPage />, usage: <UsagePage />, settings: <SettingsPage /> };
  return <><PortalShell active={active} onNavigate={setActive} locale={locale} onLocaleChange={setLocale} onLogout={() => { void api.logout(); setLoggedIn(false); }}>{pages[active]}</PortalShell>{toast ? <Toast {...toast} /> : null}</>;
}

export function PortalApp() { return <PortalProvider><PortalWorkspace /></PortalProvider>; }
