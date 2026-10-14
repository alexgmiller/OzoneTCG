"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { subscribeWorkspaceTable } from "@/lib/supabase/realtime";
import { useConfirm, useToast } from "@/components/ui";
import { ExpenseForm, type ExpenseFormPayload } from "@/components/expenses/ExpenseForm";
import { YearEndReadinessPill } from "@/components/expenses/YearEndReadinessPill";
import { compressImage } from "@/components/expenses/compressImage";
import {
  addExpense, deleteExpense, updateExpense, uploadExpenseReceipt,
  type DocType, type ExpenseCategory, type SavedLocation,
} from "./actions";
import type { ExpenseRow, ShowSessionSummary } from "./ExpensesServer";
import {
  DEFAULT_FILTERS, RECEIPT_IRS_THRESHOLD, ShowPill, catMeta, fmtDate, type FilterState,
} from "./components/expenseMeta";
import { DocsBanner, DocsModal } from "./components/DocsBanner";
import { ExpenseStats } from "./components/ExpenseStats";
import { ExpenseFilters } from "./components/ExpenseFilters";
import { ExpenseList, type ExpenseGroup } from "./components/ExpenseList";

// ── Client ────────────────────────────────────────────────────────────────────

export default function ExpensesClient({
  workspaceId,
  initialExpenses,
  showSessions,
  homeAddress = null,
  savedLocations = [],
}: {
  workspaceId: string;
  initialExpenses: ExpenseRow[];
  showSessions: ShowSessionSummary[];
  homeAddress?: string | null;
  savedLocations?: SavedLocation[];
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];

  // ── State ────────────────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [formCategory, setFormCategory] = useState<ExpenseCategory>("other");
  const [editingExpense, setEditingExpense] = useState<ExpenseRow | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [docsExplained, setDocsExplained] = useState(true);
  const [docsModalOpen, setDocsModalOpen] = useState(false);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingExpenseIdRef = useRef<string | null>(null);

  useEffect(() => {
    setDocsExplained(!!localStorage.getItem("expense_docs_explained"));
  }, []);

  function dismissDocsBanner() {
    localStorage.setItem("expense_docs_explained", "1");
    setDocsExplained(true);
  }

  // ── Realtime ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const { supabase, channel } = subscribeWorkspaceTable({
      workspaceId,
      table: "expenses",
      onChange: () => router.refresh(),
    });
    return () => { supabase.removeChannel(channel); };
  }, [router, workspaceId]);

  // ── Derived: filtered & grouped ──────────────────────────────────────────
  const isHistoricalYear = selectedYear !== currentYear;
  const hasActiveFilters =
    filters.category !== "all" || filters.show !== "all" || filters.paidBy !== "all";

  const filtered = useMemo(() => {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const yearStart = `${selectedYear}-01-01`;
    const yearEnd   = `${selectedYear}-12-31`;
    return initialExpenses.filter((e) => {
      if (filters.category !== "all" && e.category !== filters.category) return false;
      if (filters.show === "_none" && e.show_session_id) return false;
      if (filters.show !== "all" && filters.show !== "_none" && e.show_session_id !== filters.show) return false;
      if (filters.paidBy !== "all" && e.paid_by !== filters.paidBy) return false;
      // Historical year: show the full selected year, ignore dateRange
      if (isHistoricalYear) {
        if (e.expense_date < yearStart || e.expense_date > yearEnd) return false;
      } else {
        if (filters.dateRange === "month" && e.expense_date < monthStart) return false;
        if (filters.dateRange === "year" && e.expense_date < yearStart) return false;
      }
      return true;
    });
  }, [initialExpenses, filters, selectedYear, isHistoricalYear]);

  const totals = useMemo(() => {
    const gross = filtered.reduce((s, e) => s + e.cost, 0);
    const deductible = filtered.reduce((s, e) => s + e.cost * e.deductible_percentage / 100, 0);
    const mileageTotal = filtered
      .filter((e) => e.category === "mileage" && e.mileage_miles)
      .reduce((s, e) => s + (e.mileage_miles ?? 0), 0);
    const missingReceiptCount = filtered.filter(
      (e) => e.category !== "mileage" && !e.receipt_url && !e.documentation_notes && e.cost >= RECEIPT_IRS_THRESHOLD,
    ).length;
    return { gross, deductible, mileageTotal, missingReceiptCount };
  }, [filtered]);

  const tripCount = filtered.filter((e) => e.category === "mileage").length;

  // Today's show session (if any) powers the LIVE pill in the header.
  const activeShow = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return showSessions.find((s) => s.date === today) ?? null;
  }, [showSessions]);

  // Top-5 categories for the breakdown strip under the stat cards.
  const categoryCounts = useMemo(() => {
    const counts = new Map<ExpenseCategory, number>();
    for (const e of filtered) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([cat, count]) => ({ cat, count }));
  }, [filtered]);

  const grouped = useMemo<ExpenseGroup[]>(() => {
    if (filters.groupBy === "flat") return [{ key: "all", label: "", items: filtered }];
    const map = new Map<string, ExpenseRow[]>();
    for (const e of filtered) {
      const key = filters.groupBy === "category" ? e.category : (e.show_session_id ?? "_none");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries()).map(([key, items]) => {
      if (filters.groupBy === "category") {
        return { key, label: catMeta(key as ExpenseCategory).label, items };
      }
      const show = showSessions.find((s) => s.id === key);
      return { key, label: show ? `${show.name} (${fmtDate(show.date)})` : "No show", items };
    });
  }, [filtered, filters.groupBy, showSessions]);

  // ── Mileage helpers ──────────────────────────────────────────────────────
  const mileageExpenses = useMemo(
    () => initialExpenses.filter((e) => e.category === "mileage"),
    [initialExpenses],
  );

  const yearMileage = useMemo(() => {
    const yr = String(currentYear);
    return mileageExpenses
      .filter((e) => e.expense_date.startsWith(yr))
      .reduce((s, e) => s + (e.mileage_miles ?? 0), 0);
  }, [mileageExpenses, currentYear]);

  // When filtered to a specific show, offer to re-use the last mileage entry
  const lastShowMileage = useMemo(() => {
    if (filters.show === "all" || filters.show === "_none") return undefined;
    const last = mileageExpenses
      .filter((e) => e.show_session_id === filters.show && e.mileage_miles)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (!last?.mileage_miles) return undefined;
    return { miles: String(last.mileage_miles), description: last.description ?? "" };
  }, [mileageExpenses, filters.show]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function openQuickAdd(category: ExpenseCategory) {
    setFormCategory(category);
    setEditingExpense(null);
    setFormOpen(true);
  }

  function openEdit(e: ExpenseRow) {
    setFormCategory(e.category);
    setEditingExpense(e);
    setFormOpen(true);
  }

  function openEditById(id: string) {
    const expense = initialExpenses.find((e) => e.id === id);
    if (expense) openEdit(expense);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingExpense(null);
  }

  async function handleSave(payload: ExpenseFormPayload): Promise<string | null> {
    if (editingExpense) {
      await updateExpense(editingExpense.id, payload);
      router.refresh();
      toast.success("Expense updated");
      return null;
    }
    const { id } = await addExpense(payload);
    router.refresh();
    toast.success("Expense added");
    return id;
  }

  async function handleDelete(e: ExpenseRow) {
    const ok = await confirm({
      title: "Delete expense?",
      description: "This expense will be permanently removed.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteExpense(e.id);
      router.refresh();
      toast.success("Expense deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete expense");
    }
  }

  function handleReceiptPick(expenseId: string) {
    pendingExpenseIdRef.current = expenseId;
    fileInputRef.current?.click();
  }

  async function handleReceiptFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const expenseId = pendingExpenseIdRef.current;
    if (!file || !expenseId) return;
    e.target.value = "";
    setUploadingFor(expenseId);
    try {
      const compressed = await compressImage(file, 500 * 1024);
      const fd = new FormData();
      fd.append("file", compressed);
      await uploadExpenseReceipt(expenseId, fd);
      router.refresh();
      toast.success("Documentation attached");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingFor(null);
      pendingExpenseIdRef.current = null;
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 overflow-x-hidden">
      {/* Hidden file input for row-level receipt attachment */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleReceiptFile}
      />

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold leading-tight">Expenses</h1>
            {activeShow && <ShowPill name={activeShow.name} live />}
          </div>
          {isHistoricalYear && (
            <span className="text-xs text-warning">Viewing historical data</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/protected/expenses/tax-report"
            className="inline-flex h-11 items-center rounded-lg border border-accent-primary-border px-3 text-sm text-accent-primary transition-colors duration-150 hover:bg-accent-primary-soft"
          >
            Tax Report →
          </Link>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="h-11 rounded-lg border border-border bg-background px-3 font-mono text-sm tabular-nums text-foreground"
            aria-label="Year"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Readiness row ── */}
      <div className="flex items-center justify-between gap-2">
        {docsExplained ? (
          <button
            onClick={() => setDocsModalOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:text-foreground"
            aria-label="About documentation"
          >
            <Info size={16} />
          </button>
        ) : <span />}
        <YearEndReadinessPill expenses={initialExpenses} onEditExpense={openEditById} />
      </div>

      {!docsExplained && <DocsBanner onDismiss={dismissDocsBanner} />}
      <DocsModal open={docsModalOpen} onClose={() => setDocsModalOpen(false)} />

      <ExpenseStats
        totals={totals}
        expenseCount={filtered.length}
        tripCount={tripCount}
        categoryCounts={categoryCounts}
        activeCategory={filters.category}
        onPickCategory={(c) => setFilters((f) => ({ ...f, category: c }))}
        yearMileage={yearMileage}
      />

      <ExpenseFilters
        filters={filters}
        onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
        showSessions={showSessions}
        isHistoricalYear={isHistoricalYear}
        onQuickAdd={openQuickAdd}
        shownCount={filtered.length}
        totalCount={initialExpenses.length}
      />

      <ExpenseList
        groups={grouped}
        showGroupLabels={filters.groupBy !== "flat"}
        uploadingFor={uploadingFor}
        hasActiveFilters={hasActiveFilters}
        onLogFirst={() => openQuickAdd("meals")}
        onEdit={openEdit}
        onDelete={handleDelete}
        onReceiptPick={handleReceiptPick}
        onLightbox={setLightboxUrl}
      />

      {/* ── Add / Edit form ── */}
      {formOpen && (
        <ExpenseForm
          onClose={closeForm}
          onSave={handleSave}
          showSessions={showSessions}
          defaultCategory={formCategory}
          lastShowMileage={!editingExpense ? lastShowMileage : undefined}
          existingPhotoUrl={editingExpense?.receipt_url ?? undefined}
          homeAddress={homeAddress}
          savedLocations={savedLocations}
          initialValues={
            editingExpense
              ? {
                  category: editingExpense.category,
                  description: editingExpense.description ?? "",
                  vendor_name: editingExpense.vendor_name ?? "",
                  cost: String(editingExpense.cost ?? ""),
                  deductible_percentage: String(editingExpense.deductible_percentage ?? 100),
                  paid_by: editingExpense.paid_by,
                  payment_method: editingExpense.payment_method ?? "",
                  expense_date: editingExpense.expense_date ?? "",
                  mileage_miles: editingExpense.mileage_miles ? String(editingExpense.mileage_miles) : "",
                  mileage_rate: editingExpense.mileage_rate ? String(editingExpense.mileage_rate) : "0.70",
                  mileage_from: editingExpense.mileage_from ?? "",
                  mileage_to: editingExpense.mileage_to ?? "",
                  show_session_id: editingExpense.show_session_id ?? "",
                  documentation_notes: editingExpense.documentation_notes ?? "",
                  documentation_type: (editingExpense.documentation_type ?? "none") as DocType,
                }
              : undefined
          }
          title={editingExpense ? "Edit Expense" : "Add Expense"}
        />
      )}

      {/* ── Receipt lightbox ── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4 backdrop-blur-sm"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Receipt"
            className="max-h-full max-w-full rounded-xl object-contain"
          />
        </div>
      )}
    </div>
  );
}
