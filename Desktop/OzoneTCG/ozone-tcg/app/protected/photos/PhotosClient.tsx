"use client";

import { useState, useRef } from "react";
import { uploadDealPhoto, createDealLog, toggleDealResolved, deleteDealLog } from "./actions";
import type { DealLog } from "./PhotosServer";

type DealType = "buy" | "sell" | "trade";

const TYPE_COLORS: Record<DealType, string> = {
  buy: "bg-violet-100 text-violet-700 border-violet-200",
  sell: "bg-emerald-100 text-emerald-700 border-emerald-200",
  trade: "bg-amber-100 text-amber-700 border-amber-200",
};

const TYPE_LABELS: Record<DealType, string> = {
  buy: "Buy",
  sell: "Sell",
  trade: "Trade",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PhotosClient({ initialLogs }: { initialLogs: DealLog[] }) {
  const [logs, setLogs] = useState<DealLog[]>(initialLogs);
  const [showAdd, setShowAdd] = useState(false);
  const [viewLog, setViewLog] = useState<DealLog | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("open");

  function handleAdded(log: DealLog) {
    setLogs((prev) => [log, ...prev]);
  }

  async function toggleResolved(log: DealLog) {
    const next = !log.resolved;
    try {
      await toggleDealResolved(log.id, next);
      setLogs((prev) => prev.map((l) => (l.id === log.id ? { ...l, resolved: next } : l)));
      if (viewLog?.id === log.id) setViewLog({ ...log, resolved: next });
    } catch { /* silent — UI stays unchanged */ }
  }

  async function deleteLog(log: DealLog) {
    if (!confirm("Delete this deal log?")) return;
    const photoPaths = log.photos
      .map((url) => url.split("/deal-photos/")[1] ?? "")
      .filter(Boolean);
    try {
      await deleteDealLog(log.id, photoPaths);
      setLogs((prev) => prev.filter((l) => l.id !== log.id));
      if (viewLog?.id === log.id) setViewLog(null);
    } catch { /* silent */ }
  }

  const filtered = logs.filter((l) => {
    if (filter === "open") return !l.resolved;
    if (filter === "resolved") return l.resolved;
    return true;
  });

  const openCount = logs.filter((l) => !l.resolved).length;

  return (
    // pb-20 on mobile clears the fixed bottom nav (h-14 = 56px)
    <div className="max-w-2xl mx-auto p-4 pb-20 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold">Deal Log</h1>
          <p className="text-xs text-muted-foreground">
            {openCount > 0 ? `${openCount} open deal${openCount !== 1 ? "s" : ""}` : "All caught up"}
          </p>
        </div>
        <button
          className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium min-h-[44px]"
          onClick={() => setShowAdd(true)}
        >
          + Log Deal
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 bg-muted/40 rounded-xl p-1">
        {(["open", "all", "resolved"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 text-sm py-2 rounded-lg font-medium capitalize transition-colors min-h-[40px] ${
              filter === f ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-sm text-center text-muted-foreground py-16">
          {filter === "open" ? "No open deals. Tap + Log Deal to add one." : "No deals here."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((log) => (
            <div
              key={log.id}
              className={`border rounded-2xl overflow-hidden transition-opacity ${log.resolved ? "opacity-60" : ""}`}
            >
              {/* Photos — tap to view full detail */}
              {log.photos.length > 0 && (
                <button
                  className="w-full text-left"
                  onClick={() => setViewLog(log)}
                >
                  {log.photos.length === 1 ? (
                    // Single photo: full-width banner
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={log.photos[0]}
                      alt="Deal photo"
                      className="w-full h-48 object-cover"
                    />
                  ) : log.photos.length === 2 ? (
                    // Two photos: side by side
                    <div className="grid grid-cols-2 gap-0.5">
                      {log.photos.map((url, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={url} alt={`Deal photo ${i + 1}`} className="w-full h-40 object-cover" />
                      ))}
                    </div>
                  ) : (
                    // 3+: first photo large, rest in a row below
                    <div className="flex flex-col gap-0.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={log.photos[0]} alt="Deal photo 1" className="w-full h-40 object-cover" />
                      <div className={`grid gap-0.5 grid-cols-${Math.min(log.photos.length - 1, 3)}`}>
                        {log.photos.slice(1, 4).map((url, i) => (
                          <div key={i} className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={`Deal photo ${i + 2}`} className="w-full h-24 object-cover" />
                            {i === 2 && log.photos.length > 4 && (
                              <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-sm font-semibold">
                                +{log.photos.length - 4}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </button>
              )}

              {/* Info + actions row */}
              <div className="px-3 py-2.5 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${TYPE_COLORS[log.type]}`}
                    >
                      {TYPE_LABELS[log.type]}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDate(log.created_at)}</span>
                  </div>
                  {log.notes && (
                    <p className="text-sm text-foreground/80 line-clamp-2 mt-0.5">{log.notes}</p>
                  )}
                  {!log.notes && log.photos.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">No notes</p>
                  )}
                </div>
                {/* Actions — min 44px touch targets */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => toggleResolved(log)}
                    className={`text-xs px-3 py-2.5 rounded-xl border font-medium transition-colors min-h-[44px] min-w-[72px] ${
                      log.resolved
                        ? "border-border text-muted-foreground"
                        : "border-emerald-300 text-emerald-700 bg-emerald-50"
                    }`}
                  >
                    {log.resolved ? "Reopen" : "Resolve"}
                  </button>
                  <button
                    onClick={() => setViewLog(log)}
                    className="text-xs px-3 py-2.5 rounded-xl border text-muted-foreground min-h-[44px]"
                  >
                    View
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddDealModal onClose={() => setShowAdd(false)} onAdded={handleAdded} />
      )}

      {viewLog && (
        <ViewDealModal
          log={viewLog}
          onClose={() => setViewLog(null)}
          onToggleResolved={() => toggleResolved(viewLog)}
          onDelete={() => deleteLog(viewLog)}
        />
      )}
    </div>
  );
}

// ── Add Deal Modal ──────────────────────────────────────────────────────────

function AddDealModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (log: DealLog) => void;
}) {
  const [type, setType] = useState<DealType>("buy");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoWarning, setPhotoWarning] = useState<string | null>(null);

  // Two separate inputs: one goes to camera, one to photo library.
  // This is the only reliable approach on iOS Safari — dynamically toggling
  // the `capture` attribute on a single input is not guaranteed to work.
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const arr = Array.from(files);
    setPhotos((prev) => [...prev, ...arr]);
    arr.forEach((f) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviews((prev) => [...prev, e.target?.result as string]);
      };
      reader.readAsDataURL(f);
    });
  }

  function removePhoto(i: number) {
    setPhotos((prev) => prev.filter((_, idx) => idx !== i));
    setPreviews((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setPhotoWarning(null);
    try {
      // Upload photos via server action (uses service role — no bucket permission issues)
      const uploadedUrls: string[] = [];
      for (const file of photos) {
        const fd = new FormData();
        fd.append("file", file);
        try {
          const url = await uploadDealPhoto(fd);
          uploadedUrls.push(url);
        } catch {
          setPhotoWarning('Some photos failed to upload — create a public Storage bucket named "deal-photos" in Supabase.');
        }
      }

      const data = await createDealLog({
        type,
        notes: notes.trim() || null,
        photos: uploadedUrls,
      });
      onAdded(data as DealLog);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    // pb-16 sm:pb-0 pushes the sheet above the fixed mobile nav bar
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 pb-16 sm:pb-0 px-4 pt-4">
      <div className="bg-background border rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="font-semibold text-sm">Log a Deal</h2>
          {/* 44px touch target for close */}
          <button
            onClick={onClose}
            className="flex items-center justify-center w-11 h-11 -mr-2 text-muted-foreground hover:text-foreground rounded-xl"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* Type selector */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Deal type</label>
            <div className="flex gap-2">
              {(["buy", "sell", "trade"] as DealType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex-1 py-3 rounded-xl border text-sm font-medium capitalize transition-colors min-h-[44px] ${
                    type === t
                      ? TYPE_COLORS[t] + " border-current"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Notes — text-base prevents iOS auto-zoom on focus */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Notes <span className="opacity-50">(optional)</span>
            </label>
            <textarea
              className="w-full border rounded-xl px-3 py-2.5 text-base bg-background resize-none"
              rows={3}
              placeholder="e.g. Pikachu ex PSA 10, asked $250..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Photos */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Photos <span className="opacity-50">(optional)</span>
            </label>

            {previews.length > 0 && (
              <div className="flex gap-2 flex-wrap mb-3">
                {previews.map((src, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="h-20 w-20 object-cover rounded-lg" />
                    <button
                      onClick={() => removePhoto(i)}
                      className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Separate hidden inputs — camera vs library */}
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <input
              ref={libraryRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />

            <div className="flex gap-2">
              <button
                onClick={() => libraryRef.current?.click()}
                className="flex-1 py-3 border border-dashed rounded-xl text-sm text-muted-foreground hover:border-foreground hover:text-foreground transition-colors min-h-[44px]"
              >
                Photo library
              </button>
              <button
                onClick={() => cameraRef.current?.click()}
                className="flex-1 py-3 border border-dashed rounded-xl text-sm text-muted-foreground hover:border-foreground hover:text-foreground transition-colors min-h-[44px]"
              >
                Camera
              </button>
            </div>
          </div>

          {photoWarning && (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              {photoWarning}
            </div>
          )}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t shrink-0 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border text-sm font-medium text-muted-foreground min-h-[44px]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 min-h-[44px]"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── View Deal Modal ─────────────────────────────────────────────────────────

function ViewDealModal({
  log,
  onClose,
  onToggleResolved,
  onDelete,
}: {
  log: DealLog;
  onClose: () => void;
  onToggleResolved: () => void;
  onDelete: () => void;
}) {
  const [lightbox, setLightbox] = useState<string | null>(null);

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 pb-16 sm:pb-0 px-4 pt-4">
        <div className="bg-background border rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${TYPE_COLORS[log.type]}`}>
                {TYPE_LABELS[log.type]}
              </span>
              <span className="text-xs text-muted-foreground">{formatDate(log.created_at)}</span>
            </div>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-11 h-11 -mr-2 text-muted-foreground hover:text-foreground rounded-xl"
            >
              ✕
            </button>
          </div>

          <div className="overflow-y-auto flex-1 p-4 space-y-4">
            {log.notes ? (
              <p className="text-sm">{log.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No notes.</p>
            )}

            {/* Photos grid — 2 cols, tappable for lightbox */}
            {log.photos.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {log.photos.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => setLightbox(url)}
                    className="rounded-xl overflow-hidden"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Photo ${i + 1}`} className="w-full h-40 object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t shrink-0 flex gap-2">
            <button
              onClick={onDelete}
              className="px-3 py-3 rounded-xl border border-red-200 text-red-600 text-sm font-medium min-h-[44px]"
            >
              Delete
            </button>
            <button
              onClick={() => { onToggleResolved(); onClose(); }}
              className={`flex-1 py-3 rounded-xl border text-sm font-medium min-h-[44px] ${
                log.resolved
                  ? "border-border text-muted-foreground"
                  : "border-emerald-300 text-emerald-700 bg-emerald-50"
              }`}
            >
              {log.resolved ? "Reopen" : "Mark Resolved"}
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium min-h-[44px]"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Lightbox — tap anywhere to close */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Full size"
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )}
    </>
  );
}
