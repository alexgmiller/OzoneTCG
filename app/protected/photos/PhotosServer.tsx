import { createClient } from "@/lib/supabase/server";
import PhotosClient from "./PhotosClient";

export type DealLog = {
  id: string;
  type: "buy" | "sell" | "trade";
  notes: string | null;
  photos: string[];
  resolved: boolean;
  created_at: string;
};

export default async function PhotosServer() {
  const supabase = await createClient();

  const { data: logs } = await supabase
    .from("deal_logs")
    .select("id, type, notes, photos, resolved, created_at")
    .order("created_at", { ascending: false });

  return <PhotosClient initialLogs={(logs as DealLog[]) ?? []} />;
}
