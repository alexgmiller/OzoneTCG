import Link from "next/link";
import { Button } from "./ui/button";
import { createClient } from "@/lib/supabase/server";
import { DesktopNavLinks } from "./NavLinks";
import { ProfileDropdown } from "./ProfileDropdown";
import { hasPinConfigured } from "@/app/protected/guest/actions";

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
  const pinConfigured = await hasPinConfigured().catch(() => false);

  return (
    <div className="flex items-center gap-4">
      <DesktopNavLinks />
      {/* Desktop: full avatar dropdown */}
      <div className="hidden md:block">
        <ProfileDropdown
          userHandle={handle}
          initials={initials}
          hasPinConfigured={pinConfigured}
        />
      </div>
      {/* Mobile: avatar links directly to Settings — no dropdown, menu is in bottom nav ••• */}
      <Link
        href="/protected/settings"
        className="md:hidden w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
        style={{ background: "var(--accent-primary)", color: "#fff" }}
        aria-label="Settings"
      >
        {initials}
      </Link>
    </div>
  );
}
