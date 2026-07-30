import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";

const FREQ_CAP = 500;

// ── GET — return the full frequency map for the workspace ─────────────────────

export async function GET() {
  try {
    const supabase = await createClient();
    const workspaceId = await getWorkspaceId();

    const { data, error } = await supabase
      .from("card_search_frequency")
      .select("card_identifier, card_name, count, last_used")
      .eq("workspace_id", workspaceId)
      .order("last_used", { ascending: false })
      .limit(FREQ_CAP);

    if (error) throw error;

    const frequencies: Record<string, { count: number; lastUsed: string; name: string }> = {};
    for (const row of data ?? []) {
      frequencies[row.card_identifier] = {
        count: row.count,
        lastUsed: row.last_used,
        name: row.card_name,
      };
    }

    return NextResponse.json({ frequencies });
  } catch (err) {
    console.error("[card-search-freq GET]", err);
    // Degrade gracefully — client will skip frequency boosting
    return NextResponse.json({ frequencies: {} });
  }
}

// ── POST — record a card selection ───────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const cardIdentifier: string = (body.cardIdentifier ?? "").trim();
    const cardName: string = (body.cardName ?? "").trim();

    if (!cardIdentifier || !cardName) {
      return NextResponse.json({ error: "cardIdentifier and cardName are required" }, { status: 400 });
    }

    const supabase = await createClient();
    const workspaceId = await getWorkspaceId();

    // Single RPC: atomic upsert with count++ and prune in one round-trip
    const { error } = await supabase.rpc("record_card_search", {
      p_workspace_id: workspaceId,
      p_card_identifier: cardIdentifier,
      p_card_name: cardName,
      p_cap: FREQ_CAP,
    });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[card-search-freq POST]", err);
    // Fire-and-forget from the client — return 200 so the client doesn't retry
    return NextResponse.json({ ok: false });
  }
}
