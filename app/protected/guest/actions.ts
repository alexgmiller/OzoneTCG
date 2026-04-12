"use server";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceId } from "@/lib/getWorkspaceId";

async function hashPin(workspaceId: string, pin: string): Promise<string> {
  const data = new TextEncoder().encode(`${workspaceId}:${pin}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hasPinConfigured(): Promise<boolean> {
  const admin = createAdminClient();
  const workspaceId = await getWorkspaceId();
  const { data } = await admin
    .from("guest_pins")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .single();
  return !!data;
}

export async function saveGuestPin(pin: string): Promise<void> {
  const admin = createAdminClient();
  const workspaceId = await getWorkspaceId();
  const pinHash = await hashPin(workspaceId, pin);
  const { error } = await admin.from("guest_pins").upsert(
    {
      workspace_id: workspaceId,
      pin_hash: pinHash,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id" }
  );
  if (error) throw new Error(error.message);
}

export async function enterGuestMode(
  pin: string
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const workspaceId = await getWorkspaceId();

  const { data } = await admin
    .from("guest_pins")
    .select("pin_hash")
    .eq("workspace_id", workspaceId)
    .single();

  if (!data) return { ok: false, error: "No PIN configured" };

  const hash = await hashPin(workspaceId, pin);
  if (hash !== data.pin_hash) return { ok: false, error: "Incorrect PIN" };

  const cookieStore = await cookies();
  cookieStore.set("guestMode", workspaceId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 8, // 8 hours
  });

  return { ok: true };
}

export async function exitGuestMode(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete("guestMode");
}

/** Verify a PIN without entering guest mode — used by Settings to confirm before changing PIN. */
export async function verifyGuestPin(pin: string): Promise<boolean> {
  const admin = createAdminClient();
  const workspaceId = await getWorkspaceId();
  const { data } = await admin
    .from("guest_pins")
    .select("pin_hash")
    .eq("workspace_id", workspaceId)
    .single();
  if (!data) return false;
  const hash = await hashPin(workspaceId, pin);
  return hash === data.pin_hash;
}
