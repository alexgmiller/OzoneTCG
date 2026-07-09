# Ozone TCG — Design System

Canonical reference for visual decisions. Read this before adding UI. Tokens and primitives live in `components/ui/` and `tailwind.config.ts`.

---

## 1. Color semantics

| Token                | Tailwind              | Use for                                                  |
| -------------------- | --------------------- | -------------------------------------------------------- |
| `accent-primary`     | `violet-500/600`      | Primary CTAs, active nav, focus rings                    |
| `accent-secondary`   | `violet-300/400`      | Subtle accents, secondary iconography                    |
| `positive`           | `emerald-400/500`     | Sells, profit, margin up, success toasts                 |
| `negative`           | `rose-400/500`        | Buys (cash out), loss, destructive actions, error toasts |
| `warning`            | `amber-400/500`       | Missing data, passes, flags, warning toasts              |
| `neutral`            | `slate-400/500`       | Body text, muted UI, disabled states                     |
| `surface`            | `slate-50`→`slate-950`| Background stack (light/dark scale below)                |

### Surface stack (dark)
`slate-950` base → `slate-900` cards → `slate-800` inset → `white/5` hairline borders

### Surface stack (light)
`slate-50` base → `white` cards → `slate-100` inset → `slate-200` hairline borders

### Don'ts (read this section — it prevents drift)
- **Don't use `text-red-*` or `bg-red-*` for anything.** Negative = rose. Destructive = rose. Red is reserved for system-level errors we don't raise in-app.
- **Don't use blue anywhere.** No `text-blue-*`, `bg-blue-*`, `border-blue-*`. The only CTA/link color is violet (`accent-primary`).
- **Don't mix semantic colors.** Emerald is for money-positive states only — not for "active" or "selected". Use `accent-primary` for selection.
- **Don't use arbitrary hex.** If a color isn't in the table above, stop and ask.
- **Don't use `text-green-*` for positive** — use `emerald`. Same for `text-yellow-*` → `amber`.

---

## 2. Spacing scale

| Class  | Use for                                                      |
| ------ | ------------------------------------------------------------ |
| `p-2`  | Compact chips, pills, dense table cells                      |
| `p-2.5`| Inventory card interior, batch row items                     |
| `p-3`  | Standard content panels, form rows, list rows                |
| `p-4`  | Prominent panels, card headers, sticky bottom bars           |
| `p-5`  | Modal bodies, empty-state panels, onboarding cards           |

Gaps follow the same scale: `gap-2` for chip rows, `gap-3` for form fields, `gap-4` for card stacks.

### Don'ts
- **Don't use `p-1`, `p-1.5`, `p-6`, `p-8`.** If your content needs these, it probably wants a different container.
- **Don't use arbitrary `p-[13px]`.** No arbitrary spacing values. Period.

---

## 3. Typography

| Class       | Use for                                            |
| ----------- | -------------------------------------------------- |
| `text-xs`   | Labels, captions, monospace meta, section headers  |
| `text-sm`   | Body text, list rows, form values                  |
| `text-base` | Emphasized content, card titles                    |
| `text-lg`   | Modal titles, section headings                     |
| `text-xl`   | Primary stat values (header totals)                |
| `text-2xl`+ | Reserved for marketing/empty-state headlines only  |

**Fonts:** Inter (UI), JetBrains Mono (numbers, timestamps, codes, labels).

**Tabular nums:** Any money, count, or time display MUST include `tabular-nums` (or `font-feature-settings: 'tnum'`). Use `<MoneyDisplay />` which handles this automatically.

**Label pattern:** Uppercase meta labels use `text-xs font-mono uppercase tracking-[0.18em] text-neutral`. Use `<SectionHeader />`.

### Don'ts
- **Don't use arbitrary sizes** like `text-[11px]` or `text-[13px]`. The only exception is inventory card captions which already use `text-[11px]` — don't propagate it elsewhere.
- **Don't use `font-thin`, `font-light`, or `font-black`.** Weight scale is 400 / 500 / 600 / 700. That's it.
- **Don't forget `tabular-nums` on numeric values.** Columns of money will jitter without it.

---

## 4. Border radius

| Class            | Use for                               |
| ---------------- | ------------------------------------- |
| `rounded-lg`     | Inputs, buttons, small chips          |
| `rounded-xl`     | Cards, panels, modals, toasts         |
| `rounded-2xl`    | Phone-frame-level containers only     |
| `rounded-full`   | Pills, badges, avatars, icon buttons  |

### Don'ts
- **Don't use `rounded-md` or `rounded-sm`.** They're in the wrong place on the scale for this product.
- **Don't use `rounded` (default 4px).** Always pick from the table.

---

## 5. Transitions

| Pattern                        | Class                                      |
| ------------------------------ | ------------------------------------------ |
| Color/bg hover                 | `transition-colors duration-150`           |
| Modal backdrop fade            | `transition-opacity duration-150`          |
| Complex (multi-property)       | `transition-all duration-150`              |
| Sheet slide-up                 | `transition-transform duration-200 ease-out` |

**Hard cap: 200ms.** Longer feels sluggish on a show floor.

### Don'ts
- **Don't use `duration-300` or `duration-500`.** Too slow for our interaction model.
- **Don't use `ease-in-out`** for entering elements — it feels draggy. Use `ease-out` for enter, `ease-in` for exit.
- **Don't animate `height: auto`.** Animate `max-height` with a fixed cap, or better, don't animate.

---

## 6. Depth & elevation

We do NOT use box-shadows for depth. Depth comes from:
1. **Border** — `border border-white/5` (dark) or `border-slate-200` (light)
2. **Background contrast** — step up one level in the surface stack
3. **Position** — sticky/fixed panels get a subtle top border, never a shadow

The only shadow allowed: device-frame outer shadow in the mockup canvas. That's it.

### Don'ts
- **Don't add `shadow-sm`, `shadow-md`, `shadow-lg`** to any in-app surface.
- **Don't introduce new shadow treatments** "for polish". They read as web-y and break the app aesthetic.

---

## 7. Interaction patterns

**Sticky bottom panel.** Lives outside scroll container, `sticky bottom-0`, fades background into content with a linear gradient top. Height ~68–84px depending on content. Primary action right-aligned.

**Modal layering.** Backdrop = `bg-slate-950/70 backdrop-blur-sm`. Panel = `rounded-xl` with `border border-white/10 bg-slate-900`. One modal at a time — no stacked modals. Use `<Modal />`.

**Toast notifications.** Bottom-center, stacked, `rounded-xl`, max 3 visible. Auto-dismiss at 4s (success) / 6s (warning) / never (error, manual dismiss). Use `<Toast />`.

**Skeleton loading.** Same shape + size as final content, `bg-slate-800/60` pulse (dark) or `bg-slate-200` pulse (light). No spinners except for inline async actions. Use `<Skeleton />`.

**Empty states.** Ghost preview of what will appear + starter CTA. Never "No items yet." alone. Use `<EmptyState />`.

**Recent-action affordance.** Entries < 5 min old show inline undo pill. Fades out over time. This is app-level, not per-component.

---

## 8. Canonical component patterns

All in `components/ui/`:

- **`StatCard`** — primary stat display (header totals, deal step summaries). Props: `label`, `value`, `delta?`, `tone?`.
- **`MoneyDisplay`** — formatted amount with sign, color-coding, tabular nums. Props: `amount`, `tone?`, `showSign?`.
- **`SectionHeader`** — uppercase mono label. Props: `children`, `action?`.
- **`Skeleton`** — shimmer placeholder. Props: `className`, `variant?: 'rect' | 'circle' | 'text'`.
- **`Modal`** — backdrop + panel shell. Props: `open`, `onClose`, `title?`, `children`.
- **`EmptyState`** — ghost preview + CTA. Props: `title`, `hint?`, `cta?`, `preview?`.
- **`Toast`** — single notification. Use via `toast.success()` / `.error()` / `.warning()` / `.info()` helpers.

**Prefer these over raw Tailwind.** If you find yourself recreating one of these patterns inline, stop — import the primitive. If the primitive doesn't fit, extend the primitive, don't fork it.

---

## 9. Quick audit checklist

Before opening a PR, grep your diff for:
- `text-red-` · `text-blue-` · `text-green-` · `text-yellow-` → swap to semantic tokens
- `rounded-md` · `rounded-sm` · `rounded ` → swap to scale
- `shadow-` → remove
- `text-\[` → swap to scale
- `duration-300` · `duration-500` → 150 or 200
- Raw money formatting → `<MoneyDisplay />`
