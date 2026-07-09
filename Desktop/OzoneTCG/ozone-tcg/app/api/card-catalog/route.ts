import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";

const MAX_CARDS = 5000;

export async function GET() {
  try {
    const supabase    = await createClient();
    const workspaceId = await getWorkspaceId();

    // Get distinct set names from the workspace's inventory
    const { data: setRows } = await supabase
      .from("items")
      .select("set_name")
      .eq("workspace_id", workspaceId)
      .not("set_name", "is", null);

    const setNames = [...new Set((setRows ?? []).map((r) => r.set_name as string).filter(Boolean))];

    let cards: { id: string; name: string; set_name: string | null; set_id: string; card_number: string | null; image_url: string | null }[] = [];

    if (setNames.length > 0) {
      // Fetch cards for sets that appear in the workspace's inventory
      const { data } = await supabase
        .from("pokemon_cards")
        .select("id, name, set_id, set_name, card_number, image_url")
        .eq("language", "en")
        .in("set_name", setNames)
        .limit(MAX_CARDS);
      cards = data ?? [];
    }

    // If workspace is empty or we got fewer than 1000 cards, pad with recent popular sets
    if (cards.length < 1000) {
      const existingIds = new Set(cards.map((c) => c.id));
      const { data: recent } = await supabase
        .from("pokemon_cards")
        .select("id, name, set_id, set_name, card_number, image_url")
        .eq("language", "en")
        .order("set_id", { ascending: false })
        .limit(MAX_CARDS - cards.length);

      for (const card of recent ?? []) {
        if (!existingIds.has(card.id)) {
          cards.push(card);
          if (cards.length >= MAX_CARDS) break;
        }
      }
    }

    return NextResponse.json({ cards, count: cards.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load catalog" },
      { status: 500 }
    );
  }
}
