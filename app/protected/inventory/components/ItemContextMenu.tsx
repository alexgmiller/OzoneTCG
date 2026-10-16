"use client";

import { useRouter } from "next/navigation";
import { BookOpen, CheckCircle2, DollarSign, Pencil, Trash2 } from "lucide-react";
import { ContextMenu, useConfirm, type PressPoint } from "@/components/ui";
import type { Item } from "../types";

// ── Item context menu ──
// Edit Item · Sell · Select · Open in Catalog · Delete (separated, in down).
type Props = {
  target: { item: Item; at: PressPoint } | null;
  onClose: () => void;
  onEdit: (it: Item) => void;
  onSelect: (it: Item) => void;
  onDelete: (it: Item) => Promise<void>;
};

export function ItemContextMenu({ target, onClose, onEdit, onSelect, onDelete }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const it = target?.item;
  const sold = it?.status === "sold";

  return (
    <ContextMenu
      open={!!target}
      at={target?.at ?? null}
      onClose={onClose}
      title={it?.name}
      items={it ? [
        { label: "Edit Item", icon: Pencil, onSelect: () => onEdit(it) },
        { label: "Sell", icon: DollarSign, disabled: sold, onSelect: () => router.push(`/protected/pos?mode=sell&item=${it.id}`) },
        { label: "Select", icon: CheckCircle2, onSelect: () => onSelect(it) },
        // The catalog arrives in Phase 3B; until then this lands on the search stub with the name filled in
        { label: "Open in Catalog", icon: BookOpen, onSelect: () => router.push(`/protected/search?q=${encodeURIComponent(it.name)}`) },
        {
          label: "Delete", icon: Trash2, destructive: true,
          onSelect: async () => {
            const ok = await confirm({ title: `Delete ${it.name}?`, description: "This removes the item and its history. It cannot be undone.", confirmLabel: "Delete", destructive: true });
            if (ok) await onDelete(it);
          },
        },
      ] : []}
    />
  );
}
