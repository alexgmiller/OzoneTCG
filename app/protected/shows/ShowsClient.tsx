"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { createShowSession } from "@/app/protected/show/actions";

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function ShowsClient() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [startCash, setStartCash] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    if (!name.trim()) { setError("Show name required"); return; }
    setLoading(true);
    setError(null);
    try {
      await createShowSession({
        name: name.trim(),
        date: todayDate(),
        starting_cash: startCash ? parseFloat(startCash) : null,
      });
      router.push("/protected/show");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start show");
      setLoading(false);
    }
  }

  return (
    <div className="border rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--accent-primary)" }}>
          <Zap size={18} className="text-white" />
        </div>
        <div>
          <h2 className="font-semibold">Start a Show</h2>
          <p className="text-xs opacity-50 mt-0.5">Track buys, sells, and trades in real time at card shows.</p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium opacity-60 block mb-1">Show name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleStart()}
            placeholder="e.g. Sacramento Card Show"
            className="w-full bg-background border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
            disabled={loading}
            autoFocus
          />
        </div>

        <div>
          <label className="text-xs font-medium opacity-60 block mb-1">Starting cash (optional)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm opacity-50">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={startCash}
              onChange={(e) => setStartCash(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleStart()}
              placeholder="0.00"
              className="w-full bg-background border rounded-lg pl-6 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
              disabled={loading}
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button
          onClick={handleStart}
          disabled={loading || !name.trim()}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
          style={{ background: "var(--accent-primary)" }}
        >
          {loading ? "Starting…" : (
            <>
              <Zap size={15} />
              Start Show
            </>
          )}
        </button>
      </div>
    </div>
  );
}
