// ── Shared types for Show Mode (ShowClient + extracted components) ───────────

export type GradeCompany = "PSA" | "BGS" | "CGC" | "TAG";

// ── Sort + price-range filter ─────────────────────────────────────────────────

export type SortBy = "name" | "price-high" | "price-low" | "recent";
export type PriceRange = "all" | "under25" | "25to100" | "100to500" | "over500";

// ── FeedEntry ─────────────────────────────────────────────────────────────────

export type FeedEntry = {
  id: string;
  kind: "buy" | "sell" | "pass" | "trade" | "expense";
  time: string;
  label: string;
  sub?: string;
  amount: number | null;
  photoUrl?: string | null;
  batchId?: string | null;
  pending?: boolean;
};

// ── Trade tab types ───────────────────────────────────────────────────────────

export type TradeComingIn = { _id: string; name: string; grade: string; marketPrice: string };

// ── Deal tab types ────────────────────────────────────────────────────────────

export type DealCard = {
  _id: string;
  name: string;
  grade: string;
  condition: string;
  marketPrice: number | null;
  buyPrice: number | null;
  image_url: string | null;
  set_name: string | null;
  card_number: string | null;
  disposition: "undecided" | "cash" | "trade";
  certData?: { company: string; certNumber: string } | null;
};

export type DealStep = "evaluate" | "quote" | "fulfill" | "complete";

// ── Buy tab (batch mode) ──────────────────────────────────────────────────────

export type StagedBuy = {
  _id: string;
  name: string;
  category: "single" | "slab" | "sealed";
  condition: string;
  grade: string | null;
  market: number | null;
  cost: number;
  buy_pct: number;
  owner: "alex" | "mila" | "shared";
  set_name: string | null;
  card_number: string | null;
  image_url: string | null;
};
