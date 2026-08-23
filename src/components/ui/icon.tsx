import { cn } from "@/lib/cn";

export function Icon({ name, weight = "bold", className }: { name: string; weight?: "bold" | "fill" | "regular"; className?: string }) {
  return <i aria-hidden="true" className={cn(`ph-${weight} ph-${name}`, className)} />;
}
