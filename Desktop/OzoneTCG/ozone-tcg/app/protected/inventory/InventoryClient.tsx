"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Camera, Search, Plus, List, Grid2X2 } from "lucide-react";
import { subscribeWorkspaceTable } from "@/lib/supabase/realtime";
import { createItem, createItems, deleteItem, deleteItems, updateItem, markItemsAsSold, massUpdateItems, refreshItemPrice, fetchCardData, uploadItemImage, refreshSlabPrice, getEbayDailyCallCount, refreshRawCardPrice, refreshSealedPrice, type RefreshedSlabPrice, type RefreshedRawCardPrice } from "./actions";
import type { SlabPrice, RawCardPrice } from "./InventoryServer";
import { makeSlabPriceKey, parseGrade } from "@/lib/ebay-client";
import { makeRawCardPriceKey, priceForCondition } from "@/lib/justtcg";
import { computeBlendedFMV, type FMVResult, type PricingStrategyOverride } from "@/lib/fmv";
import CardScanner, { type ScanResult } from "@/components/CardScanner";
import CardSearchPicker, { type CardSearchResult } from "@/components/CardSearchPicker";
import type { Category, Owner, Status, SortKey, ConsignerOption, Item, ItemForm, StagedItem, Psa10Entry } from "./types";
import {
  toNum, fmt, effectiveCost, getMovement,
  EBAY_DAILY_BUDGET, EBAY_BUDGET_WARN_PCT, getSlabTierMs, isSlabTierStale, blankForm, itemToForm, nullLast,
} from "./utils";
import { PricingDetailModal, RawPricingModal } from "./components/PricingModals";
import { MobileDetailModal, MobileFilterSheet } from "./components/MobileSheets";
import { EditItemModal, MassEditModal, BulkDeleteModal, SellModal, BulkCostModal } from "./components/InventoryModals";
import InventoryListView from "./components/InventoryListView";
import InventoryGridView from "./components/InventoryGridView";
import GradingSection from "./components/GradingSection";
import AddItemPanel from "./components/AddItemPanel";

export default function InventoryClient({
  items,
  consigners,
  workspaceId,
  slabPrices,
  rawCardPrices,
  pricingStrategy = "auto",
  gradingCost = 20,
}: {
  items: Item[];
  consigners: ConsignerOption[];
  workspaceId: string;
  slabPrices: Record<string, SlabPrice>;
  rawCardPrices: Record<string, RawCardPrice>;
  pricingStrategy?: PricingStrategyOverride;
  gradingCost?: number;
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
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [cardSearchOpen, setCardSearchOpen] = useState(false);
  const [editImagePickerOpen, setEditImagePickerOpen] = useState(false);

  // Inline find state (for the add form)
  const [findBusy, setFindBusy] = useState(false);
  const [findConfirmed, setFindConfirmed] = useState<string | null>(null);
  const [findError, setFindError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // PSA 10 eBay price lookup state per grading item
  const [psa10Data, setPsa10Data] = useState<Record<string, Psa10Entry>>({});

  // Slab pricing refresh state per inventory slab
  const [slabRefreshing, setSlabRefreshing] = useState<Record<string, boolean>>({});
  const [slabRateLimited, setSlabRateLimited] = useState<Record<string, boolean>>({});

  // Inline cost editing
  const [inlineCostId, setInlineCostId] = useState<string | null>(null);
  const [inlineCostVal, setInlineCostVal] = useState("");

  // Inline ask price editing
  const [inlineAskId, setInlineAskId] = useState<string | null>(null);
  const [inlineAskVal, setInlineAskVal] = useState("");

  // Mobile UX
  const [mobileDetailItem, setMobileDetailItem] = useState<Item | null>(null);
  const [fabOpen, setFabOpen] = useState(false);

  // Pricing detail modal — store item + slabKey; derive sp live from slabPrices prop so refresh updates it
  const [pricingDetailItem, setPricingDetailItem] = useState<{ item: Item; slabKey: string } | null>(null);
  const [soldExpanded, setSoldExpanded] = useState(false);
  const [activeExpanded, setActiveExpanded] = useState(false);

  // Sealed pricing refresh state
  const [sealedRefreshing, setSealedRefreshing] = useState<Record<string, boolean>>({});

  // Raw card pricing state
  const [rawCardRefreshing, setRawCardRefreshing] = useState<Record<string, boolean>>({});
  const [rawCardPriceOverrides, setRawCardPriceOverrides] = useState<Record<string, RawCardPrice>>({});
  const [priceFlash, setPriceFlash] = useState<Record<string, "up" | "down">>({});
  const mergedRawCardPrices = useMemo(
    () => ({ ...rawCardPrices, ...rawCardPriceOverrides }),
    [rawCardPrices, rawCardPriceOverrides]
  );
  const [rawCardDetailItem, setRawCardDetailItem] = useState<Item | null>(null);
  const [historyDuration, setHistoryDuration] = useState<"7d" | "30d" | "90d" | "180d">("90d");

  // Collapsible section state
  const [slabsCollapsed, setSlabsCollapsed] = useState(false);
  const [sealedCollapsed, setSealedCollapsed] = useState(false);
  const [rawCollapsed, setRawCollapsed] = useState(false);

  // Quick filter pills
  const [filterNoPrice, setFilterNoPrice] = useState(false);
  const [filterNoCost, setFilterNoCost] = useState(false);
  const [filterHighValue, setFilterHighValue] = useState(false);
  const [filterLowConf, setFilterLowConf] = useState(false);
  const [filterStale, setFilterStale] = useState(false);
  const [filterRising, setFilterRising] = useState(false);
  const [filterDropping, setFilterDropping] = useState(false);

  // Bulk cost entry
  const [bulkCostOpen, setBulkCostOpen] = useState(false);
  const [bulkCostVal, setBulkCostVal] = useState("");
  const [bulkCostSplit, setBulkCostSplit] = useState(false);

  const openRawCardModal = useCallback((it: Item) => {
    setRawCardDetailItem(it);
    setHistoryDuration("90d");
  }, []);

  // Body scroll lock when mobile detail sheet is open
  useEffect(() => {
    if (mobileDetailItem) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileDetailItem]);

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
      const fmv = slabFMVData[it.id]?.fmv ?? null;
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

  // Blended FMV: weighted average of sold median and active listing Q1 for every slab.
  const slabFMVData = useMemo(() => {
    const result: Record<string, FMVResult> = {};
    for (const it of items) {
      if (it.category !== "slab" || !it.grade) continue;
      const parsed = parseGrade(it.grade);
      if (!parsed) continue;
      const key = makeSlabPriceKey(it.name, it.set_name, it.card_number, parsed.company, parsed.grade);
      const sp = mergedSlabPrices[key];
      if (!sp) {
        result[it.id] = { fmv: it.market, mode: "none", soldAnchor: null, listedAnchor: null, soldCount: 0, activeCount: 0 };
        continue;
      }
      const validSold = (sp.sold_items ?? []).filter(
        (s) => !(s.buyingOptions.length === 1 && s.buyingOptions[0] === "BEST_OFFER") && s.price > 1
      );
      const validActive = (sp.active_items ?? []).filter((s) => s.price > 1);
      result[it.id] = computeBlendedFMV(validSold, validActive);
    }
    return result;
  }, [items, mergedSlabPrices]);

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
  const [manualPrices, setManualPrices] = useState<Record<string, string>>({});

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

  // Auto-fetch PSA 10 values for all grading items on mount (and when grading list changes)
  useEffect(() => {
    for (const it of gradingItems) {
      if (!psa10Data[it.id]) {
        fetchPsa10(it.id, it.name, it.set_name);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gradingItems]);

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
          const getFmv = (it: Item) => slabFMVData[it.id]?.fmv ?? null;
          return nullLast(getFmv(a), getFmv(b), sort === "fmv-asc");
        }
        case "margin-asc":
        case "margin-desc": {
          const getMargin = (it: Item) => {
            const ec = effectiveCost(it);
            if (ec == null || ec === 0) return null;
            let price = it.market;
            if (it.category === "slab" && it.grade) {
              price = slabFMVData[it.id]?.fmv ?? it.market;
            }
            if (price == null) return null;
            return (price - ec) / ec;
          };
          return nullLast(getMargin(a), getMargin(b), sort === "margin-asc");
        }
        case "movement-asc":
        case "movement-desc": {
          const getItemMovement = (it: Item) => {
            let current = it.market;
            if (it.category === "slab" && it.grade) {
              current = slabFMVData[it.id]?.fmv ?? it.market;
            }
            return getMovement(current, it.acquired_market_price);
          };
          return nullLast(getItemMovement(a), getItemMovement(b), sort === "movement-asc");
        }
        default: return 0;
      }
    });
    return result;
  }, [items, search, filterCategory, filterStatus, filterOwner, filterConsigner, sort, slabPrices, slabFMVData]);

  // Pill filter counts — computed from base filtered set before pills applied
  const pillCounts = useMemo(() => {
    let noPrice = 0, noCost = 0, highValue = 0, lowConf = 0, stale = 0, rising = 0, dropping = 0;
    for (const it of displayedItems) {
      if (effectiveCost(it) == null) noCost++;
      let currentPrice = it.market;
      if (it.category === "slab" && it.grade) {
        const parsed = parseGrade(it.grade);
        const key = parsed ? makeSlabPriceKey(it.name, it.set_name, it.card_number, parsed.company, parsed.grade) : null;
        const sp = key ? mergedSlabPrices[key] : null;
        const fmv = slabFMVData[it.id]?.fmv ?? null;
        currentPrice = fmv ?? it.market;
        if (!sp) noPrice++;
        if (fmv != null && fmv > 200) highValue++;
        if (sp && (sp.sold_count > 0 ? sp.sold_count : sp.comp_count) < 3) lowConf++;
        if (isSlabTierStale(sp, fmv)) stale++;
      } else if (it.category === "sealed") {
        currentPrice = it.market;
        if (it.market == null) noPrice++;
        if (it.market != null && it.market > 200) highValue++;
      } else {
        const rawKey = makeRawCardPriceKey(it.name, it.set_name, it.card_number);
        const rcp = mergedRawCardPrices[rawKey];
        const condPrice = rcp ? priceForCondition({ nm: rcp.nm_price, lp: rcp.lp_price, mp: rcp.mp_price, hp: rcp.hp_price, dmg: rcp.dmg_price }, it.condition) : null;
        currentPrice = condPrice ?? it.market;
        if (!rcp) noPrice++;
        if (condPrice != null && condPrice > 200) highValue++;
        if (!rcp || Date.now() - new Date(rcp.last_updated).getTime() > 24 * 60 * 60 * 1000) stale++;
      }
      const mvt = getMovement(currentPrice, it.acquired_market_price);
      if (mvt != null && mvt > 10) rising++;
      if (mvt != null && mvt < -10) dropping++;
    }
    return { noPrice, noCost, highValue, lowConf, stale, rising, dropping };
  }, [displayedItems, mergedSlabPrices, mergedRawCardPrices]);

  // Apply active pill filters on top of base filters
  const filteredDisplayedItems = useMemo(() => {
    if (!filterNoPrice && !filterNoCost && !filterHighValue && !filterLowConf && !filterStale && !filterRising && !filterDropping) return displayedItems;
    return displayedItems.filter((it) => {
      if (filterNoCost && effectiveCost(it) != null) return false;
      let currentPrice = it.market;
      if (it.category === "slab" && it.grade) {
        const parsed = parseGrade(it.grade);
        const key = parsed ? makeSlabPriceKey(it.name, it.set_name, it.card_number, parsed.company, parsed.grade) : null;
        const sp = key ? mergedSlabPrices[key] : null;
        const fmv = slabFMVData[it.id]?.fmv ?? null;
        currentPrice = fmv ?? it.market;
        if (filterNoPrice && sp) return false;
        if (filterHighValue && !(fmv != null && fmv > 200)) return false;
        if (filterLowConf && !(sp && (sp.sold_count > 0 ? sp.sold_count : sp.comp_count) < 3)) return false;
        if (filterStale && !isSlabTierStale(sp, fmv)) return false;
      } else if (it.category === "sealed") {
        currentPrice = it.market;
        if (filterNoPrice && it.market != null) return false;
        if (filterHighValue && !(it.market != null && it.market > 200)) return false;
        if (filterLowConf) return false;
        if (filterStale) return false; // sealed staleness not tracked separately
      } else {
        const rawKey = makeRawCardPriceKey(it.name, it.set_name, it.card_number);
        const rcp = mergedRawCardPrices[rawKey];
        const condPrice = rcp ? priceForCondition({ nm: rcp.nm_price, lp: rcp.lp_price, mp: rcp.mp_price, hp: rcp.hp_price, dmg: rcp.dmg_price }, it.condition) : null;
        currentPrice = condPrice ?? it.market;
        if (filterNoPrice && rcp) return false;
        if (filterHighValue && !(condPrice != null && condPrice > 200)) return false;
        if (filterLowConf) return false; // low confidence only applies to slabs
        if (filterStale && rcp && Date.now() - new Date(rcp.last_updated).getTime() <= 24 * 60 * 60 * 1000) return false;
      }
      const mvt = getMovement(currentPrice, it.acquired_market_price);
      if (filterRising && !(mvt != null && mvt > 10)) return false;
      if (filterDropping && !(mvt != null && mvt < -10)) return false;
      return true;
    });
  }, [displayedItems, filterNoPrice, filterNoCost, filterHighValue, filterLowConf, filterStale, filterRising, filterDropping, mergedSlabPrices, mergedRawCardPrices]);

  // Inventory value summary
  const inventorySummary = useMemo(() => {
    let slabValue = 0, sealedValue = 0, rawValue = 0;
    let totalCost = 0, costedCount = 0, costedMarketValue = 0;
    const totalCount = displayedItems.length;
    for (const it of displayedItems) {
      let price: number | null = null;
      let itemMarketContrib = 0;
      if (it.category === "slab" && it.grade) {
        price = slabFMVData[it.id]?.fmv ?? it.market;
        itemMarketContrib = price ?? 0;
        slabValue += itemMarketContrib;
      } else if (it.category === "sealed") {
        price = it.market;
        itemMarketContrib = (price ?? 0) * (it.quantity ?? 1);
        sealedValue += itemMarketContrib;
      } else {
        const rawKey = makeRawCardPriceKey(it.name, it.set_name, it.card_number);
        const rcp = mergedRawCardPrices[rawKey];
        price = rcp
          ? (priceForCondition({ nm: rcp.nm_price, lp: rcp.lp_price, mp: rcp.mp_price, hp: rcp.hp_price, dmg: rcp.dmg_price }, it.condition) ?? it.market)
          : it.market;
        itemMarketContrib = price ?? 0;
        rawValue += itemMarketContrib;
      }
      // Only count cost for cards that actually have cost data (never count $0 from missing cost)
      const ec = effectiveCost(it);
      if (ec != null) {
        totalCost += ec;
        costedCount++;
        costedMarketValue += itemMarketContrib;
      }
    }
    const total = slabValue + sealedValue + rawValue;
    // Profit is calculated only over cards with known cost — avoids inflating profit with uncosted cards
    const profit = costedMarketValue - totalCost;
    const profitPct = totalCost > 0 ? (profit / totalCost) * 100 : null;
    return { slabValue, sealedValue, rawValue, total, totalCost, costedCount, totalCount, profit, profitPct };
  }, [displayedItems, slabFMVData, mergedRawCardPrices]);

  const displayedSlabs = useMemo(() => filteredDisplayedItems.filter((it) => it.category === "slab"), [filteredDisplayedItems]);
  const displayedSealed = useMemo(() => filteredDisplayedItems.filter((it) => it.category === "sealed"), [filteredDisplayedItems]);
  const displayedRawCards = useMemo(() => filteredDisplayedItems.filter((it) => it.category === "single"), [filteredDisplayedItems]);

  const selectedItems = useMemo(
    () => items.filter((it) => selectedIds.has(it.id)),
    [items, selectedIds]
  );

  const totalMarket = selectedItems.reduce((s, it) => s + (it.market ?? 0), 0);
  const salePriceNum = parseFloat(salePrice) || 0;

  /** Compute the displayed/final price for a single item, respecting manual locks. */
  function getCardPrice(it: Item): number {
    if (manualPrices[it.id] !== undefined) return parseFloat(manualPrices[it.id]) || 0;
    const manualSum = selectedItems.reduce((s, other) => {
      const mp = manualPrices[other.id];
      return s + (mp !== undefined ? parseFloat(mp) || 0 : 0);
    }, 0);
    const autoItems = selectedItems.filter((other) => manualPrices[other.id] === undefined);
    const autoMarketSum = autoItems.reduce((s, other) => s + (other.market ?? 0), 0);
    const remaining = salePriceNum - manualSum;
    const m = it.market ?? 0;
    if (autoMarketSum > 0) return Math.round((m / autoMarketSum) * remaining * 100) / 100;
    return autoItems.length > 0 ? Math.round((remaining / autoItems.length) * 100) / 100 : 0;
  }

  /** Lock a card at a manually entered price, and sync the total. */
  function updateCardPrice(id: string, value: string) {
    const newManual = { ...manualPrices, [id]: value };
    setManualPrices(newManual);
    // Recompute total: sum of manual prices + auto-fill for the rest (using current total)
    const currentTotal = parseFloat(salePrice) || 0;
    const manualSum = selectedItems.reduce((s, it) => {
      const mp = newManual[it.id];
      return s + (mp !== undefined ? parseFloat(mp) || 0 : 0);
    }, 0);
    const autoItems = selectedItems.filter((it) => newManual[it.id] === undefined);
    const autoMarketSum = autoItems.reduce((s, it) => s + (it.market ?? 0), 0);
    const remaining = currentTotal - manualSum;
    let autoSum = 0;
    for (const autoIt of autoItems) {
      const m = autoIt.market ?? 0;
      const price = autoMarketSum > 0
        ? Math.round((m / autoMarketSum) * remaining * 100) / 100
        : autoItems.length > 0 ? Math.round((remaining / autoItems.length) * 100) / 100 : 0;
      autoSum += price;
    }
    const newTotal = manualSum + autoSum;
    setSalePrice(newTotal.toFixed(2));
  }

  /** Remove manual lock; auto-fill takes over (total unchanged). */
  function resetCardPrice(id: string) {
    const newManual = { ...manualPrices };
    delete newManual[id];
    setManualPrices(newManual);
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
    setManualPrices({});
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

  function openAddPreset(category: Category) {
    setAddForm({ ...blankForm(), category });
    setAddOpen(true);
    setInventoryOpen(true);
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
          sticker_price: toNum(item.stickerPrice),
          product_type: item.category === "sealed" ? (item.productType || null) : null,
          quantity: item.category === "sealed" ? (parseInt(item.quantity) || 1) : 1,
          language: item.category === "sealed" ? (item.language || "english") : "english",
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
        sticker_price: toNum(editForm.stickerPrice),
        product_type: editForm.category === "sealed" ? (editForm.productType || null) : null,
        quantity: editForm.category === "sealed" ? (parseInt(editForm.quantity) || 1) : 1,
        language: editForm.category === "sealed" ? (editForm.language || "english") : "english",
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
      const perCardPrices: Record<string, number> = {};
      for (const it of selectedItems) perCardPrices[it.id] = getCardPrice(it);
      await markItemsAsSold(Array.from(selectedIds), salePriceNum, perCardPrices);
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

  async function handleRefreshSealedPrice(it: Item) {
    setSealedRefreshing((prev) => ({ ...prev, [it.id]: true }));
    try {
      await refreshSealedPrice(it.id, it.name, it.set_name ?? null);
      router.refresh();
    } catch (err) {
      console.error("[sealed price refresh] error:", err instanceof Error ? err.message : err);
    } finally {
      setSealedRefreshing((prev) => ({ ...prev, [it.id]: false }));
    }
  }

  async function handleRefreshRawCardPrice(it: Item) {
    const lookupKey = makeRawCardPriceKey(it.name, it.set_name, it.card_number);
    const oldPrice = mergedRawCardPrices[lookupKey];
    const oldNm = oldPrice?.nm_price ?? null;
    setRawCardRefreshing((prev) => ({ ...prev, [it.id]: true }));
    try {
      const result = await refreshRawCardPrice(
        it.id, it.name, it.condition ?? null, it.set_name ?? null, it.card_number ?? null
      );
      if (result.updated && result.refreshedPrice) {
        setRawCardPriceOverrides((prev) => ({ ...prev, [result.refreshedPrice!.lookup_key]: result.refreshedPrice! as RawCardPrice }));
        const newNm = result.refreshedPrice.nm_price ?? null;
        if (newNm != null && oldNm != null) {
          const dir = newNm > oldNm ? "up" : newNm < oldNm ? "down" : null;
          if (dir) {
            setPriceFlash((prev) => ({ ...prev, [it.id]: dir }));
            setTimeout(() => setPriceFlash((prev) => { const n = { ...prev }; delete n[it.id]; return n; }), 700);
          }
        }
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

  async function handleSaveInlineAsk(id: string) {
    const n = toNum(inlineAskVal);
    setInlineAskId(null);
    setInlineAskVal("");
    if (n !== null) await updateItem(id, { market: n });
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

      {/* Add form — collapsible (hidden on mobile unless open) */}
      <AddItemPanel
        addOpen={addOpen}
        setAddOpen={setAddOpen}
        setScanOpen={setScanOpen}
        consigners={consigners}
        addForm={addForm}
        setAddForm={setAddForm}
        setFindConfirmed={setFindConfirmed}
        findConfirmed={findConfirmed}
        handleAddFormFind={handleAddFormFind}
        onAddToList={onAddToList}
        stagedItems={stagedItems}
        setStagedItems={setStagedItems}
        onSaveAll={onSaveAll}
        busy={busy}
      />

      {/* Search / filter / sort — collapsible */}
      {/* Search & Filter — collapsible (hidden on mobile unless open) */}
      <div className={`border rounded-xl overflow-hidden ${!searchOpen ? "hidden md:block" : ""}`}>
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
              ><List size={13} /></button>
              <button
                className={`px-2 py-1 transition-colors duration-150 ${viewMode === "grid" ? "bg-foreground text-background" : "hover:bg-muted opacity-50 hover:opacity-100"}`}
                onClick={() => setViewMode("grid")}
                title="Grid view"
              ><Grid2X2 size={13} /></button>
            </div>
          </div>
        </div>

        {/* Persistent search — always visible on mobile when inventory is open */}
        {inventoryOpen && (
          <div className="px-3 py-2 border-b sticky top-[41px] z-10 bg-background">
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
          <>
            {/* Mobile summary — compact single row */}
            <div className="md:hidden px-3 py-2 border-b bg-muted/10 flex items-center justify-between">
              <div>
                <span className="text-base font-bold inv-price">{fmt(inventorySummary.total)}</span>
                <div className="text-[11px] opacity-50 mt-0.5 flex items-center gap-1">
                  <span className="text-purple-400">{fmt(inventorySummary.slabValue)}</span>
                  {inventorySummary.sealedValue > 0 && <><span className="opacity-40">·</span><span className="text-teal-400">{fmt(inventorySummary.sealedValue)}</span></>}
                  <span className="opacity-40">·</span>
                  <span className="text-blue-400">{fmt(inventorySummary.rawValue)}</span>
                </div>
              </div>
              {inventorySummary.totalCost > 0 && (
                <div className={`text-sm font-bold inv-price ${inventorySummary.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {inventorySummary.profit >= 0 ? "+" : ""}{fmt(inventorySummary.profit)}
                  {inventorySummary.profitPct != null && (
                    <span className="text-xs opacity-60 ml-1">({inventorySummary.profitPct >= 0 ? "+" : ""}{inventorySummary.profitPct.toFixed(0)}%)</span>
                  )}
                </div>
              )}
            </div>
            {/* Desktop summary — full scrollable row */}
            <div className="hidden md:flex px-3 py-2 border-b bg-muted/10 items-center gap-2 overflow-x-auto">
              <div className="flex flex-col flex-shrink-0 px-3 py-1.5 rounded-lg bg-muted/30">
                <span className="text-[10px] uppercase tracking-wider opacity-40 font-semibold">Total</span>
                <span className="text-sm font-bold inv-price">{fmt(inventorySummary.total)}</span>
              </div>
              <div className="w-px h-8 bg-border flex-shrink-0 opacity-20" />
              <div className="flex flex-col flex-shrink-0 px-3 py-1.5 rounded-lg bg-purple-500/8">
                <span className="text-[10px] uppercase tracking-wider text-purple-500 opacity-70 font-semibold">Slabs</span>
                <span className="text-sm font-bold text-purple-500 dark:text-purple-400 inv-price">{fmt(inventorySummary.slabValue)}</span>
              </div>
              {inventorySummary.sealedValue > 0 && (
                <div className="flex flex-col flex-shrink-0 px-3 py-1.5 rounded-lg bg-teal-500/8">
                  <span className="text-[10px] uppercase tracking-wider text-teal-500 opacity-70 font-semibold">Sealed</span>
                  <span className="text-sm font-bold text-teal-500 dark:text-teal-400 inv-price">{fmt(inventorySummary.sealedValue)}</span>
                </div>
              )}
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
                    <span className="text-[10px] opacity-30 font-medium">{inventorySummary.costedCount} costed</span>
                  </div>
                  <div className={`flex flex-col flex-shrink-0 px-3 py-1.5 rounded-lg border ${inventorySummary.profit >= 0 ? "metric-profit-positive" : "metric-profit-negative"}`}>
                    <span className={`text-[10px] uppercase tracking-wider font-semibold ${inventorySummary.profit >= 0 ? "text-emerald-400 opacity-90" : "text-red-400 opacity-90"}`}>
                      Profit
                    </span>
                    <span className={`text-base font-bold inv-label ${inventorySummary.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {inventorySummary.profit >= 0 ? "+" : ""}{fmt(inventorySummary.profit)}
                      {inventorySummary.profitPct != null && (
                        <span className="text-xs opacity-60 font-medium ml-1 inv-price">({inventorySummary.profitPct >= 0 ? "+" : ""}{inventorySummary.profitPct.toFixed(0)}%)</span>
                      )}
                    </span>
                    {inventorySummary.costedCount < inventorySummary.totalCount && (
                      <span className="text-[10px] opacity-30 font-medium">{inventorySummary.costedCount} of {inventorySummary.totalCount}</span>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
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
                { label: "▲ Rising",   count: pillCounts.rising,    active: filterRising,    toggle: () => { setFilterRising((v) => !v); setFilterDropping(false); } },
                { label: "▼ Dropping", count: pillCounts.dropping,  active: filterDropping,  toggle: () => { setFilterDropping((v) => !v); setFilterRising(false); } },
              ] as { label: string; count: number; active: boolean; toggle: () => void }[]
            ).map(({ label, count, active, toggle }) => (
              <button
                key={label}
                onClick={toggle}
                disabled={count === 0 && !active}
                className={`flex-shrink-0 text-[11px] px-3 py-1 rounded-full border font-medium transition-all duration-150 whitespace-nowrap ${
                  active
                    ? "pill-active border-violet-500"
                    : count === 0
                      ? "opacity-20 cursor-default border-border"
                      : "border-border opacity-60 hover:opacity-100 hover:border-white/20 hover:bg-muted/50"
                }`}
              >
                {label}{count > 0 ? <span className={`ml-1 ${active ? "opacity-80" : "opacity-60"}`}>({count})</span> : ""}
              </button>
            ))}
          </div>
        )}

        {/* LIST VIEW */}
        {inventoryOpen && viewMode === "list" && filteredDisplayedItems.length > 0 && (
          <InventoryListView
            items={items}
            displayedSlabs={displayedSlabs}
            displayedRawCards={displayedRawCards}
            displayedSealed={displayedSealed}
            sort={sort}
            setSort={setSort}
            selectedIds={selectedIds}
            toggleSelect={toggleSelect}
            consignerMap={consignerMap}
            mergedSlabPrices={mergedSlabPrices}
            mergedRawCardPrices={mergedRawCardPrices}
            slabFMVData={slabFMVData}
            slabRefreshing={slabRefreshing}
            slabRateLimited={slabRateLimited}
            rawCardRefreshing={rawCardRefreshing}
            sealedRefreshing={sealedRefreshing}
            priceFlash={priceFlash}
            slabsCollapsed={slabsCollapsed}
            setSlabsCollapsed={setSlabsCollapsed}
            rawCollapsed={rawCollapsed}
            setRawCollapsed={setRawCollapsed}
            sealedCollapsed={sealedCollapsed}
            setSealedCollapsed={setSealedCollapsed}
            inlineAskId={inlineAskId}
            inlineAskVal={inlineAskVal}
            setInlineAskId={setInlineAskId}
            setInlineAskVal={setInlineAskVal}
            inlineCostId={inlineCostId}
            inlineCostVal={inlineCostVal}
            setInlineCostId={setInlineCostId}
            setInlineCostVal={setInlineCostVal}
            handleSaveInlineAsk={handleSaveInlineAsk}
            handleSaveInlineCost={handleSaveInlineCost}
            handleRefreshSlabPrice={handleRefreshSlabPrice}
            handleRefreshRawCardPrice={handleRefreshRawCardPrice}
            handleRefreshSealedPrice={handleRefreshSealedPrice}
            openRawCardModal={openRawCardModal}
            setPricingDetailItem={setPricingDetailItem}
            setSoldExpanded={setSoldExpanded}
            setMobileDetailItem={setMobileDetailItem}
            openEdit={openEdit}
            openAddPreset={openAddPreset}
            busy={busy}
          />
        )}

        {/* GRID VIEW — visual browsing only */}
        {inventoryOpen && viewMode === "grid" && (
          <InventoryGridView
            items={items}
            displayedSlabs={displayedSlabs}
            displayedSealed={displayedSealed}
            displayedRawCards={displayedRawCards}
            selectedIds={selectedIds}
            toggleSelect={toggleSelect}
            setMobileDetailItem={setMobileDetailItem}
            mergedSlabPrices={mergedSlabPrices}
            mergedRawCardPrices={mergedRawCardPrices}
            slabFMVData={slabFMVData}
            handleUploadImage={handleUploadImage}
          />
        )}
      </div>

      {/* Grading section */}
      {gradingItems.length > 0 && (
        <GradingSection
          gradingItems={gradingItems}
          gradingCost={gradingCost}
          psa10Data={psa10Data}
          fetchPsa10={fetchPsa10}
          onQuickStatus={onQuickStatus}
          openEdit={openEdit}
          busy={busy}
        />
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
        <EditItemModal
          editingItem={editingItem}
          editForm={editForm}
          setEditForm={setEditForm}
          consigners={consigners}
          busy={busy}
          closeEdit={closeEdit}
          setEditImagePickerOpen={setEditImagePickerOpen}
          handleGradeItem={handleGradeItem}
          deleteConfirm={deleteConfirm}
          setDeleteConfirm={setDeleteConfirm}
          handleDeleteItem={handleDeleteItem}
          onSaveEdit={onSaveEdit}
        />
      )}

      {/* Mass edit modal */}
      {massEditOpen && (
        <MassEditModal
          selectedIds={selectedIds}
          setMassEditOpen={setMassEditOpen}
          massOwner={massOwner}
          setMassOwner={setMassOwner}
          massStatus={massStatus}
          setMassStatus={setMassStatus}
          massCategory={massCategory}
          setMassCategory={setMassCategory}
          consigners={consigners}
          busy={busy}
          onMassEdit={onMassEdit}
        />
      )}

      {/* Bulk delete confirmation */}
      {deleteOpen && (
        <BulkDeleteModal
          selectedIds={selectedIds}
          setDeleteOpen={setDeleteOpen}
          busy={busy}
          onBulkDelete={onBulkDelete}
        />
      )}

      {/* Sell modal */}
      {sellOpen && (
        <SellModal
          selectedItems={selectedItems}
          consignerMap={consignerMap}
          manualPrices={manualPrices}
          getCardPrice={getCardPrice}
          salePrice={salePrice}
          salePriceNum={salePriceNum}
          totalMarket={totalMarket}
          setSellOpen={setSellOpen}
          resetCardPrice={resetCardPrice}
          updateCardPrice={updateCardPrice}
          setSalePrice={setSalePrice}
          setManualPrices={setManualPrices}
          busy={busy}
          onConfirmSale={onConfirmSale}
        />
      )}

      {/* Bulk cost modal */}
      {bulkCostOpen && (
        <BulkCostModal
          selectedIds={selectedIds}
          setBulkCostOpen={setBulkCostOpen}
          bulkCostVal={bulkCostVal}
          setBulkCostVal={setBulkCostVal}
          bulkCostSplit={bulkCostSplit}
          setBulkCostSplit={setBulkCostSplit}
          busy={busy}
          onBulkSetCost={onBulkSetCost}
        />
      )}

      {/* ── Pricing Detail Modal ───────────────────────────────────────────── */}
      {pricingDetailItem && (
        <PricingDetailModal
          pricingDetailItem={pricingDetailItem}
          mergedSlabPrices={mergedSlabPrices}
          slabRefreshing={slabRefreshing}
          slabFMVData={slabFMVData}
          soldExpanded={soldExpanded}
          setSoldExpanded={setSoldExpanded}
          activeExpanded={activeExpanded}
          setActiveExpanded={setActiveExpanded}
          setPricingDetailItem={setPricingDetailItem}
          handleRefreshSlabPrice={handleRefreshSlabPrice}
        />
      )}

      {/* ── Raw Card Pricing Modal ────────────────────────────────────────── */}
      {rawCardDetailItem && (
        <RawPricingModal
          rawCardDetailItem={rawCardDetailItem}
          setRawCardDetailItem={setRawCardDetailItem}
          mergedRawCardPrices={mergedRawCardPrices}
          rawCardRefreshing={rawCardRefreshing}
          historyDuration={historyDuration}
          setHistoryDuration={setHistoryDuration}
          handleRefreshRawCardPrice={handleRefreshRawCardPrice}
        />
      )}

      {/* ── Mobile FAB ── */}
      <div className="md:hidden fixed bottom-20 right-4 z-30 flex flex-col items-end gap-2">
        {fabOpen && (
          <>
            <button
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-card border border-border shadow-lg text-sm font-medium whitespace-nowrap"
              onClick={() => { setFabOpen(false); setAddOpen(true); setInventoryOpen(true); setTimeout(() => document.querySelector<HTMLElement>(".border.rounded-xl")?.scrollIntoView({ behavior: "smooth" }), 50); }}
            >
              <Plus size={14} />Add Item
            </button>
            <button
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-card border border-border shadow-lg text-sm font-medium whitespace-nowrap"
              onClick={() => { setFabOpen(false); setMobileFilterOpen(true); }}
            >
              <Search size={14} />Search &amp; Filter
            </button>
            <button
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-card border border-border shadow-lg text-sm font-medium whitespace-nowrap"
              onClick={() => { setFabOpen(false); setScanOpen(true); }}
            >
              <Camera size={14} />Scan Card
            </button>
          </>
        )}
        <button
          className={`w-14 h-14 rounded-full shadow-xl flex items-center justify-center text-2xl font-bold transition-all duration-200 ${fabOpen ? "bg-foreground text-background rotate-45" : "bg-violet-600 text-white"}`}
          onClick={() => setFabOpen((v) => !v)}
        >
          +
        </button>
      </div>

      {/* ── Mobile Detail Modal ── */}
      {mobileDetailItem && (
        <MobileDetailModal
          mobileDetailItem={mobileDetailItem}
          setMobileDetailItem={setMobileDetailItem}
          mergedSlabPrices={mergedSlabPrices}
          mergedRawCardPrices={mergedRawCardPrices}
          slabFMVData={slabFMVData}
          slabRefreshing={slabRefreshing}
          rawCardRefreshing={rawCardRefreshing}
          sealedRefreshing={sealedRefreshing}
          inlineCostId={inlineCostId}
          inlineCostVal={inlineCostVal}
          setInlineCostId={setInlineCostId}
          setInlineCostVal={setInlineCostVal}
          handleSaveInlineCost={handleSaveInlineCost}
          handleRefreshSlabPrice={handleRefreshSlabPrice}
          handleRefreshSealedPrice={handleRefreshSealedPrice}
          handleRefreshRawCardPrice={handleRefreshRawCardPrice}
          setPricingDetailItem={setPricingDetailItem}
          setSoldExpanded={setSoldExpanded}
          openEdit={openEdit}
          toggleSelect={toggleSelect}
        />
      )}

      {/* ── Mobile Filter Bottom Sheet ── */}
      {mobileFilterOpen && (
        <MobileFilterSheet
          setMobileFilterOpen={setMobileFilterOpen}
          search={search}
          setSearch={setSearch}
          filterCategory={filterCategory}
          setFilterCategory={setFilterCategory}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          filterOwner={filterOwner}
          setFilterOwner={setFilterOwner}
          filterConsigner={filterConsigner}
          setFilterConsigner={setFilterConsigner}
          sort={sort}
          setSort={setSort}
          consigners={consigners}
          isFiltered={isFiltered}
        />
      )}
    </div>
  );
}
