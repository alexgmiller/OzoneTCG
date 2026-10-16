"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { subscribeWorkspaceTable } from "@/lib/supabase/realtime";
import { useToast, useConfirm, type PressPoint } from "@/components/ui";
import { createItems, deleteItem, deleteItems, updateItem, bulkPatchItems } from "./actions";
import type { SlabPrice, RawCardPrice } from "./InventoryServer";
import type { Status, ConsignerOption, Item, ItemForm, Psa10Entry, HistoryDuration } from "./types";
import { toNum, effectiveCost, blankForm, itemToForm, formToInput } from "./utils";
import { usePricing } from "./usePricing";
import { useViewMode } from "./useViewMode";
import { useInventoryView } from "./useInventoryView";
import { useSelection } from "./useSelection";
import { defaultFilters, countActiveFilters, type Filters } from "./inventoryView";
import { undoPatches, type ItemPatch } from "./bulkEdit";
import CSVImport from "./CSVImport";
import { InventoryHeader } from "./components/InventoryHeader";
import { InventoryFilters } from "./components/InventoryFilters";
import { InventoryGrid } from "./components/InventoryGrid";
import { InventoryListView } from "./components/InventoryListView";
import { InventoryEmpty } from "./components/InventoryEmpty";
import { ItemContextMenu } from "./components/ItemContextMenu";
import { PricingStatus } from "./components/PricingStatus";
import { PricingDetailModal } from "./components/PricingDetailModal";
import { RawPricingModal } from "./components/RawPricingModal";
import { ItemDetailModal } from "./components/ItemDetailModal";
import { EditItemSheet } from "./components/EditItemSheet";
import { BulkEditSheet } from "./components/BulkEditSheet";
import { SelectionHeader } from "./components/SelectionHeader";
import { SelectionBar } from "./components/SelectionBar";
import GradingSection from "./components/GradingSection";

// `items` holds in-stock rows plus the most recent sold rows; sold rows only render under the Sold filter.
// `focusId` (from ?focus=) opens that item's detail on arrival.
export default function InventoryClient({
  items, consigners, workspaceId, slabPrices, rawCardPrices, gradingCost = 20, focusId = null,
}: {
  items: Item[];
  consigners: ConsignerOption[];
  workspaceId: string;
  slabPrices: Record<string, SlabPrice>;
  rawCardPrices: Record<string, RawCardPrice>;
  gradingCost?: number;
  focusId?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  // Pricing (FMV, refresh, background loop) only ever runs over in-stock rows
  const activeItems = useMemo(() => items.filter((it) => it.status !== "sold"), [items]);
  const pricing = usePricing(activeItems, slabPrices, rawCardPrices);
  const { priceFor } = pricing;
  const [busy, setBusy] = useState(false);

  // ── View, filters, selection ──
  const [view, setView, viewReady] = useViewMode();
  const [filters, setFiltersState] = useState<Filters>(defaultFilters);
  const sel = useSelection(items);
  const setFilters = (patch: Partial<Filters>) => {
    // Switching pools drops the selection so bulk actions never mix sold and in-stock
    if (patch.status !== undefined && (patch.status === "sold") !== (filters.status === "sold")) sel.clearSelection();
    setFiltersState((f) => ({ ...f, ...patch }));
  };
  // Sold rows show what they sold for; everything else shows live market
  const priceOf = useCallback((it: Item) => (it.status === "sold" ? it.sold_price ?? null : priceFor(it)), [priceFor]);
  const costOf = useCallback((it: Item) => effectiveCost(it), []);
  const { displayedItems, summary, sold: soldFilter } = useInventoryView(items, filters, priceOf);
  const consignerMap = useMemo(() => new Map(consigners.map((c) => [c.id, c])), [consigners]);
  const activeCount = activeItems.filter((i) => i.status !== "grading").length;
  const soldCount = items.length - activeItems.length;

  // ── Sheets / menus ──
  const [editing, setEditing] = useState<{ mode: "edit"; item: Item } | { mode: "add" } | null>(null);
  const [editForm, setEditForm] = useState<ItemForm>(blankForm());
  const [editInitial, setEditInitial] = useState<ItemForm>(blankForm());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [contextTarget, setContextTarget] = useState<{ item: Item; at: PressPoint } | null>(null);

  // ── Detail / pricing modals ──
  const [detailItem, setDetailItem] = useState<Item | null>(null);
  const [inlineCostId, setInlineCostId] = useState<string | null>(null);
  const [inlineCostVal, setInlineCostVal] = useState("");
  const [pricingDetailItem, setPricingDetailItem] = useState<{ item: Item; slabKey: string } | null>(null);
  const [soldExpanded, setSoldExpanded] = useState(false);
  const [activeExpanded, setActiveExpanded] = useState(false);
  const [rawCardDetailItem, setRawCardDetailItem] = useState<Item | null>(null);
  const [historyDuration, setHistoryDuration] = useState<HistoryDuration>("90d");

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

  // ── Arrive on an item (Home's MOST VALUABLE tiles link here) ──
  useEffect(() => {
    if (!focusId) return;
    const it = items.find((i) => i.id === focusId);
    if (!it) return;
    setDetailItem(it);
    document.querySelector(`[data-item-id="${focusId}"]`)?.scrollIntoView({ block: "center" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  // ── Keep the same item in view when switching grid ↔ list ──
  const anchorId = useRef<string | null>(null);
  const switchView = (v: typeof view) => {
    const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-item-id]"));
    anchorId.current = rows.find((el) => el.getBoundingClientRect().bottom > 0)?.dataset.itemId ?? null;
    setView(v);
  };
  useLayoutEffect(() => {
    if (!anchorId.current) return;
    document.querySelector(`[data-item-id="${anchorId.current}"]`)?.scrollIntoView({ block: "start" });
    anchorId.current = null;
  }, [view]);

  // Runs a server action with busy state + error toast
  async function run(fn: () => Promise<unknown>, success?: string, action?: { label: string; onClick: () => void }) {
    setBusy(true);
    try {
      await fn();
      if (success) toast.success(success, action ? { action } : undefined);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }

  // ── Edit / add sheet ──
  function openEdit(it: Item) {
    const f = itemToForm(it);
    setEditForm(f); setEditInitial(f); setEditing({ mode: "edit", item: it }); setDetailItem(null);
  }
  function openAdd() {
    const f = blankForm();
    setEditForm(f); setEditInitial(f); setEditing({ mode: "add" });
  }
  async function onSaveSheet() {
    if (!editing || !editForm.name.trim()) return;
    const ok = editing.mode === "edit"
      ? await run(() => updateItem(editing.item.id, formToInput(editForm)), "Saved")
      : await run(() => createItems([formToInput(editForm)]), "Added to inventory");
    if (ok) setEditing(null);
  }
  const sheetFmv = editing?.mode === "edit" ? priceOf(editing.item) : toNum(editForm.market);

  async function onQuickStatus(id: string, status: Status) { await run(() => updateItem(id, { status })); }
  async function handleSaveInlineCost(id: string) {
    const n = toNum(inlineCostVal);
    setInlineCostId(null);
    setInlineCostVal("");
    if (n !== null) await run(() => updateItem(id, { cost: n }));
  }

  // ── Bulk actions ──
  function sellBundle() {
    const ids = Array.from(sel.selectedIds);
    if (ids.length === 0) return;
    router.push(`/protected/pos?mode=sell&items=${ids.join(",")}`);
  }
  async function onBulkApply(patches: { id: string; patch: ItemPatch }[], summary: string) {
    const before = sel.selectedItems;
    const ok = await run(() => bulkPatchItems(patches), summary, {
      label: "Undo",
      onClick: () => { void run(() => bulkPatchItems(undoPatches(before, patches)), "Undone"); },
    });
    if (!ok) return;
    setBulkOpen(false);
    sel.clearSelection();
  }
  async function onBulkDelete() {
    const n = sel.selectedIds.size;
    const ok = await confirm({ title: `Delete ${n} item${n !== 1 ? "s" : ""}?`, description: "This cannot be undone.", confirmLabel: "Delete", destructive: true });
    if (!ok) return;
    if (await run(() => deleteItems(Array.from(sel.selectedIds)), `Deleted ${n} item${n !== 1 ? "s" : ""}`)) sel.clearSelection();
  }

  const selectedFmv = sel.selectedItems.reduce((s, it) => s + (priceOf(it) ?? 0), 0);
  const allSelected = sel.selectedIds.size === displayedItems.length && displayedItems.length > 0;
  const listProps = {
    items: displayedItems, priceOf, costOf, selecting: sel.selecting, selectedIds: sel.selectedIds,
    onOpen: setDetailItem, onToggle: sel.toggleSelect,
    onContext: (item: Item, at: PressPoint) => setContextTarget({ item, at }),
  };

  return (
    <div className="w-full space-y-4">
      {sel.selecting ? (
        <SelectionHeader
          count={sel.selectedIds.size} fmv={selectedFmv} cost={sel.totalCost} allSelected={allSelected}
          onSelectAll={() => sel.selectAll(displayedItems.map((it) => it.id))} onExit={sel.clearSelection}
        />
      ) : (
        <InventoryHeader
          search={filters.search} setSearch={(v) => setFilters({ search: v })}
          onScan={() => router.push("/protected/scan")}
          view={view} setView={switchView}
          sort={filters.sort} setSort={(k) => setFilters({ sort: k })}
          onSelect={() => sel.startSelecting()} onAdd={openAdd}
          total={summary.total} count={displayedItems.length}
        />
      )}

      <InventoryFilters filters={filters} setFilters={setFilters} consigners={consigners} />

      {!soldFilter && <PricingStatus bgStatus={pricing.bgStatus} bgStaleCount={pricing.bgStaleCount} dailyCallCount={pricing.dailyCallCount} />}

      {(soldFilter ? soldCount : activeCount) === 0 || displayedItems.length === 0 ? (
        <InventoryEmpty
          totalCount={soldFilter ? soldCount : activeCount} soldFilter={soldFilter}
          onAdd={openAdd} onClearFilters={() => setFilters({ ...defaultFilters, sort: filters.sort })}
        />
      ) : !viewReady ? null : view === "grid" ? (
        <InventoryGrid {...listProps} />
      ) : (
        <InventoryListView {...listProps} sort={filters.sort} setSort={(k) => setFilters({ sort: k })} />
      )}

      {gradingItems.length > 0 && !soldFilter && countActiveFilters(filters) === 0 && (
        <GradingSection gradingItems={gradingItems} gradingCost={gradingCost} psa10Data={psa10Data} fetchPsa10={fetchPsa10} onQuickStatus={onQuickStatus} openEdit={openEdit} busy={busy} />
      )}

      {!soldFilter && !sel.selecting && (
        <div className="flex justify-end"><CSVImport consigners={consigners} /></div>
      )}

      {/* ── Mobile add FAB ── */}
      {!sel.selecting && !editing && (
        <button
          className="above-tabbar fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-bg transition-colors duration-150 hover:bg-accent-tint hover:text-accent md:hidden"
          onClick={openAdd}
          aria-label="Add item"
        >
          <Plus size={24} />
        </button>
      )}

      {sel.selecting && (
        <SelectionBar
          count={sel.selectedIds.size} busy={busy} soldSelected={sel.hasSoldSelected}
          onSell={sellBundle} onEdit={() => setBulkOpen(true)} onDelete={onBulkDelete}
        />
      )}

      <ItemContextMenu
        target={contextTarget} onClose={() => setContextTarget(null)}
        onEdit={openEdit} onSelect={(it) => sel.startSelecting(it.id)}
        onDelete={async (it) => { await run(() => deleteItem(it.id), "Item deleted"); }}
      />

      <EditItemSheet
        open={!!editing} mode={editing?.mode ?? "edit"}
        form={editForm} setForm={setEditForm} initial={editInitial}
        consigners={consigners} fmv={sheetFmv} busy={busy}
        onClose={() => setEditing(null)} onSave={onSaveSheet}
        onScanCert={() => router.push("/protected/scan")}
      />

      <BulkEditSheet
        open={bulkOpen} items={sel.selectedItems} consigners={consigners} fmvOf={priceOf} busy={busy}
        onClose={() => setBulkOpen(false)} onApply={onBulkApply}
      />

      {/* ── Detail + pricing modals ── */}
      {detailItem && (
        <ItemDetailModal
          item={detailItem}
          consigner={detailItem.consigner_id ? consignerMap.get(detailItem.consigner_id) ?? null : null}
          selected={sel.selectedIds.has(detailItem.id)}
          onClose={() => setDetailItem(null)}
          mergedSlabPrices={pricing.mergedSlabPrices} mergedRawCardPrices={pricing.mergedRawCardPrices} slabFMVData={pricing.slabFMVData}
          refreshing={!!pricing.refreshing[detailItem.id]}
          inlineCostId={inlineCostId} inlineCostVal={inlineCostVal} setInlineCostId={setInlineCostId} setInlineCostVal={setInlineCostVal}
          handleSaveInlineCost={handleSaveInlineCost} handleRefresh={pricing.refreshItem}
          openSlabComps={(it, slabKey) => { setPricingDetailItem({ item: it, slabKey }); setSoldExpanded(false); setActiveExpanded(false); }}
          openRawCardModal={(it) => { setRawCardDetailItem(it); setHistoryDuration("90d"); }}
          openEdit={openEdit} toggleSelect={sel.toggleSelect}
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
