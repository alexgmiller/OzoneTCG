import type { DocType, ExpenseCategory } from "@/app/protected/expenses/actions";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ExpenseFormPayload = {
  description: string;
  cost: number;
  paid_by: "alex" | "mila" | "shared";
  payment_method: string | null;
  vendor_name: string | null;
  category: ExpenseCategory;
  deductible_percentage: number;
  expense_date: string;
  mileage_miles: number | null;
  mileage_rate: number | null;
  mileage_from: string | null;
  mileage_to: string | null;
  show_session_id: string | null;
  documentation_notes: string | null;
  documentation_type: DocType;
};

export type FormState = {
  category: ExpenseCategory;
  description: string;
  vendor_name: string;
  cost: string;
  deductible_percentage: string;
  paid_by: "alex" | "mila" | "shared";
  payment_method: string;
  expense_date: string;
  mileage_miles: string;
  mileage_rate: string;
  mileage_from: string;
  mileage_to: string;
  round_trip: boolean;
  show_session_id: string;
  documentation_notes: string;
  documentation_type: DocType;
};

export type SetField = <K extends keyof FormState>(key: K, val: FormState[K]) => void;

export type LocationChip = { icon: string; label: string; address: string; title: string };

// Photo-specific doc types (shown in the type picker when a photo is attached)
export type PhotoDocType = "receipt" | "payment_screenshot" | "statement" | "email";

// ── Constants ─────────────────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string; defaultDeductible: number }[] = [
  { value: "meals",        label: "Meals",        defaultDeductible: 50  },
  { value: "mileage",      label: "Mileage",      defaultDeductible: 100 },
  { value: "lodging",      label: "Hotel",        defaultDeductible: 100 },
  { value: "booth_fee",    label: "Booth Fee",    defaultDeductible: 100 },
  { value: "supplies",     label: "Supplies",     defaultDeductible: 100 },
  { value: "shipping",     label: "Shipping",     defaultDeductible: 100 },
  { value: "software",     label: "Software",     defaultDeductible: 100 },
  { value: "grading_fees", label: "Grading Fees", defaultDeductible: 100 },
  { value: "other",        label: "Other",        defaultDeductible: 100 },
];

export const PHOTO_DOC_TYPES: { value: PhotoDocType; label: string }[] = [
  { value: "receipt",            label: "Receipt"              },
  { value: "payment_screenshot", label: "Venmo / Zelle / Bank" },
  { value: "statement",          label: "Statement"            },
  { value: "email",              label: "Email / Confirmation" },
];

export const CATEGORY_DOC_TIPS: Partial<Record<ExpenseCategory, string>> = {
  meals:        "Tip: Snap the receipt before leaving, or screenshot your Venmo/Zelle if you split the bill.",
  booth_fee:    "Tip: Show organizers often send confirmation emails — screenshot those, or use your Venmo/Zelle payment.",
  lodging:      "Tip: Hotel receipts usually come by email — forward to yourself or take a screenshot.",
  supplies:     "Tip: Photo the paper receipt, or screenshot the order confirmation if purchased online.",
  shipping:     "Tip: Screenshot the shipping label or carrier confirmation email.",
  software:     "Tip: Screenshot the payment confirmation or invoice email.",
  grading_fees: "Tip: Screenshot the PSA/CGC order confirmation or payment receipt.",
  other:        "Tip: A photo, Venmo/Zelle screenshot, or written note describing the payment all count.",
};

export const RECEIPT_REQUIRED_THRESHOLD = 75;
export const MIN_RECEIPT_SIZE_BYTES = 20 * 1024;
export const DEFAULT_MILEAGE_RATE = "0.70";
export const CATEGORY_TOOLTIP = "Category determines which tax line this expense fills when exporting for taxes.";
export const DEDUCTIBLE_TOOLTIP = "The portion the IRS lets you subtract from taxable income. Higher % = more tax savings.";
export const MILEAGE_RATE_TOOLTIP = "IRS standard mileage rate for 2026 is $0.70/mi. Use this unless you track actual vehicle expenses separately.";

// ── Shared field classes ──────────────────────────────────────────────────────

export const FIELD_CLASS =
  "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground " +
  "placeholder:text-muted-foreground focus:border-accent focus:outline-none";
export const LABEL_CLASS = "mb-1.5 block text-xs text-muted-foreground";
export const CHIP_CLASS =
  "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors duration-150";
export const CHIP_ACTIVE = "border-accent bg-accent-tint text-accent";
export const CHIP_IDLE = "border-border text-muted-foreground hover:bg-muted";
export const GHOST_BTN =
  "inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-sm " +
  "text-foreground transition-colors duration-150 hover:bg-muted";
export const LINK_BTN =
  "inline-flex h-11 items-center gap-1.5 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function todayStr() { return new Date().toISOString().slice(0, 10); }

function sevenYearsAgoStr() {
  const d = new Date(); d.setFullYear(d.getFullYear() - 7);
  return d.toISOString().slice(0, 10);
}

export function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

export function validateDate(dateStr: string): string | null {
  if (!dateStr) return null;
  if (dateStr > todayStr()) return "Date can't be in the future.";
  if (dateStr < sevenYearsAgoStr()) return "Date is more than 7 years ago.";
  return null;
}

export function isPhotoDocType(t: DocType): t is PhotoDocType {
  return PHOTO_DOC_TYPES.some((p) => p.value === t);
}

export function buildForm(opts?: {
  category?: ExpenseCategory;
  showSessionId?: string;
  initial?: Partial<FormState>;
}): FormState {
  const resolvedCategory = opts?.initial?.category ?? opts?.category ?? "other";
  const resolvedDeductible =
    opts?.initial?.deductible_percentage ??
    String(EXPENSE_CATEGORIES.find((c) => c.value === resolvedCategory)?.defaultDeductible ?? 100);

  const base: FormState = {
    category: resolvedCategory,
    description: "",
    vendor_name: "",
    cost: "",
    deductible_percentage: resolvedDeductible,
    paid_by: "shared",
    payment_method: "",
    expense_date: todayStr(),
    mileage_miles: "",
    mileage_rate: DEFAULT_MILEAGE_RATE,
    mileage_from: "",
    mileage_to: "",
    round_trip: true,
    show_session_id: opts?.showSessionId ?? "",
    documentation_notes: "",
    documentation_type: "none",
  };

  return opts?.initial
    ? { ...base, ...opts.initial, category: resolvedCategory, deductible_percentage: resolvedDeductible }
    : base;
}
