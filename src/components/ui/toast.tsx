import { cn } from "@/lib/cn";

export function Toast({ message, tone = "success" }: { message: string; tone?: "success" | "error" | "info" }) {
  const styles = { success: "bg-emerald-700", error: "bg-red-700", info: "bg-slate-800" };
  return <div role="status" className={cn("fixed bottom-5 right-5 z-[60] rounded-xl px-4 py-3 text-xs font-bold text-white shadow-xl", styles[tone])}>{message}</div>;
}
