import { searchBaseNames, isJapaneseName, extractEmbeddedNumber, stripParens } from "./cardNameUtils";
import { makeLookupKey, getCardCache, setCardCache, getManualImage, findManualCacheEntry } from "./cardCache";
import { getCardImage } from "./cardImages";
import {
  artVerdict, nameLooksRight, normNum, numberKeys, parentSetId, pickByNumber, resolveSetIds,
  type TcgdexCard,
} from "./cardArtMatch";
import { TCGDEX_EN, TCGDEX_JA, tcgdexSetCards, tcgdexSetList } from "./tcgdexSets";
import { getCardArt, rememberCardArt } from "./cardArt";

// Re-exported for callers that already import it from here
export { tcgdexSetList };

const TCGIO_BASE = "https://api.pokemontcg.io/v2";
const FETCH_TIMEOUT_MS = 8000;

type LookupResult = {
  market: number | null;
  imageUrl: string | null;
};

type LookupOptions = {
  setName?: string | null;
  cardNumber?: string | null;
};

/** Extract the base number from "17/115" → "17" */
function baseNumber(n: string | null | undefined): string | undefined {
  if (!n) return undefined;
  return n.split("/")[0].trim() || undefined;
}

function makeFetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

type TcgDexMatch = { imageUrl: string; cardId: string; endpoint: string };

// ── Step 1: TCGdex (primary — high-quality 600×825 WebP images) ──────────────
// Set + number identifies a printing, so that is what we match on (see
// lib/cardArtMatch.ts). A name on its own never picks the art: the old
// "first card with this name" fallback is what put Team Up art on SM promos.
//
//   1. The item's set maps to TCGdex set(s) → take the card with its number
//      from that set's card list (art for sub-set cards lives under the parent).
//   2. The set doesn't map → search by name and accept only if exactly one
//      printing has this number.
//   3. Otherwise no image. A name tile beats the wrong card.
// Japanese cards only ever match Japanese printings.

// Trainer Gallery / Galarian Gallery / Classic Collection entries often have
// no image in their own listing; TCGdex keeps their art in the parent set's
// asset folder under the sub-set number (…/swsh/swsh9/TG22). Use the parent's
// exact card if listed, else build that URL from a sibling's and confirm it.
async function subsetArtFromParent(endpoint: string, parentId: string, localId: string): Promise<string | null> {
  const cards = await tcgdexSetCards(endpoint, parentId);
  const exact = cards.find((c) => normNum(c.localId) === normNum(localId) && c.image);
  if (exact?.image) return exact.image;
  const sibling = cards.find((c) => c.image)?.image;
  if (!sibling) return null;
  const url = `${sibling.slice(0, sibling.lastIndexOf("/"))}/${localId}`;
  try {
    const res = await makeFetchWithTimeout(`${url}/high.webp`, { method: "HEAD", cache: "no-store" });
    return res.ok ? url : null;
  } catch {
    return null;
  }
}

const toMatch = (card: TcgdexCard, image: string, endpoint: string): TcgDexMatch =>
  ({ imageUrl: `${image}/high.webp`, cardId: card.id, endpoint });

export async function lookupImageFromTcgDex(
  name: string,
  setName?: string | null,
  cardNumber?: string | null
): Promise<TcgDexMatch | null> {
  const num = baseNumber(cardNumber) ?? extractEmbeddedNumber(name) ?? undefined;
  const isJP = isJapaneseName(name) || /\bjapanese\b|^jp$/i.test(setName?.trim() ?? "");
  const endpoint = isJP ? TCGDEX_JA : TCGDEX_EN;
  if (!num) return null; // without a number there is no way to tell printings apart

  // 1. Known set → the card with this number in it
  const sets = await tcgdexSetList(endpoint);
  const setIds = resolveSetIds(setName, sets);
  for (const setId of setIds) {
    const card = pickByNumber(await tcgdexSetCards(endpoint, setId), num);
    // Japanese card names are in Japanese, so set + number has to stand alone
    if (!card || (!isJP && !nameLooksRight(name, card.name))) continue;
    let image = card.image ?? null;
    const parent = parentSetId(setId);
    if (!image && parent) image = await subsetArtFromParent(endpoint, parent, card.localId);
    if (image) {
      console.log(`[PriceTracker] TCGdex set match "${card.name}" id=${card.id}`);
      return toMatch(card, image, endpoint);
    }
  }
  if (setIds.length || isJP) return null;

  // 2. Unknown set → a name search, accepted only when one printing has this number
  const keys = new Set(numberKeys(num, { withinSet: false }));
  const candidates = new Map<string, TcgdexCard>();
  for (const base of searchBaseNames(name)) {
    try {
      const res = await makeFetchWithTimeout(`${endpoint}/cards?name=${encodeURIComponent(base)}`, { cache: "no-store" });
      if (!res.ok) continue;
      const data = (await res.json()) as TcgdexCard[];
      for (const c of Array.isArray(data) ? data : []) {
        if (c.image && keys.has(normNum(c.localId) ?? "") && nameLooksRight(name, c.name) && !/^[A-Z]/.test(c.id)) {
          candidates.set(c.id, c);
        }
      }
    } catch { /* try the next spelling */ }
  }
  if (candidates.size === 1) {
    const [card] = candidates.values();
    console.log(`[PriceTracker] TCGdex unique number match "${card.name}" id=${card.id}`);
    return toMatch(card, card.image!, endpoint);
  }
  if (candidates.size > 1) console.log(`[PriceTracker] TCGdex: ${candidates.size} printings of "${name}" #${num}, set "${setName ?? ""}" unknown — no image`);
  return null;
}

// ── Step 2: pokemontcg.io (fallback — wider coverage, lower image quality) ───

async function lookupFromTcgIo(
  name: string,
  setName?: string | null,
  cardNumber?: string | null
): Promise<{ imageUrl: string; market: number | null } | null> {
  const num = baseNumber(cardNumber);

  // Build Lucene query candidates, most specific first
  const queries: string[] = [];

  function addQ(q: string) { if (!queries.includes(q)) queries.push(q); }

  // Number-pinned queries only: a name (or name + set) alone returns some
  // printing of the card, not necessarily this one
  if (!num) return null;
  // pokemontcg.io hyphenates GX / EX ("Pikachu & Zekrom-GX", "M Gengar-EX")
  const names = [...new Set([name, stripParens(name), stripParens(name).replace(/\s+(GX|EX)\b/g, "-$1")])];
  for (const n of names) {
    if (setName) addQ(`name:"${n}" set.name:"${setName}" number:${num}`);
    addQ(`name:"${n}" number:${num}`);
  }

  const isLvX = /\bLv\.X\b/i.test(name);
  if (isLvX) {
    const lvxBase = name.replace(/\s+Lv\.X\s*$/i, "").replace(/\s*\([^)]*\)/g, "").trim();
    if (setName) addQ(`name:"${lvxBase}" set.name:"${setName}" number:${num} subtypes:LEVEL-UP`);
    addQ(`name:"${lvxBase}" number:${num} subtypes:LEVEL-UP`);
  }

  const apiKey = process.env.POKEMON_TCG_IO_API_KEY;
  const headers: Record<string, string> = {};
  if (apiKey) headers["X-Api-Key"] = apiKey;

  for (const q of queries) {
    try {
      // Several results: a name + number query can hit more than one set
      const url = `${TCGIO_BASE}/cards?q=${encodeURIComponent(q)}&pageSize=10&select=id,name,number,images,tcgplayer`;
      const res = await makeFetchWithTimeout(url, { headers, cache: "no-store" });
      if (!res.ok) continue;
      const json = await res.json();
      const hits = ((json.data ?? []) as { number?: string; images?: { large?: string; small?: string } }[])
        .filter((c) => (c.images?.large || c.images?.small) && normNum(c.number) === normNum(num));
      // More than one printing with this number and no set to choose by: don't guess
      if (hits.length !== 1) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const card: any = hits[0];

      const imageUrl: string = card.images.large ?? card.images.small;
      const prices = card.tcgplayer?.prices as Record<string, { market?: number }> | undefined;
      let market: number | null = null;
      if (prices) {
        const priority = ["holofoil", "reverseHolofoil", "1stEditionHolofoil", "normal"];
        for (const key of priority) {
          const m = prices[key]?.market;
          if (m != null && m > 0) { market = m; break; }
        }
        if (market == null) {
          for (const val of Object.values(prices)) {
            if (val?.market != null && val.market > 0) { market = val.market; break; }
          }
        }
      }

      console.log(`[PriceTracker] pokemontcg.io found "${card.name}" id=${card.id}`);
      return { imageUrl, market };
    } catch {
      continue;
    }
  }

  return null;
}

// ── Market price from TCGdex (when we already have the card ID) ───────────────

async function lookupMarketFromTcgDex(cardId: string, endpoint: string): Promise<number | null> {
  if (!cardId) return null;
  try {
    const res = await makeFetchWithTimeout(
      `${endpoint}/cards/${encodeURIComponent(cardId)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const card: any = await res.json();
    const p = card?.pricing?.tcgplayer;
    if (!p) return null;
    return p.normal?.marketPrice ?? p.holofoil?.marketPrice ?? p.reverseHolofoil?.marketPrice ?? null;
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Raw (ungraded) TCGplayer market price via TCGdex, with no image caching.
 * lookupCard stops at the image cache once a card has art, so it never prices
 * a single twice; the nightly refresh uses this to keep raw singles current
 * when JustTCG isn't configured. Null when TCGdex has no match or no price.
 */
export async function lookupRawMarketFromTcgDex(
  name: string,
  setName?: string | null,
  cardNumber?: string | null,
): Promise<number | null> {
  const match = await lookupImageFromTcgDex(name, setName ?? null, cardNumber ?? null);
  if (!match) return null;
  return lookupMarketFromTcgDex(match.cardId, match.endpoint);
}

export async function lookupCard(
  name: string,
  category: "single" | "slab" | "sealed",
  options?: LookupOptions
): Promise<LookupResult | null> {
  const setName = options?.setName?.trim() || null;
  const cardNumber = options?.cardNumber?.trim() || null;

  // Sealed products: skip card image APIs, use pokemonpricetracker.com
  if (category === "sealed") {
    const key = process.env.POKEMON_PRICE_TRACKER_API_KEY;
    if (!key) return null;
    try {
      const searchTerm = setName ? `${name} ${setName}` : name;
      const url = `https://www.pokemonpricetracker.com/api/v2/sealed-products?search=${encodeURIComponent(searchTerm)}&limit=1`;
      const res = await makeFetchWithTimeout(url, {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
      });
      if (!res.ok) return null;
      const json = await res.json();
      const item = json.data?.[0];
      if (!item) return null;
      const market: number | null = item.prices?.market ?? null;
      const imageUrl: string | null = item.imageUrlHiRes ?? item.imageUrl ?? null;
      return market || imageUrl ? { market, imageUrl } : null;
    } catch {
      return null;
    }
  }

  // ── Fallback chain for singles and slabs ──────────────────────────────────

  const cacheKey = makeLookupKey(name, setName, cardNumber);
  const card = { name, set_name: setName, card_number: cardNumber };

  // Step -1: The card art memory (lib/cardArt.ts). An image a person set for
  // this card wins over everything; a remembered automatic find comes after
  // the curated card_images table.
  const remembered = await getCardArt(card);
  if (remembered?.source === "manual") return { imageUrl: remembered.imageUrl, market: null };

  // Step 0: Check card_images (our authoritative database — manually curated + bulk-imported)
  const lang = category === "slab" ? "English" : "English"; // extend when JP/CN slabs needed
  const ownImage = await getCardImage(name, setName, cardNumber, lang, category);
  if (ownImage) {
    console.log(`[PriceTracker] card_images hit for "${name}" (verified=${ownImage.verified})`);
    return { imageUrl: ownImage.imageUrl, market: null };
  }
  if (remembered) return { imageUrl: remembered.imageUrl, market: null };

  // Step 1: Check local cache (Supabase card_image_cache)
  // Manual entries are trusted. Automatic ones were cached by the old
  // name-guessing matcher, so a cached image that isn't this card's set and
  // number is ignored and looked up again; so is a cached "not found", since
  // the set-aware lookup finds cards the old one missed.
  const cached = await getCardCache(cacheKey);
  if (cached.hit) {
    if (cached.source === "manual" || cached.source === "manual_admin") {
      // Carry an older manual pick over into the card art memory
      if (cached.imageUrl) await rememberCardArt(card, cached.imageUrl, "manual");
      return { imageUrl: cached.imageUrl, market: null };
    }
    const stale = cached.imageUrl === null
      || artVerdict({ set_name: setName, card_number: cardNumber }, cached.imageUrl, await tcgdexSetList()) === "wrong";
    if (!stale && cached.imageUrl) {
      await rememberCardArt(card, cached.imageUrl, cached.source === "pokemontcg" ? "pokemontcg" : "tcgdex");
      return { imageUrl: cached.imageUrl, market: null };
    }
  }

  // Step 1.5: Check for a prior manual cache entry (cross-key manual image lookup)
  const priorManualUrl = await findManualCacheEntry(name, cardNumber, setName);
  if (priorManualUrl) {
    await setCardCache(cacheKey, name, setName, cardNumber, priorManualUrl, "manual_admin");
    return { imageUrl: priorManualUrl, market: null };
  }

  // Step 2: Try TCGdex (primary — best image quality)
  const tcgDexMatch = await lookupImageFromTcgDex(name, setName, cardNumber);
  if (tcgDexMatch) {
    const market = category === "single"
      ? await lookupMarketFromTcgDex(tcgDexMatch.cardId, tcgDexMatch.endpoint)
      : null;
    await setCardCache(cacheKey, name, setName, cardNumber, tcgDexMatch.imageUrl, "tcgdex");
    await rememberCardArt(card, tcgDexMatch.imageUrl, "tcgdex");
    return { imageUrl: tcgDexMatch.imageUrl, market };
  }

  // Step 3: Try pokemontcg.io (fallback — wider set coverage)
  const tcgIoMatch = await lookupFromTcgIo(name, setName, cardNumber);
  if (tcgIoMatch) {
    await setCardCache(cacheKey, name, setName, cardNumber, tcgIoMatch.imageUrl, "pokemontcg");
    await rememberCardArt(card, tcgIoMatch.imageUrl, "pokemontcg");
    // pokemontcg.io prices the raw card; a slab's value comes from graded comps
    return { imageUrl: tcgIoMatch.imageUrl, market: category === "single" ? tcgIoMatch.market : null };
  }

  // Step 4: The synced catalog (pokemon_cards), by name + number within the
  // item's set. Cached as "tcgdex" (that's where the catalog comes from), not
  // "manual", so it stays subject to the set + number check above.
  const setIds = resolveSetIds(setName, await tcgdexSetList());
  const catalogUrl = await getManualImage(name, cardNumber, setIds);
  if (catalogUrl) {
    await setCardCache(cacheKey, name, setName, cardNumber, catalogUrl, "tcgdex");
    await rememberCardArt(card, catalogUrl, "catalog");
    return { imageUrl: catalogUrl, market: null };
  }

  // Step 5: No image found — cache the negative result so we don't retry every time
  await setCardCache(cacheKey, name, setName, cardNumber, null, "not_found");
  return null;
}
