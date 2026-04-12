"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, X, LogOut } from "lucide-react";
import { exitGuestMode, enterGuestMode } from "@/app/protected/guest/actions";
import type { GuestItem } from "./page";

function fmt(v: number | null) {
  if (v == null) return null;
  return `$${v.toFixed(2)}`;
}

function conditionAbbr(c: string): string {
  const map: Record<string, string> = {
    "Near Mint": "NM",
    "Lightly Played": "LP",
    "Moderately Played": "MP",
    "Heavily Played": "HP",
    "Damaged": "DMG",
  };
  return map[c] ?? c;
}

const categoryColors: Record<string, string> = {
  single: "bg-blue-500/15 text-blue-400",
  slab:   "bg-purple-500/15 text-purple-400",
  sealed: "bg-teal-500/15 text-teal-400",
};

type DetailItem = GuestItem;

export default function GuestView({ items }: { items: GuestItem[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "single" | "slab" | "sealed">("all");
  const [detail, setDetail] = useState<DetailItem | null>(null);
  const [exitModal, setExitModal] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return items.filter((it) => {
      if (categoryFilter !== "all" && it.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        it.name.toLowerCase().includes(q) ||
        (it.set_name?.toLowerCase().includes(q) ?? false) ||
        (it.card_number?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [items, search, categoryFilter]);

  async function handleExit() {
    if (lockoutUntil && Date.now() < lockoutUntil) {
      const secs = Math.ceil((lockoutUntil - Date.now()) / 1000);
      setPinError(`Too many attempts. Try again in ${secs}s`);
      return;
    }
    if (!pin) { setPinError("Enter your PIN"); return; }
    setPinLoading(true);
    setPinError("");
    try {
      const result = await enterGuestMode(pin);
      if (result.ok) {
        await exitGuestMode();
        router.push("/protected/dashboard");
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        if (newAttempts >= 5) {
          setLockoutUntil(Date.now() + 30_000);
          setAttempts(0);
          setPinError("Too many attempts. Locked for 30s");
        } else {
          setPinError(result.error ?? "Incorrect PIN");
        }
        setPin("");
      }
    } catch {
      setPinError("Something went wrong");
    } finally {
      setPinLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="font-bold text-base tracking-tight flex-shrink-0">
            <span style={{ color: "var(--accent-primary)" }}>Ozone</span>
            <span style={{ color: "var(--text-bright)" }}>TCG</span>
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
            <input
              className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-lg bg-background"
              placeholder="Search cards…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-70" onClick={() => setSearch("")}>
                <X size={14} />
              </button>
            )}
          </div>

          {/* Exit button */}
          <button
            onClick={() => { setPin(""); setPinError(""); setExitModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm hover:bg-muted transition-colors text-muted-foreground flex-shrink-0"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">Exit</span>
          </button>
        </div>

        {/* Category filter pills */}
        <div className="max-w-5xl mx-auto px-4 pb-3 flex gap-2">
          {(["all", "single", "slab", "sealed"] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize ${
                categoryFilter === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {cat === "all" ? `All (${items.length})` : `${cat.charAt(0).toUpperCase() + cat.slice(1)}s (${items.filter(i => i.category === cat).length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Card grid */}
      <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-4">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-sm opacity-40">
            {search ? "No cards match your search" : "No cards available"}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.map((it) => {
              const price = it.sticker_price ?? it.market;
              const displayGrade = it.grade ?? conditionAbbr(it.condition);
              return (
                <button
                  key={it.id}
                  onClick={() => setDetail(it)}
                  className="group text-left rounded-xl border border-border bg-card overflow-hidden hover:border-primary/40 hover:shadow-md transition-all"
                >
                  {/* Card image */}
                  <div className="aspect-[3/4] bg-muted relative overflow-hidden">
                    {it.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={it.image_url}
                        alt={it.name}
                        className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs opacity-20 font-medium">
                        {it.category === "slab" ? "PSA" : "TCG"}
                      </div>
                    )}
                    {/* Category badge */}
                    <span className={`absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0.5 rounded font-medium ${categoryColors[it.category]}`}>
                      {it.category}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="p-2 space-y-0.5">
                    <div className="text-xs font-medium leading-tight line-clamp-2">{it.name}</div>
                    {it.set_name && (
                      <div className="text-[10px] opacity-40 truncate">{it.set_name}</div>
                    )}
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] opacity-50">{displayGrade}</span>
                      {price != null && (
                        <span className="text-xs font-bold text-emerald-500">{fmt(price)}</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail overlay */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDetail(null)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            {/* Image */}
            {detail.image_url && (
              <div className="bg-muted flex items-center justify-center py-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={detail.image_url}
                  alt={detail.name}
                  className="max-h-64 object-contain"
                />
              </div>
            )}
            <div className="p-4 space-y-3">
              <div>
                <h2 className="text-base font-semibold">{detail.name}</h2>
                {detail.set_name && (
                  <div className="text-xs opacity-50 mt-0.5">
                    {detail.set_name}{detail.card_number ? ` · #${detail.card_number}` : ""}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryColors[detail.category]}`}>
                  {detail.category}
                </span>
                <span className="text-xs opacity-50 border rounded-full px-2 py-0.5">
                  {detail.grade ?? conditionAbbr(detail.condition)}
                </span>
              </div>

              {(detail.sticker_price != null || detail.market != null) && (
                <div className="flex items-baseline gap-2">
                  {detail.sticker_price != null ? (
                    <span className="text-2xl font-bold text-emerald-500">{fmt(detail.sticker_price)}</span>
                  ) : (
                    <span className="text-2xl font-bold text-emerald-500">{fmt(detail.market)}</span>
                  )}
                  {detail.sticker_price != null && detail.market != null && (
                    <span className="text-xs opacity-40">market {fmt(detail.market)}</span>
                  )}
                </div>
              )}

              <button
                onClick={() => setDetail(null)}
                className="w-full py-2.5 rounded-xl bg-muted text-sm font-medium hover:bg-muted/80 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exit guest mode modal */}
      {exitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setExitModal(false)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xs p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold">Exit Guest Mode</h2>
              <p className="text-xs opacity-50 mt-1">Enter your PIN to return to the dashboard.</p>
            </div>
            <input
              type="number"
              inputMode="numeric"
              placeholder="Your PIN"
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              value={pin}
              onChange={(e) => setPin(e.target.value.slice(0, 8))}
              onKeyDown={(e) => e.key === "Enter" && handleExit()}
              autoFocus
            />
            {pinError && <p className="text-xs text-red-500">{pinError}</p>}
            <div className="flex gap-2">
              <button
                className="flex-1 py-2 rounded-lg border text-sm hover:bg-muted transition-colors"
                onClick={() => setExitModal(false)}
              >
                Cancel
              </button>
              <button
                className="flex-1 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors disabled:opacity-50"
                onClick={handleExit}
                disabled={pinLoading}
              >
                {pinLoading ? "Checking…" : "Exit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
