/**
 * Shared CSV-import parsing helpers.
 *
 * Used by both the inventory importer (app/protected/inventory/CSVImport.tsx)
 * and the buy-flow importer (app/protected/buy/BuyCSVImport.tsx). Pure
 * functions only — no React, no browser APIs — so they stay unit-testable.
 */

export type Condition =
  | "Near Mint"
  | "Lightly Played"
  | "Moderately Played"
  | "Heavily Played"
  | "Damaged";

export type Category = "single" | "slab" | "sealed";

/**
 * Split one CSV line into trimmed cells, honouring double-quoted fields so a
 * quoted comma ("Charizard, Base Set") doesn't split the row.
 */
export function parseCSVLine(line: string): string[] {
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

/**
 * Normalise line endings, split into a header row plus non-empty data rows.
 * Returns empty results for input with no data rows.
 */
export function parseCSVText(text: string): { headers: string[]; rows: string[][] } {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const lines = normalized.split("\n");
  if (lines.length < 2) return { headers: [], rows: [] };
  return {
    headers: parseCSVLine(lines[0]),
    rows: lines.slice(1).map(parseCSVLine).filter((r) => r.some((c) => c.trim())),
  };
}

/**
 * Find the index of the first header matching any candidate name.
 * Comparison ignores case, spaces and punctuation, and allows substring hits
 * so "TCG Market Price" matches the candidate "marketprice".
 * Returns -1 when nothing matches.
 */
export function detectIdx(headers: string[], candidates: string[]): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const lower = headers.map(norm);
  for (const c of candidates) {
    const key = norm(c);
    const idx = lower.findIndex((h) => h === key || h.includes(key));
    if (idx !== -1) return idx;
  }
  return -1;
}

/** Normalise a grading string to "PSA 10" form. Ungraded/empty → null. */
export function inferGrade(val: string): string | null {
  if (!val || val.toLowerCase().includes("ungraded")) return null;
  const match = val.match(/(PSA|BGS|CGC|SGC)\s+(\d+(?:\.\d+)?)/i);
  if (match) return `${match[1].toUpperCase()} ${parseFloat(match[2])}`;
  return val.trim() || null;
}

/** Round a raw market price up to a clean shelf price, with a $3 floor. */
export function roundMarketPrice(price: number): number {
  if (price < 3) return 3;
  if (price < 100) return Math.ceil(price);
  if (price < 500) return Math.ceil(price / 5) * 5;
  return Math.ceil(price / 10) * 10;
}

/** Classify a row as slab / sealed / single using every available text hint. */
export function inferCategory(
  val: string,
  nameHint = "",
  conditionHint = "",
  gradeHint = ""
): Category {
  const all = (val + " " + nameHint + " " + conditionHint + " " + gradeHint).toLowerCase();
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

/** Map a free-text condition cell to a canonical condition. Defaults to Near Mint. */
export function inferCondition(val: string): Condition {
  const v = val.toLowerCase();
  if (v.includes("nm") || v.includes("near mint") || v.includes("mint")) return "Near Mint";
  if (v.includes("lp") || v.includes("light")) return "Lightly Played";
  if (v.includes("mp") || v.includes("mod")) return "Moderately Played";
  // "heav" not "heavy": the canonical export string is "Heavily Played",
  // which contains "heavi" — matching on "heavy" silently fell through to
  // the Near Mint default and overstated card condition on import.
  if (v.includes("hp") || v.includes("heav")) return "Heavily Played";
  if (v.includes("dmg") || v.includes("damage")) return "Damaged";
  return "Near Mint";
}

/** Parse a currency cell to a positive number. Non-numeric or ≤0 → null. */
export function parsePrice(val: string): number | null {
  if (!val) return null;
  const n = parseFloat(val.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}
