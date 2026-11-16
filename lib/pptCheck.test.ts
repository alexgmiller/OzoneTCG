import { describe, expect, it } from "vitest";
import { pptCheckParams, shrink } from "./pptCheck";

describe("pptCheckParams", () => {
  it("asks for Japanese cards in Japanese", () => {
    expect(pptCheckParams(598363, "ja").get("language")).toBe("japanese");
  });
  it("leaves English to the default and skips history", () => {
    const p = pptCheckParams(517045, "en");
    expect(p.has("language")).toBe(false);
    expect(p.has("includeHistory")).toBe(false);
    expect(p.get("includeEbay")).toBe("true");
  });
});

describe("shrink", () => {
  it("keeps the first array items, counts the rest, and cuts long strings", () => {
    expect(shrink({ a: [1, 2, 3, 4], s: "x".repeat(130), n: null })).toEqual({
      a: [1, 2, "…4 items"],
      s: `${"x".repeat(120)}…`,
      n: null,
    });
  });
  it("stops deep nesting", () => {
    expect(shrink({ a: { b: { c: { d: { e: { f: { g: 1 } } } } } } })).toEqual({ a: { b: { c: { d: { e: { f: "{…}" } } } } } });
  });
});
