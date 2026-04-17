"use client";

import { useState, useRef, useCallback } from "react";
import {
  Upload, Search, Trash2,
  ChevronLeft, ChevronRight, AlertCircle, Loader2,
  ExternalLink, Wrench,
} from "lucide-react";
import type { CardImageRow } from "@/lib/cardImages";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "browse" | "upload" | "flagged" | "missing" | "inventory";

type ListResponse = { images: CardImageRow[]; total: number; page: number };
type MissingEntry = { lookup_key: string; name: string; set_name: string | null; card_number: string | null; cached_at: string };
type MissingResponse = { missing: MissingEntry[]; total: number; page: number };
type InventoryItem = { id: string; name: string; set_name: string | null; card_number: string | null; category: string; grade: string | null };
type InventoryResponse = { items: InventoryItem[]; total: number; page: number };

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json();
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminImagesClient() {
  const [tab, setTab] = useState<Tab>("browse");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  return (
    <div className="space-y-4">
      {toast && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium ${toast.ok ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
          {toast.ok ? <Search size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-muted/40 rounded-xl w-fit">
        {([
          { id: "browse",    label: "Browse" },
          { id: "upload",    label: "Upload" },
          { id: "flagged",   label: "Flagged" },
          { id: "missing",   label: "Missing" },
          { id: "inventory", label: "Inventory" },
        ] as { id: Tab; label: string }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? "bg-background shadow-sm" : "opacity-50 hover:opacity-80"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "browse"    && <BrowseTab showToast={showToast} />}
      {tab === "upload"    && <UploadTab showToast={showToast} />}
      {tab === "flagged"   && <FlaggedTab />}
      {tab === "missing"   && <MissingTab showToast={showToast} />}
      {tab === "inventory" && <InventoryTab showToast={showToast} />}
    </div>
  );
}

// ── Browse tab ────────────────────────────────────────────────────────────────

function BrowseTab({ showToast }: { showToast: (m: string, ok?: boolean) => void }) {
  const [source, setSource] = useState("");
  const [page, setPage]     = useState(1);
  const [data, setData]     = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ action: "list", page: String(p) });
      if (source) params.set("source", source);
      const result = await apiFetch(`/api/admin/card-images?${params}`);
      setData(result);
      setPage(p);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Load failed", false);
    } finally {
      setLoading(false);
    }
  }, [source, showToast]);

  async function handleDelete(lookupKey: string) {
    if (!confirm("Delete this cache entry?")) return;
    try {
      await apiFetch("/api/admin/card-images?action=delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lookupKey }),
      });
      showToast("Deleted");
      setData((prev) => prev ? {
        ...prev,
        images: prev.images.filter((img) => img.lookup_key !== lookupKey),
        total: prev.total - 1,
      } : prev);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed", false);
    }
  }

  const totalPages = data ? Math.ceil(data.total / 50) : 0;

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select value={source} onChange={(e) => setSource(e.target.value)}
          className="bg-background border rounded-lg px-2 py-1.5 text-sm">
          <option value="">All sources</option>
          <option value="tcgdex">TCGdex</option>
          <option value="pokemontcg">pokemontcg.io</option>
          <option value="manual">Manual</option>
          <option value="manual_admin">Manual (admin)</option>
        </select>
        <button
          onClick={() => load(1)}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Search
        </button>
      </div>

      {/* Results */}
      {data && (
        <>
          <div className="text-xs opacity-50">{data.total.toLocaleString()} results</div>
          <div className="space-y-2">
            {data.images.map((img) => (
              <CacheRow key={img.lookup_key} img={img} onDelete={handleDelete} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 justify-center pt-2">
              <button onClick={() => load(page - 1)} disabled={page <= 1 || loading}
                className="p-1.5 rounded-lg border disabled:opacity-30 hover:bg-muted transition-colors">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm opacity-60">Page {page} / {totalPages}</span>
              <button onClick={() => load(page + 1)} disabled={page >= totalPages || loading}
                className="p-1.5 rounded-lg border disabled:opacity-30 hover:bg-muted transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Cache row ─────────────────────────────────────────────────────────────────

function CacheRow({
  img,
  onDelete,
}: {
  img: CardImageRow;
  onDelete: (lookupKey: string) => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="flex items-start gap-3 p-3 border rounded-xl hover:bg-muted/20 transition-colors">
      {/* Thumbnail */}
      <div className="w-10 h-14 rounded flex-shrink-0 overflow-hidden bg-muted/40 flex items-center justify-center">
        {img.image_url && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img.image_url}
            alt={img.name}
            className="w-full h-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className="text-[8px] text-center opacity-40 px-1">{img.name.slice(0, 8)}</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{img.name}</div>
            <div className="text-xs opacity-50 truncate">
              {img.set_name ?? "Unknown set"}{img.card_number ? ` · #${img.card_number}` : ""}
            </div>
            <div className="flex gap-1.5 mt-1 flex-wrap">
              {img.source && <Badge label={img.source} dim />}
              <span className="text-[10px] opacity-30">{new Date(img.cached_at).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {img.image_url && (
              <a href={img.image_url} target="_blank" rel="noopener noreferrer"
                className="p-1.5 rounded-lg opacity-40 hover:opacity-100 transition-opacity" title="Open image">
                <ExternalLink size={14} />
              </a>
            )}
            <button onClick={() => onDelete(img.lookup_key)}
              className="p-1.5 rounded-lg opacity-30 hover:opacity-100 transition-opacity text-rose-500" title="Delete">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Badge({ label, color, dim }: { label: string; color?: string; dim?: boolean }) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-500/15 text-emerald-500",
    rose: "bg-rose-500/15 text-rose-500",
  };
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
      color ? colors[color] : dim ? "bg-muted text-muted-foreground" : "bg-muted/60 text-foreground/60"
    }`}>
      {label}
    </span>
  );
}

// ── Upload tab ────────────────────────────────────────────────────────────────

function UploadTab({ showToast }: { showToast: (m: string, ok?: boolean) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    card_name: "", set_name: "", card_number: "",
    language: "English", category: "single",
    variant: "", product_type: "", grading_company: "",
  });

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { showToast("Select an image first", false); return; }
    if (!form.card_name.trim() || !form.set_name.trim()) {
      showToast("Card name and set name are required", false); return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
      await apiFetch("/api/admin/card-images?action=upload", { method: "POST", body: fd });
      showToast(`${form.card_name} uploaded`);
      setForm({ card_name: "", set_name: "", card_number: "", language: "English", category: "single", variant: "", product_type: "", grading_company: "" });
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Upload failed", false);
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
      <div
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed rounded-2xl aspect-[5/3] flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-muted/20 transition-colors overflow-hidden"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="preview" className="w-full h-full object-contain" />
        ) : (
          <>
            <Upload size={24} className="opacity-30" />
            <span className="text-sm opacity-40">Click to select image</span>
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="text-xs opacity-50 block mb-1">Card Name *</label>
          <input value={form.card_name} onChange={(e) => set("card_name", e.target.value)}
            placeholder="e.g. Charizard" required
            className="w-full bg-background border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
        </div>
        <div>
          <label className="text-xs opacity-50 block mb-1">Set Name *</label>
          <input value={form.set_name} onChange={(e) => set("set_name", e.target.value)}
            placeholder="e.g. Base Set" required
            className="w-full bg-background border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
        </div>
        <div>
          <label className="text-xs opacity-50 block mb-1">Card Number</label>
          <input value={form.card_number} onChange={(e) => set("card_number", e.target.value)}
            placeholder="e.g. 4/102"
            className="w-full bg-background border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
        </div>
        <div>
          <label className="text-xs opacity-50 block mb-1">Language</label>
          <select value={form.language} onChange={(e) => set("language", e.target.value)}
            className="w-full bg-background border rounded-lg px-3 py-2 text-sm">
            <option>English</option>
            <option>Japanese</option>
            <option>Chinese</option>
          </select>
        </div>
        <div>
          <label className="text-xs opacity-50 block mb-1">Category</label>
          <select value={form.category} onChange={(e) => set("category", e.target.value)}
            className="w-full bg-background border rounded-lg px-3 py-2 text-sm">
            <option value="single">Single</option>
            <option value="slab">Slab</option>
            <option value="sealed">Sealed</option>
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={uploading}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
      >
        {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
        {uploading ? "Uploading…" : "Upload Image"}
      </button>
    </form>
  );
}

// ── Flagged tab ───────────────────────────────────────────────────────────────

function FlaggedTab() {
  return (
    <div className="text-sm opacity-40 py-4">
      Image flagging is not available with the current card_image_cache schema.
    </div>
  );
}

// ── Missing tab ───────────────────────────────────────────────────────────────

function MissingTab({ showToast }: { showToast: (m: string, ok?: boolean) => void }) {
  const [data, setData] = useState<MissingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const loaded = useRef(false);

  async function load(p: number) {
    setLoading(true);
    try {
      const result = await apiFetch(`/api/admin/card-images?action=missing&page=${p}`);
      setData(result);
      setPage(p);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Load failed", false);
    } finally {
      setLoading(false);
      loaded.current = true;
    }
  }

  if (!loaded.current && !loading) {
    return (
      <button onClick={() => load(1)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border text-sm opacity-60 hover:opacity-100 transition-opacity">
        <Search size={14} />
        Load missing images
      </button>
    );
  }

  if (loading) return <div className="flex items-center gap-2 opacity-40 text-sm"><Loader2 size={16} className="animate-spin" /> Loading…</div>;
  if (!data?.missing.length) return <div className="text-sm opacity-40">No missing images on record.</div>;

  const totalPages = Math.ceil(data.total / 50);

  return (
    <div className="space-y-3">
      <div className="text-xs opacity-50">{data.total.toLocaleString()} cards with no image found (negative cache)</div>
      <div className="space-y-1">
        {data.missing.map((entry) => (
          <div key={entry.lookup_key} className="flex items-center justify-between gap-2 px-3 py-2 border rounded-lg text-sm">
            <div className="min-w-0">
              <span className="font-medium truncate block">{entry.name ?? "—"}</span>
              <span className="text-xs opacity-40 block truncate">
                {entry.set_name ?? "Unknown set"}{entry.card_number ? ` · #${entry.card_number}` : ""}
              </span>
            </div>
            <span className="text-xs opacity-30 shrink-0">
              {new Date(entry.cached_at).toLocaleDateString()}
            </span>
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-2 justify-center">
          <button onClick={() => load(page - 1)} disabled={page <= 1 || loading}
            className="p-1.5 rounded-lg border disabled:opacity-30">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm opacity-60">Page {page} / {totalPages}</span>
          <button onClick={() => load(page + 1)} disabled={page >= totalPages || loading}
            className="p-1.5 rounded-lg border disabled:opacity-30">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Inventory tab ─────────────────────────────────────────────────────────────

function InventoryTab({ showToast }: { showToast: (m: string, ok?: boolean) => void }) {
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [bulkFixing, setBulkFixing] = useState(false);
  const [fixing, setFixing] = useState<Record<string, boolean>>({});
  const [urlInputs, setUrlInputs] = useState<Record<string, string>>({});
  const [savingUrl, setSavingUrl] = useState<Record<string, boolean>>({});
  const loaded = useRef(false);

  async function load(p: number) {
    setLoading(true);
    try {
      const result = await apiFetch(`/api/admin/card-images?action=inventory-missing&page=${p}`);
      setData(result);
      setPage(p);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Load failed", false);
    } finally {
      setLoading(false);
      loaded.current = true;
    }
  }

  async function handleAutoFix(item: InventoryItem) {
    setFixing((f) => ({ ...f, [item.id]: true }));
    try {
      const res = await apiFetch("/api/admin/card-images?action=auto-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, name: item.name, setName: item.set_name, cardNumber: item.card_number }),
      });
      if (res.imageUrl) {
        showToast(`Found image for ${item.name}`);
        setData((prev) => prev ? { ...prev, items: prev.items.filter((i) => i.id !== item.id), total: prev.total - 1 } : prev);
      } else {
        showToast(`No image found for ${item.name}`, false);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed", false);
    } finally {
      setFixing((f) => ({ ...f, [item.id]: false }));
    }
  }

  async function handleBulkFix() {
    setBulkFixing(true);
    try {
      const res = await apiFetch("/api/admin/card-images?action=auto-fix-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      showToast(`Fixed ${res.fixed} items`);
      if (res.fixed > 0) load(1);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Bulk fix failed", false);
    } finally {
      setBulkFixing(false);
    }
  }

  async function handleSaveUrl(item: InventoryItem) {
    const imageUrl = urlInputs[item.id]?.trim();
    if (!imageUrl) { showToast("Enter a URL first", false); return; }
    setSavingUrl((s) => ({ ...s, [item.id]: true }));
    try {
      await apiFetch("/api/admin/card-images?action=save-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, imageUrl, name: item.name, setName: item.set_name, cardNumber: item.card_number }),
      });
      showToast(`Saved for ${item.name}`);
      setData((prev) => prev ? { ...prev, items: prev.items.filter((i) => i.id !== item.id), total: prev.total - 1 } : prev);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Save failed", false);
    } finally {
      setSavingUrl((s) => ({ ...s, [item.id]: false }));
    }
  }

  if (!loaded.current && !loading) {
    return (
      <button onClick={() => load(1)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border text-sm opacity-60 hover:opacity-100 transition-opacity">
        <Search size={14} />
        Load items missing images
      </button>
    );
  }

  if (loading) return <div className="flex items-center gap-2 opacity-40 text-sm"><Loader2 size={16} className="animate-spin" /> Loading…</div>;
  if (!data?.items.length) return <div className="text-sm opacity-40">All inventory items have images.</div>;

  const totalPages = Math.ceil(data.total / 50);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs opacity-50">{data.total.toLocaleString()} items missing images</div>
        <button
          onClick={handleBulkFix}
          disabled={bulkFixing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs disabled:opacity-50"
        >
          {bulkFixing ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />}
          {bulkFixing ? "Fixing…" : "Bulk Fix (100)"}
        </button>
      </div>

      <div className="space-y-2">
        {data.items.map((item) => (
          <div key={item.id} className="p-3 border rounded-xl space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{item.name}</div>
                <div className="text-xs opacity-50 truncate">
                  {item.set_name ?? "Unknown set"}{item.card_number ? ` · #${item.card_number}` : ""}
                  {item.grade ? ` · ${item.grade}` : ""}
                </div>
              </div>
              <button
                onClick={() => handleAutoFix(item)}
                disabled={fixing[item.id]}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs hover:bg-muted transition-colors disabled:opacity-50"
              >
                {fixing[item.id] ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
                Auto-find
              </button>
            </div>
            <div className="flex gap-2">
              <input
                value={urlInputs[item.id] ?? ""}
                onChange={(e) => setUrlInputs((u) => ({ ...u, [item.id]: e.target.value }))}
                placeholder="Paste image URL…"
                className="flex-1 bg-background border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500/50"
              />
              <button
                onClick={() => handleSaveUrl(item)}
                disabled={savingUrl[item.id] || !urlInputs[item.id]?.trim()}
                className="shrink-0 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs disabled:opacity-50"
              >
                {savingUrl[item.id] ? <Loader2 size={11} className="animate-spin" /> : "Save"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-2 justify-center">
          <button onClick={() => load(page - 1)} disabled={page <= 1 || loading}
            className="p-1.5 rounded-lg border disabled:opacity-30">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm opacity-60">Page {page} / {totalPages}</span>
          <button onClick={() => load(page + 1)} disabled={page >= totalPages || loading}
            className="p-1.5 rounded-lg border disabled:opacity-30">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
