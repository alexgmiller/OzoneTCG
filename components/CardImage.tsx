"use client";

import { useState, useRef, useCallback } from "react";
import { Check, Flag, Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

// ── CardImage ──
// Shows the card image when available, otherwise a token-styled placeholder.
// onUpload → placeholder gets a tap-to-upload button.
// onReport → image gets a hover/focus "wrong image" flag button.

type Props = {
  src: string | null | undefined;
  name: string;
  setName?: string | null;
  cardNumber?: string | null;
  className?: string;
  onUpload?: (file: File) => Promise<void>;
  onReport?: () => Promise<void>;
  // Badge for images that came from automated sources.
  unverified?: boolean;
};

const badgeClass =
  "pointer-events-none absolute top-2 rounded-full border px-2 py-0.5 font-mono text-xs font-semibold";

const iconButtonClass =
  "flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:opacity-40";

export default function CardImage({
  src,
  name,
  setName,
  cardNumber,
  className = "",
  onUpload,
  onReport,
  unverified,
}: Props) {
  const [failed, setFailed] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);

  const handleReport = useCallback(async () => {
    if (!onReport || reporting || reported) return;
    setReporting(true);
    try {
      await onReport();
      setReported(true);
    } finally {
      setReporting(false);
    }
  }, [onReport, reporting, reported]);

  if (src && !failed) {
    return (
      <div className={cn("group relative", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={name}
          loading="lazy"
          className="h-auto w-full rounded-lg"
          onError={() => setFailed(true)}
        />
        {unverified && (
          <span
            className={cn(
              badgeClass,
              "left-2 border-warning-border bg-warning-soft text-warning-strong dark:text-warning",
            )}
          >
            Unverified
          </span>
        )}
        {onReport && !reported && (
          <button
            type="button"
            onClick={handleReport}
            disabled={reporting}
            title="Report wrong image"
            aria-label="Report wrong image"
            className={cn(
              iconButtonClass,
              "absolute right-2 top-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100",
            )}
          >
            {reporting ? <Loader2 size={16} className="animate-spin" /> : <Flag size={16} />}
          </button>
        )}
        {reported && (
          <span
            className={cn(
              badgeClass,
              "right-2 border-negative-border bg-negative-soft text-negative-strong dark:text-negative",
            )}
          >
            Reported
          </span>
        )}
      </div>
    );
  }

  return (
    <CardPlaceholder
      name={name}
      setName={setName}
      cardNumber={cardNumber}
      className={className}
      onUpload={onUpload}
    />
  );
}

// ── Placeholder ──

function CardPlaceholder({
  name,
  setName,
  cardNumber,
  className = "",
  onUpload,
}: Pick<Props, "name" | "setName" | "cardNumber" | "className" | "onUpload">) {
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !onUpload) return;
    setUploading(true);
    try {
      await onUpload(file);
      setDone(true);
    } catch {
      // silent — inventory will show the result on next render
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div
      className={cn(
        "relative flex aspect-[5/7] w-full select-none flex-col items-center justify-between overflow-hidden rounded-lg border border-border bg-gradient-to-br from-muted to-muted/60 p-2",
        className,
      )}
    >
      {/* Decorative ghost initials */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
        <span className="text-6xl font-bold leading-none tracking-tighter text-foreground/5">
          {initials}
        </span>
      </div>

      {/* Top row: card number + upload button */}
      <div className="z-10 flex w-full items-start justify-between">
        {cardNumber ? (
          <span className="rounded-full bg-background/60 px-2 py-0.5 font-mono text-xs text-muted-foreground">
            {cardNumber}
          </span>
        ) : (
          <span />
        )}

        {onUpload && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFile}
            />
            <button
              type="button"
              title="Upload image"
              aria-label="Upload image"
              disabled={uploading || done}
              onClick={() => inputRef.current?.click()}
              className={iconButtonClass}
            >
              {uploading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : done ? (
                <Check size={16} className="text-positive-strong dark:text-positive" />
              ) : (
                <Upload size={16} />
              )}
            </button>
          </>
        )}
      </div>

      {/* Center: card name */}
      <div className="z-10 flex flex-1 items-center justify-center px-2">
        <p className="line-clamp-3 text-center text-xs font-semibold leading-snug text-foreground/70">
          {name}
        </p>
      </div>

      {/* Bottom: set name */}
      {setName && (
        <div className="z-10 w-full">
          <p className="truncate text-center text-xs leading-none text-muted-foreground">{setName}</p>
        </div>
      )}
    </div>
  );
}
