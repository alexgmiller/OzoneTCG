"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Minus, Plus, ScanLine } from "lucide-react";
import { parseGrade } from "@/lib/ebay-client";
import { MoneyDisplay, SegmentedControl, Sheet } from "@/components/ui";
import CardAutocomplete, { type AutocompleteCard } from "@/components/CardAutocomplete";
import { cn } from "@/lib/utils";
import { fetchCardData, uploadCardImage } from "../actions";
import type { Category, Condition, ConsignerOption, ItemForm, Owner } from "../types";
import { GRADE_COMPANIES, fieldClass } from "../utils";

// ── Edit / Add item sheet ──
// One bottom sheet for both flows. Owner is "OzoneTCG" or a consigner; Paid by
// (Alex | Mila | Shared) is the existing `owner` value on non-consigned items.
// Raw shows condition chips; Graded shows grader, grade and cert, with the
// Black Label / Pristine toggle when it applies. Save is disabled until
// something changes; closing with changes asks first.

type Props = {
  open: boolean;
  mode: "edit" | "add";
  form: ItemForm;
  setForm: (f: ItemForm) => void;
  initial: ItemForm;
  consigners: ConsignerOption[];
  fmv: number | null;
  busy: boolean;
  onClose: () => void;
  onSave: () => void;
  onScanCert?: () => void;
};

const CONDITIONS: readonly { value: Condition; short: string }[] = [
  { value: "Near Mint", short: "NM" }, { value: "Lightly Played", short: "LP" }, { value: "Moderately Played", short: "MP" },
  { value: "Heavily Played", short: "HP" }, { value: "Damaged", short: "DMG" },
];
const GRADES = ["10", "9.5", "9", "8", "7", "6", "5"] as const;
const KIND = [{ value: "single", label: "Raw" }, { value: "slab", label: "Graded" }, { value: "sealed", label: "Sealed" }] as const;
const PAYERS = [{ value: "alex", label: "Alex" }, { value: "mila", label: "Mila" }, { value: "shared", label: "Shared" }] as const;

const chip = (on: boolean) => cn(
  "flex h-10 min-w-11 items-center justify-center rounded-full px-3 text-sm font-medium transition-colors duration-150",
  on ? "bg-accent-tint text-accent ring-1 ring-accent" : "bg-surface-2 text-muted-foreground",
);

function splitGrade(grade: string): { company: string; score: string; label: string } {
  const p = parseGrade(grade);
  if (!p) return { company: "PSA", score: "", label: "" };
  const [score, ...rest] = p.grade.split(" ");
  return { company: p.company, score, label: rest.join(" ") };
}

export function EditItemSheet({ open, mode, form, setForm, initial, consigners, fmv, busy, onClose, onSave, onScanCert }: Props) {
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial), [form, initial]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [otherGrade, setOtherGrade] = useState(false);

  const g = splitGrade(form.grade);
  const setGrade = (company: string, score: string, label: string) =>
    setForm({ ...form, grade: score ? `${company} ${score}${label ? ` ${label}` : ""}` : "" });
  const specialLabel = g.company === "BGS" ? "Black Label" : g.company === "CGC" ? "Pristine" : null;
  const isConsigned = form.owner === "consigner";

  useEffect(() => { if (g.score && !GRADES.includes(g.score as (typeof GRADES)[number])) setOtherGrade(true); }, [g.score]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (form.name) fd.append("name", form.name);
      if (form.cardNumber) fd.append("cardNumber", form.cardNumber);
      setForm({ ...form, imageUrl: await uploadCardImage(fd) });
    } catch { /* user can retry */ } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  async function findImage() {
    if (!form.name) return;
    const r = await fetchCardData(form.name, form.setName || null, form.cardNumber || null);
    if (r?.imageUrl) setForm({ ...form, imageUrl: r.imageUrl });
  }

  const qty = Math.max(1, parseInt(form.quantity) || 1);
  const canSave = dirty && form.name.trim().length > 0 && !busy;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={mode === "edit" ? "Edit" : "Add"}
      dirty={dirty}
      footer={
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="h-12 w-full rounded-full bg-accent text-base font-semibold text-bg transition-colors duration-150 disabled:opacity-40"
        >
          {busy ? "Saving…" : mode === "edit" ? "Save Changes" : "Add to Inventory"}
        </button>
      }
    >
      <div className="space-y-5">
        {/* ── Item header ── */}
        <div className="flex gap-3">
          <button type="button" onClick={() => fileRef.current?.click()} className="h-20 w-14 shrink-0 overflow-hidden rounded-xl bg-surface-2" aria-label="Change photo">
            {form.imageUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={form.imageUrl} alt="" className="h-full w-full object-cover" />
              : <Camera size={18} className="mx-auto text-muted-foreground" />}
          </button>
          <div className="min-w-0 flex-1 space-y-1">
            <CardAutocomplete
              className={cn(fieldClass, "font-semibold")}
              placeholder="Name"
              value={form.name}
              onChange={(v) => setForm({ ...form, name: v })}
              onSelect={(card: AutocompleteCard) => setForm({
                ...form, name: card.name, setName: card.setName ?? "", cardNumber: card.cardNumber ?? "",
                imageUrl: card.imageUrl ?? form.imageUrl, cardId: card.cardId ?? "",
                ...(card.market != null ? { market: String(card.market) } : {}),
              })}
            />
            <div className="flex gap-2">
              <input className={cn(fieldClass, "min-w-0 flex-1 text-xs")} placeholder="Set" value={form.setName} onChange={(e) => setForm({ ...form, setName: e.target.value })} />
              <input className={cn(fieldClass, "w-20 text-xs")} placeholder="#" value={form.cardNumber} onChange={(e) => setForm({ ...form, cardNumber: e.target.value })} />
            </div>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={upload} />
        <div className="flex gap-2 text-xs">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="text-accent">{uploading ? "Uploading…" : form.imageUrl ? "Replace photo" : "Upload photo"}</button>
          <button type="button" onClick={findImage} disabled={!form.name} className="text-accent disabled:opacity-40">Find image</button>
          {form.imageUrl && <button type="button" onClick={() => setForm({ ...form, imageUrl: "" })} className="text-down">Remove</button>}
        </div>

        {/* ── Owner ── */}
        <label className="block">
          <span className="section-label mb-1 block">Owner</span>
          <select
            className={fieldClass}
            value={isConsigned ? form.consignerId : "ozone"}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "ozone") setForm({ ...form, owner: "shared", consignerId: "" });
              else setForm({ ...form, owner: "consigner", consignerId: v });
            }}
          >
            <option value="ozone">OzoneTCG</option>
            {consigners.map((c) => <option key={c.id} value={c.id}>{c.name} ({Math.round(c.rate * 100)}%)</option>)}
          </select>
        </label>

        {/* ── Raw | Graded | Sealed ── */}
        <SegmentedControl value={form.category} onChange={(v: Category) => setForm({ ...form, category: v })} options={KIND} size="sm" aria-label="Kind" />

        {form.category === "single" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">Condition</span>
              <span className="text-sm text-muted-foreground">{form.condition}</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {CONDITIONS.map((c) => (
                <button key={c.value} type="button" className={chip(form.condition === c.value)} onClick={() => setForm({ ...form, condition: c.value })}>{c.short}</button>
              ))}
            </div>
          </div>
        )}

        {form.category === "slab" && (
          <div className="space-y-3">
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
              {GRADE_COMPANIES.map((co) => (
                <button key={co} type="button" className={chip(g.company === co)} onClick={() => setGrade(co, g.score, "")}>{co}</button>
              ))}
            </div>
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
              {GRADES.map((s) => (
                <button key={s} type="button" className={chip(g.score === s && !otherGrade)} onClick={() => { setOtherGrade(false); setGrade(g.company, s, s === "10" ? g.label : ""); }}>{s}</button>
              ))}
              <button type="button" className={chip(otherGrade)} onClick={() => setOtherGrade(true)}>other</button>
            </div>
            {otherGrade && (
              <input className={fieldClass} placeholder="Grade" value={g.score} onChange={(e) => setGrade(g.company, e.target.value.trim(), "")} />
            )}
            {specialLabel && g.score === "10" && (
              <label className="flex h-11 items-center justify-between text-sm">
                <span>{specialLabel}</span>
                <button type="button" role="switch" aria-checked={g.label === specialLabel} onClick={() => setGrade(g.company, "10", g.label === specialLabel ? "" : specialLabel)}
                  className={cn("relative h-6 w-11 rounded-full transition-colors duration-150", g.label === specialLabel ? "bg-accent" : "bg-surface-2")}>
                  <span className={cn("absolute top-1 h-4 w-4 rounded-full bg-surface transition-transform duration-150", g.label === specialLabel ? "left-6" : "left-1")} />
                </button>
              </label>
            )}
            <div className="relative">
              <input className={cn(fieldClass, "pr-11 font-mono")} placeholder="Cert number" value={form.certNumber} inputMode="numeric" onChange={(e) => setForm({ ...form, certNumber: e.target.value })} />
              {onScanCert && (
                <button type="button" onClick={onScanCert} aria-label="Scan cert" className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
                  <ScanLine size={18} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Price paid · Qty ── */}
        <div className="flex gap-3">
          <label className="min-w-0 flex-1">
            <span className="section-label mb-1 block">Price paid</span>
            <input className={cn(fieldClass, "tabular-nums")} placeholder="0.00" inputMode="decimal" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value, buyPct: "" })} />
          </label>
          <div>
            <span className="section-label mb-1 block">Qty</span>
            <div className="flex h-11 items-center rounded-xl bg-surface-2">
              <button type="button" aria-label="Fewer" className="flex h-11 w-11 items-center justify-center" onClick={() => setForm({ ...form, quantity: String(Math.max(1, qty - 1)) })}><Minus size={16} /></button>
              <span className="w-8 text-center text-sm tabular-nums">{qty}</span>
              <button type="button" aria-label="More" className="flex h-11 w-11 items-center justify-center" onClick={() => setForm({ ...form, quantity: String(qty + 1) })}><Plus size={16} /></button>
            </div>
          </div>
        </div>

        {/* ── Sticker ── */}
        <label className="block">
          <span className="section-label mb-1 block">Sticker price</span>
          <input className={cn(fieldClass, "tabular-nums")} placeholder="0.00" inputMode="decimal" value={form.stickerPrice} onChange={(e) => setForm({ ...form, stickerPrice: e.target.value })} />
          {fmv != null && (
            <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              FMV <MoneyDisplay amount={fmv} tone="neutral" />
              <button type="button" className="text-accent" onClick={() => setForm({ ...form, stickerPrice: fmv.toFixed(2) })}>· Use</button>
            </span>
          )}
        </label>

        {/* ── Paid by ── */}
        {!isConsigned && (
          <div>
            <span className="section-label mb-1 block">Paid by</span>
            <SegmentedControl value={form.owner as Exclude<Owner, "consigner">} onChange={(v) => setForm({ ...form, owner: v })} options={PAYERS} size="sm" aria-label="Paid by" />
          </div>
        )}

        <textarea className={cn(fieldClass, "h-20 resize-none py-2")} placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
    </Sheet>
  );
}
