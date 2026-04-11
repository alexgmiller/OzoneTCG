import Link from "next/link";
import { Button } from "./ui/button";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "./logout-button";
import { DesktopNavLinks } from "./NavLinks";

export async function AuthButton() {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  if (!user) {
    return (
      <div className="flex gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="/auth/login">Sign in</Link>
        </Button>
        <Button asChild size="sm" variant="default">
          <Link href="/auth/sign-up">Sign up</Link>
        </Button>
      </div>
    );
  }

  const handle = user.email?.split("@")[0] ?? "there";
  const initials = handle.slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-4">
      <DesktopNavLinks />

      <div className="flex items-center gap-3">
        <span className="hidden md:inline text-sm opacity-80 inv-label">
          Hey, {handle}
        </span>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
          style={{ background: "var(--accent-primary)", color: "#fff" }}
        >
          {initials}
        </div>
        <LogoutButton />
      </div>
    </div>
  );
}
