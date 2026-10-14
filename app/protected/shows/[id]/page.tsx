import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import { EmptyState, MoneyDisplay, SectionHeader, StatCard } from "@/components/ui";
import { groupDeals, type TxRow } from "@/app/protected/transactions/deals";
import { pnlFor, type FinanceTx } from "@/app/protected/finance/math";
import type { ShowSession } from "../actions";
import { fmtDate, pillCls, showVenue, STATUS_PILL } from "../shared";
import ShowDeals from "./ShowDeals";
import ShowDetailActions, { DeleteShowButton } from "./ShowDetailActions";

type ExpenseRow = {
  id: string;
  description: string;
  cost: number | null;
  category: string | null;
};

const TX_COLS =
  "id,card_id,card:items!card_id(name),transaction_type,trade_group_id,date,payment_method," +
  "counterparty,notes,show_session_id,paid_by,cash_paid,sale_price,market_price_at_time,cash_difference";

// "booth_fee" → "Booth fee"
function categoryLabel(c: string | null) {
  if (!c) return null;
  const words = c.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export default async function ShowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const [showRes, expRes, txRes, activeRes] = await Promise.all([
    supabase.from("show_sessions").select("*")
      .eq("id", id).eq("workspace_id", workspaceId).maybeSingle(),
    supabase.from("expenses").select("id,description,cost,category")
      .eq("workspace_id", workspaceId).eq("show_session_id", id).order("created_at"),
    supabase.from("card_transactions").select(TX_COLS)
      .eq("workspace_id", workspaceId).eq("show_session_id", id)
      .order("date", { ascending: false }),
    supabase.from("show_sessions").select("id")
      .eq("workspace_id", workspaceId).eq("status", "active").limit(1).maybeSingle(),
  ]);
  if (showRes.error) throw new Error(showRes.error.message);
  const show = showRes.data as ShowSession | null;
  if (!show) notFound();

  const expenses = (expRes.data ?? []) as ExpenseRow[];
  const txRows = (txRes.data ?? []) as unknown as TxRow[];
  const deals = groupDeals(txRows, new Map());
  // Every number below comes from the deals and expenses themselves
  const pnl = pnlFor(txRows as unknown as FinanceTx[], expenses.map((e) => ({ expense_date: null, cost: e.cost, category: e.category })));
  const boothFee = expenses.filter((e) => e.category === "booth_fee").reduce((s, e) => s + (e.cost ?? 0), 0);
  const hasActive = activeRes.data !== null;

  const venue = showVenue(show);
  const pill = STATUS_PILL[show.status];

  return (
    <div className="w-full max-w-2xl mx-auto py-4 space-y-5">
      <Link
        href="/protected/shows"
        className="inline-flex h-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
      >
        <ArrowLeft size={16} />
        Shows
      </Link>

      {/* ── Header ── */}
      <header className="space-y-2">
        <span className={`${pillCls} ${pill.cls}`}>{pill.label}</span>
        <h1 className="text-xl font-bold tracking-tight text-foreground">{show.name}</h1>
        <div className="text-sm text-muted-foreground">
          {fmtDate(show.date, true)}
          {venue && ` · ${venue}`}
          {show.hours && ` · ${show.hours}`}
        </div>
        {show.notes && <p className="text-sm text-muted-foreground">{show.notes}</p>}
      </header>

      <ShowDetailActions
        show={{ id: show.id, name: show.name, status: show.status, starting_cash: show.starting_cash }}
        hasActive={hasActive}
      />

      {/* ── P&L (revenue − cost of goods − show expenses) ── */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Revenue" money={pnl.revenue} delta={`${pnl.cardsSold} card${pnl.cardsSold === 1 ? "" : "s"} sold`} />
        <StatCard label="Cost of goods" value={<MoneyDisplay amount={-pnl.cogs} />} />
        <StatCard
          label="Expenses"
          value={<MoneyDisplay amount={-pnl.expenses} />}
          delta={boothFee > 0 ? <>Booth fee <MoneyDisplay amount={-boothFee} /></> : undefined}
        />
        <StatCard label="Net" value={<MoneyDisplay amount={pnl.net} showSign />} tone={pnl.net >= 0 ? "positive" : "default"} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Spent on cards"
          value={<MoneyDisplay amount={pnl.buysSpent + pnl.tradeCashOut} tone="neutral" />}
          delta={`${pnl.cardsBought} card${pnl.cardsBought === 1 ? "" : "s"} in · inventory, not P&L`}
        />
        <StatCard
          label="Deals"
          value={<span className="text-foreground tabular-nums">{pnl.deals}</span>}
          delta={pnl.tradeCashIn > 0 ? <>Trade cash received <MoneyDisplay amount={pnl.tradeCashIn} tone="neutral" /></> : undefined}
        />
      </div>

      {/* ── Expenses ── */}
      {expenses.length > 0 && (
        <section className="space-y-2">
          <SectionHeader action={<MoneyDisplay amount={-pnl.expenses} className="text-sm" />}>
            Expenses
          </SectionHeader>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {expenses.map((e) => (
              <li key={e.id} className="flex min-h-11 items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-foreground">{e.description}</div>
                  {e.category && (
                    <div className="mt-0.5 text-xs text-muted-foreground">{categoryLabel(e.category)}</div>
                  )}
                </div>
                <MoneyDisplay amount={-(e.cost ?? 0)} className="shrink-0 text-sm font-semibold" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Deals ── */}
      <section className="space-y-2">
        <SectionHeader
          action={<span className="text-xs text-muted-foreground tabular-nums">{deals.length}</span>}
        >
          Deals
        </SectionHeader>
        {deals.length > 0 ? (
          <ShowDeals deals={deals} />
        ) : (
          <EmptyState
            title="No deals yet"
            hint={
              show.status === "active"
                ? "Buys, sells and trades you record in the POS will show up here."
                : "Deals recorded in the POS during this show will show up here."
            }
          />
        )}
      </section>

      <DeleteShowButton showId={show.id} showName={show.name} />
    </div>
  );
}
