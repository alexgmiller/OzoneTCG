"use client";

import { useState, useMemo, useRef } from "react";
import { importItems } from "./actions";

type Category = "single" | "slab" | "sealed";
type Condition = "Near Mint" | "Lightly Played" | "Moderately Played" | "Heavily Played" | "Damaged";
type ConsignerOption = { id: string; name: string; rate: number };

type ColMap = {
  name: number;
  condition: number;
  cost: number;
  market: number;
  category: number;
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

function inferCategory(val: string, nameHint = "", conditionHint = ""): Category {
  const all = (val + " " + nameHint + " " + conditionHint).toLowerCase();
  if (
    all.includes("slab") || all.includes("psa") || all.includes("bgs") ||
    all.includes("cgc") || all.includes("sgc") || all.includes("graded")
  ) return "slab";
  if (
    all.includes("sealed") || all.includes("pack") || all.includes("box") ||
    all.includes("booster") || all.includes("etb") || all.includes("tin")
  ) return "sealed";
  return "single";
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

export default function CSVImport({ consigners }: { consigners: ConsignerOption[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [colMap, setColMap] = useState<ColMap>({
    name: -1, condition: -1, cost: -1, market: -1, category: -1, set: -1, number: -1,
  });
  const [ownerVal, setOwnerVal] = useState("shared");
  const [defaultStatus, setDefaultStatus] = useState<"inventory" | "listed">("inventory");
  const [busy, setBusy] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportedCount(null);
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
        name: detectIdx(hdrs, ["name", "cardname", "card", "title", "productname", "itemname", "description"]),
        condition: detectIdx(hdrs, ["condition", "grade", "quality", "cond", "printing"]),
        cost: detectIdx(hdrs, ["cost", "purchaseprice", "buyprice", "paid", "amountpaid", "costbasis", "myprice"]),
        market: detectIdx(hdrs, ["market", "marketprice", "currentvalue", "value", "price", "fairprice", "marketvalue", "tcgprice", "tcgmarketprice", "lowprice"]),
        category: detectIdx(hdrs, ["type", "category", "producttype", "itemtype", "cardtype", "settype"]),
        set: detectIdx(hdrs, ["set", "setname", "expansion", "series", "edition", "collection"]),
        number: detectIdx(hdrs, ["number", "cardnumber", "cardno", "no", "num", "card#"]),
      });
    };
    reader.readAsText(file);
  }

  const preview = useMemo(() => {
    return rows.slice(0, 6).map((row) => {
      const nameVal = colMap.name >= 0 ? row[colMap.name] ?? "" : "";
      const conditionRaw = colMap.condition >= 0 ? row[colMap.condition] ?? "" : "";
      return {
        name: nameVal,
        conditionRaw,
        cost: colMap.cost >= 0 ? parsePrice(row[colMap.cost] ?? "") : null,
        market: colMap.market >= 0 ? parsePrice(row[colMap.market] ?? "") : null,
        category: inferCategory(
          colMap.category >= 0 ? (row[colMap.category] ?? "") : "",
          nameVal,
          conditionRaw
        ),
        setName: colMap.set >= 0 ? row[colMap.set] ?? "" : "",
        cardNumber: colMap.number >= 0 ? row[colMap.number] ?? "" : "",
      };
    });
  }, [rows, colMap]);

  async function onImport() {
    if (colMap.name < 0 || rows.length === 0) return;
    setBusy(true);
    try {
      let owner = ownerVal;
      let consignerId: string | null = null;
      if (ownerVal.startsWith("consigner:")) {
        owner = "consigner";
        consignerId = ownerVal.slice("consigner:".length);
      }
      const cards = rows
        .map((row) => ({
          name: (row[colMap.name] ?? "").trim(),
          condition: colMap.condition >= 0 ? inferCondition(row[colMap.condition] ?? "") : ("Near Mint" as Condition),
          cost: colMap.cost >= 0 ? parsePrice(row[colMap.cost] ?? "") : null,
          market: colMap.market >= 0 ? parsePrice(row[colMap.market] ?? "") : null,
          category: inferCategory(
            colMap.category >= 0 ? (row[colMap.category] ?? "") : "",
            row[colMap.name] ?? "",
            colMap.condition >= 0 ? (row[colMap.condition] ?? "") : ""
          ),
          set_name: colMap.set >= 0 ? (row[colMap.set] ?? "").trim() || null : null,
          card_number: colMap.number >= 0 ? (row[colMap.number] ?? "").trim() || null : null,
        }))
        .filter((c) => c.name);
      await importItems({ cards, owner, consignerId, status: defaultStatus });
      setImportedCount(cards.length);
      setRows([]);
      setHeaders([]);
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    setHeaders([]);
    setRows([]);
    setImportedCount(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <>
      <button className="px-3 py-1.5 rounded-lg border text-sm" onClick={() => setOpen(true)}>
        Import CSV
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div className="bg-background border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Import CSV</div>
              <button className="text-sm opacity-60 px-2 py-1" onClick={close}>✕</button>
            </div>

            {/* File input */}
            <div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="w-full text-sm"
                onChange={handleFile}
              />
              {rows.length > 0 && (
                <div className="text-xs opacity-50 mt-1">{rows.length} rows detected</div>
              )}
            </div>

            {importedCount != null && (
              <div className="text-sm text-green-600 font-medium">
                ✓ Imported {importedCount} item{importedCount !== 1 ? "s" : ""} successfully.
              </div>
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
                      { label: "Cost", field: "cost" },
                      { label: "Market", field: "market" },
                      { label: "Category", field: "category" },
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
                      Preview (first {Math.min(6, rows.length)} of {rows.length} rows)
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="px-3 py-1.5 text-left opacity-60 font-normal">Name</th>
                            <th className="px-3 py-1.5 text-left opacity-60 font-normal">Set</th>
                            <th className="px-3 py-1.5 text-left opacity-60 font-normal">#</th>
                            <th className="px-3 py-1.5 text-left opacity-60 font-normal">Cond</th>
                            <th className="px-3 py-1.5 text-right opacity-60 font-normal">Market</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.map((p, i) => (
                            <tr key={i} className={i > 0 ? "border-t" : ""}>
                              <td className="px-3 py-1.5 max-w-[120px] truncate">{p.name || "—"}</td>
                              <td className="px-3 py-1.5 max-w-[100px] truncate opacity-70">{p.setName || "—"}</td>
                              <td className="px-3 py-1.5 opacity-70">{p.cardNumber || "—"}</td>
                              <td className="px-3 py-1.5 opacity-70">
                                {p.conditionRaw ? inferCondition(p.conditionRaw).replace(" ", "\u00A0").slice(0, 4) : "NM"}
                              </td>
                              <td className="px-3 py-1.5 text-right">
                                {p.market != null ? `$${p.market.toFixed(2)}` : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Owner + status */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-xs opacity-60 mb-1">Who owns these?</div>
                    <select
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                      value={ownerVal}
                      onChange={(e) => setOwnerVal(e.target.value)}
                    >
                      <option value="shared">Shared</option>
                      <option value="alex">Alex</option>
                      <option value="mila">Mila</option>
                      {consigners.length > 0 && (
                        <optgroup label="Consigners">
                          {consigners.map((c) => (
                            <option key={c.id} value={`consigner:${c.id}`}>{c.name}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                  <div>
                    <div className="text-xs opacity-60 mb-1">Status</div>
                    <select
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                      value={defaultStatus}
                      onChange={(e) => setDefaultStatus(e.target.value as "inventory" | "listed")}
                    >
                      <option value="inventory">Inventory</option>
                      <option value="listed">Listed</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    className="flex-1 px-4 py-2 rounded-lg bg-foreground text-background font-medium disabled:opacity-40"
                    onClick={onImport}
                    disabled={busy || colMap.name < 0 || rows.length === 0}
                  >
                    {busy ? "Importing…" : `Import ${rows.length} items`}
                  </button>
                  <button
                    className="px-4 py-2 rounded-lg border opacity-60"
                    onClick={close}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {headers.length === 0 && importedCount == null && (
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
