"use client";

import { useEffect, useState, useRef } from "react";
import { parseGrade } from "@/lib/ebay-client";
import { uploadCardImage } from "../actions";
import CardAutocomplete, { type AutocompleteCard } from "@/components/CardAutocomplete";
import type { Category, Owner, Status, Condition, ConsignerOption, ItemForm } from "../types";
import { GRADE_OPTIONS, GRADE_COMPANIES } from "../utils";

export default function ItemFormFields({
  form,
  setForm,
  consigners,
  onFind,
  finding,
  findConfirmed,
  findError,
}: {
  form: ItemForm;
  setForm: (f: ItemForm) => void;
  consigners: ConsignerOption[];
  onFind?: () => void;
  finding?: boolean;
  findConfirmed?: string | null;
  findError?: string | null;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Two-dropdown grade state: company is tracked locally, grade score derived from form.grade
  const [gradeCompany, setGradeCompany] = useState<string>(() => {
    const p = parseGrade(form.grade ?? "");
    const co = p?.company?.toUpperCase() ?? "";
    return GRADE_COMPANIES.includes(co as typeof GRADE_COMPANIES[number]) ? co : "PSA";
  });
  // Sync gradeCompany when form.grade is set externally (e.g. card search auto-fill)
  useEffect(() => {
    const p = parseGrade(form.grade ?? "");
    const co = p?.company?.toUpperCase() ?? "";
    if (GRADE_COMPANIES.includes(co as typeof GRADE_COMPANIES[number])) {
      setGradeCompany(co);
    }
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

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <select
          className="border rounded-lg px-3 py-2 text-sm bg-background"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
        >
          <option value="single">Single</option>
          <option value="slab">Slab</option>
          <option value="sealed">Sealed</option>
        </select>

        <select
          className="border rounded-lg px-3 py-2 text-sm bg-background"
          value={form.owner === "consigner" && form.consignerId ? `consigner:${form.consignerId}` : form.owner}
          onChange={(e) => {
            const v = e.target.value;
            if (v.startsWith("consigner:")) {
              setForm({ ...form, owner: "consigner", consignerId: v.slice("consigner:".length) });
            } else {
              setForm({ ...form, owner: v as Owner, consignerId: "" });
            }
          }}
        >
          <option value="shared">Shared</option>
          <option value="alex">Alex</option>
          <option value="mila">Mila</option>
          {consigners.length > 0 && (
            <optgroup label="Consigners">
              {consigners.map((c) => (
                <option key={c.id} value={`consigner:${c.id}`}>
                  {c.name} ({Math.round(c.rate * 100)}%)
                </option>
              ))}
            </optgroup>
          )}
        </select>

        <select
          className="border rounded-lg px-3 py-2 text-sm bg-background"
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value as Status })}
        >
          <option value="inventory">Inventory</option>
          {form.category === "single" && <option value="grading">Grading</option>}
        </select>

        {/* Condition for singles; Grade for slabs (two dropdowns); Product type for sealed */}
        {form.category === "slab" ? (
          <div className="flex gap-1.5">
            {/* Company */}
            <select
              className="border rounded-lg px-2 py-2 text-sm bg-background w-[68px] flex-none"
              value={gradeCompany}
              onChange={(e) => {
                setGradeCompany(e.target.value);
                setForm({ ...form, grade: "" });
              }}
            >
              {GRADE_COMPANIES.map((co) => (
                <option key={co} value={co}>{co}</option>
              ))}
            </select>
            {/* Grade score */}
            <select
              className="border rounded-lg px-2 py-2 text-sm bg-background flex-1 min-w-0"
              value={gradeScore}
              onChange={(e) => {
                const g = e.target.value;
                setForm({ ...form, grade: g ? `${gradeCompany} ${g}` : "" });
              }}
            >
              <option value="">— Grade —</option>
              {GRADE_OPTIONS[gradeCompany]?.top.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
              <option disabled>──────</option>
              {GRADE_OPTIONS[gradeCompany]?.rest.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
        ) : form.category === "sealed" ? (
          <select
            className="border rounded-lg px-3 py-2 text-sm bg-background"
            value={form.productType}
            onChange={(e) => setForm({ ...form, productType: e.target.value })}
          >
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
          <select
            className="border rounded-lg px-3 py-2 text-sm bg-background"
            value={form.condition}
            onChange={(e) => setForm({ ...form, condition: e.target.value as Condition })}
          >
            <option value="Near Mint">Near Mint</option>
            <option value="Lightly Played">Lightly Played</option>
            <option value="Moderately Played">Moderately Played</option>
            <option value="Heavily Played">Heavily Played</option>
            <option value="Damaged">Damaged</option>
          </select>
        )}
      </div>

      {/* Sealed-specific: quantity + language */}
      {form.category === "sealed" && (
        <div className="grid grid-cols-2 gap-2">
          <input
            className="border rounded-lg px-3 py-2 text-sm bg-background"
            placeholder="Quantity"
            value={form.quantity}
            inputMode="numeric"
            onChange={(e) => setForm({ ...form, quantity: e.target.value.replace(/\D/g, "") || "1" })}
          />
          <select
            className="border rounded-lg px-3 py-2 text-sm bg-background"
            value={form.language}
            onChange={(e) => setForm({ ...form, language: e.target.value })}
          >
            <option value="english">English</option>
            <option value="japanese">Japanese</option>
            <option value="korean">Korean</option>
            <option value="chinese">Chinese</option>
            <option value="other">Other</option>
          </select>
        </div>
      )}

      {/* Card identification — name + set + number + Find */}
      <div className="space-y-2">
        <CardAutocomplete
          className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
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
            <input
              className="border rounded-lg px-3 py-2 text-sm bg-background flex-1 min-w-0"
              placeholder="Set name (optional)"
              value={form.setName}
              onChange={(e) => setForm({ ...form, setName: e.target.value })}
            />
            <input
              className="border rounded-lg px-3 py-2 text-sm bg-background w-24 min-w-0"
              placeholder="Card #"
              value={form.cardNumber}
              onChange={(e) => setForm({ ...form, cardNumber: e.target.value })}
            />
            <button
              type="button"
              onClick={onFind}
              className="px-3 py-2 rounded-lg border text-sm font-medium hover:bg-muted transition-colors whitespace-nowrap shrink-0"
            >
              Find
            </button>
          </div>
        )}
        {findConfirmed && (
          <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
            <span className="font-medium">✓</span>
            <span className="truncate">{findConfirmed}</span>
          </div>
        )}
        {findError && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
            {findError}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input
          className="border rounded-lg px-3 py-2 text-sm bg-background"
          placeholder="Market"
          value={form.market}
          inputMode="decimal"
          onChange={(e) => {
            const market = e.target.value;
            const pct = Number(form.buyPct);
            const mkt = Number(market);
            const newCost = form.buyPct && pct > 0 && mkt > 0 ? String(((mkt * pct) / 100).toFixed(2)) : form.cost;
            setForm({ ...form, market, cost: newCost });
          }}
        />
        <div className="relative">
          <input
            className="border rounded-lg px-3 py-2 text-sm bg-background w-full pr-7"
            placeholder="Buy %"
            value={form.buyPct}
            inputMode="decimal"
            onChange={(e) => {
              const buyPct = e.target.value;
              const pct = Number(buyPct);
              const mkt = Number(form.market);
              const newCost = buyPct && pct > 0 && mkt > 0 ? String(((mkt * pct) / 100).toFixed(2)) : form.cost;
              setForm({ ...form, buyPct, cost: newCost });
            }}
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs opacity-30 pointer-events-none">%</span>
        </div>
        <input
          className="border rounded-lg px-3 py-2 text-sm bg-background col-span-2"
          placeholder={form.buyPct && form.market ? `Cost (auto: ${form.cost || "—"})` : "Cost"}
          value={form.cost}
          inputMode="decimal"
          onChange={(e) => setForm({ ...form, cost: e.target.value, buyPct: "" })}
        />
        <input
          className="border rounded-lg px-3 py-2 text-sm bg-background col-span-2"
          placeholder="Sticker price (shown to guests)"
          value={form.stickerPrice}
          inputMode="decimal"
          onChange={(e) => setForm({ ...form, stickerPrice: e.target.value })}
        />
      </div>

      <textarea
        className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
        placeholder="Notes"
        rows={2}
        value={form.notes}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
      />

      {/* Image — show found image prominently, fallback to URL input + upload */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
      {form.imageUrl ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={form.imageUrl} alt="preview" className="h-32 w-auto rounded-lg border object-contain flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              placeholder="Image URL"
              value={form.imageUrl ?? ""}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="text-[12px] px-3 py-1 rounded-md border border-border text-[color:var(--text-secondary)] hover:bg-muted transition-colors disabled:opacity-40"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
              >
                {uploadingImage ? "Uploading…" : "Replace photo"}
              </button>
              <button
                type="button"
                className="text-[12px] px-3 py-1 rounded-md border border-red-300 text-red-500 hover:bg-red-50 transition-colors"
                onClick={() => setForm({ ...form, imageUrl: "" })}
              >
                Remove image
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
            placeholder="Image URL (or use Find / Scan to auto-fill)"
            value={form.imageUrl ?? ""}
            onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
          />
          <button
            type="button"
            className="text-[12px] px-3 py-1 rounded-md border border-border text-[color:var(--text-secondary)] hover:bg-muted transition-colors disabled:opacity-40"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingImage}
          >
            {uploadingImage ? "Uploading…" : "Upload photo"}
          </button>
        </div>
      )}
    </div>
  );
}
