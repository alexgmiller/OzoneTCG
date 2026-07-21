"use client";

import { Camera } from "lucide-react";
import CSVImport from "../CSVImport";
import type { Category, Owner, Condition, ConsignerOption, ItemForm, StagedItem } from "../types";
import ItemFormFields from "./ItemFormFields";

/* Add form — collapsible (hidden on mobile unless open) */
export default function AddItemPanel({
  addOpen,
  setAddOpen,
  setScanOpen,
  consigners,
  addForm,
  setAddForm,
  setFindConfirmed,
  findConfirmed,
  handleAddFormFind,
  onAddToList,
  stagedItems,
  setStagedItems,
  onSaveAll,
  busy,
}: {
  addOpen: boolean;
  setAddOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setScanOpen: (v: boolean) => void;
  consigners: ConsignerOption[];
  addForm: ItemForm;
  setAddForm: (f: ItemForm) => void;
  setFindConfirmed: (v: string | null) => void;
  findConfirmed: string | null;
  handleAddFormFind: () => void;
  onAddToList: () => void;
  stagedItems: StagedItem[];
  setStagedItems: React.Dispatch<React.SetStateAction<StagedItem[]>>;
  onSaveAll: () => void;
  busy: boolean;
}) {
  return (
    <div className={`border rounded-xl overflow-hidden ${!addOpen ? "hidden md:block" : ""}`}>
      <div className="flex items-center justify-between px-3 py-2.5">
        <button
          className="flex items-center gap-2 font-medium text-sm"
          onClick={() => setAddOpen((o) => !o)}
        >
          <span>{addOpen ? "▾" : "▸"}</span>
          Add item
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScanOpen(true)}
            className="text-sm px-2.5 py-1 border rounded-lg hover:bg-muted transition-colors"
            title="Scan a card"
          >
            <Camera size={14} className="inline mr-1" />Scan
          </button>
          <CSVImport consigners={consigners} />
        </div>
      </div>
      {addOpen && (
        <div className="border-t p-3 space-y-3">
          <ItemFormFields
            form={addForm}
            setForm={(f) => { setAddForm(f); setFindConfirmed(null); }}
            consigners={consigners}
            onFind={handleAddFormFind}
            findConfirmed={findConfirmed}
          />
          <button
            className="px-4 py-2 rounded-lg border font-medium disabled:opacity-40"
            onClick={onAddToList}
            disabled={!addForm.name.trim()}
          >
            Add to List
          </button>

          {/* Staging list */}
          {stagedItems.length > 0 && (
            <div className="border-t pt-3 space-y-2">
              <div className="text-xs font-medium opacity-60 uppercase tracking-wide">
                Pending — {stagedItems.length} item{stagedItems.length !== 1 ? "s" : ""}
              </div>
              {stagedItems.map((item) => (
                <div key={item._id} className="flex items-start gap-2 border rounded-lg p-2">
                  {/* Thumbnail */}
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt="" className="h-14 w-auto rounded object-contain flex-shrink-0" />
                  ) : (
                    <div className="h-14 w-10 rounded bg-muted flex-shrink-0" />
                  )}

                  {/* Details */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="text-sm font-medium truncate">{item.name}</div>
                    {(item.setName || item.cardNumber) && (
                      <div className="text-xs opacity-60 truncate">
                        {[item.setName, item.cardNumber ? `#${item.cardNumber}` : ""].filter(Boolean).join(" · ")}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      <select
                        className="text-xs border rounded px-1 py-0.5 bg-background"
                        value={item.condition}
                        onChange={(e) => setStagedItems((prev) => prev.map((s) => s._id === item._id ? { ...s, condition: e.target.value as Condition } : s))}
                      >
                        <option value="Near Mint">NM</option>
                        <option value="Lightly Played">LP</option>
                        <option value="Moderately Played">MP</option>
                        <option value="Heavily Played">HP</option>
                        <option value="Damaged">D</option>
                      </select>
                      <select
                        className="text-xs border rounded px-1 py-0.5 bg-background"
                        value={item.owner}
                        onChange={(e) => setStagedItems((prev) => prev.map((s) => s._id === item._id ? { ...s, owner: e.target.value as Owner } : s))}
                      >
                        <option value="shared">Shared</option>
                        <option value="alex">Alex</option>
                        <option value="mila">Mila</option>
                      </select>
                      <select
                        className="text-xs border rounded px-1 py-0.5 bg-background"
                        value={item.category}
                        onChange={(e) => setStagedItems((prev) => prev.map((s) => s._id === item._id ? { ...s, category: e.target.value as Category } : s))}
                      >
                        <option value="single">Single</option>
                        <option value="slab">Slab</option>
                        <option value="sealed">Sealed</option>
                      </select>
                    </div>
                    <div className="flex gap-1">
                      <input
                        className="text-xs border rounded px-1.5 py-0.5 bg-background w-20"
                        placeholder="Cost"
                        value={item.cost}
                        inputMode="decimal"
                        onChange={(e) => setStagedItems((prev) => prev.map((s) => s._id === item._id ? { ...s, cost: e.target.value } : s))}
                      />
                      <input
                        className="text-xs border rounded px-1.5 py-0.5 bg-background w-20"
                        placeholder="Market"
                        value={item.market}
                        inputMode="decimal"
                        onChange={(e) => setStagedItems((prev) => prev.map((s) => s._id === item._id ? { ...s, market: e.target.value } : s))}
                      />
                    </div>
                  </div>

                  {/* Remove */}
                  <button
                    className="text-red-400 hover:text-red-600 text-xl leading-none flex-shrink-0 pt-0.5"
                    title="Remove"
                    onClick={() => setStagedItems((prev) => prev.filter((s) => s._id !== item._id))}
                  >
                    ×
                  </button>
                </div>
              ))}

              <button
                className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                onClick={onSaveAll}
                disabled={busy}
              >
                {busy ? "Saving…" : `Save All to Inventory (${stagedItems.length})`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
