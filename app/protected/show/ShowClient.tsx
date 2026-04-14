"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ScanLine, ShoppingBag, DollarSign, ArrowLeftRight } from "lucide-react";
import CardAutocomplete, { type AutocompleteCard } from "@/components/CardAutocomplete";
import CertLookupWidget, { type CertWidgetResult } from "@/components/CertLookupWidget";
import {
  createShowSession,
  getShowSession,
  loadShowFeed,
  loadInventoryItems,
  recordShowBuy,
  recordShowPass,
  recordShowSell,
  recordShowTrade,
  addShowExpense,
  endShowSession,
  searchInventoryItems,
  undoShowEntry,
  type ShowSession,
  type ShowScanEntry,
  type InventorySearchResult,
} from "./actions";

// ── Constants ─────────────────────────────────────────────────────────────────

const BUY_PCTS = [70, 75, 80, 85, 90];
const EXPENSE_CATEGORIES = [
  { value: "table", label: "Table fee" },
  { value: "travel", label: "Travel / gas" },
  { value: "hotel", label: "Hotel" },
  { value: "food", label: "Food" },
  { value: "supplies", label: "Supplies" },
  { value: "other", label: "Other" },
];
const STORAGE_KEY = "ozone_active_show_session_id";
const UNDO_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

// ── Helpers ───────────────────────────────────────────────────────────────────

function money(v: number | null) {
  if (v == null) return "—";
  return `$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    sub = s.notes ?? undefined;
  } else if (kind === "expense") {
    amount = s.market_price != null ? -s.market_price : null;
  } else {
    sub = s.grade ?? undefined;
  }

  return { id: s.id, kind, time: s.scanned_at, label, sub, amount };
}

// ── Trade tab types ───────────────────────────────────────────────────────────

type TradeComingIn = { _id: string; name: string; grade: string; marketPrice: string };

function blankTradeComingIn(): TradeComingIn {
  return { _id: crypto.randomUUID(), name: "", grade: "", marketPrice: "" };
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = { recentShows: ShowSession[] };

// ── Component ─────────────────────────────────────────────────────────────────

export default function ShowClient({ recentShows }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<"loading" | "start" | "active">("loading");
  const [session, setSession] = useState<ShowSession | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [tab, setTab] = useState<"scan" | "buy" | "sell" | "trade">("scan");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const [batchGrade, setBatchGrade] = useState("");
  const [batchOwner, setBatchOwner] = useState<"shared" | "alex" | "mila">("shared");
  const [batchPct, setBatchPct] = useState<number>(70);
  const [batchCustomPct, setBatchCustomPct] = useState("");
  const [batchFlatAmount, setBatchFlatAmount] = useState("");
  const [batchQueue, setBatchQueue] = useState<StagedBuy[]>([]);

  // ── Sell tab ──────────────────────────────────────────────────────────────

  const [sellQuery, setSellQuery] = useState("");
  const [sellResults, setSellResults] = useState<InventorySearchResult[]>([]);
  const [sellSearching, setSellSearching] = useState(false);
  const [selectedSellItem, setSelectedSellItem] = useState<InventorySearchResult | null>(null);
  const [sellPrice, setSellPrice] = useState("");
  const sellSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Trade tab ─────────────────────────────────────────────────────────────

  const [tradeInventory, setTradeInventory] = useState<InventorySearchResult[]>([]);
  const [tradeInventoryLoaded, setTradeInventoryLoaded] = useState(false);
  const [tradeInventoryQuery, setTradeInventoryQuery] = useState("");
  const [tradeGoingOut, setTradeGoingOut] = useState<{ item: InventorySearchResult; tradeValue: string }[]>([]);
  const [tradeComingIn, setTradeComingIn] = useState<TradeComingIn[]>(() => [blankTradeComingIn()]);
  const [tradeCashOverride, setTradeCashOverride] = useState("");
  const [tradeCashDir, setTradeCashDir] = useState<"received" | "paid">("received");
  const [tradeNotes, setTradeNotes] = useState("");
  const [tradeStep, setTradeStep] = useState<"build" | "confirm">("build");

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
  const [tradeShowMore, setTradeShowMore] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => { setIsMounted(true); }, []);

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
  }, []);

  // Load trade inventory once when trade tab is opened
  useEffect(() => {
    if (tab !== "trade" || tradeInventoryLoaded || phase !== "active") return;
    loadInventoryItems()
      .then((items) => { setTradeInventory(items); setTradeInventoryLoaded(true); })
      .catch(() => { /* silent */ });
  }, [tab, tradeInventoryLoaded, phase]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function pushFeedEntry(entry: FeedEntry) {
    setFeed((prev) => [entry, ...prev]);
  }

  function err(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 4000);
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
      const { scanId } = await recordShowBuy({
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
      });
      pushFeedEntry({
        id: scanId,
        kind: "buy",
        time: new Date().toISOString(),
        label: scanResult.name,
        sub: `${gradeStr} · ${pct}%`,
        amount: -cost,
      });
      await refreshSession(sessionId);
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
      const { scanId } = await recordShowBuy({
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
      });
      pushFeedEntry({
        id: scanId,
        kind: "buy",
        time: new Date().toISOString(),
        label: scanResult.name,
        sub: `${gradeStr} · $${cost.toFixed(2)}`,
        amount: -cost,
      });
      await refreshSession(sessionId);
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
    setBatchMarket(card.market != null ? card.market.toFixed(2) : "");
  }

  function handleAddToBatch() {
    const market = parseFloat(batchMarket) || null;
    const flatAmt = parseFloat(batchFlatAmount) || 0;
    const pct = batchPct || parseFloat(batchCustomPct) || 0;
    if (!batchQuery.trim()) { err("Enter card name"); return; }
    if (!market) { err("Enter market price"); return; }
    const cost = flatAmt > 0 ? flatAmt : (pct > 0 ? parseFloat((market * pct / 100).toFixed(2)) : 0);
    const effectivePct = flatAmt > 0 && market > 0 ? parseFloat((flatAmt / market * 100).toFixed(1)) : pct;
    if (!cost) { err("Enter a buy percentage or flat amount"); return; }
    const entry: StagedBuy = {
      _id: crypto.randomUUID(),
      name: batchQuery.trim(),
      category: batchCategory,
      condition: batchCondition,
      grade: batchGrade || null,
      market,
      cost,
      buy_pct: effectivePct,
      owner: batchOwner,
      set_name: batchCard?.setName || null,
      card_number: batchCard?.cardNumber || null,
      image_url: batchCard?.imageUrl || null,
    };
    setBatchQueue((prev) => [...prev, entry]);
    setBatchQuery(""); setBatchCard(null); setBatchMarket(""); setBatchGrade("");
    setBatchFlatAmount("");
  }

  async function handleFinalizeBatch() {
    if (!sessionId || batchQueue.length === 0) return;
    setBusy(true);
    try {
      for (const item of batchQueue) {
        await recordShowBuy({
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
        });
        pushFeedEntry({
          id: crypto.randomUUID(),
          kind: "buy",
          time: new Date().toISOString(),
          label: item.name,
          sub: `${item.buy_pct}%`,
          amount: -item.cost,
        });
      }
      await refreshSession(sessionId);
      setBatchQueue([]);
    } catch (e) {
      err(e instanceof Error ? e.message : "Batch buy failed");
    } finally {
      setBusy(false);
    }
  }

  // ── Sell tab ──────────────────────────────────────────────────────────────

  function handleSellSearch(q: string) {
    setSellQuery(q);
    if (sellSearchTimer.current) clearTimeout(sellSearchTimer.current);
    if (!q.trim()) { setSellResults([]); return; }
    setSellSearching(true);
    sellSearchTimer.current = setTimeout(async () => {
      try {
        const results = await searchInventoryItems(q);
        setSellResults(results);
      } finally {
        setSellSearching(false);
      }
    }, 150);
  }

  function handleSelectSellItem(item: InventorySearchResult) {
    setSelectedSellItem(item);
    setSellPrice(
      item.sticker_price != null
        ? item.sticker_price.toFixed(2)
        : item.market != null
        ? item.market.toFixed(2)
        : ""
    );
    setSellQuery(""); setSellResults([]);
  }

  async function handleConfirmSell() {
    if (!selectedSellItem || !sessionId) return;
    const price = parseFloat(sellPrice);
    if (!price || price <= 0) { err("Enter sell price"); return; }
    setBusy(true);
    try {
      const { scanId } = await recordShowSell({
        show_session_id: sessionId,
        item_id: selectedSellItem.id,
        item_name: selectedSellItem.name,
        sell_price: price,
      });
      pushFeedEntry({
        id: scanId,
        kind: "sell",
        time: new Date().toISOString(),
        label: selectedSellItem.name,
        sub: selectedSellItem.grade ?? undefined,
        amount: price,
      });
      await refreshSession(sessionId);
      setSelectedSellItem(null);
      setSellPrice("");
    } catch (e) {
      err(e instanceof Error ? e.message : "Sell failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleQuickSellAtSticker(item: InventorySearchResult) {
    if (!sessionId || item.sticker_price == null) return;
    setBusy(true);
    try {
      const { scanId } = await recordShowSell({
        show_session_id: sessionId,
        item_id: item.id,
        item_name: item.name,
        sell_price: item.sticker_price,
      });
      pushFeedEntry({
        id: scanId,
        kind: "sell",
        time: new Date().toISOString(),
        label: item.name,
        sub: item.grade ?? undefined,
        amount: item.sticker_price,
      });
      await refreshSession(sessionId);
      setSellResults((prev) => prev.filter((r) => r.id !== item.id));
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
      await recordShowTrade({
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
      });

      const gaveNames = tradeGoingOut.map((g) => g.item.name).join(", ") || "—";
      const gotNames = tradeComingIn.filter((c) => c.name.trim()).map((c) => c.name).join(", ") || "—";
      pushFeedEntry({
        id: crypto.randomUUID(),
        kind: "trade",
        time: new Date().toISOString(),
        label: `${gaveNames} → ${gotNames}`,
        sub: Math.abs(cashDiff) > 0.01 ? `Cash ${cashDiff > 0 ? "received" : "paid"}: $${Math.abs(cashDiff).toFixed(2)}` : undefined,
        amount: Math.abs(cashDiff) > 0.01 ? cashDiff : null,
      });
      await refreshSession(sessionId);

      const tradedIds = new Set(tradeGoingOut.map((g) => g.item.id));
      setTradeInventory((prev) => prev.filter((i) => !tradedIds.has(i.id)));
      setTradeGoingOut([]);
      setTradeComingIn([blankTradeComingIn()]);
      setTradeCashOverride(""); setTradeNotes("");
      setTradeStep("build"); setTradeInventoryQuery("");
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
      const { scanId } = await addShowExpense({
        show_session_id: sessionId,
        description: expenseDesc.trim(),
        cost,
        category: expenseCategory,
        paid_by: expensePaidBy,
      });
      pushFeedEntry({
        id: scanId,
        kind: "expense",
        time: new Date().toISOString(),
        label: expenseDesc.trim(),
        amount: -cost,
      });
      await refreshSession(sessionId);
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
        className="sticky top-14 z-30 px-4 pt-2 pb-1 border-b"
        style={{ background: "var(--bg-glass, rgba(13,11,20,0.92))", backdropFilter: "blur(12px)" }}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="text-xs font-bold tracking-widest uppercase px-1.5 py-0.5 rounded shrink-0"
              style={{ background: "rgba(234,179,8,0.15)", color: "#eab308" }}
            >
              SHOW
            </div>
            <span className="text-sm font-semibold truncate">{session.name}</span>
            <span className="text-xs opacity-40 shrink-0 hidden sm:inline">{fmtDate(session.date)}</span>
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
        <div className="grid grid-cols-3 gap-x-2 pb-0.5">
          {/* Cash — tappable */}
          <div
            className="text-center cursor-pointer"
            onClick={() => { setCashCountInput(""); setCashCountOpen(true); }}
            title="Tap to count cash"
          >
            <div className="text-sm font-semibold tabular-nums leading-tight underline decoration-dotted underline-offset-2 opacity-80">
              {money(expectedCash)}
            </div>
            <div className="text-[9px] uppercase tracking-wide opacity-40 mt-0.5">Cash</div>
          </div>
          {/* P&L */}
          <div className="text-center">
            <div className={`text-sm font-semibold tabular-nums leading-tight ${session.net_pl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {moneySign(session.net_pl)}
            </div>
            <div className="text-[9px] uppercase tracking-wide opacity-40 mt-0.5">P&L</div>
          </div>
          {/* Cards in/out */}
          <div className="text-center">
            <div className="text-sm font-semibold tabular-nums leading-tight">
              {session.cards_bought}<span className="opacity-30">↓</span> {session.cards_sold}<span className="opacity-30">↑</span>
            </div>
            <div className="text-[9px] uppercase tracking-wide opacity-40 mt-0.5">Cards</div>
          </div>
        </div>

        {/* Expandable more stats */}
        <button
          onClick={() => setStatsExpanded((e) => !e)}
          className="w-full text-[9px] uppercase tracking-wide opacity-30 hover:opacity-50 transition-opacity pb-0.5"
        >
          {statsExpanded ? "▲ Less" : "▼ More stats"}
        </button>
        {statsExpanded && (
          <div className="grid grid-cols-4 gap-x-3 pb-1 border-t pt-1.5">
            {[
              { label: "Spent", value: money(session.total_spent) },
              { label: "Revenue", value: money(session.total_revenue) },
              { label: "Trades", value: String(session.trades_count) },
              { label: "Passed", value: String(session.passes_count) },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-xs font-semibold tabular-nums">{stat.value}</div>
                <div className="text-[9px] uppercase tracking-wide opacity-30">{stat.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Desktop tab bar (hidden on mobile — replaced by bottom nav) ── */}
      <div className="hidden md:block px-4 pt-3 pb-0">
        <div
          className="grid grid-cols-4 gap-1 rounded-xl p-1"
          style={{ background: "rgba(255,255,255,0.04)" }}
        >
          {(["scan", "buy", "sell", "trade"] as const).map((t) => (
            <button
              key={t}
              className={tabClass(t)}
              style={tab === t ? { background: "var(--accent-primary)" } : undefined}
              onClick={() => setTab(t)}
            >
              {t === "scan" ? "Scan" : t === "buy" ? "Buy" : t === "sell" ? "Sell" : "Trade"}
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

      {/* ── Tab content ── */}
      <div className="px-4 pt-3 pb-20 md:pb-4">
        {tab === "scan" && renderScanTab()}
        {tab === "buy" && renderBuyTab()}
        {tab === "sell" && renderSellTab()}
        {tab === "trade" && renderTradeTab()}
      </div>

      {/* ── Activity feed ── */}
      <div className="px-4 pt-4 pb-24 md:pb-20">
        <div className="text-xs font-semibold uppercase tracking-wide opacity-30 mb-2">Activity</div>
        {feed.length === 0 ? (
          <div className="text-sm opacity-30 text-center py-6">No activity yet</div>
        ) : (
          <div className="space-y-0">
            {feed.map((entry, idx) => {
              const canUndo =
                idx === 0 &&
                entry.kind !== "trade" &&
                Date.now() - new Date(entry.time).getTime() < UNDO_WINDOW_MS;
              return (
                <div key={entry.id} className="flex items-start gap-3 py-2.5 border-t first:border-t-0">
                  <div className="text-[10px] opacity-40 tabular-nums shrink-0 pt-0.5 w-14">
                    {fmtTime(entry.time)}
                  </div>
                  <div
                    className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${
                      entry.kind === "buy" ? "bg-rose-500/15 text-rose-400"
                      : entry.kind === "sell" ? "bg-emerald-500/15 text-emerald-400"
                      : entry.kind === "trade" ? "bg-violet-500/15 text-violet-400"
                      : entry.kind === "expense" ? "bg-amber-500/15 text-amber-400"
                      : "bg-zinc-500/10 opacity-40"
                    }`}
                  >
                    {entry.kind === "buy" ? "BUY" : entry.kind === "sell" ? "SELL" : entry.kind === "trade" ? "TRADE" : entry.kind === "expense" ? "EXP" : "PASS"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm leading-tight truncate">{entry.label}</div>
                    {entry.sub && <div className="text-xs opacity-40 mt-0.5">{entry.sub}</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {entry.amount != null && (
                      <div
                        className={`text-sm font-semibold tabular-nums ${
                          entry.amount > 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {entry.amount > 0 ? "+" : "−"}{money(Math.abs(entry.amount))}
                      </div>
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
            })}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {endOpen && renderEndModal()}
      {expenseOpen && renderExpenseModal()}
      {cashCountOpen && renderCashCountModal()}

      {/* ── Mobile bottom nav (replaces regular app nav during show mode) ── */}
      {isMounted && createPortal(
        <div
          className="show-mode-bottom-nav md:hidden bg-background border-t border-border flex h-14"
          style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999 }}
        >
          {(["scan", "buy", "sell", "trade"] as const).map((t) => {
            const active = tab === t;
            const Icon = t === "scan" ? ScanLine : t === "buy" ? ShoppingBag : t === "sell" ? DollarSign : ArrowLeftRight;
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
                  <button onClick={() => setScanShowCustom(false)} className="px-3 py-2 rounded-lg border text-sm opacity-50">✕</button>
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
                  <button onClick={() => setScanShowFlat(false)} className="px-3 py-2 rounded-lg border text-sm opacity-50">✕</button>
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
    const effectivePct = batchPct > 0 ? batchPct : parseFloat(batchCustomPct) || 0;
    const flatAmt = parseFloat(batchFlatAmount) || 0;
    const batchMarketNum = parseFloat(batchMarket) || 0;
    const stageCost =
      flatAmt > 0 ? flatAmt :
      effectivePct > 0 && batchMarketNum > 0 ? parseFloat((batchMarketNum * effectivePct / 100).toFixed(2)) : 0;
    const batchTotal = batchQueue.reduce((s, i) => s + i.cost, 0);

    return (
      <div className="space-y-3">
        <div className="text-xs opacity-50">Add cards one by one, then record all at once.</div>

        <div className="border rounded-xl p-3 space-y-2">
          <CardAutocomplete
            value={batchQuery}
            onChange={(v) => { setBatchQuery(v); if (!v) setBatchCard(null); }}
            onSelect={onBatchCardSelect}
            placeholder="Card name…"
            className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background"
          />

          <div className="grid grid-cols-3 gap-1.5">
            <select
              className="border rounded-lg px-2 py-2 text-xs bg-background"
              value={batchCategory}
              onChange={(e) => setBatchCategory(e.target.value as "single" | "slab" | "sealed")}
            >
              <option value="single">Single</option>
              <option value="slab">Slab</option>
              <option value="sealed">Sealed</option>
            </select>
            <input
              className="border rounded-lg px-2 py-2 text-xs bg-background"
              placeholder="Grade / Cond."
              value={batchGrade}
              onChange={(e) => setBatchGrade(e.target.value)}
            />
            <input
              type="number"
              inputMode="decimal"
              className="border rounded-lg px-2 py-2 text-xs bg-background font-mono"
              placeholder="Market $"
              value={batchMarket}
              onChange={(e) => setBatchMarket(e.target.value)}
            />
          </div>

          {/* Owner */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs opacity-40">Owner:</span>
            {(["shared", "alex", "mila"] as const).map((o) => (
              <button
                key={o}
                onClick={() => setBatchOwner(o)}
                className={`text-xs px-2 py-0.5 rounded-full border capitalize transition-colors ${batchOwner === o ? "text-white" : "opacity-40"}`}
                style={batchOwner === o ? { background: "var(--accent-primary)", borderColor: "var(--accent-primary)" } : undefined}
              >
                {o}
              </button>
            ))}
          </div>

          {/* Pct buttons — grid with dollar amounts */}
          <div className="grid grid-cols-5 gap-1">
            {BUY_PCTS.map((p) => {
              const isSelected = batchPct === p && !flatAmt;
              const dollarCost = batchMarketNum > 0 ? parseFloat((batchMarketNum * p / 100).toFixed(2)) : null;
              return (
                <button
                  key={p}
                  onClick={() => { setBatchPct(p); setBatchCustomPct(""); setBatchFlatAmount(""); }}
                  className={`flex flex-col items-center py-2 rounded-xl border transition-colors ${
                    isSelected ? "text-white border-violet-500" : "opacity-50 hover:opacity-70"
                  }`}
                  style={isSelected ? { background: "var(--accent-primary)", borderColor: "var(--accent-primary)" } : undefined}
                >
                  <span className="text-xs font-bold">{p}%</span>
                  <span className="text-[10px] opacity-70">{dollarCost != null ? money(dollarCost) : "—"}</span>
                </button>
              );
            })}
          </div>
          {/* Other % and Flat $ on same row */}
          <div className="flex gap-1.5">
            <input
              type="number"
              inputMode="decimal"
              className="flex-1 border rounded-lg px-2 py-1.5 text-xs bg-background"
              placeholder="Other %"
              value={batchCustomPct}
              onChange={(e) => { setBatchCustomPct(e.target.value); setBatchPct(0); setBatchFlatAmount(""); }}
            />
            <input
              type="number"
              inputMode="decimal"
              className={`flex-1 border rounded-lg px-2 py-1.5 text-xs bg-background font-mono ${flatAmt > 0 ? "border-violet-500" : ""}`}
              placeholder="Flat $"
              value={batchFlatAmount}
              onChange={(e) => { setBatchFlatAmount(e.target.value); if (e.target.value) setBatchPct(0); }}
            />
          </div>

          {stageCost > 0 && (
            <div className="text-xs opacity-50">
              Cost: <span className="font-semibold text-rose-400">{money(stageCost)}</span>
              {effectivePct > 0 && !flatAmt && <span className="ml-1 opacity-60">@ {effectivePct}%</span>}
            </div>
          )}

          <button
            onClick={handleAddToBatch}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: "var(--accent-primary)" }}
          >
            + Add to batch
          </button>
        </div>

        {batchQueue.length > 0 && (
          <div className="border rounded-xl p-3 space-y-1">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold">{batchQueue.length} card{batchQueue.length !== 1 ? "s" : ""}</div>
              <div className="text-sm font-bold text-rose-400">Total: {money(batchTotal)}</div>
            </div>
            {batchQueue.map((item) => (
              <div key={item._id} className="flex items-center justify-between py-1.5 border-t first:border-t-0 gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate">{item.name}</div>
                  <div className="text-[10px] opacity-40">{item.grade || item.condition} · {item.buy_pct}% · {item.owner}</div>
                </div>
                <div className="text-xs font-semibold text-rose-400 shrink-0">{money(item.cost)}</div>
                <button
                  onClick={() => setBatchQueue((q) => q.filter((x) => x._id !== item._id))}
                  className="text-xs opacity-30 hover:opacity-60 px-1"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={handleFinalizeBatch}
              disabled={busy}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white mt-2"
              style={{ background: "#22c55e" }}
            >
              {busy ? "Recording…" : `Record ${batchQueue.length} card${batchQueue.length !== 1 ? "s" : ""} · ${money(batchTotal)}`}
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderSellTab() {
    return (
      <div className="space-y-3">
        <div className="text-xs opacity-50">Search your inventory and record a sale.</div>

        {!selectedSellItem ? (
          <>
            <div className="relative">
              <input
                className="w-full border rounded-xl px-4 py-3 text-sm bg-background"
                placeholder="Search inventory…"
                value={sellQuery}
                onChange={(e) => handleSellSearch(e.target.value)}
                autoFocus={tab === "sell"}
              />
              {sellSearching && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] opacity-40">…</span>
              )}
            </div>
            {sellResults.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {sellResults.map((item) => (
                  <div key={item.id} className="relative flex flex-col rounded-xl overflow-hidden border border-border/50 bg-background">
                    {/* Image */}
                    <button
                      onClick={() => handleSelectSellItem(item)}
                      className="relative w-full aspect-[3/4] bg-muted overflow-hidden"
                    >
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center opacity-20 text-[10px] font-bold uppercase tracking-wide text-center px-1">
                          {item.category}
                        </div>
                      )}
                      {/* Grade badge for slabs */}
                      {item.category === "slab" && item.grade && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                          <div className="text-[8px] font-bold text-white text-center truncate">{item.grade}</div>
                        </div>
                      )}
                    </button>
                    {/* Info row */}
                    <div className="px-1.5 pt-1 pb-1">
                      <div className="text-[10px] font-medium leading-tight truncate">{item.name}</div>
                      {item.market != null && (
                        <div className="text-[9px] opacity-50 mt-0.5">{money(item.market)}</div>
                      )}
                    </div>
                    {/* Quick sell at sticker OR custom price button */}
                    {item.sticker_price != null ? (
                      <button
                        onClick={() => handleQuickSellAtSticker(item)}
                        disabled={busy}
                        className="mx-1.5 mb-1.5 py-1 rounded-lg text-[9px] font-bold text-white disabled:opacity-30"
                        style={{ background: "#22c55e" }}
                      >
                        Sold {money(item.sticker_price)}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSelectSellItem(item)}
                        className="mx-1.5 mb-1.5 py-1 rounded-lg text-[9px] border border-border opacity-50 hover:opacity-80"
                      >
                        Custom price
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : sellQuery.trim() && !sellSearching ? (
              <div className="text-xs opacity-40 text-center py-4">No results for &ldquo;{sellQuery}&rdquo;</div>
            ) : null}
          </>
        ) : (
          <div className="border rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">{selectedSellItem.name}</div>
                <div className="text-xs opacity-50 mt-0.5">
                  {selectedSellItem.grade ?? selectedSellItem.condition}
                  {selectedSellItem.set_name ? ` · ${selectedSellItem.set_name}` : ""}
                </div>
              </div>
              <button onClick={() => setSelectedSellItem(null)} className="opacity-30 hover:opacity-60 text-sm">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {selectedSellItem.sticker_price != null && (
                <button
                  onClick={() => setSellPrice(selectedSellItem.sticker_price!.toFixed(2))}
                  className="border rounded-lg px-3 py-2 text-left hover:bg-white/5 transition-colors"
                >
                  <div className="opacity-50">Sticker</div>
                  <div className="font-semibold">{money(selectedSellItem.sticker_price)}</div>
                </button>
              )}
              {selectedSellItem.market != null && (
                <button
                  onClick={() => setSellPrice(selectedSellItem.market!.toFixed(2))}
                  className="border rounded-lg px-3 py-2 text-left hover:bg-white/5 transition-colors"
                >
                  <div className="opacity-50">Market</div>
                  <div className="font-semibold">{money(selectedSellItem.market)}</div>
                </button>
              )}
            </div>

            <div>
              <div className="text-xs opacity-50 mb-1">Sell price</div>
              <input
                type="number"
                inputMode="decimal"
                className="w-full border rounded-xl px-4 py-3 text-lg font-semibold bg-background font-mono"
                placeholder="$0.00"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                autoFocus
              />
            </div>

            <button
              onClick={handleConfirmSell}
              disabled={busy || !parseFloat(sellPrice)}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-30"
              style={{ background: "#22c55e" }}
            >
              {busy ? "Recording…" : `Sold · ${money(parseFloat(sellPrice) || null)}`}
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderTradeTab() {
    const gaveTotal = tradeGoingOut.reduce((s, g) => s + (parseFloat(g.tradeValue) || (g.item.market ?? 0)), 0);
    const gotTotal = tradeComingIn.reduce((s, c) => s + (parseFloat(c.marketPrice) || 0), 0);
    const autoCash = parseFloat((gotTotal - gaveTotal).toFixed(2));
    const cashDiff = tradeCashOverride.trim()
      ? (tradeCashDir === "received" ? Math.abs(parseFloat(tradeCashOverride) || 0) : -(Math.abs(parseFloat(tradeCashOverride) || 0)))
      : autoCash;

    const filteredInventory = tradeInventory.filter((item) => {
      const q = tradeInventoryQuery.trim().toLowerCase();
      return !q || item.name.toLowerCase().includes(q) || (item.set_name ?? "").toLowerCase().includes(q) || (item.grade ?? "").toLowerCase().includes(q);
    });

    if (tradeStep === "confirm") {
      return (
        <div className="space-y-4">
          <div className="text-sm font-semibold">Trade Summary</div>

          {tradeGoingOut.length > 0 && (
            <div className="border rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-rose-500/5">
                <div className="text-[10px] font-bold uppercase text-rose-400 mb-1">Giving Up</div>
                {tradeGoingOut.map((g) => (
                  <div key={g.item.id} className="flex justify-between text-sm py-1 border-t first:border-t-0 border-rose-500/10">
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{g.item.name}</span>
                      {g.item.grade && <span className="text-xs opacity-50 ml-1.5">{g.item.grade}</span>}
                    </div>
                    <span className="font-semibold text-rose-400 shrink-0 ml-3">
                      {money(parseFloat(g.tradeValue) || g.item.market)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tradeComingIn.filter((c) => c.name.trim()).length > 0 && (
            <div className="border rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-emerald-500/5">
                <div className="text-[10px] font-bold uppercase text-emerald-400 mb-1">Getting</div>
                {tradeComingIn.filter((c) => c.name.trim()).map((c) => (
                  <div key={c._id} className="flex justify-between text-sm py-1 border-t first:border-t-0 border-emerald-500/10">
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{c.name}</span>
                      {c.grade && <span className="text-xs opacity-50 ml-1.5">{c.grade}</span>}
                    </div>
                    <span className="font-semibold text-emerald-400 shrink-0 ml-3">
                      {money(parseFloat(c.marketPrice) || null)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={`text-center py-2 font-semibold text-sm ${Math.abs(cashDiff) < 0.01 ? "opacity-40" : cashDiff > 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {Math.abs(cashDiff) < 0.01 ? "Even trade" : cashDiff > 0 ? `Cash received: ${money(cashDiff)}` : `Cash paid: ${money(Math.abs(cashDiff))}`}
          </div>

          {tradeNotes.trim() && <div className="text-xs opacity-50 italic">{tradeNotes}</div>}

          <div className="flex gap-2">
            <button className="flex-1 py-3 rounded-xl border text-sm font-medium opacity-60 hover:opacity-80 transition-opacity" onClick={() => setTradeStep("build")}>← Back</button>
            <button
              onClick={handleRecordTrade}
              disabled={busy}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-30"
              style={{ background: "var(--accent-primary)" }}
            >
              {busy ? "Recording…" : "Confirm Trade"}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="text-xs opacity-50">Trade from inventory. Going-out cards are removed; coming-in cards are added.</div>

        {/* Giving Up */}
        <div className="border rounded-xl p-3 space-y-2">
          <div className="text-xs font-semibold opacity-50 uppercase tracking-wide">Giving Up (inventory)</div>
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
            placeholder="Search inventory…"
            value={tradeInventoryQuery}
            onChange={(e) => setTradeInventoryQuery(e.target.value)}
          />
          {!tradeInventoryLoaded ? (
            <div className="text-xs opacity-40 text-center py-2">Loading inventory…</div>
          ) : filteredInventory.length === 0 ? (
            <div className="text-xs opacity-40 text-center py-2">{tradeInventoryQuery ? "No matches" : "No items in inventory"}</div>
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
                      {/* Image */}
                      <div className="relative w-full aspect-[3/4] bg-muted overflow-hidden">
                        {item.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center opacity-20 text-[9px] font-bold uppercase tracking-wide text-center px-1">
                            {item.category}
                          </div>
                        )}
                        {/* Grade badge for slabs */}
                        {item.category === "slab" && item.grade && (
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                            <div className="text-[7px] font-bold text-white text-center truncate">{item.grade}</div>
                          </div>
                        )}
                        {/* Checkmark overlay when selected */}
                        {selected && (
                          <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-rose-500 flex items-center justify-center">
                            <span className="text-white text-[8px] font-bold">✓</span>
                          </div>
                        )}
                      </div>
                      {/* Name + price */}
                      <div className="px-1.5 pt-1 pb-1.5 bg-background">
                        <div className="text-[9px] font-medium leading-tight truncate">{item.name}</div>
                        {item.market != null && (
                          <div className="text-[8px] opacity-50 mt-0.5">{money(item.market)}</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {!tradeShowMore && filteredInventory.length > 15 && (
                <button
                  onClick={() => setTradeShowMore(true)}
                  className="w-full text-[10px] opacity-40 hover:opacity-70 transition-opacity py-1"
                >
                  Show {filteredInventory.length - 15} more…
                </button>
              )}
            </>
          )}
          {tradeGoingOut.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t">
              {tradeGoingOut.map((g) => (
                <div key={g.item.id} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{g.item.name}</div>
                    {g.item.grade && <div className="text-[10px] opacity-40">{g.item.grade}</div>}
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="w-20 border rounded-lg px-2 py-1 text-xs bg-background text-right font-mono"
                    value={g.tradeValue}
                    onChange={(e) => setTradeGoingOut((prev) => prev.map((x) => x.item.id === g.item.id ? { ...x, tradeValue: e.target.value } : x))}
                  />
                  <button onClick={() => setTradeGoingOut((prev) => prev.filter((x) => x.item.id !== g.item.id))} className="text-xs opacity-30 hover:opacity-60">✕</button>
                </div>
              ))}
              <div className="text-xs text-right opacity-50 pt-0.5">Total: <span className="font-semibold text-rose-400">{money(gaveTotal)}</span></div>
            </div>
          )}
        </div>

        {/* Getting */}
        <div className="border rounded-xl p-3 space-y-2">
          <div className="text-xs font-semibold opacity-50 uppercase tracking-wide">Getting</div>
          {tradeComingIn.map((card, idx) => (
            <div key={card._id} className="border rounded-lg p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] opacity-40">Card {idx + 1}</span>
                <div className="flex items-center gap-2">
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
            <div className="text-xs text-right opacity-50 pt-0.5">Total: <span className="font-semibold text-emerald-400">{money(gotTotal)}</span></div>
          )}
        </div>

        {/* Cash & Notes */}
        <div className="border rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="opacity-50">Auto cash</span>
            <span className={`font-semibold ${Math.abs(autoCash) < 0.01 ? "opacity-40" : autoCash > 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {Math.abs(autoCash) < 0.01 ? "Even" : autoCash > 0 ? `We receive ${money(autoCash)}` : `We pay ${money(Math.abs(autoCash))}`}
            </span>
          </div>
          <div>
            <div className="text-[10px] opacity-40 mb-1">Override cash (optional)</div>
            <div className="flex gap-2">
              <select className="border rounded-lg px-2 py-2 text-xs bg-background" value={tradeCashDir} onChange={(e) => setTradeCashDir(e.target.value as "received" | "paid")}>
                <option value="received">We receive</option>
                <option value="paid">We pay</option>
              </select>
              <input type="number" inputMode="decimal" className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background font-mono" placeholder="$0" value={tradeCashOverride} onChange={(e) => setTradeCashOverride(e.target.value)} />
            </div>
          </div>
          <input className="w-full border rounded-lg px-3 py-2 text-xs bg-background opacity-70" placeholder="Notes (optional)" value={tradeNotes} onChange={(e) => setTradeNotes(e.target.value)} />
        </div>

        <button
          onClick={() => {
            if (tradeGoingOut.length === 0 && tradeComingIn.every((c) => !c.name.trim())) { err("Add cards to the trade"); return; }
            if (tradeComingIn.some((c) => !c.name.trim())) { err("Enter names for all incoming cards"); return; }
            setTradeStep("confirm");
          }}
          disabled={busy}
          className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-30"
          style={{ background: "var(--accent-primary)" }}
        >
          Review Trade →
        </button>
      </div>
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
            <button onClick={() => setCashCountOpen(false)} className="modal-close-btn">✕</button>
          </div>
          <div className="text-sm space-y-1 border rounded-xl p-3">
            <div className="flex justify-between opacity-70">
              <span>Starting cash</span>
              <span>{money(session?.starting_cash ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Expected now</span>
              <span className="font-semibold">{money(expectedCash)}</span>
            </div>
          </div>
          <div>
            <div className="text-xs opacity-50 mb-1">Count your cash</div>
            <input
              type="number"
              inputMode="decimal"
              className="w-full border rounded-xl px-4 py-3 text-lg font-semibold bg-background font-mono"
              placeholder={`Expected: ${money(expectedCash)}`}
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
