"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ScanLine, ShoppingBag, DollarSign, ArrowLeftRight, Handshake, Camera, X as XIcon, ChevronDown, Clock, RefreshCw } from "lucide-react";
import CardAutocomplete, { type AutocompleteCard } from "@/components/CardAutocomplete";
import CertLookupWidget, { type CertWidgetResult } from "@/components/CertLookupWidget";
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
  type ShowScanEntry,
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
  getPendingActions,
  type PendingAction,
  pendingActionLabel,
} from "@/lib/offlineQueue";
import { startAutoSync, replayPendingActions, replayOneAction } from "@/lib/offlineSync";
import { uploadDealPhoto } from "../photos/actions";

// ── Constants ─────────────────────────────────────────────────────────────────

const BUY_PCTS = [70, 75, 80, 85, 90];

type GradeCompany = "PSA" | "BGS" | "CGC" | "TAG";
const GRADE_COMPANIES_LIST: GradeCompany[] = ["PSA", "BGS", "CGC", "TAG"];
const GRADE_OPTIONS: Record<GradeCompany, string[]> = {
  PSA:  ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1"],
  BGS:  ["10 Black Label", "10", "9.5", "9", "8.5", "8", "7.5", "7", "6.5", "6", "5.5", "5"],
  CGC:  ["10 Perfect", "10 Pristine", "9.5", "9", "8.5", "8", "7.5", "7", "6.5", "6", "5.5", "5"],
  TAG:  ["10", "9.5", "9", "8.5", "8", "7.5", "7", "6.5", "6", "5.5", "5", "4.5", "4"],
};
const CONDITIONS_LIST = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"] as const;
const COND_ABBREV: Record<string, string> = { "Near Mint": "NM", "Lightly Played": "LP", "Moderately Played": "MP", "Heavily Played": "HP", "Damaged": "DMG" };
const PRODUCT_TYPES_LIST = ["Booster Box", "ETB", "Booster Bundle", "Tin", "Collection Box", "Booster Pack", "Case", "Other"] as const;

const EXPENSE_CATEGORIES = [
  { value: "table", label: "Table fee" },
  { value: "travel", label: "Travel / gas" },
  { value: "hotel", label: "Hotel" },
  { value: "food", label: "Food" },
  { value: "supplies", label: "Supplies" },
  { value: "other", label: "Other" },
];
const STORAGE_KEY = "ozone_active_show_session_id";

// ── Helpers ───────────────────────────────────────────────────────────────────

function money(v: number | null) {
  if (v == null) return "—";
  return `$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
/** Like money() but preserves the sign — negative shows as -$XX.XX */
function moneyCash(v: number | null) {
  if (v == null) return "—";
  const abs = Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `-$${abs}` : `$${abs}`;
}
function moneySign(v: number) {
  return (v >= 0 ? "+" : "−") + `$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

// ── FeedEntry ─────────────────────────────────────────────────────────────────

type FeedEntry = {
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

function scanToFeed(s: ShowScanEntry): FeedEntry {
  const kind =
    s.action === "bought" ? "buy"
    : s.action === "sold" ? "sell"
    : s.action === "trade" ? "trade"
    : s.action === "expense" ? "expense"
    : "pass";

  let amount: number | null = null;
  let label = s.card_name ?? "—";
  let sub: string | undefined;

  if (kind === "buy") {
    const cost =
      s.market_price != null && s.buy_percentage != null
        ? s.market_price * s.buy_percentage / 100
        : s.market_price;
    amount = cost != null ? -cost : null;
    sub = s.grade
      ? `${s.grade}${s.buy_percentage ? ` · ${s.buy_percentage}%` : ""}`
      : s.buy_percentage ? `${s.buy_percentage}%` : undefined;
  } else if (kind === "sell") {
    amount = s.market_price != null ? s.market_price : null;
  } else if (kind === "trade") {
    const m = s.notes?.match(/Cash (received|paid): \$([\d.]+)/);
    if (m) {
      const v = parseFloat(m[2]);
      amount = m[1] === "received" ? v : -v;
    }
    // Strip embedded undo data before displaying
    const displayNotes = s.notes?.replace(/\|\|__UNDO__.+$|^__UNDO__.+$/, "").trim();
    sub = displayNotes || undefined;
  } else if (kind === "expense") {
    amount = s.market_price != null ? -s.market_price : null;
  } else {
    sub = s.grade ?? undefined;
  }

  return { id: s.id, kind, time: s.scanned_at, label, sub, amount, photoUrl: s.deal_photo_url, batchId: s.batch_id };
}

// ── Inventory search scoring ──────────────────────────────────────────────────

/** Split query into normalised terms (strips punctuation, lowercases). */
function queryTerms(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[',\-\.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((t) => t.length > 0);
}

function scoreInventoryItem(item: import("./actions").InventorySearchResult, terms: string[]): number {
  if (!terms.length) return 1;
  const name  = item.name.toLowerCase();
  const set   = (item.set_name    ?? "").toLowerCase();
  const num   = (item.card_number ?? "").toLowerCase().replace(/^0+/, "");
  const grade = (item.grade       ?? "").toLowerCase();
  const cond  = (item.condition   ?? "").toLowerCase();
  let score = 0;
  for (const term of terms) {
    const numTerm = term.replace(/^0+/, "");
    if (name.includes(term))                               score += 3;
    if (set.includes(term))                                score += 2;
    if (numTerm && num === numTerm)                        score += 4; // exact card #
    else if (numTerm && /^\d/.test(numTerm) && num.startsWith(numTerm)) score += 3;
    if (grade.includes(term) || cond.includes(term))      score += 1;
  }
  return score;
}

function filterInventory(
  items: import("./actions").InventorySearchResult[],
  query: string
): import("./actions").InventorySearchResult[] {
  const terms = queryTerms(query);
  if (!terms.length) return items;
  return items
    .map((item) => ({ item, score: scoreInventoryItem(item, terms) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

// ── Sort + price-range filter ─────────────────────────────────────────────────

type SortBy = "name" | "price-high" | "price-low" | "recent";
type PriceRange = "all" | "under25" | "25to100" | "100to500" | "over500";

function applyInventoryFilters(
  items: import("./actions").InventorySearchResult[],
  sortBy: SortBy,
  priceRange: PriceRange
): import("./actions").InventorySearchResult[] {
  // Price filter — items with no market price pass through unconditionally
  let result = items;
  if (priceRange !== "all") {
    result = items.filter((i) => {
      const p = i.market;
      if (p == null) return true;
      if (priceRange === "under25")   return p < 25;
      if (priceRange === "25to100")   return p >= 25 && p <= 100;
      if (priceRange === "100to500")  return p > 100 && p <= 500;
      if (priceRange === "over500")   return p > 500;
      return true;
    });
  }

  // Sort ("recent" keeps original DB order)
  if (sortBy === "name") {
    result = [...result].sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortBy === "price-high") {
    result = [...result].sort((a, b) => (b.market ?? -1) - (a.market ?? -1));
  } else if (sortBy === "price-low") {
    result = [...result].sort((a, b) => (a.market ?? Infinity) - (b.market ?? Infinity));
  }

  return result;
}

// ── Term highlighting ─────────────────────────────────────────────────────────

function HighlightTerms({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const lower = text.toLowerCase();
  const ranges: [number, number][] = [];
  for (const term of terms) {
    let idx = lower.indexOf(term);
    while (idx !== -1) {
      ranges.push([idx, idx + term.length]);
      idx = lower.indexOf(term, idx + 1);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of ranges) {
    if (merged.length && s <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    } else {
      merged.push([s, e]);
    }
  }
  const parts: React.ReactNode[] = [];
  let pos = 0;
  for (const [s, e] of merged) {
    if (pos < s) parts.push(<span key={`t${pos}`}>{text.slice(pos, s)}</span>);
    parts.push(<span key={`h${s}`} style={{ color: "var(--accent-primary)", fontWeight: 600 }}>{text.slice(s, e)}</span>);
    pos = e;
  }
  if (pos < text.length) parts.push(<span key={`t${pos}`}>{text.slice(pos)}</span>);
  return <>{parts}</>;
}

// ── Trade tab types ───────────────────────────────────────────────────────────

type TradeComingIn = { _id: string; name: string; grade: string; marketPrice: string };

function blankTradeComingIn(): TradeComingIn {
  return { _id: crypto.randomUUID(), name: "", grade: "", marketPrice: "" };
}

// ── Deal tab types ────────────────────────────────────────────────────────────

type DealCard = {
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

type DealStep = "evaluate" | "quote" | "fulfill" | "complete";

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

  type StagedBuy = {
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
      <div
        className="sticky top-14 z-30 px-4 pt-2 pb-1.5 border-b"
        style={{ background: "var(--bg-glass, rgba(13,11,20,0.92))", backdropFilter: "blur(12px)" }}
      >
        {/* Show name row */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-start gap-2 min-w-0">
            <div
              className="text-xs font-bold tracking-widest uppercase px-1.5 py-0.5 rounded shrink-0 mt-0.5"
              style={{ background: "rgba(234,179,8,0.15)", color: "#eab308" }}
            >
              SHOW
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <div className="text-sm font-semibold truncate">{session.name}</div>
                {isOffline && (
                  <span className="shrink-0 w-2 h-2 rounded-full bg-red-500" title="Offline" />
                )}
                {pendingCount > 0 && (
                  <button
                    onClick={async () => {
                      const actions = await getPendingActions().catch(() => []);
                      setPendingModalActions(actions);
                      setPendingModalOpen(true);
                    }}
                    className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ background: "rgba(234,179,8,0.2)", color: "#eab308" }}
                  >
                    {pendingCount} pending
                  </button>
                )}
              </div>
              <div className="text-[10px] opacity-40 leading-tight">{fmtDate(session.date)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setExpenseOpen(true)}
              className="text-xs px-2 py-1 rounded-lg border opacity-50 hover:opacity-80 transition-opacity"
            >
              + Expense
            </button>
            <button
              onClick={() => { setEndOpen(true); setEndStep("preview"); }}
              className="text-xs px-2 py-1 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              End
            </button>
          </div>
        </div>

        {/* Primary stats row — always visible */}
        <div className="grid grid-cols-3 gap-2 pb-0.5">
          {/* Cash — tappable */}
          <div
            className="rounded-xl px-3 py-2 cursor-pointer"
            style={{ background: "rgba(255,255,255,0.05)" }}
            onClick={() => { setCashCountInput(""); setCashCountOpen(true); }}
            title="Tap to count cash"
          >
            <div className="text-[9px] uppercase tracking-wide opacity-40 mb-1">Cash</div>
            <div className={`text-base font-bold tabular-nums leading-none underline decoration-dotted underline-offset-2 ${expectedCash < 0 ? "text-rose-400" : ""}`}>
              {moneyCash(expectedCash)}
            </div>
          </div>
          {/* P&L */}
          <div
            className="rounded-xl px-3 py-2"
            style={{ background: "rgba(255,255,255,0.05)" }}
          >
            <div className="text-[9px] uppercase tracking-wide opacity-40 mb-1">P&L</div>
            <div className={`text-base font-bold tabular-nums leading-none ${session.net_pl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {moneySign(session.net_pl)}
            </div>
          </div>
          {/* Cards in / out */}
          <div
            className="rounded-xl px-3 py-2"
            style={{ background: "rgba(255,255,255,0.05)" }}
          >
            <div className="text-[9px] uppercase tracking-wide opacity-40 mb-1">Cards</div>
            <div className="text-[11px] font-bold tabular-nums leading-none flex items-baseline gap-1.5">
              <span className="text-emerald-400">{session.cards_bought}<span className="font-normal opacity-60 ml-0.5">in</span></span>
              <span className="opacity-20">·</span>
              <span>{session.cards_sold}<span className="font-normal opacity-60 ml-0.5">out</span></span>
            </div>
          </div>
        </div>

        {/* Expandable more stats */}
        <button
          onClick={() => setStatsExpanded((e) => !e)}
          className="w-full text-[9px] uppercase tracking-wide opacity-30 hover:opacity-50 transition-opacity pt-1.5 pb-0"
        >
          {statsExpanded ? "▲ Less" : "▼ More stats"}
        </button>
        {statsExpanded && (
          <div className="border-t mt-1.5 pt-2 pb-0.5">
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: "Spent",   value: money(session.total_spent),    color: "text-rose-400" },
                { label: "Revenue", value: money(session.total_revenue),  color: "text-emerald-400" },
                { label: "Trades",  value: String(session.trades_count),  color: "" },
                { label: "Passed",  value: String(session.passes_count),  color: "" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl px-2 py-1.5 text-center"
                  style={{ background: "rgba(255,255,255,0.04)" }}
                >
                  <div className="text-[9px] uppercase tracking-wide opacity-40 mb-0.5">{stat.label}</div>
                  <div className={`text-xs font-bold tabular-nums ${stat.color}`}>{stat.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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
        {tab === "scan" && renderScanTab()}
        {tab === "buy" && renderBuyTab()}
        {tab === "sell" && renderSellTab()}
        {tab === "deal" && renderDealTab()}
        {tab === "trade" && renderTradeTab()}
      </div>

      {/* ── Activity feed ── */}
      <div className="px-4 pt-4 pb-24 md:pb-20">
        <div className="text-xs font-semibold uppercase tracking-wide opacity-30 mb-2">Activity</div>
        {feed.length === 0 ? (
          <div className="text-sm opacity-30 text-center py-6">No activity yet</div>
        ) : (
          <div className="space-y-0">
            {(() => {
              // Group consecutive entries that share a batch_id
              type FeedGroup = { isBatch: true; batchId: string; entries: FeedEntry[] } | { isBatch: false; entry: FeedEntry };
              const groups: FeedGroup[] = [];
              const batchMap = new Map<string, FeedEntry[]>();
              for (const entry of feed) {
                if (entry.batchId) {
                  if (!batchMap.has(entry.batchId)) {
                    const arr: FeedEntry[] = [];
                    batchMap.set(entry.batchId, arr);
                    groups.push({ isBatch: true, batchId: entry.batchId, entries: arr });
                  }
                  batchMap.get(entry.batchId)!.push(entry);
                } else {
                  groups.push({ isBatch: false, entry });
                }
              }

              const kindBadgeClass = (kind: FeedEntry["kind"]) =>
                kind === "buy" ? "bg-rose-500/15 text-rose-400"
                : kind === "sell" ? "bg-emerald-500/15 text-emerald-400"
                : kind === "trade" ? "bg-violet-500/15 text-violet-400"
                : kind === "expense" ? "bg-amber-500/15 text-amber-400"
                : "bg-zinc-500/10 opacity-40";

              const kindLabel = (kind: FeedEntry["kind"]) =>
                kind === "buy" ? "BUY" : kind === "sell" ? "SELL" : kind === "trade" ? "TRADE" : kind === "expense" ? "EXP" : "PASS";

              function renderSingleEntry(entry: FeedEntry, compact = false) {
                const canUndo = entry.kind !== "pass" && !entry.pending;
                return (
                  <div key={entry.id} className={`flex items-start gap-3 ${compact ? "py-1.5" : "py-2.5"} border-t first:border-t-0 ${entry.pending ? "opacity-70" : ""}`}>
                    {!compact && (
                      <div className="text-[10px] opacity-40 tabular-nums shrink-0 pt-0.5 w-14">{fmtTime(entry.time)}</div>
                    )}
                    {!compact && (
                      <div className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${kindBadgeClass(entry.kind)}`}>
                        {kindLabel(entry.kind)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className={`${compact ? "text-xs" : "text-sm"} leading-tight truncate`}>{entry.label}</div>
                      {entry.sub && <div className="text-[10px] opacity-40 mt-0.5">{entry.sub}</div>}
                    </div>
                    {entry.photoUrl && (
                      <button className="shrink-0 w-9 h-9 rounded-lg overflow-hidden border border-border/50" onClick={() => setLightboxUrl(entry.photoUrl!)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={entry.photoUrl} alt="" className="w-full h-full object-cover" />
                      </button>
                    )}
                    <div className="flex items-center gap-2 shrink-0">
                      {entry.amount != null && (
                        <div className={`${compact ? "text-xs" : "text-sm"} font-semibold tabular-nums ${entry.amount > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {entry.amount > 0 ? "+" : "−"}{money(Math.abs(entry.amount))}
                        </div>
                      )}
                      {entry.pending && (
                        <Clock size={12} className="text-amber-400 shrink-0" aria-label="Pending sync" />
                      )}
                      {canUndo && (
                        <button
                          onClick={() => handleUndo(entry.id)}
                          disabled={busy}
                          className="text-[10px] px-2 py-0.5 rounded border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 disabled:opacity-30 transition-colors"
                        >
                          Undo
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              return groups.map((group, gi) => {
                if (!group.isBatch) return renderSingleEntry(group.entry);

                const { batchId, entries } = group;
                const expanded = expandedBatches.has(batchId);
                const totalAmt = entries.reduce((s, e) => s + (e.amount ?? 0), 0);
                const firstEntry = entries[0];
                const photoUrl = entries.find((e) => e.photoUrl)?.photoUrl;
                const toggle = () => setExpandedBatches((prev) => {
                  const next = new Set(prev);
                  next.has(batchId) ? next.delete(batchId) : next.add(batchId);
                  return next;
                });

                return (
                  <div key={batchId} className={gi > 0 ? "border-t" : ""}>
                    {/* Parent row */}
                    <button
                      className="w-full flex items-center gap-3 py-2.5 text-left"
                      onClick={toggle}
                    >
                      <div className="text-[10px] opacity-40 tabular-nums shrink-0 w-14">{fmtTime(firstEntry.time)}</div>
                      <div className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 bg-rose-500/15 text-rose-400">
                        BATCH BUY
                      </div>
                      <div className="flex-1 min-w-0 text-xs font-medium opacity-70">
                        {entries.length} cards
                      </div>
                      {photoUrl && (
                        <button
                          className="shrink-0 w-7 h-7 rounded-md overflow-hidden border border-border/50"
                          onClick={(e) => { e.stopPropagation(); setLightboxUrl(photoUrl); }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                        </button>
                      )}
                      <div className="text-sm font-semibold tabular-nums text-rose-400 shrink-0">
                        −{money(Math.abs(totalAmt))}
                      </div>
                      <ChevronDown
                        size={12}
                        className={`opacity-40 shrink-0 transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
                      />
                    </button>
                    {/* Expanded children */}
                    {expanded && (
                      <div className="ml-4 pl-3 border-l-2 border-rose-500/10 mb-2">
                        {entries.map((e) => renderSingleEntry(e, true))}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {endOpen && renderEndModal()}
      {expenseOpen && renderExpenseModal()}
      {cashCountOpen && renderCashCountModal()}

      {/* ── Pending sync modal ── */}
      {pendingModalOpen && (
        <div
          className="fixed inset-0 flex items-end sm:items-center justify-center modal-backdrop p-4"
          style={{ zIndex: 9999 }}
          onClick={() => setPendingModalOpen(false)}
        >
          <div
            className="modal-panel w-full max-w-sm p-5 space-y-4 max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Pending Transactions</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    const { synced, failed } = await replayPendingActions();
                    const actions = await getPendingActions().catch(() => []);
                    setPendingModalActions(actions);
                    getPendingCount().then(setPendingCount).catch(() => {});
                    if (synced > 0 && failed === 0) setPendingModalOpen(false);
                  }}
                  className="text-xs px-2.5 py-1 rounded-lg border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 flex items-center gap-1.5"
                >
                  <RefreshCw size={11} />
                  Retry All
                </button>
                <button onClick={() => setPendingModalOpen(false)}>
                  <XIcon size={16} className="opacity-50" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto space-y-2 flex-1">
              {pendingModalActions.length === 0 ? (
                <div className="text-xs opacity-50 text-center py-4">No pending transactions</div>
              ) : (
                pendingModalActions.map((action) => {
                  const isFailed = action.retryCount > 3;
                  return (
                    <div
                      key={action.id}
                      className={`flex items-start gap-3 p-2.5 rounded-xl border ${isFailed ? "border-red-500/30 bg-red-500/5" : "border-amber-500/20 bg-amber-500/5"}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{pendingActionLabel(action)}</div>
                        <div className={`text-[10px] mt-0.5 ${isFailed ? "text-red-400" : "opacity-40"}`}>
                          {action.actionType.toUpperCase()} · {new Date(action.timestamp).toLocaleTimeString()}
                          {isFailed && action.errorMessage && ` · ${action.errorMessage}`}
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          await replayOneAction(action.id);
                          const actions = await getPendingActions().catch(() => []);
                          setPendingModalActions(actions);
                          getPendingCount().then(setPendingCount).catch(() => {});
                        }}
                        className="shrink-0 text-[10px] px-2 py-0.5 rounded border border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                      >
                        Retry
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Deal photo modal (centered, above bottom nav) ── */}
      {photoPrompt && (
        <div
          className="fixed inset-0 flex items-center justify-center modal-backdrop p-4"
          style={{ zIndex: 9999 }}
          onClick={dismissPhotoPrompt}
        >
          <div
            className="modal-panel w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div className="flex items-center gap-2">
                <Camera size={16} className="text-muted-foreground" />
                <span className="text-sm font-semibold">{photoPreview ? "Confirm photo" : "Add a photo"}</span>
              </div>
              <button onClick={dismissPhotoPrompt} className="p-1.5 rounded-lg hover:bg-white/8 transition-colors text-muted-foreground">
                <XIcon size={15} />
              </button>
            </div>

            <div className="px-5 pb-5 space-y-4">
              {photoPreview ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoPreview}
                    alt="Deal photo preview"
                    className="w-full rounded-xl object-cover max-h-64"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => { setPhotoFile(null); if (photoPreview) URL.revokeObjectURL(photoPreview); setPhotoPreview(null); }}
                      className="modal-btn-ghost py-2.5"
                    >
                      Retake
                    </button>
                    <button
                      onClick={handlePhotoConfirm}
                      disabled={photoUploading}
                      className="modal-btn-primary py-2.5"
                    >
                      {photoUploading ? "Saving…" : "Save Photo"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <textarea
                    rows={2}
                    placeholder="Optional notes…"
                    className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background resize-none"
                    value={dealNotes}
                    onChange={(e) => setDealNotes(e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={dismissPhotoPrompt}
                      className="modal-btn-ghost py-2.5"
                    >
                      Skip
                    </button>
                    <button
                      onClick={() => photoInputRef.current?.click()}
                      className="modal-btn-primary py-2.5 flex items-center justify-center gap-2"
                    >
                      <Camera size={14} />
                      Take Photo
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
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

  // ── Tab renders ───────────────────────────────────────────────────────────

  function renderScanTab() {
    return (
      <div className="space-y-3">
        {/* Camera or collapsed "Scan another" bar */}
        {scanResult ? (
          <button
            onClick={() => {
              setScanResult(null);
              setScanMarket("");
              setScanShowCustom(false);
              setScanCustomPct("");
              setScanShowFlat(false);
              setScanFlatAmount("");
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm opacity-60 hover:opacity-80 transition-opacity"
          >
            <ScanLine size={14} />
            Scan another cert
          </button>
        ) : (
          <div className="border rounded-xl overflow-hidden">
            <CertLookupWidget
              embedded
              defaultCameraOn
              onResult={onScanResult}
            />
          </div>
        )}

        {/* Buy / pass UI — appears after a card is scanned */}
        {scanResult && (
          <div className="border rounded-xl p-4 space-y-3">
            {/* Card info */}
            <div>
              <div className="text-sm font-semibold">{scanResult.name}</div>
              <div className="text-xs opacity-50 mt-0.5">
                {[scanResult.company, scanResult.gradeLabel, scanResult.grade].filter(Boolean).join(" ")}
                {scanResult.setName && ` · ${scanResult.setName}`}
              </div>
            </div>

            {/* Market + Owner row */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs opacity-50 mb-1">Market price</div>
                <input
                  type="number"
                  inputMode="decimal"
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background font-mono"
                  placeholder="$0.00"
                  value={scanMarket}
                  onChange={(e) => setScanMarket(e.target.value)}
                />
              </div>
              <div>
                <div className="text-xs opacity-50 mb-1">Owner</div>
                <div className="flex gap-1 flex-wrap">
                  {(["shared", "alex", "mila"] as const).map((o) => (
                    <button
                      key={o}
                      onClick={() => setScanOwner(o)}
                      className={`text-xs px-2 py-1 rounded-full border transition-colors capitalize ${
                        scanOwner === o ? "text-white" : "opacity-40 hover:opacity-60"
                      }`}
                      style={scanOwner === o ? { background: "var(--accent-primary)", borderColor: "var(--accent-primary)" } : undefined}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Buy percentage buttons */}
            <div className="space-y-2">
              <div className="grid grid-cols-5 gap-1">
                {BUY_PCTS.map((pct) => {
                  const market = parseFloat(scanMarket) || 0;
                  const cost = market > 0 ? parseFloat((market * pct / 100).toFixed(2)) : null;
                  return (
                    <button
                      key={pct}
                      onClick={() => handleScanBuy(pct)}
                      disabled={busy || !parseFloat(scanMarket)}
                      className="flex flex-col items-center py-2.5 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 disabled:opacity-30 transition-colors"
                    >
                      <span className="text-xs font-bold">{pct}%</span>
                      <span className="text-[10px] opacity-70">{cost != null ? money(cost) : "—"}</span>
                    </button>
                  );
                })}
              </div>

              {/* Custom % / Flat $ */}
              {scanShowCustom ? (
                <div className="flex gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background"
                    placeholder="Custom %"
                    value={scanCustomPct}
                    onChange={(e) => setScanCustomPct(e.target.value)}
                    autoFocus
                  />
                  <button
                    onClick={() => { const p = parseFloat(scanCustomPct); if (p > 0) handleScanBuy(p); }}
                    disabled={busy || !parseFloat(scanCustomPct)}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-30"
                    style={{ background: "var(--accent-primary)" }}
                  >
                    Buy
                  </button>
                  <button onClick={() => setScanShowCustom(false)} className="px-3 py-2 rounded-lg border text-sm opacity-50"><XIcon size={13} /></button>
                </div>
              ) : scanShowFlat ? (
                <div className="flex gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background font-mono"
                    placeholder="Flat $ amount"
                    value={scanFlatAmount}
                    onChange={(e) => setScanFlatAmount(e.target.value)}
                    autoFocus
                  />
                  <button
                    onClick={handleScanBuyFlat}
                    disabled={busy || !parseFloat(scanFlatAmount)}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-30"
                    style={{ background: "var(--accent-primary)" }}
                  >
                    Buy
                  </button>
                  <button onClick={() => setScanShowFlat(false)} className="px-3 py-2 rounded-lg border text-sm opacity-50"><XIcon size={13} /></button>
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <button
                    onClick={() => { setScanShowCustom(true); setScanShowFlat(false); }}
                    className="flex-1 py-2 rounded-lg border text-xs opacity-50 hover:opacity-70 transition-opacity"
                  >
                    Custom %
                  </button>
                  <button
                    onClick={() => { setScanShowFlat(true); setScanShowCustom(false); }}
                    className="flex-1 py-2 rounded-lg border text-xs opacity-50 hover:opacity-70 transition-opacity"
                  >
                    Flat $
                  </button>
                </div>
              )}

              {/* Pass */}
              <button
                onClick={handleScanPass}
                disabled={busy}
                className="w-full py-3 rounded-xl border text-sm font-medium opacity-50 hover:opacity-70 transition-opacity"
              >
                Pass
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderBuyTab() {
    const batchMarketNum = parseFloat(batchMarket) || 0;
    const flatAmt = parseFloat(batchFlatAmount) || 0;
    const effectivePct = batchPct > 0 ? batchPct : (parseFloat(batchCustomPct) || 0);
    const stageCost = flatAmt > 0 ? flatAmt
      : effectivePct > 0 && batchMarketNum > 0 ? parseFloat((batchMarketNum * effectivePct / 100).toFixed(2)) : 0;
    const batchTotal = batchQueue.reduce((s, i) => s + i.cost, 0);
    const gradeList = GRADE_OPTIONS[batchGradeCompany] ?? [];
    const canAdd = !!batchQuery.trim() && batchMarketNum > 0 && stageCost > 0;

    return (
      <div className="space-y-3">

        {/* ── Card entry section ── */}
        <div className="border rounded-xl p-3 space-y-3">

          {/* Category pills — prominent at top */}
          <div className="grid grid-cols-3 gap-1.5">
            {(["single", "slab", "sealed"] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => { setBatchCategory(cat); if (cat !== "slab") setBuyCertOpen(false); }}
                className={`py-2 rounded-xl text-xs font-bold capitalize transition-colors ${
                  batchCategory === cat ? "text-white" : "border opacity-40 hover:opacity-60"
                }`}
                style={batchCategory === cat ? { background: "var(--accent-primary)" } : undefined}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Card autocomplete search — or inline cert row (slab only) */}
          {batchCategory === "slab" && buyCertOpen ? (
            <CertLookupWidget
              inlineRow
              controlledCompany={batchGradeCompany}
              onClose={() => setBuyCertOpen(false)}
              onResult={(r) => {
                const grade = r.gradeLabel ? `${r.gradeLabel} ${r.grade}`.trim() : r.grade;
                setBatchQuery(r.name);
                setBatchCard({ name: r.name, setName: r.setName ?? "", cardNumber: r.cardNumber ?? "", imageUrl: null, market: r.market });
                setBatchGradeCompany(r.company as GradeCompany);
                setBatchGradeValue(grade);
                if (r.market != null) setBatchMarket(r.market.toFixed(2));
                setBuyCertOpen(false);
              }}
            />
          ) : (
            <div className="flex gap-2">
              <CardAutocomplete
                value={batchQuery}
                onChange={(v) => { setBatchQuery(v); if (!v) { setBatchCard(null); setBatchMarket(""); } }}
                onSelect={onBatchCardSelect}
                placeholder="Search card name…"
                className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background"
              />
              {/* Camera scan button */}
              {!batchCard && (
                <button
                  type="button"
                  onClick={() => setScannerOpen("buy")}
                  className="flex items-center justify-center w-10 rounded-lg border border-border/60 opacity-60 hover:opacity-100 transition-opacity shrink-0"
                  title="Scan card with camera"
                >
                  <Camera size={16} />
                </button>
              )}
              {batchCategory === "slab" && !batchCard && (
                <button
                  type="button"
                  onClick={() => setBuyCertOpen(true)}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-lg border border-violet-500/30 text-violet-400 hover:bg-violet-500/10 transition-colors font-medium shrink-0"
                >
                  <ScanLine size={13} />
                  Cert
                </button>
              )}
            </div>
          )}

          {/* "Scan another cert" link — shown when card already selected from cert */}
          {batchCategory === "slab" && batchCard && !buyCertOpen && (
            <button
              type="button"
              onClick={() => { setBatchCard(null); setBatchQuery(""); setBatchMarket(""); setBuyCertOpen(true); }}
              className="text-[10px] text-violet-400 opacity-60 hover:opacity-100 transition-opacity flex items-center gap-1"
            >
              <ScanLine size={10} />
              Scan another cert
            </button>
          )}

          {/* Selected card preview row */}
          {batchCard && (
            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: "rgba(255,255,255,0.04)" }}>
              {batchCard.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={batchCard.imageUrl} alt="" className="h-9 w-6 object-contain rounded shrink-0" />
              ) : (
                <div className="h-9 w-6 bg-muted rounded shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{batchCard.name}</div>
                <div className="text-[10px] opacity-50 truncate">
                  {batchCard.setName}{batchCard.cardNumber && ` · #${batchCard.cardNumber}`}
                </div>
              </div>
              <button onClick={() => { setBatchCard(null); setBatchQuery(""); setBatchMarket(""); }} className="opacity-30 hover:opacity-60 p-1"><XIcon size={12} /></button>
            </div>
          )}

          {/* Recently used cards */}
          {!batchCard && !batchQuery && recentCards.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] opacity-30 uppercase tracking-wide font-semibold">Recent</div>
              {recentCards.map((rc, i) => (
                <button
                  key={i}
                  onMouseDown={(e) => { e.preventDefault(); onBatchCardSelect(rc); }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/60 text-left transition-colors"
                >
                  {rc.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={rc.imageUrl} alt="" className="h-8 w-5.5 object-contain rounded shrink-0" />
                  ) : (
                    <div className="h-8 w-5.5 bg-muted rounded shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{rc.name}</div>
                    <div className="text-[10px] opacity-40 truncate">{rc.setName}</div>
                  </div>
                  {rc.market != null && (
                    <span className="text-[10px] opacity-50 shrink-0">${rc.market.toFixed(0)}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Conditional fields by category */}
          {batchCategory === "single" && (
            <div className="grid grid-cols-5 gap-1">
              {CONDITIONS_LIST.map((cond) => (
                <button
                  key={cond}
                  onClick={() => {
                    setBatchCondition(cond);
                    if (batchCard) {
                      fetchBatchMarketPrice(batchCard.name, batchCard.setName || null, batchCard.cardNumber || null, cond, "single");
                    }
                  }}
                  className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    batchCondition === cond ? "text-white" : "border opacity-40 hover:opacity-60"
                  }`}
                  style={batchCondition === cond ? { background: "var(--accent-primary)" } : undefined}
                >
                  {COND_ABBREV[cond]}
                </button>
              ))}
            </div>
          )}

          {batchCategory === "slab" && (
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-1">
                {GRADE_COMPANIES_LIST.map((co) => (
                  <button
                    key={co}
                    onClick={() => {
                      setBatchGradeCompany(co);
                      setBatchGradeValue("");
                      // Grade value is reset — don't fetch until grade is chosen
                    }}
                    className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      batchGradeCompany === co ? "text-white" : "border opacity-40 hover:opacity-60"
                    }`}
                    style={batchGradeCompany === co ? { background: "var(--accent-primary)" } : undefined}
                  >
                    {co}
                  </button>
                ))}
              </div>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                value={batchGradeValue}
                onChange={(e) => {
                  const g = e.target.value;
                  setBatchGradeValue(g);
                  if (batchCard && g) {
                    fetchBatchMarketPrice(batchCard.name, batchCard.setName || null, batchCard.cardNumber || null, "Near Mint", "slab", batchGradeCompany, g);
                  }
                }}
              >
                <option value="">— Grade —</option>
                {gradeList.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          )}

          {batchCategory === "sealed" && (
            <div className="grid grid-cols-2 gap-2">
              <select
                className="border rounded-lg px-2 py-2 text-sm bg-background"
                value={batchProductType}
                onChange={(e) => setBatchProductType(e.target.value)}
              >
                {PRODUCT_TYPES_LIST.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <div className="flex items-center gap-2">
                <span className="text-xs opacity-40 shrink-0">Qty</span>
                <input
                  type="number"
                  inputMode="numeric"
                  className="w-full border rounded-lg px-2 py-2 text-sm bg-background text-center"
                  value={batchQuantity}
                  min="1"
                  onChange={(e) => setBatchQuantity(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Market price */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] opacity-40 uppercase tracking-wide">Market price</div>
              {batchMarketLoading && (
                <div className="flex items-center gap-1 text-[10px] opacity-50">
                  <span className="inline-block w-2.5 h-2.5 rounded-full border border-current border-t-transparent animate-spin" />
                  Fetching…
                </div>
              )}
            </div>
            <input
              type="number"
              inputMode="decimal"
              className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background font-mono"
              placeholder="$0.00"
              value={batchMarket}
              onChange={(e) => onBatchMarketChange(e.target.value)}
            />
          </div>
        </div>

        {/* ── Offer section ── */}
        <div className="border rounded-xl p-3 space-y-2.5">

          {/* Owner */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] opacity-40 uppercase tracking-wide">Owner</span>
            {(["shared", "alex", "mila"] as const).map((o) => (
              <button
                key={o}
                onClick={() => setBatchOwner(o)}
                className={`text-xs px-2.5 py-1 rounded-full border capitalize transition-colors ${batchOwner === o ? "text-white" : "opacity-40"}`}
                style={batchOwner === o ? { background: "var(--accent-primary)", borderColor: "var(--accent-primary)" } : undefined}
              >
                {o}
              </button>
            ))}
          </div>

          {/* Percentage pills */}
          <div className="grid grid-cols-5 gap-1">
            {BUY_PCTS.map((p) => {
              const isSelected = batchPct === p;
              const dollarCost = batchMarketNum > 0 ? parseFloat((batchMarketNum * p / 100).toFixed(2)) : null;
              return (
                <button
                  key={p}
                  onClick={() => onBatchPresetPctClick(p)}
                  className={`flex flex-col items-center py-2 rounded-xl border transition-colors ${
                    isSelected ? "text-white border-transparent" : "opacity-50 hover:opacity-75"
                  }`}
                  style={isSelected ? { background: "var(--accent-primary)" } : undefined}
                >
                  <span className="text-xs font-bold">{p}%</span>
                  <span className="text-[10px] opacity-70">{dollarCost != null ? money(dollarCost) : "—"}</span>
                </button>
              );
            })}
          </div>

          {/* Custom % and Flat $ — bidirectional */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] opacity-40 mb-1">Custom %</div>
              <input
                type="number"
                inputMode="decimal"
                className={`w-full border rounded-lg px-3 py-2 text-sm bg-background ${batchPct === 0 && batchCustomPct ? "border-violet-500" : ""}`}
                placeholder="e.g. 67"
                value={batchCustomPct}
                onChange={(e) => onBatchCustomPctChange(e.target.value)}
              />
            </div>
            <div>
              <div className="text-[10px] opacity-40 mb-1">Flat $</div>
              <input
                type="number"
                inputMode="decimal"
                className={`w-full border rounded-lg px-3 py-2 text-sm bg-background font-mono ${flatAmt > 0 && batchPct === 0 && !batchCustomPct ? "border-violet-500" : ""}`}
                placeholder="$0.00"
                value={batchFlatAmount}
                onChange={(e) => onBatchFlatChange(e.target.value)}
              />
            </div>
          </div>

          {/* Cost summary */}
          {stageCost > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs opacity-40">You pay:</span>
              <span className="font-bold text-rose-400">
                {money(stageCost)}
                {effectivePct > 0 && <span className="text-xs font-normal opacity-50 ml-1">@ {effectivePct}%</span>}
              </span>
            </div>
          )}

          <button
            onClick={handleAddToBatch}
            disabled={!canAdd}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
            style={{ background: "var(--accent-primary)" }}
          >
            + Add to batch
          </button>
        </div>

        {/* ── Batch list ── */}
        {batchQueue.length > 0 && (
          <div className="border rounded-xl overflow-hidden">
            {(() => {
              const batchMarketTotal = batchQueue.reduce((s, i) => s + (i.market ?? 0), 0);
              const batchMargin = batchMarketTotal > 0 ? batchMarketTotal - batchTotal : null;
              const batchAvgPct = batchMarketTotal > 0 ? (batchTotal / batchMarketTotal * 100) : 0;
              const summaryColor =
                batchAvgPct <= 0 ? "" :
                batchAvgPct <= 80 ? "text-emerald-400" :
                batchAvgPct <= 90 ? "text-amber-400" : "text-rose-400";
              return (
                <div className="px-3 py-2 border-b space-y-0.5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold">{batchQueue.length} card{batchQueue.length !== 1 ? "s" : ""}</div>
                    {batchAvgPct > 0 && (
                      <div className={`text-[10px] font-bold ${summaryColor}`}>{batchAvgPct.toFixed(1)}% avg</div>
                    )}
                  </div>
                  {batchMarketTotal > 0 && (
                    <div className="flex items-center gap-3 text-[10px]">
                      <span className="opacity-40">Market <span className="text-foreground font-medium opacity-70">{money(batchMarketTotal)}</span></span>
                      <span className="opacity-40">Paying <span className="text-rose-400 font-semibold">{money(batchTotal)}</span></span>
                      {batchMargin != null && (
                        <span className="opacity-40">Margin <span className={`font-semibold ${batchMargin >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {money(batchMargin)}{batchMarketTotal > 0 ? ` (${(batchMargin / batchMarketTotal * 100).toFixed(0)}%)` : ""}
                        </span></span>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="divide-y">
              {batchQueue.map((item) => (
                <div key={item._id} className="flex items-center gap-2 px-3 py-2">
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image_url} alt="" className="h-10 w-7 object-contain rounded shrink-0" />
                  ) : (
                    <div className="h-10 w-7 rounded shrink-0 flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <span className="text-[8px] uppercase opacity-30">{item.category.slice(0, 2)}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{item.name}</div>
                    <div className="text-[10px] opacity-40">{item.grade || item.condition} · {item.buy_pct}% · {item.owner}</div>
                  </div>
                  <div className="text-right shrink-0">
                    {item.market != null && (
                      <div className="text-[10px] opacity-40 mb-0.5">mkt {money(item.market)}</div>
                    )}
                    <div className="text-sm font-semibold text-rose-400">{money(item.cost)}</div>
                  </div>
                  <button
                    onClick={() => setBatchQueue((q) => q.filter((x) => x._id !== item._id))}
                    className="opacity-30 hover:opacity-60 p-0.5 shrink-0"
                  >
                    <XIcon size={12} />
                  </button>
                </div>
              ))}
            </div>
            <div className="p-3 border-t">
              <button
                onClick={handleFinalizeBatch}
                disabled={busy}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "#22c55e" }}
              >
                {busy ? "Recording…" : `Record ${batchQueue.length} card${batchQueue.length !== 1 ? "s" : ""} · ${money(batchTotal)}`}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderDealTab() {
    const cashCards = dealCards.filter((c) => c.disposition === "cash");
    const tradeCards = dealCards.filter((c) => c.disposition === "trade");
    const undecidedCards = dealCards.filter((c) => c.disposition === "undecided");

    const cashTotal = cashCards.reduce((s, c) => s + (c.buyPrice ?? (c.marketPrice ? c.marketPrice * dealCashPct / 100 : 0)), 0);
    const tradeTotal = tradeCards.reduce((s, c) => s + (c.buyPrice ?? (c.marketPrice ? c.marketPrice * dealTradePct / 100 : 0)), 0);
    const totalOffer = cashTotal + tradeTotal;

    const dealInventoryCategoryFiltered = dealInventoryFilter === "all"
      ? tradeInventory
      : tradeInventory.filter((i) => i.category === dealInventoryFilter);
    const dealInventoryFiltered = filterInventory(dealInventoryCategoryFiltered, dealInventoryQuery);
    const dealInventoryDisplay = applyInventoryFilters(dealInventoryFiltered, dealSortBy, dealPriceRange);
    const dealInventoryTerms = queryTerms(dealInventoryQuery);

    const SHOW_COUNT = dealInventoryShowMore ? dealInventoryDisplay.length : 12;

    // Step progress indicator
    const steps: { key: DealStep; label: string }[] = [
      { key: "evaluate", label: "Evaluate" },
      { key: "quote", label: "Quote" },
      { key: "fulfill", label: "Fulfill" },
      { key: "complete", label: "Done" },
    ];
    const stepIdx = steps.findIndex((s) => s.key === dealStep);

    return (
      <div className="space-y-4">
        {/* Step progress bar */}
        <div className="flex items-center gap-1">
          {steps.map((s, i) => (
            <React.Fragment key={s.key}>
              <button
                className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg transition-colors ${
                  i === stepIdx
                    ? "text-white"
                    : i < stepIdx
                    ? "opacity-60 hover:opacity-80"
                    : "opacity-20"
                }`}
                style={i === stepIdx ? { background: "var(--accent-primary)" } : undefined}
                onClick={() => {
                  if (i <= stepIdx || i === stepIdx + 1) setDealStep(s.key);
                }}
                disabled={i > stepIdx + 1}
              >
                {s.label}
              </button>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-px ${i < stepIdx ? "bg-primary/40" : "bg-border"}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* ── STEP 1: EVALUATE ── */}
        {dealStep === "evaluate" && (
          <div className="space-y-4">
            <div className="text-xs opacity-50">Add cards the customer wants to sell or trade.</div>

            {/* Existing cards list */}
            {dealCards.length > 0 && (
              <div className="space-y-2">
                {dealCards.map((card) => (
                  <div
                    key={card._id}
                    className="flex items-center gap-2 border rounded-xl p-2.5"
                  >
                    {card.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={card.image_url} alt="" className="w-8 h-11 rounded object-cover shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{card.name}</div>
                      <div className="text-[10px] opacity-40 truncate">
                        {[card.grade, card.set_name, card.card_number ? `#${card.card_number}` : null].filter(Boolean).join(" · ")}
                      </div>
                      {card.marketPrice != null && (
                        <div className="text-xs opacity-60 mt-0.5">Mkt {money(card.marketPrice)}</div>
                      )}
                    </div>
                    <button
                      onClick={() => handleDealRemoveCard(card._id)}
                      className="text-xs opacity-30 hover:opacity-60 shrink-0 p-1"
                    >✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Add card form */}
            <div className="border rounded-xl p-3 space-y-2.5">
              <div className="text-[10px] font-bold uppercase opacity-40">Add a card</div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <CardAutocomplete
                    value={dealAddName}
                    onChange={(q) => { setDealAddName(q); if (!q) setDealAddCard(null); }}
                    onSelect={(card) => {
                      setDealAddCard(card);
                      setDealAddName(card.name);
                      if (card.market != null) setDealAddMarket(card.market.toFixed(2));
                    }}
                    placeholder="Card name…"
                    className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background"
                  />
                </div>
                <button
                  onClick={() => setScannerOpen("deal-add")}
                  className="shrink-0 w-10 h-10 rounded-xl border flex items-center justify-center opacity-60 hover:opacity-90 transition-opacity"
                  title="Scan card"
                >
                  <Camera size={16} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] opacity-40 mb-1">Market price</div>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs opacity-40">$</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      className="w-full border rounded-lg pl-6 pr-3 py-2 text-sm bg-background font-mono"
                      placeholder="0.00"
                      value={dealAddMarket}
                      onChange={(e) => setDealAddMarket(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <div className="text-[10px] opacity-40 mb-1">Condition</div>
                  <select
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                    value={dealAddCondition}
                    onChange={(e) => setDealAddCondition(e.target.value)}
                  >
                    {CONDITIONS_LIST.map((c) => <option key={c} value={c}>{COND_ABBREV[c] ?? c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <div className="text-[10px] opacity-40 mb-1">Grade (optional)</div>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                  placeholder="e.g. PSA 9, BGS 9.5"
                  value={dealAddGrade}
                  onChange={(e) => setDealAddGrade(e.target.value)}
                />
              </div>

              {/* Cert lookup toggle */}
              <button
                onClick={() => setDealCertOpen((v) => !v)}
                className="text-[10px] opacity-40 hover:opacity-70 transition-opacity"
              >
                {dealCertOpen ? "▲ Hide cert lookup" : "▼ Lookup cert #"}
              </button>
              {dealCertOpen && (
                <CertLookupWidget
                  embedded
                  onResult={(r) => {
                    setDealAddName(r.name);
                    setDealAddGrade(`${r.company} ${r.gradeLabel ?? ""} ${r.grade}`.trim());
                    if (r.market != null) setDealAddMarket(r.market.toFixed(2));
                  }}
                />
              )}

              <button
                onClick={handleDealAddCard}
                disabled={!dealAddName.trim()}
                className="w-full py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-30 transition-opacity"
                style={{ background: "var(--accent-primary)" }}
              >
                + Add Card
              </button>
            </div>

            {dealCards.length > 0 && (
              <button
                onClick={() => setDealStep("quote")}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white"
                style={{ background: "var(--accent-primary)" }}
              >
                Review {dealCards.length} card{dealCards.length !== 1 ? "s" : ""} →
              </button>
            )}
          </div>
        )}

        {/* ── STEP 2: QUOTE ── */}
        {dealStep === "quote" && (
          <div className="space-y-4">
            {/* Percentage controls */}
            <div className="grid grid-cols-2 gap-3">
              <div className="border rounded-xl p-3 space-y-2">
                <div className="text-[10px] font-bold uppercase opacity-40">Cash %</div>
                <div className="flex flex-wrap gap-1">
                  {[60, 65, 70, 75, 80].map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        setDealCashPct(p);
                        setDealCards((prev) => prev.map((c) => ({
                          ...c,
                          buyPrice: c.marketPrice != null ? parseFloat((c.marketPrice * p / 100).toFixed(2)) : c.buyPrice,
                        })));
                      }}
                      className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                        dealCashPct === p ? "text-white border-transparent" : "opacity-40"
                      }`}
                      style={dealCashPct === p ? { background: "var(--accent-primary)", borderColor: "var(--accent-primary)" } : undefined}
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              </div>
              <div className="border rounded-xl p-3 space-y-2">
                <div className="text-[10px] font-bold uppercase opacity-40">Trade %</div>
                <div className="flex flex-wrap gap-1">
                  {[75, 80, 85, 90, 95].map((p) => (
                    <button
                      key={p}
                      onClick={() => setDealTradePct(p)}
                      className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                        dealTradePct === p ? "text-white border-transparent" : "opacity-40"
                      }`}
                      style={dealTradePct === p ? { background: "#8b5cf6", borderColor: "#8b5cf6" } : undefined}
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Cards with disposition selectors */}
            <div className="space-y-2">
              {dealCards.map((card) => {
                const cashOffer = card.buyPrice ?? (card.marketPrice != null ? parseFloat((card.marketPrice * dealCashPct / 100).toFixed(2)) : null);
                const tradeOffer = card.marketPrice != null ? parseFloat((card.marketPrice * dealTradePct / 100).toFixed(2)) : null;
                return (
                  <div key={card._id} className="border rounded-xl p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      {card.image_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={card.image_url} alt="" className="w-8 h-11 rounded object-cover shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{card.name}</div>
                        <div className="text-[10px] opacity-40 truncate">{[card.grade, card.condition].filter(Boolean).join(" · ")}</div>
                        {card.marketPrice != null && (
                          <div className="text-xs opacity-50 mt-0.5">Mkt {money(card.marketPrice)}</div>
                        )}
                      </div>
                    </div>

                    {/* Disposition + price */}
                    <div className="flex items-center gap-2">
                      {(["cash", "trade", "undecided"] as const).map((d) => (
                        <button
                          key={d}
                          onClick={() => handleDealSetDisposition(card._id, d)}
                          className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg border transition-colors ${
                            card.disposition === d ? "text-white border-transparent" : "opacity-30 hover:opacity-60"
                          }`}
                          style={card.disposition === d
                            ? { background: d === "cash" ? "#f59e0b" : d === "trade" ? "#8b5cf6" : "#71717a" }
                            : undefined}
                        >
                          {d === "undecided" ? "?" : d}
                        </button>
                      ))}
                      <div className="flex-1" />
                      {card.disposition !== "undecided" && (
                        <div className="relative shrink-0">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs opacity-40">$</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            className="w-20 border rounded-lg pl-5 pr-2 py-1 text-xs font-mono text-right bg-background"
                            value={card.disposition === "cash" ? (cashOffer?.toFixed(2) ?? "") : (tradeOffer?.toFixed(2) ?? "")}
                            onChange={(e) => handleDealSetBuyPrice(card._id, e.target.value)}
                            placeholder="0.00"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary */}
            {dealCards.length > 0 && (
              <div className="border rounded-xl p-3 space-y-1.5">
                {cashCards.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="opacity-60">{cashCards.length} card{cashCards.length !== 1 ? "s" : ""} · cash</span>
                    <span className="font-semibold text-amber-400">{money(cashTotal)}</span>
                  </div>
                )}
                {tradeCards.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="opacity-60">{tradeCards.length} card{tradeCards.length !== 1 ? "s" : ""} · trade credit</span>
                    <span className="font-semibold text-violet-400">{money(tradeTotal)}</span>
                  </div>
                )}
                {undecidedCards.length > 0 && (
                  <div className="text-xs opacity-40">{undecidedCards.length} card{undecidedCards.length !== 1 ? "s" : ""} not yet assigned</div>
                )}
                {totalOffer > 0 && (
                  <div className="flex justify-between text-sm font-bold border-t pt-1.5">
                    <span>Total offer</span>
                    <span>{money(totalOffer)}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setDealStep("evaluate")}
                className="px-4 py-2.5 rounded-xl text-sm border opacity-50 hover:opacity-80 transition-opacity"
              >
                ← Back
              </button>
              <button
                onClick={() => setDealStep("fulfill")}
                disabled={dealCards.length === 0 || undecidedCards.length === dealCards.length}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-30"
                style={{ background: "var(--accent-primary)" }}
              >
                Proceed to Fulfill →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: FULFILL ── */}
        {dealStep === "fulfill" && (
          <div className="space-y-4">
            {/* Summary of what we owe */}
            <div className="border rounded-xl p-3 space-y-1.5">
              <div className="text-[10px] font-bold uppercase opacity-40 mb-1">Deal Summary</div>
              {cashCards.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="opacity-60">Cash to pay</span>
                  <span className="font-semibold text-amber-400">{money(cashTotal)}</span>
                </div>
              )}
              {tradeCards.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="opacity-60">Trade credit</span>
                  <span className="font-semibold text-violet-400">{money(tradeTotal)}</span>
                </div>
              )}
            </div>

            {/* Trade credit — pick from inventory */}
            {tradeCards.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold opacity-60">Pick items to trade out</div>
                  <button
                    onClick={() => setScannerOpen("deal-inventory")}
                    className="flex items-center gap-1 text-[10px] opacity-50 hover:opacity-80 border rounded-lg px-2 py-1 transition-opacity"
                  >
                    <Camera size={11} /> Scan
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    className="flex-1 border rounded-xl px-3 py-2 text-sm bg-background"
                    placeholder="Search inventory…"
                    value={dealInventoryQuery}
                    onChange={(e) => setDealInventoryQuery(e.target.value)}
                  />
                </div>

                <div className="flex gap-2">
                  <div className="flex gap-1 flex-1 flex-wrap">
                    {(["all", "single", "slab", "sealed"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setDealInventoryFilter(f)}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase transition-colors ${
                          dealInventoryFilter === f ? "text-white" : "border opacity-40"
                        }`}
                        style={dealInventoryFilter === f ? { background: "var(--accent-primary)" } : undefined}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <select className="flex-1 border rounded-lg px-2 py-1 text-[10px] bg-background" value={dealSortBy} onChange={(e) => setDealSortBy(e.target.value as SortBy)}>
                    <option value="name">Name A–Z</option>
                    <option value="price-high">Price ↑</option>
                    <option value="price-low">Price ↓</option>
                    <option value="recent">Recently Added</option>
                  </select>
                  <select className="flex-1 border rounded-lg px-2 py-1 text-[10px] bg-background" value={dealPriceRange} onChange={(e) => setDealPriceRange(e.target.value as PriceRange)}>
                    <option value="all">All Prices</option>
                    <option value="under25">Under $25</option>
                    <option value="25to100">$25–$100</option>
                    <option value="100to500">$100–$500</option>
                    <option value="over500">$500+</option>
                  </select>
                </div>

                {!tradeInventoryLoaded ? (
                  <div className="text-xs opacity-40 text-center py-4">Loading inventory…</div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {dealInventoryDisplay.slice(0, SHOW_COUNT).map((item) => {
                      const selected = dealTradeSelections.some((s) => s.item.id === item.id);
                      const sel = dealTradeSelections.find((s) => s.item.id === item.id);
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            if (selected) {
                              setDealTradeSelections((prev) => prev.filter((s) => s.item.id !== item.id));
                            } else {
                              setDealTradeSelections((prev) => [...prev, {
                                item,
                                tradeValue: item.sticker_price != null ? item.sticker_price.toFixed(2) : item.market != null ? item.market.toFixed(2) : "",
                              }]);
                            }
                          }}
                          className={`relative flex flex-col rounded-xl overflow-hidden text-left transition-all border-2 ${
                            selected ? "border-violet-500 shadow-sm shadow-violet-500/20" : "border-border/40"
                          }`}
                        >
                          <div className="relative w-full aspect-[3/4] bg-muted overflow-hidden">
                            {item.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center opacity-20 text-[10px] font-bold uppercase text-center px-1">{item.category}</div>
                            )}
                            {item.grade && (
                              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                                <div className="text-[8px] font-bold text-white text-center truncate">{item.grade}</div>
                              </div>
                            )}
                            {selected && (
                              <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center">
                                <span className="text-white text-[8px] font-bold">✓</span>
                              </div>
                            )}
                          </div>
                          <div className="px-1.5 pt-1 pb-1.5 bg-background">
                            <div className="text-[9px] font-medium leading-tight truncate">
                              <HighlightTerms text={item.name} terms={dealInventoryTerms} />
                            </div>
                            <div className="text-[9px] opacity-50 mt-0.5">
                              {item.sticker_price != null ? money(item.sticker_price) : item.market != null ? money(item.market) : "—"}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {dealInventoryDisplay.length > 12 && (
                  <button
                    onClick={() => setDealInventoryShowMore((v) => !v)}
                    className="w-full text-xs opacity-40 hover:opacity-70 py-2"
                  >
                    {dealInventoryShowMore ? "Show less" : `Show ${dealInventoryDisplay.length - 12} more…`}
                  </button>
                )}

                {/* Selected trade-out items */}
                {dealTradeSelections.length > 0 && (
                  <div className="border rounded-xl p-3 space-y-2">
                    <div className="text-[10px] font-bold uppercase opacity-40">Going out</div>
                    {dealTradeSelections.map((sel) => (
                      <div key={sel.item.id} className="flex items-center gap-2">
                        <div className="w-7 h-10 rounded overflow-hidden bg-muted shrink-0">
                          {sel.item.image_url
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={sel.item.image_url} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center text-[7px] opacity-20 font-bold uppercase">{sel.item.category}</div>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{sel.item.name}</div>
                          <div className="text-[10px] opacity-40 truncate">{sel.item.grade ?? sel.item.condition}</div>
                        </div>
                        <div className="relative shrink-0">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs opacity-40">$</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            className="w-20 border rounded-lg pl-5 pr-2 py-1 text-xs font-mono text-right bg-background"
                            value={sel.tradeValue}
                            onChange={(e) => setDealTradeSelections((prev) =>
                              prev.map((s) => s.item.id === sel.item.id ? { ...s, tradeValue: e.target.value } : s)
                            )}
                            placeholder="0.00"
                          />
                        </div>
                        <button
                          onClick={() => setDealTradeSelections((prev) => prev.filter((s) => s.item.id !== sel.item.id))}
                          className="text-xs opacity-30 hover:opacity-60 shrink-0"
                        >✕</button>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs opacity-60 pt-1 border-t">
                      <span>Trade-out value</span>
                      <span className="font-semibold">
                        {money(dealTradeSelections.reduce((s, g) => s + (parseFloat(g.tradeValue) || (g.item.market ?? 0)), 0))}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setDealStep("quote")}
                className="px-4 py-2.5 rounded-xl text-sm border opacity-50 hover:opacity-80 transition-opacity"
              >
                ← Back
              </button>
              <button
                onClick={handleCompleteDeal}
                disabled={busy || dealCards.length === 0 || undecidedCards.length === dealCards.length}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-30"
                style={{ background: "var(--accent-primary)" }}
              >
                {busy ? "Recording…" : `Complete Deal · ${money(totalOffer)}`}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: COMPLETE ── */}
        {dealStep === "complete" && (
          <div className="space-y-4 text-center">
            <div
              className="w-16 h-16 rounded-full mx-auto flex items-center justify-center"
              style={{ background: "rgba(34,197,94,0.15)" }}
            >
              <Handshake size={28} className="text-emerald-400" />
            </div>
            <div>
              <div className="text-lg font-bold">Deal done!</div>
              {dealCompleteSummary && (
                <div className="text-sm opacity-60 mt-1 space-y-0.5">
                  {dealCompleteSummary.cashOut > 0 && <div>Cash paid: {money(dealCompleteSummary.cashOut)}</div>}
                  {dealCompleteSummary.tradeValue > 0 && <div>Trade credit: {money(dealCompleteSummary.tradeValue)}</div>}
                </div>
              )}
            </div>
            <button
              onClick={handleDealReset}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white"
              style={{ background: "var(--accent-primary)" }}
            >
              New Deal
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderSellTab() {
    const filtered = filterInventory(tradeInventory, sellQuery);
    const categoryFiltered = sellCategoryFilter === "all"
      ? filtered
      : filtered.filter((i) => i.category === sellCategoryFilter);
    const displayItems = applyInventoryFilters(categoryFiltered, sellSortBy, sellPriceRange);
    const searchTerms = queryTerms(sellQuery);
    const selCount = sellSelected.size;
    const selectedArr = Array.from(sellSelected.values());
    const totalSell = selectedArr.reduce((s, i) => s + (parseFloat(sellPrices[i.id]) || 0), 0);
    const totalMarket = selectedArr.reduce((s, i) => s + (i.market ?? 0), 0);
    const totalPct = totalMarket > 0 && totalSell > 0 ? Math.round((totalSell / totalMarket) * 100) : null;

    function pctColor(pct: number) {
      if (pct >= 90) return "text-emerald-400";
      if (pct >= 75) return "opacity-60";
      return "text-rose-400";
    }

    return (
      <>
        {/* ── TOP ZONE ── */}
        <div
          className="space-y-3"
          style={{ paddingBottom: sellBottomExpanded ? "calc(45vh + 60px)" : "68px" }}
        >
          <input
            className="w-full border rounded-xl px-4 py-2.5 text-sm bg-background"
            placeholder="Search by name, set, or card number…"
            value={sellQuery}
            onChange={(e) => setSellQuery(e.target.value)}
            autoFocus={tab === "sell"}
          />

          <div className="flex items-center gap-2">
            <div className="flex gap-1.5 flex-1">
              {(["all", "single", "slab", "sealed"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setSellCategoryFilter(f)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-colors ${
                    sellCategoryFilter === f ? "text-white" : "border opacity-40 hover:opacity-60"
                  }`}
                  style={sellCategoryFilter === f ? { background: "var(--accent-primary)" } : undefined}
                >
                  {f}
                </button>
              ))}
            </div>
            {selCount > 0 && (
              <button onClick={() => setSellSelected(new Map())} className="text-[10px] opacity-40 hover:opacity-70 shrink-0">
                Clear {selCount}
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <select
              className="flex-1 border rounded-lg px-2 py-1 text-[10px] bg-background"
              value={sellSortBy}
              onChange={(e) => setSellSortBy(e.target.value as SortBy)}
            >
              <option value="name">Name A–Z</option>
              <option value="price-high">Price ↑</option>
              <option value="price-low">Price ↓</option>
              <option value="recent">Recently Added</option>
            </select>
            <select
              className="flex-1 border rounded-lg px-2 py-1 text-[10px] bg-background"
              value={sellPriceRange}
              onChange={(e) => setSellPriceRange(e.target.value as PriceRange)}
            >
              <option value="all">All Prices</option>
              <option value="under25">Under $25</option>
              <option value="25to100">$25–$100</option>
              <option value="100to500">$100–$500</option>
              <option value="over500">$500+</option>
            </select>
          </div>

          {!tradeInventoryLoaded ? (
            <div className="text-xs opacity-40 text-center py-6">Loading inventory…</div>
          ) : displayItems.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {displayItems.map((item) => {
                const selected = sellSelected.has(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => toggleSellSelect(item)}
                    className={`relative flex flex-col rounded-xl overflow-hidden text-left transition-all border-2 ${
                      selected ? "border-emerald-500 shadow-sm shadow-emerald-500/20" : "border-border/40"
                    }`}
                  >
                    <div className="relative w-full aspect-[3/4] bg-muted overflow-hidden">
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center opacity-20 text-[10px] font-bold uppercase tracking-wide text-center px-1">
                          {item.category}
                        </div>
                      )}
                      {item.grade && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                          <div className="text-[8px] font-bold text-white text-center truncate">{item.grade}</div>
                        </div>
                      )}
                      {selected && (
                        <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                          <span className="text-white text-[8px] font-bold">✓</span>
                        </div>
                      )}
                    </div>
                    <div className="px-1.5 pt-1 pb-1.5 bg-background">
                      <div className="text-[9px] font-medium leading-tight truncate">
                        <HighlightTerms text={item.name} terms={searchTerms} />
                      </div>
                      {(item.set_name || item.card_number) && (
                        <div className="text-[8px] opacity-40 truncate">
                          <HighlightTerms
                            text={[item.set_name, item.card_number ? `#${item.card_number}` : null].filter(Boolean).join(" ")}
                            terms={searchTerms}
                          />
                        </div>
                      )}
                      <div className="text-[9px] opacity-50 mt-0.5">
                        {item.sticker_price != null ? money(item.sticker_price) : item.market != null ? money(item.market) : "—"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : sellQuery.trim() ? (
            <div className="text-xs opacity-40 text-center py-4">No results for &ldquo;{sellQuery}&rdquo;</div>
          ) : (
            <div className="text-xs opacity-40 text-center py-6">No items in inventory</div>
          )}
        </div>

        {/* ── BOTTOM ZONE ── */}
        {isMounted && createPortal(
          <div
            className="fixed left-0 right-0 z-40 bg-background border-t"
            style={{ bottom: "3.5rem", boxShadow: "0 -4px 20px rgba(0,0,0,0.15)" }}
          >
            {/* Collapsed header */}
            {selCount === 0 ? (
              <div className="px-4 py-3">
                <span className="text-xs opacity-40">Tap cards above to sell</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-4 py-3">
                <button
                  className="flex-1 flex items-center gap-2 min-w-0 text-left"
                  onClick={() => setSellBottomExpanded((v) => !v)}
                >
                  <span className="text-sm font-semibold">{selCount} selected</span>
                  <span className="text-emerald-400 font-semibold text-sm">{money(totalSell)}</span>
                  {totalPct != null && (
                    <span className={`text-xs font-semibold ${pctColor(totalPct)}`}>{totalPct}%</span>
                  )}
                  <ChevronDown
                    size={15}
                    className={`shrink-0 opacity-40 transition-transform ml-auto ${sellBottomExpanded ? "rotate-180" : ""}`}
                  />
                </button>
                <button
                  onClick={handleConfirmSell}
                  disabled={busy || totalSell <= 0}
                  className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold text-white disabled:opacity-30"
                  style={{ background: "#22c55e" }}
                >
                  {busy ? "…" : "Record Sale →"}
                </button>
              </div>
            )}

            {/* Expanded content */}
            {sellBottomExpanded && selCount > 0 && (
              <div className="border-t max-h-[45vh] overflow-y-auto">
                <div className="px-4 pt-3 pb-4 space-y-2">
                  {selectedArr.map((item) => {
                    const price = parseFloat(sellPrices[item.id]) || 0;
                    const isLocked = sellPriceLocked.has(item.id);
                    const cardPct = item.market != null && item.market > 0 && price > 0
                      ? Math.round((price / item.market) * 100) : null;
                    return (
                      <div key={item.id} className="flex items-center gap-2">
                        <div className="w-8 h-11 rounded overflow-hidden bg-muted shrink-0">
                          {item.image_url
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center text-[7px] opacity-20 font-bold uppercase">{item.category}</div>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{item.name}</div>
                          <div className="text-[10px] opacity-40 truncate">
                            {item.grade ?? item.condition}
                            {item.market != null && <span> · Mkt {money(item.market)}</span>}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-0.5 shrink-0">
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs opacity-40">$</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              className={`w-20 border rounded-lg pl-5 pr-2 py-1 text-xs font-mono text-right bg-background ${isLocked ? "border-emerald-500/40" : ""}`}
                              value={sellPrices[item.id] ?? ""}
                              onChange={(e) => handleSellItemPrice(item.id, e.target.value)}
                              placeholder="0.00"
                            />
                          </div>
                          {cardPct != null && (
                            <div className={`text-[9px] font-semibold ${pctColor(cardPct)}`}>{cardPct}%</div>
                          )}
                        </div>
                        <button
                          onClick={() => toggleSellSelect(item)}
                          className="text-xs opacity-30 hover:opacity-60 shrink-0"
                        >✕</button>
                      </div>
                    );
                  })}

                  {/* Total + proportional edit */}
                  <div className="pt-1 border-t space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs opacity-50">
                        Total
                        {totalPct != null && (
                          <span className={`ml-2 font-semibold ${pctColor(totalPct)}`}>{totalPct}% of mkt</span>
                        )}
                        {totalPct != null && totalPct < 75 && (
                          <span className="ml-1 text-rose-400"> · heavy discount</span>
                        )}
                      </div>
                      <div className="relative shrink-0">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs opacity-40">$</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          className="w-24 border rounded-lg pl-5 pr-2 py-1 text-xs font-mono text-right bg-background"
                          value={sellTotalInput}
                          onChange={(e) => handleSellTotalChange(e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className="text-[9px] opacity-30 text-right">Editing total redistributes across unlocked cards</div>
                  </div>

                  <button
                    onClick={handleConfirmSell}
                    disabled={busy || totalSell <= 0}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-30"
                    style={{ background: "#22c55e" }}
                  >
                    {busy ? "Recording…" : `Record Sale · ${money(totalSell)}`}
                  </button>
                </div>
              </div>
            )}
          </div>,
          document.body
        )}
      </>
    );
  }

  function renderTradeTab() {
    const gaveTotal = tradeGoingOut.reduce((s, g) => s + (parseFloat(g.tradeValue) || (g.item.market ?? 0)), 0);
    const gotTotal  = tradeComingIn.reduce((s, c) => s + (parseFloat(c.marketPrice) || 0), 0);
    const autoCash  = parseFloat((gotTotal - gaveTotal).toFixed(2));
    const cashDiff  = tradeCashOverride.trim()
      ? (tradeCashDir === "received" ? Math.abs(parseFloat(tradeCashOverride) || 0) : -(Math.abs(parseFloat(tradeCashOverride) || 0)))
      : autoCash;

    const categoryFiltered = tradeCategoryFilter === "all"
      ? tradeInventory
      : tradeInventory.filter((i) => i.category === tradeCategoryFilter);
    const searchFiltered   = filterInventory(categoryFiltered, tradeInventoryQuery);
    const filteredInventory = applyInventoryFilters(searchFiltered, tradeSortBy, tradePriceRange);
    const tradeSearchTerms  = queryTerms(tradeInventoryQuery);

    function handleRecordTradeNow() {
      if (tradeGoingOut.length === 0 && tradeComingIn.every((c) => !c.name.trim())) { err("Add cards to the trade"); return; }
      if (tradeComingIn.some((c) => !c.name.trim())) { err("Enter a name for each incoming card"); return; }
      handleRecordTrade();
    }

    return (
      <>
        {/* ── TOP ZONE ── */}
        <div
          className="space-y-3"
          style={{ paddingBottom: tradeBottomExpanded ? "calc(45vh + 60px)" : "68px" }}
        >
          {/* Search */}
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded-xl px-4 py-2.5 text-sm bg-background"
              placeholder="Search by name, set, or card number…"
              value={tradeInventoryQuery}
              onChange={(e) => setTradeInventoryQuery(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setScannerOpen("trade-inventory")}
              className="flex items-center justify-center w-10 rounded-xl border border-border/60 opacity-60 hover:opacity-100 transition-opacity shrink-0"
              title="Scan card with camera"
            >
              <Camera size={16} />
            </button>
          </div>

          {/* Category filter pills + clear */}
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5 flex-1">
              {(["all", "single", "slab", "sealed"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setTradeCategoryFilter(f)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-colors ${
                    tradeCategoryFilter === f ? "text-white" : "border opacity-40 hover:opacity-60"
                  }`}
                  style={tradeCategoryFilter === f ? { background: "var(--accent-primary)" } : undefined}
                >
                  {f}
                </button>
              ))}
            </div>
            {tradeGoingOut.length > 0 && (
              <button onClick={() => setTradeGoingOut([])} className="text-[10px] opacity-40 hover:opacity-70 shrink-0">
                Clear {tradeGoingOut.length}
              </button>
            )}
          </div>

          {/* Sort + price dropdowns */}
          <div className="flex gap-2">
            <select
              className="flex-1 border rounded-lg px-2 py-1 text-[10px] bg-background"
              value={tradeSortBy}
              onChange={(e) => setTradeSortBy(e.target.value as SortBy)}
            >
              <option value="name">Name A–Z</option>
              <option value="price-high">Price ↑</option>
              <option value="price-low">Price ↓</option>
              <option value="recent">Recently Added</option>
            </select>
            <select
              className="flex-1 border rounded-lg px-2 py-1 text-[10px] bg-background"
              value={tradePriceRange}
              onChange={(e) => setTradePriceRange(e.target.value as PriceRange)}
            >
              <option value="all">All Prices</option>
              <option value="under25">Under $25</option>
              <option value="25to100">$25–$100</option>
              <option value="100to500">$100–$500</option>
              <option value="over500">$500+</option>
            </select>
          </div>

          {/* Inventory grid */}
          {!tradeInventoryLoaded ? (
            <div className="text-xs opacity-40 text-center py-6">Loading inventory…</div>
          ) : filteredInventory.length === 0 ? (
            <div className="text-xs opacity-40 text-center py-4">{tradeInventoryQuery ? `No results for "${tradeInventoryQuery}"` : "No items in inventory"}</div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                {filteredInventory.slice(0, tradeShowMore ? undefined : 15).map((item) => {
                  const selected = !!tradeGoingOut.find((g) => g.item.id === item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => setTradeGoingOut((prev) => {
                        const exists = prev.find((g) => g.item.id === item.id);
                        if (exists) return prev.filter((g) => g.item.id !== item.id);
                        return [...prev, { item, tradeValue: item.market != null ? item.market.toFixed(2) : "" }];
                      })}
                      className={`relative flex flex-col rounded-xl overflow-hidden text-left transition-all border-2 ${
                        selected ? "border-rose-500 shadow-sm shadow-rose-500/20" : "border-border/40"
                      }`}
                    >
                      <div className="relative w-full aspect-[3/4] bg-muted overflow-hidden">
                        {item.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center opacity-20 text-[9px] font-bold uppercase tracking-wide text-center px-1">
                            {item.category}
                          </div>
                        )}
                        {item.grade && (
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                            <div className="text-[7px] font-bold text-white text-center truncate">{item.grade}</div>
                          </div>
                        )}
                        {selected && (
                          <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-rose-500 flex items-center justify-center">
                            <span className="text-white text-[8px] font-bold">✓</span>
                          </div>
                        )}
                      </div>
                      <div className="px-1.5 pt-1 pb-1.5 bg-background">
                        <div className="text-[9px] font-medium leading-tight truncate">
                          <HighlightTerms text={item.name} terms={tradeSearchTerms} />
                        </div>
                        {(item.set_name || item.card_number) && (
                          <div className="text-[8px] opacity-40 truncate">
                            <HighlightTerms
                              text={[item.set_name, item.card_number ? `#${item.card_number}` : null].filter(Boolean).join(" ")}
                              terms={tradeSearchTerms}
                            />
                          </div>
                        )}
                        {item.market != null && (
                          <div className="text-[8px] opacity-50 mt-0.5">{money(item.market)}</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {!tradeShowMore && filteredInventory.length > 15 && (
                <button onClick={() => setTradeShowMore(true)} className="w-full text-[10px] opacity-40 hover:opacity-70 transition-opacity py-1">
                  Show {filteredInventory.length - 15} more…
                </button>
              )}
            </>
          )}
        </div>

        {/* ── BOTTOM ZONE ── */}
        {isMounted && createPortal(
          <div
            className="fixed left-0 right-0 z-40 bg-background border-t"
            style={{ bottom: "3.5rem", boxShadow: "0 -4px 20px rgba(0,0,0,0.15)" }}
          >
            {/* Collapsed header */}
            {tradeGoingOut.length === 0 ? (
              <div className="px-4 py-3">
                <span className="text-xs opacity-40">Tap cards above to select for trade</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-4 py-3">
                <button
                  className="flex-1 flex items-center gap-2 min-w-0 text-left"
                  onClick={() => setTradeBottomExpanded((v) => !v)}
                >
                  <span className="text-sm font-semibold">{tradeGoingOut.length} giving</span>
                  <span className="text-rose-400 font-semibold text-sm">{money(gaveTotal)}</span>
                  {gotTotal > 0 && <span className="opacity-40 text-xs shrink-0">→ getting {money(gotTotal)}</span>}
                  <ChevronDown
                    size={15}
                    className={`shrink-0 opacity-40 transition-transform ml-auto ${tradeBottomExpanded ? "rotate-180" : ""}`}
                  />
                </button>
                <button
                  onClick={handleRecordTradeNow}
                  disabled={busy}
                  className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold text-white disabled:opacity-30"
                  style={{ background: "var(--accent-primary)" }}
                >
                  {busy ? "…" : "Record Trade →"}
                </button>
              </div>
            )}

            {/* Expanded content */}
            {tradeBottomExpanded && (
              <div className="border-t max-h-[45vh] overflow-y-auto">
                <div className="px-4 pt-3 pb-4 space-y-3">

                  {/* Giving Up rows */}
                  {tradeGoingOut.length > 0 && (
                    <div className="space-y-2">
                      {tradeGoingOut.map((g) => {
                        const tv = parseFloat(g.tradeValue) || g.item.market || 0;
                        const tradePct = g.item.market != null && g.item.market > 0 && tv > 0
                          ? Math.round((tv / g.item.market) * 100) : null;
                        return (
                          <div key={g.item.id} className="flex items-center gap-2">
                            <div className="w-8 h-11 rounded overflow-hidden bg-muted shrink-0">
                              {g.item.image_url
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={g.item.image_url} alt="" className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center text-[7px] opacity-20 font-bold uppercase">{g.item.category}</div>
                              }
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium truncate">{g.item.name}</div>
                              {g.item.grade && <div className="text-[10px] opacity-40">{g.item.grade}</div>}
                            </div>
                            <div className="flex flex-col items-end gap-0.5 shrink-0">
                              <input
                                type="number"
                                inputMode="decimal"
                                className="w-20 border rounded-lg px-2 py-1 text-xs bg-background text-right font-mono"
                                value={g.tradeValue}
                                onChange={(e) => setTradeGoingOut((prev) => prev.map((x) => x.item.id === g.item.id ? { ...x, tradeValue: e.target.value } : x))}
                              />
                              {tradePct != null && (
                                <div className={`text-[9px] font-semibold ${tradePct >= 90 ? "text-emerald-400" : tradePct >= 75 ? "opacity-50" : "text-rose-400"}`}>
                                  {tradePct}%
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => setTradeGoingOut((prev) => prev.filter((x) => x.item.id !== g.item.id))}
                              className="text-xs opacity-30 hover:opacity-60 shrink-0"
                            >✕</button>
                          </div>
                        );
                      })}
                      <div className="text-xs text-right opacity-50 pt-0.5">
                        Total giving: <span className="font-semibold text-rose-400">{money(gaveTotal)}</span>
                      </div>
                    </div>
                  )}

                  <div className="border-t" />

                  {/* Getting section */}
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wide opacity-50">Getting</div>
                    {tradeComingIn.map((card, idx) => (
                      <div key={card._id} className="border rounded-lg p-2.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] opacity-40">Card {idx + 1}</span>
                          <div className="flex items-center gap-2">
                            {/* Camera scan for incoming card */}
                            <button
                              type="button"
                              onClick={() => { setScannerTradeCardId(card._id); setScannerOpen("trade-getting"); }}
                              className="opacity-40 hover:opacity-80 transition-opacity p-0.5"
                              title="Scan card with camera"
                            >
                              <Camera size={13} />
                            </button>
                            <CertLookupWidget
                              label="Cert"
                              onResult={(r: CertWidgetResult) =>
                                setTradeComingIn((prev) =>
                                  prev.map((c) => c._id === card._id ? {
                                    ...c,
                                    name: r.name,
                                    grade: r.gradeLabel ? `${r.company} ${r.gradeLabel} ${r.grade}` : r.grade ? `${r.company} ${r.grade}` : "",
                                    marketPrice: r.market != null ? r.market.toFixed(2) : c.marketPrice,
                                  } : c)
                                )
                              }
                            />
                            {tradeComingIn.length > 1 && (
                              <button className="text-[10px] text-red-500 hover:opacity-80" onClick={() => setTradeComingIn((prev) => prev.filter((c) => c._id !== card._id))}>Remove</button>
                            )}
                          </div>
                        </div>
                        <input
                          className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                          placeholder="Card name *"
                          value={card.name}
                          onChange={(e) => setTradeComingIn((prev) => prev.map((c) => c._id === card._id ? { ...c, name: e.target.value } : c))}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            className="border rounded-lg px-2 py-2 text-sm bg-background"
                            placeholder="Grade (e.g. PSA 10)"
                            value={card.grade}
                            onChange={(e) => setTradeComingIn((prev) => prev.map((c) => c._id === card._id ? { ...c, grade: e.target.value } : c))}
                          />
                          <input
                            type="number"
                            inputMode="decimal"
                            className="border rounded-lg px-2 py-2 text-sm bg-background font-mono"
                            placeholder="Market $"
                            value={card.marketPrice}
                            onChange={(e) => setTradeComingIn((prev) => prev.map((c) => c._id === card._id ? { ...c, marketPrice: e.target.value } : c))}
                          />
                        </div>
                      </div>
                    ))}
                    <button
                      className="w-full border border-dashed rounded-lg py-2 text-xs opacity-50 hover:opacity-70 transition-opacity"
                      onClick={() => setTradeComingIn((prev) => [...prev, blankTradeComingIn()])}
                    >
                      + Add another card
                    </button>
                    {gotTotal > 0 && (
                      <div className="text-xs text-right opacity-50">Total getting: <span className="font-semibold text-emerald-400">{money(gotTotal)}</span></div>
                    )}
                  </div>

                  <div className="border-t" />

                  {/* Cash & Notes */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="opacity-50">Auto cash</span>
                      <span className={`font-semibold ${Math.abs(autoCash) < 0.01 ? "opacity-40" : autoCash > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {Math.abs(autoCash) < 0.01 ? "Even" : autoCash > 0 ? `We receive ${money(autoCash)}` : `We pay ${money(Math.abs(autoCash))}`}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <select className="border rounded-lg px-2 py-1.5 text-xs bg-background" value={tradeCashDir} onChange={(e) => setTradeCashDir(e.target.value as "received" | "paid")}>
                        <option value="received">We receive</option>
                        <option value="paid">We pay</option>
                      </select>
                      <input
                        type="number"
                        inputMode="decimal"
                        className="flex-1 border rounded-lg px-3 py-1.5 text-sm bg-background font-mono"
                        placeholder="Override cash $"
                        value={tradeCashOverride}
                        onChange={(e) => setTradeCashOverride(e.target.value)}
                      />
                    </div>
                    <input
                      className="w-full border rounded-lg px-3 py-1.5 text-xs bg-background opacity-70"
                      placeholder="Notes (optional)"
                      value={tradeNotes}
                      onChange={(e) => setTradeNotes(e.target.value)}
                    />
                  </div>

                  <button
                    onClick={handleRecordTradeNow}
                    disabled={busy}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-30"
                    style={{ background: "var(--accent-primary)" }}
                  >
                    {busy ? "Recording…" : "Record Trade"}
                  </button>
                </div>
              </div>
            )}
          </div>,
          document.body
        )}
      </>
    );
  }

  function renderEndModal() {
    const expectedCashLocal =
      (session?.starting_cash ?? 0) -
      (session?.total_spent ?? 0) +
      (session?.total_revenue ?? 0);
    const actualNum = parseFloat(actualCash) || null;
    const discrepancy = actualNum != null ? actualNum - expectedCashLocal : null;

    return (
      <div
        className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      >
        <div className="modal-panel w-full max-w-sm p-5 space-y-4 max-h-[85vh] overflow-y-auto">
          {endStep === "preview" ? (
            <>
              <div className="flex items-center justify-between">
                <div className="modal-title">End Show?</div>
                <button onClick={() => setEndOpen(false)} className="modal-close-btn">✕</button>
              </div>
              <div>
                <div className="font-semibold">{session?.name}</div>
                <div className="text-sm opacity-50">{session ? fmtDate(session.date) : ""}</div>
              </div>

              {/* Summary stats */}
              <div className="space-y-1.5 text-sm border rounded-xl p-3">
                <div className="flex justify-between"><span className="opacity-60">Cards bought</span><span className="font-medium">{session?.cards_bought ?? 0}</span></div>
                <div className="flex justify-between"><span className="opacity-60">Cards sold</span><span className="font-medium">{session?.cards_sold ?? 0}</span></div>
                <div className="flex justify-between"><span className="opacity-60">Trades</span><span className="font-medium">{session?.trades_count ?? 0}</span></div>
                <div className="flex justify-between"><span className="opacity-60">Passed</span><span className="font-medium">{session?.passes_count ?? 0}</span></div>
                <div className="flex justify-between border-t pt-1.5 mt-1"><span className="opacity-60">Spent</span><span className="font-medium text-rose-400">{money(session?.total_spent ?? 0)}</span></div>
                <div className="flex justify-between"><span className="opacity-60">Revenue</span><span className="font-medium text-emerald-400">{money(session?.total_revenue ?? 0)}</span></div>
                <div className="flex justify-between font-semibold border-t pt-1.5 mt-1">
                  <span>Net P&L</span>
                  <span className={session && session.net_pl >= 0 ? "text-emerald-400" : "text-rose-400"}>{moneySign(session?.net_pl ?? 0)}</span>
                </div>
              </div>

              <p className="text-xs opacity-50 text-center">Finalizing will close the session and calculate your P&L. You can count cash in the next step.</p>

              <div className="flex gap-2">
                <button className="flex-1 py-3 rounded-xl text-sm font-semibold text-white" style={{ background: "#ef4444" }} onClick={() => setEndStep("finalize")}>
                  Finalize Show →
                </button>
                <button className="modal-btn-ghost px-4" onClick={() => setEndOpen(false)}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="modal-title">Cash Reconciliation</div>
                <button onClick={() => setEndStep("preview")} className="text-xs opacity-50 hover:opacity-80">← Back</button>
              </div>

              <div className="text-sm space-y-1 opacity-70 border rounded-xl p-3">
                <div className="flex justify-between"><span>Starting cash</span><span>{money(session?.starting_cash ?? 0)}</span></div>
                <div className="flex justify-between"><span>Expected cash</span><span className="font-medium">{money(expectedCashLocal)}</span></div>
              </div>

              <div>
                <div className="text-xs opacity-50 mb-1">Actual cash counted (optional)</div>
                <input
                  type="number"
                  inputMode="decimal"
                  className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background font-mono"
                  placeholder={`Expected: ${money(expectedCashLocal)}`}
                  value={actualCash}
                  onChange={(e) => setActualCash(e.target.value)}
                />
              </div>
              {discrepancy != null && (
                <div className={`text-sm font-semibold ${Math.abs(discrepancy) < 0.01 ? "text-emerald-400" : "text-amber-400"}`}>
                  {Math.abs(discrepancy) < 0.01 ? "✓ Cash matches" : `Discrepancy: ${moneySign(discrepancy)}`}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  className="flex-1 py-3 rounded-xl text-sm font-semibold text-white"
                  style={{ background: "#ef4444" }}
                  onClick={handleEndShow}
                  disabled={busy}
                >
                  {busy ? "Ending…" : "Save & End Show"}
                </button>
                <button className="modal-btn-ghost px-4" onClick={() => setEndOpen(false)} disabled={busy}>Cancel</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  function renderExpenseModal() {
    return (
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
        <div className="modal-panel w-full max-w-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="modal-title">Add Expense</div>
            <button onClick={() => setExpenseOpen(false)} className="modal-close-btn">✕</button>
          </div>
          <select className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background" value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <input
            className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background"
            placeholder="Description"
            value={expenseDesc}
            onChange={(e) => setExpenseDesc(e.target.value)}
            autoFocus
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              inputMode="decimal"
              className="border rounded-lg px-3 py-2.5 text-sm bg-background font-mono"
              placeholder="Amount $"
              value={expenseCost}
              onChange={(e) => setExpenseCost(e.target.value)}
            />
            <select className="border rounded-lg px-3 py-2.5 text-sm bg-background" value={expensePaidBy} onChange={(e) => setExpensePaidBy(e.target.value as "alex" | "mila")}>
              <option value="alex">Paid by Alex</option>
              <option value="mila">Paid by Mila</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 modal-btn-primary" onClick={handleAddExpense} disabled={busy}>{busy ? "Adding…" : "Add Expense"}</button>
            <button className="modal-btn-ghost" onClick={() => setExpenseOpen(false)}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  function renderCashCountModal() {
    const cashCountNum = parseFloat(cashCountInput) || null;
    const diff = cashCountNum != null ? cashCountNum - expectedCash : null;
    return (
      <div
        className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
        onClick={(e) => { if (e.target === e.currentTarget) setCashCountOpen(false); }}
      >
        <div className="modal-panel w-full max-w-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="modal-title">Quick Cash Count</div>
            <button onClick={() => setCashCountOpen(false)} className="modal-close-btn"><XIcon size={15} /></button>
          </div>
          <div className="text-sm space-y-1 border rounded-xl p-3">
            <div className="flex justify-between opacity-70">
              <span>Starting cash</span>
              <span>{money(session?.starting_cash ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Expected now</span>
              <span className={`font-semibold ${expectedCash < 0 ? "text-rose-400" : ""}`}>{moneyCash(expectedCash)}</span>
            </div>
          </div>
          <div>
            <div className="text-xs opacity-50 mb-1">Count your cash</div>
            <input
              type="number"
              inputMode="decimal"
              className="w-full border rounded-xl px-4 py-3 text-lg font-semibold bg-background font-mono"
              placeholder={`Expected: ${moneyCash(expectedCash)}`}
              value={cashCountInput}
              onChange={(e) => setCashCountInput(e.target.value)}
              autoFocus
            />
          </div>
          {diff != null && (
            <div className={`text-center font-semibold ${Math.abs(diff) < 0.01 ? "text-emerald-400" : "text-amber-400"}`}>
              {Math.abs(diff) < 0.01 ? "✓ Cash matches" : `Discrepancy: ${moneySign(diff)}`}
            </div>
          )}
          <button className="w-full modal-btn-ghost" onClick={() => setCashCountOpen(false)}>Close</button>
        </div>
      </div>
    );
  }
}
