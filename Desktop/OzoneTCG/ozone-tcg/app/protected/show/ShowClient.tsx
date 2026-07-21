"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ScanLine, ShoppingBag, DollarSign, ArrowLeftRight, Handshake, Camera, Clock } from "lucide-react";
import { type AutocompleteCard } from "@/components/CardAutocomplete";
import { type CertWidgetResult } from "@/components/CertLookupWidget";
import CardImageScanner, { type CardImageScanResult } from "@/components/CardImageScanner";
import { preloadOcrWorker } from "@/lib/ocrCardReader";
import {
  createShowSession,
  getShowSession,
  loadShowFeed,
  loadInventoryItems,
  recordShowPass,
  endShowSession,
  undoShowEntry,
  updateScanPhoto,
  type ShowSession,
  type InventorySearchResult,
} from "./actions";
import {
  offlineRecordShowBuy,
  offlineRecordShowSell,
  offlineRecordShowTrade,
  offlineAddShowExpense,
} from "@/lib/offlineAwareActions";
import {
  getPendingCount,
  type PendingAction,
} from "@/lib/offlineQueue";
import { startAutoSync } from "@/lib/offlineSync";
import { uploadDealPhoto } from "../photos/actions";
import type { GradeCompany, SortBy, PriceRange, FeedEntry, TradeComingIn, DealCard, DealStep, StagedBuy } from "./types";
import {
  BUY_PCTS,
  STORAGE_KEY,
  moneySign,
  fmtDate,
  todayDate,
  scanToFeed,
  blankTradeComingIn,
} from "./utils";
import ScanTab from "./components/ScanTab";
import BuyTab from "./components/BuyTab";
import DealTab from "./components/DealTab";
import SellTab from "./components/SellTab";
import TradeTab from "./components/TradeTab";
import {
  EndShowModal,
  ExpenseModal,
  CashCountModal,
  PendingSyncModal,
  DealPhotoModal,
} from "./components/ShowModals";
import ActivityFeed from "./components/ActivityFeed";
import ShowBanner from "./components/ShowBanner";

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  recentShows: ShowSession[];
  initialActiveSession?: ShowSession | null;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ShowClient({ recentShows, initialActiveSession }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<"loading" | "start" | "active">("loading");
  const [session, setSession] = useState<ShowSession | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [tab, setTab] = useState<"scan" | "buy" | "sell" | "deal" | "trade">("scan");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const [pendingModalActions, setPendingModalActions] = useState<PendingAction[]>([]);
  const [syncToast, setSyncToast] = useState<{ msg: string; kind: "success" | "warn" } | null>(null);

  // ── Start form ────────────────────────────────────────────────────────────

  const [startName, setStartName] = useState("");
  const [startDate, setStartDate] = useState(todayDate);
  const [startCash, setStartCash] = useState("");

  // ── Scan tab ──────────────────────────────────────────────────────────────

  const [scanResult, setScanResult] = useState<CertWidgetResult | null>(null);
  const [scanOwner, setScanOwner] = useState<"shared" | "alex" | "mila">("shared");
  const [scanMarket, setScanMarket] = useState("");
  const [scanCustomPct, setScanCustomPct] = useState("");
  const [scanShowCustom, setScanShowCustom] = useState(false);
  const [scanFlatAmount, setScanFlatAmount] = useState("");
  const [scanShowFlat, setScanShowFlat] = useState(false);

  // ── Buy tab (batch mode) ──────────────────────────────────────────────────

  const [batchQuery, setBatchQuery] = useState("");
  const [batchCard, setBatchCard] = useState<AutocompleteCard | null>(null);
  const [batchMarket, setBatchMarket] = useState("");
  const [batchCategory, setBatchCategory] = useState<"single" | "slab" | "sealed">("single");
  const [batchCondition, setBatchCondition] = useState("Near Mint");
  const [batchGradeCompany, setBatchGradeCompany] = useState<GradeCompany>("PSA");
  const [batchGradeValue, setBatchGradeValue] = useState("");
  const [batchProductType, setBatchProductType] = useState("Booster Box");
  const [batchQuantity, setBatchQuantity] = useState("1");
  const [batchOwner, setBatchOwner] = useState<"shared" | "alex" | "mila">("shared");
  const [batchPct, setBatchPct] = useState<number>(0);
  const [batchCustomPct, setBatchCustomPct] = useState("");
  const [batchFlatAmount, setBatchFlatAmount] = useState("");
  const [batchQueue, setBatchQueue] = useState<StagedBuy[]>([]);
  const [recentCards, setRecentCards] = useState<AutocompleteCard[]>([]);
  const [batchMarketLoading, setBatchMarketLoading] = useState(false);
  const [buyCertOpen, setBuyCertOpen] = useState(false);

  // ── Sell tab ──────────────────────────────────────────────────────────────

  const [sellQuery, setSellQuery] = useState("");
  const [sellCategoryFilter, setSellCategoryFilter] = useState<"all" | "single" | "slab" | "sealed">("all");
  // Multi-select sell: Map preserves item data alongside selection
  const [sellSelected, setSellSelected] = useState<Map<string, InventorySearchResult>>(new Map());
  const [sellBottomExpanded, setSellBottomExpanded] = useState(false);
  const [sellPrices, setSellPrices] = useState<Record<string, string>>({});
  const [sellPriceLocked, setSellPriceLocked] = useState<Set<string>>(new Set());
  const [sellTotalInput, setSellTotalInput] = useState("");

  // ── Trade tab ─────────────────────────────────────────────────────────────

  const [tradeInventory, setTradeInventory] = useState<InventorySearchResult[]>([]);
  const [tradeInventoryLoaded, setTradeInventoryLoaded] = useState(false);
  const [tradeInventoryQuery, setTradeInventoryQuery] = useState("");
  const [tradeGoingOut, setTradeGoingOut] = useState<{ item: InventorySearchResult; tradeValue: string }[]>([]);
  const [tradeComingIn, setTradeComingIn] = useState<TradeComingIn[]>(() => [blankTradeComingIn()]);
  const [tradeCashOverride, setTradeCashOverride] = useState("");
  const [tradeCashDir, setTradeCashDir] = useState<"received" | "paid">("received");
  const [tradeNotes, setTradeNotes] = useState("");
  const [tradeBottomExpanded, setTradeBottomExpanded] = useState(false);
  const [tradeCategoryFilter, setTradeCategoryFilter] = useState<"all" | "single" | "slab" | "sealed">("all");
  const [tradeSortBy, setTradeSortBy] = useState<"name" | "price-high" | "price-low" | "recent">("name");
  const [tradePriceRange, setTradePriceRange] = useState<"all" | "under25" | "25to100" | "100to500" | "over500">("all");
  const [sellSortBy, setSellSortBy] = useState<"name" | "price-high" | "price-low" | "recent">("name");
  const [sellPriceRange, setSellPriceRange] = useState<"all" | "under25" | "25to100" | "100to500" | "over500">("all");

  // ── Deal tab ──────────────────────────────────────────────────────────────

  const [dealCards, setDealCards] = useState<DealCard[]>([]);
  const [dealStep, setDealStep] = useState<DealStep>("evaluate");
  const [dealCashPct, setDealCashPct] = useState(70);
  const [dealTradePct, setDealTradePct] = useState(85);
  const [dealTradeSelections, setDealTradeSelections] = useState<{ item: InventorySearchResult; tradeValue: string }[]>([]);
  const [dealCustomerChoice, setDealCustomerChoice] = useState<"undecided" | "all-cash" | "all-trade" | "split">("undecided");
  const [dealAddName, setDealAddName] = useState("");
  const [dealAddCard, setDealAddCard] = useState<import("@/components/CardAutocomplete").AutocompleteCard | null>(null);
  const [dealAddGrade, setDealAddGrade] = useState("");
  const [dealAddCondition, setDealAddCondition] = useState("Near Mint");
  const [dealAddMarket, setDealAddMarket] = useState("");
  const [dealInventoryQuery, setDealInventoryQuery] = useState("");
  const [dealInventoryFilter, setDealInventoryFilter] = useState<"all" | "single" | "slab" | "sealed">("all");
  const [dealSortBy, setDealSortBy] = useState<SortBy>("name");
  const [dealPriceRange, setDealPriceRange] = useState<PriceRange>("all");
  const [dealCertOpen, setDealCertOpen] = useState(false);
  const [dealInventoryShowMore, setDealInventoryShowMore] = useState(false);
  const [dealFulfillExpanded, setDealFulfillExpanded] = useState(false);
  const [dealCompleteSummary, setDealCompleteSummary] = useState<{ scanId: string; cashOut: number; tradeValue: number } | null>(null);

  // ── End show modal ────────────────────────────────────────────────────────

  const [endOpen, setEndOpen] = useState(false);
  const [endStep, setEndStep] = useState<"preview" | "finalize">("preview");
  const [actualCash, setActualCash] = useState("");

  // ── Expense modal ─────────────────────────────────────────────────────────

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseDesc, setExpenseDesc] = useState("");
  const [expenseCost, setExpenseCost] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("other");
  const [expensePaidBy, setExpensePaidBy] = useState<"alex" | "mila">("alex");

  // ── Cash count modal ──────────────────────────────────────────────────────

  const [cashCountOpen, setCashCountOpen] = useState(false);
  const [cashCountInput, setCashCountInput] = useState("");

  // ── Stats bar ─────────────────────────────────────────────────────────────

  const [statsExpanded, setStatsExpanded] = useState(false);
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const [tradeShowMore, setTradeShowMore] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // ── Card image scanner ────────────────────────────────────────────────────

  // Which tab triggered the scanner: "buy" | "trade-getting" | "deal-add" | "deal-inventory"
  const [scannerOpen, setScannerOpen] = useState<"buy" | "trade-getting" | "trade-inventory" | "deal-add" | "deal-inventory" | null>(null);
  // Which tradeComingIn card id to fill (for trade-getting)
  const [scannerTradeCardId, setScannerTradeCardId] = useState<string | null>(null);
  const [scanToast, setScanToast] = useState<string | null>(null);

  useEffect(() => { setIsMounted(true); }, []);

  // ── Deal photo capture ────────────────────────────────────────────────────

  const [photoPrompt, setPhotoPrompt] = useState<{ scanId: string; kind: "buy" | "sell" | "trade" } | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [dealNotes, setDealNotes] = useState("");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // ── Session ───────────────────────────────────────────────────────────────

  const refreshSession = useCallback(async (id: string) => {
    try {
      const s = await getShowSession(id);
      if (s) setSession(s);
    } catch { /* silent */ }
  }, []);

  const refreshFeed = useCallback(async (id: string) => {
    try {
      const scans = await loadShowFeed(id);
      setFeed(scans.map(scanToFeed));
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    // Priority 1: server-supplied active session (handles banner nav + fresh sessions)
    if (initialActiveSession) {
      localStorage.setItem(STORAGE_KEY, initialActiveSession.id);
      setSessionId(initialActiveSession.id);
      setSession(initialActiveSession);
      loadShowFeed(initialActiveSession.id)
        .then((scans) => setFeed(scans.map(scanToFeed)))
        .catch(() => {});
      setPhase("active");
      return;
    }

    // Priority 2: localStorage (resuming on same device mid-session)
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) { setPhase("start"); return; }
    (async () => {
      try {
        const s = await getShowSession(stored);
        if (s && s.status === "active") {
          setSessionId(stored);
          setSession(s);
          const scans = await loadShowFeed(stored);
          setFeed(scans.map(scanToFeed));
          setPhase("active");
        } else {
          localStorage.removeItem(STORAGE_KEY);
          setPhase("start");
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        setPhase("start");
      }
    })();
  }, [initialActiveSession]);

  // Preload Tesseract OCR worker once the session is active
  useEffect(() => {
    if (phase !== "active") return;
    preloadOcrWorker();
  }, [phase]);

  // Dismiss the card scanner whenever the user switches tabs
  useEffect(() => {
    setScannerOpen(null);
    setScannerTradeCardId(null);
  }, [tab]);

  // Load trade/sell/deal inventory once when any of those tabs is opened
  useEffect(() => {
    if ((tab !== "trade" && tab !== "sell" && tab !== "deal") || tradeInventoryLoaded || phase !== "active") return;
    loadInventoryItems()
      .then((items) => {
        setTradeInventory(items);
        setTradeInventoryLoaded(true);
        // Pre-cache card images for offline use at shows
        const urls = items.map((i) => i.image_url).filter(Boolean) as string[];
        if (urls.length > 0 && typeof navigator !== "undefined" && navigator.serviceWorker?.controller) {
          navigator.serviceWorker.controller.postMessage({ type: "precache-images", urls });
        }
      })
      .catch(() => { /* silent */ });
  }, [tab, tradeInventoryLoaded, phase]);

  // Track online/offline status
  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  // Start auto-sync and listen for sync results when show is active
  useEffect(() => {
    if (phase !== "active") return;
    const stopSync = startAutoSync();

    const onSyncResult = (e: Event) => {
      const { synced, failed } = (e as CustomEvent<{ synced: number; failed: number }>).detail;
      if (synced > 0 && failed === 0) {
        setSyncToast({ msg: `Synced ${synced} transaction${synced !== 1 ? "s" : ""}`, kind: "success" });
      } else if (failed > 0) {
        setSyncToast({ msg: `${failed} transaction${failed !== 1 ? "s" : ""} failed to sync`, kind: "warn" });
      }
      setTimeout(() => setSyncToast(null), 4000);
      getPendingCount().then(setPendingCount).catch(() => {});
    };
    window.addEventListener("offline-sync-result", onSyncResult);

    return () => {
      stopSync();
      window.removeEventListener("offline-sync-result", onSyncResult);
    };
  }, [phase]);

  // Poll pending count every 10 seconds
  useEffect(() => {
    if (phase !== "active") return;
    getPendingCount().then(setPendingCount).catch(() => {});
    const interval = setInterval(() => {
      getPendingCount().then(setPendingCount).catch(() => {});
    }, 10_000);
    return () => clearInterval(interval);
  }, [phase]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function pushFeedEntry(entry: FeedEntry) {
    setFeed((prev) => [entry, ...prev]);
  }

  function err(msg: string) {
    setError(isOffline ? "No connection — try again when online" : msg);
    setTimeout(() => setError(null), 4000);
  }

  function notifyQueued() {
    setSyncToast({ msg: "Saved offline — will sync when connected", kind: "warn" });
    setTimeout(() => setSyncToast(null), 4000);
    getPendingCount().then(setPendingCount).catch(() => {});
  }

  // ── Card image scanner handler ────────────────────────────────────────────

  function handleScanResult(result: CardImageScanResult) {
    setScannerOpen(null);

    const displayName = result.matchedName ?? result.name;
    const confLabel = result.confidence >= 80 ? "high" : result.confidence >= 50 ? "medium" : "low";
    const sourceBadge = result.scanSource === "ocr" ? " ⚡" : result.scanSource === "cloud" ? " ☁️" : "";
    const toastMsg = `${displayName}${result.confidence > 0 ? ` · ${confLabel} confidence` : ""}${sourceBadge}`;
    setScanToast(toastMsg);
    setTimeout(() => setScanToast(null), 4000);

    if (scannerOpen === "buy") {
      // Fill the Buy tab search with the matched card
      const name = result.matchedName ?? result.name;
      setBatchQuery(name);
      if (result.matchedName) {
        setBatchCard({
          name: result.matchedName,
          setName: result.matchedSetName ?? result.set_name ?? "",
          cardNumber: result.matchedCardNumber ?? result.card_number ?? "",
          imageUrl: result.matchedImageUrl ?? null,
          market: result.matchedMarket ?? null,
          cardId: result.matchedCardId,
        });
        if (result.matchedMarket != null) setBatchMarket(result.matchedMarket.toFixed(2));
      }
    } else if (scannerOpen === "trade-getting" && scannerTradeCardId) {
      // Fill the tradeComingIn entry
      const name = result.matchedName ?? result.name;
      setTradeComingIn((prev) =>
        prev.map((c) =>
          c._id === scannerTradeCardId
            ? {
                ...c,
                name,
                marketPrice: result.matchedMarket != null ? result.matchedMarket.toFixed(2) : c.marketPrice,
              }
            : c
        )
      );
      setScannerTradeCardId(null);
    } else if (scannerOpen === "trade-inventory") {
      // Filter the trade inventory grid by the scanned card name
      setTradeInventoryQuery(result.matchedName ?? result.name);
    } else if (scannerOpen === "deal-add") {
      // Pre-fill the deal card add form
      const name = result.matchedName ?? result.name;
      setDealAddName(name);
      if (result.matchedName) {
        setDealAddCard({
          name: result.matchedName,
          setName: result.matchedSetName ?? result.set_name ?? "",
          cardNumber: result.matchedCardNumber ?? result.card_number ?? "",
          imageUrl: result.matchedImageUrl ?? null,
          market: result.matchedMarket ?? null,
          cardId: result.matchedCardId,
        });
        if (result.matchedMarket != null) setDealAddMarket(result.matchedMarket.toFixed(2));
      }
    } else if (scannerOpen === "deal-inventory") {
      // Filter the deal inventory grid by the scanned card name
      setDealInventoryQuery(result.matchedName ?? result.name);
    }
  }

  // ── Deal photo handlers ───────────────────────────────────────────────────

  function handlePhotoSelected(file: File) {
    setPhotoFile(file);
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
  }

  function dismissPhotoPrompt() {
    setPhotoPrompt(null);
    setPhotoFile(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    setDealNotes("");
  }

  async function handlePhotoConfirm() {
    if (!photoPrompt || !photoFile) return;
    setPhotoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", photoFile);
      const url = await uploadDealPhoto(fd);
      await updateScanPhoto(photoPrompt.scanId, url, dealNotes.trim() || null);
      setFeed((prev) =>
        prev.map((e) => e.id === photoPrompt.scanId ? { ...e, photoUrl: url } : e)
      );
    } catch {
      err("Photo upload failed — saved without photo");
    } finally {
      setPhotoUploading(false);
      dismissPhotoPrompt();
    }
  }

  function triggerPhotoPrompt(scanId: string, kind: "buy" | "sell" | "trade") {
    setDealNotes("");
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoPrompt({ scanId, kind });
  }

  // ── Deal tab handlers ─────────────────────────────────────────────────────

  function handleDealAddCard() {
    const market = parseFloat(dealAddMarket) || null;
    if (!dealAddName.trim()) { err("Enter a card name"); return; }
    const newCard: DealCard = {
      _id: crypto.randomUUID(),
      name: dealAddName.trim(),
      grade: dealAddGrade.trim(),
      condition: dealAddCondition,
      marketPrice: market,
      buyPrice: market != null ? parseFloat((market * dealCashPct / 100).toFixed(2)) : null,
      image_url: dealAddCard?.imageUrl ?? null,
      set_name: dealAddCard?.setName ?? null,
      card_number: dealAddCard?.cardNumber ?? null,
      disposition: "undecided",
    };
    setDealCards((prev) => [...prev, newCard]);
    setDealAddName("");
    setDealAddCard(null);
    setDealAddGrade("");
    setDealAddMarket("");
    setDealAddCondition("Near Mint");
    setDealCertOpen(false);
  }

  function handleDealRemoveCard(id: string) {
    setDealCards((prev) => prev.filter((c) => c._id !== id));
  }

  function handleDealSetDisposition(id: string, disposition: DealCard["disposition"]) {
    setDealCards((prev) => prev.map((c) => c._id === id ? { ...c, disposition } : c));
  }

  function handleDealSetBuyPrice(id: string, val: string) {
    const price = parseFloat(val) || null;
    setDealCards((prev) => prev.map((c) => c._id === id ? { ...c, buyPrice: price } : c));
  }

  function handleDealReset() {
    setDealCards([]);
    setDealStep("evaluate");
    setDealCustomerChoice("undecided");
    setDealTradeSelections([]);
    setDealCompleteSummary(null);
    setDealAddName("");
    setDealAddCard(null);
    setDealAddGrade("");
    setDealAddMarket("");
    setDealInventoryQuery("");
    setDealFulfillExpanded(false);
  }

  async function handleCompleteDeal() {
    if (!sessionId) return;
    setBusy(true);
    try {
      const cashCards = dealCards.filter((c) => c.disposition === "cash");
      const tradeCards = dealCards.filter((c) => c.disposition === "trade");

      let lastScanId: string | null = null;
      let anyQueued = false;
      const dealTimestamp = new Date().toISOString();

      // Record cash buys
      const batchId = dealCards.length > 1 ? crypto.randomUUID() : null;
      for (const card of cashCards) {
        if (!card.buyPrice) continue;
        const pct = card.marketPrice && card.marketPrice > 0
          ? parseFloat(((card.buyPrice / card.marketPrice) * 100).toFixed(1))
          : dealCashPct;
        const client_id = crypto.randomUUID();
        const res = await offlineRecordShowBuy({
          show_session_id: sessionId,
          name: card.name,
          category: card.grade ? "slab" : "single",
          owner: "shared",
          condition: card.condition,
          grade: card.grade || null,
          cost: card.buyPrice,
          market: card.marketPrice,
          set_name: card.set_name,
          card_number: card.card_number,
          image_url: card.image_url,
          buy_percentage: pct,
          notes: null,
          batch_id: batchId,
          client_id,
        });
        const scanId = res.queued ? res.id : res.result.scanId;
        if (res.queued) anyQueued = true;
        lastScanId = scanId;
        pushFeedEntry({
          id: scanId,
          kind: "buy",
          time: dealTimestamp,
          label: card.name,
          sub: `${card.grade ? card.grade + " · " : ""}Deal · ${pct}%`,
          amount: -card.buyPrice,
          batchId: batchId ?? undefined,
          pending: res.queued,
        });
      }

      // Record as a trade if there are trade cards AND inventory items going out
      if (tradeCards.length > 0 && dealTradeSelections.length > 0) {
        const goingOut = dealTradeSelections.map((s) => ({
          itemId: s.item.id,
          tradeValue: parseFloat(s.tradeValue) || (s.item.market ?? 0),
          name: s.item.name,
          cost: s.item.cost,
        }));
        const comingIn = tradeCards.map((c) => ({
          name: c.name,
          grade: c.grade.trim() || null,
          marketPrice: c.marketPrice ?? 0,
        }));
        const tradeVal = tradeCards.reduce((s, c) => s + (c.buyPrice ?? (c.marketPrice ? c.marketPrice * dealTradePct / 100 : 0)), 0);
        const inventoryVal = dealTradeSelections.reduce((s, g) => s + (parseFloat(g.tradeValue) || (g.item.market ?? 0)), 0);
        const cashDiff = parseFloat((tradeVal - inventoryVal).toFixed(2));
        const client_id = crypto.randomUUID();
        const res = await offlineRecordShowTrade({
          show_session_id: sessionId,
          goingOut,
          comingIn,
          cashDifference: cashDiff,
          notes: `Deal trade · ${tradeCards.length} card${tradeCards.length !== 1 ? "s" : ""} in`,
          client_id,
        });
        const scanId = res.queued ? res.id : res.result.scanId;
        if (res.queued) anyQueued = true;
        lastScanId = scanId;
        const label = tradeCards.map((c) => c.name).join(", ");
        pushFeedEntry({
          id: scanId,
          kind: "trade",
          time: dealTimestamp,
          label,
          sub: `Deal trade`,
          amount: cashDiff !== 0 ? cashDiff : null,
          pending: res.queued,
        });
      } else if (tradeCards.length > 0) {
        // Trade cards but no inventory going out — record as buys at trade %
        for (const card of tradeCards) {
          const tradePrice = card.buyPrice ?? (card.marketPrice ? parseFloat((card.marketPrice * dealTradePct / 100).toFixed(2)) : null);
          if (!tradePrice) continue;
          const pct = card.marketPrice && card.marketPrice > 0
            ? parseFloat(((tradePrice / card.marketPrice) * 100).toFixed(1))
            : dealTradePct;
          const client_id = crypto.randomUUID();
          const res = await offlineRecordShowBuy({
            show_session_id: sessionId,
            name: card.name,
            category: card.grade ? "slab" : "single",
            owner: "shared",
            condition: card.condition,
            grade: card.grade || null,
            cost: tradePrice,
            market: card.marketPrice,
            set_name: card.set_name,
            card_number: card.card_number,
            image_url: card.image_url,
            buy_percentage: pct,
            notes: "Deal trade-in",
            batch_id: batchId,
            client_id,
          });
          const scanId = res.queued ? res.id : res.result.scanId;
          if (res.queued) anyQueued = true;
          lastScanId = scanId;
          pushFeedEntry({
            id: scanId,
            kind: "buy",
            time: dealTimestamp,
            label: card.name,
            sub: `${card.grade ? card.grade + " · " : ""}Trade-in · ${pct}%`,
            amount: -tradePrice,
            batchId: batchId ?? undefined,
            pending: res.queued,
          });
        }
      }

      if (anyQueued) { notifyQueued(); } else {
        await refreshSession(sessionId);
        if (lastScanId) triggerPhotoPrompt(lastScanId, "buy");
      }

      const cashOut = cashCards.reduce((s, c) => s + (c.buyPrice ?? 0), 0);
      const tradeValue = tradeCards.reduce((s, c) => s + (c.buyPrice ?? (c.marketPrice ? c.marketPrice * dealTradePct / 100 : 0)), 0);
      setDealCompleteSummary({ scanId: lastScanId ?? "", cashOut, tradeValue });
      setDealStep("complete");
    } catch (e) {
      err(e instanceof Error ? e.message : "Deal failed");
    } finally {
      setBusy(false);
    }
  }

  // ── Start show ────────────────────────────────────────────────────────────

  async function handleStartShow() {
    if (!startName.trim()) { err("Enter a show name"); return; }
    setBusy(true);
    try {
      const id = await createShowSession({
        name: startName.trim(),
        date: startDate,
        starting_cash: startCash ? parseFloat(startCash) : null,
      });
      localStorage.setItem(STORAGE_KEY, id);
      setSessionId(id);
      const s = await getShowSession(id);
      setSession(s);
      setFeed([]);
      setPhase("active");
      setTab("scan");
    } catch (e) {
      err(e instanceof Error ? e.message : "Failed to start show");
    } finally {
      setBusy(false);
    }
  }

  // ── Scan tab ──────────────────────────────────────────────────────────────

  function onScanResult(r: CertWidgetResult) {
    setScanResult(r);
    setScanMarket(r.market != null ? r.market.toFixed(2) : "");
    setScanShowCustom(false);
    setScanCustomPct("");
    setScanShowFlat(false);
    setScanFlatAmount("");
  }

  async function handleScanBuy(pct: number) {
    if (!scanResult || !sessionId) return;
    const market = parseFloat(scanMarket) || null;
    if (!market) { err("Enter market price first"); return; }
    const cost = parseFloat((market * pct / 100).toFixed(2));
    const gradeStr = scanResult.gradeLabel
      ? `${scanResult.company} ${scanResult.gradeLabel} ${scanResult.grade}`
      : `${scanResult.company} ${scanResult.grade}`;
    setBusy(true);
    try {
      const client_id = crypto.randomUUID();
      const res = await offlineRecordShowBuy({
        show_session_id: sessionId,
        name: scanResult.name,
        category: "slab",
        owner: scanOwner,
        condition: "Near Mint",
        grade: gradeStr,
        cost,
        market,
        set_name: scanResult.setName,
        card_number: scanResult.cardNumber,
        image_url: null,
        buy_percentage: pct,
        notes: null,
        client_id,
      });
      const scanId = res.queued ? res.id : res.result.scanId;
      pushFeedEntry({
        id: scanId,
        kind: "buy",
        time: new Date().toISOString(),
        label: scanResult.name,
        sub: `${gradeStr} · ${pct}%`,
        amount: -cost,
        pending: res.queued,
      });
      if (res.queued) { notifyQueued(); } else {
        await refreshSession(sessionId);
        triggerPhotoPrompt(scanId, "buy");
      }
      setScanResult(null);
      setScanMarket("");
      setScanShowCustom(false);
      setScanCustomPct("");
    } catch (e) {
      err(e instanceof Error ? e.message : "Buy failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleScanBuyFlat() {
    if (!scanResult || !sessionId) return;
    const cost = parseFloat(scanFlatAmount) || 0;
    if (!cost) { err("Enter flat dollar amount"); return; }
    const market = parseFloat(scanMarket) || null;
    const pct = market && market > 0 ? parseFloat((cost / market * 100).toFixed(1)) : 0;
    const gradeStr = scanResult.gradeLabel
      ? `${scanResult.company} ${scanResult.gradeLabel} ${scanResult.grade}`
      : `${scanResult.company} ${scanResult.grade}`;
    setBusy(true);
    try {
      const client_id = crypto.randomUUID();
      const res = await offlineRecordShowBuy({
        show_session_id: sessionId,
        name: scanResult.name,
        category: "slab",
        owner: scanOwner,
        condition: "Near Mint",
        grade: gradeStr,
        cost,
        market,
        set_name: scanResult.setName,
        card_number: scanResult.cardNumber,
        image_url: null,
        buy_percentage: pct,
        notes: null,
        client_id,
      });
      const scanId = res.queued ? res.id : res.result.scanId;
      pushFeedEntry({
        id: scanId,
        kind: "buy",
        time: new Date().toISOString(),
        label: scanResult.name,
        sub: `${gradeStr} · $${cost.toFixed(2)}`,
        amount: -cost,
        pending: res.queued,
      });
      if (res.queued) { notifyQueued(); } else {
        await refreshSession(sessionId);
        triggerPhotoPrompt(scanId, "buy");
      }
      setScanResult(null);
      setScanMarket("");
      setScanShowFlat(false);
      setScanFlatAmount("");
    } catch (e) {
      err(e instanceof Error ? e.message : "Buy failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleScanPass() {
    if (!scanResult || !sessionId) return;
    const market = parseFloat(scanMarket) || null;
    const gradeStr = scanResult.gradeLabel
      ? `${scanResult.company} ${scanResult.gradeLabel} ${scanResult.grade}`
      : `${scanResult.company} ${scanResult.grade}`;
    setBusy(true);
    try {
      const { scanId } = await recordShowPass({
        show_session_id: sessionId,
        card_name: scanResult.name,
        grade: gradeStr,
        market_price: market,
      });
      pushFeedEntry({
        id: scanId,
        kind: "pass",
        time: new Date().toISOString(),
        label: scanResult.name,
        sub: gradeStr,
        amount: null,
      });
      await refreshSession(sessionId);
      setScanResult(null);
      setScanMarket("");
    } catch (e) {
      err(e instanceof Error ? e.message : "Pass failed");
    } finally {
      setBusy(false);
    }
  }

  // ── Buy tab ───────────────────────────────────────────────────────────────

  function onBatchCardSelect(card: AutocompleteCard) {
    setBatchCard(card);
    setBatchQuery(card.name);
    if (card.market != null) {
      setBatchMarket(card.market.toFixed(2));
      // Sync flat amount if a pct is already selected
      const activePct = batchPct || parseFloat(batchCustomPct) || 0;
      if (activePct > 0) {
        setBatchFlatAmount((card.market * activePct / 100).toFixed(2));
      }
    } else {
      // No price from search — query cache (non-blocking)
      fetchBatchMarketPrice(
        card.name,
        card.setName || null,
        card.cardNumber || null,
        batchCondition,
        batchCategory,
        batchGradeCompany,
        batchGradeValue || undefined
      );
    }
    setRecentCards((prev) => {
      const filtered = prev.filter(
        (c) => !(c.name === card.name && c.setName === card.setName && c.cardNumber === card.cardNumber)
      );
      return [card, ...filtered].slice(0, 5);
    });
  }

  async function fetchBatchMarketPrice(
    name: string,
    setName: string | null,
    cardNumber: string | null,
    condition: string,
    category: "single" | "slab" | "sealed",
    gradeCompany?: string,
    gradeValue?: string
  ) {
    if (!name.trim()) return;
    setBatchMarketLoading(true);
    try {
      const res = await fetch("/api/cached-price", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, setName, cardNumber, condition, category, gradeCompany, gradeValue }),
      });
      const data = await res.json();
      if (data.price != null) {
        setBatchMarket(data.price.toFixed(2));
      }
    } catch { /* silent */ }
    finally { setBatchMarketLoading(false); }
  }

  function onBatchMarketChange(val: string) {
    setBatchMarket(val);
    const market = parseFloat(val);
    const activePct = batchPct || parseFloat(batchCustomPct) || 0;
    if (activePct > 0 && market > 0) {
      setBatchFlatAmount((market * activePct / 100).toFixed(2));
    }
  }

  function onBatchPresetPctClick(pct: number) {
    setBatchPct(pct);
    setBatchCustomPct("");
    const market = parseFloat(batchMarket);
    if (market > 0) setBatchFlatAmount((market * pct / 100).toFixed(2));
  }

  function onBatchCustomPctChange(val: string) {
    setBatchCustomPct(val);
    setBatchPct(0);
    const pct = parseFloat(val);
    const market = parseFloat(batchMarket);
    if (pct > 0 && market > 0) setBatchFlatAmount((market * pct / 100).toFixed(2));
    else if (!val) setBatchFlatAmount("");
  }

  function onBatchFlatChange(val: string) {
    setBatchFlatAmount(val);
    const flat = parseFloat(val);
    const market = parseFloat(batchMarket);
    if (flat > 0 && market > 0) {
      const pct = flat / market * 100;
      const preset = BUY_PCTS.find((p) => Math.abs(p - pct) < 0.5);
      if (preset) { setBatchPct(preset); setBatchCustomPct(""); }
      else { setBatchPct(0); setBatchCustomPct(pct.toFixed(1)); }
    } else if (!val) {
      setBatchPct(0); setBatchCustomPct("");
    }
  }

  function handleAddToBatch() {
    const market = parseFloat(batchMarket) || null;
    const flatAmt = parseFloat(batchFlatAmount) || 0;
    const pct = batchPct || parseFloat(batchCustomPct) || 0;
    if (!batchQuery.trim()) { err("Enter card name"); return; }
    if (!market) { err("Enter market price"); return; }
    const unitCost = flatAmt > 0 ? flatAmt : (pct > 0 ? parseFloat((market * pct / 100).toFixed(2)) : 0);
    if (!unitCost) { err("Enter a buy percentage or flat amount"); return; }
    const effectivePct = flatAmt > 0 && market > 0 ? parseFloat((flatAmt / market * 100).toFixed(1)) : pct;

    const qty = Math.max(1, parseInt(batchQuantity) || 1);
    const totalCost = parseFloat((unitCost * qty).toFixed(2));
    const gradeStr = batchCategory === "slab" && batchGradeValue
      ? `${batchGradeCompany} ${batchGradeValue}`
      : null;
    const nameStr = batchCategory === "sealed" && qty > 1
      ? `${batchQuery.trim()} ×${qty}`
      : batchQuery.trim();

    const entry: StagedBuy = {
      _id: crypto.randomUUID(),
      name: nameStr,
      category: batchCategory,
      condition: batchCategory === "single" ? batchCondition : "Near Mint",
      grade: gradeStr ?? (batchCategory === "sealed" ? batchProductType : null),
      market,
      cost: totalCost,
      buy_pct: effectivePct,
      owner: batchOwner,
      set_name: batchCard?.setName || null,
      card_number: batchCard?.cardNumber || null,
      image_url: batchCard?.imageUrl || null,
    };
    setBatchQueue((prev) => [...prev, entry]);
    setBatchQuery(""); setBatchCard(null); setBatchMarket("");
    setBatchGradeValue(""); setBatchFlatAmount(""); setBatchQuantity("1");
    setBatchPct(0); setBatchCustomPct("");
  }

  async function handleFinalizeBatch() {
    if (!sessionId || batchQueue.length === 0) return;
    setBusy(true);
    try {
      let lastScanId: string | null = null;
      let anyQueued = false;
      const batchId = batchQueue.length > 1 ? crypto.randomUUID() : null;
      const now = new Date().toISOString();
      for (const item of batchQueue) {
        const client_id = crypto.randomUUID();
        const res = await offlineRecordShowBuy({
          show_session_id: sessionId,
          name: item.name,
          category: item.category,
          owner: item.owner,
          condition: item.condition,
          grade: item.grade,
          cost: item.cost,
          market: item.market,
          set_name: item.set_name,
          card_number: item.card_number,
          image_url: item.image_url,
          buy_percentage: item.buy_pct,
          notes: null,
          batch_id: batchId,
          client_id,
        });
        const scanId = res.queued ? res.id : res.result.scanId;
        if (res.queued) anyQueued = true;
        lastScanId = scanId;
        pushFeedEntry({
          id: scanId,
          kind: "buy",
          time: now,
          label: item.name,
          sub: `${item.buy_pct}%`,
          amount: -item.cost,
          batchId,
          pending: res.queued,
        });
      }
      if (anyQueued) { notifyQueued(); } else {
        await refreshSession(sessionId);
        if (lastScanId) triggerPhotoPrompt(lastScanId, "buy");
      }
      setBatchQueue([]);
    } catch (e) {
      err(e instanceof Error ? e.message : "Batch buy failed");
    } finally {
      setBusy(false);
    }
  }

  // ── Sell tab ──────────────────────────────────────────────────────────────

  function toggleSellSelect(item: InventorySearchResult) {
    const adding = !sellSelected.has(item.id);
    setSellSelected((prev) => {
      const next = new Map(prev);
      if (adding) next.set(item.id, item);
      else next.delete(item.id);
      return next;
    });
    if (adding && sellPrices[item.id] === undefined) {
      const def = item.sticker_price != null ? item.sticker_price.toFixed(2)
        : item.market != null ? item.market.toFixed(2) : "";
      setSellPrices((prev) => {
        const next = { ...prev, [item.id]: def };
        const allItems = Array.from(sellSelected.values()).concat(item);
        const total = allItems.reduce((s, i) => s + (parseFloat(next[i.id]) || 0), 0);
        setSellTotalInput(total > 0 ? total.toFixed(2) : "");
        return next;
      });
    }
  }

  function handleSellItemPrice(itemId: string, raw: string) {
    setSellPriceLocked((prev) => new Set(prev).add(itemId));
    setSellPrices((prev) => {
      const next = { ...prev, [itemId]: raw };
      // Recompute total from all prices
      const items = Array.from(sellSelected.values());
      const total = items.reduce((s, i) => s + (parseFloat(next[i.id]) || 0), 0);
      setSellTotalInput(total > 0 ? total.toFixed(2) : "");
      return next;
    });
  }

  function handleSellTotalChange(raw: string) {
    setSellTotalInput(raw);
    const newTotal = parseFloat(raw) || 0;
    if (newTotal <= 0) return;
    const items = Array.from(sellSelected.values());
    const locked = sellPriceLocked;
    const lockedTotal = items.filter((i) => locked.has(i.id))
      .reduce((s, i) => s + (parseFloat(sellPrices[i.id]) || 0), 0);
    const unlocked = items.filter((i) => !locked.has(i.id));
    if (!unlocked.length) return;
    const remaining = newTotal - lockedTotal;
    const basis = unlocked.reduce((s, i) => s + (i.sticker_price ?? i.market ?? 0), 0);
    setSellPrices((prev) => {
      const next = { ...prev };
      let allocated = 0;
      unlocked.forEach((item, idx) => {
        if (idx === unlocked.length - 1) {
          next[item.id] = Math.max(0, remaining - allocated).toFixed(2);
        } else {
          const weight = basis > 0 ? (item.sticker_price ?? item.market ?? 0) / basis : 1 / unlocked.length;
          const share = parseFloat((remaining * weight).toFixed(2));
          next[item.id] = Math.max(0, share).toFixed(2);
          allocated += share;
        }
      });
      return next;
    });
  }

  async function handleConfirmSell() {
    if (!sessionId || sellSelected.size === 0) return;
    const items = Array.from(sellSelected.values());
    const priceList = items.map((item) => ({
      item,
      price: parseFloat(sellPrices[item.id] || "0"),
    }));
    if (priceList.some(({ price }) => !price || price <= 0)) {
      err("All items need a sell price"); return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const soldIds = new Set<string>();
      let lastScanId: string | null = null;
      let anyQueued = false;
      for (const { item, price } of priceList) {
        const client_id = crypto.randomUUID();
        const res = await offlineRecordShowSell({
          show_session_id: sessionId,
          item_id: item.id,
          item_name: item.name,
          sell_price: price,
          client_id,
        });
        const scanId = res.queued ? res.id : res.result.scanId;
        if (res.queued) anyQueued = true;
        pushFeedEntry({ id: scanId, kind: "sell", time: now, label: item.name, sub: item.grade ?? undefined, amount: price, pending: res.queued });
        soldIds.add(item.id);
        lastScanId = scanId;
      }
      if (anyQueued) { notifyQueued(); } else {
        await refreshSession(sessionId);
        if (lastScanId) triggerPhotoPrompt(lastScanId, "sell");
      }
      setTradeInventory((prev) => prev.filter((i) => !soldIds.has(i.id)));
      setSellSelected(new Map());
      setSellPrices({});
      setSellPriceLocked(new Set());
      setSellTotalInput("");
    } catch (e) {
      err(e instanceof Error ? e.message : "Sell failed");
    } finally {
      setBusy(false);
    }
  }

  // ── Trade tab ─────────────────────────────────────────────────────────────

  async function handleRecordTrade() {
    if (!sessionId) return;
    const gaveTotal = tradeGoingOut.reduce((s, g) => s + (parseFloat(g.tradeValue) || (g.item.market ?? 0)), 0);
    const gotTotal = tradeComingIn.reduce((s, c) => s + (parseFloat(c.marketPrice) || 0), 0);
    const autoCash = parseFloat((gotTotal - gaveTotal).toFixed(2));
    const cashDiff = tradeCashOverride.trim()
      ? (tradeCashDir === "received" ? Math.abs(parseFloat(tradeCashOverride) || 0) : -(Math.abs(parseFloat(tradeCashOverride) || 0)))
      : autoCash;

    setBusy(true);
    try {
      const client_id = crypto.randomUUID();
      const res = await offlineRecordShowTrade({
        show_session_id: sessionId,
        goingOut: tradeGoingOut.map((g) => ({
          itemId: g.item.id,
          tradeValue: parseFloat(g.tradeValue) || g.item.market || 0,
          name: g.item.name,
          cost: g.item.cost,
        })),
        comingIn: tradeComingIn
          .filter((c) => c.name.trim())
          .map((c) => ({
            name: c.name.trim(),
            grade: c.grade.trim() || null,
            marketPrice: parseFloat(c.marketPrice) || 0,
          })),
        cashDifference: cashDiff,
        notes: tradeNotes.trim() || null,
        client_id,
      });

      const tradeScanId = res.queued ? res.id : res.result.scanId;
      const gaveNames = tradeGoingOut.map((g) => g.item.name).join(", ") || "—";
      const gotNames = tradeComingIn.filter((c) => c.name.trim()).map((c) => c.name).join(", ") || "—";
      pushFeedEntry({
        id: tradeScanId,
        kind: "trade",
        time: new Date().toISOString(),
        label: `${gaveNames} → ${gotNames}`,
        sub: Math.abs(cashDiff) > 0.01 ? `Cash ${cashDiff > 0 ? "received" : "paid"}: $${Math.abs(cashDiff).toFixed(2)}` : undefined,
        amount: Math.abs(cashDiff) > 0.01 ? cashDiff : null,
        pending: res.queued,
      });
      if (res.queued) { notifyQueued(); } else {
        await refreshSession(sessionId);
        triggerPhotoPrompt(tradeScanId, "trade");
      }

      const tradedIds = new Set(tradeGoingOut.map((g) => g.item.id));
      setTradeInventory((prev) => prev.filter((i) => !tradedIds.has(i.id)));
      setTradeGoingOut([]);
      setTradeComingIn([blankTradeComingIn()]);
      setTradeCashOverride(""); setTradeNotes("");
      setTradeInventoryQuery("");
    } catch (e) {
      err(e instanceof Error ? e.message : "Trade failed");
    } finally {
      setBusy(false);
    }
  }

  // ── Expense ───────────────────────────────────────────────────────────────

  async function handleAddExpense() {
    if (!sessionId) return;
    const cost = parseFloat(expenseCost);
    if (!expenseDesc.trim() || !cost) { err("Enter description and amount"); return; }
    setBusy(true);
    try {
      const client_id = crypto.randomUUID();
      const res = await offlineAddShowExpense({
        show_session_id: sessionId,
        description: expenseDesc.trim(),
        cost,
        category: expenseCategory,
        paid_by: expensePaidBy,
        client_id,
      });
      const scanId = res.queued ? res.id : res.result.scanId;
      pushFeedEntry({
        id: scanId,
        kind: "expense",
        time: new Date().toISOString(),
        label: expenseDesc.trim(),
        amount: -cost,
        pending: res.queued,
      });
      if (res.queued) { notifyQueued(); } else { await refreshSession(sessionId); }
      setExpenseDesc(""); setExpenseCost("");
      setExpenseOpen(false);
    } catch (e) {
      err(e instanceof Error ? e.message : "Expense failed");
    } finally {
      setBusy(false);
    }
  }

  // ── End show ──────────────────────────────────────────────────────────────

  async function handleEndShow() {
    if (!sessionId) return;
    const cash = actualCash ? parseFloat(actualCash) : null;
    setBusy(true);
    try {
      await endShowSession(sessionId, cash);
      localStorage.removeItem(STORAGE_KEY);
      router.push("/protected/shows");
    } catch (e) {
      err(e instanceof Error ? e.message : "Failed to end show");
      setBusy(false);
    }
  }

  // ── Undo ──────────────────────────────────────────────────────────────────

  async function handleUndo(scanId: string) {
    setBusy(true);
    try {
      await undoShowEntry(scanId);
      setFeed((prev) => prev.filter((e) => e.id !== scanId));
      if (sessionId) await refreshSession(sessionId);
    } catch (e) {
      err(e instanceof Error ? e.message : "Undo failed");
    } finally {
      setBusy(false);
    }
  }

  // ── Phase: loading ────────────────────────────────────────────────────────

  if (phase === "loading") {
    return <div className="p-8 text-center opacity-40 text-sm">Loading…</div>;
  }

  // ── Phase: start ──────────────────────────────────────────────────────────

  if (phase === "start") {
    return (
      <div className="max-w-md mx-auto p-4 space-y-4">
        <div className="pt-4">
          <h1 className="text-xl font-bold">Show Mode</h1>
          <p className="text-sm opacity-50 mt-1">Fast scan, buy, sell, and trade at card shows.</p>
        </div>

        {error && (
          <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>
        )}

        <div className="border rounded-xl p-4 space-y-3">
          <div className="text-sm font-semibold">New Show</div>
          <input
            className="w-full border rounded-lg px-3 py-3 text-sm bg-background"
            placeholder="Show name (e.g. Sacramento Card Show)"
            value={startName}
            onChange={(e) => setStartName(e.target.value)}
            autoFocus
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs opacity-50 mb-1">Date</div>
              <input
                type="date"
                className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <div className="text-xs opacity-50 mb-1">Starting cash</div>
              <input
                type="number"
                inputMode="decimal"
                className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background"
                placeholder="$0"
                value={startCash}
                onChange={(e) => setStartCash(e.target.value)}
              />
            </div>
          </div>
          <button
            className="w-full py-3 rounded-xl text-sm font-semibold text-white"
            style={{ background: "var(--accent-primary)" }}
            onClick={handleStartShow}
            disabled={busy}
          >
            {busy ? "Starting…" : "Start Show →"}
          </button>
        </div>

        {recentShows.length > 0 && (
          <div className="border rounded-xl p-4 space-y-1">
            <div className="text-sm font-medium mb-2">Recent Shows</div>
            {recentShows.filter((s) => s.status === "completed").slice(0, 4).map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2 border-t first:border-t-0 gap-3">
                <div>
                  <div className="text-sm">{s.name}</div>
                  <div className="text-xs opacity-40">{fmtDate(s.date)} · {s.cards_bought}↓ {s.cards_sold}↑</div>
                </div>
                <div className={`text-sm font-semibold tabular-nums shrink-0 ${s.net_pl >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                  {moneySign(s.net_pl)}
                </div>
              </div>
            ))}
            <a href="/protected/shows" className="block text-xs opacity-40 hover:opacity-70 pt-2 text-center transition-opacity">View all shows →</a>
          </div>
        )}
      </div>
    );
  }

  // ── Phase: active show ────────────────────────────────────────────────────

  if (!session) return null;

  const expectedCash = (session.starting_cash ?? 0) - session.total_spent + session.total_revenue;

  const tabClass = (t: typeof tab) =>
    `flex-1 py-2.5 text-xs font-semibold rounded-lg transition-colors ${
      tab === t ? "text-white" : "opacity-50 hover:opacity-70"
    }`;

  return (
    <div className="space-y-0 -mx-4 sm:-mx-8 lg:-mx-14">
      {/* ── Show mode banner (sticky) ── */}
      <ShowBanner
        session={session}
        isOffline={isOffline}
        pendingCount={pendingCount}
        expectedCash={expectedCash}
        statsExpanded={statsExpanded}
        setStatsExpanded={setStatsExpanded}
        setExpenseOpen={setExpenseOpen}
        setEndOpen={setEndOpen}
        setEndStep={setEndStep}
        setCashCountInput={setCashCountInput}
        setCashCountOpen={setCashCountOpen}
        setPendingModalActions={setPendingModalActions}
        setPendingModalOpen={setPendingModalOpen}
      />

      {/* ── Desktop tab bar (hidden on mobile — replaced by bottom nav) ── */}
      <div className="hidden md:block px-4 pt-3 pb-0">
        <div
          className="grid grid-cols-5 gap-1 rounded-xl p-1"
          style={{ background: "rgba(255,255,255,0.04)" }}
        >
          {(["scan", "buy", "sell", "deal", "trade"] as const).map((t) => (
            <button
              key={t}
              className={tabClass(t)}
              style={tab === t ? { background: "var(--accent-primary)" } : undefined}
              onClick={() => setTab(t)}
            >
              {t === "scan" ? "Scan" : t === "buy" ? "Buy" : t === "sell" ? "Sell" : t === "deal" ? "Deal" : "Trade"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error toast ── */}
      {error && (
        <div className="mx-4 mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      {/* ── Sync toast ── */}
      {syncToast && (
        <div className={`mx-4 mt-3 text-sm rounded-xl px-3 py-2 flex items-center gap-2 ${
          syncToast.kind === "success"
            ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
            : "text-amber-400 bg-amber-500/10 border border-amber-500/20"
        }`}>
          <Clock size={13} className="shrink-0" />
          {syncToast.msg}
        </div>
      )}

      {/* ── Scan success toast ── */}
      {scanToast && (
        <div className="mx-4 mt-3 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2 flex items-center gap-2">
          <Camera size={14} className="shrink-0" />
          {scanToast}
        </div>
      )}

      {/* ── Tab content ── */}
      <div className="px-4 pt-3 pb-20 md:pb-4">
        {tab === "scan" && (
          <ScanTab
            scanResult={scanResult}
            setScanResult={setScanResult}
            scanOwner={scanOwner}
            setScanOwner={setScanOwner}
            scanMarket={scanMarket}
            setScanMarket={setScanMarket}
            scanCustomPct={scanCustomPct}
            setScanCustomPct={setScanCustomPct}
            scanShowCustom={scanShowCustom}
            setScanShowCustom={setScanShowCustom}
            scanFlatAmount={scanFlatAmount}
            setScanFlatAmount={setScanFlatAmount}
            scanShowFlat={scanShowFlat}
            setScanShowFlat={setScanShowFlat}
            busy={busy}
            onScanResult={onScanResult}
            handleScanBuy={handleScanBuy}
            handleScanBuyFlat={handleScanBuyFlat}
            handleScanPass={handleScanPass}
          />
        )}
        {tab === "buy" && (
          <BuyTab
            batchQuery={batchQuery}
            setBatchQuery={setBatchQuery}
            batchCard={batchCard}
            setBatchCard={setBatchCard}
            batchMarket={batchMarket}
            setBatchMarket={setBatchMarket}
            batchCategory={batchCategory}
            setBatchCategory={setBatchCategory}
            batchCondition={batchCondition}
            setBatchCondition={setBatchCondition}
            batchGradeCompany={batchGradeCompany}
            setBatchGradeCompany={setBatchGradeCompany}
            batchGradeValue={batchGradeValue}
            setBatchGradeValue={setBatchGradeValue}
            batchProductType={batchProductType}
            setBatchProductType={setBatchProductType}
            batchQuantity={batchQuantity}
            setBatchQuantity={setBatchQuantity}
            batchOwner={batchOwner}
            setBatchOwner={setBatchOwner}
            batchPct={batchPct}
            batchCustomPct={batchCustomPct}
            batchFlatAmount={batchFlatAmount}
            batchQueue={batchQueue}
            setBatchQueue={setBatchQueue}
            recentCards={recentCards}
            batchMarketLoading={batchMarketLoading}
            buyCertOpen={buyCertOpen}
            setBuyCertOpen={setBuyCertOpen}
            busy={busy}
            onBatchCardSelect={onBatchCardSelect}
            fetchBatchMarketPrice={fetchBatchMarketPrice}
            onBatchMarketChange={onBatchMarketChange}
            onBatchPresetPctClick={onBatchPresetPctClick}
            onBatchCustomPctChange={onBatchCustomPctChange}
            onBatchFlatChange={onBatchFlatChange}
            handleAddToBatch={handleAddToBatch}
            handleFinalizeBatch={handleFinalizeBatch}
            setScannerOpen={setScannerOpen}
          />
        )}
        {tab === "sell" && (
          <SellTab
            tradeInventory={tradeInventory}
            tradeInventoryLoaded={tradeInventoryLoaded}
            tab={tab}
            sellQuery={sellQuery}
            setSellQuery={setSellQuery}
            sellCategoryFilter={sellCategoryFilter}
            setSellCategoryFilter={setSellCategoryFilter}
            sellSortBy={sellSortBy}
            setSellSortBy={setSellSortBy}
            sellPriceRange={sellPriceRange}
            setSellPriceRange={setSellPriceRange}
            sellSelected={sellSelected}
            setSellSelected={setSellSelected}
            sellBottomExpanded={sellBottomExpanded}
            setSellBottomExpanded={setSellBottomExpanded}
            sellPrices={sellPrices}
            sellPriceLocked={sellPriceLocked}
            sellTotalInput={sellTotalInput}
            busy={busy}
            isMounted={isMounted}
            toggleSellSelect={toggleSellSelect}
            handleSellItemPrice={handleSellItemPrice}
            handleSellTotalChange={handleSellTotalChange}
            handleConfirmSell={handleConfirmSell}
          />
        )}
        {tab === "deal" && (
          <DealTab
            dealCards={dealCards}
            setDealCards={setDealCards}
            dealStep={dealStep}
            setDealStep={setDealStep}
            dealCashPct={dealCashPct}
            setDealCashPct={setDealCashPct}
            dealTradePct={dealTradePct}
            setDealTradePct={setDealTradePct}
            dealTradeSelections={dealTradeSelections}
            setDealTradeSelections={setDealTradeSelections}
            dealAddName={dealAddName}
            setDealAddName={setDealAddName}
            setDealAddCard={setDealAddCard}
            dealAddGrade={dealAddGrade}
            setDealAddGrade={setDealAddGrade}
            dealAddCondition={dealAddCondition}
            setDealAddCondition={setDealAddCondition}
            dealAddMarket={dealAddMarket}
            setDealAddMarket={setDealAddMarket}
            dealInventoryQuery={dealInventoryQuery}
            setDealInventoryQuery={setDealInventoryQuery}
            dealInventoryFilter={dealInventoryFilter}
            setDealInventoryFilter={setDealInventoryFilter}
            dealSortBy={dealSortBy}
            setDealSortBy={setDealSortBy}
            dealPriceRange={dealPriceRange}
            setDealPriceRange={setDealPriceRange}
            dealCertOpen={dealCertOpen}
            setDealCertOpen={setDealCertOpen}
            dealInventoryShowMore={dealInventoryShowMore}
            setDealInventoryShowMore={setDealInventoryShowMore}
            dealCompleteSummary={dealCompleteSummary}
            tradeInventory={tradeInventory}
            tradeInventoryLoaded={tradeInventoryLoaded}
            busy={busy}
            handleDealAddCard={handleDealAddCard}
            handleDealRemoveCard={handleDealRemoveCard}
            handleDealSetDisposition={handleDealSetDisposition}
            handleDealSetBuyPrice={handleDealSetBuyPrice}
            handleDealReset={handleDealReset}
            handleCompleteDeal={handleCompleteDeal}
            setScannerOpen={setScannerOpen}
          />
        )}
        {tab === "trade" && (
          <TradeTab
            tradeInventory={tradeInventory}
            tradeInventoryLoaded={tradeInventoryLoaded}
            tradeInventoryQuery={tradeInventoryQuery}
            setTradeInventoryQuery={setTradeInventoryQuery}
            tradeGoingOut={tradeGoingOut}
            setTradeGoingOut={setTradeGoingOut}
            tradeComingIn={tradeComingIn}
            setTradeComingIn={setTradeComingIn}
            tradeCashOverride={tradeCashOverride}
            setTradeCashOverride={setTradeCashOverride}
            tradeCashDir={tradeCashDir}
            setTradeCashDir={setTradeCashDir}
            tradeNotes={tradeNotes}
            setTradeNotes={setTradeNotes}
            tradeBottomExpanded={tradeBottomExpanded}
            setTradeBottomExpanded={setTradeBottomExpanded}
            tradeCategoryFilter={tradeCategoryFilter}
            setTradeCategoryFilter={setTradeCategoryFilter}
            tradeSortBy={tradeSortBy}
            setTradeSortBy={setTradeSortBy}
            tradePriceRange={tradePriceRange}
            setTradePriceRange={setTradePriceRange}
            tradeShowMore={tradeShowMore}
            setTradeShowMore={setTradeShowMore}
            busy={busy}
            isMounted={isMounted}
            setScannerOpen={setScannerOpen}
            setScannerTradeCardId={setScannerTradeCardId}
            handleRecordTrade={handleRecordTrade}
            err={err}
          />
        )}
      </div>

      {/* ── Activity feed ── */}
      <ActivityFeed
        feed={feed}
        expandedBatches={expandedBatches}
        setExpandedBatches={setExpandedBatches}
        busy={busy}
        handleUndo={handleUndo}
        setLightboxUrl={setLightboxUrl}
      />

      {/* ── Modals ── */}
      {endOpen && (
        <EndShowModal
          session={session}
          endStep={endStep}
          setEndStep={setEndStep}
          setEndOpen={setEndOpen}
          actualCash={actualCash}
          setActualCash={setActualCash}
          busy={busy}
          handleEndShow={handleEndShow}
        />
      )}
      {expenseOpen && (
        <ExpenseModal
          expenseDesc={expenseDesc}
          setExpenseDesc={setExpenseDesc}
          expenseCost={expenseCost}
          setExpenseCost={setExpenseCost}
          expenseCategory={expenseCategory}
          setExpenseCategory={setExpenseCategory}
          expensePaidBy={expensePaidBy}
          setExpensePaidBy={setExpensePaidBy}
          busy={busy}
          handleAddExpense={handleAddExpense}
          setExpenseOpen={setExpenseOpen}
        />
      )}
      {cashCountOpen && (
        <CashCountModal
          session={session}
          expectedCash={expectedCash}
          cashCountInput={cashCountInput}
          setCashCountInput={setCashCountInput}
          setCashCountOpen={setCashCountOpen}
        />
      )}

      {/* ── Pending sync modal ── */}
      {pendingModalOpen && (
        <PendingSyncModal
          pendingModalActions={pendingModalActions}
          setPendingModalActions={setPendingModalActions}
          setPendingModalOpen={setPendingModalOpen}
          setPendingCount={setPendingCount}
        />
      )}

      {/* ── Deal photo modal (centered, above bottom nav) ── */}
      {photoPrompt && (
        <DealPhotoModal
          photoPreview={photoPreview}
          setPhotoFile={setPhotoFile}
          setPhotoPreview={setPhotoPreview}
          photoUploading={photoUploading}
          dealNotes={dealNotes}
          setDealNotes={setDealNotes}
          photoInputRef={photoInputRef}
          dismissPhotoPrompt={dismissPhotoPrompt}
          handlePhotoConfirm={handlePhotoConfirm}
        />
      )}

      {/* ── Card image scanner ── */}
      {scannerOpen && (
        <CardImageScanner
          onResult={handleScanResult}
          onClose={() => { setScannerOpen(null); setScannerTradeCardId(null); }}
        />
      )}

      {/* ── Photo lightbox ── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Deal photo"
            className="max-w-full max-h-full object-contain rounded-xl p-4"
          />
        </div>
      )}

      {/* Hidden file input for camera/gallery */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handlePhotoSelected(file);
          e.target.value = "";
        }}
      />

      {/* ── Mobile bottom nav (replaces regular app nav during show mode) ── */}
      {isMounted && createPortal(
        <div
          className="show-mode-bottom-nav md:hidden bg-background border-t border-border flex h-14"
          style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999 }}
        >
          {(["scan", "buy", "sell", "deal", "trade"] as const).map((t) => {
            const active = tab === t;
            const Icon = t === "scan" ? ScanLine : t === "buy" ? ShoppingBag : t === "sell" ? DollarSign : t === "deal" ? Handshake : ArrowLeftRight;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
                <span className="text-[10px] font-medium capitalize">{t}</span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
