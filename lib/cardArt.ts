// ── Card art memory ──
// One image per physical card (card_art, keyed by cardArtMatch.cardKey), so an
// image found or set once is reused for every copy instead of being looked up
// or uploaded again.
//
// - A person setting an image (edit sheet, tile upload, POS, cert scanner)
//   saves it as 'manual'; manual always wins and is never replaced by an
//   automatic find.
// - Automatic finds (TCGdex, TCGplayer, pokemontcg.io, the catalog) are saved
//   too, so the next copy skips the lookup.
// - Saving a manual image also fills every in-stock copy of that card that has
//   no image yet.
//
// Until migrations/20261116_card_art.sql is applied the table is missing; every
// call then quietly does nothing, so the app behaves as it did before.

import { createAdminClient } from "./supabase/admin";
import { artVerdict, cardKey } from "./cardArtMatch";
import { tcgdexSetList } from "./tcgdexSets";

export type CardRef = { name: string; set_name: string | null; card_number: string | null };
export type ArtSource = "manual" | "tcgdex" | "tcgplayer" | "pokemontcg" | "catalog";
export type CardArt = { imageUrl: string; source: ArtSource };

let missingTableLogged = false;
function tableMissing(error: { message?: string; code?: string } | null): boolean {
  const missing = !!error && (error.code === "42P01" || /card_art/.test(error.message ?? "") && /does not exist|not find/i.test(error.message ?? ""));
  if (missing && !missingTableLogged) {
    missingTableLogged = true;
    console.warn("[cardArt] card_art table missing — run migrations/20261116_card_art.sql");
  }
  return missing;
}

export async function keyFor(card: CardRef): Promise<string | null> {
  return cardKey(card, await tcgdexSetList());
}

// The remembered image for this card. Automatic entries that fail the set +
// number check are ignored (manual ones are the user's call).
export async function getCardArt(card: CardRef): Promise<CardArt | null> {
  const key = await keyFor(card);
  if (!key) return null;
  try {
    const { data, error } = await createAdminClient()
      .from("card_art").select("image_url,source").eq("card_key", key).maybeSingle();
    if (error) { tableMissing(error); return null; }
    if (!data?.image_url) return null;
    const art = { imageUrl: data.image_url as string, source: data.source as ArtSource };
    if (art.source !== "manual" && artVerdict(card, art.imageUrl, await tcgdexSetList()) === "wrong") return null;
    return art;
  } catch {
    return null;
  }
}

// Remember an image for this card. An automatic find never replaces a manual one.
export async function rememberCardArt(card: CardRef, imageUrl: string, source: ArtSource): Promise<void> {
  const key = await keyFor(card);
  if (!key || !imageUrl) return;
  try {
    const admin = createAdminClient();
    if (source !== "manual") {
      const { data, error } = await admin.from("card_art").select("source").eq("card_key", key).maybeSingle();
      if (error) { tableMissing(error); return; }
      if (data?.source === "manual") return;
    }
    const { error } = await admin.from("card_art").upsert({
      card_key: key,
      name: card.name.trim(),
      set_name: card.set_name?.trim() || null,
      card_number: card.card_number?.trim() || null,
      image_url: imageUrl,
      source,
      updated_at: new Date().toISOString(),
    });
    if (error) tableMissing(error);
  } catch {
    // Remembering is best effort; the item itself already has its image
  }
}

// Give every in-stock copy of this card that has no image this one. Uses the
// caller's (RLS) client so it only touches the caller's workspace.
export async function fillSameCard(
  supabase: { from: ReturnType<typeof createAdminClient>["from"] },
  workspaceId: string,
  card: CardRef,
  imageUrl: string,
): Promise<number> {
  const key = await keyFor(card);
  const word = card.name.replace(/\([^)]*\)/g, " ").trim().split(/\s+/)[0];
  if (!key || !word) return 0;
  const { data } = await supabase
    .from("items")
    .select("id,name,set_name,card_number")
    .eq("workspace_id", workspaceId)
    .is("image_url", null)
    .neq("status", "sold")
    .ilike("name", `%${word}%`)
    .limit(500);
  const sets = await tcgdexSetList();
  const ids = ((data ?? []) as (CardRef & { id: string })[])
    .filter((it) => cardKey(it, sets) === key)
    .map((it) => it.id);
  if (!ids.length) return 0;
  await supabase.from("items").update({ image_url: imageUrl })
    .in("id", ids).eq("workspace_id", workspaceId).is("image_url", null);
  return ids.length;
}

// What a person did: remember as manual and fill the card's other copies
export async function rememberAndFill(
  supabase: Parameters<typeof fillSameCard>[0],
  workspaceId: string,
  card: CardRef,
  imageUrl: string | null | undefined,
): Promise<void> {
  if (!imageUrl) return;
  await rememberCardArt(card, imageUrl, "manual");
  await fillSameCard(supabase, workspaceId, card, imageUrl).catch(() => 0);
}
