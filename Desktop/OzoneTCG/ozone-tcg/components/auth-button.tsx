import Link from "next/link";
import { Button } from "./ui/button";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "./logout-button";
import NavLinks from "./NavLinks";

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

  return (
    <div className="flex items-center gap-4">
      <NavLinks />

      <div className="flex items-center gap-3">
        <span className="hidden md:inline text-sm opacity-80">Hey, {user.email}!</span>
        <LogoutButton />
      </div>
    </div>
  );
}
