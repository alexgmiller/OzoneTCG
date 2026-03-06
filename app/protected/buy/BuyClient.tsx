"use client";

import { useState, useMemo } from "react";
import { finalizeBuy, finalizeTrade, type CustomerCard } from "./actions";
import CardScanner, { type ScanResult } from "@/components/CardScanner";
import CardSearchPicker, { type CardSearchResult } from "@/components/CardSearchPicker";
import BuyCSVImport from "./BuyCSVImport";

type Condition = "Near Mint" | "Lightly Played" | "Moderately Played" | "Heavily Played" | "Damaged";
type PaidBy = "alex" | "mila" | "shared";

export type InventoryItem = {
  id: string;
  name: string;
  category: string;
  owner: string;
  condition: Condition;
  market: number;
};

function fmt(v: number) {
  return `$${v.toFixed(2)}`;
}

const CONDITIONS: Condition[] = [
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Heavily Played",
  "Damaged",
];

export default function BuyClient({ inventoryItems }: { inventoryItems: InventoryItem[] }) {
  const [mode, setMode] = useState<"buy" | "trade">("buy");
  const [buyPct, setBuyPct] = useState(70);
  const [tradePct, setTradePct] = useState(80);
  const [customBuyOffer, setCustomBuyOffer] = useState("");
  const [customTradeValue, setCustomTradeValue] = useState("");
  const [customMyValue, setCustomMyValue] = useState("");

  // Customer card input fields
  const [cardName, setCardName] = useState("");
  const [cardSetName, setCardSetName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardCondition, setCardCondition] = useState<Condition>("Near Mint");
  const [cardMarket, setCardMarket] = useState("");
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);

  // Lookup state
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupConfirmed, setLookupConfirmed] = useState<{ name: string; setName: string; cardNumber: string } | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [customerCards, setCustomerCards] = useState<CustomerCard[]>([]);

  // Trade — my inventory picker
  const [mySearch, setMySearch] = useState("");
  const [selectedMyIds, setSelectedMyIds] = useState<Set<string>>(new Set());
  const [myCardsOpen, setMyCardsOpen] = useState(false);

  // Modals
  const [scanOpen, setScanOpen] = useState(false);
  const [cardSearchOpen, setCardSearchOpen] = useState(false);

  // Finalize modal
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [sellerName, setSellerName] = useState("");
  const [paidBy, setPaidBy] = useState<PaidBy>("shared");
  const [paymentType, setPaymentType] = useState("cash");
  const [addToInventory, setAddToInventory] = useState(true);
  const [busy, setBusy] = useState(false);

  // Derived values
  const customerTotal = customerCards.reduce((s, c) => s + c.market, 0);
  const parsedCustomBuy = parseFloat(customBuyOffer);
  const customerOffer = customBuyOffer !== "" && Number.isFinite(parsedCustomBuy)
    ? parsedCustomBuy
    : customerTotal * (buyPct / 100);
  const effectiveBuyPct = customerTotal > 0 ? (customerOffer / customerTotal) * 100 : buyPct;

  const parsedCustomTrade = parseFloat(customTradeValue);
  const customerTradeValue = customTradeValue !== "" && Number.isFinite(parsedCustomTrade)
    ? parsedCustomTrade
    : customerTotal * (tradePct / 100);
  const effectiveTradePct = customerTotal > 0 ? (customerTradeValue / customerTotal) * 100 : tradePct;

  const selectedMyItems = useMemo(
    () => inventoryItems.filter((it) => selectedMyIds.has(it.id)),
    [inventoryItems, selectedMyIds]
  );
  const myTradeValue = selectedMyItems.reduce((s, it) => s + it.market, 0);

  const parsedCustomMy = parseFloat(customMyValue);
  const effectiveMyValue = customMyValue !== "" && Number.isFinite(parsedCustomMy)
    ? parsedCustomMy
    : myTradeValue;
  const tradeBalance = effectiveMyValue - customerTradeValue;

  const filteredInventory = useMemo(() => {
    const q = mySearch.trim().toLowerCase();
    return q ? inventoryItems.filter((it) => it.name.toLowerCase().includes(q)) : inventoryItems;
  }, [inventoryItems, mySearch]);

  function clearCardForm() {
    setCardName("");
    setCardSetName("");
    setCardNumber("");
    setCardMarket("");
    setCardCondition("Near Mint");
    setPendingImageUrl(null);
    setLookupConfirmed(null);
    setLookupError(null);
  }

  function onScanResult(data: ScanResult) {
    setCardName(data.name);
    setCardSetName(data.setName ?? "");
    setCardNumber(data.cardNumber ?? "");
    setCardCondition(data.condition);
    setCardMarket(data.market != null ? String(data.market) : "");
    setPendingImageUrl(data.imageUrl ?? null);
    setLookupConfirmed(
      data.name ? { name: data.name, setName: data.setName ?? "", cardNumber: data.cardNumber ?? "" } : null
    );
    setLookupError(null);
  }

  function onCardSearchResult(data: CardSearchResult) {
    setCardName(data.name);
    setCardSetName(data.setName ?? "");
    setCardNumber(data.cardNumber ?? "");
    setCardMarket(data.market != null ? String(data.market) : "");
    setPendingImageUrl(data.imageUrl ?? null);
    setLookupConfirmed({ name: data.name, setName: data.setName ?? "", cardNumber: data.cardNumber ?? "" });
    setLookupError(null);
  }

  async function handleLookUp() {
    if (!cardName.trim()) return;
    setLookupBusy(true);
    setLookupError(null);
    setLookupConfirmed(null);
    try {
      const res = await fetch("/api/search-cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: cardName.trim(),
          setName: cardSetName.trim() || undefined,
          cardNumber: cardNumber.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setLookupError("Lookup failed");
        return;
      }
      const cards = json.cards ?? [];
      if (cards.length === 0) {
        // No exact match — open the picker so the user can try different search terms
        setCardSearchOpen(true);
        return;
      }
      if (cards.length === 1) {
        const card = cards[0];
        setCardName(card.name);
        setCardSetName(card.setName ?? "");
        setCardNumber(card.cardNumber ?? "");
        if (card.market != null) setCardMarket(String(card.market));
        setPendingImageUrl(card.imageUrl ?? null);
        setLookupConfirmed({ name: card.name, setName: card.setName ?? "", cardNumber: card.cardNumber ?? "" });
        // Background price fetch — fills market price automatically if TCGdex has data
        if (card.cardId && card.market == null) {
          fetch("/api/card-price", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ cardId: card.cardId }),
          })
            .then((r) => r.json())
            .then((data) => { if (data.market != null) setCardMarket(String(data.market)); })
            .catch(() => {});
        }
      } else {
        // Multiple results — open picker
        setCardSearchOpen(true);
      }
    } catch {
      setLookupError("Lookup failed — check your connection");
    } finally {
      setLookupBusy(false);
    }
  }

  function addCard() {
    const m = parseFloat(cardMarket);
    if (!cardName.trim() || !m || m <= 0) return;
    setCustomerCards((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: cardName.trim(),
        condition: cardCondition,
        market: m,
        imageUrl: pendingImageUrl,
        setName: cardSetName.trim() || undefined,
        cardNumber: cardNumber.trim() || undefined,
      },
    ]);
    clearCardForm();
  }

  function onCSVImport(cards: CustomerCard[]) {
    setCustomerCards((prev) => [...prev, ...cards]);
  }

  function toggleMyItem(id: string) {
    const next = new Set(selectedMyIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedMyIds(next);
  }

  function reset() {
    setCustomerCards([]);
    setSelectedMyIds(new Set());
    setSellerName("");
    setPaymentType("cash");
    setAddToInventory(true);
    setFinalizeOpen(false);
    setCustomBuyOffer("");
    setCustomTradeValue("");
    setCustomMyValue("");
    clearCardForm();
  }

  async function onFinalizeBuy() {
    if (!sellerName.trim() || customerCards.length === 0) return;
    setBusy(true);
    try {
      await finalizeBuy({
        sellerName: sellerName.trim(),
        cards: customerCards,
        totalCost: customerOffer,
        paidBy,
        paymentType: paymentType || null,
        addToInventory,
      });
      reset();
    } finally {
      setBusy(false);
    }
  }

  async function onFinalizeTrade() {
    if (customerCards.length === 0 && selectedMyIds.size === 0) return;
    setBusy(true);
    try {
      await finalizeTrade({
        customerCards,
        myItemIds: Array.from(selectedMyIds),
        tradePct,
        cashBalance: tradeBalance,
        paidBy,
        addToInventory,
      });
      reset();
    } finally {
      setBusy(false);
    }
  }

  const canFinalize =
    mode === "buy"
      ? customerCards.length > 0
      : customerCards.length > 0 || selectedMyIds.size > 0;

  return (
    <div className="space-y-4 w-full min-w-0 overflow-x-hidden">
      {/* Mode + Percentages */}
      <div className="border rounded-xl p-3 space-y-3">
        <div className="flex gap-2">
          <button
            className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${mode === "buy" ? "bg-foreground text-background border-foreground" : ""}`}
            onClick={() => setMode("buy")}
          >
            Buy
          </button>
          <button
            className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${mode === "trade" ? "bg-foreground text-background border-foreground" : ""}`}
            onClick={() => setMode("trade")}
          >
            Trade
          </button>
        </div>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <span className="opacity-60 whitespace-nowrap">Buy %</span>
            <input
              className="w-16 border rounded-lg px-2 py-1 text-sm bg-background"
              type="number"
              min={0}
              max={100}
              value={buyPct}
              onChange={(e) => { setBuyPct(Math.max(0, Math.min(100, Number(e.target.value)))); setCustomBuyOffer(""); }}
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="opacity-60 whitespace-nowrap">Trade %</span>
            <input
              className="w-16 border rounded-lg px-2 py-1 text-sm bg-background"
              type="number"
              min={0}
              max={100}
              value={tradePct}
              onChange={(e) => { setTradePct(Math.max(0, Math.min(100, Number(e.target.value)))); setCustomTradeValue(""); }}
            />
          </label>
        </div>
      </div>

      <CardScanner open={scanOpen} onClose={() => setScanOpen(false)} onResult={onScanResult} />
      <CardSearchPicker
        open={cardSearchOpen}
        onClose={() => setCardSearchOpen(false)}
        onResult={onCardSearchResult}
        initialName={cardName}
        initialSetName={cardSetName}
        initialCardNumber={cardNumber}
      />

      {/* Customer's Cards */}
      <div className="border rounded-xl p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-medium">Customer&apos;s Cards</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCardSearchOpen(true)}
              className="text-sm px-2.5 py-1 border rounded-lg hover:bg-muted transition-colors"
              title="Find card by name"
            >
              🔍 Find
            </button>
            <button
              onClick={() => setScanOpen(true)}
              className="text-sm px-2.5 py-1 border rounded-lg hover:bg-muted transition-colors"
              title="Scan card photo"
            >
              📷 Scan
            </button>
            <BuyCSVImport onImport={onCSVImport} />
          </div>
        </div>

        {/* Add card form */}
        <div className="space-y-2">
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
            placeholder="Card name *"
            value={cardName}
            onChange={(e) => { setCardName(e.target.value); setLookupConfirmed(null); }}
            onKeyDown={(e) => e.key === "Enter" && addCard()}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="border rounded-lg px-3 py-2 text-sm bg-background"
              placeholder="Set name (optional)"
              value={cardSetName}
              onChange={(e) => { setCardSetName(e.target.value); setLookupConfirmed(null); }}
            />
            <input
              className="border rounded-lg px-3 py-2 text-sm bg-background"
              placeholder="Card # (optional)"
              value={cardNumber}
              onChange={(e) => { setCardNumber(e.target.value); setLookupConfirmed(null); }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              className="border rounded-lg px-3 py-2 text-sm bg-background"
              value={cardCondition}
              onChange={(e) => setCardCondition(e.target.value as Condition)}
            >
              {CONDITIONS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input
              className="border rounded-lg px-3 py-2 text-sm bg-background"
              placeholder="Market $"
              inputMode="decimal"
              value={cardMarket}
              onChange={(e) => setCardMarket(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCard()}
            />
          </div>

          {/* Lookup confirmation / error */}
          {lookupConfirmed && (
            <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
              <span className="font-medium">✓</span>
              <span className="truncate">
                {lookupConfirmed.name}
                {lookupConfirmed.setName && ` · ${lookupConfirmed.setName}`}
                {lookupConfirmed.cardNumber && ` · #${lookupConfirmed.cardNumber}`}
              </span>
            </div>
          )}
          {lookupError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
              {lookupError}
            </div>
          )}

          <div className="flex gap-2">
            <button
              className="flex-1 px-4 py-2 rounded-lg border font-medium text-sm disabled:opacity-40"
              onClick={handleLookUp}
              disabled={lookupBusy || !cardName.trim()}
            >
              {lookupBusy ? "Looking up…" : "Look Up"}
            </button>
            <button
              className="flex-1 px-4 py-2 rounded-lg border font-medium text-sm disabled:opacity-40"
              onClick={addCard}
              disabled={!cardName.trim() || !parseFloat(cardMarket)}
            >
              + Add Card
            </button>
          </div>
        </div>

        {/* Card list */}
        {customerCards.length > 0 && (
          <>
            <div className="rounded-xl border overflow-hidden">
              {customerCards.map((c, i) => {
                const pct = mode === "buy" ? effectiveBuyPct : effectiveTradePct;
                const offer = c.market * (pct / 100);
                return (
                  <div
                    key={c.id}
                    className={`px-3 py-2 flex items-center gap-2 ${i > 0 ? "border-t" : ""}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{c.name}</div>
                      <div className="text-xs opacity-50 truncate">
                        {c.condition} · Market: {fmt(c.market)}
                        {c.setName && ` · ${c.setName}`}
                        {c.cardNumber && ` · #${c.cardNumber}`}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-green-600 shrink-0">{fmt(offer)}</div>
                    <button
                      className="text-xs opacity-40 hover:opacity-80 px-1 shrink-0"
                      onClick={() => setCustomerCards((prev) => prev.filter((x) => x.id !== c.id))}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="rounded-xl border p-3 text-sm space-y-2">
              <div className="flex justify-between text-xs opacity-60">
                <span>Total market</span>
                <span>{fmt(customerTotal)}</span>
              </div>
              {mode === "buy" ? (
                <div className="space-y-1">
                  <div className="text-xs opacity-60">Offer</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs opacity-50 shrink-0">%</span>
                    <input
                      className="w-16 border rounded-lg px-2 py-1 text-sm bg-background"
                      type="number"
                      min={0}
                      value={customBuyOffer !== "" ? effectiveBuyPct.toFixed(1) : buyPct}
                      onChange={(e) => {
                        const pct = Math.max(0, Math.min(100, Number(e.target.value)));
                        setBuyPct(pct);
                        setCustomBuyOffer("");
                      }}
                    />
                    <span className="text-xs opacity-50 shrink-0">$</span>
                    <input
                      className="flex-1 border rounded-lg px-2 py-1 text-sm bg-background font-semibold text-green-600"
                      type="number"
                      min={0}
                      placeholder={fmt(customerOffer)}
                      value={customBuyOffer}
                      onChange={(e) => setCustomBuyOffer(e.target.value)}
                    />
                    {customBuyOffer !== "" && (
                      <span className="text-xs opacity-50 shrink-0">{effectiveBuyPct.toFixed(1)}%</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-xs opacity-60">Their trade value</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs opacity-50 shrink-0">%</span>
                    <input
                      className="w-16 border rounded-lg px-2 py-1 text-sm bg-background"
                      type="number"
                      min={0}
                      value={customTradeValue !== "" ? effectiveTradePct.toFixed(1) : tradePct}
                      onChange={(e) => {
                        const pct = Math.max(0, Math.min(100, Number(e.target.value)));
                        setTradePct(pct);
                        setCustomTradeValue("");
                      }}
                    />
                    <span className="text-xs opacity-50 shrink-0">$</span>
                    <input
                      className="flex-1 border rounded-lg px-2 py-1 text-sm bg-background font-semibold text-green-600"
                      type="number"
                      min={0}
                      placeholder={fmt(customerTradeValue)}
                      value={customTradeValue}
                      onChange={(e) => setCustomTradeValue(e.target.value)}
                    />
                    {customTradeValue !== "" && (
                      <span className="text-xs opacity-50 shrink-0">{effectiveTradePct.toFixed(1)}%</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Trade: My Cards trigger + summary */}
      {mode === "trade" && (
        <div className="border rounded-xl p-3 space-y-3">
          <button
            className="w-full flex items-center justify-between"
            onClick={() => setMyCardsOpen(true)}
          >
            <span className="font-medium">My Cards</span>
            <span className="text-sm opacity-60">
              {selectedMyIds.size > 0
                ? `${selectedMyIds.size} selected · ${fmt(effectiveMyValue)}${customMyValue !== "" ? " (adj)" : ""}`
                : "Tap to select →"}
            </span>
          </button>

          {(selectedMyIds.size > 0 || customerCards.length > 0) && (
            <div className="rounded-xl border p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="opacity-60">Their value ({effectiveTradePct.toFixed(1)}%)</span>
                <span>{fmt(customerTradeValue)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="opacity-60 shrink-0">My cards</span>
                <div className="flex items-center gap-1">
                  {customMyValue !== "" && (
                    <span className="text-xs opacity-40 line-through">{fmt(myTradeValue)}</span>
                  )}
                  <span className="text-xs opacity-40">$</span>
                  <input
                    className="w-20 border rounded-lg px-2 py-0.5 text-sm bg-background text-right font-medium"
                    type="number"
                    min={0}
                    placeholder={myTradeValue.toFixed(2)}
                    value={customMyValue}
                    onChange={(e) => setCustomMyValue(e.target.value)}
                  />
                  {customMyValue !== "" && (
                    <button
                      onClick={() => setCustomMyValue("")}
                      className="text-xs opacity-40 hover:opacity-70 px-0.5"
                      title="Reset to market"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              <div
                className={`flex justify-between font-semibold border-t pt-1 mt-1 ${
                  tradeBalance > 0.005
                    ? "text-green-600"
                    : tradeBalance < -0.005
                    ? "text-red-600"
                    : ""
                }`}
              >
                <span>
                  {tradeBalance > 0.005
                    ? "Customer owes you"
                    : tradeBalance < -0.005
                    ? "You owe customer"
                    : "Even trade"}
                </span>
                <span>{Math.abs(tradeBalance) > 0.005 ? fmt(Math.abs(tradeBalance)) : "—"}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* My Cards bottom sheet */}
      {myCardsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) setMyCardsOpen(false); }}
        >
          <div className="bg-background border-t rounded-t-2xl w-full max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
              <div className="font-semibold">
                My Cards
                {selectedMyIds.size > 0 && (
                  <span className="ml-2 text-sm font-normal opacity-60">
                    {selectedMyIds.size} selected · {fmt(effectiveMyValue)}
                  </span>
                )}
              </div>
              <button
                className="text-sm px-3 py-1.5 rounded-lg bg-foreground text-background font-medium"
                onClick={() => setMyCardsOpen(false)}
              >
                Done
              </button>
            </div>

            {/* Selected chips — always visible at top */}
            {selectedMyItems.length > 0 && (
              <div className="px-4 pb-2 shrink-0">
                <div className="text-xs font-medium text-muted-foreground mb-1.5">Selected — tap to remove</div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedMyItems.map((it) => (
                    <button
                      key={it.id}
                      onClick={() => toggleMyItem(it.id)}
                      className="flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary"
                    >
                      <span className="max-w-[120px] truncate">{it.name}</span>
                      <span className="opacity-60 shrink-0">{fmt(it.market)}</span>
                      <span className="ml-0.5 opacity-50">✕</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Search */}
            <div className="px-4 pb-2 shrink-0">
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                placeholder="Search inventory…"
                value={mySearch}
                onChange={(e) => setMySearch(e.target.value)}
              />
            </div>

            {/* Inventory list — unselected items first when nothing is searched */}
            <div className="overflow-y-auto flex-1 px-4 pb-4">
              {filteredInventory.length === 0 ? (
                <div className="py-8 text-sm opacity-50 text-center">No items found.</div>
              ) : (
                <div className="border rounded-xl overflow-hidden">
                  {filteredInventory.map((it, i) => {
                    const isSelected = selectedMyIds.has(it.id);
                    return (
                      <div
                        key={it.id}
                        className={`px-3 py-2.5 flex items-center gap-3 cursor-pointer ${i > 0 ? "border-t" : ""} ${isSelected ? "bg-primary/5" : ""}`}
                        onClick={() => toggleMyItem(it.id)}
                      >
                        <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center ${isSelected ? "bg-primary border-primary" : "border-border"}`}>
                          {isSelected && <span className="text-[10px] text-primary-foreground font-bold leading-none">✓</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-medium truncate ${isSelected ? "text-primary" : ""}`}>{it.name}</div>
                          <div className="text-xs opacity-50 truncate">
                            {it.category} · {it.condition}
                          </div>
                        </div>
                        <div className={`text-sm font-semibold shrink-0 ${isSelected ? "text-primary" : "opacity-70"}`}>
                          {fmt(it.market)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Finalize button */}
      {canFinalize && (
        <button
          className="w-full px-4 py-3 rounded-xl bg-green-600 text-white font-semibold"
          onClick={() => setFinalizeOpen(true)}
        >
          {mode === "buy"
            ? `Finalize Buy · ${fmt(customerOffer)}`
            : "Finalize Trade"}
        </button>
      )}

      {/* Finalize modal */}
      {finalizeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFinalizeOpen(false);
          }}
        >
          <div className="bg-background border rounded-2xl w-full max-w-sm p-4 space-y-3">
            <div className="font-semibold">
              {mode === "buy" ? "Finalize Buy" : "Finalize Trade"}
            </div>

            <input
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              placeholder={mode === "buy" ? "Customer name *" : "Customer name (optional)"}
              value={sellerName}
              onChange={(e) => setSellerName(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-2">
              <select
                className="border rounded-lg px-3 py-2 text-sm bg-background"
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value as PaidBy)}
              >
                <option value="shared">Shared</option>
                <option value="alex">Alex</option>
                <option value="mila">Mila</option>
              </select>
              <input
                className="border rounded-lg px-3 py-2 text-sm bg-background"
                placeholder="Payment type"
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
              />
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={addToInventory}
                onChange={(e) => setAddToInventory(e.target.checked)}
                className="w-4 h-4"
              />
              Add customer&apos;s cards to inventory
            </label>

            {/* Summary */}
            <div className="rounded-xl border p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="opacity-60">Customer cards</span>
                <span>{customerCards.length}</span>
              </div>
              {mode === "buy" && (
                <div className="flex justify-between font-semibold">
                  <span>Total cost ({effectiveBuyPct.toFixed(1)}%)</span>
                  <span className="text-red-500">{fmt(customerOffer)}</span>
                </div>
              )}
              {mode === "trade" && (
                <>
                  <div className="flex justify-between">
                    <span className="opacity-60">My cards trading away</span>
                    <span>{selectedMyIds.size} · {fmt(effectiveMyValue)}{customMyValue !== "" ? "*" : ""}</span>
                  </div>
                  <div
                    className={`flex justify-between font-semibold border-t pt-1 mt-1 ${
                      tradeBalance > 0.005
                        ? "text-green-600"
                        : tradeBalance < -0.005
                        ? "text-red-500"
                        : ""
                    }`}
                  >
                    <span>
                      {tradeBalance > 0.005
                        ? "Customer owes you"
                        : tradeBalance < -0.005
                        ? "You owe customer"
                        : "Even trade"}
                    </span>
                    <span>
                      {Math.abs(tradeBalance) > 0.005
                        ? fmt(Math.abs(tradeBalance))
                        : "—"}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-2">
              <button
                className="flex-1 px-4 py-2 rounded-lg bg-green-600 text-white font-medium disabled:opacity-40"
                onClick={mode === "buy" ? onFinalizeBuy : onFinalizeTrade}
                disabled={busy || (mode === "buy" && !sellerName.trim())}
              >
                {busy ? "Saving…" : "Confirm"}
              </button>
              <button
                className="px-4 py-2 rounded-lg border opacity-60"
                onClick={() => setFinalizeOpen(false)}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
