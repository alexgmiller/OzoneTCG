import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ── HeroValue ──
// Large money figure (48px bold, tabular). Its label sits above as a muted
// dropdown trigger when onLabelClick is given. Inventory uses align="left"
// with a smaller currency sign.
type Props = {
  amount: number;
  label?: string;
  onLabelClick?: () => void;
  align?: "center" | "left";
  size?: "hero" | "lg";
  className?: string;
};

const fmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export function HeroValue({ amount, label, onLabelClick, align = "center", size = "hero", className }: Props) {
  const negative = amount < 0;
  const whole = fmt.format(Math.abs(Math.round(amount)));

  return (
    <div className={cn("flex flex-col", align === "center" ? "items-center" : "items-start", className)}>
      {label && (
        onLabelClick ? (
          <button
            type="button"
            onClick={onLabelClick}
            className="inline-flex h-8 items-center gap-1 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            {label}
            <ChevronDown size={14} />
          </button>
        ) : (
          <span className="section-label">{label}</span>
        )
      )}
      <div
        className={cn(
          "flex items-baseline font-bold tabular-nums leading-none text-foreground",
          size === "hero" ? "text-hero" : "text-2xl",
        )}
        aria-label={`${negative ? "-" : ""}$${whole}`}
      >
        {negative && <span>-</span>}
        <span className={cn("mr-0.5", size === "hero" ? "text-2xl" : "text-lg")}>$</span>
        <span>{whole}</span>
      </div>
    </div>
  );
}
