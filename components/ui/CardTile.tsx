"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// ── CardTile ──
// Card art fills the tile (63:88). The bottom ~30% is a frosted overlay that
// stays dark in both themes because it sits on art, not on the page:
//   line 1  name (truncated) + set number, muted
//   line 2  variant / grade in muted mono
//   line 3  price, bold, with ▲/▼ for FMV vs cost
// No image → a surface-2 tile with the name centred.
export type CardTileDelta = "up" | "down" | null;

type Props = {
  name: string;
  setNumber?: string | null;
  meta?: string | null;
  price?: number | null;
  delta?: CardTileDelta;
  imageUrl?: string | null;
  consigned?: boolean;
  selected?: boolean;
  width?: number;
  onClick?: () => void;
  className?: string;
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function CardTile({
  name, setNumber, meta, price, delta = null, imageUrl, consigned, selected, width, onClick, className,
}: Props) {
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={selected}
      style={width ? { width } : undefined}
      className={cn(
        "group relative block aspect-[63/88] w-full shrink-0 overflow-hidden rounded-2xl bg-surface-2 text-left transition-transform duration-150",
        onClick && "active:scale-[0.98]",
        selected && "ring-2 ring-accent ring-offset-2 ring-offset-bg",
        className,
      )}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center p-3">
          <span className="line-clamp-3 text-center text-sm font-medium text-muted-foreground">{name}</span>
        </div>
      )}

      {consigned && (
        <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
          Consigned
        </span>
      )}
      {selected && (
        <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-bg">
          <Check size={14} strokeWidth={3} />
        </span>
      )}

      {imageUrl && (
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-black/45 px-2.5 pb-2.5 pt-3 text-white backdrop-blur-md">
          <div className="flex items-baseline gap-1.5">
            <span className="truncate text-sm font-semibold">{name}</span>
            {setNumber && <span className="shrink-0 text-xs text-white/60">{setNumber}</span>}
          </div>
          {meta && <span className="truncate font-mono text-xs text-white/60">{meta}</span>}
          {price != null && (
            <span className="flex items-center gap-1 text-sm font-bold tabular-nums">
              {money.format(price)}
              {delta === "up"   && <span className="text-xs text-up">▲</span>}
              {delta === "down" && <span className="text-xs text-down">▼</span>}
            </span>
          )}
        </div>
      )}
    </Tag>
  );
}
