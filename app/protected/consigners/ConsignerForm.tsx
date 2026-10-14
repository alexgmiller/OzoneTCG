"use client";

import { useEffect, useState } from "react";
import { Modal, useToast } from "@/components/ui";
import { createConsigner, updateConsigner } from "./actions";
import {
  type Consigner, errorMessage,
  INPUT, TEXTAREA, FIELD_LABEL, BTN_PRIMARY, BTN_GHOST,
} from "./shared";

// ── Form state ──

type EditForm = { name: string; rate: string; phone: string; notes: string };

function blankForm(): EditForm {
  return { name: "", rate: "85", phone: "", notes: "" };
}

function fromConsigner(c: Consigner): EditForm {
  return {
    name: c.name,
    rate: String(Math.round(c.rate * 100)),
    phone: c.phone ?? "",
    notes: c.notes ?? "",
  };
}

// ── Add / edit modal ──
// `target` is "new" to create, a Consigner to edit, or null when closed.

export function ConsignerFormModal({
  target,
  onClose,
}: {
  target: "new" | Consigner | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<EditForm>(blankForm());
  const [busy, setBusy] = useState(false);

  const editing = target !== null && target !== "new" ? target : null;
  const open = target !== null;

  useEffect(() => {
    if (target === "new") setForm(blankForm());
    else if (target) setForm(fromConsigner(target));
  }, [target]);

  const rate = Number(form.rate);
  const rateValid = Number.isFinite(rate) && rate > 0 && rate <= 100;
  const canSave = form.name.trim().length > 0 && rateValid && !busy;

  async function handleSave() {
    if (!canSave) return;
    setBusy(true);
    try {
      const input = {
        name: form.name,
        rate: rate / 100,
        phone: form.phone || null,
        notes: form.notes || null,
      };
      if (editing) {
        await updateConsigner(editing.id, input);
        toast.success("Consigner updated");
      } else {
        await createConsigner(input);
        toast.success("Consigner added");
      }
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit consigner" : "New consigner"}>
      <div className="space-y-3">
        <div className="space-y-1">
          <label htmlFor="consigner-name" className={FIELD_LABEL}>Name</label>
          <input
            id="consigner-name"
            className={INPUT}
            placeholder="Who is consigning?"
            value={form.name}
            autoFocus
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="consigner-rate" className={FIELD_LABEL}>Their share of each sale</label>
          <div className="flex items-center gap-3">
            <div className="relative w-28 shrink-0">
              <input
                id="consigner-rate"
                className={`${INPUT} pr-8 tabular-nums`}
                inputMode="decimal"
                value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
            <span className="text-xs text-muted-foreground">
              You keep <span className="tabular-nums">{rateValid ? 100 - rate : "—"}%</span>
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="consigner-phone" className={FIELD_LABEL}>Phone <span className="font-normal">(optional)</span></label>
          <input
            id="consigner-phone"
            className={INPUT}
            type="tel"
            placeholder="555-0100"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="consigner-notes" className={FIELD_LABEL}>Notes <span className="font-normal">(optional)</span></label>
          <textarea
            id="consigner-notes"
            className={TEXTAREA}
            rows={2}
            placeholder="Preferred payout method, reminders…"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" className={`${BTN_GHOST} flex-1`} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={`${BTN_PRIMARY} flex-1`} onClick={handleSave} disabled={!canSave}>
            {busy ? "Saving…" : editing ? "Save" : "Add consigner"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
