"use client";

import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Users, Receipt, Wallet, Settings, LogOut, Eye, ChevronDown } from "lucide-react";
import { enterGuestMode, saveGuestPin } from "@/app/protected/guest/actions";

type Props = {
  userHandle: string;
  initials: string;
  hasPinConfigured: boolean;
};

type Modal = "none" | "set-pin" | "enter-pin";

export function ProfileDropdown({ userHandle, initials, hasPinConfigured }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<Modal>("none");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [pinConfigured, setPinConfigured] = useState(hasPinConfigured);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(0);
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

  function openModal(m: Modal) {
    setOpen(false);
    setPin("");
    setConfirmPin("");
    setPinError("");
    setModal(m);
  }

  function handleGuestModeClick() {
    if (!pinConfigured) {
      openModal("set-pin");
    } else {
      openModal("enter-pin");
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
      setModal("none");
      // Immediately enter guest mode after setting
      openModal("enter-pin");
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
        setModal("none");
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

            <button
              onClick={handleGuestModeClick}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
            >
              <Eye size={15} className="opacity-60" />
              Guest Mode
            </button>
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

      {/* Set PIN modal */}
      {modal === "set-pin" && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center modal-backdrop p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setModal("none"); }}
        >
          <div className="modal-panel w-full max-w-xs p-6 space-y-4">
            <div>
              <h2 className="modal-title">Set Guest PIN</h2>
              <p className="text-xs opacity-50 mt-1">Customers will use this PIN-free view. You&apos;ll need your PIN to exit.</p>
            </div>
            <input
              type="password"
              inputMode="numeric"
              placeholder="Choose a PIN (4+ digits)"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
              autoFocus
            />
            <input
              type="password"
              inputMode="numeric"
              placeholder="Confirm PIN"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
              onKeyDown={(e) => e.key === "Enter" && handleSetPin()}
            />
            {pinError && <p className="text-xs text-red-500">{pinError}</p>}
            <div className="flex gap-2">
              <button className="modal-btn-ghost flex-1" onClick={() => setModal("none")}>Cancel</button>
              <button className="modal-btn-primary flex-1" onClick={handleSetPin} disabled={pinLoading}>
                {pinLoading ? "Saving…" : "Set PIN"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enter PIN modal */}
      {modal === "enter-pin" && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center modal-backdrop p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setModal("none"); }}
        >
          <div className="modal-panel w-full max-w-xs p-6 space-y-4">
            <div>
              <h2 className="modal-title">Enter PIN</h2>
              <p className="text-xs opacity-50 mt-1">Enter your PIN to switch to Guest Mode.</p>
            </div>
            <input
              type="password"
              inputMode="numeric"
              placeholder="Your PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
              onKeyDown={(e) => e.key === "Enter" && handleEnterPin()}
              autoFocus
            />
            {pinError && <p className="text-xs text-red-500">{pinError}</p>}
            <div className="flex gap-2">
              <button className="modal-btn-ghost flex-1" onClick={() => setModal("none")}>Cancel</button>
              <button className="modal-btn-primary flex-1" onClick={handleEnterPin} disabled={pinLoading}>
                {pinLoading ? "Checking…" : "Enter Guest Mode"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
