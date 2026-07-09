"use server";

import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import { revalidatePath } from "next/cache";

export type CardShow = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  venue_name: string | null;
  venue_address: string | null;
  city: string;
  state: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  website_url: string | null;
  description: string | null;
  is_major: boolean;
  source: string;
};

export type ShowsCalendarData = {
  shows: CardShow[];
  bookmarkedIds: Set<string>;
  homeAddress: string | null;
  homeLat: number | null;
  homeLon: number | null;
  lastScrapeAt: string | null;
};

export async function getShowsCalendarData(): Promise<ShowsCalendarData> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const [showsResult, bookmarksResult, workspaceResult, scrapeResult] = await Promise.all([
    // card_shows has no RLS — readable by all authenticated users
    supabase
      .from("card_shows")
      .select(
        "id,name,start_date,end_date,venue_name,venue_address,city,state,country," +
        "latitude,longitude,website_url,description,is_major,source",
      )
      .gte("start_date", new Date().toISOString().slice(0, 10))
      .order("start_date", { ascending: true })
      .limit(500),

    supabase
      .from("workspace_bookmarked_shows")
      .select("show_id")
      .eq("workspace_id", workspaceId),

    supabase
      .from("workspaces")
      .select("home_address")
      .eq("id", workspaceId)
      .maybeSingle(),

    supabase
      .from("scraper_runs")
      .select("created_at")
      .eq("source", "tcdb_scrape")
      .is("error", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const shows = (showsResult.data ?? []) as unknown as CardShow[];
  const bookmarkedIds = new Set(
    (bookmarksResult.data ?? []).map((b: { show_id: string }) => b.show_id),
  );

  const homeAddress =
    (workspaceResult.data?.home_address as string | null) ?? null;

  // Derive home lat/lon from workspace home_address.
  // The workspace home_address is a free-text string like "123 Main St, Sacramento, CA".
  // We geocode the city/state portion using the static lookup.
  let homeLat: number | null = null;
  let homeLon: number | null = null;
  if (homeAddress) {
    const { parseCityStateFromAddress, geocodeCity } = await import("@/lib/showsGeocode");
    const parsed = parseCityStateFromAddress(homeAddress);
    if (parsed) {
      const geo = geocodeCity(parsed.city, parsed.state);
      if (geo) { homeLat = geo.lat; homeLon = geo.lon; }
    }
  }

  return {
    shows,
    bookmarkedIds,
    homeAddress,
    homeLat,
    homeLon,
    lastScrapeAt: (scrapeResult.data as { created_at: string } | null)?.created_at ?? null,
  };
}

export async function toggleShowBookmark(showId: string): Promise<void> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data: existing } = await supabase
    .from("workspace_bookmarked_shows")
    .select("show_id")
    .eq("workspace_id", workspaceId)
    .eq("show_id", showId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("workspace_bookmarked_shows")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("show_id", showId);
  } else {
    await supabase
      .from("workspace_bookmarked_shows")
      .insert({ workspace_id: workspaceId, show_id: showId });
  }

  revalidatePath("/protected/shows-calendar");
}

// Used by the show-session picker in ShowClient
export async function getUpcomingShowsForPicker(): Promise<
  Pick<CardShow, "id" | "name" | "start_date" | "end_date" | "venue_name" | "venue_address" | "city" | "state">[]
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("card_shows")
    .select("id,name,start_date,end_date,venue_name,venue_address,city,state")
    .gte("start_date", new Date().toISOString().slice(0, 10))
    .lte("start_date", (() => {
      const d = new Date(); d.setDate(d.getDate() + 180); return d.toISOString().slice(0, 10);
    })())
    .order("start_date", { ascending: true })
    .limit(200);
  return (data ?? []) as unknown as Pick<
    CardShow, "id" | "name" | "start_date" | "end_date" | "venue_name" | "venue_address" | "city" | "state"
  >[];
}
