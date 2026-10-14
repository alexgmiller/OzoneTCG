"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { subscribeWorkspaceTable } from "@/lib/supabase/realtime";
import { useToast, useConfirm } from "@/components/ui";
import CardSearchPicker, { type CardSearchResult } from "@/components/CardSearchPicker";
import { createItems, deleteItem, deleteItems, updateItem, markItemsAsSold, massUpdateItems, fetchCardData } from "./actions";
import type { SlabPrice, RawCardPrice } from "./InventoryServer";
import type { Status, ConsignerOption, Item, ItemForm, StagedItem, Psa10Entry, HistoryDuration } from "./types";
import { toNum, effectiveCost, blankForm, itemToForm, formToInput, nullLast } from "./utils";
import { usePricing } from "./usePricing";
import { PricingDetailModal } from "./components/PricingDetailModal";
import { RawPricingModal } from "./components/RawPricingModal";
import { ItemDetailModal } from "./components/ItemDetailModal";
import { EditItemModal, MassEditModal, SellModal, BulkCostModal } from "./components/InventoryModals";
import { InventoryFilters, defaultFilters, countActiveFilters, type Filters } from "./components/InventoryFilters";
import { InventorySummary } from "./components/InventorySummary";
import { InventoryList } from "./components/InventoryList";
import { SelectionBar } from "./components/SelectionBar";
import GradingSection from "./components/GradingSection";
import AddItemPanel from "./components/AddItemPanel";

// `items` holds active rows plus the most recent sold rows; sold rows only render under the Sold filter.
export default function InventoryClient({
  items,
  consigners,
  workspaceId,
  slabPrices,
  rawCardPrices,
  gradingCost = 20,
}: {
  items: Item[];
  consigners: ConsignerOption[];
  workspaceId: string;
  slabPrices: Record<string, SlabPrice>;
  rawCardPrices: Record<string, RawCardPrice>;
  gradingCost?: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  // Pricing (FMV, refresh, background loop) only ever runs over active rows
  const activeItems = useMemo(() => items.filter((it) => it.status !== "sold"), [items]);
  const pricing = usePricing(activeItems, slabPrices, rawCardPrices);
  const { priceFor } = pricing;
  const [busy, setBusy] = useState(false);

  // ── Panels / pickers ──
  const [addOpen, setAddOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFiltersState] = useState<Filters>(defaultFilters);
  const soldFilter = filters.status === "sold";
  const setFilters = (patch: Partial<Filters>) => {
    // Switching between active and sold pools drops the selection so bulk actions never mix them
    if (patch.status !== undefined && (patch.status === "sold") !== soldFilter) clearSelection();
    setFiltersState((f) => ({ ...f, ...patch }));
  };
  const [cardSearchOpen, setCardSearchOpen] = useState(false);
  const [editImagePickerOpen, setEditImagePickerOpen] = useState(false);
  const [findConfirmed, setFindConfirmed] = useState<string | null>(null);

  // ── Forms ──
  const [addForm, setAddForm] = useState<ItemForm>(blankForm());
  const [stagedItems, setStagedItems] = useState<StagedItem[]>([]);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editForm, setEditForm] = useState<ItemForm>(blankForm());
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // ── Detail / pricing modals ──
  const [detailItem, setDetailItem] = useState<Item | null>(null);
  const [inlineCostId, setInlineCostId] = useState<string | null>(null);
  const [inlineCostVal, setInlineCostVal] = useState("");
  const [pricingDetailItem, setPricingDetailItem] = useState<{ item: Item; slabKey: string } | null>(null);
  const [soldExpanded, setSoldExpanded] = useState(false);
  const [activeExpanded, setActiveExpanded] = useState(false);
  const [rawCardDetailItem, setRawCardDetailItem] = useState<Item | null>(null);
  const [historyDuration, setHistoryDuration] = useState<HistoryDuration>("90d");

  // ── Selection + bulk actions ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sellOpen, setSellOpen] = useState(false);
  const [salePrice, setSalePrice] = useState("");
  const [manualPrices, setManualPrices] = useState<Record<string, string>>({});
  const [massEditOpen, setMassEditOpen] = useState(false);
  const [massOwner, setMassOwner] = useState("");
  const [massStatus, setMassStatus] = useState("");
  const [massCategory, setMassCategory] = useState("");
  const [bulkCostOpen, setBulkCostOpen] = useState(false);
  const [bulkCostVal, setBulkCostVal] = useState("");
  const [bulkCostSplit, setBulkCostSplit] = useState(false);

  // ── Grading (PSA 10 lookups) ──
  const [psa10Data, setPsa10Data] = useState<Record<string, Psa10Entry>>({});
  const gradingItems = useMemo(() => activeItems.filter((it) => it.status === "grading"), [activeItems]);

  async function fetchPsa10(id: string, name: string, setName?: string | null) {
    setPsa10Data((prev) => ({ ...prev, [id]: { medianPrice: null, count: 0, loading: true, fetched: false } }));
    try {
      const res = await fetch("/api/ebay-psa10", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, setName }) });
      const json = await res.json();
      if (!res.ok) {
        setPsa10Data((prev) => ({ ...prev, [id]: { medianPrice: null, count: 0, loading: false, fetched: true, rateLimited: json.status === 500 } }));
        return;
      }
      setPsa10Data((prev) => ({ ...prev, [id]: { medianPrice: json.medianPrice ?? null, count: json.count ?? 0, loading: false, fetched: true } }));
    } catch {
      setPsa10Data((prev) => ({ ...prev, [id]: { medianPrice: null, count: 0, loading: false, fetched: true } }));
    }
  }

  useEffect(() => {
    for (const it of gradingItems) if (!psa10Data[it.id]) fetchPsa10(it.id, it.name, it.set_name);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gradingItems]);

  useEffect(() => {
    const { supabase, channel } = subscribeWorkspaceTable({ workspaceId, table: "items", onChange: () => router.refresh() });
    return () => { supabase.removeChannel(channel); };
  }, [router, workspaceId]);

  const consignerMap = useMemo(() => new Map(consigners.map((c) => [c.id, c])), [consigners]);

  // Sold rows show what they sold for; everything else shows live market
  const priceOf = useCallback((it: Item) => (it.status === "sold" ? it.sold_price ?? null : priceFor(it)), [priceFor]);

  // ── Filter + sort ──
  // "active" lists inventory rows here; grading rows get their own section below.
  const displayedItems = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const sold = filters.status === "sold";
    const dateOf = (it: Item) => (sold ? it.sold_at ?? it.created_at : it.created_at);
    const result = items.filter((it) => {
      if (filters.status === "active" ? it.status !== "inventory" : it.status !== filters.status) return false;
      if (q && !it.name.toLowerCase().includes(q) && !(it.set_name ?? "").toLowerCase().includes(q)) return false;
      if (filters.category !== "all" && it.category !== filters.category) return false;
      if (filters.consigner === "none" && it.owner === "consigner") return false;
      if (filters.consigner !== "all" && filters.consigner !== "none" && it.consigner_id !== filters.consigner) return false;
      return true;
    });
    result.sort((a, b) => {
      switch (filters.sort) {
        case "name-asc":    return a.name.localeCompare(b.name);
        case "name-desc":   return b.name.localeCompare(a.name);
        case "market-asc":  return nullLast(priceOf(a), priceOf(b), true);
        case "market-desc": return nullLast(priceOf(a), priceOf(b), false);
        case "cost-asc":    return nullLast(effectiveCost(a), effectiveCost(b), true);
        case "cost-desc":   return nullLast(effectiveCost(a), effectiveCost(b), false);
        case "date-asc":    return dateOf(a).localeCompare(dateOf(b));
        default:            return dateOf(b).localeCompare(dateOf(a));
      }
    });
    return result;
  }, [items, filters, priceOf]);

  // ── Value summary (profit only over items with a known cost) ──
  const summary = useMemo(() => {
    let total = 0, totalCost = 0, costedCount = 0, costedValue = 0;
    for (const it of displayedItems) {
      const price = priceFor(it) ?? 0;
      const value = it.category === "sealed" ? price * (it.quantity ?? 1) : price;
      total += value;
      const ec = effectiveCost(it);
      if (ec != null) { totalCost += ec; costedCount++; costedValue += value; }
    }
    const profit = costedValue - totalCost;
    return { total, totalCost, costedCount, totalCount: displayedItems.length, profit, profitPct: totalCost > 0 ? (profit / totalCost) * 100 : null };
  }, [displayedItems, priceFor]);

  const activeCount = activeItems.filter((i) => i.status !== "grading").length;
  const soldCount = items.length - activeItems.length;
  const listLabel = soldFilter
    ? (displayedItems.length < soldCount ? `${displayedItems.length} of ${soldCount} sold` : `${soldCount} sold`)
    : countActiveFilters(filters) > 0 ? `${displayedItems.length} of ${activeCount} items` : `${activeCount} items`;
  const selectedItems = useMemo(() => items.filter((it) => selectedIds.has(it.id)), [items, selectedIds]);
  const hasSoldSelected = selectedItems.some((it) => it.status === "sold");
  const totalMarket = selectedItems.reduce((s, it) => s + (it.market ?? 0), 0);
  const salePriceNum = parseFloat(salePrice) || 0;

  // ── Sell pricing: manual locks + proportional auto-fill ──
  function autoPrices(total: number, manual: Record<string, string>) {
    const manualSum = selectedItems.reduce((s, it) => s + (manual[it.id] !== undefined ? parseFloat(manual[it.id]) || 0 : 0), 0);
    const autoItems = selectedItems.filter((it) => manual[it.id] === undefined);
    const autoMarketSum = autoItems.reduce((s, it) => s + (it.market ?? 0), 0);
    const remaining = total - manualSum;
    const priceOf = (it: Item) => autoMarketSum > 0
      ? Math.round(((it.market ?? 0) / autoMarketSum) * remaining * 100) / 100
      : autoItems.length > 0 ? Math.round((remaining / autoItems.length) * 100) / 100 : 0;
    return { manualSum, autoItems, priceOf };
  }
  function getCardPrice(it: Item): number {
    if (manualPrices[it.id] !== undefined) return parseFloat(manualPrices[it.id]) || 0;
    return autoPrices(salePriceNum, manualPrices).priceOf(it);
  }
  function updateCardPrice(id: string, value: string) {
    const next = { ...manualPrices, [id]: value };
    setManualPrices(next);
    const { manualSum, autoItems, priceOf } = autoPrices(parseFloat(salePrice) || 0, next);
    setSalePrice((manualSum + autoItems.reduce((s, it) => s + priceOf(it), 0)).toFixed(2));
  }
  function resetCardPrice(id: string) {
    const next = { ...manualPrices };
    delete next[id];
    setManualPrices(next);
  }

  // ── Selection ──
  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  }
  function clearSelection() {
    setSelectedIds(new Set());
    setSellOpen(false);
    setSalePrice("");
    setManualPrices({});
  }
  function selectAll() {
    if (selectedIds.size === displayedItems.length && displayedItems.length > 0) clearSelection();
    else setSelectedIds(new Set(displayedItems.map((it) => it.id)));
  }

  // ── Add / edit ──
  function openEdit(it: Item) { setEditingItem(it); setEditForm(itemToForm(it)); }
  function closeEdit() { setEditingItem(null); setDeleteConfirm(false); }

  async function onCardSearchResult(data: CardSearchResult) {
    setAddForm((prev) => ({
      ...prev, name: data.name, setName: data.setName, cardNumber: data.cardNumber,
      market: data.market != null ? String(data.market) : prev.market, imageUrl: data.imageUrl ?? prev.imageUrl,
    }));
    setFindConfirmed([data.name, data.setName, data.cardNumber ? `#${data.cardNumber}` : ""].filter(Boolean).join(" · "));
    if (data.name) {
      const result = await fetchCardData(data.name, data.setName || null, data.cardNumber || null);
      if (result?.imageUrl) setAddForm((prev) => ({ ...prev, imageUrl: result.imageUrl! }));
    }
  }

  async function onEditImageResult(data: CardSearchResult) {
    setEditImagePickerOpen(false);
    if (!data.imageUrl || !editingItem) return;
    setEditForm((prev) => ({ ...prev, imageUrl: data.imageUrl! }));
    await run(() => updateItem(editingItem.id, { image_url: data.imageUrl }));
  }

  // Runs a server action with busy state + error toast
  async function run(fn: () => Promise<unknown>, success?: string) {
    setBusy(true);
    try {
      await fn();
      if (success) toast.success(success);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function onAddToList() {
    if (!addForm.name.trim()) return;
    setStagedItems((prev) => [...prev, { ...addForm, _id: crypto.randomUUID() }]);
    setAddForm(blankForm());
    setFindConfirmed(null);
  }

  async function onSaveAll() {
    if (stagedItems.length === 0) return;
    if (await run(() => createItems(stagedItems.map(formToInput)), `Added ${stagedItems.length} item${stagedItems.length !== 1 ? "s" : ""}`)) setStagedItems([]);
  }

  async function onSaveEdit() {
    if (!editingItem || !editForm.name.trim()) return;
    if (await run(() => updateItem(editingItem.id, formToInput(editForm)), "Saved")) closeEdit();
  }

  async function onQuickStatus(id: string, status: Status) { await run(() => updateItem(id, { status })); }
  async function handleGradeItem() {
    if (!editingItem) return;
    if (await run(() => updateItem(editingItem.id, { status: "grading" }), "Sent to grading")) closeEdit();
  }
  async function handleDeleteItem() {
    if (!editingItem) return;
    if (await run(() => deleteItem(editingItem.id), "Item deleted")) closeEdit();
  }
  async function handleSaveInlineCost(id: string) {
    const n = toNum(inlineCostVal);
    setInlineCostId(null);
    setInlineCostVal("");
    if (n !== null) await run(() => updateItem(id, { cost: n }));
  }

  // ── Bulk actions ──
  async function onMassEdit() {
    const patch: Record<string, string | null> = {};
    if (massOwner.startsWith("consigner:")) { patch.owner = "consigner"; patch.consigner_id = massOwner.slice("consigner:".length); }
    else if (massOwner) { patch.owner = massOwner; patch.consigner_id = null; }
    if (massStatus) patch.status = massStatus;
    if (massCategory) patch.category = massCategory;
    if (Object.keys(patch).length === 0) return;
    if (await run(() => massUpdateItems(Array.from(selectedIds), patch), `Updated ${selectedIds.size} items`)) {
      setMassEditOpen(false); setMassOwner(""); setMassStatus(""); setMassCategory("");
    }
  }

  async function onConfirmSale() {
    if (selectedIds.size === 0 || salePriceNum <= 0 || hasSoldSelected) return;
    const perCardPrices: Record<string, number> = {};
    for (const it of selectedItems) perCardPrices[it.id] = getCardPrice(it);
    if (await run(() => markItemsAsSold(Array.from(selectedIds), salePriceNum, perCardPrices), `Sold ${selectedIds.size} item${selectedIds.size !== 1 ? "s" : ""}`)) clearSelection();
  }

  async function onBulkDelete() {
    const n = selectedIds.size;
    const ok = await confirm({ title: `Delete ${n} item${n !== 1 ? "s" : ""}?`, description: "This cannot be undone.", confirmLabel: "Delete", destructive: true });
    if (!ok) return;
    if (await run(() => deleteItems(Array.from(selectedIds)), `Deleted ${n} item${n !== 1 ? "s" : ""}`)) clearSelection();
  }

  async function onBulkSetCost() {
    const n = toNum(bulkCostVal);
    if (n === null || n < 0 || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const costEach = bulkCostSplit ? Math.round((n / ids.length) * 100) / 100 : n;
    if (await run(() => Promise.all(ids.map((id) => updateItem(id, { cost: costEach }))), "Costs updated")) {
      setBulkCostOpen(false); setBulkCostVal(""); setBulkCostSplit(false);
    }
  }

  async function onBulkRefresh() {
    if (hasSoldSelected) return;
    await run(() => pricing.refreshMany(selectedItems), "Prices refreshed");
  }

  const openAdd = () => { setAddForm(blankForm()); setAddOpen(true); };

  return (
    <div className={`w-full space-y-4 ${selectedIds.size > 0 ? "pb-48" : ""}`}>
      <CardSearchPicker
        open={cardSearchOpen || editImagePickerOpen}
        onClose={() => { setCardSearchOpen(false); setEditImagePickerOpen(false); }}
        onResult={editImagePickerOpen ? onEditImageResult : onCardSearchResult}
        initialName={editImagePickerOpen ? editForm.name : addForm.name}
        initialSetName={editImagePickerOpen ? editForm.setName : addForm.setName}
        initialCardNumber={editImagePickerOpen ? editForm.cardNumber : addForm.cardNumber}
      />

      <AddItemPanel
        addOpen={addOpen}
        setAddOpen={setAddOpen}
        consigners={consigners}
        addForm={addForm}
        setAddForm={setAddForm}
        setFindConfirmed={setFindConfirmed}
        findConfirmed={findConfirmed}
        handleAddFormFind={() => { setAddOpen(true); setCardSearchOpen(true); }}
        onAddToList={onAddToList}
        stagedItems={stagedItems}
        setStagedItems={setStagedItems}
        onSaveAll={onSaveAll}
        busy={busy}
      />

      <InventoryFilters filters={filters} setFilters={setFilters} open={filtersOpen} setOpen={setFiltersOpen} consigners={consigners} />

      {activeCount > 0 && !soldFilter && (
        <InventorySummary summary={summary} bgStatus={pricing.bgStatus} bgStaleCount={pricing.bgStaleCount} dailyCallCount={pricing.dailyCallCount} />
      )}

      {/* ── List header ── */}
      <div className="flex min-h-11 items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-neutral tabular-nums">{listLabel}</span>
        {displayedItems.length > 0 && (
          <button className="h-11 px-2 text-sm font-medium text-accent-primary" onClick={selectAll}>
            {selectedIds.size === displayedItems.length ? "Deselect all" : "Select all"}
          </button>
        )}
      </div>

      <InventoryList
        items={displayedItems}
        totalCount={soldFilter ? soldCount : activeCount}
        soldFilter={soldFilter}
        priceFor={priceOf}
        consignerMap={consignerMap}
        selectedIds={selectedIds}
        refreshingIds={pricing.refreshing}
        toggleSelect={toggleSelect}
        openDetail={setDetailItem}
        onAdd={openAdd}
        onClearFilters={() => setFilters({ ...defaultFilters, sort: filters.sort })}
      />

      {gradingItems.length > 0 && !soldFilter && (
        <GradingSection gradingItems={gradingItems} gradingCost={gradingCost} psa10Data={psa10Data} fetchPsa10={fetchPsa10} onQuickStatus={onQuickStatus} openEdit={openEdit} busy={busy} />
      )}

      {/* ── Mobile add FAB ── */}
      {selectedIds.size === 0 && !addOpen && (
        <button
          className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent-primary text-primary-foreground transition-colors duration-150 hover:bg-accent-primary-hover md:hidden"
          onClick={() => { openAdd(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          aria-label="Add item"
        >
          <Plus size={24} />
        </button>
      )}

      {selectedIds.size > 0 && (
        <SelectionBar
          count={selectedIds.size}
          busy={busy}
          soldSelected={hasSoldSelected}
          onSell={() => setSellOpen(true)}
          onRefresh={onBulkRefresh}
          onSetCost={() => setBulkCostOpen(true)}
          onEdit={() => setMassEditOpen(true)}
          onDelete={onBulkDelete}
          onClear={clearSelection}
        />
      )}

      {/* ── Modals ── */}
      {detailItem && (
        <ItemDetailModal
          item={detailItem}
          consigner={detailItem.consigner_id ? consignerMap.get(detailItem.consigner_id) ?? null : null}
          selected={selectedIds.has(detailItem.id)}
          onClose={() => setDetailItem(null)}
          mergedSlabPrices={pricing.mergedSlabPrices}
          mergedRawCardPrices={pricing.mergedRawCardPrices}
          slabFMVData={pricing.slabFMVData}
          refreshing={!!pricing.refreshing[detailItem.id]}
          inlineCostId={inlineCostId}
          inlineCostVal={inlineCostVal}
          setInlineCostId={setInlineCostId}
          setInlineCostVal={setInlineCostVal}
          handleSaveInlineCost={handleSaveInlineCost}
          handleRefresh={pricing.refreshItem}
          openSlabComps={(it, slabKey) => { setPricingDetailItem({ item: it, slabKey }); setSoldExpanded(false); setActiveExpanded(false); }}
          openRawCardModal={(it) => { setRawCardDetailItem(it); setHistoryDuration("90d"); }}
          openEdit={openEdit}
          toggleSelect={toggleSelect}
        />
      )}
      {editingItem && (
        <EditItemModal
          editingItem={editingItem} editForm={editForm} setEditForm={setEditForm} consigners={consigners} busy={busy}
          closeEdit={closeEdit} setEditImagePickerOpen={setEditImagePickerOpen} handleGradeItem={handleGradeItem}
          deleteConfirm={deleteConfirm} setDeleteConfirm={setDeleteConfirm} handleDeleteItem={handleDeleteItem} onSaveEdit={onSaveEdit}
        />
      )}
      {massEditOpen && (
        <MassEditModal
          selectedIds={selectedIds} setMassEditOpen={setMassEditOpen} massOwner={massOwner} setMassOwner={setMassOwner}
          massStatus={massStatus} setMassStatus={setMassStatus} massCategory={massCategory} setMassCategory={setMassCategory}
          consigners={consigners} busy={busy} onMassEdit={onMassEdit}
        />
      )}
      {sellOpen && (
        <SellModal
          selectedItems={selectedItems} consignerMap={consignerMap} manualPrices={manualPrices} getCardPrice={getCardPrice}
          salePrice={salePrice} salePriceNum={salePriceNum} totalMarket={totalMarket} setSellOpen={setSellOpen}
          resetCardPrice={resetCardPrice} updateCardPrice={updateCardPrice} setSalePrice={setSalePrice} setManualPrices={setManualPrices}
          busy={busy} onConfirmSale={onConfirmSale}
        />
      )}
      {bulkCostOpen && (
        <BulkCostModal
          selectedIds={selectedIds} setBulkCostOpen={setBulkCostOpen} bulkCostVal={bulkCostVal} setBulkCostVal={setBulkCostVal}
          bulkCostSplit={bulkCostSplit} setBulkCostSplit={setBulkCostSplit} busy={busy} onBulkSetCost={onBulkSetCost}
        />
      )}
      {pricingDetailItem && (
        <PricingDetailModal
          pricingDetailItem={pricingDetailItem} mergedSlabPrices={pricing.mergedSlabPrices} slabRefreshing={pricing.refreshing}
          slabFMVData={pricing.slabFMVData} soldExpanded={soldExpanded} setSoldExpanded={setSoldExpanded}
          activeExpanded={activeExpanded} setActiveExpanded={setActiveExpanded} setPricingDetailItem={setPricingDetailItem}
          handleRefreshSlabPrice={pricing.handleRefreshSlabPrice}
        />
      )}
      {rawCardDetailItem && (
        <RawPricingModal
          rawCardDetailItem={rawCardDetailItem} setRawCardDetailItem={setRawCardDetailItem} mergedRawCardPrices={pricing.mergedRawCardPrices}
          rawCardRefreshing={pricing.refreshing} historyDuration={historyDuration} setHistoryDuration={setHistoryDuration}
          handleRefreshRawCardPrice={pricing.handleRefreshRawCardPrice}
        />
      )}
    </div>
  );
}
