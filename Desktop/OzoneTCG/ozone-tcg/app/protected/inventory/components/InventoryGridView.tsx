"use client";

import type { SlabPrice, RawCardPrice } from "../InventoryServer";
import { makeSlabPriceKey, parseGrade } from "@/lib/ebay-client";
import { makeRawCardPriceKey, priceForCondition } from "@/lib/justtcg";
import { type FMVResult } from "@/lib/fmv";
import CardImage from "@/components/CardImage";
import type { Item } from "../types";
import { fmt, effectiveCost, getMovement, MovementDot, sealedTypeLabel, slabGradeLabel } from "../utils";

export default function InventoryGridView({
  items,
  displayedSlabs,
  displayedSealed,
  displayedRawCards,
  selectedIds,
  toggleSelect,
  setMobileDetailItem,
  mergedSlabPrices,
  mergedRawCardPrices,
  slabFMVData,
  handleUploadImage,
}: {
  items: Item[];
  displayedSlabs: Item[];
  displayedSealed: Item[];
  displayedRawCards: Item[];
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  setMobileDetailItem: (v: Item | null) => void;
  mergedSlabPrices: Record<string, SlabPrice>;
  mergedRawCardPrices: Record<string, RawCardPrice>;
  slabFMVData: Record<string, FMVResult>;
  handleUploadImage: (it: Item, file: File) => Promise<void>;
}) {
  return (
    <div className="p-3 space-y-4">
      {/* Slabs grid */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400">Slabs</span>
          <span className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 px-1.5 py-0.5 rounded-full font-medium">{displayedSlabs.length}</span>
        </div>
        {displayedSlabs.length === 0 ? (
          <div className="py-6 text-center text-xs opacity-40">
            {items.some((i) => i.category === "slab" && i.status !== "grading") ? "No slabs match your filters" : "No slabs yet"}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
            {displayedSlabs.map((it) => {
              const isSelected = selectedIds.has(it.id);
              const parsed = it.grade ? parseGrade(it.grade) : null;
              const slabKey = parsed ? makeSlabPriceKey(it.name, it.set_name, it.card_number, parsed.company, parsed.grade) : null;
              const sp = slabKey ? mergedSlabPrices[slabKey] : null;
              const fmvGrid = slabFMVData[it.id]?.fmv ?? it.market;
              const ecSlabGrid = effectiveCost(it);
              const marketColor = fmvGrid != null && ecSlabGrid != null
                ? fmvGrid >= ecSlabGrid ? "text-green-600" : "text-red-500"
                : "opacity-60";
              const movePct = getMovement(fmvGrid, it.acquired_market_price);
              const slabLabel = slabGradeLabel(it.grade);
              const companyKey = slabLabel?.companyKey ?? "other";
              return (
                <div
                  key={it.id}
                  className={`relative grid-tile slab-tile overflow-hidden flex flex-col cursor-pointer ${isSelected ? "ring-2 ring-green-500" : ""}`}
                  data-company={companyKey}
                  onClick={() => toggleSelect(it.id)}
                >
                  <button className="md:hidden absolute inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMobileDetailItem(it); }} />
                  {/* Slab case frame with grade label */}
                  <div className="slab-case m-1.5">
                    <div className={`slab-label slab-label-${companyKey}`}>
                      <span className="slab-label-text">{slabLabel?.labelText ?? "GRADED"}</span>
                      <span className="slab-label-num">{slabLabel?.gradeNum ?? "—"}</span>
                    </div>
                    <div className="slab-card-area">
                      <CardImage src={it.image_url} name={it.name} setName={it.set_name} cardNumber={it.card_number} onUpload={(file) => handleUploadImage(it, file)} />
                    </div>
                    <div className="slab-bottom">
                      {it.card_number && <span className="slab-cert">{it.card_number}</span>}
                    </div>
                  </div>
                  <div className="px-2 pb-1.5 flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-1">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(it.id)} onClick={(e) => e.stopPropagation()} className="w-3.5 h-3.5 accent-green-600 flex-shrink-0" />
                      <div className="flex items-center gap-1">
                        <MovementDot pct={movePct} />
                      </div>
                    </div>
                    <div className="text-xs font-semibold leading-tight truncate">{it.name}</div>
                    <div className="hidden md:block text-xs">
                      <span className="opacity-50">{ecSlabGrid != null ? fmt(ecSlabGrid) : "—"} → </span>
                      <span className={`font-medium ${marketColor}`}>{fmt(fmvGrid)}</span>
                    </div>
                    <div className="md:hidden text-xs font-semibold">
                      <span className={marketColor}>{fmt(fmvGrid)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Sealed grid */}
      {displayedSealed.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">Sealed</span>
            <span className="text-xs bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 px-1.5 py-0.5 rounded-full font-medium">{displayedSealed.length}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
            {displayedSealed.map((it) => {
              const isSelected = selectedIds.has(it.id);
              const price = it.market;
              const ecSealedGrid = effectiveCost(it);
              const marketColor = price != null && ecSealedGrid != null
                ? price >= ecSealedGrid ? "text-green-600" : "text-red-500"
                : "opacity-60";
              return (
                <div
                  key={it.id}
                  className={`relative grid-tile overflow-hidden flex flex-col cursor-pointer ${isSelected ? "ring-2 ring-green-500" : ""}`}
                  onClick={() => toggleSelect(it.id)}
                >
                  <button className="md:hidden absolute inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMobileDetailItem(it); }} />
                  <CardImage src={it.image_url} name={it.name} setName={it.set_name} cardNumber={null} onUpload={(file) => handleUploadImage(it, file)} />
                  <div className="px-2 py-1.5 flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-1">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(it.id)} onClick={(e) => e.stopPropagation()} className="w-3.5 h-3.5 accent-green-600 flex-shrink-0" />
                      <span className="text-[9px] px-1 py-0.5 rounded bg-teal-500/15 text-teal-400 font-medium truncate">{sealedTypeLabel(it.product_type)}</span>
                    </div>
                    <div className="text-xs font-semibold leading-tight line-clamp-2">{it.name}</div>
                    <div className="hidden md:block text-xs">
                      <span className="opacity-50">{ecSealedGrid != null ? fmt(ecSealedGrid) : "—"} → </span>
                      <span className={`font-medium ${marketColor}`}>{fmt(price)}</span>
                    </div>
                    <div className="md:hidden text-xs font-semibold">
                      <span className={marketColor}>{fmt(price)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Raw Cards grid */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Singles</span>
          <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-1.5 py-0.5 rounded-full font-medium">{displayedRawCards.length}</span>
        </div>
        {displayedRawCards.length === 0 ? (
          <div className="py-6 text-center text-xs opacity-40">
            {items.some((i) => i.category === "single" && i.status !== "grading") ? "No singles match your filters" : "No singles yet"}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
            {displayedRawCards.map((it) => {
              const isSelected = selectedIds.has(it.id);
              const rawKey = makeRawCardPriceKey(it.name, it.set_name, it.card_number);
              const rcp = mergedRawCardPrices[rawKey];
              const condPrice = rcp
                ? priceForCondition({ nm: rcp.nm_price, lp: rcp.lp_price, mp: rcp.mp_price, hp: rcp.hp_price, dmg: rcp.dmg_price }, it.condition)
                : null;
              const displayPrice = condPrice ?? it.market;
              const ecRawGrid = effectiveCost(it);
              const marketColor = displayPrice != null && ecRawGrid != null
                ? displayPrice >= ecRawGrid ? "text-green-600" : "text-red-500"
                : "opacity-60";
              const movePct = getMovement(displayPrice, it.acquired_market_price);
              return (
                <div
                  key={it.id}
                  className={`relative grid-tile overflow-hidden flex flex-col cursor-pointer ${isSelected ? "ring-2 ring-green-500" : ""}`}
                  onClick={() => toggleSelect(it.id)}
                >
                  <button className="md:hidden absolute inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMobileDetailItem(it); }} />
                  <CardImage src={it.image_url} name={it.name} setName={it.set_name} cardNumber={it.card_number} onUpload={(file) => handleUploadImage(it, file)} />
                  <div className="px-2 py-1.5 flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-1">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(it.id)} onClick={(e) => e.stopPropagation()} className="w-3.5 h-3.5 accent-green-600 flex-shrink-0" />
                      <MovementDot pct={movePct} />
                    </div>
                    <div className="text-xs font-semibold leading-tight truncate">{it.name}</div>
                    <div className="hidden md:block text-xs">
                      <span className="opacity-50">{ecRawGrid != null ? fmt(ecRawGrid) : "—"} → </span>
                      <span className={`font-medium ${marketColor}`}>{fmt(displayPrice)}</span>
                    </div>
                    <div className="md:hidden text-xs font-semibold">
                      <span className={marketColor}>{fmt(displayPrice)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
