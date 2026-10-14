"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, CheckCircle2, LogOut } from "lucide-react";
import { useToast } from "@/components/ui";
import { sendPasswordResetEmail } from "../actions";
import { Section, SettingRow, ActionButton } from "./SettingsPrimitives";

// ── Account ──
export function AccountSection() {
  const router = useRouter();
  const toast = useToast();
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleReset() {
    setResetLoading(true);
    try {
      await sendPasswordResetEmail();
      setResetSent(true);
      toast.success("Reset email sent");
    } catch {
      toast.error("Failed to send reset email");
    } finally {
      setResetLoading(false);
    }
  }

  async function handleLogout() {
    setSigningOut(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      await createClient().auth.signOut();
      router.push("/auth/login");
    } catch {
      toast.error("Couldn't sign out — try again");
      setSigningOut(false);
    }
  }

  return (
    <Section icon={ShieldCheck} title="Account">
      <SettingRow label="Password" description="Send a reset link to your email">
        {resetSent ? (
          <span className="flex items-center gap-1.5 text-xs text-positive-strong">
            <CheckCircle2 size={14} />
            Reset email sent
          </span>
        ) : (
          <ActionButton onClick={handleReset} disabled={resetLoading}>
            {resetLoading ? "Sending…" : "Send reset email"}
          </ActionButton>
        )}
      </SettingRow>
      <SettingRow label="Sign out" description="Sign out of this device">
        <ActionButton tone="danger" onClick={handleLogout} disabled={signingOut}>
          <LogOut size={14} />
          {signingOut ? "Signing out…" : "Sign out"}
        </ActionButton>
      </SettingRow>
    </Section>
  );
}
