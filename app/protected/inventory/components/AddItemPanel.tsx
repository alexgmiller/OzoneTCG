"use client";

import { ChevronDown, X } from "lucide-react";
import CSVImport from "../CSVImport";
import type { Category, Owner, Condition, ConsignerOption, ItemForm, StagedItem } from "../types";
import { setLine, btnOutline, btnPrimary, fieldClass } from "../utils";
import ItemFormFields from "./ItemFormFields";

const smallField = "h-11 rounded-lg border border-border bg-background px-2 text-sm text-foreground";

// ── Add item panel (collapsible) ──
export default function AddItemPanel({
  addOpen,
  setAddOpen,
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
  const patchStaged = (id: string, patch: Partial<StagedItem>) =>
    setStagedItems((prev) => prev.map((s) => (s._id === id ? { ...s, ...patch } : s)));

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 px-3 py-1">
        <button className="flex h-11 flex-1 items-center gap-2 text-left text-sm font-semibold text-foreground" onClick={() => setAddOpen((o) => !o)} aria-expanded={addOpen}>
          <ChevronDown size={16} className={`text-muted-foreground transition-transform duration-150 ${addOpen ? "" : "-rotate-90"}`} />
          Add item
          {stagedItems.length > 0 && <span className="rounded-full bg-accent-primary-soft px-2 text-xs font-semibold text-accent-primary tabular-nums">{stagedItems.length} pending</span>}
        </button>
        <CSVImport consigners={consigners} />
      </div>

      {addOpen && (
        <div className="space-y-3 border-t border-border p-3">
          <ItemFormFields
            form={addForm}
            setForm={(f) => { setAddForm(f); setFindConfirmed(null); }}
            consigners={consigners}
            onFind={handleAddFormFind}
            findConfirmed={findConfirmed}
          />
          <button className={`${btnOutline} w-full`} onClick={onAddToList} disabled={!addForm.name.trim()}>
            Add to list
          </button>

          {/* ── Staged items ── */}
          {stagedItems.length > 0 && (
            <div className="space-y-2 border-t border-border pt-3">
              <div className="font-mono text-xs uppercase tracking-[0.18em] text-neutral tabular-nums">
                Pending · {stagedItems.length}
              </div>
              {stagedItems.map((item) => (
                <div key={item._id} className="flex items-start gap-3 rounded-xl border border-border p-3">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt="" className="h-16 w-auto shrink-0 rounded-lg object-contain" />
                  ) : (
                    <div className="h-16 w-11 shrink-0 rounded-lg bg-muted" />
                  )}
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="truncate text-sm font-medium text-foreground">{item.name}</div>
                    {setLine({ set_name: item.setName, card_number: item.cardNumber }) && (
                      <div className="truncate text-xs text-muted-foreground">{setLine({ set_name: item.setName, card_number: item.cardNumber })}</div>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      <select className={smallField} value={item.condition} onChange={(e) => patchStaged(item._id, { condition: e.target.value as Condition })}>
                        <option value="Near Mint">NM</option>
                        <option value="Lightly Played">LP</option>
                        <option value="Moderately Played">MP</option>
                        <option value="Heavily Played">HP</option>
                        <option value="Damaged">Dmg</option>
                      </select>
                      <select className={smallField} value={item.owner} onChange={(e) => patchStaged(item._id, { owner: e.target.value as Owner })}>
                        <option value="shared">Shared</option>
                        <option value="alex">Alex</option>
                        <option value="mila">Mila</option>
                      </select>
                      <select className={smallField} value={item.category} onChange={(e) => patchStaged(item._id, { category: e.target.value as Category })}>
                        <option value="single">Single</option>
                        <option value="slab">Slab</option>
                        <option value="sealed">Sealed</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input className={`${fieldClass} tabular-nums`} placeholder="Cost" value={item.cost} inputMode="decimal" onChange={(e) => patchStaged(item._id, { cost: e.target.value })} />
                      <input className={`${fieldClass} tabular-nums`} placeholder="Market" value={item.market} inputMode="decimal" onChange={(e) => patchStaged(item._id, { market: e.target.value })} />
                    </div>
                  </div>
                  <button
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Remove"
                    aria-label="Remove"
                    onClick={() => setStagedItems((prev) => prev.filter((s) => s._id !== item._id))}
                  >
                    <X size={18} />
                  </button>
                </div>
              ))}
              <button className={`${btnPrimary} w-full`} onClick={onSaveAll} disabled={busy}>
                {busy ? "Saving…" : `Save ${stagedItems.length} to inventory`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
