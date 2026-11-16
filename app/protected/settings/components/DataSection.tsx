"use client";

import { useState } from "react";
import { Database, Download } from "lucide-react";
import { useToast } from "@/components/ui";
import { exportInventoryCSV } from "../actions";
import { Section, SettingRow, ActionButton } from "./SettingsPrimitives";

type ExportKind = "inventory";

const EXPORTS: {
  kind: ExportKind;
  label: string;
  description: string;
  run: () => Promise<string>;
}[] = [
  {
    kind: "inventory",
    label: "Export inventory",
    description: "All current inventory as CSV. Transactions and expenses export from Finance.",
    run: exportInventoryCSV,
  },
];

// ── Helpers ──
function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Data ──
export function DataSection() {
  const toast = useToast();
  const [busy, setBusy] = useState<ExportKind | null>(null);

  async function handleExport(kind: ExportKind, run: () => Promise<string>) {
    setBusy(kind);
    try {
      const csv = await run();
      const date = new Date().toISOString().slice(0, 10);
      downloadCSV(csv, `${kind}-${date}.csv`);
      toast.success(`${kind[0].toUpperCase()}${kind.slice(1)} exported`);
    } catch {
      toast.error("Export failed — try again");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section icon={Database} title="Data">
      {EXPORTS.map(({ kind, label, description, run }) => (
        <SettingRow key={kind} label={label} description={description}>
          <ActionButton
            onClick={() => handleExport(kind, run)}
            disabled={busy !== null}
            aria-label={`${label} as CSV`}
          >
            <Download size={14} />
            {busy === kind ? "Exporting…" : "CSV"}
          </ActionButton>
        </SettingRow>
      ))}
    </Section>
  );
}
