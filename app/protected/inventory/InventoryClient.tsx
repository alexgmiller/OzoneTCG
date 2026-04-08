"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { subscribeWorkspaceTable } from "@/lib/supabase/realtime";
import { createItem, createItems, deleteItem, deleteItems, updateItem, markItemsAsSold, massUpdateItems, refreshItemPrice, fetchCardData, uploadCardImage, uploadItemImage, refreshSlabPrice, getEbayDailyCallCount, refreshRawCardPrice, type RefreshedSlabPrice, type RefreshedRawCardPrice } from "./actions";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { SlabPrice, RawCardPrice } from "./InventoryServer";
import { makeSlabPriceKey, parseGrade, type SlabSale } from "@/lib/ebay";
import { makeRawCardPriceKey, priceForCondition } from "@/lib/justtcg";
import CSVImport from "./CSVImport";
import CardScanner, { type ScanResult } from "@/components/CardScanner";
import CardSearchPicker, { type CardSearchResult } from "@/components/CardSearchPicker";
import CardAutocomplete, { type AutocompleteCard } from "@/components/CardAutocomplete";
import CardImage from "@/components/CardImage";

type Category = "single" | "slab" | "sealed";
type Owner = "alex" | "mila" | "shared" | "consigner";
type Status = "inventory" | "grading";
type Condition = "Near Mint" | "Lightly Played" | "Moderately Played" | "Heavily Played" | "Damaged";
type SortKey =
  | "date-desc" | "date-asc"
  | "name-asc"  | "name-desc"
  | "market-desc" | "market-asc"
  | "cost-desc"   | "cost-asc"
  | "fmv-desc"    | "fmv-asc"
  | "margin-desc" | "margin-asc";

type ConsignerOption = { id: string; name: string; rate: number };

type Item = {
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
};

type ItemForm = {
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
};

type StagedItem = ItemForm & { _id: string };

function toNum(v: string) {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function fmt(v: number | null) {
  if (v == null) return "-";
  return `$${v.toFixed(2)}`;
}

function buildSlabEbayQuery(name: string, grade: string | null, setName: string | null, cardNumber: string | null): string {
  const cleanName = name.replace(/\b(JP|JPN|EN|ENG|Japanese|English)\b\s*/gi, "").trim();
  const num = cardNumber?.split("/")[0]?.trim() ?? "";
  return [grade, cleanName, setName, num].filter(Boolean).join(" ");
}

function buildRawEbayQuery(name: string, setName: string | null, cardNumber: string | null): string {
  const cleanName = name.replace(/\b(JP|JPN|EN|ENG|Japanese|English)\b\s*/gi, "").trim();
  const num = cardNumber?.split("/")[0]?.trim() ?? "";
  return [cleanName, setName, num].filter(Boolean).join(" ");
}

const categoryColors: Record<string, string> = {
  single: "bg-blue-100 text-blue-800",
  slab: "bg-purple-100 text-purple-800",
  sealed: "bg-teal-100 text-teal-800",
};

function gradeStyle(grade: string): string {
  const parsed = parseGrade(grade);
  if (!parsed) return "bg-purple-100 border border-purple-400 text-purple-800";
  const n = parseFloat(parsed.grade);
  if (parsed.grade.toLowerCase().includes("black") || n >= 9.5)
    return "bg-yellow-100 border border-yellow-400 text-yellow-800 font-bold";
  if (n >= 9)  return "bg-emerald-100 border border-emerald-400 text-emerald-800 font-semibold";
  if (n >= 7)  return "bg-blue-100 border border-blue-400 text-blue-800";
  if (n >= 5)  return "bg-orange-100 border border-orange-400 text-orange-800";
  return "bg-red-100 border border-red-400 text-red-800";
}

// ── Staleness tiers ────────────────────────────────────────────────────────
const TIER_2H = 2 * 60 * 60 * 1000;
const TIER_4H = 4 * 60 * 60 * 1000;
const TIER_8H = 8 * 60 * 60 * 1000;
const EBAY_DAILY_BUDGET = 5000;
const EBAY_BUDGET_WARN_PCT = 0.8;

function getSlabTierMs(fmv: number | null, compCount: number): number {
  if (compCount < 3) return TIER_2H;       // low confidence → 2h
  if (fmv == null)   return TIER_2H;       // no data → treat as 2h (will be highest priority)
  if (fmv > 200)     return TIER_2H;       // high value → 2h
  if (fmv >= 50)     return TIER_4H;       // medium value → 4h
  return TIER_8H;                          // low value → 8h
}

function isSlabTierStale(sp: SlabPrice | null | undefined, fmv: number | null): boolean {
  if (!sp?.last_updated) return true;      // no cached data at all
  const compCount = sp.sold_count > 0 ? sp.sold_count : sp.comp_count;
  return Date.now() - new Date(sp.last_updated).getTime() > getSlabTierMs(fmv, compCount);
}

const blankForm = (): ItemForm => ({
  category: "single",
  owner: "shared",
  status: "inventory",
  name: "",
  condition: "Near Mint",
  cost: "",
  market: "",
  buyPct: "",
  notes: "",
  consignerId: "",
  imageUrl: "",
  cardId: "",
  setName: "",
  cardNumber: "",
  grade: "",
});

function itemToForm(it: Item): ItemForm {
  return {
    category: it.category,
    owner: it.owner,
    status: it.status,
    name: it.name,
    condition: it.condition,
    cost: it.cost != null ? String(it.cost) : "",
    market: it.market != null ? String(it.market) : "",
    buyPct: it.buy_percentage != null ? String(it.buy_percentage) : "",
    notes: it.notes ?? "",
    consignerId: it.consigner_id ?? "",
    imageUrl: it.image_url ?? "",
    cardId: "",
    setName: it.set_name ?? "",
    cardNumber: it.card_number ?? "",
    grade: it.grade ?? "",
  };
}

function ItemFormFields({
  form,
  setForm,
  consigners,
  onFind,
  finding,
  findConfirmed,
  findError,
}: {
  form: ItemForm;
  setForm: (f: ItemForm) => void;
  consigners: ConsignerOption[];
  onFind?: () => void;
  finding?: boolean;
  findConfirmed?: string | null;
  findError?: string | null;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (form.cardId) fd.append("cardId", form.cardId);
      if (form.name) fd.append("name", form.name);
      if (form.cardNumber) fd.append("cardNumber", form.cardNumber);
      const url = await uploadCardImage(fd);
      setForm({ ...form, imageUrl: url });
    } catch {
      // silent — user can retry
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <select
          className="border rounded-lg px-3 py-2 text-sm bg-background"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
        >
          <option value="single">Single</option>
          <option value="slab">Slab</option>
          <option value="sealed">Sealed</option>
        </select>

        <select
          className="border rounded-lg px-3 py-2 text-sm bg-background"
          value={form.owner === "consigner" && form.consignerId ? `consigner:${form.consignerId}` : form.owner}
          onChange={(e) => {
            const v = e.target.value;
            if (v.startsWith("consigner:")) {
              setForm({ ...form, owner: "consigner", consignerId: v.slice("consigner:".length) });
            } else {
              setForm({ ...form, owner: v as Owner, consignerId: "" });
            }
          }}
        >
          <option value="shared">Shared</option>
          <option value="alex">Alex</option>
          <option value="mila">Mila</option>
          {consigners.length > 0 && (
            <optgroup label="Consigners">
              {consigners.map((c) => (
                <option key={c.id} value={`consigner:${c.id}`}>
                  {c.name} ({Math.round(c.rate * 100)}%)
                </option>
              ))}
            </optgroup>
          )}
        </select>

        <select
          className="border rounded-lg px-3 py-2 text-sm bg-background"
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value as Status })}
        >
          <option value="inventory">Inventory</option>
          {form.category === "single" && <option value="grading">Grading</option>}
        </select>

        {/* Condition for singles/sealed; PSA grade for slabs */}
        {form.category === "slab" ? (
          <select
            className="border rounded-lg px-3 py-2 text-sm bg-background"
            value={form.grade}
            onChange={(e) => setForm({ ...form, grade: e.target.value })}
          >
            <option value="">— Grade —</option>
            <optgroup label="PSA">
              {[10,9,8,7,6,5,4,3,2,1].map((n) => (
                <option key={`PSA ${n}`} value={`PSA ${n}`}>PSA {n}</option>
              ))}
            </optgroup>
            <optgroup label="BGS">
              {["10 Black Label", 10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1].map((g) => (
                <option key={`BGS ${g}`} value={`BGS ${g}`}>BGS {g}</option>
              ))}
            </optgroup>
            <optgroup label="CGC">
              {[10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1].map((g) => (
                <option key={`CGC ${g}`} value={`CGC ${g}`}>CGC {g}</option>
              ))}
            </optgroup>
            <optgroup label="ACE">
              {[10,9,8,7,6,5,4,3,2,1].map((n) => (
                <option key={`ACE ${n}`} value={`ACE ${n}`}>ACE {n}</option>
              ))}
            </optgroup>
            <optgroup label="TAG">
              {[10, 9.5, 9, 8.5, 8, 7, 6, 5].map((g) => (
                <option key={`TAG ${g}`} value={`TAG ${g}`}>TAG {g}</option>
              ))}
            </optgroup>
          </select>
        ) : (
          <select
            className="border rounded-lg px-3 py-2 text-sm bg-background"
            value={form.condition}
            onChange={(e) => setForm({ ...form, condition: e.target.value as Condition })}
          >
            <option value="Near Mint">Near Mint</option>
            <option value="Lightly Played">Lightly Played</option>
            <option value="Moderately Played">Moderately Played</option>
            <option value="Heavily Played">Heavily Played</option>
            <option value="Damaged">Damaged</option>
          </select>
        )}
      </div>

      {/* Card identification — name + set + number + Find */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <CardAutocomplete
            className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background"
            placeholder="Name *"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
            onSelect={(card: AutocompleteCard) => {
              setForm({
                ...form,
                name: card.name,
                setName: card.setName ?? "",
                cardNumber: card.cardNumber ?? "",
                imageUrl: card.imageUrl ?? "",
                cardId: card.cardId ?? "",
                ...(card.market != null ? { market: String(card.market) } : {}),
              });
            }}
          />
          {onFind && (
            <button
              type="button"
              onClick={onFind}
              className="px-3 py-2 rounded-lg border text-sm font-medium hover:bg-muted transition-colors whitespace-nowrap"
            >
              Find Card
            </button>
          )}
        </div>
        {onFind && (
          <div className="grid grid-cols-2 gap-2">
            <input
              className="border rounded-lg px-3 py-2 text-sm bg-background"
              placeholder="Set name (optional)"
              value={form.setName}
              onChange={(e) => setForm({ ...form, setName: e.target.value })}
            />
            <input
              className="border rounded-lg px-3 py-2 text-sm bg-background"
              placeholder="Card # (optional)"
              value={form.cardNumber}
              onChange={(e) => setForm({ ...form, cardNumber: e.target.value })}
            />
          </div>
        )}
        {findConfirmed && (
          <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
            <span className="font-medium">✓</span>
            <span className="truncate">{findConfirmed}</span>
          </div>
        )}
        {findError && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
            {findError}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input
          className="border rounded-lg px-3 py-2 text-sm bg-background"
          placeholder="Market"
          value={form.market}
          inputMode="decimal"
          onChange={(e) => {
            const market = e.target.value;
            const pct = Number(form.buyPct);
            const mkt = Number(market);
            const newCost = form.buyPct && pct > 0 && mkt > 0 ? String(((mkt * pct) / 100).toFixed(2)) : form.cost;
            setForm({ ...form, market, cost: newCost });
          }}
        />
        <div className="relative">
          <input
            className="border rounded-lg px-3 py-2 text-sm bg-background w-full pr-7"
            placeholder="Buy %"
            value={form.buyPct}
            inputMode="decimal"
            onChange={(e) => {
              const buyPct = e.target.value;
              const pct = Number(buyPct);
              const mkt = Number(form.market);
              const newCost = buyPct && pct > 0 && mkt > 0 ? String(((mkt * pct) / 100).toFixed(2)) : form.cost;
              setForm({ ...form, buyPct, cost: newCost });
            }}
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs opacity-30 pointer-events-none">%</span>
        </div>
        <input
          className="border rounded-lg px-3 py-2 text-sm bg-background col-span-2"
          placeholder={form.buyPct && form.market ? `Cost (auto: ${form.cost || "—"})` : "Cost"}
          value={form.cost}
          inputMode="decimal"
          onChange={(e) => setForm({ ...form, cost: e.target.value, buyPct: "" })}
        />
      </div>

      <textarea
        className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
        placeholder="Notes"
        rows={2}
        value={form.notes}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
      />

      {/* Image — show found image prominently, fallback to URL input + upload */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
      {form.imageUrl ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={form.imageUrl} alt="preview" className="h-32 w-auto rounded-lg border object-contain flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              placeholder="Image URL"
              value={form.imageUrl ?? ""}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            />
            <div className="flex gap-3">
              <button
                type="button"
                className="text-xs text-muted-foreground underline disabled:opacity-40"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
              >
                {uploadingImage ? "Uploading…" : "Replace photo"}
              </button>
              <button
                type="button"
                className="text-xs text-red-500 underline"
                onClick={() => setForm({ ...form, imageUrl: "" })}
              >
                Remove image
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
            placeholder="Image URL (or use Find / Scan to auto-fill)"
            value={form.imageUrl ?? ""}
            onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
          />
          <button
            type="button"
            className="text-xs text-muted-foreground underline disabled:opacity-40"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingImage}
          >
            {uploadingImage ? "Uploading…" : "Upload photo"}
          </button>
        </div>
      )}
    </div>
  );
}

function nullLast(a: number | null, b: number | null, asc: boolean): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return asc ? a - b : b - a;
}

export default function InventoryClient({
  items,
  consigners,
  workspaceId,
  slabPrices,
  rawCardPrices,
}: {
  items: Item[];
  consigners: ConsignerOption[];
  workspaceId: string;
  slabPrices: Record<string, SlabPrice>;
  rawCardPrices: Record<string, RawCardPrice>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Background auto-refresh
  type BgStatus = "idle" | "running" | "done" | "rate_limited";
  const [bgStatus, setBgStatus] = useState<BgStatus>("idle");
  const [bgStaleCount, setBgStaleCount] = useState(0);
  const [dailyCallCount, setDailyCallCount] = useState(0);
  const bgRef = useRef<{ paused: boolean; aborted: boolean }>({ paused: false, aborted: false });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [cardSearchOpen, setCardSearchOpen] = useState(false);
  const [editImagePickerOpen, setEditImagePickerOpen] = useState(false);

  // Inline find state (for the add form)
  const [findBusy, setFindBusy] = useState(false);
  const [findConfirmed, setFindConfirmed] = useState<string | null>(null);
  const [findError, setFindError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // PSA 10 eBay price lookup state per grading item
  type Psa10Entry = { medianPrice: number | null; count: number; loading: boolean; fetched: boolean; rateLimited?: boolean };
  const [psa10Data, setPsa10Data] = useState<Record<string, Psa10Entry>>({});

  // Slab pricing refresh state per inventory slab
  const [slabRefreshing, setSlabRefreshing] = useState<Record<string, boolean>>({});
  const [slabRateLimited, setSlabRateLimited] = useState<Record<string, boolean>>({});

  // Inline cost editing
  const [inlineCostId, setInlineCostId] = useState<string | null>(null);
  const [inlineCostVal, setInlineCostVal] = useState("");

  // Pricing detail modal — store item + slabKey; derive sp live from slabPrices prop so refresh updates it
  const [pricingDetailItem, setPricingDetailItem] = useState<{ item: Item; slabKey: string } | null>(null);
  const [soldExpanded, setSoldExpanded] = useState(false);

  // Raw card pricing state
  const [rawCardRefreshing, setRawCardRefreshing] = useState<Record<string, boolean>>({});
  const [rawCardPriceOverrides, setRawCardPriceOverrides] = useState<Record<string, RawCardPrice>>({});
  const mergedRawCardPrices = useMemo(
    () => ({ ...rawCardPrices, ...rawCardPriceOverrides }),
    [rawCardPrices, rawCardPriceOverrides]
  );
  const [rawCardDetailItem, setRawCardDetailItem] = useState<Item | null>(null);
  const [historyDuration, setHistoryDuration] = useState<"7d" | "30d" | "90d" | "180d">("90d");

  // Collapsible section state
  const [slabsCollapsed, setSlabsCollapsed] = useState(false);
  const [rawCollapsed, setRawCollapsed] = useState(false);

  // Quick filter pills
  const [filterNoPrice, setFilterNoPrice] = useState(false);
  const [filterNoCost, setFilterNoCost] = useState(false);
  const [filterHighValue, setFilterHighValue] = useState(false);
  const [filterLowConf, setFilterLowConf] = useState(false);
  const [filterStale, setFilterStale] = useState(false);

  // Bulk cost entry
  const [bulkCostOpen, setBulkCostOpen] = useState(false);
  const [bulkCostVal, setBulkCostVal] = useState("");
  const [bulkCostSplit, setBulkCostSplit] = useState(false);

  const openRawCardModal = useCallback((it: Item) => {
    setRawCardDetailItem(it);
    setHistoryDuration("90d");
  }, []);

  async function fetchPsa10(id: string, name: string, setName?: string | null) {
    setPsa10Data((prev) => ({ ...prev, [id]: { medianPrice: null, count: 0, loading: true, fetched: false } }));
    try {
      const res = await fetch("/api/ebay-psa10", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, setName }),
      });
      const json = await res.json();
      if (!res.ok) {
        const rateLimited = json.status === 500; // eBay rate limit returns 500
        setPsa10Data((prev) => ({ ...prev, [id]: { medianPrice: null, count: 0, loading: false, fetched: true, rateLimited } }));
        return;
      }
      setPsa10Data((prev) => ({
        ...prev,
        [id]: { medianPrice: json.medianPrice ?? null, count: json.count ?? 0, loading: false, fetched: true },
      }));
    } catch {
      setPsa10Data((prev) => ({ ...prev, [id]: { medianPrice: null, count: 0, loading: false, fetched: true } }));
    }
  }

  useEffect(() => {
    const { supabase, channel } = subscribeWorkspaceTable({
      workspaceId,
      table: "items",
      onChange: () => router.refresh(),
    });
    return () => { supabase.removeChannel(channel); };
  }, [router, workspaceId]);

  // ── Background auto-refresh loop ──────────────────────────────────────────
  useEffect(() => {
    // Abort any prior loop instance
    bgRef.current.aborted = true;
    const ctrl = { paused: false, aborted: false };
    bgRef.current = ctrl;

    const allSlabs = items.filter((it) => it.category === "slab" && it.grade && it.status !== "grading");
    if (allSlabs.length === 0) { setBgStatus("done"); return; }

    // Build stale queue with FMV context
    const withFmv = allSlabs.map((it) => {
      const parsed = parseGrade(it.grade!);
      const key = parsed ? makeSlabPriceKey(it.name, it.set_name, it.card_number, parsed.company, parsed.grade) : null;
      const sp = key ? slabPrices[key] : null;
      const fmv = sp ? (sp.fair_market_value ?? sp.sold_median ?? sp.median_price) : null;
      const compCount = sp ? (sp.sold_count > 0 ? sp.sold_count : sp.comp_count) : 0;
      return { item: it, sp, fmv, compCount, key };
    });

    const stale = withFmv.filter(({ sp, fmv }) => isSlabTierStale(sp, fmv));
    if (stale.length === 0) { setBgStatus("done"); return; }

    // Sort: no data first, then low confidence, then high value, then by tier
    stale.sort((a, b) => {
      const rank = (x: typeof a) => {
        if (!x.sp) return 0;                        // no data — highest priority
        if (x.compCount < 3) return 1;              // low confidence
        if ((x.fmv ?? 0) > 200) return 2;           // high value
        if ((x.fmv ?? 0) >= 50) return 3;           // medium value
        return 4;                                    // low value
      };
      return rank(a) - rank(b);
    });

    setBgStaleCount(stale.length);
    setBgStatus("running");

    async function runLoop() {
      // Check rate limit before starting
      const initialCount = await getEbayDailyCallCount();
      setDailyCallCount(initialCount);
      if (initialCount >= EBAY_DAILY_BUDGET * EBAY_BUDGET_WARN_PCT) {
        setBgStatus("rate_limited");
        return;
      }

      for (const { item, sp, fmv, compCount } of stale) {
        if (ctrl.aborted) break;

        // Wait while a manual refresh is in progress
        while (ctrl.paused && !ctrl.aborted) {
          await new Promise<void>((r) => setTimeout(r, 300));
        }
        if (ctrl.aborted) break;

        // Re-check rate limit each iteration
        const callCount = await getEbayDailyCallCount();
        setDailyCallCount(callCount);
        if (callCount >= EBAY_DAILY_BUDGET * EBAY_BUDGET_WARN_PCT) {
          setBgStatus("rate_limited");
          break;
        }

        const tierMs = getSlabTierMs(fmv, compCount);
        setSlabRefreshing((prev) => ({ ...prev, [item.id]: true }));
        try {
          const result = await refreshSlabPrice(
            item.id, item.name, item.grade!,
            item.set_name ?? null, item.card_number ?? null,
            tierMs
          );
          if (result.rateLimited) {
            setSlabRateLimited((prev) => ({ ...prev, [item.id]: true }));
            setBgStatus("rate_limited");
            break;
          }
          if (result.updated && result.refreshedPrice) {
            // Update local state immediately — no server re-render needed per item
            applyRefreshedPrice(result.refreshedPrice);
          }
          setBgStaleCount((n) => Math.max(0, n - 1));
        } catch {
          // Skip individual failures silently — continue the queue
        } finally {
          setSlabRefreshing((prev) => ({ ...prev, [item.id]: false }));
        }

        if (!ctrl.aborted) await new Promise<void>((r) => setTimeout(r, 3000)); // 3s — respectful scraping cadence
      }

      if (!ctrl.aborted) {
        setBgStatus("done");
        // Single router.refresh() at the end to sync item.market values written server-side
        router.refresh();
      }
    }

    runLoop();
    return () => { ctrl.aborted = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount with initial prop snapshot

  const consignerMap = useMemo(
    () => new Map(consigners.map((c) => [c.id, c])),
    [consigners]
  );

  // Local price overrides — updated by background loop so we don't need router.refresh() per item.
  // Merged over the server-provided slabPrices prop.
  const [slabPriceOverrides, setSlabPriceOverrides] = useState<Record<string, SlabPrice>>({});
  const mergedSlabPrices = useMemo(
    () => ({ ...slabPrices, ...slabPriceOverrides }),
    [slabPrices, slabPriceOverrides]
  );

  function applyRefreshedPrice(rp: RefreshedSlabPrice) {
    setSlabPriceOverrides((prev) => ({ ...prev, [rp.lookup_key]: rp as SlabPrice }));
  }

  const [addForm, setAddForm] = useState<ItemForm>(blankForm());
  const [stagedItems, setStagedItems] = useState<StagedItem[]>([]);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editForm, setEditForm] = useState<ItemForm>(blankForm());

  // Multi-select + sell
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sellOpen, setSellOpen] = useState(false);
  const [salePrice, setSalePrice] = useState("");

  // Mass edit
  const [massEditOpen, setMassEditOpen] = useState(false);
  const [massOwner, setMassOwner] = useState("");
  const [massStatus, setMassStatus] = useState("");
  const [massCategory, setMassCategory] = useState("");

  // Filter / sort
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<Category | "all">("all");
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");
  const [filterOwner, setFilterOwner] = useState<Owner | "all">("all");
  const [filterConsigner, setFilterConsigner] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("date-desc");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  useEffect(() => {
    const saved = localStorage.getItem("inventory-view-mode");
    if (saved === "grid" || saved === "list") setViewMode(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem("inventory-view-mode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (localStorage.getItem("inventory-slabs-collapsed") === "true") setSlabsCollapsed(true);
    if (localStorage.getItem("inventory-raw-collapsed") === "true") setRawCollapsed(true);
  }, []);
  useEffect(() => { localStorage.setItem("inventory-slabs-collapsed", String(slabsCollapsed)); }, [slabsCollapsed]);
  useEffect(() => { localStorage.setItem("inventory-raw-collapsed", String(rawCollapsed)); }, [rawCollapsed]);

  const gradingItems = useMemo(
    () => items.filter((it) => it.status === "grading"),
    [items]
  );

  const displayedItems = useMemo(() => {
    let result = items.filter((it) => it.status !== "grading");
    const q = search.trim().toLowerCase();
    if (q) result = result.filter((it) => it.name.toLowerCase().includes(q));
    if (filterCategory !== "all") result = result.filter((it) => it.category === filterCategory);
    if (filterStatus !== "all") result = result.filter((it) => it.status === filterStatus);
    if (filterOwner !== "all") result = result.filter((it) => it.owner === filterOwner);
    if (filterConsigner === "none") result = result.filter((it) => !it.consigner_id);
    else if (filterConsigner !== "all") result = result.filter((it) => it.consigner_id === filterConsigner);
    result.sort((a, b) => {
      switch (sort) {
        case "name-asc":    return a.name.localeCompare(b.name);
        case "name-desc":   return b.name.localeCompare(a.name);
        case "market-asc":  return nullLast(a.market, b.market, true);
        case "market-desc": return nullLast(a.market, b.market, false);
        case "cost-asc":    return nullLast(a.cost, b.cost, true);
        case "cost-desc":   return nullLast(a.cost, b.cost, false);
        case "date-asc":    return a.created_at.localeCompare(b.created_at);
        case "date-desc":   return b.created_at.localeCompare(a.created_at);
        case "fmv-asc":
        case "fmv-desc": {
          const getFmv = (it: Item) => {
            if (it.category !== "slab" || !it.grade) return null;
            const parsed = parseGrade(it.grade);
            if (!parsed) return null;
            const key = makeSlabPriceKey(it.name, it.set_name, it.card_number, parsed.company, parsed.grade);
            const sp = mergedSlabPrices[key];
            return sp?.fair_market_value ?? sp?.sold_median ?? sp?.median_price ?? null;
          };
          return nullLast(getFmv(a), getFmv(b), sort === "fmv-asc");
        }
        case "margin-asc":
        case "margin-desc": {
          const getMargin = (it: Item) => {
            if (it.cost == null || it.cost === 0) return null;
            let price = it.market;
            if (it.category === "slab" && it.grade) {
              const parsed = parseGrade(it.grade);
              if (parsed) {
                const key = makeSlabPriceKey(it.name, it.set_name, it.card_number, parsed.company, parsed.grade);
                const sp = mergedSlabPrices[key];
                price = sp?.fair_market_value ?? sp?.sold_median ?? sp?.median_price ?? it.market;
              }
            }
            if (price == null) return null;
            return (price - it.cost) / it.cost;
          };
          return nullLast(getMargin(a), getMargin(b), sort === "margin-asc");
        }
        default: return 0;
      }
    });
    return result;
  }, [items, search, filterCategory, filterStatus, filterOwner, filterConsigner, sort, slabPrices]);

  // Pill filter counts — computed from base filtered set before pills applied
  const pillCounts = useMemo(() => {
    let noPrice = 0, noCost = 0, highValue = 0, lowConf = 0, stale = 0;
    for (const it of displayedItems) {
      if (it.cost == null) noCost++;
      if (it.category === "slab" && it.grade) {
        const parsed = parseGrade(it.grade);
        const key = parsed ? makeSlabPriceKey(it.name, it.set_name, it.card_number, parsed.company, parsed.grade) : null;
        const sp = key ? mergedSlabPrices[key] : null;
        const fmv = sp ? (sp.fair_market_value ?? sp.sold_median ?? sp.median_price) : null;
        if (!sp) noPrice++;
        if (fmv != null && fmv > 200) highValue++;
        if (sp && (sp.sold_count > 0 ? sp.sold_count : sp.comp_count) < 3) lowConf++;
        if (isSlabTierStale(sp, fmv)) stale++;
      } else {
        const rawKey = makeRawCardPriceKey(it.name, it.set_name, it.card_number);
        const rcp = mergedRawCardPrices[rawKey];
        const condPrice = rcp ? priceForCondition({ nm: rcp.nm_price, lp: rcp.lp_price, mp: rcp.mp_price, hp: rcp.hp_price, dmg: rcp.dmg_price }, it.condition) : null;
        if (!rcp) noPrice++;
        if (condPrice != null && condPrice > 200) highValue++;
        if (!rcp || Date.now() - new Date(rcp.last_updated).getTime() > 24 * 60 * 60 * 1000) stale++;
      }
    }
    return { noPrice, noCost, highValue, lowConf, stale };
  }, [displayedItems, mergedSlabPrices, mergedRawCardPrices]);

  // Apply active pill filters on top of base filters
  const filteredDisplayedItems = useMemo(() => {
    if (!filterNoPrice && !filterNoCost && !filterHighValue && !filterLowConf && !filterStale) return displayedItems;
    return displayedItems.filter((it) => {
      if (filterNoCost && it.cost != null) return false;
      if (it.category === "slab" && it.grade) {
        const parsed = parseGrade(it.grade);
        const key = parsed ? makeSlabPriceKey(it.name, it.set_name, it.card_number, parsed.company, parsed.grade) : null;
        const sp = key ? mergedSlabPrices[key] : null;
        const fmv = sp ? (sp.fair_market_value ?? sp.sold_median ?? sp.median_price) : null;
        if (filterNoPrice && sp) return false;
        if (filterHighValue && !(fmv != null && fmv > 200)) return false;
        if (filterLowConf && !(sp && (sp.sold_count > 0 ? sp.sold_count : sp.comp_count) < 3)) return false;
        if (filterStale && !isSlabTierStale(sp, fmv)) return false;
      } else {
        const rawKey = makeRawCardPriceKey(it.name, it.set_name, it.card_number);
        const rcp = mergedRawCardPrices[rawKey];
        const condPrice = rcp ? priceForCondition({ nm: rcp.nm_price, lp: rcp.lp_price, mp: rcp.mp_price, hp: rcp.hp_price, dmg: rcp.dmg_price }, it.condition) : null;
        if (filterNoPrice && rcp) return false;
        if (filterHighValue && !(condPrice != null && condPrice > 200)) return false;
        if (filterLowConf) return false; // low confidence only applies to slabs
        if (filterStale && rcp && Date.now() - new Date(rcp.last_updated).getTime() <= 24 * 60 * 60 * 1000) return false;
      }
      return true;
    });
  }, [displayedItems, filterNoPrice, filterNoCost, filterHighValue, filterLowConf, filterStale, mergedSlabPrices, mergedRawCardPrices]);

  // Inventory value summary
  const inventorySummary = useMemo(() => {
    let slabValue = 0, rawValue = 0, totalCost = 0;
    for (const it of displayedItems) {
      let price: number | null = null;
      if (it.category === "slab" && it.grade) {
        const parsed = parseGrade(it.grade);
        const key = parsed ? makeSlabPriceKey(it.name, it.set_name, it.card_number, parsed.company, parsed.grade) : null;
        const sp = key ? mergedSlabPrices[key] : null;
        price = sp ? (sp.fair_market_value ?? sp.sold_median ?? sp.median_price) : it.market;
        slabValue += price ?? 0;
      } else {
        const rawKey = makeRawCardPriceKey(it.name, it.set_name, it.card_number);
        const rcp = mergedRawCardPrices[rawKey];
        price = rcp
          ? (priceForCondition({ nm: rcp.nm_price, lp: rcp.lp_price, mp: rcp.mp_price, hp: rcp.hp_price, dmg: rcp.dmg_price }, it.condition) ?? it.market)
          : it.market;
        rawValue += price ?? 0;
      }
      totalCost += it.cost ?? 0;
    }
    const total = slabValue + rawValue;
    const profit = total - totalCost;
    const profitPct = totalCost > 0 ? (profit / totalCost) * 100 : null;
    return { slabValue, rawValue, total, totalCost, profit, profitPct };
  }, [displayedItems, mergedSlabPrices, mergedRawCardPrices]);

  const displayedSlabs = useMemo(() => filteredDisplayedItems.filter((it) => it.category === "slab"), [filteredDisplayedItems]);
  const displayedRawCards = useMemo(() => filteredDisplayedItems.filter((it) => it.category !== "slab"), [filteredDisplayedItems]);

  const selectedItems = useMemo(
    () => items.filter((it) => selectedIds.has(it.id)),
    [items, selectedIds]
  );

  const totalMarket = selectedItems.reduce((s, it) => s + (it.market ?? 0), 0);
  const salePriceNum = parseFloat(salePrice) || 0;

  function getProportionalPrice(it: Item): number {
    const m = it.market ?? 0;
    if (totalMarket > 0) return (m / totalMarket) * salePriceNum;
    return selectedItems.length > 0 ? salePriceNum / selectedItems.length : 0;
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setSellOpen(false);
    setSalePrice("");
  }

  function openEdit(it: Item) { setEditingItem(it); setEditForm(itemToForm(it)); }
  function closeEdit() { setEditingItem(null); setDeleteConfirm(false); }

  function onScanResult(data: ScanResult) {
    setAddForm({
      ...blankForm(),
      name: data.name,
      condition: data.condition,
      market: data.market != null ? String(data.market) : "",
      imageUrl: data.imageUrl ?? "",
      setName: data.setName,
      cardNumber: data.cardNumber,
    });
    setAddOpen(true);
  }

  async function onCardSearchResult(data: CardSearchResult) {
    // Pre-fill with picker data immediately
    setAddForm((prev) => ({
      ...prev,
      name: data.name,
      setName: data.setName,
      cardNumber: data.cardNumber,
      market: data.market != null ? String(data.market) : prev.market,
      imageUrl: data.imageUrl ?? prev.imageUrl,
    }));
    setFindConfirmed(
      [data.name, data.setName, data.cardNumber ? `#${data.cardNumber}` : ""].filter(Boolean).join(" · ")
    );
    setFindError(null);
    // Upgrade to TCGdex high-res image in the background
    if (data.name) {
      const result = await fetchCardData(data.name, data.setName || null, data.cardNumber || null);
      if (result) {
        setAddForm((prev) => ({
          ...prev,
          imageUrl: result.imageUrl ?? prev.imageUrl,
        }));
      }
    }
  }

  async function onEditImageResult(data: CardSearchResult) {
    setEditImagePickerOpen(false);
    if (!data.imageUrl || !editingItem) return;
    setEditForm((prev) => ({ ...prev, imageUrl: data.imageUrl! }));
    setBusy(true);
    try {
      await updateItem(editingItem.id, { image_url: data.imageUrl });
    } finally {
      setBusy(false);
    }
  }

  function handleAddFormFind() {
    setAddOpen(true);
    setCardSearchOpen(true);
  }

  function onAddToList() {
    if (!addForm.name.trim()) return;
    setStagedItems((prev) => [...prev, { ...addForm, _id: crypto.randomUUID() }]);
    setAddForm(blankForm());
    setFindConfirmed(null);
    setFindError(null);
  }

  async function onSaveAll() {
    if (stagedItems.length === 0) return;
    setBusy(true);
    try {
      await createItems(
        stagedItems.map((item) => ({
          category: item.category,
          owner: item.owner,
          status: item.status,
          name: item.name,
          condition: item.category === "single" ? item.condition : "Near Mint",
          cost: toNum(item.cost),
          market: toNum(item.market),
          notes: item.notes || null,
          consigner_id: item.consignerId || null,
          image_url: item.imageUrl || null,
          set_name: item.setName || null,
          card_number: item.cardNumber || null,
          grade: item.grade || null,
        }))
      );
      setStagedItems([]);
    } finally {
      setBusy(false);
    }
  }

  async function onSaveEdit() {
    if (!editingItem || !editForm.name.trim()) return;
    setBusy(true);
    try {
      await updateItem(editingItem.id, {
        category: editForm.category,
        owner: editForm.owner,
        status: editForm.status,
        name: editForm.name,
        condition: editForm.category === "single" ? editForm.condition : "Near Mint",
        cost: toNum(editForm.cost),
        market: toNum(editForm.market),
        notes: editForm.notes || null,
        consigner_id: editForm.consignerId || null,
        image_url: editForm.imageUrl || null,
        set_name: editForm.setName || null,
        card_number: editForm.cardNumber || null,
        grade: editForm.grade || null,
      });
      closeEdit();
    } finally { setBusy(false); }
  }

  async function onDelete(id: string) {
    setBusy(true);
    try { await deleteItem(id); }
    finally { setBusy(false); }
  }

  async function onQuickStatus(id: string, status: Status) {
    setBusy(true);
    try { await updateItem(id, { status }); }
    finally { setBusy(false); }
  }

  async function handleGradeItem() {
    if (!editingItem) return;
    setBusy(true);
    try { await updateItem(editingItem.id, { status: "grading" }); closeEdit(); }
    finally { setBusy(false); }
  }

  async function handleDeleteItem() {
    if (!editingItem) return;
    await onDelete(editingItem.id);
    closeEdit();
  }

  async function onMassEdit() {
    const patch: Record<string, string | null> = {};
    if (massOwner) {
      if (massOwner.startsWith("consigner:")) {
        patch.owner = "consigner";
        patch.consigner_id = massOwner.slice("consigner:".length);
      } else {
        patch.owner = massOwner;
        patch.consigner_id = null;
      }
    }
    if (massStatus) patch.status = massStatus;
    if (massCategory) patch.category = massCategory;
    if (Object.keys(patch).length === 0) return;
    setBusy(true);
    try {
      await massUpdateItems(Array.from(selectedIds), patch);
      setMassEditOpen(false);
      setMassOwner("");
      setMassStatus("");
      setMassCategory("");
    } finally { setBusy(false); }
  }

  async function onConfirmSale() {
    if (selectedIds.size === 0 || salePriceNum <= 0) return;
    setBusy(true);
    try {
      await markItemsAsSold(Array.from(selectedIds), salePriceNum);
      clearSelection();
    } finally { setBusy(false); }
  }

  async function handleUploadImage(it: Item, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    await uploadItemImage(fd, it.id, it.name, it.set_name ?? null, it.card_number ?? null);
  }

  async function handleRefreshSlabPrice(it: Item, fromBg = false) {
    if (!it.grade) return;
    // Manual refresh pauses the background loop temporarily
    if (!fromBg) {
      bgRef.current.paused = true;
    }
    setSlabRefreshing((prev) => ({ ...prev, [it.id]: true }));
    setSlabRateLimited((prev) => ({ ...prev, [it.id]: false }));
    try {
      // Manual: no maxAgeMs → always hits eBay. Background: pass tier window.
      const result = await refreshSlabPrice(it.id, it.name, it.grade, it.set_name ?? null, it.card_number ?? null);
      if (result.rateLimited) {
        setSlabRateLimited((prev) => ({ ...prev, [it.id]: true }));
      } else {
        router.refresh();
      }
    } finally {
      setSlabRefreshing((prev) => ({ ...prev, [it.id]: false }));
      if (!fromBg) {
        setTimeout(() => { bgRef.current.paused = false; }, 1500);
      }
    }
  }

  async function handleRefreshRawCardPrice(it: Item) {
    setRawCardRefreshing((prev) => ({ ...prev, [it.id]: true }));
    try {
      const result = await refreshRawCardPrice(
        it.id, it.name, it.condition ?? null, it.set_name ?? null, it.card_number ?? null
      );
      if (result.updated && result.refreshedPrice) {
        setRawCardPriceOverrides((prev) => ({ ...prev, [result.refreshedPrice!.lookup_key]: result.refreshedPrice! as RawCardPrice }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[raw card refresh] error:", msg);
    } finally {
      setRawCardRefreshing((prev) => ({ ...prev, [it.id]: false }));
    }
  }

  async function handleSaveInlineCost(id: string) {
    const n = toNum(inlineCostVal);
    setInlineCostId(null);
    setInlineCostVal("");
    if (n !== null) await updateItem(id, { cost: n });
  }

  async function onBulkDelete() {
    setBusy(true);
    try {
      await deleteItems(Array.from(selectedIds));
      clearSelection();
      setDeleteOpen(false);
    } finally { setBusy(false); }
  }

  function selectAll() {
    if (selectedIds.size === filteredDisplayedItems.length && filteredDisplayedItems.length > 0) {
      clearSelection();
    } else {
      setSelectedIds(new Set(filteredDisplayedItems.map((it) => it.id)));
    }
  }

  async function onBulkSetCost() {
    const n = toNum(bulkCostVal);
    if (n === null || n < 0 || selectedIds.size === 0) return;
    setBusy(true);
    try {
      const ids = Array.from(selectedIds);
      const costEach = bulkCostSplit ? Math.round((n / ids.length) * 100) / 100 : n;
      await Promise.all(ids.map((id) => updateItem(id, { cost: costEach })));
      setBulkCostOpen(false);
      setBulkCostVal("");
      setBulkCostSplit(false);
    } finally { setBusy(false); }
  }

  const isFiltered =
    search.trim() !== "" ||
    filterCategory !== "all" ||
    filterStatus !== "all" ||
    filterOwner !== "all" ||
    filterConsigner !== "all" ||
    filterNoPrice || filterNoCost || filterHighValue || filterLowConf || filterStale;

  return (
    <div className={`space-y-4 ${selectedIds.size > 0 ? "pb-32" : ""}`}>
      <CardScanner open={scanOpen} onClose={() => setScanOpen(false)} onResult={onScanResult} />
      <CardSearchPicker
        open={cardSearchOpen || editImagePickerOpen}
        onClose={() => { setCardSearchOpen(false); setEditImagePickerOpen(false); }}
        onResult={editImagePickerOpen ? onEditImageResult : onCardSearchResult}
        initialName={editImagePickerOpen ? editForm.name : addForm.name}
        initialSetName={editImagePickerOpen ? editForm.setName : addForm.setName}
        initialCardNumber={editImagePickerOpen ? editForm.cardNumber : addForm.cardNumber}
      />

      {/* Add form — collapsible */}
      <div className="border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2.5">
          <button
            className="flex items-center gap-2 font-medium text-sm"
            onClick={() => setAddOpen((o) => !o)}
          >
            <span>{addOpen ? "▾" : "▸"}</span>
            Add item
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setScanOpen(true)}
              className="text-sm px-2.5 py-1 border rounded-lg hover:bg-muted transition-colors"
              title="Scan a card"
            >
              📷 Scan
            </button>
            <CSVImport consigners={consigners} />
          </div>
        </div>
        {addOpen && (
          <div className="border-t p-3 space-y-3">
            <ItemFormFields
              form={addForm}
              setForm={(f) => { setAddForm(f); setFindConfirmed(null); }}
              consigners={consigners}
              onFind={handleAddFormFind}
              findConfirmed={findConfirmed}
            />
            <button
              className="px-4 py-2 rounded-lg border font-medium disabled:opacity-40"
              onClick={onAddToList}
              disabled={!addForm.name.trim()}
            >
              Add to List
            </button>

            {/* Staging list */}
            {stagedItems.length > 0 && (
              <div className="border-t pt-3 space-y-2">
                <div className="text-xs font-medium opacity-60 uppercase tracking-wide">
                  Pending — {stagedItems.length} item{stagedItems.length !== 1 ? "s" : ""}
                </div>
                {stagedItems.map((item) => (
                  <div key={item._id} className="flex items-start gap-2 border rounded-lg p-2">
                    {/* Thumbnail */}
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt="" className="h-14 w-auto rounded object-contain flex-shrink-0" />
                    ) : (
                      <div className="h-14 w-10 rounded bg-muted flex-shrink-0" />
                    )}

                    {/* Details */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="text-sm font-medium truncate">{item.name}</div>
                      {(item.setName || item.cardNumber) && (
                        <div className="text-xs opacity-60 truncate">
                          {[item.setName, item.cardNumber ? `#${item.cardNumber}` : ""].filter(Boolean).join(" · ")}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1">
                        <select
                          className="text-xs border rounded px-1 py-0.5 bg-background"
                          value={item.condition}
                          onChange={(e) => setStagedItems((prev) => prev.map((s) => s._id === item._id ? { ...s, condition: e.target.value as Condition } : s))}
                        >
                          <option value="Near Mint">NM</option>
                          <option value="Lightly Played">LP</option>
                          <option value="Moderately Played">MP</option>
                          <option value="Heavily Played">HP</option>
                          <option value="Damaged">D</option>
                        </select>
                        <select
                          className="text-xs border rounded px-1 py-0.5 bg-background"
                          value={item.owner}
                          onChange={(e) => setStagedItems((prev) => prev.map((s) => s._id === item._id ? { ...s, owner: e.target.value as Owner } : s))}
                        >
                          <option value="shared">Shared</option>
                          <option value="alex">Alex</option>
                          <option value="mila">Mila</option>
                        </select>
                        <select
                          className="text-xs border rounded px-1 py-0.5 bg-background"
                          value={item.category}
                          onChange={(e) => setStagedItems((prev) => prev.map((s) => s._id === item._id ? { ...s, category: e.target.value as Category } : s))}
                        >
                          <option value="single">Single</option>
                          <option value="slab">Slab</option>
                          <option value="sealed">Sealed</option>
                        </select>
                      </div>
                      <div className="flex gap-1">
                        <input
                          className="text-xs border rounded px-1.5 py-0.5 bg-background w-20"
                          placeholder="Cost"
                          value={item.cost}
                          inputMode="decimal"
                          onChange={(e) => setStagedItems((prev) => prev.map((s) => s._id === item._id ? { ...s, cost: e.target.value } : s))}
                        />
                        <input
                          className="text-xs border rounded px-1.5 py-0.5 bg-background w-20"
                          placeholder="Market"
                          value={item.market}
                          inputMode="decimal"
                          onChange={(e) => setStagedItems((prev) => prev.map((s) => s._id === item._id ? { ...s, market: e.target.value } : s))}
                        />
                      </div>
                    </div>

                    {/* Remove */}
                    <button
                      className="text-red-400 hover:text-red-600 text-xl leading-none flex-shrink-0 pt-0.5"
                      title="Remove"
                      onClick={() => setStagedItems((prev) => prev.filter((s) => s._id !== item._id))}
                    >
                      ×
                    </button>
                  </div>
                ))}

                <button
                  className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  onClick={onSaveAll}
                  disabled={busy}
                >
                  {busy ? "Saving…" : `Save All to Inventory (${stagedItems.length})`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Search / filter / sort — collapsible */}
      <div className="border rounded-xl overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium"
          onClick={() => setSearchOpen((o) => !o)}
        >
          <span className="flex items-center gap-2">
            <span>{searchOpen ? "▾" : "▸"}</span>
            Search &amp; Filter
          </span>
          {isFiltered && (
            <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
              active
            </span>
          )}
        </button>
        {searchOpen && (
          <div className="border-t p-3 space-y-2">
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <select className="border rounded-lg px-3 py-2 text-sm bg-background" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value as Category | "all")}>
                <option value="all">All types</option>
                <option value="single">Singles</option>
                <option value="slab">Slabs</option>
                <option value="sealed">Sealed</option>
              </select>
              <select className="border rounded-lg px-3 py-2 text-sm bg-background" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as Status | "all")}>
                <option value="all">All statuses</option>
                <option value="inventory">Inventory</option>
                    </select>
              <select className="border rounded-lg px-3 py-2 text-sm bg-background" value={filterOwner} onChange={(e) => setFilterOwner(e.target.value as Owner | "all")}>
                <option value="all">All owners</option>
                <option value="alex">Alex</option>
                <option value="mila">Mila</option>
                <option value="shared">Shared</option>
              </select>
              {consigners.length > 0 && (
                <select className="border rounded-lg px-3 py-2 text-sm bg-background" value={filterConsigner} onChange={(e) => setFilterConsigner(e.target.value)}>
                  <option value="all">All consigners</option>
                  <option value="none">Own inventory</option>
                  {consigners.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
              <select className="border rounded-lg px-3 py-2 text-sm bg-background" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="date-desc">Newest first</option>
                <option value="date-asc">Oldest first</option>
                <option value="name-asc">Name A→Z</option>
                <option value="name-desc">Name Z→A</option>
                <option value="market-desc">Market ↓</option>
                <option value="market-asc">Market ↑</option>
                <option value="cost-desc">Cost ↓</option>
                <option value="cost-asc">Cost ↑</option>
              </select>
            </div>
            {isFiltered && (
              <button className="text-xs underline opacity-60" onClick={() => { setSearch(""); setFilterCategory("all"); setFilterStatus("all"); setFilterOwner("all"); setFilterConsigner("all"); }}>
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Inventory list/grid */}
      <div className="border rounded-xl overflow-x-hidden">
        {/* Header */}
        <div className="px-3 py-2.5 border-b flex items-center justify-between sticky top-0 z-10 bg-background">
          <div className="flex items-center gap-2">
            <button
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider opacity-50 hover:opacity-100 transition-opacity duration-150 inv-label"
              onClick={() => setInventoryOpen((o) => !o)}
            >
              <span className="text-[10px]">{inventoryOpen ? "▾" : "▸"}</span>
              {isFiltered
                ? `${filteredDisplayedItems.length} of ${items.filter((i) => i.status !== "grading").length} items`
                : `Inventory · ${items.filter((i) => i.status !== "grading").length}`}
            </button>
            {inventoryOpen && (
              <button className="text-xs px-2 py-1 rounded-lg border opacity-40 hover:opacity-80 transition-opacity duration-150" onClick={selectAll}>
                {selectedIds.size === displayedItems.length && displayedItems.length > 0 ? "Deselect All" : "Select All"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex border rounded-lg overflow-hidden text-xs">
              <button
                className={`px-2 py-1 transition-colors duration-150 ${viewMode === "list" ? "bg-foreground text-background" : "hover:bg-muted opacity-50 hover:opacity-100"}`}
                onClick={() => setViewMode("list")}
                title="List view"
              >☰</button>
              <button
                className={`px-2 py-1 transition-colors duration-150 ${viewMode === "grid" ? "bg-foreground text-background" : "hover:bg-muted opacity-50 hover:opacity-100"}`}
                onClick={() => setViewMode("grid")}
                title="Grid view"
              >⊞</button>
            </div>
          </div>
        </div>

        {/* Persistent search */}
        {inventoryOpen && (
          <div className="px-3 py-2 border-b">
            <input
              className="w-full border rounded-lg px-3 py-1.5 text-sm bg-background"
              placeholder="Search inventory…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}

        {/* Auto-refresh status */}
        {bgStatus === "rate_limited" && (
          <div className="px-3 py-2 text-xs text-orange-600 bg-orange-50 dark:bg-orange-950/20 border-b border-orange-200 dark:border-orange-800">
            Auto-refresh paused — daily API limit nearly reached ({dailyCallCount.toLocaleString()} / {EBAY_DAILY_BUDGET.toLocaleString()} calls). Manual refresh still available.
          </div>
        )}
        {bgStatus === "running" && bgStaleCount > 0 && (
          <div className="px-3 py-1.5 text-xs opacity-40 border-b flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            Auto-updating prices… {bgStaleCount} remaining
          </div>
        )}
        {bgStatus === "done" && (
          <div className="px-3 py-1 text-xs opacity-30 border-b">All prices current</div>
        )}

        {inventoryOpen && filteredDisplayedItems.length === 0 && displayedItems.length > 0 && (
          <div className="p-6 text-sm opacity-70 text-center">No items match your filters.</div>
        )}
        {inventoryOpen && displayedItems.length === 0 && (
          <div className="p-6 text-sm opacity-70">No items yet.</div>
        )}

        {/* Inventory value summary bar */}
        {inventoryOpen && displayedItems.length > 0 && (
          <div className="px-3 py-2 border-b bg-muted/10 flex items-center gap-2 overflow-x-auto">
            <div className="flex flex-col flex-shrink-0 px-3 py-1.5 rounded-lg bg-muted/30">
              <span className="text-[10px] uppercase tracking-wider opacity-40 font-semibold">Total</span>
              <span className="text-sm font-bold inv-price">{fmt(inventorySummary.total)}</span>
            </div>
            <div className="w-px h-8 bg-border flex-shrink-0 opacity-20" />
            <div className="flex flex-col flex-shrink-0 px-3 py-1.5 rounded-lg bg-purple-500/8">
              <span className="text-[10px] uppercase tracking-wider text-purple-500 opacity-70 font-semibold">Slabs</span>
              <span className="text-sm font-bold text-purple-500 dark:text-purple-400 inv-price">{fmt(inventorySummary.slabValue)}</span>
            </div>
            <div className="flex flex-col flex-shrink-0 px-3 py-1.5 rounded-lg bg-blue-500/8">
              <span className="text-[10px] uppercase tracking-wider text-blue-500 opacity-70 font-semibold">Raw</span>
              <span className="text-sm font-bold text-blue-500 dark:text-blue-400 inv-price">{fmt(inventorySummary.rawValue)}</span>
            </div>
            {inventorySummary.totalCost > 0 && (
              <>
                <div className="w-px h-8 bg-border flex-shrink-0 opacity-20" />
                <div className="flex flex-col flex-shrink-0 px-3 py-1.5 rounded-lg bg-muted/30">
                  <span className="text-[10px] uppercase tracking-wider opacity-40 font-semibold">Cost</span>
                  <span className="text-sm font-bold opacity-50 inv-price">{fmt(inventorySummary.totalCost)}</span>
                </div>
                <div className={`flex flex-col flex-shrink-0 px-3 py-1.5 rounded-lg ${inventorySummary.profit >= 0 ? "bg-green-500/10" : "bg-red-500/10"}`}>
                  <span className={`text-[10px] uppercase tracking-wider font-semibold ${inventorySummary.profit >= 0 ? "text-green-500 opacity-80" : "text-red-500 opacity-80"}`}>Profit</span>
                  <span className={`text-sm font-bold inv-price ${inventorySummary.profit >= 0 ? "text-green-500 dark:text-green-400" : "text-red-500"}`}>
                    {inventorySummary.profit >= 0 ? "+" : ""}{fmt(inventorySummary.profit)}
                    {inventorySummary.profitPct != null && (
                      <span className="text-xs opacity-60 font-medium ml-1">({inventorySummary.profitPct >= 0 ? "+" : ""}{inventorySummary.profitPct.toFixed(0)}%)</span>
                    )}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Quick filter pills */}
        {inventoryOpen && displayedItems.length > 0 && (
          <div className="px-3 py-2 border-b flex items-center gap-1.5 overflow-x-auto">
            {(
              [
                { label: "No Price",   count: pillCounts.noPrice,   active: filterNoPrice,   toggle: () => setFilterNoPrice((v) => !v) },
                { label: "No Cost",    count: pillCounts.noCost,    active: filterNoCost,    toggle: () => setFilterNoCost((v) => !v) },
                { label: "High Value", count: pillCounts.highValue, active: filterHighValue, toggle: () => setFilterHighValue((v) => !v) },
                { label: "Low Conf",   count: pillCounts.lowConf,   active: filterLowConf,   toggle: () => setFilterLowConf((v) => !v) },
                { label: "Stale",      count: pillCounts.stale,     active: filterStale,     toggle: () => setFilterStale((v) => !v) },
              ] as { label: string; count: number; active: boolean; toggle: () => void }[]
            ).map(({ label, count, active, toggle }) => (
              <button
                key={label}
                onClick={toggle}
                disabled={count === 0 && !active}
                className={`flex-shrink-0 text-[11px] px-3 py-1 rounded-full border font-medium transition-all duration-150 whitespace-nowrap ${
                  active
                    ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                    : count === 0
                      ? "opacity-20 cursor-default border-border"
                      : "border-border opacity-60 hover:opacity-100 hover:border-foreground/40 hover:bg-muted/50"
                }`}
              >
                {label}{count > 0 ? <span className={`ml-1 ${active ? "opacity-80" : "opacity-60"}`}>({count})</span> : ""}
              </button>
            ))}
          </div>
        )}

        {/* LIST VIEW */}
        {inventoryOpen && viewMode === "list" && filteredDisplayedItems.length > 0 && (
          <div className="divide-y">
            {/* Column headers */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-background border-b text-[11px] font-semibold uppercase tracking-wider opacity-40 select-none sticky top-0 z-10">
              <div className="w-4 flex-shrink-0" />
              <div className="w-10 flex-shrink-0" />
              <button className="flex-1 max-w-[45%] text-left flex items-center gap-1 hover:opacity-100 transition-opacity" onClick={() => setSort(sort === "name-asc" ? "name-desc" : "name-asc")}>
                Name {sort === "name-asc" ? "↑" : sort === "name-desc" ? "↓" : ""}
              </button>
              <div className="w-[72px] flex-shrink-0" />
              <button className="w-28 text-right flex items-center justify-end gap-1 hover:opacity-100 transition-opacity" onClick={() => setSort(sort === "fmv-asc" ? "fmv-desc" : "fmv-asc")}>
                FMV / Mkt {sort === "fmv-asc" ? "↑" : sort === "fmv-desc" ? "↓" : ""}
              </button>
              <button className="w-16 text-right flex items-center justify-end gap-1 hover:opacity-100 transition-opacity" onClick={() => setSort(sort === "cost-asc" ? "cost-desc" : "cost-asc")}>
                Cost {sort === "cost-asc" ? "↑" : sort === "cost-desc" ? "↓" : ""}
              </button>
              <button className="w-24 text-right flex items-center justify-end gap-1 hover:opacity-100 transition-opacity" onClick={() => setSort(sort === "margin-asc" ? "margin-desc" : "margin-asc")}>
                Margin {sort === "margin-asc" ? "↑" : sort === "margin-desc" ? "↓" : ""}
              </button>
              <div className="w-10 flex-shrink-0" />
            </div>
            {/* Slabs section */}
            <>
              <button
                className="w-full px-3 py-2 bg-purple-500/5 dark:bg-purple-500/8 border-b border-purple-500/10 flex items-center gap-2 hover:bg-purple-500/10 transition-colors duration-150 text-left"
                onClick={() => setSlabsCollapsed((v) => !v)}
              >
                <span className="text-[9px] opacity-40 w-3">{slabsCollapsed ? "▶" : "▼"}</span>
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-purple-600 dark:text-purple-400 inv-label">Slabs</span>
                <span className="text-[11px] bg-purple-500/15 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded-full font-semibold tabular-nums">{displayedSlabs.length}</span>
              </button>
              {!slabsCollapsed && (displayedSlabs.length === 0 ? (
                <div className="px-3 py-5 text-center text-xs opacity-40">
                  {items.some((i) => i.category === "slab" && i.status !== "grading") ? "No slabs match your filters" : "No slabs yet"}
                </div>
              ) : displayedSlabs.map((it) => {
                const isSelected = selectedIds.has(it.id);
                const consigner = it.consigner_id ? consignerMap.get(it.consigner_id) : null;
                const parsed = it.grade ? parseGrade(it.grade) : null;
                const slabKey = parsed ? makeSlabPriceKey(it.name, it.set_name, it.card_number, parsed.company, parsed.grade) : null;
                const sp = slabKey ? mergedSlabPrices[slabKey] : null;
                const fmv = sp ? (sp.fair_market_value ?? sp.sold_median ?? sp.median_price) : it.market;
                const marginAmt = fmv != null && it.cost != null && it.cost > 0 ? fmv - it.cost : null;
                const marginPct = fmv != null && it.cost != null && it.cost > 0 ? ((fmv - it.cost) / it.cost) * 100 : null;
                const isRefreshing = slabRefreshing[it.id];
                const isRateLimited = slabRateLimited[it.id];
                const isStale = isSlabTierStale(sp, fmv);
                return (
                  <div
                    key={it.id}
                    className={`inv-row-slab flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors duration-150 ${isSelected ? "bg-green-500/8 dark:bg-green-500/10" : "hover:bg-muted/40"}`}
                    onClick={() => toggleSelect(it.id)}
                  >
                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(it.id)} onClick={(e) => e.stopPropagation()} className="w-4 h-4 accent-green-600 flex-shrink-0" />
                    <div className="flex-shrink-0 w-10">
                      {it.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.image_url} alt={it.name} className="w-10 h-14 rounded-lg object-cover shadow-md ring-1 ring-black/10 dark:ring-white/5" />
                      ) : (
                        <div className="w-10 h-14 rounded-lg bg-muted flex items-center justify-center ring-1 ring-black/5 dark:ring-white/5"><span className="text-[10px] opacity-30">?</span></div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 max-w-[45%] space-y-0.5">
                      <div className="text-sm font-semibold leading-tight truncate inv-label">{it.name}</div>
                      {(it.set_name || it.card_number) && (
                        <div className="text-xs opacity-50 truncate">{[it.set_name, it.card_number ? `#${it.card_number}` : ""].filter(Boolean).join(" · ")}</div>
                      )}
                      <div className="flex items-center gap-1 flex-wrap">
                        {it.grade && <span className={`inline-block text-xs px-1.5 py-0.5 rounded-full ${gradeStyle(it.grade)}`}>{it.grade}</span>}
                        {consigner ? (
                          <span className="text-xs opacity-40 border rounded px-1 py-0.5">{consigner.name}</span>
                        ) : it.owner !== "shared" ? (
                          <span className="text-xs opacity-40 border rounded px-1 py-0.5">{it.owner}</span>
                        ) : null}
                      </div>
                    </div>
                    {/* Quick links */}
                    <div className="hidden sm:flex flex-col gap-0.5 w-[72px] flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const q = buildSlabEbayQuery(it.name, it.grade, it.set_name, it.card_number);
                        const enc = encodeURIComponent(q);
                        return (
                          <>
                            <a href={`https://www.ebay.com/sch/i.html?_nkw=${enc}&LH_Complete=1&LH_Sold=1&_sacat=183454`} target="_blank" rel="noopener noreferrer"
                               className="text-[11px] py-[3px] px-2 rounded border border-white/10 dark:border-white/8 bg-white/5 dark:bg-white/4 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all duration-150 text-center whitespace-nowrap">
                              eBay Sold
                            </a>
                            <a href={`https://www.ebay.com/sch/i.html?_nkw=${enc}&_sacat=183454`} target="_blank" rel="noopener noreferrer"
                               className="text-[11px] py-[3px] px-2 rounded border border-white/10 dark:border-white/8 bg-white/5 dark:bg-white/4 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all duration-150 text-center whitespace-nowrap">
                              eBay List
                            </a>
                          </>
                        );
                      })()}
                    </div>
                    {/* FMV — stale = dimmed + clock, fresh = normal; click to open detail modal */}
                    <div className="flex-shrink-0 w-28 text-right">
                      {isRefreshing ? (
                        <div className="text-xs opacity-40">Fetching…</div>
                      ) : isRateLimited ? (
                        <button className="text-xs text-orange-500 underline" onClick={(e) => { e.stopPropagation(); handleRefreshSlabPrice(it); }}>Rate limited</button>
                      ) : !sp ? (
                        <button className="text-xs px-2 py-1 rounded-lg border font-medium border-purple-300 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/20 whitespace-nowrap" onClick={(e) => { e.stopPropagation(); handleRefreshSlabPrice(it); }}>Get Price</button>
                      ) : isStale ? (
                        <div>
                          <div className="flex items-center justify-end gap-0.5">
                            <button className="text-sm font-semibold opacity-40 hover:opacity-70 inv-price" onClick={(e) => { e.stopPropagation(); setPricingDetailItem({ item: it, slabKey: slabKey! }); setSoldExpanded(false); }}>{fmv != null ? fmt(fmv) : "—"} <span className="text-[10px]">🕐</span></button>
                            <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted opacity-40 hover:opacity-80 transition-colors" title="Refresh price from eBay" onClick={(e) => { e.stopPropagation(); handleRefreshSlabPrice(it); }}>↺</button>
                          </div>
                          <div className="text-[10px] opacity-30">eBay</div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center justify-end gap-0.5">
                            <button className="text-sm font-semibold hover:text-purple-500 transition-colors inv-price" onClick={(e) => { e.stopPropagation(); setPricingDetailItem({ item: it, slabKey: slabKey! }); setSoldExpanded(false); }}>{fmv != null ? fmt(fmv) : "—"}</button>
                            <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted opacity-40 hover:opacity-80 transition-colors" title="Refresh price from eBay" onClick={(e) => { e.stopPropagation(); handleRefreshSlabPrice(it); }}>↺</button>
                          </div>
                          {sp.sold_count > 0 && (
                            <div className="text-[10px] opacity-40">{sp.sold_count} sold{sp.sold_count < 3 && <span className="text-orange-400 ml-1">low</span>}</div>
                          )}
                          <div className="text-[10px] opacity-30">eBay</div>
                        </div>
                      )}
                    </div>
                    {/* Cost — clickable to set if missing */}
                    <div className="hidden sm:block flex-shrink-0 w-16 text-right text-sm">
                      {inlineCostId === it.id ? (
                        <input
                          autoFocus
                          className="w-14 border rounded px-1 py-0.5 text-xs text-right bg-background inv-price"
                          value={inlineCostVal}
                          inputMode="decimal"
                          onChange={(e) => setInlineCostVal(e.target.value)}
                          onBlur={() => handleSaveInlineCost(it.id)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleSaveInlineCost(it.id); if (e.key === "Escape") setInlineCostId(null); }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : it.cost != null ? (
                        <span className="opacity-70 inv-price">{fmt(it.cost)}</span>
                      ) : (
                        <button className="text-xs opacity-30 hover:opacity-70 underline" onClick={(e) => { e.stopPropagation(); setInlineCostId(it.id); setInlineCostVal(""); }}>set cost</button>
                      )}
                    </div>
                    {/* Margin — $amount + % + acquisition badge */}
                    <div className="hidden sm:block flex-shrink-0 w-24 text-right text-xs font-medium inv-price">
                      {marginAmt != null && marginPct != null ? (
                        <span className={marginPct >= 0 ? "text-green-500" : "text-red-500"}>
                          {marginPct >= 0 ? "+" : ""}{fmt(marginAmt)} <span className="opacity-70">({marginPct >= 0 ? "+" : ""}{marginPct.toFixed(0)}%)</span>
                        </span>
                      ) : <span className="opacity-30">—</span>}
                      {it.acquisition_type && (
                        <div className="mt-0.5 flex items-center justify-end gap-1">
                          <span
                            className={`text-[9px] px-1 py-0.5 rounded font-bold font-mono ${
                              it.acquisition_type === "trade"
                                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                            }`}
                            title={it.acquisition_type === "trade"
                              ? `Trade chain depth ${it.chain_depth}${it.original_cash_invested != null ? `, orig. cash: $${it.original_cash_invested.toFixed(2)}` : ""}`
                              : `Bought at ${it.buy_percentage != null ? it.buy_percentage + "%" : "custom price"}`}
                          >
                            {it.acquisition_type === "trade" ? `T${it.chain_depth > 0 ? it.chain_depth : ""}` : "B"}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      <button className="text-xs px-2 py-1.5 rounded-lg border font-medium hover:bg-muted transition-colors duration-150" onClick={(e) => { e.stopPropagation(); openEdit(it); }} disabled={busy}>Edit</button>
                    </div>
                  </div>
                );
              }))}
            </>
            {/* Raw Cards section */}
            <>
              <button
                className="w-full px-3 py-2 bg-blue-500/5 dark:bg-blue-500/8 border-b border-blue-500/10 flex items-center gap-2 hover:bg-blue-500/10 transition-colors duration-150 text-left"
                onClick={() => setRawCollapsed((v) => !v)}
              >
                <span className="text-[9px] opacity-40 w-3">{rawCollapsed ? "▶" : "▼"}</span>
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-blue-600 dark:text-blue-400 inv-label">Raw Cards</span>
                <span className="text-[11px] bg-blue-500/15 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-semibold tabular-nums">{displayedRawCards.length}</span>
              </button>
              {!rawCollapsed && (displayedRawCards.length === 0 ? (
                <div className="px-3 py-5 text-center text-xs opacity-40">
                  {items.some((i) => i.category !== "slab" && i.status !== "grading") ? "No raw cards match your filters" : "No raw cards yet"}
                </div>
              ) : displayedRawCards.map((it) => {
                const isSelected = selectedIds.has(it.id);
                const consigner = it.consigner_id ? consignerMap.get(it.consigner_id) : null;
                const rawKey = makeRawCardPriceKey(it.name, it.set_name, it.card_number);
                const rcp = mergedRawCardPrices[rawKey];
                const condPrice = rcp
                  ? priceForCondition({ nm: rcp.nm_price, lp: rcp.lp_price, mp: rcp.mp_price, hp: rcp.hp_price, dmg: rcp.dmg_price }, it.condition)
                  : null;
                // Use condition price if available; fall back to items.market
                const displayPrice = condPrice ?? it.market;
                const marginAmt = displayPrice != null && it.cost != null && it.cost > 0 ? displayPrice - it.cost : null;
                const marginPct = displayPrice != null && it.cost != null && it.cost > 0 ? ((displayPrice - it.cost) / it.cost) * 100 : null;
                const isRawRefreshing = rawCardRefreshing[it.id];
                return (
                  <div
                    key={it.id}
                    className={`inv-row-raw flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors duration-150 ${isSelected ? "bg-green-500/8 dark:bg-green-500/10" : "hover:bg-muted/40"}`}
                    onClick={() => toggleSelect(it.id)}
                  >
                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(it.id)} onClick={(e) => e.stopPropagation()} className="w-4 h-4 accent-green-600 flex-shrink-0" />
                    <div className="flex-shrink-0 w-10">
                      {it.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.image_url} alt={it.name} className="w-10 h-14 rounded-lg object-cover shadow-md ring-1 ring-black/10 dark:ring-white/5" />
                      ) : (
                        <div className="w-10 h-14 rounded-lg bg-muted flex items-center justify-center ring-1 ring-black/5 dark:ring-white/5"><span className="text-[10px] opacity-30">?</span></div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 max-w-[45%] space-y-0.5">
                      <div className="text-sm font-semibold leading-tight truncate inv-label">{it.name}</div>
                      {(it.set_name || it.card_number) && (
                        <div className="text-xs opacity-50 truncate">{[it.set_name, it.card_number ? `#${it.card_number}` : ""].filter(Boolean).join(" · ")}</div>
                      )}
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${categoryColors[it.category]}`}>{it.category}</span>
                        {it.category === "single" && it.condition && <span className="text-xs opacity-50">{it.condition}</span>}
                        {consigner ? (
                          <span className="text-xs opacity-40 border rounded px-1 py-0.5">{consigner.name}</span>
                        ) : it.owner !== "shared" ? (
                          <span className="text-xs opacity-40 border rounded px-1 py-0.5">{it.owner}</span>
                        ) : null}
                      </div>
                    </div>
                    {/* Quick links */}
                    <div className="hidden sm:flex flex-col gap-0.5 w-[72px] flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const q = buildRawEbayQuery(it.name, it.set_name, it.card_number);
                        const enc = encodeURIComponent(q);
                        const cleanName = it.name.replace(/\b(JP|JPN|EN|ENG|Japanese|English)\b\s*/gi, "").trim();
                        const tcgQ = encodeURIComponent([cleanName, it.set_name].filter(Boolean).join(" "));
                        return (
                          <>
                            <a href={`https://www.ebay.com/sch/i.html?_nkw=${enc}&LH_Complete=1&LH_Sold=1&_sacat=183454`} target="_blank" rel="noopener noreferrer"
                               className="text-[11px] py-[3px] px-2 rounded border border-white/10 dark:border-white/8 bg-white/5 dark:bg-white/4 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all duration-150 text-center whitespace-nowrap">
                              eBay Sold
                            </a>
                            <a href={`https://www.ebay.com/sch/i.html?_nkw=${enc}&_sacat=183454`} target="_blank" rel="noopener noreferrer"
                               className="text-[11px] py-[3px] px-2 rounded border border-white/10 dark:border-white/8 bg-white/5 dark:bg-white/4 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all duration-150 text-center whitespace-nowrap">
                              eBay List
                            </a>
                            <a href={`https://www.tcgplayer.com/search/pokemon/product?q=${tcgQ}&view=grid`} target="_blank" rel="noopener noreferrer"
                               className="text-[11px] py-[3px] px-2 rounded border border-white/10 dark:border-white/8 bg-white/5 dark:bg-white/4 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all duration-150 text-center whitespace-nowrap">
                              TCGPlayer
                            </a>
                          </>
                        );
                      })()}
                    </div>
                    <div className="flex-shrink-0 w-28 text-right">
                      {isRawRefreshing ? (
                        <div className="text-xs opacity-40">Fetching…</div>
                      ) : !rcp ? (
                        <button
                          className="text-xs px-2 py-1 rounded-lg border font-medium border-blue-300 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20 whitespace-nowrap"
                          onClick={(e) => { e.stopPropagation(); handleRefreshRawCardPrice(it); }}
                        >Get Price</button>
                      ) : (
                        <div>
                          <div className="flex items-center justify-end gap-0.5">
                            <button
                              className="text-sm font-semibold hover:text-blue-500 transition-colors inv-price"
                              onClick={(e) => { e.stopPropagation(); openRawCardModal(it); }}
                            >{fmt(displayPrice)}</button>
                            <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted opacity-40 hover:opacity-80 transition-colors" title="Refresh price from TCGPlayer" onClick={(e) => { e.stopPropagation(); handleRefreshRawCardPrice(it); }}>↺</button>
                          </div>
                          <div className="text-[10px] opacity-30">TCGPlayer</div>
                        </div>
                      )}
                    </div>
                    {/* Cost — inline editable */}
                    <div className="hidden sm:block flex-shrink-0 w-16 text-right text-sm">
                      {inlineCostId === it.id ? (
                        <input
                          autoFocus
                          className="w-14 border rounded px-1 py-0.5 text-xs text-right bg-background inv-price"
                          value={inlineCostVal}
                          inputMode="decimal"
                          onChange={(e) => setInlineCostVal(e.target.value)}
                          onBlur={() => handleSaveInlineCost(it.id)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleSaveInlineCost(it.id); if (e.key === "Escape") setInlineCostId(null); }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : it.cost != null ? (
                        <span className="opacity-70 inv-price">{fmt(it.cost)}</span>
                      ) : (
                        <button className="text-xs opacity-30 hover:opacity-70 underline" onClick={(e) => { e.stopPropagation(); setInlineCostId(it.id); setInlineCostVal(""); }}>set cost</button>
                      )}
                    </div>
                    {/* Margin */}
                    <div className="hidden sm:block flex-shrink-0 w-24 text-right text-xs font-medium inv-price">
                      {marginAmt != null && marginPct != null ? (
                        <span className={marginPct >= 0 ? "text-green-500" : "text-red-500"}>
                          {marginPct >= 0 ? "+" : ""}{fmt(marginAmt)} <span className="opacity-70">({marginPct >= 0 ? "+" : ""}{marginPct.toFixed(0)}%)</span>
                        </span>
                      ) : <span className="opacity-30">—</span>}
                      {it.acquisition_type && (
                        <div className="mt-0.5 flex items-center justify-end gap-1">
                          <span
                            className={`text-[9px] px-1 py-0.5 rounded font-bold font-mono ${
                              it.acquisition_type === "trade"
                                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                            }`}
                            title={it.acquisition_type === "trade"
                              ? `Trade chain depth ${it.chain_depth}${it.original_cash_invested != null ? `, orig. cash: $${it.original_cash_invested.toFixed(2)}` : ""}`
                              : `Bought at ${it.buy_percentage != null ? it.buy_percentage + "%" : "custom price"}`}
                          >
                            {it.acquisition_type === "trade" ? `T${it.chain_depth > 0 ? it.chain_depth : ""}` : "B"}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      <button className="text-xs px-2 py-1.5 rounded-lg border font-medium hover:bg-muted transition-colors duration-150" onClick={(e) => { e.stopPropagation(); openEdit(it); }} disabled={busy}>Edit</button>
                    </div>
                  </div>
                );
              }))}
            </>
          </div>
        )}

        {/* GRID VIEW — visual browsing only */}
        {inventoryOpen && viewMode === "grid" && (
          <div className="p-3 space-y-4">
            {/* Slabs grid */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400">Slabs</span>
                <span className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 px-1.5 py-0.5 rounded-full font-medium">{displayedSlabs.length}</span>
              </div>
              {displayedSlabs.length === 0 ? (
                <div className="py-6 text-center text-xs opacity-40">
                  {items.some((i) => i.category === "slab" && i.status !== "grading") ? "No slabs match your filters" : "No slabs yet"}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                  {displayedSlabs.map((it) => {
                    const isSelected = selectedIds.has(it.id);
                    const marketColor = it.market != null && it.cost != null
                      ? it.market >= it.cost ? "text-green-600" : "text-red-500"
                      : "opacity-60";
                    return (
                      <div
                        key={it.id}
                        className={`border rounded-xl overflow-hidden flex flex-col transition-colors cursor-pointer ${isSelected ? "border-green-500 ring-1 ring-green-500" : "hover:border-foreground/30"}`}
                        onClick={() => toggleSelect(it.id)}
                      >
                        <CardImage src={it.image_url} name={it.name} setName={it.set_name} cardNumber={it.card_number} onUpload={(file) => handleUploadImage(it, file)} />
                        <div className="px-2 py-1.5 flex flex-col gap-1">
                          <div className="flex items-center justify-between gap-1">
                            <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(it.id)} onClick={(e) => e.stopPropagation()} className="w-3.5 h-3.5 accent-green-600 flex-shrink-0" />
                            {it.grade && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${gradeStyle(it.grade)}`}>{it.grade}</span>}
                          </div>
                          <div className="text-xs font-semibold leading-tight truncate">{it.name}</div>
                          <div className="text-xs">
                            <span className="opacity-50">{it.cost != null ? fmt(it.cost) : "—"} → </span>
                            <span className={`font-medium ${marketColor}`}>{fmt(it.market)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Raw Cards grid */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Raw Cards</span>
                <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-1.5 py-0.5 rounded-full font-medium">{displayedRawCards.length}</span>
              </div>
              {displayedRawCards.length === 0 ? (
                <div className="py-6 text-center text-xs opacity-40">
                  {items.some((i) => i.category !== "slab" && i.status !== "grading") ? "No raw cards match your filters" : "No raw cards yet"}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                  {displayedRawCards.map((it) => {
                    const isSelected = selectedIds.has(it.id);
                    const rawKey = makeRawCardPriceKey(it.name, it.set_name, it.card_number);
                    const rcp = mergedRawCardPrices[rawKey];
                    const condPrice = rcp
                      ? priceForCondition({ nm: rcp.nm_price, lp: rcp.lp_price, mp: rcp.mp_price, hp: rcp.hp_price, dmg: rcp.dmg_price }, it.condition)
                      : null;
                    const displayPrice = condPrice ?? it.market;
                    const marketColor = displayPrice != null && it.cost != null
                      ? displayPrice >= it.cost ? "text-green-600" : "text-red-500"
                      : "opacity-60";
                    return (
                      <div
                        key={it.id}
                        className={`border rounded-xl overflow-hidden flex flex-col transition-colors cursor-pointer ${isSelected ? "border-green-500 ring-1 ring-green-500" : "hover:border-foreground/30"}`}
                        onClick={() => toggleSelect(it.id)}
                      >
                        <CardImage src={it.image_url} name={it.name} setName={it.set_name} cardNumber={it.card_number} onUpload={(file) => handleUploadImage(it, file)} />
                        <div className="px-2 py-1.5 flex flex-col gap-1">
                          <div className="flex items-center justify-between gap-1">
                            <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(it.id)} onClick={(e) => e.stopPropagation()} className="w-3.5 h-3.5 accent-green-600 flex-shrink-0" />
                          </div>
                          <div className="text-xs font-semibold leading-tight truncate">{it.name}</div>
                          <div className="text-xs">
                            <span className="opacity-50">{it.cost != null ? fmt(it.cost) : "—"} → </span>
                            <span className={`font-medium ${marketColor}`}>{fmt(displayPrice)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Grading section */}
      {gradingItems.length > 0 && (
        <div className="border rounded-xl overflow-hidden">
          <div className="px-3 py-2.5 border-b flex items-center gap-2">
            <span className="font-medium text-sm">Grading</span>
            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
              {gradingItems.length}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-3">
            {gradingItems.map((it) => (
              <div key={it.id} className="border rounded-xl p-3 flex flex-col gap-2">
                <CardImage
                  src={it.image_url}
                  name={it.name}
                  setName={it.set_name}
                  cardNumber={it.card_number}
                  onUpload={(file) => handleUploadImage(it, file)}
                />
                <div className="font-semibold text-sm leading-tight line-clamp-2">{it.name}</div>
                {(it.set_name || it.card_number) && (
                  <div className="text-xs opacity-60 truncate">
                    {[it.set_name, it.card_number ? `#${it.card_number}` : ""].filter(Boolean).join(" · ")}
                  </div>
                )}

                {/* Cost / Market */}
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <div className="bg-muted/30 rounded-lg px-2 py-1.5">
                    <div className="opacity-50 mb-0.5">Cost</div>
                    <div className="font-medium">{fmt(it.cost)}</div>
                  </div>
                  <div className="bg-muted/30 rounded-lg px-2 py-1.5">
                    <div className="opacity-50 mb-0.5">Market</div>
                    <div className="font-medium">{fmt(it.market)}</div>
                  </div>
                </div>

                {/* PSA 10 eBay lookup */}
                {(() => {
                  const psa = psa10Data[it.id];
                  if (!psa || (!psa.loading && !psa.fetched)) {
                    return (
                      <button
                        type="button"
                        className="w-full text-xs py-2 rounded-lg border font-medium border-yellow-300 text-yellow-700 hover:bg-yellow-50 dark:hover:bg-yellow-950/20"
                        onClick={() => fetchPsa10(it.id, it.name, it.set_name)}
                      >
                        Get PSA 10 Value
                      </button>
                    );
                  }
                  if (psa.loading) {
                    return (
                      <div className="w-full text-xs py-2 rounded-lg border text-center opacity-50">
                        Fetching PSA 10…
                      </div>
                    );
                  }
                  // Fetched
                  if (psa.medianPrice == null) {
                    return (
                      <div className="text-xs text-center opacity-50 py-1">
                        {psa.rateLimited ? "eBay rate limited — wait a moment" : "No PSA 10 sales found"}
                        <button
                          className="block w-full mt-1 underline"
                          onClick={() => fetchPsa10(it.id, it.name, it.set_name)}
                        >
                          Retry
                        </button>
                      </div>
                    );
                  }
                  const pct =
                    it.market != null && it.market > 0
                      ? ((psa.medianPrice - it.market) / it.market) * 100
                      : null;
                  return (
                    <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg px-2 py-1.5 text-xs">
                      <div className="flex items-center justify-between gap-1">
                        <span className="opacity-60">PSA 10 ({psa.count} sales)</span>
                        <button
                          className="opacity-40 hover:opacity-70 text-[10px]"
                          onClick={() => fetchPsa10(it.id, it.name, it.set_name)}
                          title="Refresh"
                        >
                          ↺
                        </button>
                      </div>
                      <div className="font-semibold text-yellow-800 dark:text-yellow-300 mt-0.5">
                        {fmt(psa.medianPrice)}
                        {pct != null && (
                          <span className={`ml-2 text-[11px] font-medium ${pct >= 0 ? "text-green-600" : "text-red-500"}`}>
                            {pct >= 0 ? "+" : ""}{pct.toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <div className="mt-auto pt-1">
                  <button
                    className="w-full text-xs py-2.5 rounded-lg border font-medium"
                    onClick={() => onQuickStatus(it.id, "inventory")}
                    disabled={busy}
                  >
                    Return to Inventory
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fixed bottom selection bar — thumbnails left, actions right */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-background border-t shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
          <div className="flex items-center gap-2 px-3 py-2">
            {/* Thumbnails — scrollable */}
            <div className="flex-1 overflow-x-auto min-w-0">
              <div className="flex gap-2" style={{ minWidth: "max-content" }}>
                {selectedItems.map((it) => (
                  <button
                    key={it.id}
                    className="flex flex-col items-center gap-0.5 w-14 group flex-shrink-0"
                    onClick={() => toggleSelect(it.id)}
                    title={`Deselect ${it.name}`}
                  >
                    <div className="relative w-14">
                      {it.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.image_url} alt={it.name} className="w-14 h-auto rounded-md ring-2 ring-green-500 object-cover" />
                      ) : (
                        <div className="w-14 h-[3.5rem] rounded-md bg-muted/40 flex items-center justify-center ring-2 ring-green-500">
                          <span className="text-xs opacity-30">?</span>
                        </div>
                      )}
                      <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-foreground/80 text-background text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity leading-none select-none">
                        ×
                      </div>
                    </div>
                    <span className="text-[10px] opacity-50 w-full text-center truncate leading-tight">
                      {it.name.split(" ").slice(0, 2).join(" ")}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {/* Action buttons — fixed right side */}
            <div className="flex-shrink-0 flex flex-col items-end gap-1.5 pl-3 border-l">
              <span className="text-xs font-medium opacity-60">{selectedIds.size} selected</span>
              <div className="flex items-center gap-1.5">
                <button className="text-xs px-2.5 py-1 rounded-lg bg-green-600 text-white font-medium" onClick={() => setSellOpen(true)} disabled={busy}>Sell</button>
                <button className="text-xs px-2.5 py-1 rounded-lg border font-medium" onClick={() => setBulkCostOpen(true)} disabled={busy}>Set Cost</button>
                <button className="text-xs px-2.5 py-1 rounded-lg border font-medium" onClick={() => setMassEditOpen(true)} disabled={busy}>Edit</button>
                <button className="text-xs px-2.5 py-1 rounded-lg border border-red-300 text-red-600 font-medium" onClick={() => setDeleteOpen(true)} disabled={busy}>Del</button>
                <button className="text-xs px-2 py-1 rounded-lg border opacity-60" onClick={clearSelection}>Clear</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) closeEdit(); }}>
          <div className="bg-background border rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Edit item</div>
              <button className="text-sm opacity-60 px-2 py-1" onClick={closeEdit}>✕</button>
            </div>
            <ItemFormFields form={editForm} setForm={setEditForm} consigners={consigners} />
            <button
              type="button"
              className="w-full px-4 py-2 rounded-lg border text-sm font-medium border-purple-300 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/20"
              onClick={() => setEditImagePickerOpen(true)}
              disabled={busy}
            >
              Find Image
            </button>
            {editForm.category === "single" && editingItem?.status !== "grading" && (
              <button
                type="button"
                className="w-full px-4 py-2 rounded-lg border text-sm font-medium border-orange-300 text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/20"
                onClick={handleGradeItem}
                disabled={busy}
              >
                Send to Grading
              </button>
            )}
            {deleteConfirm ? (
              <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                <span className="text-sm flex-1 text-red-700">Delete this item?</span>
                <button
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium"
                  onClick={handleDeleteItem}
                  disabled={busy}
                >
                  Delete
                </button>
                <button
                  className="px-3 py-1.5 rounded-lg border text-sm"
                  onClick={() => setDeleteConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="w-full px-4 py-2 rounded-lg border text-sm font-medium border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                onClick={() => setDeleteConfirm(true)}
                disabled={busy}
              >
                Delete item
              </button>
            )}
            <div className="flex gap-2">
              <button className="flex-1 px-4 py-2 rounded-lg border font-medium" onClick={onSaveEdit} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
              <button className="px-4 py-2 rounded-lg border opacity-60" onClick={closeEdit} disabled={busy}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Mass edit modal */}
      {massEditOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setMassEditOpen(false); }}>
          <div className="bg-background border rounded-2xl w-full max-w-sm p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Edit {selectedIds.size} items</div>
              <button className="text-sm opacity-60 px-2 py-1" onClick={() => setMassEditOpen(false)}>✕</button>
            </div>
            <div className="text-xs opacity-50">Leave a field as &quot;— no change —&quot; to keep existing values.</div>
            <div className="space-y-3">
              <div>
                <div className="text-xs opacity-60 mb-1">Owner</div>
                <select className="w-full border rounded-lg px-3 py-2 text-sm bg-background" value={massOwner} onChange={(e) => setMassOwner(e.target.value)}>
                  <option value="">— no change —</option>
                  <option value="shared">Shared</option>
                  <option value="alex">Alex</option>
                  <option value="mila">Mila</option>
                  {consigners.length > 0 && (
                    <optgroup label="Consigners">
                      {consigners.map((c) => (
                        <option key={c.id} value={`consigner:${c.id}`}>{c.name} ({Math.round(c.rate * 100)}%)</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
              <div>
                <div className="text-xs opacity-60 mb-1">Status</div>
                <select className="w-full border rounded-lg px-3 py-2 text-sm bg-background" value={massStatus} onChange={(e) => setMassStatus(e.target.value)}>
                  <option value="">— no change —</option>
                  <option value="inventory">Inventory</option>
                          <option value="grading">Grading</option>
                </select>
              </div>
              <div>
                <div className="text-xs opacity-60 mb-1">Category</div>
                <select className="w-full border rounded-lg px-3 py-2 text-sm bg-background" value={massCategory} onChange={(e) => setMassCategory(e.target.value)}>
                  <option value="">— no change —</option>
                  <option value="single">Single</option>
                  <option value="slab">Slab</option>
                  <option value="sealed">Sealed</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="flex-1 px-4 py-2 rounded-lg border font-medium disabled:opacity-40"
                onClick={onMassEdit}
                disabled={busy || (!massOwner && !massStatus && !massCategory)}
              >
                {busy ? "Saving…" : `Apply to ${selectedIds.size} items`}
              </button>
              <button className="px-4 py-2 rounded-lg border opacity-60" onClick={() => setMassEditOpen(false)} disabled={busy}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setDeleteOpen(false); }}>
          <div className="bg-background border rounded-2xl w-full max-w-sm p-4 space-y-4">
            <div className="font-semibold">Delete {selectedIds.size} item{selectedIds.size !== 1 ? "s" : ""}?</div>
            <div className="text-sm opacity-60">This cannot be undone.</div>
            <div className="flex gap-2">
              <button className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white font-medium disabled:opacity-40" onClick={onBulkDelete} disabled={busy}>
                {busy ? "Deleting…" : `Delete ${selectedIds.size} item${selectedIds.size !== 1 ? "s" : ""}`}
              </button>
              <button className="px-4 py-2 rounded-lg border opacity-60" onClick={() => setDeleteOpen(false)} disabled={busy}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Sell modal */}
      {sellOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setSellOpen(false); }}>
          <div className="bg-background border rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Sell {selectedItems.length} item{selectedItems.length !== 1 ? "s" : ""}</div>
              <button className="text-sm opacity-60 px-2 py-1" onClick={() => setSellOpen(false)}>✕</button>
            </div>

            <div className="rounded-xl border overflow-hidden">
              {selectedItems.map((it, i) => {
                const consigner = it.consigner_id ? consignerMap.get(it.consigner_id) : null;
                const proportional = salePriceNum > 0 ? getProportionalPrice(it) : null;
                return (
                  <div key={it.id} className={`px-3 py-2 ${i > 0 ? "border-t" : ""}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium text-xs">{it.name}</div>
                        <div className="text-xs opacity-50">{it.category} • Market: {fmt(it.market)}</div>
                      </div>
                      <div className="text-xs font-semibold ml-3 shrink-0 text-green-600">
                        {proportional != null ? fmt(proportional) : "—"}
                      </div>
                    </div>
                    {consigner && proportional != null && (
                      <div className="text-xs opacity-50 mt-0.5">
                        {consigner.name} gets {fmt(proportional * consigner.rate)} · you keep {fmt(proportional * (1 - consigner.rate))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium">Total sale price ($)</label>
                {totalMarket > 0 && (
                  <button
                    type="button"
                    className="text-xs text-primary font-medium hover:underline"
                    onClick={() => setSalePrice(totalMarket.toFixed(2))}
                  >
                    Use market {fmt(totalMarket)}
                  </button>
                )}
              </div>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                placeholder="0.00"
                inputMode="decimal"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                autoFocus
              />
              <div className="text-xs opacity-50 mt-1">Split proportionally by market value</div>
            </div>

            <div className="flex gap-2">
              <button className="flex-1 px-4 py-2 rounded-lg bg-green-600 text-white font-medium disabled:opacity-40" onClick={onConfirmSale} disabled={busy || salePriceNum <= 0}>
                {busy ? "Saving…" : "Confirm Sale"}
              </button>
              <button className="px-4 py-2 rounded-lg border opacity-60" onClick={() => setSellOpen(false)} disabled={busy}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk cost modal */}
      {bulkCostOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setBulkCostOpen(false); }}>
          <div className="bg-background border rounded-2xl w-full max-w-sm p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Set Cost — {selectedIds.size} card{selectedIds.size !== 1 ? "s" : ""}</div>
              <button className="text-sm opacity-60 px-2 py-1" onClick={() => setBulkCostOpen(false)}>✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs opacity-60 mb-1 block">
                  {bulkCostSplit ? "Total amount paid (split evenly)" : "Cost per card"}
                </label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                  placeholder="0.00"
                  inputMode="decimal"
                  value={bulkCostVal}
                  onChange={(e) => setBulkCostVal(e.target.value)}
                  autoFocus
                />
                {bulkCostSplit && toNum(bulkCostVal) != null && (
                  <div className="text-xs opacity-50 mt-1">
                    = {fmt(Math.round((toNum(bulkCostVal)! / selectedIds.size) * 100) / 100)} per card
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={bulkCostSplit}
                  onChange={(e) => setBulkCostSplit(e.target.checked)}
                  className="accent-blue-600"
                />
                Split total evenly across {selectedIds.size} cards
              </label>
            </div>
            <div className="flex gap-2">
              <button
                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-40"
                onClick={onBulkSetCost}
                disabled={busy || !bulkCostVal || toNum(bulkCostVal) === null}
              >
                {busy ? "Saving…" : `Apply to ${selectedIds.size} cards`}
              </button>
              <button className="px-4 py-2 rounded-lg border opacity-60" onClick={() => setBulkCostOpen(false)} disabled={busy}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pricing Detail Modal ───────────────────────────────────────────── */}
      {pricingDetailItem && (() => {
        const { item: pdi, slabKey } = pricingDetailItem;
        // Derive sp live from merged prices so background updates are reflected immediately
        const pdSp = mergedSlabPrices[slabKey];
        const isModalRefreshing = slabRefreshing[pdi.id];
        const fmvVal = pdSp ? (pdSp.fair_market_value ?? pdSp.sold_median ?? pdSp.median_price) : null;

        // Helpers
        function fmtModalDate(d: string) {
          if (!d) return "—";
          const dt = new Date(d);
          if (isNaN(dt.getTime())) return "—";
          return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
        }

        function calcMedianPrice(items: SlabSale[]): number | null {
          const prices = items.map((s) => s.price).sort((a, b) => a - b);
          if (!prices.length) return null;
          const mid = Math.floor(prices.length / 2);
          return prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];
        }

        function applyOutlierFilter(items: SlabSale[]): SlabSale[] {
          const median = calcMedianPrice(items);
          if (median == null || median === 0) return items;
          return items.filter((s) => s.price >= median * 0.2 && s.price <= median * 2.5);
        }

        function timeLeft(endDateStr: string): string {
          if (!endDateStr) return "";
          const ms = new Date(endDateStr).getTime() - Date.now();
          if (ms <= 0) return "Ended";
          if (ms < 60 * 60 * 1000) return "Ending soon";
          const totalHours = Math.floor(ms / (60 * 60 * 1000));
          const mins = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
          if (totalHours < 24) return `${totalHours}h ${mins}m left`;
          const days = Math.floor(totalHours / 24);
          const hrs = totalHours % 24;
          return `${days}d ${hrs}h left`;
        }

        // Build filtered, sorted lists
        const validSold = (pdSp?.sold_items ?? []).filter((s) => !s.isBestOffer && s.price > 1);
        const soldLists = applyOutlierFilter(validSold)
          .sort((a, b) => new Date(b.soldDate).getTime() - new Date(a.soldDate).getTime())
          .slice(0, 20);

        const validActive = (pdSp?.active_items ?? []).filter((s) => !s.isBestOffer && s.price > 1);
        const activeLists = applyOutlierFilter(validActive).sort((a, b) => a.price - b.price);

        return (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
            onClick={() => setPricingDetailItem(null)}
          >
            <div
              className="bg-background rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-4 pt-4 pb-3 border-b flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-sm leading-tight truncate">{pdi.name}</div>
                  {(pdi.set_name || pdi.card_number) && (
                    <div className="text-xs opacity-50 mt-0.5">{[pdi.set_name, pdi.card_number ? `#${pdi.card_number}` : ""].filter(Boolean).join(" · ")}</div>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {pdi.grade && <span className={`text-xs px-1.5 py-0.5 rounded-full ${gradeStyle(pdi.grade)}`}>{pdi.grade}</span>}
                    {fmvVal != null && (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-base font-bold">{fmt(fmvVal)}</span>
                        <span className="text-[10px] opacity-40 font-normal">
                          {pdSp?.sold_median != null ? "Fair Market Value" : "Listed FMV (ask price)"}
                        </span>
                      </div>
                    )}
                    {fmvVal == null && <span className="text-sm opacity-40">No price data</span>}
                  </div>
                </div>
                <button className="text-lg opacity-40 hover:opacity-70 flex-shrink-0 -mt-0.5" onClick={() => setPricingDetailItem(null)}>✕</button>
              </div>

              {/* Scrollable body */}
              <div className="overflow-y-auto flex-1 divide-y">
                {/* Recent Sales */}
                <div className="px-4 py-3">
                  <div className="text-xs font-semibold opacity-50 uppercase tracking-wider mb-2">Recent Sales · eBay</div>
                  {soldLists.length === 0 ? (
                    <div className="text-sm opacity-40 text-center py-3">
                      {isModalRefreshing
                        ? "Fetching…"
                        : pdSp?.sold_items != null
                          ? "Sold data unavailable — Marketplace Insights API access required"
                          : "No sold data — hit ↺ Refresh to load"
                      }
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {soldLists.slice(0, soldExpanded ? soldLists.length : 5).map((s, i) => (
                        <a
                          key={i}
                          href={s.itemUrl || undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center justify-between gap-2 rounded px-1.5 py-1 -mx-1.5 transition-colors group ${s.itemUrl ? "hover:bg-muted/40 cursor-pointer" : "cursor-default"}`}
                          onClick={s.itemUrl ? undefined : (e) => e.preventDefault()}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            {(s.buyingOptions ?? []).includes("AUCTION")
                              ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium flex-shrink-0">Auction</span>
                              : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium flex-shrink-0">Fixed</span>
                            }
                            <span className="text-xs opacity-50 truncate">{s.title}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs opacity-40">{fmtModalDate(s.soldDate)}</span>
                            <span className="text-sm font-semibold tabular-nums">{fmt(s.price)}</span>
                            {s.itemUrl && <span className="text-[10px] opacity-20 group-hover:opacity-50 transition-opacity">↗</span>}
                          </div>
                        </a>
                      ))}
                      {soldLists.length > 5 && (
                        <button
                          className="w-full text-xs text-center py-1.5 opacity-40 hover:opacity-70 transition-opacity"
                          onClick={() => setSoldExpanded((v) => !v)}
                        >
                          {soldExpanded ? "Show less" : `View more (${soldLists.length - 5} more)`}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Active Listings */}
                <div className="px-4 py-3">
                  <div className="text-xs font-semibold opacity-50 uppercase tracking-wider mb-2">Active Listings · eBay</div>
                  {activeLists.length === 0 ? (
                    <div className="text-sm opacity-40 text-center py-3">{isModalRefreshing ? "Fetching…" : "No active listings — hit ↺ Refresh to load"}</div>
                  ) : (
                    <div className="space-y-1">
                      {activeLists.map((s, i) => {
                        const isAuction = (s.buyingOptions ?? []).includes("AUCTION");
                        return (
                          <a
                            key={i}
                            href={s.itemUrl || undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center justify-between gap-2 rounded px-1.5 py-1 -mx-1.5 transition-colors group ${s.itemUrl ? "hover:bg-muted/40 cursor-pointer" : "cursor-default"}`}
                            onClick={s.itemUrl ? undefined : (e) => e.preventDefault()}
                          >
                            <div className="flex flex-col gap-0.5 min-w-0">
                              {isAuction ? (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Auction</span>
                                  {s.soldDate && <span className="text-[10px] opacity-50">{timeLeft(s.soldDate)}</span>}
                                  {s.bidCount != null && <span className="text-[10px] opacity-50">{s.bidCount} bid{s.bidCount !== 1 ? "s" : ""}</span>}
                                </div>
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium w-fit">Fixed price</span>
                              )}
                              <span className="text-xs opacity-50 truncate">{s.title}</span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className="text-sm font-semibold tabular-nums">{fmt(s.price)}</span>
                              {s.itemUrl && <span className="text-[10px] opacity-20 group-hover:opacity-50 transition-opacity">↗</span>}
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="px-4 py-3 border-t flex items-center justify-between gap-2">
                <div className="text-xs opacity-40">
                  {pdSp?.last_updated ? `Updated ${fmtModalDate(pdSp.last_updated)}` : ""}
                  {isSlabTierStale(pdSp, fmvVal) && <span className="text-orange-400 ml-1">· stale</span>}
                </div>
                <button
                  className="text-xs px-3 py-1.5 rounded-lg border font-medium border-purple-300 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/20 disabled:opacity-40"
                  disabled={isModalRefreshing}
                  onClick={() => handleRefreshSlabPrice(pdi)}
                >
                  {isModalRefreshing ? "Fetching…" : "↺ Refresh"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Raw Card Pricing Modal ────────────────────────────────────────── */}
      {rawCardDetailItem && (() => {
        const it = rawCardDetailItem;
        const rawKey = makeRawCardPriceKey(it.name, it.set_name, it.card_number);
        const rcp = mergedRawCardPrices[rawKey];
        const isRefreshing = rawCardRefreshing[it.id];

        const CONDITIONS: { label: string; key: "nm" | "lp" | "mp" | "hp" | "dmg" }[] = [
          { label: "Near Mint",          key: "nm"  },
          { label: "Lightly Played",     key: "lp"  },
          { label: "Moderately Played",  key: "mp"  },
          { label: "Heavily Played",     key: "hp"  },
          { label: "Damaged",            key: "dmg" },
        ];

        const priceByKey: Record<string, number | null> = rcp
          ? { nm: rcp.nm_price, lp: rcp.lp_price, mp: rcp.mp_price, hp: rcp.hp_price, dmg: rcp.dmg_price }
          : { nm: null, lp: null, mp: null, hp: null, dmg: null };

        const itemCondKey = CONDITIONS.find((c) => c.label === it.condition)?.key ?? "nm";

        function fmtModalDate(d: string) {
          if (!d) return "—";
          const dt = new Date(d);
          if (isNaN(dt.getTime())) return "—";
          return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
        }

        return (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
            onClick={() => setRawCardDetailItem(null)}
          >
            <div
              className="bg-background rounded-t-2xl sm:rounded-2xl w-full max-w-sm shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-4 pt-4 pb-3 border-b flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-sm leading-tight truncate">{it.name}</div>
                  {(it.set_name || it.card_number) && (
                    <div className="text-xs opacity-50 mt-0.5">{[it.set_name, it.card_number ? `#${it.card_number}` : ""].filter(Boolean).join(" · ")}</div>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {it.condition && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800">{it.condition}</span>
                    )}
                    {rcp && priceByKey[itemCondKey] != null && (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-base font-bold">{fmt(priceByKey[itemCondKey])}</span>
                        <span className="text-[10px] opacity-40 font-normal">Market Value</span>
                      </div>
                    )}
                    {(!rcp || priceByKey[itemCondKey] == null) && (
                      <span className="text-sm opacity-40">{isRefreshing ? "Fetching…" : "No price data"}</span>
                    )}
                  </div>
                </div>
                <button className="text-lg opacity-40 hover:opacity-70 flex-shrink-0 -mt-0.5" onClick={() => setRawCardDetailItem(null)}>✕</button>
              </div>

              {/* Condition price table */}
              <div className="px-4 py-3">
                <div className="text-xs font-semibold opacity-50 uppercase tracking-wider mb-2">Condition Prices · TCGPlayer</div>
                {!rcp ? (
                  <div className="text-sm opacity-40 text-center py-3">
                    {isRefreshing ? "Fetching…" : "No price data — hit ↺ Refresh to load"}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {CONDITIONS.map(({ label, key }) => {
                      const price = priceByKey[key];
                      const isItemCondition = key === itemCondKey;
                      return (
                        <div
                          key={key}
                          className={`flex items-center justify-between px-2 py-1.5 rounded-lg ${isItemCondition ? "bg-blue-50 dark:bg-blue-950/30 ring-1 ring-blue-200 dark:ring-blue-800" : ""}`}
                        >
                          <span className={`text-sm ${isItemCondition ? "font-semibold text-blue-700 dark:text-blue-300" : "opacity-70"}`}>
                            {label}
                            {isItemCondition && <span className="ml-1.5 text-[10px] opacity-60">← this card</span>}
                          </span>
                          <span className={`text-sm tabular-nums ${isItemCondition ? "font-bold text-blue-700 dark:text-blue-300" : "opacity-70"}`}>
                            {price != null ? fmt(price) : "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Price history chart */}
              {(() => {
                const allHistory: { date: string; price: number }[] = rcp?.price_history ?? [];
                const DURATIONS: { label: string; key: "7d" | "30d" | "90d" | "180d"; days: number }[] = [
                  { label: "7d",  key: "7d",  days: 7   },
                  { label: "30d", key: "30d", days: 30  },
                  { label: "90d", key: "90d", days: 90  },
                  { label: "180d",key: "180d",days: 180 },
                ];
                const cutoffDate = new Date();
                const selectedDays = DURATIONS.find((d) => d.key === historyDuration)?.days ?? 90;
                cutoffDate.setDate(cutoffDate.getDate() - selectedDays);
                const cutoffStr = cutoffDate.toISOString().slice(0, 10);
                const filtered = allHistory.filter((p) => p.date >= cutoffStr);

                // Percentage change: first → last point
                const pctChange = filtered.length >= 2
                  ? ((filtered[filtered.length - 1].price - filtered[0].price) / filtered[0].price) * 100
                  : null;
                const lineColor = pctChange == null ? "#a855f7" : pctChange >= 0 ? "#22c55e" : "#ef4444";

                // X-axis tick formatter — show M/D
                function fmtTick(dateStr: string) {
                  const p = dateStr.split("-");
                  return `${Number(p[1])}/${Number(p[2])}`;
                }

                return (
                  <div className="px-4 py-3 border-t">
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <div className="text-xs font-semibold opacity-50 uppercase tracking-wider">Price History · NM</div>
                      <div className="flex items-center gap-1">
                        {pctChange != null && (
                          <span className={`text-xs font-semibold tabular-nums mr-1 ${pctChange >= 0 ? "text-green-500" : "text-red-500"}`}>
                            {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(1)}%
                          </span>
                        )}
                        {DURATIONS.map((d) => (
                          <button
                            key={d.key}
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                              historyDuration === d.key
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                                : "opacity-40 hover:opacity-70"
                            }`}
                            onClick={() => setHistoryDuration(d.key)}
                          >{d.label}</button>
                        ))}
                      </div>
                    </div>
                    {allHistory.length === 0 ? (
                      <div className="text-xs opacity-30 text-center py-4">
                        {isRefreshing ? "Fetching…" : "No history — hit ↺ Refresh to load"}
                      </div>
                    ) : filtered.length < 3 ? (
                      <div className="text-xs opacity-30 text-center py-4">Not enough history for this period</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={110}>
                        <LineChart data={filtered} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" vertical={false} />
                          <XAxis
                            dataKey="date"
                            tickFormatter={fmtTick}
                            tick={{ fontSize: 9, opacity: 0.45 }}
                            tickLine={false}
                            axisLine={false}
                            interval="preserveStartEnd"
                            minTickGap={40}
                          />
                          <YAxis
                            tick={{ fontSize: 9, opacity: 0.45 }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(v: number) => `$${v % 1 === 0 ? v : v.toFixed(2)}`}
                            domain={["auto", "auto"]}
                            width={48}
                          />
                          <Tooltip
                            contentStyle={{ fontSize: 11, borderRadius: 6, border: "none", background: "var(--background)", boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}
                            formatter={(v: number | undefined) => [v != null ? `$${v.toFixed(2)}` : "—", "NM Price"]}
                            labelFormatter={(label: unknown) => {
                              const s = String(label ?? "");
                              const p = s.split("-");
                              return `${Number(p[1])}/${Number(p[2])}/${p[0]}`;
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="price"
                            stroke={lineColor}
                            strokeWidth={1.5}
                            dot={false}
                            activeDot={{ r: 3, fill: lineColor }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                );
              })()}

              {/* Footer */}
              <div className="px-4 py-3 border-t flex items-center justify-between gap-2">
                <div className="text-xs opacity-40">
                  {rcp?.last_updated ? `Updated ${fmtModalDate(rcp.last_updated)}` : ""}
                  {rcp?.printing && rcp.printing !== "Normal" && (
                    <span className="ml-1 opacity-60">· {rcp.printing}</span>
                  )}
                </div>
                <button
                  className="text-xs px-3 py-1.5 rounded-lg border font-medium border-blue-300 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20 disabled:opacity-40"
                  disabled={isRefreshing}
                  onClick={() => handleRefreshRawCardPrice(it)}
                >
                  {isRefreshing ? "Fetching…" : "↺ Refresh"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
