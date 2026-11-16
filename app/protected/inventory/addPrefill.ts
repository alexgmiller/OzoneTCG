// ── "Add to inventory" links ──
// Search's card sheet links to Inventory with the card's details; Inventory
// opens its add sheet already filled in. One place owns the URL format so the
// two ends can't drift.
//   /protected/inventory?add=1&name=…&set=…&number=…&image=…&card=…&market=…

export type AddPrefill = {
  name: string;
  setName: string | null;
  cardNumber: string | null;
  imageUrl: string | null;
  cardId: string | null;
  market: number | null;
};

export function addToInventoryHref(p: AddPrefill): string {
  const q = new URLSearchParams({ add: "1", name: p.name });
  if (p.setName) q.set("set", p.setName);
  if (p.cardNumber) q.set("number", p.cardNumber);
  if (p.imageUrl) q.set("image", p.imageUrl);
  if (p.cardId) q.set("card", p.cardId);
  if (p.market != null && Number.isFinite(p.market)) q.set("market", p.market.toFixed(2));
  return `/protected/inventory?${q.toString()}`;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || null;

// The prefill a request asks for, or null. Images must be https URLs.
export function parseAddPrefill(params: Params): AddPrefill | null {
  if (one(params.add) !== "1") return null;
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
