"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { subscribeWorkspaceTable } from "@/lib/supabase/realtime";
import { createItem, createItems, deleteItem, deleteItems, updateItem, markItemsAsSold, massUpdateItems, refreshItemPrice, refreshItemPrices, fetchCardData } from "./actions";
import CSVImport from "./CSVImport";
import CardScanner, { type ScanResult } from "@/components/CardScanner";
import CardSearchPicker, { type CardSearchResult } from "@/components/CardSearchPicker";

type Category = "single" | "slab" | "sealed";
type Owner = "alex" | "mila" | "shared" | "consigner";
type Status = "inventory" | "grading";
type Condition = "Near Mint" | "Lightly Played" | "Moderately Played" | "Heavily Played" | "Damaged";
type SortKey =
  | "date-desc" | "date-asc"
  | "name-asc"  | "name-desc"
  | "market-desc" | "market-asc"
  | "cost-desc"   | "cost-asc";

type ConsignerOption = { id: string; name: string; rate: number };

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
  consigner_id: string | null;
  image_url: string | null;
  set_name: string | null;
  card_number: string | null;
  grade: string | null;
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
  consignerId: string;
  imageUrl: string;
  setName: string;
  cardNumber: string;
  grade: string;
};

type StagedItem = ItemForm & { _id: string };

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

const categoryColors: Record<string, string> = {
  single: "bg-blue-100 text-blue-800",
  slab: "bg-purple-100 text-purple-800",
  sealed: "bg-teal-100 text-teal-800",
};

function gradeStyle(grade: string): string {
  const n = parseInt(grade.replace("PSA ", ""));
  if (n === 10) return "bg-yellow-100 border border-yellow-400 text-yellow-800 font-bold";
  if (n === 9)  return "bg-emerald-100 border border-emerald-400 text-emerald-800 font-semibold";
  if (n >= 7)   return "bg-blue-100 border border-blue-400 text-blue-800";
  if (n >= 5)   return "bg-orange-100 border border-orange-400 text-orange-800";
  return "bg-red-100 border border-red-400 text-red-800";
}

const blankForm = (): ItemForm => ({
  category: "single",
  owner: "shared",
  status: "inventory",
  name: "",
  condition: "Near Mint",
  cost: "",
  market: "",
  notes: "",
  consignerId: "",
  imageUrl: "",
  setName: "",
  cardNumber: "",
  grade: "",
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
    consignerId: it.consigner_id ?? "",
    imageUrl: it.image_url ?? "",
    setName: it.set_name ?? "",
    cardNumber: it.card_number ?? "",
    grade: it.grade ?? "",
  };
}

function ItemFormFields({
  form,
  setForm,
  consigners,
  onFind,
  finding,
  findConfirmed,
  findError,
}: {
  form: ItemForm;
  setForm: (f: ItemForm) => void;
  consigners: ConsignerOption[];
  onFind?: () => void;
  finding?: boolean;
  findConfirmed?: string | null;
  findError?: string | null;
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
          value={form.owner === "consigner" && form.consignerId ? `consigner:${form.consignerId}` : form.owner}
          onChange={(e) => {
            const v = e.target.value;
            if (v.startsWith("consigner:")) {
              setForm({ ...form, owner: "consigner", consignerId: v.slice("consigner:".length) });
            } else {
              setForm({ ...form, owner: v as Owner, consignerId: "" });
            }
          }}
        >
          <option value="shared">Shared</option>
          <option value="alex">Alex</option>
          <option value="mila">Mila</option>
          {consigners.length > 0 && (
            <optgroup label="Consigners">
              {consigners.map((c) => (
                <option key={c.id} value={`consigner:${c.id}`}>
                  {c.name} ({Math.round(c.rate * 100)}%)
                </option>
              ))}
            </optgroup>
          )}
        </select>

        <select
          className="border rounded-lg px-3 py-2 text-sm bg-background"
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value as Status })}
        >
          <option value="inventory">Inventory</option>
          {form.category === "single" && <option value="grading">Grading</option>}
        </select>

        {/* Condition for singles/sealed; PSA grade for slabs */}
        {form.category === "slab" ? (
          <select
            className="border rounded-lg px-3 py-2 text-sm bg-background"
            value={form.grade}
            onChange={(e) => setForm({ ...form, grade: e.target.value })}
          >
            <option value="">— PSA Grade —</option>
            <option value="PSA 10">PSA 10</option>
            <option value="PSA 9">PSA 9</option>
            <option value="PSA 8">PSA 8</option>
            <option value="PSA 7">PSA 7</option>
            <option value="PSA 6">PSA 6</option>
            <option value="PSA 5">PSA 5</option>
            <option value="PSA 4">PSA 4</option>
            <option value="PSA 3">PSA 3</option>
            <option value="PSA 2">PSA 2</option>
            <option value="PSA 1">PSA 1</option>
          </select>
        ) : (
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

      {/* Card identification — name + set + number + Find */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background"
            placeholder="Name *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          {onFind && (
            <button
              type="button"
              onClick={onFind}
              className="px-3 py-2 rounded-lg border text-sm font-medium hover:bg-muted transition-colors whitespace-nowrap"
            >
              Find Card
            </button>
          )}
        </div>
        {onFind && (
          <div className="grid grid-cols-2 gap-2">
            <input
              className="border rounded-lg px-3 py-2 text-sm bg-background"
              placeholder="Set name (optional)"
              value={form.setName}
              onChange={(e) => setForm({ ...form, setName: e.target.value })}
            />
            <input
              className="border rounded-lg px-3 py-2 text-sm bg-background"
              placeholder="Card # (optional)"
              value={form.cardNumber}
              onChange={(e) => setForm({ ...form, cardNumber: e.target.value })}
            />
          </div>
        )}
        {findConfirmed && (
          <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
            <span className="font-medium">✓</span>
            <span className="truncate">{findConfirmed}</span>
          </div>
        )}
        {findError && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
            {findError}
          </div>
        )}
      </div>

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

      {/* Image — show found image prominently, fallback to URL input */}
      {form.imageUrl ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={form.imageUrl} alt="preview" className="h-32 w-auto rounded-lg border object-contain flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              placeholder="Image URL"
              value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            />
            <button
              type="button"
              className="text-xs text-red-500 underline"
              onClick={() => setForm({ ...form, imageUrl: "" })}
            >
              Remove image
            </button>
          </div>
        </div>
      ) : (
        <input
          className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
          placeholder="Image URL (or use Find / Scan to auto-fill)"
          value={form.imageUrl}
          onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
        />
      )}
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
  consigners,
  workspaceId,
}: {
  items: Item[];
  consigners: ConsignerOption[];
  workspaceId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [cardSearchOpen, setCardSearchOpen] = useState(false);
  const [editImagePickerOpen, setEditImagePickerOpen] = useState(false);

  // Inline find state (for the add form)
  const [findBusy, setFindBusy] = useState(false);
  const [findConfirmed, setFindConfirmed] = useState<string | null>(null);
  const [findError, setFindError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // PSA 10 eBay price lookup state per grading item
  type Psa10Entry = { medianPrice: number | null; count: number; loading: boolean; fetched: boolean; rateLimited?: boolean };
  const [psa10Data, setPsa10Data] = useState<Record<string, Psa10Entry>>({});

  async function fetchPsa10(id: string, name: string, setName?: string | null) {
    setPsa10Data((prev) => ({ ...prev, [id]: { medianPrice: null, count: 0, loading: true, fetched: false } }));
    try {
      const res = await fetch("/api/ebay-psa10", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, setName }),
      });
      const json = await res.json();
      if (!res.ok) {
        const rateLimited = json.status === 500; // eBay rate limit returns 500
        setPsa10Data((prev) => ({ ...prev, [id]: { medianPrice: null, count: 0, loading: false, fetched: true, rateLimited } }));
        return;
      }
      setPsa10Data((prev) => ({
        ...prev,
        [id]: { medianPrice: json.medianPrice ?? null, count: json.count ?? 0, loading: false, fetched: true },
      }));
    } catch {
      setPsa10Data((prev) => ({ ...prev, [id]: { medianPrice: null, count: 0, loading: false, fetched: true } }));
    }
  }

  useEffect(() => {
    const { supabase, channel } = subscribeWorkspaceTable({
      workspaceId,
      table: "items",
      onChange: () => router.refresh(),
    });
    return () => { supabase.removeChannel(channel); };
  }, [router, workspaceId]);

  const consignerMap = useMemo(
    () => new Map(consigners.map((c) => [c.id, c])),
    [consigners]
  );

  const [addForm, setAddForm] = useState<ItemForm>(blankForm());
  const [stagedItems, setStagedItems] = useState<StagedItem[]>([]);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editForm, setEditForm] = useState<ItemForm>(blankForm());

  // Multi-select + sell
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sellOpen, setSellOpen] = useState(false);
  const [salePrice, setSalePrice] = useState("");

  // Mass edit
  const [massEditOpen, setMassEditOpen] = useState(false);
  const [massOwner, setMassOwner] = useState("");
  const [massStatus, setMassStatus] = useState("");
  const [massCategory, setMassCategory] = useState("");

  // Filter / sort
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<Category | "all">("all");
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");
  const [filterOwner, setFilterOwner] = useState<Owner | "all">("all");
  const [filterConsigner, setFilterConsigner] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("date-desc");

  const gradingItems = useMemo(
    () => items.filter((it) => it.status === "grading"),
    [items]
  );

  const displayedItems = useMemo(() => {
    let result = items.filter((it) => it.status !== "grading");
    const q = search.trim().toLowerCase();
    if (q) result = result.filter((it) => it.name.toLowerCase().includes(q));
    if (filterCategory !== "all") result = result.filter((it) => it.category === filterCategory);
    if (filterStatus !== "all") result = result.filter((it) => it.status === filterStatus);
    if (filterOwner !== "all") result = result.filter((it) => it.owner === filterOwner);
    if (filterConsigner === "none") result = result.filter((it) => !it.consigner_id);
    else if (filterConsigner !== "all") result = result.filter((it) => it.consigner_id === filterConsigner);
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
  }, [items, search, filterCategory, filterStatus, filterOwner, filterConsigner, sort]);

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
  function closeEdit() { setEditingItem(null); setDeleteConfirm(false); }

  function onScanResult(data: ScanResult) {
    setAddForm({
      ...blankForm(),
      name: data.name,
      condition: data.condition,
      market: data.market != null ? String(data.market) : "",
      imageUrl: data.imageUrl ?? "",
      setName: data.setName,
      cardNumber: data.cardNumber,
    });
    setAddOpen(true);
  }

  async function onCardSearchResult(data: CardSearchResult) {
    // Pre-fill with picker data immediately
    setAddForm((prev) => ({
      ...prev,
      name: data.name,
      setName: data.setName,
      cardNumber: data.cardNumber,
      market: data.market != null ? String(data.market) : prev.market,
      imageUrl: data.imageUrl ?? prev.imageUrl,
    }));
    setFindConfirmed(
      [data.name, data.setName, data.cardNumber ? `#${data.cardNumber}` : ""].filter(Boolean).join(" · ")
    );
    setFindError(null);
    // Upgrade to TCGdex high-res image in the background
    if (data.name) {
      const result = await fetchCardData(data.name, data.setName || null, data.cardNumber || null);
      if (result) {
        setAddForm((prev) => ({
          ...prev,
          imageUrl: result.imageUrl ?? prev.imageUrl,
        }));
      }
    }
  }

  async function onEditImageResult(data: CardSearchResult) {
    setEditImagePickerOpen(false);
    if (!data.imageUrl || !editingItem) return;
    setEditForm((prev) => ({ ...prev, imageUrl: data.imageUrl! }));
    setBusy(true);
    try {
      await updateItem(editingItem.id, { image_url: data.imageUrl });
    } finally {
      setBusy(false);
    }
  }

  function handleAddFormFind() {
    setAddOpen(true);
    setCardSearchOpen(true);
  }

  function onAddToList() {
    if (!addForm.name.trim()) return;
    setStagedItems((prev) => [...prev, { ...addForm, _id: crypto.randomUUID() }]);
    setAddForm(blankForm());
    setFindConfirmed(null);
    setFindError(null);
  }

  async function onSaveAll() {
    if (stagedItems.length === 0) return;
    setBusy(true);
    try {
      await createItems(
        stagedItems.map((item) => ({
          category: item.category,
          owner: item.owner,
          status: item.status,
          name: item.name,
          condition: item.category === "single" ? item.condition : "Near Mint",
          cost: toNum(item.cost),
          market: toNum(item.market),
          notes: item.notes || null,
          consigner_id: item.consignerId || null,
          image_url: item.imageUrl || null,
          set_name: item.setName || null,
          card_number: item.cardNumber || null,
          grade: item.grade || null,
        }))
      );
      setStagedItems([]);
    } finally {
      setBusy(false);
    }
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
        consigner_id: editForm.consignerId || null,
        image_url: editForm.imageUrl || null,
        set_name: editForm.setName || null,
        card_number: editForm.cardNumber || null,
        grade: editForm.grade || null,
      });
      closeEdit();
    } finally { setBusy(false); }
  }

  async function onDelete(id: string) {
    setBusy(true);
    try { await deleteItem(id); }
    finally { setBusy(false); }
  }

  async function onQuickStatus(id: string, status: Status) {
    setBusy(true);
    try { await updateItem(id, { status }); }
    finally { setBusy(false); }
  }

  async function handleGradeItem() {
    if (!editingItem) return;
    setBusy(true);
    try { await updateItem(editingItem.id, { status: "grading" }); closeEdit(); }
    finally { setBusy(false); }
  }

  async function handleDeleteItem() {
    if (!editingItem) return;
    await onDelete(editingItem.id);
    closeEdit();
  }

  async function onMassEdit() {
    const patch: Record<string, string | null> = {};
    if (massOwner) {
      if (massOwner.startsWith("consigner:")) {
        patch.owner = "consigner";
        patch.consigner_id = massOwner.slice("consigner:".length);
      } else {
        patch.owner = massOwner;
        patch.consigner_id = null;
      }
    }
    if (massStatus) patch.status = massStatus;
    if (massCategory) patch.category = massCategory;
    if (Object.keys(patch).length === 0) return;
    setBusy(true);
    try {
      await massUpdateItems(Array.from(selectedIds), patch);
      setMassEditOpen(false);
      setMassOwner("");
      setMassStatus("");
      setMassCategory("");
    } finally { setBusy(false); }
  }

  async function onConfirmSale() {
    if (selectedIds.size === 0 || salePriceNum <= 0) return;
    setBusy(true);
    try {
      await markItemsAsSold(Array.from(selectedIds), salePriceNum);
      clearSelection();
    } finally { setBusy(false); }
  }

  async function onBulkSync() {
    const toSync = selectedItems.map((it) => ({
      id: it.id,
      name: it.name,
      category: it.category,
      setName: it.set_name,
      cardNumber: it.card_number,
    }));
    setBulkSyncing(true);
    try {
      await refreshItemPrices(toSync);
    } finally {
      setBulkSyncing(false);
    }
  }

  async function onBulkDelete() {
    setBusy(true);
    try {
      await deleteItems(Array.from(selectedIds));
      clearSelection();
      setDeleteOpen(false);
    } finally { setBusy(false); }
  }

  function selectAll() {
    if (selectedIds.size === displayedItems.length && displayedItems.length > 0) {
      clearSelection();
    } else {
      setSelectedIds(new Set(displayedItems.map((it) => it.id)));
    }
  }

  const isFiltered =
    search.trim() !== "" ||
    filterCategory !== "all" ||
    filterStatus !== "all" ||
    filterOwner !== "all" ||
    filterConsigner !== "all";

  return (
    <div className={`space-y-4 ${selectedIds.size > 0 ? "pb-32" : ""}`}>
      <CardScanner open={scanOpen} onClose={() => setScanOpen(false)} onResult={onScanResult} />
      <CardSearchPicker
        open={cardSearchOpen || editImagePickerOpen}
        onClose={() => { setCardSearchOpen(false); setEditImagePickerOpen(false); }}
        onResult={editImagePickerOpen ? onEditImageResult : onCardSearchResult}
        initialName={editImagePickerOpen ? editForm.name : addForm.name}
        initialSetName={editImagePickerOpen ? editForm.setName : addForm.setName}
        initialCardNumber={editImagePickerOpen ? editForm.cardNumber : addForm.cardNumber}
      />

      {/* Add form — collapsible */}
      <div className="border rounded-xl overflow-hidden">
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
              📷 Scan
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

      {/* Search / filter / sort — collapsible */}
      <div className="border rounded-xl overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium"
          onClick={() => setSearchOpen((o) => !o)}
        >
          <span className="flex items-center gap-2">
            <span>{searchOpen ? "▾" : "▸"}</span>
            Search &amp; Filter
          </span>
          {isFiltered && (
            <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
              active
            </span>
          )}
        </button>
        {searchOpen && (
          <div className="border-t p-3 space-y-2">
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
                    </select>
              <select className="border rounded-lg px-3 py-2 text-sm bg-background" value={filterOwner} onChange={(e) => setFilterOwner(e.target.value as Owner | "all")}>
                <option value="all">All owners</option>
                <option value="alex">Alex</option>
                <option value="mila">Mila</option>
                <option value="shared">Shared</option>
              </select>
              {consigners.length > 0 && (
                <select className="border rounded-lg px-3 py-2 text-sm bg-background" value={filterConsigner} onChange={(e) => setFilterConsigner(e.target.value)}>
                  <option value="all">All consigners</option>
                  <option value="none">Own inventory</option>
                  {consigners.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
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
              <button className="text-xs underline opacity-60" onClick={() => { setSearch(""); setFilterCategory("all"); setFilterStatus("all"); setFilterOwner("all"); setFilterConsigner("all"); }}>
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tile grid */}
      <div className="border rounded-xl">
        <div className="px-3 py-2 border-b flex items-center justify-between sticky top-0 z-10 bg-background rounded-t-xl">
          <div className="flex items-center gap-2">
            <button
              className="flex items-center gap-1.5 text-xs font-medium opacity-70 hover:opacity-100"
              onClick={() => setInventoryOpen((o) => !o)}
            >
              <span>{inventoryOpen ? "▾" : "▸"}</span>
              {isFiltered ? `${displayedItems.length} of ${items.length} items` : `Items (${items.length})`}
            </button>
            {inventoryOpen && (
              <button className="text-xs px-2 py-1 rounded-lg border opacity-60" onClick={selectAll}>
                {selectedIds.size === displayedItems.length && displayedItems.length > 0 ? "Deselect All" : "Select All"}
              </button>
            )}
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs opacity-70">{selectedIds.size} selected</span>
              <button className="text-xs px-3 py-1 rounded-lg bg-green-600 text-white font-medium" onClick={() => setSellOpen(true)} disabled={busy}>Sell</button>
              <button className="text-xs px-3 py-1 rounded-lg border font-medium" onClick={() => setMassEditOpen(true)} disabled={busy}>Edit</button>
              <button className="text-xs px-3 py-1 rounded-lg border border-blue-300 text-blue-600 font-medium" onClick={onBulkSync} disabled={busy || bulkSyncing}>{bulkSyncing ? "Syncing…" : "Sync"}</button>
              <button className="text-xs px-3 py-1 rounded-lg border border-red-300 text-red-600 font-medium" onClick={() => setDeleteOpen(true)} disabled={busy}>Del</button>
              <button className="text-xs px-2 py-1 rounded-lg border opacity-60" onClick={clearSelection}>Clear</button>
            </div>
          )}
        </div>

        {inventoryOpen && displayedItems.length === 0 && (
          <div className="p-6 text-sm opacity-70">
            {items.length === 0 ? "No items yet." : "No items match your filters."}
          </div>
        )}

        {inventoryOpen && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 p-3">
          {displayedItems.map((it) => {
            const isSelected = selectedIds.has(it.id);
            const consigner = it.consigner_id ? consignerMap.get(it.consigner_id) : null;
            return (
              <div
                key={it.id}
                className={`border rounded-xl p-3 flex flex-col gap-2 transition-colors cursor-pointer ${isSelected ? "border-green-500 bg-green-50 dark:bg-green-950/20" : "hover:border-foreground/30"}`}
                onClick={() => toggleSelect(it.id)}
              >
                {/* Card image */}
                {it.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.image_url} alt={it.name} className="w-full h-auto rounded-lg" />
                ) : (
                  <div className="w-full aspect-[5/7] rounded-lg bg-muted/30 flex items-center justify-center">
                    <span className="text-xs opacity-20">No image</span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-1">
                  <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(it.id)} onClick={(e) => e.stopPropagation()} className="w-4 h-4 accent-green-600 flex-shrink-0" />
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${categoryColors[it.category]}`}>{it.category}</span>
                </div>

                <div className="font-semibold text-sm leading-tight line-clamp-2">{it.name}</div>

                {(it.set_name || it.card_number) && (
                  <div className="text-xs opacity-50 truncate">
                    {[it.set_name, it.card_number ? `#${it.card_number}` : ""].filter(Boolean).join(" · ")}
                  </div>
                )}

                {it.category === "slab" && it.grade && (
                  <span className={`self-start text-xs px-2 py-0.5 rounded-full ${gradeStyle(it.grade)}`}>
                    {it.grade}
                  </span>
                )}

                <div className="text-xs opacity-60 space-y-0.5">
                  <div>{consigner ? consigner.name : it.owner} • {it.status}</div>
                  {it.category === "single" && it.condition && <div>{it.condition}</div>}
                </div>

                <div className="text-xs space-y-0.5">
                  <div>Cost: {fmt(it.cost)}</div>
                  <div>Market: {fmt(it.market)}</div>
                </div>

                <div className="mt-auto pt-1">
                  <button
                    className="w-full text-xs py-2.5 rounded-lg border font-medium"
                    onClick={(e) => { e.stopPropagation(); openEdit(it); }}
                    disabled={busy}
                  >
                    Edit
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>

      {/* Grading section */}
      {gradingItems.length > 0 && (
        <div className="border rounded-xl overflow-hidden">
          <div className="px-3 py-2.5 border-b flex items-center gap-2">
            <span className="font-medium text-sm">Grading</span>
            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
              {gradingItems.length}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-3">
            {gradingItems.map((it) => (
              <div key={it.id} className="border rounded-xl p-3 flex flex-col gap-2">
                {it.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.image_url} alt={it.name} className="w-full h-auto rounded-lg" />
                ) : (
                  <div className="w-full aspect-[5/7] rounded-lg bg-muted/30 flex items-center justify-center">
                    <span className="text-xs opacity-20">No image</span>
                  </div>
                )}
                <div className="font-semibold text-sm leading-tight line-clamp-2">{it.name}</div>
                {(it.set_name || it.card_number) && (
                  <div className="text-xs opacity-60 truncate">
                    {[it.set_name, it.card_number ? `#${it.card_number}` : ""].filter(Boolean).join(" · ")}
                  </div>
                )}

                {/* Cost / Market */}
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <div className="bg-muted/30 rounded-lg px-2 py-1.5">
                    <div className="opacity-50 mb-0.5">Cost</div>
                    <div className="font-medium">{fmt(it.cost)}</div>
                  </div>
                  <div className="bg-muted/30 rounded-lg px-2 py-1.5">
                    <div className="opacity-50 mb-0.5">Market</div>
                    <div className="font-medium">{fmt(it.market)}</div>
                  </div>
                </div>

                {/* PSA 10 eBay lookup */}
                {(() => {
                  const psa = psa10Data[it.id];
                  if (!psa || (!psa.loading && !psa.fetched)) {
                    return (
                      <button
                        type="button"
                        className="w-full text-xs py-2 rounded-lg border font-medium border-yellow-300 text-yellow-700 hover:bg-yellow-50 dark:hover:bg-yellow-950/20"
                        onClick={() => fetchPsa10(it.id, it.name, it.set_name)}
                      >
                        Get PSA 10 Value
                      </button>
                    );
                  }
                  if (psa.loading) {
                    return (
                      <div className="w-full text-xs py-2 rounded-lg border text-center opacity-50">
                        Fetching PSA 10…
                      </div>
                    );
                  }
                  // Fetched
                  if (psa.medianPrice == null) {
                    return (
                      <div className="text-xs text-center opacity-50 py-1">
                        {psa.rateLimited ? "eBay rate limited — wait a moment" : "No PSA 10 sales found"}
                        <button
                          className="block w-full mt-1 underline"
                          onClick={() => fetchPsa10(it.id, it.name, it.set_name)}
                        >
                          Retry
                        </button>
                      </div>
                    );
                  }
                  const pct =
                    it.market != null && it.market > 0
                      ? ((psa.medianPrice - it.market) / it.market) * 100
                      : null;
                  return (
                    <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg px-2 py-1.5 text-xs">
                      <div className="flex items-center justify-between gap-1">
                        <span className="opacity-60">PSA 10 ({psa.count} sales)</span>
                        <button
                          className="opacity-40 hover:opacity-70 text-[10px]"
                          onClick={() => fetchPsa10(it.id, it.name, it.set_name)}
                          title="Refresh"
                        >
                          ↺
                        </button>
                      </div>
                      <div className="font-semibold text-yellow-800 dark:text-yellow-300 mt-0.5">
                        {fmt(psa.medianPrice)}
                        {pct != null && (
                          <span className={`ml-2 text-[11px] font-medium ${pct >= 0 ? "text-green-600" : "text-red-500"}`}>
                            {pct >= 0 ? "+" : ""}{pct.toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <div className="mt-auto pt-1">
                  <button
                    className="w-full text-xs py-2.5 rounded-lg border font-medium"
                    onClick={() => onQuickStatus(it.id, "inventory")}
                    disabled={busy}
                  >
                    Return to Inventory
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fixed bottom selection preview bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-background/95 backdrop-blur-sm border-t shadow-lg">
          <div className="px-3 py-2 overflow-x-auto">
            <div className="flex gap-2" style={{ minWidth: "max-content" }}>
              {selectedItems.map((it) => (
                <button
                  key={it.id}
                  className="flex flex-col items-center gap-0.5 w-14 group flex-shrink-0"
                  onClick={() => toggleSelect(it.id)}
                  title={`Deselect ${it.name}`}
                >
                  <div className="relative w-14">
                    {it.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.image_url} alt={it.name} className="w-14 h-auto rounded-md ring-2 ring-green-500 object-cover" />
                    ) : (
                      <div className="w-14 h-[3.5rem] rounded-md bg-muted/40 flex items-center justify-center ring-2 ring-green-500">
                        <span className="text-xs opacity-30">?</span>
                      </div>
                    )}
                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-foreground/80 text-background text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity leading-none select-none">
                      ×
                    </div>
                  </div>
                  <span className="text-[10px] opacity-50 w-full text-center truncate leading-tight">
                    {it.name.split(" ").slice(0, 2).join(" ")}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) closeEdit(); }}>
          <div className="bg-background border rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Edit item</div>
              <button className="text-sm opacity-60 px-2 py-1" onClick={closeEdit}>✕</button>
            </div>
            <ItemFormFields form={editForm} setForm={setEditForm} consigners={consigners} />
            <button
              type="button"
              className="w-full px-4 py-2 rounded-lg border text-sm font-medium border-purple-300 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/20"
              onClick={() => setEditImagePickerOpen(true)}
              disabled={busy}
            >
              Find Image
            </button>
            {editForm.category === "single" && editingItem?.status !== "grading" && (
              <button
                type="button"
                className="w-full px-4 py-2 rounded-lg border text-sm font-medium border-orange-300 text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/20"
                onClick={handleGradeItem}
                disabled={busy}
              >
                Send to Grading
              </button>
            )}
            {deleteConfirm ? (
              <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                <span className="text-sm flex-1 text-red-700">Delete this item?</span>
                <button
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium"
                  onClick={handleDeleteItem}
                  disabled={busy}
                >
                  Delete
                </button>
                <button
                  className="px-3 py-1.5 rounded-lg border text-sm"
                  onClick={() => setDeleteConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="w-full px-4 py-2 rounded-lg border text-sm font-medium border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                onClick={() => setDeleteConfirm(true)}
                disabled={busy}
              >
                Delete item
              </button>
            )}
            <div className="flex gap-2">
              <button className="flex-1 px-4 py-2 rounded-lg border font-medium" onClick={onSaveEdit} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
              <button className="px-4 py-2 rounded-lg border opacity-60" onClick={closeEdit} disabled={busy}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Mass edit modal */}
      {massEditOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setMassEditOpen(false); }}>
          <div className="bg-background border rounded-2xl w-full max-w-sm p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Edit {selectedIds.size} items</div>
              <button className="text-sm opacity-60 px-2 py-1" onClick={() => setMassEditOpen(false)}>✕</button>
            </div>
            <div className="text-xs opacity-50">Leave a field as &quot;— no change —&quot; to keep existing values.</div>
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
                className="flex-1 px-4 py-2 rounded-lg border font-medium disabled:opacity-40"
                onClick={onMassEdit}
                disabled={busy || (!massOwner && !massStatus && !massCategory)}
              >
                {busy ? "Saving…" : `Apply to ${selectedIds.size} items`}
              </button>
              <button className="px-4 py-2 rounded-lg border opacity-60" onClick={() => setMassEditOpen(false)} disabled={busy}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setDeleteOpen(false); }}>
          <div className="bg-background border rounded-2xl w-full max-w-sm p-4 space-y-4">
            <div className="font-semibold">Delete {selectedIds.size} item{selectedIds.size !== 1 ? "s" : ""}?</div>
            <div className="text-sm opacity-60">This cannot be undone.</div>
            <div className="flex gap-2">
              <button className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white font-medium disabled:opacity-40" onClick={onBulkDelete} disabled={busy}>
                {busy ? "Deleting…" : `Delete ${selectedIds.size} item${selectedIds.size !== 1 ? "s" : ""}`}
              </button>
              <button className="px-4 py-2 rounded-lg border opacity-60" onClick={() => setDeleteOpen(false)} disabled={busy}>Cancel</button>
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

            <div className="rounded-xl border overflow-hidden">
              {selectedItems.map((it, i) => {
                const consigner = it.consigner_id ? consignerMap.get(it.consigner_id) : null;
                const proportional = salePriceNum > 0 ? getProportionalPrice(it) : null;
                return (
                  <div key={it.id} className={`px-3 py-2 ${i > 0 ? "border-t" : ""}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium text-xs">{it.name}</div>
                        <div className="text-xs opacity-50">{it.category} • Market: {fmt(it.market)}</div>
                      </div>
                      <div className="text-xs font-semibold ml-3 shrink-0 text-green-600">
                        {proportional != null ? fmt(proportional) : "—"}
                      </div>
                    </div>
                    {consigner && proportional != null && (
                      <div className="text-xs opacity-50 mt-0.5">
                        {consigner.name} gets {fmt(proportional * consigner.rate)} · you keep {fmt(proportional * (1 - consigner.rate))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium">Total sale price ($)</label>
                {totalMarket > 0 && (
                  <button
                    type="button"
                    className="text-xs text-primary font-medium hover:underline"
                    onClick={() => setSalePrice(totalMarket.toFixed(2))}
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
              <div className="text-xs opacity-50 mt-1">Split proportionally by market value</div>
            </div>

            <div className="flex gap-2">
              <button className="flex-1 px-4 py-2 rounded-lg bg-green-600 text-white font-medium disabled:opacity-40" onClick={onConfirmSale} disabled={busy || salePriceNum <= 0}>
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
