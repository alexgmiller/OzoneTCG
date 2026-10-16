"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { computeBlendedFMV, type FMVResult } from "@/lib/fmv";
import type { SlabPrice, RawCardPrice } from "./InventoryServer";
import type { Item } from "./types";
import { EBAY_DAILY_BUDGET, EBAY_BUDGET_WARN_PCT, getSlabTierMs, isSlabTierStale, slabKeyFor, itemMarketPrice } from "./utils";
import { refreshSlabPrice, refreshSealedPrice, getEbayDailyCallCount, type RefreshedSlabPrice } from "./pricingActions";
import { refreshRawCardPrice } from "./rawPricingActions";
import type { BgStatus } from "./components/PricingStatus";

// ── Pricing state: cached prices, FMV, per-item refresh and the background slab loop ──
export function usePricing(items: Item[], slabPrices: Record<string, SlabPrice>, rawCardPrices: Record<string, RawCardPrice>) {
  const router = useRouter();

  // Local overrides let a refresh update the UI without a full router.refresh() per item
  const [slabPriceOverrides, setSlabPriceOverrides] = useState<Record<string, SlabPrice>>({});
  const [rawCardPriceOverrides, setRawCardPriceOverrides] = useState<Record<string, RawCardPrice>>({});
  const mergedSlabPrices = useMemo(() => ({ ...slabPrices, ...slabPriceOverrides }), [slabPrices, slabPriceOverrides]);
  const mergedRawCardPrices = useMemo(() => ({ ...rawCardPrices, ...rawCardPriceOverrides }), [rawCardPrices, rawCardPriceOverrides]);

  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  const [slabRateLimited, setSlabRateLimited] = useState<Record<string, boolean>>({});
  const setBusy = useCallback((id: string, v: boolean) => setRefreshing((prev) => ({ ...prev, [id]: v })), []);

  // Background loop status
  const [bgStatus, setBgStatus] = useState<BgStatus>("idle");
  const [bgStaleCount, setBgStaleCount] = useState(0);
  const [dailyCallCount, setDailyCallCount] = useState(0);
  const bgRef = useRef<{ paused: boolean; aborted: boolean }>({ paused: false, aborted: false });

  // ── Blended FMV per slab ──
  const slabFMVData = useMemo(() => {
    const result: Record<string, FMVResult> = {};
    for (const it of items) {
      const key = slabKeyFor(it);
      if (!key) continue;
      const sp = mergedSlabPrices[key];
      if (!sp) {
        result[it.id] = { fmv: it.market, mode: "none", soldAnchor: null, listedAnchor: null, soldCount: 0, activeCount: 0 };
        continue;
      }
      const validSold = (sp.sold_items ?? []).filter((s) => !(s.buyingOptions.length === 1 && s.buyingOptions[0] === "BEST_OFFER") && s.price > 1);
      const validActive = (sp.active_items ?? []).filter((s) => s.price > 1);
      result[it.id] = computeBlendedFMV(validSold, validActive);
    }
    return result;
  }, [items, mergedSlabPrices]);

  const priceFor = useCallback((it: Item) => itemMarketPrice(it, slabFMVData, mergedRawCardPrices), [slabFMVData, mergedRawCardPrices]);

  function applyRefreshedPrice(rp: RefreshedSlabPrice) {
    setSlabPriceOverrides((prev) => ({ ...prev, [rp.lookup_key]: rp as SlabPrice }));
  }

  // ── Manual refresh handlers ──
  async function handleRefreshSlabPrice(it: Item) {
    if (!it.grade) return;
    bgRef.current.paused = true; // let the manual call go first
    setBusy(it.id, true);
    setSlabRateLimited((prev) => ({ ...prev, [it.id]: false }));
    try {
      const result = await refreshSlabPrice(it.id, it.name, it.grade, it.set_name ?? null, it.card_number ?? null);
      if (result.rateLimited) setSlabRateLimited((prev) => ({ ...prev, [it.id]: true }));
      else if (result.refreshedPrice) applyRefreshedPrice(result.refreshedPrice);
      if (!result.rateLimited) router.refresh();
    } finally {
      setBusy(it.id, false);
      setTimeout(() => { bgRef.current.paused = false; }, 1500);
    }
  }

  async function handleRefreshSealedPrice(it: Item) {
    setBusy(it.id, true);
    try {
      await refreshSealedPrice(it.id, it.name, it.set_name ?? null);
      router.refresh();
    } catch (err) {
      console.error("[sealed price refresh] error:", err instanceof Error ? err.message : err);
    } finally {
      setBusy(it.id, false);
    }
  }

  async function handleRefreshRawCardPrice(it: Item) {
    setBusy(it.id, true);
    try {
      const result = await refreshRawCardPrice(it.id, it.name, it.condition ?? null, it.set_name ?? null, it.card_number ?? null);
      if (result.updated && result.refreshedPrice) {
        const rp = result.refreshedPrice;
        setRawCardPriceOverrides((prev) => ({ ...prev, [rp.lookup_key]: rp as RawCardPrice }));
      }
    } catch (err) {
      console.error("[raw card refresh] error:", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(it.id, false);
    }
  }

  function refreshItem(it: Item) {
    if (it.category === "slab") return handleRefreshSlabPrice(it);
    if (it.category === "sealed") return handleRefreshSealedPrice(it);
    return handleRefreshRawCardPrice(it);
  }

  async function refreshMany(list: Item[]) {
    for (const it of list) await refreshItem(it);
  }

  // ── Background auto-refresh loop (runs once per mount on the initial snapshot) ──
  useEffect(() => {
    bgRef.current.aborted = true;
    const ctrl = { paused: false, aborted: false };
    bgRef.current = ctrl;

    const allSlabs = items.filter((it) => it.category === "slab" && it.grade && it.status !== "grading");
    if (allSlabs.length === 0) { setBgStatus("done"); return; }

    const withFmv = allSlabs.map((it) => {
      const key = slabKeyFor(it);
      const sp = key ? slabPrices[key] : null;
      const fmv = slabFMVData[it.id]?.fmv ?? null;
      const compCount = sp ? (sp.sold_count > 0 ? sp.sold_count : sp.comp_count) : 0;
      return { item: it, sp, fmv, compCount };
    });

    const stale = withFmv.filter(({ sp, fmv }) => isSlabTierStale(sp, fmv));
    if (stale.length === 0) { setBgStatus("done"); return; }

    // No data first, then low confidence, then by value
    const rank = (x: typeof stale[number]) => (!x.sp ? 0 : x.compCount < 3 ? 1 : (x.fmv ?? 0) > 200 ? 2 : (x.fmv ?? 0) >= 50 ? 3 : 4);
    stale.sort((a, b) => rank(a) - rank(b));

    setBgStaleCount(stale.length);
    setBgStatus("running");

    async function runLoop() {
      const initialCount = await getEbayDailyCallCount();
      setDailyCallCount(initialCount);
      if (initialCount >= EBAY_DAILY_BUDGET * EBAY_BUDGET_WARN_PCT) { setBgStatus("rate_limited"); return; }

      for (const { item, fmv, compCount } of stale) {
        if (ctrl.aborted) break;
        while (ctrl.paused && !ctrl.aborted) await new Promise<void>((r) => setTimeout(r, 300));
        if (ctrl.aborted) break;

        const callCount = await getEbayDailyCallCount();
        setDailyCallCount(callCount);
        if (callCount >= EBAY_DAILY_BUDGET * EBAY_BUDGET_WARN_PCT) { setBgStatus("rate_limited"); break; }

        setBusy(item.id, true);
        try {
          const result = await refreshSlabPrice(item.id, item.name, item.grade!, item.set_name ?? null, item.card_number ?? null, getSlabTierMs(fmv, compCount));
          if (result.rateLimited) {
            setSlabRateLimited((prev) => ({ ...prev, [item.id]: true }));
            setBgStatus("rate_limited");
            break;
          }
          if (result.updated && result.refreshedPrice) applyRefreshedPrice(result.refreshedPrice);
          setBgStaleCount((n) => Math.max(0, n - 1));
        } catch {
          // Skip individual failures — continue the queue
        } finally {
          setBusy(item.id, false);
        }
        if (!ctrl.aborted) await new Promise<void>((r) => setTimeout(r, 3000)); // respectful scraping cadence
      }

      if (!ctrl.aborted) {
        setBgStatus("done");
        router.refresh(); // one sync for item.market values written server-side
      }
    }

    runLoop();
    return () => { ctrl.aborted = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    mergedSlabPrices, mergedRawCardPrices, slabFMVData, priceFor,
    refreshing, slabRateLimited,
    bgStatus, bgStaleCount, dailyCallCount,
    handleRefreshSlabPrice, handleRefreshRawCardPrice, handleRefreshSealedPrice, refreshItem, refreshMany,
  };
}
