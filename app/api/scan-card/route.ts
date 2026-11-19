import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import { identifyImage, KEY_SCANS_PER_DAY, toScanMatches, type ScanMatch } from "@/lib/cardScan";
import { searchCatalog } from "@/app/protected/search/actions";
import type { CatalogCard } from "@/app/protected/search/catalog";

// ── POST /api/scan-card ──
// A card photo (multipart "image", resized on the phone first) → PokeInvest's
// best matches, each with the same card from our catalog when it's there
// (lib/cardScan.ts). Keyless first; the key only when the free scans are used
// up, at most KEY_SCANS_PER_DAY a day (counted in card_scans).

export const maxDuration = 30;
const MAX_BYTES = 4 * 1024 * 1024;

export type ScanResponse =
  | { status: "ok"; via: "free" | "key"; matches: ScanMatch<CatalogCard>[] }
  | { status: "none" }
  | { status: "limit" }
  | { status: "offline" }
  | { status: "error"; message: string };

const reply = (body: ScanResponse, status = 200) => NextResponse.json(body, { status });

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return reply({ status: "error", message: "Not signed in" }, 401);

  const form = await req.formData().catch(() => null);
  const image = form?.get("image");
  if (!(image instanceof Blob) || image.size === 0) return reply({ status: "error", message: "No photo came through." }, 400);
  if (image.size > MAX_BYTES) return reply({ status: "error", message: "That photo is too large." }, 413);

  // Writes and the key-scan count need the service key (production); without
  // it scans still work, keyless only
  let admin: ReturnType<typeof createAdminClient> | null = null;
  try { admin = createAdminClient(); } catch { admin = null; }
  const today = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
  const useKey = async () => {
    if (!admin) return false;
    try {
      const { count, error } = await admin.from("card_scans")
        .select("id", { count: "exact", head: true }).eq("via", "key").gte("created_at", today);
      return !error && (count ?? 0) < KEY_SCANS_PER_DAY;
    } catch {
      return false;
    }
  };

  const result = await identifyImage(image, { key: process.env.POKEINVEST_API_KEY?.trim(), useKey });
  if (result.status !== "ok") return reply(result);

  const matches = await toScanMatches(result.candidates, (q, lang) => searchCatalog(q, lang));

  if (admin) {
    try {
      const workspaceId = await getWorkspaceId();
      await admin.from("card_scans").insert({
        workspace_id: workspaceId, via: result.via,
        best_id: matches[0]?.pokeinvestId ?? null, best_name: matches[0]?.name ?? null,
      });
    } catch { /* the log is best-effort */ }
  }

  return reply(matches.length ? { status: "ok", via: result.via, matches } : { status: "none" });
}
