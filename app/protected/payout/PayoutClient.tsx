"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui";
import { computePayoutTotals } from "@/lib/payout";
import type {
  ConsignerSaleEntry,
  ExpenseEntry,
  ItemCostEntry,
  PayPeriod,
  SharedSaleEntry,
  SoloSaleEntry,
} from "./PayoutServer";
import { keepItemSolo, makeItemShared } from "./actions";
import { PeriodSummary } from "./components/PeriodSummary";
import { ExpenseLists } from "./components/ExpenseLists";
import { SalesLists } from "./components/SalesLists";
import { SettleForm } from "./components/SettleForm";
import { HistoryList } from "./components/HistoryList";
import { errorMessage } from "./components/payoutMeta";

type Props = {
  alexExpenses: ExpenseEntry[];
  milaExpenses: ExpenseEntry[];
  alexItems: ItemCostEntry[];
  milaItems: ItemCostEntry[];
  sharedSales: SharedSaleEntry[];
  soloSales: SoloSaleEntry[];
  consignerSales: ConsignerSaleEntry[];
  history: PayPeriod[];
  periodStart: string | null;
};

type PendingSetter = React.Dispatch<React.SetStateAction<Set<string>>>;

export default function PayoutClient({
  alexExpenses,
  milaExpenses,
  alexItems,
  milaItems,
  sharedSales,
  soloSales,
  consignerSales,
  history,
  periodStart,
}: Props) {
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [pendingShared, setPendingShared] = useState<Set<string>>(new Set());
  const [pendingSolo, setPendingSolo] = useState<Set<string>>(new Set());

  // ── Item actions (keep solo / make shared) ──
  function runItemAction(
    itemId: string,
    setPending: PendingSetter,
    action: (id: string) => Promise<void>,
    successMessage: string,
  ) {
    setPending((prev) => new Set(prev).add(itemId));
    startTransition(async () => {
      try {
        await action(itemId);
        toast.success(successMessage);
      } catch (e) {
        toast.error(errorMessage(e));
      } finally {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
      }
    });
  }

  const handleMakeShared = (id: string) =>
    runItemAction(id, setPendingShared, makeItemShared, "Moved to the shared pool");
  const handleKeepSolo = (id: string) =>
    runItemAction(id, setPendingSolo, keepItemSolo, "Kept as solo");

  // ── Totals: same math the settle action writes to pay_periods ──
  const totals = computePayoutTotals(
    [...alexExpenses, ...milaExpenses],
    [...alexItems, ...milaItems],
    sharedSales,
    consignerSales,
  );
  const sharedSaleTotal = sharedSales.reduce((s, i) => s + i.sold_price, 0);
  const consignerCutTotal = consignerSales.reduce(
    (s, it) => s + (it.sold_price - it.consigner_payout),
    0,
  );

  const hasActivity = [
    alexExpenses,
    milaExpenses,
    alexItems,
    milaItems,
    sharedSales,
    soloSales,
    consignerSales,
  ].some((list) => list.length > 0);

  return (
    <div className="space-y-6">
      <PeriodSummary
        periodStart={periodStart}
        totals={totals}
        sharedSaleTotal={sharedSaleTotal}
        consignerCutTotal={consignerCutTotal}
        hasActivity={hasActivity}
      />

      <ExpenseLists
        alexExpenses={alexExpenses}
        milaExpenses={milaExpenses}
        alexItems={alexItems}
        milaItems={milaItems}
        pendingSolo={pendingSolo}
        onKeepSolo={handleKeepSolo}
      />

      <SalesLists
        sharedSales={sharedSales}
        consignerSales={consignerSales}
        soloSales={soloSales}
        sharedSaleTotal={sharedSaleTotal}
        consignerCutTotal={consignerCutTotal}
        pendingShared={pendingShared}
        pendingSolo={pendingSolo}
        onMakeShared={handleMakeShared}
        onKeepSolo={handleKeepSolo}
      />

      {hasActivity && <SettleForm netPayout={totals.netPayout} />}

      <HistoryList history={history} />
    </div>
  );
}
