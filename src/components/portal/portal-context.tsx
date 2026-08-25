"use client";

import { createContext, useCallback, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { api } from "@/lib/api";
import type { Locale, McpToken, McpTool, SearchEngine, SearchHistory, ServiceStatus, SettingsState, UsageLog } from "@/types/portal";

type PortalContextValue = {
  locale: Locale;
  setLocale: Dispatch<SetStateAction<Locale>>;
  engines: SearchEngine[];
  setEngines: Dispatch<SetStateAction<SearchEngine[]>>;
  history: SearchHistory[];
  setHistory: Dispatch<SetStateAction<SearchHistory[]>>;
  tokens: McpToken[];
  setTokens: Dispatch<SetStateAction<McpToken[]>>;
  tools: McpTool[];
  setTools: Dispatch<SetStateAction<McpTool[]>>;
  usageLogs: UsageLog[];
  setUsageLogs: Dispatch<SetStateAction<UsageLog[]>>;
  serviceStatus: ServiceStatus;
  usageOverview: { total: number; mcpToday: number; webToday: number; successful: number };
  settings: SettingsState;
  setSettings: Dispatch<SetStateAction<SettingsState>>;
  toast: { message: string; tone: "success" | "error" | "info" } | null;
  notify: (message: string, tone?: "success" | "error" | "info") => void;
  refresh: () => Promise<void>;
};

const PortalContext = createContext<PortalContextValue | null>(null);

export function PortalProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("zh");
  const [engines, setEngines] = useState<SearchEngine[]>([]);
  const [history, setHistory] = useState<SearchHistory[]>([]);
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>("checking");
  const [usageOverview, setUsageOverview] = useState({ total: 0, mcpToday: 0, webToday: 0, successful: 0 });
  const [settings, setSettings] = useState<SettingsState>({ proxyEnabled: false, proxyUrl: "", searchCacheEnabled: false, contentCacheEnabled: false, searchTtl: 3600, contentTtl: 86400, cacheMaxSize: 1000, webRpm: 30, mcpRpm: 60, engineConcurrency: 3, defaultLimit: 10, homeEngines: [], homeRequestLimit: null, homeBingMode: "request", historyEnabled: true, historyRetentionDays: 30, logFullQuery: false });
  const [toast, setToast] = useState<PortalContextValue["toast"]>(null);
  const notify = (message: string, tone: "success" | "error" | "info" = "success") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 2800);
  };
  useEffect(() => { document.documentElement.lang = locale === "zh" ? "zh-CN" : "en"; }, [locale]);
  const refresh = useCallback(async () => {
    try {
      const [nextEngines, nextHistory, nextTokens, nextTools, nextSettings, usage] = await Promise.all([api.engines(), api.history(), api.tokens(), api.mcp(), api.settings(), api.usage()]);
      setEngines(nextEngines); setHistory(nextHistory); setTokens(nextTokens); setTools(nextTools); setSettings(nextSettings); setUsageLogs(usage.logs); setUsageOverview({ total: usage.summary.total, mcpToday: usage.channels.mcp, webToday: usage.channels.web, successful: usage.summary.success + usage.summary.partial }); setServiceStatus("online");
    } catch (error) {
      setServiceStatus("offline");
      throw error;
    }
  }, []);
  const value = { locale, setLocale, engines, setEngines, history, setHistory, tokens, setTokens, tools, setTools, usageLogs, setUsageLogs, serviceStatus, usageOverview, settings, setSettings, toast, notify, refresh };
  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}

export function usePortal() {
  const value = useContext(PortalContext);
  if (!value) throw new Error("usePortal must be used inside PortalProvider");
  return value;
}
