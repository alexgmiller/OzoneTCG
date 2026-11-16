// Pure helpers for the TCGplayer catalog sync (lib/catalog/syncTcgplayer.ts):
// judging a run, and describing when the catalog last synced. No server
// imports, so Settings can use them on the client.

export type SyncOutcome = { groups: number; emptyGroups: number; cards: number; errors: string[] };

// Why a run should count as failed, or null when it's fine. A run that saved
// nothing, hit write errors, or couldn't download many sets (TCGCSV down or
// blocking us) must fail loudly instead of reporting "ok".
export function syncProblem(r: SyncOutcome): string | null {
  if (r.errors.length) return `${r.errors.length} write error${r.errors.length === 1 ? "" : "s"}: ${r.errors[0]}`;
  if (r.cards === 0) return "No cards were saved (TCGCSV's lists came back empty)";
  // A few sets are empty upstream; a large share empty means downloads failed
  if (r.groups && r.emptyGroups / r.groups > 0.2) return `${r.emptyGroups} of ${r.groups} sets didn't download`;
  return null;
}

// "just now", "12 min ago", "3 hr ago", "2 days ago"
export function syncedAgo(iso: string, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr} hr ago`;
  return `${Math.round(hr / 24)} days ago`;
}
