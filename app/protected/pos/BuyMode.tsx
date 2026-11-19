"use client";

import { useState } from "react";
import { ScanLine, X } from "lucide-react";
import CardAutocomplete from "@/components/CardAutocomplete";
import CertLookupWidget from "@/components/CertLookupWidget";
import { CardScanner, type CardScanMatch } from "@/components/scan/CardScanner";
import { getCardDetail } from "@/app/protected/search/actions";
import { Chip, EmptyState, IconButton, MoneyDisplay, Sheet, useToast } from "@/components/ui";
import { offlineRecordBuy } from "@/lib/offlineAwareActions";
import { playedCondition, type ConditionFactors } from "@/lib/conditionPricing";
import { cn } from "@/lib/utils";
import { CONDITIONS, pricedCard, round2, withCondition, type CardCondition, type NewCard } from "./ledger";
import { BTN, ICON_BTN, INPUT } from "./ui";
import TransactionForm from "./TransactionForm";
import DealColumns from "./DealColumns";

const CATEGORIES = ["single", "slab", "sealed"] as const;

// A scanned card as a deal line: the catalog card's near-mint price (TCGplayer,
// else TCGdex, else eBay asking), or PokeInvest's raw sold median when the
// card isn't in our catalog. Japanese cards carry "(JP)" like Inventory's.
async function scannedCard(m: CardScanMatch): Promise<NewCard> {
  const c = m.card;
  let market: number | null = null;
  if (c) {
    const detail = await getCardDetail(c).catch(() => null);
    market = detail?.market ?? detail?.asking?.price ?? null;
  }
  const name = c?.name ?? m.name;
  return {
    name: m.lang === "ja" ? `${name} (JP)` : name,
    category: "single",
    market: market ?? m.raw,
    set_name: c?.setName ?? m.set,
    card_number: c?.cardNumber ?? m.number,
    image_url: c?.imageUrl ?? m.image,
  };
}

// Adds a customer's card: search by name, scan the card, or scan a slab's cert
export function CardEntry({ onAdd }: { onAdd: (c: NewCard) => void }) {
  const toast = useToast();
  const [category, setCategory] = useState<NewCard["category"]>("single");
  const [name, setName] = useState("");
  const [market, setMarket] = useState("");
  const [card, setCard] = useState<Partial<NewCard>>({});
  // The scanner stays open for card after card
  const [scanning, setScanning] = useState(false);

  function add(c: NewCard) {
    onAdd(c);
    setName(""); setMarket(""); setCard({});
  }

  async function addScanned(m: CardScanMatch) {
    const c = await scannedCard(m);
    onAdd(c);
    toast.success(c.market != null ? `Added ${c.name} · $${c.market.toFixed(2)}` : `Added ${c.name} (no price: set one in the cart)`);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex gap-2" role="radiogroup" aria-label="Category">
          {CATEGORIES.map((c) => (
            <Chip key={c} selected={category === c} onClick={() => setCategory(c)} className="capitalize">{c}</Chip>
          ))}
        </div>
        <IconButton label="Scan a card" onClick={() => setScanning(true)} className="ml-auto">
          <ScanLine size={20} strokeWidth={1.75} />
        </IconButton>
      </div>
      <Sheet open={scanning} onClose={() => setScanning(false)} title="Scan cards">
        <CardScanner pickLabel="Add" onPick={(m) => { void addScanned(m); }} />
      </Sheet>
      {category === "slab" && (
        <CertLookupWidget label="Scan cert" onResult={(r) => add({
          name: r.name, category: "slab", market: r.market, cert_number: r.certNumber,
          grade: [r.company, r.gradeLabel, r.grade].filter(Boolean).join(" "),
          set_name: r.setName, card_number: r.cardNumber,
        })} />
      )}
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <CardAutocomplete value={name} placeholder="Card name"
            className={`${INPUT} w-full`}
            onChange={(v) => { setName(v); setCard({}); }}
            onSelect={(c) => {
              setName(c.name);
              setCard({ set_name: c.setName, card_number: c.cardNumber, image_url: c.imageUrl });
              if (c.market != null) setMarket(c.market.toFixed(2));
            }} />
        </div>
        {/* A single's price is its near-mint price; the line's condition adjusts it */}
        <input type="number" inputMode="decimal" value={market} onChange={(e) => setMarket(e.target.value)}
          placeholder="Market"
          aria-label={category === "single" ? "Near mint market price" : "Market price"}
          className={`${INPUT} w-24 tabular-nums`} />
        <button type="button" disabled={!name.trim()} className={BTN}
          onClick={() => add({ ...card, name: name.trim(), category, market: market ? Number(market) : null })}>
          Add
        </button>
      </div>
    </div>
  );
}

// A single's condition: a native select under a short chip, so a phone opens
// its own picker. A played condition shows in the accent tint.
function ConditionChip({ value, name, onChange }: {
  value: string | undefined;
  name: string;
  onChange: (c: CardCondition) => void;
}) {
  const current = CONDITIONS.find((c) => c.value === value) ?? CONDITIONS[0];
  return (
    <span className={cn(
      "relative inline-flex h-11 shrink-0 items-center rounded-full px-3 text-sm font-medium transition-colors duration-150 focus-within:ring-1 focus-within:ring-accent",
      current.value === "Near Mint" ? "bg-surface-2 text-muted-foreground" : "bg-accent-tint text-accent",
    )}>
      {current.short}
      <select aria-label={`Condition of ${name}`} value={current.value}
        onChange={(e) => onChange(e.target.value as CardCondition)}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0">
        {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.short} · {c.value}</option>)}
      </select>
    </span>
  );
}

// Cards coming in. Singles get a condition chip; a played one shows its
// adjusted price, with the near-mint price it came from underneath.
export function CardList({ cards, factors, onRemove, onCondition }: {
  cards: NewCard[];
  factors: ConditionFactors;
  onRemove: (i: number) => void;
  onCondition: (i: number, c: CardCondition) => void;
}) {
  if (cards.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-2xl bg-surface">
      {cards.map((c, i) => {
        const price = pricedCard(c, factors).market;
        const played = c.category === "single" && c.market != null ? playedCondition(c.condition) : null;
        return (
          <div key={i} className="flex min-h-14 items-center gap-2 border-b border-border py-1 pl-3 pr-1 text-sm last:border-b-0">
            <div className="min-w-0 flex-1">
              <div className="truncate text-foreground">{c.name}{c.grade ? ` · ${c.grade}` : ""}</div>
              {played && (
                <div className="truncate text-xs text-muted-foreground">
                  {Math.round(factors[played] * 100)}% of NM <MoneyDisplay amount={c.market!} tone="neutral" className="text-muted-foreground" />
                </div>
              )}
            </div>
            {c.category === "single" && (
              <ConditionChip value={c.condition} name={c.name} onChange={(cond) => onCondition(i, cond)} />
            )}
            {price != null
              ? <MoneyDisplay amount={price} tone="neutral" className="shrink-0 text-foreground" />
              : <span className="shrink-0 text-muted-foreground">—</span>}
            <button type="button" aria-label={`Remove ${c.name}`} onClick={() => onRemove(i)} className={ICON_BTN}>
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default function BuyMode({ showId, buyPct, factors, initial = [] }: {
  showId: string | null;
  buyPct: number;
  factors: ConditionFactors;
  initial?: NewCard[];
}) {
  const [cards, setCards] = useState<NewCard[]>(initial);
  // Each card at its price for its condition: the offer and the recorded buy use these
  const priced = cards.map((c) => pricedCard(c, factors));
  const market = priced.reduce((s, c) => s + (c.market ?? 0), 0);

  const form = (
    <TransactionForm mode="buy" ready={cards.length > 0} suggested={round2((market * buyPct) / 100)}
      onDone={() => setCards([])}
      submit={(f) => offlineRecordBuy({
        cards: priced, total: f.amount, paid_by: f.paid_by, show_session_id: showId,
        payment_method: f.payment_method, counterparty: f.counterparty, notes: f.notes,
      })} />
  );

  return (
    <DealColumns form={form}>
      <CardEntry onAdd={(c) => setCards((cs) => [...cs, c])} />
      {cards.length === 0 ? (
        <EmptyState title="No cards added" hint="Search a card above, or pick Slab to scan a cert." />
      ) : (
        <CardList cards={cards} factors={factors}
          onRemove={(i) => setCards((cs) => cs.filter((_, j) => j !== i))}
          onCondition={(i, c) => setCards((cs) => withCondition(cs, i, c))} />
      )}
    </DealColumns>
  );
}
