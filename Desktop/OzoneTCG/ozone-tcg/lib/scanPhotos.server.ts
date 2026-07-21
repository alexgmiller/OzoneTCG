// Server-only — persists scan photos + identification results so confirmed
// scans accumulate as (real photo <-> card) training pairs for embedding-based
// recognition. Fail-soft by design: persistence problems must never break the
// scan flow, so every failure is logged and swallowed.
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceId } from "@/lib/getWorkspaceId";

const BUCKET = "scan-photos";

export type PersistScanPhotoInput = {
  imageBase64: string; // raw base64 JPEG (no data: prefix)
  visionName: string;
  visionSetName: string;
  visionCardNumber: string;
  visionConfidence: number;
  matchedCardId: string | null;
};

/** Returns the scan_photos row id, or null if persistence failed/skipped. */
export async function persistScanPhoto(input: PersistScanPhotoInput): Promise<string | null> {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return null; // no session/workspace — skip silently

    const admin = createAdminClient();
    const id = crypto.randomUUID();
    const storagePath = `${workspaceId}/${id}.jpg`;

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, Buffer.from(input.imageBase64, "base64"), {
        contentType: "image/jpeg",
        upsert: false,
      });
    if (uploadError) {
      console.error("[scanPhotos] upload failed:", uploadError.message);
      return null;
    }

    const { error: insertError } = await admin.from("scan_photos").insert({
      id,
      workspace_id: workspaceId,
      storage_path: storagePath,
      vision_name: input.visionName || null,
      vision_set_name: input.visionSetName || null,
      vision_card_number: input.visionCardNumber || null,
      vision_confidence: input.visionConfidence,
      matched_card_id: input.matchedCardId,
    });
    if (insertError) {
      console.error("[scanPhotos] insert failed:", insertError.message);
      return null;
    }

    return id;
  } catch (err) {
    console.error("[scanPhotos] persist error:", err);
    return null;
  }
}

/** Record the vendor's confirmed card for a scan photo (the training label). */
export async function confirmScanPhoto(scanPhotoId: string, confirmedCardId: string): Promise<boolean> {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return false;

    const admin = createAdminClient();
    const { error } = await admin
      .from("scan_photos")
      .update({ confirmed_card_id: confirmedCardId, confirmed_at: new Date().toISOString() })
      .eq("id", scanPhotoId)
      .eq("workspace_id", workspaceId); // scope to caller's workspace
    if (error) {
      console.error("[scanPhotos] confirm failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[scanPhotos] confirm error:", err);
    return false;
  }
}
