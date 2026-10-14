"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { EmptyState, MoneyDisplay, useConfirm, useToast } from "@/components/ui";
import { deleteConsigner } from "./actions";
import { ConsignerCard } from "./ConsignerCard";
import { ConsignerFormModal } from "./ConsignerForm";
import { ReceiveCardsModal } from "./ReceiveCardsModal";
import { RecordPayoutModal } from "./PayoutSection";
import { type Consigner, errorMessage, portalUrl, BTN_PRIMARY } from "./shared";

export type { Consigner, SoldItem, PayoutRecord } from "./shared";

// ── Ghost preview for the empty state ──

function GhostCard() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4" aria-hidden>
      <div className="h-11 w-11 shrink-0 rounded-full bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-28 rounded-lg bg-muted" />
        <div className="h-3 w-40 rounded-lg bg-muted" />
      </div>
      <div className="h-5 w-16 rounded-lg bg-muted" />
    </div>
  );
}

// ── Page client ──

export default function ConsignersClient({ consigners }: { consigners: Consigner[] }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [formTarget, setFormTarget] = useState<"new" | Consigner | null>(null);
  const [receiveFor, setReceiveFor] = useState<Consigner | null>(null);
  const [payoutFor, setPayoutFor] = useState<Consigner | null>(null);

  const totalOwed = consigners.reduce((s, c) => s + c.pending_payout, 0);

  async function handleDelete(c: Consigner) {
    const ok = await confirm({
      title: `Delete ${c.name}?`,
      description: "Their items will lose the consigner tag, but won't be deleted.",
      confirmLabel: "Delete consigner",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteConsigner(c.id);
      toast.success(`${c.name} removed`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(portalUrl(token));
      toast.success("Portal link copied");
    } catch {
      toast.error("Couldn't copy — long-press the link in the card footer instead");
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground">Consigners</h1>
          {consigners.length > 0 && (
            <p className="text-xs tabular-nums text-muted-foreground">
              {consigners.length} consigner{consigners.length === 1 ? "" : "s"} ·{" "}
              <MoneyDisplay amount={totalOwed} tone={totalOwed > 0 ? "positive" : "neutral"} /> owed
            </p>
          )}
        </div>
        <button type="button" className={BTN_PRIMARY} onClick={() => setFormTarget("new")} disabled={busy}>
          <Plus size={16} /> New
        </button>
      </div>

      {/* ── List ── */}
      {consigners.length === 0 ? (
        <EmptyState
          title="No consigners yet"
          hint="When someone leaves cards with you to sell, add them here to track their items, sales and payouts."
          preview={<GhostCard />}
          cta={
            <button type="button" className={`${BTN_PRIMARY} w-full`} onClick={() => setFormTarget("new")}>
              <Plus size={16} /> Add your first consigner
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {consigners.map((c) => (
            <ConsignerCard
              key={c.id}
              consigner={c}
              disabled={busy}
              onEdit={() => setFormTarget(c)}
              onDelete={() => handleDelete(c)}
              onReceive={() => setReceiveFor(c)}
              onPayout={() => setPayoutFor(c)}
              onCopyLink={() => copyLink(c.token)}
            />
          ))}
        </div>
      )}

      {/* ── Modals (one at a time) ── */}
      <ConsignerFormModal target={formTarget} onClose={() => setFormTarget(null)} />
      {receiveFor && <ReceiveCardsModal consigner={receiveFor} onClose={() => setReceiveFor(null)} />}
      {payoutFor && <RecordPayoutModal consigner={payoutFor} onClose={() => setPayoutFor(null)} />}
    </div>
  );
}
