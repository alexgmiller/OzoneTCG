export type Category = "single" | "slab" | "sealed";
export type Owner = "alex" | "mila" | "shared" | "consigner";
export type Status = "inventory" | "grading";
export type Condition = "Near Mint" | "Lightly Played" | "Moderately Played" | "Heavily Played" | "Damaged";
export type SortKey =
  | "date-desc" | "date-asc"
  | "name-asc"  | "name-desc"
  | "market-desc" | "market-asc"
  | "cost-desc"   | "cost-asc"
  | "fmv-desc"    | "fmv-asc"
  | "margin-desc" | "margin-asc"
  | "movement-desc" | "movement-asc";

export type ConsignerOption = { id: string; name: string; rate: number };

export type Item = {
  id: string;
  name: string;
  category: Category;
  owner: Owner;
  status: Status;
  market: number | null;
  cost: number | null;
  condition: Condition;
  notes: string | null;
  created_at: string;
  consigner_id: string | null;
  image_url: string | null;
  set_name: string | null;
  card_number: string | null;
  grade: string | null;
  cost_basis: number | null;
  buy_percentage: number | null;
  acquisition_type: string | null;
  chain_depth: number;
  original_cash_invested: number | null;
  sticker_price: number | null;
  acquired_market_price: number | null;
  acquired_date: string | null;
  // Sealed product metadata
  product_type: string | null;
  quantity: number;
  language: string;
};

export type ItemForm = {
  category: Category;
  owner: Owner;
  status: Status;
  name: string;
  condition: Condition;
  cost: string;
  market: string;
  buyPct: string; // helper: auto-fill cost from market price
  notes: string;
  consignerId: string;
  imageUrl: string;
  cardId: string;
  setName: string;
  cardNumber: string;
  grade: string;
  stickerPrice: string;
  // Sealed product metadata
  productType: string;
  quantity: string;
  language: string;
};

export type StagedItem = ItemForm & { _id: string };

// PSA 10 eBay price lookup state per grading item
export type Psa10Entry = { medianPrice: number | null; count: number; loading: boolean; fetched: boolean; rateLimited?: boolean };
