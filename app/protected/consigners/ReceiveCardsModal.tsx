"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Modal, useToast } from "@/components/ui";
import { receiveCards } from "./actions";
import type { ReceiveCardInput } from "./actions";
import {
  type Consigner, errorMessage,
  INPUT, FIELD_LABEL, BTN_PRIMARY, BTN_GHOST, BTN_SOFT,
} from "./shared";

// ── Card rows ──

type CardRow = ReceiveCardInput & { _id: string };

function blankCard(): CardRow {
  return {
    _id: crypto.randomUUID(),
    name: "",
    set_name: null,
    card_number: null,
    condition: "Near Mint",
    category: "single",
    grade: null,
    market: null,
  };
}

const CONDITIONS = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"] as const;
const COND_ABBR: Record<string, string> = {
  "Near Mint": "NM", "Lightly Played": "LP", "Moderately Played": "MP",
  "Heavily Played": "HP", "Damaged": "DMG",
};

// ── Modal ──

export function ReceiveCardsModal({
  consigner,
  onClose,
}: {
  consigner: Consigner;
  onClose: () => void;
}) {
  const toast = useToast();
  const [cards, setCards] = useState<CardRow[]>([blankCard()]);
  const [busy, setBusy] = useState(false);

  const validCount = cards.filter((c) => c.name.trim()).length;

  function updateCard(id: string, patch: Partial<CardRow>) {
    setCards((cs) => cs.map((c) => (c._id === id ? { ...c, ...patch } : c)));
  }

  async function handleSubmit() {
    const valid = cards.filter((c) => c.name.trim());
    if (valid.length === 0) {
      toast.warning("Enter at least one card name");
      return;
    }
    setBusy(true);
    try {
      await receiveCards({
        consignerId: consigner.id,
        cards: valid.map((c) => ({
          name: c.name,
          set_name: c.set_name,
          card_number: c.card_number,
          condition: c.condition,
          category: c.category,
          grade: c.grade,
          market: c.market,
        })),
      });
      toast.success(`Added ${valid.length} card${valid.length === 1 ? "" : "s"} for ${consigner.name}`);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Receive cards" className="max-h-full overflow-y-auto">
      <p className="-mt-2 mb-4 text-xs text-muted-foreground">
        {consigner.name} · <span className="tabular-nums">{Math.round(consigner.rate * 100)}%</span> to them
      </p>

      <div className="space-y-3">
        {cards.map((card, i) => (
          <div key={card._id} className="space-y-2 rounded-xl border border-border bg-muted p-3">
            <div className="flex items-center justify-between">
              <span className={FIELD_LABEL}>Card {i + 1}</span>
              {cards.length > 1 && (
                <button
                  type="button"
                  onClick={() => setCards((cs) => cs.filter((c) => c._id !== card._id))}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:text-negative"
                  aria-label={`Remove card ${i + 1}`}
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <input
              className={INPUT}
              placeholder="Card name"
              value={card.name}
              onChange={(e) => updateCard(card._id, { name: e.target.value })}
            />

            <div className="grid grid-cols-2 gap-2">
              <input
                className={INPUT}
                placeholder="Set"
                value={card.set_name ?? ""}
                onChange={(e) => updateCard(card._id, { set_name: e.target.value || null })}
              />
              <input
                className={INPUT}
                placeholder="Card #"
                value={card.card_number ?? ""}
                onChange={(e) => updateCard(card._id, { card_number: e.target.value || null })}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                className={INPUT}
                value={card.category}
                onChange={(e) => updateCard(card._id, { category: e.target.value as CardRow["category"], grade: null })}
              >
                <option value="single">Single</option>
                <option value="slab">Slab</option>
                <option value="sealed">Sealed</option>
              </select>
              {card.category === "slab" ? (
                <input
                  className={INPUT}
                  placeholder="Grade (PSA 10)"
                  value={card.grade ?? ""}
                  onChange={(e) => updateCard(card._id, { grade: e.target.value || null })}
                />
              ) : (
                <select
                  className={INPUT}
                  value={card.condition}
                  onChange={(e) => updateCard(card._id, { condition: e.target.value as CardRow["condition"] })}
                >
                  {CONDITIONS.map((c) => <option key={c} value={c}>{COND_ABBR[c]} · {c}</option>)}
                </select>
              )}
            </div>

            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <input
                type="number" min="0" step="0.01" inputMode="decimal"
                className={`${INPUT} pl-7 tabular-nums`}
                placeholder="Asking price (optional)"
                value={card.market ?? ""}
                onChange={(e) => updateCard(card._id, { market: parseFloat(e.target.value) || null })}
              />
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setCards((cs) => [...cs, blankCard()])}
          className={`${BTN_SOFT} w-full`}
        >
          <Plus size={16} /> Add another card
        </button>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={`${BTN_GHOST} flex-1`} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy || validCount === 0}
            className={`${BTN_PRIMARY} flex-1 tabular-nums`}
          >
            {busy ? "Saving…" : validCount === 0 ? "Add cards" : `Add ${validCount} card${validCount === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
