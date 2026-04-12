import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

// ─── Types ────────────────────────────────────────────────────────────────────

type ActiveItem = {
  id: string;
  name: string;
  set_name: string | null;
  card_number: string | null;
  condition: string;
  category: string;
  grade: string | null;
  market: number | null;
  image_url: string | null;
  consigned_date: string | null;
  created_at: string;
};

type SoldItem = {
  id: string;
  name: string;
  set_name: string | null;
  card_number: string | null;
  grade: string | null;
  sold_price: number | null;
  consigner_payout: number | null;
  sold_at: string | null;
  consigner_payout_status: string | null;
};

type PayoutRecord = {
  id: string;
  amount: number;
  payment_method: string | null;
  date: string;
  notes: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number | null) {
  if (v == null) return "—";
  return `$${v.toFixed(2)}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function conditionAbbr(c: string): string {
  const map: Record<string, string> = {
    "Near Mint": "NM", "Lightly Played": "LP", "Moderately Played": "MP",
    "Heavily Played": "HP", "Damaged": "DMG",
  };
  return map[c] ?? c;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-0.5">
      <div className="text-[11px] opacity-50 font-medium uppercase tracking-wide">{label}</div>
      <div className="text-lg font-bold">{value}</div>
      {sub && <div className="text-xs opacity-50">{sub}</div>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ConsignerPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();

  // Fetch consigner by token (no workspace restriction — token is the access key)
  const { data: consigner } = await admin
    .from("consigners")
    .select("id,name,rate,phone,notes,workspace_id")
    .eq("token", token)
    .single();

  if (!consigner) notFound();

  const workspaceId = consigner.workspace_id;

  // Fetch active items
  const { data: activeRows } = await admin
    .from("items")
    .select("id,name,set_name,card_number,condition,category,grade,market,image_url,consigned_date,created_at")
    .eq("workspace_id", workspaceId)
    .eq("consigner_id", consigner.id)
    .neq("status", "sold")
    .order("created_at", { ascending: false });

  // Fetch sold items
  const { data: soldRows } = await admin
    .from("items")
    .select("id,name,set_name,card_number,grade,sold_price,consigner_payout,sold_at,consigner_payout_status")
    .eq("workspace_id", workspaceId)
    .eq("consigner_id", consigner.id)
    .eq("status", "sold")
    .order("sold_at", { ascending: false });

  // Fetch payout history
  const { data: payoutRows } = await admin
    .from("consigner_payouts")
    .select("id,amount,payment_method,date,notes")
    .eq("workspace_id", workspaceId)
    .eq("consigner_id", consigner.id)
    .order("date", { ascending: false });

  const activeItems = (activeRows ?? []) as ActiveItem[];
  const soldItems = (soldRows ?? []) as SoldItem[];
  const payouts = (payoutRows ?? []) as PayoutRecord[];

  const activeMarketValue = activeItems.reduce((s, it) => s + (it.market ?? 0), 0);
  const totalEarned = soldItems.reduce((s, it) => s + (it.consigner_payout ?? 0), 0);
  const totalPaidOut = payouts.reduce((s, p) => s + p.amount, 0);
  const pendingPayout = Math.max(0, totalEarned - totalPaidOut);
  const rate = Math.round(consigner.rate * 100);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
              {consigner.name.trim().split(/\s+/).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)}
            </div>
            <div>
              <div className="text-xs opacity-50 font-medium">OzoneTCG Consignment Portal</div>
              <h1 className="text-lg font-bold">{consigner.name}</h1>
              <div className="text-xs opacity-60">Your rate: {rate}%</div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">

        {/* Summary metrics */}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider opacity-40 mb-3">Summary</h2>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Active Cards"
              value={String(activeItems.length)}
              sub={activeMarketValue > 0 ? `${fmt(activeMarketValue)} market value` : undefined}
            />
            <StatCard
              label="Sold Cards"
              value={String(soldItems.length)}
              sub={soldItems.length > 0 ? `${fmt(soldItems.reduce((s, it) => s + (it.sold_price ?? 0), 0))} revenue` : undefined}
            />
            <StatCard
              label="Pending Payout"
              value={pendingPayout > 0 ? fmt(pendingPayout) : "—"}
              sub={pendingPayout > 0 ? "owed to you" : "all caught up"}
            />
            <StatCard
              label="Total Earned"
              value={totalEarned > 0 ? fmt(totalEarned) : "—"}
              sub={totalPaidOut > 0 ? `${fmt(totalPaidOut)} paid so far` : undefined}
            />
          </div>
        </div>

        {/* Active cards */}
        {activeItems.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider opacity-40 mb-3">
              Active Cards ({activeItems.length})
            </h2>
            <div className="border border-border rounded-xl overflow-hidden">
              {activeItems.map((it, i) => (
                <div key={it.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
                  {/* Thumbnail */}
                  {it.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.image_url}
                      alt={it.name}
                      className="w-10 h-14 rounded-md object-contain shrink-0 bg-muted"
                    />
                  ) : (
                    <div className="w-10 h-14 rounded-md bg-muted shrink-0 flex items-center justify-center text-[10px] opacity-30 font-medium">
                      {it.category === "slab" ? "PSA" : "TCG"}
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{it.name}</div>
                    <div className="text-xs opacity-50 mt-0.5">
                      {[it.set_name, it.card_number ? `#${it.card_number}` : null, it.grade ?? conditionAbbr(it.condition)].filter(Boolean).join(" · ")}
                    </div>
                    <div className="text-xs opacity-40 mt-0.5">
                      Received {fmtDate(it.consigned_date ?? it.created_at)}
                    </div>
                  </div>

                  {/* Price + status */}
                  <div className="shrink-0 text-right">
                    {it.market != null && (
                      <div className="text-sm font-semibold">{fmt(it.market)}</div>
                    )}
                    <div className="text-[11px] mt-0.5">
                      <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-medium">
                        Active
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sold cards */}
        {soldItems.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider opacity-40 mb-3">
              Sold Cards ({soldItems.length})
            </h2>
            <div className="border border-border rounded-xl overflow-hidden">
              {soldItems.map((it, i) => {
                const isPaid = it.consigner_payout_status === "paid";
                return (
                  <div key={it.id} className={`px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{it.name}</div>
                        <div className="text-xs opacity-50 mt-0.5">
                          {[it.set_name, it.card_number ? `#${it.card_number}` : null, it.grade].filter(Boolean).join(" · ")}
                        </div>
                        <div className="text-xs opacity-40 mt-0.5">{fmtDate(it.sold_at)}</div>
                      </div>
                      <div className="shrink-0 text-right space-y-1">
                        <div className="text-xs opacity-50">Sold {fmt(it.sold_price)}</div>
                        <div className="text-sm font-semibold text-emerald-500">
                          Your cut: {fmt(it.consigner_payout)}
                        </div>
                        <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
                          isPaid
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-amber-500/15 text-amber-400"
                        }`}>
                          {isPaid ? "Paid" : "Pending"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Totals row */}
              <div className="border-t border-border bg-muted/20 px-4 py-3 flex items-center justify-between text-sm font-semibold">
                <span>Total earned</span>
                <span className="text-emerald-500">{fmt(totalEarned)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Payout history */}
        {payouts.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider opacity-40 mb-3">
              Payout History
            </h2>
            <div className="border border-border rounded-xl overflow-hidden">
              {payouts.map((p, i) => (
                <div key={p.id} className={`flex items-center justify-between px-4 py-3 text-sm ${i > 0 ? "border-t border-border" : ""}`}>
                  <div className="min-w-0">
                    <div>{fmtDate(p.date)}</div>
                    <div className="text-xs opacity-50 capitalize mt-0.5">
                      {p.payment_method ?? "Payment"}
                      {p.notes && ` · ${p.notes}`}
                    </div>
                  </div>
                  <div className="font-semibold text-emerald-500 shrink-0">{fmt(p.amount)}</div>
                </div>
              ))}

              {/* Running balance */}
              <div className="border-t border-border bg-muted/20 px-4 py-3 flex items-center justify-between text-sm">
                <span className="opacity-60">Total paid out</span>
                <span className="font-semibold">{fmt(totalPaidOut)}</span>
              </div>
              {pendingPayout > 0 && (
                <div className="border-t border-border px-4 py-3 flex items-center justify-between text-sm">
                  <span className="opacity-60">Still pending</span>
                  <span className="font-semibold text-amber-500">{fmt(pendingPayout)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty state */}
        {activeItems.length === 0 && soldItems.length === 0 && (
          <div className="text-center py-12 text-sm opacity-50">
            No cards on consignment yet.
          </div>
        )}

      </div>

      {/* Footer */}
      <div className="border-t border-border mt-12 py-6 text-center text-xs opacity-30">
        Powered by OzoneTCG
      </div>
    </div>
  );
}
