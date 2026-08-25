"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type RadioOption<T extends string> = {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
};

export function RadioGroup<T extends string>({
  name,
  value,
  options,
  onChange,
  className,
  optionClassName,
  orientation = "horizontal",
}: {
  name: string;
  value: T;
  options: readonly RadioOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  optionClassName?: string;
  orientation?: "horizontal" | "vertical";
}) {
  return (
    <div role="radiogroup" aria-label={name} className={cn("flex gap-1.5", orientation === "vertical" ? "flex-col" : "flex-wrap", className)}>
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <label key={option.value} className={cn("group flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors focus-within:ring-2 focus-within:ring-blue-500/20", checked ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50/50", option.disabled && "cursor-not-allowed opacity-45", optionClassName)}>
            <input type="radio" name={name} value={option.value} checked={checked} disabled={option.disabled} onChange={() => onChange(option.value)} className="sr-only" />
            <span aria-hidden="true" className={cn("mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border", checked ? "border-blue-600" : "border-slate-300 group-hover:border-blue-400")}>
              <span className={cn("h-1.5 w-1.5 rounded-full bg-blue-600 transition-transform", checked ? "scale-100" : "scale-0")} />
            </span>
            <span className="min-w-0">
              <span className="block">{option.label}</span>
              {option.description ? <span className="mt-0.5 block text-[10px] font-normal text-slate-400">{option.description}</span> : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}
