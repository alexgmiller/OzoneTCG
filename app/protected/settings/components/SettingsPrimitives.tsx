"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/ui";
import type { UserSettings } from "../actions";

// ── Shared types ──
export type SettingsUpdate = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;

// ── Shared classes ──
export const inputClass =
  "h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground " +
  "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

// ── Section ──
export function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon size={16} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

// ── Setting row ──
// `stack` puts the control under the label on phones and beside it from sm: up.
export function SettingRow({
  label,
  description,
  stack = false,
  children,
}: {
  label: string;
  description?: string;
  stack?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "px-4 py-3",
        stack
          ? "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
          : "flex items-center justify-between gap-3",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>}
      </div>
      {children != null && (
        <div className={cn("shrink-0", stack && "w-full sm:w-auto")}>{children}</div>
      )}
    </div>
  );
}

// ── Row group label ──
export function RowGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-muted px-4 py-2">
      <SectionHeader>{children}</SectionHeader>
    </div>
  );
}

// ── Toggle ──
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex h-11 w-14 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className={cn(
          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-150",
          checked ? "bg-accent" : "bg-surface-2",
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 rounded-full bg-card transition-transform duration-150",
            checked ? "translate-x-6" : "translate-x-1",
          )}
        />
      </span>
    </button>
  );
}

// ── Status dot ──
export function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("h-2 w-2 rounded-full", ok ? "bg-positive-strong" : "bg-negative-strong")} />
      <span className={cn("text-xs", ok ? "text-positive-strong" : "text-muted-foreground")}>
        {ok ? "Connected" : label}
      </span>
    </div>
  );
}

// ── Number input ──
export function NumInput({
  value,
  onChange,
  min = 0,
  max = 100,
  unit = "%",
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  unit?: string;
}) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        value={local}
        className={cn(inputClass, "w-24 text-right tabular-nums")}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const n = Number(local);
          if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
          else setLocal(String(value));
        }}
      />
      <span className="w-3 text-xs text-muted-foreground">{unit}</span>
    </div>
  );
}

// ── Segmented control ──
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" className="flex w-full overflow-hidden rounded-lg border border-border sm:w-auto">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-11 flex-1 px-4 text-sm transition-colors duration-150 sm:flex-none",
            value === o.value
              ? "bg-primary font-medium text-primary-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Action button ──
export function ActionButton({
  tone = "default",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "default" | "primary" | "danger" }) {
  const toneClass = {
    default: "border border-border bg-background text-foreground hover:bg-muted",
    primary: "bg-primary text-primary-foreground hover:bg-accent",
    danger: "border border-negative-border text-negative-strong hover:bg-negative-soft",
  }[tone];

  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium",
        "transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40",
        toneClass,
        className,
      )}
      {...props}
    />
  );
}
