import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCardImageStats,
  upsertCardImage,
  verifyCardImage,
  dismissImageFlag,
  replaceCardImageUrl,
  uploadImageToStorage,
  type CardImageRow,
} from "@/lib/cardImages";

// ── Auth guard ────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  // Accept CRON_SECRET for script access
  const auth = req.headers.get("authorization") ?? "";
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  // Accept admin cookie session (checked via Supabase below)
  return false;
}

async function getAdminUser(req: NextRequest) {
  // We use the admin client to verify the session cookie isn't needed here —
  // instead rely on the ADMIN_EMAIL env var matched against the session user.
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail && user.email !== adminEmail) return null;
  return user;
}

// ── GET — stats, list, missing ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const user = await getAdminUser(req);
  if (!user && !isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") ?? "stats";

  // ── Stats ──────────────────────────────────────────────────────────────────
  if (action === "stats") {
    const stats = await getCardImageStats();
    return NextResponse.json(stats);
  }

  // ── List images with filters ───────────────────────────────────────────────
  if (action === "list") {
    const admin = createAdminClient();
    const category  = searchParams.get("category");    // single | slab | sealed
    const language  = searchParams.get("language");    // English | Japanese | Chinese
    const status    = searchParams.get("status");      // all | verified | unverified | flagged
    const setName   = searchParams.get("set");
    const pageParam = parseInt(searchParams.get("page") ?? "1", 10);
    const perPage   = 50;
    const offset    = (pageParam - 1) * perPage;

    let query = admin
      .from("card_images")
      .select("*", { count: "exact" })
      .order("updated_at", { ascending: false })
      .range(offset, offset + perPage - 1);

    if (category) query = query.eq("category", category);
    if (language) query = query.eq("language", language);
    if (setName)  query = query.ilike("set_name", `%${setName}%`);
    if (status === "verified")   query = query.eq("verified", true);
    if (status === "unverified") query = query.eq("verified", false);
    if (status === "flagged")    query = query.eq("flagged", true);

    const { data, count, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ images: data as CardImageRow[], total: count ?? 0, page: pageParam });
  }

  // ── Missing: negative cache entries ───────────────────────────────────────
  if (action === "missing") {
    const admin = createAdminClient();
    const pageParam = parseInt(searchParams.get("page") ?? "1", 10);
    const perPage = 50;
    const offset = (pageParam - 1) * perPage;

    const { data, count, error } = await admin
      .from("card_image_cache")
      .select("lookup_key,name,set_name,card_number,cached_at", { count: "exact" })
      .eq("source", "not_found")
      .order("cached_at", { ascending: false })
      .range(offset, offset + perPage - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ missing: data, total: count ?? 0, page: pageParam });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// ── POST — upload, verify, dismiss-flag, delete ───────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getAdminUser(req);
  if (!user && !isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") ?? "upload";

  // ── Verify ─────────────────────────────────────────────────────────────────
  if (action === "verify") {
    const { imageId } = await req.json();
    if (!imageId) return NextResponse.json({ error: "imageId required" }, { status: 400 });
    await verifyCardImage(imageId);
    return NextResponse.json({ ok: true });
  }

  // ── Dismiss flag ───────────────────────────────────────────────────────────
  if (action === "dismiss-flag") {
    const { imageId } = await req.json();
    if (!imageId) return NextResponse.json({ error: "imageId required" }, { status: 400 });
    await dismissImageFlag(imageId);
    return NextResponse.json({ ok: true });
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  if (action === "delete") {
    const { imageId } = await req.json();
    if (!imageId) return NextResponse.json({ error: "imageId required" }, { status: 400 });
    const admin = createAdminClient();
    const { error } = await admin.from("card_images").delete().eq("id", imageId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── Upload (multipart) ─────────────────────────────────────────────────────
  if (action === "upload") {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
    }

    const file       = formData.get("file") as File | null;
    const cardName   = (formData.get("card_name") as string | null)?.trim();
    const setName    = (formData.get("set_name") as string | null)?.trim();
    const cardNumber = (formData.get("card_number") as string | null)?.trim() || null;
    const language   = (formData.get("language") as string | null) ?? "English";
    const category   = (formData.get("category") as string | null) ?? "single";
    const variant    = (formData.get("variant") as string | null)?.trim() || null;
    const productType    = (formData.get("product_type") as string | null) || null;
    const gradingCompany = (formData.get("grading_company") as string | null) || null;

    if (!file)      return NextResponse.json({ error: "file required" }, { status: 400 });
    if (!cardName)  return NextResponse.json({ error: "card_name required" }, { status: 400 });
    if (!setName)   return NextResponse.json({ error: "set_name required" }, { status: 400 });

    // Determine file extension
    const mimeToExt: Record<string, string> = {
      "image/webp": "webp", "image/jpeg": "jpg",
      "image/jpg": "jpg", "image/png": "png",
    };
    const ext = mimeToExt[file.type] ?? "webp";

    let imageUrl: string;
    try {
      imageUrl = await uploadImageToStorage(
        file, language, setName, cardNumber, variant, ext
      );
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Upload failed" },
        { status: 500 }
      );
    }

    await upsertCardImage({
      card_name:       cardName,
      set_name:        setName,
      card_number:     cardNumber,
      language,
      category:        category as "single" | "slab" | "sealed",
      variant,
      product_type:    productType,
      grading_company: gradingCompany,
      image_url:       imageUrl,
      source:          "manual_upload",
      verified:        true, // manually uploaded = verified by default
    });

    return NextResponse.json({ ok: true, imageUrl });
  }

  // ── Replace URL only (for swapping to a better external URL) ───────────────
  if (action === "replace-url") {
    const { imageId, imageUrl, thumbnailUrl, source } = await req.json();
    if (!imageId || !imageUrl) {
      return NextResponse.json({ error: "imageId and imageUrl required" }, { status: 400 });
    }
    await replaceCardImageUrl(imageId, imageUrl, thumbnailUrl ?? null, source ?? "manual_upload");
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
