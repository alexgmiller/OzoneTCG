"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { MoneyDisplay, Sheet, Skeleton } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCardDetail, getCardPrice, type CardDetail, type StockMatch } from "./actions";
import type { CatalogCard } from "./catalog";

// ── Card detail ──
// Big art, set and number, TCGplayer market price, and the copies you have in
// stock (each opens in Inventory). With stock, "Sell in POS" preloads the
// first copy into a Sell.

function stockLabel(s: StockMatch) {
  if (s.category === "slab") return s.grade ?? "Graded";
  if (s.category === "sealed") return "Sealed";
  return s.condition ?? "Raw";
}

export default function CardDetailSheet({ card, onClose }: { card: CatalogCard | null; onClose: () => void }) {
  const [detail, setDetail] = useState<CardDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
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
    getCardDetail(card)
      .then((d) => { if (id === latest.current) setDetail(d); })
      .catch(() => { if (id === latest.current) setFailed(true); });
  }, [card]);

  return (
    <Sheet open={!!card} onClose={onClose} title={card?.name ?? ""}>
      {card && (
        <div className="space-y-4 md:flex md:items-start md:gap-5 md:space-y-0">
          {card.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.imageUrl} alt={card.name}
              className="mx-auto aspect-[63/88] w-48 shrink-0 rounded-2xl bg-surface-2 object-contain md:mx-0 md:w-56" />
          ) : (
            <div className="mx-auto flex aspect-[63/88] w-48 shrink-0 items-center justify-center rounded-2xl bg-surface-2 p-3 text-center text-sm text-muted-foreground md:mx-0 md:w-56">
              {card.name}
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-4">
            <div className="font-mono text-xs text-muted-foreground">
              {[card.setName, card.cardNumber && `#${card.cardNumber}`].filter(Boolean).join(" · ")}
            </div>

            {/* ── Price ── */}
            <div className="rounded-2xl bg-surface-2 p-3">
              <div className="section-label">TCGplayer market</div>
              {detail && !retrying ? (
                detail.market != null ? (
                  <MoneyDisplay amount={detail.market} tone="neutral" className="text-xl font-bold text-foreground" />
                ) : detail.priceFailed ? (
                  <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                    Price didn&apos;t load
                    <button type="button" onClick={retryPrice}
                      className="h-11 rounded-full px-3 font-medium text-accent transition-colors duration-150 hover:bg-accent-tint">
                      Retry
                    </button>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No price listed</div>
                )
              ) : failed ? (
                <div className="text-sm text-muted-foreground">Couldn&apos;t load</div>
              ) : (
                <Skeleton className="mt-1 h-7 w-24" />
              )}
            </div>

            {/* ── In stock ── */}
            <div className="space-y-2">
              <div className="section-label">In your inventory</div>
              {!detail ? (
                failed ? null : <Skeleton className="h-11 w-full rounded-xl" />
              ) : detail.inStock.length === 0 ? (
                <p className="text-sm text-muted-foreground">None in stock.</p>
              ) : (
                <ul className="overflow-hidden rounded-2xl bg-surface-2">
                  {detail.inStock.map((s) => (
                    <li key={s.id} className="border-b border-border last:border-b-0">
                      <Link href={`/protected/inventory?focus=${s.id}`}
                        className="flex h-11 items-center gap-3 px-3 text-sm transition-colors duration-150 hover:bg-surface">
                        <span className="flex-1 font-mono text-xs text-muted-foreground">{stockLabel(s)}</span>
                        {s.market != null && <MoneyDisplay amount={s.market} tone="neutral" className="font-semibold text-foreground" />}
                        <ChevronRight size={16} className="text-muted-foreground" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {detail && detail.inStock.length > 0 && (
              <Link href={`/protected/pos?mode=sell&items=${detail.inStock[0].id}`}
                className={cn(buttonVariants(), "w-full")}>
                Sell in POS
              </Link>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
