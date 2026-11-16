import Link from "next/link";
import { CardTile, EmptyState } from "@/components/ui";
import { tileDelta, tileMeta, type StockItem } from "./home";

// ── Most valuable ──
// Horizontal rail of the top in-stock items as 144px CardTiles on a phone; a
// 5-column grid on desktop, where a hidden-scrollbar rail is hard to scroll
// with a mouse. Tiles link
// into Inventory focused on the item; the Inventory sheet picks that up.

export default function MostValuable({ items }: { items: StockItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing priced yet"
        hint="Items with a market price show here, most valuable first."
      />
    );
  }

  return (
    <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0 lg:grid lg:grid-cols-5 lg:overflow-visible">
      {items.map((it) => (
        <Link key={it.id} href={`/protected/inventory?focus=${it.id}`} className="shrink-0">
          <CardTile
            className="w-36 lg:w-full"
            name={it.name}
            setNumber={it.card_number}
            meta={tileMeta(it)}
            price={it.market}
            delta={tileDelta(it)}
            imageUrl={it.image_url}
            consigned={!!it.consigner_id}
          />
        </Link>
      ))}
    </div>
  );
}
