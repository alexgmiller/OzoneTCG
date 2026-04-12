"use client";

import { useState, useMemo, useRef } from "react";
import type { CustomerCard } from "./actions";

type Condition = "Near Mint" | "Lightly Played" | "Moderately Played" | "Heavily Played" | "Damaged";

type ColMap = {
  name: number;
  condition: number;
  market: number;
  set: number;
  number: number;
};

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function detectIdx(headers: string[], candidates: string[]): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const lower = headers.map(norm);
  for (const c of candidates) {
    const key = norm(c);
    const idx = lower.findIndex((h) => h === key || h.includes(key));
    if (idx !== -1) return idx;
  }
  return -1;
}

function inferCondition(val: string): Condition {
  const v = val.toLowerCase();
  if (v.includes("nm") || v.includes("near mint") || v.includes("mint")) return "Near Mint";
  if (v.includes("lp") || v.includes("light")) return "Lightly Played";
  if (v.includes("mp") || v.includes("mod")) return "Moderately Played";
  if (v.includes("hp") || v.includes("heavy")) return "Heavily Played";
  if (v.includes("dmg") || v.includes("damage")) return "Damaged";
  return "Near Mint";
}

function parsePrice(val: string): number | null {
  if (!val) return null;
  const n = parseFloat(val.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

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
      const text = (ev.target?.result as string)
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .trim();
      const lines = text.split("\n");
      if (lines.length < 2) return;
      const hdrs = parseCSVLine(lines[0]);
      const dataRows = lines.slice(1).map(parseCSVLine).filter((r) => r.some((c) => c.trim()));
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
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div className="bg-background border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Import Customer Card List</div>
              <button className="text-sm opacity-60 px-2 py-1" onClick={close}>✕</button>
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
                    className="flex-1 px-4 py-2 rounded-lg bg-foreground text-background font-medium disabled:opacity-40"
                    onClick={onImportClick}
                    disabled={busy || colMap.name < 0 || colMap.market < 0 || rows.length === 0}
                  >
                    {busy ? "Importing…" : `Add ${rows.length} cards`}
                  </button>
                  <button className="px-4 py-2 rounded-lg border opacity-60" onClick={close} disabled={busy}>
                    Cancel
                  </button>
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
