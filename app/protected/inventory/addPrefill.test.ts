import { describe, expect, it } from "vitest";
import { addToInventoryHref, parseAddPrefill, type AddPrefill } from "./addPrefill";

const card: AddPrefill = {
  name: "Mew ex", setName: "Paldean Fates", cardNumber: "232",
  imageUrl: "https://assets.tcgdex.net/en/sv/sv04.5/232/high.webp", cardId: "sv04.5-232", market: 814.25,
};

describe("add-to-inventory links", () => {
  it("round-trips a card through the URL", () => {
    const href = addToInventoryHref(card);
    expect(href.startsWith("/protected/inventory?add=1&")).toBe(true);
    const params = Object.fromEntries(new URL(href, "https://x").searchParams);
    expect(parseAddPrefill(params)).toEqual(card);
  });

  it("leaves out what the card doesn't have", () => {
    const href = addToInventoryHref({ name: "Pikachu", setName: null, cardNumber: null, imageUrl: null, cardId: null, market: null });
    expect(href).toBe("/protected/inventory?add=1&name=Pikachu");
  });

  it("ignores requests without add=1 or a name, and non-https images", () => {
    expect(parseAddPrefill({ name: "Mew" })).toBeNull();
    expect(parseAddPrefill({ add: "1" })).toBeNull();
    expect(parseAddPrefill({ add: "1", name: "Mew", image: "javascript:alert(1)" })?.imageUrl).toBeNull();
    expect(parseAddPrefill({ add: "1", name: "Mew", market: "abc" })?.market).toBeNull();
  });
});
