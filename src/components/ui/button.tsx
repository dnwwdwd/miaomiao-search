import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "quiet";

const variants: Record<Variant, string> = {
  primary: "bg-blue-600 text-white shadow-sm shadow-blue-600/25 hover:bg-blue-700",
  secondary: "border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-blue-300 hover:text-blue-700",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  danger: "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
  quiet: "bg-slate-100 text-slate-700 hover:bg-slate-200",
};

export function Button({
  children,
  className,
  variant = "primary",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; variant?: Variant }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-[background-color,color,border-color,transform,box-shadow] active:scale-[0.96] disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
