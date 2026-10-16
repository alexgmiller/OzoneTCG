"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookOpen } from "lucide-react";
import { EmptyState, SearchBar } from "@/components/ui";

// ── Search ──
// Phase 3 shell stub. The card catalog (sets, set page, card detail) arrives
// in Phase 3B and replaces this body; the SearchBar and scan hook stay.
export default function SearchPage() {
  const router = useRouter();
  const [q, setQ] = useState("");

  return (
    <div className="mx-auto w-full max-w-lg py-4">
      <SearchBar
        value={q}
        onChange={setQ}
        onScan={() => router.push("/protected/scan")}
        placeholder="Search cards and sets"
        className="mb-4"
      />
      <EmptyState
        title="Catalog coming"
        hint="Browse every Pokémon set in release order and open any card for prices. Until then, the camera icon still opens the cert scanner."
        preview={
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-[63/88] rounded-xl bg-surface-2" />
            ))}
          </div>
        }
        cta={
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <BookOpen size={16} /> Phase 3B
          </div>
        }
      />
    </div>
  );
}
