import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { EmptyState, MoneyDisplay, SectionHeader, StatCard } from "@/components/ui";

// ── Types ──

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

// ── Helpers ──

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const COND_ABBR: Record<string, string> = {
  "Near Mint": "NM", "Lightly Played": "LP", "Moderately Played": "MP",
  "Heavily Played": "HP", "Damaged": "DMG",
};

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function meta(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" · ");
}

// ── Page ──

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

  const { data: activeRows } = await admin
    .from("items")
    .select("id,name,set_name,card_number,condition,category,grade,market,image_url,consigned_date,created_at")
    .eq("workspace_id", workspaceId)
    .eq("consigner_id", consigner.id)
    .neq("status", "sold")
    .order("created_at", { ascending: false });

  const { data: soldRows } = await admin
    .from("items")
    .select("id,name,set_name,card_number,grade,sold_price,consigner_payout,sold_at,consigner_payout_status")
    .eq("workspace_id", workspaceId)
    .eq("consigner_id", consigner.id)
    .eq("status", "sold")
    .order("sold_at", { ascending: false });

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
  const soldRevenue = soldItems.reduce((s, it) => s + (it.sold_price ?? 0), 0);
  const totalEarned = soldItems.reduce((s, it) => s + (it.consigner_payout ?? 0), 0);
  const totalPaidOut = payouts.reduce((s, p) => s + p.amount, 0);
  const pendingPayout = Math.max(0, totalEarned - totalPaidOut);
  const rate = Math.round(consigner.rate * 100);
  const hasAnything = activeItems.length > 0 || soldItems.length > 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Header ── */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto w-full max-w-2xl px-4 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-primary-soft text-sm font-semibold text-accent-primary">
              {initials(consigner.name)}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-muted-foreground">OzoneTCG Consignment Portal</div>
              <h1 className="truncate text-lg font-semibold">{consigner.name}</h1>
              <div className="text-xs tabular-nums text-muted-foreground">Your share: {rate}% of each sale</div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl space-y-8 px-4 py-6">
        {/* ── Summary ── */}
        <section className="space-y-3">
          <SectionHeader>Summary</SectionHeader>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Active cards"
              value={activeItems.length}
              delta={activeMarketValue > 0 ? <><MoneyDisplay amount={activeMarketValue} tone="neutral" /> listed value</> : undefined}
            />
            <StatCard
              label="Sold cards"
              value={soldItems.length}
              delta={soldRevenue > 0 ? <><MoneyDisplay amount={soldRevenue} tone="neutral" /> in sales</> : undefined}
            />
            <StatCard
              label="Owed to you"
              tone={pendingPayout > 0 ? "positive" : "default"}
              value={pendingPayout > 0 ? <MoneyDisplay amount={pendingPayout} tone="positive" /> : "—"}
              delta={pendingPayout > 0 ? "pending payout" : "all caught up"}
            />
            <StatCard
              label="Total earned"
              value={totalEarned > 0 ? <MoneyDisplay amount={totalEarned} tone="neutral" /> : "—"}
              delta={totalPaidOut > 0 ? <><MoneyDisplay amount={totalPaidOut} tone="neutral" /> paid so far</> : undefined}
            />
          </div>
        </section>

        {/* ── Active cards ── */}
        {activeItems.length > 0 && (
          <section className="space-y-3">
            <SectionHeader>Active cards ({activeItems.length})</SectionHeader>
            <ul className="overflow-hidden rounded-xl border border-border bg-card">
              {activeItems.map((it) => (
                <li key={it.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
                  {it.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.image_url}
                      alt={it.name}
                      className="h-14 w-10 shrink-0 rounded-lg bg-muted object-contain"
                    />
                  ) : (
                    <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-medium text-muted-foreground">
                      {it.category === "slab" ? "PSA" : "TCG"}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{it.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {meta([it.set_name, it.card_number ? `#${it.card_number}` : null, it.grade ?? COND_ABBR[it.condition] ?? it.condition])}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Received {fmtDate(it.consigned_date ?? it.created_at)}
                    </div>
                  </div>

                  {it.market != null && (
                    <MoneyDisplay amount={it.market} tone="neutral" className="shrink-0 text-sm font-semibold" />
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Sold cards ── */}
        {soldItems.length > 0 && (
          <section className="space-y-3">
            <SectionHeader>Sold cards ({soldItems.length})</SectionHeader>
            <ul className="overflow-hidden rounded-xl border border-border bg-card">
              {soldItems.map((it) => {
                const isPaid = it.consigner_payout_status === "paid";
                return (
                  <li key={it.id} className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{it.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {meta([it.set_name, it.card_number ? `#${it.card_number}` : null, it.grade])}
                      </div>
                      <div className="text-xs text-muted-foreground">{fmtDate(it.sold_at)}</div>
                    </div>
                    <div className="shrink-0 space-y-1 text-right">
                      <div className="text-sm font-semibold">
                        <MoneyDisplay amount={it.consigner_payout ?? 0} tone="positive" />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        sold for <MoneyDisplay amount={it.sold_price ?? 0} tone="neutral" />
                      </div>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        isPaid ? "bg-positive-soft text-positive" : "bg-warning-soft text-warning"
                      }`}>
                        {isPaid ? "Paid" : "Pending"}
                      </span>
                    </div>
                  </li>
                );
              })}
              <li className="flex items-center justify-between bg-muted px-4 py-3 text-sm font-semibold">
                <span>Total earned</span>
                <MoneyDisplay amount={totalEarned} tone="positive" />
              </li>
            </ul>
          </section>
        )}

        {/* ── Payout history ── */}
        {payouts.length > 0 && (
          <section className="space-y-3">
            <SectionHeader>Payout history</SectionHeader>
            <ul className="overflow-hidden rounded-xl border border-border bg-card">
              {payouts.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <div className="tabular-nums">{fmtDate(p.date)}</div>
                    <div className="truncate text-xs capitalize text-muted-foreground">
                      {(p.payment_method ?? "payment").replace("_", " ")}
                      {p.notes && ` · ${p.notes}`}
                    </div>
                  </div>
                  <MoneyDisplay amount={p.amount} tone="positive" className="shrink-0 font-semibold" />
                </li>
              ))}
              <li className="flex items-center justify-between bg-muted px-4 py-3 text-sm">
                <span className="text-muted-foreground">Total paid out</span>
                <MoneyDisplay amount={totalPaidOut} tone="neutral" className="font-semibold" />
              </li>
              {pendingPayout > 0 && (
                <li className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
                  <span className="text-muted-foreground">Still owed to you</span>
                  <MoneyDisplay amount={pendingPayout} tone="positive" className="font-semibold" />
                </li>
              )}
            </ul>
          </section>
        )}

        {/* ── Empty state ── */}
        {!hasAnything && (
          <EmptyState
            title="Nothing on consignment yet"
            hint="Once your cards are checked in, they'll show up here with their listed prices, sales and payouts."
          />
        )}
      </main>

      <footer className="mt-12 border-t border-border py-6 text-center text-xs text-muted-foreground">
        Powered by OzoneTCG
      </footer>
    </div>
  );
}
