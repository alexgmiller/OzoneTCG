"use client";

import { useState, useRef, useCallback } from "react";
import {
  Upload, Search, CheckCircle, Flag, Trash2,
  ChevronLeft, ChevronRight, AlertCircle, Loader2,
  X, ExternalLink,
} from "lucide-react";
import type { CardImageRow } from "@/lib/cardImages";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "browse" | "upload" | "flagged" | "missing";

type ListResponse = { images: CardImageRow[]; total: number; page: number };
type MissingEntry = { lookup_key: string; name: string; set_name: string | null; card_number: string | null; cached_at: string };
type MissingResponse = { missing: MissingEntry[]; total: number; page: number };

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
          {toast.ok ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-muted/40 rounded-xl w-fit">
        {([
          { id: "browse",  label: "Browse" },
          { id: "upload",  label: "Upload" },
          { id: "flagged", label: "Flagged" },
          { id: "missing", label: "Missing" },
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

      {tab === "browse"  && <BrowseTab showToast={showToast} />}
      {tab === "upload"  && <UploadTab showToast={showToast} />}
      {tab === "flagged" && <FlaggedTab showToast={showToast} />}
      {tab === "missing" && <MissingTab showToast={showToast} />}
    </div>
  );
}

// ── Browse tab ────────────────────────────────────────────────────────────────

function BrowseTab({ showToast }: { showToast: (m: string, ok?: boolean) => void }) {
  const [category, setCategory] = useState("");
  const [language, setLanguage] = useState("");
  const [status, setStatus]     = useState("");
  const [setSearch, setSetSearch] = useState("");
  const [page, setPage]         = useState(1);
  const [data, setData]         = useState<ListResponse | null>(null);
  const [loading, setLoading]   = useState(false);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ action: "list", page: String(p) });
      if (category)  params.set("category", category);
      if (language)  params.set("language", language);
      if (status)    params.set("status", status);
      if (setSearch) params.set("set", setSearch);
      const result = await apiFetch(`/api/admin/card-images?${params}`);
      setData(result);
      setPage(p);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Load failed", false);
    } finally {
      setLoading(false);
    }
  }, [category, language, status, setSearch, showToast]);

  async function handleVerify(id: string) {
    try {
      await apiFetch("/api/admin/card-images?action=verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId: id }),
      });
      showToast("Verified");
      setData((prev) => prev ? {
        ...prev,
        images: prev.images.map((img) => img.id === id ? { ...img, verified: true } : img),
      } : prev);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed", false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this image record?")) return;
    try {
      await apiFetch("/api/admin/card-images?action=delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId: id }),
      });
      showToast("Deleted");
      setData((prev) => prev ? { ...prev, images: prev.images.filter((img) => img.id !== id), total: prev.total - 1 } : prev);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed", false);
    }
  }

  const totalPages = data ? Math.ceil(data.total / 50) : 0;

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="bg-background border rounded-lg px-2 py-1.5 text-sm">
          <option value="">All categories</option>
          <option value="single">Singles</option>
          <option value="slab">Slabs</option>
          <option value="sealed">Sealed</option>
        </select>
        <select value={language} onChange={(e) => setLanguage(e.target.value)}
          className="bg-background border rounded-lg px-2 py-1.5 text-sm">
          <option value="">All languages</option>
          <option value="English">English</option>
          <option value="Japanese">Japanese</option>
          <option value="Chinese">Chinese</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="bg-background border rounded-lg px-2 py-1.5 text-sm">
          <option value="">All statuses</option>
          <option value="verified">Verified</option>
          <option value="unverified">Unverified</option>
          <option value="flagged">Flagged</option>
        </select>
        <input
          value={setSearch}
          onChange={(e) => setSetSearch(e.target.value)}
          placeholder="Filter by set..."
          className="bg-background border rounded-lg px-3 py-1.5 text-sm w-40"
        />
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
              <ImageRow key={img.id} img={img} onVerify={handleVerify} onDelete={handleDelete} />
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

// ── Image row ─────────────────────────────────────────────────────────────────

function ImageRow({
  img,
  onVerify,
  onDelete,
}: {
  img: CardImageRow;
  onVerify: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="flex items-start gap-3 p-3 border rounded-xl hover:bg-muted/20 transition-colors">
      {/* Thumbnail */}
      <div className="w-10 h-14 rounded flex-shrink-0 overflow-hidden bg-muted/40 flex items-center justify-center">
        {!imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img.thumbnail_url ?? img.image_url}
            alt={img.card_name}
            className="w-full h-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className="text-[8px] text-center opacity-40 px-1">{img.card_name.slice(0, 8)}</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{img.card_name}</div>
            <div className="text-xs opacity-50 truncate">
              {img.set_name}{img.card_number ? ` · #${img.card_number}` : ""}
              {img.variant ? ` · ${img.variant}` : ""}
            </div>
            <div className="flex gap-1.5 mt-1 flex-wrap">
              <Badge label={img.language} />
              <Badge label={img.category} />
              {img.source && <Badge label={img.source} dim />}
              {img.verified && <Badge label="✓ verified" color="emerald" />}
              {img.flagged && <Badge label={`⚑ flagged×${img.flag_count}`} color="rose" />}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <a href={img.image_url} target="_blank" rel="noopener noreferrer"
              className="p-1.5 rounded-lg opacity-40 hover:opacity-100 transition-opacity" title="Open image">
              <ExternalLink size={14} />
            </a>
            {!img.verified && (
              <button onClick={() => onVerify(img.id)}
                className="p-1.5 rounded-lg opacity-40 hover:opacity-100 transition-opacity text-emerald-500" title="Verify">
                <CheckCircle size={14} />
              </button>
            )}
            <button onClick={() => onDelete(img.id)}
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
    amber: "bg-amber-500/15 text-amber-500",
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
    const url = URL.createObjectURL(file);
    setPreview(url);
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
      {/* Drop zone */}
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
            <span className="text-xs opacity-25">JPG, PNG, or WebP</span>
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      </div>

      {/* Fields */}
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
        {form.category === "single" && (
          <div className="col-span-2">
            <label className="text-xs opacity-50 block mb-1">Variant</label>
            <select value={form.variant} onChange={(e) => set("variant", e.target.value)}
              className="w-full bg-background border rounded-lg px-3 py-2 text-sm">
              <option value="">— none —</option>
              <option>Normal</option>
              <option>Holo</option>
              <option>Reverse Holo</option>
              <option>1st Edition</option>
              <option>Full Art</option>
              <option>Ultra Rare</option>
              <option>Special Illustration Rare</option>
              <option>Secret Rare</option>
            </select>
          </div>
        )}
        {form.category === "slab" && (
          <div className="col-span-2">
            <label className="text-xs opacity-50 block mb-1">Grading Company</label>
            <select value={form.grading_company} onChange={(e) => set("grading_company", e.target.value)}
              className="w-full bg-background border rounded-lg px-3 py-2 text-sm">
              <option value="">— none —</option>
              <option>PSA</option>
              <option>BGS</option>
              <option>CGC</option>
              <option>TAG</option>
            </select>
          </div>
        )}
        {form.category === "sealed" && (
          <div className="col-span-2">
            <label className="text-xs opacity-50 block mb-1">Product Type</label>
            <select value={form.product_type} onChange={(e) => set("product_type", e.target.value)}
              className="w-full bg-background border rounded-lg px-3 py-2 text-sm">
              <option value="">— none —</option>
              <option value="booster_box">Booster Box</option>
              <option value="etb">Elite Trainer Box</option>
              <option value="booster_bundle">Booster Bundle</option>
              <option value="booster_pack">Booster Pack</option>
              <option value="tin">Tin</option>
              <option value="collection_box">Collection Box</option>
              <option value="blister">Blister Pack</option>
              <option value="premium_collection">Premium Collection</option>
            </select>
          </div>
        )}
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

function FlaggedTab({ showToast }: { showToast: (m: string, ok?: boolean) => void }) {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const loaded = useRef(false);

  async function load() {
    setLoading(true);
    try {
      const result = await apiFetch("/api/admin/card-images?action=list&status=flagged&page=1");
      setData(result);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Load failed", false);
    } finally {
      setLoading(false);
      loaded.current = true;
    }
  }

  async function handleDismiss(id: string) {
    try {
      await apiFetch("/api/admin/card-images?action=dismiss-flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId: id }),
      });
      showToast("Flag dismissed");
      setData((prev) => prev ? { ...prev, images: prev.images.filter((img) => img.id !== id), total: prev.total - 1 } : prev);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed", false);
    }
  }

  if (!loaded.current && !loading) {
    return (
      <button onClick={load}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border text-sm opacity-60 hover:opacity-100 transition-opacity">
        <Flag size={14} />
        Load flagged images
      </button>
    );
  }

  if (loading) return <div className="flex items-center gap-2 opacity-40 text-sm"><Loader2 size={16} className="animate-spin" /> Loading…</div>;
  if (!data?.images.length) return <div className="text-sm opacity-40">No flagged images.</div>;

  return (
    <div className="space-y-2">
      <div className="text-xs opacity-50">{data.total} flagged</div>
      {data.images.map((img) => (
        <div key={img.id} className="flex items-start gap-3 p-3 border rounded-xl border-rose-500/20 bg-rose-500/5">
          <div className="w-10 h-14 rounded overflow-hidden bg-muted/40 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.thumbnail_url ?? img.image_url} alt={img.card_name} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{img.card_name}</div>
            <div className="text-xs opacity-50">{img.set_name}{img.card_number ? ` · #${img.card_number}` : ""}</div>
            <div className="text-xs text-rose-500 mt-0.5">Flagged {img.flag_count}×</div>
          </div>
          <div className="flex gap-1 shrink-0">
            <a href={img.image_url} target="_blank" rel="noopener noreferrer"
              className="p-1.5 rounded-lg opacity-40 hover:opacity-100 transition-opacity">
              <ExternalLink size={14} />
            </a>
            <button onClick={() => handleDismiss(img.id)} title="Dismiss flag — image is correct"
              className="p-1.5 rounded-lg opacity-40 hover:opacity-100 transition-opacity text-emerald-500">
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
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
