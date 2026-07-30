"use client";

import { useState, useMemo, useRef } from "react";
import type { CustomerCard } from "./actions";
import { detectIdx, inferCondition, parseCSVText, parsePrice } from "@/lib/csvImport";
import type { Condition } from "@/lib/csvImport";

type ColMap = {
  name: number;
  condition: number;
  market: number;
  set: number;
  number: number;
};

export default function BuyCSVImport({
  onImport,
}: {
  onImport: (cards: CustomerCard[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [colMap, setColMap] = useState<ColMap>({
    name: -1, condition: -1, market: -1, set: -1, number: -1,
  });
  const [busy, setBusy] = useState(false);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { headers: hdrs, rows: dataRows } = parseCSVText(ev.target?.result as string);
      if (hdrs.length === 0) return;
      setHeaders(hdrs);
      setRows(dataRows);
      setColMap({
        name: detectIdx(hdrs, ["name", "cardname", "card", "title", "description"]),
        condition: detectIdx(hdrs, ["condition", "grade", "quality", "cond"]),
        market: detectIdx(hdrs, ["market", "marketprice", "value", "price", "tcgprice"]),
        set: detectIdx(hdrs, ["set", "setname", "expansion", "series"]),
        number: detectIdx(hdrs, ["number", "cardnumber", "cardno", "no", "num"]),
      });
    };
    reader.readAsText(file);
  }

  const preview = useMemo(() => {
    return rows.slice(0, 5).map((row) => ({
      name: colMap.name >= 0 ? row[colMap.name] ?? "" : "",
      conditionRaw: colMap.condition >= 0 ? row[colMap.condition] ?? "" : "",
      market: colMap.market >= 0 ? parsePrice(row[colMap.market] ?? "") : null,
      setName: colMap.set >= 0 ? row[colMap.set] ?? "" : "",
      cardNumber: colMap.number >= 0 ? row[colMap.number] ?? "" : "",
    }));
  }, [rows, colMap]);

  async function onImportClick() {
    if (colMap.name < 0 || rows.length === 0) return;
    setBusy(true);
    try {
      const cards: CustomerCard[] = rows
        .map((row) => {
          const market = colMap.market >= 0 ? parsePrice(row[colMap.market] ?? "") : null;
          if (!market) return null;
          return {
            id: crypto.randomUUID(),
            name: (row[colMap.name] ?? "").trim(),
            condition: colMap.condition >= 0 ? inferCondition(row[colMap.condition] ?? "") : ("Near Mint" as Condition),
            market,
            setName: colMap.set >= 0 ? (row[colMap.set] ?? "").trim() || undefined : undefined,
            cardNumber: colMap.number >= 0 ? (row[colMap.number] ?? "").trim() || undefined : undefined,
          } as CustomerCard;
        })
        .filter((c): c is CustomerCard => c !== null && c.name.length > 0);
      onImport(cards);
      close();
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    setHeaders([]);
    setRows([]);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <>
      <button className="text-sm px-2.5 py-1 border rounded-lg hover:bg-muted transition-colors" onClick={() => setOpen(true)}>
        Import CSV
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center modal-backdrop p-4"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div className="modal-panel w-full max-w-lg max-h-[90vh] overflow-y-auto p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="modal-title">Import Customer Card List</div>
              <button className="modal-close-btn" onClick={close}>✕</button>
            </div>

            <div className="text-xs opacity-50">
              CSV must have a market price column. Cards without a valid market price will be skipped.
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="w-full text-sm"
              onChange={handleFile}
            />
            {rows.length > 0 && (
              <div className="text-xs opacity-50">{rows.length} rows detected</div>
            )}

            {headers.length > 0 && (
              <>
                {/* Column mapping */}
                <div className="border rounded-xl p-3 space-y-2">
                  <div className="text-xs font-medium opacity-70">Map columns</div>
                  {(
                    [
                      { label: "Name *", field: "name" },
                      { label: "Condition", field: "condition" },
                      { label: "Market $", field: "market" },
                      { label: "Set name", field: "set" },
                      { label: "Card #", field: "number" },
                    ] as { label: string; field: keyof ColMap }[]
                  ).map(({ label, field }) => (
                    <div key={field} className="flex items-center gap-2">
                      <span className="text-xs opacity-60 w-20 shrink-0">{label}</span>
                      <select
                        className="flex-1 border rounded-lg px-2 py-1 text-xs bg-background"
                        value={colMap[field]}
                        onChange={(e) => setColMap((m) => ({ ...m, [field]: Number(e.target.value) }))}
                      >
                        <option value={-1}>— skip —</option>
                        {headers.map((h, i) => (
                          <option key={i} value={i}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                {/* Preview */}
                {preview.filter((p) => p.name).length > 0 && (
                  <div className="border rounded-xl overflow-hidden">
                    <div className="px-3 py-2 border-b text-xs font-medium opacity-70">
                      Preview (first {Math.min(5, rows.length)} of {rows.length} rows)
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="px-3 py-1.5 text-left opacity-60 font-normal">Name</th>
                            <th className="px-3 py-1.5 text-left opacity-60 font-normal">Set</th>
                            <th className="px-3 py-1.5 text-left opacity-60 font-normal">Cond</th>
                            <th className="px-3 py-1.5 text-right opacity-60 font-normal">Market</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.map((p, i) => (
                            <tr key={i} className={i > 0 ? "border-t" : ""}>
                              <td className="px-3 py-1.5 max-w-[140px] truncate">{p.name || "—"}</td>
                              <td className="px-3 py-1.5 max-w-[100px] truncate opacity-70">{p.setName || "—"}</td>
                              <td className="px-3 py-1.5 opacity-70 whitespace-nowrap">
                                {p.conditionRaw ? inferCondition(p.conditionRaw).replace(" ", "\u00A0").slice(0, 4) : "NM"}
                              </td>
                              <td className="px-3 py-1.5 text-right">
                                {p.market != null ? `$${p.market.toFixed(2)}` : <span className="opacity-40">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    className="modal-btn-primary flex-1"
                    onClick={onImportClick}
                    disabled={busy || colMap.name < 0 || colMap.market < 0 || rows.length === 0}
                  >
                    {busy ? "Importing…" : `Add ${rows.length} cards`}
                  </button>
                  <button className="modal-btn-ghost" onClick={close} disabled={busy}>Cancel</button>
                </div>
              </>
            )}

            {headers.length === 0 && (
              <div className="text-sm opacity-50 text-center py-6">
                Select a CSV file to get started.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
