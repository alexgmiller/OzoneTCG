// ── TCGplayer art (via TCGCSV) ──
// Second art source after TCGdex, for the cards TCGdex is thin on: promos
// (SM, SV, XY…) and Japanese sets. Lists come from lib/tcgcsv.ts (shared with
// the price lookup); matching rules live in lib/tcgplayerMatch.ts (set +
// number, no guessing). Any failure means "no match", never an error.

import { cardLang } from "./cardArtMatch";
import { tcgGroups, tcgProducts } from "./tcgcsv";
import { CATEGORY, candidateGroups, hiResImage, pickProduct } from "./tcgplayerMatch";

export type TcgplayerArt = { imageUrl: string; productId: number; groupName: string };

// The TCGplayer image for this exact card, or null
export async function lookupTcgplayerArt(
  name: string,
  setName: string | null | undefined,
  cardNumber: string | null | undefined,
): Promise<TcgplayerArt | null> {
  const lang = cardLang({ name, set_name: setName ?? null });
  const category = CATEGORY[lang];
  const all = await tcgGroups(category);
  // Mapped set and its sub-sets first; if the name maps to nothing, the
  // closest-named sets (the card itself must still match exactly)
  for (const g of candidateGroups(setName, all, lang)) {
    const p = pickProduct(await tcgProducts(category, g.groupId), name, cardNumber);
    const imageUrl = hiResImage(p?.imageUrl);
    if (p && imageUrl) {
      console.log(`[TCGplayer] "${name}" → ${p.name} [${p.productId}] in ${g.name}`);
      return { imageUrl, productId: p.productId, groupName: g.name };
    }
  }
  return null;
}
