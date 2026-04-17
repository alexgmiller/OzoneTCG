"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Trash2 } from "lucide-react";
import type { ShowSession } from "@/app/protected/show/actions";
import { deleteShowSession } from "@/app/protected/show/actions";
import ConfirmationModal from "@/components/ConfirmationModal";

function money(v: number) {
  return `$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function moneySign(v: number) {
  return (v >= 0 ? "+" : "−") + money(v);
}
function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type DeleteTarget = { show: ShowSession; withTransactions: boolean } | null;

export default function ShowsPastList({ shows }: { shows: ShowSession[] }) {
  const router = useRouter();
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [choiceTarget, setChoiceTarget] = useState<ShowSession | null>(null);
  const [deleting, setDeleting] = useState(false);

  function openMenu(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setMenuOpenId(menuOpenId === id ? null : id);
  }

  function requestDelete(show: ShowSession, e: React.MouseEvent) {
    e.stopPropagation();
    setMenuOpenId(null);
    setChoiceTarget(show);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteShowSession(deleteTarget.show.id, deleteTarget.withTransactions);
      router.refresh();
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <>
      <div className="border rounded-xl divide-y">
        {shows.map((show) => (
          <div key={show.id} className="p-4 relative">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-sm">{show.name}</div>
                <div className="text-xs opacity-50 mt-0.5">{fmtDate(show.date)}</div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className={`text-base font-bold tabular-nums ${show.net_pl >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                  {moneySign(show.net_pl)}
                </div>

                {/* 3-dot menu */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => openMenu(show.id, e)}
                    className="p-1.5 rounded-lg opacity-30 hover:opacity-80 transition-opacity"
                  >
                    <MoreHorizontal size={14} />
                  </button>

                  {menuOpenId === show.id && (
                    <>
                      {/* dismiss overlay */}
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setMenuOpenId(null)}
                      />
                      <div className="absolute right-0 top-7 z-20 bg-background border rounded-xl shadow-xl py-1 min-w-[140px]">
                        <button
                          type="button"
                          onClick={(e) => requestDelete(show, e)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 size={13} />
                          Delete show
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-50">
              <span>{show.cards_bought} bought</span>
              <span>{show.cards_sold} sold</span>
              {show.trades_count > 0 && <span>{show.trades_count} trade{show.trades_count !== 1 ? "s" : ""}</span>}
              {show.passes_count > 0 && <span>{show.passes_count} passed</span>}
              {show.total_revenue > 0 && <span>Revenue {money(show.total_revenue)}</span>}
              {show.total_spent > 0 && <span>Spent {money(show.total_spent)}</span>}
            </div>

            {show.actual_cash != null && show.ending_cash != null && (
              <div className="mt-2 text-xs">
                {Math.abs(show.actual_cash - show.ending_cash) < 0.01 ? (
                  <span className="text-emerald-500">✓ Cash reconciled</span>
                ) : (
                  <span className="text-amber-500">
                    Cash discrepancy: {moneySign(show.actual_cash - show.ending_cash)}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Step 1: choose scope */}
      {choiceTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-background border rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-9 h-9 rounded-full bg-red-500/15 flex items-center justify-center">
                <Trash2 size={16} className="text-red-500" />
              </div>
              <div>
                <h2 className="font-semibold text-base">Delete "{choiceTarget.name}"?</h2>
                <p className="text-sm opacity-60 mt-1">
                  What should happen to the inventory items and expenses recorded during this show?
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget({ show: choiceTarget, withTransactions: false });
                  setChoiceTarget(null);
                }}
                className="w-full text-left border rounded-xl px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                <div className="font-medium text-sm">Delete show only</div>
                <div className="text-xs opacity-50 mt-0.5">Keep all inventory items and expenses</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget({ show: choiceTarget, withTransactions: true });
                  setChoiceTarget(null);
                }}
                className="w-full text-left border border-red-500/30 rounded-xl px-4 py-3 hover:bg-red-500/5 transition-colors"
              >
                <div className="font-medium text-sm text-red-500">Delete show + transactions</div>
                <div className="text-xs opacity-50 mt-0.5">Also removes linked inventory items and expenses</div>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setChoiceTarget(null)}
              className="w-full py-2 text-sm opacity-50 hover:opacity-80 transition-opacity"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Step 2: confirmation (type-to-confirm for "delete + transactions") */}
      {deleteTarget && (
        <ConfirmationModal
          title={
            deleteTarget.withTransactions
              ? `Delete show + all transactions?`
              : `Delete "${deleteTarget.show.name}"?`
          }
          description={
            deleteTarget.withTransactions
              ? `This will permanently delete the show record, all linked inventory items, and all linked expenses. This cannot be undone.`
              : `The show record and its feed will be permanently deleted. Inventory items and expenses are kept.`
          }
          confirmLabel={deleteTarget.withTransactions ? "Delete everything" : "Delete show"}
          destructive
          requireTyping={deleteTarget.withTransactions ? deleteTarget.show.name : undefined}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
