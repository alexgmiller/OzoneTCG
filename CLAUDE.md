# Ozone TCG — Claude Code conventions

## Read first
- `.claude/design-system.md` — **required reading before any UI work**. Color tokens, spacing, type, radius, don'ts.
- `components/ui/` — canonical primitives. Prefer these over raw Tailwind. If you're recreating `StatCard`, `Modal`, `Skeleton`, `EmptyState`, `SectionHeader`, `MoneyDisplay`, or `Toast` inline, stop and import instead.

## Stack
Next.js (App Router) + TypeScript + Tailwind + shadcn-style primitives.

## File conventions
- Server actions live in `actions.ts` next to the route they serve (`app/deals/[id]/actions.ts`). Mark with `"use server"` at the top of the file.
- Client components are suffixed `Client.tsx` (`DealHeaderClient.tsx`). Server components have no suffix.
- Shared UI primitives live in `components/ui/`. Feature components live in `components/<feature>/`.
- Tokens and Tailwind theme extensions are in `tailwind.config.ts` — don't hard-code colors, extend the theme.

## UI rules of thumb
1. **Semantic colors only.** `emerald` = positive, `rose` = negative, `amber` = warning, `violet` = primary. Never `red`, `green`, `yellow`, `blue` in Tailwind classes.
2. **No shadows.** Depth = border + background contrast. See design-system §6.
3. **No arbitrary values.** `text-[13px]`, `p-[11px]`, `rounded-[7px]` are banned except one documented exception (inventory card caption = `text-[11px]`).
4. **Tabular nums on all money and counts.** Use `<MoneyDisplay />` — it handles this.
5. **Transitions ≤ 200ms.** See design-system §5.

## Memory pattern
Use the `memory_user_edits` pattern established for this project — when the user tweaks values inline, persist the edit to their preferences so subsequent sessions respect it. See `lib/memory/user-edits.ts`.

## Don't
- Don't introduce new color tokens without updating `.claude/design-system.md` and `tailwind.config.ts` together.
- Don't build "yet another" Modal/Skeleton/Toast. Extend the primitive.
- Don't commit mockup HTML into `app/`. Design explorations live in `/designs/` and are not shipped.
- Don't skip `tabular-nums` on numeric columns. Money jitter is a bug.
