"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

function LoginScreen({ onLogin }: { onLogin: () => Promise<void> }) {
  const { locale } = usePortal();
  const english = locale === "en";
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const t = english ? { title: "Administrator sign in", subtitle: "Self-hosted multi-engine search & Remote MCP service (v0.5)", username: "Administrator username", password: "Password", passwordPlaceholder: "Enter administrator password", signIn: "Sign in" } : { title: "管理员登录", subtitle: "自托管多引擎联网搜索 & Remote MCP 服务 (v0.5)", username: "管理员用户名", password: "密码", passwordPlaceholder: "请输入管理员密码", signIn: "登录系统" };
  const submit = async (event: FormEvent) => { event.preventDefault(); setError(null); setSubmitting(true); try { await api.login(username, password); await onLogin(); } catch (reason) { setError(reason instanceof Error ? reason.message : (english ? "The username or password is incorrect." : "用户名或密码错误，请重新输入。")); } finally { setSubmitting(false); } };
  const simulatedError = (message: string) => { setError(message); setPassword(""); };
  return <main className="grid min-h-screen place-items-center bg-slate-900/60 p-4 backdrop-blur-md"><Card className="relative w-full max-w-md overflow-hidden rounded-3xl p-8 text-center shadow-2xl"><div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-blue-600 via-sky-500 to-indigo-600" /><div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-blue-600 text-3xl font-bold text-white shadow-lg shadow-blue-500/30"><Icon name="planet" weight="fill" className="text-3xl" /></div><h1 className="text-2xl font-extrabold tracking-tight text-slate-900">lazycat-search</h1><p className="mb-6 mt-1 text-xs text-slate-500">{t.subtitle}</p><form className="space-y-4 text-left" onSubmit={submit}><label className="block text-xs font-semibold text-slate-700">{t.username}<Input className="mt-1 rounded-xl px-3.5 py-2.5" value={username} onChange={(event) => setUsername(event.target.value)} /></label><label className="block text-xs font-semibold text-slate-700">{t.password}<Input className="mt-1 rounded-xl px-3.5 py-2.5" type="password" placeholder={t.passwordPlaceholder} value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error ? <p role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700"><Icon name="warning-circle" className="mt-0.5 text-base text-red-600" />{error}</p> : null}<Button type="submit" className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3 shadow-md shadow-blue-600/30" disabled={submitting}>{submitting ? "…" : t.signIn} <Icon name="arrow-right" /></Button></form><div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4"><p className="text-[11px] text-slate-400">{english ? "Prototype test scenarios:" : "测试模拟场景:"}</p><div className="flex items-center gap-1.5"><button type="button" className="text-[11px] font-semibold text-blue-600 hover:underline" onClick={() => simulatedError(english ? "The username or password is incorrect." : "用户名或密码错误，请重新输入。")}>{english ? "Invalid credentials" : "凭据错误"}</button><span className="text-[11px] text-slate-400">•</span><button type="button" className="text-[11px] font-semibold text-blue-600 hover:underline" onClick={() => simulatedError(english ? "This account is temporarily locked." : "账户已临时锁定。")}>{english ? "Account locked" : "账户锁定"}</button><span className="text-[11px] text-slate-400">•</span><button type="button" className="text-[11px] font-semibold text-blue-600 hover:underline" onClick={() => simulatedError(english ? "Too many attempts. Try again later." : "尝试次数过多，请稍后再试。")}>{english ? "Rate limit" : "频繁限制"}</button></div></div></Card></main>;
}

function PortalWorkspace() {
  const { locale, setLocale, toast, refresh } = usePortal();
  const [active, setActive] = useState<PortalTab>("search");
  const [loggedIn, setLoggedIn] = useState(false);
  const [checking, setChecking] = useState(true);
  useEffect(() => { let cancelled = false; void api.me().then(async () => { await refresh(); if (!cancelled) setLoggedIn(true); }).catch(() => { if (!cancelled) setLoggedIn(false); }).finally(() => { if (!cancelled) setChecking(false); }); return () => { cancelled = true; }; }, [refresh]);
  if (checking) return <main className="grid min-h-screen place-items-center text-sm font-bold text-slate-500">lazycat-search</main>;
  if (!loggedIn) return <LoginScreen onLogin={async () => { await refresh(); setLoggedIn(true); }} />;
  const pages = { search: <SearchPage />, mcp: <McpPage />, engines: <EnginesPage />, usage: <UsagePage />, settings: <SettingsPage /> };
  return <><PortalShell active={active} onNavigate={setActive} locale={locale} onLocaleChange={setLocale} onLogout={() => { void api.logout(); setLoggedIn(false); }}>{pages[active]}</PortalShell>{toast ? <Toast {...toast} /> : null}</>;
}

export function PortalApp() { return <PortalProvider><PortalWorkspace /></PortalProvider>; }
