import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import LedgerClient from "./LedgerClient";
import { groupDeals, type TxRow } from "./deals";

export default async function TransactionsServer() {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const [txRes, showsRes] = await Promise.all([
    supabase.from("card_transactions")
      .select("id,card_id,card:items!card_id(name),transaction_type,trade_group_id,date,payment_method,counterparty,notes,show_session_id,paid_by,cash_paid,sale_price,market_price_at_time,cash_difference")
      .eq("workspace_id", workspaceId).order("date", { ascending: false }).limit(2000),
    supabase.from("show_sessions").select("id,name,date")
      .eq("workspace_id", workspaceId).order("date", { ascending: false }),
  ]);
  if (txRes.error) throw new Error(txRes.error.message);
  const rows = (txRes.data ?? []) as unknown as TxRow[];

  const logsRes = await supabase.from("deal_logs").select("transaction_id,photos").not("transaction_id", "is", null);
  const photos = new Map<string, string[]>();
  for (const l of logsRes.data ?? []) {
    const k = l.transaction_id as string;
    photos.set(k, [...(photos.get(k) ?? []), ...((l.photos as string[] | null) ?? [])]);
  }

  return (
    <LedgerClient
      deals={groupDeals(rows, photos)}
      shows={(showsRes.data ?? []) as { id: string; name: string; date: string }[]}
    />
  );
}
