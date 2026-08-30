"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
import { Icon } from "@/components/ui/icon";
import { PortalProvider, usePortal } from "@/components/portal/portal-context";
import { PortalShell } from "@/components/portal/portal-shell";
import { SearchPage } from "@/components/portal/pages/search-page";
import { McpPage } from "@/components/portal/pages/mcp-page";
import { EnginesPage } from "@/components/portal/pages/engines-page";
import { UsagePage } from "@/components/portal/pages/usage-page";
import { SettingsPage } from "@/components/portal/pages/settings-page";
import type { PortalTab, PortalUser } from "@/types/portal";
import { api } from "@/lib/api";

function LoginScreen({ onLogin }: { onLogin: (user: PortalUser) => Promise<void> }) {
  const { locale } = usePortal();
  const english = locale === "en";
  const [hasOidcError, setHasOidcError] = useState(false);
  const [mode, setMode] = useState<"oidc" | "local">("oidc");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const startOidc = () => window.location.assign(new URL("/api/auth/oidc/start", window.location.origin).toString());
  // The URL is only available in the browser; defer this read to avoid an SSR/client mismatch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setHasOidcError(new URLSearchParams(window.location.search).get("authError") === "oidc_failed"); }, []);
  const t = english
    ? { eyebrow: "MIAOMIAO SEARCH", title: "A quieter way to search the web.", subtitle: "Self-hosted search and Remote MCP service, ready when you are.", note: "Your workspace stays on your Lazycat instance.", signIn: "Continue with Lazycat", oidcTab: "Lazycat OIDC", localTab: "Local account", account: "Account", password: "Password", localSubmit: "Sign in locally", localHint: "Use the account created after your first Lazycat sign-in.", localError: "Local sign-in could not be completed.", error: "Authorization could not be completed. Please try again." }
    : { eyebrow: "MIAOMIAO SEARCH", title: "把联网搜索，留在自己的空间里。", subtitle: "自托管联网搜索与远程 MCP 服务，登录后即可开始使用。", note: "数据与工作流保留在你的懒猫微服实例中。", signIn: "使用懒猫账号登录", oidcTab: "懒猫 OIDC", localTab: "本地账号", account: "账号", password: "密码", localSubmit: "使用本地账号登录", localHint: "本地账号需要先完成一次懒猫 OIDC 登录。", localError: "本地登录未完成，请检查账号和密码。", error: "授权登录未完成，请重新尝试。" };
  const submitLocal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await onLogin(await api.localLogin(account, password));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.localError);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <main className="login-screen fixed inset-0 z-50 overflow-y-auto">
      <div className="login-orbit login-orbit-one" aria-hidden="true" />
      <div className="login-orbit login-orbit-two" aria-hidden="true" />
      <div className="login-layout mx-auto flex min-h-screen w-full max-w-6xl items-center gap-12 px-6 py-10 lg:px-12">
        <div className="login-intro hidden max-w-xl flex-1 lg:block">
          <div className="mb-8 flex items-center gap-3 text-sm font-extrabold tracking-[0.22em] text-blue-700"><span className="login-brand-mark grid size-11 place-items-center rounded-2xl bg-blue-600 text-xl text-white shadow-lg shadow-blue-600/20"><Icon name="planet" weight="fill" /></span><span>{t.eyebrow}</span></div>
          <h1 className="max-w-lg text-5xl font-extrabold leading-[1.08] tracking-[-0.045em] text-slate-950 xl:text-6xl">{t.title}</h1>
          <p className="mt-6 max-w-md text-base leading-8 text-slate-600">{t.subtitle}</p>
          <div className="login-rule mt-10 w-20" aria-hidden="true" />
          <p className="mt-5 flex items-center gap-2 text-xs font-semibold text-slate-500"><Icon name="lock-key" weight="fill" className="text-base text-blue-600" />{t.note}</p>
        </div>
        <section className="login-panel w-full max-w-md shrink-0 p-7 sm:p-9">
          <div className="mb-8 lg:hidden"><div className="mb-5 flex items-center gap-3 text-xs font-extrabold tracking-[0.18em] text-blue-700"><span className="login-brand-mark grid size-10 place-items-center rounded-xl bg-blue-600 text-lg text-white shadow-lg shadow-blue-600/20"><Icon name="planet" weight="fill" /></span><span>{t.eyebrow}</span></div><h1 className="text-3xl font-extrabold leading-tight tracking-[-0.03em] text-slate-950">{t.title}</h1></div>
          <div className="mb-7"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{english ? "Welcome back" : "欢迎回来"}</p><h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">{english ? "Sign in to continue" : "登录后继续"}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{english ? "Use your Lazycat account to open the management portal." : "使用懒猫账号进入管理门户。"}</p></div>
          <div className="mb-5 grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100 p-1" role="tablist" aria-label={english ? "Login method" : "登录方式"}>
            <button type="button" role="tab" aria-selected={mode === "oidc"} onClick={() => { setMode("oidc"); setError(""); }} className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${mode === "oidc" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{t.oidcTab}</button>
            <button type="button" role="tab" aria-selected={mode === "local"} onClick={() => { setMode("local"); setError(""); }} className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${mode === "local" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{t.localTab}</button>
          </div>
          {hasOidcError && mode === "oidc" ? <p role="alert" className="mb-5 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-left text-xs font-semibold leading-5 text-red-700"><Icon name="warning-circle" className="mt-0.5 shrink-0 text-base text-red-600" />{t.error}</p> : null}
          {error ? <p role="alert" className="mb-5 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-left text-xs font-semibold leading-5 text-red-700"><Icon name="warning-circle" className="mt-0.5 shrink-0 text-base text-red-600" />{error}</p> : null}
          {mode === "oidc" ? <><Button type="button" className="flex w-full items-center justify-center rounded-xl bg-blue-600 py-3.5 text-sm shadow-lg shadow-blue-600/20 hover:bg-blue-700" onClick={startOidc}>{t.signIn}<Icon name="arrow-up-right" /></Button><p className="mt-6 text-center text-[11px] leading-5 text-slate-400">{english ? "Authentication is handled securely by Lazycat." : "登录授权由懒猫认证服务安全处理。"}</p></> : <form className="space-y-4" onSubmit={(event) => void submitLocal(event)}><label className="block text-xs font-bold text-slate-700"><span className="mb-1.5 block">{t.account}</span><input autoComplete="username" value={account} onChange={(event) => setAccount(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none transition-[border-color,box-shadow] focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100" /></label><label className="block text-xs font-bold text-slate-700"><span className="mb-1.5 block">{t.password}</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none transition-[border-color,box-shadow] focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100" /></label><Button type="submit" disabled={submitting || !account.trim() || !password} className="w-full rounded-xl py-3.5 text-sm">{submitting ? (english ? "Signing in…" : "登录中…") : t.localSubmit}</Button><p className="text-center text-[11px] leading-5 text-slate-400">{t.localHint}</p></form>}
        </section>
      </div>
    </main>
  );
}

function PortalWorkspace({ loginOnly = false }: { loginOnly?: boolean }) {
  const { locale, setLocale, toast, refresh, setUser } = usePortal();
  const [active, setActive] = useState<PortalTab>("search");
  const [loggedIn, setLoggedIn] = useState(false);
  const [checking, setChecking] = useState(!loginOnly);
  const goToLogin = useCallback(() => {
    if (typeof window !== "undefined" && window.location.pathname !== "/login") window.location.replace(new URL("/login", window.location.origin).toString());
  }, []);
  const expireSession = useCallback(() => {
    setUser(null);
    setLoggedIn(false);
    goToLogin();
  }, [goToLogin, setUser]);
  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // The login route is still the safe destination if the response is interrupted after cookies are cleared.
    } finally {
      setUser(null);
      setLoggedIn(false);
      goToLogin();
    }
  };
  useEffect(() => {
    const onExpired = () => expireSession();
    window.addEventListener("miaomiao-search:session-expired", onExpired);
    return () => window.removeEventListener("miaomiao-search:session-expired", onExpired);
  }, [expireSession]);
  useEffect(() => {
    if (loginOnly) return;
    let cancelled = false;
    const validate = async (loadWorkspace = false) => {
      try {
        const user = await api.me();
        if (cancelled) return;
        setUser(user);
        if (loadWorkspace) await refresh();
        if (!cancelled) setLoggedIn(true);
      } catch {
        if (!cancelled) { setUser(null); setLoggedIn(false); }
      } finally {
        if (!cancelled) setChecking(false);
      }
    };
    void validate(true);
    const onFocus = () => { if (document.visibilityState === "visible") void validate(); };
    const onVisibility = () => { if (document.visibilityState === "visible") void validate(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void validate(); }, 15_000);
    return () => { cancelled = true; window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisibility); window.clearInterval(timer); };
  }, [loginOnly, refresh, setUser]);
  if (loginOnly) return <LoginScreen onLogin={async (user) => {
    setUser(user);
    if (typeof window !== "undefined") window.location.replace(new URL("/", window.location.origin).toString());
  }} />;
  if (checking) return <main className="grid min-h-screen place-items-center text-sm font-bold text-slate-500">{locale === "zh" ? "喵喵搜索" : "Miaomiao Search"}</main>;
  if (!loggedIn) return <LoginScreen onLogin={async (user) => { setUser(user); await refresh(); setLoggedIn(true); }} />;
  const pages = { search: <SearchPage />, mcp: <McpPage />, engines: <EnginesPage />, usage: <UsagePage />, settings: <SettingsPage /> };
  return <><PortalShell active={active} onNavigate={setActive} locale={locale} onLocaleChange={setLocale} onLogout={() => void logout()}>{pages[active]}</PortalShell>{toast ? <Toast {...toast} /> : null}</>;
}

export function PortalApp({ loginOnly = false }: { loginOnly?: boolean }) { return <PortalProvider><PortalWorkspace loginOnly={loginOnly} /></PortalProvider>; }
