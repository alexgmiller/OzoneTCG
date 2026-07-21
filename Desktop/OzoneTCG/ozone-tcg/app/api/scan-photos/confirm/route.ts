import { NextRequest, NextResponse } from "next/server";
import { confirmScanPhoto } from "@/lib/scanPhotos.server";

/**
 * Records the vendor's confirmed card for a scan photo — the training label
 * that turns a stored photo into a (real photo <-> card) pair.
 * Call from the scan-confirm UI with the scanPhotoId returned by
 * /api/scan-card-image.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const scanPhotoId: string = body.scanPhotoId ?? "";
  const confirmedCardId: string = body.confirmedCardId ?? "";

  if (!scanPhotoId || !confirmedCardId) {
    return NextResponse.json(
      { error: "scanPhotoId and confirmedCardId are required" },
      { status: 400 },
    );
  }

  const ok = await confirmScanPhoto(scanPhotoId, confirmedCardId);
  return NextResponse.json({ ok }, { status: ok ? 200 : 500 });
}
