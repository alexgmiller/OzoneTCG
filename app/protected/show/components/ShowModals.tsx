"use client";

import React from "react";
import { Camera, X as XIcon, RefreshCw } from "lucide-react";
import type { ShowSession } from "../actions";
import {
  getPendingCount,
  getPendingActions,
  type PendingAction,
  pendingActionLabel,
} from "@/lib/offlineQueue";
import { replayPendingActions, replayOneAction } from "@/lib/offlineSync";
import { EXPENSE_CATEGORIES, money, moneyCash, moneySign, fmtDate } from "../utils";

// ── End show modal ────────────────────────────────────────────────────────────

type EndShowModalProps = {
  session: ShowSession | null;
  endStep: "preview" | "finalize";
  setEndStep: React.Dispatch<React.SetStateAction<"preview" | "finalize">>;
  setEndOpen: React.Dispatch<React.SetStateAction<boolean>>;
  actualCash: string;
  setActualCash: React.Dispatch<React.SetStateAction<string>>;
  busy: boolean;
  handleEndShow: () => void;
};

export function EndShowModal({
  session,
  endStep,
  setEndStep,
  setEndOpen,
  actualCash,
  setActualCash,
  busy,
  handleEndShow,
}: EndShowModalProps) {
  const expectedCashLocal =
    (session?.starting_cash ?? 0) -
    (session?.total_spent ?? 0) +
    (session?.total_revenue ?? 0);
  const actualNum = parseFloat(actualCash) || null;
  const discrepancy = actualNum != null ? actualNum - expectedCashLocal : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
    >
      <div className="modal-panel w-full max-w-sm p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        {endStep === "preview" ? (
          <>
            <div className="flex items-center justify-between">
              <div className="modal-title">End Show?</div>
              <button onClick={() => setEndOpen(false)} className="modal-close-btn">✕</button>
            </div>
            <div>
              <div className="font-semibold">{session?.name}</div>
              <div className="text-sm opacity-50">{session ? fmtDate(session.date) : ""}</div>
            </div>

            {/* Summary stats */}
            <div className="space-y-1.5 text-sm border rounded-xl p-3">
              <div className="flex justify-between"><span className="opacity-60">Cards bought</span><span className="font-medium">{session?.cards_bought ?? 0}</span></div>
              <div className="flex justify-between"><span className="opacity-60">Cards sold</span><span className="font-medium">{session?.cards_sold ?? 0}</span></div>
              <div className="flex justify-between"><span className="opacity-60">Trades</span><span className="font-medium">{session?.trades_count ?? 0}</span></div>
              <div className="flex justify-between"><span className="opacity-60">Passed</span><span className="font-medium">{session?.passes_count ?? 0}</span></div>
              <div className="flex justify-between border-t pt-1.5 mt-1"><span className="opacity-60">Spent</span><span className="font-medium text-rose-400">{money(session?.total_spent ?? 0)}</span></div>
              <div className="flex justify-between"><span className="opacity-60">Revenue</span><span className="font-medium text-emerald-400">{money(session?.total_revenue ?? 0)}</span></div>
              <div className="flex justify-between font-semibold border-t pt-1.5 mt-1">
                <span>Net P&L</span>
                <span className={session && session.net_pl >= 0 ? "text-emerald-400" : "text-rose-400"}>{moneySign(session?.net_pl ?? 0)}</span>
              </div>
            </div>

            <p className="text-xs opacity-50 text-center">Finalizing will close the session and calculate your P&L. You can count cash in the next step.</p>

            <div className="flex gap-2">
              <button className="flex-1 py-3 rounded-xl text-sm font-semibold text-white" style={{ background: "#ef4444" }} onClick={() => setEndStep("finalize")}>
                Finalize Show →
              </button>
              <button className="modal-btn-ghost px-4" onClick={() => setEndOpen(false)}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="modal-title">Cash Reconciliation</div>
              <button onClick={() => setEndStep("preview")} className="text-xs opacity-50 hover:opacity-80">← Back</button>
            </div>

            <div className="text-sm space-y-1 opacity-70 border rounded-xl p-3">
              <div className="flex justify-between"><span>Starting cash</span><span>{money(session?.starting_cash ?? 0)}</span></div>
              <div className="flex justify-between"><span>Expected cash</span><span className="font-medium">{money(expectedCashLocal)}</span></div>
            </div>

            <div>
              <div className="text-xs opacity-50 mb-1">Actual cash counted (optional)</div>
              <input
                type="number"
                inputMode="decimal"
                className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background font-mono"
                placeholder={`Expected: ${money(expectedCashLocal)}`}
                value={actualCash}
                onChange={(e) => setActualCash(e.target.value)}
              />
            </div>
            {discrepancy != null && (
              <div className={`text-sm font-semibold ${Math.abs(discrepancy) < 0.01 ? "text-emerald-400" : "text-amber-400"}`}>
                {Math.abs(discrepancy) < 0.01 ? "✓ Cash matches" : `Discrepancy: ${moneySign(discrepancy)}`}
              </div>
            )}

            <div className="flex gap-2">
              <button
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white"
                style={{ background: "#ef4444" }}
                onClick={handleEndShow}
                disabled={busy}
              >
                {busy ? "Ending…" : "Save & End Show"}
              </button>
              <button className="modal-btn-ghost px-4" onClick={() => setEndOpen(false)} disabled={busy}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Expense modal ─────────────────────────────────────────────────────────────

type ExpenseModalProps = {
  expenseDesc: string;
  setExpenseDesc: React.Dispatch<React.SetStateAction<string>>;
  expenseCost: string;
  setExpenseCost: React.Dispatch<React.SetStateAction<string>>;
  expenseCategory: string;
  setExpenseCategory: React.Dispatch<React.SetStateAction<string>>;
  expensePaidBy: "alex" | "mila";
  setExpensePaidBy: React.Dispatch<React.SetStateAction<"alex" | "mila">>;
  busy: boolean;
  handleAddExpense: () => void;
  setExpenseOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export function ExpenseModal({
  expenseDesc,
  setExpenseDesc,
  expenseCost,
  setExpenseCost,
  expenseCategory,
  setExpenseCategory,
  expensePaidBy,
  setExpensePaidBy,
  busy,
  handleAddExpense,
  setExpenseOpen,
}: ExpenseModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div className="modal-panel w-full max-w-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="modal-title">Add Expense</div>
          <button onClick={() => setExpenseOpen(false)} className="modal-close-btn">✕</button>
        </div>
        <select className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background" value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)}>
          {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <input
          className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background"
          placeholder="Description"
          value={expenseDesc}
          onChange={(e) => setExpenseDesc(e.target.value)}
          autoFocus
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            inputMode="decimal"
            className="border rounded-lg px-3 py-2.5 text-sm bg-background font-mono"
            placeholder="Amount $"
            value={expenseCost}
            onChange={(e) => setExpenseCost(e.target.value)}
          />
          <select className="border rounded-lg px-3 py-2.5 text-sm bg-background" value={expensePaidBy} onChange={(e) => setExpensePaidBy(e.target.value as "alex" | "mila")}>
            <option value="alex">Paid by Alex</option>
            <option value="mila">Paid by Mila</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button className="flex-1 modal-btn-primary" onClick={handleAddExpense} disabled={busy}>{busy ? "Adding…" : "Add Expense"}</button>
          <button className="modal-btn-ghost" onClick={() => setExpenseOpen(false)}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Cash count modal ──────────────────────────────────────────────────────────

type CashCountModalProps = {
  session: ShowSession | null;
  expectedCash: number;
  cashCountInput: string;
  setCashCountInput: React.Dispatch<React.SetStateAction<string>>;
  setCashCountOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export function CashCountModal({
  session,
  expectedCash,
  cashCountInput,
  setCashCountInput,
  setCashCountOpen,
}: CashCountModalProps) {
  const cashCountNum = parseFloat(cashCountInput) || null;
  const diff = cashCountNum != null ? cashCountNum - expectedCash : null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) setCashCountOpen(false); }}
    >
      <div className="modal-panel w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="modal-title">Quick Cash Count</div>
          <button onClick={() => setCashCountOpen(false)} className="modal-close-btn"><XIcon size={15} /></button>
        </div>
        <div className="text-sm space-y-1 border rounded-xl p-3">
          <div className="flex justify-between opacity-70">
            <span>Starting cash</span>
            <span>{money(session?.starting_cash ?? 0)}</span>
          </div>
          <div className="flex justify-between">
            <span>Expected now</span>
            <span className={`font-semibold ${expectedCash < 0 ? "text-rose-400" : ""}`}>{moneyCash(expectedCash)}</span>
          </div>
        </div>
        <div>
          <div className="text-xs opacity-50 mb-1">Count your cash</div>
          <input
            type="number"
            inputMode="decimal"
            className="w-full border rounded-xl px-4 py-3 text-lg font-semibold bg-background font-mono"
            placeholder={`Expected: ${moneyCash(expectedCash)}`}
            value={cashCountInput}
            onChange={(e) => setCashCountInput(e.target.value)}
            autoFocus
          />
        </div>
        {diff != null && (
          <div className={`text-center font-semibold ${Math.abs(diff) < 0.01 ? "text-emerald-400" : "text-amber-400"}`}>
            {Math.abs(diff) < 0.01 ? "✓ Cash matches" : `Discrepancy: ${moneySign(diff)}`}
          </div>
        )}
        <button className="w-full modal-btn-ghost" onClick={() => setCashCountOpen(false)}>Close</button>
      </div>
    </div>
  );
}

// ── Pending sync modal ────────────────────────────────────────────────────────

type PendingSyncModalProps = {
  pendingModalActions: PendingAction[];
  setPendingModalActions: React.Dispatch<React.SetStateAction<PendingAction[]>>;
  setPendingModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingCount: React.Dispatch<React.SetStateAction<number>>;
};

export function PendingSyncModal({
  pendingModalActions,
  setPendingModalActions,
  setPendingModalOpen,
  setPendingCount,
}: PendingSyncModalProps) {
  return (
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center modal-backdrop p-4"
      style={{ zIndex: 9999 }}
      onClick={() => setPendingModalOpen(false)}
    >
      <div
        className="modal-panel w-full max-w-sm p-5 space-y-4 max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Pending Transactions</div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                const { synced, failed } = await replayPendingActions();
                const actions = await getPendingActions().catch(() => []);
                setPendingModalActions(actions);
                getPendingCount().then(setPendingCount).catch(() => {});
                if (synced > 0 && failed === 0) setPendingModalOpen(false);
              }}
              className="text-xs px-2.5 py-1 rounded-lg border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 flex items-center gap-1.5"
            >
              <RefreshCw size={11} />
              Retry All
            </button>
            <button onClick={() => setPendingModalOpen(false)}>
              <XIcon size={16} className="opacity-50" />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto space-y-2 flex-1">
          {pendingModalActions.length === 0 ? (
            <div className="text-xs opacity-50 text-center py-4">No pending transactions</div>
          ) : (
            pendingModalActions.map((action) => {
              const isFailed = action.retryCount > 3;
              return (
                <div
                  key={action.id}
                  className={`flex items-start gap-3 p-2.5 rounded-xl border ${isFailed ? "border-red-500/30 bg-red-500/5" : "border-amber-500/20 bg-amber-500/5"}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{pendingActionLabel(action)}</div>
                    <div className={`text-[10px] mt-0.5 ${isFailed ? "text-red-400" : "opacity-40"}`}>
                      {action.actionType.toUpperCase()} · {new Date(action.timestamp).toLocaleTimeString()}
                      {isFailed && action.errorMessage && ` · ${action.errorMessage}`}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      await replayOneAction(action.id);
                      const actions = await getPendingActions().catch(() => []);
                      setPendingModalActions(actions);
                      getPendingCount().then(setPendingCount).catch(() => {});
                    }}
                    className="shrink-0 text-[10px] px-2 py-0.5 rounded border border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                  >
                    Retry
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ── Deal photo modal (centered, above bottom nav) ─────────────────────────────

type DealPhotoModalProps = {
  photoPreview: string | null;
  setPhotoFile: React.Dispatch<React.SetStateAction<File | null>>;
  setPhotoPreview: React.Dispatch<React.SetStateAction<string | null>>;
  photoUploading: boolean;
  dealNotes: string;
  setDealNotes: React.Dispatch<React.SetStateAction<string>>;
  photoInputRef: React.RefObject<HTMLInputElement | null>;
  dismissPhotoPrompt: () => void;
  handlePhotoConfirm: () => void;
};

export function DealPhotoModal({
  photoPreview,
  setPhotoFile,
  setPhotoPreview,
  photoUploading,
  dealNotes,
  setDealNotes,
  photoInputRef,
  dismissPhotoPrompt,
  handlePhotoConfirm,
}: DealPhotoModalProps) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center modal-backdrop p-4"
      style={{ zIndex: 9999 }}
      onClick={dismissPhotoPrompt}
    >
      <div
        className="modal-panel w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <Camera size={16} className="text-muted-foreground" />
            <span className="text-sm font-semibold">{photoPreview ? "Confirm photo" : "Add a photo"}</span>
          </div>
          <button onClick={dismissPhotoPrompt} className="p-1.5 rounded-lg hover:bg-white/8 transition-colors text-muted-foreground">
            <XIcon size={15} />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {photoPreview ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoPreview}
                alt="Deal photo preview"
                className="w-full rounded-xl object-cover max-h-64"
              />
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { setPhotoFile(null); if (photoPreview) URL.revokeObjectURL(photoPreview); setPhotoPreview(null); }}
                  className="modal-btn-ghost py-2.5"
                >
                  Retake
                </button>
                <button
                  onClick={handlePhotoConfirm}
                  disabled={photoUploading}
                  className="modal-btn-primary py-2.5"
                >
                  {photoUploading ? "Saving…" : "Save Photo"}
                </button>
              </div>
            </>
          ) : (
            <>
              <textarea
                rows={2}
                placeholder="Optional notes…"
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background resize-none"
                value={dealNotes}
                onChange={(e) => setDealNotes(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={dismissPhotoPrompt}
                  className="modal-btn-ghost py-2.5"
                >
                  Skip
                </button>
                <button
                  onClick={() => photoInputRef.current?.click()}
                  className="modal-btn-primary py-2.5 flex items-center justify-center gap-2"
                >
                  <Camera size={14} />
                  Take Photo
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
