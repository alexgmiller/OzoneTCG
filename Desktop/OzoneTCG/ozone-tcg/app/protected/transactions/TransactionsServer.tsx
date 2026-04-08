import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import TransactionsClient from "./TransactionsClient";

export type SoldItem = {
  id: string;
  name: string;
  category: string;
  owner: string;
  condition: string | null;
  market: number | null;
  cost: number | null;
  cost_basis: number | null;
  sold_price: number | null;
  sale_id: string | null;
  sold_at: string | null;
  acquisition_type: string | null;
};

export type SaleGroup = {
  saleId: string;
  soldAt: string;
  items: SoldItem[];
  total: number;
  totalCost: number;
};

export type BuyExpense = {
  id: string;
  description: string;
  cost: number;
  created_at: string;
  paid_by: string | null;
  payment_type: string | null;
};

export type TradeTransaction = {
  id: string;
  card_id: string | null;
  card_name: string | null;
  transaction_type: string;
  trade_group_id: string | null;
  date: string;
  market_price_at_time: number | null;
  cost_basis: number | null;
  cash_difference: number | null;
  trade_credit_value: number | null;
  notes: string | null;
};

export type TradeGroup = {
  tradeGroupId: string;
  date: string;
  comingIn: TradeTransaction[];
  goingOut: TradeTransaction[];
  cashDiff: number;
  notes: string | null;
};

export type DealLog = {
  id: string;
  type: "buy" | "sell" | "trade";
  notes: string | null;
  photos: string[];
  resolved: boolean;
  created_at: string;
};

export default async function TransactionsServer() {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const [soldResult, expensesResult, txResult, inventoryResult, dealsResult] = await Promise.all([
    supabase
      .from("items")
      .select("id,name,category,owner,condition,market,cost,cost_basis,sold_price,sale_id,sold_at,acquisition_type")
      .eq("workspace_id", workspaceId)
      .eq("status", "sold")
      .order("sold_at", { ascending: false, nullsFirst: false }),

    supabase
      .from("expenses")
      .select("id,description,cost,created_at,paid_by,payment_type")
      .eq("workspace_id", workspaceId)
      .ilike("description", "Buy:%")
      .order("created_at", { ascending: false }),

    supabase
      .from("card_transactions")
      .select("id,card_id,transaction_type,trade_group_id,date,market_price_at_time,cost_basis,cash_difference,trade_credit_value,notes")
      .eq("workspace_id", workspaceId)
      .in("transaction_type", ["trade_in", "trade_out"])
      .order("date", { ascending: false }),

    supabase
      .from("items")
      .select("id,name,category,owner,condition,market,cost,cost_basis,set_name,card_number,grade,chain_depth,original_cash_invested,acquisition_type")
      .eq("workspace_id", workspaceId)
      .neq("status", "sold")
      .neq("status", "grading")
      .order("updated_at", { ascending: false }),

    supabase
      .from("deal_logs")
      .select("id,type,notes,photos,resolved,created_at")
      .order("created_at", { ascending: false }),
  ]);

  // Fetch item names for card_transactions (card_id references items)
  const cardIds = (txResult.data ?? [])
    .map((tx) => tx.card_id)
    .filter(Boolean) as string[];

  let cardNameMap: Record<string, string> = {};
  if (cardIds.length > 0) {
    // Use admin client to fetch deleted items too — fetch from items (may be sold/deleted)
    const { data: cardRows } = await supabase
      .from("items")
      .select("id,name")
      .in("id", cardIds);
    cardNameMap = Object.fromEntries((cardRows ?? []).map((r) => [r.id, r.name]));
  }

  // Build sold groups
  const items = (soldResult.data ?? []) as SoldItem[];
  const grouped = new Map<string, SaleGroup>();
  for (const item of items) {
    const key = item.sale_id ?? item.id;
    const date = item.sold_at ?? "";
    if (!grouped.has(key)) {
      grouped.set(key, { saleId: key, soldAt: date, items: [], total: 0, totalCost: 0 });
    }
    const g = grouped.get(key)!;
    g.items.push(item);
    g.total += item.sold_price ?? 0;
    g.totalCost += item.cost_basis ?? item.cost ?? 0;
  }
  const saleGroups = Array.from(grouped.values()).sort((a, b) =>
    b.soldAt.localeCompare(a.soldAt)
  );

  // Build buy expenses list
  const buyExpenses = (expensesResult.data ?? []) as BuyExpense[];

  // Build trade groups from card_transactions
  const txRows = (txResult.data ?? []) as Omit<TradeTransaction, "card_name">[];
  const tradeGroupMap = new Map<string, TradeGroup>();
  for (const tx of txRows) {
    const key = tx.trade_group_id ?? tx.id;
    if (!tradeGroupMap.has(key)) {
      tradeGroupMap.set(key, {
        tradeGroupId: key,
        date: tx.date,
        comingIn: [],
        goingOut: [],
        cashDiff: tx.cash_difference ?? 0,
        notes: tx.notes,
      });
    }
    const g = tradeGroupMap.get(key)!;
    const enriched: TradeTransaction = {
      ...tx,
      card_name: tx.card_id ? (cardNameMap[tx.card_id] ?? null) : null,
    };
    if (tx.transaction_type === "trade_in") g.comingIn.push(enriched);
    else if (tx.transaction_type === "trade_out") g.goingOut.push(enriched);
  }
  const tradeGroups = Array.from(tradeGroupMap.values()).sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inventoryItems = (inventoryResult.data ?? []) as any[];
  const dealLogs = (dealsResult.data ?? []) as DealLog[];

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-semibold inv-label">Transactions</h1>
      </div>
      <TransactionsClient
        saleGroups={saleGroups}
        buyExpenses={buyExpenses}
        tradeGroups={tradeGroups}
        inventoryItems={inventoryItems}
        dealLogs={dealLogs}
        workspaceId={workspaceId}
      />
    </div>
  );
}
