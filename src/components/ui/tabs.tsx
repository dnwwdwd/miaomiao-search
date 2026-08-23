import { cn } from "@/lib/cn";

export type TabItem<T extends string> = { id: T; label: string };
export function Tabs<T extends string>({ items, value, onChange }: { items: Array<TabItem<T>>; value: T; onChange: (value: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
      {items.map((item) => (
        <button key={item.id} type="button" role="tab" aria-selected={value === item.id} onClick={() => onChange(item.id)} className={cn("relative min-h-10 whitespace-nowrap px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500", value === item.id ? "text-blue-700 after:absolute after:bottom-0 after:left-3 after:right-3 after:h-0.5 after:bg-blue-600" : "text-slate-500 hover:text-slate-800")}>
          {item.label}
        </button>
      ))}
    </div>
  );
}
