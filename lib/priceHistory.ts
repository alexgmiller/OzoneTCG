// ── Item price history ──
// One market value per item per day (item_price_history, written by the 03:00
// refresh-prices cron). Pure helpers for writing rows and drawing the chart.

export type HistoryRow = { date: string; market: number | string };
export type HistoryPoint = { date: string; value: number };

// Rows the cron writes tonight: items still held, with a real price
export function historyRows(
  items: { id: string; workspace_id: string; market: number | null; status: string }[],
  date: string,
): { item_id: string; workspace_id: string; date: string; market: number }[] {
  return items
    .filter((it) => it.status !== "sold" && typeof it.market === "number" && Number.isFinite(it.market) && it.market > 0)
    .map((it) => ({ item_id: it.id, workspace_id: it.workspace_id, date, market: Math.round(it.market! * 100) / 100 }));
}

// Chart points, oldest first (numeric columns can arrive as strings)
export function historyPoints(rows: HistoryRow[]): HistoryPoint[] {
  return rows
    .map((r) => ({ date: r.date, value: Number(r.market) }))
    .filter((p) => Number.isFinite(p.value))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Change from the first point to the last, or null with fewer than two
export function historyChange(points: HistoryPoint[]): { amount: number; pct: number | null } | null {
  if (points.length < 2) return null;
  const first = points[0].value;
  const last = points[points.length - 1].value;
  return { amount: Math.round((last - first) * 100) / 100, pct: first > 0 ? ((last - first) / first) * 100 : null };
}
