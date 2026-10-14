"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import {
  allocate, round2,
  type BuyInput, type SellInput, type TradeInput, type NewCard, type DealFields,
} from "./ledger";

type Ctx = { supabase: Awaited<ReturnType<typeof createClient>>; workspaceId: string; userId: string };
type Row = Record<string, unknown>;

async function context(): Promise<Ctx> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not logged in");
  return { supabase, workspaceId, userId: data.user.id };
}

function revalidate() {
  for (const p of ["pos", "transactions", "inventory", "dashboard", "shows", "payout"]) {
    revalidatePath(`/protected/${p}`);
  }
}

// ── Shared writes ─────────────────────────────────────────────────────────────

// Offline replays reuse client_id; return the deal already recorded for it
async function existingDeal(c: Ctx, clientId?: string | null): Promise<string | null> {
  if (!clientId) return null;
  const { data } = await c.supabase.from("card_transactions").select("id")
    .eq("client_id", clientId).eq("workspace_id", c.workspaceId).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

// One row per card; the lead row's id is the deal id and carries client_id
async function insertRows(c: Ctx, d: DealFields, groupId: string, rows: Row[]) {
  const { error } = await c.supabase.from("card_transactions").insert(rows.map((r, i) => ({
    workspace_id: c.workspaceId,
    trade_group_id: groupId,
    show_session_id: d.show_session_id,
    payment_method: d.payment_method,
    counterparty: d.counterparty?.trim() || null,
    notes: d.notes?.trim() || null,
    ...r,
    ...(i === 0 ? { id: groupId, client_id: d.client_id ?? null } : {}),
  })));
  if (error) throw new Error(error.message);
}

async function insertItem(c: Ctx, card: NewCard, fields: Row): Promise<string> {
  const { data, error } = await c.supabase.from("items").insert({
    workspace_id: c.workspaceId,
    name: card.name.trim(),
    category: card.category,
    owner: card.owner ?? "shared",
    status: "inventory",
    condition: card.condition ?? "Near Mint",
    grade: card.grade ?? null,
    set_name: card.set_name ?? null,
    card_number: card.card_number ?? null,
    image_url: card.image_url ?? null,
    cert_number: card.cert_number ?? null,
    market: card.market,
    acquired_market_price: card.market,
    acquired_date: new Date().toISOString(),
    updated_by: c.userId,
    ...fields,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function dropItems(c: Ctx, ids: string[]) {
  if (ids.length) await c.supabase.from("items").delete().in("id", ids).eq("workspace_id", c.workspaceId);
}

const STATS = ["total_spent", "total_revenue", "total_trade_value", "cards_bought", "cards_sold", "trades_count"] as const;
type Stats = Partial<Record<(typeof STATS)[number], number>>;

// Keeps the show's running totals (banner, history) in step with its deals
async function bumpShow(c: Ctx, showId: string | null | undefined, delta: Stats) {
  if (!showId) return;
  const { data } = await c.supabase.from("show_sessions").select(STATS.join(","))
    .eq("id", showId).eq("workspace_id", c.workspaceId).maybeSingle();
  if (!data) return;
  const cur = data as unknown as Record<string, number | null>;
  const next: Record<string, number> = {};
  for (const k of STATS) next[k] = round2((cur[k] ?? 0) + (delta[k] ?? 0));
  next.net_pl = round2(next.total_revenue - next.total_spent);
  await c.supabase.from("show_sessions").update(next).eq("id", showId);
}

const sum = (xs: number[]) => round2(xs.reduce((s, x) => s + x, 0));

// ── Buy ───────────────────────────────────────────────────────────────────────

export async function recordBuy(input: BuyInput): Promise<{ id: string }> {
  if (!input.cards.length) throw new Error("Add at least one card");
  const c = await context();
  const dup = await existingDeal(c, input.client_id);
  if (dup) return { id: dup };

  const id = crypto.randomUUID();
  const costs = input.cards.every((x) => x.cost != null)
    ? input.cards.map((x) => round2(x.cost!))
    : allocate(input.total, input.cards.map((x) => x.market ?? 0));
  const created: string[] = [];
  try {
    const rows: Row[] = [];
    for (const [i, card] of input.cards.entries()) {
      const cost = costs[i];
      const pct = card.market ? round2((cost / card.market) * 100) : null;
      const itemId = await insertItem(c, card, {
        cost, cost_basis: cost, original_cash_invested: cost,
        buy_percentage: pct, acquisition_type: "buy", chain_depth: 0,
      });
      created.push(itemId);
      rows.push({
        card_id: itemId, transaction_type: "buy", paid_by: input.paid_by,
        market_price_at_time: card.market, cost_basis: cost, cash_paid: cost,
        buy_percentage: pct, chain_depth: 0,
      });
    }
    await insertRows(c, input, id, rows);
  } catch (e) {
    await dropItems(c, created);
    throw e;
  }

  await bumpShow(c, input.show_session_id, { total_spent: input.total, cards_bought: input.cards.length });
  revalidate();
  return { id };
}

// ── Sell ──────────────────────────────────────────────────────────────────────

export async function recordSell(input: SellInput): Promise<{ id: string }> {
  if (!input.itemIds.length) throw new Error("Pick at least one item");
  const c = await context();
  const dup = await existingDeal(c, input.client_id);
  if (dup) return { id: dup };

  const { data, error } = await c.supabase.from("items")
    .select("id,market,cost,cost_basis,consigner_id,status")
    .in("id", input.itemIds).eq("workspace_id", c.workspaceId);
  if (error) throw new Error(error.message);
  const items = (data ?? []).filter((it) => it.status !== "sold");
  if (items.length !== input.itemIds.length) throw new Error("Some items are already sold or missing");

  const split = allocate(input.total, items.map((it) => it.market ?? 0));
  const prices = items.map((it, i) => input.prices?.[it.id] ?? split[i]);

  // Consigned items pay out the consigner's share at sale time
  const consignerIds = [...new Set(items.map((it) => it.consigner_id).filter(Boolean))];
  const rates = new Map<string, number>();
  if (consignerIds.length) {
    const { data: cs } = await c.supabase.from("consigners").select("id,rate")
      .in("id", consignerIds).eq("workspace_id", c.workspaceId);
    for (const r of cs ?? []) rates.set(r.id as string, r.rate as number);
  }

  const id = crypto.randomUUID();
  await insertRows(c, input, id, items.map((it, i) => ({
    card_id: it.id, transaction_type: "sell", sale_price: prices[i],
    market_price_at_time: it.market, cost_basis: it.cost_basis ?? it.cost,
  })));

  const soldAt = new Date().toISOString();
  for (const [i, it] of items.entries()) {
    const rate = it.consigner_id ? rates.get(it.consigner_id) : undefined;
    const { error: upErr } = await c.supabase.from("items").update({
      status: "sold", sale_id: id, sold_price: prices[i], sold_at: soldAt, updated_by: c.userId,
      consigner_payout: rate != null ? round2(prices[i] * rate) : null,
    }).eq("id", it.id).eq("workspace_id", c.workspaceId);
    if (upErr) throw new Error(upErr.message);
  }

  await bumpShow(c, input.show_session_id, { total_revenue: sum(prices), cards_sold: items.length });
  revalidate();
  return { id };
}

// ── Trade ─────────────────────────────────────────────────────────────────────

export async function recordTrade(input: TradeInput): Promise<{ id: string }> {
  if (!input.goingOut.length && !input.comingIn.length) throw new Error("Add cards to the trade");
  const c = await context();
  const dup = await existingDeal(c, input.client_id);
  if (dup) return { id: dup };

  const outIds = input.goingOut.map((g) => g.itemId);
  const { data, error } = outIds.length
    ? await c.supabase.from("items")
        .select("id,cost,cost_basis,chain_depth,original_cash_invested,status")
        .in("id", outIds).eq("workspace_id", c.workspaceId)
    : { data: [], error: null };
  if (error) throw new Error(error.message);
  const outItems = (data ?? []).filter((it) => it.status !== "sold");
  if (outItems.length !== outIds.length) throw new Error("Some outgoing items are already sold or missing");
  const byId = new Map(outItems.map((it) => [it.id as string, it]));

  // Incoming basis = basis given up + cash we paid − cash we received
  const basisOf = (it: (typeof outItems)[number]) => Number(it.cost_basis ?? it.cost ?? 0);
  const cashIn = Math.max(0, input.cashDifference);
  const markets = input.comingIn.map((x) => x.market ?? 0);
  const inBasis = allocate(Math.max(0, sum(outItems.map(basisOf)) + input.cashDifference), markets);
  const inCash = allocate(
    sum(outItems.map((it) => Number(it.original_cash_invested ?? basisOf(it)))) + cashIn, markets);
  const depth = outItems.length ? Math.max(...outItems.map((it) => it.chain_depth ?? 0)) + 1 : 0;
  const shared = { cash_difference: input.cashDifference, paid_by: input.paid_by };

  const id = crypto.randomUUID();
  const created: string[] = [];
  try {
    const rows: Row[] = input.goingOut.map((g) => ({
      ...shared, card_id: g.itemId, transaction_type: "trade_out",
      market_price_at_time: g.value, cost_basis: basisOf(byId.get(g.itemId)!),
      chain_depth: byId.get(g.itemId)!.chain_depth ?? 0,
    }));
    for (const [i, card] of input.comingIn.entries()) {
      const itemId = await insertItem(c, card, {
        cost: inBasis[i], cost_basis: inBasis[i], original_cash_invested: inCash[i],
        acquisition_type: "trade", chain_depth: depth,
      });
      created.push(itemId);
      rows.push({
        ...shared, card_id: itemId, transaction_type: "trade_in",
        market_price_at_time: card.market, cost_basis: inBasis[i], chain_depth: depth,
        previous_card_id: outIds.length === 1 ? outIds[0] : null,
      });
    }
    await insertRows(c, input, id, rows);
  } catch (e) {
    await dropItems(c, created);
    throw e;
  }

  const soldAt = new Date().toISOString();
  for (const g of input.goingOut) {
    await c.supabase.from("items").update({
      status: "sold", sale_id: id, sold_price: g.value, sold_at: soldAt, updated_by: c.userId,
    }).eq("id", g.itemId).eq("workspace_id", c.workspaceId);
  }

  await bumpShow(c, input.show_session_id, {
    trades_count: 1,
    total_trade_value: sum([...input.goingOut.map((g) => g.value), ...markets]),
    total_spent: cashIn,
    total_revenue: Math.max(0, -input.cashDifference),
  });
  revalidate();
  return { id };
}

// ── Revert ────────────────────────────────────────────────────────────────────

// Undoes a whole deal: new cards leave inventory, sold/traded cards come back
export async function revertTransaction(dealId: string): Promise<void> {
  const c = await context();
  const cols = "id,card_id,transaction_type,show_session_id,cash_paid,sale_price,market_price_at_time,cash_difference";
  const tx = () => c.supabase.from("card_transactions").select(cols).eq("workspace_id", c.workspaceId);
  let { data: rows } = await tx().eq("trade_group_id", dealId);
  if (!rows?.length) ({ data: rows } = await tx().eq("id", dealId));
  if (!rows?.length) throw new Error("Transaction not found");

  const cards = (...types: string[]) =>
    rows!.filter((r) => types.includes(r.transaction_type as string)).map((r) => r.card_id as string).filter(Boolean);
  const added = cards("buy", "trade_in");
  const removed = cards("sell", "trade_out");

  if (added.length) {
    const { data: live } = await c.supabase.from("items").select("id,name,status")
      .in("id", added).eq("workspace_id", c.workspaceId);
    const moved = (live ?? []).filter((it) => it.status !== "inventory");
    if (moved.length) throw new Error(`Can't revert: ${moved.map((m) => m.name).join(", ")} already sold or traded`);
  }

  const admin = createAdminClient();
  const rowIds = rows.map((r) => r.id as string);
  const { data: logs } = await admin.from("deal_logs").select("photos").in("transaction_id", rowIds);
  const paths = (logs ?? []).flatMap((l) => (l.photos as string[] | null) ?? [])
    .map((u) => u.split("/deal-photos/")[1]).filter(Boolean);
  if (paths.length) await admin.storage.from("deal-photos").remove(paths);

  const { error } = await c.supabase.from("card_transactions").delete()
    .in("id", rowIds).eq("workspace_id", c.workspaceId);
  if (error) throw new Error(error.message);
  if (removed.length) {
    await c.supabase.from("items").update({
      status: "inventory", sale_id: null, sold_price: null, sold_at: null, consigner_payout: null, updated_by: c.userId,
    }).in("id", removed).eq("workspace_id", c.workspaceId);
  }
  await dropItems(c, added);

  const total = (f: string) => sum(rows!.map((r) => Number(r[f as keyof typeof r] ?? 0)));
  const types = new Set(rows.map((r) => r.transaction_type as string));
  const cd = Number(rows[0].cash_difference ?? 0);
  await bumpShow(c, rows[0].show_session_id as string | null,
    types.has("buy") ? { total_spent: -total("cash_paid"), cards_bought: -rows.length }
    : types.has("sell") ? { total_revenue: -total("sale_price"), cards_sold: -rows.length }
    : {
        trades_count: -1, total_trade_value: -total("market_price_at_time"),
        total_spent: -Math.max(0, cd), total_revenue: -Math.max(0, -cd),
      });
  revalidate();
}

// ── Photos ────────────────────────────────────────────────────────────────────

// One photo per call keeps each request well under the upload limit
export async function attachPhoto(dealId: string, form: FormData): Promise<void> {
  const c = await context();
  const file = form.get("photo");
  if (!(file instanceof File)) throw new Error("No photo");
  const { data: tx } = await c.supabase.from("card_transactions").select("transaction_type")
    .eq("id", dealId).eq("workspace_id", c.workspaceId).maybeSingle();
  if (!tx) throw new Error("Transaction not found");

  const admin = createAdminClient();
  const path = `${c.workspaceId}/${dealId}/${crypto.randomUUID()}.jpg`;
  const { error: upErr } = await admin.storage.from("deal-photos")
    .upload(path, await file.arrayBuffer(), { contentType: file.type || "image/jpeg" });
  if (upErr) throw new Error(upErr.message);
  const url = admin.storage.from("deal-photos").getPublicUrl(path).data.publicUrl;

  const type = tx.transaction_type === "buy" || tx.transaction_type === "sell" ? tx.transaction_type : "trade";
  const { error } = await admin.from("deal_logs")
    .insert({ type, notes: null, photos: [url], user_id: c.userId, transaction_id: dealId });
  if (error) throw new Error(error.message);
  revalidatePath("/protected/transactions");
}
