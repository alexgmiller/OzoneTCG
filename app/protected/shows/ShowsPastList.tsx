"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Trash2 } from "lucide-react";
import type { ShowSession } from "@/app/protected/shows/actions";
import { deleteShowSession } from "@/app/protected/shows/actions";
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

export default function ShowsPastList({ shows }: { shows: ShowSession[] }) {
  const router = useRouter();
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ShowSession | null>(null);
  const [deleting, setDeleting] = useState(false);

  function openMenu(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setMenuOpenId(menuOpenId === id ? null : id);
  }

  function requestDelete(show: ShowSession, e: React.MouseEvent) {
    e.stopPropagation();
    setMenuOpenId(null);
    setDeleteTarget(show);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteShowSession(deleteTarget.id);
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

      {deleteTarget && (
        <ConfirmationModal
          title={`Delete "${deleteTarget.name}"?`}
          description="The show record is deleted. Its transactions and expenses are kept and no longer linked to a show — revert deals from Transactions if you need them gone."
          confirmLabel="Delete show"
          destructive
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
