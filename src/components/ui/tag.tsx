import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type TagTone = "neutral" | "blue" | "green" | "amber" | "red" | "slate" | "indigo";
const tones: Record<TagTone, string> = {
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-100",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  amber: "bg-amber-50 text-amber-800 ring-amber-100",
  red: "bg-red-50 text-red-700 ring-red-100",
  slate: "bg-slate-700 text-white ring-slate-700",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-100",
};

export function Tag({ children, className, tone = "neutral", ...props }: HTMLAttributes<HTMLSpanElement> & { children: ReactNode; tone?: TagTone }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1", tones[tone], className)} {...props}>{children}</span>;
}
