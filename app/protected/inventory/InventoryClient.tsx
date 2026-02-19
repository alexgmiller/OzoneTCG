"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { subscribeWorkspaceTable } from "@/lib/supabase/realtime";
import { createItem, deleteItem, updateItem, markItemsAsSold } from "./actions";

type Category = "single" | "slab" | "sealed";
type Owner = "alex" | "mila" | "shared";
type Status = "inventory" | "listed";
type Condition = "Near Mint" | "Lightly Played" | "Moderately Played" | "Heavily Played" | "Damaged";
type SortKey =
  | "date-desc" | "date-asc"
  | "name-asc"  | "name-desc"
  | "market-desc" | "market-asc"
  | "cost-desc"   | "cost-asc";

type Item = {
  id: string;
  name: string;
  category: Category;
  owner: Owner;
  status: Status;
  market: number | null;
  cost: number | null;
  condition: Condition;
  notes: string | null;
  created_at: string;
};

type ItemForm = {
  category: Category;
  owner: Owner;
  status: Status;
  name: string;
  condition: Condition;
  cost: string;
  market: string;
  notes: string;
};

function toNum(v: string) {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function fmt(v: number | null) {
  if (v == null) return "-";
  return `$${v.toFixed(2)}`;
}

const statusColors: Record<string, string> = {
  inventory: "bg-blue-100 text-blue-800",
  listed: "bg-yellow-100 text-yellow-800",
};

const blankForm = (): ItemForm => ({
  category: "single",
  owner: "shared",
  status: "inventory",
  name: "",
  condition: "Near Mint",
  cost: "",
  market: "",
  notes: "",
});

function itemToForm(it: Item): ItemForm {
  return {
    category: it.category,
    owner: it.owner,
    status: it.status,
    name: it.name,
    condition: it.condition,
    cost: it.cost != null ? String(it.cost) : "",
    market: it.market != null ? String(it.market) : "",
    notes: it.notes ?? "",
  };
}

function ItemFormFields({
  form,
  setForm,
}: {
  form: ItemForm;
  setForm: (f: ItemForm) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <select
          className="border rounded-lg px-3 py-2 text-sm bg-background"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
        >
          <option value="single">Single</option>
          <option value="slab">Slab</option>
          <option value="sealed">Sealed</option>
        </select>

        <select
          className="border rounded-lg px-3 py-2 text-sm bg-background"
          value={form.owner}
          onChange={(e) => setForm({ ...form, owner: e.target.value as Owner })}
        >
          <option value="shared">Shared</option>
          <option value="alex">Alex</option>
          <option value="mila">Mila</option>
        </select>

        <select
          className="border rounded-lg px-3 py-2 text-sm bg-background"
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value as Status })}
        >
          <option value="inventory">Inventory</option>
          <option value="listed">Listed</option>
        </select>

        {/* Condition only for singles */}
        {form.category === "single" && (
          <select
            className="border rounded-lg px-3 py-2 text-sm bg-background"
            value={form.condition}
            onChange={(e) => setForm({ ...form, condition: e.target.value as Condition })}
          >
            <option value="Near Mint">Near Mint</option>
            <option value="Lightly Played">Lightly Played</option>
            <option value="Moderately Played">Moderately Played</option>
            <option value="Heavily Played">Heavily Played</option>
            <option value="Damaged">Damaged</option>
          </select>
        )}
      </div>

      <input
        className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
        placeholder="Name *"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />

      <div className="grid grid-cols-2 gap-2">
        <input
          className="border rounded-lg px-3 py-2 text-sm bg-background"
          placeholder="Cost"
          value={form.cost}
          inputMode="decimal"
          onChange={(e) => setForm({ ...form, cost: e.target.value })}
        />
        <input
          className="border rounded-lg px-3 py-2 text-sm bg-background"
          placeholder="Market"
          value={form.market}
          inputMode="decimal"
          onChange={(e) => setForm({ ...form, market: e.target.value })}
        />
      </div>

      <textarea
        className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
        placeholder="Notes"
        rows={2}
        value={form.notes}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
      />
    </div>
  );
}

function nullLast(a: number | null, b: number | null, asc: boolean): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return asc ? a - b : b - a;
}

export default function InventoryClient({
  items,
  workspaceId,
}: {
  items: Item[];
  workspaceId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { supabase, channel } = subscribeWorkspaceTable({
      workspaceId,
      table: "items",
      onChange: () => router.refresh(),
    });
    return () => { supabase.removeChannel(channel); };
  }, [router, workspaceId]);

  const [addForm, setAddForm] = useState<ItemForm>(blankForm());
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editForm, setEditForm] = useState<ItemForm>(blankForm());

  // Multi-select + sell
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sellOpen, setSellOpen] = useState(false);
  const [salePrice, setSalePrice] = useState("");

  // Filter / sort
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<Category | "all">("all");
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");
  const [filterOwner, setFilterOwner] = useState<Owner | "all">("all");
  const [sort, setSort] = useState<SortKey>("date-desc");

  const displayedItems = useMemo(() => {
    let result = [...items];
    const q = search.trim().toLowerCase();
    if (q) result = result.filter((it) => it.name.toLowerCase().includes(q));
    if (filterCategory !== "all") result = result.filter((it) => it.category === filterCategory);
    if (filterStatus !== "all") result = result.filter((it) => it.status === filterStatus);
    if (filterOwner !== "all") result = result.filter((it) => it.owner === filterOwner);
    result.sort((a, b) => {
      switch (sort) {
        case "name-asc":    return a.name.localeCompare(b.name);
        case "name-desc":   return b.name.localeCompare(a.name);
        case "market-asc":  return nullLast(a.market, b.market, true);
        case "market-desc": return nullLast(a.market, b.market, false);
        case "cost-asc":    return nullLast(a.cost, b.cost, true);
        case "cost-desc":   return nullLast(a.cost, b.cost, false);
        case "date-asc":    return a.created_at.localeCompare(b.created_at);
        case "date-desc":   return b.created_at.localeCompare(a.created_at);
        default: return 0;
      }
    });
    return result;
  }, [items, search, filterCategory, filterStatus, filterOwner, sort]);

  // All selected items (regardless of current filter)
  const selectedItems = useMemo(
    () => items.filter((it) => selectedIds.has(it.id)),
    [items, selectedIds]
  );

  const totalMarket = selectedItems.reduce((s, it) => s + (it.market ?? 0), 0);
  const salePriceNum = parseFloat(salePrice) || 0;

  function getProportionalPrice(it: Item): number {
    const m = it.market ?? 0;
    if (totalMarket > 0) return (m / totalMarket) * salePriceNum;
    return selectedItems.length > 0 ? salePriceNum / selectedItems.length : 0;
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setSellOpen(false);
    setSalePrice("");
  }

  function openEdit(it: Item) { setEditingItem(it); setEditForm(itemToForm(it)); }
  function closeEdit() { setEditingItem(null); }

  async function onAdd() {
    if (!addForm.name.trim()) return;
    setBusy(true);
    try {
      await createItem({
        category: addForm.category,
        owner: addForm.owner,
        status: addForm.status,
        name: addForm.name,
        condition: addForm.category === "single" ? addForm.condition : "Near Mint",
        cost: toNum(addForm.cost),
        market: toNum(addForm.market),
        notes: addForm.notes || null,
      });
      setAddForm(blankForm());
    } finally { setBusy(false); }
  }

  async function onSaveEdit() {
    if (!editingItem || !editForm.name.trim()) return;
    setBusy(true);
    try {
      await updateItem(editingItem.id, {
        category: editForm.category,
        owner: editForm.owner,
        status: editForm.status,
        name: editForm.name,
        condition: editForm.category === "single" ? editForm.condition : "Near Mint",
        cost: toNum(editForm.cost),
        market: toNum(editForm.market),
        notes: editForm.notes || null,
      });
      closeEdit();
    } finally { setBusy(false); }
  }

  async function onDelete(id: string) {
    setBusy(true);
    try { await deleteItem(id); }
    finally { setBusy(false); }
  }

  async function onQuickListed(it: Item) {
    setBusy(true);
    try { await updateItem(it.id, { status: "listed" }); }
    finally { setBusy(false); }
  }

  async function onConfirmSale() {
    if (selectedIds.size === 0 || salePriceNum <= 0) return;
    setBusy(true);
    try {
      await markItemsAsSold(Array.from(selectedIds), salePriceNum);
      clearSelection();
    } finally { setBusy(false); }
  }

  const isFiltered = search.trim() !== "" || filterCategory !== "all" || filterStatus !== "all" || filterOwner !== "all";

  return (
    <div className="space-y-4">
      {/* Add form */}
      <div className="border rounded-xl p-3 space-y-3">
        <div className="font-medium">Add item</div>
        <ItemFormFields form={addForm} setForm={setAddForm} />
        <button className="px-4 py-2 rounded-lg border font-medium" onClick={onAdd} disabled={busy}>
          {busy ? "Saving…" : "Add"}
        </button>
      </div>

      {/* Search / filter / sort */}
      <div className="border rounded-xl p-3 space-y-2">
        <input
          className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <select className="border rounded-lg px-3 py-2 text-sm bg-background" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value as Category | "all")}>
            <option value="all">All types</option>
            <option value="single">Singles</option>
            <option value="slab">Slabs</option>
            <option value="sealed">Sealed</option>
          </select>
          <select className="border rounded-lg px-3 py-2 text-sm bg-background" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as Status | "all")}>
            <option value="all">All statuses</option>
            <option value="inventory">Inventory</option>
            <option value="listed">Listed</option>
          </select>
          <select className="border rounded-lg px-3 py-2 text-sm bg-background" value={filterOwner} onChange={(e) => setFilterOwner(e.target.value as Owner | "all")}>
            <option value="all">All owners</option>
            <option value="alex">Alex</option>
            <option value="mila">Mila</option>
            <option value="shared">Shared</option>
          </select>
          <select className="border rounded-lg px-3 py-2 text-sm bg-background" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="date-desc">Newest first</option>
            <option value="date-asc">Oldest first</option>
            <option value="name-asc">Name A→Z</option>
            <option value="name-desc">Name Z→A</option>
            <option value="market-desc">Market ↓</option>
            <option value="market-asc">Market ↑</option>
            <option value="cost-desc">Cost ↓</option>
            <option value="cost-asc">Cost ↑</option>
          </select>
        </div>
        {isFiltered && (
          <button className="text-xs underline opacity-60" onClick={() => { setSearch(""); setFilterCategory("all"); setFilterStatus("all"); setFilterOwner("all"); }}>
            Clear filters
          </button>
        )}
      </div>

      {/* Tile grid */}
      <div className="border rounded-xl overflow-hidden">
        <div className="px-3 py-2 border-b flex items-center justify-between">
          <div className="text-xs opacity-70">
            {isFiltered ? `${displayedItems.length} of ${items.length} items` : `Items (${items.length})`}
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs opacity-70">{selectedIds.size} selected</span>
              <button
                className="text-xs px-3 py-1 rounded-lg bg-green-600 text-white font-medium"
                onClick={() => setSellOpen(true)}
                disabled={busy}
              >
                Sell
              </button>
              <button className="text-xs px-2 py-1 rounded-lg border opacity-60" onClick={clearSelection}>
                Clear
              </button>
            </div>
          )}
        </div>

        {displayedItems.length === 0 && (
          <div className="p-6 text-sm opacity-70">
            {items.length === 0 ? "No items yet." : "No items match your filters."}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 p-3">
          {displayedItems.map((it) => {
            const isSelected = selectedIds.has(it.id);
            return (
              <div
                key={it.id}
                className={`border rounded-xl p-3 flex flex-col gap-2 transition-colors ${isSelected ? "border-green-500 bg-green-50 dark:bg-green-950/20" : ""}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(it.id)}
                    className="w-4 h-4 accent-green-600 flex-shrink-0"
                  />
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColors[it.status]}`}>
                    {it.status}
                  </span>
                </div>

                <div className="font-semibold text-sm leading-tight line-clamp-2">{it.name}</div>

                <div className="text-xs opacity-60 space-y-0.5">
                  <div>{it.category} • {it.owner}</div>
                  {it.category === "single" && it.condition && <div>{it.condition}</div>}
                </div>

                <div className="text-xs space-y-0.5">
                  <div>Cost: {fmt(it.cost)}</div>
                  <div>Market: {fmt(it.market)}</div>
                </div>

                <div className="mt-auto pt-1 flex flex-wrap gap-1">
                  <button className="text-xs px-2 py-1 rounded-lg border" onClick={() => openEdit(it)} disabled={busy}>Edit</button>
                  {it.status !== "listed" && (
                    <button className="text-xs px-2 py-1 rounded-lg border" onClick={() => onQuickListed(it)} disabled={busy}>Listed</button>
                  )}
                  <button className="text-xs px-2 py-1 rounded-lg border border-red-300 text-red-600" onClick={() => onDelete(it.id)} disabled={busy}>Del</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) closeEdit(); }}>
          <div className="bg-background border rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Edit item</div>
              <button className="text-sm opacity-60 px-2 py-1" onClick={closeEdit}>✕</button>
            </div>
            <ItemFormFields form={editForm} setForm={setEditForm} />
            <div className="flex gap-2">
              <button className="flex-1 px-4 py-2 rounded-lg border font-medium" onClick={onSaveEdit} disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
              <button className="px-4 py-2 rounded-lg border opacity-60" onClick={closeEdit} disabled={busy}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Sell modal */}
      {sellOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setSellOpen(false); }}>
          <div className="bg-background border rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Sell {selectedItems.length} item{selectedItems.length !== 1 ? "s" : ""}</div>
              <button className="text-sm opacity-60 px-2 py-1" onClick={() => setSellOpen(false)}>✕</button>
            </div>

            {/* Items with proportional preview */}
            <div className="rounded-xl border overflow-hidden">
              {selectedItems.map((it, i) => (
                <div key={it.id} className={`flex items-center justify-between px-3 py-2 text-sm ${i > 0 ? "border-t" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium text-xs">{it.name}</div>
                    <div className="text-xs opacity-50">{it.category} • Market: {fmt(it.market)}</div>
                  </div>
                  <div className="text-xs font-semibold ml-3 shrink-0 text-green-600">
                    {salePriceNum > 0 ? fmt(getProportionalPrice(it)) : "—"}
                  </div>
                </div>
              ))}
            </div>

            <div className="text-xs opacity-50 -mt-2">
              Total market: {fmt(totalMarket || null)} · Split proportionally by market value
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">Total sale price ($)</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                placeholder="0.00"
                inputMode="decimal"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex gap-2">
              <button
                className="flex-1 px-4 py-2 rounded-lg bg-green-600 text-white font-medium disabled:opacity-40"
                onClick={onConfirmSale}
                disabled={busy || salePriceNum <= 0}
              >
                {busy ? "Saving…" : "Confirm Sale"}
              </button>
              <button className="px-4 py-2 rounded-lg border opacity-60" onClick={() => setSellOpen(false)} disabled={busy}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
