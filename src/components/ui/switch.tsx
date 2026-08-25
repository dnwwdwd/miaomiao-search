import { cn } from "@/lib/cn";

export function Switch({ checked, onChange, label, size = "sm" }: { checked: boolean; onChange: (checked: boolean) => void; label: string; size?: "sm" | "md" }) {
  const large = size === "md";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative inline-flex shrink-0 rounded-full transition-[background-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2", large ? "h-5 w-9" : "h-4 w-7", checked ? "bg-blue-600" : "bg-slate-300")}
    >
      <span className={cn("absolute left-0.5 top-0.5 rounded-full bg-white shadow-sm transition-transform", large ? "h-4 w-4" : "h-3 w-3", checked ? (large ? "translate-x-4" : "translate-x-3") : "translate-x-0")} />
    </button>
  );
}
