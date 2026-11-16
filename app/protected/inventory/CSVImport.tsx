"use client";

import { useState, useMemo, useRef } from "react";
import { Modal, useToast } from "@/components/ui";
import { importItems } from "./actions";
import { refreshItemPrices } from "./pricingActions";
import {
  detectIdx,
  inferCategory,
  inferCondition,
  inferGrade,
  parseCSVText,
  parsePrice,
  roundMarketPrice,
} from "@/lib/csvImport";
import type { Category, Condition } from "@/lib/csvImport";
import type { ConsignerOption } from "./types";
import { fieldClass, btnOutline, btnPrimary } from "./utils";

type ColMap = {
  name: number;
  condition: number;
  cost: number;
  market: number;
  category: number;
  set: number;
  number: number;
  grade: number;
  quantity: number;
};

const COLUMNS: { label: string; field: keyof ColMap }[] = [
  { label: "Name *", field: "name" },
  { label: "Condition", field: "condition" },
  { label: "Cost", field: "cost" },
  { label: "Market $", field: "market" },
  { label: "Category", field: "category" },
  { label: "Set name", field: "set" },
  { label: "Card #", field: "number" },
  { label: "Grade", field: "grade" },
  { label: "Quantity", field: "quantity" },
];

// ── CSV import (button + modal) ──
export default function CSVImport({ consigners }: { consigners: ConsignerOption[] }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [colMap, setColMap] = useState<ColMap>({
    name: -1, condition: -1, cost: -1, market: -1, category: -1,
    set: -1, number: -1, grade: -1, quantity: -1,
  });
  const [ownerVal, setOwnerVal] = useState("shared");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"importing" | "refreshing" | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportedCount(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { headers: hdrs, rows: dataRows } = parseCSVText(ev.target?.result as string);
      if (hdrs.length === 0) return;
      setHeaders(hdrs);
      setRows(dataRows);
      setColMap({
        name: detectIdx(hdrs, ["name", "cardname", "card", "title", "productname", "itemname", "description"]),
        condition: detectIdx(hdrs, ["condition", "quality", "cond", "printing", "cardcondition"]),
        cost: detectIdx(hdrs, ["cost", "purchaseprice", "buyprice", "paid", "amountpaid", "costbasis", "myprice"]),
        market: detectIdx(hdrs, ["market", "marketprice", "currentvalue", "value", "price", "fairprice", "marketvalue", "tcgprice", "tcgmarketprice", "lowprice"]),
        category: detectIdx(hdrs, ["type", "producttype", "itemtype", "cardtype", "settype"]),
        set: detectIdx(hdrs, ["set", "setname", "expansion", "series", "edition", "collection"]),
        number: detectIdx(hdrs, ["number", "cardnumber", "cardno", "no", "num", "card#"]),
        grade: detectIdx(hdrs, ["grade", "psagrade", "cardgrade", "gradinglevel"]),
        quantity: detectIdx(hdrs, ["quantity", "qty", "count", "copies"]),
      });
    };
    reader.readAsText(file);
  }

  const cell = (row: string[], idx: number) => (idx >= 0 ? row[idx] ?? "" : "");
  const qtyOf = (row: string[]) => (colMap.quantity >= 0 ? Math.max(1, parseInt(row[colMap.quantity] ?? "1") || 1) : 1);

  const totalItems = useMemo(
    () => rows.reduce((sum, row) => (cell(row, colMap.name).trim() ? sum + qtyOf(row) : sum), 0),
  // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, colMap],
  );

  const preview = useMemo(() => {
    return rows.slice(0, 6).map((row) => {
      const nameVal = cell(row, colMap.name);
      const conditionRaw = cell(row, colMap.condition);
      const grade = inferGrade(cell(row, colMap.grade));
      const rawMarket = colMap.market >= 0 ? parsePrice(cell(row, colMap.market)) : null;
      return {
        name: nameVal,
        grade,
        market: rawMarket != null ? roundMarketPrice(rawMarket) : null,
        marketRaw: rawMarket,
        category: inferCategory(cell(row, colMap.category), nameVal, conditionRaw, grade ?? ""),
        setName: cell(row, colMap.set),
        qty: qtyOf(row),
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, colMap]);

  async function onImport() {
    if (colMap.name < 0 || rows.length === 0) return;
    setBusy(true);
    setPhase("importing");
    try {
      let owner = ownerVal;
      let consignerId: string | null = null;
      if (ownerVal.startsWith("consigner:")) {
        owner = "consigner";
        consignerId = ownerVal.slice("consigner:".length);
      }

      type CardInput = {
        name: string; condition: Condition; cost: number | null; market: number | null;
        category: Category; set_name: string | null; card_number: string | null; grade: string | null;
      };
      const cards: CardInput[] = [];
      for (const row of rows) {
        const nameVal = cell(row, colMap.name).trim();
        if (!nameVal) continue;
        const grade = inferGrade(cell(row, colMap.grade));
        const rawMarket = colMap.market >= 0 ? parsePrice(cell(row, colMap.market)) : null;
        const card: CardInput = {
          name: nameVal,
          condition: colMap.condition >= 0 ? inferCondition(cell(row, colMap.condition)) : "Near Mint",
          cost: colMap.cost >= 0 ? parsePrice(cell(row, colMap.cost)) : null,
          market: rawMarket != null ? roundMarketPrice(rawMarket) : null,
          category: inferCategory(cell(row, colMap.category), nameVal, cell(row, colMap.condition), grade ?? ""),
          set_name: cell(row, colMap.set).trim() || null,
          card_number: cell(row, colMap.number).trim() || null,
          grade,
        };
        for (let i = 0; i < qtyOf(row); i++) cards.push(card);
      }

      const inserted = await importItems({ cards, owner, consignerId, status: "inventory" });
      setImportedCount(cards.length);

      if (inserted.length > 0) {
        setPhase("refreshing");
        // Small client-side batches avoid the serverless timeout
        const REFRESH_BATCH = 4;
        const refreshItems = inserted.map((it) => ({
          id: it.id, name: it.name, category: it.category as Category, setName: it.set_name, cardNumber: it.card_number,
        }));
        for (let i = 0; i < refreshItems.length; i += REFRESH_BATCH) {
          try { await refreshItemPrices(refreshItems.slice(i, i + REFRESH_BATCH)); }
          catch { /* images can be synced manually later */ }
        }
      }

      toast.success(`Imported ${cards.length} item${cards.length !== 1 ? "s" : ""}`);
      setRows([]);
      setHeaders([]);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
      setPhase(null);
    }
  }

  function close() {
    setOpen(false);
    setHeaders([]);
    setRows([]);
    setImportedCount(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const buttonLabel = phase === "refreshing" ? "Fetching images…" : phase === "importing" ? "Importing…" : `Import ${totalItems} item${totalItems !== 1 ? "s" : ""}`;

  return (
    <>
      <button className={btnOutline} onClick={() => setOpen(true)}>Import CSV</button>

      <Modal open={open} onClose={close} title="Import CSV" className="max-w-lg max-h-full overflow-y-auto">
        <div className="space-y-4">
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="w-full text-sm text-foreground" onChange={handleFile} />
          {rows.length > 0 && <div className="text-xs text-muted-foreground tabular-nums">{rows.length} rows → {totalItems} items</div>}

          {importedCount != null && (
            <div className="rounded-lg border border-positive-border bg-positive-soft px-3 py-2 text-sm font-medium text-positive tabular-nums">
              Imported {importedCount} item{importedCount !== 1 ? "s" : ""} — images fetched automatically.
            </div>
          )}

          {headers.length > 0 && (
            <>
              {/* ── Column mapping ── */}
              <div className="space-y-2 rounded-xl border border-border p-3">
                <div className="font-mono text-xs uppercase tracking-[0.18em] text-neutral">Map columns</div>
                {COLUMNS.map(({ label, field }) => (
                  <label key={field} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
                    <select className={`${fieldClass} flex-1`} value={colMap[field]} onChange={(e) => setColMap((m) => ({ ...m, [field]: Number(e.target.value) }))}>
                      <option value={-1}>— skip —</option>
                      {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                    </select>
                  </label>
                ))}
              </div>

              {/* ── Preview ── */}
              {preview.some((p) => p.name) && (
                <div className="overflow-hidden rounded-xl border border-border">
                  <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground tabular-nums">
                    Preview (first {Math.min(6, rows.length)} of {rows.length} rows)
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="px-2 py-2 text-left font-normal">Name</th>
                          <th className="px-2 py-2 text-left font-normal">Set</th>
                          <th className="px-2 py-2 text-left font-normal">Type</th>
                          <th className="px-2 py-2 text-left font-normal">Grade</th>
                          <th className="px-2 py-2 text-right font-normal">Market</th>
                          <th className="px-2 py-2 text-right font-normal">Qty</th>
                        </tr>
                      </thead>
                      <tbody className="tabular-nums">
                        {preview.map((p, i) => (
                          <tr key={i} className={i > 0 ? "border-t border-border" : ""}>
                            <td className="max-w-28 truncate px-2 py-2 text-foreground">{p.name || "—"}</td>
                            <td className="max-w-20 truncate px-2 py-2 text-muted-foreground">{p.setName || "—"}</td>
                            <td className="px-2 py-2 text-muted-foreground">{p.category}</td>
                            <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">{p.grade ?? "—"}</td>
                            <td className="whitespace-nowrap px-2 py-2 text-right text-foreground">
                              {p.market != null ? (
                                <>
                                  ${p.market}
                                  {p.marketRaw != null && p.marketRaw !== p.market && <span className="ml-1 text-muted-foreground">(${p.marketRaw.toFixed(2)})</span>}
                                </>
                              ) : "—"}
                            </td>
                            <td className="px-2 py-2 text-right text-muted-foreground">{p.qty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">Who owns these?</span>
                <select className={fieldClass} value={ownerVal} onChange={(e) => setOwnerVal(e.target.value)}>
                  <option value="shared">Shared</option>
                  <option value="alex">Alex</option>
                  <option value="mila">Mila</option>
                  {consigners.length > 0 && (
                    <optgroup label="Consigners">
                      {consigners.map((c) => <option key={c.id} value={`consigner:${c.id}`}>{c.name}</option>)}
                    </optgroup>
                  )}
                </select>
              </label>

              <div className="flex gap-2">
                <button className={`${btnPrimary} flex-1`} onClick={onImport} disabled={busy || colMap.name < 0 || rows.length === 0}>{buttonLabel}</button>
                <button className={btnOutline} onClick={close} disabled={busy}>Cancel</button>
              </div>
            </>
          )}

          {headers.length === 0 && importedCount == null && (
            <div className="py-6 text-center text-sm text-muted-foreground">Select a CSV file to get started.</div>
          )}
        </div>
      </Modal>
    </>
  );
}
