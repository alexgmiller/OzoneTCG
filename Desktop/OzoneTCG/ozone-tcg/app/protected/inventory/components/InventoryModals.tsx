"use client";

import type { ConsignerOption, Item, ItemForm } from "../types";
import { toNum, fmt } from "../utils";
import ItemFormFields from "./ItemFormFields";

/* Edit modal */
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
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center modal-backdrop p-4" onClick={(e) => { if (e.target === e.currentTarget) closeEdit(); }}>
      <div className="modal-panel w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="modal-title">Edit item</div>
          <button className="modal-close-btn" onClick={closeEdit}>✕</button>
        </div>
        <ItemFormFields form={editForm} setForm={setEditForm} consigners={consigners} />
        <button
          type="button"
          className="w-full modal-btn-outline"
          onClick={() => setEditImagePickerOpen(true)}
          disabled={busy}
        >
          Find Image
        </button>
        {editForm.category === "single" && editingItem?.status !== "grading" && (
          <button
            type="button"
            className="w-full modal-btn-warning"
            onClick={handleGradeItem}
            disabled={busy}
          >
            Send to Grading
          </button>
        )}
        {deleteConfirm ? (
          <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{background:"rgba(244,63,94,0.08)", border:"1px solid rgba(244,63,94,0.25)"}}>
            <span className="text-sm flex-1" style={{color:"var(--accent-red)"}}>Delete this item?</span>
            <button
              className="modal-btn-destructive"
              style={{padding:"6px 14px", fontSize:"13px"}}
              onClick={handleDeleteItem}
              disabled={busy}
            >
              Delete
            </button>
            <button
              className="modal-btn-ghost"
              style={{padding:"6px 14px", fontSize:"13px"}}
              onClick={() => setDeleteConfirm(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="w-full modal-btn-danger"
            onClick={() => setDeleteConfirm(true)}
            disabled={busy}
          >
            Delete item
          </button>
        )}
        <div className="flex gap-2">
          <button className="flex-1 modal-btn-primary" onClick={onSaveEdit} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          <button className="modal-btn-ghost" onClick={closeEdit} disabled={busy}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* Mass edit modal */
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
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center modal-backdrop p-4" onClick={(e) => { if (e.target === e.currentTarget) setMassEditOpen(false); }}>
      <div className="modal-panel w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="modal-title">Edit {selectedIds.size} items</div>
          <button className="modal-close-btn" onClick={() => setMassEditOpen(false)}>✕</button>
        </div>
        <div className="text-xs" style={{color:"var(--text-muted)"}}>Leave a field as &quot;— no change —&quot; to keep existing values.</div>
        <div className="space-y-3">
          <div>
            <div className="text-xs opacity-60 mb-1">Owner</div>
            <select className="w-full border rounded-lg px-3 py-2 text-sm bg-background" value={massOwner} onChange={(e) => setMassOwner(e.target.value)}>
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
          </div>
          <div>
            <div className="text-xs opacity-60 mb-1">Status</div>
            <select className="w-full border rounded-lg px-3 py-2 text-sm bg-background" value={massStatus} onChange={(e) => setMassStatus(e.target.value)}>
              <option value="">— no change —</option>
              <option value="inventory">Inventory</option>
                      <option value="grading">Grading</option>
            </select>
          </div>
          <div>
            <div className="text-xs opacity-60 mb-1">Category</div>
            <select className="w-full border rounded-lg px-3 py-2 text-sm bg-background" value={massCategory} onChange={(e) => setMassCategory(e.target.value)}>
              <option value="">— no change —</option>
              <option value="single">Single</option>
              <option value="slab">Slab</option>
              <option value="sealed">Sealed</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className="flex-1 modal-btn-primary"
            onClick={onMassEdit}
            disabled={busy || (!massOwner && !massStatus && !massCategory)}
          >
            {busy ? "Saving…" : `Apply to ${selectedIds.size} items`}
          </button>
          <button className="modal-btn-ghost" onClick={() => setMassEditOpen(false)} disabled={busy}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* Bulk delete confirmation */
export function BulkDeleteModal({
  selectedIds,
  setDeleteOpen,
  busy,
  onBulkDelete,
}: {
  selectedIds: Set<string>;
  setDeleteOpen: (v: boolean) => void;
  busy: boolean;
  onBulkDelete: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center modal-backdrop p-4" onClick={(e) => { if (e.target === e.currentTarget) setDeleteOpen(false); }}>
      <div className="modal-panel w-full max-w-sm p-5 space-y-4">
        <div className="modal-title">Delete {selectedIds.size} item{selectedIds.size !== 1 ? "s" : ""}?</div>
        <div className="text-sm" style={{color:"var(--text-muted)"}}>This cannot be undone.</div>
        <div className="flex gap-2">
          <button className="flex-1 modal-btn-destructive" onClick={onBulkDelete} disabled={busy}>
            {busy ? "Deleting…" : `Delete ${selectedIds.size} item${selectedIds.size !== 1 ? "s" : ""}`}
          </button>
          <button className="modal-btn-ghost" onClick={() => setDeleteOpen(false)} disabled={busy}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* Sell modal */
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
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center modal-backdrop p-4" onClick={(e) => { if (e.target === e.currentTarget) setSellOpen(false); }}>
      <div className="modal-panel w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="modal-title">Sell {selectedItems.length} item{selectedItems.length !== 1 ? "s" : ""}</div>
          <button className="modal-close-btn" onClick={() => setSellOpen(false)}>✕</button>
        </div>

        {/* Per-card price rows */}
        <div className="rounded-xl overflow-hidden" style={{border:"1px solid var(--border-subtle)"}}>
          {selectedItems.map((it, i) => {
            const consigner = it.consigner_id ? consignerMap.get(it.consigner_id) : null;
            const isManual = manualPrices[it.id] !== undefined;
            const cardPrice = getCardPrice(it);
            const inputVal = isManual ? manualPrices[it.id] : (salePriceNum > 0 ? cardPrice.toFixed(2) : "");
            const payout = consigner ? cardPrice * consigner.rate : null;
            return (
              <div key={it.id} className={`px-3 py-2.5 ${i > 0 ? "border-t" : ""}`} style={{borderColor:"var(--border-subtle)"}}>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium text-xs">{it.name}</div>
                    <div className="text-xs opacity-50">{it.category} · Market: {fmt(it.market)}</div>
                  </div>
                  {/* Price input */}
                  <div className="flex items-center gap-1 shrink-0">
                    {isManual ? (
                      <button
                        type="button"
                        className="text-xs opacity-40 hover:opacity-80 transition-opacity leading-none"
                        onClick={() => resetCardPrice(it.id)}
                        title="Reset to auto"
                      >↺</button>
                    ) : (
                      <div className="w-4" />
                    )}
                    <div className={`flex items-center rounded-md border ${isManual ? "border-primary" : ""}`} style={isManual ? {} : {borderColor:"var(--border-subtle)"}}>
                      <span className="pl-2 text-xs opacity-50 select-none">$</span>
                      <input
                        className={`w-16 pr-2 py-1 text-xs text-right bg-transparent outline-none ${isManual ? "" : "opacity-50"}`}
                        value={inputVal}
                        placeholder="0.00"
                        inputMode="decimal"
                        onChange={(e) => updateCardPrice(it.id, e.target.value)}
                      />
                    </div>
                    {!isManual && (
                      <span className="text-xs opacity-30 w-8 text-left">auto</span>
                    )}
                  </div>
                </div>
                {consigner && cardPrice > 0 && (
                  <div className="text-xs opacity-50 mt-0.5">
                    {consigner.name} gets {fmt(payout ?? 0)} · you keep {fmt(cardPrice - (payout ?? 0))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Market warning */}
        {salePriceNum > 0 && totalMarket > 0 && (
          salePriceNum < totalMarket * 0.7 ? (
            <div className="text-xs text-amber-600 dark:text-amber-400 opacity-80">
              Total is {Math.round((1 - salePriceNum / totalMarket) * 100)}% below market value
            </div>
          ) : salePriceNum > totalMarket * 1.5 ? (
            <div className="text-xs text-amber-600 dark:text-amber-400 opacity-80">
              Total is {Math.round((salePriceNum / totalMarket - 1) * 100)}% above market value
            </div>
          ) : null
        )}

        {/* Total input */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium">Total sale price ($)</label>
            {totalMarket > 0 && (
              <button
                type="button"
                className="text-xs text-primary font-medium hover:underline"
                onClick={() => { setSalePrice(totalMarket.toFixed(2)); setManualPrices({}); }}
              >
                Use market {fmt(totalMarket)}
              </button>
            )}
          </div>
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
            placeholder="0.00"
            inputMode="decimal"
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
            autoFocus
          />
          {Object.keys(manualPrices).length > 0 ? (
            <div className="text-xs opacity-50 mt-1">Manual prices locked · auto cards fill the rest</div>
          ) : (
            <div className="text-xs opacity-50 mt-1">Split proportionally by market value</div>
          )}
        </div>

        <div className="flex gap-2">
          <button className="flex-1 modal-btn-confirm" onClick={onConfirmSale} disabled={busy || salePriceNum <= 0}>
            {busy ? "Saving…" : "Confirm Sale"}
          </button>
          <button className="modal-btn-ghost" onClick={() => setSellOpen(false)} disabled={busy}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* Bulk cost modal */
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
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center modal-backdrop p-4" onClick={(e) => { if (e.target === e.currentTarget) setBulkCostOpen(false); }}>
      <div className="modal-panel w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="modal-title">Set Cost — {selectedIds.size} card{selectedIds.size !== 1 ? "s" : ""}</div>
          <button className="modal-close-btn" onClick={() => setBulkCostOpen(false)}>✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs opacity-60 mb-1 block">
              {bulkCostSplit ? "Total amount paid (split evenly)" : "Cost per card"}
            </label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              placeholder="0.00"
              inputMode="decimal"
              value={bulkCostVal}
              onChange={(e) => setBulkCostVal(e.target.value)}
              autoFocus
            />
            {bulkCostSplit && toNum(bulkCostVal) != null && (
              <div className="text-xs opacity-50 mt-1">
                = {fmt(Math.round((toNum(bulkCostVal)! / selectedIds.size) * 100) / 100)} per card
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={bulkCostSplit}
              onChange={(e) => setBulkCostSplit(e.target.checked)}
              className="accent-blue-600"
            />
            Split total evenly across {selectedIds.size} cards
          </label>
        </div>
        <div className="flex gap-2">
          <button
            className="flex-1 modal-btn-primary"
            onClick={onBulkSetCost}
            disabled={busy || !bulkCostVal || toNum(bulkCostVal) === null}
          >
            {busy ? "Saving…" : `Apply to ${selectedIds.size} cards`}
          </button>
          <button className="modal-btn-ghost" onClick={() => setBulkCostOpen(false)} disabled={busy}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
