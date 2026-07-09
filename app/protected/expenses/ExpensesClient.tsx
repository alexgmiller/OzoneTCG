"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Award, Camera, Car, CheckCircle2, ChevronDown, ChevronUp, FileText, Hotel, Info, Mail,
  Monitor, MoreHorizontal, Package, Paperclip, Receipt,
  Store, TriangleAlert, Utensils, X,
} from "lucide-react";
import { subscribeWorkspaceTable } from "@/lib/supabase/realtime";
import {
  addExpense, deleteExpense, updateExpense, uploadExpenseReceipt,
  type DocType, type ExpenseCategory, type SavedLocation,
} from "./actions";
import type { ExpenseRow, ShowSessionSummary } from "./ExpensesServer";
import { taxFeaturesEnabled, scheduleCEligible, type BusinessStructure } from "@/lib/businessFeatures";
import { estimateTaxSavings, TAX_SAVINGS_DISCLAIMER } from "@/lib/taxEstimate";
import ConfirmationModal from "@/components/ConfirmationModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { ExpenseForm, type ExpenseFormPayload } from "@/components/expenses/ExpenseForm";
import { YearEndReadinessPill } from "@/components/expenses/YearEndReadinessPill";

// ── Constants ─────────────────────────────────────────────────────────────────

const RECEIPT_IRS_THRESHOLD = 75;

const CATEGORIES: {
  value: ExpenseCategory;
  label: string;
  icon: React.ReactNode;
  color: string;
  defaultDeductible: number;
}[] = [
  { value: "meals",        label: "Meals",        icon: <Utensils size={13} />,       color: "text-amber-400",   defaultDeductible: 50  },
  { value: "mileage",      label: "Gas / Mileage", icon: <Car size={13} />,            color: "text-violet-400",  defaultDeductible: 100 },
  { value: "lodging",      label: "Hotel",         icon: <Hotel size={13} />,          color: "text-violet-400",  defaultDeductible: 100 },
  { value: "booth_fee",    label: "Booth Fee",     icon: <Store size={13} />,          color: "text-emerald-400", defaultDeductible: 100 },
  { value: "supplies",     label: "Supplies",      icon: <Package size={13} />,        color: "text-slate-400",   defaultDeductible: 100 },
  { value: "shipping",     label: "Shipping",      icon: <Mail size={13} />,           color: "text-slate-400",   defaultDeductible: 100 },
  { value: "software",     label: "Software",      icon: <Monitor size={13} />,        color: "text-violet-400",  defaultDeductible: 100 },
  { value: "grading_fees", label: "Grading Fees",  icon: <Award size={13} />,          color: "text-amber-400",   defaultDeductible: 100 },
  { value: "other",        label: "Other",         icon: <MoreHorizontal size={13} />, color: "text-slate-400",   defaultDeductible: 100 },
];

function catMeta(c: ExpenseCategory) {
  return CATEGORIES.find((x) => x.value === c) ?? CATEGORIES[CATEGORIES.length - 1];
}

// Activity-feed style visual tokens per category — matches Dense Tape mockup pattern.
// Colors map 1:1 to the semantic palette: amber=warning, violet=accent-primary, emerald=positive, slate=neutral.
const CAT_TOKEN: Record<ExpenseCategory, {
  leftBorderColor: string;
  pillBg: string;
  pillBorder: string;
  pillColor: string;
  pillLabel: string;
}> = {
  meals:        { leftBorderColor: "rgba(245,158,11,0.55)",  pillBg: "rgba(245,158,11,0.10)",  pillBorder: "rgba(245,158,11,0.28)",  pillColor: "#fbbf24", pillLabel: "MEAL"   },
  mileage:      { leftBorderColor: "rgba(139,92,246,0.55)",  pillBg: "rgba(139,92,246,0.12)",  pillBorder: "rgba(139,92,246,0.32)",  pillColor: "#c4b5fd", pillLabel: "MILE"   },
  lodging:      { leftBorderColor: "rgba(139,92,246,0.55)",  pillBg: "rgba(139,92,246,0.12)",  pillBorder: "rgba(139,92,246,0.32)",  pillColor: "#c4b5fd", pillLabel: "HOTEL"  },
  booth_fee:    { leftBorderColor: "rgba(52,211,153,0.55)",  pillBg: "rgba(52,211,153,0.10)",  pillBorder: "rgba(52,211,153,0.28)",  pillColor: "#34d399", pillLabel: "BOOTH"  },
  supplies:     { leftBorderColor: "rgba(148,163,184,0.45)", pillBg: "rgba(148,163,184,0.08)", pillBorder: "rgba(148,163,184,0.22)", pillColor: "#94a3b8", pillLabel: "SUPPLY" },
  shipping:     { leftBorderColor: "rgba(148,163,184,0.45)", pillBg: "rgba(148,163,184,0.08)", pillBorder: "rgba(148,163,184,0.22)", pillColor: "#94a3b8", pillLabel: "SHIP"   },
  software:     { leftBorderColor: "rgba(139,92,246,0.55)",  pillBg: "rgba(139,92,246,0.12)",  pillBorder: "rgba(139,92,246,0.32)",  pillColor: "#c4b5fd", pillLabel: "SW"     },
  grading_fees: { leftBorderColor: "rgba(245,158,11,0.55)",  pillBg: "rgba(245,158,11,0.10)",  pillBorder: "rgba(245,158,11,0.28)",  pillColor: "#fbbf24", pillLabel: "GRADE"  },
  other:        { leftBorderColor: "rgba(148,163,184,0.45)", pillBg: "rgba(148,163,184,0.08)", pillBorder: "rgba(148,163,184,0.22)", pillColor: "#94a3b8", pillLabel: "OTHER"  },
};

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ── Client ────────────────────────────────────────────────────────────────────

export default function ExpensesClient({
  workspaceId,
  initialExpenses,
  showSessions,
  businessStructure,
  homeAddress = null,
  savedLocations = [],
}: {
  workspaceId: string;
  initialExpenses: ExpenseRow[];
  showSessions: ShowSessionSummary[];
  businessStructure: BusinessStructure;
  homeAddress?: string | null;
  savedLocations?: SavedLocation[];
}) {
  const taxEnabled = taxFeaturesEnabled(businessStructure);
  const router = useRouter();
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];

  // ── Form / edit state ────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [formCategory, setFormCategory] = useState<ExpenseCategory>("other");
  const [editingExpense, setEditingExpense] = useState<ExpenseRow | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // ── Filter / group state ─────────────────────────────────────────────────
  const [filterCategory, setFilterCategory] = useState<ExpenseCategory | "all">("all");
  const [filterShow, setFilterShow] = useState<string>("all");
  const [filterPaidBy, setFilterPaidBy] = useState<"all" | "alex" | "mila" | "shared">("all");
  const [dateRange, setDateRange] = useState<"month" | "year" | "all">("year");
  const [groupBy, setGroupBy] = useState<"flat" | "category" | "show">("flat");
  const [selectedYear, setSelectedYear] = useState(currentYear);

  // ── Educational banner ───────────────────────────────────────────────────
  const [docsExplained, setDocsExplained] = useState(true);
  const [docsExpanded, setDocsExpanded] = useState(false);
  const [docsModalOpen, setDocsModalOpen] = useState(false);

  useEffect(() => {
    setDocsExplained(!!localStorage.getItem("expense_docs_explained"));
  }, []);

  function dismissDocsBanner() {
    localStorage.setItem("expense_docs_explained", "1");
    setDocsExplained(true);
  }

  // ── Receipt upload on rows ───────────────────────────────────────────────
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingExpenseIdRef = useRef<string | null>(null);

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

  const filtered = useMemo(() => {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const yearStart = `${selectedYear}-01-01`;
    const yearEnd   = `${selectedYear}-12-31`;
    return initialExpenses.filter((e) => {
      if (filterCategory !== "all" && e.category !== filterCategory) return false;
      if (filterShow !== "all") {
        if (filterShow === "_none" && e.show_session_id) return false;
        if (filterShow !== "_none" && e.show_session_id !== filterShow) return false;
      }
      if (filterPaidBy !== "all" && e.paid_by !== filterPaidBy) return false;
      // Historical year: show the full selected year, ignore dateRange
      if (isHistoricalYear) {
        if (e.expense_date < yearStart || e.expense_date > yearEnd) return false;
      } else {
        if (dateRange === "month" && e.expense_date < monthStart) return false;
        if (dateRange === "year" && e.expense_date < yearStart) return false;
      }
      return true;
    });
  }, [initialExpenses, filterCategory, filterShow, filterPaidBy, dateRange, selectedYear, isHistoricalYear, currentYear]);

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

  // Today's show session (if any) — powers the LIVE pill in the header.
  const activeShow = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return showSessions.find((s) => s.date === today) ?? null;
  }, [showSessions]);

  // Per-category counts for the breakdown strip below the hero stat tiles.
  const categoryCounts = useMemo(() => {
    const counts = new Map<ExpenseCategory, number>();
    for (const e of filtered) {
      counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .filter(([, n]) => n > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([cat, count]) => ({ cat, count, tok: CAT_TOKEN[cat] }));
  }, [filtered]);

  const grouped = useMemo(() => {
    if (groupBy === "flat") return [{ key: "all", label: "", items: filtered }];
    if (groupBy === "category") {
      const map = new Map<string, ExpenseRow[]>();
      for (const e of filtered) {
        if (!map.has(e.category)) map.set(e.category, []);
        map.get(e.category)!.push(e);
      }
      return Array.from(map.entries()).map(([key, items]) => ({
        key, label: catMeta(key as ExpenseCategory).label, items,
      }));
    }
    const map = new Map<string, ExpenseRow[]>();
    for (const e of filtered) {
      const key = e.show_session_id ?? "_none";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries()).map(([key, items]) => {
      const show = showSessions.find((s) => s.id === key);
      return { key, label: show ? `${show.name} (${fmtDate(show.date)})` : "No show", items };
    });
  }, [filtered, groupBy, showSessions]);

  // ── Mileage helpers ──────────────────────────────────────────────────────
  const mileageExpenses = useMemo(
    () => initialExpenses.filter((e) => e.category === "mileage"),
    [initialExpenses],
  );

  const previousRoutes = useMemo(() => {
    const seen = new Set<string>();
    const routes: string[] = [];
    for (const e of mileageExpenses) {
      const key = e.description?.trim();
      if (key && !seen.has(key)) { seen.add(key); routes.push(key); }
    }
    return routes;
  }, [mileageExpenses]);

  const yearMileage = useMemo(() => {
    const yr = String(new Date().getFullYear());
    return mileageExpenses
      .filter((e) => e.expense_date.startsWith(yr))
      .reduce((s, e) => s + (e.mileage_miles ?? 0), 0);
  }, [mileageExpenses]);

  // When filtered to a specific show, offer to re-use last mileage entry
  const lastShowMileage = useMemo(() => {
    if (!filterShow || filterShow === "all" || filterShow === "_none") return undefined;
    const last = mileageExpenses
      .filter((e) => e.show_session_id === filterShow && e.mileage_miles)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (!last?.mileage_miles) return undefined;
    return { miles: String(last.mileage_miles), description: last.description ?? "" };
  }, [mileageExpenses, filterShow]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function openEditById(id: string) {
    const expense = initialExpenses.find((e) => e.id === id);
    if (expense) openEdit(expense);
  }

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

  async function handleSave(payload: ExpenseFormPayload): Promise<string | null> {
    if (editingExpense) {
      await updateExpense(editingExpense.id, payload);
      router.refresh();
      return null;
    }
    const { id } = await addExpense(payload);
    router.refresh();
    return id;
  }

  async function handleDelete() {
    if (!confirmDeleteId) return;
    await deleteExpense(confirmDeleteId);
    setConfirmDeleteId(null);
    router.refresh();
  }

  async function handleReceiptPick(expenseId: string) {
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
    } finally {
      setUploadingFor(null);
      pendingExpenseIdRef.current = null;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

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
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold leading-tight">Expenses</h1>
            {activeShow && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-warning-border bg-warning-soft">
                <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse shrink-0" />
                <span className="text-xs font-mono uppercase tracking-wide text-warning truncate max-w-[140px]">
                  {activeShow.name}
                </span>
              </div>
            )}
          </div>
          {isHistoricalYear && (
            <span className="text-xs text-warning/70">Viewing historical data</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {taxEnabled && (
            <a
              href="/protected/expenses/tax-report"
              className="text-xs px-2.5 py-1 rounded-lg border transition-colors hover:bg-white/5 text-violet-400"
              style={{ borderColor: "rgba(139,92,246,0.30)" }}
            >
              Tax Report →
            </a>
          )}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="text-xs border rounded-lg px-2 py-1.5 bg-background font-mono tabular-nums"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Readiness pill row ── */}
      {taxEnabled && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {docsExplained && (
              <button
                onClick={() => setDocsModalOpen(true)}
                className="opacity-30 hover:opacity-60 transition-opacity"
                title="About documentation"
              >
                <Info size={13} />
              </button>
            )}
          </div>
          <YearEndReadinessPill
            expenses={initialExpenses}
            onEditExpense={(id) => { openEditById(id); }}
          />
        </div>
      )}

      {/* ── Educational banner (compact, expandable, one-time) ── */}
      {!docsExplained && (
        <div
          className="rounded-xl border px-3 py-2.5"
          style={{ background: "rgba(139,92,246,0.05)", borderColor: "rgba(139,92,246,0.18)" }}
        >
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-sm">📸</span>
            <span className="text-xs opacity-60 flex-1 min-w-0">
              Photos, screenshots, or notes all count as documentation.
            </span>
            <button
              onClick={() => setDocsExpanded((v) => !v)}
              className="shrink-0 text-xs text-accent-secondary/70 hover:text-accent-secondary transition-colors duration-150"
            >
              {docsExpanded ? "Less ↑" : "More ↓"}
            </button>
            <button
              onClick={dismissDocsBanner}
              className="shrink-0 opacity-30 hover:opacity-60 transition-opacity duration-150"
              title="Dismiss"
            >
              <X size={12} />
            </button>
          </div>
          {docsExpanded && (
            <div
              className="mt-2 pt-2 border-t space-y-1"
              style={{ borderColor: "rgba(139,92,246,0.12)" }}
            >
              <p className="text-xs opacity-50">• Photo of a paper receipt</p>
              <p className="text-xs opacity-50">• Screenshot of Venmo, Zelle, or bank transfer</p>
              <p className="text-xs opacity-50">• Email or order confirmation</p>
              <p className="text-xs opacity-50">• Written note: who you paid, when, why</p>
              <p className="text-xs opacity-30 mt-1.5">Expenses ≥ ${RECEIPT_IRS_THRESHOLD} need documentation. Mileage log counts for mileage.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Docs explanation modal (re-openable via ⓘ) ── */}
      {docsModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.70)", backdropFilter: "blur(4px)" }}
          onClick={() => setDocsModalOpen(false)}
        >
          <div
            className="modal-panel w-full max-w-sm p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="modal-title text-sm">IRS Documentation</span>
              <button onClick={() => setDocsModalOpen(false)} className="modal-close-btn">
                <X size={14} />
              </button>
            </div>
            <p className="text-xs opacity-60 leading-relaxed">
              The IRS accepts any proof of payment for business expenses. You don&apos;t need a paper receipt.
            </p>
            <ul className="text-xs opacity-50 space-y-1 leading-relaxed">
              <li>• Photo of a paper receipt</li>
              <li>• Screenshot of a Venmo, Zelle, or bank transfer</li>
              <li>• Email or order confirmation</li>
              <li>• Written note describing who you paid, when, and why</li>
            </ul>
            <p className="text-[11px] opacity-30 leading-relaxed">
              Expenses $75 or more require documentation. Mileage is documented by your log — no receipt needed.
            </p>
          </div>
        </div>
      )}

      {/* ── Hero stat tiles — Vault B pattern ── */}
      <div className={`grid gap-3 grid-cols-2 ${taxEnabled ? "sm:grid-cols-3" : ""}`}>
        {/* Gross — amber gold treatment */}
        <div className="relative rounded-xl border overflow-hidden p-4 flex flex-col gap-1.5 bg-card/60"
          style={{ borderColor: "rgba(245,158,11,0.22)" }}>
          <div className="pointer-events-none absolute -top-5 -right-5 w-20 h-20 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(234,179,8,0.16), transparent 65%)" }} />
          <span className="font-mono text-xs uppercase tracking-[0.16em]" style={{ color: "rgba(245,158,11,0.75)" }}>
            ◆ Total expenses
          </span>
          <span className="text-2xl font-semibold tabular-nums tracking-tight font-mono text-foreground">
            <MoneyDisplay amount={totals.gross} tone="neutral" />
          </span>
          <div className="min-h-4">
            <span className="text-xs" style={{ color: "rgba(245,158,11,0.55)" }}>
              {filtered.length} expense{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Tax Deductible — emerald treatment */}
        {taxEnabled && (
          <div className="relative rounded-xl border overflow-hidden p-4 flex flex-col gap-1.5 bg-card/60"
            style={{ borderColor: "rgba(52,211,153,0.20)" }}>
            <div className="pointer-events-none absolute -top-5 -right-5 w-20 h-20 rounded-full"
              style={{ background: "radial-gradient(circle, rgba(52,211,153,0.12), transparent 65%)" }} />
            <span className="font-mono text-xs uppercase tracking-[0.16em]" style={{ color: "rgba(52,211,153,0.80)" }}>
              Tax deductible
            </span>
            <span
              className="text-2xl font-semibold tabular-nums tracking-tight font-mono text-positive"
              style={{ textShadow: "0 0 18px rgba(52,211,153,0.28)" }}
            >
              <MoneyDisplay amount={totals.deductible} tone="positive" />
            </span>
            <div className="min-h-4">
              <span className="text-xs" style={{ color: "rgba(52,211,153,0.55)" }}>
                {totals.deductible > 0
                  ? `~${estimateTaxSavings(totals.deductible).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 })} saved`
                  : `${filtered.length} expense${filtered.length !== 1 ? "s" : ""}`}
              </span>
            </div>
          </div>
        )}

        {/* Miles — violet/neutral treatment */}
        <div
          className={`relative rounded-xl border overflow-hidden p-4 flex flex-col gap-1.5 bg-card/60 ${taxEnabled ? "col-span-2 sm:col-span-1" : ""}`}
          style={{ borderColor: "rgba(139,92,246,0.20)" }}
        >
          <div className="pointer-events-none absolute -top-5 -right-5 w-20 h-20 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(139,92,246,0.12), transparent 65%)" }} />
          <span className="font-mono text-xs uppercase tracking-[0.16em]" style={{ color: "rgba(139,92,246,0.75)" }}>
            Miles
          </span>
          <span className="text-2xl font-semibold tabular-nums tracking-tight font-mono text-foreground">
            {totals.mileageTotal.toFixed(0)}
          </span>
          <div className="min-h-4">
            <span className="text-xs" style={{ color: "rgba(139,92,246,0.55)" }}>
              {taxEnabled && totals.mileageTotal > 0
                ? `~${estimateTaxSavings(totals.mileageTotal * 0.70).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 })} deductible`
                : `${filtered.filter((e) => e.category === "mileage").length} trips`}
            </span>
          </div>
        </div>
      </div>

      {/* ── Category breakdown strip ── */}
      {filtered.length > 0 && categoryCounts.length > 1 && (
        <div
          className="flex items-stretch rounded-xl border overflow-hidden"
          style={{ borderColor: "rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.015)" }}
        >
          {categoryCounts.map(({ cat, count, tok }, i) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 transition-colors duration-150 hover:bg-white/[0.03] ${
                i > 0 ? "border-l" : ""
              } ${filterCategory === cat ? "bg-white/[0.04]" : ""}`}
              style={{ borderColor: "rgba(255,255,255,0.05)" }}
            >
              <span className="text-sm font-bold tabular-nums font-mono" style={{ color: tok.pillColor }}>
                {count}
              </span>
              <span className="text-xs font-mono uppercase tracking-wide opacity-40">
                {tok.pillLabel}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Annual mileage motivator ── */}
      {taxEnabled && yearMileage > 0 && (
        <div className="flex items-center justify-between rounded-xl border px-4 py-2.5 text-xs"
          style={{ borderColor: "rgba(139,92,246,0.18)", background: "rgba(139,92,246,0.05)" }}
        >
          <span className="text-violet-300/80 font-mono tabular-nums">
            {yearMileage.toFixed(0)} mi logged this year
          </span>
          <span className="opacity-40">
            = ~{estimateTaxSavings(yearMileage * 0.70).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 })} saved
          </span>
        </div>
      )}

      {/* IRS receipt warning — only shown when 3+ items need attention */}
      {taxEnabled && totals.missingReceiptCount >= 3 && (
        <div
          className="flex items-start gap-2.5 rounded-xl border px-3 py-3"
          style={{
            background: "rgba(245,158,11,0.10)",
            borderColor: "rgba(245,158,11,0.32)",
            color: "#fbbf24",
          }}
        >
          <TriangleAlert size={14} className="shrink-0 mt-0.5" />
          <span className="text-xs leading-relaxed min-w-0 flex-1">
            <span className="font-semibold">{totals.missingReceiptCount} expense{totals.missingReceiptCount > 1 ? "s" : ""}</span>
            {" "}over ${RECEIPT_IRS_THRESHOLD} need{totals.missingReceiptCount === 1 ? "s" : ""} documentation — tap a row and add a photo, screenshot, or note.
          </span>
        </div>
      )}

      {/* ── Quick-add row ── */}
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2"
        style={{ background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.12)" }}
      >
        <span className="text-xs font-medium opacity-40 shrink-0 font-mono uppercase tracking-wide">+ Add</span>
        <div className="relative flex-1 min-w-0">
          <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-0.5 pr-8 [&::-webkit-scrollbar]:hidden">
            {[
              { cat: "meals"     as ExpenseCategory, label: "Meal",     taxOnly: false },
              { cat: "mileage"   as ExpenseCategory, label: "Mileage",  taxOnly: true  },
              { cat: "lodging"   as ExpenseCategory, label: "Hotel",    taxOnly: false },
              { cat: "booth_fee" as ExpenseCategory, label: "Booth Fee",taxOnly: false },
              { cat: "supplies"  as ExpenseCategory, label: "Supplies", taxOnly: false },
              { cat: "other"     as ExpenseCategory, label: "Other",    taxOnly: false },
            ].filter(({ taxOnly }) => !taxOnly || taxEnabled).map(({ cat, label }) => {
              const meta = catMeta(cat);
              return (
                <button
                  key={cat}
                  onClick={() => openQuickAdd(cat)}
                  className={`snap-start shrink-0 flex items-center gap-1.5 text-xs px-3 py-1 border rounded-lg transition-colors duration-150 hover:bg-white/5 ${meta.color}`}
                  style={{ borderColor: "rgba(255,255,255,0.10)" }}
                >
                  {meta.icon}
                  {label}
                </button>
              );
            })}
          </div>
          <div className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-background to-transparent" />
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="space-y-2">
        {/* Category pills — "All" fixed, rest scrolls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterCategory("all")}
            className={`shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors duration-150 ${
              filterCategory === "all"
                ? "border-violet-500 bg-violet-500/15 text-violet-400"
                : "opacity-60 hover:opacity-100"
            }`}
          >
            All
          </button>
          <div className="relative flex-1 min-w-0">
            <div className="flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden pb-0.5 pr-8">
              {CATEGORIES
                .filter((c) => taxEnabled || c.value !== "mileage")
                .map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setFilterCategory(c.value as ExpenseCategory)}
                    className={`shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors duration-150 ${
                      filterCategory === c.value
                        ? "border-violet-500 bg-violet-500/15 text-violet-400"
                        : "opacity-60 hover:opacity-100"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
            </div>
            <div className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-background to-transparent" />
          </div>
        </div>

        {/* Row 2: dropdowns */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <select
            className="text-xs border rounded-lg px-2 py-1.5 bg-background w-full sm:w-auto min-w-0"
            value={filterShow}
            onChange={(e) => setFilterShow(e.target.value)}
          >
            <option value="all">All shows</option>
            <option value="_none">No show</option>
            {showSessions.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {!isHistoricalYear && (
            <select
              className="text-xs border rounded-lg px-2 py-1.5 bg-background w-full sm:w-auto min-w-0"
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as "month" | "year" | "all")}
            >
              <option value="month">This month</option>
              <option value="year">This year</option>
              <option value="all">All time</option>
            </select>
          )}

          <select
            className="text-xs border rounded-lg px-2 py-1.5 bg-background w-full sm:w-auto min-w-0"
            value={filterPaidBy}
            onChange={(e) => setFilterPaidBy(e.target.value as typeof filterPaidBy)}
          >
            <option value="all">All payers</option>
            <option value="alex">Alex</option>
            <option value="mila">Mila</option>
            <option value="shared">Shared</option>
          </select>

          <select
            className="text-xs border rounded-lg px-2 py-1.5 bg-background w-full sm:w-auto sm:ml-auto min-w-0"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
          >
            <option value="flat">Flat list</option>
            <option value="category">By category</option>
            <option value="show">By show</option>
          </select>
        </div>
      </div>

      {/* ── Result counter + active show pill ── */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs opacity-40 tabular-nums font-mono">
          {filtered.length === initialExpenses.length
            ? `${filtered.length} expense${filtered.length !== 1 ? "s" : ""}`
            : `${filtered.length} of ${initialExpenses.length} expenses`}
        </span>
        {filterShow !== "all" && filterShow !== "_none" && (() => {
          const show = showSessions.find((s) => s.id === filterShow);
          if (!show) return null;
          return (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-warning-border bg-warning-soft">
              <span className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" />
              <span className="text-xs font-mono text-warning truncate max-w-[140px]">{show.name}</span>
            </div>
          );
        })()}
      </div>

      {/* ── Expense list ── */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No expenses"
          hint={
            filterCategory !== "all" || filterShow !== "all" || filterPaidBy !== "all"
              ? "Try adjusting the filters above."
              : "Track meals, mileage, hotel, and other show costs here."
          }
          cta={
            filterCategory === "all" && filterShow === "all" && filterPaidBy === "all" ? (
              <button
                onClick={() => openQuickAdd("meals")}
                className="w-full text-sm modal-btn-primary py-2.5"
              >
                Log first expense
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {grouped.map((group) => (
            <div key={group.key} className="space-y-1.5">
              {groupBy !== "flat" && (
                <div className="px-1 pt-1 text-xs font-mono font-semibold uppercase tracking-wide text-neutral opacity-60">
                  {group.label}
                </div>
              )}
              {group.items.map((e) => (
                <ExpenseRowItem
                  key={e.id}
                  expense={e}
                  uploadingFor={uploadingFor}
                  taxEnabled={taxEnabled}
                  onEdit={() => openEdit(e)}
                  onDelete={() => setConfirmDeleteId(e.id)}
                  onReceiptPick={() => handleReceiptPick(e.id)}
                  onLightbox={(url) => setLightboxUrl(url)}
                />
              ))}
            </div>
          ))}
        </div>
      )}


      {/* ── Add / Edit Form ── */}
      {formOpen && (
        <ExpenseForm
          onClose={() => { setFormOpen(false); setEditingExpense(null); }}
          onSave={handleSave}
          showSessions={showSessions}
          defaultCategory={formCategory}
          businessStructure={businessStructure}
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
          zIndex={50}
        />
      )}

      {/* ── Receipt lightbox ── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Receipt"
            className="max-w-full max-h-full rounded-xl object-contain"
          />
        </div>
      )}

      {/* ── Confirm delete ── */}
      {confirmDeleteId && (
        <ConfirmationModal
          title="Delete expense?"
          description="This expense will be permanently removed."
          confirmLabel="Delete"
          destructive
          onConfirm={handleDelete}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}

// ── ExpenseRowItem ─────────────────────────────────────────────────────────────

function ExpenseRowItem({
  expense: e,
  uploadingFor,
  taxEnabled,
  onEdit,
  onDelete,
  onReceiptPick,
  onLightbox,
}: {
  expense: ExpenseRow;
  uploadingFor: string | null;
  taxEnabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onReceiptPick: () => void;
  onLightbox: (url: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const tok = CAT_TOKEN[e.category];
  const deductibleAmt = e.cost * e.deductible_percentage / 100;
  const hasPhoto = !!e.receipt_url;
  const hasNoteDoc = !!e.documentation_notes;
  const hasAnyDoc = hasPhoto || hasNoteDoc;
  const missingReceipt = e.category !== "mileage" && !hasAnyDoc && e.cost >= RECEIPT_IRS_THRESHOLD;

  // Warning border overrides category border when docs are missing.
  const leftBorderColor = missingReceipt ? "rgba(245,158,11,0.65)" : tok.leftBorderColor;

  return (
    <div
      className="rounded-xl border border-white/5 bg-card/40 hover:bg-card/60 transition-colors duration-150 overflow-hidden"
      style={{ borderLeft: `3px solid ${leftBorderColor}` }}
    >
      {/* ── Main row ── */}
      <div className="flex items-start gap-2.5 px-3 py-3">

        {/* Documentation status icon */}
        {hasPhoto ? (
          <button
            className="shrink-0 w-8 h-8 rounded-lg overflow-hidden border border-white/10"
            onClick={() => onLightbox(e.receipt_url!)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={e.receipt_url!} alt="" className="w-full h-full object-cover" />
          </button>
        ) : hasNoteDoc ? (
          <button
            className="shrink-0 w-8 h-8 rounded-lg border border-positive/30 flex items-center justify-center text-positive opacity-80 hover:opacity-100 transition-opacity duration-150"
            onClick={onEdit}
            title="Written record attached"
          >
            <FileText size={13} />
          </button>
        ) : missingReceipt ? (
          <button
            className="shrink-0 w-8 h-8 rounded-lg border border-dashed border-warning/40 flex items-center justify-center text-warning opacity-70 hover:opacity-100 transition-opacity duration-150"
            onClick={onReceiptPick}
            title="Documentation needed — tap to add"
          >
            {uploadingFor === e.id
              ? <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
              : <TriangleAlert size={13} />
            }
          </button>
        ) : (
          <button
            className="shrink-0 w-8 h-8 rounded-lg border border-dashed border-white/10 flex items-center justify-center opacity-20 hover:opacity-50 transition-opacity duration-150"
            onClick={onReceiptPick}
            title="Attach documentation"
          >
            {uploadingFor === e.id
              ? <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
              : <Paperclip size={13} />
            }
          </button>
        )}

        {/* Content column */}
        <div className="flex-1 min-w-0">
          {/* Top line: category pill + vendor/description */}
          <div className="flex items-center gap-1.5 mb-0.5">
            <span
              className="shrink-0 font-mono text-xs font-bold uppercase tracking-wide"
              style={{
                padding: "1px 5px",
                borderRadius: 4,
                background: tok.pillBg,
                border: `1px solid ${tok.pillBorder}`,
                color: tok.pillColor,
              }}
            >
              {tok.pillLabel}
            </span>
            <span className="text-sm font-medium truncate">{e.vendor_name || e.description}</span>
            {e.vendor_name && e.description && (
              <span className="text-xs opacity-40 truncate hidden sm:inline">— {e.description}</span>
            )}
          </div>

          {/* Meta sub-line: date · paid-by · miles */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs opacity-50">{fmtDate(e.expense_date)}</span>
            <span className="text-xs opacity-30">·</span>
            <span className="text-xs opacity-50 capitalize">{e.paid_by}</span>
            {e.category === "mileage" && e.mileage_miles && (
              <>
                <span className="text-xs opacity-30">·</span>
                <span className="text-xs opacity-50 font-mono tabular-nums">{e.mileage_miles} mi</span>
              </>
            )}
          </div>
        </div>

        {/* Amount column */}
        <div className="text-right shrink-0">
          <div className="text-sm font-semibold tabular-nums font-mono text-negative">
            <MoneyDisplay amount={e.cost} tone="negative" />
          </div>
          {taxEnabled && e.deductible_percentage === 100 && e.cost > 0 && (
            <div className="text-xs font-mono text-positive/50">100% ded.</div>
          )}
          {taxEnabled && e.deductible_percentage > 0 && e.deductible_percentage < 100 && (
            <div className="text-xs tabular-nums font-mono text-positive/70">
              <MoneyDisplay amount={deductibleAmt} tone="positive" /> ded.
            </div>
          )}
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 opacity-30 hover:opacity-60 transition-opacity duration-150 mt-0.5"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* ── Expanded detail strip ── */}
      {expanded && (
        <div
          className="px-3 pb-3 flex items-center gap-3 flex-wrap"
          style={{ paddingLeft: "3rem" }}
        >
          {e.payment_method && (
            <span className="text-xs opacity-40">{e.payment_method}</span>
          )}
          {taxEnabled && deductibleAmt > 0 && (
            <span className="text-xs opacity-50">~{money(deductibleAmt * 0.27)} saved on this</span>
          )}
          {missingReceipt && (
            <span className="text-xs text-warning/70 flex items-center gap-1">
              <TriangleAlert size={11} /> Docs needed ≥ ${RECEIPT_IRS_THRESHOLD}
            </span>
          )}
          {hasNoteDoc && !hasPhoto && (
            <span className="text-xs text-positive/60 flex items-center gap-1">
              <FileText size={11} /> Written record
            </span>
          )}
          <div className="flex gap-2 ml-auto">
            {!hasAnyDoc && (
              <button
                onClick={onReceiptPick}
                className="text-xs px-2 py-0.5 rounded-lg border border-white/15 opacity-50 hover:opacity-100 flex items-center gap-1 transition-opacity duration-150"
              >
                <Camera size={10} /> Add docs
              </button>
            )}
            <button
              onClick={onEdit}
              className="text-xs px-2 py-0.5 rounded-lg border border-white/15 hover:bg-white/5 transition-colors duration-150"
            >
              Edit
            </button>
            <button
              onClick={onDelete}
              className="text-xs px-2 py-0.5 rounded-lg border border-negative/30 text-negative hover:bg-negative-soft transition-colors duration-150"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Image compression ─────────────────────────────────────────────────────────

async function compressImage(file: File, maxBytes: number): Promise<File> {
  if (file.size <= maxBytes) return file;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, Math.sqrt(maxBytes / file.size));
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name, { type: "image/jpeg" }) : file),
        "image/jpeg",
        0.82,
      );
    };
    img.src = url;
  });
}
