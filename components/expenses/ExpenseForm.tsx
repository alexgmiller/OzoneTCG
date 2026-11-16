"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  uploadExpenseReceipt,
  type DocType, type ExpenseCategory, type SavedLocation,
} from "@/app/protected/expenses/actions";
import type { ShowSessionSummary } from "@/app/protected/expenses/ExpensesServer";
import { Modal, useToast } from "@/components/ui";
import { estimateTaxSavings } from "@/lib/taxEstimate";
import { compressImage } from "./compressImage";
import { CategoryPicker } from "./form/CategoryPicker";
import { MileageFields } from "./form/MileageFields";
import { AmountFields } from "./form/AmountFields";
import { CommonFields } from "./form/CommonFields";
import { DocumentationSection } from "./form/DocumentationSection";
import { DocWarningPanel } from "./form/DocWarningPanel";
import {
  EXPENSE_CATEGORIES, MIN_RECEIPT_SIZE_BYTES, RECEIPT_REQUIRED_THRESHOLD,
  buildForm, isPhotoDocType, todayStr, validateDate,
  type ExpenseFormPayload, type FormState, type PhotoDocType,
} from "./form/shared";

export type { ExpenseFormPayload, FormState } from "./form/shared";

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
  // Existing receipt_url to show when editing an expense that already has a photo.
  existingPhotoUrl?: string;
  title?: string;
  lastShowMileage?: { miles: string; description: string };
  homeAddress?: string | null;
  savedLocations?: SavedLocation[];
}) {
  const toast = useToast();
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

  // ── Derived ──────────────────────────────────────────────────────────────
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

  const currentPhotoDocType: PhotoDocType =
    isPhotoDocType(form.documentation_type) ? form.documentation_type : "receipt";

  // ── Field helpers ────────────────────────────────────────────────────────
  function setField<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: val };
      if (key === "category") {
        const cat = EXPENSE_CATEGORIES.find((c) => c.value === val);
        if (cat) next.deductible_percentage = String(cat.defaultDeductible);
      }
      return next;
    });
  }

  function pickPhoto() {
    setReceiptError(null);
    fileInputRef.current?.click();
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
    // Default doc type to receipt on first attach; preserve an existing photo type
    if (!isPhotoDocType(form.documentation_type)) setField("documentation_type", "receipt");
  }

  function clearPhoto() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
    setReceiptError(null);
    setField("documentation_type", hasNote ? "written_record" : "none");
  }

  function handleNoteChange(val: string) {
    setField("documentation_notes", val);
    if (!hasPhoto) setField("documentation_type", val.trim() ? "written_record" : "none");
  }

  function clearNote() {
    setField("documentation_notes", "");
    setNoteMode(false);
    if (!hasPhoto) setField("documentation_type", "none");
  }

  // ── Validation + payload ─────────────────────────────────────────────────
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
    const isMileage = form.category === "mileage";
    const effectiveMiles = isMileage
      ? parseFloat(form.mileage_miles) * (form.round_trip ? 2 : 1)
      : null;
    const description =
      isMileage && !form.description.trim()
        ? `${form.round_trip ? "Round-trip" : "One-way"} ${form.mileage_miles} mi${form.vendor_name ? ` to ${form.vendor_name}` : ""}`
        : form.description.trim();

    let finalDocType: DocType = form.documentation_type;
    if (!hasPhoto && !hasNote) finalDocType = "none";
    else if (!hasPhoto && hasNote) finalDocType = "written_record";

    return {
      description,
      cost: isMileage ? (mileageAmount ?? 0) : parseFloat(form.cost) || 0,
      paid_by: form.paid_by,
      payment_method: form.payment_method.trim() || null,
      vendor_name: form.vendor_name.trim() || null,
      category: form.category,
      deductible_percentage: parseInt(form.deductible_percentage) || 100,
      expense_date: form.expense_date || todayStr(),
      mileage_miles: effectiveMiles,
      mileage_rate: isMileage ? parseFloat(form.mileage_rate) || 0.70 : null,
      mileage_from: isMileage ? form.mileage_from.trim() || null : null,
      mileage_to: isMileage ? form.mileage_to.trim() || null : null,
      show_session_id: form.show_session_id || null,
      documentation_notes: form.documentation_notes.trim() || null,
      documentation_type: finalDocType,
    };
  }

  // ── Save ─────────────────────────────────────────────────────────────────
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
          const photoDocType: DocType = isPhotoDocType(payload.documentation_type)
            ? payload.documentation_type
            : "receipt";
          await uploadExpenseReceipt(expenseId, fd, photoDocType);
        } finally {
          setUploadingReceipt(false);
        }
      }
      clearPhoto();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save expense");
    } finally {
      setSaving(false);
    }
  }

  function handleSaveClick() {
    if (validate()) return;
    // Non-mileage expenses >= $75 with no documentation: prompt first
    if (form.category !== "mileage" && costNum >= RECEIPT_REQUIRED_THRESHOLD && !hasAnyDoc && isOnline) {
      setShowDocWarning(true);
      return;
    }
    void commitSave();
  }

  const canSave =
    !saving && !uploadingReceipt && !validate() &&
    (form.category === "mileage"
      ? !!form.mileage_miles && parseFloat(form.mileage_miles) > 0
      : !!form.description.trim() || !!form.vendor_name.trim());

  const saveLabel = uploadingReceipt
    ? "Uploading…"
    : saving ? "Saving…" : title.startsWith("Edit") ? "Save changes" : "Add expense";

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <Modal open onClose={onClose} className="max-h-full overflow-y-auto">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleReceiptFile}
      />

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">
          {showDocWarning ? "Add documentation?" : title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
        >
          <X size={18} />
        </button>
      </div>

      {showDocWarning ? (
        <DocWarningPanel
          onAddPhoto={() => { setShowDocWarning(false); pickPhoto(); }}
          onAddNote={() => { setShowDocWarning(false); setNoteMode(true); }}
          onSaveAnyway={() => { setShowDocWarning(false); void commitSave(); }}
        />
      ) : (
        <div className="space-y-4">
          <CategoryPicker value={form.category} onChange={(c) => setField("category", c)} />

          {form.category === "mileage" ? (
            <MileageFields
              form={form}
              setField={setField}
              showSessions={showSessions}
              homeAddress={homeAddress}
              savedLocations={savedLocations}
              lastShowMileage={lastShowMileage}
              mileageAmount={mileageAmount}
            />
          ) : (
            <AmountFields
              form={form}
              setField={setField}
              deductibleAmt={deductibleAmt}
              estimatedSavings={estimatedSavings}
            />
          )}

          <CommonFields form={form} setField={setField} showSessions={showSessions} />

          <DocumentationSection
            category={form.category}
            isOnline={isOnline}
            displayPhotoUrl={displayPhotoUrl}
            notes={form.documentation_notes}
            photoDocType={currentPhotoDocType}
            receiptError={receiptError}
            noteMode={noteMode}
            docSkipped={docSkipped}
            onPickPhoto={pickPhoto}
            onClearPhoto={clearPhoto}
            onPhotoDocType={(t) => setField("documentation_type", t)}
            onNoteChange={handleNoteChange}
            onClearNote={clearNote}
            onStartNote={() => setNoteMode(true)}
            onSkip={setDocSkipped}
          />

          {/* ── Actions ── */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="h-11 flex-1 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:bg-accent disabled:opacity-40"
              onClick={handleSaveClick}
              disabled={!canSave}
            >
              {saveLabel}
            </button>
            <button
              type="button"
              className="h-11 rounded-lg border border-border px-4 text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
