"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { subscribeWorkspaceTable } from "@/lib/supabase/realtime";
import { addExpense, deleteExpense, updateExpense } from "./actions";
import type { ExpenseRow } from "./ExpensesServer";

type PaidBy = "alex" | "mila" | "shared";

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function toNumber(v: string) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export default function ExpensesClient({
  workspaceId,
  initialExpenses,
}: {
  workspaceId: string;
  initialExpenses: ExpenseRow[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  // create form
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState<string>("");
  const [paidBy, setPaidBy] = useState<PaidBy>("shared");
  const [paymentType, setPaymentType] = useState("");

  // edit form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editCost, setEditCost] = useState<string>("");
  const [editPaidBy, setEditPaidBy] = useState<PaidBy>("shared");
  const [editPaymentType, setEditPaymentType] = useState("");

  useEffect(() => {
    const { supabase, channel } = subscribeWorkspaceTable({
      workspaceId,
      table: "expenses",
      onChange: () => router.refresh(),
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, workspaceId]);

  const totals = useMemo(() => {
    const total = initialExpenses.reduce((t, e) => t + (typeof e.cost === "number" ? e.cost : 0), 0);
    const by: Record<PaidBy, number> = { alex: 0, mila: 0, shared: 0 };
    for (const e of initialExpenses) by[e.paid_by] += e.cost ?? 0;
    return { total, by };
  }, [initialExpenses]);

  async function onCreate() {
    const c = toNumber(cost);
    if (!description.trim()) return;

    setCreating(true);
    try {
      await addExpense({
        description: description.trim(),
        cost: c,
        paid_by: paidBy,
        payment_type: paymentType.trim() ? paymentType.trim() : null,
      });

      setDescription("");
      setCost("");
      setPaidBy("shared");
      setPaymentType("");
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  function startEdit(e: ExpenseRow) {
    setEditingId(e.id);
    setEditDescription(e.description ?? "");
    setEditCost(String(e.cost ?? ""));
    setEditPaidBy(e.paid_by as PaidBy);
    setEditPaymentType(e.payment_type ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDescription("");
    setEditCost("");
    setEditPaidBy("shared");
    setEditPaymentType("");
  }

  async function saveEdit(id: string) {
    await updateExpense(id, {
      description: editDescription.trim(),
      cost: toNumber(editCost),
      paid_by: editPaidBy,
      payment_type: editPaymentType.trim() ? editPaymentType.trim() : null,
    });
    cancelEdit();
    router.refresh();
  }

  async function remove(id: string) {
    await deleteExpense(id);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* totals */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="border rounded-xl p-3">
          <div className="text-xs opacity-70">Total expenses</div>
          <div className="text-lg font-semibold">{money(totals.total)}</div>
        </div>
        <div className="border rounded-xl p-3">
          <div className="text-xs opacity-70">Alex paid</div>
          <div className="text-lg font-semibold">{money(totals.by.alex)}</div>
        </div>
        <div className="border rounded-xl p-3">
          <div className="text-xs opacity-70">Mila paid</div>
          <div className="text-lg font-semibold">{money(totals.by.mila)}</div>
        </div>
        <div className="border rounded-xl p-3">
          <div className="text-xs opacity-70">Shared</div>
          <div className="text-lg font-semibold">{money(totals.by.shared)}</div>
        </div>
      </div>

      {/* create */}
      <div className="border rounded-xl p-3 space-y-3">
        <div className="font-medium">Add expense</div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
          <input
            className="border rounded-lg px-3 py-2 bg-transparent md:col-span-2"
            placeholder="Description (e.g., table fee, sleeves, gas)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <input
            className="border rounded-lg px-3 py-2 bg-transparent"
            placeholder="Cost"
            inputMode="decimal"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
          <select
            className="border rounded-lg px-3 py-2 bg-transparent"
            value={paidBy}
            onChange={(e) => setPaidBy(e.target.value as PaidBy)}
          >
            <option value="shared">shared</option>
            <option value="alex">alex</option>
            <option value="mila">mila</option>
          </select>
          <input
            className="border rounded-lg px-3 py-2 bg-transparent md:col-span-1"
            placeholder="Payment type (optional)"
            value={paymentType}
            onChange={(e) => setPaymentType(e.target.value)}
          />
          <button
            className="border rounded-lg px-3 py-2 hover:bg-white/5 disabled:opacity-50"
            onClick={onCreate}
            disabled={creating || !description.trim()}
          >
            Add
          </button>
        </div>
      </div>

      {/* list */}
      <div className="border rounded-xl overflow-hidden">
        <div className="px-3 py-2 text-sm opacity-70 border-b">Recent</div>

        {initialExpenses.length === 0 ? (
          <div className="p-3 text-sm opacity-70">No expenses yet.</div>
        ) : (
          <div className="divide-y">
            {initialExpenses.map((e) => {
              const isEditing = editingId === e.id;

              return (
                <div key={e.id} className="p-3">
                  {!isEditing ? (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{e.description}</div>
                        <div className="text-xs opacity-70 mt-1">
                          {e.paid_by}
                          {e.payment_type ? ` • ${e.payment_type}` : ""}
                          {" • "}
                          {new Date(e.created_at).toLocaleString()}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-semibold">{money(e.cost ?? 0)}</div>
                        <div className="flex gap-2 justify-end mt-2">
                          <button
                            className="text-xs border rounded-md px-2 py-1 hover:bg-white/5"
                            onClick={() => startEdit(e)}
                          >
                            Edit
                          </button>
                          <button
                            className="text-xs border rounded-md px-2 py-1 hover:bg-white/5"
                            onClick={() => remove(e.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                        <input
                          className="border rounded-lg px-3 py-2 bg-transparent md:col-span-2"
                          value={editDescription}
                          onChange={(x) => setEditDescription(x.target.value)}
                        />
                        <input
                          className="border rounded-lg px-3 py-2 bg-transparent"
                          inputMode="decimal"
                          value={editCost}
                          onChange={(x) => setEditCost(x.target.value)}
                        />
                        <select
                          className="border rounded-lg px-3 py-2 bg-transparent"
                          value={editPaidBy}
                          onChange={(x) => setEditPaidBy(x.target.value as PaidBy)}
                        >
                          <option value="shared">shared</option>
                          <option value="alex">alex</option>
                          <option value="mila">mila</option>
                        </select>
                        <input
                          className="border rounded-lg px-3 py-2 bg-transparent"
                          placeholder="Payment type"
                          value={editPaymentType}
                          onChange={(x) => setEditPaymentType(x.target.value)}
                        />
                        <div className="flex gap-2">
                          <button className="border rounded-lg px-3 py-2 hover:bg-white/5" onClick={() => saveEdit(e.id)}>
                            Save
                          </button>
                          <button className="border rounded-lg px-3 py-2 hover:bg-white/5" onClick={cancelEdit}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
