"use client";

import { useState, useMemo } from "react";
import { finalizeBuy, finalizeTrade, type CustomerCard } from "./actions";

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
  const [buyPct, setBuyPct] = useState(60);
  const [tradePct, setTradePct] = useState(75);

  // Customer card input
  const [cardName, setCardName] = useState("");
  const [cardCondition, setCardCondition] = useState<Condition>("Near Mint");
  const [cardMarket, setCardMarket] = useState("");
  const [customerCards, setCustomerCards] = useState<CustomerCard[]>([]);

  // Trade — my inventory picker
  const [mySearch, setMySearch] = useState("");
  const [selectedMyIds, setSelectedMyIds] = useState<Set<string>>(new Set());

  // Finalize modal
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [sellerName, setSellerName] = useState("");
  const [paidBy, setPaidBy] = useState<PaidBy>("shared");
  const [paymentType, setPaymentType] = useState("cash");
  const [addToInventory, setAddToInventory] = useState(true);
  const [busy, setBusy] = useState(false);

  // Derived values
  const customerTotal = customerCards.reduce((s, c) => s + c.market, 0);
  const customerOffer = customerTotal * (buyPct / 100);
  const customerTradeValue = customerTotal * (tradePct / 100);

  const selectedMyItems = useMemo(
    () => inventoryItems.filter((it) => selectedMyIds.has(it.id)),
    [inventoryItems, selectedMyIds]
  );
  const myTradeValue = selectedMyItems.reduce((s, it) => s + it.market, 0);
  // positive = customer owes us cash, negative = we owe customer cash
  const tradeBalance = myTradeValue - customerTradeValue;

  const filteredInventory = useMemo(() => {
    const q = mySearch.trim().toLowerCase();
    return q ? inventoryItems.filter((it) => it.name.toLowerCase().includes(q)) : inventoryItems;
  }, [inventoryItems, mySearch]);

  function addCard() {
    const m = parseFloat(cardMarket);
    if (!cardName.trim() || !m || m <= 0) return;
    setCustomerCards((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: cardName.trim(), condition: cardCondition, market: m },
    ]);
    setCardName("");
    setCardMarket("");
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
    <div className="space-y-4">
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
              onChange={(e) => setBuyPct(Math.max(0, Math.min(100, Number(e.target.value))))}
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
              onChange={(e) => setTradePct(Math.max(0, Math.min(100, Number(e.target.value))))}
            />
          </label>
        </div>
      </div>

      {/* Customer's Cards */}
      <div className="border rounded-xl p-3 space-y-3">
        <div className="font-medium">Customer&apos;s Cards</div>

        {/* Add card */}
        <div className="space-y-2">
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
            placeholder="Card name *"
            value={cardName}
            onChange={(e) => setCardName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCard()}
          />
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
          <button
            className="w-full px-4 py-2 rounded-lg border font-medium text-sm"
            onClick={addCard}
          >
            + Add Card
          </button>
        </div>

        {/* Card list */}
        {customerCards.length > 0 && (
          <>
            <div className="rounded-xl border overflow-hidden">
              {customerCards.map((c, i) => {
                const pct = mode === "buy" ? buyPct : tradePct;
                const offer = c.market * (pct / 100);
                return (
                  <div
                    key={c.id}
                    className={`px-3 py-2 flex items-center gap-2 ${i > 0 ? "border-t" : ""}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{c.name}</div>
                      <div className="text-xs opacity-50">
                        {c.condition} · Market: {fmt(c.market)}
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

            <div className="rounded-xl border p-3 text-sm space-y-1">
              <div className="flex justify-between text-xs opacity-60">
                <span>Total market</span>
                <span>{fmt(customerTotal)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>
                  {mode === "buy" ? `Buy offer (${buyPct}%)` : `Their trade value (${tradePct}%)`}
                </span>
                <span className="text-green-600">
                  {fmt(mode === "buy" ? customerOffer : customerTradeValue)}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Trade: My Inventory */}
      {mode === "trade" && (
        <div className="border rounded-xl p-3 space-y-3">
          <div className="font-medium">My Cards</div>
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
            placeholder="Search inventory…"
            value={mySearch}
            onChange={(e) => setMySearch(e.target.value)}
          />

          <div className="rounded-xl border overflow-hidden max-h-64 overflow-y-auto">
            {filteredInventory.length === 0 ? (
              <div className="p-4 text-sm opacity-50 text-center">No items with market price.</div>
            ) : (
              filteredInventory.map((it, i) => {
                const isSelected = selectedMyIds.has(it.id);
                const tradeVal = it.market;
                return (
                  <div
                    key={it.id}
                    className={`px-3 py-2 flex items-center gap-2 cursor-pointer ${i > 0 ? "border-t" : ""} ${isSelected ? "bg-blue-50 dark:bg-blue-950/20" : ""}`}
                    onClick={() => toggleMyItem(it.id)}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      readOnly
                      className="w-4 h-4 accent-blue-600 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{it.name}</div>
                      <div className="text-xs opacity-50">
                        {it.category} · {it.condition} · Market: {fmt(it.market)}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-blue-600 shrink-0">
                      {fmt(tradeVal)}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Trade summary */}
          {(selectedMyIds.size > 0 || customerCards.length > 0) && (
            <div className="rounded-xl border p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="opacity-60">Their trade value ({tradePct}%)</span>
                <span>{fmt(customerTradeValue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-60">My cards (market value)</span>
                <span>{fmt(myTradeValue)}</span>
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
                <span>
                  {Math.abs(tradeBalance) > 0.005 ? fmt(Math.abs(tradeBalance)) : "—"}
                </span>
              </div>
            </div>
          )}
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
                  <span>Total cost</span>
                  <span className="text-red-500">{fmt(customerOffer)}</span>
                </div>
              )}
              {mode === "trade" && (
                <>
                  <div className="flex justify-between">
                    <span className="opacity-60">My cards trading away</span>
                    <span>{selectedMyIds.size}</span>
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
