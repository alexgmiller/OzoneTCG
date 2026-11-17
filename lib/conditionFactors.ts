import type { SupabaseClient } from "@supabase/supabase-js";
import { learnFactors, MIN_NM_PRICE, type ConditionPriceRow, type LearnedFactors } from "./conditionPricing";

// Server only: reads raw_card_prices, which needs the admin client.
// Condition factors learned from the cards JustTCG has priced (see
// lib/conditionPricing.ts). The 03:00 refresh-prices job uses them on
// one-price sources, and the POS uses them to price played cards in a buy or
// trade, so both value an LP card the same way. On a failed read the defaults
// are used.
export async function loadConditionFactors(supabase: SupabaseClient): Promise<LearnedFactors> {
  const { data, error } = await supabase
    .from("raw_card_prices")
    .select("nm_price,lp_price,mp_price,hp_price,dmg_price")
    .gte("nm_price", MIN_NM_PRICE)
    .limit(5000);
  if (error) console.error("[conditionFactors] raw_card_prices read failed:", error.message);
  return learnFactors((data ?? []) as ConditionPriceRow[]);
}
