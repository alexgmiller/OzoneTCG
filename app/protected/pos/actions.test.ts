import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/tests/helpers/fakeSupabase";
import { allocate } from "./ledger";

let db: ReturnType<typeof fakeSupabase>;

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));
vi.mock("@/lib/getWorkspaceId", () => ({ getWorkspaceId: async () => "ws-1" }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { recordBuy, recordSell, recordTrade, revertTransaction, attachPhoto } = await import("./actions");

const SHOW = "show-1";
const deal = { show_session_id: SHOW, payment_method: "cash" as const, counterparty: "  Sam  ", notes: "" };
const item = (id: string, extra: Record<string, unknown> = {}) => ({
  id, workspace_id: "ws-1", name: id, status: "inventory", market: 100, cost: 50, cost_basis: 50, chain_depth: 0, ...extra,
});
const stats = () => db.table("show_sessions")[0];
const txs = () => db.table("card_transactions");

beforeEach(() => {
  db = fakeSupabase({
    show_sessions: [{
      id: SHOW, workspace_id: "ws-1", total_spent: 0, total_revenue: 0, total_trade_value: 0,
      cards_bought: 0, cards_sold: 0, trades_count: 0,
    }],
    items: [item("a"), item("b", { market: 300, cost: 120, cost_basis: 120 }), item("c", { consigner_id: "con-1", market: 40 })],
    consigners: [{ id: "con-1", workspace_id: "ws-1", rate: 0.8 }],
  });
});

describe("allocate", () => {
  it("splits by weight and puts rounding drift on the last share", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([33.33, 33.33, 33.34]);
    expect(allocate(90, [100, 200])).toEqual([30, 60]);
  });
  it("splits evenly when every weight is zero", () => {
    expect(allocate(10, [0, 0])).toEqual([5, 5]);
  });
});

describe("recordBuy", () => {
  const cards = [
    { name: "Charizard", category: "single" as const, market: 300 },
    { name: "Pikachu", category: "single" as const, market: 100 },
  ];

  it("adds items at a market-weighted cost and one row per card", async () => {
    const { id } = await recordBuy({ ...deal, paid_by: "alex", total: 200, cards, client_id: "c-1" });

    const bought = db.table("items").filter((it) => it.acquisition_type === "buy");
    expect(bought.map((it) => it.cost)).toEqual([150, 50]);
    expect(txs()).toHaveLength(2);
    expect(txs().every((r) => r.trade_group_id === id && r.transaction_type === "buy")).toBe(true);
    expect(txs()[0]).toMatchObject({ id, client_id: "c-1", counterparty: "Sam", notes: null, paid_by: "alex", cash_paid: 150 });
    expect(txs()[1].client_id).toBeUndefined();
    expect(db.table("expenses")).toHaveLength(0);
    expect(stats()).toMatchObject({ total_spent: 200, cards_bought: 2, net_pl: -200 });
  });

  it("returns the existing deal when an offline replay repeats client_id", async () => {
    const first = await recordBuy({ ...deal, paid_by: "shared", total: 200, cards, client_id: "c-1" });
    const again = await recordBuy({ ...deal, paid_by: "shared", total: 200, cards, client_id: "c-1" });
    expect(again.id).toBe(first.id);
    expect(txs()).toHaveLength(2);
  });

  it("uses per-card costs when every card has one", async () => {
    await recordBuy({ ...deal, paid_by: "shared", total: 90, cards: [{ ...cards[0], cost: 80 }, { ...cards[1], cost: 10 }] });
    expect(txs().map((r) => r.cash_paid)).toEqual([80, 10]);
  });

  it("removes the new items when the transaction rows fail to save", async () => {
    db.failures.add("card_transactions:insert");
    await expect(recordBuy({ ...deal, paid_by: "shared", total: 200, cards })).rejects.toThrow();
    expect(db.table("items")).toHaveLength(3);
  });
});

describe("recordSell", () => {
  it("records exactly one row for a single-item sale and marks it sold", async () => {
    const { id } = await recordSell({ ...deal, total: 120, itemIds: ["a"] });
    expect(txs()).toHaveLength(1);
    expect(txs()[0]).toMatchObject({ id, transaction_type: "sell", sale_price: 120, cost_basis: 50, card_id: "a" });
    expect(db.table("items").find((it) => it.id === "a")).toMatchObject({ status: "sold", sale_id: id, sold_price: 120 });
    expect(stats()).toMatchObject({ total_revenue: 120, cards_sold: 1 });
  });

  it("pays consigners their rate", async () => {
    await recordSell({ ...deal, total: 50, itemIds: ["c"] });
    expect(db.table("items").find((it) => it.id === "c")?.consigner_payout).toBe(40);
  });

  it("refuses items that are already sold", async () => {
    db.table("items")[0].status = "sold";
    await expect(recordSell({ ...deal, total: 10, itemIds: ["a"] })).rejects.toThrow(/already sold/);
    expect(txs()).toHaveLength(0);
  });
});

describe("recordTrade", () => {
  it("carries the outgoing basis plus cash paid into the incoming cards", async () => {
    const { id } = await recordTrade({
      ...deal, payment_method: "trade", paid_by: "mila",
      goingOut: [{ itemId: "a", value: 100 }, { itemId: "b", value: 300 }],
      comingIn: [{ name: "Lugia", category: "slab", market: 500 }],
      cashDifference: 30,
    });

    const lugia = db.table("items").find((it) => it.name === "Lugia")!;
    expect(lugia).toMatchObject({ cost: 200, cost_basis: 200, acquisition_type: "trade", chain_depth: 1 });
    expect(db.table("items").filter((it) => it.sale_id === id).map((it) => it.sold_price)).toEqual([100, 300]);
    expect(txs().map((r) => r.transaction_type)).toEqual(["trade_out", "trade_out", "trade_in"]);
    expect(txs().every((r) => r.cash_difference === 30)).toBe(true);
    expect(stats()).toMatchObject({ trades_count: 1, total_trade_value: 900, total_spent: 30, total_revenue: 0 });
  });

  it("never gives incoming cards a negative basis when the customer pays cash", async () => {
    await recordTrade({
      ...deal, paid_by: "shared", goingOut: [{ itemId: "a", value: 100 }],
      comingIn: [{ name: "Mew", category: "single", market: 20 }], cashDifference: -80,
    });
    expect(db.table("items").find((it) => it.name === "Mew")?.cost).toBe(0);
    expect(stats()).toMatchObject({ total_revenue: 80, total_spent: 0 });
  });
});

describe("revertTransaction", () => {
  it("undoes a buy: items, rows, photos and show totals", async () => {
    const { id } = await recordBuy({ ...deal, paid_by: "shared", total: 60, cards: [{ name: "Eevee", category: "single", market: 80 }] });
    const fd = new FormData();
    fd.append("photo", new File(["x"], "p.jpg", { type: "image/jpeg" }));
    await attachPhoto(id, fd);
    expect(db.uploads).toHaveLength(1);

    await revertTransaction(id);
    expect(db.table("items").some((it) => it.name === "Eevee")).toBe(false);
    expect(txs()).toHaveLength(0);
    expect(db.uploads).toHaveLength(0);
    expect(stats()).toMatchObject({ total_spent: 0, cards_bought: 0 });
  });

  it("puts sold items back in inventory", async () => {
    const { id } = await recordSell({ ...deal, total: 120, itemIds: ["c"] });
    await revertTransaction(id);
    expect(db.table("items").find((it) => it.id === "c")).toMatchObject({
      status: "inventory", sold_price: null, sale_id: null, consigner_payout: null,
    });
    expect(stats()).toMatchObject({ total_revenue: 0, cards_sold: 0 });
  });

  it("restores a trade both ways", async () => {
    const { id } = await recordTrade({
      ...deal, paid_by: "shared", goingOut: [{ itemId: "a", value: 100 }],
      comingIn: [{ name: "Mew", category: "single", market: 120 }], cashDifference: 20,
    });
    await revertTransaction(id);
    expect(db.table("items").find((it) => it.id === "a")?.status).toBe("inventory");
    expect(db.table("items").some((it) => it.name === "Mew")).toBe(false);
    expect(stats()).toMatchObject({ trades_count: 0, total_trade_value: 0, total_spent: 0 });
  });

  it("refuses when a bought card has since been sold", async () => {
    const { id } = await recordBuy({ ...deal, paid_by: "shared", total: 60, cards: [{ name: "Eevee", category: "single", market: 80 }] });
    db.table("items").find((it) => it.name === "Eevee")!.status = "sold";
    await expect(revertTransaction(id)).rejects.toThrow(/already sold or traded/);
    expect(txs()).toHaveLength(1);
  });
});
