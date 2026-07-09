"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  User, Building2, ShieldCheck, TrendingUp, Monitor, Database,
  Bell, Trash2, KeyRound, Download, LogOut, CheckCircle2, AlertCircle,
  ChevronRight, Eye, EyeOff, HardDrive, TriangleAlert, MapPin, Pencil,
} from "lucide-react";
import {
  saveSettings, sendPasswordResetEmail, deleteAccount,
  exportInventoryCSV, exportTransactionsCSV, updateBusinessStructure,
  updateHomeAddress, updateSavedLocationLabel, deleteSavedLocation,
  type UserSettings, type WorkspaceData, type SavedLocation,
} from "./actions";
import {
  BUSINESS_STRUCTURE_LABELS, BUSINESS_STRUCTURE_DESCRIPTIONS,
  taxFeaturesEnabled, partnershipFeatures,
  type BusinessStructure,
} from "@/lib/businessFeatures";
import { verifyGuestPin, saveGuestPin } from "@/app/protected/guest/actions";

// ─── Types ────────────────────────────────────────────────────────────────────

type ApiStatus = { ebay: boolean; justtcg: boolean; psa: boolean };
type SaveStatus = "idle" | "saving" | "saved" | "error";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Section Shell ────────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/20 flex items-center gap-2">
        <Icon size={15} className="opacity-50" />
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <div className="divide-y">{children}</div>
    </div>
  );
}

// ─── Setting Row ─────────────────────────────────────────────────────────────

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-xs opacity-50 mt-0.5">{description}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        checked ? "bg-violet-600" : "bg-muted"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

// ─── Dot status ───────────────────────────────────────────────────────────────

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${ok ? "bg-green-500" : "bg-red-400/70"}`} />
      <span className={`text-xs ${ok ? "text-green-600 dark:text-green-400" : "opacity-40"}`}>
        {ok ? "Connected" : label}
      </span>
    </div>
  );
}

// ─── Number Input ─────────────────────────────────────────────────────────────

function NumInput({
  value,
  onChange,
  min = 0,
  max = 100,
  unit = "%",
  width = "w-20",
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  unit?: string;
  width?: string;
}) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);

  return (
    <div className={`flex items-center gap-1 ${width}`}>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        value={local}
        className="w-full border rounded-lg px-2 py-1.5 text-sm text-right bg-background tabular-nums"
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const n = Number(local);
          if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
          else setLocal(String(value));
        }}
      />
      <span className="text-xs opacity-40">{unit}</span>
    </div>
  );
}

// ─── Offline Sync Section ────────────────────────────────────────────────────

function OfflineSyncSection() {
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);

  useEffect(() => {
    let mounted = true;
    import("@/lib/offlineQueue").then(({ getPendingCount }) => {
      getPendingCount().then((n) => { if (mounted) setPendingCount(n); });
    });
    return () => { mounted = false; };
  }, []);

  async function handleSyncNow() {
    setSyncing(true);
    try {
      const { getPendingActions, markSynced, markFailed } = await import("@/lib/offlineQueue");
      const {
        recordShowBuy, recordShowSell, recordShowTrade, addShowExpense,
      } = await import("@/app/protected/show/actions");
      const { createExecutor } = await import("@/lib/offlineAwareActions");
      const { replayPendingActions } = await import("@/lib/offlineSync");
      const executor = createExecutor({ recordShowBuy, recordShowSell, recordShowTrade, addShowExpense });
      await replayPendingActions(executor);
      const remaining = await getPendingActions();
      setPendingCount(remaining.length);
    } finally {
      setSyncing(false);
    }
  }

  async function handleClearAll() {
    if (!clearConfirm) { setClearConfirm(true); return; }
    const { clearAll } = await import("@/lib/offlineQueue");
    await clearAll();
    setPendingCount(0);
    setClearConfirm(false);
  }

  return (
    <Section icon={Database} title="Offline Sync">
      <SettingRow label="Queued transactions" description="Transactions saved offline, waiting to sync">
        <span className="text-sm tabular-nums font-medium">{pendingCount}</span>
      </SettingRow>
      {pendingCount > 0 && (
        <SettingRow label="Actions">
          <div className="flex gap-2">
            <button
              onClick={handleSyncNow}
              disabled={syncing}
              className="text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40"
              style={{ borderColor: "rgba(245,158,11,0.4)", color: "#fbbf24" }}
            >
              {syncing ? "Syncing…" : "Sync Now"}
            </button>
            <button
              onClick={handleClearAll}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${clearConfirm ? "border-red-500/60 text-red-400" : "border-red-500/30 text-red-400 hover:bg-red-500/10"}`}
            >
              {clearConfirm ? "Confirm Clear?" : "Clear Queue"}
            </button>
          </div>
        </SettingRow>
      )}
    </Section>
  );
}

// ─── Image Cache Section ──────────────────────────────────────────────────────

const IMAGE_CACHE_NAME = "ozone-card-images-v1";

function ImageCacheSection() {
  const [cacheSize, setCacheSize] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);

  useEffect(() => {
    if (!("caches" in window)) return;
    caches.open(IMAGE_CACHE_NAME)
      .then((c) => c.keys())
      .then((keys) => setCacheSize(keys.length))
      .catch(() => {});
  }, []);

  async function handleClearCache() {
    if (!clearConfirm) { setClearConfirm(true); return; }
    setClearing(true);
    try {
      // Tell the SW to clear so it stays in sync.
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "clear-image-cache" });
      }
      // Also clear directly from this context.
      await caches.delete(IMAGE_CACHE_NAME);
      setCacheSize(0);
      setClearConfirm(false);
    } finally {
      setClearing(false);
    }
  }

  // If the Cache API isn't supported, don't render the section.
  if (typeof window !== "undefined" && !("caches" in window)) return null;

  return (
    <Section icon={HardDrive} title="Image Cache">
      <SettingRow
        label="Cached card images"
        description="Card images stored locally for offline use at shows"
      >
        <span className="text-sm tabular-nums font-medium">
          {cacheSize === null ? "…" : cacheSize.toLocaleString()}
        </span>
      </SettingRow>
      {(cacheSize ?? 0) > 0 && (
        <SettingRow label="Actions">
          <button
            onClick={handleClearCache}
            disabled={clearing}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 ${
              clearConfirm
                ? "border-red-500/60 text-red-400"
                : "border-red-500/30 text-red-400 hover:bg-red-500/10"
            }`}
          >
            {clearing ? "Clearing…" : clearConfirm ? "Confirm Clear?" : "Clear Image Cache"}
          </button>
        </SettingRow>
      )}
    </Section>
  );
}

// ─── Business Structure Section ───────────────────────────────────────────────

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

function BusinessStructureSection({ initial }: { initial: WorkspaceData }) {
  const [structure, setStructure] = useState<BusinessStructure>(initial.business_structure);
  const [bizName, setBizName] = useState(initial.business_name ?? "");
  const [ein, setEin] = useState(initial.business_ein ?? "");
  const [state, setBizState] = useState(initial.business_state ?? "");
  const [sCorpElection, setSCorpElection] = useState(initial.s_corp_election);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isDirty =
    structure !== initial.business_structure ||
    bizName !== (initial.business_name ?? "") ||
    ein !== (initial.business_ein ?? "") ||
    state !== (initial.business_state ?? "") ||
    sCorpElection !== initial.s_corp_election;

  const showEntityFields = structure === "sole_prop" || structure === "single_llc";
  const showSCorp = structure === "single_llc";
  const showPartnershipNotice = structure === "multi_llc";

  async function handleSave() {
    setSaving(true);
    try {
      await updateBusinessStructure({
        business_structure: structure,
        business_name: bizName.trim() || null,
        business_ein: ein.trim() || null,
        business_state: state || null,
        s_corp_election: sCorpElection,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section icon={Building2} title="Business Structure">
      {/* Radio options */}
      <div className="divide-y divide-border/50">
        {(["hobby", "sole_prop", "single_llc", "multi_llc"] as const).map((opt) => (
          <button
            key={opt}
            onClick={() => setStructure(opt)}
            className="w-full text-left px-4 py-3 flex items-start gap-3 transition-colors duration-150 hover:bg-muted/30"
          >
            {/* Radio indicator */}
            <div
              className="mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors duration-150"
              style={
                structure === opt
                  ? { borderColor: "#8b5cf6", backgroundColor: "#8b5cf6" }
                  : { borderColor: "rgba(255,255,255,0.25)" }
              }
            >
              {structure === opt && (
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium">{BUSINESS_STRUCTURE_LABELS[opt]}</div>
              <div className="text-xs opacity-50 mt-0.5">{BUSINESS_STRUCTURE_DESCRIPTIONS[opt]}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Conditional entity fields */}
      {showEntityFields && (
        <>
          <SettingRow label="Business / entity name" description="Legal name (optional)">
            <input
              type="text"
              placeholder="Ozone TCG LLC"
              value={bizName}
              onChange={(e) => setBizName(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm bg-background w-44"
            />
          </SettingRow>
          <SettingRow label="Federal EIN" description="Employer Identification Number (optional)">
            <input
              type="text"
              placeholder="XX-XXXXXXX"
              value={ein}
              onChange={(e) => setEin(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm bg-background w-36 font-mono"
              maxLength={10}
            />
          </SettingRow>
          <SettingRow label="State of formation" description="2-letter state code">
            <select
              value={state}
              onChange={(e) => setBizState(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm bg-background w-28"
            >
              <option value="">—</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </SettingRow>
        </>
      )}

      {/* S-corp checkbox (single_llc only) */}
      {showSCorp && (
        <div className="px-4 py-3">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sCorpElection}
              onChange={(e) => setSCorpElection(e.target.checked)}
              className="mt-0.5 rounded"
            />
            <div>
              <div className="text-sm font-medium">My LLC elected S-corp taxation</div>
              <div className="text-xs opacity-50 mt-0.5">
                Filed Form 2553 with the IRS. Affects reasonable compensation tracking in a future release.
              </div>
            </div>
          </label>
        </div>
      )}

      {/* Multi-member coming soon panel */}
      {showPartnershipNotice && (
        <div className="px-4 py-3 m-3 rounded-xl border text-sm space-y-1"
          style={{ background: "rgba(139,92,246,0.06)", borderColor: "rgba(139,92,246,0.20)" }}
        >
          <div className="font-medium text-violet-300">Partnership management — coming soon</div>
          <p className="text-xs opacity-60 leading-relaxed">
            For now, track partner contributions using the <strong>Paid by</strong> field on expenses.
            K-1 allocation, Form 1065 prep, and per-partner reporting are in phase 2.
            Contact support for early access.
          </p>
        </div>
      )}

      {/* Save row */}
      <div className="px-4 py-3 flex items-center justify-between border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        {saved ? (
          <span className="flex items-center gap-1.5 text-xs text-emerald-400">
            <CheckCircle2 size={13} />
            Saved
          </span>
        ) : (
          <span className="text-xs opacity-30">
            {taxFeaturesEnabled(structure) ? "Tax features enabled" : "Tax features hidden"}
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="text-xs px-4 py-1.5 rounded-lg font-semibold transition-colors duration-150 disabled:opacity-40"
          style={{
            background: isDirty && !saving ? "rgba(139,92,246,0.85)" : undefined,
            color: isDirty && !saving ? "white" : undefined,
            border: "1px solid rgba(139,92,246,0.4)",
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Section>
  );
}

// ─── Home Address Section ─────────────────────────────────────────────────────

function HomeAddressSection({ initial }: { initial: string | null }) {
  const [address, setAddress] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isDirty = address.trim() !== (initial ?? "").trim();

  async function handleSave() {
    setSaving(true);
    try {
      await updateHomeAddress(address);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section icon={MapPin} title="Home Address">
      <div className="px-4 py-3 space-y-2">
        <input
          type="text"
          value={address}
          onChange={(e) => { setAddress(e.target.value); setSaved(false); }}
          placeholder="123 Main St, Sacramento, CA"
          className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background"
        />
        <p className="text-xs opacity-40 leading-relaxed">
          Saved for quick reference when entering mileage. Only stored on your account — not shared.
        </p>
        <div className="flex items-center justify-between">
          {saved ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckCircle2 size={12} /> Saved
            </span>
          ) : <span />}
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="text-xs px-4 py-1.5 rounded-lg font-semibold transition-colors duration-150 disabled:opacity-40"
            style={{
              background: isDirty && !saving ? "rgba(139,92,246,0.85)" : undefined,
              color: isDirty && !saving ? "white" : undefined,
              border: "1px solid rgba(139,92,246,0.4)",
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Section>
  );
}

// ─── Saved Locations Section ──────────────────────────────────────────────────

function SavedLocationsSection({ initial }: { initial: SavedLocation[] }) {
  const [locations, setLocations] = useState<SavedLocation[]>(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  async function handleSaveLabel(id: string) {
    if (!editLabel.trim()) return;
    setSaving(id);
    try {
      await updateSavedLocationLabel(id, editLabel);
      setLocations((prev) => prev.map((l) => l.id === id ? { ...l, label: editLabel.trim() } : l));
      setEditingId(null);
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(id: string) {
    setSaving(id);
    try {
      await deleteSavedLocation(id);
      setLocations((prev) => prev.filter((l) => l.id !== id));
    } finally {
      setSaving(null);
    }
  }

  if (locations.length === 0) {
    return (
      <Section icon={MapPin} title="Saved Locations">
        <div className="px-4 py-3 text-xs opacity-40">
          Addresses you enter in mileage expenses are saved here automatically.
        </div>
      </Section>
    );
  }

  return (
    <Section icon={MapPin} title="Saved Locations">
      <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
        {locations.map((loc) => (
          <div key={loc.id} className="px-4 py-3 space-y-1.5">
            {editingId === loc.id ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveLabel(loc.id); if (e.key === "Escape") setEditingId(null); }}
                  className="flex-1 border rounded-lg px-2.5 py-1.5 text-sm bg-background"
                  placeholder="Label"
                />
                <button
                  onClick={() => handleSaveLabel(loc.id)}
                  disabled={saving === loc.id}
                  className="text-xs px-3 py-1.5 rounded-lg border border-violet-500/40 text-violet-400 hover:bg-violet-500/10 disabled:opacity-40 transition-colors"
                >
                  {saving === loc.id ? "…" : "Save"}
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="text-xs opacity-40 hover:opacity-70 transition-opacity"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{loc.label}</div>
                  <div className="text-xs opacity-40 truncate mt-0.5">{loc.address}</div>
                  <div className="text-[11px] opacity-30 mt-0.5">
                    Used {loc.use_count}× · Last {fmtDate(loc.last_used)}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => { setEditingId(loc.id); setEditLabel(loc.label); }}
                    className="p-1.5 opacity-40 hover:opacity-80 transition-opacity rounded-lg hover:bg-white/5"
                    title="Rename"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => handleDelete(loc.id)}
                    disabled={saving === loc.id}
                    className="p-1.5 text-rose-400/60 hover:text-rose-400 transition-colors rounded-lg hover:bg-rose-500/10 disabled:opacity-30"
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SettingsClient({
  email,
  settings: initialSettings,
  workspaceData,
  pinConfigured: initialPinConfigured,
  apiStatus,
  savedLocations = [],
}: {
  email: string;
  settings: UserSettings;
  workspaceData: WorkspaceData;
  pinConfigured: boolean;
  apiStatus: ApiStatus;
  savedLocations?: SavedLocation[];
}) {
  const router = useRouter();
  const { theme: currentTheme, setTheme } = useTheme();
  const [settings, setSettings] = useState<UserSettings>(initialSettings);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // ── PIN change modal ───────────────────────────────────────────────────────
  const [pinModal, setPinModal] = useState(false);
  const [pinStep, setPinStep] = useState<"verify" | "new">("verify");
  const [pinCurrent, setPinCurrent] = useState("");
  const [pinNew, setPinNew] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [pinConfigured, setPinConfigured] = useState(initialPinConfigured);
  const [showPinCurrent, setShowPinCurrent] = useState(false);
  const [showPinNew, setShowPinNew] = useState(false);

  // ── Delete account modal ───────────────────────────────────────────────────
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // ── Export state ──────────────────────────────────────────────────────────
  const [exportingInv, setExportingInv] = useState(false);
  const [exportingTx, setExportingTx] = useState(false);

  // ── Password reset ────────────────────────────────────────────────────────
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // ── Save helpers ──────────────────────────────────────────────────────────

  const persistSave = useCallback(async (patch: Partial<UserSettings>) => {
    setSaveStatus("saving");
    try {
      await saveSettings(patch);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, []);

  function updateImmediate<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    const patch = { [key]: value } as Partial<UserSettings>;
    setSettings((prev) => ({ ...prev, ...patch }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    persistSave(patch);
  }

  function updateDebounced<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    const patch = { [key]: value } as Partial<UserSettings>;
    setSettings((prev) => ({ ...prev, ...patch }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persistSave(patch), 700);
  }

  // ── PIN handlers ──────────────────────────────────────────────────────────

  function openPinModal() {
    setPinStep(pinConfigured ? "verify" : "new");
    setPinCurrent("");
    setPinNew("");
    setPinConfirm("");
    setPinError("");
    setPinModal(true);
  }

  async function handlePinVerify() {
    if (!pinCurrent) { setPinError("Enter your current PIN"); return; }
    setPinLoading(true);
    setPinError("");
    try {
      const ok = await verifyGuestPin(pinCurrent);
      if (ok) {
        setPinStep("new");
        setPinCurrent("");
      } else {
        setPinError("Incorrect PIN");
      }
    } catch {
      setPinError("Something went wrong");
    } finally {
      setPinLoading(false);
    }
  }

  async function handlePinSave() {
    if (pinNew.length < 4) { setPinError("PIN must be at least 4 digits"); return; }
    if (pinNew !== pinConfirm) { setPinError("PINs don't match"); return; }
    setPinLoading(true);
    setPinError("");
    try {
      await saveGuestPin(pinNew);
      setPinConfigured(true);
      setPinModal(false);
    } catch {
      setPinError("Failed to save PIN");
    } finally {
      setPinLoading(false);
    }
  }

  // ── Export handlers ───────────────────────────────────────────────────────

  async function handleExportInventory() {
    setExportingInv(true);
    try {
      const csv = await exportInventoryCSV();
      const date = new Date().toISOString().slice(0, 10);
      downloadCSV(csv, `inventory-${date}.csv`);
    } catch {
      alert("Export failed — try again");
    } finally {
      setExportingInv(false);
    }
  }

  async function handleExportTransactions() {
    setExportingTx(true);
    try {
      const csv = await exportTransactionsCSV();
      const date = new Date().toISOString().slice(0, 10);
      downloadCSV(csv, `transactions-${date}.csv`);
    } catch {
      alert("Export failed — try again");
    } finally {
      setExportingTx(false);
    }
  }

  // ── Delete account ────────────────────────────────────────────────────────

  async function handleDeleteAccount() {
    if (deleteConfirmText !== "DELETE") return;
    setDeleteLoading(true);
    setDeleteError("");
    try {
      await deleteAccount();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete account");
      setDeleteLoading(false);
    }
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  async function handleLogout() {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-2xl mx-auto py-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold inv-label">Settings</h1>
          <p className="text-xs opacity-40 mt-0.5">Configure your workspace and preferences</p>
        </div>
        {/* Save status indicator */}
        <div className={`flex items-center gap-1.5 text-xs transition-all duration-300 ${
          saveStatus === "idle" ? "opacity-0" : "opacity-100"
        }`}>
          {saveStatus === "saving" && <span className="opacity-50 animate-pulse">Saving…</span>}
          {saveStatus === "saved" && <>
            <CheckCircle2 size={13} className="text-green-500" />
            <span className="text-green-500">Saved</span>
          </>}
          {saveStatus === "error" && <>
            <AlertCircle size={13} className="text-red-500" />
            <span className="text-red-500">Save failed</span>
          </>}
        </div>
      </div>

      {/* ── PROFILE ─────────────────────────────────────────────────────── */}
      <Section icon={User} title="Profile">
        <SettingRow label="Display name" description="Used in the nav greeting">
          <input
            type="text"
            placeholder={email.split("@")[0]}
            value={settings.display_name ?? ""}
            onChange={(e) => updateDebounced("display_name", e.target.value || null)}
            className="border rounded-lg px-3 py-1.5 text-sm bg-background w-44"
          />
        </SettingRow>
        <SettingRow label="Email" description="Your sign-in email">
          <span className="text-sm opacity-50 font-mono">{email}</span>
        </SettingRow>
        <SettingRow label="Business name" description="Shown in guest mode and consigner portals">
          <input
            type="text"
            placeholder="OzoneTCG"
            value={settings.business_name ?? ""}
            onChange={(e) => updateDebounced("business_name", e.target.value || null)}
            className="border rounded-lg px-3 py-1.5 text-sm bg-background w-44"
          />
        </SettingRow>
      </Section>

      {/* ── PRICING DEFAULTS ─────────────────────────────────────────────── */}
      <Section icon={TrendingUp} title="Pricing Defaults">
        <SettingRow label="Default buy percentage" description="Pre-fills when recording buys">
          <NumInput
            value={settings.default_buy_pct}
            onChange={(v) => updateImmediate("default_buy_pct", v)}
          />
        </SettingRow>
        <SettingRow label="Default trade credit" description="Pre-fills when recording trades">
          <NumInput
            value={settings.default_trade_pct}
            onChange={(v) => updateImmediate("default_trade_pct", v)}
          />
        </SettingRow>
        <SettingRow label="Default consigner rate" description="Pre-fills when creating consigners">
          <NumInput
            value={settings.default_consigner_rate}
            onChange={(v) => updateImmediate("default_consigner_rate", v)}
          />
        </SettingRow>
        <SettingRow label="Grading cost per card" description="PSA standard service fee — used in grading ROI calculations">
          <NumInput
            value={settings.grading_cost}
            onChange={(v) => updateImmediate("grading_cost", v)}
            min={0}
            max={500}
            unit="$"
            width="w-24"
          />
        </SettingRow>
        <div className="px-4 py-2 bg-muted/10">
          <div className="text-[11px] uppercase tracking-wider opacity-40 font-semibold mb-1">Price movement thresholds</div>
        </div>
        <SettingRow label="Dropping threshold" description="Below this % shows red badge">
          <NumInput
            value={settings.drop_threshold}
            onChange={(v) => updateImmediate("drop_threshold", v)}
            width="w-24"
          />
        </SettingRow>
        <SettingRow label="Rising threshold" description="Above this % shows green badge">
          <NumInput
            value={settings.rise_threshold}
            onChange={(v) => updateImmediate("rise_threshold", v)}
            width="w-24"
          />
        </SettingRow>
        <SettingRow label="Spiking threshold" description="Above this % shows gold badge">
          <NumInput
            value={settings.spike_threshold}
            onChange={(v) => updateImmediate("spike_threshold", v)}
            width="w-24"
          />
        </SettingRow>
        <div className="px-4 py-2 bg-muted/10">
          <div className="text-[11px] uppercase tracking-wider opacity-40 font-semibold mb-1">FMV strategy</div>
        </div>
        <SettingRow label="Slab pricing strategy" description="Which percentile to use as FMV for graded cards">
          <div className="flex rounded-lg border overflow-hidden text-sm">
            {([
              { value: "auto", label: "Auto" },
              { value: "q1", label: "Q1" },
              { value: "median", label: "Median" },
              { value: "q3", label: "Q3" },
            ] as const).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => updateImmediate("pricing_strategy", value)}
                className={`px-3 py-1.5 transition-colors ${
                  settings.pricing_strategy === value
                    ? "bg-foreground text-background font-medium"
                    : "hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </SettingRow>
      </Section>

      {/* ── GUEST MODE ───────────────────────────────────────────────────── */}
      <Section icon={Eye} title="Guest Mode">
        <SettingRow label="PIN status" description="Required to enter and exit guest mode">
          <div className="flex items-center gap-2">
            <StatusDot ok={pinConfigured} label="No PIN set" />
            <button
              onClick={openPinModal}
              className="text-xs px-2.5 py-1 rounded-lg border font-medium hover:bg-muted transition-colors"
            >
              {pinConfigured ? "Change PIN" : "Set PIN"}
            </button>
          </div>
        </SettingRow>
        <SettingRow label="Guest display name" description="Shown at the top of the guest view">
          <input
            type="text"
            placeholder={settings.business_name ?? "OzoneTCG"}
            value={settings.guest_display_name ?? ""}
            onChange={(e) => updateDebounced("guest_display_name", e.target.value || null)}
            className="border rounded-lg px-3 py-1.5 text-sm bg-background w-44"
          />
        </SettingRow>
      </Section>

      {/* ── DISPLAY PREFERENCES ──────────────────────────────────────────── */}
      <Section icon={Monitor} title="Display Preferences">
        <SettingRow label="Default inventory view">
          <div className="flex rounded-lg border overflow-hidden text-sm">
            {(["list", "grid"] as const).map((v) => (
              <button
                key={v}
                onClick={() => updateImmediate("default_view", v)}
                className={`px-3 py-1.5 capitalize transition-colors ${
                  settings.default_view === v
                    ? "bg-foreground text-background font-medium"
                    : "hover:bg-muted"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </SettingRow>
        <SettingRow label="Theme">
          <div className="flex rounded-lg border overflow-hidden text-sm">
            {(["light", "dark", "system"] as const).map((v) => (
              <button
                key={v}
                onClick={() => { setTheme(v); updateImmediate("theme", v); }}
                className={`px-3 py-1.5 capitalize transition-colors ${
                  (currentTheme ?? settings.theme) === v
                    ? "bg-foreground text-background font-medium"
                    : "hover:bg-muted"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </SettingRow>
        <SettingRow label="Currency">
          <select
            value={settings.currency}
            onChange={(e) => updateImmediate("currency", e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm bg-background"
          >
            <option value="USD">USD ($)</option>
            <option value="CAD">CAD ($)</option>
            <option value="EUR">EUR (€)</option>
          </select>
        </SettingRow>
        <SettingRow label="Default sort">
          <select
            value={settings.default_sort}
            onChange={(e) => updateImmediate("default_sort", e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm bg-background"
          >
            <option value="date-desc">Recently Added</option>
            <option value="date-asc">Oldest First</option>
            <option value="name-asc">Name A–Z</option>
            <option value="name-desc">Name Z–A</option>
            <option value="market-desc">Price High–Low</option>
            <option value="market-asc">Price Low–High</option>
          </select>
        </SettingRow>
      </Section>

      {/* ── PRICING SOURCES ──────────────────────────────────────────────── */}
      <Section icon={TrendingUp} title="Pricing Sources">
        <SettingRow label="eBay Browse API" description="Used for slab comps and sold listings">
          <StatusDot ok={apiStatus.ebay} label="Not configured" />
        </SettingRow>
        <SettingRow label="JustTCG / TCGPlayer" description="Used for raw card pricing">
          <StatusDot ok={apiStatus.justtcg} label="Not configured" />
        </SettingRow>
        <SettingRow label="PSA Cert Lookup" description="Used for cert scanner">
          <StatusDot ok={apiStatus.psa} label="Not configured" />
        </SettingRow>
        <SettingRow
          label="Auto-refresh behavior"
          description={
            "High value (>$200): 2 hrs · Mid ($50–$200): 4 hrs · Low (<$50): 8 hrs"
          }
        >
          <span className="text-xs opacity-40 italic">Informational</span>
        </SettingRow>
      </Section>

      {/* ── NOTIFICATIONS ────────────────────────────────────────────────── */}
      <Section icon={Bell} title="Notifications">
        <SettingRow label="Price alert threshold" description="Coming soon — notify when price moves more than X%">
          <div className="flex items-center gap-2">
            <NumInput
              value={settings.price_alert_threshold}
              onChange={(v) => updateImmediate("price_alert_threshold", v)}
              width="w-24"
            />
            <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">Soon</span>
          </div>
        </SettingRow>
      </Section>

      {/* ── DATA MANAGEMENT ──────────────────────────────────────────────── */}
      <Section icon={Database} title="Data Management">
        <SettingRow label="Export inventory" description="Download all current inventory as CSV">
          <button
            onClick={handleExportInventory}
            disabled={exportingInv}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Download size={13} />
            {exportingInv ? "Exporting…" : "Download CSV"}
          </button>
        </SettingRow>
        <SettingRow label="Export transactions" description="Download all transactions as CSV">
          <button
            onClick={handleExportTransactions}
            disabled={exportingTx}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Download size={13} />
            {exportingTx ? "Exporting…" : "Download CSV"}
          </button>
        </SettingRow>
      </Section>

      {/* ── API KEYS ─────────────────────────────────────────────────────── */}
      <Section icon={KeyRound} title="API Keys">
        <div className="px-4 py-3 text-xs opacity-50 space-y-1">
          <p>API keys are configured via environment variables — not stored here for security.</p>
          <p>To add or update a key, set it in your Vercel project environment variables and redeploy.</p>
        </div>
        <SettingRow label="EBAY_APP_ID + EBAY_CERT_ID">
          <StatusDot ok={apiStatus.ebay} label="Not set" />
        </SettingRow>
        <SettingRow label="JUSTTCG_API_KEY">
          <StatusDot ok={apiStatus.justtcg} label="Not set" />
        </SettingRow>
        <SettingRow label="PSA_API_KEY">
          <StatusDot ok={apiStatus.psa} label="Not set" />
        </SettingRow>
      </Section>

      {/* ── BUSINESS STRUCTURE CONFIRMATION BANNER ───────────────────────── */}
      {!workspaceData.business_structure_confirmed && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border"
          style={{ background: "rgba(245,158,11,0.07)", borderColor: "rgba(245,158,11,0.30)" }}
        >
          <TriangleAlert size={15} className="shrink-0 mt-0.5 text-amber-400" />
          <p className="text-xs leading-relaxed opacity-80">
            We&apos;ve set your business type to <strong>Sole Proprietor</strong> by default.
            Please confirm or update this in the Business Structure section below.
          </p>
        </div>
      )}

      {/* ── BUSINESS STRUCTURE ───────────────────────────────────────────── */}
      <BusinessStructureSection initial={workspaceData} />

      {/* ── HOME ADDRESS ─────────────────────────────────────────────────── */}
      <HomeAddressSection initial={workspaceData.home_address} />

      {/* ── SAVED LOCATIONS ──────────────────────────────────────────────── */}
      <SavedLocationsSection initial={savedLocations} />

      {/* ── OFFLINE SYNC ─────────────────────────────────────────────────── */}
      <OfflineSyncSection />
      <ImageCacheSection />

      {/* ── ACCOUNT ──────────────────────────────────────────────────────── */}
      <Section icon={ShieldCheck} title="Account">
        <SettingRow label="Password" description="Send a reset link to your email">
          {resetSent ? (
            <div className="flex items-center gap-1.5 text-xs text-green-600">
              <CheckCircle2 size={13} />
              Reset email sent
            </div>
          ) : (
            <button
              onClick={async () => {
                setResetLoading(true);
                try {
                  await sendPasswordResetEmail();
                  setResetSent(true);
                } catch {
                  alert("Failed to send reset email");
                } finally {
                  setResetLoading(false);
                }
              }}
              disabled={resetLoading}
              className="text-xs px-3 py-1.5 rounded-lg border font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              {resetLoading ? "Sending…" : "Send reset email"}
            </button>
          )}
        </SettingRow>
        <SettingRow label="Sign out" description="Sign out of this device">
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-400/30 text-red-500 font-medium hover:bg-red-500/10 transition-colors"
          >
            <LogOut size={13} />
            Logout
          </button>
        </SettingRow>
        <SettingRow label="Delete account" description="Permanently delete all your data">
          <button
            onClick={() => { setDeleteModal(true); setDeleteConfirmText(""); setDeleteError(""); }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-500 font-medium hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={13} />
            Delete account
          </button>
        </SettingRow>
      </Section>

      {/* ══ PIN CHANGE MODAL ══════════════════════════════════════════════ */}
      {pinModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center modal-backdrop p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setPinModal(false); }}
        >
          <div className="modal-panel w-full max-w-xs p-6 space-y-4">
            <div>
              <h2 className="modal-title">
                {pinStep === "verify" ? "Verify Current PIN" : pinConfigured ? "Set New PIN" : "Set Guest PIN"}
              </h2>
              <p className="text-xs opacity-50 mt-1">
                {pinStep === "verify"
                  ? "Enter your current PIN to continue."
                  : "Choose a PIN customers will never see. You'll need it to exit guest mode."}
              </p>
            </div>

            {pinStep === "verify" ? (
              <>
                <div className="relative">
                  <input
                    type={showPinCurrent ? "text" : "password"}
                    inputMode="numeric"
                    placeholder="Current PIN"
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background pr-10"
                    value={pinCurrent}
                    onChange={(e) => setPinCurrent(e.target.value.slice(0, 8))}
                    onKeyDown={(e) => e.key === "Enter" && handlePinVerify()}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-70"
                    onClick={() => setShowPinCurrent((v) => !v)}
                  >
                    {showPinCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="relative">
                  <input
                    type={showPinNew ? "text" : "password"}
                    inputMode="numeric"
                    placeholder="New PIN (4+ digits)"
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background pr-10"
                    value={pinNew}
                    onChange={(e) => setPinNew(e.target.value.slice(0, 8))}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-70"
                    onClick={() => setShowPinNew((v) => !v)}
                  >
                    {showPinNew ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <input
                  type="password"
                  inputMode="numeric"
                  placeholder="Confirm PIN"
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                  value={pinConfirm}
                  onChange={(e) => setPinConfirm(e.target.value.slice(0, 8))}
                  onKeyDown={(e) => e.key === "Enter" && handlePinSave()}
                />
              </>
            )}

            {pinError && <p className="text-xs text-red-500">{pinError}</p>}

            <div className="flex gap-2">
              <button className="modal-btn-ghost flex-1" onClick={() => setPinModal(false)}>
                Cancel
              </button>
              <button
                className="modal-btn-primary flex-1"
                onClick={pinStep === "verify" ? handlePinVerify : handlePinSave}
                disabled={pinLoading}
              >
                {pinLoading ? "…" : pinStep === "verify" ? (
                  <span className="flex items-center justify-center gap-1">Continue <ChevronRight size={14} /></span>
                ) : "Save PIN"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ DELETE ACCOUNT MODAL ═════════════════════════════════════════ */}
      {deleteModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center modal-backdrop p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteModal(false); }}
        >
          <div className="modal-panel w-full max-w-sm p-6 space-y-4">
            <div>
              <h2 className="modal-title text-red-500">Delete Account</h2>
              <p className="text-xs opacity-60 mt-1">
                This will permanently delete your account and all associated data including inventory,
                transactions, consigners, and expenses. This cannot be undone.
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium">Type <span className="font-mono font-bold">DELETE</span> to confirm</p>
              <input
                type="text"
                placeholder="DELETE"
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background border-red-400/30 focus:border-red-500"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
              />
            </div>
            {deleteError && <p className="text-xs text-red-500">{deleteError}</p>}
            <div className="flex gap-2">
              <button className="modal-btn-ghost flex-1" onClick={() => setDeleteModal(false)} disabled={deleteLoading}>
                Cancel
              </button>
              <button
                className="modal-btn-destructive flex-1"
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== "DELETE" || deleteLoading}
              >
                {deleteLoading ? "Deleting…" : "Delete Forever"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
