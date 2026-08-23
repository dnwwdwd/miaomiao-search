import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function Modal({ title, children, onClose, footer, className, bodyClassName, headerExtra }: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode; className?: string; bodyClassName?: string; headerExtra?: ReactNode }) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); previouslyFocused?.focus(); };
  }, [onClose]);

  const trapFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])].filter((item) => !item.hasAttribute("hidden"));
    if (!focusable.length) { event.preventDefault(); return; }
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4" role="presentation" onMouseDown={onClose}>
      <section ref={dialogRef} tabIndex={-1} onKeyDown={trapFocus} className={cn("flex max-h-full w-full flex-col rounded-2xl bg-white shadow-2xl", "max-w-lg", className)} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div className="min-w-0"><h2 className="truncate text-base font-extrabold text-slate-900">{title}</h2>{headerExtra}</div><Button variant="ghost" className="min-h-8 shrink-0 px-2" aria-label="关闭" onClick={onClose}>×</Button></header>
        <div className={cn("p-5", bodyClassName)}>{children}</div>
        {footer ? <footer className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">{footer}</footer> : null}
      </section>
    </div>
  );
}
