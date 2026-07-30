"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera, CheckCircle2, ExternalLink, FileText, Info, Paperclip,
  TriangleAlert, WifiOff, X,
} from "lucide-react";
import {
  uploadExpenseReceipt, upsertSavedLocation,
  type DocType, type ExpenseCategory, type SavedLocation,
} from "@/app/protected/expenses/actions";
import type { ShowSessionSummary } from "@/app/protected/expenses/ExpensesServer";
import { taxFeaturesEnabled, type BusinessStructure } from "@/lib/businessFeatures";
import { estimateTaxSavings } from "@/lib/taxEstimate";
import { ExpenseTooltip } from "./ExpenseTooltip";

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

type FormState = {
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

type LocationChip = { icon: string; label: string; address: string; title: string };

// Photo-specific doc types (shown in the type picker when a photo is attached)
type PhotoDocType = "receipt" | "payment_screenshot" | "statement" | "email";

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: { value: ExpenseCategory; label: string; defaultDeductible: number }[] = [
  { value: "meals",         label: "Meals",         defaultDeductible: 50  },
  { value: "mileage",       label: "Mileage",       defaultDeductible: 100 },
  { value: "lodging",       label: "Hotel",         defaultDeductible: 100 },
  { value: "booth_fee",     label: "Booth Fee",     defaultDeductible: 100 },
  { value: "supplies",      label: "Supplies",      defaultDeductible: 100 },
  { value: "shipping",      label: "Shipping",      defaultDeductible: 100 },
  { value: "software",      label: "Software",      defaultDeductible: 100 },
  { value: "grading_fees",  label: "Grading Fees",  defaultDeductible: 100 },
  { value: "other",         label: "Other",         defaultDeductible: 100 },
];

const PHOTO_DOC_TYPES: { value: PhotoDocType; label: string }[] = [
  { value: "receipt",            label: "Receipt"              },
  { value: "payment_screenshot", label: "Venmo / Zelle / Bank" },
  { value: "statement",          label: "Statement"            },
  { value: "email",              label: "Email / Confirmation" },
];

const CATEGORY_DOC_TIPS: Partial<Record<ExpenseCategory, string>> = {
  meals:     "Tip: Snap the receipt before leaving, or screenshot your Venmo/Zelle if you split the bill.",
  booth_fee: "Tip: Show organizers often send confirmation emails — screenshot those, or use your Venmo/Zelle payment.",
  lodging:   "Tip: Hotel receipts usually come by email — forward to yourself or take a screenshot.",
  supplies:  "Tip: Photo the paper receipt, or screenshot the order confirmation if purchased online.",
  shipping:  "Tip: Screenshot the shipping label or carrier confirmation email.",
  software:  "Tip: Screenshot the payment confirmation or invoice email.",
  grading_fees: "Tip: Screenshot the PSA/CGC order confirmation or payment receipt.",
  other:     "Tip: A photo, Venmo/Zelle screenshot, or written note describing the payment all count.",
};

const RECEIPT_REQUIRED_THRESHOLD = 75;
const MIN_RECEIPT_SIZE_BYTES = 20 * 1024;
const IRS_MILEAGE_RATE = "0.70";
const CATEGORY_TOOLTIP = "Category determines which tax line this expense fills when exporting for taxes.";
const DEDUCTIBLE_TOOLTIP = "The portion the IRS lets you subtract from taxable income. Higher % = more tax savings.";
const MILEAGE_RATE_TOOLTIP = "IRS standard mileage rate for 2026 is $0.70/mi. Use this unless you track actual vehicle expenses separately.";

function todayStr() { return new Date().toISOString().slice(0, 10); }
function sevenYearsAgoStr() {
  const d = new Date(); d.setFullYear(d.getFullYear() - 7);
  return d.toISOString().slice(0, 10);
}

function buildForm(opts?: {
  category?: ExpenseCategory;
  showSessionId?: string;
  initial?: Partial<FormState>;
}): FormState {
  const resolvedCategory = opts?.initial?.category ?? opts?.category ?? "other";
  const resolvedDeductible =
    opts?.initial?.deductible_percentage ??
    String(CATEGORIES.find((c) => c.value === resolvedCategory)?.defaultDeductible ?? 100);

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
    mileage_rate: IRS_MILEAGE_RATE,
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
        "image/jpeg", 0.82,
      );
    };
    img.src = url;
  });
}

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}
function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}
function validateDate(dateStr: string): string | null {
  if (!dateStr) return null;
  if (dateStr > todayStr()) return "Date can't be in the future.";
  if (dateStr < sevenYearsAgoStr()) return "Date is more than 7 years ago.";
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ExpenseForm({
  onClose,
  onSave,
  showSessions = [],
  defaultCategory,
  defaultShowSessionId,
  initialValues,
  existingPhotoUrl,
  title = "Add Expense",
  zIndex = 60,
  businessStructure,
  lastShowMileage,
  homeAddress = null,
  savedLocations = [],
}: {
  onClose: () => void;
  onSave: (payload: ExpenseFormPayload) => Promise<string | null>;
  showSessions?: ShowSessionSummary[];
  defaultCategory?: ExpenseCategory;
  defaultShowSessionId?: string;
  initialValues?: Partial<FormState>;
  /** Existing receipt_url to show when editing an expense that already has a photo. */
  existingPhotoUrl?: string;
  title?: string;
  zIndex?: number;
  businessStructure?: BusinessStructure;
  lastShowMileage?: { miles: string; description: string };
  homeAddress?: string | null;
  savedLocations?: SavedLocation[];
}) {
  const taxEnabled = businessStructure ? taxFeaturesEnabled(businessStructure) : true;

  const [form, setForm] = useState<FormState>(() =>
    buildForm({ category: defaultCategory, showSessionId: defaultShowSessionId, initial: initialValues }),
  );
  const [saving, setSaving] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [noteMode, setNoteMode] = useState(() => !!(initialValues?.documentation_notes));
  const [docSkipped, setDocSkipped] = useState(false);
  const [showDocWarning, setShowDocWarning] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [homeTipDismissed, setHomeTipDismissed] = useState(true);

  function dismissHomeTip() {
    localStorage.setItem("mileage_home_tip_dismissed", "1");
    setHomeTipDismissed(true);
  }

  useEffect(() => {
    setHomeTipDismissed(!!localStorage.getItem("mileage_home_tip_dismissed"));
  }, []);

  useEffect(() => {
    const onOnline  = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Derived photo state
  const displayPhotoUrl = pendingPreview ?? existingPhotoUrl ?? null;
  const hasPhoto = displayPhotoUrl !== null;
  const hasNote = form.documentation_notes.trim().length > 0;
  const hasAnyDoc = hasPhoto || hasNote;

  const mileageAmount = (() => {
    if (form.category !== "mileage") return null;
    const miles = parseFloat(form.mileage_miles) * (form.round_trip ? 2 : 1);
    const rate = parseFloat(form.mileage_rate) || 0.70;
    if (!miles || miles <= 0) return null;
    return parseFloat((miles * rate).toFixed(2));
  })();

  const costNum = form.category === "mileage" ? (mileageAmount ?? 0) : (parseFloat(form.cost) || 0);
  const deductPct = parseInt(form.deductible_percentage) || 0;
  const deductibleAmt = costNum * deductPct / 100;
  const estimatedSavings = estimateTaxSavings(deductibleAmt);

  function setField<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: val };
      if (key === "category") {
        const cat = CATEGORIES.find((c) => c.value === val);
        if (cat) next.deductible_percentage = String(cat.defaultDeductible);
        // Reset doc type when switching categories
        if (next.documentation_type === "none" && !hasPhoto && !hasNote) {
          next.documentation_type = "none";
        }
      }
      return next;
    });
  }

  async function handleReceiptFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setReceiptError(null);
    if (file.size < MIN_RECEIPT_SIZE_BYTES) {
      setReceiptError("Image too small — make sure you captured the full receipt.");
      return;
    }
    const compressed = await compressImage(file, 500 * 1024);
    setPendingFile(compressed);
    setPendingPreview(URL.createObjectURL(compressed));
    // Default doc type to receipt on first attach; preserve if already set to a photo type
    const currentType = form.documentation_type;
    const isPhotoType = PHOTO_DOC_TYPES.some((t) => t.value === currentType);
    if (!isPhotoType) setField("documentation_type", "receipt");
  }

  function clearPhoto() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
    setReceiptError(null);
    // Recalculate doc type: note-only → written_record, nothing → none
    setField("documentation_type", hasNote ? "written_record" : "none");
  }

  function handleNoteChange(val: string) {
    setField("documentation_notes", val);
    if (!hasPhoto) {
      setField("documentation_type", val.trim() ? "written_record" : "none");
    }
  }

  function clearNote() {
    setField("documentation_notes", "");
    setNoteMode(false);
    if (!hasPhoto) setField("documentation_type", "none");
  }

  function validate(): string | null {
    const dateErr = validateDate(form.expense_date);
    if (dateErr) return dateErr;
    if (form.category === "mileage") {
      const miles = parseFloat(form.mileage_miles);
      if (!miles || miles <= 0) return "Enter the number of miles.";
    } else {
      const amt = parseFloat(form.cost);
      if (!amt || amt <= 0) return "Amount must be greater than $0.";
    }
    return null;
  }

  function buildPayload(): ExpenseFormPayload {
    const effectiveMiles =
      form.category === "mileage"
        ? parseFloat(form.mileage_miles) * (form.round_trip ? 2 : 1)
        : null;
    const cost =
      form.category === "mileage" ? (mileageAmount ?? 0) : parseFloat(form.cost) || 0;
    const description =
      form.category === "mileage" && !form.description.trim()
        ? `${form.round_trip ? "Round-trip" : "One-way"} ${form.mileage_miles} mi${form.vendor_name ? ` to ${form.vendor_name}` : ""}`
        : form.description.trim();

    // Compute final doc type from actual state
    let finalDocType: DocType = form.documentation_type;
    if (!hasPhoto && !hasNote) finalDocType = "none";
    else if (!hasPhoto && hasNote) finalDocType = "written_record";

    return {
      description,
      cost,
      paid_by: form.paid_by,
      payment_method: form.payment_method.trim() || null,
      vendor_name: form.vendor_name.trim() || null,
      category: form.category,
      deductible_percentage: parseInt(form.deductible_percentage) || 100,
      expense_date: form.expense_date || todayStr(),
      mileage_miles: effectiveMiles,
      mileage_rate: form.category === "mileage" ? parseFloat(form.mileage_rate) || 0.70 : null,
      mileage_from: form.category === "mileage" ? form.mileage_from.trim() || null : null,
      mileage_to: form.category === "mileage" ? form.mileage_to.trim() || null : null,
      show_session_id: form.show_session_id || null,
      documentation_notes: form.documentation_notes.trim() || null,
      documentation_type: finalDocType,
    };
  }

  async function commitSave() {
    setSaving(true);
    try {
      const payload = buildPayload();
      const expenseId = await onSave(payload);
      if (expenseId && pendingFile) {
        setUploadingReceipt(true);
        try {
          const fd = new FormData();
          fd.append("file", pendingFile);
          const photoDocType = PHOTO_DOC_TYPES.some((t) => t.value === payload.documentation_type)
            ? (payload.documentation_type as Parameters<typeof uploadExpenseReceipt>[2])
            : "receipt";
          await uploadExpenseReceipt(expenseId, fd, photoDocType);
        } finally {
          setUploadingReceipt(false);
        }
      }
      clearPhoto();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function handleSaveClick() {
    if (validate()) return;
    // For non-mileage expenses ≥$75 with no documentation: prompt
    if (
      form.category !== "mileage" &&
      costNum >= RECEIPT_REQUIRED_THRESHOLD &&
      !hasAnyDoc &&
      isOnline
    ) {
      setShowDocWarning(true);
      return;
    }
    void commitSave();
  }

  const validationError = validate();
  const canSave =
    !saving && !uploadingReceipt && !validationError &&
    (form.category === "mileage"
      ? !!form.mileage_miles && parseFloat(form.mileage_miles) > 0
      : !!form.description.trim() || !!form.vendor_name.trim());

  const categoryTip = form.category !== "mileage" ? CATEGORY_DOC_TIPS[form.category] : null;

  // ── Mileage chips ──────────────────────────────────────────────────────────
  const currentShow = form.show_session_id
    ? showSessions.find((s) => s.id === form.show_session_id)
    : null;
  const venueAddress = currentShow?.venue_address ?? null;
  const hasHomeButNoVenue = !!homeAddress && !!currentShow && !venueAddress;

  function buildChips(field: "from" | "to"): LocationChip[] {
    const chips: LocationChip[] = [];
    if (homeAddress) {
      chips.push({ icon: "🏠", label: "Home", address: homeAddress, title: homeAddress });
    }
    if (field === "to" && venueAddress && currentShow) {
      const label = currentShow.name.length > 20 ? currentShow.name.slice(0, 19) + "…" : currentShow.name;
      chips.push({ icon: "📍", label, address: venueAddress, title: venueAddress });
    }
    const remaining = 6 - chips.length;
    for (const loc of savedLocations.slice(0, remaining)) {
      const label = loc.label.length > 20 ? loc.label.slice(0, 19) + "…" : loc.label;
      chips.push({ icon: "📌", label, address: loc.address, title: loc.address });
    }
    return chips;
  }

  const fromChips = buildChips("from");
  const toChips = buildChips("to");

  const mapsUrl =
    form.mileage_from.trim() && form.mileage_to.trim()
      ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(form.mileage_from.trim())}&destination=${encodeURIComponent(form.mileage_to.trim())}`
      : null;

  // Photo type to display in the type picker
  const currentPhotoDocType = (
    PHOTO_DOC_TYPES.some((t) => t.value === form.documentation_type)
      ? form.documentation_type
      : "receipt"
  ) as PhotoDocType;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleReceiptFile}
      />

      {/* ── $75+ documentation warning modal ── */}
      {showDocWarning && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.80)", backdropFilter: "blur(4px)", zIndex: zIndex + 10 }}
        >
          <div className="modal-panel w-full max-w-sm p-5 space-y-4">
            <div className="flex items-start gap-3">
              <TriangleAlert size={18} className="shrink-0 text-amber-400 mt-0.5" />
              <div>
                <div className="modal-title text-sm mb-1">Add documentation?</div>
                <p className="text-xs opacity-60 leading-relaxed">
                  The IRS requires documentation for expenses {money(RECEIPT_REQUIRED_THRESHOLD)} or more.
                  Any of these count:
                </p>
                <ul className="text-xs opacity-50 mt-2 space-y-0.5 leading-relaxed">
                  <li>• Photo of receipt or item</li>
                  <li>• Screenshot of Venmo, Zelle, or bank transfer</li>
                  <li>• Written note describing the payment (who, what, when)</li>
                </ul>
                <p className="text-xs opacity-40 mt-2 leading-relaxed italic">
                  You can save without documentation, but this deduction may be rejected if audited.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                className="modal-btn-primary text-sm py-2.5 flex items-center justify-center gap-2"
                onClick={() => { setShowDocWarning(false); fileInputRef.current?.click(); }}
              >
                <Camera size={14} /> Add Photo
              </button>
              <button
                className="modal-btn-ghost text-sm py-2 flex items-center justify-center gap-2"
                onClick={() => { setShowDocWarning(false); setNoteMode(true); }}
              >
                <FileText size={14} /> Add Note
              </button>
              <button
                className="text-xs opacity-40 hover:opacity-60 py-1.5 transition-opacity"
                onClick={() => { setShowDocWarning(false); void commitSave(); }}
              >
                Save anyway (no documentation)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main overlay ── */}
      <div
        className="fixed inset-0 flex items-end sm:items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", zIndex }}
        onClick={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}
      >
        <div className="modal-panel w-full max-w-md max-h-[92vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className="modal-title">{title}</div>
            <button onClick={onClose} className="modal-close-btn"><X size={15} /></button>
          </div>

          <div className="px-5 pb-5 space-y-4">

            {/* ── Category pills ── */}
            <div>
              <div className="flex items-center mb-2">
                <label className="text-xs opacity-50 uppercase tracking-wide font-mono">Category</label>
                {taxEnabled && <ExpenseTooltip content={CATEGORY_TOOLTIP} />}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.filter((c) => taxEnabled || c.value !== "mileage").map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setField("category", c.value)}
                    className="text-xs px-2.5 py-1 rounded-full border transition-colors duration-150"
                    style={
                      form.category === c.value
                        ? { background: "rgba(139,92,246,0.18)", borderColor: "rgba(139,92,246,0.5)", color: "#c4b5fd" }
                        : { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.10)", color: "rgba(226,232,240,0.6)" }
                    }
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Mileage mode ── */}
            {form.category === "mileage" ? (
              <div className="space-y-3">

                {/* ── From address ── */}
                <div>
                  {fromChips.length > 0 && (
                    <div className="flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden pb-1 mb-2">
                      {fromChips.map((chip) => (
                        <button
                          key={chip.address}
                          type="button"
                          title={chip.title}
                          onClick={() => setField("mileage_from", chip.address)}
                          className="shrink-0 flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border transition-colors hover:bg-white/5"
                          style={
                            form.mileage_from === chip.address
                              ? { borderColor: "rgba(139,92,246,0.5)", background: "rgba(139,92,246,0.15)", color: "#c4b5fd" }
                              : { borderColor: "rgba(255,255,255,0.12)", color: "rgba(226,232,240,0.6)" }
                          }
                        >
                          <span>{chip.icon}</span>
                          <span>{chip.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {!homeAddress && !homeTipDismissed && (
                    <div className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 mb-2 text-xs"
                      style={{ borderColor: "rgba(139,92,246,0.2)", background: "rgba(139,92,246,0.04)" }}
                    >
                      <span className="opacity-60 flex-1 leading-relaxed">
                        Tip: Save your home address in Settings for one-tap mileage entry.{" "}
                        <a href="/protected/settings" className="text-violet-400 underline underline-offset-2">
                          Set home address →
                        </a>
                      </span>
                      <button type="button" onClick={dismissHomeTip} className="opacity-40 hover:opacity-70 transition-opacity shrink-0">
                        <X size={12} />
                      </button>
                    </div>
                  )}
                  <label className="text-xs opacity-50 mb-1.5 block">From</label>
                  <input
                    className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background"
                    placeholder="123 Main St, Sacramento, CA"
                    value={form.mileage_from}
                    onChange={(e) => setField("mileage_from", e.target.value)}
                    autoFocus
                  />
                </div>

                {/* ── To address ── */}
                <div>
                  {toChips.length > 0 && (
                    <div className="flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden pb-1 mb-2">
                      {toChips.map((chip) => (
                        <button
                          key={chip.address}
                          type="button"
                          title={chip.title}
                          onClick={() => setField("mileage_to", chip.address)}
                          className="shrink-0 flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border transition-colors hover:bg-white/5"
                          style={
                            form.mileage_to === chip.address
                              ? { borderColor: "rgba(139,92,246,0.5)", background: "rgba(139,92,246,0.15)", color: "#c4b5fd" }
                              : { borderColor: "rgba(255,255,255,0.12)", color: "rgba(226,232,240,0.6)" }
                          }
                        >
                          <span>{chip.icon}</span>
                          <span>{chip.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <label className="text-xs opacity-50 mb-1.5 block">To</label>
                  <input
                    className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background"
                    placeholder="Convention Center, San Jose, CA"
                    value={form.mileage_to}
                    onChange={(e) => setField("mileage_to", e.target.value)}
                  />
                  {hasHomeButNoVenue && (
                    <p className="text-[11px] opacity-30 mt-1 leading-relaxed">
                      Tip: Add this show&apos;s venue address when editing the show, and we&apos;ll auto-fill it next time.
                    </p>
                  )}
                </div>

                {/* ── Google Maps link ── */}
                {mapsUrl ? (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 underline underline-offset-2 transition-colors"
                  >
                    <ExternalLink size={12} />
                    Look up distance on Google Maps →
                  </a>
                ) : (
                  <p className="text-[11px] opacity-30">
                    Fill From and To above to open Google Maps directions
                  </p>
                )}

                {/* ── Miles input ── */}
                <div>
                  <label className="text-xs opacity-50 mb-1.5 block">Miles (one-way)</label>
                  <input
                    type="number" inputMode="decimal"
                    className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background font-mono"
                    placeholder="0" value={form.mileage_miles}
                    onChange={(e) => setField("mileage_miles", e.target.value)}
                  />
                  <p className="text-[11px] opacity-30 mt-1">Distance shown on Google Maps, typically the one-way trip</p>
                  {lastShowMileage && (
                    <button
                      type="button"
                      onClick={() => setField("mileage_miles", lastShowMileage.miles)}
                      className="mt-1.5 text-xs text-violet-400/70 hover:text-violet-400 transition-colors underline underline-offset-2"
                    >
                      Same as last entry ({lastShowMileage.miles} mi)
                    </button>
                  )}
                </div>

                {/* ── Round-trip + rate ── */}
                <div className="grid grid-cols-2 gap-3 items-start">
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none pt-1">
                    <input type="checkbox" checked={form.round_trip}
                      onChange={(e) => setField("round_trip", e.target.checked)} className="rounded" />
                    Round trip (×2)
                  </label>
                  <div>
                    <div className="flex items-center mb-1.5">
                      <label className="text-xs opacity-50">Rate ($/mi)</label>
                      <ExpenseTooltip content={MILEAGE_RATE_TOOLTIP} />
                    </div>
                    <input
                      type="number" inputMode="decimal"
                      className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background font-mono"
                      value={form.mileage_rate}
                      onChange={(e) => setField("mileage_rate", e.target.value)}
                    />
                  </div>
                </div>

                {/* ── Computed amount ── */}
                {mileageAmount != null && (
                  <div className="rounded-lg border px-3 py-2.5 space-y-0.5"
                    style={{ borderColor: "rgba(52,211,153,0.2)", background: "rgba(52,211,153,0.05)" }}
                  >
                    <div className="text-sm font-semibold tabular-nums font-mono text-emerald-400">
                      = {money(mileageAmount)}
                    </div>
                    {taxEnabled && (
                      <div className="text-xs opacity-50">~{money(estimateTaxSavings(mileageAmount))} estimated tax savings</div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div>
                  <label className="text-xs opacity-50 mb-1.5 block">Amount</label>
                  <input
                    type="number" inputMode="decimal"
                    className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background font-mono"
                    placeholder="0.00" value={form.cost}
                    onChange={(e) => setField("cost", e.target.value)}
                    autoFocus
                  />
                </div>
                {taxEnabled && deductibleAmt > 0 && (
                  <div className="rounded-lg border px-3 py-2 text-xs"
                    style={{ borderColor: "rgba(52,211,153,0.15)", background: "rgba(52,211,153,0.04)" }}
                  >
                    <span className="text-emerald-400 font-medium">{money(deductibleAmt)} tax deductible</span>
                    <span className="opacity-40 ml-2">· ~{money(estimatedSavings)} estimated savings</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs opacity-50 mb-1.5 block">Vendor</label>
                    <input
                      className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background"
                      placeholder="Hilton, Shell…" value={form.vendor_name}
                      onChange={(e) => setField("vendor_name", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs opacity-50 mb-1.5 block">Description</label>
                    <input
                      className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background"
                      placeholder="Optional notes" value={form.description}
                      onChange={(e) => setField("description", e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}

            {/* ── Date + Paid by ── */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs opacity-50 mb-1.5 block">Date</label>
                <input
                  type="date"
                  className={`w-full border rounded-lg px-3 py-2.5 text-sm bg-background ${validateDate(form.expense_date) ? "border-rose-500/60" : ""}`}
                  value={form.expense_date}
                  onChange={(e) => setField("expense_date", e.target.value)}
                />
                {validateDate(form.expense_date) && (
                  <p className="text-xs text-rose-400 mt-1">{validateDate(form.expense_date)}</p>
                )}
              </div>
              <div>
                <label className="text-xs opacity-50 mb-1.5 block">Paid by</label>
                <select
                  className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background"
                  value={form.paid_by}
                  onChange={(e) => setField("paid_by", e.target.value as FormState["paid_by"])}
                >
                  <option value="shared">Shared</option>
                  <option value="alex">Alex</option>
                  <option value="mila">Mila</option>
                </select>
              </div>
            </div>

            {/* ── Deductible % + Payment method ── */}
            <div className={`grid gap-3 ${taxEnabled ? "grid-cols-2" : "grid-cols-1"}`}>
              {taxEnabled && (
                <div>
                  <div className="flex items-center mb-1.5">
                    <label className="text-xs opacity-50">Tax deductible %</label>
                    <ExpenseTooltip content={DEDUCTIBLE_TOOLTIP} />
                  </div>
                  <input
                    type="number" inputMode="decimal" min={0} max={100}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background font-mono"
                    value={form.deductible_percentage}
                    onChange={(e) => setField("deductible_percentage", e.target.value)}
                  />
                  {form.category === "meals" && (
                    <p className="text-xs opacity-40 mt-1">50% per IRS rules for business meals</p>
                  )}
                </div>
              )}
              <div>
                <label className="text-xs opacity-50 mb-1.5 block">Payment method</label>
                <input
                  className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background"
                  placeholder="Visa ••••4242" value={form.payment_method}
                  onChange={(e) => setField("payment_method", e.target.value)}
                />
              </div>
            </div>

            {/* ── Linked show ── */}
            {showSessions.length > 0 && (
              <div>
                <label className="text-xs opacity-50 mb-1.5 block">Linked show</label>
                <select
                  className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background"
                  value={form.show_session_id}
                  onChange={(e) => setField("show_session_id", e.target.value)}
                >
                  <option value="">None</option>
                  {showSessions.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({fmtDate(s.date)})</option>
                  ))}
                </select>
              </div>
            )}

            {/* ── Documentation ── */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs opacity-50 uppercase tracking-wide font-mono">Documentation</span>
                <span className="text-xs opacity-30">· Proof for tax records</span>
              </div>

              {/* Mileage: no receipt needed */}
              {form.category === "mileage" ? (
                <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs"
                  style={{ background: "rgba(139,92,246,0.06)", borderColor: "rgba(139,92,246,0.18)", border: "1px solid" }}
                >
                  <Info size={12} className="shrink-0 mt-0.5 opacity-50" />
                  <span className="opacity-60 leading-relaxed">
                    Mileage expenses are documented by your mileage log — no receipt needed.
                  </span>
                </div>
              ) : !isOnline ? (
                // Offline
                <div className="flex items-center gap-2 text-xs px-3 py-2.5 rounded-lg border border-dashed opacity-40 cursor-not-allowed"
                  style={{ borderColor: "rgba(255,255,255,0.10)" }}
                >
                  <WifiOff size={13} />
                  Documentation upload requires a connection
                </div>
              ) : (
                <div className="space-y-2">
                  {receiptError && <p className="text-xs text-rose-400">{receiptError}</p>}

                  {/* State: nothing attached + not skipped → show 3 options */}
                  {!hasAnyDoc && !docSkipped && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setReceiptError(null); fileInputRef.current?.click(); }}
                        className="flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-colors hover:bg-white/5"
                        style={{ borderColor: "rgba(255,255,255,0.12)" }}
                      >
                        <Camera size={13} /> Photo
                      </button>
                      <button
                        type="button"
                        onClick={() => setNoteMode(true)}
                        className="flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-colors hover:bg-white/5"
                        style={{ borderColor: "rgba(255,255,255,0.12)" }}
                      >
                        <FileText size={13} /> Note
                      </button>
                      <button
                        type="button"
                        onClick={() => setDocSkipped(true)}
                        className="flex-1 text-xs px-3 py-2 rounded-lg border transition-colors opacity-40 hover:opacity-70"
                        style={{ borderColor: "rgba(255,255,255,0.08)" }}
                      >
                        Skip
                      </button>
                    </div>
                  )}

                  {/* State: skipped, nothing attached */}
                  {!hasAnyDoc && docSkipped && (
                    <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      <span className="opacity-40">No documentation</span>
                      <button
                        type="button"
                        onClick={() => setDocSkipped(false)}
                        className="opacity-50 hover:opacity-80 transition-opacity"
                      >
                        Undo
                      </button>
                    </div>
                  )}

                  {/* Photo attached */}
                  {hasPhoto && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={displayPhotoUrl!}
                          alt="Documentation"
                          className="w-14 h-14 rounded-lg border border-white/10 object-cover shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 text-xs text-emerald-400 mb-1.5">
                            <CheckCircle2 size={12} /> Attached
                          </div>
                          {/* Photo type picker */}
                          <div className="flex flex-wrap gap-1.5">
                            {PHOTO_DOC_TYPES.map((t) => (
                              <button
                                key={t.value}
                                type="button"
                                onClick={() => setField("documentation_type", t.value)}
                                className="text-[10px] px-2 py-0.5 rounded-full border transition-colors"
                                style={
                                  currentPhotoDocType === t.value
                                    ? { borderColor: "rgba(139,92,246,0.5)", background: "rgba(139,92,246,0.15)", color: "#c4b5fd" }
                                    : { borderColor: "rgba(255,255,255,0.10)", color: "rgba(226,232,240,0.45)" }
                                }
                              >
                                {t.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={clearPhoto}
                          className="shrink-0 text-xs opacity-30 hover:opacity-60 transition-opacity"
                          title="Remove photo"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      {/* Add note alongside photo */}
                      {!hasNote && !noteMode && (
                        <button
                          type="button"
                          onClick={() => setNoteMode(true)}
                          className="text-xs opacity-40 hover:opacity-70 transition-opacity flex items-center gap-1"
                        >
                          <FileText size={11} /> Also add a written note
                        </button>
                      )}
                    </div>
                  )}

                  {/* Note mode textarea */}
                  {(noteMode || hasNote) && (
                    <div className="space-y-1.5">
                      {!hasPhoto && (
                        <div className="flex items-center gap-1.5">
                          <FileText size={12} className="opacity-40" />
                          <span className="text-xs text-emerald-400/80">
                            {hasNote ? "Written record" : "Add a written record"}
                          </span>
                        </div>
                      )}
                      <textarea
                        className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background resize-none leading-relaxed"
                        style={{ minHeight: "100px", borderColor: hasNote ? "rgba(52,211,153,0.25)" : undefined }}
                        placeholder="What happened? Who did you pay? Example: 'Paid John Smith $150 cash at Sacramento show for shared booth space. His phone: 555-1234.'"
                        value={form.documentation_notes}
                        onChange={(e) => handleNoteChange(e.target.value)}
                        autoFocus={noteMode && !hasNote}
                      />
                      <div className="flex items-center justify-between">
                        {!hasPhoto && (
                          <button
                            type="button"
                            onClick={() => { setReceiptError(null); fileInputRef.current?.click(); }}
                            className="text-xs opacity-40 hover:opacity-70 transition-opacity flex items-center gap-1"
                          >
                            <Camera size={11} /> Also add a photo
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={clearNote}
                          className="text-xs opacity-30 hover:opacity-60 transition-opacity ml-auto"
                        >
                          Remove note
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Note-only (no photo) — offer to add photo */}
                  {hasNote && !hasPhoto && !noteMode && (
                    <button
                      type="button"
                      onClick={() => { setReceiptError(null); fileInputRef.current?.click(); }}
                      className="text-xs opacity-40 hover:opacity-70 transition-opacity flex items-center gap-1"
                    >
                      <Camera size={11} /> Also add a photo
                    </button>
                  )}

                  {/* Category tip */}
                  {categoryTip && !hasAnyDoc && (
                    <p className="text-[11px] opacity-35 italic leading-relaxed">{categoryTip}</p>
                  )}
                </div>
              )}
            </div>

            {/* ── Actions ── */}
            <div className="flex gap-2 pt-1">
              <button
                className="flex-1 modal-btn-primary text-sm py-2.5 disabled:opacity-50"
                onClick={handleSaveClick}
                disabled={!canSave}
              >
                {uploadingReceipt ? "Uploading…" : saving ? "Saving…" : title.startsWith("Edit") ? "Save changes" : "Add expense"}
              </button>
              <button className="modal-btn-ghost text-sm px-4 py-2.5" onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
