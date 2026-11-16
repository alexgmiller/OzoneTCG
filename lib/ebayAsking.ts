// ── eBay asking prices (plan C) ──
// For a raw card nothing else prices (no TCGplayer sales, no TCGdex/other
// price), an estimate from current eBay listings via the Browse API. Sold data
// needs eBay's Marketplace Insights approval, so these are asking prices:
// labelled as such, and only used to fill a gap, never over a real market price.
//
// Listings must be this card: the title has the card's number and name, isn't
// graded, isn't a lot/proxy/sealed product, and is in the card's language. With
// at least 3 such listings, the estimate is the low quarter (25th percentile)
// after trimming outliers, the same "realistic low end of current supply"
// lib/fmv.ts uses for listings.
//
// Conditions are priced apart: played copies linger on eBay while near-mint
// ones sell, so one pool for all reads like a played price (DeckTradr's sold
// data for Psyduck 286/SM-P: NM $2,236, LP $1,501; one pool of asks: $1,565).
// A listing's condition comes from eBay's card-condition descriptor when the
// listing carries one, else from its title; listings that state none count
// with near mint.

import { iqrFilter, pctile } from "./fmv";
import { stripParens } from "./cardNameUtils";

/** `condition`: eBay's card-condition descriptor text, when present ("Near mint or better") */
export type AskingListing = { title: string; price: number; condition?: string | null };
export type AskingCard = { name: string; cardNumber: string | null; lang: "en" | "ja" };
export type AskingEstimate = { price: number; count: number; low: number; high: number };

export const MIN_LISTINGS = 3;

export type ListingCondition = "nm" | "played" | "unknown";

// Played wins over near mint ("NM/LP" is a played copy). No "ex", "good"
// or "HP": "Mew ex" is a card name and "60 HP" is hit points.
const PLAYED_WORDS = /\b(lp|mp|lightly played|moderately played|heavily played|played|damaged|dmg|creased?|poor|excellent|very good)\b/i;
const NM_WORDS = /\b(nm|near mint|mint|pack fresh)\b/i;

export function listingCondition(l: AskingListing): ListingCondition {
  if (l.condition) {
    if (/near mint/i.test(l.condition)) return "nm";
    if (/excellent|very good|poor|played|damaged/i.test(l.condition)) return "played";
  }
  if (PLAYED_WORDS.test(l.title)) return "played";
  if (NM_WORDS.test(l.title)) return "nm";
  return "unknown";
}

const GRADED = /\b(psa|bgs|cgc|sgc|tag|ace|beckett|graded|slab(bed)?|gem mint 10)\b/i;
const NOT_A_SINGLE = /\b(lots?|bundle|set of|playset|bulk|proxy|custom|replica|fake|orica|fan ?art|metal|gold card|code cards?|digital|online|jumbo|oversized|sealed|booster|packs?|box|tin|binder|sleeves?|\d+\s?x|x\s?\d+)\b/i;
const JAPANESE = /\b(japanese|japan|jpn|jp)\b/i;
const OTHER_LANG = /\b(japanese|japan|jpn|jp|korean|kr|chinese|french|german|italian|spanish|portuguese|thai|indonesian)\b/i;

// The card's number as it appears in titles: "232/091" → 232 (leading zeros
// optional), "SWSH262" → swsh262 (spaces ignored)
function hasNumber(title: string, cardNumber: string | null): boolean {
  const head = (cardNumber ?? "").split("/")[0].trim().toLowerCase();
  if (!head) return true;
  if (/^\d+$/.test(head)) {
    return new RegExp(`(^|[^0-9])0*${Number(head)}([^0-9]|$)`).test(title);
  }
  return title.toLowerCase().replace(/[\s-]+/g, "").includes(head.replace(/[\s-]+/g, ""));
}

// The first real word of the name ("Charizard ex (JP)" → charizard)
function hasName(title: string, name: string): boolean {
  const key = stripParens(name).toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).find((w) => w.length >= 3);
  return !key || title.toLowerCase().includes(key);
}

export function matchingListings(listings: AskingListing[], card: AskingCard): AskingListing[] {
  return listings.filter((l) =>
    Number.isFinite(l.price) && l.price > 0 &&
    hasNumber(l.title, card.cardNumber) &&
    hasName(l.title, card.name) &&
    !GRADED.test(l.title) &&
    !NOT_A_SINGLE.test(l.title) &&
    (card.lang === "ja" ? JAPANESE.test(l.title) : !OTHER_LANG.test(l.title)));
}

function estimateOf(rawPrices: number[]): AskingEstimate | null {
  const prices = iqrFilter(rawPrices);
  if (prices.length < MIN_LISTINGS) return null;
  return {
    price: Math.round(pctile(prices, 0.25) * 100) / 100,
    count: prices.length,
    low: prices[0],
    high: prices[prices.length - 1],
  };
}

// All matching listings as one pool
export function askingEstimate(listings: AskingListing[], card: AskingCard): AskingEstimate | null {
  return estimateOf(matchingListings(listings, card).map((l) => l.price));
}

// Near mint (and unstated) apart from played, plus all together
export type ConditionAsking = { nm: AskingEstimate | null; played: AskingEstimate | null; all: AskingEstimate | null };

export function conditionEstimates(listings: AskingListing[], card: AskingCard): ConditionAsking {
  const matched = matchingListings(listings, card);
  const played = matched.filter((l) => listingCondition(l) === "played");
  return {
    nm: estimateOf(matched.filter((l) => listingCondition(l) !== "played").map((l) => l.price)),
    played: estimateOf(played.map((l) => l.price)),
    all: estimateOf(matched.map((l) => l.price)),
  };
}

// The estimate for an item in this condition: near mint (or unknown) reads
// the NM pool, played conditions the played pool; either falls back to all
export function estimateFor(c: ConditionAsking, itemCondition: string | null | undefined): AskingEstimate | null {
  const played = !!itemCondition && !/^near mint$/i.test(itemCondition.trim());
  return (played ? c.played : c.nm) ?? c.all;
}

// What to search eBay for: the name without tags, the number, and
// "japanese" for Japanese cards
export function askingQuery(card: AskingCard): string {
  const name = stripParens(card.name).replace(/\s+-\s+[\w/-]+$/, "").trim();
  const num = (card.cardNumber ?? "").split("/")[0].trim();
  return [name, num, card.lang === "ja" ? "japanese" : ""].filter(Boolean).join(" ");
}
