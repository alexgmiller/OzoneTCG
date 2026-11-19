import { describe, it, expect } from "vitest";
import {
  DEFAULT_SORT, SORT_FIELDS, flipSort, isSortKey, parseSort, sortDirLabel, sortForField, sortOrDefault, toSortKey,
} from "./sort";
import { defaultFilters } from "./inventoryView";
import type { SortKey } from "./types";

// Every key the app has ever stored (Settings → Display "Default sort" saves one)
const LEGACY_KEYS: readonly SortKey[] = [
  "date-desc", "date-asc", "name-asc", "name-desc", "market-desc", "market-asc",
  "cost-desc", "cost-asc", "sticker-desc", "sticker-asc", "days-desc", "days-asc",
];

describe("SortKey ↔ field + direction", () => {
  it("lists each field once", () => {
    const fields = SORT_FIELDS.map((f) => f.field);
    expect(new Set(fields).size).toBe(fields.length);
    expect(fields).toEqual(["date", "name", "market", "cost", "sticker", "days"]);
  });

  it("fields × directions are exactly the stored keys", () => {
    const built = SORT_FIELDS.flatMap((f) => [toSortKey(f.field, "desc"), toSortKey(f.field, "asc")]);
    expect([...built].sort()).toEqual([...LEGACY_KEYS].sort());
  });

  it("round-trips every stored key", () => {
    for (const k of LEGACY_KEYS) {
      const { field, dir } = parseSort(k);
      expect(toSortKey(field, dir)).toBe(k);
    }
    expect(parseSort("market-desc")).toEqual({ field: "market", dir: "desc" });
    expect(parseSort("name-asc")).toEqual({ field: "name", dir: "asc" });
  });

  it("unknown strings fall back to the default sort", () => {
    for (const junk of ["", "price-high", "date", "date-sideways", "date-desc-x", "best"]) {
      expect(isSortKey(junk)).toBe(false);
      expect(parseSort(junk)).toEqual({ field: "date", dir: "desc" });
    }
    expect(DEFAULT_SORT).toBe(defaultFilters.sort);
  });

  it("switching field starts at its natural direction", () => {
    expect(sortForField("date-asc", "name")).toBe("name-asc");
    expect(sortForField("name-asc", "date")).toBe("date-desc");
    expect(sortForField("date-desc", "market")).toBe("market-desc");
    expect(sortForField("date-desc", "cost")).toBe("cost-desc");
    expect(sortForField("date-desc", "sticker")).toBe("sticker-desc");
    expect(sortForField("date-desc", "days")).toBe("days-desc");
  });

  it("re-picking the current field keeps its direction", () => {
    expect(sortForField("date-asc", "date")).toBe("date-asc");
    expect(sortForField("name-desc", "name")).toBe("name-desc");
  });

  it("flipSort toggles the direction and keeps the field", () => {
    expect(flipSort("date-desc")).toBe("date-asc");
    expect(flipSort("name-asc")).toBe("name-desc");
    for (const k of LEGACY_KEYS) expect(flipSort(flipSort(k))).toBe(k);
  });

  it("describes the direction in words", () => {
    expect(sortDirLabel("date-desc")).toBe("Newest first");
    expect(sortDirLabel("date-asc")).toBe("Oldest first");
    expect(sortDirLabel("name-asc")).toBe("A to Z");
    expect(sortDirLabel("market-desc")).toBe("High to low");
    expect(sortDirLabel("days-desc")).toBe("Longest first");
  });
});

describe("sortOrDefault (Settings → Default sort)", () => {
  it("opens Inventory in the saved sort", () => {
    expect(sortOrDefault("market-desc")).toBe("market-desc");
    expect(sortOrDefault("name-asc")).toBe("name-asc");
  });
  it("falls back to newest first for a missing or unknown value", () => {
    expect(sortOrDefault(null)).toBe(DEFAULT_SORT);
    expect(sortOrDefault(undefined)).toBe(DEFAULT_SORT);
    expect(sortOrDefault("")).toBe(DEFAULT_SORT);
    expect(sortOrDefault("price_high")).toBe(DEFAULT_SORT);
  });
});
