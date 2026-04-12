"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Package, ArrowLeftRight, ScanLine,
  Users, Receipt, Wallet, MoreHorizontal,
  Settings, LogOut, Eye,
} from "lucide-react";
import { Button } from "./ui/button";
import { useState, useEffect, useRef } from "react";
import { enterGuestMode, saveGuestPin } from "@/app/protected/guest/actions";

const primaryLinks = [
  { href: "/protected/dashboard",    label: "Dashboard",    icon: LayoutDashboard },
  { href: "/protected/inventory",    label: "Inventory",    icon: Package },
  { href: "/protected/transactions", label: "Transactions", icon: ArrowLeftRight },
];

const scanLink = { href: "/protected/scan", label: "Scan", icon: ScanLine };

const moreNavLinks = [
  { href: "/protected/consigners", label: "Consigners", icon: Users },
  { href: "/protected/expenses",   label: "Expenses",   icon: Receipt },
  { href: "/protected/payout",     label: "Payout",     icon: Wallet },
  { href: "/protected/settings",   label: "Settings",   icon: Settings },
];

/** Desktop-only nav — rendered inside the top header */
export function DesktopNavLinks() {
  const pathname = usePathname();
  return (
    <nav className="hidden md:flex items-center gap-1">
      {primaryLinks.map((l) => {
        const active = pathname === l.href || pathname.startsWith(l.href + "/");
        return (
          <Button key={l.href} asChild size="sm" variant={active ? "secondary" : "ghost"}>
            <Link href={l.href}>{l.label}</Link>
          </Button>
        );
      })}
    </nav>
  );
}

type MobileMoreProps = {
  hasPinConfigured?: boolean;
};

/** Mobile-only bottom tab bar — must be rendered OUTSIDE any backdrop-filter ancestor */
export default function MobileBottomNav({ hasPinConfigured = false }: MobileMoreProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [guestModal, setGuestModal] = useState<"none" | "set-pin" | "enter-pin">("none");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [pinConfigured, setPinConfigured] = useState(hasPinConfigured);
  const [attempts, setAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  const allLinks = [...primaryLinks, scanLink, ...moreNavLinks];

  // Prefetch all routes on mount
  useEffect(() => {
    allLinks.forEach((l) => router.prefetch(l.href));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (!moreOpen) return;
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [moreOpen]);

  useEffect(() => { setMoreOpen(false); }, [pathname]);

  const moreActive = moreNavLinks.some(
    (l) => pathname === l.href || pathname.startsWith(l.href + "/")
  );

  function openGuestModal(m: "set-pin" | "enter-pin") {
    setMoreOpen(false);
    setPin("");
    setConfirmPin("");
    setPinError("");
    setGuestModal(m);
  }

  function handleGuestModeClick() {
    if (!pinConfigured) {
      openGuestModal("set-pin");
    } else {
      openGuestModal("enter-pin");
    }
  }

  async function handleSetPin() {
    if (pin.length < 4) { setPinError("PIN must be at least 4 digits"); return; }
    if (pin !== confirmPin) { setPinError("PINs don't match"); return; }
    setPinLoading(true);
    setPinError("");
    try {
      await saveGuestPin(pin);
      setPinConfigured(true);
      setGuestModal("none");
      openGuestModal("enter-pin");
    } catch {
      setPinError("Failed to save PIN");
    } finally {
      setPinLoading(false);
    }
  }

  async function handleEnterPin() {
    if (lockoutUntil && Date.now() < lockoutUntil) {
      const secs = Math.ceil((lockoutUntil - Date.now()) / 1000);
      setPinError(`Too many attempts. Try again in ${secs}s`);
      return;
    }
    if (!pin) { setPinError("Enter your PIN"); return; }
    setPinLoading(true);
    setPinError("");
    try {
      const result = await enterGuestMode(pin);
      if (result.ok) {
        setGuestModal("none");
        router.push("/guest");
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        if (newAttempts >= 5) {
          setLockoutUntil(Date.now() + 30_000);
          setAttempts(0);
          setPinError("Too many attempts. Locked for 30s");
        } else {
          setPinError(result.error ?? "Incorrect PIN");
        }
        setPin("");
      }
    } catch {
      setPinError("Something went wrong");
    } finally {
      setPinLoading(false);
    }
  }

  async function handleLogout() {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  return (
    <>
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50" ref={moreRef}>
        {/* More popup — sits above the tab bar */}
        {moreOpen && (
          <div className="absolute bottom-full left-0 right-0 bg-background/70 backdrop-blur-md border-t border-x border-primary/10 rounded-t-2xl shadow-lg pb-1">
            <div className="p-3 space-y-0.5">
              {/* Nav links */}
              {moreNavLinks.map((l) => {
                const active = pathname === l.href || pathname.startsWith(l.href + "/");
                const Icon = l.icon;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                      active
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <Icon size={18} strokeWidth={active ? 2.5 : 1.5} />
                    <span className="text-sm">{l.label}</span>
                  </Link>
                );
              })}

              <div className="h-px bg-border mx-1 my-1" />

              {/* Guest Mode */}
              <button
                onClick={handleGuestModeClick}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-muted transition-colors"
              >
                <Eye size={18} strokeWidth={1.5} />
                <span className="text-sm">Guest Mode</span>
              </button>

              <div className="h-px bg-border mx-1 my-1" />

              {/* Logout */}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-muted transition-colors"
              >
                <LogOut size={18} strokeWidth={1.5} />
                <span className="text-sm">Logout</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab bar — icon only, 5 items: Dashboard / Inventory / Transactions / Scan / More */}
        <nav className="bg-background border-t border-t-border flex h-14 w-full">
          {primaryLinks.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/");
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`flex-1 flex items-center justify-center transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon size={24} strokeWidth={active ? 2.5 : 1.5} />
              </Link>
            );
          })}

          {/* Scan */}
          {(() => {
            const active = pathname === scanLink.href || pathname.startsWith(scanLink.href + "/");
            return (
              <Link
                href={scanLink.href}
                className={`flex-1 flex items-center justify-center transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <ScanLine size={24} strokeWidth={active ? 2.5 : 1.5} />
              </Link>
            );
          })()}

          <button
            onClick={() => setMoreOpen((o) => !o)}
            className={`flex-1 flex items-center justify-center transition-colors ${
              moreOpen || moreActive ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <MoreHorizontal size={24} strokeWidth={moreOpen || moreActive ? 2.5 : 1.5} />
          </button>
        </nav>
      </div>

      {/* Set PIN modal */}
      {guestModal === "set-pin" && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setGuestModal("none")} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xs p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold">Set Guest PIN</h2>
              <p className="text-xs opacity-50 mt-1">Customers will see a clean catalog. You&apos;ll need your PIN to exit.</p>
            </div>
            <input
              type="number"
              inputMode="numeric"
              placeholder="Choose a PIN (4+ digits)"
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              value={pin}
              onChange={(e) => setPin(e.target.value.slice(0, 8))}
              autoFocus
            />
            <input
              type="number"
              inputMode="numeric"
              placeholder="Confirm PIN"
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.slice(0, 8))}
              onKeyDown={(e) => e.key === "Enter" && handleSetPin()}
            />
            {pinError && <p className="text-xs text-red-500">{pinError}</p>}
            <div className="flex gap-2">
              <button className="flex-1 py-2 rounded-lg border text-sm hover:bg-muted transition-colors" onClick={() => setGuestModal("none")}>Cancel</button>
              <button className="flex-1 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors disabled:opacity-50" onClick={handleSetPin} disabled={pinLoading}>
                {pinLoading ? "Saving…" : "Set PIN"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enter PIN modal */}
      {guestModal === "enter-pin" && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setGuestModal("none")} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xs p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold">Enter PIN</h2>
              <p className="text-xs opacity-50 mt-1">Switch to Guest Mode for customer browsing.</p>
            </div>
            <input
              type="number"
              inputMode="numeric"
              placeholder="Your PIN"
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              value={pin}
              onChange={(e) => setPin(e.target.value.slice(0, 8))}
              onKeyDown={(e) => e.key === "Enter" && handleEnterPin()}
              autoFocus
            />
            {pinError && <p className="text-xs text-red-500">{pinError}</p>}
            <div className="flex gap-2">
              <button className="flex-1 py-2 rounded-lg border text-sm hover:bg-muted transition-colors" onClick={() => setGuestModal("none")}>Cancel</button>
              <button className="flex-1 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors disabled:opacity-50" onClick={handleEnterPin} disabled={pinLoading}>
                {pinLoading ? "Checking…" : "Enter Guest Mode"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
