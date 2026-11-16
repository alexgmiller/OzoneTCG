import { describe, expect, it } from "vitest";
import { fakeSupabase } from "@/tests/helpers/fakeSupabase";
import { partnerPosPayments } from "./posPayments";

const tx = (r: Record<string, unknown>) => ({ workspace_id: "ws-1", date: "2026-10-01T00:00:00Z", ...r });

describe("partnerPosPayments", () => {
  it("counts partner-paid buys of shared cards and trade cash once per deal", async () => {
    const db = fakeSupabase({
      items: [{ id: "shared-card", owner: "shared" }, { id: "alex-card", owner: "alex" }],
      card_transactions: [
        tx({ id: "b", trade_group_id: "b", transaction_type: "buy", paid_by: "alex", cash_paid: 40, card_id: "shared-card" }),
        tx({ id: "p", trade_group_id: "p", transaction_type: "buy", paid_by: "alex", cash_paid: 99, card_id: "alex-card" }),
        tx({ id: "t", trade_group_id: "t", transaction_type: "trade_out", paid_by: "mila", cash_difference: 25 }),
        tx({ id: "t2", trade_group_id: "t", transaction_type: "trade_in", paid_by: "mila", cash_difference: 25 }),
        tx({ id: "r", trade_group_id: "r", transaction_type: "trade_in", paid_by: "mila", cash_difference: -10 }),
        tx({ id: "s", trade_group_id: "s", transaction_type: "buy", paid_by: "shared", cash_paid: 500 }),
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payments = await partnerPosPayments(db.client as any, "ws-1", null);
    expect(payments.map((p) => [p.id, p.paid_by, p.cost])).toEqual([["b", "alex", 40], ["t", "mila", 25]]);
  });

  it("only includes deals after the last settled period", async () => {
    const db = fakeSupabase({
      card_transactions: [
        tx({ id: "old", trade_group_id: "old", transaction_type: "buy", paid_by: "alex", cash_paid: 10, date: "2026-01-01" }),
        tx({ id: "new", trade_group_id: "new", transaction_type: "buy", paid_by: "alex", cash_paid: 20, date: "2026-09-01" }),
      ],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payments = await partnerPosPayments(db.client as any, "ws-1", "2026-06-01");
    expect(payments.map((p) => p.id)).toEqual(["new"]);
  });
});
