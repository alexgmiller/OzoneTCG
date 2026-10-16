# Ozone TCG — Design System

Canonical reference for visual decisions. Tokens live in `app/globals.css` and `tailwind.config.ts`; primitives in `components/ui/`. Read this before adding UI.

The look is DeckTradr-style: card-art forward, low density, one teal accent, rounded surfaces, a floating tab bar. Light and dark are both first-class; the default is System.

---

## 1. Color tokens

Every color is a CSS variable on `:root` (light) and `.dark`. Components never use raw hex.

| Token | Tailwind | Light | Dark | Use for |
|---|---|---|---|---|
| `--bg` | `bg-bg` | `#f5f6f8` | `#11141a` | Page background |
| `--surface` | `bg-surface` | `#ffffff` | `#1b1f27` | Cards, tiles, sheets, the tab bar |
| `--surface-2` | `bg-surface-2` | `#eef0f4` | `#232833` | Inset surfaces, chips at rest, raised pill in a segmented control |
| `--border` | `border-border` | `rgba(15,23,42,.08)` | `rgba(255,255,255,.06)` | Hairlines |
| `--text` | `text-foreground` | `#0f172a` | `#f5f7fa` | Titles, values |
| `--text-muted` | `text-muted-foreground` | `#64748b` | `#8a93a3` | Labels, meta |
| `--accent` | `text-accent` `bg-accent` | `#0d9488` | `#5eead4` | **Active states only**: active tab, selected chip text, TabStrip underline, primary button |
| `--accent-tint` | `bg-accent-tint` | `rgba(13,148,136,.10)` | `rgba(94,234,212,.12)` | Selected chip background, active-show chip |
| `--up` | `text-up` | `#059669` | `#34d399` | Profit, FMV above cost, ▲ |
| `--down` | `text-down` | `#e11d48` | `#f43f5e` | Loss, FMV below cost, ▼, destructive rows |

The teal is darker in light mode so text and icons stay readable on white. There is one accent — no violet, no gold, no gradients except the frosted overlay on card art.

**Frosted overlay** (CardTile): `bg-black/45 backdrop-blur-md` with white text, in both themes. It sits on card art, not on the page, so it does not flip.

**shadcn aliases.** `bg-background`, `bg-card`, `bg-muted`, `text-primary`, `border-input` and friends still exist and resolve to the same palette (`--sh-*` HSL vars derived from the table above). They are legacy-compatible, not canonical: new code uses the token names in the table. shadcn's hover surface is `bg-hover`, not `bg-accent` — the accent name belongs to the teal.

**Pre-Phase-3 aliases** (`accent-primary`, `accent-secondary`, `positive-strong`, …) resolve to the accent/up/down so untouched screens render teal. They are removed in the audit commit as screens migrate.

### Don'ts
- **Don't use `text-red-*`, `text-green-*`, `text-blue-*`, `text-violet-*` or any hue class.** Positive = `up`, negative = `down`, active = `accent`.
- **Don't use arbitrary hex or `bg-[#…]`.** If a color isn't in the table, stop and ask.
- **Don't use the accent for anything that isn't active or selected.** It is not a decoration color.
- **Don't put `var(--…)` or color `style={{}}` in TSX.** Use the token classes. This was the known source of light-mode regressions.

---

## 2. Spacing scale

| Class | Use for |
|---|---|
| `p-2` | Compact chips, dense cells |
| `p-2.5` | Tile overlay interior |
| `p-3` | Content panels, form rows, list rows |
| `p-4` | Prominent panels, sheet bodies, page gutters |
| `p-5` | Empty-state panels |

Gaps follow the same scale: `gap-2` chip rows, `gap-3` form fields and tile grids (12px), `gap-4` card stacks.

### Don'ts
- **Don't use `p-1`, `p-1.5`, `p-6`, `p-8`.**
- **Don't use arbitrary `p-[13px]`.** No arbitrary spacing values.

---

## 3. Typography

**Fonts:** Lexend for UI (`font-sans`). Space Mono (`font-mono`) only for small muted metadata: variant, set number, grade, cert.

| Class | Use for |
|---|---|
| `text-xs` | Labels, captions, mono meta, section labels |
| `text-sm` | Body, list rows, form values, chip text |
| `text-base` | Emphasised content, card titles |
| `text-lg` | Sheet titles, section headings |
| `text-xl` | Page titles, CountStat numbers |
| `text-2xl` | Card detail name (28px) |
| `text-hero` | HeroValue (48px). Nothing else. |

**Prices are bold with `tabular-nums`.** Any money, count, or time display MUST include `tabular-nums`. Use `<MoneyDisplay />` or `<HeroValue />`; they handle it.

**Section labels:** uppercase, 12px, `0.12em` tracking, muted — the `.section-label` class. ("MOST VALUABLE", "RECENT", "UPCOMING").

### Don'ts
- **Don't use arbitrary sizes** like `text-[13px]`. The only exception is the inventory card caption at `text-[11px]`; don't propagate it.
- **Don't use `font-thin`, `font-light`, or `font-black`.** Weights are 400 / 500 / 600 / 700.
- **Don't use Space Mono for anything you want people to read.** Meta only.

---

## 4. Border radius

| Class | px | Use for |
|---|---|---|
| `rounded-xl` | 12 | Chips, inputs, list thumbnails |
| `rounded-2xl` | 16 | Cards, tiles, sheets, More rows, context menus |
| `rounded-3xl` | 24 | Bottom-sheet top corners only |
| `rounded-thumb` | 6 | The 40×56 list-row thumbnail only — the one small-radius exception |
| `rounded-full` | — | Pills, tab bar, IconButton, SearchBar, SegmentedControl |

### Don'ts
- **Don't use `rounded-md`, `rounded-sm` or bare `rounded`.** Pick from the table.

---

## 5. Transitions

| Pattern | Class |
|---|---|
| Color/bg hover | `transition-colors duration-150` |
| Backdrop fade | `transition-opacity duration-150` |
| Tile press | `transition-transform duration-150` + `active:scale-[0.98]` |
| Sheet slide-up | `transition-transform duration-200 ease-out` |

**Hard cap: 200ms.** Longer feels sluggish on a show floor.

### Don'ts
- **Don't use `duration-300` or `duration-500`.**
- **Don't use `ease-in-out`** for entering elements. `ease-out` to enter, `ease-in` to exit.
- **Don't animate `height: auto`.**

---

## 6. Depth & elevation

Depth comes from borders and surface steps (`bg` → `surface` → `surface-2`), never shadows — with **one exception**: the floating tab bar in light mode uses `shadow-tabbar` (`0 4px 24px rgba(15,23,42,.08)`) so it reads as floating over a near-white page. In dark mode that shadow is `none`.

The tab bar is `--surface` at 80% with `backdrop-blur-md` in both themes (`bg-tabbar`).

### Don'ts
- **Don't add `shadow-sm` / `shadow-md` / `shadow-lg` to any in-app surface.**
- **Don't add glow shadows.** They are gone and stay gone.

---

## 7. Shell & interaction patterns

**Floating tab bar (mobile).** `components/shell/TabBar.tsx`. A rounded-full pill inset 16px from the screen edges and the safe-area bottom (`.tabbar-inset`). Five icon-only tabs in this order: Search, Inventory, **Home** (centre, default route), POS, More. The active tab sits in a raised `surface-2` pill with an accent icon. Content clears it with `.pb-tabbar-safe` on `<main>`; anything else pinned to the bottom (confirm buttons, action bars) sits above it.

**Rail (desktop).** `components/shell/Rail.tsx`. The same five items, icon-only, 80px wide. Content shifts right with `md:pl-20`.

**More.** `/protected/more`, a grouped list — Shows first, then money, people, app. Its header carries the quick theme icon; the full System | Light | Dark toggle is in Settings.

**Bottom sheet.** Drag handle, `rounded-3xl` top corners, `bg-surface`. Drag down or X to close; with unsaved changes, close asks first. Save button full-width accent, pinned above the safe area, disabled until something changes.

**Context menu (long-press / right-click).** Dims the page, lifts a `surface-2` `rounded-2xl` card near the item: full-width rows of icon + label separated by `border`. Delete is in `down` and separated by a thicker gap. Threshold 450ms; a scroll cancels. `navigator.vibrate(10)` on open where supported.

**Control sizes (tap targets).** `Button` default / `sm` / `icon` are `h-11`; `Input` is `h-11`; `IconButton` is 44px. Don't shrink them.

**Toast notifications.** Bottom-centre, stacked, `rounded-2xl`, above the tab bar, max 3 visible. Auto-dismiss 4s (success) / 6s (warning) / never (error). Use `<Toast />`.

**Skeleton loading.** Same shape + size as final content, `surface-2 → surface` shimmer. No spinners except inline async actions. Use `<Skeleton />`.

**Empty states.** Ghost preview of what will appear + starter CTA. Never "No items yet." alone. Use `<EmptyState />`.

---

## 8. Canonical primitives

All in `components/ui/`, exported from `components/ui/index.ts`.

| Primitive | What it is |
|---|---|
| `SegmentedControl` | Pill track, selected segment raised (Value \| Profit, Raw \| Graded) |
| `TabStrip` | Text tabs with a 2px accent underline (Buy \| Sell \| Trade, RAW \| GRADED) |
| `Chip` / `ChipRow` | Filter pill; selected = accent-tint bg + accent text. ChipRow scrolls horizontally |
| `RangePicker` | 1W 1M 3M 6M 1Y All as plain text, active bright |
| `HeroValue` | 48px bold number; label above as a muted dropdown trigger |
| `CountStat` / `CountStatRow` | Muted label over a big number, no background (Raw \| Graded \| Sealed) |
| `CardTile` | Card art tile with frosted overlay (name, meta, price ▲▼); consigned badge; no-image fallback |
| `SearchBar` | Rounded-full field with a trailing camera icon that opens the cert scanner |
| `IconButton` | 44px round surface button; `showLabel` for Home quick actions |
| `StatCard` | Framed stat (legacy; prefer HeroValue / CountStat on new screens) |
| `MoneyDisplay` | Formatted amount with sign, tone, tabular nums |
| `SectionHeader` | Uppercase label above a list |
| `Skeleton`, `Modal`, `EmptyState`, `Toast`, `ConfirmDialog` | As named |

**Prefer these over raw Tailwind.** If you find yourself recreating one inline, stop — import the primitive. If it doesn't fit, extend it; don't fork it.

---

## 9. Quick audit checklist

Before committing, grep your diff for:
- `text-red-` · `text-blue-` · `text-green-` · `text-yellow-` · `violet` → swap to `up` / `down` / `accent`
- `#[0-9a-f]{6}` · `bg-[#` → swap to a token
- `style={{ color` · `style={{ background` · `var(--` in TSX → token classes
- `rounded-md` · `rounded-sm` · bare `rounded` → swap to scale
- `shadow-` (anything but `shadow-tabbar`) → remove
- `text-[` → swap to scale
- `duration-300` · `duration-500` → 150 or 200
- Raw money formatting → `<MoneyDisplay />` / `<HeroValue />`
- `max-w-* mx-auto` inside a flex container needs `w-full`, or it shrinks to content and won't centre
- Every file under `app/protected` stays under 500 lines — split by section
- Screenshot at 390px wide in **both** themes; nothing under 4.5:1 contrast
