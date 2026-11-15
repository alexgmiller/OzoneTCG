"use client";

import { useState } from "react";
import { MapPin, Pencil, Trash2 } from "lucide-react";
import { Button, Input, useToast, useConfirm } from "@/components/ui";
import {
  updateHomeAddress, updateSavedLocationLabel, deleteSavedLocation,
  type SavedLocation,
} from "../actions";
import { Section } from "./SettingsPrimitives";

// ── Locations ──
export function LocationsSection({
  homeAddress,
  savedLocations,
}: {
  homeAddress: string | null;
  savedLocations: SavedLocation[];
}) {
  return (
    <>
      <HomeAddressSection initial={homeAddress} />
      <SavedLocationsSection initial={savedLocations} />
    </>
  );
}

// ── Home address ──
function HomeAddressSection({ initial }: { initial: string | null }) {
  const toast = useToast();
  const [address, setAddress] = useState(initial ?? "");
  const [savedValue, setSavedValue] = useState((initial ?? "").trim());
  const [saving, setSaving] = useState(false);

  const isDirty = address.trim() !== savedValue;

  async function handleSave() {
    setSaving(true);
    try {
      await updateHomeAddress(address);
      setSavedValue(address.trim());
      toast.success("Home address saved");
    } catch {
      toast.error("Couldn't save the address");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section icon={MapPin} title="Home Address">
      <div className="space-y-3 px-4 py-3">
        <Input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="123 Main St, Sacramento, CA"
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Saved for quick reference when entering mileage. Only stored on your account, never shared.
        </p>
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!isDirty || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Section>
  );
}

// ── Saved locations ──
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function SavedLocationsSection({ initial }: { initial: SavedLocation[] }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [locations, setLocations] = useState<SavedLocation[]>(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  function startEdit(loc: SavedLocation) {
    setEditingId(loc.id);
    setEditLabel(loc.label);
  }

  async function handleSaveLabel(id: string) {
    const label = editLabel.trim();
    if (!label) return;
    setBusyId(id);
    try {
      await updateSavedLocationLabel(id, label);
      setLocations((prev) => prev.map((l) => (l.id === id ? { ...l, label } : l)));
      setEditingId(null);
    } catch {
      toast.error("Couldn't rename the location");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(loc: SavedLocation) {
    const ok = await confirm({
      title: `Delete "${loc.label}"?`,
      description: "It will be saved again automatically the next time you use this address.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setBusyId(loc.id);
    try {
      await deleteSavedLocation(loc.id);
      setLocations((prev) => prev.filter((l) => l.id !== loc.id));
      toast.success("Location deleted");
    } catch {
      toast.error("Couldn't delete the location");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Section icon={MapPin} title="Saved Locations">
      {locations.length === 0 ? (
        <p className="px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          Addresses you enter in mileage expenses are saved here automatically.
        </p>
      ) : (
        locations.map((loc) => (
          <div key={loc.id} className="px-4 py-3">
            {editingId === loc.id ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  autoFocus
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveLabel(loc.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="flex-1"
                  placeholder="Label"
                />
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleSaveLabel(loc.id)}
                    disabled={busyId === loc.id || !editLabel.trim()}
                    className="flex-1 sm:flex-none"
                  >
                    {busyId === loc.id ? "Saving…" : "Save"}
                  </Button>
                  <Button variant="outline" onClick={() => setEditingId(null)} className="flex-1 sm:flex-none">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{loc.label}</div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{loc.address}</div>
                  <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                    Used {loc.use_count}× · Last {fmtDate(loc.last_used)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => startEdit(loc)}
                    aria-label={`Rename ${loc.label}`}
                  >
                    <Pencil size={16} />
                  </Button>
                  <Button
                    variant="destructive-ghost"
                    size="icon"
                    onClick={() => handleDelete(loc)}
                    disabled={busyId === loc.id}
                    aria-label={`Delete ${loc.label}`}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </Section>
  );
}
