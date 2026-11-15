import { cn } from "@/lib/utils";

// ── Page ──
// Page container. Two widths only: narrow for forms and flows (Home, POS,
// Shows, Settings…), wide for tables and grids (Inventory, Finance, Transactions).
export function Page({
  width = "narrow",
  className,
  children,
}: {
  width?: "narrow" | "wide";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full space-y-5 py-4", width === "wide" ? "max-w-6xl" : "max-w-2xl", className)}>
      {children}
    </div>
  );
}
