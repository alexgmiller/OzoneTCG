// Pure logic for the bulk edit sheet: which values are "Mixed" across the
// selection, the three sticker-price modes, and the per-item patches that
// result. No React, no Supabase.

import type { Condition, Item } from "./types";

export type StickerMode = "set" | "pct" | "delta";
export type RoundTo = "none" | "1" | "5";

export type BulkForm = {
  owner: string;            // "" = unchanged | "ozone" | consigner id
  paidBy: string;           // "" = unchanged | "alex" | "mila" | "shared"
  condition: Condition | ""; // raw only
  status: string;           // "" = unchanged | "inventory" | "grading"
  notesAppend: string;
  sticker: { mode: StickerMode; value: string; roundTo: RoundTo } | null;
};

export const blankBulkForm = (): BulkForm => ({ owner: "", paidBy: "", condition: "", status: "", notesAppend: "", sticker: null });

// A field whose value differs across the selection shows "Mixed"
export function mixed<T>(items: Item[], pick: (it: Item) => T): boolean {
  if (items.length < 2) return false;
  const first = pick(items[0]);
  return items.some((it) => pick(it) !== first);
}

export function roundSticker(v: number, to: RoundTo): number {
  if (to === "1") return Math.round(v);
  if (to === "5") return Math.round(v / 5) * 5;
  return Math.round(v * 100) / 100;
}

// Sticker for one item under the chosen mode; null when it can't be computed
export function stickerFor(it: Item, fmv: number | null, s: NonNullable<BulkForm["sticker"]>): number | null {
  const v = Number(s.value);
  if (!Number.isFinite(v)) return null;
  if (s.mode === "set") return roundSticker(v, s.roundTo);
  if (s.mode === "pct") return fmv == null ? null : roundSticker((fmv * v) / 100, s.roundTo);
  const base = it.sticker_price ?? fmv;
  return base == null ? null : roundSticker(base + v, s.roundTo);
}

export type ItemPatch = Record<string, unknown>;

// Per-item patches for the server. Only touched fields appear.
export function buildPatches(items: Item[], form: BulkForm, fmvOf: (it: Item) => number | null): { id: string; patch: ItemPatch }[] {
  return items.map((it) => {
    const patch: ItemPatch = {};
    if (form.owner === "ozone") { patch.owner = form.paidBy || (it.owner === "consigner" ? "shared" : it.owner); patch.consigner_id = null; }
    else if (form.owner) { patch.owner = "consigner"; patch.consigner_id = form.owner; }
    else if (form.paidBy && it.owner !== "consigner") patch.owner = form.paidBy;
    if (form.condition && it.category === "single") patch.condition = form.condition;
    if (form.status) patch.status = form.status;
    if (form.notesAppend.trim()) patch.notes = [it.notes?.trim(), form.notesAppend.trim()].filter(Boolean).join("\n");
    if (form.sticker) {
      const s = stickerFor(it, fmvOf(it), form.sticker);
      if (s != null) patch.sticker_price = s;
    }
    return { id: it.id, patch };
  }).filter((p) => Object.keys(p.patch).length > 0);
}

// "Update 3 items: sticker price, owner"
export function summarize(form: BulkForm, count: number): string {
  const parts: string[] = [];
  if (form.sticker) parts.push("sticker price");
  if (form.owner || form.paidBy) parts.push("owner");
  if (form.condition) parts.push("condition");
  if (form.status) parts.push("status");
  if (form.notesAppend.trim()) parts.push("notes");
  return `Update ${count} item${count === 1 ? "" : "s"}${parts.length ? `: ${parts.join(", ")}` : ""}`;
}

// The inverse patches, so an edit can be undone from the toast
export function undoPatches(items: Item[], applied: { id: string; patch: ItemPatch }[]): { id: string; patch: ItemPatch }[] {
  const byId = new Map(items.map((it) => [it.id, it]));
  return applied.map(({ id, patch }) => {
    const it = byId.get(id);
    const before: ItemPatch = {};
    for (const key of Object.keys(patch)) before[key] = it ? (it as unknown as Record<string, unknown>)[key] ?? null : null;
    return { id, patch: before };
  });
}
