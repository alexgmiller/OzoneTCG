"use client";

import { useEffect, useState, useRef } from "react";
import { parseGrade } from "@/lib/ebay-client";
import { uploadCardImage } from "../actions";
import CardAutocomplete, { type AutocompleteCard } from "@/components/CardAutocomplete";
import type { Category, Owner, Status, Condition, ConsignerOption, ItemForm } from "../types";
import { GRADE_OPTIONS, GRADE_COMPANIES, fieldClass, btnOutline } from "../utils";

// ── Shared item form (add panel + edit modal) ──
export default function ItemFormFields({
  form,
  setForm,
  consigners,
  onFind,
  findConfirmed,
  findError,
}: {
  form: ItemForm;
  setForm: (f: ItemForm) => void;
  consigners: ConsignerOption[];
  onFind?: () => void;
  findConfirmed?: string | null;
  findError?: string | null;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Two-dropdown grade: company tracked locally, score derived from form.grade
  const [gradeCompany, setGradeCompany] = useState<string>(() => {
    const co = parseGrade(form.grade ?? "")?.company?.toUpperCase() ?? "";
    return GRADE_COMPANIES.includes(co as typeof GRADE_COMPANIES[number]) ? co : "PSA";
  });
  useEffect(() => {
    const co = parseGrade(form.grade ?? "")?.company?.toUpperCase() ?? "";
    if (GRADE_COMPANIES.includes(co as typeof GRADE_COMPANIES[number])) setGradeCompany(co);
  }, [form.grade]);
  const gradeScore = parseGrade(form.grade ?? "")?.grade ?? "";

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (form.cardId) fd.append("cardId", form.cardId);
      if (form.name) fd.append("name", form.name);
      if (form.cardNumber) fd.append("cardNumber", form.cardNumber);
      const url = await uploadCardImage(fd);
      setForm({ ...form, imageUrl: url });
    } catch {
      // silent — user can retry
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function costFrom(market: string, buyPct: string) {
    const pct = Number(buyPct);
    const mkt = Number(market);
    return buyPct && pct > 0 && mkt > 0 ? ((mkt * pct) / 100).toFixed(2) : form.cost;
  }

  return (
    <div className="space-y-3">
      {/* ── Type / owner / status / condition ── */}
      <div className="grid grid-cols-2 gap-2">
        <select className={fieldClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Category })}>
          <option value="single">Single</option>
          <option value="slab">Slab</option>
          <option value="sealed">Sealed</option>
        </select>

        <select
          className={fieldClass}
          value={form.owner === "consigner" && form.consignerId ? `consigner:${form.consignerId}` : form.owner}
          onChange={(e) => {
            const v = e.target.value;
            if (v.startsWith("consigner:")) setForm({ ...form, owner: "consigner", consignerId: v.slice("consigner:".length) });
            else setForm({ ...form, owner: v as Owner, consignerId: "" });
          }}
        >
          <option value="shared">Shared</option>
          <option value="alex">Alex</option>
          <option value="mila">Mila</option>
          {consigners.length > 0 && (
            <optgroup label="Consigners">
              {consigners.map((c) => (
                <option key={c.id} value={`consigner:${c.id}`}>{c.name} ({Math.round(c.rate * 100)}%)</option>
              ))}
            </optgroup>
          )}
        </select>

        <select className={fieldClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Status })}>
          <option value="inventory">Inventory</option>
          {form.category === "single" && <option value="grading">Grading</option>}
        </select>

        {form.category === "slab" ? (
          <div className="flex gap-2">
            <select className={`${fieldClass} w-20 flex-none`} value={gradeCompany} onChange={(e) => { setGradeCompany(e.target.value); setForm({ ...form, grade: "" }); }}>
              {GRADE_COMPANIES.map((co) => <option key={co} value={co}>{co}</option>)}
            </select>
            <select className={`${fieldClass} min-w-0 flex-1`} value={gradeScore} onChange={(e) => setForm({ ...form, grade: e.target.value ? `${gradeCompany} ${e.target.value}` : "" })}>
              <option value="">— Grade —</option>
              {GRADE_OPTIONS[gradeCompany]?.top.map((g) => <option key={g} value={g}>{g}</option>)}
              <option disabled>──────</option>
              {GRADE_OPTIONS[gradeCompany]?.rest.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        ) : form.category === "sealed" ? (
          <select className={fieldClass} value={form.productType} onChange={(e) => setForm({ ...form, productType: e.target.value })}>
            <option value="">— Type —</option>
            <option value="booster_box">Booster Box</option>
            <option value="etb">Elite Trainer Box</option>
            <option value="tin">Tin</option>
            <option value="collection_box">Collection Box</option>
            <option value="bundle">Bundle</option>
            <option value="booster_pack">Booster Pack</option>
            <option value="promo_box">Promo Box</option>
            <option value="other">Other</option>
          </select>
        ) : (
          <select className={fieldClass} value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value as Condition })}>
            <option value="Near Mint">Near Mint</option>
            <option value="Lightly Played">Lightly Played</option>
            <option value="Moderately Played">Moderately Played</option>
            <option value="Heavily Played">Heavily Played</option>
            <option value="Damaged">Damaged</option>
          </select>
        )}
      </div>

      {form.category === "sealed" && (
        <div className="grid grid-cols-2 gap-2">
          <input className={`${fieldClass} tabular-nums`} placeholder="Quantity" value={form.quantity} inputMode="numeric" onChange={(e) => setForm({ ...form, quantity: e.target.value.replace(/\D/g, "") || "1" })} />
          <select className={fieldClass} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
            <option value="english">English</option>
            <option value="japanese">Japanese</option>
            <option value="korean">Korean</option>
            <option value="chinese">Chinese</option>
            <option value="other">Other</option>
          </select>
        </div>
      )}

      {/* ── Identification ── */}
      <div className="space-y-2">
        <CardAutocomplete
          className={fieldClass}
          placeholder="Name *"
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          onSelect={(card: AutocompleteCard) => {
            setForm({
              ...form,
              name: card.name,
              setName: card.setName ?? "",
              cardNumber: card.cardNumber ?? "",
              imageUrl: card.imageUrl ?? "",
              cardId: card.cardId ?? "",
              ...(card.market != null ? { market: String(card.market) } : {}),
            });
          }}
        />
        {onFind && (
          <div className="flex gap-2">
            <input className={`${fieldClass} min-w-0 flex-1`} placeholder="Set name (optional)" value={form.setName} onChange={(e) => setForm({ ...form, setName: e.target.value })} />
            <input className={`${fieldClass} w-24 min-w-0`} placeholder="Card #" value={form.cardNumber} onChange={(e) => setForm({ ...form, cardNumber: e.target.value })} />
            <button type="button" onClick={onFind} className={`${btnOutline} shrink-0`}>Find</button>
          </div>
        )}
        {findConfirmed && (
          <div className="flex items-center gap-2 rounded-lg border border-positive-border bg-positive-soft px-3 py-2 text-xs text-positive">
            <span className="font-medium">✓</span>
            <span className="truncate">{findConfirmed}</span>
          </div>
        )}
        {findError && (
          <div className="rounded-lg border border-negative-border bg-negative-soft px-3 py-2 text-xs text-negative">{findError}</div>
        )}
      </div>

      {/* ── Prices ── */}
      <div className="grid grid-cols-2 gap-2">
        <input className={`${fieldClass} tabular-nums`} placeholder="Market" value={form.market} inputMode="decimal" onChange={(e) => setForm({ ...form, market: e.target.value, cost: costFrom(e.target.value, form.buyPct) })} />
        <div className="relative">
          <input className={`${fieldClass} pr-8 tabular-nums`} placeholder="Buy %" value={form.buyPct} inputMode="decimal" onChange={(e) => setForm({ ...form, buyPct: e.target.value, cost: costFrom(form.market, e.target.value) })} />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
        </div>
        <input className={`${fieldClass} col-span-2 tabular-nums`} placeholder={form.buyPct && form.market ? `Cost (auto: ${form.cost || "—"})` : "Cost"} value={form.cost} inputMode="decimal" onChange={(e) => setForm({ ...form, cost: e.target.value, buyPct: "" })} />
        <input className={`${fieldClass} col-span-2 tabular-nums`} placeholder="Sticker price" value={form.stickerPrice} inputMode="decimal" onChange={(e) => setForm({ ...form, stickerPrice: e.target.value })} />
      </div>

      <textarea className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" placeholder="Notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />

      {/* ── Image ── */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
      {form.imageUrl ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={form.imageUrl} alt="preview" className="h-32 w-auto shrink-0 rounded-lg border border-border object-contain" />
          <div className="flex-1 space-y-2">
            <input className={fieldClass} placeholder="Image URL" value={form.imageUrl ?? ""} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />
            <div className="flex gap-2">
              <button type="button" className={btnOutline} onClick={() => fileInputRef.current?.click()} disabled={uploadingImage}>
                {uploadingImage ? "Uploading…" : "Replace photo"}
              </button>
              <button type="button" className="h-11 px-3 text-sm font-medium text-negative" onClick={() => setForm({ ...form, imageUrl: "" })}>
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <input className={fieldClass} placeholder="Image URL (or use Find / Scan to auto-fill)" value={form.imageUrl ?? ""} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />
          <button type="button" className={btnOutline} onClick={() => fileInputRef.current?.click()} disabled={uploadingImage}>
            {uploadingImage ? "Uploading…" : "Upload photo"}
          </button>
        </div>
      )}
    </div>
  );
}
