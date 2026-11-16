"use client";

import { useMemo, useState } from "react";
import { Chip, SegmentedControl, Sheet } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { Condition, ConsignerOption, Item } from "../types";
import { fieldClass } from "../utils";
import {
  blankBulkForm, buildPatches, mixed, summarize,
  type BulkForm, type ItemPatch, type RoundTo, type StickerMode,
} from "../bulkEdit";

// ── Bulk edit sheet ──
// Same look as the item sheet, only these fields: Owner, Condition (raw
// only), Sticker price, Paid by, Status, Notes (append). A field whose value
// differs across the selection shows "Mixed" and is left unchanged unless
// edited. The summary line says exactly what will change before saving.

type Props = {
  open: boolean;
  items: Item[];
  consigners: ConsignerOption[];
  fmvOf: (it: Item) => number | null;
  busy: boolean;
  onClose: () => void;
  onApply: (patches: { id: string; patch: ItemPatch }[], summary: string) => Promise<void>;
};

const CONDITIONS: readonly { value: Condition; short: string }[] = [
  { value: "Near Mint", short: "NM" }, { value: "Lightly Played", short: "LP" }, { value: "Moderately Played", short: "MP" },
  { value: "Heavily Played", short: "HP" }, { value: "Damaged", short: "DMG" },
];
const STICKER_MODES = [{ value: "set", label: "Set $" }, { value: "pct", label: "% of FMV" }, { value: "delta", label: "± $" }] as const;
const ROUND: readonly { value: RoundTo; label: string }[] = [{ value: "none", label: "No rounding" }, { value: "1", label: "$1" }, { value: "5", label: "$5" }];

function Mixed({ on }: { on: boolean }) {
  return on ? <span className="ml-2 text-xs text-muted-foreground">Mixed</span> : null;
}

export function BulkEditSheet({ open, items, consigners, fmvOf, busy, onClose, onApply }: Props) {
  const [form, setForm] = useState<BulkForm>(blankBulkForm);
  const patches = useMemo(() => buildPatches(items, form, fmvOf), [items, form, fmvOf]);
  const summary = summarize(form, items.length);
  const dirty = patches.length > 0;
  const anyRaw = items.some((it) => it.category === "single");

  const m = {
    owner: mixed(items, (it) => (it.owner === "consigner" ? it.consigner_id : "ozone")),
    paidBy: mixed(items.filter((it) => it.owner !== "consigner"), (it) => it.owner),
    condition: mixed(items.filter((it) => it.category === "single"), (it) => it.condition),
    status: mixed(items, (it) => it.status),
  };

  const sticker = form.sticker;
  const setSticker = (patch: Partial<NonNullable<BulkForm["sticker"]>> | null) =>
    setForm({ ...form, sticker: patch === null ? null : { mode: "set", value: "", roundTo: "none", ...(form.sticker ?? {}), ...patch } });

  return (
    <Sheet
      open={open}
      onClose={() => { setForm(blankBulkForm()); onClose(); }}
      title={`Edit ${items.length} item${items.length === 1 ? "" : "s"}`}
      dirty={dirty}
      footer={
        <div className="space-y-2">
          <p className="text-center text-xs text-muted-foreground">{dirty ? summary : "Nothing changed yet"}</p>
          <button
            type="button"
            disabled={!dirty || busy}
            onClick={async () => { await onApply(patches, summary); setForm(blankBulkForm()); }}
            className="h-12 w-full rounded-full bg-accent text-base font-semibold text-bg transition-colors duration-150 disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save Changes"}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* ── Owner ── */}
        <label className="block">
          <span className="section-label mb-1 block">Owner<Mixed on={m.owner && !form.owner} /></span>
          <select className={fieldClass} value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })}>
            <option value="">{m.owner ? "— Mixed —" : "— Unchanged —"}</option>
            <option value="ozone">OzoneTCG</option>
            {consigners.map((c) => <option key={c.id} value={c.id}>{c.name} ({Math.round(c.rate * 100)}%)</option>)}
          </select>
        </label>

        {/* ── Condition (raw only) ── */}
        {anyRaw && (
          <div>
            <span className="section-label mb-1 block">Condition<Mixed on={m.condition && !form.condition} /></span>
            <div className="grid grid-cols-5 gap-2">
              {CONDITIONS.map((c) => (
                <Chip key={c.value} selected={form.condition === c.value} onClick={() => setForm({ ...form, condition: form.condition === c.value ? "" : c.value })} className="justify-center">
                  {c.short}
                </Chip>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Applies to raw singles in the selection only.</p>
          </div>
        )}

        {/* ── Sticker price ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="section-label">Sticker price</span>
            {sticker && <button type="button" className="text-xs text-muted-foreground" onClick={() => setSticker(null)}>Leave unchanged</button>}
          </div>
          <SegmentedControl
            value={(sticker?.mode ?? "set") as StickerMode}
            onChange={(v) => setSticker({ mode: v })}
            options={STICKER_MODES}
            size="sm"
            aria-label="Sticker mode"
            className={cn(!sticker && "opacity-60")}
          />
          <input
            className={cn(fieldClass, "tabular-nums")}
            inputMode="decimal"
            placeholder={sticker?.mode === "pct" ? "e.g. 120" : sticker?.mode === "delta" ? "e.g. -5" : "0.00"}
            value={sticker?.value ?? ""}
            onChange={(e) => setSticker({ value: e.target.value })}
          />
          <div className="flex gap-2">
            {ROUND.map((r) => (
              <Chip key={r.value} selected={(sticker?.roundTo ?? "none") === r.value} onClick={() => setSticker({ roundTo: r.value })} disabled={!sticker}>
                {r.label}
              </Chip>
            ))}
          </div>
        </div>

        {/* ── Paid by ── */}
        <div>
          <span className="section-label mb-1 block">Paid by<Mixed on={m.paidBy && !form.paidBy} /></span>
          <div className="flex gap-2">
            {(["alex", "mila", "shared"] as const).map((p) => (
              <Chip key={p} selected={form.paidBy === p} onClick={() => setForm({ ...form, paidBy: form.paidBy === p ? "" : p })} className="flex-1 justify-center capitalize">
                {p}
              </Chip>
            ))}
          </div>
        </div>

        {/* ── Status ── */}
        <div>
          <span className="section-label mb-1 block">Status<Mixed on={m.status && !form.status} /></span>
          <div className="flex gap-2">
            {(["inventory", "grading"] as const).map((s) => (
              <Chip key={s} selected={form.status === s} onClick={() => setForm({ ...form, status: form.status === s ? "" : s })} className="flex-1 justify-center capitalize">
                {s}
              </Chip>
            ))}
          </div>
        </div>

        {/* ── Notes (append) ── */}
        <label className="block">
          <span className="section-label mb-1 block">Add to notes</span>
          <textarea className={cn(fieldClass, "h-20 resize-none py-2")} placeholder="Appended to each item's notes" value={form.notesAppend} onChange={(e) => setForm({ ...form, notesAppend: e.target.value })} />
        </label>
      </div>
    </Sheet>
  );
}
