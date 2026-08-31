"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

export type DropdownOption<T extends string | number> = {
  value: T;
  label: ReactNode;
  disabled?: boolean;
};

export type DropdownProps<T extends string | number> = {
  value: T;
  options: readonly DropdownOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  containerClassName?: string;
  menuClassName?: string;
  placement?: "auto" | "bottom";
  disabled?: boolean;
  ariaLabel?: string;
  placeholder?: string;
};

export function Dropdown<T extends string | number>({
  value,
  options,
  onChange,
  className,
  containerClassName,
  menuClassName,
  placement = "auto",
  disabled = false,
  ariaLabel,
  placeholder = "请选择",
}: DropdownProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const enabledIndexes = options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const gap = 6;
      const viewportPadding = 8;
      const menuHeight = Math.min(256, Math.max(120, window.innerHeight - viewportPadding * 2));
      const spaceBelow = window.innerHeight - rect.bottom - gap - viewportPadding;
      const placeAbove = placement === "auto" && spaceBelow < 160 && rect.top > spaceBelow;
      const height = Math.max(80, Math.min(menuHeight, placeAbove ? rect.top - gap - viewportPadding : spaceBelow));
      const left = Math.min(Math.max(viewportPadding, rect.left), Math.max(viewportPadding, window.innerWidth - rect.width - viewportPadding));
      setMenuStyle({
        position: "fixed",
        top: placeAbove ? Math.max(viewportPadding, rect.top - height - gap) : rect.bottom + gap,
        left,
        width: rect.width,
        maxHeight: height,
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, placement]);

  const openMenu = () => {
    setActiveIndex(selectedIndex >= 0 && !options[selectedIndex]?.disabled ? selectedIndex : (enabledIndexes[0] ?? -1));
    if (placement === "bottom") buttonRef.current?.scrollIntoView({ block: "center", inline: "nearest" });
    setOpen(true);
  };

  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(activeIndex >= 0 ? activeIndex : selectedIndex);
      else openMenu();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    if (!open) {
      openMenu();
      return;
    }
    if (!enabledIndexes.length) return;
    const currentPosition = Math.max(0, enabledIndexes.indexOf(activeIndex));
    const nextPosition = event.key === "Home" ? 0 : event.key === "End" ? enabledIndexes.length - 1 : (currentPosition + (event.key === "ArrowDown" ? 1 : -1) + enabledIndexes.length) % enabledIndexes.length;
    setActiveIndex(enabledIndexes[nextPosition]);
  };

  return (
    <div ref={rootRef} className={cn("relative inline-block w-full", containerClassName)}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        className={cn("flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-left text-xs font-semibold text-slate-700 outline-none transition-colors hover:border-blue-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-45", className)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => { if (open) setOpen(false); else openMenu(); }}
        onKeyDown={onKeyDown}
      >
        <span className="min-w-0 truncate">{selected?.label ?? placeholder}</span>
        <Icon name={open ? "caret-up" : "caret-down"} className="shrink-0 text-slate-400" />
      </button>
      {open && menuStyle && typeof document !== "undefined" ? createPortal(
        <div ref={menuRef} id={listId} role="listbox" aria-label={ariaLabel} data-dropdown-menu="true" style={menuStyle} className={cn("z-[70] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10", menuClassName)}>
            {options.map((option, index) => {
              const selectedOption = option.value === value;
              const activeOption = index === activeIndex;
              return (
                <button
                  key={`${String(option.value)}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={selectedOption}
                  disabled={option.disabled}
                  className={cn("flex min-h-8 w-full items-center rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40", selectedOption ? "bg-blue-50 text-blue-700" : activeOption ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900")}
                  onClick={() => choose(index)}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>,
        document.body,
      ) : null}
    </div>
  );
}
