import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import GuestView from "./GuestView";

export type GuestItem = {
  id: string;
  name: string;
  category: "single" | "slab" | "sealed";
  condition: string;
  grade: string | null;
  set_name: string | null;
  card_number: string | null;
  sticker_price: number | null;
  market: number | null;
  image_url: string | null;
};

export default async function GuestPage() {
  const cookieStore = await cookies();
  const workspaceId = cookieStore.get("guestMode")?.value;

  // Should be caught by middleware, but guard anyway
  if (!workspaceId) redirect("/protected/dashboard");

  const admin = createAdminClient();
  const { data } = await admin
    .from("items")
    .select("id,name,category,condition,grade,set_name,card_number,sticker_price,market,image_url")
    .eq("workspace_id", workspaceId)
    .neq("status", "sold")
    .order("name");

  const items = (data ?? []) as GuestItem[];

  return <GuestView items={items} />;
}
