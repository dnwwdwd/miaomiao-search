import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

export function Modal({ title, children, onClose, footer, className, bodyClassName, headerExtra, closeLabel = "关闭", closeOnBackdrop = true }: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode; className?: string; bodyClassName?: string; headerExtra?: ReactNode; closeLabel?: string; closeOnBackdrop?: boolean }) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previousOverflow; previouslyFocused?.focus(); };
  }, []);

  const trapFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []), ...document.querySelectorAll<HTMLElement>('[data-dropdown-menu="true"] button:not([disabled])')].filter((item) => !item.hasAttribute("hidden"));
    if (!focusable.length) { event.preventDefault(); return; }
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/60 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (closeOnBackdrop && event.target === event.currentTarget) onCloseRef.current(); }}>
      <section ref={dialogRef} tabIndex={-1} onKeyDown={trapFocus} className={cn("flex max-h-full w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl", "max-w-lg", className)} role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()}>
        <header className="relative flex items-center justify-between border-b border-slate-100 px-5 py-4"><div className="min-w-0 pr-12"><h2 id={titleId} className="truncate text-base font-extrabold text-slate-900">{title}</h2>{headerExtra}</div><Button variant="ghost" className="absolute right-3 top-3 size-10 shrink-0 rounded-xl p-0 text-3xl leading-none" aria-label={closeLabel} onClick={() => onCloseRef.current()}><Icon name="x" weight="bold" className="text-3xl" /></Button></header>
        <div className={cn("p-5", bodyClassName)}>{children}</div>
        {footer ? <footer className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
}
