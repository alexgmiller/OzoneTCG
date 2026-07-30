/**
 * Tests cover the deterministic text-parsing half of the OCR pipeline.
 * The canvas preprocessing and Tesseract worker are browser-only and are
 * exercised manually; everything below runs on plain strings.
 */
import { describe, expect, it } from "vitest";
import {
  calcConfidence,
  extractCardName,
  extractCardNumber,
  extractSetText,
} from "./ocrCardReader";

describe("extractCardNumber", () => {
  it("recognizes standard collector numbers", () => {
    expect(extractCardNumber("Charizard 004/165 Base Set")).toBe("004/165");
    expect(extractCardNumber("25/102")).toBe("25/102");
  });

  it("recognizes gallery / special subset numbers", () => {
    expect(extractCardNumber("Rayquaza TG01/TG30")).toBe("TG01/TG30");
    expect(extractCardNumber("Giratina GG05/GG70")).toBe("GG05/GG70");
    expect(extractCardNumber("Charizard RC05/RC32")).toBe("RC05/RC32");
  });

  it("recognizes promo codes", () => {
    expect(extractCardNumber("Pikachu SWSH001 Promo")).toBe("SWSH001");
    expect(extractCardNumber("Mew SV049")).toBe("SV049");
  });

  it("prefers a standard number over a promo code when both appear", () => {
    expect(extractCardNumber("SWSH001 ... 025/185")).toBe("025/185");
  });

  it("returns empty string when no number is present", () => {
    expect(extractCardNumber("Charizard Basic Fire")).toBe("");
    expect(extractCardNumber("")).toBe("");
  });
});

describe("extractCardName", () => {
  it("returns the first plausible name line", () => {
    expect(extractCardName(["Charizard"])).toBe("Charizard");
  });

  it("skips card UI boilerplate on the blocklist", () => {
    expect(extractCardName(["HP 120", "Charizard"])).toBe("Charizard");
    expect(extractCardName(["Basic", "Pikachu"])).toBe("Pikachu");
    expect(extractCardName(["Stage 1", "Weakness Fighting", "Blastoise"])).toBe("Blastoise");
  });

  it("requires a leading uppercase letter", () => {
    expect(extractCardName(["charizard"])).toBe("");
    expect(extractCardName(["charizard", "Charizard"])).toBe("Charizard");
  });

  it("rejects lines that are too short or too long", () => {
    expect(extractCardName(["A"])).toBe("");
    expect(extractCardName(["C".repeat(31)])).toBe("");
  });

  it("rejects lines that are mostly OCR noise", () => {
    expect(extractCardName(["X@#$%^&*()"])).toBe("");
  });

  it("rejects lines without a 3-letter alphabetic run", () => {
    expect(extractCardName(["Ab Cd"])).toBe("");
  });

  it("accepts hyphens, apostrophes and periods as part of a name", () => {
    expect(extractCardName(["Alakazam-EX"])).toBe("Alakazam-EX");
    expect(extractCardName(["Farfetch'd"])).toBe("Farfetch'd");
  });

  it("returns empty string when nothing qualifies", () => {
    expect(extractCardName([])).toBe("");
    expect(extractCardName(["hp", "energy", "retreat"])).toBe("");
  });

  it("picks the name out of a realistic OCR line dump", () => {
    const lines = [
      "Basic",
      "HP 70",
      "Pikachu",
      "Ability Static",
      "Weakness Fighting x2",
      "058/198",
    ];
    expect(extractCardName(lines)).toBe("Pikachu");
  });
});

describe("extractSetText", () => {
  it("pulls the set hint off the line holding the card number", () => {
    expect(extractSetText(["025/185 SWSH Vivid Voltage"], "025/185")).toBe("SWSH Vivid Voltage");
  });

  it("returns empty string when there is no card number to anchor on", () => {
    expect(extractSetText(["Vivid Voltage"], "")).toBe("");
  });

  it("returns empty string when the number line has no other words", () => {
    expect(extractSetText(["025/185"], "025/185")).toBe("");
  });

  it("ignores lines that do not contain the card number", () => {
    expect(extractSetText(["Charizard", "004/165 Base Set"], "004/165")).toBe("Base Set");
  });

  it("drops single-character fragments", () => {
    expect(extractSetText(["004/165 A Base Set"], "004/165")).toBe("Base Set");
  });

  it("returns empty string when the number appears on no line", () => {
    expect(extractSetText(["Charizard", "Base Set"], "004/165")).toBe("");
  });
});

describe("calcConfidence", () => {
  it("scores highest when every field was extracted", () => {
    // fieldScore 0.9 × 0.6 + 1.0 × 0.4
    expect(calcConfidence("Pikachu", "025/185", "Vivid Voltage", 100)).toBeCloseTo(0.94, 5);
  });

  it("weights the name most heavily among fields", () => {
    const nameOnly = calcConfidence("Pikachu", "", "", 0);
    const numberOnly = calcConfidence("", "025/185", "", 0);
    const setOnly = calcConfidence("", "", "Vivid Voltage", 0);
    expect(nameOnly).toBeGreaterThan(numberOnly);
    expect(numberOnly).toBeGreaterThan(setOnly);
  });

  it("blends field score with Tesseract's own confidence", () => {
    // 0.5 × 0.6 + 0.5 × 0.4
    expect(calcConfidence("Pikachu", "", "", 50)).toBeCloseTo(0.5, 5);
  });

  it("heavily discounts confidence when no fields were extracted", () => {
    // Tesseract may be confident about text that isn't card data at all.
    expect(calcConfidence("", "", "", 90)).toBeCloseTo(0.27, 5);
  });

  it("returns zero when nothing was found and OCR had no confidence", () => {
    expect(calcConfidence("", "", "", 0)).toBe(0);
  });

  it("never exceeds the 0.99 ceiling", () => {
    expect(calcConfidence("Pikachu", "025/185", "Vivid Voltage", 100)).toBeLessThanOrEqual(0.99);
  });
});
