import type { InputHTMLAttributes } from "react";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

export function SearchInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cn("relative block", className)}>
      <Icon name="magnifying-glass" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg text-slate-400" />
      <Input className="min-h-12 pl-10 text-sm" {...props} />
    </label>
  );
}
