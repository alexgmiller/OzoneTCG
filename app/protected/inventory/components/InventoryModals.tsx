"use client";

import { Modal, MoneyDisplay } from "@/components/ui";
import type { ConsignerOption, Item, ItemForm } from "../types";
import { toNum, fmt, fieldClass, btnOutline, btnPrimary, btnDanger } from "../utils";
import ItemFormFields from "./ItemFormFields";

// ── Edit modal ──
export function EditItemModal({
  editingItem,
  editForm,
  setEditForm,
  consigners,
  busy,
  closeEdit,
  setEditImagePickerOpen,
  handleGradeItem,
  deleteConfirm,
  setDeleteConfirm,
  handleDeleteItem,
  onSaveEdit,
}: {
  editingItem: Item;
  editForm: ItemForm;
  setEditForm: (f: ItemForm) => void;
  consigners: ConsignerOption[];
  busy: boolean;
  closeEdit: () => void;
  setEditImagePickerOpen: (v: boolean) => void;
  handleGradeItem: () => void;
  deleteConfirm: boolean;
  setDeleteConfirm: (v: boolean) => void;
  handleDeleteItem: () => void;
  onSaveEdit: () => void;
}) {
  return (
    <Modal open onClose={closeEdit} title="Edit item" className="max-h-full overflow-y-auto">
      <div className="space-y-4">
        <ItemFormFields form={editForm} setForm={setEditForm} consigners={consigners} />
        <button type="button" className={`${btnOutline} w-full`} onClick={() => setEditImagePickerOpen(true)} disabled={busy}>
          Find image
        </button>
        {editForm.category === "single" && editingItem?.status === "inventory" && (
          <button type="button" className={`${btnOutline} w-full`} onClick={handleGradeItem} disabled={busy}>
            Send to grading
          </button>
        )}
        {deleteConfirm ? (
          <div className="flex items-center gap-2 rounded-xl border border-negative-border bg-negative-soft p-3">
            <span className="flex-1 text-sm text-negative">Delete this item?</span>
            <button className={btnDanger} onClick={handleDeleteItem} disabled={busy}>Delete</button>
            <button className={btnOutline} onClick={() => setDeleteConfirm(false)}>Cancel</button>
          </div>
        ) : (
          <button type="button" className="h-11 w-full text-sm font-medium text-negative" onClick={() => setDeleteConfirm(true)} disabled={busy}>
            Delete item
          </button>
        )}
        <div className="flex gap-2">
          <button className={`${btnPrimary} flex-1`} onClick={onSaveEdit} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          <button className={btnOutline} onClick={closeEdit} disabled={busy}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Mass edit modal ──
export function MassEditModal({
  selectedIds,
  setMassEditOpen,
  massOwner,
  setMassOwner,
  massStatus,
  setMassStatus,
  massCategory,
  setMassCategory,
  consigners,
  busy,
  onMassEdit,
}: {
  selectedIds: Set<string>;
  setMassEditOpen: (v: boolean) => void;
  massOwner: string;
  setMassOwner: (v: string) => void;
  massStatus: string;
  setMassStatus: (v: string) => void;
  massCategory: string;
  setMassCategory: (v: string) => void;
  consigners: ConsignerOption[];
  busy: boolean;
  onMassEdit: () => void;
}) {
  const close = () => setMassEditOpen(false);
  return (
    <Modal open onClose={close} title={`Edit ${selectedIds.size} items`}>
      <div className="space-y-4">
        <div className="text-xs text-muted-foreground">Leave a field as &quot;no change&quot; to keep existing values.</div>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Owner</span>
            <select className={fieldClass} value={massOwner} onChange={(e) => setMassOwner(e.target.value)}>
              <option value="">— no change —</option>
              <option value="shared">Shared</option>
              <option value="alex">Alex</option>
              <option value="mila">Mila</option>
              {consigners.length > 0 && (
                <optgroup label="Consigners">
                  {consigners.map((c) => (
                    <option key={c.id} value={`consigner:${c.id}`}>{c.name} ({Math.round(c.rate * 100)}%)</option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Status</span>
            <select className={fieldClass} value={massStatus} onChange={(e) => setMassStatus(e.target.value)}>
              <option value="">— no change —</option>
              <option value="inventory">Inventory</option>
              <option value="grading">Grading</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Type</span>
            <select className={fieldClass} value={massCategory} onChange={(e) => setMassCategory(e.target.value)}>
              <option value="">— no change —</option>
              <option value="single">Single</option>
              <option value="slab">Slab</option>
              <option value="sealed">Sealed</option>
            </select>
          </label>
        </div>
        <div className="flex gap-2">
          <button className={`${btnPrimary} flex-1`} onClick={onMassEdit} disabled={busy || (!massOwner && !massStatus && !massCategory)}>
            {busy ? "Saving…" : `Apply to ${selectedIds.size} items`}
          </button>
          <button className={btnOutline} onClick={close} disabled={busy}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Sell modal ──
export function SellModal({
  selectedItems,
  consignerMap,
  manualPrices,
  getCardPrice,
  salePrice,
  salePriceNum,
  totalMarket,
  setSellOpen,
  resetCardPrice,
  updateCardPrice,
  setSalePrice,
  setManualPrices,
  busy,
  onConfirmSale,
}: {
  selectedItems: Item[];
  consignerMap: Map<string, ConsignerOption>;
  manualPrices: Record<string, string>;
  getCardPrice: (it: Item) => number;
  salePrice: string;
  salePriceNum: number;
  totalMarket: number;
  setSellOpen: (v: boolean) => void;
  resetCardPrice: (id: string) => void;
  updateCardPrice: (id: string, value: string) => void;
  setSalePrice: (v: string) => void;
  setManualPrices: (v: Record<string, string>) => void;
  busy: boolean;
  onConfirmSale: () => void;
}) {
  const close = () => setSellOpen(false);
  const offPct = totalMarket > 0 ? Math.round((salePriceNum / totalMarket - 1) * 100) : null;
  return (
    <Modal open onClose={close} title={`Sell ${selectedItems.length} item${selectedItems.length !== 1 ? "s" : ""}`} className="max-h-full overflow-y-auto">
      <div className="space-y-4">
        {/* ── Per-item prices ── */}
        <div className="overflow-hidden rounded-xl border border-border">
          {selectedItems.map((it, i) => {
            const consigner = it.consigner_id ? consignerMap.get(it.consigner_id) : null;
            const isManual = manualPrices[it.id] !== undefined;
            const cardPrice = getCardPrice(it);
            const inputVal = isManual ? manualPrices[it.id] : (salePriceNum > 0 ? cardPrice.toFixed(2) : "");
            const payout = consigner ? cardPrice * consigner.rate : null;
            return (
              <div key={it.id} className={`px-3 py-2 ${i > 0 ? "border-t border-border" : ""}`}>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{it.name}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">{it.category} · Market {fmt(it.market)}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {isManual ? (
                      <button type="button" className="flex h-11 w-8 items-center justify-center text-muted-foreground hover:text-foreground" onClick={() => resetCardPrice(it.id)} title="Reset to auto">↺</button>
                    ) : (
                      <span className="w-8 text-center text-xs text-muted-foreground">auto</span>
                    )}
                    <div className={`flex h-11 items-center rounded-lg border bg-background ${isManual ? "border-accent-primary" : "border-border"}`}>
                      <span className="pl-2 text-xs text-muted-foreground">$</span>
                      <input
                        className={`w-20 bg-transparent py-1 pr-2 text-right text-sm tabular-nums outline-none ${isManual ? "text-foreground" : "text-muted-foreground"}`}
                        value={inputVal}
                        placeholder="0.00"
                        inputMode="decimal"
                        onChange={(e) => updateCardPrice(it.id, e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                {consigner && cardPrice > 0 && (
                  <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    {consigner.name} gets {fmt(payout ?? 0)} · you keep {fmt(cardPrice - (payout ?? 0))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Market warning ── */}
        {salePriceNum > 0 && offPct != null && (offPct <= -30 || offPct >= 50) && (
          <div className="text-xs text-warning-strong tabular-nums">
            Total is {Math.abs(offPct)}% {offPct < 0 ? "below" : "above"} market value
          </div>
        )}

        {/* ── Total ── */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">Total sale price</label>
            {totalMarket > 0 && (
              <button type="button" className="h-11 text-xs font-medium text-accent-primary" onClick={() => { setSalePrice(totalMarket.toFixed(2)); setManualPrices({}); }}>
                Use market <MoneyDisplay amount={totalMarket} tone="neutral" />
              </button>
            )}
          </div>
          <input className={`${fieldClass} tabular-nums`} placeholder="0.00" inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} autoFocus />
          <div className="mt-1 text-xs text-muted-foreground">
            {Object.keys(manualPrices).length > 0 ? "Manual prices locked · auto items fill the rest" : "Split proportionally by market value"}
          </div>
        </div>

        <div className="flex gap-2">
          <button className={`${btnPrimary} flex-1`} onClick={onConfirmSale} disabled={busy || salePriceNum <= 0}>
            {busy ? "Saving…" : "Confirm sale"}
          </button>
          <button className={btnOutline} onClick={close} disabled={busy}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Bulk cost modal ──
export function BulkCostModal({
  selectedIds,
  setBulkCostOpen,
  bulkCostVal,
  setBulkCostVal,
  bulkCostSplit,
  setBulkCostSplit,
  busy,
  onBulkSetCost,
}: {
  selectedIds: Set<string>;
  setBulkCostOpen: (v: boolean) => void;
  bulkCostVal: string;
  setBulkCostVal: (v: string) => void;
  bulkCostSplit: boolean;
  setBulkCostSplit: (v: boolean) => void;
  busy: boolean;
  onBulkSetCost: () => void;
}) {
  const close = () => setBulkCostOpen(false);
  const n = toNum(bulkCostVal);
  return (
    <Modal open onClose={close} title={`Set cost — ${selectedIds.size} item${selectedIds.size !== 1 ? "s" : ""}`}>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">{bulkCostSplit ? "Total paid (split evenly)" : "Cost per item"}</span>
          <input className={`${fieldClass} tabular-nums`} placeholder="0.00" inputMode="decimal" value={bulkCostVal} onChange={(e) => setBulkCostVal(e.target.value)} autoFocus />
          {bulkCostSplit && n != null && (
            <span className="mt-1 block text-xs text-muted-foreground tabular-nums">= {fmt(Math.round((n / selectedIds.size) * 100) / 100)} per item</span>
          )}
        </label>
        <label className="flex min-h-11 cursor-pointer select-none items-center gap-3 text-sm text-foreground">
          <input type="checkbox" checked={bulkCostSplit} onChange={(e) => setBulkCostSplit(e.target.checked)} className="h-5 w-5 accent-accent-primary" />
          Split total evenly across {selectedIds.size} items
        </label>
        <div className="flex gap-2">
          <button className={`${btnPrimary} flex-1`} onClick={onBulkSetCost} disabled={busy || !bulkCostVal || n === null}>
            {busy ? "Saving…" : `Apply to ${selectedIds.size} items`}
          </button>
          <button className={btnOutline} onClick={close} disabled={busy}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}
