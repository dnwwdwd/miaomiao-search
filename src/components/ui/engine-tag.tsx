"use client";

import { useState } from "react";
import { getEngineMeta } from "@/lib/engine-catalog";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icon";

export function EngineIcon({ engine, className }: { engine: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const meta = getEngineMeta(engine);
  if (!meta.iconUrl || failed) return <Icon name="globe" className={cn("shrink-0 text-[12px]", className)} />;
  return (
    // The URLs are fixed first-party favicons from the engine catalog, not user-provided result URLs.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={meta.iconUrl} alt="" aria-hidden="true" className={cn("size-3.5 shrink-0 rounded-[3px] bg-white object-contain", className)} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  );
}

export function EngineTag({ engine, className, compact = false }: { engine: string; className?: string; compact?: boolean }) {
  const meta = getEngineMeta(engine);
  return <span className={cn("engine-tag inline-flex items-center gap-1.5 rounded-full border font-bold", compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]", meta.tagClass, className)}><EngineIcon engine={engine} /><span>{meta.name}</span></span>;
}
