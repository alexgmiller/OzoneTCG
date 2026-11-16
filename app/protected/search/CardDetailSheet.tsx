"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, ExternalLink, Plus } from "lucide-react";
import { EmptyState, MoneyDisplay, Sheet, Skeleton, TabStrip } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addToInventoryHref } from "@/app/protected/inventory/addPrefill";
import { getCardDetail, getCardPrice, type CardDetail, type StockMatch } from "./actions";
import type { EbayAsking } from "@/lib/ebay";
import type { AskingEstimate } from "@/lib/ebayAsking";
import type { CatalogCard } from "./catalog";

// ── Card detail ──
// Header: art beside the name, number, set and rarity. Actions: Add to
// inventory (opens Inventory's add sheet filled in with this card and its
// market price) and, with stock, Sell in POS. Then RAW | GRADED:
//   RAW     TCGplayer market price, then low and market per printing (Holofoil,
//           Reverse Holofoil…) with a link to the listing; cards TCGCSV doesn't
//           match fall back to TCGdex (Retry on a slow lookup). With no sales
//           price anywhere, plan C: the low end of current eBay listings,
//           labelled as asking prices (lib/ebayAsking.ts). Your raw copies.
//   GRADED  your graded copies; graded market prices need a graded data source

type Tab = "raw" | "graded";
const TABS = [{ value: "raw", label: "Raw" }, { value: "graded", label: "Graded" }] as const;

// Plan C by condition: near mint (listings that state no condition count
// here) and played, or one row for all when neither has enough listings
function AskingRows({ asking }: { asking: EbayAsking }) {
  const rows = [
    asking.nm && { label: "Near mint", e: asking.nm },
    asking.played && { label: "Played", e: asking.played },
  ].filter((r): r is { label: string; e: AskingEstimate } => !!r);
  if (!rows.length && asking.all) rows.push({ label: "All conditions", e: asking.all });
  return (
    <ul className="overflow-hidden rounded-2xl bg-surface-2" aria-label="eBay asking prices by condition">
      {rows.map((r) => (
        <li key={r.label} className="flex h-11 items-center gap-3 border-b border-border px-3 text-sm last:border-b-0">
          <span className="min-w-0 flex-1 truncate text-foreground">{r.label}</span>
          <span className="text-xs tabular-nums text-muted-foreground">{r.e.count} listings</span>
          <MoneyDisplay amount={r.e.price} tone="neutral" className="w-20 text-right font-semibold text-foreground" />
        </li>
      ))}
    </ul>
  );
}

function CopyList({ copies, label }: { copies: StockMatch[]; label: (s: StockMatch) => string }) {
  return (
    <ul className="overflow-hidden rounded-2xl bg-surface-2">
      {copies.map((s) => (
        <li key={s.id} className="border-b border-border last:border-b-0">
          <Link href={`/protected/inventory?focus=${s.id}`}
            className="flex h-11 items-center gap-3 px-3 text-sm transition-colors duration-150 hover:bg-surface">
            <span className="flex-1 font-mono text-xs text-muted-foreground">{label(s)}</span>
            {s.market != null && <MoneyDisplay amount={s.market} tone="neutral" className="font-semibold text-foreground" />}
            <ChevronRight size={16} className="text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function CardDetailSheet({ card, onClose }: { card: CatalogCard | null; onClose: () => void }) {
  const [detail, setDetail] = useState<CardDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [tab, setTab] = useState<Tab>("raw");
  const latest = useRef(0);

  // Re-ask TCGdex for just the price after a timeout; stock is already loaded
  async function retryPrice() {
    if (!card) return;
    const id = latest.current;
    setRetrying(true);
    const price = await getCardPrice(card.id).catch(() => ({ market: null, failed: true }));
    if (id !== latest.current) return;
    setDetail((d) => (d ? { ...d, market: price.market, priceFailed: price.failed } : d));
    setRetrying(false);
  }

  useEffect(() => {
    if (!card) return;
    const id = ++latest.current;
    setDetail(null);
    setFailed(false);
    setTab("raw");
    getCardDetail(card)
      .then((d) => {
        if (id !== latest.current) return;
        setDetail(d);
        // Open on Graded when that's all you hold of this card
        if (d.inStock.length && d.inStock.every((s) => s.category === "slab")) setTab("graded");
      })
      .catch(() => { if (id === latest.current) setFailed(true); });
  }, [card]);

  const raw = detail?.inStock.filter((s) => s.category !== "slab") ?? [];
  const graded = detail?.inStock.filter((s) => s.category === "slab") ?? [];

  return (
    <Sheet open={!!card} onClose={onClose} title={card?.name ?? ""}>
      {card && (
        <div className="space-y-4">
          {/* ── Header: art + identity ── */}
          <div className="flex items-start gap-4">
            {card.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={card.imageUrl} alt={card.name}
                className="aspect-[63/88] w-32 shrink-0 rounded-xl bg-surface-2 object-contain sm:w-40" />
            ) : (
              <div className="flex aspect-[63/88] w-32 shrink-0 items-center justify-center rounded-xl bg-surface-2 p-3 text-center text-sm text-muted-foreground sm:w-40">
                {card.name}
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-2 pt-1">
              <div className="section-label">Pokémon · {card.lang === "ja" ? "Japanese" : "English"}</div>
              <div className="text-xl font-bold leading-tight text-foreground">{card.name}</div>
              <dl className="space-y-1 text-sm">
                {card.cardNumber && (
                  <div className="flex gap-2"><dt className="text-muted-foreground">Number</dt><dd className="font-mono text-foreground">{card.cardNumber}</dd></div>
                )}
                <div className="flex gap-2"><dt className="text-muted-foreground">Set</dt><dd className="min-w-0 truncate text-foreground">{card.setName}</dd></div>
                {detail?.quote?.rarity && (
                  <div className="flex gap-2"><dt className="text-muted-foreground">Rarity</dt><dd className="min-w-0 truncate text-foreground">{detail.quote.rarity}</dd></div>
                )}
              </dl>
            </div>
          </div>

          {/* ── Actions ── */}
          <div className="flex gap-2">
            <Link
              href={addToInventoryHref(
                card.lang === "ja"
                  // Inventory marks Japanese cards "(JP)" (lib/cardArtMatch → cardLang);
                  // the TCGdex card id field doesn't apply
                  ? { name: `${card.name} (JP)`, setName: card.setName, cardNumber: card.cardNumber,
                    imageUrl: card.imageUrl, cardId: null, market: detail?.market ?? detail?.asking?.price ?? null }
                  : { name: card.name, setName: card.setName, cardNumber: card.cardNumber,
                    imageUrl: card.imageUrl, cardId: card.id, market: detail?.market ?? detail?.asking?.price ?? null },
              )}
              className={cn(buttonVariants(), "flex-1")}
            >
              <Plus aria-hidden /> Add to inventory
            </Link>
            {detail && detail.inStock.length > 0 && (
              <Link href={`/protected/pos?mode=sell&items=${detail.inStock[0].id}`}
                className={cn(buttonVariants({ variant: "outline" }), "flex-1")}>
                Sell in POS
              </Link>
            )}
          </div>

          {/* ── Raw | Graded ── */}
          <TabStrip value={tab} onChange={setTab} tabs={TABS} aria-label="Raw or graded" />

          {tab === "raw" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="section-label">{detail && detail.market == null && detail.asking ? "eBay asking price" : "TCGplayer market"}</div>
                  {detail?.quote?.url && (
                    <a href={detail.quote.url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex h-11 items-center gap-1 text-xs font-medium text-accent transition-colors duration-150 hover:text-foreground">
                      View on TCGplayer <ExternalLink size={12} aria-hidden />
                    </a>
                  )}
                </div>
                {detail && !retrying ? (
                  detail.market != null ? (
                    <MoneyDisplay amount={detail.market} tone="neutral" className="text-2xl font-bold text-foreground" />
                  ) : detail.priceFailed ? (
                    <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                      Price didn&apos;t load
                      <button type="button" onClick={retryPrice}
                        className="h-11 rounded-full px-3 font-medium text-accent transition-colors duration-150 hover:bg-accent-tint">
                        Retry
                      </button>
                    </div>
                  ) : (
                    detail.asking ? (
                      <div className="space-y-2">
                        <MoneyDisplay amount={detail.asking.price} tone="neutral" className="text-2xl font-bold text-foreground" />
                        <AskingRows asking={detail.asking} />
                        <p className="text-xs text-muted-foreground">
                          No sales found, so this is the low end of current eBay asking prices, not sales.{" "}
                          <a href={detail.asking.searchUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:text-foreground">
                            See listings
                          </a>
                        </p>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">No sales or listings found</div>
                    )
                  )
                ) : failed ? (
                  <div className="text-sm text-muted-foreground">Couldn&apos;t load</div>
                ) : (
                  <Skeleton className="h-8 w-28" />
                )}
                {!!detail?.quote?.printings.length && (
                  <ul className="overflow-hidden rounded-2xl bg-surface-2" aria-label="Prices by printing">
                    {detail.quote.printings.map((p) => (
                      <li key={p.name} className="flex h-11 items-center gap-3 border-b border-border px-3 text-sm last:border-b-0">
                        <span className="min-w-0 flex-1 truncate text-foreground">{p.name}</span>
                        {p.low != null && (
                          <span className="text-xs text-muted-foreground">
                            Low <MoneyDisplay amount={p.low} tone="neutral" className="text-muted-foreground" />
                          </span>
                        )}
                        {p.market != null ? (
                          <MoneyDisplay amount={p.market} tone="neutral" className="w-20 text-right font-semibold text-foreground" />
                        ) : (
                          <span className="w-20 text-right text-muted-foreground">No sales</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-2">
                <div className="section-label">Your raw copies</div>
                {!detail ? (
                  failed ? null : <Skeleton className="h-11 w-full rounded-xl" />
                ) : raw.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None in stock.</p>
                ) : (
                  <CopyList copies={raw} label={(s) => (s.category === "sealed" ? "Sealed" : s.condition ?? "Raw")} />
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="section-label">Your graded copies</div>
              {!detail ? (
                failed ? null : <Skeleton className="h-11 w-full rounded-xl" />
              ) : graded.length === 0 ? (
                <EmptyState title="No graded copies in stock" hint="Graded market prices by grade need a graded price source." />
              ) : (
                <CopyList copies={graded} label={(s) => s.grade ?? "Graded"} />
              )}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
