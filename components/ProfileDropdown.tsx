"use client";

import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Users, Receipt, Wallet, Settings, LogOut, ChevronDown } from "lucide-react";

type Props = {
  userHandle: string;
  initials: string;
};

export function ProfileDropdown({ userHandle, initials }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleLogout() {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  return (
    <>
      {/* Avatar trigger */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 rounded-full focus:outline-none"
          aria-label="Profile menu"
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{ background: "var(--accent-primary)", color: "#fff" }}
          >
            {initials}
          </div>
          <ChevronDown size={14} className={`opacity-50 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {/* Dropdown */}
        {open && (
          <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-border bg-card shadow-lg z-50 py-1 overflow-hidden">
            {/* User label */}
            <div className="px-3 py-2">
              <div className="text-xs opacity-40 font-medium">Signed in as</div>
              <div className="text-sm font-semibold truncate">Hey, {userHandle}</div>
            </div>

            <div className="h-px bg-border mx-2 my-1" />

            <Link
              href="/protected/consigners"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors"
            >
              <Users size={15} className="opacity-60" />
              Consigners
            </Link>
            <Link
              href="/protected/expenses"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors"
            >
              <Receipt size={15} className="opacity-60" />
              Expenses
            </Link>
            <Link
              href="/protected/payout"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors"
            >
              <Wallet size={15} className="opacity-60" />
              Payout
            </Link>

            <div className="h-px bg-border mx-2 my-1" />

            <Link
              href="/protected/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors"
            >
              <Settings size={15} className="opacity-60" />
              Settings
            </Link>

            <div className="h-px bg-border mx-2 my-1" />

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors text-left text-red-500"
            >
              <LogOut size={15} />
              Logout
            </button>
          </div>
        )}
      </div>
    </>
  );
}
