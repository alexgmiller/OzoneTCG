import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupCard } from "@/lib/pokemonPriceTracker";

// Allow up to 5 minutes — needed for large inventories (Vercel Pro required for >60s)
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // Verify the request is from the scheduled cron (Vercel sends Authorization header)
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Fetch all non-sold items across all workspaces
  const { data: items, error } = await supabase
    .from("items")
    .select("id, workspace_id, name, category, set_name, card_number, image_url")
    .neq("status", "sold");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!items?.length) return NextResponse.json({ updated: 0, total: 0 });

  let updated = 0;
  const BATCH = 3; // conservative to avoid hammering TCGdex free API

  for (let i = 0; i < items.length; i += BATCH) {
    await Promise.all(
      items.slice(i, i + BATCH).map(async (item) => {
        try {
          const result = await lookupCard(
            item.name,
            item.category as "single" | "slab" | "sealed",
            { setName: item.set_name, cardNumber: item.card_number }
          );
          if (!result) return;

          const patch: Record<string, unknown> = {};
          if (result.imageUrl) patch.image_url = result.imageUrl;
          // Only overwrite market if we got a real price back (don't null-out existing values)
          if (result.market != null) patch.market = result.market;
          if (Object.keys(patch).length === 0) return;

          const { error: updateErr } = await supabase
            .from("items")
            .update(patch)
            .eq("id", item.id)
            .eq("workspace_id", item.workspace_id);

          if (!updateErr) updated++;
        } catch {
          // Swallow per-item errors so one bad card doesn't abort the whole run
        }
      })
    );
  }

  console.log(`[cron/refresh-prices] updated ${updated} / ${items.length} items`);
  return NextResponse.json({ updated, total: items.length });
}
