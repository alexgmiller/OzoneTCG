export type ScannedCardMatch = {
  matchedName: string;
  matchedSetName: string;
  matchedCardNumber: string;
  matchedImageUrl: string | null;
  matchedMarket: number | null;
  matchedCardId: string;
};

export type OcrMatchResult = {
  bestMatch: ScannedCardMatch | null;
  confidence: "high" | "medium" | "low";
};
