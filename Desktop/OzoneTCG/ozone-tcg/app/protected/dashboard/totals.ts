export type Owner = "alex" | "mila" | "shared";
export type Category = "single" | "slab" | "sealed";
export type Status = "inventory" | "sold";

export type ItemRow = {
  category: Category;
  owner: Owner;
  status: Status;
  cost: number | null;
  market: number | null;

  // optional fields used in other parts of your app
  sell_price?: number | null;
  current_sale?: number | null;
  sold_price?: number | null;
  previous_sales?: number | null;
  consigner_payout?: number | null;

  // for recent activity / P&L
  name?: string | null;
  sold_at?: string | null;
};

export type ExpenseRow = {
  paid_by: Owner;
  cost: number | null;
};

export type GradingRow = {
  cost: number | null;
};

type Breakdown = {
  count: number;
  market_active: number;
  cost: number;
  revenue_sold: number;
};

function n(x: unknown): number {
  return typeof x === "number" && Number.isFinite(x) ? x : 0;
}

function blankBreakdown(): Breakdown {
  return { count: 0, market_active: 0, cost: 0, revenue_sold: 0 };
}

export function computeDashboardTotals(items: ItemRow[], expenses: ExpenseRow[], grading: GradingRow[]) {
  // -------- counts --------
  const counts = {
    total: items.length,
    inventory: 0,
    sold: 0,
  };

  // -------- market totals --------
  const market = {
    inventory: 0,
    active_total: 0,
  };

  // -------- cost totals --------
  const cost = {
    inventory: 0,
    sold: 0,
    total_all: 0,
  };

  // -------- sold totals --------
  const sold = {
    revenue: 0,
    profit: 0, // revenue - cost(sold)
  };

  // -------- breakdowns --------
  const owners: Record<Owner, Breakdown> = {
    shared: blankBreakdown(),
    alex: blankBreakdown(),
    mila: blankBreakdown(),
  };

  const categories: Record<Category, Breakdown> = {
    single: blankBreakdown(),
    slab: blankBreakdown(),
    sealed: blankBreakdown(),
  };

  // -------- expenses/grading totals --------
  const expenses_by_paid_by: Record<Owner, number> = { alex: 0, mila: 0, shared: 0 };
  let expenses_total = 0;

  for (const e of expenses) {
    const c = n(e.cost);
    expenses_total += c;
    expenses_by_paid_by[e.paid_by] += c;
  }

  let grading_total = 0;
  for (const g of grading) grading_total += n(g.cost);

  // -------- aggregate items --------
  for (const it of items) {
    const c = n(it.cost);
    const m = n(it.market);

    if (it.status in counts) counts[it.status as Status] += 1;

    // cost basis
    cost.total_all += c;
    if (it.status in cost) cost[it.status as Status] += c;

    // active market
    if (it.status === "inventory") market.inventory += m;

    // sold revenue — subtract consigner payout so we only count our cut
    let revenue = 0;
    if (it.status === "sold") {
      const gross = n(it.sold_price) || n(it.previous_sales) || 0;
      revenue = gross - n(it.consigner_payout);
      sold.revenue += revenue;
    }

    // breakdown buckets
    const addBreakdown = (b: Breakdown) => {
      b.count += 1;
      b.cost += c;
      if (it.status !== "sold") b.market_active += m;
      if (it.status === "sold") b.revenue_sold += revenue;
    };

    if (it.owner in owners) addBreakdown(owners[it.owner as Owner]);
    addBreakdown(categories[it.category]);
  }

  market.active_total = market.inventory;
  sold.profit = sold.revenue - cost.sold;

  // -------- P&L --------
  const unrealizedPnL = market.inventory - cost.inventory;
  const realizedPnL = sold.revenue - cost.sold - expenses_total - grading_total;

  // -------- who owes who (50/50 split for personal-paid) --------
  // shared expenses create no debt
  const splitRate = 0.5;
  const mila_owes_alex = expenses_by_paid_by.alex * splitRate;
  const alex_owes_mila = expenses_by_paid_by.mila * splitRate;
  const net = mila_owes_alex - alex_owes_mila; // >0 => Mila owes Alex, <0 => Alex owes Mila

  return {
    counts,
    market,
    cost,
    sold,

    pnl: {
      realized: realizedPnL,
      unrealized: unrealizedPnL,
      total: realizedPnL + unrealizedPnL,
    },

    expenses: {
      total: expenses_total,
      by_paid_by: expenses_by_paid_by,
    },

    grading: {
      total: grading_total,
    },

    owes: {
      mila_owes_alex,
      alex_owes_mila,
      net,
    },

    breakdowns: {
      owners,
      categories,
    },
  };
}
