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
      <ProfileDropdown
        userHandle={handle}
        initials={initials}
        hasPinConfigured={pinConfigured}
      />
    </div>
  );
}
