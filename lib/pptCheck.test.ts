import { describe, expect, it } from "vitest";
import { shrink } from "./pptCheck";

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
