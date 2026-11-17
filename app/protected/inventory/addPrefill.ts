// ── Card links from Search ──
// Search's card sheet hands a card to two places, and one file owns both URL
// formats so neither end can drift:
//   Add to inventory  /protected/inventory?add=1&name=…&set=…&number=…&image=…&card=…&market=…
//                     Inventory opens its add sheet filled in
//   Buy in POS        /protected/pos?mode=buy&name=…&set=…&number=…&image=…&market=…
//                     the POS opens on Buy with the card already in the deal

export type AddPrefill = {
  name: string;
  setName: string | null;
  cardNumber: string | null;
  imageUrl: string | null;
  cardId: string | null;
  market: number | null;
};

function cardParams(p: AddPrefill): URLSearchParams {
  const q = new URLSearchParams({ name: p.name });
  if (p.setName) q.set("set", p.setName);
  if (p.cardNumber) q.set("number", p.cardNumber);
  if (p.imageUrl) q.set("image", p.imageUrl);
  if (p.cardId) q.set("card", p.cardId);
  if (p.market != null && Number.isFinite(p.market)) q.set("market", p.market.toFixed(2));
  return q;
}

export function addToInventoryHref(p: AddPrefill): string {
  return `/protected/inventory?add=1&${cardParams(p).toString()}`;
}

export function buyInPosHref(p: AddPrefill): string {
  return `/protected/pos?mode=buy&${cardParams({ ...p, cardId: null }).toString()}`;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || null;

// The card a link carries, or null without a name. Images must be https URLs.
function parseCard(params: Params): AddPrefill | null {
  const name = one(params.name);
  if (!name) return null;
  const image = one(params.image);
  const market = Number(one(params.market));
  return {
    name: name.slice(0, 200),
    setName: one(params.set),
    cardNumber: one(params.number),
    imageUrl: image && /^https:\/\//.test(image) ? image : null,
    cardId: one(params.card),
    market: Number.isFinite(market) && market > 0 ? market : null,
  };
}

// The prefill an Inventory request asks for (add=1), or null
export function parseAddPrefill(params: Params): AddPrefill | null {
  return one(params.add) === "1" ? parseCard(params) : null;
}

// The card a POS request asks to buy (mode=buy with a name), or null
export function parseBuyPrefill(params: Params): AddPrefill | null {
  return one(params.mode) === "buy" ? parseCard(params) : null;
}
