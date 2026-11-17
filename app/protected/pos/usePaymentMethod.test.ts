import { describe, it, expect } from "vitest";
import { storedMethod } from "./usePaymentMethod";

describe("storedMethod", () => {
  it("uses the stored method when it is a known one", () => {
    expect(storedMethod("buy", "venmo")).toBe("venmo");
    expect(storedMethod("sell", "zelle")).toBe("zelle");
  });
  it("falls back to Cash, or Trade for trades, when nothing usable is stored", () => {
    expect(storedMethod("buy", null)).toBe("cash");
    expect(storedMethod("sell", "bitcoin")).toBe("cash");
    expect(storedMethod("trade", null)).toBe("trade");
    expect(storedMethod("trade", "")).toBe("trade");
  });
});
