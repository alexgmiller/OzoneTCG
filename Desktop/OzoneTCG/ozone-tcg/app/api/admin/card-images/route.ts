import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCardImageStats } from "@/lib/cardImages";
import { clearCacheEntry, setCardCache, makeLookupKey } from "@/lib/cardCache";
import { getWorkspaceId } from "@/lib/getWorkspaceId";

// ── Auth guard ────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  return false;
}

async function getAdminUser(req: NextRequest) {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail && user.email !== adminEmail) return null;
  return user;
}

// ── GET — stats, list, inventory-missing ─────────────────────────────────────

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

  // ── List images from card_image_cache ──────────────────────────────────────
  if (action === "list") {
    const admin = createAdminClient();
    const source    = searchParams.get("source");
    const pageParam = parseInt(searchParams.get("page") ?? "1", 10);
    const perPage   = 50;
    const offset    = (pageParam - 1) * perPage;

    let query = admin
      .from("card_image_cache")
      .select("lookup_key,name,set_name,card_number,image_url,source,cached_at", { count: "exact" })
      .neq("source", "not_found")
      .order("cached_at", { ascending: false })
      .range(offset, offset + perPage - 1);

    if (source) query = query.eq("source", source);

    const { data, count, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ images: data, total: count ?? 0, page: pageParam });
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

  // ── Inventory missing: items with no image_url ─────────────────────────────
  if (action === "inventory-missing") {
    const admin = createAdminClient();
    const workspaceId = await getWorkspaceId();
    const pageParam = parseInt(searchParams.get("page") ?? "1", 10);
    const perPage = 50;
    const offset = (pageParam - 1) * perPage;

    const { data, count, error } = await admin
      .from("items")
      .select("id,name,set_name,card_number,category,grade", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .is("image_url", null)
      .neq("category", "sealed")
      .order("created_at", { ascending: false })
      .range(offset, offset + perPage - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data, total: count ?? 0, page: pageParam });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// ── POST — delete, auto-fix, auto-fix-all, save-url ──────────────────────────

export async function POST(req: NextRequest) {
  const user = await getAdminUser(req);
  if (!user && !isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") ?? "";

  // ── Delete from card_image_cache ──────────────────────────────────────────
  if (action === "delete") {
    const { lookupKey } = await req.json();
    if (!lookupKey) return NextResponse.json({ error: "lookupKey required" }, { status: 400 });
    const admin = createAdminClient();
    const { error } = await admin.from("card_image_cache").delete().eq("lookup_key", lookupKey);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── Auto-fix a single item: clear cache + re-lookup ───────────────────────
  if (action === "auto-fix") {
    const { itemId, name, setName, cardNumber } = await req.json();
    if (!itemId || !name) return NextResponse.json({ error: "itemId and name required" }, { status: 400 });

    await clearCacheEntry(name, setName, cardNumber);

    const { lookupCard } = await import("@/lib/pokemonPriceTracker");
    const result = await lookupCard(name, "single", { setName, cardNumber });

    const admin = createAdminClient();
    const workspaceId = await getWorkspaceId();
    if (result?.imageUrl) {
      await admin
        .from("items")
        .update({ image_url: result.imageUrl })
        .eq("id", itemId)
        .eq("workspace_id", workspaceId);
    }
    return NextResponse.json({ ok: true, imageUrl: result?.imageUrl ?? null });
  }

  // ── Auto-fix-all: batch process up to 100 items missing images ────────────
  if (action === "auto-fix-all") {
    const admin = createAdminClient();
    const workspaceId = await getWorkspaceId();

    const { data: items } = await admin
      .from("items")
      .select("id,name,set_name,card_number,category")
      .eq("workspace_id", workspaceId)
      .is("image_url", null)
      .neq("category", "sealed")
      .limit(100);

    if (!items?.length) return NextResponse.json({ ok: true, fixed: 0 });

    const { lookupCard } = await import("@/lib/pokemonPriceTracker");
    let fixed = 0;
    for (const item of items) {
      await clearCacheEntry(item.name, item.set_name, item.card_number);
      const result = await lookupCard(item.name, item.category, {
        setName: item.set_name,
        cardNumber: item.card_number,
      });
      if (result?.imageUrl) {
        await admin
          .from("items")
          .update({ image_url: result.imageUrl })
          .eq("id", item.id)
          .eq("workspace_id", workspaceId);
        fixed++;
      }
    }
    return NextResponse.json({ ok: true, fixed });
  }

  // ── Save URL: update items.image_url + write to card_image_cache ─────────
  if (action === "save-url") {
    const { itemId, imageUrl, name, setName, cardNumber } = await req.json();
    if (!itemId || !imageUrl || !name) {
      return NextResponse.json({ error: "itemId, imageUrl, and name required" }, { status: 400 });
    }

    const admin = createAdminClient();
    const workspaceId = await getWorkspaceId();

    await admin
      .from("items")
      .update({ image_url: imageUrl })
      .eq("id", itemId)
      .eq("workspace_id", workspaceId);

    const lookupKey = makeLookupKey(name, setName, cardNumber);
    await setCardCache(lookupKey, name, setName ?? null, cardNumber ?? null, imageUrl, "manual_admin");

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
