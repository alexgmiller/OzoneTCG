/**
 * Covers the deterministic half of the scraper: query construction, relevance
 * keyword extraction, and DOM parsing against fixture HTML shaped like eBay's
 * completed-items page. The network fetch itself is not exercised here.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildQuery,
  extractRelevanceKeywords,
  parseCompletedHtml,
} from "./ebay-completed-scraper";

beforeEach(() => {
  // The scraper logs heavily for production debugging; keep test output clean.
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("buildQuery", () => {
  it("combines grading company, grade, name and card number", () => {
    expect(buildQuery("PSA", "10", "Charizard", "004/165")).toBe("PSA 10 Charizard 004");
  });

  it("uses only the numerator of a fractional card number", () => {
    expect(buildQuery("PSA", "10", "Pikachu", "058/198")).toBe("PSA 10 Pikachu 058");
  });

  it("omits the card number when none is supplied", () => {
    expect(buildQuery("BGS", "9.5", "Blastoise")).toBe("BGS 9.5 Blastoise");
    expect(buildQuery("BGS", "9.5", "Blastoise", null)).toBe("BGS 9.5 Blastoise");
  });

  it("strips language codes from the card name", () => {
    expect(buildQuery("PSA", "10", "Pikachu (JP)")).toBe("PSA 10 Pikachu");
    expect(buildQuery("PSA", "10", "Pikachu (ENG)")).toBe("PSA 10 Pikachu");
  });

  it("strips rarity descriptor tags", () => {
    expect(buildQuery("PSA", "10", "Charizard (Secret Rare)")).toBe("PSA 10 Charizard");
    expect(buildQuery("PSA", "10", "Mew (Full Art)")).toBe("PSA 10 Mew");
    expect(buildQuery("PSA", "10", "Umbreon (Illustration Rare)")).toBe("PSA 10 Umbreon");
  });

  it("replaces ampersands, which confuse URL parsing", () => {
    expect(buildQuery("PSA", "10", "Togepi & Cleffa & Igglybuff GX")).toBe(
      "PSA 10 Togepi Cleffa Igglybuff GX"
    );
  });

  it("collapses the whitespace left behind by stripping", () => {
    expect(buildQuery("PSA", "10", "Charizard  (Secret)   VMAX")).toBe("PSA 10 Charizard VMAX");
  });
});

describe("extractRelevanceKeywords", () => {
  it("returns the distinctive words of a card name", () => {
    expect(extractRelevanceKeywords("Charizard VMAX")).toEqual(["charizard"]);
  });

  it("returns at most two keywords", () => {
    expect(extractRelevanceKeywords("Togepi & Cleffa & Igglybuff GX")).toEqual([
      "togepi",
      "cleffa",
    ]);
  });

  it("drops generic card-type terms so they cannot act as keywords", () => {
    // Every word here is either a stop word or too short to be distinctive.
    expect(extractRelevanceKeywords("Mew ex Full Art Promo")).toEqual([]);
  });

  it("keeps the distinctive word alongside generic ones", () => {
    expect(extractRelevanceKeywords("Charizard Full Art")).toEqual(["charizard"]);
  });

  it("ignores card-type suffixes but keeps the Pokemon name", () => {
    expect(extractRelevanceKeywords("Zacian V")).toEqual(["zacian"]);
    expect(extractRelevanceKeywords("Eternatus VMAX")).toEqual(["eternatus"]);
  });

  it("yields no keywords when the name is too short to be distinctive", () => {
    // 3-letter names fall below the length cutoff, so relevance filtering
    // degrades to grade-only matching rather than over-filtering.
    expect(extractRelevanceKeywords("Mew GX")).toEqual([]);
  });

  it("lowercases its output", () => {
    expect(extractRelevanceKeywords("BLASTOISE")).toEqual(["blastoise"]);
  });

  it("returns an empty list for an empty name", () => {
    expect(extractRelevanceKeywords("")).toEqual([]);
  });
});

// ── Fixture helpers ──────────────────────────────────────────────────────────

/** Build one sold-listing card in the shape the live eBay page emits. */
function soldCard(opts: {
  title: string;
  price: string;
  soldDate?: string;
  href?: string;
  saleType?: string;
}) {
  const {
    title,
    price,
    soldDate = "Apr 3, 2026",
    href = "https://www.ebay.com/itm/123456789012?hash=abc",
    saleType = "Buy It Now",
  } = opts;
  return `
    <div class="su-card-container__content">
      <span aria-label="Sold Item">Sold  ${soldDate}</span>
      <a class="s-card__link" href="${href}"></a>
      <div class="s-card__title"><span>${title}</span></div>
      <div class="s-card__price">${price}</div>
      <div class="su-card-container__attributes">
        <span class="su-styled-text secondary">${saleType}</span>
      </div>
    </div>`;
}

const FALLBACK_URL = "https://www.ebay.com/sch/i.html?_nkw=test";

function parse(html: string, name = "Charizard", company = "PSA", grade = "10") {
  return parseCompletedHtml(html, "q", name, company, grade, FALLBACK_URL);
}

describe("parseCompletedHtml — extraction", () => {
  it("pulls price, title, sold date and item URL from a listing", () => {
    const sales = parse(soldCard({ title: "PSA 10 Charizard Base Set", price: "$486.91" }));
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({
      price: 486.91,
      title: "PSA 10 Charizard Base Set",
      soldDate: "Apr 3, 2026",
      itemUrl: "https://www.ebay.com/itm/123456789012",
    });
  });

  it("strips the 'Sold' prefix from the date", () => {
    const sales = parse(soldCard({ title: "PSA 10 Charizard", price: "$10", soldDate: "Jan 9, 2026" }));
    expect(sales[0].soldDate).toBe("Jan 9, 2026");
  });

  it("strips currency formatting from the price", () => {
    const sales = parse(soldCard({ title: "PSA 10 Charizard", price: "$1,234.56" }));
    expect(sales[0].price).toBe(1234.56);
  });

  it("normalises the item URL to its canonical /itm/{id} form", () => {
    const sales = parse(
      soldCard({
        title: "PSA 10 Charizard",
        price: "$10",
        href: "https://www.ebay.com/itm/999888777666?_trkparms=junk&amp;hash=x",
      })
    );
    expect(sales[0].itemUrl).toBe("https://www.ebay.com/itm/999888777666");
  });

  it("falls back to the search URL when no /itm/ link is present", () => {
    const sales = parse(
      soldCard({ title: "PSA 10 Charizard", price: "$10", href: "https://www.ebay.com/p/12345" })
    );
    expect(sales[0].itemUrl).toBe(FALLBACK_URL);
  });

  it("skips cards with no parseable price", () => {
    expect(parse(soldCard({ title: "PSA 10 Charizard", price: "Best offer" }))).toHaveLength(0);
  });

  it("ignores cards without a Sold Item label", () => {
    const activeCard = `
      <div class="su-card-container__content">
        <a class="s-card__link" href="https://www.ebay.com/itm/111222333444"></a>
        <div class="s-card__title"><span>PSA 10 Charizard</span></div>
        <div class="s-card__price">$500.00</div>
      </div>`;
    expect(parse(activeCard)).toHaveLength(0);
  });

  it("returns nothing for an empty or unrecognised page", () => {
    expect(parse("")).toEqual([]);
    expect(parse("<html><body>no results</body></html>")).toEqual([]);
  });
});

describe("parseCompletedHtml — sale type detection", () => {
  it("marks bid counts as auctions", () => {
    const sales = parse(soldCard({ title: "PSA 10 Charizard", price: "$10", saleType: "12 bids" }));
    expect(sales[0].buyingOptions).toEqual(["AUCTION"]);
    expect(sales[0].isBestOffer).toBe(false);
  });

  it("marks accepted best offers so callers can exclude unknown prices", () => {
    const sales = parse(
      soldCard({ title: "PSA 10 Charizard", price: "$10", saleType: "Best offer accepted" })
    );
    expect(sales[0].isBestOffer).toBe(true);
    expect(sales[0].buyingOptions).toEqual(["FIXED_PRICE", "BEST_OFFER"]);
  });

  it("treats everything else as a fixed-price sale", () => {
    const sales = parse(soldCard({ title: "PSA 10 Charizard", price: "$10", saleType: "Buy It Now" }));
    expect(sales[0].buyingOptions).toEqual(["FIXED_PRICE"]);
    expect(sales[0].isBestOffer).toBe(false);
  });
});

describe("parseCompletedHtml — relevance filtering", () => {
  it("keeps listings matching both the card keyword and the grade", () => {
    const sales = parse(soldCard({ title: "PSA 10 Charizard Base Set Holo", price: "$500" }));
    expect(sales).toHaveLength(1);
  });

  it("drops listings for a different card", () => {
    const sales = parse(soldCard({ title: "PSA 10 Blastoise Base Set", price: "$500" }));
    expect(sales).toHaveLength(0);
  });

  it("drops listings with the wrong grade", () => {
    const sales = parse(soldCard({ title: "PSA 9 Charizard Base Set", price: "$500" }));
    expect(sales).toHaveLength(0);
  });

  it("drops ungraded listings that would deflate the average", () => {
    const sales = parse(soldCard({ title: "Charizard Base Set Raw", price: "$50" }));
    expect(sales).toHaveLength(0);
  });

  it("filters a mixed page down to only the relevant sales", () => {
    const html = [
      soldCard({ title: "PSA 10 Charizard Base Set", price: "$500" }),
      soldCard({ title: "PSA 9 Charizard Base Set", price: "$200" }),
      soldCard({ title: "PSA 10 Blastoise Base Set", price: "$300" }),
      soldCard({ title: "PSA 10 Charizard Shadowless", price: "$600" }),
    ].join("");
    const sales = parse(html);
    expect(sales.map((s) => s.price)).toEqual([500, 600]);
  });

  it("matches the grade case-insensitively", () => {
    const sales = parse(soldCard({ title: "psa 10 charizard base set", price: "$500" }));
    expect(sales).toHaveLength(1);
  });

  it("keeps everything when the name yields no usable keywords", () => {
    // "Mew GX" reduces to no keywords, so only the grade gate applies.
    const sales = parse(soldCard({ title: "PSA 10 Anything At All", price: "$10" }), "Mew GX");
    expect(sales).toHaveLength(1);
  });

  it("does not leak the internal debug field into results", () => {
    const sales = parse(soldCard({ title: "PSA 10 Charizard", price: "$10" }));
    expect(sales[0]).not.toHaveProperty("_debug");
  });
});
