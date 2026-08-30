"use client";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { Switch } from "@/components/ui/switch";
import { Icon } from "@/components/ui/icon";
import { usePortal } from "@/components/portal/portal-context";
import { Tag } from "@/components/ui/tag";
import { useState, type FormEvent } from "react";
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
  const { settings, setSettings, locale, notify, refresh, user } = usePortal();
  const english = locale === "en";
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
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
  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword.length < 8) { notify(english ? "Password must be at least 8 characters." : "密码至少需要 8 位。", "error"); return; }
    if (newPassword !== confirmPassword) { notify(english ? "The passwords do not match." : "两次输入的密码不一致。", "error"); return; }
    setSavingPassword(true);
    try {
      await api.changePassword({ currentPassword: user?.loginMethod === "local" ? currentPassword : undefined, newPassword });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      if (typeof window !== "undefined") window.location.replace(new URL("/login", window.location.origin).toString());
    } catch (error) {
      notify(error instanceof Error ? error.message : (english ? "Could not update password." : "密码更新失败。"), "error");
    } finally {
      setSavingPassword(false);
    }
  };
  const t = english
    ? { title: "System settings", subtitle: "Configure cache, limits, and retention.", account: "Signed-in account", method: "Login method", oidc: "Lazycat OIDC", local: "Local account", passwordTitle: "Password", passwordHint: "OIDC sessions can set a new password directly. Local sessions must confirm the current password.", currentPassword: "Current password", newPassword: "New password", confirmPassword: "Confirm password", savePassword: "Update password", cache: "Cache policy", rate: "Rate limits", data: "Data management", save: "Save settings" }
    : { title: "系统参数配置", subtitle: "配置缓存、限流和数据保留。", account: "当前登录账户", method: "登录方式", oidc: "懒猫 OIDC", local: "本地账户", passwordTitle: "修改密码", passwordHint: "OIDC 登录可直接设置新密码；本地登录需要先验证当前密码。", currentPassword: "当前密码", newPassword: "新密码", confirmPassword: "确认新密码", savePassword: "更新密码", cache: "缓存策略", rate: "限流策略", data: "数据管理与审计隐私", save: "保存设置" };

  return (
    <section className="mx-auto w-full max-w-none space-y-6 pb-20">
      <div><h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{t.title}</h1><p className="mt-1 text-xs text-slate-500">{t.subtitle}</p></div>

      <div className="grid gap-4 md:grid-cols-[1.05fr_1fr]">
        <Card className="white-card rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4"><div><h2 className="flex items-center text-sm font-bold text-slate-900"><Icon name="user-circle" weight="fill" className="mr-2 text-lg text-blue-600" />{t.account}</h2><p className="mt-1 text-xs text-slate-500">{user?.name ?? "—"}</p></div><Tag tone="blue">{user?.loginMethod === "local" ? t.local : t.oidc}</Tag></div>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-xs"><div><dt className="text-slate-400">{english ? "Account" : "账号"}</dt><dd className="mt-1 break-all font-mono font-bold text-slate-800">{user?.account ?? "—"}</dd></div><div><dt className="text-slate-400">{t.method}</dt><dd className="mt-1 font-semibold text-slate-700">{user?.loginMethod === "local" ? t.local : t.oidc}</dd></div></dl>
        </Card>
        <Card className="white-card rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="border-b border-slate-100 pb-3"><h2 className="flex items-center text-sm font-bold text-slate-900"><Icon name="key" weight="fill" className="mr-2 text-lg text-blue-600" />{t.passwordTitle}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{t.passwordHint}</p></div>
          <form className="mt-4 space-y-3" onSubmit={(event) => void savePassword(event)}>{user?.loginMethod === "local" ? <label className="block text-xs font-semibold text-slate-700"><span className="mb-1 block">{t.currentPassword}</span><Input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label> : null}<label className="block text-xs font-semibold text-slate-700"><span className="mb-1 block">{t.newPassword}</span><Input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label><label className="block text-xs font-semibold text-slate-700"><span className="mb-1 block">{t.confirmPassword}</span><Input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label><div className="flex justify-end pt-1"><Button type="submit" disabled={savingPassword || !newPassword || !confirmPassword} className="rounded-xl">{savingPassword ? (english ? "Updating…" : "更新中…") : t.savePassword}</Button></div></form>
        </Card>
      </div>

      <Card className="white-card space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="border-b border-slate-100 pb-3"><h2 className="flex items-center text-sm font-bold text-slate-900"><Icon name="hard-drives" weight="fill" className="mr-2 text-lg text-blue-600" />{t.cache}</h2><p className="mt-0.5 text-xs text-slate-500">{english ? "Search cache keys include query + engines + limit + search mode. Web and MCP share the same policy." : "搜索缓存 Key 包含 query + engines + limit + searchMode。MCP 与 Web 共用缓存。"}</p></div>
        <div className="grid grid-cols-1 gap-4 text-xs md:grid-cols-2"><ToggleRow label={english ? "Enable search cache" : "启用搜索缓存"} checked={settings.searchCacheEnabled} onChange={(value) => update("searchCacheEnabled", value)} /><ToggleRow label={english ? "Enable content cache" : "启用正文缓存"} checked={settings.contentCacheEnabled} onChange={(value) => update("contentCacheEnabled", value)} /><NumberField label={english ? "Search result Cache TTL (seconds)" : "搜索结果 Cache TTL (秒)"} value={settings.searchTtl} onChange={(value) => update("searchTtl", value)} /><NumberField label={english ? "Fetched content Cache TTL (seconds)" : "正文抓取 Cache TTL (秒)"} value={settings.contentTtl} onChange={(value) => update("contentTtl", value)} /><NumberField label={english ? "Maximum cache entries" : "搜索缓存最大条数"} value={settings.cacheMaxSize} onChange={(value) => update("cacheMaxSize", value)} /></div>
      </Card>

      <Card className="white-card space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="border-b border-slate-100 pb-3"><h2 className="flex items-center text-sm font-bold text-slate-900"><Icon name="speedometer" weight="fill" className="mr-2 text-lg text-blue-600" />{t.rate}</h2><p className="mt-0.5 text-xs text-slate-500">{english ? "Limit the request pace for Web, MCP, and each search engine separately." : "分别限制 Web、MCP 与单个搜索引擎的请求节奏。"}</p></div>
        <div className="grid grid-cols-1 gap-4 text-xs md:grid-cols-3"><NumberField label={english ? "Web / IP (per minute)" : "Web / IP（每分钟）"} value={settings.webRpm} onChange={(value) => update("webRpm", value)} /><NumberField label={english ? "MCP / Token (per minute)" : "MCP / Token（每分钟）"} value={settings.mcpRpm} onChange={(value) => update("mcpRpm", value)} /><NumberField label={english ? "Per-engine concurrency" : "单引擎并发"} value={settings.engineConcurrency} onChange={(value) => update("engineConcurrency", value)} /></div>
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
